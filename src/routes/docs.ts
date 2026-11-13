import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply } from 'fastify';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const swaggerDist = dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));

/**
 * The shared contract, served as-is apart from the title and description,
 * which name this stack. CI checks it against the tagged contract.
 */
export const openApiDocument = (): Record<string, unknown> => {
  const document = JSON.parse(readFileSync(join(root, 'contract/openapi.json'), 'utf8')) as {
    info: { title: string; description: string };
  };
  document.info.title = 'Loan API (Fastify, PostgreSQL)';
  document.info.description = `Fastify and PostgreSQL implementation of the loan API.\n\n${document.info.description}`;
  return document;
};

/** Swagger UI from swagger-ui-dist, same origin only, so the default CSP holds. */
export const docsRoutes = (app: FastifyInstance): void => {
  const document = JSON.stringify(openApiDocument());
  const own = (file: string): Buffer => readFileSync(join(root, 'src/docs', file));
  const dist = (file: string): Buffer => readFileSync(join(swaggerDist, file));
  const assets: Record<string, [Buffer, string]> = {
    'index.html': [own('index.html'), 'text/html; charset=utf-8'],
    'swagger-initializer.js': [own('swagger-initializer.js'), 'application/javascript; charset=utf-8'],
    'swagger-ui-bundle.js': [dist('swagger-ui-bundle.js'), 'application/javascript; charset=utf-8'],
    'swagger-ui.css': [dist('swagger-ui.css'), 'text/css; charset=utf-8'],
    'favicon-32x32.png': [dist('favicon-32x32.png'), 'image/png'],
  };

  app.get('/', (_request, reply) => reply.redirect('/docs'));
  app.get('/docs', (_request, reply) => reply.redirect('/docs/'));
  app.get('/docs/openapi.json', (_request, reply) => reply.type('application/json; charset=utf-8').send(document));
  const serve = (file: string, reply: FastifyReply): FastifyReply => {
    const asset = assets[file];
    if (!asset) return reply.code(404).send({ status: 404, error: 'Resource not found' });
    return reply.type(asset[1]).header('Cache-Control', 'public, max-age=3600').send(asset[0]);
  };
  app.get('/docs/', (_request, reply) => serve('index.html', reply));
  app.get<{ Params: { file: string } }>('/docs/:file', (request, reply) => serve(request.params.file, reply));
};
