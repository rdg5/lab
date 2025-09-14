import Koa from 'koa';
import bodyParser from '@koa/bodyparser';
import cors from '@koa/cors';
import { koaMiddleware } from 'trpc-koa-adapter';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { dbManager } from './db/database.js';
import { queueService } from './services/queue.js';
import { validateEnvironment } from './utils/validation.js';
import {
  securityHeaders,
  corsConfig,
  requestValidation,
  deviceIdMiddleware,
  errorHandler,
  requestLogger,
  healthCheck,
} from './middleware/security.js';

// Validate environment variables
const env = validateEnvironment();

class GTDServer {
  private app: Koa;
  private server?: any;

  constructor() {
    this.app = new Koa();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // Error handling (must be first)
    this.app.use(errorHandler());

    // Request logging
    if (env.NODE_ENV !== 'test') {
      this.app.use(requestLogger());
    }

    // Health check
    this.app.use(healthCheck());

    // Security headers
    this.app.use(securityHeaders());

    // CORS
    this.app.use(cors(corsConfig()));

    // Request validation
    this.app.use(requestValidation());

    // Body parser
    this.app.use(bodyParser({
      jsonLimit: '10mb',
      textLimit: '10mb',
      enableTypes: ['json', 'text'],
      onerror: (err, ctx) => {
        ctx.throw(422, 'Invalid JSON in request body');
      },
    }));

    // Device ID extraction
    this.app.use(deviceIdMiddleware());
  }

  private setupRoutes() {
    // tRPC API routes
    this.app.use(
      koaMiddleware({
        router: appRouter,
        createContext,
        prefix: '/trpc',
        responseMeta: ({ type, errors }) => {
          // Add custom headers based on response type
          const headers: Record<string, string> = {};

          // Add cache headers for queries
          if (type === 'query') {
            headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
            headers['Pragma'] = 'no-cache';
            headers['Expires'] = '0';
          }

          // Add error tracking headers
          if (errors.length > 0) {
            headers['X-Error-Count'] = errors.length.toString();
          }

          return { headers };
        },
        onError: ({ error, path, type, ctx }) => {
          // Log tRPC errors
          console.error('tRPC Error:', {
            path,
            type,
            error: error.message,
            code: error.code,
            cause: error.cause,
            userId: ctx?.user?.id,
            deviceId: ctx?.deviceId,
          });
        },
      })
    );

    // API info endpoint
    this.app.use(async (ctx, next) => {
      if (ctx.path === '/api' && ctx.method === 'GET') {
        ctx.body = {
          name: 'GTD Backend API',
          version: '1.0.0',
          description: 'GTD-aware Todo App Backend with tRPC, SQLite, and LLM integration',
          endpoints: {
            health: '/health',
            trpc: '/trpc',
            docs: '/api/docs',
          },
          features: [
            'GTD methodology enforcement',
            'AI-powered analysis and decomposition',
            'Real-time sync with conflict resolution',
            'OAuth authentication (Google, GitHub)',
            'Comprehensive audit trails',
            'Background job processing',
          ],
        };
        return;
      }
      await next();
    });

    // API documentation endpoint
    this.app.use(async (ctx, next) => {
      if (ctx.path === '/api/docs' && ctx.method === 'GET') {
        ctx.body = {
          openapi: '3.0.0',
          info: {
            title: 'GTD Backend API',
            version: '1.0.0',
            description: 'GTD-aware Todo App Backend API',
          },
          servers: [
            {
              url: `http://localhost:${env.PORT}`,
              description: 'Development server',
            },
          ],
          paths: {
            '/trpc/*': {
              description: 'tRPC API endpoints - see tRPC documentation for schema',
            },
            '/health': {
              get: {
                summary: 'Health check endpoint',
                responses: {
                  '200': {
                    description: 'Service is healthy',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            status: { type: 'string' },
                            timestamp: { type: 'string' },
                            uptime: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        };
        return;
      }
      await next();
    });

    // 404 handler
    this.app.use(async (ctx) => {
      ctx.status = 404;
      ctx.body = {
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found',
          availableEndpoints: ['/health', '/api', '/api/docs', '/trpc/*'],
        },
      };
    });
  }

  async start(): Promise<void> {
    try {
      // Initialize database
      console.log('Initializing database...');
      await dbManager.initialize();
      console.log('✓ Database initialized');

      // Start the server
      const port = env.PORT || 3000;
      this.server = this.app.listen(port, () => {
        console.log(`🚀 GTD Backend Server running on port ${port}`);
        console.log(`📋 API Documentation: http://localhost:${port}/api/docs`);
        console.log(`🔍 Health Check: http://localhost:${port}/health`);
        console.log(`⚡ tRPC Endpoint: http://localhost:${port}/trpc`);
        console.log(`🌍 Environment: ${env.NODE_ENV}`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown('SIGTERM'));
      process.on('SIGINT', () => this.shutdown('SIGINT'));
      process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        this.shutdown('uncaughtException');
      });
      process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        this.shutdown('unhandledRejection');
      });

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private async shutdown(signal: string): Promise<void> {
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

    try {
      // Stop accepting new requests
      if (this.server) {
        this.server.close();
        console.log('✓ HTTP server closed');
      }

      // Shutdown background services
      console.log('Shutting down background services...');
      await queueService.shutdown();
      console.log('✓ Queue service shut down');

      // Close database connections
      await dbManager.close();
      console.log('✓ Database connections closed');

      console.log('✨ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the server if this file is executed directly
if (require.main === module) {
  const server = new GTDServer();
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default GTDServer;