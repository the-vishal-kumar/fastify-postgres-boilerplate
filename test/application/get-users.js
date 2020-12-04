const { describe, it, before, beforeEach, after } = require('mocha');
const assert = require('assert');
const path = require('path');
const sequelizeFixtures = require('sequelize-fixtures');
const { createSequelize } = require('../../src/infra/sequelize/index.js');
const { createApplication } = require('../../src/application/index.js');

describe('Users#getUsers', () => {
  let sequelize;
  let getUsers;
  before(async () => {
    /* eslint-disable  prefer-destructuring */
    sequelize = await createSequelize();

    const application = createApplication({ sequelize });
    getUsers = application.users.getUsers;

    /* eslint-enable  prefer-destructuring */
  });

  beforeEach(() => sequelize.truncate());

  beforeEach(() =>
    sequelizeFixtures.loadFiles(
      [path.join(__dirname, '../fixtures/users.js')],
      sequelize.models,
      { log: () => {} },
    ),
  );

  after(() => sequelize.close());

  it('returns the list of users', async () => {
    const { count } = await getUsers({
      page: 1,
      perPage: 10,
      sort: 'email',
      orderBy: 'desc',
    });
    assert.equal(count, 2);
  });
});
