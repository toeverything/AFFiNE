-- CreateTable
CREATE TABLE "anonymous_doc_access_links" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "token_hash" VARCHAR NOT NULL,
    "role" SMALLINT NOT NULL DEFAULT 20,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_user_id" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "anonymous_doc_access_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_doc_guest_sessions" (
    "id" VARCHAR NOT NULL,
    "link_id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "guest_id" VARCHAR NOT NULL,
    "token_hash" VARCHAR NOT NULL,
    "display_name" VARCHAR NOT NULL,
    "color" VARCHAR NOT NULL,
    "reverted_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_doc_guest_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_doc_updates" (
    "id" VARCHAR NOT NULL,
    "link_id" VARCHAR NOT NULL,
    "guest_session_id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "update" BYTEA NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_doc_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_doc_access_links_token_hash_key" ON "anonymous_doc_access_links"("token_hash");

-- CreateIndex
CREATE INDEX "anonymous_doc_access_links_workspace_id_doc_id_idx" ON "anonymous_doc_access_links"("workspace_id", "doc_id");

-- CreateIndex
CREATE INDEX "anonymous_doc_access_links_workspace_id_doc_id_enabled_idx" ON "anonymous_doc_access_links"("workspace_id", "doc_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_doc_guest_sessions_token_hash_key" ON "anonymous_doc_guest_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "anonymous_doc_guest_sessions_link_id_idx" ON "anonymous_doc_guest_sessions"("link_id");

-- CreateIndex
CREATE INDEX "anonymous_doc_guest_sessions_workspace_id_doc_id_idx" ON "anonymous_doc_guest_sessions"("workspace_id", "doc_id");

-- CreateIndex
CREATE INDEX "anonymous_doc_updates_guest_session_id_timestamp_idx" ON "anonymous_doc_updates"("guest_session_id", "timestamp");

-- CreateIndex
CREATE INDEX "anonymous_doc_updates_workspace_id_doc_id_timestamp_idx" ON "anonymous_doc_updates"("workspace_id", "doc_id", "timestamp");
