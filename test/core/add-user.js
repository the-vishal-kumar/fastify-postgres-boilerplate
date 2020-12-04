const { describe, it, before, beforeEach, after } = require('mocha');
const assert = require('assert');
const path = require('path');
const sequelizeFixtures = require('sequelize-fixtures');
const faker = require('faker');
const { EmailAlreadyExistsError } = require('../../src/common/errors.js');
const { createSequelize } = require('../../src/infra/sequelize/index.js');
const { createCore } = require('../../src/core/index.js');

describe('Users#createUser', () => {
  let sequelize;
  let addUser;
  before(async () => {
    /* eslint-disable  prefer-destructuring */
    sequelize = await createSequelize();
    const core = createCore({ sequelize });
    addUser = core.userCore.addUser;
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

  it('throws if email already exits', async () =>
    assert.rejects(async () => {
      const email = faker.internet.email();
      await addUser({ email });
      await addUser({ email });
    }, EmailAlreadyExistsError));

  it('Add user', async () => {
    const email = faker.internet.email();
    const user = await addUser({ email });
    assert.equal(user.email, email);
  });
});
