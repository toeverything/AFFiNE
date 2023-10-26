/*
  Warnings:

  - You are about to drop the `user_feature_gates` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "user_feature_gates" DROP CONSTRAINT "user_feature_gates_user_id_fkey";

-- DropTable
DROP TABLE "user_feature_gates";

-- CreateTable
CREATE TABLE "user_features" (
    "id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "featureId" VARCHAR NOT NULL,
    "reason" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "activated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "features" (
    "id" VARCHAR NOT NULL,
    "feature" VARCHAR NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "type" INTEGER NOT NULL,
    "configs" JSON NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "features_feature_version_key" ON "features"("feature", "version");

-- AddForeignKey
ALTER TABLE "user_features" ADD CONSTRAINT "user_features_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_features" ADD CONSTRAINT "user_features_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE CASCADE ON UPDATE CASCADE;
