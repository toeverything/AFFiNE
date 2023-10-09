/*
  Warnings:

  - You are about to drop the column `feature` on the `user_feature_gates` table. All the data in the column will be lost.
  - Added the required column `expires_at` to the `user_feature_gates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `featureId` to the `user_feature_gates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "user_feature_gates" DROP COLUMN "feature",
ADD COLUMN     "expires_at" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "featureId" VARCHAR NOT NULL;

-- CreateTable
CREATE TABLE "user_features" (
    "id" VARCHAR NOT NULL,
    "feature" VARCHAR NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "configs" JSON NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_quota_gates" (
    "id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "quotaId" VARCHAR NOT NULL,
    "reason" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_quota_gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_quotas" (
    "id" VARCHAR NOT NULL,
    "quota" VARCHAR NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "configs" JSON NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT '2099-12-31 23:59:59 +00:00',

    CONSTRAINT "user_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_features_feature_key" ON "user_features"("feature");

-- CreateIndex
CREATE UNIQUE INDEX "user_quotas_quota_key" ON "user_quotas"("quota");

-- AddForeignKey
ALTER TABLE "user_feature_gates" ADD CONSTRAINT "user_feature_gates_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "user_features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_quota_gates" ADD CONSTRAINT "user_quota_gates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_quota_gates" ADD CONSTRAINT "user_quota_gates_quotaId_fkey" FOREIGN KEY ("quotaId") REFERENCES "user_quotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
