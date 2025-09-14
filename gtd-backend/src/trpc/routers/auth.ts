import { z } from 'zod';
import { router, publicProcedure, authProcedure } from '../trpc.js';
import { AuthService } from '../../services/auth.js';
import { getDb } from '../../db/database.js';
import { TRPCError } from '@trpc/server';

const authService = new AuthService(getDb());

export const authRouter = router({
  googleOAuth: authProcedure
    .input(z.object({
      code: z.string().min(1),
      redirect_uri: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await authService.authenticateWithGoogle(
          input.code,
          input.redirect_uri
        );
        return result;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Google OAuth authentication failed',
          cause: error,
        });
      }
    }),

  githubOAuth: authProcedure
    .input(z.object({
      code: z.string().min(1),
      state: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await authService.authenticateWithGitHub(
          input.code,
          input.state
        );
        return result;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'GitHub OAuth authentication failed',
          cause: error,
        });
      }
    }),

  validateToken: publicProcedure
    .input(z.object({
      token: z.string().min(1),
    }))
    .query(async ({ input }) => {
      try {
        const result = await authService.validateToken(input.token);
        
        if (!result.valid) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid token',
          });
        }

        return result;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Token validation failed',
          cause: error,
        });
      }
    }),

  refreshToken: publicProcedure
    .input(z.object({
      token: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await authService.refreshToken(input.token);
        return result;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Token refresh failed',
          cause: error,
        });
      }
    }),
});