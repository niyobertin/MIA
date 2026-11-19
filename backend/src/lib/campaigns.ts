import { randomUUID } from 'crypto';
import { z } from 'zod';
import { sql } from './db';
import { queueRendered, renderEmail } from './email';
import { ORG_STATUS_SQL } from './subscription';

const q = sql;

export const audienceSchema = z.object({
  type: z.enum(['all', 'organizations', 'plan', 'status']),
  business_ids: z.array(z.string().uuid()).max(500).optional(),
  plan: z.string().trim().max(40).optional(),
  status: z.enum(['active', 'trial', 'suspended', 'expired']).optional(),
  user_ids: z.array(z.string().uuid()).max(500).optional(),
  recipients: z.enum(['owners', 'all_users']).default('owners'),
}).superRefine((value, ctx) => {
  if (value.type === 'organizations' && !value.business_ids?.length) ctx.addIssue({ code: 'custom', message: 'Choose at least one organization' });
  if (value.type === 'plan' && !value.plan) ctx.addIssue({ code: 'custom', message: 'Choose a plan' });
  if (value.type === 'status' && !value.status) ctx.addIssue({ code: 'custom', message: 'Choose a status' });
  if (value.user_ids?.length && !(value.type === 'organizations' && value.business_ids?.length === 1)) ctx.addIssue({ code: 'custom', message: 'Individual users can only be chosen inside one organization' });
});

export type Audience = z.infer<typeof audienceSchema>;

export type Recipient = { user_id: string; name: string; email: string; role: string | null; business_id: string; business_name: string; business_email: string | null; plan: string };

export async function resolveAudience(audience: Audience): Promise<Recipient[]> {
  return q(
    `SELECT u.id AS user_id, u.name, lower(u.email) AS email, u.role, b.id AS business_id, b.name AS business_name, b.contact_email AS business_email, COALESCE(st.plan, 'free') AS plan
     FROM users u JOIN businesses b ON b.id = u.business_id LEFT JOIN business_platform_states st ON st.business_id = b.id
     WHERE u.active AND u.email IS NOT NULL
       AND ($1 = 'all_users' OR u.role = 'OWNER')
       AND ($2 <> 'organizations' OR b.id = ANY($3::uuid[]))
       AND ($2 <> 'plan' OR COALESCE(st.plan, 'free') = $4)
       AND ($2 <> 'status' OR (${ORG_STATUS_SQL}) = $5)
       AND ($6::uuid[] IS NULL OR u.id = ANY($6::uuid[]))
     ORDER BY b.name, u.name`,
    [audience.user_ids?.length ? 'all_users' : audience.recipients, audience.type, audience.business_ids ?? [], audience.plan ?? null, audience.status ?? null, audience.user_ids?.length ? audience.user_ids : null],
  );
}

export function audienceSummary(recipients: Recipient[]) {
  const unique = new Map(recipients.map((recipient) => [recipient.email, recipient]));
  return { recipients: unique.size, organizations: new Set(recipients.map((recipient) => recipient.business_id)).size };
}

export async function dispatchCampaign(campaignId: string) {
  const claimed = await q(`UPDATE email_campaigns SET status = 'sending' WHERE id = $1 AND status = 'scheduled' AND scheduled_for <= now() RETURNING *`, [campaignId]);
  const campaign = claimed[0];
  if (!campaign) return 0;
  const recipients = await resolveAudience(audience(campaign.audience));
  const seen = new Set<string>();
  let queued = 0;
  for (const recipient of recipients) {
    if (seen.has(recipient.email)) continue;
    seen.add(recipient.email);
    const rendered = renderEmail(
      { subject: campaign.subject, heading: campaign.heading, body: campaign.body, action_label: campaign.action_label },
      {
        recipient_name: recipient.name,
        organization_name: recipient.business_name,
        organization_email: recipient.business_email,
        subscription_plan: recipient.plan,
        title: campaign.subject,
        action_url: campaign.action_url,
      },
    );
    const id = await queueRendered({
      to: recipient.email,
      toName: recipient.name,
      templateKey: null,
      category: campaign.category,
      businessId: recipient.business_id,
      campaignId: campaign.id,
      idempotencyKey: `campaign:${campaign.id}:${recipient.email}`,
      ...rendered,
    });
    if (id) queued += 1;
  }
  await q(`UPDATE email_campaigns SET status = 'completed', completed_at = now(), recipient_count = $2, organization_count = $3 WHERE id = $1`,
    [campaign.id, seen.size, new Set(recipients.map((recipient) => recipient.business_id)).size]);
  return queued;
}

function audience(value: unknown) {
  return audienceSchema.parse(value);
}

export async function dispatchDueCampaigns() {
  const due = await q(`SELECT id FROM email_campaigns WHERE status = 'scheduled' AND scheduled_for <= now() ORDER BY scheduled_for LIMIT 5`);
  for (const row of due) await dispatchCampaign(row.id);
}

export async function createCampaign(input: { adminId: string; adminEmail: string; subject: string; heading: string; body: string; actionLabel?: string | null; actionUrl?: string | null; category: string; audience: Audience; scheduledFor?: Date | null; announcementId?: string | null; recipientCount: number; organizationCount: number }) {
  const id = randomUUID();
  await q(
    `INSERT INTO email_campaigns (id, created_by, admin_email, subject, heading, body, action_label, action_url, category, audience, recipient_count, organization_count, status, scheduled_for, announcement_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'scheduled', $13, $14, now())`,
    [id, input.adminId, input.adminEmail, input.subject, input.heading, input.body, input.actionLabel ?? null, input.actionUrl ?? null, input.category, JSON.stringify(input.audience), input.recipientCount, input.organizationCount, input.scheduledFor ?? new Date(), input.announcementId ?? null],
  );
  return id;
}
