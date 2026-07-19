-- CreateTable
CREATE TABLE "provider_subscriptions" (
    "id" VARCHAR NOT NULL,
    "provider" "Provider" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" VARCHAR NOT NULL,
    "plan" VARCHAR(20) NOT NULL,
    "recurring" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL,
    "external_customer_id" VARCHAR,
    "external_subscription_id" VARCHAR,
    "external_product_id" VARCHAR,
    "external_price_id" VARCHAR,
    "iap_store" "IapStore",
    "external_ref" VARCHAR,
    "currency" VARCHAR(3),
    "amount" INTEGER,
    "quantity" INTEGER,
    "period_start" TIMESTAMPTZ(3),
    "period_end" TIMESTAMPTZ(3),
    "trial_start" TIMESTAMPTZ(3),
    "trial_end" TIMESTAMPTZ(3),
    "canceled_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_subscriptions_target_type_check" CHECK ("target_type" IN ('user', 'workspace', 'instance')),
    CONSTRAINT "provider_subscriptions_stripe_identity_check" CHECK ("provider" <> 'stripe' OR "external_subscription_id" IS NOT NULL),
    CONSTRAINT "provider_subscriptions_revenuecat_identity_check" CHECK ("provider" <> 'revenuecat' OR ("iap_store" IS NOT NULL AND "external_ref" IS NOT NULL AND "external_product_id" IS NOT NULL AND "external_customer_id" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" VARCHAR NOT NULL,
    "provider" "Provider" NOT NULL,
    "event_type" VARCHAR NOT NULL,
    "external_event_id" VARCHAR NOT NULL,
    "target_type" TEXT,
    "target_id" VARCHAR,
    "external_invoice_id" VARCHAR,
    "external_payment_id" VARCHAR,
    "plan" VARCHAR(20),
    "amount" INTEGER,
    "currency" VARCHAR(3),
    "occurred_at" TIMESTAMPTZ(3),
    "processing_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "processing_attempts" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_events_target_type_check" CHECK ("target_type" IS NULL OR "target_type" IN ('user', 'workspace', 'instance')),
    CONSTRAINT "payment_events_processing_status_check" CHECK ("processing_status" IN ('pending', 'processing', 'processed', 'failed'))
);

-- CreateTable
CREATE TABLE "subscription_trial_usages" (
    "id" VARCHAR NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" VARCHAR NOT NULL,
    "plan" VARCHAR(20) NOT NULL,
    "provider" "Provider" NOT NULL,
    "external_ref" VARCHAR,
    "first_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_trial_usages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_trial_usages_target_type_check" CHECK ("target_type" IN ('user', 'workspace', 'instance'))
);

-- CreateIndex
CREATE INDEX "provider_subscriptions_target_type_target_id_plan_status_idx" ON "provider_subscriptions"("target_type", "target_id", "plan", "status");

-- CreateIndex
CREATE INDEX "provider_subscriptions_provider_external_customer_id_idx" ON "provider_subscriptions"("provider", "external_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_subscriptions_provider_external_subscription_id_key" ON "provider_subscriptions"("provider", "external_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_subscriptions_revenuecat_external_identity_key" ON "provider_subscriptions"("provider", "iap_store", "external_ref", "external_product_id", "external_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_external_event_id_key" ON "payment_events"("provider", "external_event_id");

-- CreateIndex
CREATE INDEX "payment_events_processing_status_updated_at_idx" ON "payment_events"("processing_status", "updated_at");

-- CreateIndex
CREATE INDEX "payment_events_target_type_target_id_idx" ON "payment_events"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_trial_usages_target_type_target_id_plan_key" ON "subscription_trial_usages"("target_type", "target_id", "plan");

-- CreateIndex
CREATE INDEX "subscription_trial_usages_provider_external_ref_idx" ON "subscription_trial_usages"("provider", "external_ref");
