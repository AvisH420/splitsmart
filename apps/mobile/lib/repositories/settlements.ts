import { supabase } from '../supabase';
import type { Settlement } from '../types';
import { unwrap, unwrapList } from './util';

export async function listSettlements(groupId: string): Promise<Settlement[]> {
  return unwrapList(
    await supabase
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
  );
}

export type NewSettlementInput = {
  groupId: string;
  fromUser: string;
  toUser: string;
  amount: number;
  note?: string;
};

/**
 * Record a payment from one member to another. RLS requires from_user to be
 * the current user, so the payer records their own settlement.
 */
export async function createSettlement(input: NewSettlementInput): Promise<Settlement> {
  const { groupId, fromUser, toUser, amount, note } = input;
  if (fromUser === toUser) throw new Error('Payer and recipient must differ');
  if (amount <= 0) throw new Error('Amount must be greater than zero');

  return unwrap(
    await supabase
      .from('settlements')
      .insert({
        group_id: groupId,
        from_user: fromUser,
        to_user: toUser,
        amount,
        note: note?.trim() || null,
      })
      .select('*')
      .single()
  );
}
