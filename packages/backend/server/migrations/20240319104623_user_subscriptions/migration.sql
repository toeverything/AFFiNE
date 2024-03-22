/*
  Warnings:

  - A unique constraint covering the columns `[user_id,plan]` on the table `user_subscriptions` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "user_subscriptions_user_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_user_id_plan_key" ON "user_subscriptions"("user_id", "plan");
