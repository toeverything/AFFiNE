-- CreateTable
CREATE TABLE "blobs" (
    "workspace_id" VARCHAR NOT NULL,
    "key" VARCHAR NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "blobs_pkey" PRIMARY KEY ("workspace_id","key")
);

-- AddForeignKey
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
