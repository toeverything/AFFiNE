-- AlterTable
ALTER TABLE
    "user_sessions"
ADD
    COLUMN "sign_in_client_version" VARCHAR,
ADD
    COLUMN "refresh_client_version" VARCHAR;