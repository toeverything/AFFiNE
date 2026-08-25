CREATE TABLE "auth_sessions" (
    "id" VARCHAR NOT NULL,
    "user_session_id" VARCHAR NOT NULL,
    "installation_id" VARCHAR NOT NULL,
    "platform" VARCHAR NOT NULL,
    "device_name" VARCHAR,
    "app_version" VARCHAR,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" VARCHAR,
    "last_ip_hash" VARCHAR,
    "last_user_agent" VARCHAR,
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_refresh_tokens" (
    "id" VARCHAR NOT NULL,
    "auth_session_id" VARCHAR NOT NULL,
    "generation" INTEGER NOT NULL,
    "secret_hash" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "replaced_by_id" VARCHAR,
    "grace_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "auth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_sessions_user_session_id_key" ON "auth_sessions"("user_session_id");
CREATE INDEX "auth_sessions_installation_id_idx" ON "auth_sessions"("installation_id");
CREATE INDEX "auth_sessions_idle_expires_at_idx" ON "auth_sessions"("idle_expires_at");
CREATE INDEX "auth_sessions_absolute_expires_at_idx" ON "auth_sessions"("absolute_expires_at");
CREATE UNIQUE INDEX "auth_refresh_tokens_replaced_by_id_key" ON "auth_refresh_tokens"("replaced_by_id");
CREATE UNIQUE INDEX "auth_refresh_tokens_auth_session_id_generation_key" ON "auth_refresh_tokens"("auth_session_id", "generation");
CREATE INDEX "auth_refresh_tokens_auth_session_id_used_at_idx" ON "auth_refresh_tokens"("auth_session_id", "used_at");
CREATE INDEX "auth_refresh_tokens_expires_at_idx" ON "auth_refresh_tokens"("expires_at");

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_session_id_fkey" FOREIGN KEY ("user_session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_auth_session_id_fkey" FOREIGN KEY ("auth_session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "auth_refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
