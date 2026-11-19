import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../lib/db';
import { broadcastReadState, NOTIFICATION_COLUMNS, unreadCount } from '../lib/notifications';
import { hasPlatformPermission } from '../lib/rbac';
import type { PlatformRequest } from '../middleware/platform';

export const platformNotificationsRouter = Router();

const q = sql;
const CATEGORIES = ['security', 'users', 'businesses', 'subscriptions', 'payments', 'sync', 'operations', 'announcements', 'support'] as const;

platformNotificationsRouter.get('/notifications', async (req: PlatformRequest, res) => {
  const query = z.object({
    category: z.enum(['all', ...CATEGORIES]).default('all'),
    status: z.enum(['all', 'unread']).default('all'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);
  const params = [req.admin!.id, query.category, query.status];
  const where = `recipient_admin_id = $1 AND dismissed_at IS NULL AND ($2 = 'all' OR category = $2) AND ($3 = 'all' OR read_at IS NULL)`;
  const [rows, [count], unread] = await Promise.all([
    q(`SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`, [...params, query.limit, query.offset]),
    q(`SELECT COUNT(*) AS total FROM notifications WHERE ${where}`, params),
    unreadCount(req.admin!.id),
  ]);
  res.json({ total: Number(count.total), unread, rows });
});

platformNotificationsRouter.get('/notifications/unread-count', async (req: PlatformRequest, res) => {
  res.json({ unread: await unreadCount(req.admin!.id) });
});

platformNotificationsRouter.post('/notifications/read-all', async (req: PlatformRequest, res) => {
  await q(`UPDATE notifications SET read_at = now() WHERE recipient_admin_id = $1 AND read_at IS NULL`, [req.admin!.id]);
  broadcastReadState(req.admin!.id, { all: true }, 0);
  res.json({ ok: true, unread: 0 });
});

platformNotificationsRouter.post('/notifications/:id/:action', async (req: PlatformRequest, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const action = z.enum(['read', 'unread', 'dismiss']).parse(req.params.action);
  const column = action === 'dismiss' ? 'dismissed_at = now(), read_at = COALESCE(read_at, now())' : action === 'read' ? 'read_at = COALESCE(read_at, now())' : 'read_at = NULL';
  const rows = await q(`UPDATE notifications SET ${column} WHERE id = $1 AND recipient_admin_id = $2 RETURNING id`, [id, req.admin!.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  const unread = await unreadCount(req.admin!.id);
  broadcastReadState(req.admin!.id, action === 'dismiss' ? { removed: [id] } : { ids: [id], ...(action === 'unread' ? { unread_ids: [id] } : {}) }, unread);
  res.json({ ok: true, unread });
});

platformNotificationsRouter.delete('/notifications/:id', async (req: PlatformRequest, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const rows = await q(`DELETE FROM notifications WHERE id = $1 AND recipient_admin_id = $2 RETURNING id`, [id, req.admin!.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  const unread = await unreadCount(req.admin!.id);
  broadcastReadState(req.admin!.id, { removed: [id] }, unread);
  res.json({ ok: true, unread });
});

platformNotificationsRouter.get('/search', async (req: PlatformRequest, res) => {
  const term = z.string().trim().min(2).max(80).parse(req.query.q);
  const like = `%${term.replace(/[%_\\]/g, '\\$&')}%`;
  const role = req.admin!.role;
  const [businesses, users, subscriptions] = await Promise.all([
    hasPlatformPermission(role, 'businesses:read')
      ? q(`SELECT id, name, business_code FROM businesses WHERE name ILIKE $1 OR business_code ILIKE $1 OR id::text = $2 ORDER BY name LIMIT 5`, [like, term])
      : Promise.resolve([]),
    hasPlatformPermission(role, 'users:read')
      ? q(`SELECT u.id, u.name, u.email, u.role, b.name AS business_name FROM users u LEFT JOIN businesses b ON b.id = u.business_id
           WHERE u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1 ORDER BY u.name LIMIT 5`, [like])
      : Promise.resolve([]),
    hasPlatformPermission(role, 'billing:read')
      ? q(`SELECT b.id, b.name, COALESCE(st.plan, 'free') AS plan FROM businesses b LEFT JOIN business_platform_states st ON st.business_id = b.id
           WHERE (b.name ILIKE $1 OR COALESCE(st.plan, 'free') ILIKE $1) ORDER BY b.name LIMIT 3`, [like])
      : Promise.resolve([]),
  ]);
  res.json({
    results: [
      ...businesses.map((row) => ({ type: 'business', id: row.id, title: row.name, subtitle: row.business_code, link: `/platform/businesses/${row.id}` })),
      ...users.map((row) => ({ type: 'user', id: row.id, title: row.name, subtitle: [row.email, row.role, row.business_name].filter(Boolean).join(' · '), link: `/platform/users?user=${row.id}` })),
      ...subscriptions.map((row) => ({ type: 'subscription', id: row.id, title: row.name, subtitle: `Plan: ${row.plan}`, link: `/platform/businesses/${row.id}/subscriptions` })),
    ],
  });
});
