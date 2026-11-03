import 'reflect-metadata';
import { randomInt } from 'crypto';
import dotenv from 'dotenv';
import { ILike } from 'typeorm';
import { initDatabase, AppDataSource } from '../data-source';
import { User } from '../entities';
import { hashPassword } from '../lib/auth';
import { isWeakPin, PIN_LENGTH } from '../lib/pin';

dotenv.config();

function temporaryPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
    if (!isWeakPin(pin)) return pin;
  }
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run user:reset-pin -- <email>');
    process.exit(1);
  }

  await initDatabase();
  const users = AppDataSource.getRepository(User);
  const user = await users.findOne({ where: { email: ILike(email) } });
  if (!user) {
    console.error(`No account found for ${email}`);
    process.exit(1);
  }
  if (!user.active) {
    console.error(`${email} is deactivated. Reactivate it before resetting the PIN.`);
    process.exit(1);
  }

  const pin = temporaryPin();
  await users.update(user.id, {
    password_hash: await hashPassword(pin),
    failed_login_attempts: 0,
    locked_until: null,
    must_change_pin: true,
    updated_at: new Date(),
  });

  console.log(`Temporary PIN for ${user.name} <${user.email}> (${user.role ?? 'no role'}): ${pin}`);
  console.log('Give it to the owner only after confirming who they are. They must choose a new PIN when they sign in.');
  await AppDataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
