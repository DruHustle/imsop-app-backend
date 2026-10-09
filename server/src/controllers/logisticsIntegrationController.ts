import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../config/db';
import { logisticsEvents, shipments } from '../models/schema';

export async function ingestLogisticsEvent(req: Request, res: Response) {
  const provider = req.logisticsProvider!;
  const event = req.body;
  try {
    const existing = await db.query.logisticsEvents.findFirst({
      where: and(eq(logisticsEvents.provider, provider), eq(logisticsEvents.eventId, event.eventId)),
    });
    if (existing) return res.status(202).json({ accepted: true, duplicate: true });

    await db.transaction(async tx => {
      await tx.insert(logisticsEvents).values({
        provider,
        eventId: event.eventId,
        trackingNumber: event.trackingNumber,
        eventType: event.eventType,
        payload: JSON.stringify(event),
        occurredAt: new Date(event.occurredAt),
      });
      await tx.insert(shipments).values({
        trackingNumber: event.trackingNumber,
        origin: event.origin || 'Unknown',
        destination: event.destination || event.location?.label || 'Unknown',
        status: event.status,
        carrier: event.carrier,
        transportMode: event.transportMode,
        latitude: event.location ? String(event.location.latitude) : null,
        longitude: event.location ? String(event.location.longitude) : null,
        estimatedArrival: event.estimatedArrival ? new Date(event.estimatedArrival) : null,
      }).onConflictDoUpdate({ target: shipments.trackingNumber, set: {
        status: event.status,
        carrier: event.carrier,
        transportMode: event.transportMode,
        latitude: event.location ? String(event.location.latitude) : null,
        longitude: event.location ? String(event.location.longitude) : null,
        estimatedArrival: event.estimatedArrival ? new Date(event.estimatedArrival) : null,
      }});
    });

    res.status(202).json({ accepted: true, duplicate: false });
  } catch (error) {
    console.error('[logistics] Event ingestion failed', { provider, eventId: event.eventId, error });
    res.status(500).json({ error: 'Failed to ingest logistics event' });
  }
}
