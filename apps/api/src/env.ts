import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Azure Blob Storage
  AZURE_STORAGE_ACCOUNT: z.string().min(1),
  AZURE_STORAGE_KEY: z.string().min(1),
  AZURE_STORAGE_CONTAINER: z.string().default('attachments'),

  // Seed / bootstrap account
  SEED_EMAIL: z.string().email().optional(),
  SEED_PASSWORD: z.string().min(8).optional(),

  /**
   * Who may create an account. Defaults to `invite` because the app is served
   * from a public URL: open signup would let strangers consume the owner's
   * Postgres and Blob Storage. `invite` requires SIGNUP_INVITE_CODE to be set —
   * if it is not, registration fails closed rather than silently opening up.
   */
  SIGNUP_MODE: z.enum(['open', 'invite', 'closed']).default('invite'),
  SIGNUP_INVITE_CODE: z.string().min(8).optional(),

  /** Public URL of the web app; used to build password-reset links. */
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Outbound email. `console` prints the message to the server log, which keeps
  // the reset flow fully functional before a provider is configured.
  MAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  MAIL_FROM: z.string().default('Slate <onboarding@resend.dev>'),
  RESEND_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (env.MAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
  console.error('MAIL_PROVIDER=resend requires RESEND_API_KEY.');
  process.exit(1);
}

if (env.SIGNUP_MODE === 'invite' && !env.SIGNUP_INVITE_CODE) {
  // Not fatal: the rest of the app is fine, only registration is unavailable.
  console.warn(
    'SIGNUP_MODE=invite but SIGNUP_INVITE_CODE is unset — registration is disabled until it is.',
  );
}
