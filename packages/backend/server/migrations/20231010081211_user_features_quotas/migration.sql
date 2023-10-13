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
    "type" INTEGER NOT NULL,
    "configs" JSON NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_features_feature_key" ON "user_features"("feature");

-- AddForeignKey
ALTER TABLE "user_feature_gates" ADD CONSTRAINT "user_feature_gates_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "user_features"("id") ON DELETE CASCADE ON UPDATE CASCADE;
