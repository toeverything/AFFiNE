//! Admin dashboard, workspace management, shared-link, and mail-delivery queries.

use std::collections::BTreeMap;

use base64::Engine as _;
use chrono::{DateTime, Duration, NaiveDate, Timelike, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use server_db::{ServerDb, WorkloadTier};
use server_types::DomainError;
use sqlx::{Postgres, QueryBuilder, Row};

const DEFAULT_STORAGE_HISTORY_DAYS: i32 = 30;
const DEFAULT_SYNC_HISTORY_HOURS: i32 = 48;
const DEFAULT_SHARED_LINK_WINDOW_DAYS: i32 = 28;
const DEFAULT_COPILOT_WINDOW_DAYS: i32 = 7;
const DEFAULT_ANALYTICS_WINDOW_DAYS: i32 = 28;
const MAX_KEYWORD_LENGTH: usize = 255;

pub use crate::doc_sharing::{AdminTimeBucket, AdminTimeWindow};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum AdminWorkspaceSortOrder {
  #[default]
  CreatedAt,
  SnapshotSize,
  BlobCount,
  BlobSize,
  SnapshotCount,
  MemberCount,
  PublicPageCount,
}

#[derive(Clone, Debug, Default)]
pub struct AdminWorkspaceFilter {
  pub skip: i32,
  pub first: i32,
  pub keyword: Option<String>,
  pub order_by: AdminWorkspaceSortOrder,
  pub public: Option<bool>,
  pub enable_ai: Option<bool>,
  pub enable_sharing: Option<bool>,
  pub enable_url_preview: Option<bool>,
  pub enable_doc_embedding: Option<bool>,
}

#[derive(Clone, Debug, Default)]
pub struct AdminUpdateWorkspaceParams {
  pub id: String,
  pub name: Option<Option<String>>,
  pub avatar_key: Option<Option<String>>,
  pub public: Option<bool>,
  pub enable_ai: Option<bool>,
  pub enable_sharing: Option<bool>,
  pub enable_url_preview: Option<bool>,
  pub enable_doc_embedding: Option<bool>,
}

impl AdminUpdateWorkspaceParams {
  pub fn has_changes(&self) -> bool {
    self.name.is_some()
      || self.avatar_key.is_some()
      || self.public.is_some()
      || self.enable_ai.is_some()
      || self.enable_sharing.is_some()
      || self.enable_url_preview.is_some()
      || self.enable_doc_embedding.is_some()
  }
}

#[derive(Clone, Debug)]
pub struct AdminWorkspaceOwner {
  pub id: String,
  pub name: String,
  pub email: String,
  pub avatar_url: Option<String>,
}

#[derive(Clone, Debug)]
pub struct AdminWorkspaceSummary {
  pub id: String,
  pub public: bool,
  pub created_at: DateTime<Utc>,
  pub name: Option<String>,
  pub avatar_key: Option<String>,
  pub enable_ai: bool,
  pub enable_sharing: bool,
  pub enable_url_preview: bool,
  pub enable_doc_embedding: bool,
  pub owner: Option<AdminWorkspaceOwner>,
  pub member_count: i32,
  pub public_page_count: i32,
  pub snapshot_count: i32,
  pub snapshot_size: i64,
  pub blob_count: i32,
  pub blob_size: i64,
}

#[derive(Clone, Debug)]
pub struct AdminWorkspaceMemberRow {
  pub id: String,
  pub name: String,
  pub email: String,
  pub avatar_url: Option<String>,
  pub role: String,
  pub status: String,
}

#[derive(Clone, Debug)]
pub struct AdminWorkspaceSharedLinkRow {
  pub doc_id: String,
  pub title: Option<String>,
  pub published_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Default)]
pub struct AdminDashboardQuery {
  pub timezone: Option<String>,
  pub storage_history_days: Option<i32>,
  pub sync_history_hours: Option<i32>,
  pub shared_link_window_days: Option<i32>,
  pub copilot_window_days: Option<i32>,
  pub include_top_shared_links: bool,
}

#[derive(Clone, Debug)]
pub struct AdminDashboardMinutePoint {
  pub minute: DateTime<Utc>,
  pub active_users: i32,
}

#[derive(Clone, Debug)]
pub struct AdminDashboardDayPoint {
  pub date: DateTime<Utc>,
  pub value: i64,
}

#[derive(Clone, Debug)]
pub struct AdminSharedLinkRow {
  pub workspace_id: String,
  pub doc_id: String,
  pub title: Option<String>,
  pub published_at: Option<DateTime<Utc>>,
  pub doc_updated_at: Option<DateTime<Utc>>,
  pub workspace_owner_id: Option<String>,
  pub last_updater_id: Option<String>,
  pub views: i64,
  pub unique_views: i64,
  pub guest_views: i64,
  pub last_accessed_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug)]
