/**
 * Money is stored and computed in integer cents (PostgreSQL bigint) and only
 * becomes a decimal at the edge: a JSON number with at most two decimals.
 */
export const toCents = (amount: number): number => Math.round(amount * 100);

export const fromCents = (cents: number): number => cents / 100;

/** True when `amount` has at most two decimal places. */
export const hasCentPrecision = (amount: number): boolean => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;

/**
 * Splits `cents` into `term` instalments: all equal except the last, which
 * absorbs the remainder, so they add up exactly (1000000 over 3 is
 * 333333, 333333, 333334).
 */
export const splitCents = (cents: number, term: number): number[] => {
  const base = Math.floor(cents / term);
  return [...new Array<number>(term - 1).fill(base), cents - base * (term - 1)];
};

export interface Instalment {
  id: string;
  dueCents: number;
  paidCents: number;
}

export type PaymentOutcome =
  | { ok: true; changes: Instalment[]; paidOff: boolean }
  | { ok: false; reason: 'none-pending' | 'below-due' | 'above-balance' };

/**
 * Applies a payment to the pending instalments, oldest first. Each takes as
 * much as it still owes; a surplus flows into the next one. Pure, so the
 * rules are unit tested without a database.
 */
export const applyPayment = (pending: readonly Instalment[], cents: number): PaymentOutcome => {
  const first = pending[0];
  if (!first) return { ok: false, reason: 'none-pending' };
  if (cents < first.dueCents) return { ok: false, reason: 'below-due' };
  const balance = pending.reduce((sum, instalment) => sum + instalment.dueCents, 0);
  if (cents > balance) return { ok: false, reason: 'above-balance' };

  let left = cents;
  const changes: Instalment[] = [];
  for (const instalment of pending) {
    if (left === 0) break;
    const take = Math.min(left, instalment.dueCents);
    left -= take;
    changes.push({ id: instalment.id, dueCents: instalment.dueCents - take, paidCents: instalment.paidCents + take });
  }
  const paidOff = cents === balance;
  return { ok: true, changes, paidOff };
};
