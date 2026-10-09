import './config/env';
import app from './app';
import { assertProductionConfiguration } from './config/security';

assertProductionConfiguration();

const port = process.env.PORT || 3001;

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received; stopping new connections`);
  server.close(error => {
    if (error) {
      console.error('Graceful shutdown failed', error);
      process.exitCode = 1;
    }
  });
  setTimeout(() => process.exit(1), 25_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
