-- CreateTable
CREATE TABLE "access_tokens" (
    "id" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "token" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_tokens_token_key" ON "access_tokens"("token");

-- CreateIndex
CREATE INDEX "access_tokens_user_id_idx" ON "access_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
