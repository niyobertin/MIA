import { randomUUID, timingSafeEqual } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../data-source';
import { sql } from '../lib/db';
import { Announcement, EmailTemplate } from '../entities';
import { audienceSchema, audienceSummary, createCampaign, dispatchCampaign, resolveAudience, type Audience } from '../lib/campaigns';
import { listTemplates, queueRendered, renderEmail, resolveTemplate, unknownPlaceholders } from '../lib/email';
import { SUPPORTED_LOCALES, TEMPLATE_VARIABLES } from '../lib/emailTemplates';
import { recordPlatformAudit } from '../lib/platformAudit';
import { ORG_STATUS_SQL } from '../lib/subscription';
import { requirePermission, type PlatformRequest } from '../middleware/platform';

export const platformCommsRouter = Router();

const q = sql;
const num = (value: unknown) => Number(value ?? 0);
const reasonSchema = z.string().trim().min(5, 'Enter a reason of at least 5 characters').max(500);
const localeSchema = z.enum(SUPPORTED_LOCALES).default('en');
const COMMS = requirePermission('communications:manage');

const SAMPLE: Record<string, string> = {
  recipient_name: 'Jean Claude', organization_name: 'Sample Shop Ltd', organization_email: 'hello@sample.rw', verification_code: '482913',
  expiration_time: '10 minutes', subscription_plan: 'Essential', subscription_expiry: '2026-12-31', grace_period_end: '2027-01-03', grace_period_days: '3',
  amount: '40,000 RWF', role: 'Manager', previous_role: 'Cashier', ip_address: '197.243.0.1', device: 'Android phone', event_time: '19 Nov 2026, 10:30',
  reason: 'Requested by the owner', message: 'This is a sample message.', title: 'Sample title', previous_plan: 'Free',
};

const contentSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  heading: z.string().trim().min(2).max(200),
  body: z.string().trim().min(3).max(5000),
  action_label: z.string().trim().max(60).nullable().optional(),
});

function rejectUnknown(res: Response, ...texts: (string | null | undefined)[]) {
  const unknown = unknownPlaceholders(...texts.filter((text): text is string => Boolean(text)));
  if (unknown.length) {
    res.status(400).json({ error: `Unknown variables: ${unknown.map((name) => `{{${name}}}`).join(', ')}`, allowed: TEMPLATE_VARIABLES });
    return true;
  }
  return false;
}

platformCommsRouter.get('/email/templates', COMMS, async (req, res) => {
  const locale = localeSchema.parse(req.query.locale);
  const templates = await listTemplates(locale);
  res.json({
    locales: SUPPORTED_LOCALES,
    variables: TEMPLATE_VARIABLES,
    rows: templates.map(({ key, category, name, description, subject, active, customized, updated_at, required, sensitive, transactional, locale: resolved }) => ({
      key, category, name, description, subject, active, customized, updated_at, required, sensitive: Boolean(sensitive), transactional: Boolean(transactional), locale: resolved,
    })),
  });
});

platformCommsRouter.get('/email/templates/:key', COMMS, async (req, res) => {
  const locale = localeSchema.parse(req.query.locale);
  const template = await resolveTemplate(String(req.params.key), locale);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json({ template, preview: renderEmail(template, SAMPLE) });
});

platformCommsRouter.post('/email/templates/:key/preview', COMMS, async (req, res) => {
  const base = await resolveTemplate(String(req.params.key));
  if (!base) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  const body = contentSchema.parse(req.body);
  if (rejectUnknown(res, body.subject, body.heading, body.body, body.action_label)) return;
  res.json({ preview: renderEmail({ ...body, security_notice: base.security_notice }, SAMPLE) });
});

