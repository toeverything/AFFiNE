//! `async-graphql 7` root schema aligned with `v0.27.5` `schema.gql`.

use std::io::Read as _;
use std::sync::Arc;

use async_graphql::{
  Context, EmptySubscription, Enum, ID, InputObject, InputValueError, InputValueResult, Object, Result, Scalar,
  ScalarType, Schema, SimpleObject, Upload, Value,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use server_blob::PutBlobOutcome;
use server_domain::app_config::AppConfigUpdate;
use server_domain::events::InvalidationHintV1;
use server_domain::users::CurrentUserView;
use server_domain::workspaces::{WorkspaceRecord, WorkspaceRole};
use server_mail::{MailSendResult, MailTemplate, SmtpConfig, SmtpMailer, TestMailProps};
use server_types::{DeploymentMode, DomainError};

use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;
use crate::legacy_compat::quota::{
  UserQuotaType, WorkspaceQuotaType, user_quota_from_grant, workspace_quota_from_grant,
};

pub type AppSchema = Schema<QueryRoot, MutationRoot, EmptySubscription>;

/// `v0.27.5` `JSON` scalar.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct JsonScalar(pub serde_json::Value);

#[Scalar(name = "JSON")]
impl ScalarType for JsonScalar {
  fn parse(value: Value) -> InputValueResult<Self> {
    value
      .into_json()
      .map(JsonScalar)
      .map_err(|e| InputValueError::custom(format!("invalid JSON: {e}")))
  }

  fn to_value(&self) -> Value {
    Value::from_json(self.0.clone()).unwrap_or(Value::Null)
  }
}

/// `v0.27.5` `JSONObject` scalar.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct JsonObjectScalar(pub serde_json::Value);

#[Scalar(name = "JSONObject")]
impl ScalarType for JsonObjectScalar {
  fn parse(value: Value) -> InputValueResult<Self> {
    let json = value
      .into_json()
      .map_err(|e| InputValueError::custom(format!("invalid JSONObject: {e}")))?;
    if !json.is_object() {
      return Err(InputValueError::custom("JSONObject must be a JSON object"));
    }
    Ok(JsonObjectScalar(json))
  }

  fn to_value(&self) -> Value {
    Value::from_json(self.0.clone()).unwrap_or_else(|_| Value::Object(Default::default()))
  }
}

/// Request-scoped authenticated principal injected into GraphQL execution context.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthenticatedUser {
  pub user_id: String,
  pub user: Option<CurrentUserView>,
}

/// Request-scoped authorized workspace usage snapshot injected for unit tests
/// (e.g. `SafeInt` overflow testing without seeding a live workspace).
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorizedWorkspaceUsage {
  pub workspace_id: String,
  pub used_storage_quota: i64,
  pub member_count: i32,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "ServerDeploymentType")]
pub enum ServerDeploymentType {
  #[graphql(name = "Affine")]
  Affine,
  #[graphql(name = "Selfhosted")]
  Selfhosted,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "ServerFeature")]
pub enum ServerFeature {
  #[graphql(name = "Captcha")]
  Captcha,
  #[graphql(name = "Comment")]
  Comment,
  #[graphql(name = "Copilot")]
  Copilot,
  #[graphql(name = "CopilotEmbedding")]
  CopilotEmbedding,
  #[graphql(name = "Indexer")]
  Indexer,
  #[graphql(name = "LocalWorkspace")]
  LocalWorkspace,
  #[graphql(name = "OAuth")]
  OAuth,
  #[graphql(name = "Payment")]
  Payment,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "FeatureType")]
pub enum FeatureType {
  #[graphql(name = "Admin")]
  Admin,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PasswordLimitsType")]
pub struct PasswordLimitsType {
  pub min_length: i32,
  pub max_length: i32,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CredentialsRequirementType")]
pub struct CredentialsRequirementType {
  pub password: PasswordLimitsType,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "ServerConfigType")]
pub struct ServerConfigType {
  pub version: String,
  pub name: String,
  #[graphql(name = "type")]
  pub deployment_type: ServerDeploymentType,
  pub initialized: bool,
  pub base_url: String,
  pub features: Vec<ServerFeature>,
  pub credentials_requirement: CredentialsRequirementType,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "ListedBlob")]
pub struct ListedBlob {
  pub key: String,
  pub size: i32,
  pub mime: String,
  pub created_at: String,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "InviteResult")]
pub struct InviteResult {
  pub email: String,
  pub invite_id: Option<String>,
  pub error: Option<JsonObjectScalar>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateAppConfigInput")]
pub struct UpdateAppConfigInput {
  pub module: String,
  pub key: String,
  pub value: Option<JsonScalar>,
  pub clear: Option<bool>,
}

pub struct UserType {
  view: CurrentUserView,
}

#[Object(name = "UserType")]
impl UserType {
  async fn id(&self) -> ID {
    ID(self.view.id.clone())
  }

  async fn name(&self) -> &str {
    &self.view.name
  }

  async fn email(&self) -> &str {
    &self.view.email
  }

  async fn avatar_url(&self) -> Option<&str> {
    self.view.avatar_url.as_deref()
  }

  async fn disabled(&self) -> bool {
    self.view.disabled
  }

  async fn email_verified(&self) -> bool {
    self.view.email_verified
  }

  async fn has_password(&self) -> Option<bool> {
    Some(self.view.has_password)
  }

  async fn features(&self) -> Vec<FeatureType> {
    if self.view.is_admin() {
      vec![FeatureType::Admin]
    } else {
      vec![]
    }
  }

