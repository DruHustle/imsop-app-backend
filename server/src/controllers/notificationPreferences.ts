import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { connection } from "../config/db";
import { externalMailAvailable } from "../services/notificationDelivery";
export async function notificationPreferences(req: AuthRequest, res: Response) {
  const row = (
    await connection.query(
      "SELECT email_enabled FROM notification_preferences WHERE user_id=$1 AND workspace_id=$2",
      [req.user!.id, req.user!.workspaceId],
    )
  ).rows[0];
  res.json({
    emailEnabled: row?.email_enabled ?? false,
    deliveryAvailable: externalMailAvailable(),
    capability: "durable-opt-in-email",
    inApp: true,
  });
}
export async function updateNotificationPreferences(
  req: AuthRequest,
  res: Response,
) {
  if (req.body.emailEnabled && !externalMailAvailable())
    return res
      .status(503)
      .json({
        error:
          "Email notifications need enabled server delivery and a configured mail provider. In-app notices remain available.",
      });
  await connection.query(
    "INSERT INTO notification_preferences(user_id,workspace_id,email_enabled) VALUES($1,$2,$3) ON CONFLICT(user_id,workspace_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled",
    [req.user!.id, req.user!.workspaceId, req.body.emailEnabled],
  );
  return notificationPreferences(req, res);
}
