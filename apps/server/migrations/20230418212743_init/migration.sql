-- CreateTable
CREATE TABLE "google_users" (
    "id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "google_id" VARCHAR NOT NULL,

    CONSTRAINT "google_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "user_id" VARCHAR,
    "user_email" TEXT,
    "type" SMALLINT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seaql_migrations" (
    "version" VARCHAR NOT NULL,
    "applied_at" BIGINT NOT NULL,

    CONSTRAINT "seaql_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "email" VARCHAR NOT NULL,
    "avatar_url" VARCHAR,
    "token_nonce" SMALLINT DEFAULT 0,
    "password" VARCHAR,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" VARCHAR NOT NULL,
    "public" BOOLEAN NOT NULL,
    "type" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_users_google_id_key" ON "google_users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "google_users" ADD CONSTRAINT "google_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
