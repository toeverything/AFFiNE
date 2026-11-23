-- AlterTable
ALTER TABLE "calendar_accounts" ADD COLUMN     "auth_type" VARCHAR,
ADD COLUMN     "calendar_home_url" VARCHAR,
ADD COLUMN     "principal_url" VARCHAR,
ADD COLUMN     "provider_preset_id" VARCHAR,
ADD COLUMN     "server_url" VARCHAR,
ADD COLUMN     "username" VARCHAR;
