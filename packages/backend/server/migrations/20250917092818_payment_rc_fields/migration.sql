-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('stripe', 'revenuecat');

-- CreateEnum
CREATE TYPE "IapStore" AS ENUM ('app_store', 'play_store');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "iap_store" "IapStore",
ADD COLUMN     "provider" "Provider" NOT NULL DEFAULT 'stripe',
ADD COLUMN     "rc_entitlement" VARCHAR,
ADD COLUMN     "rc_external_ref" VARCHAR,
ADD COLUMN     "rc_product_id" VARCHAR;
