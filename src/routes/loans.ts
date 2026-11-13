import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import { toCents } from '../money.js';
import type { Store, User } from '../store.js';
import { checkLoanRequest, idParams, loanRequestBody, paymentBody, validate } from '../validation.js';
import { authenticate, requireAdmin } from './auth.js';

export const loanRoutes = (app: FastifyInstance, store: Store, config: AppConfig): void => {
  const auth = authenticate(store, config);
  const owner = (user: User | null): string => (user as User).id;

  app.post('/loan', { preHandler: auth }, async (request, reply) => {
    const { body } = validate({ body: loanRequestBody }, request);
    checkLoanRequest(body);
    const id = await store.createLoan(owner(request.user), toCents(body.amount), body.term);
    return reply.code(201).send({ status: 201, data: { id } });
  });

  app.get('/loan', { preHandler: auth }, async request => ({
    status: 200,
    data: await store.listLoans(owner(request.user)),
  }));

  app.get('/loan/:id', { preHandler: auth }, async request => {
    const { params } = validate({ params: idParams }, request);
    return { status: 200, data: await store.getLoan(owner(request.user), params.id.toLowerCase()) };
  });

  app.put('/loan/:id/approve', { preHandler: [auth, requireAdmin] }, async (request, reply) => {
    const { params } = validate({ params: idParams }, request);
    await store.approveLoan(owner(request.user), params.id.toLowerCase());
    return reply.code(204).send();
  });

  app.put('/loan/:id/repayment', { preHandler: auth }, async (request, reply) => {
    const { params, body } = validate({ params: idParams, body: paymentBody }, request);
    await store.pay(owner(request.user), params.id.toLowerCase(), toCents(body.amount));
    return reply.code(204).send();
  });
};
