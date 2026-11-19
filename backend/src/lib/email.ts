import { randomUUID } from 'crypto';
import { AppDataSource } from '../data-source';
import { sql } from './db';
import { EmailMessage, EmailTemplate } from '../entities';
import { sendMail } from './mailer';
import { DEFAULT_TEMPLATES, TEMPLATE_BY_KEY, TEMPLATE_VARIABLES, type TemplateDefinition } from './emailTemplates';

const q = sql;

export const SUPPORT_EMAIL = () => process.env.SUPPORT_EMAIL ?? 'support@mia.rw';
const APP_URL = () => (process.env.PUBLIC_DASHBOARD_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const MAX_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ResolvedTemplate = TemplateDefinition & { locale: string; active: boolean; customized: boolean; updated_at: Date | null };

export async function resolveTemplate(key: string, locale = 'en'): Promise<ResolvedTemplate | null> {
  const base = TEMPLATE_BY_KEY.get(key);
  if (!base) return null;
  const rows = await AppDataSource.getRepository(EmailTemplate).find({ where: [{ key, locale }, { key, locale: 'en' }] });
  const row = rows.find((item) => item.locale === locale) ?? rows.find((item) => item.locale === 'en');
  return {
    ...base,
    locale: row?.locale ?? 'en',
    subject: row?.subject ?? base.subject,
    heading: row?.heading ?? base.heading,
    body: row?.body ?? base.body,
    action_label: row?.action_label ?? base.action_label,
    active: row?.active ?? true,
    customized: Boolean(row),
    updated_at: row?.updated_at ?? null,
  };
}

export async function listTemplates(locale = 'en') {
  return Promise.all(DEFAULT_TEMPLATES.map((template) => resolveTemplate(template.key, locale))) as Promise<ResolvedTemplate[]>;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function placeholders(text: string) {
  return [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((match) => match[1]))];
}

export function unknownPlaceholders(...texts: string[]) {
  const allowed = new Set<string>(TEMPLATE_VARIABLES);
  return [...new Set(texts.flatMap(placeholders))].filter((name) => !allowed.has(name));
}

function substitute(text: string, variables: Record<string, string>, html: boolean) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, name: string) => {
    const value = variables[name] ?? '';
    return html ? escapeHtml(value) : value;
  });
}

export type RenderInput = { subject: string; heading: string; body: string; action_label?: string | null; security_notice?: boolean };

export function renderEmail(template: RenderInput, rawVariables: Record<string, string | null | undefined>) {
  const variables: Record<string, string> = { support_email: SUPPORT_EMAIL(), action_url: APP_URL(), ...Object.fromEntries(Object.entries(rawVariables).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => [key, String(value)])) };
  const subject = substitute(template.subject, variables, false).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const heading = substitute(template.heading, variables, true);
  const paragraphs = template.body.split(/\n{2,}/).map((block) => substitute(block, variables, true).replace(/\n/g, '<br>'));
  const code = variables.verification_code ? escapeHtml(variables.verification_code) : null;
  const actionUrl = variables.action_url && /^https?:\/\//.test(variables.action_url) ? escapeHtml(variables.action_url) : null;
  const logo = `${APP_URL()}/mia.png`;
  const greeting = `Hello ${escapeHtml(variables.recipient_name ?? 'there')},`;
  const font = "font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f9fc;${font};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f9fc;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e6ebf2;border-radius:16px;">
