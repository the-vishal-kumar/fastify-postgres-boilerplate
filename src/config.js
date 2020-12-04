require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

const config = {
  development: {
    appName: process.env.APP_NAME,
    environment: env,
    port: process.env.PORT || 8080,
    rollbarAccessToken: process.env.ROLLBAR_ACCESS_TOKEN,
    reportErrorRequest: false,
    newRelicLicenceKey: process.env.NEW_RELIC_LICENSE_KEY,
    cors: {
      origin: ['http://localhost:8080'],
    },
    origin: 'http://localhost:8080',
    redisUrl: 'redis://192.38.1.3:6388',
    ff: {
      httpBruteProtection: true,
    },
  },
  test: {
    appName: process.env.APP_NAME,
    environment: env,
    port: 3000,
    rollbarAccessToken: null,
    reportErrorRequest: false,
    newRelicLicenceKey: null,
    cors: {
      origin: [],
    },
    redisUrl: 'redis://192.38.1.4:6381',
    ff: {
      httpBruteProtection: false,
    },
  },
  production: {
    appName: process.env.APP_NAME,
    environment: env,
    port: process.env.PORT || 8080,
    rollbarAccessToken: process.env.ROLLBAR_ACCESS_TOKEN,
    reportErrorRequest: true,
    newRelicLicenceKey: process.env.NEW_RELIC_LICENSE_KEY,
    cors: {
      origin: (process.env.CORS_ORIGIN || '').split(','),
    },
    redisUrl: process.env.REDIS_URL,
    ff: {
      httpBruteProtection: true,
    },
  },
};

module.exports = config[env];
