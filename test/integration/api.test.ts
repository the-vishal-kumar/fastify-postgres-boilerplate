import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config.js';
import { createPool, type Db } from '../../src/db.js';
import { migrate } from '../../src/migrate.js';
import { Store } from '../../src/store.js';

// White-box cases the HTTP-only conformance suite cannot see: they need the
// database or the process. Each test uses fresh emails, so they share one DB.
const DATABASE_URL = process.env.DATABASE_URL;
const PASSWORD = 'password123';
// Generated per run: no secret-looking literal in the repository.
const SECRET = randomBytes(32).toString('hex');
const skip = DATABASE_URL ? false : 'DATABASE_URL is not set';

const config = (overrides: Record<string, string> = {}): AppConfig =>
  loadConfig({
    DATABASE_URL,
    JWT_SECRET_KEY: SECRET,
    ADMIN_SIGNUP_ENABLED: 'true',
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
    ...overrides,
  });

let counter = 0;
const email = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}-${counter++}@example.com`;

describe('integration', { skip }, () => {
  let pool: Db;
  let app: FastifyInstance;

  const createUser = async (admin = false): Promise<{ email: string; token: string; id: string }> => {
    const address = email(admin ? 'admin' : 'user');
    const signup = await app.inject({
      method: 'POST',
      url: admin ? '/auth/signup/admin' : '/auth/signup',
      payload: { email: address, password: PASSWORD, firstName: 'T' },
    });
    assert.equal(signup.statusCode, 204, signup.body);
    const signin = await app.inject({
      method: 'POST',
      url: admin ? '/auth/signin/admin' : '/auth/signin',
      payload: { email: address, password: PASSWORD },
    });
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [address]);
    return {
      email: address,
      token: signin.json<{ data: { accessToken: string } }>().data.accessToken,
      id: rows[0]!.id,
    };
  };

  const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

  before(async () => {
    pool = createPool(DATABASE_URL as string);
    await migrate(pool);
    app = await buildApp({ config: config(), store: new Store(pool), logger: false });
  });

  after(async () => {
    await app?.close();
    await pool?.end();
  });

  it('applies migrations once: a second run is a no-op', async () => {
    assert.deepEqual(await migrate(pool), []);
    const { rows } = await pool.query('SELECT version FROM schema_migrations');
    assert.ok(rows.some(row => row.version === '0001_init'));
  });

  it('stores only a hash of the access token', async () => {
    const { token, id } = await createUser();
    const { rows } = await pool.query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE user_id = $1', [
      id,
    ]);
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0]!.token_hash, token);
    assert.match(rows[0]!.token_hash, /^[0-9a-f]{64}$/);
  });

  it('refuses a session whose validity has passed', async () => {
    const { token, id } = await createUser();
    await pool.query("UPDATE sessions SET valid_till = now() - interval '1 second' WHERE user_id = $1", [id]);
    const response = await app.inject({ method: 'GET', url: '/loan', headers: bearer(token) });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json<{ error: string }>().error, 'Invalid access token');
  });

  it('records the approving admin', async () => {
    const admin = await createUser(true);
    const user = await createUser();
    const created = await app.inject({
      method: 'POST',
      url: '/loan',
      headers: bearer(user.token),
      payload: { amount: 30, term: 3 },
    });
    const loanId = created.json<{ data: { id: string } }>().data.id;
    const approved = await app.inject({ method: 'PUT', url: `/loan/${loanId}/approve`, headers: bearer(admin.token) });
    assert.equal(approved.statusCode, 204);
    const { rows } = await pool.query('SELECT status, approved_by, amount_cents FROM loans WHERE id = $1', [loanId]);
    assert.deepEqual(rows[0], { status: 'APPROVED', approved_by: admin.id, amount_cents: 3000 });
  });

  it('keeps the books exact when many payments race on one loan', async () => {
    const admin = await createUser(true);
    const user = await createUser();
    const created = await app.inject({
      method: 'POST',
      url: '/loan',
      headers: bearer(user.token),
      payload: { amount: 100, term: 10 },
    });
    const loanId = created.json<{ data: { id: string } }>().data.id;
    await app.inject({ method: 'PUT', url: `/loan/${loanId}/approve`, headers: bearer(admin.token) });
    const statuses = (
      await Promise.all(
        Array.from({ length: 12 }, () =>
          app.inject({
            method: 'PUT',
            url: `/loan/${loanId}/repayment`,
            headers: bearer(user.token),
            payload: { amount: 10 },
          }),
        ),
      )
    ).map(response => response.statusCode);
    // The row lock serialises them: ten fit, the other two find the loan PAID.
    assert.equal(statuses.filter(status => status === 204).length, 10, String(statuses));
    const { rows } = await pool.query<{ paid: number; due: number }>(
      'SELECT sum(paid_cents)::bigint AS paid, sum(due_cents)::bigint AS due FROM repayments WHERE loan_id = $1',
      [loanId],
    );
    assert.deepEqual(rows[0], { paid: 10_000, due: 0 });
    const loan = await pool.query('SELECT status FROM loans WHERE id = $1', [loanId]);
    assert.equal(loan.rows[0].status, 'PAID');
  });

  it('enforces the unique email index case-insensitively in the database', async () => {
    const address = email('dup');
    await pool.query("INSERT INTO users (id, email, password_hash, first_name) VALUES ($1, $2, 'x', 'A')", [
      randomUUID(),
      address,
    ]);
    await assert.rejects(
      pool.query("INSERT INTO users (id, email, password_hash, first_name) VALUES ($1, $2, 'x', 'A')", [
        randomUUID(),
        address.toUpperCase(),
      ]),
      (error: { code?: string }) => error.code === '23505',
    );
  });

  it('answers 500 with the request id and no internals when the database fails', async () => {
    const broken = createPool(DATABASE_URL as string);
    await broken.end();
    const failing = await buildApp({ config: config(), store: new Store(broken), logger: false });
    const response = await failing.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: email('boom'), password: PASSWORD, firstName: 'A' },
    });
    await failing.close();
    assert.equal(response.statusCode, 500);
    const body = response.json<{ error: string; requestId: string }>();
    assert.equal(body.error, 'An error occurred');
    assert.equal(body.requestId, response.headers['x-request-id']);
    assert.ok(!response.body.toLowerCase().includes('pool'));
  });

  it('is not ready while shutting down, or when the database is gone', async () => {
    const draining = await buildApp({
      config: config(),
      store: new Store(pool),
      lifecycle: { isShuttingDown: () => true },
      logger: false,
    });
    const response = await draining.inject({ method: 'GET', url: '/health/ready' });
    await draining.close();
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { status: 'not ready', checks: { postgres: 'ok', shutdown: 'fail' } });

    const broken = createPool(DATABASE_URL as string);
    await broken.end();
    const offline = await buildApp({ config: config(), store: new Store(broken), logger: false });
    const down = await offline.inject({ method: 'GET', url: '/health/ready' });
    const live = await offline.inject({ method: 'GET', url: '/health/live' });
    await offline.close();
    assert.equal(down.statusCode, 503);
    assert.equal(live.statusCode, 200);
  });

  it('refuses admin sign-up when ADMIN_SIGNUP_ENABLED is false', async () => {
    const closed = await buildApp({
      config: config({ ADMIN_SIGNUP_ENABLED: 'false' }),
      store: new Store(pool),
      logger: false,
    });
    const response = await closed.inject({
      method: 'POST',
      url: '/auth/signup/admin',
      payload: { email: email('admin-off'), password: PASSWORD, firstName: 'A' },
    });
    await closed.close();
    assert.equal(response.statusCode, 403);
    assert.equal(response.json<{ error: string }>().error, 'Admin sign-up is disabled');
  });

  it('rate limits sign-in per client', async () => {
    const limited = await buildApp({
      config: config({ AUTH_RATE_LIMIT_MAX: '2' }),
      store: new Store(pool),
      logger: false,
    });
    const attempt = (): Promise<LightMyRequestResponse> =>
      limited.inject({ method: 'POST', url: '/auth/signin', payload: { email: email('nobody'), password: PASSWORD } });
    assert.equal((await attempt()).statusCode, 401);
    assert.equal((await attempt()).statusCode, 401);
    const response = await attempt();
    await limited.close();
    assert.equal(response.statusCode, 429);
    assert.ok(response.headers['ratelimit-policy']);
  });
});
