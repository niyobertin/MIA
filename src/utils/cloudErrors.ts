/** Turn raw PostgREST / sync errors into short user-facing text. */
export function formatCloudError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? '');
  const lower = text.toLowerCase();

  if (
    lower.includes('42p17') ||
    lower.includes('infinite recursion')
  ) {
    return 'Cloud security rules are misconfigured. Run supabase/migrations/006_fix_rls_recursion.sql in the Supabase SQL Editor, then try again.';
  }

  if (
    lower.includes('0 rows') ||
    lower.includes('rls blocked') ||
    lower.includes('row-level security')
  ) {
    return 'Cloud blocked the upload. Run supabase/migrations/004_offline_device_sync.sql in the Supabase SQL Editor, then tap Re-upload.';
  }

  if (
    lower.includes('not a uuid') ||
    lower.includes('invalid input syntax for type uuid') ||
    lower.includes('non-uuid')
  ) {
    return 'This device still has old demo IDs. Log out, fully close the app, open it again, then sign in.';
  }

  if (
    lower.includes('invalid jwt') ||
    lower.includes('invalid supabase key') ||
    lower.includes('invalid api key')
  ) {
    return 'Cloud API key is invalid. Check EXPO_PUBLIC_SUPABASE_ANON_KEY (use sb_publishable_… or the legacy anon JWT).';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('network error') ||
    lower.includes('offline')
  ) {
    return 'No internet right now. Your data is saved on this phone and will sync when you are online.';
  }

  if (lower.includes('cloud sync is not configured') || lower.includes('missing supabase')) {
    return 'Cloud sync is not set up on this build.';
  }

  if (lower.includes('already syncing')) {
    return 'Sync is already running. Please wait a moment.';
  }

  if (lower.includes('no active business')) {
    return 'Create or join a business before syncing.';
  }

  // Drop JSON / URLs — they are noise in toasts
  const cleaned = text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\{[\s\S]*\}/g, '')
    .replace(/Tenant sync failed[^:]*:\s*/i, '')
    .replace(/Error:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length >= 12 && cleaned.length <= 140 && !cleaned.includes('"code"')) {
    return cleaned;
  }

  return 'Could not upload to the cloud. Your data is still saved on this device.';
}

export function formatAuthError(raw: unknown, fallback: string): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? '');
  const lower = text.toLowerCase();

  if (lower.includes('already exists') || lower.includes('unique')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (lower.includes('invalid email or password')) {
    return 'Wrong email or password.';
  }
  if (lower.includes('not null') && lower.includes('business')) {
    return 'App data needs an update. Close the app fully, reopen it, then try again.';
  }
  if (lower.includes('not null') || lower.includes('constraint failed')) {
    return 'Could not save your account. Close the app fully, reopen it, then try again.';
  }
  if (lower.includes('sqlite')) {
    return 'Could not save your account. Close the app fully, reopen it, then try again.';
  }
  if (text.trim().length >= 8 && text.trim().length <= 120 && !lower.includes('http')) {
    return text.trim();
  }
  return fallback;
}
