CREATE TABLE IF NOT EXISTS "workspace_admin_stats_daily" (
  "workspace_id" VARCHAR NOT NULL,
  "date" DATE NOT NULL,
  "snapshot_size" BIGINT NOT NULL DEFAULT 0,
  "blob_size" BIGINT NOT NULL DEFAULT 0,
  "member_count" BIGINT NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "workspace_admin_stats_daily_pkey" PRIMARY KEY ("workspace_id", "date"),
  CONSTRAINT "workspace_admin_stats_daily_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "workspace_admin_stats_daily_date_idx" ON "workspace_admin_stats_daily" ("date");

CREATE TABLE IF NOT EXISTS "sync_active_users_minutely" (
  "minute_ts" TIMESTAMPTZ(3) NOT NULL,
  "active_users" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "sync_active_users_minutely_pkey" PRIMARY KEY ("minute_ts")
);

CREATE TABLE IF NOT EXISTS "workspace_doc_view_daily" (
  "workspace_id" VARCHAR NOT NULL,
  "doc_id" VARCHAR NOT NULL,
  "date" DATE NOT NULL,
  "total_views" BIGINT NOT NULL DEFAULT 0,
  "unique_views" BIGINT NOT NULL DEFAULT 0,
  "guest_views" BIGINT NOT NULL DEFAULT 0,
  "last_accessed_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "workspace_doc_view_daily_pkey" PRIMARY KEY ("workspace_id", "doc_id", "date"),
  CONSTRAINT "workspace_doc_view_daily_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "workspace_doc_view_daily_workspace_id_date_idx" ON "workspace_doc_view_daily" ("workspace_id", "date");

CREATE TABLE IF NOT EXISTS "workspace_member_last_access" (
  "workspace_id" VARCHAR NOT NULL,
  "user_id" VARCHAR NOT NULL,
  "last_accessed_at" TIMESTAMPTZ(3) NOT NULL,
  "last_doc_id" VARCHAR,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "workspace_member_last_access_pkey" PRIMARY KEY ("workspace_id", "user_id"),
  CONSTRAINT "workspace_member_last_access_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_member_last_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "workspace_member_last_access_workspace_id_last_accessed_at_idx" ON "workspace_member_last_access" ("workspace_id", "last_accessed_at" DESC);

CREATE INDEX IF NOT EXISTS "workspace_member_last_access_workspace_id_last_doc_id_idx" ON "workspace_member_last_access" ("workspace_id", "last_doc_id");

CREATE INDEX IF NOT EXISTS "workspace_pages_public_published_at_idx" ON "workspace_pages" ("public", "published_at");

CREATE INDEX IF NOT EXISTS "ai_sessions_messages_created_at_role_idx" ON "ai_sessions_messages" ("created_at", "role");

DROP TRIGGER IF EXISTS user_features_set_feature_id ON "user_features";

DROP TRIGGER IF EXISTS workspace_features_set_feature_id ON "workspace_features";

DROP FUNCTION IF EXISTS set_user_feature_id_from_name();

DROP FUNCTION IF EXISTS set_workspace_feature_id_from_name();

DROP FUNCTION IF EXISTS ensure_feature_exists(TEXT);

ALTER TABLE
  "user_features" DROP CONSTRAINT "user_features_feature_id_fkey";

ALTER TABLE
  "workspace_features" DROP CONSTRAINT "workspace_features_feature_id_fkey";

DROP INDEX "user_features_feature_id_idx";

DROP INDEX "workspace_features_feature_id_idx";

ALTER TABLE
  "user_features" DROP COLUMN "feature_id";

ALTER TABLE
  "workspace_features" DROP COLUMN "feature_id";

DROP TABLE "features";