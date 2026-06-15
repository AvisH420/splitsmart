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

import type { ExpenseStatus, GroupRole, SplitType } from './types';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string;
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
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
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
          created_at: string;
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
          created_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          user_id: string;
          share_amount: number;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount: number;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settlements']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      add_group_member_by_email: {
        Args: { p_group_id: string; p_email: string };
        Returns: Database['public']['Tables']['group_members']['Row'];
      };
    };
    Enums: {
      group_role: GroupRole;
      expense_status: ExpenseStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
