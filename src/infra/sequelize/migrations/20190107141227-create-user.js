module.exports = {
  up: (queryInterface, { STRING, INTEGER }) =>
    queryInterface.createTable('User', {
      userId: {
        allowNull: false,
        primaryKey: true,
        type: INTEGER,
        autoIncrement: true,
      },
      email: {
        type: STRING,
        allowNull: false,
        unique: true,
      },
    }),
  down: queryInterface => queryInterface.dropTable('User'),
};
