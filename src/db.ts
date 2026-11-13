import pg from 'pg';

// bigint (int8) arrives as a string by default because it can exceed 2^53.
// Amounts are capped at 10^11 cents, far inside the safe integer range.
pg.types.setTypeParser(pg.types.builtins.INT8, value => Number(value));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export const createPool = (connectionString: string): Db =>
  new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000 });

/** Runs `work` in one transaction: commit on success, roll back on any error. */
export const inTransaction = async <T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> => {
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    const result = await work(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    tx.release();
  }
};

export const isUniqueViolation = (error: unknown): boolean => (error as { code?: string } | null)?.code === '23505';
