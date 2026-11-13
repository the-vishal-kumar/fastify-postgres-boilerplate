import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';
import { hashPassword, hashToken, signToken, verifyPassword, verifyToken } from '../../src/crypto.js';
import { FixedWindowLimiter } from '../../src/ratelimit.js';

const SECRET = 'a-test-secret-that-is-at-least-32-characters';

describe('tokens', () => {
  it('signs and verifies an HS256 token with the requested lifetime', () => {
    const token = signToken('user-1', 1200, SECRET);
    const claims = verifyToken(token, SECRET);
    assert.equal(claims?.userId, 'user-1');
    assert.equal((claims?.exp ?? 0) - (claims?.iat ?? 0), 1200);
  });

  it('rejects a wrong key, a tampered payload, another algorithm and an expired token', () => {
    const token = signToken('user-1', 60, SECRET);
    assert.equal(verifyToken(token, 'another-secret-that-is-at-least-32-characters'), null);
    const [head, , signature] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ userId: 'admin', exp: 9e9, iat: 0 })).toString('base64url');
    assert.equal(verifyToken(`${head}.${forgedBody}.${signature}`, SECRET), null);
    const none = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    assert.equal(verifyToken(`${none}.${token.split('.')[1]}.`, SECRET), null);
    assert.equal(verifyToken(token, SECRET, Date.now() + 61_000), null);
    assert.equal(verifyToken('not-a-jwt', SECRET), null);
  });

  it('hashes tokens with SHA-256', () => {
    assert.equal(hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('passwords', () => {
  it('round-trips scrypt hashes in the <key>.<salt> format', async () => {
    const stored = await hashPassword('password123');
    assert.match(stored, /^[0-9a-f]{128}\.[0-9a-f]{32}$/);
    assert.equal(await verifyPassword(stored, 'password123'), true);
    assert.equal(await verifyPassword(stored, 'password124'), false);
    assert.equal(await verifyPassword('garbage', 'password123'), false);
  });
});

describe('config', () => {
  const valid = { DATABASE_URL: 'postgres://u:p@h:5432/d', JWT_SECRET_KEY: SECRET };

  it('applies defaults', () => {
    const config = loadConfig(valid);
    assert.equal(config.port, 3000);
    assert.equal(config.userTokenTtlMinutes, 1440);
    assert.equal(config.adminTokenTtlMinutes, 20);
    assert.equal(config.adminSignupEnabled, false);
    assert.equal(config.trustProxy, false);
    assert.equal(config.corsOrigins, '*');
  });

  it('parses booleans, hop counts and origin lists', () => {
    const config = loadConfig({
      ...valid,
      ADMIN_SIGNUP_ENABLED: 'true',
      TRUST_PROXY: '1',
      CORS_ORIGINS: 'a.test, b.test',
    });
    assert.equal(config.adminSignupEnabled, true);
    assert.equal(config.trustProxy, 1);
    assert.deepEqual(config.corsOrigins, ['a.test', 'b.test']);
  });

  it('reports every problem at once', () => {
    assert.throws(
      () => loadConfig({ JWT_SECRET_KEY: 'short', PORT: 'x', ADMIN_SIGNUP_ENABLED: 'yes' }),
      (error: Error) =>
        ['DATABASE_URL', 'JWT_SECRET_KEY', 'PORT', 'ADMIN_SIGNUP_ENABLED'].every(name => error.message.includes(name)),
    );
  });
});

describe('rate limiter', () => {
  it('allows the limit per window, then refuses with headers, then resets', () => {
    const limiter = new FixedWindowLimiter('auth', 2, 60_000);
    const now = 1_000_000;
    assert.equal(limiter.hit('ip', now).allowed, true);
    assert.equal(limiter.hit('ip', now).allowed, true);
    const refused = limiter.hit('ip', now);
    assert.equal(refused.allowed, false);
    assert.equal(refused.headers['RateLimit-Policy'], '"auth";q=2;w=60');
    assert.equal(refused.headers['Retry-After'], '60');
    assert.equal(limiter.hit('other', now).allowed, true);
    assert.equal(limiter.hit('ip', now + 60_000).allowed, true);
    limiter.stop();
  });
});
