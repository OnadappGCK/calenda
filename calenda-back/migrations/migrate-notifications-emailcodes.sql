-- Migration: email_verification_codes + user_notifications + emailVerificationToken user column
-- Safe to run multiple times (IF NOT EXISTS patterns).

-- Colonne emailVerificationToken si absente (ancienne migration aurait pu la manquer)
ALTER TABLE public."users"
  ADD COLUMN IF NOT EXISTS "emailVerificationToken" text NULL;

-- Table email_verification_codes
CREATE TABLE IF NOT EXISTS public."email_verification_codes" (
  "id" uuid PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text))::uuid,
  "email" text NOT NULL,
  "purpose" text NOT NULL,
  "codeHash" text NOT NULL,
  "userId" text NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_email_verification_codes_email_purpose"
  ON public."email_verification_codes" ("email", "purpose");

-- Table user_notifications
CREATE TABLE IF NOT EXISTS public."user_notifications" (
  "id" uuid PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text))::uuid,
  "userId" uuid NOT NULL,
  "type" text NOT NULL,
  "eventId" text NULL,
  "groupId" text NULL,
  "text" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "notifDate" text NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_user_notifications_user" FOREIGN KEY ("userId") REFERENCES public."users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_user_notifications_userId"
  ON public."user_notifications" ("userId");

CREATE INDEX IF NOT EXISTS "IDX_user_notifications_userId_type_notifDate"
  ON public."user_notifications" ("userId", "type", "notifDate")
  WHERE "notifDate" IS NOT NULL;
