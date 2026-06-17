import { listMembers } from './members';
import { listExpenses } from './expenses';
import { listSettlements } from './settlements';
import type { ActivityItem } from '../types';

/**
 * Build a group's activity feed by merging the things already stored —
 * expenses, settlements and member joins — into one reverse-chronological
 * list. No dedicated activity table: the feed is derived at read time, the
 * same philosophy as balances. (Deleted expenses naturally disappear from
 * the feed; an edit shows via the `edited` flag.)
 */
export async function listActivity(groupId: string): Promise<ActivityItem[]> {
  const [members, expenses, settlements] = await Promise.all([
    listMembers(groupId),
    listExpenses(groupId),
    listSettlements(groupId),
  ]);

  const profileFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile;
  const nameFor = (userId: string) => profileFor(userId)?.display_name ?? 'Someone';
  const avatarFor = (userId: string) => profileFor(userId)?.avatar_url ?? null;

  const items: ActivityItem[] = [];

  for (const e of expenses) {
    items.push({
      kind: 'expense',
      id: e.id,
      at: e.created_at,
      edited: e.updated_at !== e.created_at,
      title: e.title,
      amount: e.total_amount,
      currency: e.currency,
      payerName: nameFor(e.paid_by),
      avatarUrl: avatarFor(e.paid_by),
    });
  }

  for (const s of settlements) {
    const recorderIsParty =
      s.recorded_by === s.from_user || s.recorded_by === s.to_user;
    items.push({
      kind: 'settlement',
      id: s.id,
      at: s.created_at,
      fromName: nameFor(s.from_user),
      toName: nameFor(s.to_user),
      amount: s.amount,
      recordedByName: recorderIsParty ? null : nameFor(s.recorded_by),
      avatarUrl: avatarFor(s.from_user),
    });
  }

  for (const m of members) {
    items.push({
      kind: 'member_joined',
      id: `${m.group_id}:${m.user_id}`,
      at: m.created_at,
      name: m.profile.display_name,
      avatarUrl: m.profile.avatar_url,
    });
  }

  // Newest first; ties broken by kind so the order is deterministic.
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items;
}
