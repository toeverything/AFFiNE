CREATE UNIQUE INDEX "entitlements_cloud_subscription_subject_key"
  ON "entitlements"("source", "subject_id")
  WHERE "source" = 'cloud_subscription' AND "subject_id" IS NOT NULL;
