-- CreateTable
CREATE TABLE "entitlements" (
    "id" VARCHAR NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" VARCHAR,
    "source" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "subject_id" VARCHAR,
    "issuer" TEXT,
    "quantity" INTEGER,
    "signed_payload" BYTEA,
    "token_hash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "issued_at" TIMESTAMPTZ(3),
    "starts_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "validated_at" TIMESTAMPTZ(3),
    "grace_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entitlements_target_type_check" CHECK ("target_type" IN ('user', 'workspace', 'instance')),
    CONSTRAINT "entitlements_source_check" CHECK ("source" IN ('builtin', 'cloud_subscription', 'selfhost_license', 'admin_grant')),
    CONSTRAINT "entitlements_status_check" CHECK ("status" IN ('active', 'grace', 'expired', 'revoked', 'needs_reupload')),
    CONSTRAINT "entitlements_quantity_check" CHECK ("quantity" IS NULL OR ("quantity" > 0 AND "quantity" <= 100000))
);

-- CreateTable
CREATE TABLE "effective_user_quota_states" (
    "user_id" VARCHAR NOT NULL,
    "plan" TEXT NOT NULL,
    "source_entitlement_id" VARCHAR,
    "blob_limit" BIGINT NOT NULL,
    "storage_quota" BIGINT NOT NULL,
    "used_storage_quota" BIGINT NOT NULL DEFAULT 0,
    "history_period_seconds" INTEGER NOT NULL,
    "copilot_action_limit" INTEGER,
    "flags" JSONB NOT NULL DEFAULT '{}',
    "known" BOOLEAN NOT NULL DEFAULT false,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "last_reconciled_at" TIMESTAMPTZ(3),
    "stale_after" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "effective_user_quota_states_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "effective_user_quota_states_blob_limit_check" CHECK ("blob_limit" >= 0),
    CONSTRAINT "effective_user_quota_states_storage_quota_check" CHECK ("storage_quota" >= 0),
    CONSTRAINT "effective_user_quota_states_used_storage_quota_check" CHECK ("used_storage_quota" >= 0),
    CONSTRAINT "effective_user_quota_states_history_period_check" CHECK ("history_period_seconds" >= 0),
    CONSTRAINT "effective_user_quota_states_copilot_limit_check" CHECK ("copilot_action_limit" IS NULL OR "copilot_action_limit" >= 0)
);

-- CreateTable
CREATE TABLE "effective_workspace_quota_states" (
    "workspace_id" VARCHAR NOT NULL,
    "plan" TEXT NOT NULL,
    "source_entitlement_id" VARCHAR,
    "owner_user_id" VARCHAR,
    "uses_owner_quota" BOOLEAN NOT NULL DEFAULT false,
    "seat_limit" INTEGER NOT NULL,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "overcapacity_member_count" INTEGER NOT NULL DEFAULT 0,
    "blob_limit" BIGINT NOT NULL,
    "storage_quota" BIGINT NOT NULL,
    "used_storage_quota" BIGINT NOT NULL DEFAULT 0,
    "history_period_seconds" INTEGER NOT NULL,
    "readonly" BOOLEAN NOT NULL DEFAULT false,
    "readonly_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "flags" JSONB NOT NULL DEFAULT '{}',
    "known" BOOLEAN NOT NULL DEFAULT false,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "last_reconciled_at" TIMESTAMPTZ(3),
    "stale_after" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "effective_workspace_quota_states_pkey" PRIMARY KEY ("workspace_id"),
    CONSTRAINT "effective_workspace_quota_states_seat_limit_check" CHECK ("seat_limit" >= 0),
    CONSTRAINT "effective_workspace_quota_states_member_count_check" CHECK ("member_count" >= 0),
    CONSTRAINT "effective_workspace_quota_states_overcapacity_check" CHECK ("overcapacity_member_count" >= 0),
    CONSTRAINT "effective_workspace_quota_states_blob_limit_check" CHECK ("blob_limit" >= 0),
    CONSTRAINT "effective_workspace_quota_states_storage_quota_check" CHECK ("storage_quota" >= 0),
    CONSTRAINT "effective_workspace_quota_states_used_storage_quota_check" CHECK ("used_storage_quota" >= 0),
    CONSTRAINT "effective_workspace_quota_states_history_period_check" CHECK ("history_period_seconds" >= 0),
    CONSTRAINT "effective_workspace_quota_states_readonly_reasons_check" CHECK ("readonly_reasons" <@ ARRAY['member_overflow', 'storage_overflow']::TEXT[])
);

