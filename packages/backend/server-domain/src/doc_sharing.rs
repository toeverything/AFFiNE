//! Document sharing, per-document role grants, logical/physical ID alias
//! resolution, public root-doc filtering, and document metadata queries.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::json;
use server_db::{ServerDb, WorkloadTier};
use server_spi::QuotaGate;
use server_types::DomainError;
use sqlx::{Postgres, Row, Transaction};

use crate::acl::{DocPermissionsView, DocRole, load_workspace_docs_access_in};
use crate::events::{EventBusPublisher, InvalidationHintV1, InvalidationPublisher};
use crate::users::PublicUserView;

#[derive(Clone, Debug)]
pub struct DocInfoView {
  pub workspace_id: String,
  pub doc_id: String,
  pub public: bool,
  pub mode: i16,
  pub default_role: DocRole,
  pub created_at: Option<DateTime<Utc>>,
  pub updated_at: Option<DateTime<Utc>>,
  pub creator_id: Option<String>,
  pub last_updater_id: Option<String>,
  pub title: Option<String>,
  pub summary: Option<String>,
  pub permissions: DocPermissionsView,
}

#[derive(Clone, Debug)]
pub struct DocMetaView {
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub created_by: Option<PublicUserView>,
  pub updated_by: Option<PublicUserView>,
}

#[derive(Clone, Debug)]
pub struct GrantedDocUserView {
  pub role: DocRole,
  pub user_id: String,
  pub name: String,
  pub email: String,
  pub avatar_url: Option<String>,
  pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct DocPageAnalyticsPointData {
  pub date: DateTime<Utc>,
  pub total_views: i64,
  pub unique_views: i64,
  pub guest_views: i64,
}

#[derive(Clone, Debug, Default)]
pub struct DocPageAnalyticsSummaryData {
  pub total_views: i64,
  pub unique_views: i64,
  pub guest_views: i64,
  pub last_accessed_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdminTimeBucket {
  Day,
  Hour,
  Minute,
}

#[derive(Clone, Debug)]
pub struct AdminTimeWindow {
  pub from: DateTime<Utc>,
  pub to: DateTime<Utc>,
  pub timezone: String,
  pub bucket: AdminTimeBucket,
  pub requested_size: i32,
  pub effective_size: i32,
}

#[derive(Clone, Debug)]
pub struct DocPageAnalyticsData {
  pub window: AdminTimeWindow,
  pub series: Vec<DocPageAnalyticsPointData>,
  pub summary: DocPageAnalyticsSummaryData,
  pub generated_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct DocMemberLastAccessItem {
  pub user: PublicUserView,
  pub last_accessed_at: DateTime<Utc>,
  pub last_doc_id: Option<String>,
  pub cursor: String,
}

#[derive(Clone, Debug)]
pub struct DocMemberLastAccessPage {
  pub items: Vec<DocMemberLastAccessItem>,
  pub has_next_page: bool,
  pub has_previous_page: bool,
  pub start_cursor: Option<String>,
  pub end_cursor: Option<String>,
  pub total_count: Option<i32>,
}

pub fn is_empty_doc_bin(bin: &[u8]) -> bool {
  bin.is_empty() || (bin.len() == 1 && bin[0] == 0) || (bin.len() == 2 && bin[0] == 0 && bin[1] == 0)
}

/// Extracts logical `pageId -> subdoc guid` aliases from a workspace root doc.
pub fn extract_root_doc_id_aliases(root_doc_bin: &[u8]) -> Result<HashMap<String, String>, DomainError> {
  if is_empty_doc_bin(root_doc_bin) {
    return Ok(HashMap::new());
  }
  match y_octo::ReadDoc::from_full_update_v1(root_doc_bin.to_vec()) {
    Ok(doc) => Ok(extract_aliases_from_read_doc(&doc)),
    Err(y_octo::ReadError::IncompleteSnapshot(_)) => {
      let doc = y_octo::Doc::try_from_binary_v1(root_doc_bin)
        .map_err(|e| DomainError::Internal(format!("decode root doc for aliases: {e}")))?;
      Ok(extract_aliases_from_doc(&doc))
    }
    Err(e) => Err(DomainError::Internal(format!("read root doc for aliases: {e}"))),
  }
}

fn extract_aliases_from_read_doc(doc: &y_octo::ReadDoc) -> HashMap<String, String> {
  let mut aliases = HashMap::new();
  let Some(meta) = doc.map("meta") else {
    return aliases;
  };
  let Some(y_octo::ReadValue::Array(pages)) = meta.get("pages") else {
    return aliases;
  };
  let Some(spaces) = doc.map("spaces") else {
    return aliases;
  };
  for entry in pages.iter() {
    let y_octo::ReadValue::Map(page) = entry else {
      continue;
    };
    let Some(id) = page.get("id").and_then(|v| v.as_any()).and_then(|a| a.as_str()) else {
      continue;
    };
    if let Some(y_octo::ReadValue::Doc { guid, .. }) = spaces.get(id) {
      aliases.insert(id.to_string(), guid.to_string());
    }
  }
  aliases
}

fn extract_aliases_from_doc(doc: &y_octo::Doc) -> HashMap<String, String> {
  let mut aliases = HashMap::new();
  let Ok(meta) = doc.get_map("meta") else {
    return aliases;
  };
  let Some(y_octo::Value::Array(pages)) = meta.get("pages") else {
    return aliases;
  };
  let Ok(spaces) = doc.get_map("spaces") else {
    return aliases;
  };
  for entry in pages.iter() {
    let y_octo::Value::Map(page) = entry else {
      continue;
    };
    let Some(y_octo::Value::Any(y_octo::Any::String(id))) = page.get("id") else {
      continue;
    };
    if let Some(y_octo::Value::Doc(subdoc)) = spaces.get(&id) {
      aliases.insert(id, subdoc.guid().to_string());
    }
  }
  aliases
}

/// Builds a sanitized public workspace root Yjs document containing ONLY
/// workspace-level metadata (`name`, `avatar`, `blockVersions`,
/// `workspaceVersion`) and `meta.pages` entries for explicitly published
/// `public_docs`. Never leaks private document IDs or titles.
pub fn build_public_root_doc(
  root_doc_bin: &[u8],
  public_docs: &[(String, Option<String>)],
) -> Result<Vec<u8>, DomainError> {
  let src = if is_empty_doc_bin(root_doc_bin) {
    y_octo::Doc::default()
  } else {
    y_octo::Doc::try_from_binary_v1(root_doc_bin)
      .map_err(|e| DomainError::Internal(format!("decode workspace root doc: {e}")))?
  };

  let out = y_octo::Doc::default();
  let mut out_meta = out
    .get_or_create_map("meta")
    .map_err(|e| DomainError::Internal(format!("create public root meta map: {e}")))?;

  let mut existing_pages: HashMap<String, (Option<String>, Option<i64>)> = HashMap::new();
  if let Ok(src_meta) = src.get_map("meta") {
    for key in ["name", "avatar", "workspaceVersion", "blockVersions"] {
      if let Some(y_octo::Value::Any(val)) = src_meta.get(key) {
        let _ = out_meta.insert(key.to_owned(), val);
      } else if key == "blockVersions"
        && let Some(y_octo::Value::Map(bv)) = src_meta.get(key)
        && let Ok(mut bv_map) = out.create_map()
      {
        for (k, v) in bv.iter() {
          if let y_octo::Value::Any(any) = v {
            let _ = bv_map.insert(k, any);
          }
        }
        let _ = out_meta.insert("blockVersions".to_owned(), bv_map);
      }
    }
    if let Some(y_octo::Value::Array(pages)) = src_meta.get("pages") {
      for entry in pages.iter() {
        let y_octo::Value::Map(page) = entry else {
          continue;
        };
        let Some(y_octo::Value::Any(y_octo::Any::String(id))) = page.get("id") else {
          continue;
        };
        let title = match page.get("title") {
          Some(y_octo::Value::Any(y_octo::Any::String(s))) => Some(s),
          _ => None,
        };
        let create_date = match page.get("createDate") {
          Some(y_octo::Value::Any(y_octo::Any::Integer(n))) => Some(i64::from(n)),
          Some(y_octo::Value::Any(y_octo::Any::BigInt64(n))) => Some(n),
          Some(y_octo::Value::Any(y_octo::Any::Float64(f))) => Some(f.0 as i64),
          _ => None,
        };
        existing_pages.insert(id, (title, create_date));
      }
    }
  }

  let mut out_pages = out
    .create_array()
    .map_err(|e| DomainError::Internal(format!("create public root pages array: {e}")))?;
  let mut seen = HashSet::new();
  for (doc_id, override_title) in public_docs {
    if !seen.insert(doc_id.as_str()) {
      continue;
    }
    let mut page_map = out
      .create_map()
      .map_err(|e| DomainError::Internal(format!("create public page map: {e}")))?;
    let _ = page_map.insert("id".to_owned(), y_octo::Any::String(doc_id.clone()));
    let (existing_title, create_date) = existing_pages.get(doc_id).cloned().unwrap_or((None, None));
    let title = override_title
      .as_deref()
      .filter(|s| !s.is_empty())
      .map(str::to_owned)
      .or(existing_title)
      .unwrap_or_default();
    let _ = page_map.insert("title".to_owned(), y_octo::Any::String(title));
    if let Some(ts) = create_date {
      let _ = page_map.insert("createDate".to_owned(), y_octo::Any::BigInt64(ts));
    }
    let tags = out
      .create_array()
      .map_err(|e| DomainError::Internal(format!("create tags array: {e}")))?;
    let _ = page_map.insert("tags".to_owned(), tags);
    let _ = out_pages.push(page_map);
  }
  let _ = out_meta.insert("pages".to_owned(), out_pages);

  out
    .encode_update_v1()
    .map_err(|e| DomainError::Internal(format!("encode public root doc: {e}")))
}

#[derive(Clone)]
pub struct DocSharingService {
  db: ServerDb,
  quota_gate: Arc<dyn QuotaGate>,
  invalidation: Arc<dyn InvalidationPublisher>,
  event_bus: Arc<dyn EventBusPublisher>,
}

impl DocSharingService {
  pub fn new(
    db: ServerDb,
    quota_gate: Arc<dyn QuotaGate>,
    invalidation: Arc<dyn InvalidationPublisher>,
    event_bus: Arc<dyn EventBusPublisher>,
  ) -> Self {
    Self {
      db,
      quota_gate,
      invalidation,
      event_bus,
    }
  }

