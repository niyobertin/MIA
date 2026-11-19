import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type PlatformRole = 'SUPER_ADMIN' | 'SUPPORT' | 'FINANCE';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';
export type SupportLevel = 1 | 2 | 3 | 4;

@Entity('platform_admins')
export class PlatformAdmin {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', unique: true })
  email!: string;

  @Column({ type: 'text' })
  password_hash!: string;

  @Column({ type: 'text' })
  role!: PlatformRole;

  @Column({ type: 'text', nullable: true })
  totp_secret!: string | null;

  @Column({ type: 'boolean', default: false })
  totp_enabled!: boolean;

  @Column({ type: 'bigint', default: 0, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  totp_last_step!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'integer', default: 0 })
  failed_attempts!: number;

  @Column({ type: 'timestamptz', nullable: true })
  locked_until!: Date | null;

  @Column({ type: 'boolean', default: false })
  must_change_password!: boolean;

  @Column({ type: 'integer', default: 0 })
  token_version!: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_login_at!: Date | null;

  @Column({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('platform_login_codes')
export class PlatformLoginCode {
  @PrimaryColumn('uuid')
  admin_id!: string;

  @Column({ type: 'text' })
  code_hash!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz' })
  created_at!: Date;
}

@Entity('platform_audit_logs')
export class PlatformAuditLog {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  admin_id!: string | null;

  @Column({ type: 'text', nullable: true })
  admin_email!: string | null;

  @Index()
  @Column({ type: 'text' })
  action!: string;

  @Column({ type: 'text', nullable: true })
  target_type!: string | null;

  @Column({ type: 'text', nullable: true })
  target_id!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  business_id!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  ip!: string | null;

  @Column({ type: 'text', default: 'success' })
  result!: 'success' | 'failed' | 'denied';

  @Column({ type: 'text', nullable: true })
  prev_hash!: string | null;

  @Column({ type: 'text', nullable: true })
  hash!: string | null;

  @Index()
  @Column({ type: 'timestamptz' })
  created_at!: Date;
}

@Entity('business_platform_states')
export class BusinessPlatformState {
  @PrimaryColumn('uuid')
  business_id!: string;

  @Column({ type: 'text', default: 'active' })
  status!: 'active' | 'suspended';

  @Column({ type: 'text', nullable: true })
  suspended_reason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  suspended_at!: Date | null;

  @Column({ type: 'text', default: 'free' })
  plan!: string;

  @Column({ type: 'text', default: 'trial' })
  subscription_status!: SubscriptionStatus;

  @Column({ type: 'text', nullable: true })
  billing_period!: 'monthly' | 'yearly' | null;

  @Column({ type: 'bigint', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) } })
  plan_amount!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  subscription_started_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  trial_ends_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  current_period_end!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  feature_flags!: Record<string, boolean>;

  @Column({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('subscription_invoices')
export class SubscriptionInvoice {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  amount!: number;

  @Column({ type: 'text', default: 'RWF' })
  currency!: string;

  @Column({ type: 'date' })
  period_start!: string;

  @Column({ type: 'date' })
  period_end!: string;

  @Column({ type: 'text', default: 'open' })
  status!: 'open' | 'paid' | 'void';

  @Column({ type: 'text', nullable: true })
  payment_method!: string | null;

  @Column({ type: 'text', nullable: true })
  payment_reference!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paid_at!: Date | null;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'timestamptz' })
  created_at!: Date;
}

@Entity('support_access_grants')
export class SupportAccessGrant {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  admin_id!: string;

  @Column({ type: 'text' })
  admin_name!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'integer', default: 2 })
  level!: SupportLevel;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  @Column({ type: 'timestamptz' })
  created_at!: Date;
}

@Entity('data_requests')
export class DataRequest {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'text' })
  type!: 'export' | 'deletion';

  @Column({ type: 'text', default: 'open' })
  status!: 'open' | 'in_progress' | 'completed' | 'rejected';

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at!: Date | null;

  @Column({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('announcements')
export class Announcement {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'text', default: 'info' })
  severity!: 'info' | 'warning' | 'critical';

  @Column({ type: 'uuid', nullable: true })
  business_id!: string | null;

  @Column({ type: 'timestamptz' })
  starts_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ends_at!: Date | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'text', default: 'in_app' })
  channels!: 'in_app' | 'email' | 'both';

  @Column({ type: 'jsonb', nullable: true })
  audience!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  published_at!: Date | null;

  @Column({ type: 'integer', default: 0 })
  recipient_count!: number;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'timestamptz' })
  created_at!: Date;
}

