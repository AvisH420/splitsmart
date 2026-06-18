import type { ExpenseCategory } from './types';

/**
 * Display metadata for expense categories. Single source of truth for the
 * category picker (expense form), the detail-screen badge, and the list
 * filter chips. Pure data - no I/O. Iconography is handled with Feather icons
 * at the call site; no emoji.
 */
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'accommodation', label: 'Stay' },
  { value: 'entertainment', label: 'Fun' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'health', label: 'Health' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
];

const BY_VALUE = new Map(EXPENSE_CATEGORIES.map((c) => [c.value, c]));

/** Human label for a category, or null for an uncategorised expense. */
export function categoryLabel(category: ExpenseCategory | null): string | null {
  if (!category) return null;
  return BY_VALUE.get(category)?.label ?? category;
}
