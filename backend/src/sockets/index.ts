import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { env } from '../config/env';
import { verifyAccessToken } from '../utils/jwt';
import { UserRole } from '../modules/users/user.model';

export interface SocketAuthData {
  userId: string;
  role: UserRole;
}

let io: SocketServer | null = null;

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function stripBearer(value: string): string {
  return value.startsWith('Bearer ') ? value.slice(7) : value;
}

function extractToken(socket: Socket): string | undefined {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth) return stripBearer(fromAuth);

  const fromHeader = socket.handshake.headers.authorization;
  if (typeof fromHeader === 'string' && fromHeader) return stripBearer(fromHeader);

  const fromQuery = socket.handshake.query?.token;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;

  return undefined;
}

/**
 * Attaches a JWT-guarded Socket.IO server to the existing HTTP server.
 * Every authenticated user joins a private `user:<id>` room, which is the
 * channel used for match notifications. Idempotent.
 */
export function initSockets(httpServer: HttpServer): SocketServer {
  if (io) return io;

  io = new SocketServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
      credentials: true,
    },
  });

  // The PRD requires the connection to be authenticated with a JWT before the
  // socket is allowed to join any room.
  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      (socket.data as SocketAuthData).userId = payload.userId;
      (socket.data as SocketAuthData).role = payload.role;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data as SocketAuthData;
    socket.join(userRoom(userId));
    socket.emit('connected', { userId, role });
  });

  return io;
}

/**
 * Pushes an event to every socket a user has open (all their devices).
 * No-ops when sockets were never initialised so services stay testable.
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  try {
    io.to(userRoom(String(userId))).emit(event, payload);
  } catch (error) {
    console.error('[sockets] emit failed:', error);
  }
}

export function getIO(): SocketServer | null {
  return io;
}

/** Disconnects every client so the HTTP server can drain on shutdown. */
export function closeSockets(): void {
  if (!io) return;
  io.disconnectSockets(true);
}
