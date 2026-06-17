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
  /** The member logging this settlement; RLS pins it to the caller. */
  recordedBy: string;
  note?: string;
};

/**
 * Record a payment from one member (fromUser, the payer) to another
 * (toUser, the receiver). Any member may record a settlement between any
 * two members; RLS requires recorded_by to be the current user and both
 * parties to belong to the group.
 */
export async function createSettlement(input: NewSettlementInput): Promise<Settlement> {
  const { groupId, fromUser, toUser, amount, recordedBy, note } = input;
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
        recorded_by: recordedBy,
        note: note?.trim() || null,
      })
      .select('*')
      .single()
  );
}

export async function deleteSettlement(settlementId: string): Promise<void> {
  const { error } = await supabase.from('settlements').delete().eq('id', settlementId);
  if (error) throw new Error(error.message);
}
