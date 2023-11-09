-- DropForeignKey
ALTER TABLE "user_workspace_permissions" DROP CONSTRAINT "user_workspace_permissions_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "user_workspace_permissions" DROP CONSTRAINT "user_workspace_permissions_workspace_id_fkey";

-- CreateTable
CREATE TABLE "workspace_pages" (
    "workspace_id" VARCHAR(36) NOT NULL,
    "page_id" VARCHAR(36) NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "mode" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "workspace_pages_pkey" PRIMARY KEY ("workspace_id","page_id")
);

-- CreateTable
CREATE TABLE "workspace_user_permissions" (
    "id" VARCHAR(36) NOT NULL,
    "workspace_id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "type" SMALLINT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_page_user_permissions" (
    "id" VARCHAR(36) NOT NULL,
    "workspace_id" VARCHAR(36) NOT NULL,
    "page_id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "type" SMALLINT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_page_user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_user_permissions_workspace_id_user_id_key" ON "workspace_user_permissions"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_page_user_permissions_workspace_id_page_id_user_i_key" ON "workspace_page_user_permissions"("workspace_id", "page_id", "user_id");

-- AddForeignKey
ALTER TABLE "workspace_pages" ADD CONSTRAINT "workspace_pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_user_permissions" ADD CONSTRAINT "workspace_user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_user_permissions" ADD CONSTRAINT "workspace_user_permissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_page_user_permissions" ADD CONSTRAINT "workspace_page_user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_page_user_permissions" ADD CONSTRAINT "workspace_page_user_permissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
