-- CreateTable
CREATE TABLE "workspace_features" (
    "id" SERIAL NOT NULL,
    "workspace_id" VARCHAR(36) NOT NULL,
    "feature_id" INTEGER NOT NULL,
    "reason" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expired_at" TIMESTAMPTZ(6),
    "activated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "workspace_features_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "workspace_features" ADD CONSTRAINT "workspace_features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_features" ADD CONSTRAINT "workspace_features_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
