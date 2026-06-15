import type {
  PostgrestResponse,
  PostgrestSingleResponse,
} from '@supabase/supabase-js';

/**
 * Unwrap a Supabase single-row response, throwing on error so callers can
 * rely on a single try/catch. Typed against PostgrestSingleResponse so the
 * generic infers the row type cleanly (a bare `{ data: T | null }` makes the
 * inferrer collapse T to `null` from the failure branch of the union).
 */
export function unwrap<T>(result: PostgrestSingleResponse<T>): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** Unwrap a Supabase list response, returning [] when there are no rows. */
export function unwrapList<T>(result: PostgrestResponse<T>): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}
