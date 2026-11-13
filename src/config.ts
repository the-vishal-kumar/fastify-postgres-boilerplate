import { z } from 'zod';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port: number;
  databaseUrl: string;
  jwtSecretKey: string;
  userTokenTtlMinutes: number;
  adminTokenTtlMinutes: number;
  adminSignupEnabled: boolean;
  corsOrigins: string[] | '*';
  trustProxy: boolean | number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  authRateLimitMax: number;
  shutdownTimeoutMs: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

const int = (min: number, fallback: number) => z.coerce.number().int().min(min).default(fallback);

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false'], { message: 'must be true or false' })
    .default(fallback ? 'true' : 'false')
    .transform(value => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string({ message: 'is required' })
    .regex(/^postgres(ql)?:\/\/.+/, 'must be a postgres:// or postgresql:// URL'),
  JWT_SECRET_KEY: z.string({ message: 'is required' }).min(32, 'must be at least 32 characters long'),
  USER_TOKEN_TTL_MINUTES: int(1, 24 * 60),
  ADMIN_TOKEN_TTL_MINUTES: int(1, 20),
  ADMIN_SIGNUP_ENABLED: bool(false),
  CORS_ORIGINS: z.string().default('*'),
  TRUST_PROXY: z
    .string()
    .regex(/^(true|false|\d+)$/, 'must be true, false or a hop count')
    .default('false')
    .transform(value => (value === 'true' ? true : value === 'false' ? false : Number(value))),
  RATE_LIMIT_WINDOW_MS: int(1000, 60_000),
  RATE_LIMIT_MAX: int(1, 300),
  AUTH_RATE_LIMIT_MAX: int(1, 20),
  SHUTDOWN_TIMEOUT_MS: int(0, 10_000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

/**
 * Validates the environment once at start-up and returns a typed config.
 * Every problem is reported in one go, instead of failing on first use.
 */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  // Empty strings count as unset, as they do in most .env files.
  const input = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = schema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues.map(issue => `  - ${issue.path.join('.')} ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const value = result.data;
  const corsOrigins = value.CORS_ORIGINS.trim();
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    jwtSecretKey: value.JWT_SECRET_KEY,
    userTokenTtlMinutes: value.USER_TOKEN_TTL_MINUTES,
    adminTokenTtlMinutes: value.ADMIN_TOKEN_TTL_MINUTES,
    adminSignupEnabled: value.ADMIN_SIGNUP_ENABLED,
    corsOrigins:
      corsOrigins === '*'
        ? '*'
        : corsOrigins
            .split(',')
            .map(origin => origin.trim())
            .filter(Boolean),
    trustProxy: value.TRUST_PROXY,
    rateLimitWindowMs: value.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: value.RATE_LIMIT_MAX,
    authRateLimitMax: value.AUTH_RATE_LIMIT_MAX,
    shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS,
    logLevel: value.LOG_LEVEL,
  };
};
