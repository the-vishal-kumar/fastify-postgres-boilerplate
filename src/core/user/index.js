const { createGetUserByEmail } = require('./get-user-by-email.js');
const { createAddUser } = require('./add-user.js');

const createUserCore = ({ sequelize }) => {
  const getUserByEmail = createGetUserByEmail({ sequelize });
  const addUser = createAddUser({ sequelize });

  return {
    getUserByEmail,
    addUser,
  };
};

module.exports = {
  createUserCore,
};
