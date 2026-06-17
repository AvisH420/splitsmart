import type {
  Expense,
  ExpenseParticipant,
  GroupMemberWithProfile,
  Settlement,
} from './types';

/** Per-member contribution to the group's spending. */
export type MemberSpend = {
  userId: string;
  displayName: string;
  /** Total this member has paid for, across all expenses. */
  paid: number;
  /** Total this member's share of all expenses. */
  share: number;
};

/** Summary statistics for a group, all derived at read time. */
export type GroupSummary = {
  totalSpent: number;
  expenseCount: number;
  settlementCount: number;
  memberCount: number;
  /** Total real money moved between members via settlements. */
  totalSettled: number;
  perMember: MemberSpend[];
  /** The single largest expense, if any. */
  largestExpense: { id: string; title: string; amount: number } | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute group summary statistics from the same raw inputs the balance
 * computation uses. Nothing is read from a stored aggregate.
 */
export function computeGroupSummary(
  members: GroupMemberWithProfile[],
  expenses: Expense[],
  participants: ExpenseParticipant[],
  settlements: Settlement[]
): GroupSummary {
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  for (const m of members) {
    paid.set(m.user_id, 0);
    share.set(m.user_id, 0);
  }

  let totalSpent = 0;
  let largest: GroupSummary['largestExpense'] = null;
  for (const e of expenses) {
    totalSpent += e.total_amount;
    paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + e.total_amount);
    if (!largest || e.total_amount > largest.amount) {
      largest = { id: e.id, title: e.title, amount: e.total_amount };
    }
  }
  for (const p of participants) {
    share.set(p.user_id, (share.get(p.user_id) ?? 0) + p.share_amount);
  }

  const totalSettled = settlements.reduce((a, s) => a + s.amount, 0);

  const perMember: MemberSpend[] = members.map((m) => ({
    userId: m.user_id,
    displayName: m.profile.display_name,
    paid: round2(paid.get(m.user_id) ?? 0),
    share: round2(share.get(m.user_id) ?? 0),
  }));

  return {
    totalSpent: round2(totalSpent),
    expenseCount: expenses.length,
    settlementCount: settlements.length,
    memberCount: members.length,
    totalSettled: round2(totalSettled),
    perMember,
    largestExpense: largest,
  };
}
