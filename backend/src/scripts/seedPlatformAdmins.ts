import 'reflect-metadata';
import dotenv from 'dotenv';
import { ILike } from 'typeorm';
import { AppDataSource, initDatabase } from '../data-source';
import { PlatformAdmin, type PlatformRole } from '../entities';
import { hashPassword } from '../lib/auth';
import { platformPasswordSchema } from '../lib/platformAuth';

dotenv.config();

const DEV_ADMINS: { id: string; name: string; email: string; role: PlatformRole; password: string }[] = [
  { id: 'b1000000-0000-4000-8000-000000000001', name: 'MIA Super Admin', email: 'superadmin@mia.rw', role: 'SUPER_ADMIN', password: 'SuperAdmin#2026' },
  { id: 'b1000000-0000-4000-8000-000000000002', name: 'MIA Support', email: 'support@mia.rw', role: 'SUPPORT', password: 'SupportTeam#2026' },
  { id: 'b1000000-0000-4000-8000-000000000003', name: 'MIA Finance', email: 'finance@mia.rw', role: 'FINANCE', password: 'FinanceTeam#2026' },
];

export async function seedPlatformAdmins() {
  const production = process.env.NODE_ENV === 'production';
  const repo = AppDataSource.getRepository(PlatformAdmin);
  const now = new Date();

  if (production) {
    const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.PLATFORM_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error('In production set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD. Development credentials are never created there.');
    }
    platformPasswordSchema.parse(password);
    if (await repo.findOne({ where: { email: ILike(email) } })) {
      console.log(`${email} already exists; nothing changed.`);
      return;
    }
    await repo.save(repo.create({
      id: DEV_ADMINS[0].id,
      name: 'MIA Super Admin',
      email,
      role: 'SUPER_ADMIN',
      password_hash: await hashPassword(password),
      must_change_password: true,
      created_at: now,
      updated_at: now,
    }));
    console.log(`Created super admin ${email}. Password change and two-factor setup are required on first sign-in.`);
    return;
  }

  for (const admin of DEV_ADMINS) {
    const existing = await repo.findOne({ where: { id: admin.id } });
    await repo.save(repo.create({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      password_hash: await hashPassword(admin.password),
      totp_enabled: existing?.totp_enabled ?? false,
      totp_secret: existing?.totp_secret ?? null,
      totp_last_step: existing?.totp_last_step ?? 0,
      active: true,
      failed_attempts: 0,
      locked_until: null,
      must_change_password: false,
      token_version: existing?.token_version ?? 0,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }));
    console.log(`  ${admin.role.padEnd(12)} ${admin.email} / ${admin.password}`);
  }
}

if (require.main === module) {
  (async () => {
    await initDatabase({ synchronize: process.env.TYPEORM_SYNC !== 'false', onUnsafe: 'skip' });
    console.log('Platform admin logins:');
    await seedPlatformAdmins();
    await AppDataSource.destroy();
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
