-- AlterTable
ALTER TABLE "blobs" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "snapshot_histories" (
    "workspace_id" VARCHAR(36) NOT NULL,
    "guid" VARCHAR(36) NOT NULL,
    "seq" INTEGER NOT NULL,
    "blob" BYTEA NOT NULL,
    "state" BYTEA,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshot_histories_pkey" PRIMARY KEY ("workspace_id","guid","seq")
);
