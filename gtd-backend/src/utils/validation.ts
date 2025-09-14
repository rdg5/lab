import { z } from 'zod';

// Common validation schemas
export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email();
export const dateSchema = z.date();
export const optionalDateSchema = z.date().optional();

// Todo-related schemas
export const prioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const energyLevelSchema = z.enum(['low', 'medium', 'high']);
export const contextSchema = z.string().min(1).max(50).optional();

export const titleSchema = z.string().min(1).max(200);
export const descriptionSchema = z.string().max(2000).optional();
export const outcomeSchema = z.string().min(10).max(500);
export const nextActionSchema = z.string().min(5).max(300);

// GTD validation helpers
export function validateGTDOutcome(outcome: string): boolean {
  const trimmed = outcome.trim().toLowerCase();
  return trimmed.includes('success looks like') && trimmed.length >= 20;
}

export function validateGTDNextAction(nextAction: string): boolean {
  const actionVerbs = [
    'call', 'email', 'write', 'create', 'review', 'schedule', 'book',
    'research', 'analyze', 'design', 'implement', 'test', 'deploy',
    'open', 'close', 'start', 'finish', 'complete', 'send', 'receive',
    'buy', 'order', 'install', 'configure', 'setup', 'download',
    'contact', 'meet', 'discuss', 'plan', 'organize', 'prepare',
  ];
  
  const firstWord = nextAction.trim().toLowerCase().split(' ')[0];
  return actionVerbs.includes(firstWord) && nextAction.trim().length >= 10;
}

// Custom Zod validators
export const gtdOutcomeSchema = z
  .string()
  .min(10)
  .max(500)
  .refine(validateGTDOutcome, {
    message: 'Outcome must include "Success looks like..." and be descriptive',
  });

export const gtdNextActionSchema = z
  .string()
  .min(5)
  .max(300)
  .refine(validateGTDNextAction, {
    message: 'Next action must start with an action verb and be specific',
  });

// Vector clock validation
export const vectorClockSchema = z.record(z.string(), z.number().int().nonnegative());

// Quality score validation
export const qualityScoreSchema = z.number().min(0).max(1);

// Audit trail validation
export const entityTypeSchema = z.enum(['todo', 'subtask', 'user']);
export const actionTypeSchema = z.enum(['create', 'update', 'delete', 'complete', 'uncomplete']);

// Sync metadata validation
export const conflictResolutionSchema = z.enum(['manual', 'auto_merge', 'latest_wins']).optional();

// OAuth validation
export const oauthProviderSchema = z.enum(['google', 'github']);

// Pagination validation
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// Device info validation
export const deviceInfoSchema = z.object({
  device_id: z.string().min(1).max(100),
  ip_address: z.string().ip().optional(),
  user_agent: z.string().max(500).optional(),
});

// Environment validation
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  
  // Database
  DATABASE_URL: z.string().optional(),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  
  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  
  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  
  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  
  // CORS
  ALLOWED_ORIGINS: z.string().optional(),
});

// Validate environment variables
export function validateEnvironment() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('Environment validation failed:', error);
    process.exit(1);
  }
}

// Input sanitization
export function sanitizeString(input: string, maxLength: number = 1000): string {
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/[<>]/g, ''); // Remove < and > characters
}

export function sanitizeHtml(input: string): string {
  // Basic HTML sanitization - in production, use a proper library like DOMPurify
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Rate limiting helpers
export function createRateLimitKey(prefix: string, identifier: string): string {
  return `rate_limit:${prefix}:${identifier}`;
}

export function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}