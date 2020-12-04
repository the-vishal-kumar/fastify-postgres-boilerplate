const { createGetUsers } = require('./get-users');

const createUser = ({ core, sequelize }) => {
  const getUsers = createGetUsers({
    core,
    sequelize,
  });

  return {
    getUsers,
  };
};

module.exports = { createUser };
