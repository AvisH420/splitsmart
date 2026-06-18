import * as Print from 'expo-print';
import { suggestSettlements } from '../balances';
import { categoryLabel } from '../categories';
import { formatMoney } from '../format';
import type {
  Expense,
  Group,
  GroupMemberWithProfile,
  MemberBalance,
  Settlement,
} from '../types';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const SPLIT_LABEL: Record<string, string> = {
  equal: 'Equal',
  exact: 'Exact',
  percentage: 'Percentage',
  shares: 'Shares',
};

/**
 * Build a clean group-summary PDF and return its local file URI. Pure HTML +
 * inline styles, matching the app's warm-neutral aesthetic. No emojis.
 */
export async function generateGroupPDF(
  group: Group,
  members: GroupMemberWithProfile[],
  expenses: Expense[],
  settlements: Settlement[],
  balances: MemberBalance[]
): Promise<string> {
  const nameFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile.display_name ?? 'Unknown';

  const suggestions = suggestSettlements(balances);
  const totalSpent = expenses.reduce((a, e) => a + e.total_amount, 0);
  const sortedExpenses = [...expenses].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );

  const accent = '#8B6F47';
  const ink = '#2A241E';
  const sub = '#6E6253';
  const bg = '#F5F4F2';
  const border = 'rgba(0,0,0,0.1)';
  const positive = '#5E7C63';
  const negative = '#A6553C';

  const statCell = (value: string, label: string) => `
    <td style="padding:12px 16px;border:1px solid ${border};text-align:center;">
      <div style="font-size:20px;font-weight:700;color:${ink};">${value}</div>
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${sub};margin-top:4px;">${label}</div>
    </td>`;

  const balanceRows = balances
    .map((b) => {
      const label =
        b.net > 0
          ? `<span style="color:${positive};">owed ${formatMoney(b.net)}</span>`
          : b.net < 0
            ? `<span style="color:${negative};">owes ${formatMoney(-b.net)}</span>`
            : `<span style="color:${sub};">settled</span>`;
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${border};">${esc(b.displayName)}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${border};text-align:right;">${label}</td>
      </tr>`;
    })
    .join('');

  const suggestionRows = suggestions.length
    ? suggestions
        .map(
          (s) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${border};">${esc(s.fromName)} pays ${esc(s.toName)}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${border};text-align:right;">${formatMoney(s.amount)}</td>
      </tr>`
        )
        .join('')
    : `<tr><td style="padding:8px 0;color:${sub};">Everyone is settled up.</td></tr>`;

  const expenseRows = sortedExpenses.length
    ? sortedExpenses
        .map(
          (e) => `<tr>
        <td style="padding:8px;border-bottom:1px solid ${border};">${fmtDate(e.created_at)}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};">${esc(e.title)}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};">${esc(categoryLabel(e.category) ?? '-')}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};text-align:right;">${formatMoney(e.total_amount, e.currency)}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};">${esc(nameFor(e.paid_by))}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};">${SPLIT_LABEL[e.split_type] ?? e.split_type}</td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="6" style="padding:8px;color:${sub};">No expenses.</td></tr>`;

  const settlementRows = settlements.length
    ? settlements
        .map(
          (s) => `<tr>
        <td style="padding:8px;border-bottom:1px solid ${border};">${fmtDate(s.created_at)}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};">${esc(nameFor(s.from_user))}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};">${esc(nameFor(s.to_user))}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};text-align:right;">${formatMoney(s.amount)}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};">${esc(s.note ?? '')}</td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="5" style="padding:8px;color:${sub};">No settlements.</td></tr>`;

  const th = (label: string, align = 'left') =>
    `<th style="padding:8px;text-align:${align};border-bottom:2px solid ${accent};color:${accent};font-size:11px;letter-spacing:1px;text-transform:uppercase;">${label}</th>`;

  const sectionTitle = (label: string) =>
    `<h2 style="font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:${accent};margin:32px 0 12px;">${label}</h2>`;

  const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
  <body style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:${bg};color:${ink};margin:0;padding:40px;">
    <div style="border-bottom:1px solid ${border};padding-bottom:16px;">
      <h1 style="font-size:32px;font-weight:700;margin:0;color:${ink};">${esc(group.name)}</h1>
      <div style="font-size:13px;color:${sub};margin-top:6px;">Exported ${fmtDate(new Date().toISOString())} &middot; Generated by SplitSmart</div>
    </div>

    ${sectionTitle('Summary')}
    <table style="width:100%;border-collapse:collapse;"><tr>
      ${statCell(formatMoney(totalSpent), 'Total spent')}
      ${statCell(String(expenses.length), 'Expenses')}
      ${statCell(String(settlements.length), 'Settlements')}
      ${statCell(String(members.length), 'Members')}
    </tr></table>

    ${sectionTitle('Balances')}
    <table style="width:100%;border-collapse:collapse;">${balanceRows}</table>

    ${sectionTitle('Suggested settlements')}
    <table style="width:100%;border-collapse:collapse;">${suggestionRows}</table>

    ${sectionTitle('Expenses')}
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr>${th('Date')}${th('Title')}${th('Category')}${th('Amount', 'right')}${th('Paid by')}${th('Split')}</tr>
      ${expenseRows}
    </table>

    ${sectionTitle('Settlements')}
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr>${th('Date')}${th('From')}${th('To')}${th('Amount', 'right')}${th('Note')}</tr>
      ${settlementRows}
    </table>

    <div style="margin-top:40px;padding-top:16px;border-top:1px solid ${border};font-size:11px;color:${sub};text-align:center;">All amounts in INR</div>
  </body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}
