/*
  Warnings:

  - You are about to drop the column `expires_at` on the `multiple_users_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `seq` on the `snapshots` table. All the data in the column will be lost.
  - You are about to drop the column `seq` on the `updates` table. All the data in the column will be lost.
  - You are about to drop the column `accepted` on the `workspace_user_permissions` table. All the data in the column will be lost.
  - You are about to drop the `app_runtime_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_invoices` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_subscriptions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "app_runtime_settings" DROP CONSTRAINT "app_runtime_settings_last_updated_by_fkey";

-- AlterTable
ALTER TABLE "multiple_users_sessions" DROP COLUMN "expires_at";

-- AlterTable
ALTER TABLE "snapshots" DROP COLUMN "seq";

-- AlterTable
ALTER TABLE "updates" DROP COLUMN "seq";

-- AlterTable
ALTER TABLE "workspace_user_permissions" DROP COLUMN "accepted";

-- DropTable
DROP TABLE "app_runtime_settings";

-- DropTable
DROP TABLE "user_invoices";

-- DropTable
DROP TABLE "user_subscriptions";

-- DropEnum
DROP TYPE "RuntimeConfigType";
