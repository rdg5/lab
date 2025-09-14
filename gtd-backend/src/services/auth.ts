import jwt from 'jsonwebtoken';
import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import type { Database } from '../types/database.js';
import type { JWTPayload, AuthUser, AuthResult, GoogleOAuthUser, GitHubOAuthUser } from '../types/auth.js';
import { TRPCError } from '@trpc/server';
import { OAuth2Client } from 'google-auth-library';
import { Octokit } from '@octokit/rest';

export class AuthService {
  private googleClient: OAuth2Client;
  private jwtSecret: string;

  constructor(private db: Kysely<Database>) {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.googleClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
  }

  async generateToken(user: AuthUser, expiresIn: string = '7d'): Promise<string> {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.getExpirationTime(expiresIn),
    };

    return jwt.sign(payload, this.jwtSecret, { algorithm: 'HS256' });
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JWTPayload;
      return payload;
    } catch (error) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }
  }

  async authenticateWithGoogle(code: string, redirectUri?: string): Promise<AuthResult> {
    try {
      // Exchange code for tokens
      const { tokens } = await this.googleClient.getToken({
        code,
        redirect_uri: redirectUri,
      });

      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      // Get user info from Google
      this.googleClient.setCredentials(tokens);
      const userInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokens.access_token}`
      );
      
      if (!userInfoResponse.ok) {
        throw new Error('Failed to fetch user info from Google');
      }

      const googleUser: GoogleOAuthUser = await userInfoResponse.json();

      // Create or update user in database
      const user = await this.createOrUpdateUser({
        email: googleUser.email,
        name: googleUser.name,
        avatar_url: googleUser.picture,
        provider: 'google',
        provider_id: googleUser.id,
      });

      const token = await this.generateToken(user);

      return {
        user,
        token,
        expires_in: this.getExpirationTime('7d'),
      };
    } catch (error) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Google OAuth authentication failed',
        cause: error,
      });
    }
  }

  async authenticateWithGitHub(code: string, state?: string): Promise<AuthResult> {
    try {
      if (!state || state.trim() === '') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'State parameter is required',
        });
      }

      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          state,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (tokenData.error || !tokenData.access_token) {
        throw new Error('GitHub OAuth token exchange failed');
      }

      // Get user info from GitHub
      const octokit = new Octokit({
        auth: tokenData.access_token,
      });

      const { data: githubUser } = await octokit.rest.users.getAuthenticated();

      // Create or update user in database
      const user = await this.createOrUpdateUser({
        email: githubUser.email || `${githubUser.login}@github.local`,
        name: githubUser.name || githubUser.login,
        avatar_url: githubUser.avatar_url,
        provider: 'github',
        provider_id: githubUser.id.toString(),
      });

      const token = await this.generateToken(user);

      return {
        user,
        token,
        expires_in: this.getExpirationTime('7d'),
      };
    } catch (error) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'GitHub OAuth authentication failed',
        cause: error,
      });
    }
  }

  async validateToken(token: string): Promise<{ valid: boolean; user?: AuthUser }> {
    try {
      const payload = await this.verifyToken(token);
      
      // Verify user still exists in database
      const user = await this.db
        .selectFrom('users')
        .where('id', '=', payload.userId)
        .selectAll()
        .executeTakeFirst();

      if (!user) {
        return { valid: false };
      }

      return {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar_url: user.avatar_url,
          provider: user.provider,
        },
      };
    } catch (error) {
      return { valid: false };
    }
  }

  async refreshToken(token: string): Promise<{ token: string; expires_in: number }> {
    try {
      const payload = await this.verifyToken(token);
      
      // Get fresh user data
      const user = await this.db
        .selectFrom('users')
        .where('id', '=', payload.userId)
        .selectAll()
        .executeTakeFirst();

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User not found',
        });
      }

      const authUser: AuthUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        provider: user.provider,
      };

      const newToken = await this.generateToken(authUser);

      return {
        token: newToken,
        expires_in: this.getExpirationTime('7d'),
      };
    } catch (error) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Token refresh failed',
        cause: error,
      });
    }
  }

  private async createOrUpdateUser(userData: {
    email: string;
    name: string;
    avatar_url: string | null;
    provider: 'google' | 'github';
    provider_id: string;
  }): Promise<AuthUser> {
    // Check if user exists by email
    const existingUser = await this.db
      .selectFrom('users')
      .where('email', '=', userData.email)
      .selectAll()
      .executeTakeFirst();

    if (existingUser) {
      // Update existing user
      const updatedUser = await this.db
        .updateTable('users')
        .set({
          name: userData.name,
          avatar_url: userData.avatar_url,
          provider: userData.provider,
          provider_id: userData.provider_id,
          updated_at: new Date(),
        })
        .where('id', '=', existingUser.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        avatar_url: updatedUser.avatar_url,
        provider: updatedUser.provider,
      };
    } else {
      // Create new user
      const newUser = await this.db
        .insertInto('users')
        .values({
          id: randomUUID(),
          email: userData.email,
          name: userData.name,
          avatar_url: userData.avatar_url,
          provider: userData.provider,
          provider_id: userData.provider_id,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        avatar_url: newUser.avatar_url,
        provider: newUser.provider,
      };
    }
  }

  private getExpirationTime(duration: string): number {
    const match = duration.match(/^(\d+)([dwh])$/);
    if (!match) return 7 * 24 * 60 * 60; // Default 7 days

    const [, num, unit] = match;
    const value = parseInt(num, 10);

    switch (unit) {
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      case 'w': return value * 7 * 24 * 60 * 60;
      default: return 7 * 24 * 60 * 60;
    }
  }
}