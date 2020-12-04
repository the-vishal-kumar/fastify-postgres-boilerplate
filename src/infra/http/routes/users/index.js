const { createGetUsersRoute } = require('./getUsers');
const { createGetUserByEmailRoute } = require('./getUserByEmail');
const { createAddUserRoute } = require('./addUser');

const createUsersRoute = (app, options, done) => {
  createGetUsersRoute({ app, ...options });
  createGetUserByEmailRoute({ app, ...options });
  createAddUserRoute({ app, ...options });

  done();
};

module.exports = { createUsersRoute };
