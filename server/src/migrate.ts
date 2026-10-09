import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

function connectionOptions() {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : undefined;
  return {
    host: process.env.DB_HOST || url?.hostname || 'localhost',
    port: Number(process.env.DB_PORT || url?.port || 3306),
    user: process.env.DB_USER || (url ? decodeURIComponent(url.username) : 'root'),
    password: process.env.DB_PASSWORD || (url ? decodeURIComponent(url.password) : ''),
    database: process.env.DB_NAME || (url ? decodeURIComponent(url.pathname.slice(1)) : 'imsop'),
    multipleStatements: true,
  };
}

async function migrate() {
  const connection = await mysql.createConnection(connectionOptions());
  try {
    await connection.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const migrationsDirectory = path.resolve(process.cwd(), 'migrations');
    const files = (await fs.readdir(migrationsDirectory)).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) {
      const [rows] = await connection.execute('SELECT name FROM schema_migrations WHERE name = ?', [file]);
      if (Array.isArray(rows) && rows.length > 0) continue;
      const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
      await connection.query(sql);
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`Applied migration ${file}`);
    }
  } finally {
    await connection.end();
  }
}

migrate().catch(error => {
  console.error('Database migration failed', error);
  process.exitCode = 1;
});
