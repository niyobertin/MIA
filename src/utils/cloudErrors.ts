/** Turn raw PostgREST / sync errors into short user-facing text. */
export function formatCloudError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? '');
  const lower = text.toLowerCase();

  if (
    lower.includes('42p17') ||
    lower.includes('infinite recursion')
  ) {
    return 'Cloud security rules failed. Check the MIA backend logs.';
  }

  if (
    lower.includes('0 rows') ||
    lower.includes('rls blocked') ||
    lower.includes('row-level security') ||
    lower.includes('access denied')
  ) {
    return 'Cloud blocked the upload. Sign in again, then tap Sync.';
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
    lower.includes('unauthorized') ||
    lower.includes('invalid or expired token') ||
    lower.includes('missing or invalid authorization') ||
    lower.includes('not signed in to the cloud')
  ) {
    return 'Not signed in to the cloud. Sign out, then sign in again while online.';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('network error') ||
    lower.includes('offline')
  ) {
    return 'No internet right now. Your data is saved on this phone and will sync when you are online.';
  }

  if (
    lower.includes('cloud sync is not configured') ||
    lower.includes('api_url') ||
    lower.includes('expo_public_api')
  ) {
    return 'Cloud sync is not set up. Set EXPO_PUBLIC_API_URL to your MIA backend.';
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

  if (
    lower.includes('email not confirmed') ||
    lower.includes('confirm your email') ||
    lower.includes('confirm email')
  ) {
    return 'Could not verify this email. Try signing in again.';
  }
  if (
    lower.includes('internet is required') ||
    lower.includes('online account') ||
    lower.includes('check your email')
  ) {
    return text.trim();
  }
  if (lower.includes('already exists') || lower.includes('unique') || lower.includes('already registered')) {
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
