/**
 * Supabase `Database` type for the tables/functions the mobile app touches.
 *
 * Hand-authored to mirror supabase/migrations until the DB is reachable for
 * codegen. When it is, replace this whole file with the generated output:
 *
 *   supabase gen types typescript --local > apps/mobile/lib/database.types.ts
 *
 * Only Phase 1 tables are modelled here; the AI/memory tables from the
 * initial schema are intentionally omitted (the app does not query them yet).
 */

import type {
  ExpenseCategory,
  ExpenseStatus,
  GroupRole,
  InvitationStatus,
  ItemCategory,
  MemorySource,
  MemoryStatus,
  MemoryType,
  SplitType,
} from './types';

/** Shape of one element of save_expense's p_participants JSON array. */
export type SaveExpenseParticipant = {
  user_id: string;
  share_amount: number;
  split_value: number | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          cover_url: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
          cover_url?: string | null;
        };
        Update: Partial<Database['public']['Tables']['groups']['Insert']>;
        Relationships: [];
      };
      group_members: {
        Row: {
          group_id: string;
          user_id: string;
          role: GroupRole;
          is_vegetarian: boolean;
          drinks_alcohol: boolean;
          created_at: string;
        };
        Insert: {
          group_id: string;
          user_id: string;
          role?: GroupRole;
          is_vegetarian?: boolean;
          drinks_alcohol?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['group_members']['Insert']>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          group_id: string;
          paid_by: string;
          title: string;
          total_amount: number;
          currency: string;
          status: ExpenseStatus;
          split_type: SplitType;
          category: ExpenseCategory | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          paid_by: string;
          title: string;
          total_amount: number;
          currency?: string;
          status?: ExpenseStatus;
          split_type?: SplitType;
          category?: ExpenseCategory | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>;
        Relationships: [];
      };
      expense_participants: {
        Row: {
          id: string;
          expense_id: string;
          user_id: string;
          share_amount: number;
          split_value: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          user_id: string;
          share_amount: number;
          split_value?: number | null;
          created_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['expense_participants']['Insert']
        >;
        Relationships: [];
      };
      settlements: {
        Row: {
          id: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount: number;
          note: string | null;
          recorded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount: number;
          note?: string | null;
          recorded_by: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settlements']['Insert']>;
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          group_id: string;
          invited_by: string;
          email: string;
          token: string;
          status: InvitationStatus;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          invited_by: string;
          email: string;
          token?: string;
          status?: InvitationStatus;
          created_at?: string;
          expires_at?: string;
        };
        Update: Partial<Database['public']['Tables']['invitations']['Insert']>;
        Relationships: [];
      };
      group_memories: {
        Row: {
          id: string;
          group_id: string;
          author_id: string;
          subject_user_id: string | null;
          memory_type: MemoryType;
          content: string;
          embedding_model: string | null;
          status: MemoryStatus;
          superseded_by: string | null;
          source: MemorySource | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          author_id: string;
          subject_user_id?: string | null;
          memory_type: MemoryType;
          content: string;
          embedding_model?: string | null;
          status?: MemoryStatus;
          superseded_by?: string | null;
          source?: MemorySource | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['group_memories']['Insert']>;
        Relationships: [];
      };
      expense_items: {
        Row: {
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
        Insert: {
          id?: string;
          expense_id: string;
          name: string;
          quantity?: number;
          unit_price?: number | null;
          amount: number;
          category?: ItemCategory;
          confidence?: number | null;
          is_ai_generated?: boolean;
          is_user_edited?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['expense_items']['Insert']>;
        Relationships: [];
      };
      item_shares: {
        Row: {
          item_id: string;
          user_id: string;
          share_amount: number;
        };
        Insert: {
          item_id: string;
          user_id: string;
          share_amount: number;
        };
        Update: Partial<Database['public']['Tables']['item_shares']['Insert']>;
        Relationships: [];
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['push_tokens']['Insert']>;
        Relationships: [];
      };
      expense_payers: {
        Row: {
          id: string;
          expense_id: string;
          user_id: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          user_id: string;
          amount: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['expense_payers']['Insert']>;
        Relationships: [];
      };
      expense_comments: {
        Row: {
          id: string;
          expense_id: string;
          user_id: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          user_id: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['expense_comments']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      add_group_member_by_email: {
        Args: { p_group_id: string; p_email: string };
        Returns: Database['public']['Tables']['group_members']['Row'];
      };
      save_expense: {
        Args: {
          p_expense_id: string | null;
          p_group_id: string;
          p_paid_by: string;
          p_title: string;
          p_total_amount: number;
          p_currency: string | null;
          p_split_type: SplitType;
          p_participants: SaveExpenseParticipant[];
          p_category?: ExpenseCategory | null;
          p_payers?: { user_id: string; amount: number }[];
        };
        Returns: Database['public']['Tables']['expenses']['Row'];
      };
      invite_to_group: {
        Args: { p_group_id: string; p_email: string };
        Returns: string;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      match_group_memories: {
        Args: {
          p_group_id: string;
          query_embedding: number[];
          match_count?: number;
        };
        Returns: {
          id: string;
          content: string;
          memory_type: string;
          similarity: number;
        }[];
      };
      match_expenses: {
        Args: {
          p_group_id: string;
          query_embedding: number[];
          match_count?: number;
        };
        Returns: { id: string; similarity: number }[];
      };
    };
    Enums: {
      group_role: GroupRole;
      expense_status: ExpenseStatus;
      expense_category: ExpenseCategory;
      memory_type: MemoryType;
      memory_status: MemoryStatus;
      item_category: ItemCategory;
    };
    CompositeTypes: Record<string, never>;
  };
};
