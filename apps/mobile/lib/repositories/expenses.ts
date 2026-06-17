import { supabase } from '../supabase';
import type { ComputedShare } from '../splits';
import type {
  Expense,
  ExpenseCategory,
  ExpenseParticipant,
  SplitType,
} from '../types';
import { unwrap, unwrapList } from './util';

/**
 * Input for creating or editing an expense. `participants` carries the
 * already-resolved split (see lib/splits.ts `computeSplit`) so this layer
 * only persists; it never decides how a total is divided.
 */
export type SaveExpenseInput = {
  /** Omit / null to create; provide to update an existing expense. */
  expenseId?: string | null;
  groupId: string;
  paidBy: string;
  title: string;
  totalAmount: number;
  currency?: string;
  splitType: SplitType;
  /** Optional category; null/omitted = uncategorised. */
  category?: ExpenseCategory | null;
  participants: ComputedShare[];
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

export async function getExpense(expenseId: string): Promise<Expense> {
  return unwrap(
    await supabase.from('expenses').select('*').eq('id', expenseId).single()
  );
}

/** Participant (split) rows for a single expense. */
export async function listParticipants(
  expenseId: string
): Promise<ExpenseParticipant[]> {
  return unwrapList(
    await supabase
      .from('expense_participants')
      .select('*')
      .eq('expense_id', expenseId)
      .order('created_at', { ascending: true })
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
 * Create or update an expense and its split in one transaction via the
 * save_expense RPC. The RPC validates membership and that the shares
 * reconcile to the total, so a bad split can never leave a half-written
 * expense (the Phase 1 hazard this replaces).
 */
export async function saveExpense(input: SaveExpenseInput): Promise<Expense> {
  const {
    expenseId = null,
    groupId,
    paidBy,
    title,
    totalAmount,
    currency = 'INR',
    splitType,
    category = null,
    participants,
  } = input;

  if (participants.length === 0) {
    throw new Error('An expense needs at least one participant');
  }

  return unwrap(
    await supabase.rpc('save_expense', {
      p_expense_id: expenseId,
      p_group_id: groupId,
      p_paid_by: paidBy,
      p_title: title.trim(),
      p_total_amount: totalAmount,
      p_currency: currency,
      p_split_type: splitType,
      p_category: category,
      p_participants: participants.map((p) => ({
        user_id: p.userId,
        share_amount: p.shareAmount,
        split_value: p.splitValue,
      })),
    })
  );
}

export async function deleteExpense(expenseId: string): Promise<void> {
  // expense_participants cascade-delete via the FK.
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  if (error) throw new Error(error.message);
}
