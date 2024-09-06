-- AlterTable
ALTER TABLE "snapshot_histories" ADD COLUMN     "created_by" VARCHAR;

-- AlterTable
ALTER TABLE "snapshots" ADD COLUMN     "created_by" VARCHAR,
ADD COLUMN     "updated_by" VARCHAR;

-- AlterTable
ALTER TABLE "updates" ADD COLUMN     "created_by" VARCHAR;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "updates" ADD CONSTRAINT "updates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_histories" ADD CONSTRAINT "snapshot_histories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
