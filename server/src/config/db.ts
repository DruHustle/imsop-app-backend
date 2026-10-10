import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../models/schema';
import './env';

const connectionString = process.env.DATABASE_URL
  || 'postgresql://imsop:imsop-postgres-local@localhost:5432/imsop_supply_chain';

export const connection = new Pool({
  connectionString,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
});

export const db = drizzle(connection, { schema });