platformCommsRouter.put('/email/templates/:key', COMMS, async (req: PlatformRequest, res) => {
  const key = String(req.params.key);
  const base = await resolveTemplate(key);
  if (!base) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  const body = contentSchema.extend({ locale: localeSchema, active: z.boolean(), reason: reasonSchema }).parse(req.body);
  if (rejectUnknown(res, body.subject, body.heading, body.body, body.action_label)) return;
  const missing = base.required.filter((name) => !['recipient_name', 'support_email', 'action_url', 'organization_name', 'role', 'previous_role', 'reason', 'event_time', 'ip_address'].includes(name) && ![body.subject, body.heading, body.body].some((text) => text.includes(`{{${name}}}`)));
  if (missing.length) {
    res.status(400).json({ error: `Keep these variables in the template: ${missing.map((name) => `{{${name}}}`).join(', ')}` });
    return;
  }
  if (base.sensitive && !body.active) {
    res.status(400).json({ error: 'Security code emails cannot be turned off.' });
    return;
  }
  const before = await resolveTemplate(key, body.locale);
  await AppDataSource.getRepository(EmailTemplate).save({
    key, locale: body.locale, subject: body.subject, heading: body.heading, body: body.body, action_label: body.action_label ?? null, active: body.active, updated_by: req.admin!.id, updated_at: new Date(),
  });
  await recordPlatformAudit({
    req, admin: req.admin, action: 'email.template_changed', targetType: 'email_template', targetId: `${key}:${body.locale}`, reason: body.reason,
    metadata: { before: before && { subject: before.subject, heading: before.heading, body: before.body, active: before.active }, after: { subject: body.subject, heading: body.heading, body: body.body, active: body.active } },
  });
  res.json({ ok: true });
});

platformCommsRouter.post('/email/templates/:key/test', COMMS, async (req: PlatformRequest, res) => {
  const locale = localeSchema.parse(req.body?.locale);
  const base = await resolveTemplate(String(req.params.key), locale);
  if (!base) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  const content = contentSchema.partial().parse(req.body ?? {});
  const merged = { ...base, ...Object.fromEntries(Object.entries(content).filter(([, value]) => value !== undefined)) };
  if (rejectUnknown(res, merged.subject, merged.heading, merged.body, merged.action_label)) return;
  const rendered = renderEmail(merged, { ...SAMPLE, recipient_name: req.admin!.name });
  const id = await queueRendered({ to: req.admin!.email, toName: req.admin!.name, templateKey: base.key, category: 'test', businessId: null, campaignId: null, idempotencyKey: null, ...rendered, subject: `[Test] ${rendered.subject}` });
  await recordPlatformAudit({ req, admin: req.admin, action: 'email.test_sent', targetType: 'email_template', targetId: base.key });
  res.status(202).json({ ok: true, message_id: id, sent_to: req.admin!.email });
});

platformCommsRouter.post('/email/audience/preview', COMMS, async (req, res) => {
  const audience = audienceSchema.parse(req.body?.audience);
  const recipients = await resolveAudience(audience);
  const summary = audienceSummary(recipients);
  const organizations = [...new Map(recipients.map((recipient) => [recipient.business_id, recipient.business_name])).values()].slice(0, 8);
  res.json({ ...summary, sample_organizations: organizations });
});

platformCommsRouter.get('/email/audience/users', COMMS, async (req, res) => {
  const businessId = z.string().uuid().parse(req.query.business_id);
  const rows = await q(`SELECT id, name, email, role FROM users WHERE business_id = $1 AND active AND email IS NOT NULL ORDER BY role = 'OWNER' DESC, name`, [businessId]);
  res.json({ rows });
});

platformCommsRouter.post('/email/test', COMMS, async (req: PlatformRequest, res) => {
  const body = contentSchema.extend({ action_url: z.string().url().max(500).nullable().optional() }).parse(req.body);
  if (rejectUnknown(res, body.subject, body.heading, body.body, body.action_label)) return;
  const rendered = renderEmail(body, { ...SAMPLE, recipient_name: req.admin!.name, action_url: body.action_url ?? undefined, title: body.subject });
  const id = await queueRendered({ to: req.admin!.email, toName: req.admin!.name, templateKey: null, category: 'test', businessId: null, campaignId: null, idempotencyKey: null, ...rendered, subject: `[Test] ${rendered.subject}` });
  res.status(202).json({ ok: true, message_id: id, sent_to: req.admin!.email });
});

