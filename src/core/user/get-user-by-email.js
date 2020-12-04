const { JobNotFoundError } = require('../../common/errors.js');

const createGetUserByEmail = ({ sequelize }) => {
  const {
    models: { User },
  } = sequelize;

  const getUserByEmail = async ({ email }) => {
    const user = User.findOne({ where: { email } });

    if (!user) {
      throw new JobNotFoundError();
    }

    return user;
  };
  return getUserByEmail;
};

module.exports = { createGetUserByEmail };
