import type { Context, Next } from 'koa';
import { TRPCError } from '@trpc/server';

/**
 * Security headers middleware
 */
export function securityHeaders() {
  return async (ctx: Context, next: Next) => {
    // Set security headers
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('X-Frame-Options', 'DENY');
    ctx.set('X-XSS-Protection', '1; mode=block');
    ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // HTTPS-only headers (only in production)
    if (process.env.NODE_ENV === 'production') {
      ctx.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    await next();
  };
}

/**
 * CORS middleware configuration
 */
export function corsConfig() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173', // Vite default
  ];

  return {
    origin: (ctx: Context) => {
      const origin = ctx.headers.origin;
      if (!origin) return false;
      
      if (allowedOrigins.includes(origin)) {
        return origin;
      }
      
      // Allow localhost in development
      if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
        return origin;
      }
      
      return false;
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Device-ID'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400, // 24 hours
  };
}

/**
 * Request validation middleware
 */
export function requestValidation() {
  return async (ctx: Context, next: Next) => {
    // Check Content-Type for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(ctx.method)) {
      const contentType = ctx.headers['content-type'];
      if (!contentType || !contentType.includes('application/json')) {
        ctx.status = 400;
        ctx.body = { error: 'Content-Type must be application/json' };
        return;
      }
    }

    // Validate request size (10MB limit)
    const contentLength = parseInt(ctx.headers['content-length'] || '0', 10);
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (contentLength > maxSize) {
      ctx.status = 413;
      ctx.body = { error: 'Request entity too large' };
      return;
    }

    await next();
  };
}

/**
 * Device ID extraction middleware
 */
export function deviceIdMiddleware() {
  return async (ctx: Context, next: Next) => {
    const deviceId = ctx.headers['x-device-id'] as string;
    
    // Store device ID for later use
    ctx.state.deviceId = deviceId;
    
    await next();
  };
}

/**
 * Error handling middleware
 */
export function errorHandler() {
  return async (ctx: Context, next: Next) => {
    try {
      await next();
    } catch (err: any) {
      // Log error
      console.error('Request error:', {
        url: ctx.url,
        method: ctx.method,
        error: err.message,
        stack: err.stack,
        userId: ctx.state.user?.id,
        deviceId: ctx.state.deviceId,
      });

      // Handle TRPC errors
      if (err instanceof TRPCError) {
        const statusMap: Record<string, number> = {
          BAD_REQUEST: 400,
          UNAUTHORIZED: 401,
          FORBIDDEN: 403,
          NOT_FOUND: 404,
          TIMEOUT: 408,
          CONFLICT: 409,
          PRECONDITION_FAILED: 412,
          PAYLOAD_TOO_LARGE: 413,
          UNPROCESSABLE_CONTENT: 422,
          TOO_MANY_REQUESTS: 429,
          CLIENT_CLOSED_REQUEST: 499,
          INTERNAL_SERVER_ERROR: 500,
          NOT_IMPLEMENTED: 501,
          BAD_GATEWAY: 502,
          SERVICE_UNAVAILABLE: 503,
          GATEWAY_TIMEOUT: 504,
        };

        ctx.status = statusMap[err.code] || 500;
        ctx.body = {
          error: {
            code: err.code,
            message: err.message,
          },
        };
        return;
      }

      // Handle validation errors
      if (err.name === 'ValidationError') {
        ctx.status = 400;
        ctx.body = {
          error: {
            code: 'VALIDATION_ERROR',
            message: err.message,
            details: err.errors,
          },
        };
        return;
      }

      // Generic error handling
      ctx.status = err.status || 500;
      
      if (process.env.NODE_ENV === 'production') {
        // Don't expose internal errors in production
        ctx.body = {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An internal server error occurred',
          },
        };
      } else {
        ctx.body = {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: err.message,
            stack: err.stack,
          },
        };
      }
    }
  };
}

/**
 * Request logging middleware
 */
export function requestLogger() {
  return async (ctx: Context, next: Next) => {
    const start = Date.now();
    
    await next();
    
    const duration = Date.now() - start;
    
    // Log request
    console.log(`${ctx.method} ${ctx.url} - ${ctx.status} - ${duration}ms`, {
      ip: ctx.ip,
      userAgent: ctx.headers['user-agent'],
      userId: ctx.state.user?.id,
      deviceId: ctx.state.deviceId,
    });
  };
}

/**
 * Health check middleware
 */
export function healthCheck() {
  return async (ctx: Context, next: Next) => {
    if (ctx.path === '/health') {
      ctx.status = 200;
      ctx.body = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        env: process.env.NODE_ENV,
      };
      return;
    }
    
    await next();
  };
}