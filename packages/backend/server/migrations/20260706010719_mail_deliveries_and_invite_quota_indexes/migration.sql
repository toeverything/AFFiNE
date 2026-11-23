-- CreateTable
CREATE TABLE "mail_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mail_name" TEXT NOT NULL,
    "mail_class" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "recipient_email" TEXT,
    "recipient_hash" TEXT NOT NULL,
    "recipient_domain" TEXT NOT NULL,
    "recipient_user_id" VARCHAR,
    "actor_user_id" VARCHAR,
    "workspace_id" VARCHAR,
    "notification_id" VARCHAR,
    "abuse_subject_key" TEXT,
    "quota_reservation_id" UUID,
    "quota_decision" JSONB,
    "payload" JSONB,
    "send_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "locked_by" TEXT,
    "locked_until" TIMESTAMPTZ(3),
    "first_attempt_at" TIMESTAMPTZ(3),
    "last_attempt_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "settled_at" TIMESTAMPTZ(3),
    "canceled_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "provider_message_id" TEXT,
    "provider_response" TEXT,
    "last_error_code" TEXT,
    "last_error" TEXT,
    "retention_state" TEXT NOT NULL DEFAULT 'full',
    "anonymized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mail_deliveries_priority_check" CHECK ("priority" IN ('critical', 'high', 'normal', 'low')),
    CONSTRAINT "mail_deliveries_status_check" CHECK ("status" IN ('queued', 'sending', 'retry_wait', 'sent', 'skipped', 'failed', 'canceled')),
    CONSTRAINT "mail_deliveries_attempt_count_check" CHECK ("attempt_count" >= 0),
    CONSTRAINT "mail_deliveries_max_attempts_check" CHECK ("max_attempts" >= 0),
    CONSTRAINT "mail_deliveries_retention_state_check" CHECK ("retention_state" IN ('full', 'anonymized')),
    CONSTRAINT "mail_deliveries_payload_retention_check" CHECK (
      (
        "status" IN ('queued', 'sending', 'retry_wait')
        AND "retention_state" = 'full'
        AND "recipient_email" IS NOT NULL
        AND "payload" IS NOT NULL
      )
      OR (
        "status" IN ('sent', 'skipped', 'failed', 'canceled')
        AND "retention_state" = 'anonymized'
        AND "recipient_email" IS NULL
        AND "payload" IS NULL
        AND "anonymized_at" IS NOT NULL
      )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_deliveries_dedupe_key_idx"
  ON "mail_deliveries"("dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;

-- CreateIndex
CREATE INDEX "mail_deliveries_ready_idx"
  ON "mail_deliveries"("status", "send_after", "locked_until");

-- CreateIndex
CREATE INDEX "mail_deliveries_pending_expires_at_idx"
  ON "mail_deliveries"("expires_at")
  WHERE "status" IN ('queued', 'sending', 'retry_wait') AND "expires_at" IS NOT NULL;

-- CreateIndex
CREATE INDEX "mail_deliveries_created_at_idx" ON "mail_deliveries"("created_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_mail_name_status_created_at_idx" ON "mail_deliveries"("mail_name", "status", "created_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_mail_class_status_created_at_idx" ON "mail_deliveries"("mail_class", "status", "created_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_status_created_at_idx" ON "mail_deliveries"("status", "created_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_settled_at_idx" ON "mail_deliveries"("settled_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_settled_name_status_idx"
  ON "mail_deliveries"("settled_at", "mail_name", "status")
  WHERE "settled_at" IS NOT NULL;

-- CreateIndex
CREATE INDEX "mail_deliveries_recipient_domain_created_at_idx" ON "mail_deliveries"("recipient_domain", "created_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_workspace_id_created_at_idx" ON "mail_deliveries"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_actor_user_id_created_at_idx" ON "mail_deliveries"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_abuse_subject_key_created_at_idx" ON "mail_deliveries"("abuse_subject_key", "created_at");

-- CreateIndex
CREATE INDEX "workspace_invitations_inviter_created_at_idx"
  ON "workspace_invitations"("inviter_user_id", "created_at");

-- CreateIndex
CREATE INDEX "workspace_invitations_inviter_status_created_at_idx"
  ON "workspace_invitations"("inviter_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "workspace_invitations_workspace_inviter_created_at_idx"
  ON "workspace_invitations"("workspace_id", "inviter_user_id", "created_at");

-- CreateIndex
CREATE INDEX "workspace_invitations_workspace_status_created_at_idx"
  ON "workspace_invitations"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "workspace_invitations_workspace_accepted_at_idx"
  ON "workspace_invitations"("workspace_id", "accepted_at");

-- CreateIndex
CREATE INDEX "workspace_members_workspace_state_created_at_idx"
  ON "workspace_members"("workspace_id", "state", "created_at");
