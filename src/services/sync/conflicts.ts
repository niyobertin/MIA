export type SyncConflictKind = 'sealed' | 'validation' | 'auth' | 'offline' | 'unknown';

/**
 * Single classifier for sync failures, so every screen explains them the same way.
 * Server errors arrive as plain messages (e.g. "Closed history cannot be modified").
 * Dependency-free so business rules stay unit-testable without native modules.
 */
export function classifySyncError(message: unknown): SyncConflictKind {
  const m = String(message ?? '').toLowerCase();
  if (/closed history|cannot be modified|\b409\b/.test(m)) return 'sealed';
  if (/must be a |must be positive|invalid |is required|unknown table|not a uuid|refusing to sync/.test(m)) {
    return 'validation';
  }
  if (/unauthor|forbidden|access denied|no business|create or join|session|token|sign in|log in/.test(m)) {
    return 'auth';
  }
  if (/network|fetch|offline|not configured|timeout|econn|enotfound|eai_again/.test(m)) return 'offline';
  return 'unknown';
}

export function tableLabel(table: string): string {
  return table
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
