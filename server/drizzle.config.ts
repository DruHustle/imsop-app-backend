import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

function parseDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    return {
      host: parsed.hostname || undefined,
      user: decodeURIComponent(parsed.username || '') || undefined,
      password: decodeURIComponent(parsed.password || '') || undefined,
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || '') || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
    };
  } catch {
    return null;
  }
}

const databaseUrlConfig = parseDatabaseUrl();

export default defineConfig({
  schema: './src/models/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.DB_HOST || databaseUrlConfig?.host || 'localhost',
    user: process.env.DB_USER || databaseUrlConfig?.user || 'root',
    password: process.env.DB_PASSWORD || databaseUrlConfig?.password || '',
    database: process.env.DB_NAME || databaseUrlConfig?.database || 'imsop',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : databaseUrlConfig?.port,
  },
});
