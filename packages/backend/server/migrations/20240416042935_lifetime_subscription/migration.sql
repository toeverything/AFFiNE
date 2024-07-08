-- AlterTable
ALTER TABLE "user_subscriptions" ALTER COLUMN "stripe_subscription_id" DROP NOT NULL,
ALTER COLUMN "end" DROP NOT NULL;
