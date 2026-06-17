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

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'entertainment'
  | 'utilities'
  | 'health'
  | 'shopping'
  | 'other';

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export type Profile = {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
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
  profile: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url'>;
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
  /** Optional category; null = uncategorised. */
  category: ExpenseCategory | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseParticipant = {
  id: string;
  expense_id: string;
  user_id: string;
  share_amount: number;
  /** Raw split input (percent / share-weight / exact amount); null for equal. */
  split_value: number | null;
  created_at: string;
};

export type Settlement = {
  id: string;
  group_id: string;
  /** Payer. */
  from_user: string;
  /** Receiver. */
  to_user: string;
  amount: number;
  note: string | null;
  /** Member who logged the settlement (may differ from payer/receiver). */
  recorded_by: string;
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

/**
 * A single entry in the group activity feed. A discriminated union over the
 * kinds of things that happen in a group, each carrying display-ready fields.
 */
export type ActivityItem =
  | {
      kind: 'expense';
      id: string;
      at: string;
      /** True when the expense has been edited since it was created. */
      edited: boolean;
      title: string;
      amount: number;
      currency: string;
      payerName: string;
      /** Avatar of the primary actor (the payer), for the feed row. */
      avatarUrl: string | null;
    }
  | {
      kind: 'settlement';
      id: string;
      at: string;
      fromName: string;
      toName: string;
      amount: number;
      /** Set only when the recorder is neither payer nor receiver. */
      recordedByName: string | null;
      /** Avatar of the primary actor (the payer), for the feed row. */
      avatarUrl: string | null;
    }
  | {
      kind: 'member_joined';
      id: string;
      at: string;
      name: string;
      /** Avatar of the member who joined. */
      avatarUrl: string | null;
    };

/** A pending/accepted email invitation to a group. */
export type Invitation = {
  id: string;
  group_id: string;
  invited_by: string;
  email: string;
  token: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
};

/** Result of the invite_to_group RPC. */
export type InviteResult = 'added' | 'invited';
