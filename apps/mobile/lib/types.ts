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

/** AI / group-memory enums (mirror the initial-schema + Phase 4 migration). */
export type MemoryType = 'preference' | 'rule' | 'habit';
export type MemoryStatus = 'active' | 'archived' | 'superseded';
export type MemorySource = 'user_stated' | 'ai_inferred' | 'system';
/** Per-line-item category on expense_items (initial-schema enum). */
export type ItemCategory = 'food' | 'veg' | 'non_veg' | 'alcohol' | 'other';

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

/** A user's Expo push token (one row per user). */
export type PushToken = {
  id: string;
  user_id: string;
  token: string;
  created_at: string;
  updated_at: string;
};

/** A stored group memory (preference / rule / habit) about a member or group. */
export type GroupMemory = {
  id: string;
  group_id: string;
  author_id: string;
  subject_user_id: string | null;
  memory_type: MemoryType;
  content: string;
  status: MemoryStatus;
  source: MemorySource | null;
  created_at: string;
  updated_at: string;
};

/** One AI/receipt line item belonging to an expense. */
export type ExpenseItem = {
  id: string;
  expense_id: string;
  name: string;
  quantity: number;
  unit_price: number | null;
  amount: number;
  category: ItemCategory;
  confidence: number | null;
  is_ai_generated: boolean;
  is_user_edited: boolean;
  created_at: string;
};

/** Who owes how much of a single line item. */
export type ItemShare = {
  item_id: string;
  user_id: string;
  share_amount: number;
};

// ---- AI Edge Function result shapes (returned to the app, not DB rows) ----

export type AiConfidence = 'high' | 'medium' | 'low';

/** A parsed expense from parse-expense, with names resolved to member ids. */
export type ParsedExpense = {
  title: string;
  total_amount: number;
  currency: string;
  paid_by: string;
  split_type: SplitType;
  category: ExpenseCategory | null;
  participants: { user_id: string; split_value: number | null }[];
  confidence: AiConfidence;
};

/** parse-expense returns either a parsed expense or a clarification request. */
export type ParseExpenseResult =
  | { status: 'parsed'; expense: ParsedExpense }
  | { status: 'clarification'; message: string };

/** A memory match from retrieve-memories (vector search). */
export type MemoryMatch = {
  id: string;
  content: string;
  memory_type: string;
  similarity: number;
};

/** Filters the AI extracted from a natural-language search query. */
export type SearchFilters = {
  category?: string;
  date_from?: string;
  date_to?: string;
  paid_by_name?: string;
  min_amount?: number;
  max_amount?: number;
};

export type ExpenseSearchResult = {
  expenses: Expense[];
  filters_applied: SearchFilters;
  summary: string;
};

/** A parsed receipt line item from parse-receipt. */
export type ReceiptLineItem = {
  description: string;
  amount: number;
  category: 'food' | 'drink' | 'tax' | 'service_charge' | 'other';
  is_shared: boolean;
};

export type ReceiptParseResult = {
  restaurant_name: string | null;
  total_amount: number;
  currency: string;
  line_items: ReceiptLineItem[];
  suggested_assignments: { item_description: string; suggested_for: string[] }[];
  confidence: AiConfidence;
  clarification_needed: string | null;
};
