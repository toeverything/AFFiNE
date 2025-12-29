/*
  Warnings:

  - You are about to drop the column `feature_id` on the `user_features` table. All the data in the column will be lost.
  - You are about to drop the column `feature_id` on the `workspace_features` table. All the data in the column will be lost.
  - You are about to drop the `features` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "user_features" DROP CONSTRAINT "user_features_feature_id_fkey";

-- DropForeignKey
ALTER TABLE "workspace_features" DROP CONSTRAINT "workspace_features_feature_id_fkey";

-- DropIndex
DROP INDEX "user_features_feature_id_idx";

-- DropIndex
DROP INDEX "workspace_features_feature_id_idx";

-- AlterTable
ALTER TABLE "user_features" DROP COLUMN "feature_id";

-- AlterTable
ALTER TABLE "workspace_features" DROP COLUMN "feature_id";

-- DropTable
DROP TABLE "features";
