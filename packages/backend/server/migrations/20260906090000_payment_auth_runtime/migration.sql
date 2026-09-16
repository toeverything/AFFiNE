-- Additive while 0.27.4 and the new server can share the database. Provider
-- namespaces that cannot be inferred from legacy rows remain NULL until the
-- cutover validates and adopts them. Destructive cleanup is deferred.
ALTER TABLE "user_stripe_customers"
  ADD COLUMN "provider_namespace" TEXT;

ALTER TABLE "provider_subscriptions"
  ADD COLUMN "provider_namespace" TEXT,
  ADD COLUMN "source_identity" TEXT,
  ADD COLUMN "gives_access" BOOLEAN,
  ADD COLUMN "will_renew" BOOLEAN;

UPDATE "provider_subscriptions"
SET "source_identity" = "external_subscription_id"
WHERE "provider" = 'stripe' AND "external_subscription_id" IS NOT NULL;

ALTER TABLE "invoices"
  ADD COLUMN "provider_namespace" TEXT;

ALTER TABLE "payment_events"
  ADD COLUMN "provider_namespace" TEXT,
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3);

ALTER TABLE "subscription_trial_usages"
  ADD COLUMN "provider_namespace" TEXT;

ALTER TABLE "user_connected_accounts"
  ADD COLUMN "provider_namespace" TEXT;

CREATE UNIQUE INDEX "provider_subscriptions_provider_namespace_source_identity_key"
  ON "provider_subscriptions"("provider_namespace", "source_identity");

CREATE UNIQUE INDEX "payment_events_provider_namespace_external_event_id_key"
  ON "payment_events"("provider_namespace", "external_event_id");

CREATE UNIQUE INDEX "user_connected_accounts_provider_namespace_subject_key"
  ON "user_connected_accounts"("provider_namespace", "provider_account_id")
  WHERE "provider_namespace" IS NOT NULL;

CREATE TABLE "payment_financial_facts" (
  "id" VARCHAR NOT NULL,
  "provider" "Provider" NOT NULL,
  "provider_namespace" TEXT NOT NULL,
  "object_kind" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "source_identity" TEXT,
  "external_invoice_id" TEXT,
  "external_payment_id" TEXT,
  "status" TEXT NOT NULL,
  "amount" INTEGER,
  "currency" VARCHAR(3),
  "occurred_at" TIMESTAMPTZ(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_financial_facts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_financial_facts_kind_check" CHECK ("object_kind" IN ('refund', 'dispute', 'invoice')),
  CONSTRAINT "payment_financial_facts_identity_check" CHECK (length("provider_namespace") > 0 AND length("external_id") > 0)
);

CREATE UNIQUE INDEX "payment_financial_facts_provider_namespace_object_kind_external_id_key"
  ON "payment_financial_facts"("provider_namespace", "object_kind", "external_id");
CREATE INDEX "payment_financial_facts_provider_namespace_source_identity_idx"
  ON "payment_financial_facts"("provider_namespace", "source_identity");
CREATE INDEX "payment_financial_facts_provider_namespace_external_invoice_id_idx"
  ON "payment_financial_facts"("provider_namespace", "external_invoice_id");

CREATE TABLE "payment_operations" (
  "id" VARCHAR NOT NULL,
  "provider" "Provider" NOT NULL,
  "provider_namespace" TEXT NOT NULL,
  "operation_type" TEXT NOT NULL,
  "intent_id" TEXT NOT NULL,
  "primary_resource_key" TEXT NOT NULL,
  "resource_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "target_type" TEXT,
  "target_id" VARCHAR,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "steps" JSONB NOT NULL DEFAULT '[]',
  "result" JSONB,
  "first_sent_at" TIMESTAMPTZ(3),
  "replay_deadline" TIMESTAMPTZ(3),
  "next_attempt_at" TIMESTAMPTZ(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" TEXT,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_operations_status_check" CHECK ("status" IN ('pending', 'completed', 'rejected', 'blocked')),
  CONSTRAINT "payment_operations_target_type_check" CHECK ("target_type" IS NULL OR "target_type" IN ('user', 'workspace', 'instance')),
  CONSTRAINT "payment_operations_steps_check" CHECK (jsonb_typeof("steps") = 'array'),
  CONSTRAINT "payment_operations_identity_check" CHECK (
    length("provider_namespace") > 0 AND length("intent_id") > 0 AND length("primary_resource_key") > 0
  ),
  CONSTRAINT "payment_operations_attempt_count_check" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "payment_operations_provider_namespace_intent_id_key"
  ON "payment_operations"("provider_namespace", "intent_id");
CREATE INDEX "payment_operations_status_next_attempt_at_idx"
  ON "payment_operations"("status", "next_attempt_at");
CREATE INDEX "payment_operations_provider_namespace_primary_resource_key_idx"
  ON "payment_operations"("provider_namespace", "primary_resource_key");
CREATE UNIQUE INDEX "payment_operations_unfinished_resource_key"
  ON "payment_operations"("provider_namespace", "primary_resource_key")
  WHERE "status" IN ('pending', 'blocked');

ALTER INDEX "payment_financial_facts_provider_namespace_object_kind_external"
  RENAME TO "payment_financial_facts_namespace_kind_external_key";
ALTER INDEX "payment_financial_facts_provider_namespace_external_invoice_id_"
  RENAME TO "payment_financial_facts_namespace_invoice_idx";

ALTER TABLE "payment_events"
  DROP CONSTRAINT "payment_events_processing_status_check",
  ADD CONSTRAINT "payment_events_processing_status_check"
    CHECK ("processing_status" IN ('pending', 'processing', 'processed', 'failed', 'ignored', 'blocked'));

ALTER TABLE "users"
  ADD COLUMN "auth_epoch" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "auth_refresh_tokens"
  ADD COLUMN "successor_ciphertext" TEXT,
  ADD COLUMN "successor_expires_at" TIMESTAMPTZ(3);

ALTER TABLE "auth_refresh_tokens"
  ADD CONSTRAINT "auth_refresh_tokens_successor_material_check" CHECK (
    ("successor_ciphertext" IS NULL AND "successor_expires_at" IS NULL)
    OR ("successor_ciphertext" IS NOT NULL AND "successor_expires_at" IS NOT NULL)
  );
