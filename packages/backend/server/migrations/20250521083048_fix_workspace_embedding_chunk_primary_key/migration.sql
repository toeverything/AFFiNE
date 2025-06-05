/*
  Warnings:

  - The primary key for the `ai_workspace_embeddings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ai_workspace_file_embeddings` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ai_workspace_embeddings') AND
           EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ai_workspace_file_embeddings') THEN
            -- DropIndex
            DROP INDEX "ai_workspace_embeddings_workspace_id_doc_id_chunk_key";

            -- DropIndex
            DROP INDEX "ai_workspace_file_embeddings_workspace_id_file_id_chunk_key";

            -- AlterTable
            ALTER TABLE "ai_workspace_embeddings"
                DROP CONSTRAINT "ai_workspace_embeddings_pkey",
                ADD CONSTRAINT "ai_workspace_embeddings_pkey" PRIMARY KEY ("workspace_id", "doc_id", "chunk");

            -- AlterTable
            ALTER TABLE "ai_workspace_file_embeddings"
                DROP CONSTRAINT "ai_workspace_file_embeddings_pkey",
                ADD CONSTRAINT "ai_workspace_file_embeddings_pkey" PRIMARY KEY ("workspace_id", "file_id", "chunk");
        END IF;
    END
$$;
