const {
  errorCodes: { internalServerErrorCode, tooManyRequestsErrorCode },
  ApiError,
} = require('../utils/response');
const { validateInput } = require('../utils/validate-input');
const { validateRequest } = require('../utils/validate-request');

const createErrorRoute = ({ reportError }) => (error, req, res) => {
  if (error.validationContext) {
    // eslint-disable-next-line no-param-reassign
    error = validateInput([
      ...error.validation,
      { validationContext: error.validationContext },
    ]);
  } else if (error instanceof URIError) {
    // eslint-disable-next-line no-param-reassign
    error = validateRequest(error);
  }

  const errorExpected = error instanceof ApiError;

  if (!errorExpected) {
    reportError(error, req);
  }

  const { status, code, message, details } = errorExpected
    ? error
    : new ApiError({
        code: internalServerErrorCode,
      });

  const errRes = {
    success: false,
    status,
    error: {
      code,
      message,
      details,
    },
  };

  if (code === tooManyRequestsErrorCode) {
    return errRes;
  }

  res.status(status).send(errRes);
  return null;
};

module.exports = { createErrorRoute };
