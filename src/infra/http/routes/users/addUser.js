const {
  toApiResponse,
  ApiError,
  errorCodes: { emailAlreadyExistsErrorCode },
} = require('../../utils/response.js');
const { EmailAlreadyExistsError } = require('../../../../common/errors.js');

const createAddUserRoute = ({
  app,
  core: {
    userCore: { addUser },
  },
}) => {
  /**
   * @api {post} /user/addUser Add user
   * @apiName AddUser
   * @apiGroup User
   *
   * @apiParam { email } email
   *
   */

  const schema = {
    body: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string' },
      },
    },
    // querystring: {},
    // params: {},
    // headers: {},
    // response: {},
  };

  app.post(
    '/addUser',
    {
      schema,
      config: {
        rateLimit: {
          // max: 2,
          // timeWindow: '1 minute',
        },
      },
    },
    toApiResponse(async ({ body: { email } }) => {
      try {
        const user = await addUser({ email });
        return { status: 201, data: user };
      } catch (error) {
        if (error instanceof EmailAlreadyExistsError) {
          throw new ApiError({
            status: 422,
            code: emailAlreadyExistsErrorCode,
            message: 'Email already exists.',
          });
        }
        throw error;
      }
    }),
  );

  return app;
};

module.exports = { createAddUserRoute };
