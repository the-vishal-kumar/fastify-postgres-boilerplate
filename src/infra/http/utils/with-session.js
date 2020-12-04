// const newrelic = require('newrelic');
// const { withCsrfToken } = require('./csrf');
const { ROLES } = require('../../../core/user');
const {
  ApiError,
  errorCodes: { unauthorizedErrorCode },
} = require('./response.js');

const { csrfProtection } = require('../../../config');

const withSession = [
  (req, res, next) => {
    const {
      session: { userId, role },
    } = req;

    if (!userId) {
      throw new ApiError({ code: unauthorizedErrorCode });
    }

    // newrelic.addCustomAttributes({ userId });

    // drivers are using mobile app only, so no CSRF protection required
    if (role === ROLES.driver || !csrfProtection) {
      next();
    }

    // withCsrfToken(req, res, next);
  },
  (error, req, res, next) => {
    if (error.code === 'EBADCSRFTOKEN') {
      throw new ApiError({
        code: unauthorizedErrorCode,
        message: 'Bad CSRF token',
      });
    }

    next(error);
  },
];

module.exports = { withSession };