pub struct AdminDashboardData {
  pub sync_active_users: i32,
  pub sync_active_users_timeline: Vec<AdminDashboardMinutePoint>,
  pub sync_window: AdminTimeWindow,
  pub copilot_conversations: i64,
  pub copilot_window: AdminTimeWindow,
  pub workspace_storage_bytes: i64,
  pub blob_storage_bytes: i64,
  pub workspace_storage_history: Vec<AdminDashboardDayPoint>,
  pub blob_storage_history: Vec<AdminDashboardDayPoint>,
  pub storage_window: AdminTimeWindow,
  pub top_shared_links: Vec<AdminSharedLinkRow>,
  pub top_shared_links_window: AdminTimeWindow,
  pub generated_at: DateTime<Utc>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub enum AdminSharedLinksOrderBy {
  #[default]
  UpdatedAtDesc,
  PublishedAtDesc,
  ViewsDesc,
}

#[derive(Clone, Debug)]
pub struct AdminAllSharedLinksQuery {
  pub keyword: Option<String>,
  pub workspace_id: Option<String>,
  pub updated_after: Option<DateTime<Utc>>,
  pub order_by: AdminSharedLinksOrderBy,
  pub analytics_window_days: Option<i32>,
  pub include_total: bool,
  pub first: i32,
  pub offset: i32,
  pub after: Option<String>,
}

#[derive(Clone, Debug)]
pub struct AdminSharedLinkEdgeRow {
  pub cursor: String,
  pub node: AdminSharedLinkRow,
}

#[derive(Clone, Debug)]
pub struct AdminAllSharedLinksPage {
  pub edges: Vec<AdminSharedLinkEdgeRow>,
  pub has_next_page: bool,
  pub has_previous_page: bool,
  pub start_cursor: Option<String>,
  pub end_cursor: Option<String>,
  pub total_count: Option<i32>,
  pub analytics_window: AdminTimeWindow,
}

#[derive(Clone, Debug)]
pub struct AdminMailDeliveryPoint {
  pub bucket: DateTime<Utc>,
  pub count: i32,
}

#[derive(Clone, Debug)]
pub struct AdminMailDeliverySeries {
  pub key: String,
  pub label: String,
  pub total: i32,
  pub points: Vec<AdminMailDeliveryPoint>,
}

#[derive(Clone, Debug, Default)]
pub struct AdminMailDeliverySummary {
  pub total: i32,
  pub sent: i32,
  pub failed: i32,
  pub skipped: i32,
  pub canceled: i32,
  pub queued: i32,
  pub sending: i32,
  pub retry_wait: i32,
  pub success_rate: f64,
}

#[derive(Clone, Debug)]
pub struct AdminMailDeliveryReport {
  pub window: AdminTimeWindow,
  pub summary: AdminMailDeliverySummary,
  pub by_status: Vec<AdminMailDeliverySeries>,
  pub by_type: Vec<AdminMailDeliverySeries>,
  pub by_outcome: Vec<AdminMailDeliverySeries>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SharedLinkCursor {
  order_by: AdminSharedLinksOrderBy,
  sort_value: Value,
  workspace_id: String,
  doc_id: String,
}

fn naive_date_to_utc(d: NaiveDate) -> DateTime<Utc> {
  d.and_hms_opt(0, 0, 0).expect("midnight valid").and_utc()
}

fn floor_minute(dt: DateTime<Utc>) -> DateTime<Utc> {
  dt.with_second(0).and_then(|t| t.with_nanosecond(0)).unwrap_or(dt)
}

fn floor_hour(dt: DateTime<Utc>) -> DateTime<Utc> {
  dt.with_minute(0)
    .and_then(|t| t.with_second(0))
    .and_then(|t| t.with_nanosecond(0))
    .unwrap_or(dt)
}

fn encode_json_cursor<T: Serialize>(val: &T) -> String {
  let raw = serde_json::to_string(val).unwrap_or_else(|_| "{}".to_owned());
  base64::engine::general_purpose::STANDARD.encode(raw.as_bytes())
}

fn decode_json_cursor<T: for<'de> Deserialize<'de>>(raw: &str) -> Result<T, DomainError> {
  let trimmed = raw.trim();
  if let Ok(parsed) = serde_json::from_str::<T>(trimmed) {
    return Ok(parsed);
  }
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(trimmed)
    .map_err(|_| DomainError::Validation("Invalid pagination cursor".to_owned()))?;
  serde_json::from_slice(&bytes).map_err(|_| DomainError::Validation("Invalid pagination cursor".to_owned()))
}

fn order_clause_for_workspace(order: AdminWorkspaceSortOrder) -> &'static str {
  match order {
    AdminWorkspaceSortOrder::SnapshotSize => r#""snapshotSize" DESC, "createdAt" DESC, id ASC"#,
    AdminWorkspaceSortOrder::BlobCount => r#""blobCount" DESC, "createdAt" DESC, id ASC"#,
    AdminWorkspaceSortOrder::BlobSize => r#""blobSize" DESC, "createdAt" DESC, id ASC"#,
    AdminWorkspaceSortOrder::SnapshotCount => r#""snapshotCount" DESC, "createdAt" DESC, id ASC"#,
    AdminWorkspaceSortOrder::MemberCount => r#""memberCount" DESC, "createdAt" DESC, id ASC"#,
    AdminWorkspaceSortOrder::PublicPageCount => r#""publicPageCount" DESC, "createdAt" DESC, id ASC"#,
    AdminWorkspaceSortOrder::CreatedAt => r#""createdAt" DESC, id ASC"#,
  }
}

fn append_flag_filters<'a>(qb: &mut QueryBuilder<'a, Postgres>, f: &'a AdminWorkspaceFilter) {
  if let Some(public) = f.public {
    if public {
      qb.push(" AND wap.visibility = 'public'");
    } else {
      qb.push(" AND wap.visibility <> 'public'");
    }
  }
  if let Some(v) = f.enable_ai {
    qb.push(" AND w.enable_ai = ").push_bind(v);
  }
  if let Some(v) = f.enable_sharing {
    qb.push(" AND wap.sharing_enabled = ").push_bind(v);
  }
  if let Some(v) = f.enable_url_preview {
    qb.push(" AND wap.url_preview_enabled = ").push_bind(v);
  }
  if let Some(v) = f.enable_doc_embedding {
    qb.push(" AND w.enable_doc_embedding = ").push_bind(v);
  }
}

fn map_workspace_row(row: &sqlx::postgres::PgRow) -> AdminWorkspaceSummary {
  let owner_id: Option<String> = row.get("ownerId");
  let owner = owner_id.map(|id| AdminWorkspaceOwner {
    id,
    name: row.get::<Option<String>, _>("ownerName").unwrap_or_default(),
    email: row.get::<Option<String>, _>("ownerEmail").unwrap_or_default(),
    avatar_url: row.get("ownerAvatarUrl"),
  });
  AdminWorkspaceSummary {
    id: row.get("id"),
    public: row.get("public"),
    created_at: row.get("createdAt"),
    name: row.get("name"),
    avatar_key: row.get("avatarKey"),
    enable_ai: row.get("enableAi"),
    enable_sharing: row.get("enableSharing"),
    enable_url_preview: row.get("enableUrlPreview"),
    enable_doc_embedding: row.get("enableDocEmbedding"),
    owner,
    member_count: i32::try_from(row.get::<i64, _>("memberCount")).unwrap_or(i32::MAX),
    public_page_count: i32::try_from(row.get::<i64, _>("publicPageCount")).unwrap_or(i32::MAX),
    snapshot_count: i32::try_from(row.get::<i64, _>("snapshotCount")).unwrap_or(i32::MAX),
    snapshot_size: row.get("snapshotSize"),
    blob_count: i32::try_from(row.get::<i64, _>("blobCount")).unwrap_or(i32::MAX),
    blob_size: row.get("blobSize"),
  }
}

#[derive(Clone)]
pub struct AdminService {
  db: ServerDb,
}

impl AdminService {
  pub fn new(db: ServerDb) -> Self {
    Self { db }
  }

