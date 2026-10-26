import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import * as schema from '../models/schema';
import './env';

const connectionString = process.env.DATABASE_URL
  || 'postgresql://imsop:imsop-postgres-local@localhost:5432/imsop_supply_chain';

// Legacy timestamp columns have always carried UTC wall time; do not use host TZ.
types.setTypeParser(1114, value => new Date(value.replace(' ', 'T') + 'Z'));
export const connection = new Pool({
  connectionString,
  options: '-c timezone=UTC',
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
});

export const db = drizzle(connection, { schema });
