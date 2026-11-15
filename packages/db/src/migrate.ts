import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './index.js';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const { db, pool } = createDatabase(connectionString);
try { await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) }); }
finally { await pool.end(); }
