const {
  errorCodes: { validationErrorCode },
  ApiError,
} = require('./response.js');

const validateInput = errorDetails => {
  return new ApiError({
    code: validationErrorCode,
    details: errorDetails,
  });
};

module.exports = { validateInput };
