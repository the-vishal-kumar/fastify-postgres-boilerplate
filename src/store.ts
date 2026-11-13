import { RETRY, conflict, forbidden, notFound } from './errors.js';
import { inTransaction, type Db } from './db.js';
import { applyPayment, fromCents, splitCents } from './money.js';
import { newId } from './crypto.js';

export type LoanStatus = 'PENDING' | 'APPROVED' | 'PAID';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
}

export interface RepaymentView {
  id: string;
  loanId: string;
  dueAmount: number;
  paidAmount: number;
  isLast: boolean;
  status: 'PENDING' | 'PAID';
  dueDate: string;
  createdAt: number;
  updatedAt: number;
}

export interface LoanView {
  id: string;
  userId: string;
  amount: number;
  term: number;
  status: LoanStatus;
  createdAt: number;
  updatedAt: number;
  repayments: RepaymentView[];
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  is_admin: boolean;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  isAdmin: row.is_admin,
});

interface LoanRow {
  id: string;
  user_id: string;
  amount_cents: number;
  term: number;
  status: LoanStatus;
  created_at: number;
  updated_at: number;
}

interface RepaymentRow {
  id: string;
  loan_id: string;
  due_cents: number;
  paid_cents: number;
  is_last: boolean;
  status: 'PENDING' | 'PAID';
  due_date: Date;
  created_at: number;
  updated_at: number;
}

const LOAN_COLUMNS = `id, user_id, amount_cents, term, status,
  extract(epoch FROM created_at)::bigint AS created_at, extract(epoch FROM updated_at)::bigint AS updated_at`;
const REPAYMENT_COLUMNS = `id, loan_id, due_cents, paid_cents, is_last, status, due_date,
  extract(epoch FROM created_at)::bigint AS created_at, extract(epoch FROM updated_at)::bigint AS updated_at`;

const toLoanView = (loan: LoanRow, repayments: RepaymentRow[]): LoanView => ({
  id: loan.id,
  userId: loan.user_id,
  amount: fromCents(loan.amount_cents),
  term: loan.term,
  status: loan.status,
  createdAt: loan.created_at,
  updatedAt: loan.updated_at,
  repayments: repayments.map(row => ({
    id: row.id,
    loanId: row.loan_id,
    dueAmount: fromCents(row.due_cents),
    paidAmount: fromCents(row.paid_cents),
    isLast: row.is_last,
    status: row.status,
    dueDate: row.due_date.toISOString(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })),
});

/** UTC midnight `weeks` weeks from now. */
const dueDate = (weeks: number, now = new Date()): Date => {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 7 * weeks);
  return date;
};

/**
 * All SQL lives here. Queries are parameterised; ownership and state rules
 * that need a consistent read run inside the same transaction as the write.
 */
export class Store {
  constructor(readonly db: Db) {}

  async ping(): Promise<void> {
    await this.db.query('SELECT 1');
  }

  async emailExists(email: string): Promise<boolean> {
    const { rowCount } = await this.db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
    return (rowCount ?? 0) > 0;
  }

