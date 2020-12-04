const { createUser } = require('./user');

const createApplication = ({ sequelize }) => {
  const users = createUser({
    sequelize,
  });

  return { users };
};

module.exports = { createApplication };
