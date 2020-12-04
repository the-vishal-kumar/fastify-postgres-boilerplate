const users = require('./data/users.js');

module.exports = {
  up: queryInterface => queryInterface.bulkInsert('User', users, {}),
  down: queryInterface => queryInterface.bulkDelete('User', null, {}),
};
