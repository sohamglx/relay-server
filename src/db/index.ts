import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const connectionString = process.env.DB_URI;

if (!connectionString) {
  throw new Error('DB_URI is not configured');
}

export const pool = new Pool({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

export const db = drizzle({ client: pool });
