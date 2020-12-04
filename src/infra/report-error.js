const Rollbar = require('rollbar');
const { rollbarAccessToken, reportErrorRequest } = require('../config.js');

const reporter = rollbarAccessToken
  ? new Rollbar({
      accessToken: rollbarAccessToken,
      captureUnhandledRejections: true,
    })
  : console;

module.exports = {
  reportError: (error, request) =>
    reporter.error(error, reportErrorRequest ? request : undefined),
};
