//! Workspace Copilot embedding configuration, artifacts, and ignored-document GraphQL resolvers.

use std::io::Read as _;
use std::sync::Arc;

use async_graphql::{Context, Object, Result, SimpleObject, Upload};
use chrono::{DateTime, SecondsFormat, Utc};
use server_spi::{AddWorkspaceArtifactInput, EmbeddingPagination, WorkspaceArtifactRecord, WorkspaceIgnoredDocRecord};
use server_types::DomainError;

use super::doc::{PageInfo, PaginationInput, encode_cursor};
use super::require_authenticated_user;
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;
use crate::legacy_compat::quota::SafeInt;

const MAX_EMBEDDABLE_SIZE: usize = 50 * 1024 * 1024;

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotWorkspaceIgnoredDoc")]
pub struct CopilotWorkspaceIgnoredDoc {
  pub created_at: DateTime<Utc>,
  pub created_by: Option<String>,
  pub created_by_avatar: Option<String>,
  pub doc_created_at: Option<DateTime<Utc>>,
  pub doc_id: String,
  pub doc_updated_at: Option<DateTime<Utc>>,
  pub title: Option<String>,
  pub updated_by: Option<String>,
}

impl From<WorkspaceIgnoredDocRecord> for CopilotWorkspaceIgnoredDoc {
  fn from(r: WorkspaceIgnoredDocRecord) -> Self {
    Self {
      created_at: r.created_at,
      created_by: r.created_by,
      created_by_avatar: r.created_by_avatar,
      doc_created_at: r.doc_created_at,
      doc_id: r.doc_id,
      doc_updated_at: r.doc_updated_at,
      title: r.title,
      updated_by: r.updated_by,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotWorkspaceIgnoredDocTypeEdge")]
pub struct CopilotWorkspaceIgnoredDocTypeEdge {
  pub cursor: String,
  pub node: CopilotWorkspaceIgnoredDoc,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PaginatedIgnoredDocsType")]
pub struct PaginatedIgnoredDocsType {
  pub edges: Vec<CopilotWorkspaceIgnoredDocTypeEdge>,
  pub page_info: PageInfo,
  pub total_count: i32,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotWorkspaceArtifact")]
pub struct CopilotWorkspaceArtifact {
  pub artifact_id: String,
  pub content_hash: String,
  pub created_at: DateTime<Utc>,
  pub embedding_status: String,
  pub file_name: String,
  pub media_type: String,
  pub size: SafeInt,
  pub workspace_id: String,
}

impl From<WorkspaceArtifactRecord> for CopilotWorkspaceArtifact {
  fn from(r: WorkspaceArtifactRecord) -> Self {
    Self {
      artifact_id: r.artifact_id,
      content_hash: r.content_hash,
      created_at: r.created_at,
      embedding_status: r.embedding_status,
      file_name: r.file_name,
      media_type: r.media_type,
      size: SafeInt(r.size),
      workspace_id: r.workspace_id,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotWorkspaceArtifactTypeEdge")]
pub struct CopilotWorkspaceArtifactTypeEdge {
  pub cursor: String,
  pub node: CopilotWorkspaceArtifact,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PaginatedCopilotWorkspaceArtifactType")]
pub struct PaginatedCopilotWorkspaceArtifactType {
  pub edges: Vec<CopilotWorkspaceArtifactTypeEdge>,
  pub page_info: PageInfo,
  pub total_count: i32,
}

pub struct CopilotWorkspaceConfig {
  pub workspace_id: String,
}

fn parse_embedding_pagination(pagination: &PaginationInput) -> Result<(EmbeddingPagination, i32, i32, bool)> {
  let first = pagination.resolved_first(10);
  let offset = pagination.resolved_offset();
  let after_raw = pagination.validate_and_resolve_after()?;
  let has_after = after_raw.is_some();
  Ok((
    EmbeddingPagination {
      first: Some(i64::from(first)),
      offset: Some(i64::from(offset)),
    },
    first,
    offset,
    has_after,
  ))
}

fn encode_js_iso_cursor(ts: DateTime<Utc>) -> String {
  encode_cursor(&ts.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn build_page_info(cursors: &[String], first: i32, offset: i32, has_after: bool) -> PageInfo {
  let start_cursor = cursors.first().cloned();
  let end_cursor = cursors.last().cloned();
  let has_next_page = cursors.len() >= usize::try_from(first).unwrap_or(10);
  let has_previous_page = has_after || offset > 0;
  PageInfo {
    start_cursor,
    end_cursor,
    has_next_page,
    has_previous_page,
  }
}

async fn assert_copilot_enabled(state: &AppState) -> Result<()> {
  let effective = state
    .app_config
    .get_effective_app_config()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let cfg_enabled = effective
    .pointer("/copilot/enabled")
    .and_then(|v| v.as_bool())
    .unwrap_or(true);
  state
    .extension
    .copilot_runtime()
    .assert_enabled(cfg_enabled)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(())
}

#[Object(name = "CopilotWorkspaceConfig")]
impl CopilotWorkspaceConfig {
  async fn workspace_id(&self) -> &str {
    &self.workspace_id
  }

  async fn all_ignored_docs(&self, ctx: &Context<'_>) -> Result<Vec<CopilotWorkspaceIgnoredDoc>> {
    let _user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_copilot_enabled(state).await?;
    let rows = state
      .extension
      .copilot_embedding_spi()
      .list_all_ignored_docs(&self.workspace_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(rows.into_iter().map(CopilotWorkspaceIgnoredDoc::from).collect())
  }

  async fn ignored_docs(&self, ctx: &Context<'_>, pagination: PaginationInput) -> Result<PaginatedIgnoredDocsType> {
    let _user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_copilot_enabled(state).await?;
    let (spi_pagination, first, offset, has_after) = parse_embedding_pagination(&pagination)?;
    let page = state
      .extension
      .copilot_embedding_spi()
      .list_ignored_docs(&self.workspace_id, spi_pagination)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    let mut cursors = Vec::with_capacity(page.items.len());
    let mut edges = Vec::with_capacity(page.items.len());
    for item in page.items {
      let cursor = encode_js_iso_cursor(item.created_at);
      cursors.push(cursor.clone());
      edges.push(CopilotWorkspaceIgnoredDocTypeEdge {
        cursor,
        node: CopilotWorkspaceIgnoredDoc::from(item),
      });
    }
    let page_info = build_page_info(&cursors, first, offset, has_after);
    Ok(PaginatedIgnoredDocsType {
      edges,
      page_info,
      total_count: i32::try_from(page.total_count).unwrap_or(i32::MAX),
    })
  }

  async fn artifacts(
    &self,
    ctx: &Context<'_>,
    pagination: PaginationInput,
  ) -> Result<PaginatedCopilotWorkspaceArtifactType> {
    let _user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_copilot_enabled(state).await?;
    let (spi_pagination, first, offset, has_after) = parse_embedding_pagination(&pagination)?;
    let page = state
      .extension
      .copilot_embedding_spi()
      .list_artifacts(&self.workspace_id, spi_pagination)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    let mut cursors = Vec::with_capacity(page.items.len());
    let mut edges = Vec::with_capacity(page.items.len());
    for item in page.items {
      let cursor = encode_js_iso_cursor(item.created_at);
      cursors.push(cursor.clone());
      edges.push(CopilotWorkspaceArtifactTypeEdge {
        cursor,
        node: CopilotWorkspaceArtifact::from(item),
      });
    }
    let page_info = build_page_info(&cursors, first, offset, has_after);
    Ok(PaginatedCopilotWorkspaceArtifactType {
      edges,
      page_info,
      total_count: i32::try_from(page.total_count).unwrap_or(i32::MAX),
    })
  }
}

pub(crate) async fn resolve_workspace_embedding(
  ctx: &Context<'_>,
  workspace_id: &str,
) -> Result<CopilotWorkspaceConfig> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  assert_copilot_enabled(state).await?;
  let perms = state
    .workspaces
    .resolve_workspace_permissions(&user.id, workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if !perms.read {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(format!(
      "space_access_denied:{workspace_id}"
    ))));
  }
  Ok(CopilotWorkspaceConfig {
    workspace_id: workspace_id.to_owned(),
  })
}

async fn require_workspace_settings_update<'a>(ctx: &'a Context<'_>, workspace_id: &str) -> Result<&'a Arc<AppState>> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  assert_copilot_enabled(state).await?;
  let perms = state
    .workspaces
    .resolve_workspace_permissions(&user.id, workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if !perms.settings_update {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(format!(
      "space_access_denied:{workspace_id}"
    ))));
  }
  Ok(state)
}

#[derive(Default)]
pub struct EmbeddingMutation;

#[Object]
impl EmbeddingMutation {
  /// Add a workspace artifact
  async fn add_workspace_artifact(
    &self,
    ctx: &Context<'_>,
    blob: Upload,
    workspace_id: String,
  ) -> Result<CopilotWorkspaceArtifact> {
    let state = require_workspace_settings_update(ctx, &workspace_id).await?;
    let spi = state.extension.copilot_embedding_spi();
    if !spi.is_enabled() {
      return Err(domain_error_to_graphql(&DomainError::Forbidden(
        "copilot_embedding_unavailable".into(),
      )));
    }

    let mut ws_lock = spi
      .acquire_workspace_artifact_lock(&workspace_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    let result: Result<CopilotWorkspaceArtifact> = async {
      if let Some(headers) = ctx.data_opt::<axum::http::HeaderMap>()
        && let Some(raw_len) = headers
          .get(axum::http::header::CONTENT_LENGTH)
          .and_then(|v| v.to_str().ok())
        && let Ok(content_length) = raw_len.trim().parse::<usize>()
        && content_length >= MAX_EMBEDDABLE_SIZE
      {
        return Err(domain_error_to_graphql(&DomainError::QuotaExceeded {
          kind: "blob_limit",
          message: "Blob size exceeds maximum embeddable limit.".into(),
        }));
      }

      let mut upload = blob
        .value(ctx)
        .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid artifact upload: {e}"))))?;
      let file_name = upload.filename.clone();
      let mime_type = upload
        .content_type
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("application/octet-stream")
        .to_owned();

      let mut bytes = Vec::new();
      let limit = MAX_EMBEDDABLE_SIZE as u64;
      (&mut upload.content).take(limit).read_to_end(&mut bytes).map_err(|e| {
        tracing::warn!(workspace_id = %workspace_id, error = %e, "failed to read workspace artifact upload");
        domain_error_to_graphql(&DomainError::Internal(
          "copilot_failed_to_add_workspace_artifact:Failed to add workspace artifact.".into(),
        ))
      })?;
      if bytes.len() >= MAX_EMBEDDABLE_SIZE {
        return Err(domain_error_to_graphql(&DomainError::QuotaExceeded {
          kind: "blob_limit",
          message: "Blob size exceeds maximum embeddable limit.".into(),
        }));
      }

      let record = spi
        .add_workspace_artifact(AddWorkspaceArtifactInput {
          workspace_id: workspace_id.clone(),
          file_name,
          mime_type,
          bytes,
        })
        .await
        .map_err(|err| match err {
          DomainError::Unauthorized(_)
          | DomainError::Forbidden(_)
          | DomainError::QuotaExceeded { .. }
          | DomainError::RateLimited(_)
          | DomainError::Validation(_) => domain_error_to_graphql(&err),
          other => {
            tracing::warn!(workspace_id = %workspace_id, error = %other, "failed to add workspace artifact");
            domain_error_to_graphql(&DomainError::Internal(
              "copilot_failed_to_add_workspace_artifact:Failed to add workspace artifact.".into(),
            ))
          }
        })?;
      Ok(CopilotWorkspaceArtifact::from(record))
    }
    .await;

    ws_lock.release().await;
    result
  }

  /// Remove a workspace artifact
  async fn remove_workspace_artifact(
    &self,
    ctx: &Context<'_>,
    artifact_id: String,
    workspace_id: String,
  ) -> Result<bool> {
    let state = require_workspace_settings_update(ctx, &workspace_id).await?;
    state
      .extension
      .copilot_embedding_spi()
      .remove_workspace_artifact(&workspace_id, &artifact_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }

  /// Update ignored docs
  async fn update_workspace_embedding_ignored_docs(
    &self,
    ctx: &Context<'_>,
    add: Option<Vec<String>>,
    remove: Option<Vec<String>>,
    workspace_id: String,
  ) -> Result<i32> {
    let state = require_workspace_settings_update(ctx, &workspace_id).await?;
    state
      .extension
      .copilot_embedding_spi()
      .update_ignored_docs(&workspace_id, add.unwrap_or_default(), remove.unwrap_or_default())
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::legacy_compat::errors::domain_error_to_envelope;

  #[test]
  fn community_embedding_error_extensions_match_contract() {
    let unavail = domain_error_to_envelope(&DomainError::Forbidden("copilot_embedding_unavailable".into()));
    assert_eq!(unavail.status, 403);
    assert_eq!(unavail.name, "COPILOT_EMBEDDING_UNAVAILABLE");
    assert_eq!(unavail.error_type, "ACTION_FORBIDDEN");

    let failed = domain_error_to_envelope(&DomainError::Internal(
      "copilot_failed_to_add_workspace_artifact:unsupported media type".into(),
    ));
    assert_eq!(failed.status, 500);
    assert_eq!(failed.name, "COPILOT_FAILED_TO_ADD_WORKSPACE_ARTIFACT");
    assert_eq!(failed.error_type, "INTERNAL_SERVER_ERROR");
    assert_eq!(
      failed.data,
      Some(serde_json::json!({ "message": "unsupported media type" }))
    );

    let gen_err = domain_error_to_envelope(&DomainError::Internal(
      "copilot_failed_to_generate_embedding:openai:upstream timeout".into(),
    ));
    assert_eq!(gen_err.status, 500);
    assert_eq!(gen_err.name, "COPILOT_FAILED_TO_GENERATE_EMBEDDING");
    assert_eq!(
      gen_err.data,
      Some(serde_json::json!({ "provider": "openai", "message": "upstream timeout" }))
    );
  }

  #[test]
  fn embedding_sdl_matches_frozen_v0275_contract() {
    let schema = async_graphql::Schema::build(
      super::super::QueryRoot::default(),
      super::super::MutationRoot::default(),
      async_graphql::EmptySubscription,
    )
    .finish();
    let sdl = schema.sdl();
    for expected in [
      "type CopilotWorkspaceConfig",
      "allIgnoredDocs: [CopilotWorkspaceIgnoredDoc!]!",
      "artifacts(pagination: PaginationInput!): PaginatedCopilotWorkspaceArtifactType!",
      "ignoredDocs(pagination: PaginationInput!): PaginatedIgnoredDocsType!",
      "type CopilotWorkspaceIgnoredDoc",
      "docId: String!",
      "createdByAvatar: String",
      "docCreatedAt: DateTime",
      "docUpdatedAt: DateTime",
      "type CopilotWorkspaceArtifact",
      "artifactId: String!",
      "contentHash: String!",
      "embeddingStatus: String!",
      "mediaType: String!",
      "size: SafeInt!",
      "embedding: CopilotWorkspaceConfig!",
      "addWorkspaceArtifact(blob: Upload!, workspaceId: String!): CopilotWorkspaceArtifact!",
      "removeWorkspaceArtifact(artifactId: String!, workspaceId: String!): Boolean!",
      "updateWorkspaceEmbeddingIgnoredDocs(add: [String!], remove: [String!], workspaceId: String!): Int!",
    ] {
      assert!(sdl.contains(expected), "missing expected SDL fragment: {expected}");
    }
  }

  struct DummyLock {
    released: Arc<std::sync::atomic::AtomicUsize>,
  }

  #[async_trait::async_trait]
  impl server_spi::WorkspaceArtifactLock for DummyLock {
    async fn release(&mut self) {
      self.released.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
  }

  struct EnabledCopilotRuntime;
  #[async_trait::async_trait]
  impl server_spi::CopilotRuntimeSpi for EnabledCopilotRuntime {
    async fn assert_enabled(&self, app_config_copilot_enabled: bool) -> std::result::Result<(), DomainError> {
      if !app_config_copilot_enabled {
        return Err(DomainError::Forbidden("Copilot is disabled.".into()));
      }
      Ok(())
    }
  }

  struct MockEmbeddingSpi {
    enabled: std::sync::atomic::AtomicBool,
    busy: std::sync::atomic::AtomicBool,
    releases: Arc<std::sync::atomic::AtomicUsize>,
    total: usize,
  }

  #[async_trait::async_trait]
  impl server_spi::CopilotEmbeddingSpi for MockEmbeddingSpi {
    fn is_enabled(&self) -> bool {
      self.enabled.load(std::sync::atomic::Ordering::SeqCst)
    }

    async fn list_all_ignored_docs(
      &self,
      _ws: &str,
    ) -> std::result::Result<Vec<WorkspaceIgnoredDocRecord>, DomainError> {
      Ok(Vec::new())
    }

    async fn list_ignored_docs(
      &self,
      _ws: &str,
      pagination: EmbeddingPagination,
    ) -> std::result::Result<server_spi::WorkspaceIgnoredDocPage, DomainError> {
      let first = pagination.first.unwrap_or(10) as usize;
      let offset = pagination.offset.unwrap_or(0) as usize;
      let base = DateTime::parse_from_rfc3339("2026-11-25T10:00:00.123Z")
        .unwrap()
        .with_timezone(&Utc);
      let items = (0..self.total)
        .skip(offset)
        .take(first)
        .map(|i| WorkspaceIgnoredDocRecord {
          doc_id: format!("doc-{i}"),
          created_at: base + chrono::Duration::seconds(i as i64),
          doc_created_at: None,
          doc_updated_at: None,
          title: Some(format!("Doc {i}")),
          created_by: None,
          created_by_avatar: None,
          updated_by: None,
        })
        .collect();
      Ok(server_spi::WorkspaceIgnoredDocPage {
        items,
        total_count: self.total as i64,
      })
    }

    async fn update_ignored_docs(
      &self,
      _ws: &str,
      add: Vec<String>,
      remove: Vec<String>,
    ) -> std::result::Result<i32, DomainError> {
      Ok((add.len() + remove.len()) as i32)
    }

    async fn list_artifacts(
      &self,
      ws: &str,
      pagination: EmbeddingPagination,
    ) -> std::result::Result<server_spi::WorkspaceArtifactPage, DomainError> {
      let first = pagination.first.unwrap_or(10) as usize;
      let offset = pagination.offset.unwrap_or(0) as usize;
      let base = DateTime::parse_from_rfc3339("2026-11-25T10:00:00.456Z")
        .unwrap()
        .with_timezone(&Utc);
      let items = (0..self.total)
        .skip(offset)
        .take(first)
        .map(|i| WorkspaceArtifactRecord {
          artifact_id: format!("art-{i}"),
          workspace_id: ws.to_owned(),
          file_name: format!("file-{i}.md"),
          media_type: "text/markdown".into(),
          size: 42,
          content_hash: format!("hash-{i}"),
          embedding_status: "ready".into(),
          created_at: base + chrono::Duration::seconds(i as i64),
        })
        .collect();
      Ok(server_spi::WorkspaceArtifactPage {
        items,
        total_count: self.total as i64,
      })
    }

    async fn acquire_workspace_artifact_lock(
      &self,
      _ws: &str,
    ) -> std::result::Result<server_spi::BoxedWorkspaceArtifactLock, DomainError> {
      if self.busy.load(std::sync::atomic::Ordering::SeqCst) {
        return Err(DomainError::RateLimited("Server is busy".into()));
      }
      Ok(Box::new(DummyLock {
        released: Arc::clone(&self.releases),
      }))
    }

    async fn add_workspace_artifact(
      &self,
      input: AddWorkspaceArtifactInput,
    ) -> std::result::Result<WorkspaceArtifactRecord, DomainError> {
      Ok(WorkspaceArtifactRecord {
        artifact_id: "art-new".into(),
        workspace_id: input.workspace_id,
        file_name: input.file_name,
        media_type: input.mime_type,
        size: input.bytes.len() as i64,
        content_hash: "h".into(),
        embedding_status: "processing".into(),
        created_at: Utc::now(),
      })
    }

    async fn remove_workspace_artifact(&self, _ws: &str, _id: &str) -> std::result::Result<bool, DomainError> {
      Ok(true)
    }
  }

  struct MockExtension {
    community: server_spi::CommunityExtension,
    copilot: Arc<dyn server_spi::CopilotRuntimeSpi>,
    embedding: Arc<MockEmbeddingSpi>,
  }

  impl server_spi::ServerExtension for MockExtension {
    fn edition_name(&self) -> &'static str {
      "test-enterprise"
    }
    fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
      self.community.quota_gate()
    }
    fn billing_spi(&self) -> Arc<dyn server_spi::BillingSpi> {
      self.community.billing_spi()
    }
    fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
      self.community.copilot_policy()
    }
    fn copilot_runtime(&self) -> Arc<dyn server_spi::CopilotRuntimeSpi> {
      Arc::clone(&self.copilot)
    }
    fn copilot_embedding_spi(&self) -> Arc<dyn server_spi::CopilotEmbeddingSpi> {
      Arc::clone(&self.embedding) as Arc<dyn server_spi::CopilotEmbeddingSpi>
    }
    fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
      self.community.session_policy()
    }
    fn rate_limit_policy(&self) -> Arc<dyn server_spi::RateLimitPolicy> {
      self.community.rate_limit_policy()
    }
  }

  #[test]
  fn embedding_graphql_auth_precedence_pagination_and_lock_order() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations = test_db_harness::migrations::MigrationSet {
      migrations: vec![],
      digest: "5e20000000000009".into(),
    };
    let template = cluster.ensure_template(&migrations).expect("ensure empty template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test database");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_multi_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async move {
      let db = server_db::ServerDb::connect(server_db::DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Graphql,
        selfhosted: true,
        max_connections: 2,
        statement_timeout_ms: 5_000,
        tier_permits: [4, 2, 2, 1],
      })
      .await
      .unwrap();
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .unwrap();
      db.ensure_schema_ready().await.unwrap();

      let releases = Arc::new(std::sync::atomic::AtomicUsize::new(0));
      let embedding_spi = Arc::new(MockEmbeddingSpi {
        enabled: std::sync::atomic::AtomicBool::new(true),
        busy: std::sync::atomic::AtomicBool::new(false),
        releases: Arc::clone(&releases),
        total: 12,
      });
      let ext = Arc::new(MockExtension {
        community: server_spi::CommunityExtension::new(),
        copilot: Arc::new(EnabledCopilotRuntime),
        embedding: Arc::clone(&embedding_spi),
      });
      let state = AppState::new(
        db.clone(),
        None,
        crate::RuntimeConfig {
          role: server_types::ServerRole::Graphql,
          ..crate::RuntimeConfig::default()
        },
        ext,
      );

      sqlx::query("INSERT INTO users (id, email, name) VALUES ('u-owner', 'owner@example.com', 'Owner')")
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query("INSERT INTO workspaces (id, name, enable_ai, enable_doc_embedding) VALUES ('ws-gql', 'WS', true, true)")
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role, state) VALUES ('ws-gql', 'u-owner', 'owner', 'active')",
      )
      .execute(db.pool())
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO workspace_access_policies (workspace_id, visibility, sharing_enabled, member_default_doc_role) \
         VALUES ('ws-gql', 'private', true, 'reader')",
      )
      .execute(db.pool())
      .await
      .unwrap();

      let schema = crate::graphql::build_schema(Arc::clone(&state));
      let auth_user = super::super::AuthenticatedUser {
        user_id: "u-owner".into(),
        user: None,
      };

      // (a) Anonymous call with copilot.enabled = false -> 401 (NOT 403).
      sqlx::query(
        "INSERT INTO app_configs (id, value, created_at, updated_at) \
         VALUES ('copilot.enabled', 'false'::jsonb, now(), now()) \
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value",
      )
      .execute(db.pool())
      .await
      .unwrap();
      state.app_config.refresh_effective_app_config().await.unwrap();
      let anon_resp = schema
        .execute(async_graphql::Request::new(
          "mutation { updateWorkspaceEmbeddingIgnoredDocs(workspaceId: \"ws-gql\", add: [\"d1\"]) }",
        ))
        .await;
      assert_eq!(anon_resp.errors.len(), 1);
      assert_eq!(
        anon_resp.errors[0]
          .extensions
          .as_ref()
          .and_then(|e| e.get("status")),
        Some(&async_graphql::Value::Number(401.into()))
      );

      // (b) Same anonymous client >120 calls -> still 401 (NOT 429).
      for _ in 0..125 {
        let resp = schema
          .execute(async_graphql::Request::new(
            "mutation { updateWorkspaceEmbeddingIgnoredDocs(workspaceId: \"ws-gql\", add: [\"d1\"]) }",
          ))
          .await;
        assert_eq!(
          resp.errors[0].extensions.as_ref().and_then(|e| e.get("status")),
          Some(&async_graphql::Value::Number(401.into()))
        );
      }

      // (c) Authenticated user with copilot.enabled = false -> 403 ACTION_FORBIDDEN.
      let disabled_resp = schema
        .execute(
          async_graphql::Request::new(
            "mutation { updateWorkspaceEmbeddingIgnoredDocs(workspaceId: \"ws-gql\", add: [\"d1\"]) }",
          )
          .data(auth_user.clone()),
        )
        .await;
      assert_eq!(disabled_resp.errors.len(), 1);
      assert_eq!(
        disabled_resp.errors[0].extensions.as_ref().and_then(|e| e.get("name")),
        Some(&async_graphql::Value::String("ACTION_FORBIDDEN".into()))
      );

      // Re-enable copilot in app_configs.
      sqlx::query("UPDATE app_configs SET value = 'true'::jsonb WHERE id = 'copilot.enabled'")
        .execute(db.pool())
        .await
        .unwrap();
      state.app_config.refresh_effective_app_config().await.unwrap();

      // (d) Pagination contract on ignoredDocs & artifacts: default first=10, exact full last page, partial last page, JS millis cursor.
      let page_q = r#"{
        workspace(id: "ws-gql") {
          embedding {
            dDef: ignoredDocs(pagination: {}) { totalCount edges { cursor } pageInfo { hasNextPage hasPreviousPage } }
            dFull: ignoredDocs(pagination: { first: 2, offset: 10 }) { edges { cursor } pageInfo { hasNextPage hasPreviousPage } }
            dPart: ignoredDocs(pagination: { first: 5, offset: 10 }) { edges { cursor } pageInfo { hasNextPage hasPreviousPage } }
            aDef: artifacts(pagination: {}) { totalCount edges { cursor } pageInfo { hasNextPage hasPreviousPage } }
            aFull: artifacts(pagination: { first: 2, offset: 10 }) { edges { cursor } pageInfo { hasNextPage hasPreviousPage } }
            aPart: artifacts(pagination: { first: 5, offset: 10 }) { edges { cursor } pageInfo { hasNextPage hasPreviousPage } }
          }
        }
      }"#;
      let page_resp = schema
        .execute(
          async_graphql::Request::new(page_q)
            .data(auth_user.clone())
            .data(super::super::AuthorizedWorkspaceUsage {
              workspace_id: "ws-gql".into(),
              used_storage_quota: 0,
              member_count: 1,
            }),
        )
        .await;
      assert!(page_resp.errors.is_empty(), "errors: {:?}", page_resp.errors);
      let emb = &serde_json::to_value(&page_resp.data).unwrap()["workspace"]["embedding"];
      for (def_k, full_k, part_k, expected_iso) in [
        ("dDef", "dFull", "dPart", "2026-11-25T10:00:00.123Z"),
        ("aDef", "aFull", "aPart", "2026-11-25T10:00:00.456Z"),
      ] {
        assert_eq!(emb[def_k]["edges"].as_array().unwrap().len(), 10);
        assert_eq!(emb[def_k]["pageInfo"]["hasNextPage"], true);
        assert_eq!(emb[full_k]["edges"].as_array().unwrap().len(), 2);
        assert_eq!(emb[full_k]["pageInfo"]["hasNextPage"], true);
        assert_eq!(emb[part_k]["edges"].as_array().unwrap().len(), 2);
        assert_eq!(emb[part_k]["pageInfo"]["hasNextPage"], false);
        let cur_b64 = emb[def_k]["edges"][0]["cursor"].as_str().unwrap();
        let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, cur_b64).unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), expected_iso);
      }

      // (e) Introspection of PaginationInput defaults matches v0.27.5 schema.gql (first=10, offset=0, after=null).
      let intro_resp = schema
        .execute(async_graphql::Request::new(
          "{ __type(name: \"PaginationInput\") { inputFields { name defaultValue } } }",
        ))
        .await;
      assert!(intro_resp.errors.is_empty());
      let fields = serde_json::to_value(&intro_resp.data).unwrap()["__type"]["inputFields"]
        .as_array()
        .unwrap()
        .clone();
      let find_default = |name: &str| {
        fields
          .iter()
          .find(|f| f["name"] == name)
          .and_then(|f| f["defaultValue"].as_str().map(str::to_owned))
      };
      assert_eq!(find_default("first").as_deref(), Some("10"));
      assert_eq!(find_default("offset").as_deref(), Some("0"));
      assert_eq!(find_default("after"), None);

      // (f) When embedding endpoint is unconfigured (spi.is_enabled() == false):
      //     (1) owner updateWorkspaceEmbeddingIgnoredDocs succeeds;
      //     (2) non-owner addWorkspaceArtifact fails with 403 ACTION_FORBIDDEN (not COPILOT_EMBEDDING_UNAVAILABLE);
      //     (3) owner addWorkspaceArtifact fails with 403 COPILOT_EMBEDDING_UNAVAILABLE.
      embedding_spi
        .enabled
        .store(false, std::sync::atomic::Ordering::SeqCst);
      let ok_ignored = schema
        .execute(
          async_graphql::Request::new(
            "mutation { updateWorkspaceEmbeddingIgnoredDocs(workspaceId: \"ws-gql\", add: [\"d1\"]) }",
          )
          .data(auth_user.clone()),
        )
        .await;
      assert!(ok_ignored.errors.is_empty(), "errors: {:?}", ok_ignored.errors);

      sqlx::query("INSERT INTO users (id, email, name) VALUES ('u-outsider', 'out@example.com', 'Out')")
        .execute(db.pool())
        .await
        .unwrap();
      let make_upload_req = |user_id: &str| {
        let mut req = async_graphql::Request::new(
          "mutation($blob: Upload!) { addWorkspaceArtifact(workspaceId: \"ws-gql\", blob: $blob) { artifactId } }",
        )
        .variables(async_graphql::Variables::from_json(serde_json::json!({ "blob": null })))
        .data(super::super::AuthenticatedUser {
          user_id: user_id.into(),
          user: None,
        });
        let tmp = std::env::temp_dir().join(format!("affine-upload-test-{}.txt", uuid::Uuid::new_v4()));
        std::fs::write(&tmp, b"hello").unwrap();
        let file = std::fs::File::open(&tmp).unwrap();
        let _ = std::fs::remove_file(&tmp);
        req.set_upload(
          "variables.blob",
          async_graphql::UploadValue {
            filename: "hello.txt".into(),
            content_type: Some("text/plain".into()),
            content: file,
          },
        );
        req
      };

      let outsider_resp = schema.execute(make_upload_req("u-outsider")).await;
      assert_eq!(outsider_resp.errors.len(), 1);
      assert_eq!(
        outsider_resp.errors[0].extensions.as_ref().and_then(|e| e.get("name")),
        Some(&async_graphql::Value::String("SPACE_ACCESS_DENIED".into()))
      );

      let owner_unavail = schema.execute(make_upload_req("u-owner")).await;
      assert_eq!(owner_unavail.errors.len(), 1);
      assert_eq!(
        owner_unavail.errors[0].extensions.as_ref().and_then(|e| e.get("name")),
        Some(&async_graphql::Value::String("COPILOT_EMBEDDING_UNAVAILABLE".into()))
      );

      // (g) Explicit await lock release runs before addWorkspaceArtifact returns (both Ok and Err).
      embedding_spi.enabled.store(true, std::sync::atomic::Ordering::SeqCst);
      let ok_upload = schema.execute(make_upload_req("u-owner")).await;
      assert!(ok_upload.errors.is_empty(), "errors: {:?}", ok_upload.errors);
      assert_eq!(releases.load(std::sync::atomic::Ordering::SeqCst), 1);

      let mut big_headers = axum::http::HeaderMap::new();
      big_headers.insert(
        axum::http::header::CONTENT_LENGTH,
        axum::http::HeaderValue::from_static("52428800"),
      );
      let err_upload = schema.execute(make_upload_req("u-owner").data(big_headers)).await;
      assert_eq!(err_upload.errors.len(), 1);
      assert_eq!(releases.load(std::sync::atomic::Ordering::SeqCst), 2);
    });
  }
}
