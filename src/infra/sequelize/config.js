require('dotenv').config();

const {
  NODE_ENV,
  DATABASE_URL,
  TEST_DATABASE_URL,
  DATABASE_SSL,
  ROLLBAR_ACCESS_TOKEN,
  SYNC_DATABASE,
} = process.env;

const yn = require('yn');
const highlightSql = require('sequelize-log-syntax-colors');
const { format } = require('sql-formatter');
const { Op } = require('sequelize');

const env = NODE_ENV || 'development';
const url = NODE_ENV === 'test' ? TEST_DATABASE_URL : DATABASE_URL;

const operatorsAliases = Op; // https://github.com/sequelize/sequelize/issues/8417#issuecomment-355123149

const config = {
  development: {
    url,
    sync: true,
    logging: text => console.log(highlightSql(format(text))), // eslint-disable-line no-console,
    ssl: yn(DATABASE_SSL),
    dialectOptions: {
      ssl: yn(DATABASE_SSL),
    },
    rollbarAccessToken: ROLLBAR_ACCESS_TOKEN,
    reportErrorRequest: true,
  },
  test: {
    url,
    sync: SYNC_DATABASE,
    logging: false,
    operatorsAliases,
    ssl: false,
    dialectOptions: {
      ssl: false,
    },
  },
  production: {
    url,
    sync: false,
    logging: false,
    ssl: true,
    dialectOptions: {
      ssl: true,
    },
    rollbarAccessToken: ROLLBAR_ACCESS_TOKEN,
    reportErrorRequest: true,
  },
};

module.exports = config;
module.exports.config = config[env];
