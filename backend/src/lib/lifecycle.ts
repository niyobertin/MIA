import { AppDataSource } from '../data-source';
import { notifyAdmins } from './notifications';
import { ownerEmailsFor, queueTemplateEmail } from './email';
import { GRACE_PERIOD_DAYS, SUB_STATUS_SQL } from './subscription';

const STAGES = {
  expiring_soon: { template: 'subscription.expiring', priority: 'normal', title: (name: string) => `${name}'s subscription expires soon` },
  grace: { template: 'subscription.grace', priority: 'high', title: (name: string) => `${name} is in the ${GRACE_PERIOD_DAYS}-day grace period` },
  expired: { template: 'subscription.expired', priority: 'high', title: (name: string) => `${name}'s subscription expired` },
} as const;

export async function runSubscriptionLifecycle() {
  const rows = await AppDataSource.query(
    `SELECT b.id, b.name, COALESCE(st.plan, 'free') AS plan, p.name AS plan_name, ${SUB_STATUS_SQL} AS status,
            CASE WHEN COALESCE(st.subscription_status, 'trial') = 'trial' THEN COALESCE(st.trial_ends_at, st.current_period_end) ELSE st.current_period_end END AS ends_at
     FROM businesses b JOIN business_platform_states st ON st.business_id = b.id
     LEFT JOIN subscription_plans p ON p.code = st.plan`,
  ) as { id: string; name: string; plan: string; plan_name: string | null; status: string; ends_at: Date | null }[];
  let sent = 0;
  for (const row of rows) {
    const stage = STAGES[row.status as keyof typeof STAGES];
    if (!stage || !row.ends_at) continue;
    const endsOn = new Date(row.ends_at).toISOString().slice(0, 10);
    const key = `${row.status}:${row.id}:${endsOn}`;
    await notifyAdmins({
      permission: 'billing:read',
      category: 'subscriptions',
      priority: stage.priority,
      title: stage.title(row.name),
      message: `Plan ${row.plan_name ?? row.plan} · ends ${endsOn}`,
      actionUrl: `/platform/businesses/${row.id}/subscriptions`,
      businessId: row.id,
      resourceType: 'business',
      resourceId: row.id,
      dedupeKey: key,
    });
    const graceEnds = new Date(new Date(row.ends_at).getTime() + GRACE_PERIOD_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (const owner of await ownerEmailsFor(row.id)) {
      await queueTemplateEmail({
        template: stage.template,
        to: owner.email,
        businessId: row.id,
        idempotencyKey: `${key}:${owner.email}`,
        variables: {
          recipient_name: owner.name,
          organization_name: row.name,
          subscription_plan: row.plan_name ?? row.plan,
          subscription_expiry: endsOn,
          grace_period_end: graceEnds,
          grace_period_days: String(GRACE_PERIOD_DAYS),
        },
      });
    }
    sent += 1;
  }
  return sent;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startLifecycleJobs() {
  if (timer || process.env.LIFECYCLE_JOBS === 'false') return;
  const run = () => runSubscriptionLifecycle().catch((error) => console.error('Subscription lifecycle check failed', error));
  setTimeout(run, 15_000);
  const handle = setInterval(run, 60 * 60 * 1000);
  (handle as { unref?: () => void }).unref?.();
  timer = handle;
}