platformCommsRouter.post('/email/preview', COMMS, async (req, res) => {
  const body = contentSchema.extend({ action_url: z.string().url().max(500).nullable().optional() }).parse(req.body);
  if (rejectUnknown(res, body.subject, body.heading, body.body, body.action_label)) return;
  res.json({ preview: renderEmail(body, { ...SAMPLE, action_url: body.action_url ?? undefined, title: body.subject }) });
});

const campaignSchema = contentSchema.extend({
  audience: audienceSchema,
  action_url: z.string().url().max(500).refine((url) => url.startsWith('https://') || url.startsWith('http://localhost'), 'Use an https:// link').nullable().optional(),
  category: z.enum(['announcements', 'operations', 'subscriptions', 'security']).default('announcements'),
  scheduled_for: z.coerce.date().nullable().optional(),
  confirm_all: z.boolean().optional(),
  reason: reasonSchema,
});

platformCommsRouter.post('/email/campaigns', COMMS, async (req: PlatformRequest, res) => {
  const body = campaignSchema.parse(req.body);
  if (rejectUnknown(res, body.subject, body.heading, body.body, body.action_label)) return;
  if (body.audience.type === 'all' && body.confirm_all !== true) {
    res.status(400).json({ error: 'Confirm that this email goes to every organization.', code: 'CONFIRM_ALL_REQUIRED' });
    return;
  }
  if (body.scheduled_for && body.scheduled_for.getTime() > Date.now() + 90 * 86_400_000) {
    res.status(400).json({ error: 'Schedule within the next 90 days.' });
    return;
  }
  const recipients = await resolveAudience(body.audience);
  const summary = audienceSummary(recipients);
  if (summary.recipients === 0) {
    res.status(400).json({ error: 'No recipients match this audience. Only active users with an email address receive messages.' });
    return;
  }
  const id = await createCampaign({
    adminId: req.admin!.id, adminEmail: req.admin!.email, subject: body.subject, heading: body.heading, body: body.body, actionLabel: body.action_label, actionUrl: body.action_url,
    category: body.category, audience: body.audience, scheduledFor: body.scheduled_for ?? null, recipientCount: summary.recipients, organizationCount: summary.organizations,
  });
  await recordPlatformAudit({ req, admin: req.admin, action: 'email.campaign_created', targetType: 'email_campaign', targetId: id, reason: body.reason, metadata: { audience: body.audience, subject: body.subject, recipients: summary.recipients, organizations: summary.organizations, scheduled_for: body.scheduled_for ?? null } });
  if (!body.scheduled_for || body.scheduled_for <= new Date()) void dispatchCampaign(id).catch((error) => console.error('Campaign dispatch failed', error));
  res.status(201).json({ id, ...summary });
});

platformCommsRouter.get('/email/campaigns', COMMS, async (_req, res) => {
  const rows = await q(
    `SELECT c.id, c.subject, c.admin_email, c.category, c.audience, c.recipient_count, c.organization_count, c.status, c.scheduled_for, c.created_at, c.completed_at,
            COUNT(m.id) FILTER (WHERE m.status IN ('sent', 'delivered')) AS sent,
            COUNT(m.id) FILTER (WHERE m.status = 'delivered') AS delivered,
            COUNT(m.id) FILTER (WHERE m.status IN ('failed', 'bounced', 'suppressed')) AS failed,
            COUNT(m.id) FILTER (WHERE m.status IN ('queued', 'processing')) AS pending
     FROM email_campaigns c LEFT JOIN email_messages m ON m.campaign_id = c.id
     GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`,
  );
  res.json({ rows: rows.map((row) => ({ ...row, sent: num(row.sent), delivered: num(row.delivered), failed: num(row.failed), pending: num(row.pending) })) });
});

