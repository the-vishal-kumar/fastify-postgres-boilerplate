const Fastify = require('fastify');
const fastifyCors = require('fastify-cors');
const FastifyRateLimit = require('fastify-rate-limit');
const FastifySwagger = require('fastify-swagger');

const config = require('../../config');
const { createUsersRoute } = require('./routes/users');
const { createCore } = require('../../core');
const { createApplication } = require('../../application');
const { createNotFoundRoute } = require('./routes/not-found');
const { createErrorRoute } = require('./routes/error');

const { createRateLimiter } = require(`./utils/ratelimiter`);

const {
  name,
  homepage,
  author,
} = require('../../../package.json');

const {
  ApiError,
  errorCodes: { tooManyRequestsErrorCode },
} = require('./utils/response');

const createApp = ({
  reportError,
  sequelize = {},
  application = {},
  core,
  config: { cors: { origin: corsOrigin } } = config,
}) => {
  core = core || createCore({ sequelize }); // eslint-disable-line no-param-reassign
  // eslint-disable-next-line no-param-reassign
  application = {
    ...createApplication({ sequelize, core }),
    ...application,
  };

  const notFoundRoute = createNotFoundRoute();
  const errorRoute = createErrorRoute({ reportError });

  const app = Fastify({
    logger: true,
    trustProxy: process.env.NODE_ENV === 'production',
  });

  app.register(FastifySwagger, {
    routePrefix: '/documentation',
    swagger: {
      info: {
        title: 'Swagger Documentation for APIs',
        description: '',
        version: '0.1.0',
      },
    },
    exposeRoute: true,
  });

  const store = createRateLimiter({ sequelize });

  app.register(FastifyRateLimit, {
    global: false,
    max: 4,
    timeWindow: 500,
    store,
    errorResponseBuilder: (req, context) => {
      const error = new ApiError({
        code: tooManyRequestsErrorCode,
        details: {
          nextValidRequestAfter: context.after,
        },
      });
      return errorRoute(error, req, context);
    },
  });

  app.register(fastifyCors, {
    origin: corsOrigin,
    methods: ['POST', 'GET', 'PATCH', 'DELETE', 'PUT'],
    exposedHeaders: ['Content-Length', 'x-access-token'],
  });

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
      }
    },
  );

  app.register(createUsersRoute, {
    prefix: '/users',
    core,
    config,
    application,
  });

  app.get(
    '/',
    {
      config: {
        rateLimit: {
          // max: 2,
          // timeWindow: 1000 * 60 * 1, // millisecond * second * minute
        },
      },
    },
    async (req, reply) => {
      reply
        .code(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(
          `Welcome to <strong>${name}</strong>.<br>Go to <a href='${homepage}'>Github Repository</a><br>Contact author <a href='https://www.linkedin.com/in/the-vishal-kumar/'>${author}</a>`,
        );
    },
  );

  app.setNotFoundHandler(notFoundRoute);

  app.setErrorHandler(errorRoute);

  return app;
};

module.exports = { createApp };
