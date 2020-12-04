const {
  ApiError,
  errorCodes: { forbiddenErrorCode },
} = require('./response.js');
const { checkPermisssion } = require('./acl-authorization.js');

const hasPermission = (predicate = () => true) => async (req, res, next) => {
  try {
    const { session, originalUrl, method } = req;

    const isAllowed =
      (await checkPermisssion(
        session.role,
        originalUrl.split('?')[0],
        method.toLowerCase(),
      )) && (await predicate(req, session));

    if (isAllowed) {
      next();
      return;
    }

    next(
      new ApiError({
        code: forbiddenErrorCode,
      }),
    );
  } catch (error) {
    next(error);
  }
};

module.exports = { hasPermission };
