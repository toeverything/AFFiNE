-- CreateTable
CREATE TABLE "ai_workspace_byok_configs" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "provider" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" VARCHAR,
    "encrypted_api_key" TEXT NOT NULL,
    "endpoint" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabled_reason" VARCHAR,
    "last_validated_at" TIMESTAMPTZ(3),
    "last_validation_error" TEXT,
    "last_used_at" TIMESTAMPTZ(3),
    "last_error_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_by" VARCHAR,
    "updated_by" VARCHAR,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_workspace_byok_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "user_id" VARCHAR,
    "provider" VARCHAR NOT NULL,
    "provider_source" VARCHAR NOT NULL,
    "feature_kind" VARCHAR NOT NULL,
    "model" VARCHAR,
    "session_id" VARCHAR,
    "task_id" VARCHAR,
    "action_id" VARCHAR,
    "billing_unit_id" VARCHAR,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_workspace_byok_configs_workspace_id_idx" ON "ai_workspace_byok_configs"("workspace_id");

-- CreateIndex
CREATE INDEX "ai_workspace_byok_configs_workspace_id_provider_enabled_sor_idx" ON "ai_workspace_byok_configs"("workspace_id", "provider", "enabled", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ai_workspace_byok_configs_workspace_id_provider_name_key" ON "ai_workspace_byok_configs"("workspace_id", "provider", "name");

-- CreateIndex
CREATE INDEX "ai_usage_events_workspace_id_created_at_idx" ON "ai_usage_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_workspace_id_provider_source_created_at_idx" ON "ai_usage_events"("workspace_id", "provider_source", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_feature_kind_created_at_idx" ON "ai_usage_events"("feature_kind", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_quota_exempt_idx" ON "ai_usage_events"("user_id", "provider_source", "feature_kind", "billing_unit_id");

-- AddForeignKey
ALTER TABLE "ai_workspace_byok_configs" ADD CONSTRAINT "ai_workspace_byok_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
