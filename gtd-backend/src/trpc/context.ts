import type { CreateTrpcKoaContextOptions } from 'trpc-koa-adapter';
import { getDb } from '../db/database.js';
import { AuthService } from '../services/auth.js';
import type { TRPCContext } from '../types/auth.js';

export async function createContext({ req, res }: CreateTrpcKoaContextOptions): Promise<TRPCContext> {
  const db = getDb();
  const authService = new AuthService(db);

  // Extract auth info from request
  const authorization = req.headers.authorization;
  let user = undefined;

  if (authorization && authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7);
    try {
      const validation = await authService.validateToken(token);
      if (validation.valid) {
        user = validation.user;
      }
    } catch (error) {
      // Token invalid, user remains undefined
    }
  }

  return {
    user,
    deviceId: req.headers['x-device-id'] as string,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;