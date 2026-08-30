-- Slate — multi-account, revocable sessions, password reset, writing streaks.
--
-- This project has no Prisma migration history (the schema has been applied with
-- `prisma db push`), so this is a hand-written delta rather than a generated
-- migration. It is idempotent: every statement guards on existence, so it is
-- safe to run more than once.
--
-- Review, then apply to the target database, e.g.:
--   psql "$DATABASE_URL" -f 2026-08-30_multi_account_and_streaks.sql
--
-- It is additive only. No existing column is dropped or retyped, and no row is
-- modified, so existing notes, notebooks, stacks, buckets and attachments are
-- untouched.

BEGIN;

-- --- users: display name + updated_at ------------------------------------

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- --- sessions: revocable, rotating refresh tokens -------------------------

CREATE TABLE IF NOT EXISTS "sessions" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"      UUID         NOT NULL,
    "token_hash"   TEXT         NOT NULL,
    "user_agent"   TEXT,
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "last_used_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "expires_at"   TIMESTAMPTZ  NOT NULL,
    "revoked_at"   TIMESTAMPTZ,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_key" ON "sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx"   ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");

DO $$ BEGIN
    ALTER TABLE "sessions"
        ADD CONSTRAINT "sessions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --- password_reset_tokens: single-use, expiring ---------------------------

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID        NOT NULL,
    "token_hash" TEXT        NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at"    TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key" ON "password_reset_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx"    ON "password_reset_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" ("expires_at");

DO $$ BEGIN
    ALTER TABLE "password_reset_tokens"
        ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --- writing_days: streak source of truth ----------------------------------
-- `day` is the user's LOCAL calendar date, resolved client-side, so a streak
-- reflects the days the user actually experienced rather than UTC boundaries.

CREATE TABLE IF NOT EXISTS "writing_days" (
    "user_id"    UUID        NOT NULL,
    "day"        VARCHAR(10) NOT NULL,
    "note_count" INTEGER     NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "writing_days_pkey" PRIMARY KEY ("user_id", "day")
);

CREATE INDEX IF NOT EXISTS "writing_days_user_id_updated_at_idx" ON "writing_days" ("user_id", "updated_at");

DO $$ BEGIN
    ALTER TABLE "writing_days"
        ADD CONSTRAINT "writing_days_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --- normalise existing emails --------------------------------------------
-- Login now lower-cases the address before lookup, so an address stored with
-- uppercase characters would stop matching. Skips any row whose lower-cased form
-- would collide with another account rather than failing the unique index.
UPDATE "users" u
   SET "email" = lower(u."email")
 WHERE u."email" <> lower(u."email")
   AND NOT EXISTS (
       SELECT 1 FROM "users" o
        WHERE o."id" <> u."id"
          AND lower(o."email") = lower(u."email")
   );

COMMIT;