  async fn quota(&self, ctx: &Context<'_>) -> Result<UserQuotaType> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let mut tx = state
      .db
      .begin_tiered(server_db::WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| domain_error_to_graphql(&DomainError::Unavailable(e.to_string())))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| domain_error_to_graphql(&DomainError::Internal(format!("load user quota clock: {e}"))))?;
    let grant = state
      .extension
      .quota_gate()
      .resolve_user_grant(tx.tx_mut(), &self.view.id, now)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    let owned_workspaces: Vec<String> = sqlx::query_scalar(
      "SELECT workspace_id FROM workspace_members WHERE user_id = $1 AND role = 'owner' AND state = 'active'",
    )
    .bind(&self.view.id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| domain_error_to_graphql(&DomainError::Internal(format!("load owned workspaces: {e}"))))?;

    let mut personal_ws_ids = Vec::with_capacity(owned_workspaces.len());
    for ws_id in owned_workspaces {
      let ws_grant = state
        .extension
        .quota_gate()
        .resolve_workspace_grant(tx.tx_mut(), &ws_id, now)
        .await
        .map_err(|e| domain_error_to_graphql(&e))?;
      if ws_grant.billing_subject == server_types::BillingSubject::Owner {
        personal_ws_ids.push(ws_id);
      }
    }

    let used_storage_quota: i64 = if personal_ws_ids.is_empty() {
      0
    } else {
      sqlx::query_scalar(
        r#"SELECT (
             COALESCE((
               SELECT SUM(b.size)::bigint
               FROM blobs b
               WHERE b.workspace_id = ANY($1)
                 AND b.deleted_at IS NULL
                 AND (b.status = 'completed' OR (b.status = 'pending' AND b.reservation_expires_at > $2))
             ), 0)
             + COALESCE((
               SELECT SUM(ca.size)::bigint
               FROM comment_attachments ca
               WHERE ca.workspace_id = ANY($1)
                 AND ca.deleted_at IS NULL
                 AND (ca.status = 'completed' OR (ca.status = 'pending' AND ca.reservation_expires_at > $2))
             ), 0)
           )::bigint"#,
      )
      .bind(&personal_ws_ids)
      .bind(now)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| domain_error_to_graphql(&DomainError::Internal(format!("load user storage usage: {e}"))))?
    };
    let _ = tx.rollback().await;
    Ok(user_quota_from_grant(&grant, used_storage_quota))
  }
}

pub struct WorkspaceType {
  record: WorkspaceRecord,
  used_storage_quota: i64,
  member_count: i32,
}

#[Object(name = "WorkspaceType")]
impl WorkspaceType {
  async fn id(&self) -> ID {
    ID(self.record.id.clone())
  }

  async fn public(&self) -> bool {
    self.record.public
  }

  async fn enable_ai(&self) -> bool {
    self.record.enable_ai
  }

  async fn enable_doc_embedding(&self) -> bool {
    self.record.enable_doc_embedding
  }

  async fn enable_sharing(&self) -> bool {
    self.record.enable_sharing
  }

  async fn enable_url_preview(&self) -> bool {
    self.record.enable_url_preview
  }

  async fn created_at(&self) -> DateTime<Utc> {
    self.record.created_at
  }

  async fn member_count(&self) -> i32 {
    self.member_count
  }

  /// Resolves this workspace's quota through [`server_spi::QuotaGate`] inside a
  /// `WorkloadTier::InteractiveRead` transaction.
  async fn quota(&self, ctx: &Context<'_>) -> Result<WorkspaceQuotaType> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let mut tx = state
      .db
      .begin_tiered(server_db::WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| domain_error_to_graphql(&DomainError::Unavailable(e.to_string())))?;

    let grant = state
      .extension
      .quota_gate()
      .resolve_workspace_grant(tx.tx_mut(), &self.record.id, Utc::now())
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    let _ = tx.rollback().await;
    Ok(workspace_quota_from_grant(
      &grant,
      self.used_storage_quota,
      self.member_count,
    ))
  }

  async fn blobs(
    &self,
    ctx: &Context<'_>,
    after: Option<String>,
    #[graphql(default = 1000)] first: i32,
  ) -> Result<Vec<ListedBlob>> {
    let user = require_authenticated_user(ctx).await?;
    if !(1..=1000).contains(&first) {
      return Err(domain_error_to_graphql(&DomainError::Validation(
        "Blob page size must be between 1 and 1000".into(),
      )));
    }
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let all = state
      .blobs
      .list_blobs_authorized(&user.id, &self.record.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let limit = usize::try_from(first).unwrap_or(0);
    let filtered = all
      .into_iter()
      .filter(|b| after.as_deref().is_none_or(|cursor| b.key.as_str() > cursor))
      .take(limit)
      .map(|b| ListedBlob {
        key: b.key,
        size: i32::try_from(b.size).unwrap_or(i32::MAX),
        mime: b.mime,
        created_at: b.created_at.to_rfc3339(),
      })
      .collect();
    Ok(filtered)
  }
}

async fn require_authenticated_user(ctx: &Context<'_>) -> Result<CurrentUserView> {
  let Some(auth) = ctx.data_opt::<AuthenticatedUser>() else {
    return Err(domain_error_to_graphql(&DomainError::Unauthorized(
      "Authentication required".into(),
    )));
  };
  if let Some(view) = &auth.user {
    return Ok(view.clone());
  }
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .users
    .get_current_user(&auth.user_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?
    .ok_or_else(|| domain_error_to_graphql(&DomainError::Unauthorized("Authentication required".into())))
}

async fn require_admin_user(ctx: &Context<'_>) -> Result<CurrentUserView> {
  let user = require_authenticated_user(ctx).await?;
  if !user.is_admin() {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "Admin privileges required".into(),
    )));
  }
  Ok(user)
}

pub struct QueryRoot;

