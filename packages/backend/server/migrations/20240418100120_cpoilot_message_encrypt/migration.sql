-- AlterTable
ALTER TABLE
    "ai_sessions_metadata"
ADD
    COLUMN "encrypted" BOOLEAN;

UPDATE
    "ai_sessions_metadata"
SET
    "encrypted" = false;

ALTER TABLE
    "ai_sessions_metadata"
ALTER COLUMN
    "encrypted"
SET
    DEFAULT true;

ALTER TABLE
    "ai_sessions_metadata"
ALTER COLUMN
    "encrypted"
SET
    NOT NULL;