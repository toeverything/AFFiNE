-- CreateTable
CREATE TABLE "user_snapshots" (
    "user_id" VARCHAR NOT NULL,
    "id" VARCHAR NOT NULL,
    "blob" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_snapshots_pkey" PRIMARY KEY ("user_id","id")
);

-- AddForeignKey
ALTER TABLE "user_snapshots" ADD CONSTRAINT "user_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
