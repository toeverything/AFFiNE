-- AlterTable
ALTER TABLE
    "calendar_subscriptions"
ADD
    COLUMN "next_sync_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD
    COLUMN "sync_retry_count" INTEGER NOT NULL DEFAULT 0;

UPDATE
    "calendar_subscriptions" AS s
SET
    "next_sync_at" = CASE
        WHEN s."last_sync_at" IS NULL THEN CURRENT_TIMESTAMP
        ELSE s."last_sync_at" + make_interval(
            mins => COALESCE(a."refresh_interval_minutes", 30)
        )
    END
FROM
    "calendar_accounts" AS a
WHERE
    a."id" = s."account_id";

-- CreateIndex
CREATE INDEX "calendar_subscriptions_custom_channel_id_idx" ON "calendar_subscriptions"("custom_channel_id");

-- CreateIndex
CREATE INDEX "calendar_subscriptions_enabled_next_sync_at_idx" ON "calendar_subscriptions"("enabled", "next_sync_at");
