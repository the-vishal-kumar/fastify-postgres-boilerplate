import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

/** scrypt (N=16384, r=8, p=1), stored as `<hex key>.<hex salt>`. */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64);
  return `${key.toString('hex')}.${salt}`;
};

export const verifyPassword = async (stored: string, supplied: string): Promise<boolean> => {
  const [key, salt] = stored.split('.');
  if (!key || !salt) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = await scryptAsync(supplied, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

/** SHA-256 hex of a session token: the database never holds the token itself. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const newId = (): string => randomUUID();

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

export interface TokenClaims {
  userId: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * HS256 JWTs with node:crypto. Twenty lines do not justify a dependency, and
 * accepting only the one algorithm this service signs with closes the
 * classic `alg` confusion attacks by construction.
 */
export const signToken = (userId: string, ttlSeconds: number, secret: string, now = Date.now()): string => {
  const iat = Math.floor(now / 1000);
  const claims: TokenClaims = { userId, iat, exp: iat + ttlSeconds, jti: randomUUID() };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${HEADER}.${body}`).digest('base64url');
  return `${HEADER}.${body}.${signature}`;
};

export const verifyToken = (token: string, secret: string, now = Date.now()): TokenClaims | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts as [string, string, string];
  try {
    const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8')) as { alg?: unknown };
    if (header.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret).update(`${head}.${body}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<TokenClaims>;
    if (typeof claims.userId !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp * 1000 <= now) return null;
    return claims as TokenClaims;
  } catch {
    return null;
  }
};