#[Object(name = "Query")]
impl QueryRoot {
  async fn server_config(&self, ctx: &Context<'_>) -> Result<ServerConfigType> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let cfg = state.config.load();
    let initialized = state
      .auth
      .is_server_initialized()
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    let deployment_type = match cfg.deployment_mode {
      DeploymentMode::Selfhosted => ServerDeploymentType::Selfhosted,
      DeploymentMode::Cloud => ServerDeploymentType::Affine,
    };

    let features = match cfg.deployment_mode {
      DeploymentMode::Selfhosted => vec![
        ServerFeature::Comment,
        ServerFeature::LocalWorkspace,
        ServerFeature::CopilotEmbedding,
      ],
      DeploymentMode::Cloud => vec![
        ServerFeature::Comment,
        ServerFeature::LocalWorkspace,
        ServerFeature::CopilotEmbedding,
        ServerFeature::Payment,
        ServerFeature::OAuth,
      ],
    };

    Ok(ServerConfigType {
      version: cfg.server_version.clone(),
      name: cfg.server_name.clone(),
      deployment_type,
      initialized,
      base_url: cfg.external_url.clone(),
      features,
      credentials_requirement: CredentialsRequirementType {
        password: PasswordLimitsType {
          min_length: i32::try_from(state.auth.config().password_min_length).unwrap_or(8),
          max_length: i32::try_from(state.auth.config().password_max_length).unwrap_or(32),
        },
      },
    })
  }

  /// Returns the currently authenticated user, or `null` for anonymous requests
  /// (matches `v0.27.5` `Query.currentUser: UserType`).
  async fn current_user(&self, ctx: &Context<'_>) -> Option<UserType> {
    let auth = ctx.data_opt::<AuthenticatedUser>()?;
    if let Some(view) = &auth.user {
      return Some(UserType { view: view.clone() });
    }
    Some(UserType {
      view: CurrentUserView {
        id: auth.user_id.clone(),
        name: String::new(),
        email: String::new(),
        avatar_url: None,
        disabled: false,
        has_password: false,
        email_verified: false,
        features: Vec::new(),
      },
    })
  }

