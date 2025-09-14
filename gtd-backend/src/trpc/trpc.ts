import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const t = initTRPC.context<Context>().create();

// Rate limiters for different operations
const authLimiter = new RateLimiterMemory({
  points: 5, // Number of requests
  duration: 60, // Per 60 seconds
});

const generalLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

// Middleware to check if user is authenticated
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Type assertion for authenticated user
    },
  });
});

// Rate limiting middleware
const rateLimitAuth = t.middleware(async ({ ctx, next }) => {
  const key = ctx.ipAddress || 'unknown';
  
  try {
    await authLimiter.consume(key);
    return next();
  } catch (error) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts, please try again later',
    });
  }
});

const rateLimitGeneral = t.middleware(async ({ ctx, next }) => {
  const key = ctx.ipAddress || 'unknown';
  
  try {
    await generalLimiter.consume(key);
    return next();
  } catch (error) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests, please try again later',
    });
  }
});

// Base router and procedures
export const router = t.router;
export const publicProcedure = t.procedure.use(rateLimitGeneral);
export const protectedProcedure = t.procedure.use(rateLimitGeneral).use(isAuthed);
export const authProcedure = t.procedure.use(rateLimitAuth);

// Common schemas
export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const deviceInfoSchema = z.object({
  device_id: z.string().min(1),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
});