  /// Checks whether the workspace is currently in a readonly/over-quota state
  /// (seat_limit <= 0 or active seats > seat_limit).
  pub(crate) async fn is_workspace_readonly_in(
    tx: &mut Transaction<'_, Postgres>,
    quota_gate: &dyn QuotaGate,
    workspace_id: &str,
    now: DateTime<Utc>,
  ) -> Result<bool, DomainError> {
    let grant = quota_gate.resolve_workspace_grant(tx, workspace_id, now).await?;
    if grant.limits.seat_limit <= 0 {
      return Ok(true);
    }
    let active_seats: i64 =
      sqlx::query_scalar("SELECT COUNT(*)::bigint FROM workspace_members WHERE workspace_id = $1 AND state = 'active'")
        .bind(workspace_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| DomainError::Internal(format!("count active workspace seats: {e}")))?;
    Ok(active_seats > i64::from(grant.limits.seat_limit))
  }

  /// Loads merged Yjs document bytes (`snapshots` + `updates`) inside an
  /// existing transaction.
  pub(crate) async fn load_merged_doc_binary_in(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    doc_id: &str,
  ) -> Result<Option<Vec<u8>>, DomainError> {
    let snapshot: Option<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
        .bind(workspace_id)
        .bind(doc_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| DomainError::Internal(format!("load doc snapshot: {e}")))?;
    let updates: Vec<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC")
        .bind(workspace_id)
        .bind(doc_id)
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| DomainError::Internal(format!("load doc updates: {e}")))?;

    let mut parts = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
    if let Some(snap) = snapshot {
      parts.push(snap);
    }
    parts.extend(updates);
    if parts.is_empty() {
      return Ok(None);
    }
    if parts.len() == 1 {
      return Ok(Some(parts.remove(0)));
    }
    let merged = y_octo::merge_updates_v1(parts)
      .and_then(|u| u.encode_v1())
      .map_err(|e| DomainError::Internal(format!("merge doc updates: {e}")))?;
    Ok(Some(merged))
  }

  pub async fn get_doc_id_aliases(&self, workspace_id: &str) -> Result<HashMap<String, String>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_doc_id_aliases: {e}")))?;
    let aliases = self.get_doc_id_aliases_in(tx.tx_mut(), workspace_id).await?;
    let _ = tx.rollback().await;
    Ok(aliases)
  }

  async fn is_doc_lifecycle_active_in(tx: &mut Transaction<'_, Postgres>) -> Result<bool, DomainError> {
    let has_checkpoints: bool =
      sqlx::query_scalar("SELECT to_regclass('public.storage_reconciliation_checkpoints') IS NOT NULL")
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| DomainError::Internal(format!("check storage_reconciliation_checkpoints: {e}")))?;
    if !has_checkpoints {
      return Ok(false);
    }
    sqlx::query_scalar(
      r#"SELECT EXISTS(
           SELECT 1 FROM storage_reconciliation_checkpoints
           WHERE kind = 'workspace_doc_lifecycle_activation'
             AND status = 'active'
         )"#,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("query workspace_doc_lifecycle_activation: {e}")))
  }

  pub(crate) async fn get_doc_id_aliases_in(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
  ) -> Result<HashMap<String, String>, DomainError> {
    if Self::is_doc_lifecycle_active_in(tx).await? {
      return Ok(HashMap::new());
    }
    let Some(root_bin) = Self::load_merged_doc_binary_in(tx, workspace_id, workspace_id).await? else {
      return Ok(HashMap::new());
    };
    extract_root_doc_id_aliases(&root_bin)
  }

  /// Resolves a logical `doc_id` to its physical storage doc ID when the
  /// workspace has not activated `workspace_doc_lifecycle`.
  pub async fn resolve_storage_doc_id(&self, workspace_id: &str, doc_id: &str) -> Result<String, DomainError> {
    if doc_id == workspace_id || doc_id.starts_with("db$") || doc_id.starts_with("userdata$") {
      return Ok(doc_id.to_owned());
    }
    let aliases = self.get_doc_id_aliases(workspace_id).await?;
    Ok(aliases.get(doc_id).cloned().unwrap_or_else(|| doc_id.to_owned()))
  }