<tr><td style="padding:28px 32px 8px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><img src="${escapeHtml(logo)}" width="44" height="44" alt="MIA" style="display:block;border:0;border-radius:10px;"></td>
<td style="vertical-align:middle;padding-left:12px;${font};font-size:18px;font-weight:800;color:#10192b;">MIA Platform</td></tr></table></td></tr>
<tr><td style="padding:16px 32px 0 32px;"><h1 style="margin:0;${font};font-size:22px;line-height:30px;font-weight:800;color:#14213d;">${heading}</h1></td></tr>
<tr><td style="padding:16px 32px 0 32px;${font};font-size:15px;line-height:24px;color:#334155;">
<p style="margin:0 0 14px 0;">${greeting}</p>
${paragraphs.map((p) => `<p style="margin:0 0 14px 0;">${p}</p>`).join('\n')}
</td></tr>
${code ? `<tr><td align="center" style="padding:8px 32px 8px 32px;"><div style="display:inline-block;background:#e7f6ef;border:1px solid #b7e4cf;border-radius:12px;padding:14px 28px;${font};font-size:32px;letter-spacing:8px;font-weight:800;color:#0f7d54;">${code}</div></td></tr>` : ''}
${actionUrl && template.action_label ? `<tr><td align="left" style="padding:12px 32px 4px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#159b69" style="border-radius:10px;"><a href="${actionUrl}" target="_blank" style="display:inline-block;padding:12px 22px;${font};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(substitute(template.action_label, variables, false))}</a></td></tr></table></td></tr>` : ''}
${template.security_notice ? `<tr><td style="padding:12px 32px 0 32px;"><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;${font};font-size:13px;line-height:20px;color:#9a3412;">If you did not expect this email, do not share any codes, change your password, and contact ${escapeHtml(variables.support_email)}.</div></td></tr>` : ''}
<tr><td style="padding:24px 32px 28px 32px;${font};font-size:13px;line-height:20px;color:#64748b;border-top:1px solid #e6ebf2;">
Need help? Contact <a href="mailto:${escapeHtml(variables.support_email)}" style="color:#159b69;">${escapeHtml(variables.support_email)}</a>.<br>
MIA &mdash; Manage | Insight | Achieve &middot; Kigali, Rwanda
</td></tr></table>
<p style="margin:16px 0 0 0;${font};font-size:12px;color:#94a3b8;">You received this email because you have an account on MIA.</p>
</td></tr></table></body></html>`;
  const text = [
    substitute(template.heading, variables, false),
    '',
    `Hello ${variables.recipient_name ?? 'there'},`,
    '',
    substitute(template.body, variables, false),
    ...(variables.verification_code ? ['', `Code: ${variables.verification_code}`] : []),
    ...(actionUrl && template.action_label ? ['', `${substitute(template.action_label, variables, false)}: ${variables.action_url}`] : []),
    ...(template.security_notice ? ['', `If you did not expect this email, contact ${variables.support_email}.`] : []),
    '',
    `Need help? ${variables.support_email}`,
  ].join('\n');
  return { subject, html, text };
}

export function missingVariables(template: TemplateDefinition, variables: Record<string, unknown>) {
  return template.required.filter((name) => name !== 'support_email' && name !== 'action_url' && (variables[name] === undefined || variables[name] === null || variables[name] === ''));
}

export async function isSuppressed(email: string) {
  const rows = await q(`SELECT 1 FROM email_suppressions WHERE email = $1`, [email.toLowerCase()]);
  return rows.length > 0;
}

type QueueInput = {
  template: string;
  to: string;
  variables: Record<string, string | null | undefined>;
  businessId?: string | null;
  campaignId?: string | null;
  idempotencyKey?: string | null;
  locale?: string;
};

export async function queueTemplateEmail(input: QueueInput) {
  try {
    const template = await resolveTemplate(input.template, input.locale);
    if (!template) throw new Error(`Unknown email template ${input.template}`);
    if (!template.active) return null;
    const missing = missingVariables(template, input.variables);
    if (missing.length) throw new Error(`Missing variables for ${input.template}: ${missing.join(', ')}`);
    const rendered = renderEmail(template, input.variables);
    return await queueRendered({
      to: input.to,
      toName: input.variables.recipient_name ?? null,
      templateKey: template.key,
      category: template.category,
      businessId: input.businessId ?? null,
      campaignId: input.campaignId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      ...rendered,
    });
  } catch (error) {
    console.error('Could not queue email', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function queueRendered(input: { to: string; toName: string | null; templateKey: string | null; category: string; businessId: string | null; campaignId: string | null; idempotencyKey: string | null; subject: string; html: string; text: string }) {
  const email = input.to.trim().toLowerCase();
  const now = new Date();
  const valid = EMAIL_PATTERN.test(email);
  const suppressed = valid && await isSuppressed(email);
  const rows = await q(
    `INSERT INTO email_messages (id, template_key, category, to_email, to_name, business_id, campaign_id, subject, html, text, sensitive, status, attempts, next_attempt_at, last_error, idempotency_key, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11, 0, $12, $13, $14, $15, $15)
     ON CONFLICT DO NOTHING RETURNING id`,
    [randomUUID(), input.templateKey, input.category, email, input.toName, input.businessId, input.campaignId, input.subject, input.html, input.text,
      !valid ? 'failed' : suppressed ? 'suppressed' : 'queued', valid && !suppressed ? now : null, !valid ? 'Invalid email address' : suppressed ? 'Address is on the suppression list' : null, input.idempotencyKey, now],
  );
  if (rows[0]) kickWorker();
  return rows[0]?.id ?? null;
}

export async function sendSensitiveTemplateEmail(input: { template: string; to: string; variables: Record<string, string>; businessId?: string | null }) {
  const template = await resolveTemplate(input.template);
  if (!template) throw new Error(`Unknown email template ${input.template}`);
  const missing = missingVariables(template, input.variables);
  if (missing.length) throw new Error(`Missing variables for ${input.template}: ${missing.join(', ')}`);
  const rendered = renderEmail(template, input.variables);
  const id = randomUUID();
  const now = new Date();
  const record = { id, template_key: template.key, category: template.category, to_email: input.to.toLowerCase(), to_name: input.variables.recipient_name ?? null, business_id: input.businessId ?? null, campaign_id: null, subject: rendered.subject, html: null, text: null, sensitive: true, attempts: 1, next_attempt_at: null, idempotency_key: null, created_at: now, updated_at: now, delivered_at: null };
  try {
    const result = await sendMail({ to: input.to, subject: rendered.subject, html: rendered.html, text: rendered.text });
    await AppDataSource.getRepository(EmailMessage).insert({ ...record, status: 'sent', provider_message_id: result.messageId, sent_at: new Date(), last_error: null });
  } catch (error) {
    await AppDataSource.getRepository(EmailMessage).insert({ ...record, status: 'failed', provider_message_id: null, sent_at: null, last_error: error instanceof Error ? error.message.slice(0, 300) : 'Send failed' });
    throw error;
  }
}

export async function ownerEmailsFor(businessId: string) {
  return q(`SELECT name, email FROM users WHERE business_id = $1 AND role = 'OWNER' AND active AND email IS NOT NULL`, [businessId]) as Promise<{ name: string; email: string }[]>;
}

export async function emailOwners(businessId: string, template: string, variables: Record<string, string | null | undefined>, idempotencyKey?: string) {
  const [business] = await q(`SELECT name FROM businesses WHERE id = $1`, [businessId]);
  for (const owner of await ownerEmailsFor(businessId)) {
    await queueTemplateEmail({
      template,
      to: owner.email,
      businessId,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:${owner.email}` : null,
      variables: { organization_name: business?.name, ...variables, recipient_name: owner.name },
    });
  }
}