-- CreateIndex
CREATE INDEX "entitlements_target_type_target_id_status_idx" ON "entitlements"("target_type", "target_id", "status");

-- CreateIndex
CREATE INDEX "entitlements_status_expires_at_idx" ON "entitlements"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_active_subject_key" ON "entitlements"("source", "subject_id")
WHERE "subject_id" IS NOT NULL AND "status" IN ('active', 'grace');

-- CreateIndex
CREATE INDEX "effective_user_quota_states_known_stale_idx" ON "effective_user_quota_states"("known", "stale");

-- CreateIndex
CREATE INDEX "effective_user_quota_states_stale_after_idx" ON "effective_user_quota_states"("stale_after");

-- CreateIndex
CREATE INDEX "effective_workspace_quota_states_owner_user_id_idx" ON "effective_workspace_quota_states"("owner_user_id");

-- CreateIndex
CREATE INDEX "effective_workspace_quota_states_known_stale_idx" ON "effective_workspace_quota_states"("known", "stale");

-- CreateIndex
CREATE INDEX "effective_workspace_quota_states_readonly_stale_idx" ON "effective_workspace_quota_states"("readonly", "stale");

-- CreateIndex
CREATE INDEX "effective_workspace_quota_states_stale_after_idx" ON "effective_workspace_quota_states"("stale_after");

-- AddForeignKey
ALTER TABLE "effective_user_quota_states" ADD CONSTRAINT "effective_user_quota_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "effective_user_quota_states" ADD CONSTRAINT "effective_user_quota_states_source_entitlement_id_fkey" FOREIGN KEY ("source_entitlement_id") REFERENCES "entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "effective_workspace_quota_states" ADD CONSTRAINT "effective_workspace_quota_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "effective_workspace_quota_states" ADD CONSTRAINT "effective_workspace_quota_states_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "effective_workspace_quota_states" ADD CONSTRAINT "effective_workspace_quota_states_source_entitlement_id_fkey" FOREIGN KEY ("source_entitlement_id") REFERENCES "entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "project_legacy_entitlement_features"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_quota_plan TEXT;
  active_team_quantity INTEGER;
