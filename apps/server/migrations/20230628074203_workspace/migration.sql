-- CreateTable
CREATE TABLE "blobs" (
    "hash" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "blob" BYTEA NOT NULL,
    "length" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blobs_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "optimized_blobs" (
    "hash" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "params" VARCHAR NOT NULL,
    "blob" BYTEA NOT NULL,
    "length" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "optimized_blobs_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "docs" (
    "id" SERIAL NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "guid" VARCHAR NOT NULL,
    "is_workspace" BOOLEAN NOT NULL DEFAULT true,
    "blob" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "docs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blobs_workspace_id_hash_key" ON "blobs"("workspace_id", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "optimized_blobs_workspace_id_hash_params_key" ON "optimized_blobs"("workspace_id", "hash", "params");

-- CreateIndex
CREATE INDEX "docs_workspace_id_guid_idx" ON "docs"("workspace_id", "guid");

-- AddForeignKey
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimized_blobs" ADD CONSTRAINT "optimized_blobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docs" ADD CONSTRAINT "docs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
