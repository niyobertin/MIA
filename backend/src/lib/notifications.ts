import { randomUUID } from 'crypto';
import { AppDataSource } from '../data-source';
import { PlatformAdmin, type NotificationCategory, type NotificationPriority } from '../entities';
import { platformPermissionsFor, type PlatformPermission } from './rbac';
import { emitToAdmin } from './realtime';

export type NotificationInput = {
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  actionUrl?: string | null;
  businessId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  dedupeKey?: string | null;
};

const NOTIFICATION_COLUMNS = 'id, business_id, category, priority, title, message, action_url, resource_type, resource_id, read_at, created_at';

export async function unreadCount(adminId: string) {
  const [row] = await AppDataSource.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE recipient_admin_id = $1 AND read_at IS NULL AND dismissed_at IS NULL`,
    [adminId],
  );
  return Number(row.count);
}

export async function notifyAdmin(adminId: string, input: NotificationInput) {
  const rows = await AppDataSource.query(
    `INSERT INTO notifications (id, recipient_admin_id, business_id, category, priority, title, message, action_url, resource_type, resource_id, dedupe_key, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT DO NOTHING
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [randomUUID(), adminId, input.businessId ?? null, input.category, input.priority ?? 'normal', input.title, input.message, input.actionUrl ?? null, input.resourceType ?? null, input.resourceId ?? null, input.dedupeKey ?? null],
  );
  if (rows.length === 0) return null;
  emitToAdmin(adminId, 'notification:new', { notification: rows[0], unread: await unreadCount(adminId) });
  return rows[0];
}

export async function notifyAdmins(input: NotificationInput & { permission?: PlatformPermission; exceptAdminId?: string | null }) {
  try {
    const admins = await AppDataSource.getRepository(PlatformAdmin).find({ where: { active: true } });
    const recipients = admins.filter((admin) => admin.id !== input.exceptAdminId && (!input.permission || platformPermissionsFor(admin.role).includes(input.permission)));
    await Promise.all(recipients.map((admin) => notifyAdmin(admin.id, input)));
    return recipients.length;
  } catch (error) {
    console.error('Could not create notifications', error);
    return 0;
  }
}

export function broadcastReadState(adminId: string, change: { ids?: string[]; all?: boolean; removed?: string[] }, unread: number) {
  emitToAdmin(adminId, 'notification:sync', { ...change, unread });
}

export { NOTIFICATION_COLUMNS };
