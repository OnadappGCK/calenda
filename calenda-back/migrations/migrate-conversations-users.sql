-- Backfill schema for conversations feature + missing user profile fields
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS patterns).

ALTER TABLE public."users"
  ADD COLUMN IF NOT EXISTS "bio" text NULL;

ALTER TABLE public."users"
  ADD COLUMN IF NOT EXISTS "isBanned" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public."conversation_groups" (
  "id" uuid PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text))::uuid,
  "eventId" uuid NOT NULL,
  "creatorId" uuid NOT NULL,
  "title" text NOT NULL,
  "villeDepart" text NULL,
  "trancheAge" text NULL,
  "ambiance" text NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_conversation_groups_event" FOREIGN KEY ("eventId") REFERENCES public."events"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_conversation_groups_creator" FOREIGN KEY ("creatorId") REFERENCES public."users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."conversation_participants" (
  "id" uuid PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text))::uuid,
  "groupId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_conversation_participants_group" FOREIGN KEY ("groupId") REFERENCES public."conversation_groups"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_conversation_participants_user" FOREIGN KEY ("userId") REFERENCES public."users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_conversation_participants_group_user"
  ON public."conversation_participants" ("groupId", "userId");

CREATE TABLE IF NOT EXISTS public."conversation_messages" (
  "id" uuid PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text))::uuid,
  "groupId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "content" text NOT NULL,
  "status" text NOT NULL DEFAULT 'VISIBLE',
  "reportCount" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_conversation_messages_group" FOREIGN KEY ("groupId") REFERENCES public."conversation_groups"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_conversation_messages_user" FOREIGN KEY ("userId") REFERENCES public."users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."conversation_blocks" (
  "id" uuid PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text))::uuid,
  "groupId" uuid NOT NULL,
  "blockerId" uuid NOT NULL,
  "blockedId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_conversation_blocks_group" FOREIGN KEY ("groupId") REFERENCES public."conversation_groups"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_conversation_blocks_blocker" FOREIGN KEY ("blockerId") REFERENCES public."users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_conversation_blocks_blocked" FOREIGN KEY ("blockedId") REFERENCES public."users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_conversation_blocks_group_blocker_blocked"
  ON public."conversation_blocks" ("groupId", "blockerId", "blockedId");

CREATE TABLE IF NOT EXISTS public."conversation_message_likes" (
  "id" uuid PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text))::uuid,
  "messageId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_conversation_message_likes_message" FOREIGN KEY ("messageId") REFERENCES public."conversation_messages"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_conversation_message_likes_user" FOREIGN KEY ("userId") REFERENCES public."users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_conversation_message_likes_message_user"
  ON public."conversation_message_likes" ("messageId", "userId");
