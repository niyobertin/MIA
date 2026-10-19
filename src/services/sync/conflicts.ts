export type SyncConflictKind =
  | 'sealed'
  | 'session_conflict'
  | 'validation'
  | 'auth'
  | 'offline'
  | 'unknown';

const CONFLICT_SESSION_RE = /conflict_session:([0-9a-f-]{36})/i;

/** Extract server open-session id from a 409 session_conflict error message. */
export function parseConflictSessionId(message: unknown): string | null {
  const match = String(message ?? '').match(CONFLICT_SESSION_RE);
  return match?.[1] ?? null;
}

/**
 * Single classifier for sync failures, so every screen explains them the same way.
 * Server errors arrive as plain messages (e.g. "Closed history cannot be modified").
 * Dependency-free so business rules stay unit-testable without native modules.
 */
export function classifySyncError(message: unknown): SyncConflictKind {
  const m = String(message ?? '').toLowerCase();
  if (/another open trading session|conflict_session/.test(m)) return 'session_conflict';
  if (/closed history|cannot be modified|history_locked|\b409\b/.test(m)) return 'sealed';
  if (/must be a |must be positive|invalid |is required|unknown table|not a uuid|refusing to sync/.test(m)) {
    return 'validation';
  }
  if (/unauthor|forbidden|access denied|no business|create or join|token|sign in|log in/.test(m)) {
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
