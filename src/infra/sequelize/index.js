const Sequelize = require('sequelize');
const { createUserModel } = require('./models/user');
const { createRateLimitsModel } = require('./models/ratelimits');

const { config } = require('./config.js');

const createSequelize = async ({
  url,
  sync,
  logging,
  operatorsAliases,
  ssl,
  dialectOptions,
} = config) => {
  // initialize the connection
  const sequelize = new Sequelize(url, {
    dialect: 'postgres',
    logging,
    operatorsAliases,
    ssl,
    dialectOptions,
  });

  // create models
  const User = createUserModel(sequelize, Sequelize);
  const RateLimits = createRateLimitsModel(sequelize, Sequelize);

  const models = {
    User,
    RateLimits,
  };

  // associate models
  Object.values(models).forEach(model => {
    if (typeof model.associate !== 'function') {
      return;
    }
    model.associate(models);
  });

  if (sync) {
    await sequelize.sync({ force: true });
  }

  return {
    db: sequelize,
    models,
    close: () => sequelize.connectionManager.close(),
    truncate: async () => {
      await User.truncate({ cascade: true });
      await Promise.all(
        Object.values(models)
          // truncating HC and Driver (with a cascade) in parallel introduces deadlocks,
          .filter(m => ![User].includes(m))
          .map(model => model.truncate({ cascade: true })),
      );
    },
  };
};

module.exports = {
  createSequelize,
};
