/** Format a numeric amount as currency. Defaults to INR (the schema default). */
export function formatMoney(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Some RN engines lack full Intl currency data; fall back to a symbol-less form.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Parse a user-typed amount string into a number, or null if invalid. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}
