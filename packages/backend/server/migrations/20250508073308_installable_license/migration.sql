-- AlterTable
ALTER TABLE "installed_licenses" ADD COLUMN     "license" BYTEA,
ADD COLUMN     "variant" VARCHAR;