platformCommsRouter.post('/email/campaigns/:id/cancel', COMMS, async (req: PlatformRequest, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const rows = await q(`UPDATE email_campaigns SET status = 'cancelled' WHERE id = $1 AND status = 'scheduled' RETURNING id`, [id]);
  if (!rows.length) {
    res.status(409).json({ error: 'Only scheduled campaigns can be cancelled.' });
    return;
  }
  await recordPlatformAudit({ req, admin: req.admin, action: 'email.campaign_cancelled', targetType: 'email_campaign', targetId: id });
  res.json({ ok: true });
});

const STATUSES = ['queued', 'processing', 'sent', 'delivered', 'bounced', 'failed', 'suppressed'] as const;

platformCommsRouter.get('/email/messages', COMMS, async (req, res) => {
  const query = z.object({
    status: z.enum(['all', ...STATUSES]).default('all'),
    category: z.string().trim().max(40).optional(),
    q: z.string().trim().max(100).optional(),
    campaign_id: z.string().uuid().optional(),
    business_id: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(25),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);
  const like = query.q ? `%${query.q.replace(/[%_\\]/g, '\\$&')}%` : null;
  const params = [query.status, query.category || null, like, query.campaign_id ?? null, query.business_id ?? null];
  const where = `($1 = 'all' OR m.status = $1) AND ($2::text IS NULL OR m.category = $2) AND ($3::text IS NULL OR m.to_email ILIKE $3 OR m.subject ILIKE $3 OR b.name ILIKE $3)
    AND ($4::uuid IS NULL OR m.campaign_id = $4) AND ($5::uuid IS NULL OR m.business_id = $5)`;
  const from = `FROM email_messages m LEFT JOIN businesses b ON b.id = m.business_id`;
  const [rows, [count]] = await Promise.all([
    q(`SELECT m.id, m.template_key, m.category, m.to_email, m.to_name, m.business_id, b.name AS business_name, m.campaign_id, m.subject, m.status, m.attempts, m.last_error,
              m.sensitive, m.created_at, m.sent_at, m.delivered_at, m.next_attempt_at
       ${from} WHERE ${where} ORDER BY m.created_at DESC LIMIT $6 OFFSET $7`, [...params, query.limit, query.offset]),
    q(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params),
  ]);
  res.json({ total: num(count.total), rows });
});

platformCommsRouter.get('/email/messages/:id', COMMS, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const [row] = await q(`SELECT m.*, b.name AS business_name FROM email_messages m LEFT JOIN businesses b ON b.id = m.business_id WHERE m.id = $1`, [id]);
  if (!row) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
  res.json({ message: { ...row, html: row.sensitive ? null : row.html, text: row.sensitive ? null : row.text } });
});

platformCommsRouter.post('/email/messages/:id/retry', COMMS, async (req: PlatformRequest, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const rows = await q(
    `UPDATE email_messages SET status = 'queued', next_attempt_at = now(), attempts = 0, last_error = NULL, updated_at = now()
     WHERE id = $1 AND status = 'failed' AND sensitive = false AND html IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM email_suppressions s WHERE s.email = email_messages.to_email)
     RETURNING id`,
    [id],
  );
  if (!rows.length) {
    res.status(409).json({ error: 'Only failed, non-security messages to addresses that are not suppressed can be retried.' });
    return;
  }
  await recordPlatformAudit({ req, admin: req.admin, action: 'email.retried', targetType: 'email_message', targetId: id });
  const { processEmailQueue } = await import('../lib/email');
  void processEmailQueue();
  res.json({ ok: true });
});

