-- CreateEnum
CREATE TYPE "BlobStatus" AS ENUM ('pending', 'completed');

-- AlterTable
ALTER TABLE "blobs" ADD COLUMN     "status" "BlobStatus" NOT NULL DEFAULT 'completed',
ADD COLUMN     "upload_id" VARCHAR;
