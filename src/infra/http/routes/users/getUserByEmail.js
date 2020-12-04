const {
  toApiResponse,
  ApiError,
  errorCodes: { notFoundErrorCode },
} = require('../../utils/response.js');

const { JobNotFoundError } = require('../../../../common/errors.js');

const createGetUserByEmailRoute = ({
  app,
  core: {
    userCore: { getUserByEmail },
  },
}) => {
  /**
   * @api {get} /user/getUsersByEmail Get user by email
   * @apiName GetUser
   * @apiGroup User
   *
   * @apiSuccess (200) {user} User
   */

  const schema = {
    // body: {},
    querystring: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string' },
      },
    },
    // params: {},
    // headers: {},
    // response: {},
  };

  app.get(
    '/getUserByEmail',
    { schema },
    toApiResponse(async () => {
      try {
        const user = await getUserByEmail();

        return { status: 200, data: user };
      } catch (error) {
        if (error instanceof JobNotFoundError) {
          throw new ApiError({
            status: 404,
            code: notFoundErrorCode,
            message: 'User not found.',
          });
        }
        throw error;
      }
    }),
  );

  return app;
};

module.exports = { createGetUserByEmailRoute };
