export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  provider: 'google' | 'github';
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  provider: 'google' | 'github';
}

export interface AuthResult {
  user: AuthUser;
  token: string;
  expires_in: number;
}

export interface GoogleOAuthUser {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  locale: string;
}

export interface GitHubOAuthUser {
  id: number;
  login: string;
  avatar_url: string;
  name: string;
  email: string;
  bio: string;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface TRPCContext {
  user?: AuthUser;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}