  /// Workspace root query (matches `v0.27.5` `Query.workspace(id: String!): WorkspaceType!`).
  async fn workspace(&self, ctx: &Context<'_>, id: String) -> Result<WorkspaceType> {
    let Some(auth) = ctx.data_opt::<AuthenticatedUser>() else {
      return Err(domain_error_to_graphql(&DomainError::Unauthorized(
        "Authentication required".into(),
      )));
    };

    // Context-injected usage path (used by unit tests for SafeInt overflow and
    // schema isolation without seeding full workspace tables).
    if let Some(usage) = ctx.data_opt::<AuthorizedWorkspaceUsage>() {
      if usage.workspace_id != id {
        return Err(domain_error_to_graphql(&DomainError::Forbidden(
          "Workspace access denied".into(),
        )));
      }
      return Ok(WorkspaceType {
        record: WorkspaceRecord {
          id,
          sid: 0,
          name: None,
          avatar_key: None,
          public: false,
          enable_ai: true,
          enable_doc_embedding: true,
          enable_sharing: true,
          enable_url_preview: false,
          indexed: false,
          created_at: Utc::now(),
          last_check_embeddings: DateTime::<Utc>::UNIX_EPOCH,
        },
        used_storage_quota: usage.used_storage_quota,
        member_count: usage.member_count,
      });
    }

    // Fail closed when a unit test injected `AuthenticatedUser` without a full
    // database-backed `CurrentUserView`.
    if auth.user.is_none() {
      return Err(domain_error_to_graphql(&DomainError::Forbidden(
        "Workspace access denied".into(),
      )));
    }

    let state = ctx.data_unchecked::<Arc<AppState>>();
    let record = state
      .workspaces
      .get_workspace_for_user(&id, Some(&auth.user_id))
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let usage = state
      .workspaces
      .load_workspace_usage(&id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    Ok(WorkspaceType {
      record,
      used_storage_quota: usage.used_storage_quota,
      member_count: usage.member_count,
    })
  }

  async fn app_config(&self, ctx: &Context<'_>) -> Result<JsonObjectScalar> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let cfg = state
      .app_config
      .get_effective_app_config()
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(JsonObjectScalar(cfg))
  }
}

async fn publish_quota_storage_invalidation(state: &AppState, workspace_id: &str) {
  let owner_id: Option<String> = sqlx::query_scalar(
    "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_optional(state.db.pool())
  .await
  .ok()
  .flatten();

  let _ = state
    .invalidation
    .publish_invalidation(&InvalidationHintV1::QuotaStorageUsage {
      subject: format!("workspace:{workspace_id}"),
    })
    .await;
  if let Some(ref owner) = owner_id {
    let _ = state
      .invalidation
      .publish_invalidation(&InvalidationHintV1::QuotaStorageUsage {
        subject: format!("user:{owner}"),
      })
      .await;
  }

  let prefix = match state.config.load().deployment_mode {
    DeploymentMode::Selfhosted => "selfhosted",
    DeploymentMode::Cloud => "cloud",
  };
  let req1 = format!("{prefix}:event:{}", uuid::Uuid::new_v4());
  let _ = state
    .event_bus
    .publish_event(
      "realtime.topic.changed",
      serde_json::json!({
        "event": { "changed": true, "reason": "runtime-invalidation" },
        "input": { "workspaceId": workspace_id },
        "room": format!("workspace:{workspace_id}:quota-state"),
        "topic": "workspace.quota-state.changed",
      }),
      Some(&req1),
    )
    .await;
  let req2 = format!("{prefix}:event:{}", uuid::Uuid::new_v4());
  let _ = state
    .event_bus
    .publish_event(
      "realtime.topic.changed",
      serde_json::json!({
        "event": { "changed": true, "reason": "quota-state-changed" },
        "input": { "workspaceId": workspace_id },
        "room": format!("workspace:{workspace_id}:access"),
        "topic": "workspace.access.changed",
      }),
      Some(&req2),
    )
    .await;
  if let Some(ref owner) = owner_id {
    let req3 = format!("{prefix}:event:{}", uuid::Uuid::new_v4());
    let _ = state
      .event_bus
      .publish_event(
        "realtime.topic.changed",
        serde_json::json!({
          "event": { "changed": true, "reason": "runtime-invalidation" },
          "input": {},
          "room": format!("user:{owner}:quota-state"),
          "topic": "user.quota-state.changed",
        }),
        Some(&req3),
      )
      .await;
  }
}

pub struct MutationRoot;

#[Object(name = "Mutation")]
impl MutationRoot {
  async fn create_workspace(&self, ctx: &Context<'_>) -> Result<WorkspaceType> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let record = state
      .workspaces
      .create_workspace(&user.id, None)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(WorkspaceType {
      record,
      used_storage_quota: 0,
      member_count: 1,
    })
  }

  async fn update_app_config(&self, ctx: &Context<'_>, updates: Vec<UpdateAppConfigInput>) -> Result<JsonObjectScalar> {
    let admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let domain_updates: Vec<AppConfigUpdate> = updates
      .into_iter()
      .map(|u| {
        let full_key = format!("{}.{}", u.module.trim(), u.key.trim());
        let value = if u.clear.unwrap_or(false) {
          None
        } else {
          u.value.map(|j| j.0)
        };
        AppConfigUpdate { key: full_key, value }
      })
      .collect();
    let effective = state
      .app_config
      .update_app_config(Some(&admin.id), &domain_updates)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(JsonObjectScalar(effective))
  }

  async fn send_test_email(&self, ctx: &Context<'_>, config: JsonObjectScalar) -> Result<bool> {
    let admin = require_admin_user(ctx).await?;
    let smtp_cfg: SmtpConfig = serde_json::from_value(config.0)
      .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid SMTP config: {e}"))))?;
    let mailer = SmtpMailer::new(&smtp_cfg)
      .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid SMTP config: {e}"))))?;
    let rendered = MailTemplate::TestMail(TestMailProps {}).render();
    match mailer.send(&admin.email, &rendered).await {
      MailSendResult::Accepted { .. } => Ok(true),
      MailSendResult::Rejected {
        provider_response,
        error_code,
      } => Err(domain_error_to_graphql(&DomainError::Validation(format!(
        "test email rejected ({error_code}): {}",
        provider_response.unwrap_or_default()
      )))),
      MailSendResult::Failed { error_code, error, .. } => Err(domain_error_to_graphql(&DomainError::Unavailable(
        format!("test email failed ({error_code}): {error}"),
      ))),
    }
  }

  async fn invite_members(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    emails: Vec<String>,
  ) -> Result<Vec<InviteResult>> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let resolved_source = if let Some(headers) = ctx.data_opt::<axum::http::HeaderMap>() {
      let app_cfg = state
        .app_config
        .get_effective_app_config()
        .await
        .map_err(|e| domain_error_to_graphql(&e))?;
      let trusted_cf = app_cfg
        .pointer("/auth/trustedCloudflareHeaders")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
      Some(crate::rest::extract_request_source(headers, trusted_cf))
    } else {
      ctx.data_opt::<server_spi::RequestSource>().cloned()
    };
    let source = resolved_source.as_ref();
    let batch = state
      .workspaces
      .invite_members_with_source(&user.id, &workspace_id, &emails, WorkspaceRole::Member, source)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let results = batch
      .into_iter()
      .map(|(email, outcome)| match outcome {
        Ok(inv) => InviteResult {
          email,
          invite_id: Some(inv.id),
          error: None,
        },
        Err(err) => {
          let env = crate::legacy_compat::errors::domain_error_to_envelope(&err);
          InviteResult {
            email,
            invite_id: None,
            error: Some(JsonObjectScalar(serde_json::to_value(env).unwrap_or_default())),
          }
        }
      })
      .collect();
    Ok(results)
  }

  async fn revoke_member(&self, ctx: &Context<'_>, workspace_id: String, user_id: String) -> Result<bool> {
    let actor = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .workspaces
      .revoke_member(&actor.id, &workspace_id, &user_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(true)
  }

  async fn accept_invite_by_id(
    &self,
    ctx: &Context<'_>,
    invite_id: String,
    _send_accept_mail: Option<bool>,
    _workspace_id: Option<String>,
  ) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .workspaces
      .accept_invitation(&user.id, &invite_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(true)
  }

  async fn set_blob(&self, ctx: &Context<'_>, workspace_id: String, blob: Upload) -> Result<String> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .workspaces
      .require_active_member_role(&workspace_id, &user.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let mut upload = blob
      .value(ctx)
      .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid blob upload: {e}"))))?;
    let filename = upload.filename.clone();
    let mime = upload
      .content_type
      .clone()
      .filter(|s| !s.trim().is_empty())
      .unwrap_or_else(|| "application/octet-stream".to_owned());
    let mut bytes = Vec::new();
    upload
      .content
      .read_to_end(&mut bytes)
      .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("failed to read blob upload: {e}"))))?;
    let outcome = state
      .blobs
      .put_blob(&workspace_id, &filename, &mime, bytes)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    if matches!(outcome, PutBlobOutcome::Created(_)) {
      publish_quota_storage_invalidation(state, &workspace_id).await;
    }
    Ok(filename)
  }

