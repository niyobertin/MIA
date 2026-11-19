import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { AppDataSource } from '../data-source';
import { PlatformAdmin } from '../entities';
import { verifyPlatformToken } from './platformAuth';

let io: Server | null = null;

export const adminRoom = (adminId: string) => `admin:${adminId}`;

export function attachRealtime(server: HttpServer, corsOrigin: string) {
  io = new Server(server, {
    path: '/realtime',
    cors: { origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((origin) => origin.trim()) },
    serveClient: false,
  });
  const platform = io.of('/platform');
  platform.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      const payload = verifyPlatformToken(token, 'platform');
      const admin = await AppDataSource.getRepository(PlatformAdmin).findOne({ where: { id: payload.sub } });
      if (!admin || !admin.active || admin.token_version !== payload.ver || admin.must_change_password) return next(new Error('Unauthorized'));
      socket.data.adminId = admin.id;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });
  platform.on('connection', (socket) => {
    void socket.join(adminRoom(socket.data.adminId as string));
  });
  return io;
}

export function emitToAdmin(adminId: string, event: string, payload: unknown) {
  io?.of('/platform').to(adminRoom(adminId)).emit(event, payload);
}

export async function disconnectAdmin(adminId: string) {
  io?.of('/platform').in(adminRoom(adminId)).disconnectSockets(true);
}