let working = false;
let timer: ReturnType<typeof setInterval> | null = null;
let kickPending: ReturnType<typeof setTimeout> | null = null;

function kickWorker() {
  if (kickPending || process.env.EMAIL_WORKER === 'false') return;
  const handle = setTimeout(() => {
    kickPending = null;
    void processEmailQueue();
  }, 250);
  (handle as { unref?: () => void }).unref?.();
  kickPending = handle;
}

export async function processEmailQueue(limit = Number(process.env.EMAIL_BATCH_SIZE ?? 20)) {
  if (working) return 0;
  working = true;
  let processed = 0;
  try {
    const claimed = await AppDataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT id FROM email_messages WHERE status = 'queued' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [limit],
      ) as { id: string }[];
      if (rows.length) await manager.query(`UPDATE email_messages SET status = 'processing', updated_at = now() WHERE id = ANY($1::uuid[])`, [rows.map((row) => row.id)]);
      return rows.map((row) => row.id);
    });
    for (const id of claimed) {
      const [message] = await q(`SELECT id, to_email, subject, html, text, attempts FROM email_messages WHERE id = $1`, [id]);
      try {
        const result = await sendMail({ to: message.to_email, subject: message.subject, html: message.html ?? undefined, text: message.text ?? '', headers: { 'X-MIA-Message-ID': id } });
        await q(`UPDATE email_messages SET status = 'sent', attempts = attempts + 1, provider_message_id = $2, sent_at = now(), last_error = NULL, updated_at = now() WHERE id = $1`, [id, result.messageId]);
      } catch (error) {
        const attempts = Number(message.attempts) + 1;
        const errorText = error instanceof Error ? error.message.slice(0, 300) : 'Send failed';
        const permanent = /invalid|does not exist|mailbox unavailable|5\d\d/i.test(errorText) && !/rate|throttl|try again/i.test(errorText);
        const giveUp = permanent || attempts >= MAX_ATTEMPTS;
        await q(
          `UPDATE email_messages SET status = $2, attempts = $3, last_error = $4, next_attempt_at = $5, updated_at = now() WHERE id = $1`,
          [id, giveUp ? 'failed' : 'queued', attempts, errorText, giveUp ? null : new Date(Date.now() + 2 ** attempts * 30_000)],
        );
      }
      processed += 1;
    }
  } catch (error) {
    console.error('Email queue run failed', error);
  } finally {
    working = false;
  }
  return processed;
}

export async function startEmailWorker() {
  if (timer || process.env.EMAIL_WORKER === 'false') return;
  await q(`UPDATE email_messages SET status = 'queued', next_attempt_at = now() WHERE status = 'processing' AND updated_at < now() - interval '5 minutes'`).catch(() => undefined);
  const handle = setInterval(() => {
    void processEmailQueue();
    void import('./campaigns').then(({ dispatchDueCampaigns }) => dispatchDueCampaigns()).catch((error) => console.error('Campaign dispatch failed', error));
    void import('../routes/platformComms').then(({ publishDueAnnouncements }) => publishDueAnnouncements()).catch((error) => console.error('Announcement publishing failed', error));
  }, Number(process.env.EMAIL_WORKER_INTERVAL_MS ?? 5000));
  (handle as { unref?: () => void }).unref?.();
  timer = handle;
}

export function formatEventTime(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kigali', timeZoneName: 'short' }).format(date);
}
