DROP TABLE IF EXISTS "access_tokens";

CREATE TYPE "McpAccessMode" AS ENUM ('READ_ONLY', 'READ_WRITE');

CREATE TABLE "mcp_credentials" (
    "id" VARCHAR NOT NULL,
    "family_id" VARCHAR NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "name" VARCHAR NOT NULL,
    "secret_hash" VARCHAR NOT NULL,
    "fingerprint" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "access_mode" "McpAccessMode" NOT NULL DEFAULT 'READ_ONLY',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" VARCHAR,
    "grace_ends_at" TIMESTAMPTZ(3),
    CONSTRAINT "mcp_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mcp_credentials_secret_hash_key" ON "mcp_credentials"("secret_hash");
CREATE UNIQUE INDEX "mcp_credentials_family_id_generation_key" ON "mcp_credentials"("family_id", "generation");
CREATE INDEX "mcp_credentials_user_id_workspace_id_idx" ON "mcp_credentials"("user_id", "workspace_id");
CREATE INDEX "mcp_credentials_expires_at_idx" ON "mcp_credentials"("expires_at");

ALTER TABLE "mcp_credentials" ADD CONSTRAINT "mcp_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mcp_credentials" ADD CONSTRAINT "mcp_credentials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
