-- CreateTable
CREATE TABLE "user_feature_gates" (
    "id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "feature" VARCHAR NOT NULL,
    "reason" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feature_gates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "user_feature_gates" ADD CONSTRAINT "user_feature_gates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
