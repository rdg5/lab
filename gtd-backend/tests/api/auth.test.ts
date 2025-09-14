import { createTRPCMsw } from 'msw-trpc';
import { setupServer } from 'msw/node';
import { TestDbManager } from '../helpers/test-db';
import { TestDataFactory } from '../helpers/factories';
import { AppRouter } from '@/trpc/router'; // This will fail - doesn't exist yet
import { createContext } from '@/trpc/context'; // This will fail - doesn't exist yet
import { TRPCError } from '@trpc/server';

describe('Authentication API', () => {
  let dbManager: TestDbManager;
  let server: any;
  let trpc: any;

  beforeAll(() => {
    // Mock MSW server for external API calls (Google/GitHub OAuth)
    const handlers = createTRPCMsw<AppRouter>();
    server = setupServer(...handlers);
    server.listen();
  });

  beforeEach(async () => {
    dbManager = new TestDbManager();
    await dbManager.setup();
    
    // This will fail - AppRouter doesn't exist
    trpc = createTRPCMsw<AppRouter>({
      baseUrl: 'http://localhost:3000/trpc',
    });
  });

  afterEach(async () => {
    await dbManager.cleanup();
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  describe('OAuth Authentication', () => {
    describe('Google OAuth', () => {
      it('should authenticate user with valid Google OAuth code', async () => {
        const mockGoogleUser = TestDataFactory.createGoogleOAuthUser();
        
        // Mock Google OAuth API response
        server.use(
          trpc.auth.googleOAuth.mutation((req, res, ctx) => {
            return res(ctx.json({
              user: {
                id: expect.any(String),
                email: mockGoogleUser.email,
                name: mockGoogleUser.name,
                avatar_url: mockGoogleUser.picture,
                provider: 'google',
              },
              token: expect.any(String),
              expires_in: 604800, // 7 days
            }));
          })
        );

        // This should fail - mutation doesn't exist
        const result = await trpc.auth.googleOAuth.mutate({
          code: 'valid-google-oauth-code',
          redirect_uri: 'http://localhost:3000/auth/callback/google',
        });

        expect(result).toMatchObject({
          user: expect.objectContaining({
            email: mockGoogleUser.email,
            name: mockGoogleUser.name,
            provider: 'google',
          }),
          token: expect.any(String),
        });

        // Verify user was created in database
        const db = dbManager.getKysely();
        const dbUser = await db
          .selectFrom('users')
          .where('email', '=', mockGoogleUser.email)
          .selectAll()
          .executeTakeFirst();

        expect(dbUser).toBeTruthy();
        expect(dbUser?.provider).toBe('google');
      });

      it('should handle invalid Google OAuth code', async () => {
        // This should fail - mutation doesn't exist
        await expect(
          trpc.auth.googleOAuth.mutate({
            code: 'invalid-oauth-code',
            redirect_uri: 'http://localhost:3000/auth/callback/google',
          })
        ).rejects.toThrow('UNAUTHORIZED');
      });

      it('should handle Google OAuth API errors', async () => {
        // Mock Google OAuth API error
        server.use(
          trpc.auth.googleOAuth.mutation((req, res, ctx) => {
            return res(ctx.status(400), ctx.json({ error: 'invalid_grant' }));
          })
        );

        await expect(
          trpc.auth.googleOAuth.mutate({
            code: 'valid-code-but-api-error',
            redirect_uri: 'http://localhost:3000/auth/callback/google',
          })
        ).rejects.toThrow('UNAUTHORIZED');
      });

      it('should merge existing user on OAuth with same email', async () => {
        const db = dbManager.getKysely();
        
        // Create existing user with GitHub provider
        const existingUser = TestDataFactory.createUser({
          email: 'same@example.com',
          provider: 'github',
          provider_id: 'github-123',
        });
        
        await db.insertInto('users').values(existingUser).execute();

        const mockGoogleUser = TestDataFactory.createGoogleOAuthUser({
          email: 'same@example.com',
        });

        // This should fail - mutation doesn't exist
        const result = await trpc.auth.googleOAuth.mutate({
          code: 'valid-google-oauth-code',
        });

        // Should update existing user, not create new one
        const users = await db
          .selectFrom('users')
          .where('email', '=', 'same@example.com')
          .selectAll()
          .execute();

        expect(users).toHaveLength(1);
        // Should still be the original user but with Google provider info added
        expect(users[0].id).toBe(existingUser.id);
      });
    });

    describe('GitHub OAuth', () => {
      it('should authenticate user with valid GitHub OAuth code', async () => {
        const mockGitHubUser = TestDataFactory.createGitHubOAuthUser();
        
        // This should fail - mutation doesn't exist
        const result = await trpc.auth.githubOAuth.mutate({
          code: 'valid-github-oauth-code',
          state: 'random-state-string',
        });

        expect(result).toMatchObject({
          user: expect.objectContaining({
            email: mockGitHubUser.email,
            name: mockGitHubUser.name,
            provider: 'github',
          }),
          token: expect.any(String),
        });

        const db = dbManager.getKysely();
        const dbUser = await db
          .selectFrom('users')
          .where('email', '=', mockGitHubUser.email)
          .selectAll()
          .executeTakeFirst();

        expect(dbUser).toBeTruthy();
        expect(dbUser?.provider).toBe('github');
      });

      it('should handle invalid GitHub OAuth code', async () => {
        await expect(
          trpc.auth.githubOAuth.mutate({
            code: 'invalid-oauth-code',
            state: 'some-state',
          })
        ).rejects.toThrow('UNAUTHORIZED');
      });

      it('should validate OAuth state parameter', async () => {
        await expect(
          trpc.auth.githubOAuth.mutate({
            code: 'valid-code',
            state: '', // Empty state should fail
          })
        ).rejects.toThrow('BAD_REQUEST');
      });
    });
  });

  describe('JWT Token Management', () => {
    it('should generate valid JWT tokens', async () => {
      const db = dbManager.getKysely();
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      // This should fail - service doesn't exist
      const authService = new AuthService(db);
      const token = await authService.generateToken(user);

      expect(token).toMatch(/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/);
      
      // Verify token contains expected payload
      const decoded = await authService.verifyToken(token);
      expect(decoded).toMatchObject({
        userId: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
      });
    });

    it('should validate JWT tokens', async () => {
      // This should fail - middleware doesn't exist
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE2Mzk5ODAwMDAsImV4cCI6MTY0MDU4NDgwMH0.signature';
      
      const result = await trpc.auth.validateToken.query({
        token: validToken,
      });

      expect(result).toMatchObject({
        valid: true,
        user: expect.objectContaining({
          id: 'test-user-id',
          email: 'test@example.com',
        }),
      });
    });

    it('should reject invalid JWT tokens', async () => {
      await expect(
        trpc.auth.validateToken.query({
          token: 'invalid.jwt.token',
        })
      ).rejects.toThrow('UNAUTHORIZED');
    });

    it('should reject expired JWT tokens', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItaWQiLCJleHAiOjE2MDkzNzI4MDB9.signature'; // Expired in 2021
      
      await expect(
        trpc.auth.validateToken.query({
          token: expiredToken,
        })
      ).rejects.toThrow('UNAUTHORIZED');
    });

    it('should refresh valid tokens', async () => {
      const db = dbManager.getKysely();
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      // Generate a token that's about to expire
      const authService = new AuthService(db);
      const originalToken = await authService.generateToken(user, '1h');

      // This should fail - mutation doesn't exist
      const result = await trpc.auth.refreshToken.mutate({
        token: originalToken,
      });

      expect(result).toMatchObject({
        token: expect.any(String),
        expires_in: expect.any(Number),
      });

      // New token should be different from original
      expect(result.token).not.toBe(originalToken);
    });
  });

  describe('Authentication Middleware', () => {
    it('should protect authenticated routes', async () => {
      // This should fail - protected query doesn't exist
      await expect(
        trpc.todos.list.query()
      ).rejects.toThrow('UNAUTHORIZED');
    });

    it('should allow access with valid token', async () => {
      const db = dbManager.getKysely();
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      const authService = new AuthService(db);
      const token = await authService.generateToken(user);

      // This should fail - protected query doesn't exist
      const result = await trpc.todos.list.query(undefined, {
        context: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should reject requests with malformed Authorization header', async () => {
      await expect(
        trpc.todos.list.query(undefined, {
          context: {
            authorization: 'InvalidFormat token-here',
          },
        })
      ).rejects.toThrow('UNAUTHORIZED');
    });

    it('should reject requests with missing Bearer prefix', async () => {
      await expect(
        trpc.todos.list.query(undefined, {
          context: {
            authorization: 'just-a-token',
          },
        })
      ).rejects.toThrow('UNAUTHORIZED');
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit authentication attempts', async () => {
      const requests = [];
      
      // Make multiple rapid authentication attempts
      for (let i = 0; i < 15; i++) {
        requests.push(
          trpc.auth.googleOAuth.mutate({
            code: `attempt-${i}`,
          }).catch(err => err) // Catch errors to continue loop
        );
      }

      const results = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedErrors = results.filter(
        result => result instanceof TRPCError && result.code === 'TOO_MANY_REQUESTS'
      );
      
      expect(rateLimitedErrors.length).toBeGreaterThan(0);
    });

    it('should have different rate limits for different endpoints', async () => {
      // OAuth endpoints should have stricter limits
      const oauthRequests = [];
      for (let i = 0; i < 10; i++) {
        oauthRequests.push(
          trpc.auth.googleOAuth.mutate({ code: `oauth-${i}` }).catch(err => err)
        );
      }

      // Token validation should have more lenient limits
      const validationRequests = [];
      for (let i = 0; i < 50; i++) {
        validationRequests.push(
          trpc.auth.validateToken.query({ token: `token-${i}` }).catch(err => err)
        );
      }

      const [oauthResults, validationResults] = await Promise.all([
        Promise.all(oauthRequests),
        Promise.all(validationRequests),
      ]);

      // OAuth should hit rate limits faster
      const oauthRateLimited = oauthResults.filter(
        result => result instanceof TRPCError && result.code === 'TOO_MANY_REQUESTS'
      );
      
      const validationRateLimited = validationResults.filter(
        result => result instanceof TRPCError && result.code === 'TOO_MANY_REQUESTS'
      );

      expect(oauthRateLimited.length).toBeGreaterThan(validationRateLimited.length);
    });
  });

  describe('Security Headers and CORS', () => {
    it('should set appropriate security headers', async () => {
      // This would test the actual HTTP response headers
      // Since we're testing tRPC procedures, this test would fail without server setup
      const response = await fetch('http://localhost:3000/trpc/auth.googleOAuth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'test' }),
      });

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Strict-Transport-Security')).toBeTruthy();
    });

    it('should handle CORS preflight requests', async () => {
      const response = await fetch('http://localhost:3000/trpc/auth.googleOAuth', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3001',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('Audit Trail for Authentication', () => {
    it('should create audit trail for successful login', async () => {
      const db = dbManager.getKysely();
      const mockGoogleUser = TestDataFactory.createGoogleOAuthUser();

      // This should fail - mutation doesn't exist
      await trpc.auth.googleOAuth.mutate({
        code: 'valid-google-oauth-code',
      });

      // Verify audit trail was created
      const auditTrail = await db
        .selectFrom('audit_trails')
        .where('action', '=', 'create')
        .where('entity_type', '=', 'user')
        .selectAll()
        .executeTakeFirst();

      expect(auditTrail).toBeTruthy();
      expect(auditTrail?.new_values).toContain(mockGoogleUser.email);
    });

    it('should create audit trail for failed login attempts', async () => {
      const db = dbManager.getKysely();

      try {
        await trpc.auth.googleOAuth.mutate({
          code: 'invalid-oauth-code',
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify failed attempt was logged
      const auditTrail = await db
        .selectFrom('audit_trails')
        .where('action', '=', 'login_failed')
        .selectAll()
        .executeTakeFirst();

      expect(auditTrail).toBeTruthy();
    });
  });
});