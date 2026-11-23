DO $$
DECLARE error_message TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    EXCEPTION
      WHEN OTHERS THEN
        error_message := 'pgcrypto extension not found. access_tokens.token will not be hashed automatically.' || E'\n' ||
        'Tokens will be lazily migrated on use.';
        RAISE WARNING '%', error_message;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    UPDATE "access_tokens"
    SET "token" = encode(digest("token", 'sha256'), 'hex')
    WHERE substr("token", 1, 3) = 'ut_';
  END IF;
END $$;

-- CreateTable
CREATE TABLE "magic_link_otps" (
    "id" VARCHAR NOT NULL,
    "email" TEXT NOT NULL,
    "otp_hash" VARCHAR NOT NULL,
    "token" TEXT NOT NULL,
    "client_nonce" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "magic_link_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "magic_link_otps_email_key" ON "magic_link_otps"("email");

-- CreateIndex
CREATE INDEX "magic_link_otps_expires_at_idx" ON "magic_link_otps"("expires_at");

