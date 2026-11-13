import type { FastifyInstance } from 'fastify';
import type { Store } from '../store.js';

export interface Lifecycle {
  /** True once SIGTERM/SIGINT is received; readiness then fails so traffic drains. */
  isShuttingDown: () => boolean;
}

/**
 * Liveness never touches the database, so a database outage does not get
 * every instance restarted. Readiness decides whether to send traffic here.
 */
export const healthRoutes = (app: FastifyInstance, store: Store, lifecycle: Lifecycle): void => {
  app.get('/health/live', (_request, reply) =>
    reply.send({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }),
  );

  app.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {
      postgres: 'fail',
      shutdown: lifecycle.isShuttingDown() ? 'fail' : 'ok',
    };
    try {
      await Promise.race([
        store.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000).unref()),
      ]);
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'fail';
    }
    const ready = Object.values(checks).every(check => check === 'ok');
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not ready', checks });
  });
};
