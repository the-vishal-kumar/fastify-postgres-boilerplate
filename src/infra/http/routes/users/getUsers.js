const { toApiResponse } = require('../../utils/response.js');
const { toPagination } = require('../../utils/pagination.js');

const createGetUsersRoute = ({
  app,
  application: {
    users: { getUsers },
  },
  config: { origin },
}) => {
  /**
   * @api {get} /users/getUsers Get users
   * @apiName GetUsers
   * @apiGroup User
   *
   * @apiSuccess (200) {users} Users.
   */

  const schema = {
    // body: {},
    querystring: {
      type: 'object',
      required: [],
      properties: {
        perPage: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        page: {
          type: 'integer',
          minimum: 1,
        },
        sort: {
          type: 'string',
          enum: ['email'],
        },
        orderBy: {
          type: 'string',
          enum: ['desc', 'asc'],
        },
      },
    },
    // params: {},
    // headers: {},
    // response: {},
  };

  app.get(
    '/getUsers',
    { schema },
    toApiResponse(async req => {
      const {
        query: { perPage = 100, page = 1, sort = 'email', orderBy = 'desc' },
      } = req;
      const { rows, count } = await getUsers({
        page,
        perPage,
        sort,
        orderBy,
      });

      return toPagination(req, rows, count, origin);
    }),
  );

  return app;
};

module.exports = { createGetUsersRoute };