  /** Throws a unique violation (mapped to 409) if the email is taken in any letter case. */
  async createUser(user: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    isAdmin: boolean;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, is_admin)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId(), user.email, user.passwordHash, user.firstName, user.lastName, user.isAdmin],
    );
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      'SELECT id, email, password_hash, is_admin FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  /** Records a session by token hash and drops the user's expired ones. */
  async createSession(userId: string, tokenHash: string, validTill: Date): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE user_id = $1 AND valid_till <= now()', [userId]);
    await this.db.query('INSERT INTO sessions (id, user_id, token_hash, valid_till) VALUES ($1, $2, $3, $4)', [
      newId(),
      userId,
      tokenHash,
      validTill,
    ]);
  }

  /** The live session for a token hash, with its user. */
  async findSession(tokenHash: string): Promise<{ sessionId: string; user: User } | null> {
    const { rows } = await this.db.query<UserRow & { session_id: string }>(
      `SELECT s.id AS session_id, u.id, u.email, u.password_hash, u.is_admin
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.valid_till > now()`,
      [tokenHash],
    );
    const row = rows[0];
    return row ? { sessionId: row.session_id, user: toUser(row) } : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  /** New password hash and every other session ended, atomically. */
  async resetPassword(userId: string, keepSessionId: string, passwordHash: string): Promise<void> {
    await inTransaction(this.db, async tx => {
      await tx.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [userId, passwordHash]);
      await tx.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, keepSessionId]);
    });
  }

  /** The loan and its whole schedule, in one transaction. */
  async createLoan(userId: string, amountCents: number, term: number): Promise<string> {
    const loanId = newId();
    const dues = splitCents(amountCents, term);
    await inTransaction(this.db, async tx => {
      await tx.query('INSERT INTO loans (id, user_id, amount_cents, term) VALUES ($1, $2, $3, $4)', [
        loanId,
        userId,
        amountCents,
        term,
      ]);
      await tx.query(
        `INSERT INTO repayments (id, loan_id, seq, due_cents, is_last, due_date)
         SELECT gen_random_uuid(), $1, seq, due, seq = $2, due_date
           FROM unnest($3::bigint[], $4::timestamptz[]) WITH ORDINALITY AS t(due, due_date, seq)`,
        [loanId, term, dues, dues.map((_, index) => dueDate(index + 1))],
      );
    });
    return loanId;
  }

  async listLoans(userId: string): Promise<LoanView[]> {
    const loans = (
      await this.db.query<LoanRow>(
        `SELECT ${LOAN_COLUMNS} FROM loans WHERE user_id = $1 ORDER BY loans.created_at, loans.id`,
        [userId],
      )
    ).rows;
    if (!loans.length) return [];
    // One query for every schedule instead of one per loan.
    const repayments = (
      await this.db.query<RepaymentRow & { seq: number }>(
        `SELECT ${REPAYMENT_COLUMNS} FROM repayments WHERE loan_id = ANY($1::uuid[]) ORDER BY loan_id, seq`,
        [loans.map(loan => loan.id)],
      )
    ).rows;
    const byLoan = new Map<string, RepaymentRow[]>();
    for (const row of repayments) byLoan.set(row.loan_id, [...(byLoan.get(row.loan_id) ?? []), row]);
    return loans.map(loan => toLoanView(loan, byLoan.get(loan.id) ?? []));
  }

  /** A loan the caller owns; another customer's loan is 403, as the reference API answers. */
  async getLoan(userId: string, loanId: string): Promise<LoanView> {
    const loan = (await this.db.query<LoanRow>(`SELECT ${LOAN_COLUMNS} FROM loans WHERE id = $1`, [loanId])).rows[0];
    if (!loan) throw notFound('Loan not found');
    if (loan.user_id !== userId) throw forbidden();
    const repayments = (
      await this.db.query<RepaymentRow>(`SELECT ${REPAYMENT_COLUMNS} FROM repayments WHERE loan_id = $1 ORDER BY seq`, [
        loanId,
      ])
    ).rows;
    return toLoanView(loan, repayments);
  }

  /**
   * The checks give precise errors; the conditional UPDATE is what makes two
   * concurrent approvals safe: only one can move the loan out of PENDING.
   */
  async approveLoan(adminId: string, loanId: string): Promise<void> {
    const loan = (
      await this.db.query<{ user_id: string; status: LoanStatus }>('SELECT user_id, status FROM loans WHERE id = $1', [
        loanId,
      ])
    ).rows[0];
    if (!loan) throw notFound('Loan not found');
    if (loan.user_id === adminId) throw forbidden('Cannot approve your own loan request');
    if (loan.status !== 'PENDING') throw forbidden('Cannot approve an already approved or paid loan');
    const { rowCount } = await this.db.query(
      `UPDATE loans SET status = 'APPROVED', approved_by = $2, updated_at = now()
        WHERE id = $1 AND status = 'PENDING'`,
      [loanId, adminId],
    );
    if (rowCount !== 1) throw conflict(RETRY);
  }

  /**
   * Concurrency: the loan row is locked (SELECT ... FOR UPDATE) for the whole
   * transaction, so payments on one loan run one after another. A second
   * payment waits, then reads the schedule the first one committed: money is
   * never applied twice and never lost.
   */
  async pay(userId: string, loanId: string, amountCents: number): Promise<void> {
    await inTransaction(this.db, async tx => {
      const loan = (
        await tx.query<{ user_id: string; status: LoanStatus; amount_cents: number }>(
          'SELECT user_id, status, amount_cents FROM loans WHERE id = $1 FOR UPDATE',
          [loanId],
        )
      ).rows[0];
      if (!loan) throw notFound('Loan not found');
      if (loan.user_id !== userId) throw forbidden();
      if (loan.status !== 'APPROVED') throw forbidden('Cannot make payment on Pending or Paid loan');
      if (amountCents > loan.amount_cents) throw forbidden('Cannot make a payment more than loan amount');

      const pending = (
        await tx.query<{ id: string; due_cents: number; paid_cents: number }>(
          `SELECT id, due_cents, paid_cents FROM repayments WHERE loan_id = $1 AND status = 'PENDING' ORDER BY seq`,
          [loanId],
        )
      ).rows.map(row => ({ id: row.id, dueCents: row.due_cents, paidCents: row.paid_cents }));

      const outcome = applyPayment(pending, amountCents);
      if (!outcome.ok) {
        throw forbidden(
          {
            'none-pending': 'Loan has no pending repayments',
            'below-due': 'Cannot make a payment less than due amount',
            'above-balance': 'Cannot make a payment more than total due amount',
          }[outcome.reason],
        );
      }

      await tx.query(
        `UPDATE repayments r
            SET due_cents = c.due, paid_cents = c.paid, updated_at = now(),
                status = CASE WHEN c.due = 0 THEN 'PAID'::repayment_status ELSE 'PENDING'::repayment_status END
           FROM unnest($1::uuid[], $2::bigint[], $3::bigint[]) AS c(id, due, paid)
          WHERE r.id = c.id`,
        [
          outcome.changes.map(change => change.id),
          outcome.changes.map(change => change.dueCents),
          outcome.changes.map(change => change.paidCents),
        ],
      );
      await tx.query(
        `UPDATE loans SET updated_at = now(), status = CASE WHEN $2 THEN 'PAID'::loan_status ELSE status END WHERE id = $1`,
        [loanId, outcome.paidOff],
      );
    });
  }
}
