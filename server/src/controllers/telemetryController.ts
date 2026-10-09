import { Request, Response } from 'express';
import { db } from '../config/db';
import { telemetry } from '../models/schema';

export const getTelemetry = async (req: Request, res: Response) => {
  try {
    const data = await db.select().from(telemetry);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch telemetry data' });
  }
};

export const postTelemetry = async (req: Request, res: Response) => {
  const { deviceId, metricName, metricValue } = req.body;
  try {
    await db.insert(telemetry).values({
      deviceId,
      metricName,
      metricValue,
    });
    res.status(201).json({ message: 'Telemetry recorded' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record telemetry' });
  }
};
