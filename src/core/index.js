const { createUserCore } = require('./user/index.js');

const createCore = ({ sequelize }) => {
  const userCore = createUserCore({ sequelize });

  return {
    userCore,
  };
};

module.exports = { createCore };
