import { Request, Response } from "express";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "../config/db";
import { shipments, orders, logisticsEvents } from "../models/schema";

// A read is a database snapshot, not evidence of provider connectivity.
export function readBounds(query: Request["query"]) {
  const integer = (value: unknown, fallback: number, max: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value))
      throw new Error("Invalid pagination");
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > max)
      throw new Error("Invalid pagination");
    return number;
  };
  const limit = integer(query.limit, 100, 500);
  if (limit < 1) throw new Error("Invalid pagination");
  return { limit, offset: integer(query.offset, 0, 1_000_000) };
}

const shipmentFields = {
  ...getTableColumns(shipments),
  observedAt: sql<
    string | null
  >`(select occurred_at from logistics_events e where e.tracking_number = ${shipments.trackingNumber} order by occurred_at desc, id desc limit 1)`,
  receivedAt: sql<
    string | null
  >`(select received_at from logistics_events e where e.tracking_number = ${shipments.trackingNumber} order by occurred_at desc, id desc limit 1)`,
  provider: sql<
    string | null
  >`(select provider from logistics_events e where e.tracking_number = ${shipments.trackingNumber} order by occurred_at desc, id desc limit 1)`,
};

export const boundedList =
  (kind: "shipments" | "orders") => async (req: Request, res: Response) => {
    let bounds;
    try {
      bounds = readBounds(req.query);
    } catch {
      return res
        .status(400)
        .json({ error: "limit must be 1–500 and offset 0–1000000" });
    }
    try {
      const table = kind === "shipments" ? shipments : orders;
      const fields =
        kind === "shipments" ? shipmentFields : getTableColumns(orders);
      const items = await db
        .select(fields)
        .from(table)
        .orderBy(desc(table.id))
        .limit(bounds.limit)
        .offset(bounds.offset);
      // Keep the legacy array contract for clients that do not request pagination.
      if (req.query.limit === undefined && req.query.offset === undefined)
        return res.json(items);
      const [count] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(table);
      return res.json({
        items,
        total: count.total,
        ...bounds,
        source: `node.${kind}`,
        scope: "Newest records by stable database ID",
      });
    } catch {
      return res.status(503).json({ error: `${kind} source unavailable` });
    }
  };

function numericId(value: unknown) {
  return typeof value === "string" &&
    /^[1-9]\d*$/.test(value) &&
    Number(value) <= 2147483647
    ? Number(value)
    : null;
}

export const recordDetail =
  (kind: "shipments" | "orders") => async (req: Request, res: Response) => {
    const id = numericId(req.params.id);
    if (id === null)
      return res
        .status(400)
        .json({ error: "A stable numeric record ID is required" });
    try {
      const table = kind === "shipments" ? shipments : orders;
      const fields =
        kind === "shipments" ? shipmentFields : getTableColumns(orders);
      const [item] = await db
        .select(fields)
        .from(table)
        .where(eq(table.id, id))
        .limit(1);
      return item
        ? res.json(item)
        : res.status(404).json({ error: "Record not found" });
    } catch {
      return res.status(503).json({ error: `${kind} source unavailable` });
    }
  };

export async function shipmentEvents(req: Request, res: Response) {
  const id = numericId(req.params.id);
  if (id === null)
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
    const [shipment] = await db
      .select({ trackingNumber: shipments.trackingNumber })
      .from(shipments)
      .where(eq(shipments.id, id))
      .limit(1);
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });
    const {
      id: eventId,
      provider,
      eventType,
      occurredAt,
      receivedAt,
    } = logisticsEvents;
    // Deliberately omit raw webhook payloads. No unverified order/document associations.
    const items = await db
      .select({ id: eventId, provider, eventType, occurredAt, receivedAt })
      .from(logisticsEvents)
      .where(eq(logisticsEvents.trackingNumber, shipment.trackingNumber))
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
