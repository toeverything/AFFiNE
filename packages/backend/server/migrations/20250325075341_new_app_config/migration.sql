-- CreateTable
CREATE TABLE "app_configs" (
    "id" VARCHAR NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_updated_by" VARCHAR,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "app_configs" ADD CONSTRAINT "app_configs_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
