import { equalSplit } from '../balances';
import { supabase } from '../supabase';
import type { Expense, ExpenseParticipant, SplitType } from '../types';
import { unwrap, unwrapList } from './util';

export type NewExpenseInput = {
  groupId: string;
  paidBy: string;
  title: string;
  totalAmount: number;
  currency?: string;
  /** Members sharing the cost. */
  participantUserIds: string[];
  /**
   * Optional explicit per-user shares (userId -> amount) for unequal splits.
   * When omitted, the total is split equally across participantUserIds.
   */
  shares?: Record<string, number>;
  splitType?: SplitType;
};

export async function listExpenses(groupId: string): Promise<Expense[]> {
  return unwrapList(
    await supabase
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
  );
}

/** All participant rows for a group's expenses, for balance computation. */
export async function listParticipantsForGroup(
  groupId: string
): Promise<ExpenseParticipant[]> {
  const expenses = await listExpenses(groupId);
  if (expenses.length === 0) return [];
  return unwrapList(
    await supabase
      .from('expense_participants')
      .select('*')
      .in(
        'expense_id',
        expenses.map((e) => e.id)
      )
  );
}

/**
 * Create an expense and its participant split rows.
 *
 * NOTE: this is two writes without a DB transaction. If the participant
 * insert fails, the expense row is left with no split (so it contributes a
 * credit to the payer but no debits). For an MVP this is acceptable; the
 * proper fix is a single create_expense RPC doing both in one transaction.
 * TODO(phase-next): move to a transactional create_expense RPC.
 */
export async function createExpense(input: NewExpenseInput): Promise<Expense> {
  const {
    groupId,
    paidBy,
    title,
    totalAmount,
    currency = 'INR',
    participantUserIds,
    shares,
    splitType = 'equal',
  } = input;

  if (participantUserIds.length === 0) {
    throw new Error('An expense needs at least one participant');
  }

  const expense = unwrap(
    await supabase
      .from('expenses')
      .insert({
        group_id: groupId,
        paid_by: paidBy,
        title: title.trim(),
        total_amount: totalAmount,
        currency,
        // Manually-entered expenses are confirmed immediately; the AI
        // pipeline (later phase) is what produces 'draft'/'needs_review'.
        status: 'confirmed',
        split_type: splitType,
      })
      .select('*')
      .single()
  );

  const amounts = shares
    ? participantUserIds.map((id) => shares[id] ?? 0)
    : equalSplit(totalAmount, participantUserIds.length);

  const participantRows = participantUserIds.map((userId, i) => ({
    expense_id: expense.id,
    user_id: userId,
    share_amount: amounts[i],
  }));

  const { error } = await supabase.from('expense_participants').insert(participantRows);
  if (error) throw new Error(error.message);

  return expense;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  // expense_participants cascade-delete via the FK.
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  if (error) throw new Error(error.message);
}
