export type AllocItem = {
  id: string;
  value: number;
  paid: number;
  issuedAt: string;
};

export type ItemPayState = 'paid' | 'part' | 'unpaid';

function byIssueTime(a: AllocItem, b: AllocItem): number {
  if (a.issuedAt === b.issuedAt) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return a.issuedAt < b.issuedAt ? -1 : 1;
}

export function itemPayState(value: number, paid: number): ItemPayState {
  if (value > 0 && paid >= value) return 'paid';
  if (paid > 0) return 'part';
  return 'unpaid';
}

/**
 * Make item paid amounts add up to the tab's paid total.
 * Each line is capped at its current value; any shortfall is spread oldest first,
 * any excess is removed newest first.
 */
export function rebalanceItemPayments(items: AllocItem[], tabPaid: number): Record<string, number> {
  const ordered = [...items].sort(byIssueTime);
  const next: Record<string, number> = {};
  for (const item of ordered) next[item.id] = Math.max(0, Math.min(item.paid, item.value));

  let total = ordered.reduce((sum, item) => sum + next[item.id], 0);
  const target = Math.max(0, tabPaid);

  if (total > target) {
    for (const item of [...ordered].reverse()) {
      if (total <= target) break;
      const cut = Math.min(next[item.id], total - target);
      next[item.id] -= cut;
      total -= cut;
    }
  } else if (total < target) {
    for (const item of ordered) {
      if (total >= target) break;
      const room = item.value - next[item.id];
      const add = Math.min(room, target - total);
      if (add > 0) {
        next[item.id] += add;
        total += add;
      }
    }
  }
  return next;
}

/**
 * Spread a new payment over tab lines: chosen lines first (in the order given),
 * then the oldest unpaid lines. Returns the new paid amount per line.
 */
export function allocateItemPayment(
  items: AllocItem[],
  amount: number,
  priorityIds: string[] = []
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const item of items) next[item.id] = item.paid;

  const byId = new Map(items.map((item) => [item.id, item]));
  const chosen = priorityIds.map((id) => byId.get(id)).filter((item): item is AllocItem => !!item);
  const chosenSet = new Set(chosen.map((item) => item.id));
  const rest = [...items].filter((item) => !chosenSet.has(item.id)).sort(byIssueTime);

  let left = Math.max(0, amount);
  for (const item of [...chosen, ...rest]) {
    if (left <= 0) break;
    const room = item.value - next[item.id];
    const add = Math.min(room, left);
    if (add > 0) {
      next[item.id] += add;
      left -= add;
    }
  }
  return next;
}

/** Amount still unpaid on the chosen lines — what the customer owes for them. */
export function unpaidForItems(items: AllocItem[], ids: string[]): number {
  const set = new Set(ids);
  return items
    .filter((item) => set.has(item.id))
    .reduce((sum, item) => sum + Math.max(0, item.value - item.paid), 0);
}
