/*
  Warnings:

  - Changed the type of `public` on the `workspaces` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('PUBLIC', 'ALL', 'PRIVATE');

-- AlterTable
ALTER TABLE "workspaces" DROP COLUMN "public",
ADD COLUMN     "public" "WorkspaceStatus" NOT NULL;

-- DropEnum
DROP TYPE "PublicStatus";
