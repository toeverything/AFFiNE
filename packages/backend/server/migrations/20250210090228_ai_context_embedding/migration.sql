DO $$
DECLARE error_message TEXT;
BEGIN -- check if pgvector extension is installed
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    BEGIN
      -- CreateExtension
      CREATE EXTENSION IF NOT EXISTS "vector";
    EXCEPTION
      WHEN OTHERS THEN
        -- if not found and cannot create extension, raise the exception
        error_message := 'pgvector extension not found.' || E'\n' ||
        '****************************************************************************' || E'\n' ||
        '*                                                                          *' || E'\n' ||
        '*   NOTICE: From AFFiNE 0.20 onwards, the copilot module will depend       *' || E'\n' ||
        '*           on pgvector.                                                   *' || E'\n' ||
        '*                                                                          *' || E'\n' ||
        '*   1. If you are using the official PostgreSQL Docker container,          *' || E'\n' ||
        '*      please switch to the pgvector/pgvector:pg${VERSION} container,      *' || E'\n' ||
        '*      where ${VERSION} is the major version of your PostgreSQL container. *' || E'\n' ||
        '*                                                                          *' || E'\n' ||
        '*   2. If you are using a self-installed PostgreSQL, please follow the     *' || E'\n' ||
        '*      the official pgvector installation guide to install it into your    *' || E'\n' ||
        '*      database: https://github.com/pgvector/pgvector?tab=readme-ov-       *' || E'\n' ||
        '*      file#installation-notes---linux-and-mac                             *' || E'\n' ||
        '*                                                                          *' || E'\n' ||
        '****************************************************************************';

        RAISE WARNING '%', error_message;
    END;
  END IF;
  -- check again, initialize the tables if the extension is installed
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- CreateTable
    CREATE TABLE "ai_context_embeddings" (
        "id" VARCHAR NOT NULL,
        "context_id" VARCHAR NOT NULL,
        "file_id" VARCHAR NOT NULL,
        "chunk" INTEGER NOT NULL,
        "content" VARCHAR NOT NULL,
        "embedding" vector(1024) NOT NULL,
        "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(3) NOT NULL,

        CONSTRAINT "ai_context_embeddings_pkey" PRIMARY KEY ("id")
    );

    -- CreateTable
    CREATE TABLE "ai_workspace_embeddings" (
        "workspace_id" VARCHAR NOT NULL,
        "doc_id" VARCHAR NOT NULL,
        "chunk" INTEGER NOT NULL,
        "content" VARCHAR NOT NULL,
        "embedding" vector(1024) NOT NULL,
        "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(3) NOT NULL,

        CONSTRAINT "ai_workspace_embeddings_pkey" PRIMARY KEY ("workspace_id","doc_id")
    );

    -- CreateIndex
    CREATE INDEX IF NOT EXISTS "ai_context_embeddings_idx" ON ai_context_embeddings USING hnsw (embedding vector_cosine_ops);

    -- CreateIndex
    CREATE UNIQUE INDEX "ai_context_embeddings_context_id_file_id_chunk_key" ON "ai_context_embeddings"("context_id", "file_id", "chunk");

    -- CreateIndex
    CREATE INDEX IF NOT EXISTS "ai_workspace_embeddings_idx" ON ai_workspace_embeddings USING hnsw (embedding vector_cosine_ops);

    -- AddForeignKey
    ALTER TABLE "ai_context_embeddings" ADD CONSTRAINT "ai_context_embeddings_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "ai_contexts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "ai_workspace_embeddings" ADD CONSTRAINT "ai_workspace_embeddings_workspace_id_doc_id_fkey" FOREIGN KEY ("workspace_id", "doc_id") REFERENCES "snapshots"("workspace_id", "guid") ON DELETE CASCADE ON UPDATE CASCADE;

    -- CreateIndex
    CREATE UNIQUE INDEX "ai_workspace_embeddings_workspace_id_doc_id_chunk_key" ON "ai_workspace_embeddings"("workspace_id", "doc_id", "chunk");
  END IF;
END $$;
