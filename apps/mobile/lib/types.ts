/**
 * Hand-written types for the Phase 1 schema.
 *
 * These are kept in sync with supabase/migrations by hand for now. Once
 * the local/cloud DB is reachable, regenerate the authoritative types with:
 *
 *   supabase gen types typescript --local > apps/mobile/lib/database.types.ts
 *
 * and re-export the row types from there. We do not commit generated types
 * yet because the Supabase project URL/key are not wired up in this env.
 */

export type GroupRole = 'owner' | 'member';

export type ExpenseStatus = 'draft' | 'needs_review' | 'confirmed';

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';

export type Profile = {
  id: string;
  email: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type Group = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  role: GroupRole;
  is_vegetarian: boolean;
  drinks_alcohol: boolean;
  created_at: string;
};

/** A group member joined with their profile, as the UI usually wants it. */
export type GroupMemberWithProfile = GroupMember & {
  profile: Pick<Profile, 'id' | 'display_name' | 'email'>;
};

export type Expense = {
  id: string;
  group_id: string;
  paid_by: string;
  title: string;
  total_amount: number;
  currency: string;
  status: ExpenseStatus;
  split_type: SplitType;
  created_at: string;
};

export type ExpenseParticipant = {
  id: string;
  expense_id: string;
  user_id: string;
  share_amount: number;
  created_at: string;
};

export type Settlement = {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount: number;
  note: string | null;
  created_at: string;
};

/** Net position of one member in a group: positive => others owe them. */
export type MemberBalance = {
  userId: string;
  displayName: string;
  /** paid - owed + settlementsPaid - settlementsReceived, rounded to cents. */
  net: number;
};

/** A suggested "who pays whom" transfer to settle the group. */
export type SettlementSuggestion = {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
};
