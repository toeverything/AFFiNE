-- CreateTable

/*
  Warnings:

  - The primary key for the `ai_workspace_embeddings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ai_workspace_file_embeddings` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ai_workspace_embeddings') AND
           EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ai_workspace_file_embeddings') THEN
            CREATE TABLE "ai_workspace_blob_embeddings" (
                "workspace_id" VARCHAR NOT NULL,
                "blob_id" VARCHAR NOT NULL,
                "chunk" INTEGER NOT NULL,
                "content" VARCHAR NOT NULL,
                "embedding" vector(1024) NOT NULL,
                "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT "ai_workspace_blob_embeddings_pkey" PRIMARY KEY ("workspace_id","blob_id","chunk")
            );

            -- CreateIndex
            CREATE INDEX "ai_workspace_blob_embeddings_idx" ON "ai_workspace_blob_embeddings"
                USING hnsw (embedding vector_cosine_ops);

            -- AddForeignKey
            ALTER TABLE "ai_workspace_blob_embeddings"
                ADD CONSTRAINT "ai_workspace_blob_embeddings_workspace_id_blob_id_fkey"
                FOREIGN KEY ("workspace_id", "blob_id")
                REFERENCES "blobs"("workspace_id", "key")
                ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
    END
$$;
