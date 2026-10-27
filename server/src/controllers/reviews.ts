import { Response } from "express";
import { connection } from "../config/db";
import { AuthRequest } from "../middleware/auth";
import { numericId, readBounds } from "./operationalReads";
export async function reviewFeed(req: AuthRequest, res: Response) {
  const bounds = readBounds(req.query);
  const result = await connection.query(
    `SELECT c.id,c.shipment_id AS "shipmentId",s.tracking_number AS "trackingNumber",c.state,c.assignee_id AS "assigneeId",c.version,c.updated_at AS "updatedAt"
 FROM review_cases c JOIN shipments s ON s.id=c.shipment_id WHERE c.workspace_id=$1 ORDER BY c.updated_at DESC,c.id DESC LIMIT $2 OFFSET $3`,
    [req.user!.workspaceId, bounds.limit, bounds.offset],
  );
  res.json({
    items: result.rows,
    capability: "persistent-in-app-review",
    source: "node.review_cases",
  });
}
export async function reviewHistory(req: AuthRequest, res: Response) {
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid case ID" });
  const found = await connection.query(
    "SELECT id FROM review_cases WHERE id=$1 AND workspace_id=$2",
    [id, req.user!.workspaceId],
  );
  if (!found.rowCount)
    return res.status(404).json({ error: "Review case not found" });
  const result = await connection.query(
    `SELECT a.id,a.actor_id AS "actorId",coalesce(u.name,'System') AS "actorName",a.action,a.note,a.occurred_at AS "occurredAt" FROM review_actions a LEFT JOIN users u ON u.id=a.actor_id WHERE a.case_id=$1 AND a.workspace_id=$2 ORDER BY a.id DESC LIMIT 100`,
    [id, req.user!.workspaceId],
  );
  res.json({ items: result.rows });
}
export async function actOnReview(req: AuthRequest, res: Response) {
  const id = numericId(req.params.id),
    { action, note, assigneeId, version } = req.body;
  if (!id) return res.status(400).json({ error: "Invalid case ID" });
  const tx = await connection.connect();
  try {
    await tx.query("BEGIN");
    const row = (
      await tx.query(
        "SELECT * FROM review_cases WHERE id=$1 AND workspace_id=$2 FOR UPDATE",
        [id, req.user!.workspaceId],
      )
    ).rows[0];
    if (!row) {
      await tx.query("ROLLBACK");
      return res.status(404).json({ error: "Review case not found" });
    }
    if (row.version !== version) {
      await tx.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "This case changed. Refresh before retrying." });
    }
    if (action === "assign" && assigneeId !== null) {
      const member = await tx.query(
        "SELECT 1 FROM workspace_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND NOT u.disabled AND u.role IN ('admin','engineer')",
        [req.user!.workspaceId, assigneeId],
      );
      if (!member.rowCount) {
        await tx.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Choose a permitted workspace operator" });
      }
    }
    const state =
      action === "acknowledge"
        ? "acknowledged"
        : action === "resolve"
          ? "resolved"
          : action === "reopen"
            ? "open"
            : row.state;
    await tx.query(
      "UPDATE review_cases SET state=$1,assignee_id=$2,version=version+1,updated_at=now() WHERE id=$3",
      [state, action === "assign" ? assigneeId : row.assignee_id, id],
    );
    await tx.query(
      "INSERT INTO review_actions(workspace_id,case_id,actor_id,action,note) VALUES($1,$2,$3,$4,$5)",
      [req.user!.workspaceId, id, req.user!.id, action, note ?? null],
    );
    await tx.query("COMMIT");
    res.json({ success: true });
  } catch {
    await tx.query("ROLLBACK");
    res
      .status(503)
      .json({ error: "Review action could not be saved. Refresh and retry." });
  } finally {
    tx.release();
  }
}
export async function notifications(req: AuthRequest, res: Response) {
  const data = await connection.query(
    `SELECT a.id,a.case_id AS "caseId",c.shipment_id AS "shipmentId",a.action,a.note,a.occurred_at AS "occurredAt",(r.user_id IS NOT NULL) AS read,s.tracking_number AS "trackingNumber"
 FROM review_actions a JOIN review_cases c ON c.id=a.case_id JOIN shipments s ON s.id=c.shipment_id
 LEFT JOIN notification_reads r ON r.action_id=a.id AND r.user_id=$1 WHERE a.workspace_id=$2 ORDER BY a.id DESC LIMIT 100`,
    [req.user!.id, req.user!.workspaceId],
  );
  res.json({ items: data.rows, capability: "in-app", externalDelivery: false });
}
export async function readNotification(req: AuthRequest, res: Response) {
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid notification ID" });
  const result = await connection.query(
    `INSERT INTO notification_reads(user_id,action_id) SELECT $1,id FROM review_actions WHERE id=$2 AND workspace_id=$3
 ON CONFLICT DO NOTHING RETURNING action_id`,
    [req.user!.id, id, req.user!.workspaceId],
  );
  const exists = await connection.query(
    "SELECT 1 FROM review_actions WHERE id=$1 AND workspace_id=$2",
    [id, req.user!.workspaceId],
  );
  if (!exists.rowCount)
    return res.status(404).json({ error: "Notification not found" });
  res.json({ success: true });
}
export async function integrationStatus(req: AuthRequest, res: Response) {
  const items = await connection.query(
    `SELECT c.provider,c.enabled,max(e.received_at) AS "lastReceivedAt",max(e.occurred_at) AS "lastObservedAt",count(e.id)::int AS "receiptCount"
 FROM logistics_connectors c LEFT JOIN logistics_events e ON e.workspace_id=c.workspace_id AND e.provider=c.provider
 WHERE c.workspace_id=$1 GROUP BY c.provider,c.enabled ORDER BY c.provider LIMIT 100`,
    [req.user!.workspaceId],
  );
  const delivery =
    req.user!.role === "admin"
      ? (
          await connection.query(
            "SELECT state,count(*)::int AS count FROM reset_deliveries d JOIN users u ON u.id=d.user_id WHERE u.active_workspace_id=$1 GROUP BY state",
            [req.user!.workspaceId],
          )
        ).rows
      : undefined;
  res.json({
    items: items.rows.map((item) => ({
      ...item,
      signatureConfigured: Boolean(
        JSON.parse(process.env.LOGISTICS_WEBHOOK_SECRETS || "{}")[
          item.provider
        ],
      ),
      connectivity: "not probed",
      sync: "event intake only",
    })),
    resetDelivery: delivery,
    externalNotifications: false,
    readAt: new Date().toISOString(),
  });
}
export async function operators(req: AuthRequest, res: Response) {
  const result = await connection.query(
    "SELECT u.id,u.name FROM workspace_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND NOT u.disabled AND u.role IN ('admin','engineer') ORDER BY u.name,u.id LIMIT 100",
    [req.user!.workspaceId],
  );
  res.json({ items: result.rows });
}