  pub async fn publish_doc(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    mode: i16,
  ) -> Result<DocInfoView, DomainError> {
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;
    if workspace_id == doc_id {
      return Err(DomainError::Validation("expect_to_publish_doc".to_owned()));
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin publish_doc: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("publish_doc clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    let entry = access
      .docs
      .get(&doc_id)
      .ok_or_else(|| DomainError::Forbidden(format!("doc_action_denied:{workspace_id}:{doc_id}:Doc.Publish")))?;
    if !entry.permissions.doc_publish {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Publish"
      )));
    }
    if Self::is_workspace_readonly_in(tx.tx_mut(), self.quota_gate.as_ref(), workspace_id, now).await? {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Publish"
      )));
    }

    // Lock snapshot FOR UPDATE + updates FOR SHARE so ghost policy rows are never written.
    let snapshot =
      sqlx::query_scalar::<_, String>("SELECT guid FROM snapshots WHERE workspace_id = $1 AND guid = $2 FOR UPDATE")
        .bind(workspace_id)
        .bind(&doc_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock published doc snapshot: {e}")))?;
    let updates = sqlx::query_scalar::<_, String>(
      "SELECT guid FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at FOR SHARE",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock published doc updates: {e}")))?;
    if snapshot.is_none() && updates.is_empty() {
      return Err(DomainError::NotFound(format!("doc_not_found:{workspace_id}:{doc_id}")));
    }

    sqlx::query(
      r#"INSERT INTO doc_access_policies
           (workspace_id, doc_id, visibility, public_role, published_at)
         VALUES ($1, $2, 'public', 'external', now())
         ON CONFLICT (workspace_id, doc_id) DO UPDATE SET
           visibility = 'public',
           public_role = 'external',
           published_at = now(),
           updated_at = now()"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("write public doc policy: {e}")))?;

    sqlx::query(
      r#"INSERT INTO workspace_pages (workspace_id, page_id, mode, published_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (workspace_id, page_id) DO UPDATE SET
           mode = EXCLUDED.mode,
           published_at = EXCLUDED.published_at"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(mode)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("write public doc metadata: {e}")))?;

    let info = self
      .load_doc_info_in(tx.tx_mut(), workspace_id, Some(actor_user_id), &doc_id, now, false)
      .await?
      .ok_or_else(|| DomainError::NotFound(format!("doc_not_found:{workspace_id}:{doc_id}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit publish_doc: {e}")))?;

    self
      .publish_doc_share_state_changed(workspace_id, &doc_id, "public-state-changed")
      .await;
    Ok(info)
  }

  pub async fn unpublish_doc(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
  ) -> Result<DocInfoView, DomainError> {
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;
    if workspace_id == doc_id {
      return Err(DomainError::Validation("expect_to_revoke_public_doc".to_owned()));
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin unpublish_doc: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("unpublish_doc clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    let entry = access
      .docs
      .get(&doc_id)
      .ok_or_else(|| DomainError::Forbidden(format!("doc_action_denied:{workspace_id}:{doc_id}:Doc.Unpublish")))?;
    // Readonly/over-quota workspaces ARE allowed to unpublish.
    if !entry.permissions.doc_unpublish {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Unpublish"
      )));
    }

    let is_public: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM doc_access_policies WHERE workspace_id = $1 AND doc_id = $2 AND visibility = 'public' AND public_role = 'external')",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("check public doc: {e}")))?;
    if !is_public {
      return Err(DomainError::Validation("doc_is_not_public".to_owned()));
    }

    sqlx::query(
      r#"INSERT INTO doc_access_policies
           (workspace_id, doc_id, visibility, public_role, published_at)
         VALUES ($1, $2, 'private', NULL, NULL)
         ON CONFLICT (workspace_id, doc_id) DO UPDATE SET
           visibility = 'private',
           public_role = NULL,
           published_at = NULL,
           updated_at = now()"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("clear public doc policy: {e}")))?;

    sqlx::query(
      r#"INSERT INTO workspace_pages (workspace_id, page_id, mode, published_at)
         VALUES ($1, $2, 0, NULL)
         ON CONFLICT (workspace_id, page_id) DO UPDATE SET
           published_at = NULL"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("clear public doc page metadata: {e}")))?;

    let info = self
      .load_doc_info_in(tx.tx_mut(), workspace_id, Some(actor_user_id), &doc_id, now, false)
      .await?
      .ok_or_else(|| DomainError::NotFound(format!("doc_not_found:{workspace_id}:{doc_id}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit unpublish_doc: {e}")))?;

    self
      .publish_doc_share_state_changed(workspace_id, &doc_id, "public-state-changed")
      .await;
    Ok(info)
  }

  pub async fn grant_doc_roles(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    mut target_user_ids: Vec<String>,
    new_role: DocRole,
  ) -> Result<(), DomainError> {
    if !matches!(
      new_role,
      DocRole::Reader | DocRole::Commenter | DocRole::Editor | DocRole::Manager
    ) {
      return Err(DomainError::Validation("invalid_doc_role".to_owned()));
    }
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;
    if workspace_id == doc_id {
      return Err(DomainError::Validation(format!(
        "expect_to_grant_doc_user_roles:{workspace_id}:{doc_id}"
      )));
    }
    target_user_ids.sort();
    target_user_ids.dedup();
    if target_user_ids.is_empty() {
      return Ok(());
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin grant_doc_roles: {e}")))?;
    let ws_exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
      .bind(workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock workspace for grant_doc_roles: {e}")))?;
    if ws_exists.is_none() {
      return Err(DomainError::NotFound(format!("space_not_found:{workspace_id}")));
    }
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("grant_doc_roles clock: {e}")))?;

    let located = load_doc_roles_in(tx.tx_mut(), workspace_id, &doc_id, &target_user_ids, false).await?;
    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    let entry = access
      .docs
      .get(&doc_id)
      .ok_or_else(|| DomainError::Forbidden(format!("doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage")))?;
    if !entry.permissions.doc_users_manage {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage"
      )));
    }
    if located.values().any(|role| *role == DocRole::Owner) {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage"
      )));
    }
    let readonly = Self::is_workspace_readonly_in(tx.tx_mut(), self.quota_gate.as_ref(), workspace_id, now).await?;
    if readonly {
      let all_strict_demotion = target_user_ids
        .iter()
        .all(|uid| matches!(located.get(uid).copied(), Some(cur) if new_role < cur));
      if !all_strict_demotion {
        return Err(DomainError::Forbidden(format!(
          "doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage"
        )));
      }
    }

    let locked = load_doc_roles_in(tx.tx_mut(), workspace_id, &doc_id, &target_user_ids, true).await?;
    if locked != located {
      return Err(DomainError::Conflict("doc_role_targets_changed".to_owned()));
    }

    for target_user_id in &target_user_ids {
      let affected = sqlx::query(
        r#"INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by)
           VALUES ($1, $2, 'user', $3, $4, $5)
           ON CONFLICT (workspace_id, doc_id, principal_type, principal_id)
           DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, updated_at = now()
           WHERE doc_grants.role <> 'owner'"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(target_user_id)
      .bind(new_role.as_str())
      .bind(actor_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("grant doc role: {e}")))?
      .rows_affected();
      if affected == 0 {
        return Err(DomainError::Conflict("doc_role_targets_changed".to_owned()));
      }
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit grant_doc_roles: {e}")))?;

    self
      .publish_doc_grants_changed(workspace_id, &doc_id, "grants-changed")
      .await;
    Ok(())
  }

  pub async fn transition_doc_role(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    target_user_id: &str,
    new_role: Option<DocRole>,
  ) -> Result<(), DomainError> {
    if let Some(role) = new_role
      && matches!(role, DocRole::None | DocRole::External)
    {
      return Err(DomainError::Validation("invalid_doc_role".to_owned()));
    }
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;
    if workspace_id == doc_id {
      let code = if new_role.is_none() {
        format!("expect_to_revoke_doc_user_roles:{workspace_id}:{doc_id}")
      } else {
        format!("expect_to_update_doc_user_role:{workspace_id}:{doc_id}")
      };
      return Err(DomainError::Validation(code));
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin transition_doc_role: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("transition_doc_role clock: {e}")))?;

    // Lock workspace row first to match domain_command/roles.rs lock order.
    let ws_exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
      .bind(workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock workspace for doc role transition: {e}")))?;
    if ws_exists.is_none() {
      return Err(DomainError::NotFound("workspace_not_found".to_owned()));
    }

    let current_role: Option<DocRole> = sqlx::query_scalar::<_, String>(
      "SELECT role FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND principal_id = $3",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(target_user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load doc role target: {e}")))?
    .map(|r| DocRole::parse(&r));

    if new_role == Some(DocRole::Owner) {
      let target_active: bool = sqlx::query_scalar(
        "SELECT state = 'active' FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE",
      )
      .bind(workspace_id)
      .bind(target_user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("check doc owner target: {e}")))?
      .unwrap_or(false);
      if !target_active {
        return Err(DomainError::Validation("target_member_not_active".to_owned()));
      }
      if target_user_id == actor_user_id && current_role == Some(DocRole::Owner) {
        return Err(DomainError::Validation("cannot_transfer_owner_to_self".to_owned()));
      }
    }

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    let entry = access
      .docs
      .get(&doc_id)
      .ok_or_else(|| DomainError::Forbidden(format!("doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage")))?;
    if current_role == Some(DocRole::Owner) && new_role != Some(DocRole::Owner) {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.TransferOwner"
      )));
    }
    if new_role == Some(DocRole::Owner) {
      if !entry.permissions.doc_transfer_owner {
        return Err(DomainError::Forbidden(format!(
          "doc_action_denied:{workspace_id}:{doc_id}:Doc.TransferOwner"
        )));
      }
    } else if !entry.permissions.doc_users_manage {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage"
      )));
    }

    let readonly = Self::is_workspace_readonly_in(tx.tx_mut(), self.quota_gate.as_ref(), workspace_id, now).await?;
    if readonly {
      // Allow revocation or strict demotion even when readonly; deny promotion or owner transfer.
      let is_demotion = match (current_role, new_role) {
        (_, None) => true,
        (Some(cur), Some(next)) if next < cur => true,
        _ => false,
      };
      if !is_demotion {
        return Err(DomainError::Forbidden(format!(
          "doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage"
        )));
      }
    }

    let locked_role: Option<DocRole> = sqlx::query_scalar::<_, String>(
      "SELECT role FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND principal_id = $3 FOR UPDATE",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(target_user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock doc role target: {e}")))?
    .map(|r| DocRole::parse(&r));
    if locked_role != current_role {
      return Err(DomainError::Conflict("doc_role_target_changed".to_owned()));
    }

    if new_role == Some(DocRole::Owner) {
      sqlx::query(
        "UPDATE doc_grants SET role = 'manager', updated_at = now() \
         WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND role = 'owner' AND principal_id <> $3",
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(target_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("demote previous doc owner: {e}")))?;
    }

    if let Some(role) = new_role {
      sqlx::query(
        r#"INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by)
           VALUES ($1, $2, 'user', $3, $4, $5)
           ON CONFLICT (workspace_id, doc_id, principal_type, principal_id)
           DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, updated_at = now()"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(target_user_id)
      .bind(role.as_str())
      .bind(actor_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("transition doc grant: {e}")))?;
    } else {
      sqlx::query(
        "DELETE FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND principal_id = $3",
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(target_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("revoke doc grant: {e}")))?;
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit transition_doc_role: {e}")))?;

    let reason = if new_role == Some(DocRole::Owner) {
      "owner-changed"
    } else {
      "grants-changed"
    };
    self.publish_doc_grants_changed(workspace_id, &doc_id, reason).await;
    Ok(())
  }

  pub async fn set_doc_default_role(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    new_role: DocRole,
  ) -> Result<(), DomainError> {
    if new_role == DocRole::Owner {
      return Err(DomainError::Validation("doc_default_role_can_not_be_owner".to_owned()));
    }
    if new_role == DocRole::External {
      return Err(DomainError::Validation("invalid_doc_default_role".to_owned()));
    }
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin set_doc_default_role: {e}")))?;
    let ws_exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
      .bind(workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock workspace for set_doc_default_role: {e}")))?;
    if ws_exists.is_none() {
      return Err(DomainError::NotFound(format!("space_not_found:{workspace_id}")));
    }
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("set_doc_default_role clock: {e}")))?;

    let current_role = load_doc_default_role_in(tx.tx_mut(), workspace_id, &doc_id).await?;
    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    let entry = access
      .docs
      .get(&doc_id)
      .ok_or_else(|| DomainError::Forbidden(format!("doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage")))?;
    if !entry.permissions.doc_users_manage {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage"
      )));
    }

    let readonly = Self::is_workspace_readonly_in(tx.tx_mut(), self.quota_gate.as_ref(), workspace_id, now).await?;
    if readonly && new_role >= current_role {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Manage"
      )));
    }

    if load_doc_default_role_in(tx.tx_mut(), workspace_id, &doc_id).await? != current_role {
      return Err(DomainError::Conflict("doc_default_role_changed".to_owned()));
    }

    sqlx::query(
      r#"INSERT INTO doc_access_policies (workspace_id, doc_id, member_default_role)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, doc_id) DO UPDATE
           SET member_default_role = EXCLUDED.member_default_role,
               updated_at = clock_timestamp()"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(new_role.as_str())
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("set doc default role: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit set_doc_default_role: {e}")))?;

    self
      .publish_doc_share_state_changed(workspace_id, &doc_id, "default-role-changed")
      .await;
    Ok(())
  }

  /// Loads document metadata and permissions for an external caller.
  /// Enforces `Doc.Read` so unauthorized members or non-members never receive
  /// document metadata (`title`, `summary`, `creatorId`, `mode`, `defaultRole`).
  pub async fn get_doc_info(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    raw_doc_id: &str,
  ) -> Result<Option<DocInfoView>, DomainError> {
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_doc_info: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("get_doc_info clock: {e}")))?;
    let info = self
      .load_doc_info_in(tx.tx_mut(), workspace_id, actor_user_id, &doc_id, now, true)
      .await?;
    let _ = tx.rollback().await;
    Ok(info)
  }

  /// Resolves effective document permissions for internal authorization checks
  /// (e.g. realtime topic subscriptions) without leaking document metadata.
  pub async fn get_doc_permissions(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    raw_doc_id: &str,
  ) -> Result<Option<DocPermissionsView>, DomainError> {
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_doc_permissions: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("get_doc_permissions clock: {e}")))?;
    let access = match load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      actor_user_id,
      std::slice::from_ref(&doc_id),
      now,
    )
    .await
    {
      Ok(a) => a,
      Err(DomainError::NotFound(_)) => {
        let _ = tx.rollback().await;
        return Ok(None);
      }
      Err(e) => return Err(e),
    };
    let perms = access.docs.get(&doc_id).map(|e| e.permissions);
    let _ = tx.rollback().await;
    Ok(perms)
  }

  async fn load_doc_info_in(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    doc_id: &str,
    now: DateTime<Utc>,
    require_read: bool,
  ) -> Result<Option<DocInfoView>, DomainError> {
    let access = match load_workspace_docs_access_in(
      tx,
      self.quota_gate.as_ref(),
      workspace_id,
      actor_user_id,
      &[doc_id.to_owned()],
      now,
    )
    .await
    {
      Ok(a) => a,
      Err(DomainError::NotFound(_)) if require_read => {
        return Err(DomainError::Forbidden(format!(
          "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
        )));
      }
      Err(e) => return Err(e),
    };
    let Some(entry) = access.docs.get(doc_id) else {
      if require_read {
        return Err(DomainError::Forbidden(format!(
          "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
        )));
      }
      return Ok(None);
    };
    if require_read && !entry.permissions.doc_read {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
      )));
    }
    let default_role = load_doc_default_role_in(tx, workspace_id, doc_id).await?;

    let page_row = sqlx::query(
      "SELECT mode, title, summary, published_at FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2",
    )
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load workspace_pages info: {e}")))?;

    let snap_row = sqlx::query(
      "SELECT created_at, updated_at, created_by, updated_by FROM snapshots WHERE workspace_id = $1 AND guid = $2",
    )
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load snapshot info: {e}")))?;

    let mode: i16 = page_row.as_ref().map(|r| r.get("mode")).unwrap_or(0);
    let title: Option<String> = page_row.as_ref().and_then(|r| r.get("title"));
    let summary: Option<String> = page_row.as_ref().and_then(|r| r.get("summary"));
    let created_at: Option<DateTime<Utc>> = snap_row.as_ref().map(|r| r.get("created_at"));
    let updated_at: Option<DateTime<Utc>> = snap_row.as_ref().map(|r| r.get("updated_at"));
    let creator_id: Option<String> = snap_row.as_ref().and_then(|r| r.get("created_by"));
    let last_updater_id: Option<String> = snap_row.as_ref().and_then(|r| r.get("updated_by"));

    Ok(Some(DocInfoView {
      workspace_id: workspace_id.to_owned(),
      doc_id: doc_id.to_owned(),
      public: entry.public,
      mode,
      default_role,
      created_at,
      updated_at,
      creator_id,
      last_updater_id,
      title,
      summary,
      permissions: entry.permissions,
    }))
  }

  pub async fn get_doc_meta(
    &self,
    workspace_id: &str,
    actor_user_id: &str,
    raw_doc_id: &str,
  ) -> Result<DocMetaView, DomainError> {
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_doc_meta: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("get_doc_meta clock: {e}")))?;
    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    if !access.docs.get(&doc_id).is_some_and(|e| e.permissions.doc_read) {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
      )));
    }
    let row = sqlx::query(
      r#"SELECT s.created_at, s.updated_at,
                cu.id AS c_id, cu.name AS c_name, cu.avatar_url AS c_avatar,
                uu.id AS u_id, uu.name AS u_name, uu.avatar_url AS u_avatar
         FROM snapshots s
         LEFT JOIN users cu ON cu.id = s.created_by
         LEFT JOIN users uu ON uu.id = s.updated_by
         WHERE s.workspace_id = $1 AND s.guid = $2"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load doc meta: {e}")))?
    .ok_or_else(|| DomainError::NotFound(format!("doc_not_found:{workspace_id}:{doc_id}")))?;
    let _ = tx.rollback().await;

    let created_by = row.get::<Option<String>, _>("c_id").map(|id| PublicUserView {
      id,
      name: row.get::<Option<String>, _>("c_name").unwrap_or_default(),
      avatar_url: row.get("c_avatar"),
    });
    let updated_by = row.get::<Option<String>, _>("u_id").map(|id| PublicUserView {
      id,
      name: row.get::<Option<String>, _>("u_name").unwrap_or_default(),
      avatar_url: row.get("u_avatar"),
    });
    Ok(DocMetaView {
      created_at: row.get("created_at"),
      updated_at: row.get("updated_at"),
      created_by,
      updated_by,
    })
  }

  pub async fn list_public_docs(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
  ) -> Result<Vec<DocInfoView>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin list_public_docs: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("list_public_docs clock: {e}")))?;

    let rows = sqlx::query(
      r#"SELECT wp.page_id, wp.mode, wp.title, wp.summary,
                dap.member_default_role,
                s.created_at, s.updated_at, s.created_by, s.updated_by
         FROM workspace_pages wp
         JOIN doc_access_policies dap
           ON dap.workspace_id = wp.workspace_id AND dap.doc_id = wp.page_id
         LEFT JOIN snapshots s
           ON s.workspace_id = wp.workspace_id AND s.guid = wp.page_id
         WHERE wp.workspace_id = $1
           AND wp.published_at IS NOT NULL
           AND dap.visibility = 'public'
           AND dap.public_role = 'external'
           AND dap.published_at IS NOT NULL
           AND COALESCE(wp.lifecycle_state::text <> 'deleted', true)
         ORDER BY wp.published_at ASC, wp.page_id ASC"#,
    )
    .bind(workspace_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("list public docs: {e}")))?;

    if rows.is_empty() {
      let _ = tx.rollback().await;
      return Ok(Vec::new());
    }

    let doc_ids: Vec<String> = rows.iter().map(|r| r.get("page_id")).collect();
    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      actor_user_id,
      &doc_ids,
      now,
    )
    .await?;
    let _ = tx.rollback().await;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
      let doc_id: String = row.get("page_id");
      let Some(entry) = access.docs.get(&doc_id) else {
        continue;
      };
      if !entry.permissions.doc_read {
        continue;
      }
      let default_role = row
        .get::<Option<String>, _>("member_default_role")
        .map(|s| DocRole::parse(&s))
        .unwrap_or(DocRole::Manager);
      out.push(DocInfoView {
        workspace_id: workspace_id.to_owned(),
        doc_id,
        public: entry.public,
        mode: row.get::<Option<i16>, _>("mode").unwrap_or(0),
        default_role,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        creator_id: row.get("created_by"),
        last_updater_id: row.get("updated_by"),
        title: row.get("title"),
        summary: row.get("summary"),
        permissions: entry.permissions,
      });
    }
    Ok(out)
  }

  pub async fn list_docs(
    &self,
    workspace_id: &str,
    actor_user_id: &str,
    first: i64,
    offset: i64,
    after_doc_id: Option<&str>,
    require_manage: bool,
  ) -> Result<(i64, Vec<DocInfoView>, bool), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin list_docs: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("list_docs clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      &[],
      now,
    )
    .await?;
    if require_manage && !access.workspace_permissions.users_manage {
      return Err(DomainError::Forbidden("Workspace.Users.Manage denied".to_owned()));
    }

    let all_ids: Vec<String> = sqlx::query_scalar(
      r#"SELECT s.guid
         FROM snapshots s
         LEFT JOIN workspace_pages wp ON wp.workspace_id = s.workspace_id AND wp.page_id = s.guid
         WHERE s.workspace_id = $1
           AND s.guid <> $1
           AND s.guid NOT LIKE 'db$%'
           AND s.guid NOT LIKE 'userdata$%'
           AND COALESCE(wp.lifecycle_state::text <> 'deleted', true)
         ORDER BY s.updated_at DESC, s.guid ASC"#,
    )
    .bind(workspace_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("list workspace doc ids: {e}")))?;

    let filtered_ids = if require_manage {
      all_ids
    } else {
      let docs_access = load_workspace_docs_access_in(
        tx.tx_mut(),
        self.quota_gate.as_ref(),
        workspace_id,
        Some(actor_user_id),
        &all_ids,
        now,
      )
      .await?;
      all_ids
        .into_iter()
        .filter(|id| docs_access.docs.get(id).is_some_and(|e| e.permissions.doc_read))
        .collect()
    };

    let total = filtered_ids.len() as i64;
    let cursor_start = after_doc_id
      .and_then(|after_id| filtered_ids.iter().position(|id| id == after_id).map(|idx| idx + 1))
      .unwrap_or(0);
    let start = cursor_start.saturating_add(usize::try_from(offset.max(0)).unwrap_or(0));
    let take = usize::try_from(first.clamp(1, 100)).unwrap_or(20);
    let mut page_ids: Vec<String> = filtered_ids.into_iter().skip(start).take(take + 1).collect();
    let has_next_page = page_ids.len() > take;
    page_ids.truncate(take);

    let mut out = Vec::with_capacity(page_ids.len());
    for doc_id in page_ids {
      if let Some(info) = self
        .load_doc_info_in(tx.tx_mut(), workspace_id, Some(actor_user_id), &doc_id, now, false)
        .await?
      {
        out.push(info);
      }
    }
    let _ = tx.rollback().await;
    Ok((total, out, has_next_page))
  }

  pub async fn paginate_granted_users(
    &self,
    workspace_id: &str,
    raw_doc_id: &str,
    actor_user_id: &str,
    first: i64,
    offset: i64,
    after: Option<&str>,
  ) -> Result<(i64, Vec<GrantedDocUserView>, bool), DomainError> {
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin paginate_granted_users: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("paginate_granted_users clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    if !access.docs.get(&doc_id).is_some_and(|e| e.permissions.doc_users_read) {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Users.Read"
      )));
    }

    let total: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user'",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("count doc_grants: {e}")))?;

    let after_key: Option<(DateTime<Utc>, String)> = if let Some(raw_cursor) = after.filter(|s| !s.trim().is_empty()) {
      if let Some((ts_str, uid)) = raw_cursor.split_once('|') {
        DateTime::parse_from_rfc3339(ts_str)
          .ok()
          .map(|dt| (dt.with_timezone(&Utc), uid.to_owned()))
      } else {
        // Legacy cursor encoding plain `user_id` or RFC3339 timestamp.
        let by_user: Option<(DateTime<Utc>, String)> = sqlx::query_as(
          "SELECT created_at, principal_id FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND principal_id = $3",
        )
        .bind(workspace_id)
        .bind(&doc_id)
        .bind(raw_cursor)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("resolve doc_grants cursor: {e}")))?;
        if by_user.is_some() {
          by_user
        } else {
          DateTime::parse_from_rfc3339(raw_cursor)
            .ok()
            .map(|dt| (dt.with_timezone(&Utc), String::new()))
        }
      }
    } else {
      None
    };

    let limit = first.clamp(1, 100);
    let fetch_limit = limit + 1;
    let rows = if let Some((after_ts, after_uid)) = after_key {
      sqlx::query(
        r#"SELECT g.role, g.created_at, u.id, u.name, u.email, u.avatar_url
           FROM doc_grants g
           JOIN users u ON u.id = g.principal_id
           WHERE g.workspace_id = $1
             AND g.doc_id = $2
             AND g.principal_type = 'user'
             AND (g.created_at > $3 OR (g.created_at = $3 AND g.principal_id > $4))
           ORDER BY g.created_at ASC, g.principal_id ASC
           OFFSET $5 LIMIT $6"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(after_ts)
      .bind(after_uid)
      .bind(offset.max(0))
      .bind(fetch_limit)
      .fetch_all(&mut **tx.tx_mut())
      .await
    } else {
      sqlx::query(
        r#"SELECT g.role, g.created_at, u.id, u.name, u.email, u.avatar_url
           FROM doc_grants g
           JOIN users u ON u.id = g.principal_id
           WHERE g.workspace_id = $1 AND g.doc_id = $2 AND g.principal_type = 'user'
           ORDER BY g.created_at ASC, g.principal_id ASC
           OFFSET $3 LIMIT $4"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(offset.max(0))
      .bind(fetch_limit)
      .fetch_all(&mut **tx.tx_mut())
      .await
    }
    .map_err(|e| DomainError::Internal(format!("list doc_grants: {e}")))?;
    let _ = tx.rollback().await;

    let has_next_page = (rows.len() as i64) > limit;
    let items = rows
      .into_iter()
      .take(usize::try_from(limit).unwrap_or(20))
      .map(|r| GrantedDocUserView {
        role: DocRole::parse(r.get::<String, _>("role").as_str()),
        user_id: r.get("id"),
        name: r.get("name"),
        email: r.get("email"),
        avatar_url: r.get("avatar_url"),
        created_at: r.get("created_at"),
      })
      .collect();
    Ok((total, items, has_next_page))
  }

  /// Checks `Doc.Read` for `HEAD /api/workspaces/:id/public-docs/:docId`.
  /// Returns `403 doc_action_denied:{ws}:{doc}:Doc.Read` when workspace/doc is
  /// missing or inaccessible, matching `v0.27.5` `assertCanReadPublicDoc`.
  pub async fn head_public_doc(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    raw_doc_id: &str,
  ) -> Result<(&'static str, String), DomainError> {
    let doc_id = self.resolve_storage_doc_id(workspace_id, raw_doc_id).await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin head_public_doc: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("head_public_doc clock: {e}")))?;

    let access = match load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      actor_user_id,
      std::slice::from_ref(&doc_id),
      now,
    )
    .await
    {
      Ok(a) => a,
      Err(DomainError::NotFound(_)) => {
        return Err(DomainError::Forbidden(format!(
          "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
        )));
      }
      Err(e) => return Err(e),
    };
    let Some(entry) = access.docs.get(&doc_id) else {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
      )));
    };
    if !entry.permissions.doc_read {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
      )));
    }
    let publish_mode = entry.publish_mode;
    let _ = tx.rollback().await;
    Ok((publish_mode, doc_id))
  }

  /// Reads a public doc binary inside a single `REPEATABLE READ READ ONLY`
  /// transaction so alias resolution, `Doc.Read` / `publish_mode` authorization,
  /// and `snapshots` + `updates` merge observe one consistent MVCC snapshot
  /// (preventing torn reads against concurrent compaction or revocation).
  pub async fn get_public_doc_binary(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    raw_doc_id: &str,
  ) -> Result<(Vec<u8>, &'static str, String), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_public_doc_binary: {e}")))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("set repeatable read for get_public_doc_binary: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("get_public_doc_binary clock: {e}")))?;

    let doc_id = if Self::is_doc_lifecycle_active_in(tx.tx_mut()).await? {
      raw_doc_id.to_owned()
    } else {
      let root_bin = Self::load_merged_doc_binary_in(tx.tx_mut(), workspace_id, workspace_id).await?;
      match root_bin.as_deref() {
        Some(bin) => extract_root_doc_id_aliases(bin)?
          .get(raw_doc_id)
          .cloned()
          .unwrap_or_else(|| raw_doc_id.to_owned()),
        None => raw_doc_id.to_owned(),
      }
    };

    let access = match load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      actor_user_id,
      std::slice::from_ref(&doc_id),
      now,
    )
    .await
    {
      Ok(a) => a,
      Err(DomainError::NotFound(_)) => {
        return Err(DomainError::Forbidden(format!(
          "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
        )));
      }
      Err(e) => return Err(e),
    };
    let Some(entry) = access.docs.get(&doc_id) else {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
      )));
    };
    if !entry.permissions.doc_read {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
      )));
    }
    let publish_mode = entry.publish_mode;

    let bin = Self::load_merged_doc_binary_in(tx.tx_mut(), workspace_id, &doc_id)
      .await?
      .ok_or_else(|| DomainError::NotFound(format!("doc_not_found:{workspace_id}:{doc_id}")))?;
    let _ = tx.rollback().await;
    Ok((bin, publish_mode, doc_id))
  }

  pub async fn get_public_root_doc(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    requested_doc_id: &str,
  ) -> Result<Vec<u8>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_public_root_doc: {e}")))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("set repeatable read for get_public_root_doc: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("get_public_root_doc clock: {e}")))?;

    let root_bin = Self::load_merged_doc_binary_in(tx.tx_mut(), workspace_id, workspace_id).await?;
    let aliases = if Self::is_doc_lifecycle_active_in(tx.tx_mut()).await? {
      HashMap::new()
    } else {
      match root_bin.as_deref() {
        Some(bin) => extract_root_doc_id_aliases(bin)?,
        None => HashMap::new(),
      }
    };
    let storage_doc_id = aliases
      .get(requested_doc_id)
      .cloned()
      .unwrap_or_else(|| requested_doc_id.to_owned());

    let access = match load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      actor_user_id,
      std::slice::from_ref(&storage_doc_id),
      now,
    )
    .await
    {
      Ok(a) => a,
      Err(DomainError::NotFound(_)) => {
        return Err(DomainError::Forbidden(format!(
          "doc_action_denied:{workspace_id}:{storage_doc_id}:Doc.Read"
        )));
      }
      Err(e) => return Err(e),
    };
    if !access.docs.get(&storage_doc_id).is_some_and(|e| e.permissions.doc_read) {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{storage_doc_id}:Doc.Read"
      )));
    }

    let Some(root_bin) = root_bin else {
      return Err(DomainError::NotFound(format!(
        "doc_not_found:{workspace_id}:{storage_doc_id}"
      )));
    };

    let display_ids: HashMap<String, String> = aliases.into_iter().map(|(k, v)| (v, k)).collect();
    let public_rows: Vec<(String, Option<String>)> = sqlx::query_as(
      r#"SELECT wp.page_id, wp.title
         FROM workspace_pages wp
         JOIN doc_access_policies dap
           ON dap.workspace_id = wp.workspace_id AND dap.doc_id = wp.page_id
         WHERE wp.workspace_id = $1
           AND wp.published_at IS NOT NULL
           AND dap.visibility = 'public'
           AND dap.public_role = 'external'
           AND dap.published_at IS NOT NULL
           AND COALESCE(wp.lifecycle_state::text <> 'deleted', true)
         ORDER BY wp.published_at ASC, wp.page_id ASC"#,
    )
    .bind(workspace_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load public docs for root doc: {e}")))?;
    let _ = tx.rollback().await;

    let metas: Vec<(String, Option<String>)> = public_rows
      .into_iter()
      .map(|(doc_id, title)| {
        let display_id = if doc_id == storage_doc_id {
          requested_doc_id.to_owned()
        } else {
          display_ids.get(&doc_id).cloned().unwrap_or(doc_id)
        };
        (display_id, title)
      })
      .collect();

    build_public_root_doc(&root_bin, &metas)
  }

  /// Best-effort daily view counter upsert into `workspace_doc_view_daily`.
  pub async fn record_doc_view(&self, workspace_id: &str, doc_id: &str, is_guest: bool) {
    let guest_inc: i64 = if is_guest { 1 } else { 0 };
    let mut conn = match self.db.acquire_tiered(WorkloadTier::LongQuery).await {
      Ok(conn) => conn,
      Err(err) => {
        tracing::warn!(workspace_id, doc_id, error = %err, "failed to acquire connection for doc view");
        return;
      }
    };
    let res = sqlx::query(
      r#"INSERT INTO workspace_doc_view_daily
           (workspace_id, doc_id, date, total_views, unique_views, guest_views, last_accessed_at, updated_at)
         VALUES ($1, $2, CURRENT_DATE, 1, 1, $3, now(), now())
         ON CONFLICT (workspace_id, doc_id, date) DO UPDATE SET
           total_views = workspace_doc_view_daily.total_views + 1,
           guest_views = workspace_doc_view_daily.guest_views + EXCLUDED.guest_views,
           last_accessed_at = now(),
           updated_at = now()"#,
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(guest_inc)
    .execute(&mut *conn)
    .await;
    if let Err(err) = res {
      tracing::warn!(workspace_id, doc_id, error = %err, "failed to record doc view");
    }
  }

  async fn publish_doc_share_state_changed(&self, workspace_id: &str, doc_id: &str, reason: &str) {
    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: workspace_id.to_owned(),
        doc_id: Some(doc_id.to_owned()),
      })
      .await;
    let _ = self
      .event_bus
      .publish_event(
        "sync.permissions.changed",
        json!({
          "spaceType": "workspace",
          "spaceId": workspace_id,
          "docId": doc_id,
        }),
        None,
      )
      .await;
    let mut ids = HashSet::from([doc_id.to_owned()]);
    if let Ok(aliases) = self.get_doc_id_aliases(workspace_id).await {
      for (logical, physical) in aliases {
        if physical == doc_id {
          ids.insert(logical);
        }
      }
    }
    for id in ids {
      let _ = self
        .event_bus
        .publish_event(
          "realtime.topic.changed",
          json!({
            "topic": "doc.share-state.changed",
            "room": format!("workspace:{workspace_id}:doc:{id}:share-state"),
            "input": { "workspaceId": workspace_id, "docId": id },
            "event": { "changed": true, "reason": reason },
          }),
          None,
        )
        .await;
    }
  }

  async fn publish_doc_grants_changed(&self, workspace_id: &str, doc_id: &str, reason: &str) {
    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: workspace_id.to_owned(),
        doc_id: Some(doc_id.to_owned()),
      })
      .await;
    let _ = self
      .event_bus
      .publish_event(
        "sync.permissions.changed",
        json!({
          "spaceType": "workspace",
          "spaceId": workspace_id,
          "docId": doc_id,
        }),
        None,
      )
      .await;
    let mut ids = HashSet::from([doc_id.to_owned()]);
    if let Ok(aliases) = self.get_doc_id_aliases(workspace_id).await {
      for (logical, physical) in aliases {
        if physical == doc_id {
          ids.insert(logical);
        }
      }
    }
    for id in ids {
      let _ = self
        .event_bus
        .publish_event(
          "realtime.topic.changed",
          json!({
            "topic": "doc.grants.changed",
            "room": format!("workspace:{workspace_id}:doc:{id}:grants"),
            "input": { "workspaceId": workspace_id, "docId": id },
            "event": { "changed": true, "reason": reason },
          }),
          None,
        )
        .await;
    }
  }
  /// Returns daily page-view analytics for a document after enforcing both
  /// `Doc.Read` and `Doc.Analytics.Read`.
  pub async fn get_doc_page_analytics(
    &self,
    workspace_id: &str,
    doc_id: &str,
    actor_user_id: &str,
    window_days: Option<i32>,
    timezone: Option<&str>,
  ) -> Result<DocPageAnalyticsData, DomainError> {
    let storage_doc_id = self.resolve_storage_doc_id(workspace_id, doc_id).await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_doc_page_analytics: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("get_doc_page_analytics clock: {e}")))?;
    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&storage_doc_id),
      now,
    )
    .await?;
    let perms = access.docs.get(&storage_doc_id).map(|e| e.permissions);
    if !perms.is_some_and(|p| p.doc_read && p.doc_analytics_read) {
      let _ = tx.rollback().await;
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{storage_doc_id}:Doc.Analytics.Read"
      )));
    }
    let is_team = access.is_team;
    let default_days = if is_team { 28 } else { 7 };
    let max_days = if is_team { 90 } else { 7 };
    let requested = window_days.unwrap_or(default_days);
    let effective = requested.clamp(1, max_days);
    let tz = timezone
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .unwrap_or("UTC")
      .to_owned();
    let current_day = now.date_naive();
    let from_day = current_day - chrono::Duration::days(i64::from(effective - 1));
    let rows = sqlx::query(
      r#"WITH days AS (
           SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
         )
         SELECT days.day AS date,
                COALESCE(v.total_views, 0)::bigint AS total_views,
                COALESCE(v.unique_views, 0)::bigint AS unique_views,
                COALESCE(v.guest_views, 0)::bigint AS guest_views,
                v.last_accessed_at
         FROM days
         LEFT JOIN workspace_doc_view_daily v
           ON v.workspace_id = $3 AND v.doc_id = $4 AND v.date = days.day
         ORDER BY days.day ASC"#,
    )
    .bind(from_day)
    .bind(current_day)
    .bind(workspace_id)
    .bind(&storage_doc_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("query doc page analytics: {e}")))?;
    let _ = tx.rollback().await;
    let mut series = Vec::with_capacity(rows.len());
    let mut summary = DocPageAnalyticsSummaryData::default();
    for r in rows {
      let d: chrono::NaiveDate = r.get("date");
      let total_views: i64 = r.get("total_views");
      let unique_views: i64 = r.get("unique_views");
      let guest_views: i64 = r.get("guest_views");
      let last_accessed_at: Option<DateTime<Utc>> = r.get("last_accessed_at");
      summary.total_views += total_views;
      summary.unique_views += unique_views;
      summary.guest_views += guest_views;
      if let Some(ts) = last_accessed_at
        && summary.last_accessed_at.is_none_or(|cur| ts > cur)
      {
        summary.last_accessed_at = Some(ts);
      }
      series.push(DocPageAnalyticsPointData {
        date: d.and_hms_opt(0, 0, 0).expect("midnight valid").and_utc(),
        total_views,
        unique_views,
        guest_views,
      });
    }
    Ok(DocPageAnalyticsData {
      window: AdminTimeWindow {
        from: from_day.and_hms_opt(0, 0, 0).expect("midnight valid").and_utc(),
        to: current_day.and_hms_opt(0, 0, 0).expect("midnight valid").and_utc(),
        timezone: tz,
        bucket: AdminTimeBucket::Day,
        requested_size: requested,
        effective_size: effective,
      },
      series,
      summary,
      generated_at: now,
    })
  }
  /// Returns paginated last-accessed members for a document after enforcing both
  /// `Doc.Read` and `Doc.Analytics.Viewers.Read`.
  #[allow(clippy::too_many_arguments)]
  pub async fn paginate_doc_last_accessed_members(
    &self,
    workspace_id: &str,
    doc_id: &str,
    actor_user_id: &str,
    first: i32,
    offset: i32,
    after: Option<&str>,
    query: Option<&str>,
    include_total: bool,
  ) -> Result<DocMemberLastAccessPage, DomainError> {
    use base64::Engine as _;
    let storage_doc_id = self.resolve_storage_doc_id(workspace_id, doc_id).await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin paginate_doc_last_accessed_members: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("paginate_doc_last_accessed_members clock: {e}")))?;
    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&storage_doc_id),
      now,
    )
    .await?;
    let perms = access.docs.get(&storage_doc_id).map(|e| e.permissions);
    if !perms.is_some_and(|p| p.doc_read && p.doc_analytics_viewers_read) {
      let _ = tx.rollback().await;
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{storage_doc_id}:Doc.Analytics.Viewers.Read"
      )));
    }
    let keyword = query.map(str::trim).filter(|s| !s.is_empty());
    if let Some(kw) = keyword
      && kw.encode_utf16().count() > 255
    {
      let _ = tx.rollback().await;
      return Err(DomainError::Validation("query_too_long:255".to_owned()));
    }
    if after.is_some_and(|a| !a.trim().is_empty()) && offset > 0 {
      let _ = tx.rollback().await;
      return Err(DomainError::Validation(
        "Cannot use both `after` cursor and positive `offset`".to_owned(),
      ));
    }
    let non_team_from = if access.is_team {
      None
    } else {
      let d = now.date_naive() - chrono::Duration::days(6);
      Some(d.and_hms_opt(0, 0, 0).expect("midnight valid").and_utc())
    };
    let clamped_first = first.clamp(1, 50);
    let clamped_offset = offset.max(0);
    let kw_pat = keyword.map(|k| format!("%{k}%"));
    let cursor_pair: Option<(DateTime<Utc>, String)> = match after.filter(|s| !s.trim().is_empty()) {
      Some(raw) => {
        let decoded = base64::engine::general_purpose::STANDARD
          .decode(raw.trim())
          .ok()
          .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
          .or_else(|| serde_json::from_str::<serde_json::Value>(raw.trim()).ok())
          .ok_or_else(|| DomainError::Validation("Invalid pagination cursor".to_owned()))?;
        let ts = decoded
          .get("lastAccessedAt")
          .and_then(|v| v.as_str())
          .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
          .map(|d| d.with_timezone(&Utc))
          .ok_or_else(|| DomainError::Validation("Invalid pagination cursor".to_owned()))?;
        let uid = decoded
          .get("userId")
          .and_then(|v| v.as_str())
          .filter(|s| !s.is_empty())
          .map(ToOwned::to_owned)
          .ok_or_else(|| DomainError::Validation("Invalid pagination cursor".to_owned()))?;
        Some((ts, uid))
      }
      None => None,
    };
    let cursor_ts = cursor_pair.as_ref().map(|(ts, _)| *ts);
    let cursor_uid = cursor_pair.as_ref().map(|(_, uid)| uid.as_str());
    let rows = sqlx::query(
      r#"SELECT mla.user_id, u.name, u.avatar_url, mla.last_accessed_at, mla.last_doc_id
         FROM workspace_member_last_access mla
         JOIN users u ON u.id = mla.user_id
         JOIN workspace_members wm
           ON wm.workspace_id = mla.workspace_id
          AND wm.user_id = mla.user_id
          AND wm.state = 'active'
         WHERE mla.workspace_id = $1
           AND mla.last_doc_id = $2
           AND ($3::timestamptz IS NULL OR mla.last_accessed_at >= $3)
           AND ($4::text IS NULL OR u.name ILIKE $4 OR u.email ILIKE $4)
           AND (
             $5::timestamptz IS NULL
             OR mla.last_accessed_at < $5
             OR (mla.last_accessed_at = $5 AND mla.user_id > $6)
           )
         ORDER BY mla.last_accessed_at DESC, mla.user_id ASC
         LIMIT $7 OFFSET $8"#,
    )
    .bind(workspace_id)
    .bind(&storage_doc_id)
    .bind(non_team_from)
    .bind(&kw_pat)
    .bind(cursor_ts)
    .bind(cursor_uid)
    .bind(i64::from(clamped_first + 1))
    .bind(i64::from(clamped_offset))
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("query doc last accessed members: {e}")))?;
    let total_count = if include_total {
      let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*)::bigint
           FROM workspace_member_last_access mla
           JOIN users u ON u.id = mla.user_id
           JOIN workspace_members wm
             ON wm.workspace_id = mla.workspace_id
            AND wm.user_id = mla.user_id
            AND wm.state = 'active'
           WHERE mla.workspace_id = $1
             AND mla.last_doc_id = $2
             AND ($3::timestamptz IS NULL OR mla.last_accessed_at >= $3)
             AND ($4::text IS NULL OR u.name ILIKE $4 OR u.email ILIKE $4)"#,
      )
      .bind(workspace_id)
      .bind(&storage_doc_id)
      .bind(non_team_from)
      .bind(&kw_pat)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("count doc last accessed members: {e}")))?;
      Some(i32::try_from(total).unwrap_or(i32::MAX))
    } else {
      None
    };
    let _ = tx.rollback().await;
    let first_usize = usize::try_from(clamped_first).unwrap_or(10);
    let has_next_page = rows.len() > first_usize;
    let items: Vec<DocMemberLastAccessItem> = rows
      .into_iter()
      .take(first_usize)
      .map(|r| {
        let user_id: String = r.get("user_id");
        let last_accessed_at: DateTime<Utc> = r.get("last_accessed_at");
        let cursor_json = json!({
          "lastAccessedAt": last_accessed_at.to_rfc3339(),
          "userId": user_id,
        });
        let cursor =
          base64::engine::general_purpose::STANDARD.encode(serde_json::to_string(&cursor_json).unwrap_or_default());
        DocMemberLastAccessItem {
          user: PublicUserView {
            id: user_id,
            name: r.get("name"),
            avatar_url: r.get("avatar_url"),
          },
          last_accessed_at,
          last_doc_id: r.get("last_doc_id"),
          cursor,
        }
      })
      .collect();
    let start_cursor = items.first().map(|i| i.cursor.clone());
    let end_cursor = items.last().map(|i| i.cursor.clone());
    Ok(DocMemberLastAccessPage {
      items,
      has_next_page,
      has_previous_page: after.is_some() || clamped_offset > 0,
      start_cursor,
      end_cursor,
      total_count,
    })
  }
}