  async fn delete_blob(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    key: Option<String>,
    hash: Option<String>,
    #[graphql(default = false)] permanently: bool,
  ) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let Some(blob_key) = key.or(hash).filter(|k| !k.is_empty()) else {
      state
        .blobs
        .check_blobs_manage(&user.id, &workspace_id)
        .await
        .map_err(|e| domain_error_to_graphql(&e))?;
      return Ok(false);
    };
    let deleted = state
      .blobs
      .delete_blob_authorized(&user.id, &workspace_id, &blob_key, permanently)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    if deleted {
      publish_quota_storage_invalidation(state, &workspace_id).await;
    }
    Ok(deleted)
  }

  async fn release_deleted_blobs(&self, ctx: &Context<'_>, workspace_id: String) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let released = state
      .blobs
      .release_deleted_blobs_authorized(&user.id, &workspace_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    if released > 0 {
      publish_quota_storage_invalidation(state, &workspace_id).await;
    }
    Ok(true)
  }
}

pub fn build_schema(state: Arc<AppState>) -> AppSchema {
  Schema::build(QueryRoot, MutationRoot, EmptySubscription)
    .data(state)
    .finish()
}

#[cfg(test)]
mod tests {
  use async_graphql::{Request, Value};
  use server_db::{DbConfig, ServerDb};
  use server_spi::CommunityExtension;
  use server_types::ServerRole;

  use super::*;
  use crate::RuntimeConfig;

