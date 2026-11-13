import { z } from 'zod';
import { invalid } from './errors.js';
import { hasCentPrecision, toCents } from './money.js';

export const MAX_AMOUNT = 1_000_000_000;
export const MAX_TERM = 520;

const NUMERIC = /^\s*-?\d+(\.\d+)?\s*$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Numeric strings such as "100" are accepted and converted, as JSON clients often send them. */
const numeric = <T extends z.ZodType>(schema: T) =>
  z.preprocess(value => (typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value), schema);

const money = numeric(
  z
    .number()
    .min(0.01)
    .max(MAX_AMOUNT)
    .refine(hasCentPrecision, { params: { joi: 'must have no more than 2 decimal places' }, abort: true }),
);

const email = z.string().trim().toLowerCase().max(254).email();
const newPassword = z.string().min(8).max(128);

export const signupBody = z.strictObject({
  email,
  password: newPassword,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100).optional(),
});

export const signinBody = z.strictObject({ email, password: z.string().max(128) });

export const resetPasswordBody = z.strictObject({ currentPassword: z.string().max(128), password: newPassword });

export const loanRequestBody = z.strictObject({
  amount: money,
  term: numeric(z.number().int().min(1).max(MAX_TERM)),
});

export const paymentBody = z.strictObject({ amount: money });

export const idParams = z.object({ id: z.string().trim().regex(GUID) });

const describe = (issue: z.core.$ZodIssue): string[] => {
  const field = `"${issue.path.join('.')}"`;
  switch (issue.code) {
    case 'unrecognized_keys':
      return issue.keys.map(key => `"${key}" is not allowed`);
    case 'invalid_type':
      if (issue.input === undefined) return [`${field} is required`];
      if (issue.expected === 'int') return [`${field} must be an integer`];
      return [`${field} must be a ${issue.expected === 'object' ? 'JSON object' : issue.expected}`];
    case 'too_small':
      if (issue.origin === 'string') {
        return [
          issue.input === ''
            ? `${field} is not allowed to be empty`
            : `${field} length must be at least ${issue.minimum} characters long`,
        ];
      }
      return [`${field} must be greater than or equal to ${issue.minimum}`];
    case 'too_big':
      if (issue.origin === 'string')
        return [`${field} length must be less than or equal to ${issue.maximum} characters long`];
      return [`${field} must be less than or equal to ${issue.maximum}`];
    case 'invalid_format':
      return [issue.format === 'email' ? `${field} must be a valid email` : `${field} must be a valid GUID`];
    case 'custom':
      return [`${field} ${(issue.params as { joi?: string } | undefined)?.joi ?? 'is invalid'}`];
    default:
      return [`${field} is invalid`];
  }
};

/**
 * Turns Zod issues into the messages the API contract uses (`"amount" is
 * required`), one per field: the first problem found is the one reported.
 */
export const messages = (error: z.ZodError): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const issue of error.issues) {
    const key = issue.code === 'unrecognized_keys' ? `?${issue.keys.join(',')}` : issue.path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(...describe(issue));
  }
  return out;
};

interface RequestParts {
  params?: unknown;
  body?: unknown;
}

/**
 * Validates params and body together and returns typed, converted values;
 * throws a 422 carrying every problem. A missing body counts as `{}`.
 */
export const validate = <P extends z.ZodType | undefined, B extends z.ZodType | undefined>(
  schemas: { params?: P; body?: B },
  input: RequestParts,
): {
  params: P extends z.ZodType ? z.output<P> : undefined;
  body: B extends z.ZodType ? z.output<B> : undefined;
} => {
  const errors: string[] = [];
  const out: { params?: unknown; body?: unknown } = {};
  if (schemas.params) {
    const result = schemas.params.safeParse(input.params, { reportInput: true });
    if (result.success) out.params = result.data;
    else errors.push(...messages(result.error));
  }
  if (schemas.body) {
    const body = input.body ?? {};
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      errors.push('request body must be a JSON object');
    } else {
      const result = schemas.body.safeParse(body, { reportInput: true });
      if (result.success) out.body = result.data;
      else errors.push(...messages(result.error));
    }
  }
  if (errors.length) throw invalid(errors);
  return out as never;
};

/** Rule across fields: every weekly instalment must be at least one cent. */
export const checkLoanRequest = ({ amount, term }: { amount: number; term: number }): void => {
  if (toCents(amount) < term) throw invalid(['"amount" must be at least 0.01 per week of "term"']);
};
