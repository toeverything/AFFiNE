-- AlterTable
ALTER TABLE "features" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "type" SET DEFAULT 0,
ALTER COLUMN "configs" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "user_features" ADD COLUMN     "name" VARCHAR NOT NULL DEFAULT '',
ADD COLUMN     "type" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "workspace_features" ADD COLUMN     "name" VARCHAR NOT NULL DEFAULT '',
ADD COLUMN     "type" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "user_features_name_idx" ON "user_features"("name");

-- CreateIndex
CREATE INDEX "user_features_feature_id_idx" ON "user_features"("feature_id");

-- CreateIndex
CREATE INDEX "workspace_features_name_idx" ON "workspace_features"("name");

-- CreateIndex
CREATE INDEX "workspace_features_feature_id_idx" ON "workspace_features"("feature_id");
