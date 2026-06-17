import type { ExpenseCategory } from './types';

/**
 * Display metadata for expense categories. Single source of truth for the
 * category picker (expense form), the detail-screen badge, and the list
 * filter chips. Pure data — no I/O.
 */
export const EXPENSE_CATEGORIES: {
  value: ExpenseCategory;
  label: string;
  icon: string;
}[] = [
  { value: 'food', label: 'Food', icon: '🍽️' },
  { value: 'transport', label: 'Transport', icon: '🚗' },
  { value: 'accommodation', label: 'Stay', icon: '🏠' },
  { value: 'entertainment', label: 'Fun', icon: '🎉' },
  { value: 'utilities', label: 'Utilities', icon: '💡' },
  { value: 'health', label: 'Health', icon: '⚕️' },
  { value: 'shopping', label: 'Shopping', icon: '🛍️' },
  { value: 'other', label: 'Other', icon: '📌' },
];

const BY_VALUE = new Map(EXPENSE_CATEGORIES.map((c) => [c.value, c]));

/** Human label for a category, or null for an uncategorised expense. */
export function categoryLabel(category: ExpenseCategory | null): string | null {
  if (!category) return null;
  return BY_VALUE.get(category)?.label ?? category;
}

/** Icon for a category, or empty string if unknown/null. */
export function categoryIcon(category: ExpenseCategory | null): string {
  if (!category) return '';
  return BY_VALUE.get(category)?.icon ?? '';
}
