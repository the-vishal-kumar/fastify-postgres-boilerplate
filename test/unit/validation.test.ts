import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/errors.js';
import {
  checkLoanRequest,
  idParams,
  loanRequestBody,
  paymentBody,
  signupBody,
  validate,
} from '../../src/validation.js';

const errorsOf = (run: () => unknown): string[] => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 422);
    return error.errors ?? [];
  }
  assert.fail('expected a validation error');
};

describe('validation', () => {
  it('trims and lower-cases the email and keeps the password as typed', () => {
    const { body } = validate(
      { body: signupBody },
      { body: { email: '  Ada@Example.COM ', password: ' secret pw ', firstName: ' Ada ' } },
    );
    assert.deepEqual(body, { email: 'ada@example.com', password: ' secret pw ', firstName: 'Ada' });
  });

  for (const [body, message] of [
    [{ password: 'password123', firstName: 'A' }, '"email" is required'],
    [{ email: 'not-an-email', password: 'password123', firstName: 'A' }, '"email" must be a valid email'],
    [
      { email: 'a@example.com', password: 'short', firstName: 'A' },
      '"password" length must be at least 8 characters long',
    ],
    [{ email: 'a@example.com', password: 'password123', firstName: '' }, '"firstName" is not allowed to be empty'],
    [{ email: 'a@example.com', password: 'password123', firstName: 7 }, '"firstName" must be a string'],
    [{ email: 'a@example.com', password: 'password123', firstName: 'A', isAdmin: true }, '"isAdmin" is not allowed'],
  ] as const) {
    it(`reports ${message}`, () => {
      assert.ok(errorsOf(() => validate({ body: signupBody }, { body })).includes(message));
    });
  }

  for (const [body, message] of [
    [{ amount: 22 }, '"term" is required'],
    [{ amount: -5, term: 3 }, '"amount" must be greater than or equal to 0.01'],
    [{ amount: 0, term: 3 }, '"amount" must be greater than or equal to 0.01'],
    [{ amount: 10.005, term: 3 }, '"amount" must have no more than 2 decimal places'],
    [{ amount: 'lots', term: 3 }, '"amount" must be a number'],
    [{ amount: true, term: 3 }, '"amount" must be a number'],
    [{ amount: 1_000_000_000.01, term: 3 }, '"amount" must be less than or equal to 1000000000'],
    [{ amount: 100, term: 2.5 }, '"term" must be an integer'],
    [{ amount: 100, term: 0 }, '"term" must be greater than or equal to 1'],
    [{ amount: 100, term: 521 }, '"term" must be less than or equal to 520'],
    [{ amount: 100, term: 3, status: 'APPROVED' }, '"status" is not allowed'],
  ] as const) {
    it(`reports ${message} for ${JSON.stringify(body)}`, () => {
      assert.ok(errorsOf(() => validate({ body: loanRequestBody }, { body })).includes(message));
    });
  }

  it('reports one message per field and every field at once', () => {
    assert.deepEqual(
      errorsOf(() => validate({ body: loanRequestBody }, { body: {} })),
      ['"amount" is required', '"term" is required'],
    );
  });

  it('converts numeric strings', () => {
    assert.deepEqual(validate({ body: loanRequestBody }, { body: { amount: '22', term: '7' } }).body, {
      amount: 22,
      term: 7,
    });
    assert.deepEqual(validate({ body: paymentBody }, { body: { amount: '30.5' } }).body, { amount: 30.5 });
  });

  it('needs at least one cent per week', () => {
    assert.deepEqual(
      errorsOf(() => checkLoanRequest({ amount: 0.05, term: 10 })),
      ['"amount" must be at least 0.01 per week of "term"'],
    );
    checkLoanRequest({ amount: 0.1, term: 10 });
  });

  it('rejects bodies that are not objects and malformed ids', () => {
    assert.deepEqual(
      errorsOf(() => validate({ body: paymentBody }, { body: [1] })),
      ['request body must be a JSON object'],
    );
    assert.deepEqual(
      errorsOf(() => validate({ params: idParams }, { params: { id: 'not-a-uuid' } })),
      ['"id" must be a valid GUID'],
    );
  });
});