@Entity('pin_help_requests')
export class PinHelpRequest {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  identifier!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  user_id!: string | null;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  contact_phone!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Index()
  @Column({ type: 'text', default: 'open' })
  status!: 'open' | 'resolved' | 'rejected';

  @Column({ type: 'uuid', nullable: true })
  resolved_by!: string | null;

  @Column({ type: 'text', nullable: true })
  resolution_note!: string | null;

  @Column({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryColumn('text')
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'bigint', default: 0, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  monthly_price!: number;

  @Column({ type: 'text', default: 'RWF' })
  currency!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('user_login_events')
export class UserLoginEvent {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  business_id!: string | null;

  @Column({ type: 'boolean' })
  success!: boolean;

  @Column({ type: 'text', nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent!: string | null;

  @Index()
  @Column({ type: 'timestamptz' })
  created_at!: Date;
}

export type NotificationCategory =
  | 'security' | 'users' | 'businesses' | 'subscriptions' | 'payments' | 'sync' | 'operations' | 'announcements' | 'support';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

@Entity('notifications')
@Index(['recipient_admin_id', 'dedupe_key'], { unique: true, where: '"dedupe_key" IS NOT NULL AND "recipient_admin_id" IS NOT NULL' })
@Index(['recipient_user_id', 'dedupe_key'], { unique: true, where: '"dedupe_key" IS NOT NULL AND "recipient_user_id" IS NOT NULL' })
export class Notification {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  recipient_admin_id!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  recipient_user_id!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  business_id!: string | null;

  @Column({ type: 'text' })
  category!: NotificationCategory;

  @Column({ type: 'text', default: 'normal' })
  priority!: NotificationPriority;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'text', nullable: true })
  action_url!: string | null;

  @Column({ type: 'text', nullable: true })
  resource_type!: string | null;

  @Column({ type: 'text', nullable: true })
  resource_id!: string | null;

  @Column({ type: 'text', nullable: true })
  dedupe_key!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  read_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dismissed_at!: Date | null;

  @Index()
  @Column({ type: 'timestamptz' })
  created_at!: Date;
}

@Entity('email_templates')
export class EmailTemplate {
  @PrimaryColumn('text')
  key!: string;

  @PrimaryColumn('text')
  locale!: string;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ type: 'text' })
  heading!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'text', nullable: true })
  action_label!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'uuid', nullable: true })
  updated_by!: string | null;

  @Column({ type: 'timestamptz' })
  updated_at!: Date;
}

export type EmailStatus = 'queued' | 'processing' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'suppressed';

@Entity('email_messages')
export class EmailMessage {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'text', nullable: true })
  template_key!: string | null;

  @Index()
  @Column({ type: 'text' })
  category!: string;

  @Index()
  @Column({ type: 'text' })
  to_email!: string;

  @Column({ type: 'text', nullable: true })
  to_name!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  business_id!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  campaign_id!: string | null;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ type: 'text', nullable: true })
  html!: string | null;

  @Column({ type: 'text', nullable: true })
  text!: string | null;

  @Column({ type: 'boolean', default: false })
  sensitive!: boolean;

  @Index()
  @Column({ type: 'text', default: 'queued' })
  status!: EmailStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  next_attempt_at!: Date | null;

  @Column({ type: 'text', nullable: true })
  last_error!: string | null;

  @Index()
  @Column({ type: 'text', nullable: true })
  provider_message_id!: string | null;

  @Index({ unique: true, where: '"idempotency_key" IS NOT NULL' })
  @Column({ type: 'text', nullable: true })
  idempotency_key!: string | null;

  @Index()
  @Column({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sent_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  delivered_at!: Date | null;

  @Column({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('email_campaigns')
export class EmailCampaign {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'text' })
  admin_email!: string;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ type: 'text' })
  heading!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'text', nullable: true })
  action_label!: string | null;

  @Column({ type: 'text', nullable: true })
  action_url!: string | null;

  @Column({ type: 'text', default: 'announcements' })
  category!: string;

  @Column({ type: 'jsonb' })
  audience!: Record<string, unknown>;

  @Column({ type: 'integer', default: 0 })
  recipient_count!: number;

  @Column({ type: 'integer', default: 0 })
  organization_count!: number;

  @Index()
  @Column({ type: 'text', default: 'scheduled' })
  status!: 'scheduled' | 'sending' | 'completed' | 'cancelled';

  @Index()
  @Column({ type: 'timestamptz' })
  scheduled_for!: Date;

  @Column({ type: 'uuid', nullable: true })
  announcement_id!: string | null;

  @Column({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at!: Date | null;
}

@Entity('email_suppressions')
export class EmailSuppression {
  @PrimaryColumn('text')
  email!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'timestamptz' })
  created_at!: Date;
}
