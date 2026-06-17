import { equalSplit } from './balances';
import type { SplitType } from './types';

/**
 * Pure split math. Given a total, a split type, and per-participant inputs,
 * resolve the currency `shareAmount` each person owes — always summing
 * exactly to the total in integer cents — plus the raw `splitValue` to
 * persist so the edit form can be re-hydrated later.
 *
 * No I/O here: screens compute the split, validate it, then hand the result
 * to the expenses repository / save_expense RPC.
 */

/** Avoid floating-point drift by working in integer cents. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}
function fromCents(cents: number): number {
  return cents / 100;
}

/** One participant's input. `value` is interpreted per split type:
 *   equal      -> ignored
 *   exact      -> the exact amount they owe
 *   percentage -> their percentage (0-100)
 *   shares     -> their integer share weight
 */
export type SplitInput = {
  userId: string;
  value?: number;
};

export type ComputedShare = {
  userId: string;
  /** Resolved currency amount owed. */
  shareAmount: number;
  /** Raw input to persist (null for equal splits). */
  splitValue: number | null;
};

/**
 * Distribute `totalCents` across positive `weights` proportionally, handing
 * the leftover cent(s) to the largest fractional remainders so the result
 * sums exactly to `totalCents`. Used for percentage and shares splits.
 */
function distributeByWeights(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum <= 0) return weights.map(() => 0);

  const raw = weights.map((w) => (totalCents * w) / sum);
  const floored = raw.map(Math.floor);
  let remainder = totalCents - floored.reduce((a, c) => a + c, 0);

  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < remainder && k < byFraction.length; k++) {
    floored[byFraction[k].i] += 1;
  }
  return floored;
}

/**
 * Resolve a split into per-participant share amounts.
 * Assumes inputs have already passed validateSplit for exact/percentage.
 */
export function computeSplit(
  splitType: SplitType,
  totalAmount: number,
  inputs: SplitInput[]
): ComputedShare[] {
  const totalCents = toCents(totalAmount);

  switch (splitType) {
    case 'equal': {
      const shares = equalSplit(totalAmount, inputs.length);
      return inputs.map((p, i) => ({
        userId: p.userId,
        shareAmount: shares[i] ?? 0,
        splitValue: null,
      }));
    }
    case 'exact': {
      return inputs.map((p) => ({
        userId: p.userId,
        shareAmount: fromCents(toCents(p.value ?? 0)),
        splitValue: p.value ?? 0,
      }));
    }
    case 'percentage': {
      const cents = distributeByWeights(
        totalCents,
        inputs.map((p) => p.value ?? 0)
      );
      return inputs.map((p, i) => ({
        userId: p.userId,
        shareAmount: fromCents(cents[i]),
        splitValue: p.value ?? 0,
      }));
    }
    case 'shares': {
      const cents = distributeByWeights(
        totalCents,
        inputs.map((p) => p.value ?? 0)
      );
      return inputs.map((p, i) => ({
        userId: p.userId,
        shareAmount: fromCents(cents[i]),
        splitValue: p.value ?? 0,
      }));
    }
  }
}

/**
 * Validate a split, returning a human-readable error string or null if OK.
 * Mirrors the server-side reconciliation check so the user gets immediate
 * feedback before the save_expense RPC rejects the write.
 */
export function validateSplit(
  splitType: SplitType,
  totalAmount: number,
  inputs: SplitInput[]
): string | null {
  if (inputs.length === 0) return 'Select at least one participant.';

  switch (splitType) {
    case 'equal':
      return null;

    case 'exact': {
      const sumCents = inputs.reduce((a, p) => a + toCents(p.value ?? 0), 0);
      const diff = sumCents - toCents(totalAmount);
      if (diff !== 0) {
        const off = fromCents(Math.abs(diff));
        return diff > 0
          ? `Exact amounts are over by ${off.toFixed(2)}.`
          : `Exact amounts are short by ${off.toFixed(2)}.`;
      }
      return null;
    }

    case 'percentage': {
      const sum = inputs.reduce((a, p) => a + (p.value ?? 0), 0);
      // Allow a hair of float slack; percentages rarely land exact otherwise.
      if (Math.abs(sum - 100) > 0.01) {
        return `Percentages must add up to 100 (currently ${sum.toFixed(2)}).`;
      }
      return null;
    }

    case 'shares': {
      const sum = inputs.reduce((a, p) => a + (p.value ?? 0), 0);
      if (sum <= 0) return 'Assign at least one share.';
      if (inputs.some((p) => (p.value ?? 0) < 0)) return 'Shares cannot be negative.';
      return null;
    }
  }
}
