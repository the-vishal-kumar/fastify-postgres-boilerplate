import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { AppConfig } from './config.js';
import { isUniqueViolation } from './db.js';
import { ApiError } from './errors.js';
import { FixedWindowLimiter } from './ratelimit.js';
import { authRoutes } from './routes/auth.js';
import { docsRoutes } from './routes/docs.js';
import { healthRoutes, type Lifecycle } from './routes/health.js';
import { loanRoutes } from './routes/loans.js';
import type { Store } from './store.js';

const REQUEST_ID = /^[\w.-]{1,128}$/;
const BODY_LIMIT = 10 * 1024;
const AUTH_PATHS = ['/auth/signup', '/auth/signin', '/auth/password'];
const UNLIMITED = /^\/(health\/|docs|$)/;

export interface AppOptions {
  config: AppConfig;
  store: Store;
  lifecycle?: Lifecycle;
  logger?: FastifyServerOptions['logger'];
}

/**
 * Builds the Fastify application without listening, so tests drive it with
 * `app.inject()` and the entrypoint owns the server lifecycle.
 */
export const buildApp = async ({
  config,
  store,
  lifecycle = { isShuttingDown: () => false },
  logger = { level: config.logLevel },
}: AppOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    logger,
    bodyLimit: BODY_LIMIT,
    // A hop count trusts that many proxies in front of the service.
    trustProxy:
      typeof config.trustProxy === 'number'
        ? (_address: string, hop: number) => hop < (config.trustProxy as number)
        : config.trustProxy,
    // Fastify's two log lines per request are replaced by one access-log line below.
    disableRequestLogging: true,
    requestIdHeader: false,
    // Reuse a well-formed incoming id so requests can be traced across services.
    genReqId: request => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
    routerOptions: { ignoreTrailingSlash: false },
  });

  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  // JSON parser of our own: an empty body means {} (as the reference API
  // treats it) and a parse failure is a plain 400.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: BODY_LIMIT }, (_request, body, done) => {
    if (body === '') return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new ApiError(400, 'Request body is not valid JSON'), undefined);
    }
  });
  // Other media types are not read; validation then reports the missing fields.
  app.addContentTypeParser('*', (_request, _payload, done) => done(null, undefined));

  await app.register(helmet);
  await app.register(cors, { origin: config.corsOrigins === '*' ? '*' : config.corsOrigins });

  const apiLimiter = new FixedWindowLimiter('api', config.rateLimitMax, config.rateLimitWindowMs);
  const authLimiter = new FixedWindowLimiter('auth', config.authRateLimitMax, config.rateLimitWindowMs);
  app.addHook('onClose', (_instance, done) => {
    apiLimiter.stop();
    authLimiter.stop();
    done();
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    const path = request.url.split('?')[0] ?? '';
    if (UNLIMITED.test(path)) return;
    for (const limiter of AUTH_PATHS.some(prefix => path.startsWith(prefix))
      ? [authLimiter, apiLimiter]
      : [apiLimiter]) {
      const { allowed, headers } = limiter.hit(request.ip);
      reply.headers(headers);
      if (!allowed) {
        throw new ApiError(
          429,
          limiter === authLimiter
            ? 'Too many authentication attempts, try again later'
            : 'Too many requests, try again later',
        );
      }
    }
  });

  // One structured access-log line per request; bodies are never logged (they hold passwords).
  app.addHook('onResponse', async (request, reply) => {
    if (request.url.startsWith('/health/')) return;
    const entry = {
      requestId: request.id,
      method: request.method,
      path: request.url.split('?')[0],
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 10) / 10,
    };
    if (reply.statusCode >= 500) request.log.error(entry, 'request completed');
    else request.log.info(entry, 'request completed');
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ status: 404, error: 'Resource not found' }));

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      if (error.status < 500) request.log.warn({ requestId: request.id, error: error.message }, 'request rejected');
      return reply
        .code(error.status)
        .send(
          error.errors
            ? { status: error.status, error: error.message, errors: error.errors }
            : { status: error.status, error: error.message },
        );
    }
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ status: 413, error: 'Request body is too large' });
    }
    if (isUniqueViolation(error)) return reply.code(409).send({ status: 409, error: 'Resource already exists' });
    if (error.statusCode === 400) return reply.code(400).send({ status: 400, error: 'Request body is not valid JSON' });
    request.log.error(
      { requestId: request.id, method: request.method, path: request.url, err: error },
      'unhandled error',
    );
    return reply.code(500).send({ status: 500, error: 'An error occurred', requestId: request.id });
  });

  healthRoutes(app, store, lifecycle);
  docsRoutes(app);
  authRoutes(app, store, config);
  loanRoutes(app, store, config);

  return app;
};
