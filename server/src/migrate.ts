import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import './config/env';

async function migrate() {
  const connectionString = process.env.DATABASE_URL
    || 'postgresql://imsop:imsop-postgres-local@localhost:5432/imsop_supply_chain';
  const pool = new Pool({ connectionString });
  const connection = await pool.connect();
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const migrationsDirectory = path.resolve(process.cwd(), 'migrations');
    const files = (await fs.readdir(migrationsDirectory)).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) {
      const result = await connection.query('SELECT name FROM schema_migrations WHERE name = $1', [file]);
      if (result.rowCount) continue;
      const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
      await connection.query('BEGIN');
      try {
        await connection.query(sql);
        await connection.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await connection.query('COMMIT');
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

migrate().catch(error => {
  console.error('Database migration failed', error);
  process.exitCode = 1;
});