  #[test]
  fn workspace_query_enforces_fail_closed_auth_and_returns_quota_when_authorized() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations = test_db_harness::migrations::MigrationSet {
      migrations: vec![],
      digest: "5e20000000000002".into(),
    };
    let template = cluster.ensure_template(&migrations).expect("ensure empty template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test database");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_multi_thread()
      .enable_all()
      .build()
      .expect("build tokio runtime");

    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: ServerRole::Graphql,
        selfhosted: true,
        max_connections: 2,
        statement_timeout_ms: 5_000,
        tier_permits: [4, 2, 2, 1],
      })
      .await
      .expect("connect test db");

      let state = AppState::new(
        db.clone(),
        None,
        RuntimeConfig {
          role: ServerRole::Graphql,
          ..RuntimeConfig::default()
        },
        Arc::new(CommunityExtension::new()),
      );
      let schema = build_schema(state);

      // 1. Anonymous currentUser -> null; anonymous workspace -> AUTHENTICATION_REQUIRED (401)
      let cur_resp = schema.execute(Request::new("{ currentUser { id } }")).await;
      assert!(cur_resp.errors.is_empty());
      assert_eq!(
        serde_json::to_value(&cur_resp.data).unwrap(),
        serde_json::json!({ "currentUser": null })
      );

      let anon_ws = schema
        .execute(Request::new("{ workspace(id: \"ws-1\") { id } }"))
        .await;
      assert_eq!(anon_ws.errors.len(), 1);
      let ext = anon_ws.errors[0].extensions.as_ref().expect("extensions");
      assert_eq!(ext.get("status"), Some(&Value::from(401)));
      assert_eq!(ext.get("type"), Some(&Value::from("AUTHENTICATION_REQUIRED")));

      // 2. Authenticated without workspace authorization (or wrong workspace_id) -> ACTION_FORBIDDEN (403)
      let unauthz_ws = schema
        .execute(
          Request::new("{ workspace(id: \"ws-1\") { id } }").data(AuthenticatedUser {
            user_id: "user-1".into(),
            user: None,
          }),
        )
        .await;
      assert_eq!(unauthz_ws.errors.len(), 1);
      let ext = unauthz_ws.errors[0].extensions.as_ref().expect("extensions");
      assert_eq!(ext.get("status"), Some(&Value::from(403)));
      assert_eq!(ext.get("type"), Some(&Value::from("ACTION_FORBIDDEN")));

      let wrong_ws = schema
        .execute(
          Request::new("{ workspace(id: \"ws-other\") { id } }")
            .data(AuthenticatedUser {
              user_id: "user-1".into(),
              user: None,
            })
            .data(AuthorizedWorkspaceUsage {
              workspace_id: "ws-1".into(),
              used_storage_quota: 0,
              member_count: 1,
            }),
        )
        .await;
      assert_eq!(wrong_ws.errors.len(), 1);
      let ext = wrong_ws.errors[0].extensions.as_ref().expect("extensions");
      assert_eq!(ext.get("status"), Some(&Value::from(403)));
      assert_eq!(ext.get("type"), Some(&Value::from("ACTION_FORBIDDEN")));

      // 3. Authenticated + authorized workspace usage -> returns exact WorkspaceQuotaType
      let ok_resp = schema
        .execute(
          Request::new(
            "{ currentUser { id } workspace(id: \"ws-1\") { id quota { name blobLimit storageQuota usedStorageQuota historyPeriod memberLimit memberCount overcapacityMemberCount humanReadable { name blobLimit storageQuota storageQuotaUsed historyPeriod memberLimit memberCount overcapacityMemberCount } } } }",
          )
          .data(AuthenticatedUser {
            user_id: "user-1".into(),
            user: None,
          })
          .data(AuthorizedWorkspaceUsage {
            workspace_id: "ws-1".into(),
            used_storage_quota: 104_857_600,
            member_count: 3,
          }),
        )
        .await;
      assert!(ok_resp.errors.is_empty(), "errors: {:?}", ok_resp.errors);
      let data = serde_json::to_value(&ok_resp.data).unwrap();
      assert_eq!(data["currentUser"]["id"], "user-1");
      assert_eq!(data["workspace"]["id"], "ws-1");
      let q = &data["workspace"]["quota"];
      assert_eq!(q["name"], "Pro");
      assert_eq!(q["blobLimit"], 104_857_600);
      assert_eq!(q["storageQuota"], 107_374_182_400_i64);
      assert_eq!(q["usedStorageQuota"], 104_857_600);
      assert_eq!(q["historyPeriod"], 2_592_000);
      assert_eq!(q["memberLimit"], 10);
      assert_eq!(q["memberCount"], 3);
      assert_eq!(q["overcapacityMemberCount"], 0);
      assert_eq!(q["humanReadable"]["blobLimit"], "100 MB");
      assert_eq!(q["humanReadable"]["storageQuota"], "100 GB");
      assert_eq!(q["humanReadable"]["storageQuotaUsed"], "100 MB");
      assert_eq!(q["humanReadable"]["historyPeriod"], "30 days");

      // 4. Lazy field-level SafeInt validation:
      let name_only_resp = schema
        .execute(
          Request::new("{ workspace(id: \"ws-1\") { quota { name } } }")
            .data(AuthenticatedUser {
              user_id: "user-1".into(),
              user: None,
            })
            .data(AuthorizedWorkspaceUsage {
              workspace_id: "ws-1".into(),
              used_storage_quota: server_types::license::MAX_SAFE_INT + 1,
              member_count: 1,
            }),
        )
        .await;
      assert!(
        name_only_resp.errors.is_empty(),
        "querying quota.name must succeed even when usedStorageQuota overflows: {:?}",
        name_only_resp.errors
      );
      assert_eq!(
        serde_json::to_value(&name_only_resp.data).unwrap()["workspace"]["quota"]["name"],
        "Pro"
      );

      let overflow_resp = schema
        .execute(
          Request::new("{ workspace(id: \"ws-1\") { quota { usedStorageQuota } } }")
            .data(AuthenticatedUser {
              user_id: "user-1".into(),
              user: None,
            })
            .data(AuthorizedWorkspaceUsage {
              workspace_id: "ws-1".into(),
              used_storage_quota: server_types::license::MAX_SAFE_INT + 1,
              member_count: 1,
            }),
        )
        .await;
      assert_eq!(
        overflow_resp.errors.len(),
        1,
        "out-of-range SafeInt must return a GraphQL error"
      );
      assert_eq!(
        overflow_resp.errors[0].message,
        "SafeInt cannot represent unsafe integer value: 9007199254740992"
      );
      assert_eq!(
        overflow_resp.errors[0].path,
        vec![
          async_graphql::PathSegment::Field("workspace".to_owned()),
          async_graphql::PathSegment::Field("quota".to_owned()),
          async_graphql::PathSegment::Field("usedStorageQuota".to_owned()),
        ]
      );
      let ext = overflow_resp.errors[0]
        .extensions
        .as_ref()
        .expect("SafeInt overflow error extensions");
      assert_eq!(ext.get("status"), Some(&Value::from(500)));
      assert_eq!(ext.get("code"), Some(&Value::from("Internal Server Error")));
      assert_eq!(ext.get("type"), Some(&Value::from("INTERNAL_SERVER_ERROR")));
      assert_eq!(ext.get("name"), Some(&Value::from("INTERNAL_SERVER_ERROR")));
      assert_eq!(ext.get("message"), Some(&Value::from("An internal error occurred.")));
      assert_eq!(
        serde_json::to_value(&overflow_resp.data).unwrap(),
        serde_json::Value::Null,
        "non-null error on usedStorageQuota! -> quota! -> workspace! must bubble to data: null"
      );

      db.pool().close().await;
    });
  }

  #[test]
  fn user_quota_respects_billing_subject_without_entitlements_query() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load prisma migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure migrated template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test database");
    let db_url = lease.url().to_owned();

    struct BillingSubjectQuotaGate {
      grants: std::collections::HashMap<String, (server_types::BillingSubject, bool)>,
    }

    #[async_trait::async_trait]
    impl server_spi::QuotaGate for BillingSubjectQuotaGate {
      async fn resolve_workspace_grant(
        &self,
        _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        workspace_id: &str,
        _now: DateTime<Utc>,
      ) -> std::result::Result<server_types::AccessGrant, DomainError> {
        let mut grant = server_types::license::default_selfhost_access_grant();
        if let Some(&(billing_subject, commercial)) = self.grants.get(workspace_id) {
          grant.billing_subject = billing_subject;
          grant.rights.commercial = commercial;
        }
        Ok(grant)
      }

      async fn check_seat_admission(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        workspace_id: &str,
        current_active_seats: i32,
        adding_seats: i32,
        now: DateTime<Utc>,
      ) -> std::result::Result<server_types::AccessGrant, DomainError> {
        server_spi::CommunityQuotaGate
          .check_seat_admission(tx, workspace_id, current_active_seats, adding_seats, now)
          .await
      }
    }

    struct BillingSubjectExtension {
      base: CommunityExtension,
      gate: Arc<dyn server_spi::QuotaGate>,
    }

    impl server_spi::ServerExtension for BillingSubjectExtension {
      fn edition_name(&self) -> &'static str {
        "test-billing-subject"
      }

      fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
        Arc::clone(&self.gate)
      }

      fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
        self.base.session_policy()
      }

      fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
        self.base.copilot_policy()
      }
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
      .enable_all()
      .build()
      .expect("build tokio runtime");

    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: ServerRole::Graphql,
        selfhosted: true,
        max_connections: 2,
        statement_timeout_ms: 5_000,
        tier_permits: [4, 2, 2, 1],
      })
      .await
      .expect("connect test db");

      let user_id = uuid::Uuid::new_v4().to_string();
      let ws_owner_non_commercial = uuid::Uuid::new_v4().to_string();
      let ws_owner_commercial = uuid::Uuid::new_v4().to_string();
      let ws_billed_non_commercial = uuid::Uuid::new_v4().to_string();
      let ws_billed_commercial = uuid::Uuid::new_v4().to_string();
      sqlx::query(
        "INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, 'Quota User', $2, true, false)",
      )
      .bind(&user_id)
      .bind(format!("quota-{}@affine.test", &user_id[..8]))
      .execute(db.pool())
      .await
      .expect("insert user");

      let cases = [
        (
          &ws_owner_non_commercial,
          server_types::BillingSubject::Owner,
          false,
          1_000_i64,
        ),
        (
          &ws_owner_commercial,
          server_types::BillingSubject::Owner,
          true,
          2_000_i64,
        ),
        (
          &ws_billed_non_commercial,
          server_types::BillingSubject::Workspace,
          false,
          4_000_i64,
        ),
        (
          &ws_billed_commercial,
          server_types::BillingSubject::Workspace,
          true,
          8_000_i64,
        ),
      ];
      let mut grants = std::collections::HashMap::new();
      for (ws_id, billing_subject, commercial, blob_size) in cases {
        grants.insert(ws_id.clone(), (billing_subject, commercial));
        sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
          .bind(ws_id)
          .execute(db.pool())
          .await
          .expect("insert workspace");
        sqlx::query(
          "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state) \
           VALUES ($1, $2, $3, 'owner', 'legacy', 'active')",
        )
        .bind(format!("perm_{}", uuid::Uuid::new_v4().simple()))
        .bind(ws_id)
        .bind(&user_id)
        .execute(db.pool())
        .await
        .expect("insert workspace owner");
        sqlx::query(
          "INSERT INTO blobs (workspace_id, key, size, mime, status) VALUES ($1, 'b1', $2, 'text/plain', 'completed')",
        )
        .bind(ws_id)
        .bind(blob_size)
        .execute(db.pool())
        .await
        .expect("insert blob");
      }

      let ext = Arc::new(BillingSubjectExtension {
        base: CommunityExtension::new(),
        gate: Arc::new(BillingSubjectQuotaGate { grants }),
      });
      let state = AppState::new(
        db.clone(),
        None,
        RuntimeConfig {
          role: ServerRole::Graphql,
          ..RuntimeConfig::default()
        },
        ext,
      );
      let schema = build_schema(state);

      let resp = schema
        .execute(
          Request::new("{ currentUser { quota { usedStorageQuota } } }").data(AuthenticatedUser {
            user_id: user_id.clone(),
            user: None,
          }),
        )
        .await;
      assert!(resp.errors.is_empty(), "errors: {:?}", resp.errors);
      let data = serde_json::to_value(&resp.data).unwrap();
      assert_eq!(
        data["currentUser"]["quota"]["usedStorageQuota"], 3_000,
        "exact BillingSubject::Owner workspaces (1_000 + 2_000) must count toward user storage quota"
      );

      db.pool().close().await;
    });
  }

  #[test]
  fn invite_members_enforces_auth_first_domain_name_policy_512_cap_and_mixed_batch() {
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct CountingRateLimitPolicy {
      calls: Arc<AtomicUsize>,
    }
    #[async_trait::async_trait]
    impl server_spi::RateLimitPolicy for CountingRateLimitPolicy {
      async fn check_auth_mail(
        &self,
        _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        _mail_name: &str,
        _normalized_email: &str,
        _recipient_user_id: Option<&str>,
        _source: Option<&server_spi::RequestSource>,
        _now: chrono::DateTime<chrono::Utc>,
      ) -> std::result::Result<(), server_types::DomainError> {
        Ok(())
      }

      async fn check_workspace_invite(
        &self,
        _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        _workspace_id: &str,
        _inviter_id: &str,
        _target_emails: &[&str],
        _source: Option<&server_spi::RequestSource>,
        _now: chrono::DateTime<chrono::Utc>,
      ) -> std::result::Result<(), server_types::DomainError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(())
      }
    }

    struct CountingRateLimitExtension {
      base: CommunityExtension,
      policy: Arc<dyn server_spi::RateLimitPolicy>,
    }
    impl server_spi::ServerExtension for CountingRateLimitExtension {
      fn edition_name(&self) -> &'static str {
        self.base.edition_name()
      }
      fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
        self.base.quota_gate()
      }
      fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
        self.base.session_policy()
      }
      fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
        self.base.copilot_policy()
      }
      fn rate_limit_policy(&self) -> Arc<dyn server_spi::RateLimitPolicy> {
        Arc::clone(&self.policy)
      }
    }

    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test PG cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load Prisma migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let leased = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = leased.url().to_owned();

    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: ServerRole::Graphql,
        selfhosted: true,
        max_connections: 2,
        statement_timeout_ms: 5_000,
        tier_permits: [4, 2, 2, 1],
      })
      .await
      .expect("connect ServerDb");

      let owner_id = format!("usr_{}", uuid::Uuid::new_v4().simple());
      let outsider_id = format!("usr_{}", uuid::Uuid::new_v4().simple());
      let existing_member_id = format!("usr_{}", uuid::Uuid::new_v4().simple());
      for (uid, email) in [
        (&owner_id, "owner@affine.test"),
        (&outsider_id, "outsider@affine.test"),
        (&existing_member_id, "already@affine.test"),
      ] {
        sqlx::query("INSERT INTO users(id, name, email, registered) VALUES ($1, 'User', $2, true)")
          .bind(uid)
          .bind(email)
          .execute(db.pool())
          .await
          .unwrap();
      }

      let clean_ws = format!("ws_{}", uuid::Uuid::new_v4().simple());
      let domain_ws = format!("ws_{}", uuid::Uuid::new_v4().simple());
      let confusable_ws = format!("ws_{}", uuid::Uuid::new_v4().simple());
      for (ws_id, name) in [
        (&clean_ws, "Clean Workspace"),
        (&domain_ws, "Team evil.com"),
        (&confusable_ws, "Team \u{0435}vil。com"),
      ] {
        sqlx::query("INSERT INTO workspaces(id, name) VALUES ($1, $2)")
          .bind(ws_id)
          .bind(name)
          .execute(db.pool())
          .await
          .unwrap();
        sqlx::query(
          "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state) \
           VALUES ($1, $2, $3, 'owner', 'legacy', 'active')",
        )
        .bind(format!("perm_{}", uuid::Uuid::new_v4().simple()))
        .bind(ws_id)
        .bind(&owner_id)
        .execute(db.pool())
        .await
        .unwrap();
      }
      sqlx::query(
        "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state) \
         VALUES ($1, $2, $3, 'member', 'legacy', 'active')",
      )
      .bind(format!("perm_{}", uuid::Uuid::new_v4().simple()))
      .bind(&clean_ws)
      .bind(&existing_member_id)
      .execute(db.pool())
      .await
      .unwrap();

      let rl_calls = Arc::new(AtomicUsize::new(0));
      let ext = Arc::new(CountingRateLimitExtension {
        base: CommunityExtension::new(),
        policy: Arc::new(CountingRateLimitPolicy {
          calls: Arc::clone(&rl_calls),
        }),
      });
      let state = AppState::new(
        db.clone(),
        None,
        RuntimeConfig {
          role: ServerRole::Graphql,
          ..RuntimeConfig::default()
        },
        ext,
      );
      let schema = build_schema(state);

      // 1. Unauthorized outsider passing empty emails: [] MUST still fail with 403 ACTION_FORBIDDEN.
      let resp = schema
        .execute(
          Request::new(format!(
            r#"mutation {{ inviteMembers(workspaceId: "{clean_ws}", emails: []) {{ email inviteId error }} }}"#
          ))
          .data(AuthenticatedUser {
            user_id: outsider_id.clone(),
            user: None,
          }),
        )
        .await;
      assert_eq!(resp.errors.len(), 1);
      assert_eq!(
        resp.errors[0].extensions.as_ref().unwrap().get("status"),
        Some(&async_graphql::Value::from(403))
      );
      assert_eq!(rl_calls.load(Ordering::SeqCst), 0);

      // 2. Domain-named & Unicode-confusable workspace names MUST fail with 403 and zero rate-limit / DB writes.
      for ws_id in [&domain_ws, &confusable_ws] {
        let resp = schema
          .execute(
            Request::new(format!(
              r#"mutation {{ inviteMembers(workspaceId: "{ws_id}", emails: ["ok@affine.test"]) {{ email inviteId error }} }}"#
            ))
            .data(AuthenticatedUser {
              user_id: owner_id.clone(),
              user: None,
            }),
          )
          .await;
        assert_eq!(resp.errors.len(), 1, "ws {ws_id} must be rejected");
        assert_eq!(
          resp.errors[0].extensions.as_ref().unwrap().get("status"),
          Some(&async_graphql::Value::from(403))
        );
      }
      assert_eq!(rl_calls.load(Ordering::SeqCst), 0);

      // 3. 513 emails MUST immediately return 429 TOO_MANY_REQUESTS with zero rate-limit / DB writes.
      let too_many: Vec<String> = (0..513).map(|i| format!(r#""u{i}@affine.test""#)).collect();
      let resp = schema
        .execute(
          Request::new(format!(
            r#"mutation {{ inviteMembers(workspaceId: "{clean_ws}", emails: [{}]) {{ email inviteId error }} }}"#,
            too_many.join(",")
          ))
          .data(AuthenticatedUser {
            user_id: owner_id.clone(),
            user: None,
          }),
        )
        .await;
      assert_eq!(resp.errors.len(), 1);
      assert_eq!(
        resp.errors[0].extensions.as_ref().unwrap().get("status"),
        Some(&async_graphql::Value::from(429))
      );
      assert_eq!(rl_calls.load(Ordering::SeqCst), 0);

      // 4. Mixed batch (invalid + valid + duplicate + existing member) returns exact per-item results
      //    and calls check_workspace_invite exactly once.
      let resp = schema
        .execute(
          Request::new(format!(
            r#"mutation {{ inviteMembers(workspaceId: "{clean_ws}", emails: ["not-an-email", "fresh@affine.test", "FRESH@affine.test", "already@affine.test"]) {{ email inviteId error }} }}"#
          ))
          .data(AuthenticatedUser {
            user_id: owner_id.clone(),
            user: None,
          }),
        )
        .await;
      assert!(resp.errors.is_empty(), "mixed batch errors: {:?}", resp.errors);
      let data = serde_json::to_value(&resp.data).unwrap();
      let items = data["inviteMembers"].as_array().unwrap();
      assert_eq!(items.len(), 4);
      assert!(items[0]["inviteId"].is_null());
      assert_eq!(items[0]["error"]["status"], 400);
      assert_eq!(items[0]["error"]["type"], "INVALID_INPUT");
      assert!(items[1]["inviteId"].as_str().unwrap().starts_with("inv_"));
      assert!(items[1]["error"].is_null());
      assert!(items[2]["inviteId"].is_null());
      assert_eq!(items[2]["error"]["status"], 403);
      assert_eq!(items[2]["error"]["type"], "ACTION_FORBIDDEN");
      assert!(items[3]["inviteId"].is_null());
      assert_eq!(items[3]["error"]["type"], "RESOURCE_ALREADY_EXISTS");
      assert_eq!(rl_calls.load(Ordering::SeqCst), 1);

      db.pool().close().await;
    });
  }
}
