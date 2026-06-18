import type {
  Expense,
  ExpenseParticipant,
  ExpensePayer,
  GroupMemberWithProfile,
  MemberBalance,
  Settlement,
  SettlementSuggestion,
} from './types';

/** Avoid floating-point drift by working in integer cents. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Compute each member's net balance purely from expenses, their splits,
 * and recorded settlements - nothing is read from a stored balance.
 *
 *   net(u) =  sum(expenses u paid)
 *           - sum(u's shares of expenses)
 *           + sum(settlements u paid out)
 *           - sum(settlements u received)
 *
 * net > 0  => the group owes u (u is a creditor)
 * net < 0  => u owes the group (u is a debtor)
 *
 * The nets always sum to ~0 (subject to rounding of individual shares).
 */
export function computeBalances(
  members: GroupMemberWithProfile[],
  expenses: Expense[],
  participants: ExpenseParticipant[],
  settlements: Settlement[],
  payers: ExpensePayer[] = []
): MemberBalance[] {
  const cents = new Map<string, number>();
  for (const m of members) cents.set(m.user_id, 0);

  const add = (userId: string, delta: number) => {
    // Tolerate ids not in `members` (e.g. a removed member) by seeding 0.
    cents.set(userId, (cents.get(userId) ?? 0) + delta);
  };

  // Group multi-payer rows by expense; an expense with payer rows credits each
  // payer their contribution instead of crediting paid_by the full total.
  const payersByExpense = new Map<string, ExpensePayer[]>();
  for (const p of payers) {
    const list = payersByExpense.get(p.expense_id);
    if (list) list.push(p);
    else payersByExpense.set(p.expense_id, [p]);
  }

  for (const e of expenses) {
    const ep = payersByExpense.get(e.id);
    if (ep && ep.length > 0) {
      for (const p of ep) add(p.user_id, toCents(p.amount));
    } else {
      add(e.paid_by, toCents(e.total_amount));
    }
  }
  for (const p of participants) add(p.user_id, -toCents(p.share_amount));
  for (const s of settlements) {
    add(s.from_user, toCents(s.amount));
    add(s.to_user, -toCents(s.amount));
  }

  return members.map((m) => ({
    userId: m.user_id,
    displayName: m.profile.display_name,
    net: fromCents(cents.get(m.user_id) ?? 0),
  }));
}

/**
 * Greedy "who pays whom" minimization: repeatedly match the largest
 * debtor against the largest creditor. Not provably minimal in pathological
 * cases, but produces a small, intuitive set of transfers for an MVP.
 */
export function suggestSettlements(
  balances: MemberBalance[]
): SettlementSuggestion[] {
  const debtors = balances
    .filter((b) => toCents(b.net) < 0)
    .map((b) => ({ ...b, cents: toCents(b.net) }))
    .sort((a, b) => a.cents - b.cents); // most negative first
  const creditors = balances
    .filter((b) => toCents(b.net) > 0)
    .map((b) => ({ ...b, cents: toCents(b.net) }))
    .sort((a, b) => b.cents - a.cents); // most positive first

  const suggestions: SettlementSuggestion[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const transfer = Math.min(-debtor.cents, creditor.cents);

    if (transfer > 0) {
      suggestions.push({
        fromUserId: debtor.userId,
        fromName: debtor.displayName,
        toUserId: creditor.userId,
        toName: creditor.displayName,
        amount: fromCents(transfer),
      });
    }

    debtor.cents += transfer;
    creditor.cents -= transfer;
    if (debtor.cents === 0) i += 1;
    if (creditor.cents === 0) j += 1;
  }

  return suggestions;
}

/**
 * Split a total equally across N people in integer cents, distributing the
 * leftover cent(s) to the first few people so the shares sum exactly to the
 * total. Returns amounts in currency units (not cents).
 */
export function equalSplit(total: number, count: number): number[] {
  if (count <= 0) return [];
  const totalCents = toCents(total);
  const base = Math.floor(totalCents / count);
  let remainder = totalCents - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return fromCents(base + extra);
  });
}
