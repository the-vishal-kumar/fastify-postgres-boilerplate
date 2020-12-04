const {
  ApiError,
  errorCodes: { notFoundErrorCode },
} = require('../utils/response.js');

const createNotFoundRoute = () => () => {
  throw new ApiError({ code: notFoundErrorCode });
};

module.exports = { createNotFoundRoute };
