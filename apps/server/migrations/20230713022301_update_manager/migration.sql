/*
  Warnings:

  - You are about to drop the `docs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "docs";

-- CreateTable
CREATE TABLE "snapshots" (
    "guid" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "blob" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("guid")
);

-- CreateTable
CREATE TABLE "updates" (
    "object_id" VARCHAR NOT NULL,
    "guid" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "blob" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "updates_pkey" PRIMARY KEY ("object_id")
);

-- CreateIndex
CREATE INDEX "snapshots_workspace_id_idx" ON "snapshots"("workspace_id");

-- CreateIndex
CREATE INDEX "updates_guid_workspace_id_idx" ON "updates"("guid", "workspace_id");

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "updates" ADD CONSTRAINT "updates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
