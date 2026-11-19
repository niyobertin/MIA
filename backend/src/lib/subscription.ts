import type { BusinessPlatformState } from '../entities';

export const GRACE_PERIOD_DAYS = 3;
export const EXPIRING_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type EffectiveSubscriptionStatus =
  | 'trial'
  | 'active'
  | 'expiring_soon'
  | 'grace'
  | 'expired'
  | 'pending_payment'
  | 'suspended'
  | 'cancelled';

export type OrganizationStatus = 'active' | 'suspended' | 'trial' | 'expired';

type StateLike = Pick<
  BusinessPlatformState,
  'plan' | 'subscription_status' | 'trial_ends_at' | 'current_period_end' | 'billing_period' | 'plan_amount' | 'subscription_started_at' | 'status'
> | null | undefined;

export function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export function renewalWindow(state: StateLike, months: number, now = new Date()) {
  const currentEnd = state?.current_period_end ? new Date(state.current_period_end) : null;
  const continues = Boolean(currentEnd && currentEnd.getTime() + GRACE_PERIOD_DAYS * DAY_MS >= now.getTime() && state?.subscription_status !== 'trial');
  const start = continues && currentEnd ? currentEnd : now;
  return { start, end: addMonths(start, months), continues };
}

export function describeSubscription(state: StateLike, openBalance = 0, now = new Date()) {
  const stored = state?.subscription_status ?? 'trial';
  const plan = state?.plan ?? 'free';
  const endValue = stored === 'trial' ? state?.trial_ends_at ?? state?.current_period_end : state?.current_period_end;
  const endsAt = endValue ? new Date(endValue) : null;
  const graceEndsAt = endsAt ? new Date(endsAt.getTime() + GRACE_PERIOD_DAYS * DAY_MS) : null;
  const daysRemaining = endsAt ? Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS) : null;
  const graceDaysRemaining = graceEndsAt ? Math.max(0, Math.ceil((graceEndsAt.getTime() - now.getTime()) / DAY_MS)) : null;

  let status: EffectiveSubscriptionStatus = stored === 'past_due' ? 'pending_payment' : stored;
  if (stored !== 'suspended' && stored !== 'cancelled' && endsAt && graceEndsAt) {
    if (now > graceEndsAt) status = 'expired';
    else if (now > endsAt) status = 'grace';
    else if (stored === 'active' && openBalance > 0) status = 'pending_payment';
    else if (stored === 'active' && daysRemaining !== null && daysRemaining <= EXPIRING_SOON_DAYS) status = 'expiring_soon';
  } else if (stored === 'active' && openBalance > 0) {
    status = 'pending_payment';
  }

  return {
    plan,
    stored_status: stored,
    status,
    billing_period: state?.billing_period ?? null,
    amount: state?.plan_amount ?? null,
    started_at: state?.subscription_started_at ?? null,
    ends_at: endsAt,
    grace_period_days: GRACE_PERIOD_DAYS,
    grace_ends_at: graceEndsAt,
    in_grace: status === 'grace',
    days_remaining: daysRemaining,
    grace_days_remaining: status === 'grace' ? graceDaysRemaining : null,
    open_balance: openBalance,
    is_paid_plan: plan !== 'free',
  };
}

export function organizationStatus(platformStatus: string | null | undefined, subscription: ReturnType<typeof describeSubscription>): OrganizationStatus {
  if (platformStatus === 'suspended') return 'suspended';
  if (['expired', 'cancelled', 'suspended'].includes(subscription.status)) return 'expired';
  if (subscription.status === 'trial') return 'trial';
  return 'active';
}

export const ORG_STATUS_SQL = `CASE
  WHEN COALESCE(st.status, 'active') = 'suspended' THEN 'suspended'
  WHEN COALESCE(st.subscription_status, 'trial') IN ('cancelled', 'suspended') THEN 'expired'
  WHEN COALESCE(CASE WHEN COALESCE(st.subscription_status, 'trial') = 'trial' THEN COALESCE(st.trial_ends_at, st.current_period_end) ELSE st.current_period_end END, 'infinity'::timestamptz)
       + interval '${GRACE_PERIOD_DAYS} days' < now() THEN 'expired'
  WHEN COALESCE(st.subscription_status, 'trial') = 'trial' THEN 'trial'
  ELSE 'active' END`;

export const SUB_STATUS_SQL = `CASE
  WHEN COALESCE(st.subscription_status, 'trial') IN ('suspended', 'cancelled') THEN st.subscription_status
  WHEN (CASE WHEN COALESCE(st.subscription_status, 'trial') = 'trial' THEN COALESCE(st.trial_ends_at, st.current_period_end) ELSE st.current_period_end END)
       + interval '${GRACE_PERIOD_DAYS} days' < now() THEN 'expired'
  WHEN (CASE WHEN COALESCE(st.subscription_status, 'trial') = 'trial' THEN COALESCE(st.trial_ends_at, st.current_period_end) ELSE st.current_period_end END) < now() THEN 'grace'
  WHEN COALESCE(st.subscription_status, 'trial') = 'past_due' THEN 'pending_payment'
  WHEN COALESCE(st.subscription_status, 'trial') = 'active'
       AND EXISTS (SELECT 1 FROM subscription_invoices i WHERE i.business_id = b.id AND i.status = 'open') THEN 'pending_payment'
  WHEN COALESCE(st.subscription_status, 'trial') = 'active' AND st.current_period_end < now() + interval '7 days' THEN 'expiring_soon'
  ELSE COALESCE(st.subscription_status, 'trial') END`;
