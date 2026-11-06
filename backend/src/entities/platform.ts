import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type PlatformRole = 'SUPER_ADMIN' | 'SUPPORT' | 'FINANCE';

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
  subscription_status!: 'trial' | 'active' | 'past_due' | 'cancelled';

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

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'timestamptz' })
  created_at!: Date;
}
