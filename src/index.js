// require('newrelic');

const Fastify = require('fastify')({
  logger: true,
});
const { port } = require('./config');
const { createSequelize } = require('./infra/sequelize');
const { createApp } = require('./infra/http/app');
const { reportError } = require('./infra/report-error');
const { Queue } = require('./common/queue.js');

(async () => {
  const sequelize = await createSequelize();
  const queue = Queue();

  const app = createApp({
    reportError,
    sequelize,
    queue,
  });

  try {
    await app.listen(port);
  } catch (error) {
    Fastify.log.error(error);
    process.exit(1);
  }

  const cleanUp = async () => {
    try {
      await Promise.all([
        await sequelize.close(),
        queue.close(),
        // await server.close(),
      ]);
      process.exit(0);
    } catch (err) {
      process.exit(1);
    }
  };

  process.on('SIGINT', cleanUp);
  process.on('SIGTERM', cleanUp);
})();
