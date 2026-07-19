WITH targets AS (
  SELECT UNNEST($1::varchar[]) AS workspace_id
),
snapshot_stats AS (
  SELECT workspace_id,
         COUNT(*) AS snapshot_count,
         COALESCE(SUM(COALESCE(size, octet_length(blob))), 0) AS snapshot_size
  FROM snapshots
  WHERE workspace_id IN (SELECT workspace_id FROM targets)
  GROUP BY workspace_id
),
blob_stats AS (
  SELECT workspace_id,
         COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'completed') AS blob_count,
         COALESCE(SUM(size) FILTER (WHERE deleted_at IS NULL AND status = 'completed'), 0) AS blob_size
  FROM blobs
  WHERE workspace_id IN (SELECT workspace_id FROM targets)
  GROUP BY workspace_id
),
member_stats AS (
  SELECT workspace_id, COUNT(*) AS member_count
  FROM workspace_user_permissions
  WHERE workspace_id IN (SELECT workspace_id FROM targets)
  GROUP BY workspace_id
),
public_page_stats AS (
  SELECT workspace_id, COUNT(*) AS public_page_count
  FROM workspace_pages
  WHERE public = TRUE AND workspace_id IN (SELECT workspace_id FROM targets)
  GROUP BY workspace_id
),
feature_stats AS (
  SELECT workspace_id,
         ARRAY_AGG(DISTINCT name ORDER BY name) FILTER (WHERE activated) AS features
  FROM workspace_features
  WHERE workspace_id IN (SELECT workspace_id FROM targets)
  GROUP BY workspace_id
),
aggregated AS (
  SELECT t.workspace_id,
         COALESCE(ss.snapshot_count, 0) AS snapshot_count,
         COALESCE(ss.snapshot_size, 0) AS snapshot_size,
         COALESCE(bs.blob_count, 0) AS blob_count,
         COALESCE(bs.blob_size, 0) AS blob_size,
         COALESCE(ms.member_count, 0) AS member_count,
         COALESCE(pp.public_page_count, 0) AS public_page_count,
         COALESCE(fs.features, ARRAY[]::text[]) AS features
  FROM targets t
  LEFT JOIN snapshot_stats ss ON ss.workspace_id = t.workspace_id
  LEFT JOIN blob_stats bs ON bs.workspace_id = t.workspace_id
  LEFT JOIN member_stats ms ON ms.workspace_id = t.workspace_id
  LEFT JOIN public_page_stats pp ON pp.workspace_id = t.workspace_id
  LEFT JOIN feature_stats fs ON fs.workspace_id = t.workspace_id
)
INSERT INTO workspace_admin_stats (
  workspace_id,
  snapshot_count,
  snapshot_size,
  blob_count,
  blob_size,
  member_count,
  public_page_count,
  features,
  updated_at
)
SELECT
  workspace_id,
  snapshot_count,
  snapshot_size,
  blob_count,
  blob_size,
  member_count,
  public_page_count,
  features,
  NOW()
FROM aggregated
ON CONFLICT (workspace_id) DO UPDATE SET
  snapshot_count = EXCLUDED.snapshot_count,
  snapshot_size = EXCLUDED.snapshot_size,
  blob_count = EXCLUDED.blob_count,
  blob_size = EXCLUDED.blob_size,
  member_count = EXCLUDED.member_count,
  public_page_count = EXCLUDED.public_page_count,
  features = EXCLUDED.features,
  updated_at = EXCLUDED.updated_at
