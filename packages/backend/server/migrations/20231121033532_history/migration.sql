-- AlterTable
ALTER TABLE "blobs" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "snapshot_histories" (
    "workspace_id" VARCHAR(36) NOT NULL,
    "guid" VARCHAR(36) NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "blob" BYTEA NOT NULL,
    "state" BYTEA,
    "expired_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "snapshot_histories_pkey" PRIMARY KEY ("workspace_id","guid","timestamp")
);
