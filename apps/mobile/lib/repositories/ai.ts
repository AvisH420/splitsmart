import { supabase } from '../supabase';
import type {
  ExpenseSearchResult,
  MemoryMatch,
  ParseExpenseResult,
  ReceiptParseResult,
} from '../types';

/**
 * All calls to the AI Edge Functions live here — screens never invoke
 * functions directly. supabase.functions.invoke attaches the signed-in user's
 * JWT automatically, so each function runs under that user's RLS context.
 */

/** Unwrap a functions.invoke result, throwing the function's error message. */
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Edge Functions return { error } with a non-2xx status; surface it.
    const message =
      (data as { error?: string } | null)?.error ?? error.message;
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

/** Feature 1: parse a natural-language prompt into a reviewable expense. */
export async function parseExpense(
  groupId: string,
  prompt: string,
  members: { id: string; name: string }[]
): Promise<ParseExpenseResult> {
  return invoke<ParseExpenseResult>('parse-expense', {
    prompt,
    group_id: groupId,
    members,
  });
}

/** Feature 2: store a group memory (embedding generated server-side). */
export async function upsertMemory(input: {
  groupId: string;
  userId: string;
  content: string;
  memoryType: string;
}): Promise<{ id: string }> {
  return invoke<{ id: string }>('upsert-memory', {
    group_id: input.groupId,
    user_id: input.userId,
    content: input.content,
    memory_type: input.memoryType,
  });
}

/** Feature 2: semantic retrieval of the most relevant memories for a query. */
export async function retrieveMemories(
  groupId: string,
  query: string,
  limit = 5
): Promise<MemoryMatch[]> {
  const data = await invoke<{ memories: MemoryMatch[] }>('retrieve-memories', {
    group_id: groupId,
    query,
    limit,
  });
  return data.memories;
}

/** Feature 3: natural-language expense search. */
export async function searchExpenses(
  groupId: string,
  query: string
): Promise<ExpenseSearchResult> {
  return invoke<ExpenseSearchResult>('search-expenses', {
    group_id: groupId,
    query,
  });
}

/** Feature 4: parse a receipt image into line items. */
export async function parseReceipt(input: {
  groupId: string;
  imageBase64: string;
  imageMimeType: string;
  context?: string;
}): Promise<ReceiptParseResult> {
  return invoke<ReceiptParseResult>('parse-receipt', {
    group_id: input.groupId,
    image_base64: input.imageBase64,
    image_mime_type: input.imageMimeType,
    context: input.context ?? null,
  });
}
