-- CreateTable
CREATE TABLE "ai_contexts" (
    "id" VARCHAR NOT NULL,
    "session_id" VARCHAR NOT NULL,
    "config" JSON NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_contexts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ai_contexts" ADD CONSTRAINT "ai_contexts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_sessions_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;
