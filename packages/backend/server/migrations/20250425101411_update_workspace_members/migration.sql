-- CreateEnum
CREATE TYPE "WorkspaceMemberSource" AS ENUM ('Email', 'Link');

-- AlterEnum
ALTER TYPE "WorkspaceMemberStatus" ADD VALUE 'AllocatingSeat';

-- AlterTable
ALTER TABLE "workspace_user_permissions" ADD COLUMN     "inviter_id" VARCHAR,
ADD COLUMN     "source" "WorkspaceMemberSource" NOT NULL DEFAULT 'Email';

-- AddForeignKey
ALTER TABLE "workspace_user_permissions" ADD CONSTRAINT "workspace_user_permissions_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