async fn load_doc_default_role_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> Result<DocRole, DomainError> {
  let role: String = sqlx::query_scalar(
    r#"SELECT COALESCE(
         (SELECT member_default_role FROM doc_access_policies WHERE workspace_id = $1 AND doc_id = $2),
         (SELECT member_default_doc_role FROM workspace_access_policies WHERE workspace_id = $1),
         'manager'
       )"#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load doc default role: {e}")))?;
  Ok(DocRole::parse(&role))
}

async fn load_doc_roles_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  target_user_ids: &[String],
  lock: bool,
) -> Result<std::collections::BTreeMap<String, DocRole>, DomainError> {
  let query = if lock {
    "SELECT principal_id, role FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND principal_id = ANY($3) ORDER BY principal_id FOR UPDATE"
  } else {
    "SELECT principal_id, role FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND principal_id = ANY($3) ORDER BY principal_id"
  };
  let rows = sqlx::query(query)
    .bind(workspace_id)
    .bind(doc_id)
    .bind(target_user_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load doc roles: {e}")))?;
  let mut map = std::collections::BTreeMap::new();
  for row in rows {
    let uid: String = row.get("principal_id");
    let role: String = row.get("role");
    map.insert(uid, DocRole::parse(&role));
  }
  Ok(map)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn build_public_root_doc_filters_out_private_docs() {
    let root = y_octo::Doc::default();
    let mut meta = root.get_or_create_map("meta").unwrap();
    meta
      .insert("name".to_owned(), y_octo::Any::String("Demo WS".to_owned()))
      .unwrap();
    let mut pages = root.create_array().unwrap();
    for (id, title) in [("pub-1", "Public Page"), ("priv-1", "Top Secret")] {
      let mut p = root.create_map().unwrap();
      p.insert("id".to_owned(), y_octo::Any::String(id.to_owned())).unwrap();
      p.insert("title".to_owned(), y_octo::Any::String(title.to_owned()))
        .unwrap();
      pages.push(p).unwrap();
    }
    meta.insert("pages".to_owned(), pages).unwrap();
    let root_bin = root.encode_update_v1().unwrap();

    let public_bin = build_public_root_doc(&root_bin, &[("pub-1".to_owned(), None)]).unwrap();
    let decoded = y_octo::Doc::try_from_binary_v1(&public_bin).unwrap();
    let out_meta = decoded.get_map("meta").unwrap();
    assert_eq!(
      out_meta.get("name"),
      Some(y_octo::Value::Any(y_octo::Any::String("Demo WS".to_owned())))
    );
    let Some(y_octo::Value::Array(out_pages)) = out_meta.get("pages") else {
      panic!("expected pages array");
    };
    let ids: Vec<String> = out_pages
      .iter()
      .filter_map(|v| match v {
        y_octo::Value::Map(m) => match m.get("id") {
          Some(y_octo::Value::Any(y_octo::Any::String(s))) => Some(s),
          _ => None,
        },
        _ => None,
      })
      .collect();
    assert_eq!(ids, vec!["pub-1".to_owned()]);
    assert!(!String::from_utf8_lossy(&public_bin).contains("Top Secret"));
    assert!(!String::from_utf8_lossy(&public_bin).contains("priv-1"));
  }
}
