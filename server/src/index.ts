import './config/env';
import app from './app';
import { assertProductionConfiguration } from './config/security';
import { connection } from './config/db';

assertProductionConfiguration();

const port = process.env.PORT || 3001;

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; stopping new connections`);
  server.close(async error => {
    if (error) {
      console.error('Graceful shutdown failed', error);
      process.exitCode = 1;
    }
    try {
      await connection.end();
    } catch (poolError) {
      console.error('Database pool shutdown failed', poolError);
      process.exitCode = 1;
    }
  });
  setTimeout(() => process.exit(1), 25_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
