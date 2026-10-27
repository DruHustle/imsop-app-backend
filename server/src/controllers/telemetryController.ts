import { Request, Response } from "express";
import { db } from "../config/db";
import { telemetry } from "../models/schema";

import { AuthRequest } from "../middleware/auth";
import { eq, desc } from "drizzle-orm";
import { readBounds } from "./operationalReads";
export const getTelemetry = async (req: AuthRequest, res: Response) => {
  try {
    const data = await db
      .select()
      .from(telemetry)
      .where(eq(telemetry.workspaceId, req.user!.workspaceId!))
      .orderBy(desc(telemetry.id))
      .limit(readBounds(req.query).limit)
      .offset(readBounds(req.query).offset);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch telemetry data" });
  }
};

export const postTelemetry = async (req: AuthRequest, res: Response) => {
  const { deviceId, metricName, metricValue } = req.body;
  try {
    await db.insert(telemetry).values({
      workspaceId: req.user!.workspaceId,
      deviceId,
      metricName,
      metricValue: String(metricValue),
    });
    res.status(201).json({ message: "Telemetry recorded" });
  } catch (error) {
    res.status(500).json({ error: "Failed to record telemetry" });
  }
};
