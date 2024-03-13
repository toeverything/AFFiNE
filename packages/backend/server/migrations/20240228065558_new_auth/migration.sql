-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- CreateTable
CREATE TABLE "user_connected_accounts" (
    "id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "provider" VARCHAR NOT NULL,
    "provider_account_id" VARCHAR NOT NULL,
    "scope" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_connected_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "multiple_users_sessions" (
    "id" VARCHAR(36) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "multiple_users_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" VARCHAR(36) NOT NULL,
    "session_id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "token" VARCHAR(36) NOT NULL,
    "type" SMALLINT NOT NULL,
    "credential" TEXT,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL
);

-- CreateIndex
CREATE INDEX "user_connected_accounts_user_id_idx" ON "user_connected_accounts"("user_id");

-- CreateIndex
CREATE INDEX "user_connected_accounts_provider_account_id_idx" ON "user_connected_accounts"("provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_session_id_user_id_key" ON "user_sessions"("session_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_type_token_key" ON "verification_tokens"("type", "token");

-- AddForeignKey
ALTER TABLE "user_connected_accounts" ADD CONSTRAINT "user_connected_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "multiple_users_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
