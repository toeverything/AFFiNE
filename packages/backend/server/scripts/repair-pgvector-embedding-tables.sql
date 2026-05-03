DO $$
DECLARE
  has_hnsw BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS "vector";
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'pgvector extension is not available. Skip repairing copilot embedding tables.';
        RETURN;
    END;
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_am WHERE amname = 'hnsw') INTO has_hnsw;

  IF NOT has_hnsw THEN
    RAISE NOTICE 'pgvector HNSW index access method is not available. Skip repairing copilot embedding indexes.';
  END IF;

  IF to_regclass('public.ai_contexts') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS "ai_context_embeddings" (
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

    IF has_hnsw THEN
      CREATE INDEX IF NOT EXISTS "ai_context_embeddings_idx"
        ON "ai_context_embeddings" USING hnsw ("embedding" vector_cosine_ops);
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS "ai_context_embeddings_context_id_file_id_chunk_key"
      ON "ai_context_embeddings"("context_id", "file_id", "chunk");

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ai_context_embeddings_context_id_fkey'
        AND conrelid = 'public.ai_context_embeddings'::regclass
    ) THEN
      ALTER TABLE "ai_context_embeddings"
        ADD CONSTRAINT "ai_context_embeddings_context_id_fkey"
        FOREIGN KEY ("context_id") REFERENCES "ai_contexts"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;

  IF to_regclass('public.snapshots') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS "ai_workspace_embeddings" (
      "workspace_id" VARCHAR NOT NULL,
      "doc_id" VARCHAR NOT NULL,
      "chunk" INTEGER NOT NULL,
      "content" VARCHAR NOT NULL,
      "embedding" vector(1024) NOT NULL,
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(3) NOT NULL,
      CONSTRAINT "ai_workspace_embeddings_pkey"
        PRIMARY KEY ("workspace_id", "doc_id", "chunk")
    );

    IF has_hnsw THEN
      CREATE INDEX IF NOT EXISTS "ai_workspace_embeddings_idx"
        ON "ai_workspace_embeddings" USING hnsw ("embedding" vector_cosine_ops);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ai_workspace_embeddings_workspace_id_doc_id_fkey'
        AND conrelid = 'public.ai_workspace_embeddings'::regclass
    ) THEN
      ALTER TABLE "ai_workspace_embeddings"
        ADD CONSTRAINT "ai_workspace_embeddings_workspace_id_doc_id_fkey"
        FOREIGN KEY ("workspace_id", "doc_id")
        REFERENCES "snapshots"("workspace_id", "guid")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;

  IF to_regclass('public.ai_workspace_files') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS "ai_workspace_file_embeddings" (
      "workspace_id" VARCHAR NOT NULL,
      "file_id" VARCHAR NOT NULL,
      "chunk" INTEGER NOT NULL,
      "content" VARCHAR NOT NULL,
      "embedding" vector(1024) NOT NULL,
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ai_workspace_file_embeddings_pkey"
        PRIMARY KEY ("workspace_id", "file_id", "chunk")
    );

    IF has_hnsw THEN
      CREATE INDEX IF NOT EXISTS "ai_workspace_file_embeddings_idx"
        ON "ai_workspace_file_embeddings" USING hnsw ("embedding" vector_cosine_ops);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ai_workspace_file_embeddings_workspace_id_file_id_fkey'
        AND conrelid = 'public.ai_workspace_file_embeddings'::regclass
    ) THEN
      ALTER TABLE "ai_workspace_file_embeddings"
        ADD CONSTRAINT "ai_workspace_file_embeddings_workspace_id_file_id_fkey"
        FOREIGN KEY ("workspace_id", "file_id")
        REFERENCES "ai_workspace_files"("workspace_id", "file_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;

  IF to_regclass('public.blobs') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS "ai_workspace_blob_embeddings" (
      "workspace_id" VARCHAR NOT NULL,
      "blob_id" VARCHAR NOT NULL,
      "chunk" INTEGER NOT NULL,
      "content" VARCHAR NOT NULL,
      "embedding" vector(1024) NOT NULL,
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ai_workspace_blob_embeddings_pkey"
        PRIMARY KEY ("workspace_id", "blob_id", "chunk")
    );

    IF has_hnsw THEN
      CREATE INDEX IF NOT EXISTS "ai_workspace_blob_embeddings_idx"
        ON "ai_workspace_blob_embeddings" USING hnsw ("embedding" vector_cosine_ops);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ai_workspace_blob_embeddings_workspace_id_blob_id_fkey'
        AND conrelid = 'public.ai_workspace_blob_embeddings'::regclass
    ) THEN
      ALTER TABLE "ai_workspace_blob_embeddings"
        ADD CONSTRAINT "ai_workspace_blob_embeddings_workspace_id_blob_id_fkey"
        FOREIGN KEY ("workspace_id", "blob_id")
        REFERENCES "blobs"("workspace_id", "key")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
