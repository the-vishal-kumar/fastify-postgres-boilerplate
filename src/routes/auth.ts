import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import { ApiError, conflict, forbidden, unauthenticated } from '../errors.js';
import { hashPassword, hashToken, signToken, verifyPassword, verifyToken } from '../crypto.js';
import type { Store, User } from '../store.js';
import { resetPasswordBody, signinBody, signupBody, validate } from '../validation.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    sessionId: string | null;
  }
}

const INVALID_CREDENTIALS = 'Invalid email or password';

/**
 * Accepts `Authorization: Bearer <jwt>` only when the signature and expiry
 * are valid AND the session still exists (sign-off and password reset delete
 * it). Runs as a preHandler, after body parsing and before validation, so an
 * anonymous caller gets 401 rather than a 422 that reveals the payload shape.
 */
export const authenticate =
  (store: Store, config: AppConfig) =>
  async (request: FastifyRequest): Promise<void> => {
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthenticated('Missing access token');
    if (!verifyToken(token, config.jwtSecretKey)) throw unauthenticated('Invalid access token');
    const session = await store.findSession(hashToken(token));
    if (!session) throw unauthenticated('Invalid access token');
    request.user = session.user;
    request.sessionId = session.sessionId;
  };

export const requireAdmin = (request: FastifyRequest, _reply: FastifyReply, done: (error?: Error) => void): void => {
  if (!request.user?.isAdmin) return done(forbidden('Admin access required'));
  return done();
};

export const authRoutes = (app: FastifyInstance, store: Store, config: AppConfig): void => {
  const auth = authenticate(store, config);

  const signup = async (request: FastifyRequest, isAdmin: boolean): Promise<void> => {
    const { body } = validate({ body: signupBody }, request);
    if (await store.emailExists(body.email)) throw conflict('User already exists');
    // A concurrent sign-up with the same email still fails on the unique
    // index; the error handler maps that to 409.
    await store.createUser({
      email: body.email,
      passwordHash: await hashPassword(body.password),
      firstName: body.firstName,
      lastName: body.lastName ?? '',
      isAdmin,
    });
  };

  /** Password first, role second: the role of an email is not revealed without its password. */
  const signin = async (request: FastifyRequest, asAdmin: boolean): Promise<string> => {
    const { body } = validate({ body: signinBody }, request);
    const user = await store.findUserByEmail(body.email);
    if (!user) {
      // Spend the same scrypt time as a real check so timing does not reveal registered emails.
      await hashPassword(body.password);
      throw unauthenticated(INVALID_CREDENTIALS);
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) throw unauthenticated(INVALID_CREDENTIALS);
    if (asAdmin && !user.isAdmin) throw forbidden('Admin access required');

    const ttlMinutes = asAdmin ? config.adminTokenTtlMinutes : config.userTokenTtlMinutes;
    const token = signToken(user.id, ttlMinutes * 60, config.jwtSecretKey);
    await store.createSession(user.id, hashToken(token), new Date(Date.now() + ttlMinutes * 60_000));
    return token;
  };

  app.post('/auth/signup', async (request, reply) => {
    await signup(request, false);
    return reply.code(204).send();
  });

  app.post('/auth/signup/admin', async (request, reply) => {
    if (!config.adminSignupEnabled) throw new ApiError(403, 'Admin sign-up is disabled');
    await signup(request, true);
    return reply.code(204).send();
  });

  app.post('/auth/signin', async request => ({ status: 200, data: { accessToken: await signin(request, false) } }));

  app.post('/auth/signin/admin', async request => ({
    status: 200,
    data: { accessToken: await signin(request, true) },
  }));

  app.post('/auth/signoff', { preHandler: auth }, async (request, reply) => {
    await store.deleteSession(request.sessionId as string);
    return reply.code(204).send();
  });

  /** Needs the current password, so a stolen token alone cannot take the account; ends every other session. */
  app.put('/auth/password/reset', { preHandler: auth }, async (request, reply) => {
    const { body } = validate({ body: resetPasswordBody }, request);
    const user = request.user as User;
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw unauthenticated('Current password is incorrect');
    }
    if (await verifyPassword(user.passwordHash, body.password)) {
      throw forbidden('New password cannot be same as Old password');
    }
    await store.resetPassword(user.id, request.sessionId as string, await hashPassword(body.password));
    return reply.code(204).send();
  });
};
