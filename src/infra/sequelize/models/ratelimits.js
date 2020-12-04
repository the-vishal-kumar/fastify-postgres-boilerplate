const createRateLimitsModel = (sequelize, { TEXT, INTEGER, BIGINT }) => {
  const RateLimits = sequelize.define(
    'RateLimits',
    {
      Route: {
        type: TEXT,
        allowNull: false,
      },
      Source: {
        type: TEXT,
        allowNull: false,
        primaryKey: true,
      },
      Count: {
        type: INTEGER,
        allowNull: false,
      },
      TTL: {
        type: BIGINT,
        allowNull: false,
      },
    },
    {
      freezeTableName: true,
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['Route', 'Source'],
        },
      ],
    },
  );

  return RateLimits;
};

module.exports = {
  createRateLimitsModel,
};
