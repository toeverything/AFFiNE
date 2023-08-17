/*
  Warnings:

  - The primary key for the `blobs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `optimized_blobs` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "blobs" DROP CONSTRAINT "blobs_pkey",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "length" SET DATA TYPE BIGINT,
ADD CONSTRAINT "blobs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "optimized_blobs" DROP CONSTRAINT "optimized_blobs_pkey",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "length" SET DATA TYPE BIGINT,
ADD CONSTRAINT "optimized_blobs_pkey" PRIMARY KEY ("id");