platformCommsRouter.get('/email/analytics', COMMS, async (req, res) => {
  const days = z.coerce.number().int().min(7).max(90).default(30).parse(req.query.days);
  const [[totals], byCategory, series] = await Promise.all([
    q(`SELECT COUNT(*) AS total,
              ${STATUSES.map((status) => `COUNT(*) FILTER (WHERE status = '${status}') AS ${status}`).join(', ')}
       FROM email_messages WHERE created_at >= now() - make_interval(days => $1)`, [days]),
    q(`SELECT category, COUNT(*) AS total, COUNT(*) FILTER (WHERE status IN ('sent', 'delivered')) AS sent, COUNT(*) FILTER (WHERE status IN ('failed', 'bounced')) AS failed
       FROM email_messages WHERE created_at >= now() - make_interval(days => $1) GROUP BY category ORDER BY total DESC`, [days]),
    q(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
              (SELECT COUNT(*) FROM email_messages m WHERE date_trunc('day', m.created_at) = d AND m.status IN ('sent', 'delivered')) AS sent,
              (SELECT COUNT(*) FROM email_messages m WHERE date_trunc('day', m.created_at) = d AND m.status = 'delivered') AS delivered,
              (SELECT COUNT(*) FROM email_messages m WHERE date_trunc('day', m.created_at) = d AND m.status IN ('failed', 'bounced')) AS failed
       FROM generate_series(date_trunc('day', now()) - make_interval(days => $1 - 1), date_trunc('day', now()), interval '1 day') d ORDER BY d`, [days]),
  ]);
  const t = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, num(value)]));
  const attempted = t.sent + t.delivered + t.bounced + t.failed;
  res.json({
    days,
    totals: t,
    webhooks_configured: Boolean(process.env.EMAIL_WEBHOOK_SECRET),
    provider_configured: Boolean(process.env.SMTP_HOST),
    rates: {
      accepted: attempted ? Math.round(((t.sent + t.delivered) / attempted) * 1000) / 10 : null,
      delivered: t.delivered > 0 && attempted ? Math.round((t.delivered / attempted) * 1000) / 10 : null,
      bounced: attempted ? Math.round((t.bounced / attempted) * 1000) / 10 : null,
    },
    by_category: byCategory.map((row) => ({ category: row.category, total: num(row.total), sent: num(row.sent), failed: num(row.failed) })),
    series: series.map((row) => ({ day: row.day, sent: num(row.sent), delivered: num(row.delivered), failed: num(row.failed) })),
  });
});

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(1000),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  business_id: z.string().uuid().nullable().optional(),
  audience: audienceSchema.optional(),
  channels: z.enum(['in_app', 'email', 'both']).default('in_app'),
  starts_at: z.coerce.date().nullable().optional(),
  ends_at: z.coerce.date().nullable().optional(),
  template: z.enum(['platform.announcement', 'platform.maintenance', 'platform.feature', 'platform.policy', 'platform.interruption', 'platform.restored', 'platform.security_advisory']).default('platform.announcement'),
  confirm_all: z.boolean().optional(),
});

platformCommsRouter.get('/announcements', requirePermission('announcements:manage'), async (_req, res) => {
  const rows = await q(
    `SELECT a.id, a.title, a.body, a.severity, a.business_id, a.starts_at, a.ends_at, a.active, a.channels, a.audience, a.published_at, a.recipient_count, a.created_at, b.name AS business_name,
            (SELECT COUNT(*) FROM notifications n WHERE n.resource_type = 'announcement' AND n.resource_id = a.id::text) AS delivered_in_app,
            (SELECT COUNT(*) FROM notifications n WHERE n.resource_type = 'announcement' AND n.resource_id = a.id::text AND n.read_at IS NOT NULL) AS read_count,
            (SELECT COUNT(*) FROM email_messages m JOIN email_campaigns c ON c.id = m.campaign_id WHERE c.announcement_id = a.id AND m.status IN ('sent', 'delivered')) AS emails_sent
     FROM announcements a LEFT JOIN businesses b ON b.id = a.business_id ORDER BY a.created_at DESC LIMIT 100`,
  );
  res.json({ rows: rows.map((row) => ({ ...row, delivered_in_app: num(row.delivered_in_app), read_count: num(row.read_count), emails_sent: num(row.emails_sent) })) });
});

export async function publishAnnouncement(announcement: Announcement) {
  const claimed = await q(`UPDATE announcements SET published_at = now() WHERE id = $1 AND published_at IS NULL AND active RETURNING id`, [announcement.id]);
  if (!claimed.length) return 0;
  const audience = (announcement.audience ?? { type: announcement.business_id ? 'organizations' : 'all', business_ids: announcement.business_id ? [announcement.business_id] : undefined, recipients: 'all_users' }) as Audience;
  const recipients = audienceSchema.parse(audience);
  const users = await q(
    `SELECT u.id, u.business_id FROM users u JOIN businesses b ON b.id = u.business_id LEFT JOIN business_platform_states st ON st.business_id = b.id
     WHERE u.active
       AND ($1 = 'all_users' OR u.role = 'OWNER')
       AND ($2 <> 'organizations' OR b.id = ANY($3::uuid[]))
       AND ($2 <> 'plan' OR COALESCE(st.plan, 'free') = $4)
       AND ($2 <> 'status' OR (${ORG_STATUS_SQL}) = $6)
       AND ($5::uuid[] IS NULL OR u.id = ANY($5::uuid[]))`,
    [recipients.user_ids?.length ? 'all_users' : recipients.recipients, recipients.type, recipients.business_ids ?? [], recipients.plan ?? null, recipients.user_ids?.length ? recipients.user_ids : null, recipients.status ?? null],
  );
  if (announcement.channels !== 'email') {
    for (const user of users) {
      await q(
        `INSERT INTO notifications (id, recipient_user_id, business_id, category, priority, title, message, resource_type, resource_id, dedupe_key, created_at)
         VALUES ($1, $2, $3, 'announcements', $4, $5, $6, 'announcement', $7, $8, now()) ON CONFLICT DO NOTHING`,
        [randomUUID(), user.id, user.business_id, announcement.severity === 'critical' ? 'critical' : announcement.severity === 'warning' ? 'high' : 'normal', announcement.title, announcement.body, announcement.id, `announcement:${announcement.id}`],
      );
    }
  }
  await q(`UPDATE announcements SET recipient_count = $2 WHERE id = $1`, [announcement.id, users.length]);
  return users.length;
}

export async function publishDueAnnouncements() {
  const due = await AppDataSource.getRepository(Announcement).createQueryBuilder('a')
    .where('a.published_at IS NULL AND a.active = true AND a.starts_at <= now()').limit(10).getMany();
  for (const announcement of due) await publishAnnouncement(announcement);
}

platformCommsRouter.post('/announcements', requirePermission('announcements:manage'), async (req: PlatformRequest, res) => {
  const body = announcementSchema.parse(req.body);
  const audience: Audience = body.audience ?? (body.business_id
    ? { type: 'organizations', business_ids: [body.business_id], recipients: 'all_users' }
    : { type: 'all', recipients: 'all_users' });
  if (body.channels !== 'in_app' && audience.type === 'all' && body.confirm_all !== true) {
    res.status(400).json({ error: 'Confirm that this email goes to every organization.', code: 'CONFIRM_ALL_REQUIRED' });
    return;
  }
  const now = new Date();
  const startsAt = body.starts_at && body.starts_at > now ? body.starts_at : now;
  const repo = AppDataSource.getRepository(Announcement);
  const announcement = await repo.save(repo.create({
    id: randomUUID(), title: body.title, body: body.body, severity: body.severity,
    business_id: body.business_id ?? (audience.type === 'organizations' && audience.business_ids?.length === 1 ? audience.business_ids[0] : null),
    starts_at: startsAt, ends_at: body.ends_at ?? null, active: true, channels: body.channels, audience, published_at: null, recipient_count: 0, created_by: req.admin!.id, created_at: now,
  }));
  let emailRecipients = 0;
  if (body.channels !== 'in_app') {
    const template = await resolveTemplate(body.template);
    const summary = audienceSummary(await resolveAudience(audience));
    emailRecipients = summary.recipients;
    const campaignId = await createCampaign({
      adminId: req.admin!.id, adminEmail: req.admin!.email, subject: template!.subject.replace('{{title}}', body.title), heading: template!.heading.replace('{{title}}', body.title),
      body: template!.body.replace('{{message}}', body.body), actionLabel: template!.action_label ?? null, category: 'announcements', audience,
      scheduledFor: startsAt, announcementId: announcement.id, recipientCount: summary.recipients, organizationCount: summary.organizations,
    });
    if (startsAt <= now) void dispatchCampaign(campaignId).catch((error) => console.error('Announcement email failed', error));
  }
  if (startsAt <= now) await publishAnnouncement(announcement);
  await recordPlatformAudit({ req, admin: req.admin, action: 'announcement.created', targetType: 'announcement', targetId: announcement.id, businessId: announcement.business_id, metadata: { title: body.title, channels: body.channels, audience, starts_at: startsAt, email_recipients: emailRecipients } });
  res.status(201).json({ announcement });
});

platformCommsRouter.patch('/announcements/:id', requirePermission('announcements:manage'), async (req: PlatformRequest, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({ active: z.boolean() }).parse(req.body);
  await AppDataSource.getRepository(Announcement).update(id, { active: body.active, ...(body.active ? {} : { ends_at: new Date() }) });
  if (!body.active) await q(`UPDATE email_campaigns SET status = 'cancelled' WHERE announcement_id = $1 AND status = 'scheduled'`, [id]);
  await recordPlatformAudit({ req, admin: req.admin, action: body.active ? 'announcement.activated' : 'announcement.ended', targetType: 'announcement', targetId: id });
  res.json({ ok: true });
});

const webhookEvent = z.object({
  message_id: z.string().uuid().optional(),
  provider_message_id: z.string().max(300).optional(),
  event: z.enum(['delivered', 'bounced', 'complained', 'failed', 'dropped']),
  reason: z.string().max(500).optional(),
  email: z.string().email().optional(),
});

export const emailWebhookRouter = Router();

emailWebhookRouter.post('/email', async (req: Request, res: Response) => {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  const given = String(req.headers['x-mia-webhook-secret'] ?? '');
  if (!secret) {
    res.status(503).json({ error: 'Email webhooks are not configured' });
    return;
  }
  if (given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const events = z.array(webhookEvent).max(500).parse(Array.isArray(req.body?.events) ? req.body.events : [req.body]);
  let updated = 0;
  for (const event of events) {
    const status = event.event === 'delivered' ? 'delivered' : event.event === 'bounced' || event.event === 'complained' ? 'bounced' : 'failed';
    const rows = await q(
      `UPDATE email_messages SET status = $3, delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE delivered_at END,
              last_error = CASE WHEN $3 <> 'delivered' THEN $4 ELSE last_error END, updated_at = now()
       WHERE (($1::uuid IS NOT NULL AND id = $1) OR ($2::text IS NOT NULL AND provider_message_id = $2))
         AND NOT (status = 'delivered' AND $3 = 'delivered') AND status <> 'bounced'
       RETURNING to_email`,
      [event.message_id ?? null, event.provider_message_id ?? null, status, event.reason ?? event.event],
    );
    updated += rows.length;
    if (status === 'bounced') {
      const email = (event.email ?? rows[0]?.to_email)?.toLowerCase();
      if (email) await q(`INSERT INTO email_suppressions (email, reason, created_at) VALUES ($1, $2, now()) ON CONFLICT (email) DO NOTHING`, [email, event.reason ?? event.event]);
    }
  }
  res.json({ ok: true, updated });
});
