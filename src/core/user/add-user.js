const { UniqueConstraintError } = require('sequelize');
const { EmailAlreadyExistsError } = require('../../common/errors.js');

const createAddUser = ({ sequelize }) => {
  const {
    models: { User },
  } = sequelize;

  const addUser = async ({ email }) => {
    try {
      const user = await User.create({
        email,
      });
      return {
        email: user.email,
        userId: user.userId,
      };
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new EmailAlreadyExistsError();
      }
      throw error;
    }
  };
  return addUser;
};

module.exports = { createAddUser };
