-- CreateTable
CREATE TABLE "calendar_accounts" (
    "id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "provider" VARCHAR NOT NULL,
    "provider_account_id" VARCHAR NOT NULL,
    "display_name" VARCHAR,
    "email" VARCHAR,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "status" VARCHAR NOT NULL DEFAULT 'active',
    "last_error" TEXT,
    "refresh_interval_minutes" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_subscriptions" (
    "id" VARCHAR NOT NULL,
    "account_id" VARCHAR NOT NULL,
    "provider" VARCHAR NOT NULL,
    "external_calendar_id" VARCHAR NOT NULL,
    "display_name" VARCHAR,
    "timezone" VARCHAR,
    "color" VARCHAR,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sync_token" TEXT,
    "last_sync_at" TIMESTAMPTZ(3),
    "custom_channel_id" VARCHAR,
    "custom_resource_id" VARCHAR,
    "channel_expiration" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_calendars" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "created_by_user_id" VARCHAR NOT NULL,
    "display_name_override" VARCHAR,
    "color_override" VARCHAR,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_calendar_items" (
    "id" VARCHAR NOT NULL,
    "workspace_calendar_id" VARCHAR NOT NULL,
    "subscription_id" VARCHAR NOT NULL,
    "sort_order" INTEGER,
    "color_override" VARCHAR,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_calendar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" VARCHAR NOT NULL,
    "subscription_id" VARCHAR NOT NULL,
    "external_event_id" VARCHAR NOT NULL,
    "recurrence_id" VARCHAR,
    "etag" VARCHAR,
    "status" VARCHAR,
    "title" VARCHAR,
    "description" TEXT,
    "location" VARCHAR,
    "start_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "end_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "original_timezone" VARCHAR,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "provider_updated_at" TIMESTAMPTZ(3),
    "raw" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_instances" (
    "id" VARCHAR NOT NULL,
    "calendar_event_id" VARCHAR NOT NULL,
    "recurrence_id" VARCHAR NOT NULL,
    "start_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "end_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "original_timezone" VARCHAR,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "provider_updated_at" TIMESTAMPTZ(3),
    "raw" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_event_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_accounts_user_id_idx" ON "calendar_accounts"("user_id");

-- CreateIndex
CREATE INDEX "calendar_accounts_provider_provider_account_id_idx" ON "calendar_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_accounts_user_id_provider_provider_account_id_key" ON "calendar_accounts"("user_id", "provider", "provider_account_id");

-- CreateIndex
CREATE INDEX "calendar_subscriptions_account_id_idx" ON "calendar_subscriptions"("account_id");

-- CreateIndex
CREATE INDEX "calendar_subscriptions_provider_external_calendar_id_idx" ON "calendar_subscriptions"("provider", "external_calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_subscriptions_account_id_external_calendar_id_key" ON "calendar_subscriptions"("account_id", "external_calendar_id");

-- CreateIndex
CREATE INDEX "workspace_calendars_workspace_id_idx" ON "workspace_calendars"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_calendar_items_subscription_id_idx" ON "workspace_calendar_items"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_calendar_items_workspace_calendar_id_subscription_key" ON "workspace_calendar_items"("workspace_calendar_id", "subscription_id");

-- CreateIndex
CREATE INDEX "calendar_events_subscription_id_start_at_utc_idx" ON "calendar_events"("subscription_id", "start_at_utc");

-- CreateIndex
CREATE INDEX "calendar_events_subscription_id_end_at_utc_idx" ON "calendar_events"("subscription_id", "end_at_utc");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_subscription_id_external_event_id_recurrenc_key" ON "calendar_events"("subscription_id", "external_event_id", "recurrence_id");

-- CreateIndex
CREATE INDEX "calendar_event_instances_calendar_event_id_start_at_utc_idx" ON "calendar_event_instances"("calendar_event_id", "start_at_utc");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_instances_calendar_event_id_recurrence_id_key" ON "calendar_event_instances"("calendar_event_id", "recurrence_id");

-- AddForeignKey
ALTER TABLE "calendar_accounts" ADD CONSTRAINT "calendar_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_subscriptions" ADD CONSTRAINT "calendar_subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "calendar_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_calendars" ADD CONSTRAINT "workspace_calendars_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_calendars" ADD CONSTRAINT "workspace_calendars_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_calendar_items" ADD CONSTRAINT "workspace_calendar_items_workspace_calendar_id_fkey" FOREIGN KEY ("workspace_calendar_id") REFERENCES "workspace_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_calendar_items" ADD CONSTRAINT "workspace_calendar_items_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "calendar_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "calendar_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_instances" ADD CONSTRAINT "calendar_event_instances_calendar_event_id_fkey" FOREIGN KEY ("calendar_event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
