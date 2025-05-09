-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('Mention', 'Invitation', 'InvitationAccepted', 'InvitationBlocked', 'InvitationRejected');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('High', 'Default', 'Low', 'Min', 'None');

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "NotificationLevel" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "type" "NotificationType" NOT NULL,
    "body" JSONB NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_read_idx" ON "notifications"("user_id", "created_at", "read");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
