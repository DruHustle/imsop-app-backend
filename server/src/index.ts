import "./config/env";
import app from "./app";
import { assertProductionConfiguration } from "./config/security";
import { connection } from "./config/db";

assertProductionConfiguration();

import { dispatchResetDeliveries } from "./services/resetDelivery";
import {dispatchOperationalNotifications} from "./services/notificationDelivery";
let dispatching = false;
const deliveryTimer = setInterval(async () => {
  if (dispatching) return;
  dispatching = true;
  try {
    await dispatchResetDeliveries();
    await dispatchOperationalNotifications();
  } catch {
    console.warn(JSON.stringify({ event: "reset_worker_failed" }));
  } finally {
    dispatching = false;
  }
}, 5000);
deliveryTimer.unref();

const port = process.env.PORT || 3001;

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(deliveryTimer);
  console.log(`${signal} received; stopping new connections`);
  server.close(async (error) => {
    if (error) {
      console.error("Graceful shutdown failed", error);
      process.exitCode = 1;
    }
    try {
      await connection.end();
    } catch (poolError) {
      console.error("Database pool shutdown failed", poolError);
      process.exitCode = 1;
    }
  });
  setTimeout(() => process.exit(1), 25_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
