import { Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AuthRequest } from "../middleware/auth";
import { connection } from "../config/db";
import { forecastConfiguration } from "../config/integrations";
export { forecastConfiguration } from "../config/integrations";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const observationInput = z
  .object({
    observations: z
      .array(
        z
          .object({
            sku: z.string().trim().min(1).max(100),
            date: day,
            quantity: z
              .number()
              .finite()
              .min(0)
              .max(1e9)
              .refine((v) => Number(v.toFixed(4)) === v),
            unit: z.string().trim().min(1).max(30),
            source: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();
export const forecastInput = z
  .object({ horizonDays: z.number().int().min(1).max(90) })
  .strict();
export async function forecastStatus(req: AuthRequest, res: Response) {
  const counts = (
    await connection.query(
      'SELECT count(*)::int AS observations,count(DISTINCT sku)::int AS products,min(day)::text AS "firstDate",max(day)::text AS "lastDate" FROM forecast_observations WHERE workspace_id=$1',
      [req.user!.workspaceId],
    )
  ).rows[0];
  let config = null;
  try {
    config = forecastConfiguration();
  } catch {
    /* Do not expose configuration values. */
  }
  const runs = (
    await connection.query(
      'SELECT id,provider,response,created_at AS "createdAt" FROM forecast_runs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 5',
      [req.user!.workspaceId],
    )
  ).rows;
  res.json({
    configured: Boolean(config),
    maxHorizonDays: config?.maxHorizon ?? 0,
    ...counts,
    runs,
  });
}
export async function importObservations(req: AuthRequest, res: Response) {
  const rows = req.body.observations as z.infer<
    typeof observationInput
  >["observations"];
  const today = new Date().toISOString().slice(0, 10);
  if (
    rows.some((r) => r.date > today) ||
    new Set(rows.map((r) => r.sku + "\0" + r.date)).size !== rows.length
  )
    return res
      .status(400)
      .json({ error: "Supply distinct historical product/date observations" });
  const tx = await connection.connect();
  try {
    await tx.query("BEGIN");
    // Corrections are explicit uploads of source observations, never derived from
    // shipment counts or purchase totals. All rows commit together.
    for (const r of [...rows].sort((a, b) =>
      (a.sku + a.date).localeCompare(b.sku + b.date),
    ))
      await tx.query(
        "INSERT INTO forecast_observations(workspace_id,sku,day,quantity,unit,source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workspace_id,sku,day) DO UPDATE SET quantity=EXCLUDED.quantity,unit=EXCLUDED.unit,source=EXCLUDED.source,updated_at=now()",
        [req.user!.workspaceId, r.sku, r.date, r.quantity, r.unit, r.source],
      );
    await tx.query("COMMIT");
    res.json({ accepted: rows.length });
  } catch {
    await tx.query("ROLLBACK");
    res
      .status(503)
      .json({
        error: "Observations could not be saved; retry the complete upload",
      });
  } finally {
    tx.release();
  }
}
const resultSchema = z
  .object({
    contractVersion: z.literal(1),
    requestId: z.string().uuid(),
    provider: z.string().min(1).max(100),
    modelVersion: z.string().min(1).max(200),
    generatedAt: z.string().datetime(),
    sourceSnapshotAt: z.string().datetime(),
    predictions: z
      .array(
        z
          .object({
            sku: z.string().max(100),
            date: day,
            quantity: z.number().finite().min(0).max(1e12),
            unit: z.string().max(30),
          })
          .strict(),
      )
      .min(1)
      .max(9000),
    limitations: z.array(z.string().max(500)).max(20),
  })
  .strict();
export async function runForecast(req: AuthRequest, res: Response) {
  let config;
  try {
    config = forecastConfiguration();
  } catch {
    return res
      .status(503)
      .json({
        error: "Forecast provider configuration needs administrator attention",
      });
  }
  if (!config)
    return res
      .status(503)
      .json({
        error:
          "Configure an authorized forecast provider before requesting predictions",
      });
  if (req.body.horizonDays > config.maxHorizon)
    return res
      .status(400)
      .json({ error: "Horizon exceeds the configured provider limit" });
  const rows = (
    await connection.query(
      `SELECT sku,day::text AS date,quantity::float8 AS quantity,unit,source,updated_at FROM forecast_observations WHERE workspace_id=$1 AND day>=CURRENT_DATE-366 ORDER BY sku,day LIMIT 10001`,
      [req.user!.workspaceId],
    )
  ).rows;
  const products = new Map<string, string>();
  for (const row of rows) {
    if (products.has(row.sku) && products.get(row.sku) !== row.unit)
      return res
        .status(409)
        .json({
          error:
            "Resolve mixed observation units for each product before forecasting",
        });
    products.set(row.sku, row.unit);
  }
  if (rows.length < 2 || rows.length > 10000 || products.size > 100)
    return res
      .status(422)
      .json({
        error:
          "Supply 2–10,000 source observations for at most 100 products in the last year",
      });
  const snapshot = new Date(
    Math.max(...rows.map((r) => new Date(r.updated_at).getTime())),
  ).toISOString();
  const requestId = randomUUID(),
    today = new Date().toISOString().slice(0, 10);
  const input = {
    contractVersion: 1,
    requestId,
    workspaceId: req.user!.workspaceId,
    datasetSnapshotAt: snapshot,
    observationStart:
      [...rows].sort((a, b) => a.date.localeCompare(b.date))[0].date +
      "T00:00:00Z",
    observationEnd: today + "T00:00:00Z",
    horizonDays: req.body.horizonDays,
    bucket: "day",
    series: rows.map(({ updated_at, ...row }) => row),
  };
  try {
    const response = await fetch(config.url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...(config.token
          ? { Authorization: "Bearer " + config.token }
          : {}),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || !response.body) throw new Error();
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 1024 * 1024) throw new Error();
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    const result = resultSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString()),
    );
    if (
      result.requestId !== requestId ||
      result.provider !== config.name ||
      result.sourceSnapshotAt !== snapshot ||
      Date.parse(result.generatedAt) > Date.now() + 300000 ||
      Date.parse(result.generatedAt) < Date.parse(snapshot)
    )
      throw new Error();
    const expected = new Set<string>();
    for (const [sku] of products)
      for (let n = 1; n <= req.body.horizonDays; n++)
        expected.add(
          sku +
            "\0" +
            new Date(Date.parse(today) + n * 86400000)
              .toISOString()
              .slice(0, 10),
        );
    for (const prediction of result.predictions) {
      const key = prediction.sku + "\0" + prediction.date;
      if (
        products.get(prediction.sku) !== prediction.unit ||
        !expected.delete(key)
      )
        throw new Error();
    }
    if (expected.size) throw new Error();
    await connection.query(
      "INSERT INTO forecast_runs(id,workspace_id,provider,response) VALUES($1,$2,$3,$4)",
      [requestId, req.user!.workspaceId, config.name, JSON.stringify(result)],
    );
    res.json({ id: requestId, ...result });
  } catch {
    res
      .status(502)
      .json({
        error:
          "The forecast provider did not return complete matching evidence. No prediction was saved.",
      });
  }
}
