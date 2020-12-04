const {
  errorCodes: { badRequestErrorCode },
  ApiError,
} = require('./response');

const validateRequest = error => {
  return new ApiError({
    code: badRequestErrorCode,
    message: error.message,
  });
};

module.exports = { validateRequest };