  pub async fn list_workspaces(
    &self,
    filter: &AdminWorkspaceFilter,
  ) -> Result<Vec<AdminWorkspaceSummary>, DomainError> {
    if filter.first <= 0 {
      return Ok(Vec::new());
    }
    let limit = i64::from(filter.first);
    let offset = i64::from(filter.skip.max(0));
    let keyword = filter.keyword.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let order = order_clause_for_workspace(filter.order_by);

    let (qb, tier) = if let Some(kw) = keyword {
      let mut qb = QueryBuilder::<Postgres>::new(
        r#"WITH filtered AS (
             SELECT w.id,
                    (wap.visibility = 'public') AS public,
                    w.created_at AS "createdAt",
                    w.name,
                    w.avatar_key AS "avatarKey",
                    w.enable_ai AS "enableAi",
                    wap.sharing_enabled AS "enableSharing",
                    wap.url_preview_enabled AS "enableUrlPreview",
                    w.enable_doc_embedding AS "enableDocEmbedding",
                    o.owner_id AS "ownerId",
                    o.owner_name AS "ownerName",
                    o.owner_email AS "ownerEmail",
                    o.owner_avatar_url AS "ownerAvatarUrl"
             FROM workspaces w
             JOIN workspace_access_policies wap ON wap.workspace_id = w.id
             LEFT JOIN LATERAL (
               SELECT u.id AS owner_id,
                      u.name AS owner_name,
                      u.email AS owner_email,
                      u.avatar_url AS owner_avatar_url
               FROM workspace_members wm
               JOIN users u ON wm.user_id = u.id
               WHERE wm.workspace_id = w.id
                 AND wm.role = 'owner'
                 AND wm.state = 'active'
               ORDER BY u.created_at ASC, wm.id ASC
               LIMIT 1
             ) o ON TRUE
             WHERE TRUE"#,
      );
      let pat = format!("%{kw}%");
      qb.push(" AND (w.id ILIKE ")
        .push_bind(pat.clone())
        .push(" OR o.owner_id ILIKE ")
        .push_bind(pat.clone())
        .push(" OR o.owner_email ILIKE ")
        .push_bind(pat)
        .push(")");
      append_flag_filters(&mut qb, filter);
      qb.push(
        r#")
           SELECT f.*,
                  COALESCE(s.snapshot_count, 0)::bigint AS "snapshotCount",
                  COALESCE(s.snapshot_size, 0)::bigint AS "snapshotSize",
                  COALESCE(s.blob_count, 0)::bigint AS "blobCount",
                  COALESCE(s.blob_size, 0)::bigint AS "blobSize",
                  COALESCE(s.member_count, 0)::bigint AS "memberCount",
                  COALESCE(s.public_page_count, 0)::bigint AS "publicPageCount"
           FROM filtered f
           LEFT JOIN workspace_admin_stats s ON s.workspace_id = f.id
           ORDER BY "#,
      );
      qb.push(order);
      qb.push(" LIMIT ").push_bind(limit).push(" OFFSET ").push_bind(offset);
      (qb, WorkloadTier::LongQuery)
    } else {
      let mut qb = QueryBuilder::<Postgres>::new(
        r#"WITH paged AS (
             SELECT w.id,
                    (wap.visibility = 'public') AS public,
                    w.created_at AS "createdAt",
                    w.name,
                    w.avatar_key AS "avatarKey",
                    w.enable_ai AS "enableAi",
                    wap.sharing_enabled AS "enableSharing",
                    wap.url_preview_enabled AS "enableUrlPreview",
                    w.enable_doc_embedding AS "enableDocEmbedding",
                    COALESCE(s.snapshot_count, 0)::bigint AS "snapshotCount",
                    COALESCE(s.snapshot_size, 0)::bigint AS "snapshotSize",
                    COALESCE(s.blob_count, 0)::bigint AS "blobCount",
                    COALESCE(s.blob_size, 0)::bigint AS "blobSize",
                    COALESCE(s.member_count, 0)::bigint AS "memberCount",
                    COALESCE(s.public_page_count, 0)::bigint AS "publicPageCount"
             FROM workspaces w
             JOIN workspace_access_policies wap ON wap.workspace_id = w.id
             LEFT JOIN workspace_admin_stats s ON s.workspace_id = w.id
             WHERE TRUE"#,
      );
      append_flag_filters(&mut qb, filter);
      qb.push(" ORDER BY ");
      qb.push(order);
      qb.push(" LIMIT ").push_bind(limit).push(" OFFSET ").push_bind(offset);
      qb.push(
        r#")
           SELECT p.*,
                  o.owner_id AS "ownerId",
                  o.owner_name AS "ownerName",
                  o.owner_email AS "ownerEmail",
                  o.owner_avatar_url AS "ownerAvatarUrl"
           FROM paged p
           LEFT JOIN LATERAL (
             SELECT u.id AS owner_id,
                    u.name AS owner_name,
                    u.email AS owner_email,
                    u.avatar_url AS owner_avatar_url
             FROM workspace_members wm
             JOIN users u ON wm.user_id = u.id
             WHERE wm.workspace_id = p.id
               AND wm.role = 'owner'
               AND wm.state = 'active'
             ORDER BY u.created_at ASC, wm.id ASC
             LIMIT 1
           ) o ON TRUE
           ORDER BY "#,
      );
      qb.push(order);
      (qb, WorkloadTier::InteractiveRead)
    };
    let mut qb = qb;

    let mut conn = self
      .db
      .acquire_tiered(tier)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire admin list_workspaces: {e}")))?;
    let rows = qb
      .build()
      .fetch_all(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("admin list_workspaces: {e}")))?;
    Ok(rows.iter().map(map_workspace_row).collect())
  }

  pub async fn count_workspaces(&self, filter: &AdminWorkspaceFilter) -> Result<i64, DomainError> {
    let keyword = filter.keyword.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let (mut qb, tier) = if let Some(kw) = keyword {
      let mut qb = QueryBuilder::<Postgres>::new(
        r#"SELECT COUNT(*)::bigint
           FROM workspaces w
           JOIN workspace_access_policies wap ON wap.workspace_id = w.id
           LEFT JOIN LATERAL (
             SELECT u.id AS owner_id, u.email AS owner_email
             FROM workspace_members wm
             JOIN users u ON wm.user_id = u.id
             WHERE wm.workspace_id = w.id
               AND wm.role = 'owner'
               AND wm.state = 'active'
             ORDER BY u.created_at ASC, wm.id ASC
             LIMIT 1
           ) o ON TRUE
           WHERE TRUE"#,
      );
      let pat = format!("%{kw}%");
      qb.push(" AND (w.id ILIKE ")
        .push_bind(pat.clone())
        .push(" OR o.owner_id ILIKE ")
        .push_bind(pat.clone())
        .push(" OR o.owner_email ILIKE ")
        .push_bind(pat)
        .push(")");
      append_flag_filters(&mut qb, filter);
      (qb, WorkloadTier::LongQuery)
    } else {
      let mut qb = QueryBuilder::<Postgres>::new(
        r#"SELECT COUNT(*)::bigint
           FROM workspaces w
           JOIN workspace_access_policies wap ON wap.workspace_id = w.id
           WHERE TRUE"#,
      );
      append_flag_filters(&mut qb, filter);
      (qb, WorkloadTier::InteractiveRead)
    };

    let mut conn = self
      .db
      .acquire_tiered(tier)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire admin count_workspaces: {e}")))?;
    let total: i64 = qb
      .build_query_scalar()
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("admin count_workspaces: {e}")))?;
    Ok(total)
  }

  pub async fn get_workspace(&self, id: &str) -> Result<Option<AdminWorkspaceSummary>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire admin get_workspace: {e}")))?;
    let row = sqlx::query(
      r#"SELECT w.id,
                (wap.visibility = 'public') AS public,
                w.created_at AS "createdAt",
                w.name,
                w.avatar_key AS "avatarKey",
                w.enable_ai AS "enableAi",
                wap.sharing_enabled AS "enableSharing",
                wap.url_preview_enabled AS "enableUrlPreview",
                w.enable_doc_embedding AS "enableDocEmbedding",
                o.owner_id AS "ownerId",
                o.owner_name AS "ownerName",
                o.owner_email AS "ownerEmail",
                o.owner_avatar_url AS "ownerAvatarUrl",
                COALESCE(s.snapshot_count, 0)::bigint AS "snapshotCount",
                COALESCE(s.snapshot_size, 0)::bigint AS "snapshotSize",
                COALESCE(s.blob_count, 0)::bigint AS "blobCount",
                COALESCE(s.blob_size, 0)::bigint AS "blobSize",
                COALESCE(s.member_count, 0)::bigint AS "memberCount",
                COALESCE(s.public_page_count, 0)::bigint AS "publicPageCount"
         FROM workspaces w
         JOIN workspace_access_policies wap ON wap.workspace_id = w.id
         LEFT JOIN LATERAL (
           SELECT u.id AS owner_id,
                  u.name AS owner_name,
                  u.email AS owner_email,
                  u.avatar_url AS owner_avatar_url
           FROM workspace_members wm
           JOIN users u ON wm.user_id = u.id
           WHERE wm.workspace_id = w.id
             AND wm.role = 'owner'
             AND wm.state = 'active'
           ORDER BY u.created_at ASC, wm.id ASC
           LIMIT 1
         ) o ON TRUE
         LEFT JOIN workspace_admin_stats s ON s.workspace_id = w.id
         WHERE w.id = $1
         LIMIT 1"#,
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin get_workspace: {e}")))?;
    Ok(row.as_ref().map(map_workspace_row))
  }

  pub async fn list_workspace_members(
    &self,
    workspace_id: &str,
    skip: i32,
    take: i32,
    query: Option<&str>,
  ) -> Result<Vec<AdminWorkspaceMemberRow>, DomainError> {
    if take <= 0 {
      return Ok(Vec::new());
    }
    let limit = i64::from(take);
    let offset = i64::from(skip.max(0));
    let kw = query.map(str::trim).filter(|s| !s.is_empty()).map(|s| format!("%{s}%"));

    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire admin list_workspace_members: {e}")))?;
    let rows = sqlx::query(
      r#"SELECT id, name, email, avatar_url, role, status
         FROM (
           SELECT u.id, u.name, u.email, u.avatar_url,
                  CASE wm.role
                    WHEN 'owner' THEN 'Owner'
                    WHEN 'admin' THEN 'Admin'
                    ELSE 'Collaborator'
                  END AS role,
                  'Accepted' AS status,
                  wm.created_at AS created_at
           FROM workspace_members wm
           JOIN users u ON u.id = wm.user_id
           WHERE wm.workspace_id = $1
             AND wm.state = 'active'
             AND ($2::text IS NULL OR u.name ILIKE $2 OR u.email ILIKE $2)
           UNION ALL
           SELECT u.id, u.name, u.email, u.avatar_url,
                  CASE wi.requested_role
                    WHEN 'admin' THEN 'Admin'
                    ELSE 'Collaborator'
                  END AS role,
                  CASE wi.status
                    WHEN 'waiting_review' THEN 'UnderReview'
                    WHEN 'waiting_seat' THEN 'NeedMoreSeat'
                    ELSE 'Pending'
                  END AS status,
                  wi.created_at AS created_at
           FROM workspace_invitations wi
           JOIN users u ON u.id = wi.invitee_user_id
           WHERE wi.workspace_id = $1
             AND ($2::text IS NULL OR u.name ILIKE $2 OR u.email ILIKE $2)
         ) combined
         ORDER BY created_at ASC, id ASC
         LIMIT $3 OFFSET $4"#,
    )
    .bind(workspace_id)
    .bind(kw)
    .bind(limit)
    .bind(offset)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin list_workspace_members: {e}")))?;

    Ok(
      rows
        .into_iter()
        .map(|r| AdminWorkspaceMemberRow {
          id: r.get("id"),
          name: r.get("name"),
          email: r.get("email"),
          avatar_url: r.get("avatar_url"),
          role: r.get("role"),
          status: r.get("status"),
        })
        .collect(),
    )
  }

  pub async fn list_workspace_shared_links(
    &self,
    workspace_id: &str,
  ) -> Result<Vec<AdminWorkspaceSharedLinkRow>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire admin list_workspace_shared_links: {e}")))?;
    let rows = sqlx::query(
      r#"SELECT wp.page_id AS doc_id, wp.title, wp.published_at
         FROM workspace_pages wp
         JOIN doc_access_policies dap
           ON dap.workspace_id = wp.workspace_id AND dap.doc_id = wp.page_id
         WHERE wp.workspace_id = $1
           AND dap.visibility = 'public'
           AND dap.public_role = 'external'
           AND wp.published_at IS NOT NULL
           AND dap.published_at IS NOT NULL
           AND COALESCE(wp.lifecycle_state::text <> 'deleted', true)
           AND (
             EXISTS (SELECT 1 FROM snapshots s WHERE s.workspace_id = wp.workspace_id AND s.guid = wp.page_id)
             OR EXISTS (SELECT 1 FROM updates u WHERE u.workspace_id = wp.workspace_id AND u.guid = wp.page_id)
           )
         ORDER BY wp.published_at DESC, wp.page_id ASC"#,
    )
    .bind(workspace_id)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin list_workspace_shared_links: {e}")))?;

    Ok(
      rows
        .into_iter()
        .filter_map(|r| {
          let doc_id: String = r.get("doc_id");
          if !matches!(
            crate::acl::classify_reserved_doc(workspace_id, &doc_id),
            crate::acl::ReservedDocClass::Ordinary
          ) {
            return None;
          }
          Some(AdminWorkspaceSharedLinkRow {
            doc_id,
            title: r.get("title"),
            published_at: r.get("published_at"),
          })
        })
        .collect(),
    )
  }

  pub async fn update_workspace(
    &self,
    input: &AdminUpdateWorkspaceParams,
  ) -> Result<Option<AdminWorkspaceSummary>, DomainError> {
    if !input.has_changes() {
      return self.get_workspace(&input.id).await;
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin admin update_workspace: {e}")))?;

    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
      .bind(&input.id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock admin workspace: {e}")))?;
    if exists.is_none() {
      let _ = tx.rollback().await;
      return Err(DomainError::NotFound("not_found".to_owned()));
    }

    let update_name = input.name.is_some();
    let name_val: Option<&str> = input.name.as_ref().and_then(|o| o.as_deref());
    let update_avatar = input.avatar_key.is_some();
    let avatar_val: Option<&str> = input.avatar_key.as_ref().and_then(|o| o.as_deref());

    sqlx::query(
      r#"UPDATE workspaces
         SET name = CASE WHEN $2 THEN $3 ELSE name END,
             avatar_key = CASE WHEN $4 THEN $5 ELSE avatar_key END,
             enable_ai = COALESCE($6, enable_ai),
             enable_doc_embedding = COALESCE($7, enable_doc_embedding)
         WHERE id = $1"#,
    )
    .bind(&input.id)
    .bind(update_name)
    .bind(name_val)
    .bind(update_avatar)
    .bind(avatar_val)
    .bind(input.enable_ai)
    .bind(input.enable_doc_embedding)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("admin update workspaces: {e}")))?;

    if input.public.is_some() || input.enable_sharing.is_some() || input.enable_url_preview.is_some() {
      let visibility = input.public.map(|p| if p { "public" } else { "private" });
      sqlx::query(
        r#"INSERT INTO workspace_access_policies (workspace_id, visibility, sharing_enabled, url_preview_enabled)
           VALUES ($1, COALESCE($2, 'private'), COALESCE($3, true), COALESCE($4, false))
           ON CONFLICT (workspace_id) DO UPDATE SET
             visibility = COALESCE($2, workspace_access_policies.visibility),
             sharing_enabled = COALESCE($3, workspace_access_policies.sharing_enabled),
             url_preview_enabled = COALESCE($4, workspace_access_policies.url_preview_enabled),
             updated_at = clock_timestamp()"#,
      )
      .bind(&input.id)
      .bind(visibility)
      .bind(input.enable_sharing)
      .bind(input.enable_url_preview)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("admin update workspace_access_policies: {e}")))?;
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit admin update_workspace: {e}")))?;
    self.get_workspace(&input.id).await
  }

  pub async fn get_dashboard(&self, query: &AdminDashboardQuery) -> Result<AdminDashboardData, DomainError> {
    let timezone = query
      .timezone
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .unwrap_or("UTC")
      .to_owned();
    let storage_days = query
      .storage_history_days
      .unwrap_or(DEFAULT_STORAGE_HISTORY_DAYS)
      .clamp(1, 90);
    let sync_hours = query
      .sync_history_hours
      .unwrap_or(DEFAULT_SYNC_HISTORY_HOURS)
      .clamp(1, 72);
    let shared_days = query
      .shared_link_window_days
      .unwrap_or(DEFAULT_SHARED_LINK_WINDOW_DAYS)
      .clamp(1, 90);
    let copilot_days = query
      .copilot_window_days
      .unwrap_or(DEFAULT_COPILOT_WINDOW_DAYS)
      .clamp(1, 90);

    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire admin get_dashboard: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("admin get_dashboard clock: {e}")))?;
    let sync_to = floor_minute(now);
    let sync_from = sync_to - Duration::hours(i64::from(sync_hours));
    let (effective_timezone, resolved_tz) = match jiff::tz::TimeZone::get(&timezone) {
      Ok(tz) => (timezone.clone(), tz),
      Err(_) => ("UTC".to_owned(), jiff::tz::TimeZone::UTC),
    };
    let current_day = jiff::Timestamp::from_second(now.timestamp())
      .ok()
      .map(|ts| ts.to_zoned(resolved_tz.clone()).date())
      .and_then(|d| {
        NaiveDate::from_ymd_opt(
          i32::from(d.year()),
          u32::from(d.month() as u8),
          u32::from(d.day() as u8),
        )
      })
      .unwrap_or_else(|| now.date_naive());
    let storage_from_day = current_day - Duration::days(i64::from(storage_days - 1));
    let shared_from_day = current_day - Duration::days(i64::from(shared_days - 1));
    let copilot_from_day = current_day - Duration::days(i64::from(copilot_days - 1));
    let copilot_from = jiff::civil::Date::new(
      chrono::Datelike::year(&copilot_from_day) as i16,
      chrono::Datelike::month(&copilot_from_day) as i8,
      chrono::Datelike::day(&copilot_from_day) as i8,
    )
    .ok()
    .and_then(|d| d.at(0, 0, 0, 0).to_zoned(resolved_tz).ok())
    .and_then(|z| DateTime::<Utc>::from_timestamp(z.timestamp().as_second(), z.timestamp().subsec_nanosecond() as u32))
    .unwrap_or_else(|| naive_date_to_utc(copilot_from_day));

    let sync_active_users: i32 = sqlx::query_scalar(
      r#"SELECT COALESCE(
           (SELECT active_users FROM sync_active_users_minutely
            WHERE minute_ts BETWEEN $1 AND $2 ORDER BY minute_ts DESC LIMIT 1), 0
         )::integer"#,
    )
    .bind(sync_from)
    .bind(sync_to)
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin dashboard sync_active_users: {e}")))?;

    let sync_rows = sqlx::query(
      r#"WITH minutes AS (
           SELECT generate_series($1::timestamptz, $2::timestamptz, interval '1 minute') AS minute_ts
         )
         SELECT minutes.minute_ts AS minute, COALESCE(sample.active_users, 0)::integer AS active_users
         FROM minutes
         LEFT JOIN LATERAL (
           SELECT active_users FROM sync_active_users_minutely
           WHERE minute_ts BETWEEN $1 AND minutes.minute_ts
           ORDER BY minute_ts DESC LIMIT 1
         ) sample ON TRUE
         ORDER BY minute ASC"#,
    )
    .bind(sync_from)
    .bind(sync_to)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin dashboard sync_timeline: {e}")))?;
    let sync_timeline: Vec<AdminDashboardMinutePoint> = sync_rows
      .into_iter()
      .map(|r| AdminDashboardMinutePoint {
        minute: r.get("minute"),
        active_users: r.get("active_users"),
      })
      .collect();

    let (ws_storage_bytes, blob_storage_bytes): (i64, i64) = sqlx::query_as(
      "SELECT COALESCE(SUM(snapshot_size), 0)::bigint, COALESCE(SUM(blob_size), 0)::bigint FROM workspace_admin_stats",
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin dashboard storage_current: {e}")))?;

    let history_rows = sqlx::query(
      r#"SELECT date,
                COALESCE(SUM(snapshot_size), 0)::bigint AS ws_bytes,
                COALESCE(SUM(blob_size), 0)::bigint AS blob_bytes
         FROM workspace_admin_stats_daily
         WHERE date BETWEEN $1 AND $2
         GROUP BY date
         ORDER BY date ASC"#,
    )
    .bind(storage_from_day)
    .bind(current_day)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin dashboard storage_history: {e}")))?;

    let baseline_row: Option<(i64, i64)> = sqlx::query_as(
      r#"WITH bd AS (SELECT max(date) AS d FROM workspace_admin_stats_daily WHERE date < $1)
         SELECT COALESCE(SUM(s.snapshot_size), 0)::bigint, COALESCE(SUM(s.blob_size), 0)::bigint
         FROM bd JOIN workspace_admin_stats_daily s ON s.date = bd.d
         WHERE bd.d IS NOT NULL
         GROUP BY bd.d"#,
    )
    .bind(storage_from_day)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin dashboard storage_baseline: {e}")))?;

    let mut by_day: BTreeMap<NaiveDate, (i64, i64)> = BTreeMap::new();
    for r in history_rows {
      let d: NaiveDate = r.get("date");
      by_day.insert(d, (r.get("ws_bytes"), r.get("blob_bytes")));
    }

    let mut carried = baseline_row.unwrap_or((0, 0));
    let mut ws_history = Vec::with_capacity(usize::try_from(storage_days).unwrap_or(30));
    let mut blob_history = Vec::with_capacity(usize::try_from(storage_days).unwrap_or(30));
    let mut day = storage_from_day;
    while day <= current_day {
      if let Some(&vals) = by_day.get(&day) {
        carried = vals;
      }
      let (w_val, b_val) = if day == current_day {
        (ws_storage_bytes, blob_storage_bytes)
      } else {
        carried
      };
      let dt = naive_date_to_utc(day);
      ws_history.push(AdminDashboardDayPoint { date: dt, value: w_val });
      blob_history.push(AdminDashboardDayPoint { date: dt, value: b_val });
      day += Duration::days(1);
    }

    let copilot_conversations: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM ai_sessions_messages WHERE role = 'user' AND created_at >= $1 AND created_at <= $2",
    )
    .bind(copilot_from)
    .bind(now)
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin dashboard copilot_conversations: {e}")))?;

    let top_shared_links = if query.include_top_shared_links {
      let rows = sqlx::query(
        r#"WITH view_agg AS (
             SELECT workspace_id, doc_id,
                    COALESCE(SUM(total_views), 0)::bigint AS views,
                    COALESCE(SUM(unique_views), 0)::bigint AS unique_views,
                    COALESCE(SUM(guest_views), 0)::bigint AS guest_views,
                    MAX(last_accessed_at) AS last_accessed_at
             FROM workspace_doc_view_daily
             WHERE date BETWEEN $1 AND $2
             GROUP BY workspace_id, doc_id
           )
           SELECT wp.workspace_id, wp.page_id AS doc_id, wp.title, wp.published_at,
                  sn.updated_at AS doc_updated_at, owner.user_id AS workspace_owner_id,
                  sn.updated_by AS last_updater_id,
                  COALESCE(v.views, 0)::bigint AS views,
                  COALESCE(v.unique_views, 0)::bigint AS unique_views,
                  COALESCE(v.guest_views, 0)::bigint AS guest_views,
                  v.last_accessed_at
           FROM workspace_pages wp
           JOIN doc_access_policies dap
             ON dap.workspace_id = wp.workspace_id AND dap.doc_id = wp.page_id
           LEFT JOIN snapshots sn
             ON sn.workspace_id = wp.workspace_id AND sn.guid = wp.page_id
           LEFT JOIN view_agg v
             ON v.workspace_id = wp.workspace_id AND v.doc_id = wp.page_id
           LEFT JOIN LATERAL (
             SELECT user_id FROM workspace_members
             WHERE workspace_id = wp.workspace_id AND role = 'owner' AND state = 'active'
             ORDER BY created_at ASC, id ASC LIMIT 1
           ) owner ON TRUE
           WHERE dap.visibility = 'public' AND dap.public_role = 'external'
           ORDER BY views DESC, unique_views DESC, wp.workspace_id ASC, wp.page_id ASC
           LIMIT 10"#,
      )
      .bind(shared_from_day)
      .bind(current_day)
      .fetch_all(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("admin dashboard top_shared_links: {e}")))?;

      rows
        .into_iter()
        .map(|r| AdminSharedLinkRow {
          workspace_id: r.get("workspace_id"),
          doc_id: r.get("doc_id"),
          title: r.get("title"),
          published_at: r.get("published_at"),
          doc_updated_at: r.get("doc_updated_at"),
          workspace_owner_id: r.get("workspace_owner_id"),
          last_updater_id: r.get("last_updater_id"),
          views: r.get("views"),
          unique_views: r.get("unique_views"),
          guest_views: r.get("guest_views"),
          last_accessed_at: r.get("last_accessed_at"),
        })
        .collect()
    } else {
      Vec::new()
    };

    Ok(AdminDashboardData {
      sync_active_users,
      sync_active_users_timeline: sync_timeline,
      sync_window: AdminTimeWindow {
        from: sync_from,
        to: sync_to,
        timezone: effective_timezone.clone(),
        bucket: AdminTimeBucket::Minute,
        requested_size: query.sync_history_hours.unwrap_or(DEFAULT_SYNC_HISTORY_HOURS),
        effective_size: sync_hours,
      },
      copilot_conversations,
      copilot_window: AdminTimeWindow {
        from: copilot_from,
        to: now,
        timezone: effective_timezone.clone(),
        bucket: AdminTimeBucket::Day,
        requested_size: query.copilot_window_days.unwrap_or(DEFAULT_COPILOT_WINDOW_DAYS),
        effective_size: copilot_days,
      },
      workspace_storage_bytes: ws_storage_bytes,
      blob_storage_bytes,
      workspace_storage_history: ws_history,
      blob_storage_history: blob_history,
      storage_window: AdminTimeWindow {
        from: naive_date_to_utc(storage_from_day),
        to: naive_date_to_utc(current_day),
        timezone: effective_timezone.clone(),
        bucket: AdminTimeBucket::Day,
        requested_size: query.storage_history_days.unwrap_or(DEFAULT_STORAGE_HISTORY_DAYS),
        effective_size: storage_days,
      },
      top_shared_links,
      top_shared_links_window: AdminTimeWindow {
        from: naive_date_to_utc(shared_from_day),
        to: naive_date_to_utc(current_day),
        timezone: effective_timezone,
        bucket: AdminTimeBucket::Day,
        requested_size: query.shared_link_window_days.unwrap_or(DEFAULT_SHARED_LINK_WINDOW_DAYS),
        effective_size: shared_days,
      },
      generated_at: now,
    })
  }

  pub async fn paginate_all_shared_links(
    &self,
    query: &AdminAllSharedLinksQuery,
  ) -> Result<AdminAllSharedLinksPage, DomainError> {
    let first = query.first.clamp(1, 100);
    let offset = query.offset.max(0);
    let keyword = query.keyword.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if let Some(kw) = keyword
      && kw.encode_utf16().count() > MAX_KEYWORD_LENGTH
    {
      return Err(DomainError::Validation(format!("query_too_long:{MAX_KEYWORD_LENGTH}")));
    }
    if query.after.as_deref().is_some_and(|s| !s.trim().is_empty()) && offset > 0 {
      return Err(DomainError::Validation(
        "Cannot use both `after` cursor and positive `offset`".to_owned(),
      ));
    }

    let window_days = query
      .analytics_window_days
      .unwrap_or(DEFAULT_ANALYTICS_WINDOW_DAYS)
      .clamp(1, 90);
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire admin paginate_all_shared_links: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("admin paginate_all_shared_links clock: {e}")))?;
    let current_day = now.date_naive();
    let from_day = current_day - Duration::days(i64::from(window_days - 1));

    let cursor: Option<SharedLinkCursor> = match query.after.as_deref().filter(|s| !s.trim().is_empty()) {
      Some(raw) => Some(decode_json_cursor(raw)?),
      None => None,
    };

    let mut qb = QueryBuilder::<Postgres>::new(
      r#"WITH view_agg AS (
           SELECT workspace_id, doc_id,
                  COALESCE(SUM(total_views), 0)::bigint AS views,
                  COALESCE(SUM(unique_views), 0)::bigint AS unique_views,
                  COALESCE(SUM(guest_views), 0)::bigint AS guest_views,
                  MAX(last_accessed_at) AS last_accessed_at
           FROM workspace_doc_view_daily
           WHERE date BETWEEN "#,
    );
    qb.push_bind(from_day).push(" AND ").push_bind(current_day).push(
      r#" GROUP BY workspace_id, doc_id
         ),
         base AS (
           SELECT wp.workspace_id, wp.page_id AS doc_id, wp.title, wp.published_at,
                  sn.updated_at AS doc_updated_at, owner.user_id AS workspace_owner_id,
                  sn.updated_by AS last_updater_id,
                  COALESCE(v.views, 0)::bigint AS views,
                  COALESCE(v.unique_views, 0)::bigint AS unique_views,
                  COALESCE(v.guest_views, 0)::bigint AS guest_views,
                  v.last_accessed_at,
                  COALESCE(sn.updated_at, to_timestamp(0)) AS sort_updated_at,
                  COALESCE(wp.published_at, to_timestamp(0)) AS sort_published_at,
                  COALESCE(v.views, 0)::bigint AS sort_views
           FROM workspace_pages wp
           JOIN doc_access_policies dap
             ON dap.workspace_id = wp.workspace_id AND dap.doc_id = wp.page_id
           LEFT JOIN snapshots sn
             ON sn.workspace_id = wp.workspace_id AND sn.guid = wp.page_id
           LEFT JOIN view_agg v
             ON v.workspace_id = wp.workspace_id AND v.doc_id = wp.page_id
           LEFT JOIN LATERAL (
             SELECT user_id FROM workspace_members
             WHERE workspace_id = wp.workspace_id AND role = 'owner' AND state = 'active'
             ORDER BY created_at ASC, id ASC LIMIT 1
           ) owner ON TRUE
           WHERE dap.visibility = 'public' AND dap.public_role = 'external'"#,
    );
    if let Some(kw) = keyword {
      let pat = format!("%{kw}%");
      qb.push(" AND (wp.title ILIKE ")
        .push_bind(pat.clone())
        .push(" OR wp.page_id ILIKE ")
        .push_bind(pat.clone())
        .push(" OR wp.workspace_id ILIKE ")
        .push_bind(pat)
        .push(")");
    }
    if let Some(ws_id) = query.workspace_id.as_deref().filter(|s| !s.is_empty()) {
      qb.push(" AND wp.workspace_id = ").push_bind(ws_id);
    }
    if let Some(updated_after) = query.updated_after {
      qb.push(" AND sn.updated_at >= ").push_bind(updated_after);
    }
    qb.push(
      r#")
         SELECT workspace_id, doc_id, title, published_at, doc_updated_at, workspace_owner_id,
                last_updater_id, views, unique_views, guest_views, last_accessed_at,
                sort_updated_at, sort_published_at, sort_views
         FROM base
         WHERE TRUE"#,
    );

    if let Some(c) = &cursor
      && c.order_by == query.order_by
    {
      match query.order_by {
        AdminSharedLinksOrderBy::ViewsDesc => {
          let sv = c
            .sort_value
            .as_i64()
            .ok_or_else(|| DomainError::Validation("Invalid pagination cursor".to_owned()))?;
          qb.push(" AND (sort_views < ")
            .push_bind(sv)
            .push(" OR (sort_views = ")
            .push_bind(sv)
            .push(" AND workspace_id > ")
            .push_bind(&c.workspace_id)
            .push(") OR (sort_views = ")
            .push_bind(sv)
            .push(" AND workspace_id = ")
            .push_bind(&c.workspace_id)
            .push(" AND doc_id > ")
            .push_bind(&c.doc_id)
            .push("))");
        }
        AdminSharedLinksOrderBy::PublishedAtDesc | AdminSharedLinksOrderBy::UpdatedAtDesc => {
          let dt = c
            .sort_value
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&Utc))
            .ok_or_else(|| DomainError::Validation("Invalid pagination cursor".to_owned()))?;
          let col = if query.order_by == AdminSharedLinksOrderBy::PublishedAtDesc {
            "sort_published_at"
          } else {
            "sort_updated_at"
          };
          qb.push(" AND (")
            .push(col)
            .push(" < ")
            .push_bind(dt)
            .push(" OR (")
            .push(col)
            .push(" = ")
            .push_bind(dt)
            .push(" AND workspace_id > ")
            .push_bind(&c.workspace_id)
            .push(") OR (")
            .push(col)
            .push(" = ")
            .push_bind(dt)
            .push(" AND workspace_id = ")
            .push_bind(&c.workspace_id)
            .push(" AND doc_id > ")
            .push_bind(&c.doc_id)
            .push("))");
        }
      }
    }

    let order_sql = match query.order_by {
      AdminSharedLinksOrderBy::PublishedAtDesc => "sort_published_at DESC, workspace_id ASC, doc_id ASC",
      AdminSharedLinksOrderBy::ViewsDesc => "sort_views DESC, workspace_id ASC, doc_id ASC",
      AdminSharedLinksOrderBy::UpdatedAtDesc => "sort_updated_at DESC, workspace_id ASC, doc_id ASC",
    };
    qb.push(" ORDER BY ")
      .push(order_sql)
      .push(" LIMIT ")
      .push_bind(i64::from(first + 1))
      .push(" OFFSET ")
      .push_bind(i64::from(offset));

    let rows = qb
      .build()
      .fetch_all(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("admin paginate_all_shared_links: {e}")))?;

    let first_usize = usize::try_from(first).unwrap_or(10);
    let has_next_page = rows.len() > first_usize;
    let edges: Vec<AdminSharedLinkEdgeRow> = rows
      .into_iter()
      .take(first_usize)
      .map(|r| {
        let workspace_id: String = r.get("workspace_id");
        let doc_id: String = r.get("doc_id");
        let sort_val = match query.order_by {
          AdminSharedLinksOrderBy::ViewsDesc => Value::from(r.get::<i64, _>("sort_views")),
          AdminSharedLinksOrderBy::PublishedAtDesc => {
            Value::String(r.get::<DateTime<Utc>, _>("sort_published_at").to_rfc3339())
          }
          AdminSharedLinksOrderBy::UpdatedAtDesc => {
            Value::String(r.get::<DateTime<Utc>, _>("sort_updated_at").to_rfc3339())
          }
        };
        let cursor_str = encode_json_cursor(&SharedLinkCursor {
          order_by: query.order_by,
          sort_value: sort_val,
          workspace_id: workspace_id.clone(),
          doc_id: doc_id.clone(),
        });
        AdminSharedLinkEdgeRow {
          cursor: cursor_str,
          node: AdminSharedLinkRow {
            workspace_id,
            doc_id,
            title: r.get("title"),
            published_at: r.get("published_at"),
            doc_updated_at: r.get("doc_updated_at"),
            workspace_owner_id: r.get("workspace_owner_id"),
            last_updater_id: r.get("last_updater_id"),
            views: r.get("views"),
            unique_views: r.get("unique_views"),
            guest_views: r.get("guest_views"),
            last_accessed_at: r.get("last_accessed_at"),
          },
        }
      })
      .collect();

    let total_count = if query.include_total {
      let mut cqb = QueryBuilder::<Postgres>::new(
        r#"SELECT COUNT(*)::bigint
           FROM workspace_pages wp
           JOIN doc_access_policies dap
             ON dap.workspace_id = wp.workspace_id AND dap.doc_id = wp.page_id
           WHERE dap.visibility = 'public' AND dap.public_role = 'external'"#,
      );
      if let Some(kw) = keyword {
        let pat = format!("%{kw}%");
        cqb
          .push(" AND (wp.title ILIKE ")
          .push_bind(pat.clone())
          .push(" OR wp.page_id ILIKE ")
          .push_bind(pat.clone())
          .push(" OR wp.workspace_id ILIKE ")
          .push_bind(pat)
          .push(")");
      }
      if let Some(ws_id) = query.workspace_id.as_deref().filter(|s| !s.is_empty()) {
        cqb.push(" AND wp.workspace_id = ").push_bind(ws_id);
      }
      if let Some(updated_after) = query.updated_after {
        cqb
          .push(
            " AND EXISTS (SELECT 1 FROM snapshots sn WHERE sn.workspace_id = wp.workspace_id \
               AND sn.guid = wp.page_id AND sn.updated_at >= ",
          )
          .push_bind(updated_after)
          .push(")");
      }
      let total: i64 = cqb
        .build_query_scalar()
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("admin count shared links: {e}")))?;
      Some(i32::try_from(total).unwrap_or(i32::MAX))
    } else {
      None
    };

    let start_cursor = edges.first().map(|e| e.cursor.clone());
    let end_cursor = edges.last().map(|e| e.cursor.clone());
    Ok(AdminAllSharedLinksPage {
      edges,
      has_next_page,
      has_previous_page: query.after.is_some() || offset > 0,
      start_cursor,
      end_cursor,
      total_count,
      analytics_window: AdminTimeWindow {
        from: naive_date_to_utc(from_day),
        to: naive_date_to_utc(current_day),
        timezone: "UTC".to_owned(),
        bucket: AdminTimeBucket::Day,
        requested_size: query.analytics_window_days.unwrap_or(DEFAULT_ANALYTICS_WINDOW_DAYS),
        effective_size: window_days,
      },
    })
  }

  pub async fn aggregate_mail_deliveries(&self, hours: Option<i32>) -> Result<AdminMailDeliveryReport, DomainError> {
    if let Some(h) = hours
      && h != 24
      && h != 168
    {
      return Err(DomainError::Validation(
        "Mail delivery analytics window must be 24 or 168 hours.".to_owned(),
      ));
    }
    let requested_hours = hours.unwrap_or(24);
    let (bucket_unit, bucket_enum, effective_size) = if requested_hours > 24 {
      ("day", AdminTimeBucket::Day, requested_hours / 24)
    } else {
      ("hour", AdminTimeBucket::Hour, requested_hours)
    };
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire admin aggregate_mail_deliveries: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("admin aggregate_mail_deliveries clock: {e}")))?;
    let to = if bucket_enum == AdminTimeBucket::Hour {
      floor_hour(now) + Duration::hours(1)
    } else {
      naive_date_to_utc(now.date_naive()) + Duration::days(1)
    };
    let from = if bucket_enum == AdminTimeBucket::Hour {
      to - Duration::hours(i64::from(effective_size))
    } else {
      to - Duration::days(i64::from(effective_size))
    };
    let rows = sqlx::query(
      r#"SELECT
           date_trunc($1, created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS bucket,
           mail_class,
           status,
           COUNT(*)::int AS count
         FROM mail_deliveries
         WHERE created_at >= $2 AND created_at < $3
         GROUP BY bucket, mail_class, status
         ORDER BY bucket ASC"#,
    )
    .bind(bucket_unit)
    .bind(from)
    .bind(to)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("admin aggregate_mail_deliveries: {e}")))?;

    let mut status_counts: BTreeMap<(String, DateTime<Utc>), i32> = BTreeMap::new();
    let mut class_counts: BTreeMap<(String, DateTime<Utc>), i32> = BTreeMap::new();
    let mut class_totals: BTreeMap<String, i32> = BTreeMap::new();
    let mut outcome_counts: BTreeMap<(String, DateTime<Utc>), i32> = BTreeMap::new();
    let mut summary = AdminMailDeliverySummary::default();

    for r in rows {
      let bucket: DateTime<Utc> = r.get("bucket");
      let mail_class: String = r.get("mail_class");
      let status: String = r.get("status");
      let count: i32 = r.get("count");

      summary.total += count;
      match status.as_str() {
        "sent" => summary.sent += count,
        "failed" => summary.failed += count,
        "skipped" => summary.skipped += count,
        "canceled" => summary.canceled += count,
        "queued" => summary.queued += count,
        "sending" => summary.sending += count,
        "retry_wait" => summary.retry_wait += count,
        _ => {}
      }
      *status_counts.entry((status.clone(), bucket)).or_insert(0) += count;
      *class_counts.entry((mail_class.clone(), bucket)).or_insert(0) += count;
      *class_totals.entry(mail_class).or_insert(0) += count;
      let outcome = match status.as_str() {
        "sent" => "successful",
        "queued" | "sending" | "retry_wait" => "pending",
        _ => "unsuccessful",
      };
      *outcome_counts.entry((outcome.to_owned(), bucket)).or_insert(0) += count;
    }

    let terminal = summary.sent + summary.failed + summary.skipped + summary.canceled;
    summary.success_rate = if terminal > 0 {
      f64::from(summary.sent) / f64::from(terminal)
    } else {
      0.0
    };

    let buckets: Vec<DateTime<Utc>> = (0..effective_size)
      .map(|i| {
        if bucket_enum == AdminTimeBucket::Hour {
          from + Duration::hours(i64::from(i))
        } else {
          from + Duration::days(i64::from(i))
        }
      })
      .collect();

    let build_series =
      |keys: &[(&str, &str)], counts: &BTreeMap<(String, DateTime<Utc>), i32>| -> Vec<AdminMailDeliverySeries> {
        keys
          .iter()
          .map(|&(key, label)| {
            let mut total = 0;
            let points = buckets
              .iter()
              .map(|&b| {
                let c = counts.get(&(key.to_owned(), b)).copied().unwrap_or(0);
                total += c;
                AdminMailDeliveryPoint { bucket: b, count: c }
              })
              .collect();
            AdminMailDeliverySeries {
              key: key.to_owned(),
              label: label.to_owned(),
              total,
              points,
            }
          })
          .collect()
      };

    let mut top_classes: Vec<(String, i32)> = class_totals.into_iter().collect();
    top_classes.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    top_classes.truncate(6);
    let top_class_refs: Vec<(&str, &str)> = top_classes.iter().map(|(k, _)| (k.as_str(), k.as_str())).collect();

    Ok(AdminMailDeliveryReport {
      window: AdminTimeWindow {
        from,
        to,
        timezone: "UTC".to_owned(),
        bucket: bucket_enum,
        requested_size: requested_hours,
        effective_size,
      },
      summary,
      by_status: build_series(
        &[
          ("sent", "Sent"),
          ("failed", "Failed"),
          ("skipped", "Skipped"),
          ("canceled", "Canceled"),
          ("queued", "Queued"),
          ("sending", "Sending"),
          ("retry_wait", "Retry wait"),
        ],
        &status_counts,
      ),
      by_type: build_series(&top_class_refs, &class_counts),
      by_outcome: build_series(
        &[
          ("successful", "Successful"),
          ("unsuccessful", "Unsuccessful"),
          ("pending", "Pending"),
        ],
        &outcome_counts,
      ),
    })
  }
}
