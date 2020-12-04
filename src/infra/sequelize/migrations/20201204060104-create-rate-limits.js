module.exports = {
  up: (queryInterface, { TEXT, INTEGER, BIGINT }) => {
    return queryInterface.createTable(
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
        uniqueKeys: {
          unique_tag: {
            customIndex: true,
            fields: ['Route', 'Source'],
          },
        },
      },
    );
  },
  down: queryInterface => {
    return queryInterface.dropTable('RateLimits');
  },
};
