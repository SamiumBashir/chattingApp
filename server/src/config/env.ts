import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:3000'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/connectly'),
  
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  ALLOWED_ORIGINS: z.string().optional(),
  
  CLOUDINARY_CLOUD_NAME: z.string().optional().default('mock_cloud'),
  CLOUDINARY_API_KEY: z.string().optional().default('mock_key'),
  CLOUDINARY_API_SECRET: z.string().optional().default('mock_secret'),
  
  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),

  REDIS_URL: z.string().optional(),
  
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Connectly <no-reply@connectly.app>'),

  // WebRTC STUN & TURN Infrastructure
  TURN_SERVER_URL: z.string().optional(),
  TURNS_SERVER_URL: z.string().optional(),
  TURN_SECRET: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
  TURN_CREDENTIAL_TTL: z.coerce.number().default(86400),
  STUN_SERVERS: z.string().optional(),
});

const parseEnv = () => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment variables configuration:');
    parsed.error.issues.forEach((issue) => {
      // eslint-disable-next-line no-console
      console.error(` - ${issue.path.join('.')}: ${issue.message}`);
    });
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    // Return fallback for testing if needed
    return envSchema.parse({
      ...process.env,
      JWT_ACCESS_SECRET: 'test_secret_must_be_at_least_32_characters_long_123',
      JWT_REFRESH_SECRET: 'test_refresh_must_be_at_least_32_characters_long_123',
    });
  }
  return parsed.data;
};

export const env = parseEnv();
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Returns a strict, verified array of allowed CORS origins
 */
export const getAllowedOrigins = (): string[] => {
  const origins = new Set<string>();

  // Configured client origin
  if (env.CLIENT_URL) {
    env.CLIENT_URL.split(',').forEach((url) => {
      const trimmed = url.trim().replace(/\/+$/, '');
      if (trimmed) origins.add(trimmed);
    });
  }

  // Explicit allowed origins list
  if (env.ALLOWED_ORIGINS) {
    env.ALLOWED_ORIGINS.split(',').forEach((url) => {
      const trimmed = url.trim().replace(/\/+$/, '');
      if (trimmed) origins.add(trimmed);
    });
  }

  // Known production frontend domain
  origins.add('https://chatting-app-nine-sigma.vercel.app');

  // Development & testing localhost origins
  if (env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
    origins.add('http://localhost:5000');
    origins.add('http://127.0.0.1:5000');
  }

  return Array.from(origins);
};

