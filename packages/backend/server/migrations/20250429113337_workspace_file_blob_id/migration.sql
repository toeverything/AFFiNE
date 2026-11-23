DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ai_workspace_files') THEN
            -- AlterTable
            ALTER TABLE "ai_workspace_files"
                ADD COLUMN "blob_id" VARCHAR NOT NULL DEFAULT '';
        END IF;
    END
$$;