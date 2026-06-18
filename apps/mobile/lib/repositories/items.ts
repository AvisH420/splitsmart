import { supabase } from '../supabase';
import type { ItemCategory } from '../types';

/** One receipt line item plus who owes how much of it (in currency units). */
export type ReceiptItemWrite = {
  name: string;
  amount: number;
  category: ItemCategory;
  shares: { userId: string; amount: number }[];
};

/**
 * Persist the per-item breakdown for a receipt-scanned expense. The expense
 * itself (and its overall split) is created via save_expense first; this
 * records the line items and per-item shares into expense_items / item_shares
 * (RLS-scoped via the parent expense's group, see the Phase 4 migration).
 *
 * Best-effort detail: a failure here does not invalidate the saved expense, so
 * we surface the error but the expense (the source of truth for balances)
 * already exists.
 */
export async function saveReceiptItems(
  expenseId: string,
  items: ReceiptItemWrite[]
): Promise<void> {
  for (const item of items) {
    const { data, error } = await supabase
      .from('expense_items')
      .insert({
        expense_id: expenseId,
        name: item.name,
        amount: item.amount,
        category: item.category,
        is_ai_generated: true,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    if (item.shares.length > 0) {
      const { error: shareError } = await supabase.from('item_shares').insert(
        item.shares.map((s) => ({
          item_id: data.id,
          user_id: s.userId,
          share_amount: s.amount,
        }))
      );
      if (shareError) throw new Error(shareError.message);
    }
  }
}
