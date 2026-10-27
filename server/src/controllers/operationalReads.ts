import { Request, Response } from "express";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  sql,
  lte,
  lt,
  gte,
  ilike,
  or,
  inArray,
} from "drizzle-orm";
import { db } from "../config/db";
import { shipments, orders, logisticsEvents } from "../models/schema";
import { AuthRequest } from "../middleware/auth";

export function readBounds(query: Request["query"]) {
  const number = (value: unknown, fallback: number, max: number) => {
    if (value === undefined) return fallback;
    if (
      typeof value !== "string" ||
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > max
    )
      throw new Error("Invalid pagination");
    return Number(value);
  };
  const limit = number(query.limit, 100, 500);
  if (limit < 1) throw new Error("Invalid pagination");
  return { limit, offset: number(query.offset, 0, 1000000) };
}
export function recordFilters(
  kind: "shipments" | "orders",
  req: AuthRequest,
  maxId?: number,
) {
  const t = kind === "shipments" ? shipments : orders,
    q = req.query;
  const conditions = [eq(t.workspaceId, req.user!.workspaceId!)];
  if (q.workspaceId || q.organizationId || q.workspace_id)
    throw new Error("Workspace selection is server controlled");
  if (maxId !== undefined) conditions.push(lte(t.id, maxId));
  for (const key of ["maxId", "cursor"])
    if (
      q[key] !== undefined &&
      (typeof q[key] !== "string" ||
        !/^\d{1,10}$/.test(q[key] as string) ||
        Number(q[key]) > 2147483647)
    )
      throw new Error("Invalid cursor");
  if (q.maxId) conditions.push(lte(t.id, Number(q.maxId)));
  if (q.cursor) conditions.push(lt(t.id, Number(q.cursor)));
  if (q.q !== undefined) {
    if (typeof q.q !== "string" || q.q.length > 200)
      throw new Error("Invalid search");
    const term = "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%";
    conditions.push(
      kind === "shipments"
        ? or(
            ilike(shipments.trackingNumber, term),
            ilike(shipments.origin, term),
            ilike(shipments.destination, term),
            ilike(shipments.carrier, term),
          )!
        : ilike(orders.orderNumber, term),
    );
  }
  if (q.identifier !== undefined) {
    if (typeof q.identifier !== "string" || q.identifier.length > 100)
      throw new Error("Invalid identifier");
    conditions.push(
      eq(
        kind === "shipments" ? shipments.trackingNumber : orders.orderNumber,
        q.identifier,
      ),
    );
  }
  if (q.status) {
    if (typeof q.status !== "string" || q.status.length > 50)
      throw new Error("Invalid status");
    const status = q.status.toLowerCase().replace(/ /g, "_");
    conditions.push(
      status === "attention"
        ? inArray(t.status, ["delayed", "exception"])
        : status === "active"
          ? sql`${t.status} NOT IN ('delivered','cancelled')`
          : eq(t.status, status),
    );
  }
  if (kind === "shipments")
    for (const [query, column] of [
      ["carrier", shipments.carrier],
      ["mode", shipments.transportMode],
    ] as const) {
      const value = q[query];
      if (value) {
        if (typeof value !== "string" || value.length > 100)
          throw new Error("Invalid filter");
        if(query==='carrier' && value==='Not supplied') conditions.push(sql`trim(coalesce(${shipments.carrier},''))=''`);
        else if(query==='mode' && value==='Unknown') conditions.push(sql`${shipments.transportMode} IS NULL OR lower(${shipments.transportMode}) NOT IN ('road','rail','air','sea','ocean','parcel','other')`);
        else if(query==='mode' && value.toLowerCase()==='sea') conditions.push(inArray(shipments.transportMode,['sea','ocean']));
        else conditions.push(eq(column,query==='mode'?value.toLowerCase():value));
      }
    }
  for (const key of ["from", "to"] as const)
    if (q[key]) {
      const value = q[key];
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value))
      )
        throw new Error("Invalid date");
      if (key === "from")
        conditions.push(gte(t.createdAt, new Date(value + "T00:00:00Z")));
      else
        conditions.push(
          lt(
            t.createdAt,
            new Date(Date.parse(value + "T00:00:00Z") + 86400000),
          ),
        );
    }
  return and(...conditions);
}
export const boundedList =
  (kind: "shipments" | "orders") => async (req: AuthRequest, res: Response) => {
    let bounds, where;
    try {
      bounds = readBounds(req.query);
      where = recordFilters(kind, req);
      if (
        req.query.sort &&
        !["newest", "tracking", "eta"].includes(String(req.query.sort))
      )
        throw new Error();
      if (req.query.cursor && req.query.sort && req.query.sort !== "newest")
        throw new Error();
    } catch {
      return res.status(400).json({ error: "Invalid filters or pagination" });
    }
    try {
      const table = kind === "shipments" ? shipments : orders;
      // Count and page share one PostgreSQL MVCC snapshot. maxId pins later pages against inserts.
      const data = await db.transaction(
        async (tx) => {
          const [stats] = await tx
            .select({
              total: sql<number>`count(*)::int`,
              maxId: sql<number>`coalesce(max(${table.id}),0)::int`,
            })
            .from(table)
            .where(where);
          const items = await tx
            .select()
            .from(table)
            .where(where)
            .orderBy(
              ...(req.query.sort === "tracking"
                ? [
                    asc(
                      kind === "shipments"
                        ? shipments.trackingNumber
                        : orders.orderNumber,
                    ),
                    desc(table.id),
                  ]
                : req.query.sort === "eta" && kind === "shipments"
                  ? [asc(shipments.estimatedArrival), desc(table.id)]
                  : [desc(table.id)]),
            )
            .limit(bounds.limit)
            .offset(bounds.offset);
          return {
            items,
            total: stats.total,
            maxId: Number(req.query.maxId || stats.maxId),
            nextCursor:
              (!req.query.sort || req.query.sort === "newest") &&
              items.length === bounds.limit
                ? items[items.length - 1].id
                : null,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
      if (req.query.limit === undefined && req.query.offset === undefined)
        return res.json(data.items);
      return res.json({
        ...data,
        ...bounds,
        source: `node.${kind}`,
        scope:
          "All matching records in this workspace; pagination pinned by maxId",
        readAt: new Date().toISOString(),
        contractVersion: 2,
      });
    } catch {
      return res.status(503).json({ error: `${kind} source unavailable` });
    }
  };
export function numericId(value: unknown) {
  return typeof value === "string" &&
    /^[1-9]\d*$/.test(value) &&
    Number(value) <= 2147483647
    ? Number(value)
    : null;
}
export const recordDetail =
  (kind: "shipments" | "orders") => async (req: AuthRequest, res: Response) => {
    const id = numericId(req.params.id);
    if (!id)
      return res
        .status(400)
        .json({ error: "A stable numeric record ID is required" });
    try {
      const table = kind === "shipments" ? shipments : orders;
      const [item] = await db
        .select()
        .from(table)
        .where(
          and(eq(table.id, id), eq(table.workspaceId, req.user!.workspaceId!)),
        )
        .limit(1);
      return item
        ? res.json(item)
        : res.status(404).json({ error: "Record not found" });
    } catch {
      return res.status(503).json({ error: `${kind} source unavailable` });
    }
  };
export async function shipmentEvents(req: AuthRequest, res: Response) {
  const id = numericId(req.params.id);
  if (!id)
    return res
      .status(400)
      .json({ error: "A stable numeric shipment ID is required" });
  let bounds;
  try {
    bounds = readBounds(req.query);
  } catch {
    return res.status(400).json({ error: "Invalid pagination" });
  }
  try {
    const [s] = await db
      .select()
      .from(shipments)
      .where(
        and(
          eq(shipments.id, id),
          eq(shipments.workspaceId, req.user!.workspaceId!),
        ),
      )
      .limit(1);
    if (!s) return res.status(404).json({ error: "Shipment not found" });
    const {
      id: eventId,
      provider,
      eventType,
      occurredAt,
      receivedAt,
    } = logisticsEvents;
    const items = await db
      .select({ id: eventId, provider, eventType, occurredAt, receivedAt })
      .from(logisticsEvents)
      .where(
        and(
          eq(logisticsEvents.workspaceId, req.user!.workspaceId!),
          eq(logisticsEvents.provider, s.provider!),
          eq(logisticsEvents.trackingNumber, s.trackingNumber),
        ),
      )
      .orderBy(desc(occurredAt), desc(eventId))
      .limit(Math.min(bounds.limit, 100))
      .offset(bounds.offset);
    res.json({
      items,
      limit: Math.min(bounds.limit, 100),
      offset: bounds.offset,
      source: "node.logistics_events",
    });
  } catch {
    res.status(503).json({ error: "Tracking event source unavailable" });
  }
}
export async function shipmentSummary(req: AuthRequest, res: Response) {
  let where;
  try {
    where = recordFilters("shipments", req);
  } catch {
    return res.status(400).json({ error: "Invalid filters" });
  }
  try {
    const [result] = await db
      .select({
        total: sql<number>`count(*)::int`,
        delivered: sql<number>`count(*) filter(where status='delivered')::int`,
        exceptions: sql<number>`count(*) filter(where status in ('delayed','exception'))::int`,
        eligible: sql<number>`count(*) filter(where status='delivered' and promised_arrival is not null and actual_arrival is not null)::int`,
        onTime: sql<number>`count(*) filter(where status='delivered' and promised_arrival is not null and actual_arrival<=promised_arrival)::int`,
      })
      .from(shipments)
      .where(where);
    res.json({
      ...result,
      definition:
        "Delivered at or before the earliest retained provider estimate; only explicit actual delivery evidence is eligible.",
      source: "node.shipments",
      readAt: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ error: "Summary unavailable" });
  }
}
