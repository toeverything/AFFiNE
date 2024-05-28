-- CreateEnum
CREATE TYPE "RuntimeConfigType" AS ENUM ('String', 'Number', 'Boolean', 'Object', 'Array');

-- CreateTable
CREATE TABLE "app_runtime_settings" (
    "id" VARCHAR NOT NULL,
    "type" "RuntimeConfigType" NOT NULL,
    "module" VARCHAR NOT NULL,
    "key" VARCHAR NOT NULL,
    "value" JSON NOT NULL,
    "description" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "last_updated_by" VARCHAR(36),

    CONSTRAINT "app_runtime_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_runtime_settings_module_key_key" ON "app_runtime_settings"("module", "key");

-- AddForeignKey
ALTER TABLE "app_runtime_settings" ADD CONSTRAINT "app_runtime_settings_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
