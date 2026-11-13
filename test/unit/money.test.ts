import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPayment, fromCents, hasCentPrecision, splitCents, toCents } from '../../src/money.js';

describe('money', () => {
  it('splits so the last instalment absorbs the remainder and the sum is exact', () => {
    assert.deepEqual(splitCents(1_000_000, 3), [333_333, 333_333, 333_334]);
    assert.deepEqual(splitCents(10_000, 7), [1428, 1428, 1428, 1428, 1428, 1428, 1432]);
    assert.deepEqual(splitCents(7, 7), [1, 1, 1, 1, 1, 1, 1]);
    assert.deepEqual(splitCents(123_456, 1), [123_456]);
    for (const [cents, term] of [
      [99_999, 13],
      [100_000_000_000, 520],
      [520, 520],
    ] as const) {
      assert.equal(
        splitCents(cents, term).reduce((sum, value) => sum + value, 0),
        cents,
      );
    }
  });

  it('converts between amounts and cents without drift', () => {
    assert.equal(toCents(3333.33), 333_333);
    assert.equal(toCents(0.1 + 0.2), 30);
    assert.equal(fromCents(333_334), 3333.34);
    assert.equal(hasCentPrecision(10.1), true);
    assert.equal(hasCentPrecision(10.005), false);
    assert.equal(hasCentPrecision(30.001), false);
  });

  it('applies a payment to the oldest instalments first and carries the surplus', () => {
    const pending = [
      { id: 'a', dueCents: 3000, paidCents: 0 },
      { id: 'b', dueCents: 3000, paidCents: 0 },
      { id: 'c', dueCents: 3000, paidCents: 0 },
    ];
    assert.deepEqual(applyPayment(pending, 4500), {
      ok: true,
      changes: [
        { id: 'a', dueCents: 0, paidCents: 3000 },
        { id: 'b', dueCents: 1500, paidCents: 1500 },
      ],
      paidOff: false,
    });
    assert.deepEqual(applyPayment(pending, 9000), {
      ok: true,
      changes: pending.map(({ id }) => ({ id, dueCents: 0, paidCents: 3000 })),
      paidOff: true,
    });
  });

  it('refuses less than the next instalment, more than the balance, and nothing pending', () => {
    const pending = [{ id: 'a', dueCents: 1500, paidCents: 1500 }];
    assert.deepEqual(applyPayment(pending, 1000), { ok: false, reason: 'below-due' });
    assert.deepEqual(applyPayment(pending, 1501), { ok: false, reason: 'above-balance' });
    assert.deepEqual(applyPayment([], 100), { ok: false, reason: 'none-pending' });
    assert.equal(applyPayment(pending, 1500).ok, true);
  });
});
