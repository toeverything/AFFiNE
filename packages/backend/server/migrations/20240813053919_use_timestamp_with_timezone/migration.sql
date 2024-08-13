/*
  Warnings:

  - The primary key for the `snapshot_histories` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "_data_migrations" ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "finished_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ai_prompts_messages" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ai_prompts_metadata" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ai_sessions_messages" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ai_sessions_metadata" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "app_runtime_settings" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "features" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "multiple_users_sessions" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "snapshot_histories" ALTER COLUMN "timestamp" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "expired_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "snapshots" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "updates" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user_connected_accounts" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user_features" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "expired_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user_invoices" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user_sessions" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user_stripe_customers" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user_subscriptions" ALTER COLUMN "start" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "end" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "next_bill_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "canceled_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "trial_start" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "trial_end" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "email_verified" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "verification_tokens" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "workspace_features" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "expired_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "workspace_page_user_permissions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "workspace_user_permissions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);