BEGIN
  IF NEW."target_type" = 'user' THEN
    SELECT "plan"
      INTO active_quota_plan
      FROM "entitlements"
     WHERE "target_type" = 'user'
       AND "target_id" = NEW."target_id"
       AND (
         ("status" = 'active' AND ("expires_at" IS NULL OR "expires_at" > now()))
         OR ("status" = 'grace' AND "grace_until" > now())
       )
       AND "plan" IN ('lifetime_pro', 'pro')
     ORDER BY CASE "plan" WHEN 'lifetime_pro' THEN 0 ELSE 1 END, "updated_at" DESC
     LIMIT 1;

    IF active_quota_plan IS NOT NULL THEN
      UPDATE "user_features"
         SET "activated" = false
       WHERE "user_id" = NEW."target_id"
         AND "name" IN ('pro_plan_v1', 'lifetime_pro_plan_v1')
         AND "name" <> CASE
           WHEN active_quota_plan = 'lifetime_pro' THEN 'lifetime_pro_plan_v1'
           ELSE 'pro_plan_v1'
         END
         AND "activated" = true;

      IF NOT EXISTS (
        SELECT 1 FROM "user_features"
         WHERE "user_id" = NEW."target_id"
           AND "name" = CASE
             WHEN active_quota_plan = 'lifetime_pro' THEN 'lifetime_pro_plan_v1'
             ELSE 'pro_plan_v1'
           END
           AND "activated" = true
      ) THEN
        INSERT INTO "user_features"("user_id", "name", "type", "reason", "activated")
        VALUES (
          NEW."target_id",
          CASE
            WHEN active_quota_plan = 'lifetime_pro' THEN 'lifetime_pro_plan_v1'
            ELSE 'pro_plan_v1'
          END,
          1,
          'legacy entitlement projection trigger',
          true
        );
      END IF;
    ELSE
      UPDATE "user_features"
         SET "activated" = false
       WHERE "user_id" = NEW."target_id"
         AND "name" IN ('pro_plan_v1', 'lifetime_pro_plan_v1')
         AND "activated" = true;
    END IF;

    IF EXISTS (
      SELECT 1 FROM "entitlements"
       WHERE "target_type" = 'user'
         AND "target_id" = NEW."target_id"
         AND (
           ("status" = 'active' AND ("expires_at" IS NULL OR "expires_at" > now()))
           OR ("status" = 'grace' AND "grace_until" > now())
         )
         AND "plan" = 'ai'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM "user_features"
         WHERE "user_id" = NEW."target_id"
           AND "name" = 'unlimited_copilot'
           AND "activated" = true
      ) THEN
        INSERT INTO "user_features"("user_id", "name", "type", "reason", "activated")
        VALUES (
          NEW."target_id",
          'unlimited_copilot',
          0,
          'legacy entitlement projection trigger',
          true
        );
      END IF;
    ELSE
      UPDATE "user_features"
         SET "activated" = false
       WHERE "user_id" = NEW."target_id"
         AND "name" = 'unlimited_copilot'
         AND "activated" = true;
    END IF;
  ELSIF NEW."target_type" = 'workspace' THEN
    SELECT "quantity"
      INTO active_team_quantity
      FROM "entitlements"
     WHERE "target_type" = 'workspace'
       AND "target_id" = NEW."target_id"
       AND (
         ("status" = 'active' AND ("expires_at" IS NULL OR "expires_at" > now()))
         OR ("status" = 'grace' AND "grace_until" > now())
       )
       AND "plan" IN ('team', 'selfhost_team')
       AND "quantity" IS NOT NULL
     ORDER BY CASE "plan" WHEN 'selfhost_team' THEN 0 ELSE 1 END, "updated_at" DESC
     LIMIT 1;

    IF active_team_quantity IS NULL THEN
      DELETE FROM "workspace_features"
       WHERE "workspace_id" = NEW."target_id"
         AND "name" = 'team_plan_v1';
    ELSE
      UPDATE "workspace_features"
         SET "configs" = json_build_object('memberLimit', active_team_quantity),
             "reason" = 'legacy entitlement projection trigger',
             "activated" = true
       WHERE "workspace_id" = NEW."target_id"
         AND "name" = 'team_plan_v1'
         AND "activated" = true;

      IF NOT FOUND THEN
        INSERT INTO "workspace_features"(
          "workspace_id",
          "name",
          "type",
          "configs",
          "reason",
          "activated"
        )
        VALUES (
          NEW."target_id",
          'team_plan_v1',
          1,
          json_build_object('memberLimit', active_team_quantity),
          'legacy entitlement projection trigger',
          true
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_legacy_entitlement_features_trigger"
AFTER INSERT OR UPDATE ON "entitlements"
FOR EACH ROW
EXECUTE FUNCTION "project_legacy_entitlement_features"();

CREATE OR REPLACE FUNCTION "project_legacy_workspace_readonly_feature"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."readonly" THEN
    UPDATE "workspace_features"
       SET "reason" = 'legacy quota state projection trigger',
           "activated" = true
     WHERE "workspace_id" = NEW."workspace_id"
       AND "name" = 'quota_exceeded_readonly_workspace_v1'
       AND "activated" = true;

    IF NOT FOUND THEN
      INSERT INTO "workspace_features"(
        "workspace_id",
        "name",
        "type",
        "configs",
        "reason",
        "activated"
      )
      VALUES (
        NEW."workspace_id",
        'quota_exceeded_readonly_workspace_v1',
        0,
        '{}',
        'legacy quota state projection trigger',
        true
      );
    END IF;
  ELSE
    DELETE FROM "workspace_features"
     WHERE "workspace_id" = NEW."workspace_id"
       AND "name" = 'quota_exceeded_readonly_workspace_v1';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_legacy_workspace_readonly_feature_trigger"
AFTER INSERT OR UPDATE OF "readonly" ON "effective_workspace_quota_states"
FOR EACH ROW
EXECUTE FUNCTION "project_legacy_workspace_readonly_feature"();
