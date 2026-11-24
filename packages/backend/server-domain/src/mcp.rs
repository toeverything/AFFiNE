//! Workspace MCP credential lifecycle and document tool helpers.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use base64::Engine as _;
use base64::engine::general_purpose::{STANDARD as BASE64_STANDARD, URL_SAFE_NO_PAD};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore as _;
use serde::{Deserialize, Serialize};
use serde_json::json;
use server_db::{ServerDb, WorkloadTier};
use server_spi::QuotaGate;
use server_types::DomainError;
use sha2::{Digest, Sha256};
use sqlx::Row;
use subtle::ConstantTimeEq as _;
use uuid::Uuid;

use crate::acl::{ReservedDocClass, classify_reserved_doc};
use crate::events::{EventBusPublisher, InvalidationHintV1, InvalidationPublisher};

pub fn is_reserved_doc_id(workspace_id: &str, doc_id: &str) -> bool {
  !matches!(classify_reserved_doc(workspace_id, doc_id), ReservedDocClass::Ordinary)
}
pub const MCP_CREDENTIAL_TOKEN_PREFIX: &str = "aff_mcp_v1";
const ALLOWED_EXPIRATION_DAYS: &[i32] = &[30, 90, 365];
const ROTATION_GRACE_HOURS: i64 = 24;
const EXPIRING_SOON_DAYS: i64 = 7;
const MAX_MD_BYTES: usize = 1_048_576;
const MAX_MD_BLOCKS: usize = 10_000;
const MAX_LIST_DEPTH: usize = 32;
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum McpAccessMode {
  ReadOnly,
  ReadWrite,
}
impl McpAccessMode {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::ReadOnly => "READ_ONLY",
      Self::ReadWrite => "READ_WRITE",
    }
  }
  pub fn parse(raw: &str) -> Self {
    if raw == "READ_WRITE" {
      Self::ReadWrite
    } else {
      Self::ReadOnly
    }
  }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum McpCredentialStatus {
  Active,
  Rotating,
  Expiring,
  Expired,
  Revoked,
}
#[derive(Clone, Debug)]
pub struct McpCredentialView {
  pub id: String,
  pub family_id: String,
  pub generation: i32,
  pub name: String,
  pub workspace_id: String,
  pub user_id: String,
  pub access_mode: McpAccessMode,
  pub fingerprint: String,
  pub created_at: DateTime<Utc>,
  pub expires_at: DateTime<Utc>,
  pub last_used_at: Option<DateTime<Utc>>,
  pub revoked_at: Option<DateTime<Utc>>,
  pub grace_ends_at: Option<DateTime<Utc>>,
  pub status: McpCredentialStatus,
}
#[derive(Clone, Debug)]
pub struct RevealedMcpCredential {
  pub credential: McpCredentialView,
  pub token: String,
}
#[derive(Clone, Debug)]
pub struct AuthenticatedMcpCredential {
  pub id: String,
  pub user_id: String,
  pub workspace_id: String,
  pub access_mode: McpAccessMode,
}
#[derive(Clone, Debug)]
pub struct CreateMcpCredentialParams {
  pub user_id: String,
  pub workspace_id: String,
  pub name: String,
  pub access_mode: McpAccessMode,
  pub expiration_days: i32,
}
fn parse_mcp_token(token: &str) -> Option<(&str, &str)> {
  let mut parts = token.split('.');
  let (prefix, id, secret) = (parts.next()?, parts.next()?, parts.next()?);
  (parts.next().is_none() && prefix == MCP_CREDENTIAL_TOKEN_PREFIX && !id.is_empty() && !secret.is_empty())
    .then_some((id, secret))
}
fn generate_secret() -> (String, String, String) {
  let mut bytes = [0u8; 32];
  rand::rng().fill_bytes(&mut bytes);
  let secret = URL_SAFE_NO_PAD.encode(bytes);
  let secret_hash = hex::encode(Sha256::digest(secret.as_bytes()));
  let fingerprint = secret_hash[..12].to_owned();
  (secret, secret_hash, fingerprint)
}
fn validate_issue_params(name: &str, expiration_days: i32) -> Result<String, DomainError> {
  if !ALLOWED_EXPIRATION_DAYS.contains(&expiration_days) {
    return Err(DomainError::Validation(
      "Unsupported MCP credential expiration".to_owned(),
    ));
  }
  let trimmed = name.trim();
  if trimmed.is_empty() || trimmed.encode_utf16().count() > 64 {
    return Err(DomainError::Validation("MCP credential name is required".to_owned()));
  }
  Ok(trimmed.to_owned())
}
#[derive(Clone)]
pub struct McpCredentialService {
  db: ServerDb,
  event_bus: Arc<dyn EventBusPublisher>,
  quota_gate: Option<Arc<dyn QuotaGate>>,
  invalidation: Option<Arc<dyn InvalidationPublisher>>,
}
impl McpCredentialService {
  pub fn new(db: ServerDb, event_bus: Arc<dyn EventBusPublisher>) -> Self {
    Self {
      db,
      event_bus,
      quota_gate: None,
      invalidation: None,
    }
  }
  pub fn with_quota_gate(mut self, quota_gate: Arc<dyn QuotaGate>) -> Self {
    self.quota_gate = Some(quota_gate);
    self
  }
  pub fn with_invalidation(mut self, invalidation: Arc<dyn InvalidationPublisher>) -> Self {
    self.invalidation = Some(invalidation);
    self
  }
  pub async fn list(&self, user_id: &str, workspace_id: &str) -> Result<Vec<McpCredentialView>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(int_err("acquire mcp list"))?;
    let rows = sqlx::query(
      r#"SELECT id, family_id, generation, name, workspace_id, user_id, access_mode::text AS access_mode,
                fingerprint, created_at, expires_at, last_used_at, revoked_at, grace_ends_at, clock_timestamp() AS db_now
         FROM mcp_credentials WHERE user_id = $1 AND workspace_id = $2 ORDER BY family_id ASC, generation DESC"#,
    )
    .bind(user_id).bind(workspace_id).fetch_all(&mut *conn).await.map_err(int_err("list mcp_credentials"))?;
    let mut seen = HashSet::new();
    let mut views: Vec<_> = rows
      .into_iter()
      .filter(|r| seen.insert(r.get::<String, _>("family_id")))
      .map(|r| {
        let now = r.get("db_now");
        let mut v = row_to_view(r, now);
        if v.status != McpCredentialStatus::Rotating {
          v.grace_ends_at = None;
        }
        v
      })
      .collect();
    views.sort_by_key(|a| std::cmp::Reverse(a.created_at));
    Ok(views)
  }
  pub async fn create(&self, params: CreateMcpCredentialParams) -> Result<RevealedMcpCredential, DomainError> {
    let name = validate_issue_params(&params.name, params.expiration_days)?;
    let id = Uuid::new_v4().to_string();
    let (secret, secret_hash, fingerprint) = generate_secret();
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(int_err("acquire mcp create"))?;
    let row = sqlx::query(
      r#"INSERT INTO mcp_credentials (id, family_id, generation, name, secret_hash, fingerprint,
           user_id, workspace_id, access_mode, created_at, expires_at, grace_ends_at)
         VALUES ($1, $1, 0, $2, $3, $4, $5, $6, $7::text::"McpAccessMode", clock_timestamp(),
                 clock_timestamp() + make_interval(days => $8), NULL)
         RETURNING id, family_id, generation, name, workspace_id, user_id, access_mode::text AS access_mode,
                   fingerprint, created_at, expires_at, last_used_at, revoked_at, grace_ends_at, clock_timestamp() AS db_now"#,
    )
    .bind(&id).bind(&name).bind(&secret_hash).bind(&fingerprint).bind(&params.user_id)
    .bind(&params.workspace_id).bind(params.access_mode.as_str()).bind(params.expiration_days)
    .fetch_one(&mut *conn).await.map_err(int_err("insert mcp_credential"))?;
    let db_now = row.get("db_now");
    let view = row_to_view(row, db_now);
    let _ = self
      .event_bus
      .publish_event(
        "mcp.credential.created",
        json!({ "credentialId": view.id, "userId": params.user_id, "workspaceId": params.workspace_id }),
        None,
      )
      .await;
    Ok(RevealedMcpCredential {
      token: format!("{MCP_CREDENTIAL_TOKEN_PREFIX}.{id}.{secret}"),
      credential: view,
    })
  }
  async fn lock_family_in(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    id: &str,
    user_id: &str,
    workspace_id: &str,
  ) -> Result<Option<String>, DomainError> {
    let family_id: Option<String> =
      sqlx::query_scalar("SELECT family_id FROM mcp_credentials WHERE id = $1 AND user_id = $2 AND workspace_id = $3")
        .bind(id)
        .bind(user_id)
        .bind(workspace_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(int_err("lookup mcp family"))?;
    if let Some(ref fid) = family_id {
      let _: Vec<String> =
        sqlx::query_scalar("SELECT id FROM mcp_credentials WHERE family_id = $1 ORDER BY generation ASC FOR UPDATE")
          .bind(fid)
          .fetch_all(&mut **tx)
          .await
          .map_err(int_err("lock mcp family"))?;
    }
    Ok(family_id)
  }
  pub async fn rotate(
    &self,
    id: &str,
    user_id: &str,
    workspace_id: &str,
    expiration_days: i32,
  ) -> Result<RevealedMcpCredential, DomainError> {
    if !ALLOWED_EXPIRATION_DAYS.contains(&expiration_days) {
      return Err(DomainError::Validation(
        "Unsupported MCP credential expiration".to_owned(),
      ));
    }
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(int_err("begin mcp rotate"))?;
    let Some(family_id) = Self::lock_family_in(tx.tx_mut(), id, user_id, workspace_id).await? else {
      return Err(DomainError::Validation("MCP credential not found".to_owned()));
    };
    let Some(current) = sqlx::query(
      r#"SELECT id, family_id, generation, name, access_mode::text AS access_mode,
                expires_at, revoked_at, replaced_by_id, clock_timestamp() AS db_now
         FROM mcp_credentials WHERE id = $1 AND user_id = $2 AND workspace_id = $3"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(int_err("reload mcp"))?
    else {
      return Err(DomainError::Validation("MCP credential not found".to_owned()));
    };
    let now: DateTime<Utc> = current.get("db_now");
    let current_expires_at: DateTime<Utc> = current.get("expires_at");
    if current.get::<Option<DateTime<Utc>>, _>("revoked_at").is_some()
      || current.get::<Option<String>, _>("replaced_by_id").is_some()
      || current_expires_at <= now
    {
      return Err(DomainError::Validation("MCP credential not found".to_owned()));
    }
    let grace_end = current_expires_at.min(now + Duration::hours(ROTATION_GRACE_HOURS));
    let new_id = Uuid::new_v4().to_string();
    let (secret, secret_hash, fingerprint) = generate_secret();
    let inserted = sqlx::query(
      r#"INSERT INTO mcp_credentials (id, family_id, generation, name, secret_hash, fingerprint,
           user_id, workspace_id, access_mode, created_at, expires_at, grace_ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::"McpAccessMode", $10, $11, $12)
         RETURNING id, family_id, generation, name, workspace_id, user_id, access_mode::text AS access_mode,
                   fingerprint, created_at, expires_at, last_used_at, revoked_at, grace_ends_at"#,
    )
    .bind(&new_id)
    .bind(&family_id)
    .bind(current.get::<i32, _>("generation") + 1)
    .bind(current.get::<String, _>("name"))
    .bind(&secret_hash)
    .bind(&fingerprint)
    .bind(user_id)
    .bind(workspace_id)
    .bind(current.get::<String, _>("access_mode"))
    .bind(now)
    .bind(now + Duration::days(i64::from(expiration_days)))
    .bind(grace_end)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(int_err("insert rotated mcp"))?;
    let replaced = sqlx::query(
      "UPDATE mcp_credentials SET replaced_by_id = $4, expires_at = $5 WHERE id = $1 AND user_id = $2 AND workspace_id = $3 AND revoked_at IS NULL AND replaced_by_id IS NULL",
    )
    .bind(id).bind(user_id).bind(workspace_id).bind(&new_id).bind(grace_end)
    .execute(&mut **tx.tx_mut()).await.map_err(int_err("update replaced mcp"))?;
    if replaced.rows_affected() != 1 {
      return Err(DomainError::Validation("MCP credential not found".to_owned()));
    }
    tx.commit().await.map_err(int_err("commit mcp rotate"))?;
    let view = row_to_view(inserted, now);
    let _ = self
      .event_bus
      .publish_event(
        "mcp.credential.rotated",
        json!({ "credentialId": id, "replacedById": view.id, "userId": user_id, "workspaceId": workspace_id }),
        None,
      )
      .await;
    Ok(RevealedMcpCredential {
      token: format!("{MCP_CREDENTIAL_TOKEN_PREFIX}.{new_id}.{secret}"),
      credential: view,
    })
  }
  pub async fn revoke(&self, id: &str, user_id: &str, workspace_id: &str) -> Result<bool, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(int_err("begin mcp revoke"))?;
    let Some(family_id) = Self::lock_family_in(tx.tx_mut(), id, user_id, workspace_id).await? else {
      return Ok(false);
    };
    let result = sqlx::query(
      "UPDATE mcp_credentials SET revoked_at = clock_timestamp() WHERE family_id = $1 AND user_id = $2 AND workspace_id = $3 AND revoked_at IS NULL",
    )
    .bind(&family_id).bind(user_id).bind(workspace_id).execute(&mut **tx.tx_mut()).await.map_err(int_err("revoke mcp"))?;
    tx.commit().await.map_err(int_err("commit mcp revoke"))?;
    let revoked = result.rows_affected() > 0;
    if revoked {
      let _ = self
        .event_bus
        .publish_event(
          "mcp.credential.revoked",
          json!({ "credentialId": id, "userId": user_id, "workspaceId": workspace_id }),
          None,
        )
        .await;
    }
    Ok(revoked)
  }
  pub async fn authenticate(&self, token: &str, workspace_id: &str) -> Result<AuthenticatedMcpCredential, DomainError> {
    let unauth = || DomainError::Unauthorized("Authentication failed".to_owned());
    let Some((id, secret)) = parse_mcp_token(token) else {
      return Err(unauth());
    };
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(int_err("acquire mcp auth"))?;
    let row = sqlx::query(
      r#"SELECT c.id, c.user_id, c.workspace_id, c.secret_hash, c.access_mode::text AS access_mode,
                (c.last_used_at IS NULL OR c.last_used_at < clock_timestamp() - interval '5 minutes') AS needs_touch
         FROM mcp_credentials c JOIN users u ON u.id = c.user_id
         WHERE c.id = $1 AND c.workspace_id = $2 AND c.revoked_at IS NULL AND c.expires_at > clock_timestamp() AND u.disabled = false"#,
    )
    .bind(id).bind(workspace_id).fetch_optional(&mut *conn).await.map_err(int_err("auth mcp"))?;
    drop(conn);
    let Some(row) = row else {
      return Err(unauth());
    };
    let stored_hash: String = row.get("secret_hash");
    let actual_hash = hex::encode(Sha256::digest(secret.as_bytes()));
    if stored_hash.len() != actual_hash.len() || !bool::from(stored_hash.as_bytes().ct_eq(actual_hash.as_bytes())) {
      return Err(unauth());
    }
    let cred = AuthenticatedMcpCredential {
      id: row.get("id"),
      user_id: row.get("user_id"),
      workspace_id: row.get("workspace_id"),
      access_mode: McpAccessMode::parse(row.get::<String, _>("access_mode").as_str()),
    };
    if row.get::<bool, _>("needs_touch")
      && let Ok(mut wconn) = self.db.acquire_tiered(WorkloadTier::InteractiveWrite).await
    {
      let _ = sqlx::query(
        "UPDATE mcp_credentials SET last_used_at = clock_timestamp() WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < clock_timestamp() - interval '5 minutes')",
      )
      .bind(&cred.id).execute(&mut *wconn).await;
    }
    Ok(cred)
  }
  pub async fn read_document_title_and_markdown(
    &self,
    workspace_id: &str,
    doc_id: &str,
  ) -> Result<Option<(Option<String>, String)>, DomainError> {
    if is_reserved_doc_id(workspace_id, doc_id) {
      return Err(DomainError::Validation(
        "Reserved document cannot be accessed.".to_owned(),
      ));
    }
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(int_err("acquire read_doc"))?;
    Ok(
      load_and_merge_doc_exec(&mut conn, workspace_id, doc_id)
        .await?
        .map(|m| extract_title_and_markdown_from_yjs(&m)),
    )
  }
  pub async fn read_document_markdown(&self, workspace_id: &str, doc_id: &str) -> Result<Option<String>, DomainError> {
    Ok(
      self
        .read_document_title_and_markdown(workspace_id, doc_id)
        .await?
        .map(|(_, md)| md),
    )
  }
  pub async fn load_page_titles(
    &self,
    workspace_id: &str,
    page_ids: &[String],
  ) -> Result<HashMap<String, String>, DomainError> {
    if page_ids.is_empty() {
      return Ok(HashMap::new());
    }
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(int_err("acquire load_page_titles"))?;
    let rows = sqlx::query_as::<_, (String, Option<String>)>(
      "SELECT page_id, title FROM workspace_pages WHERE workspace_id = $1 AND page_id = ANY($2)",
    )
    .bind(workspace_id)
    .bind(page_ids)
    .fetch_all(&mut *conn)
    .await
    .map_err(int_err("load page titles"))?;
    Ok(rows.into_iter().filter_map(|(pid, t)| t.map(|t| (pid, t))).collect())
  }
  async fn assert_workspace_writable_in(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    workspace_id: &str,
  ) -> Result<(), DomainError> {
    let Some(ref quota_gate) = self.quota_gate else {
      return Ok(());
    };
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx)
      .await
      .map_err(int_err("pg clock"))?;
    if crate::doc_sharing::DocSharingService::is_workspace_readonly_in(tx, quota_gate.as_ref(), workspace_id, now)
      .await?
    {
      return Err(DomainError::QuotaExceeded {
        kind: "seat_limit",
        message: "workspace is in fail-closed readonly state".to_owned(),
      });
    }
    Ok(())
  }
  async fn notify_doc_updates(&self, workspace_id: &str, user_id: &str, updates: Vec<(String, Vec<u8>)>) {
    let ts = Utc::now().timestamp_millis();
    for (doc_id, delta) in updates.into_iter().filter(|(_, d)| !d.is_empty()) {
      let req_id = Uuid::new_v4().to_string();
      let payload = json!({
        "compressed": false, "docId": doc_id, "editor": user_id, "originChannel": "mcp",
        "spaceId": workspace_id, "spaceType": "workspace", "timestamp": ts,
        "updates": [BASE64_STANDARD.encode(&delta)],
      });
      let _ = self
        .event_bus
        .publish_event("sync.doc.updates.pushed", payload, Some(&req_id))
        .await;
      if let Some(ref inv) = self.invalidation {
        let hint = InvalidationHintV1::WorkspaceInventoryChanged {
          workspace_id: workspace_id.to_owned(),
          doc_id: Some(doc_id),
        };
        let _ = inv.publish_invalidation(&hint).await;
      }
    }
  }
  pub async fn create_document(
    &self,
    workspace_id: &str,
    title: &str,
    body_markdown: &str,
    user_id: &str,
    explicit_doc_id: Option<&str>,
  ) -> Result<String, DomainError> {
    let doc_id = match explicit_doc_id {
      Some(id) if is_reserved_doc_id(workspace_id, id) => {
        return Err(DomainError::Validation("Invalid document ID.".to_owned()));
      }
      Some(id) => id.to_owned(),
      None => Uuid::new_v4().to_string(),
    };
    let is_recover = explicit_doc_id.is_some();
    let new_blob = if !is_recover {
      let (t, b) = (title.to_owned(), strip_leading_h1(body_markdown).to_owned());
      Some(
        tokio::task::spawn_blocking(move || build_yjs_doc_binary(&t, &b))
          .await
          .map_err(int_err("join build doc"))??,
      )
    } else {
      None
    };
    let props_doc_id = format!("db${workspace_id}$docProperties");
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(int_err("begin create_document"))?;
    self.assert_workspace_writable_in(tx.tx_mut(), workspace_id).await?;
    lock_workspace_docs_ordered(tx.tx_mut(), workspace_id, &[&doc_id, workspace_id, &props_doc_id]).await?;
    let mut pushed = Vec::new();
    let (effective_title, prop_creator, prop_editor) = if is_recover {
      let Some(existing) = load_and_merge_doc_exec(tx.tx_mut(), workspace_id, &doc_id).await? else {
        return Err(DomainError::NotFound(format!("Doc with id {doc_id} not found.")));
      };
      let (creator, editor) = resolve_recover_authors_in(tx.tx_mut(), workspace_id, &doc_id).await?;
      let t = extract_title_from_yjs(&existing)
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| title.to_owned());
      (t, creator, editor)
    } else {
      let blob = new_blob.unwrap_or_default();
      sqlx::query(
        r#"INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by)
           VALUES ($1, $2, $3, octet_length($3), clock_timestamp(), clock_timestamp(), $4, $4)"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(&blob)
      .bind(user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(int_err("insert mcp document snapshot"))?;
      pushed.push((doc_id.clone(), blob));
      (title.to_owned(), Some(user_id.to_owned()), Some(user_id.to_owned()))
    };
    let now_ms = Utc::now().timestamp_millis();
    if !is_doc_lifecycle_active_in(tx.tx_mut()).await?
      && let Some(rd) = upsert_root_doc_page_in(
        tx.tx_mut(),
        workspace_id,
        &doc_id,
        &effective_title,
        user_id,
        now_ms,
        true,
      )
      .await?
    {
      pushed.push((workspace_id.to_owned(), rd));
    }
    if let Some(pd) = upsert_doc_properties_in(
      tx.tx_mut(),
      workspace_id,
      &props_doc_id,
      &doc_id,
      user_id,
      prop_creator.as_deref(),
      prop_editor.as_deref(),
      !is_recover,
      is_recover,
    )
    .await?
    {
      pushed.push((props_doc_id, pd));
    }
    upsert_workspace_page_in(tx.tx_mut(), workspace_id, &doc_id, &effective_title).await?;
    tx.commit().await.map_err(int_err("commit create_document"))?;
    self.notify_doc_updates(workspace_id, user_id, pushed).await;
    Ok(doc_id)
  }
  async fn update_doc_in_place(
    &self,
    workspace_id: &str,
    doc_id: &str,
    user_id: &str,
    new_title: Option<&str>,
    mutate: impl FnOnce(Vec<u8>) -> Result<Vec<u8>, DomainError> + Send + 'static,
  ) -> Result<bool, DomainError> {
    if is_reserved_doc_id(workspace_id, doc_id) {
      return Err(DomainError::Validation(
        "Reserved document cannot be updated.".to_owned(),
      ));
    }
    let props_doc_id = format!("db${workspace_id}$docProperties");
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(int_err("begin mcp doc update"))?;
    self.assert_workspace_writable_in(tx.tx_mut(), workspace_id).await?;
    let lock_ids: Vec<&str> = if new_title.is_some() {
      vec![doc_id, workspace_id, &props_doc_id]
    } else {
      vec![doc_id, &props_doc_id]
    };
    lock_workspace_docs_ordered(tx.tx_mut(), workspace_id, &lock_ids).await?;
    let Some(merged) = load_and_merge_doc_exec(tx.tx_mut(), workspace_id, doc_id).await? else {
      return Ok(false);
    };
    let delta = tokio::task::spawn_blocking(move || mutate(merged))
      .await
      .map_err(int_err("join mutate doc"))??;
    let mut pushed = Vec::new();
    if !delta.is_empty() {
      append_doc_update_in(tx.tx_mut(), workspace_id, doc_id, &delta, user_id).await?;
      pushed.push((doc_id.to_owned(), delta));
    }
    if let Some(title) = new_title {
      let now_ms = Utc::now().timestamp_millis();
      if !is_doc_lifecycle_active_in(tx.tx_mut()).await?
        && let Some(rd) =
          upsert_root_doc_page_in(tx.tx_mut(), workspace_id, doc_id, title, user_id, now_ms, false).await?
      {
        pushed.push((workspace_id.to_owned(), rd));
      }
      upsert_workspace_page_in(tx.tx_mut(), workspace_id, doc_id, title).await?;
    }
    if let Some(pd) = upsert_doc_properties_in(
      tx.tx_mut(),
      workspace_id,
      &props_doc_id,
      doc_id,
      user_id,
      None,
      Some(user_id),
      false,
      false,
    )
    .await?
    {
      pushed.push((props_doc_id, pd));
    }
    tx.commit().await.map_err(int_err("commit mcp doc update"))?;
    self.notify_doc_updates(workspace_id, user_id, pushed).await;
    Ok(true)
  }
  pub async fn update_document(
    &self,
    workspace_id: &str,
    doc_id: &str,
    body_markdown: &str,
    user_id: &str,
  ) -> Result<bool, DomainError> {
    let body = body_markdown.to_owned();
    self
      .update_doc_in_place(workspace_id, doc_id, user_id, None, move |m| {
        mutate_doc_body_delta(&m, &body)
      })
      .await
  }
  pub async fn update_document_title(
    &self,
    workspace_id: &str,
    doc_id: &str,
    title: &str,
    user_id: &str,
  ) -> Result<bool, DomainError> {
    let t = title.to_owned();
    self
      .update_doc_in_place(workspace_id, doc_id, user_id, Some(title), move |m| {
        mutate_doc_title_delta(&m, &t)
      })
      .await
  }
}
fn y_err<E: std::fmt::Display>(err: E) -> DomainError {
  DomainError::Internal(format!("y-octo: {err}"))
}
fn db_err<E: std::fmt::Display>(err: E) -> DomainError {
  DomainError::Internal(format!("mcp db: {err}"))
}
fn int_err<E: std::fmt::Display>(ctx: &'static str) -> impl FnOnce(E) -> DomainError {
  move |err| DomainError::Internal(format!("{ctx}: {err}"))
}
pub fn clamp_throttle_tracker(tracker: &str) -> String {
  if tracker.len() <= 256 {
    tracker.to_owned()
  } else {
    format!("sha256:{}", hex::encode(Sha256::digest(tracker.as_bytes())))
  }
}
async fn resolve_recover_authors_in(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  ws: &str,
  doc: &str,
) -> Result<(Option<String>, Option<String>), DomainError> {
  let has_tbl: bool = sqlx::query_scalar("SELECT to_regclass('public.runtime_doc_creators') IS NOT NULL")
    .fetch_one(&mut **tx)
    .await
    .map_err(db_err)?;
  let recorded: Option<(Option<String>,)> = if has_tbl {
    sqlx::query_as("SELECT created_by FROM runtime_doc_creators WHERE workspace_id = $1 AND doc_id = $2")
      .bind(ws)
      .bind(doc)
      .fetch_optional(&mut **tx)
      .await
      .map_err(db_err)?
  } else {
    None
  };
  let (has_snap, first_upd, latest_ed): (bool, Option<String>, Option<String>) = sqlx::query_as(
    "SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$1 AND guid=$2), (SELECT created_by FROM updates WHERE workspace_id=$1 AND guid=$2 ORDER BY created_at ASC LIMIT 1), (SELECT editor FROM (SELECT updated_at AS ts, 1 AS ord, updated_by AS editor FROM snapshots WHERE workspace_id=$1 AND guid=$2 UNION ALL SELECT created_at AS ts, 2 AS ord, created_by AS editor FROM updates WHERE workspace_id=$1 AND guid=$2) t ORDER BY ts DESC, ord DESC LIMIT 1)",
  )
  .bind(ws)
  .bind(doc)
  .fetch_one(&mut **tx)
  .await
  .map_err(db_err)?;
  let creator = match recorded {
    Some((c,)) => c,
    None if has_snap => None,
    None => first_upd,
  };
  Ok((creator.clone(), latest_ed.or(creator)))
}
async fn is_doc_lifecycle_active_in(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<bool, DomainError> {
  if !sqlx::query_scalar::<_, bool>("SELECT to_regclass('public.storage_reconciliation_checkpoints') IS NOT NULL")
    .fetch_one(&mut **tx)
    .await
    .map_err(db_err)?
  {
    return Ok(false);
  }
  sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle_activation' AND scope = 'global' AND status = 'active')",
  )
  .fetch_one(&mut **tx)
  .await
  .map_err(db_err)
}
fn strip_leading_h1(content: &str) -> &str {
  let trimmed = content.trim_start_matches([' ', '\t']);
  if content.len() - trimmed.len() <= 3
    && let Some(after_hash) = trimmed.strip_prefix('#')
    && after_hash.starts_with([' ', '\t'])
  {
    return after_hash
      .split_once('\n')
      .map_or("", |(_, r)| r.trim_start_matches('\n'));
  }
  content
}
async fn lock_workspace_docs_ordered(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  ws: &str,
  doc_ids: &[&str],
) -> Result<(), DomainError> {
  let q = sqlx::query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))");
  q.bind(format!("storage-workspace:{ws}"))
    .execute(&mut **tx)
    .await
    .map_err(db_err)?;
  let mut sorted: Vec<&str> = doc_ids.to_vec();
  sorted.sort_unstable();
  sorted.dedup();
  for id in sorted {
    let lq = sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))");
    lq.bind(format!("workspace-doc-update:{ws}/{id}"))
      .execute(&mut **tx)
      .await
      .map_err(db_err)?;
  }
  Ok(())
}
fn merge_snapshot_and_updates(snap: Option<Vec<u8>>, upds: Vec<Vec<u8>>) -> Result<Option<Vec<u8>>, DomainError> {
  if snap.is_none() && upds.is_empty() {
    return Ok(None);
  }
  let mut parts: Vec<Vec<u8>> = snap.into_iter().chain(upds).filter(|b| !b.is_empty()).collect();
  match parts.len() {
    0 => Ok(Some(Vec::new())),
    1 => Ok(Some(parts.pop().unwrap_or_default())),
    _ => Ok(Some(
      y_octo::merge_updates_v1(&parts)
        .and_then(|u| u.encode_v1())
        .map_err(y_err)?,
    )),
  }
}
async fn load_and_merge_doc_exec(
  conn: &mut sqlx::PgConnection,
  ws: &str,
  doc: &str,
) -> Result<Option<Vec<u8>>, DomainError> {
  let sq = sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2");
  let snapshot: Option<Vec<u8>> = sq.bind(ws).bind(doc).fetch_optional(&mut *conn).await.map_err(db_err)?;
  let uq = sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC");
  let updates: Vec<Vec<u8>> = uq.bind(ws).bind(doc).fetch_all(&mut *conn).await.map_err(db_err)?;
  merge_snapshot_and_updates(snapshot, updates)
}
async fn append_doc_update_in(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  ws: &str,
  doc: &str,
  delta: &[u8],
  uid: &str,
) -> Result<(), DomainError> {
  let q = sqlx::query(
    "INSERT INTO updates (workspace_id, guid, blob, created_at, created_by) VALUES ($1, $2, $3, clock_timestamp(), $4)",
  );
  q.bind(ws)
    .bind(doc)
    .bind(delta)
    .bind(uid)
    .execute(&mut **tx)
    .await
    .map_err(db_err)?;
  Ok(())
}
async fn open_system_doc_in(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> Result<(bool, y_octo::Doc, Option<Vec<u8>>), DomainError> {
  let existing = load_and_merge_doc_exec(tx, workspace_id, doc_id).await?;
  let existed = existing.is_some();
  let (doc, sv) = match existing {
    Some(ref b) if !b.is_empty() => (
      y_octo::Doc::try_from_binary_v1(b).map_err(y_err)?,
      Some(y_octo::encode_state_vector_from_update_v1(b).map_err(y_err)?),
    ),
    _ => (y_octo::Doc::new(), None),
  };
  Ok((existed, doc, sv))
}
fn diff_yjs_v1(full: &[u8], before_sv: &[u8], ctx: &'static str) -> Result<Vec<u8>, DomainError> {
  let d = y_octo::diff_update_v1(full, before_sv).map_err(int_err(ctx))?;
  Ok(if d == [0, 0] { Vec::new() } else { d })
}
async fn finish_system_doc_in(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
  doc_id: &str,
  existed: bool,
  doc: &y_octo::Doc,
  before_sv: Option<&[u8]>,
  user_id: &str,
) -> Result<Option<Vec<u8>>, DomainError> {
  let full = doc.encode_update_v1().map_err(y_err)?;
  let delta = match before_sv {
    Some(sv) => diff_yjs_v1(&full, sv, "diff system doc")?,
    None => full,
  };
  if delta.is_empty() {
    return Ok(None);
  }
  if existed {
    append_doc_update_in(tx, workspace_id, doc_id, &delta, user_id).await?;
  } else {
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by) VALUES ($1, $2, $3, octet_length($3), clock_timestamp(), clock_timestamp(), $4, $4) ON CONFLICT (workspace_id, guid) DO NOTHING",
    )
    .bind(workspace_id).bind(doc_id).bind(&delta).bind(user_id).execute(&mut **tx).await.map_err(int_err("insert sys snapshot"))?;
  }
  Ok(Some(delta))
}
async fn upsert_root_doc_page_in(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
  doc_id: &str,
  title: &str,
  user_id: &str,
  now_ms: i64,
  allow_insert: bool,
) -> Result<Option<Vec<u8>>, DomainError> {
  use y_octo::{Any, Value};

  let (existed, doc, before_sv) = open_system_doc_in(tx, workspace_id, workspace_id).await?;
  if !allow_insert && !existed {
    return Ok(None);
  }
  let mut meta = doc
    .get_or_create_map("meta")
    .map_err(|_| DomainError::Validation("root doc meta is not a Y.Map".to_owned()))?;
  let mut pages = match meta.get("pages") {
    Some(Value::Array(arr)) => arr,
    Some(_) => {
      return Err(DomainError::Validation(
        "root doc meta.pages is not a Y.Array".to_owned(),
      ));
    }
    None if !allow_insert => return Ok(None),
    None => {
      meta
        .insert("pages".to_owned(), doc.create_array().map_err(y_err)?)
        .map_err(y_err)?;
      let Some(Value::Array(arr)) = meta.get("pages") else {
        return Ok(None);
      };
      arr
    }
  };
  let (mut found, mut mutated) = (false, false);
  for idx in 0..pages.len() {
    match pages.get(idx) {
      Some(Value::Map(mut page)) if map_str(&page, "id").as_deref() == Some(doc_id) => {
        found = true;
        if map_str(&page, "title").as_deref() != Some(title) {
          set_str(&mut page, "title", title)?;
          mutated = true;
        }
        break;
      }
      Some(Value::Any(Any::Object(obj))) if matches!(obj.get("id"), Some(Any::String(s)) if s == doc_id) => {
        found = true;
        break;
      }
      _ => {}
    }
  }
  if !found {
    if !allow_insert {
      return Ok(None);
    }
    let mut entry = doc.create_map().map_err(y_err)?;
    set_str(&mut entry, "id", doc_id)?;
    set_str(&mut entry, "title", title)?;
    entry
      .insert("createDate".to_owned(), Any::from(now_ms as f64))
      .map_err(y_err)?;
    entry
      .insert("tags".to_owned(), doc.create_array().map_err(y_err)?)
      .map_err(y_err)?;
    pages.insert(pages.len(), entry).map_err(y_err)?;
    mutated = true;
  }
  if !mutated {
    return Ok(None);
  }
  finish_system_doc_in(
    tx,
    workspace_id,
    workspace_id,
    existed,
    &doc,
    before_sv.as_deref(),
    user_id,
  )
  .await
}
#[allow(clippy::too_many_arguments)]
async fn upsert_doc_properties_in(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  ws: &str,
  props_id: &str,
  doc_id: &str,
  actor: &str,
  creator: Option<&str>,
  editor: Option<&str>,
  is_create: bool,
  is_recover: bool,
) -> Result<Option<Vec<u8>>, DomainError> {
  let (existed, doc, before_sv) = open_system_doc_in(tx, ws, props_id).await?;
  let mut entry = doc.get_or_create_map(doc_id).map_err(y_err)?;
  let mut mutated = false;
  if map_str(&entry, "id").as_deref() != Some(doc_id) {
    set_str(&mut entry, "id", doc_id)?;
    mutated = true;
  }
  if (is_create || is_recover)
    && entry.get("createdBy").is_none()
    && let Some(c) = creator
  {
    set_str(&mut entry, "createdBy", c)?;
    mutated = true;
  }
  if let Some(e) = editor
    && ((is_recover && entry.get("updatedBy").is_none())
      || (!is_recover && map_str(&entry, "updatedBy").as_deref() != Some(e)))
  {
    set_str(&mut entry, "updatedBy", e)?;
    mutated = true;
  }
  if !mutated {
    return Ok(None);
  }
  finish_system_doc_in(tx, ws, props_id, existed, &doc, before_sv.as_deref(), actor).await
}
async fn upsert_workspace_page_in(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  ws: &str,
  doc_id: &str,
  title: &str,
) -> Result<(), DomainError> {
  sqlx::query(
    "INSERT INTO workspace_pages (workspace_id, page_id, mode, blocked, title) VALUES ($1, $2, 0, false, $3) ON CONFLICT (workspace_id, page_id) DO UPDATE SET title = EXCLUDED.title",
  )
  .bind(ws).bind(doc_id).bind(title).execute(&mut **tx).await.map_err(db_err)?;
  Ok(())
}
fn row_to_view(row: sqlx::postgres::PgRow, now: DateTime<Utc>) -> McpCredentialView {
  let access_mode_str: String = row.get("access_mode");
  let expires_at: DateTime<Utc> = row.get("expires_at");
  let revoked_at: Option<DateTime<Utc>> = row.get("revoked_at");
  let grace_ends_at: Option<DateTime<Utc>> = row.get("grace_ends_at");
  let status = if revoked_at.is_some() {
    McpCredentialStatus::Revoked
  } else if expires_at <= now {
    McpCredentialStatus::Expired
  } else if grace_ends_at.is_some_and(|g| g > now) {
    McpCredentialStatus::Rotating
  } else if expires_at - now <= Duration::days(EXPIRING_SOON_DAYS) {
    McpCredentialStatus::Expiring
  } else {
    McpCredentialStatus::Active
  };
  McpCredentialView {
    id: row.get("id"),
    family_id: row.get("family_id"),
    generation: row.get("generation"),
    name: row.get("name"),
    workspace_id: row.get("workspace_id"),
    user_id: row.get("user_id"),
    access_mode: McpAccessMode::parse(&access_mode_str),
    fingerprint: row.get("fingerprint"),
    created_at: row.get("created_at"),
    expires_at,
    last_used_at: row.get("last_used_at"),
    revoked_at,
    grace_ends_at,
    status,
  }
}
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
enum MarkdownBlock {
  Paragraph(&'static str, String),
  List(&'static str, Option<bool>, String, Vec<MarkdownBlock>),
  Code(String, String),
  Divider,
  Image(String, String),
}
impl MarkdownBlock {
  fn flavour(&self) -> &'static str {
    match self {
      Self::Paragraph(..) => "affine:paragraph",
      Self::List(..) => "affine:list",
      Self::Code(..) => "affine:code",
      Self::Divider => "affine:divider",
      Self::Image(..) => "affine:image",
    }
  }
}
fn parse_list_line(line: &str) -> Option<(usize, &'static str, Option<bool>, String)> {
  let indent = line.bytes().take_while(|&b| b == b' ' || b == b'\t').count();
  let t = &line[indent..];
  if let Some(r) = t.strip_prefix("- [x] ").or_else(|| t.strip_prefix("- [X] ")) {
    return Some((indent, "todo", Some(true), r.to_owned()));
  }
  if let Some(r) = t.strip_prefix("- [ ] ") {
    return Some((indent, "todo", Some(false), r.to_owned()));
  }
  if let Some(r) = t.strip_prefix("- ").or_else(|| t.strip_prefix("* ")) {
    return Some((indent, "bulleted", None, r.to_owned()));
  }
  let (num, rest) = t.split_once(". ")?;
  (!num.is_empty() && num.bytes().all(|b| b.is_ascii_digit())).then(|| (indent, "numbered", None, rest.to_owned()))
}
fn would_trigger_md_block(line: &str) -> bool {
  let t = line.trim();
  let h = t.bytes().take_while(|&b| b == b'#').count();
  t.is_empty()
    || parse_list_line(line).is_some()
    || t.starts_with("```")
    || matches!(t, "---" | "***" | "___")
    || t
      .strip_prefix("![")
      .and_then(|r| r.split_once("]("))
      .is_some_and(|(_, tail)| tail.strip_suffix(')').is_some_and(|s| !s.is_empty()))
    || ((1..=6).contains(&h) && t.as_bytes().get(h) == Some(&b' '))
    || t.starts_with("> ")
}
fn push_list_item(
  out: &mut Vec<MarkdownBlock>,
  stack: &mut Vec<(usize, usize)>,
  indent: usize,
  item: MarkdownBlock,
) -> Result<(), DomainError> {
  while stack.last().is_some_and(|&(top, _)| indent <= top) {
    stack.pop();
  }
  if stack.len() >= MAX_LIST_DEPTH {
    return Err(DomainError::Validation(
      "Markdown list nesting exceeds depth limit.".into(),
    ));
  }
  let mut cursor: &mut Vec<MarkdownBlock> = out;
  for &(_, idx) in stack.iter() {
    let MarkdownBlock::List(_, _, _, children) = &mut cursor[idx] else {
      return Ok(());
    };
    cursor = children;
  }
  let idx = cursor.len();
  cursor.push(item);
  stack.push((indent, idx));
  Ok(())
}
fn count_md_blocks(blocks: &[MarkdownBlock]) -> usize {
  blocks
    .iter()
    .map(|b| match b {
      MarkdownBlock::List(_, _, _, ch) => 1 + count_md_blocks(ch),
      _ => 1,
    })
    .sum()
}
fn parse_markdown_checked(markdown: &str) -> Result<Vec<MarkdownBlock>, DomainError> {
  if markdown.len() > MAX_MD_BYTES {
    return Err(DomainError::Validation("Markdown content exceeds size limit.".into()));
  }
  let blocks = parse_markdown_blocks(markdown)?;
  if count_md_blocks(&blocks) > MAX_MD_BLOCKS {
    return Err(DomainError::Validation("Markdown content exceeds block limit.".into()));
  }
  Ok(blocks)
}
fn parse_markdown_blocks(markdown: &str) -> Result<Vec<MarkdownBlock>, DomainError> {
  let mut out = Vec::new();
  let mut lines = markdown.lines();
  let mut para: Vec<&str> = Vec::new();
  let mut stack: Vec<(usize, usize)> = Vec::new();
  let flush = |p: &mut Vec<&str>, o: &mut Vec<MarkdownBlock>| {
    if !p.is_empty() {
      o.push(MarkdownBlock::Paragraph("text", p.join("\n")));
      p.clear();
    }
  };
  while let Some(line) = lines.next() {
    let t = line.trim();
    if let Some((indent, kind, checked, text)) = parse_list_line(line) {
      flush(&mut para, &mut out);
      push_list_item(
        &mut out,
        &mut stack,
        indent,
        MarkdownBlock::List(kind, checked, text, Vec::new()),
      )?;
      continue;
    }
    stack.clear();
    if t.is_empty() {
      flush(&mut para, &mut out);
    } else if let Some(fence) = t.strip_prefix("```") {
      flush(&mut para, &mut out);
      let code: Vec<&str> = lines.by_ref().take_while(|cl| !cl.trim().starts_with("```")).collect();
      out.push(MarkdownBlock::Code(fence.trim().to_owned(), code.join("\n")));
    } else if matches!(t, "---" | "***" | "___") {
      flush(&mut para, &mut out);
      out.push(MarkdownBlock::Divider);
    } else if let Some((cap, tail)) = t.strip_prefix("![").and_then(|r| r.split_once("]("))
      && let Some(src) = tail.strip_suffix(')').filter(|s| !s.is_empty())
    {
      flush(&mut para, &mut out);
      out.push(MarkdownBlock::Image(cap.to_owned(), src.to_owned()));
    } else if let h @ 1..=6 = t.bytes().take_while(|&b| b == b'#').count()
      && t.as_bytes().get(h) == Some(&b' ')
    {
      flush(&mut para, &mut out);
      out.push(MarkdownBlock::Paragraph(
        ["h1", "h2", "h3", "h4", "h5", "h6"][h - 1],
        t[h + 1..].trim().to_owned(),
      ));
    } else if let Some(q) = t.strip_prefix("> ") {
      flush(&mut para, &mut out);
      out.push(MarkdownBlock::Paragraph("quote", q.to_owned()));
    } else {
      let s = line.bytes().take_while(|&b| b == b'\\').count();
      para.push(if s >= 1 && would_trigger_md_block(&line[s..]) {
        &line[1..]
      } else {
        line
      });
    }
  }
  flush(&mut para, &mut out);
  Ok(out)
}
fn set_str(m: &mut y_octo::Map, k: &str, v: impl Into<String>) -> Result<(), DomainError> {
  m.insert(k.to_owned(), y_octo::Any::String(v.into())).map_err(y_err)
}
fn create_block_from_md(
  doc: &y_octo::Doc,
  blocks: &mut y_octo::Map,
  block: &MarkdownBlock,
) -> Result<String, DomainError> {
  let bid = Uuid::new_v4().to_string();
  let mut bmap = doc.create_map().map_err(y_err)?;
  set_str(&mut bmap, "sys:id", bid.clone())?;
  set_str(&mut bmap, "sys:flavour", block.flavour())?;
  let mut children_arr = doc.create_array().map_err(y_err)?;
  match block {
    MarkdownBlock::Paragraph(kind, text) => {
      set_str(&mut bmap, "prop:type", *kind)?;
      replace_ytext_in_place(doc, &mut bmap, "prop:text", text)?;
    }
    MarkdownBlock::List(kind, checked, text, children) => {
      set_str(&mut bmap, "prop:type", *kind)?;
      if *kind == "todo" {
        bmap
          .insert("prop:checked".to_owned(), y_octo::Any::from(checked.unwrap_or(false)))
          .map_err(y_err)?;
      }
      replace_ytext_in_place(doc, &mut bmap, "prop:text", text)?;
      for child in children {
        let cid = create_block_from_md(doc, blocks, child)?;
        children_arr
          .insert(children_arr.len(), y_octo::Any::String(cid))
          .map_err(y_err)?;
      }
    }
    MarkdownBlock::Code(language, text) => {
      set_str(&mut bmap, "prop:language", language.clone())?;
      replace_ytext_in_place(doc, &mut bmap, "prop:text", text)?;
    }
    MarkdownBlock::Divider => {}
    MarkdownBlock::Image(caption, source_id) => {
      set_str(&mut bmap, "prop:sourceId", source_id.clone())?;
      set_str(&mut bmap, "prop:caption", caption.clone())?;
    }
  }
  bmap.insert("sys:children".to_owned(), children_arr).map_err(y_err)?;
  blocks.insert(bid.clone(), bmap).map_err(y_err)?;
  Ok(bid)
}
fn create_note_block(doc: &y_octo::Doc, blocks: &mut y_octo::Map, nid: &str) -> Result<(), DomainError> {
  let mut note = doc.create_map().map_err(y_err)?;
  set_str(&mut note, "sys:id", nid)?;
  set_str(&mut note, "sys:flavour", "affine:note")?;
  note
    .insert("sys:children".to_owned(), doc.create_array().map_err(y_err)?)
    .map_err(y_err)?;
  blocks.insert(nid.to_owned(), note).map_err(y_err)
}
fn build_yjs_doc_binary(title: &str, body_markdown: &str) -> Result<Vec<u8>, DomainError> {
  use y_octo::{Any, Doc, Value};

  let doc = Doc::new();
  let mut blocks = doc.get_or_create_map("blocks").map_err(y_err)?;
  let mut page = doc.create_map().map_err(y_err)?;
  set_str(&mut page, "sys:id", "page:0")?;
  set_str(&mut page, "sys:flavour", "affine:page")?;
  replace_ytext_in_place(&doc, &mut page, "prop:title", title)?;
  let mut pc = doc.create_array().map_err(y_err)?;
  pc.insert(0, Any::String("note:0".to_owned())).map_err(y_err)?;
  page.insert("sys:children".to_owned(), pc).map_err(y_err)?;
  blocks.insert("page:0".to_owned(), page).map_err(y_err)?;
  create_note_block(&doc, &mut blocks, "note:0")?;
  if let Some(Value::Map(note_map)) = blocks.get("note:0")
    && let Some(Value::Array(mut children)) = note_map.get("sys:children")
  {
    let mut parsed = parse_markdown_checked(body_markdown)?;
    if parsed.is_empty() {
      parsed.push(MarkdownBlock::Paragraph("text", String::new()));
    }
    for block in parsed {
      let bid = create_block_from_md(&doc, &mut blocks, &block)?;
      children.insert(children.len(), Any::String(bid)).map_err(y_err)?;
    }
  }
  doc.encode_update_v1().map_err(y_err)
}
fn map_str(map: &y_octo::Map, key: &str) -> Option<String> {
  match map.get(key) {
    Some(y_octo::Value::Any(y_octo::Any::String(s))) => Some(s),
    _ => None,
  }
}
fn map_bool(map: &y_octo::Map, key: &str) -> bool {
  matches!(map.get(key), Some(y_octo::Value::Any(y_octo::Any::True)))
}
fn ytext_str(map: &y_octo::Map, key: &str) -> String {
  match map.get(key) {
    Some(y_octo::Value::Text(t)) => t.to_string(),
    _ => String::new(),
  }
}
fn array_child_ids(map: &y_octo::Map) -> Vec<String> {
  let Some(y_octo::Value::Array(arr)) = map.get("sys:children") else {
    return Vec::new();
  };
  (0..arr.len())
    .filter_map(|i| match arr.get(i) {
      Some(y_octo::Value::Any(y_octo::Any::String(s))) => Some(s),
      _ => None,
    })
    .collect()
}
fn find_single_page_id(blocks: &y_octo::Map) -> Result<String, DomainError> {
  let mut pages = Vec::new();
  for (k, v) in blocks.iter() {
    if let y_octo::Value::Map(m) = v
      && map_str(&m, "sys:flavour").as_deref() == Some("affine:page")
    {
      pages.push(k.to_owned());
    }
  }
  if pages.len() != 1 {
    return Err(DomainError::Validation(
      "Document must contain exactly one affine:page root block.".to_owned(),
    ));
  }
  Ok(pages.remove(0))
}
fn find_primary_note_id(blocks: &y_octo::Map, page_id: &str) -> Option<String> {
  let y_octo::Value::Map(page) = blocks.get(page_id)? else {
    return None;
  };
  let mut first_note = None;
  for cid in array_child_ids(&page) {
    if let Some(y_octo::Value::Map(m)) = blocks.get(&cid)
      && map_str(&m, "sys:flavour").as_deref() == Some("affine:note")
    {
      if first_note.is_none() {
        first_note = Some(cid.clone());
      }
      if map_str(&m, "prop:displayMode").as_deref() != Some("edgeless") {
        return Some(cid);
      }
    }
  }
  first_note
}
fn reversible_image_source(blocks: &y_octo::Map, block_id: &str) -> Option<String> {
  let y_octo::Value::Map(m) = blocks.get(block_id)? else {
    return None;
  };
  (map_str(&m, "sys:flavour").as_deref() == Some("affine:image") && array_child_ids(&m).is_empty())
    .then(|| map_str(&m, "prop:sourceId").filter(|s| !s.is_empty()))
    .flatten()
}
fn is_editable_subtree_inner(
  blocks: &y_octo::Map,
  block_id: &str,
  depth: usize,
  visited: &mut HashSet<String>,
  require_list: bool,
) -> bool {
  if depth > 32 || !visited.insert(block_id.to_owned()) {
    return false;
  }
  let Some(y_octo::Value::Map(m)) = blocks.get(block_id) else {
    return false;
  };
  let flavour = map_str(&m, "sys:flavour");
  if require_list && flavour.as_deref() != Some("affine:list") {
    return false;
  }
  let cids = array_child_ids(&m);
  let text = ytext_str(&m, "prop:text");
  match flavour.as_deref() {
    Some("affine:paragraph") => {
      let ptype = map_str(&m, "prop:type").unwrap_or_else(|| "text".to_owned());
      cids.is_empty()
        && matches!(
          ptype.as_str(),
          "text" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "quote"
        )
        && !text.is_empty()
        && !text.contains("\n\n")
        && (ptype == "text" || !text.contains('\n'))
    }
    Some("affine:list") => {
      matches!(
        map_str(&m, "prop:type").as_deref().unwrap_or("bulleted"),
        "bulleted" | "numbered" | "todo"
      ) && !text.contains('\n')
        && cids
          .iter()
          .all(|cid| is_editable_subtree_inner(blocks, cid, depth + 1, visited, true))
    }
    Some("affine:code") => cids.is_empty() && !text.lines().any(|l| l.trim().starts_with("```")),
    Some("affine:divider") => cids.is_empty(),
    _ => false,
  }
}
fn is_editable_subtree(blocks: &y_octo::Map, block_id: &str) -> bool {
  is_editable_subtree_inner(blocks, block_id, 0, &mut HashSet::new(), false)
}
fn extract_editable_md_block(
  blocks: &y_octo::Map,
  block_id: &str,
  depth: usize,
  visited: &mut HashSet<String>,
) -> Option<MarkdownBlock> {
  if depth > MAX_LIST_DEPTH || !visited.insert(block_id.to_owned()) {
    return None;
  }
  let y_octo::Value::Map(m) = blocks.get(block_id)? else {
    return None;
  };
  match map_str(&m, "sys:flavour")?.as_str() {
    "affine:paragraph" => {
      let kind = ["text", "h1", "h2", "h3", "h4", "h5", "h6", "quote"]
        .into_iter()
        .find(|&k| k == map_str(&m, "prop:type").as_deref().unwrap_or("text"))?;
      Some(MarkdownBlock::Paragraph(kind, ytext_str(&m, "prop:text")))
    }
    "affine:list" => {
      let kind = ["bulleted", "numbered", "todo"]
        .into_iter()
        .find(|&k| k == map_str(&m, "prop:type").as_deref().unwrap_or("bulleted"))?;
      let checked = (kind == "todo").then(|| map_bool(&m, "prop:checked"));
      let children: Option<Vec<_>> = array_child_ids(&m)
        .into_iter()
        .map(|cid| extract_editable_md_block(blocks, &cid, depth + 1, visited))
        .collect();
      Some(MarkdownBlock::List(
        kind,
        checked,
        ytext_str(&m, "prop:text"),
        children?,
      ))
    }
    "affine:code" => Some(MarkdownBlock::Code(
      map_str(&m, "prop:language").unwrap_or_default(),
      ytext_str(&m, "prop:text"),
    )),
    "affine:divider" => Some(MarkdownBlock::Divider),
    "affine:image" => Some(MarkdownBlock::Image(
      map_str(&m, "prop:caption").unwrap_or_default(),
      map_str(&m, "prop:sourceId")?,
    )),
    _ => None,
  }
}
fn replace_ytext_in_place(
  doc: &y_octo::Doc,
  map: &mut y_octo::Map,
  key: &str,
  new_text: &str,
) -> Result<(), DomainError> {
  if let Some(y_octo::Value::Text(mut ytext)) = map.get(key) {
    if ytext.to_string() == new_text {
      return Ok(());
    }
    if !ytext.is_empty() {
      ytext.remove(0, ytext.len()).map_err(y_err)?;
    }
    ytext.insert(0, new_text).map_err(y_err)?;
  } else {
    let mut ytext = doc.create_text().map_err(y_err)?;
    ytext.insert(0, new_text).map_err(y_err)?;
    map.insert(key.to_owned(), ytext).map_err(y_err)?;
  }
  Ok(())
}
fn update_block_in_place(
  doc: &y_octo::Doc,
  blocks: &mut y_octo::Map,
  block_id: &str,
  md: &MarkdownBlock,
) -> Result<(), DomainError> {
  if extract_editable_md_block(blocks, block_id, 0, &mut HashSet::new()).as_ref() == Some(md) {
    return Ok(());
  }
  let Some(y_octo::Value::Map(mut m)) = blocks.get(block_id) else {
    return Ok(());
  };
  match md {
    MarkdownBlock::Paragraph(kind, text) => {
      if map_str(&m, "prop:type").as_deref() != Some(*kind) {
        set_str(&mut m, "prop:type", *kind)?;
      }
      replace_ytext_in_place(doc, &mut m, "prop:text", text)?;
    }
    MarkdownBlock::List(kind, checked, text, children) => {
      if map_str(&m, "prop:type").as_deref() != Some(*kind) {
        set_str(&mut m, "prop:type", *kind)?;
      }
      if *kind == "todo" && map_bool(&m, "prop:checked") != checked.unwrap_or(false) {
        m.insert("prop:checked".to_owned(), y_octo::Any::from(checked.unwrap_or(false)))
          .map_err(y_err)?;
      }
      replace_ytext_in_place(doc, &mut m, "prop:text", text)?;
      let old_cids = array_child_ids(&m);
      let new_cids = reconcile_editable_sequence(doc, blocks, &old_cids, children)?;
      if old_cids != new_cids {
        set_children_array(doc, &mut m, &new_cids)?;
      }
    }
    MarkdownBlock::Code(language, text) => {
      if map_str(&m, "prop:language").as_deref() != Some(language.as_str()) {
        set_str(&mut m, "prop:language", language.clone())?;
      }
      replace_ytext_in_place(doc, &mut m, "prop:text", text)?;
    }
    MarkdownBlock::Divider => {}
    MarkdownBlock::Image(caption, _) => {
      if map_str(&m, "prop:caption").as_deref() != Some(caption.as_str()) {
        set_str(&mut m, "prop:caption", caption.clone())?;
      }
    }
  }
  Ok(())
}
fn remove_editable_subtree(blocks: &mut y_octo::Map, block_id: &str, depth: usize, visited: &mut HashSet<String>) {
  if depth > 64 || !visited.insert(block_id.to_owned()) {
    return;
  }
  if let Some(y_octo::Value::Map(m)) = blocks.get(block_id) {
    for cid in array_child_ids(&m) {
      remove_editable_subtree(blocks, &cid, depth + 1, visited);
    }
  }
  blocks.remove(block_id);
}
fn set_children_array(doc: &y_octo::Doc, parent: &mut y_octo::Map, new_ids: &[String]) -> Result<(), DomainError> {
  let mut arr = match parent.get("sys:children") {
    Some(y_octo::Value::Array(mut a)) => {
      if !a.is_empty() {
        a.remove(0, a.len()).map_err(y_err)?;
      }
      a
    }
    _ => {
      parent
        .insert("sys:children".to_owned(), doc.create_array().map_err(y_err)?)
        .map_err(y_err)?;
      let Some(y_octo::Value::Array(a)) = parent.get("sys:children") else {
        return Ok(());
      };
      a
    }
  };
  for id in new_ids {
    arr.insert(arr.len(), y_octo::Any::String(id.clone())).map_err(y_err)?;
  }
  Ok(())
}
fn reconcile_editable_sequence(
  doc: &y_octo::Doc,
  blocks: &mut y_octo::Map,
  old_ids: &[String],
  new_blocks: &[MarkdownBlock],
) -> Result<Vec<String>, DomainError> {
  let mut used_old = vec![false; old_ids.len()];
  let mut assigned: Vec<Option<String>> = vec![None; new_blocks.len()];
  let mut exact_index: HashMap<MarkdownBlock, VecDeque<(usize, String)>> = HashMap::with_capacity(old_ids.len());
  for (oi, oid) in old_ids.iter().enumerate() {
    if let Some(md) = extract_editable_md_block(blocks, oid, 0, &mut HashSet::new()) {
      exact_index.entry(md).or_default().push_back((oi, oid.clone()));
    }
  }
  for (ni, md) in new_blocks.iter().enumerate() {
    if let Some(q) = exact_index.get_mut(md)
      && let Some((oi, oid)) = q.pop_front()
    {
      used_old[oi] = true;
      assigned[ni] = Some(oid);
    }
  }
  let mut flavour_index: HashMap<String, VecDeque<(usize, String)>> = HashMap::new();
  for (oi, oid) in old_ids.iter().enumerate() {
    if !used_old[oi]
      && let Some(y_octo::Value::Map(m)) = blocks.get(oid)
      && let Some(flavour) = map_str(&m, "sys:flavour")
    {
      flavour_index.entry(flavour).or_default().push_back((oi, oid.clone()));
    }
  }
  for (ni, md) in new_blocks.iter().enumerate() {
    if assigned[ni].is_none()
      && let Some(q) = flavour_index.get_mut(md.flavour())
      && let Some((oi, oid)) = q.pop_front()
    {
      used_old[oi] = true;
      update_block_in_place(doc, blocks, &oid, md)?;
      assigned[ni] = Some(oid);
    }
  }
  let mut result = Vec::with_capacity(new_blocks.len());
  for (ni, md) in new_blocks.iter().enumerate() {
    result.push(match assigned[ni].take() {
      Some(oid) => oid,
      None => create_block_from_md(doc, blocks, md)?,
    });
  }
  let mut rm_visited = HashSet::new();
  for (oi, oid) in old_ids.iter().enumerate() {
    if !used_old[oi] {
      remove_editable_subtree(blocks, oid, 0, &mut rm_visited);
    }
  }
  Ok(result)
}
fn mutate_doc_title_delta(merged_existing: &[u8], new_title: &str) -> Result<Vec<u8>, DomainError> {
  let before_sv = y_octo::encode_state_vector_from_update_v1(merged_existing).map_err(int_err("encode doc sv"))?;
  let doc = y_octo::Doc::try_from_binary_v1(merged_existing).map_err(int_err("decode existing doc"))?;
  let blocks = doc.get_or_create_map("blocks").map_err(int_err("get blocks map"))?;
  let page_key = find_single_page_id(&blocks)?;
  if let Some(y_octo::Value::Map(mut page)) = blocks.get(&page_key) {
    replace_ytext_in_place(&doc, &mut page, "prop:title", new_title)?;
  }
  let full_after = doc.encode_update_v1().map_err(int_err("encode doc after title"))?;
  diff_yjs_v1(&full_after, &before_sv, "diff doc title")
}
fn mutate_doc_body_delta(merged_existing: &[u8], body_markdown: &str) -> Result<Vec<u8>, DomainError> {
  use y_octo::{Any, Doc, Value};

  let before_sv = y_octo::encode_state_vector_from_update_v1(merged_existing).map_err(int_err("encode doc sv"))?;
  let doc = Doc::try_from_binary_v1(merged_existing).map_err(int_err("decode existing doc"))?;
  let mut blocks = doc.get_or_create_map("blocks").map_err(int_err("get blocks map"))?;
  let page_id = find_single_page_id(&blocks)?;
  let note_id = match find_primary_note_id(&blocks, &page_id) {
    Some(id) => id,
    None => {
      let nid = Uuid::new_v4().to_string();
      create_note_block(&doc, &mut blocks, &nid)?;
      if let Some(Value::Map(page)) = blocks.get(&page_id)
        && let Some(Value::Array(mut pc)) = page.get("sys:children")
      {
        pc.insert(pc.len(), Any::String(nid.clone()))
          .map_err(int_err("attach note"))?;
      }
      nid
    }
  };
  let existing_children = match blocks.get(&note_id) {
    Some(Value::Map(note_map)) => array_child_ids(&note_map),
    _ => Vec::new(),
  };
  let mut old_editable = Vec::new();
  let mut opaque_slots: Vec<(usize, String)> = Vec::new();
  let mut image_slots: HashMap<String, VecDeque<String>> = HashMap::new();
  for (idx, cid) in existing_children.iter().enumerate() {
    if is_editable_subtree(&blocks, cid) {
      old_editable.push(cid.clone());
    } else {
      if let Some(src) = reversible_image_source(&blocks, cid) {
        image_slots.entry(src).or_default().push_back(cid.clone());
      }
      opaque_slots.push((idx, cid.clone()));
    }
  }
  let mut new_editable_mds = Vec::new();
  let mut matched_opaque: HashSet<String> = HashSet::new();
  let mut ordered_tokens: Vec<Result<String, usize>> = Vec::new();
  for md in parse_markdown_checked(body_markdown)? {
    if let MarkdownBlock::Image(ref caption, ref source_id) = md
      && let Some(oid) = image_slots.get_mut(source_id).and_then(VecDeque::pop_front)
    {
      matched_opaque.insert(oid.clone());
      update_block_in_place(
        &doc,
        &mut blocks,
        &oid,
        &MarkdownBlock::Image(caption.clone(), source_id.clone()),
      )?;
      ordered_tokens.push(Ok(oid));
      continue;
    }
    ordered_tokens.push(Err(new_editable_mds.len()));
    new_editable_mds.push(md);
  }
  let reconciled = reconcile_editable_sequence(&doc, &mut blocks, &old_editable, &new_editable_mds)?;
  let mut main_iter = ordered_tokens.into_iter().map(|tok| match tok {
    Ok(oid) => oid,
    Err(idx) => reconciled[idx].clone(),
  });
  let mut unmatched = opaque_slots
    .into_iter()
    .filter(|(_, oid)| !matched_opaque.contains(oid))
    .peekable();
  let mut final_children = Vec::with_capacity(existing_children.len().max(reconciled.len()));
  while let Some(&(orig_idx, _)) = unmatched.peek() {
    let next = if orig_idx <= final_children.len() {
      unmatched.next().map(|(_, oid)| oid)
    } else {
      main_iter.next().or_else(|| unmatched.next().map(|(_, oid)| oid))
    };
    if let Some(id) = next {
      final_children.push(id);
    }
  }
  final_children.extend(main_iter);
  if existing_children != final_children
    && let Some(Value::Map(mut note_map)) = blocks.get(&note_id)
  {
    set_children_array(&doc, &mut note_map, &final_children)?;
  }
  let full_after = doc.encode_update_v1().map_err(int_err("encode doc after body"))?;
  diff_yjs_v1(&full_after, &before_sv, "diff doc body")
}
fn extract_title_from_blocks(blocks: &y_octo::Map, page_id: &str) -> Option<String> {
  let y_octo::Value::Map(page) = blocks.get(page_id)? else {
    return None;
  };
  let y_octo::Value::Text(t) = page.get("prop:title")? else {
    return None;
  };
  Some(t.to_string())
}
fn extract_title_from_yjs(blob: &[u8]) -> Option<String> {
  let doc = y_octo::Doc::try_from_binary_v1(blob).ok()?;
  let blocks = doc.get_or_create_map("blocks").ok()?;
  extract_title_from_blocks(&blocks, &find_single_page_id(&blocks).ok()?)
}
fn render_list_lines(
  blocks: &y_octo::Map,
  block_id: &str,
  list_depth: usize,
  depth: usize,
  visited: &mut HashSet<String>,
  lines: &mut Vec<String>,
) {
  if depth > 64 || !visited.insert(block_id.to_owned()) {
    return;
  }
  let Some(y_octo::Value::Map(m)) = blocks.get(block_id) else {
    return;
  };
  if map_str(&m, "sys:flavour").as_deref() != Some("affine:list") {
    return;
  }
  let prefix = match map_str(&m, "prop:type").as_deref() {
    Some("numbered") => "1. ",
    Some("todo") if map_bool(&m, "prop:checked") => "- [x] ",
    Some("todo") => "- [ ] ",
    _ => "- ",
  };
  lines.push(format!(
    "{}{prefix}{}",
    "  ".repeat(list_depth),
    ytext_str(&m, "prop:text")
  ));
  for cid in array_child_ids(&m) {
    render_list_lines(blocks, &cid, list_depth + 1, depth + 1, visited, lines);
  }
}
fn render_block_tree(blocks: &y_octo::Map, block_id: &str, visited: &mut HashSet<String>, out: &mut Vec<String>) {
  let Some(y_octo::Value::Map(m)) = blocks.get(block_id) else {
    return;
  };
  match map_str(&m, "sys:flavour").as_deref() {
    Some("affine:list") => {
      let mut lines = Vec::new();
      render_list_lines(blocks, block_id, 0, 0, visited, &mut lines);
      if !lines.is_empty() {
        out.push(lines.join("\n"));
      }
    }
    Some("affine:paragraph") if visited.insert(block_id.to_owned()) => {
      let prefix = match map_str(&m, "prop:type").as_deref() {
        Some("h1") => "# ",
        Some("h2") => "## ",
        Some("h3") => "### ",
        Some("h4") => "#### ",
        Some("h5") => "##### ",
        Some("h6") => "###### ",
        Some("quote") => "> ",
        _ => "",
      };
      let text = ytext_str(&m, "prop:text");
      let line = if prefix.is_empty() {
        text
          .split('\n')
          .map(|l| {
            let s = l.bytes().take_while(|&b| b == b'\\').count();
            if would_trigger_md_block(&l[s..]) {
              format!("\\{l}")
            } else {
              l.to_owned()
            }
          })
          .collect::<Vec<_>>()
          .join("\n")
      } else {
        format!("{prefix}{text}")
      };
      if !line.is_empty() {
        out.push(line);
      }
    }
    Some("affine:code") if visited.insert(block_id.to_owned()) => out.push(format!(
      "```{}\n{}\n```",
      map_str(&m, "prop:language").unwrap_or_default(),
      ytext_str(&m, "prop:text")
    )),
    Some("affine:divider") if visited.insert(block_id.to_owned()) => out.push("---".to_owned()),
    Some("affine:image") if visited.insert(block_id.to_owned()) => {
      if let Some(src) = map_str(&m, "prop:sourceId") {
        out.push(format!("![{}]({src})", map_str(&m, "prop:caption").unwrap_or_default()));
      }
    }
    _ => {}
  }
}
fn extract_title_and_markdown_from_yjs(blob: &[u8]) -> (Option<String>, String) {
  let Some(doc) = y_octo::Doc::try_from_binary_v1(blob).ok() else {
    return (None, String::new());
  };
  let Ok(blocks) = doc.get_or_create_map("blocks") else {
    return (None, String::new());
  };
  let Ok(page_id) = find_single_page_id(&blocks) else {
    return (None, String::new());
  };
  let title_opt = extract_title_from_blocks(&blocks, &page_id);
  let body = find_primary_note_id(&blocks, &page_id)
    .and_then(|nid| match blocks.get(&nid)? {
      y_octo::Value::Map(note) => {
        let (mut parts, mut visited) = (Vec::new(), HashSet::new());
        for cid in array_child_ids(&note) {
          if is_editable_subtree(&blocks, &cid) || reversible_image_source(&blocks, &cid).is_some() {
            render_block_tree(&blocks, &cid, &mut visited, &mut parts);
          }
        }
        Some(parts.join("\n\n"))
      }
      _ => None,
    })
    .unwrap_or_default();
  let title = title_opt.as_deref().unwrap_or("");
  let md = match (title.is_empty(), body.is_empty()) {
    (true, true) => String::new(),
    (false, true) => format!("# {title}\n"),
    (true, false) => body,
    (false, false) => format!("# {title}\n\n{body}"),
  };
  (title_opt, md)
}
