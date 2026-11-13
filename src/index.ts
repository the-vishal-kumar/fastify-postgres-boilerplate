import { buildApp } from './app.js';
import { loadConfig, type AppConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { Store } from './store.js';

const fail = (message: string, error?: unknown): never => {
  console.error(JSON.stringify({ level: 'error', msg: message, err: error instanceof Error ? error.message : error }));
  process.exit(1);
};

const configOrExit = (): AppConfig => {
  try {
    return loadConfig();
  } catch (error) {
    return fail((error as Error).message);
  }
};

/** One-shot migrate step: compose runs it before the API starts. */
const runMigrations = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail('DATABASE_URL is required');
  const pool = createPool(databaseUrl as string);
  try {
    const applied = await migrate(pool);
    console.log(JSON.stringify({ level: 'info', msg: 'migrations applied', applied }));
  } catch (error) {
    fail('migration failed', error);
  } finally {
    await pool.end();
  }
};

/**
 * Stops in a fixed order: fail readiness, stop accepting connections and let
 * in-flight requests finish, then close the pool. A timer forces exit 1 if
 * draining takes longer than SHUTDOWN_TIMEOUT_MS.
 */
const serve = async (): Promise<void> => {
  const config = configOrExit();
  const pool = createPool(config.databaseUrl);
  let shuttingDown = false;
  const app = await buildApp({ config, store: new Store(pool), lifecycle: { isShuttingDown: () => shuttingDown } });
  // Longer than a typical load balancer idle timeout (60 s), so the balancer closes idle connections.
  app.server.keepAliveTimeout = 65_000;
  app.server.headersTimeout = 66_000;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutdown started');
    setTimeout(() => {
      app.log.error({ timeoutMs: config.shutdownTimeoutMs }, 'shutdown timed out, forcing exit');
      process.exit(1);
    }, config.shutdownTimeoutMs).unref();
    try {
      await app.close();
      await pool.end();
      app.log.info('shutdown complete');
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  };
  process.on('SIGTERM', signal => void shutdown(signal));
  process.on('SIGINT', signal => void shutdown(signal));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (error) {
    fail('start-up failed', error);
  }
};

if (process.argv[2] === 'migrate') await runMigrations();
else await serve();
