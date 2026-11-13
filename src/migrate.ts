import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

// Arbitrary constant shared by every migrator of this service.
const LOCK_ID = 727_154_301;
const DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * Applies the SQL files in migrations/ in file-name order, each in its own
 * transaction, and records them in schema_migrations. An advisory lock makes
 * concurrent migrators (several replicas starting at once) wait in turn.
 * Returns the versions it applied.
 */
export const migrate = async (db: Db, dir = DIR): Promise<string[]> => {
  const client = await db.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set(
      (await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(row => row.version),
    );
    const files = (await readdir(dir)).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (done.has(version)) continue;
      const sql = await readFile(`${dir}${file}`, 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
      }
      applied.push(version);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    client.release();
  }
  return applied;
};
