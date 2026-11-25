//! `async-graphql 7` root schema aligned with `v0.27.5` `schema.gql`.

pub mod admin;
pub mod auth;
pub mod billing;
pub mod blob;
pub mod byok;
pub mod calendar;
pub mod comment;
pub mod copilot;
pub mod doc;
pub mod license;
pub mod mcp;
pub mod notification;
pub mod search;
pub mod user;
pub mod workspace;

use std::sync::Arc;

use async_graphql::{
  Context, EmptySubscription, InputValueError, InputValueResult, MergedObject, Object, Result, Scalar, ScalarType,
  Schema, Upload, Value,
};
use serde::{Deserialize, Serialize};
use server_domain::users::CurrentUserView;
use server_types::DomainError;

use crate::AppState;
use crate::legacy_compat::errors::{domain_error_to_graphql, envelope_to_graphql};
use crate::rest::version_guard::VersionGuardError;

pub use admin::{
  CredentialsRequirementType, FeatureType, PasswordLimitsType, ServerConfigType, ServerDeploymentType, ServerFeature,
  UpdateAppConfigInput,
};
pub use blob::{BlobUploadInit, BlobUploadMethod, BlobUploadedPart, ListedBlob};
pub use user::{
  DeleteAccount, LimitedUserType, PublicUserType, RemoveAvatar, UpdateUserInput, UpdateUserSettingsInput,
  UserOrLimitedUser, UserSettingsType, UserType, WorkspaceUserType,
};
pub use workspace::{
  DocPermissions, InvitationType, InvitationWorkspaceType, InviteLink, InviteResult, InviteUserType, Permission,
  UpdateWorkspaceInput, WorkspaceInviteLinkExpireTime, WorkspaceMemberStatus, WorkspacePermissions, WorkspaceType,
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

/// Request-scoped authorized workspace usage snapshot injected for unit tests.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorizedWorkspaceUsage {
  pub workspace_id: String,
  pub used_storage_quota: i64,
  pub member_count: i32,
}

pub(crate) fn graphql_request_id(state: &AppState) -> String {
  let deployment = match state.config.load().deployment_mode {
    server_types::DeploymentMode::Cloud => "cloud",
    server_types::DeploymentMode::Selfhosted => "selfhosted",
  };
  format!("{deployment}:graphql:{}", uuid::Uuid::new_v4())
}

/// Request-scoped cookie version rejection stored when a GraphQL request's
/// cookie session failed `client.versionControl` so `@Public()` queries see
/// anonymous `None` while protected resolvers return `403 UNSUPPORTED_CLIENT_VERSION`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RejectedCookieVersion(pub VersionGuardError);

/// Request-scoped principal resolution failure (e.g. Bearer version rejection
/// or invalid access token) enforced per root GraphQL field so `async-graphql`
/// attaches exact field `path` and preserves nullable vs non-null `data` semantics.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RejectedGraphqlAuth(pub crate::legacy_compat::errors::LegacyErrorEnvelope);

#[derive(Clone, Debug)]
pub(crate) struct ResolvedGraphqlPrincipal {
  pub(crate) auth: Option<AuthenticatedUser>,
  pub(crate) session_id: Option<String>,
  pub(crate) rejected_cookie_version: Option<VersionGuardError>,
}

/// Request-scoped lazy principal resolver for GraphQL HTTP requests.
/// Runs `resolve_request_principal_with_policy` at most once and only when
/// at least one non-introspection root `Query`/`Mutation` field actually executes,
/// so syntax/validation errors, `{ __typename }`, and `@skip(if: true)` queries
/// never trigger DB writes or session revocations.
#[derive(Clone)]
pub(crate) struct LazyGraphqlPrincipal {
  state: crate::RouterState,
  headers: axum::http::HeaderMap,
  peer_addr: Option<std::net::SocketAddr>,
  resolved: Arc<
    tokio::sync::OnceCell<
      std::result::Result<ResolvedGraphqlPrincipal, crate::legacy_compat::errors::LegacyErrorEnvelope>,
    >,
  >,
  cookie_action: Arc<std::sync::Mutex<crate::rest::PrincipalCookieAction>>,
  http_error: Arc<std::sync::Mutex<Option<axum::response::Response>>>,
  throttle_headers: Arc<std::sync::Mutex<(Option<crate::rest::throttle::ThrottleHeaders>, Option<u64>)>>,
}

impl LazyGraphqlPrincipal {
  pub(crate) fn new(
    state: crate::RouterState,
    headers: axum::http::HeaderMap,
    peer_addr: Option<std::net::SocketAddr>,
  ) -> Self {
    Self {
      state,
      headers,
      peer_addr,
      resolved: Arc::new(tokio::sync::OnceCell::new()),
      cookie_action: Arc::new(std::sync::Mutex::new(crate::rest::PrincipalCookieAction::None)),
      http_error: Arc::new(std::sync::Mutex::new(None)),
      throttle_headers: Arc::new(std::sync::Mutex::new((None, None))),
    }
  }

  pub(crate) fn peer_addr(&self) -> Option<std::net::SocketAddr> {
    self.peer_addr
  }

  pub(crate) fn record_throttle_outcome(&self, outcome: crate::rest::throttle::ThrottleOutcome) {
    if let Ok(mut guard) = self.throttle_headers.lock() {
      match outcome {
        crate::rest::throttle::ThrottleOutcome::Allowed(h) => guard.0 = Some(h),
        crate::rest::throttle::ThrottleOutcome::Limited { retry_after_secs } => guard.1 = Some(retry_after_secs),
        crate::rest::throttle::ThrottleOutcome::Disabled => {}
      }
    }
  }

  pub(crate) fn throttle_headers(&self) -> (Option<crate::rest::throttle::ThrottleHeaders>, Option<u64>) {
    self.throttle_headers.lock().ok().map(|g| *g).unwrap_or((None, None))
  }

  pub(crate) async fn resolve_once(
    &self,
  ) -> &std::result::Result<ResolvedGraphqlPrincipal, crate::legacy_compat::errors::LegacyErrorEnvelope> {
    self
      .resolved
      .get_or_init(|| async {
        match crate::rest::resolve_request_principal_with_policy(&self.state, &self.headers, true).await {
          Ok(resolved) => {
            if let Ok(mut guard) = self.cookie_action.lock() {
              *guard = resolved.cookie_action;
            }
            let (auth, session_id) = match resolved.principal {
              Some(p) => {
                let sid = match &p {
                  crate::rest::RequestPrincipal::Cookie { session_id, .. }
                  | crate::rest::RequestPrincipal::Bearer { session_id, .. } => Some(session_id.clone()),
                };
                let user = p.into_user();
                (
                  Some(AuthenticatedUser {
                    user_id: user.id.clone(),
                    user: Some(user),
                  }),
                  sid,
                )
              }
              None => (None, None),
            };
            Ok(ResolvedGraphqlPrincipal {
              auth,
              session_id,
              rejected_cookie_version: resolved.rejected_cookie_version,
            })
          }
          Err(crate::rest::PrincipalResolutionError::VersionGuard { error, clear_cookies }) => {
            if clear_cookies && let Ok(mut guard) = self.cookie_action.lock() {
              *guard = crate::rest::PrincipalCookieAction::Clear;
            }
            Err(error.into_envelope())
          }
          Err(crate::rest::PrincipalResolutionError::AccessToken(code)) => {
            let (env, _) = crate::rest::PrincipalResolutionError::AccessToken(code).into_envelope();
            if let Ok(mut guard) = self.http_error.lock() {
              *guard = Some(crate::rest::PrincipalResolutionError::AccessToken(code).into_http_response());
            }
            Err(env)
          }
          Err(crate::rest::PrincipalResolutionError::Domain(err)) => {
            Err(crate::legacy_compat::errors::domain_error_to_envelope(&err))
          }
        }
      })
      .await
  }

  pub(crate) fn resolved_sync(&self) -> Option<&ResolvedGraphqlPrincipal> {
    self.resolved.get().and_then(|res| res.as_ref().ok())
  }
}

pub(crate) async fn enforce_default_throttle_if_anonymous_graphql(ctx: &Context<'_>) -> Result<()> {
  let lazy = ctx.data_opt::<LazyGraphqlPrincipal>();
  if let Some(lazy) = lazy {
    if let Ok(resolved) = lazy.resolve_once().await
      && resolved.auth.is_some()
    {
      return Ok(());
    }
  } else if ctx.data_opt::<AuthenticatedUser>().is_some() {
    return Ok(());
  }
  let Some(state) = ctx.data_opt::<Arc<AppState>>() else {
    return Ok(());
  };
  let peer_addr = lazy.and_then(LazyGraphqlPrincipal::peer_addr);
  let headers = ctx.data_opt::<axum::http::HeaderMap>();
  let outcome = crate::rest::throttle::check_throttle_for_app(
    state,
    headers,
    peer_addr,
    None,
    crate::rest::throttle::ThrottleSpec::Default,
  )
  .await;
  if let Some(lazy) = lazy {
    lazy.record_throttle_outcome(outcome);
  }
  match outcome {
    crate::rest::throttle::ThrottleOutcome::Limited { .. } => {
      Err(envelope_to_graphql(crate::rest::throttle::too_many_requests_envelope()))
    }
    _ => Ok(()),
  }
}

pub(crate) async fn enforce_default_throttle_graphql(ctx: &Context<'_>) -> Result<()> {
  let Some(state) = ctx.data_opt::<Arc<AppState>>() else {
    return Ok(());
  };
  let lazy = ctx.data_opt::<LazyGraphqlPrincipal>();
  let session_id = if let Some(lazy) = lazy {
    match lazy.resolve_once().await {
      Ok(resolved) => resolved.session_id.clone(),
      Err(_) => None,
    }
  } else {
    None
  };
  let peer_addr = lazy.and_then(LazyGraphqlPrincipal::peer_addr);
  let headers = ctx.data_opt::<axum::http::HeaderMap>();
  let outcome = crate::rest::throttle::check_throttle_for_app(
    state,
    headers,
    peer_addr,
    session_id.as_deref(),
    crate::rest::throttle::ThrottleSpec::Default,
  )
  .await;
  if let Some(lazy) = lazy {
    lazy.record_throttle_outcome(outcome);
  }
  match outcome {
    crate::rest::throttle::ThrottleOutcome::Limited { .. } => {
      Err(envelope_to_graphql(crate::rest::throttle::too_many_requests_envelope()))
    }
    _ => Ok(()),
  }
}

pub(crate) async fn enforce_strict_throttle_graphql(ctx: &Context<'_>) -> Result<()> {
  let Some(state) = ctx.data_opt::<Arc<AppState>>() else {
    return Ok(());
  };
  let lazy = ctx.data_opt::<LazyGraphqlPrincipal>();
  let session_id = if let Some(lazy) = lazy {
    match lazy.resolve_once().await {
      Ok(resolved) => resolved.session_id.clone(),
      Err(_) => None,
    }
  } else {
    None
  };
  let peer_addr = lazy.and_then(LazyGraphqlPrincipal::peer_addr);
  let headers = ctx.data_opt::<axum::http::HeaderMap>();
  let outcome = crate::rest::throttle::check_throttle_for_app(
    state,
    headers,
    peer_addr,
    session_id.as_deref(),
    crate::rest::throttle::ThrottleSpec::Strict,
  )
  .await;
  if let Some(lazy) = lazy {
    lazy.record_throttle_outcome(outcome);
  }
  match outcome {
    crate::rest::throttle::ThrottleOutcome::Limited { .. } => {
      Err(envelope_to_graphql(crate::rest::throttle::too_many_requests_envelope()))
    }
    _ => Ok(()),
  }
}

impl LazyGraphqlPrincipal {
  pub(crate) fn cookie_action(&self) -> crate::rest::PrincipalCookieAction {
    self
      .cookie_action
      .lock()
      .map(|g| g.clone())
      .unwrap_or(crate::rest::PrincipalCookieAction::None)
  }

  pub(crate) fn take_http_error(&self) -> Option<axum::response::Response> {
    self.http_error.lock().ok().and_then(|mut g| g.take())
  }
}

pub(crate) fn current_authenticated_user(ctx: &Context<'_>) -> Option<AuthenticatedUser> {
  if let Some(lazy) = ctx.data_opt::<LazyGraphqlPrincipal>() {
    return lazy.resolved_sync().and_then(|r| r.auth.clone());
  }
  ctx.data_opt::<AuthenticatedUser>().cloned()
}

pub(crate) fn current_rejected_cookie_version(ctx: &Context<'_>) -> Option<VersionGuardError> {
  if let Some(lazy) = ctx.data_opt::<LazyGraphqlPrincipal>() {
    return lazy.resolved_sync().and_then(|r| r.rejected_cookie_version.clone());
  }
  ctx.data_opt::<RejectedCookieVersion>().map(|r| r.0.clone())
}

struct GraphqlAuthExtensionFactory;

struct GraphqlAuthExtension {
  deferred_errors: std::sync::Mutex<Vec<async_graphql::ServerError>>,
}

impl async_graphql::extensions::ExtensionFactory for GraphqlAuthExtensionFactory {
  fn create(&self) -> Arc<dyn async_graphql::extensions::Extension> {
    Arc::new(GraphqlAuthExtension {
      deferred_errors: std::sync::Mutex::new(Vec::new()),
    })
  }
}

impl async_graphql::extensions::Extension for GraphqlAuthExtension {
  fn execute<'life0, 'life1, 'life2, 'life3, 'life4, 'async_trait>(
    &'life0 self,
    ctx: &'life1 async_graphql::extensions::ExtensionContext<'life2>,
    operation_name: Option<&'life3 str>,
    next: async_graphql::extensions::NextExecute<'life4>,
  ) -> std::pin::Pin<Box<dyn std::future::Future<Output = async_graphql::Response> + Send + 'async_trait>>
  where
    'life0: 'async_trait,
    'life1: 'async_trait,
    'life2: 'async_trait,
    'life3: 'async_trait,
    'life4: 'async_trait,
    Self: 'async_trait,
  {
    Box::pin(async move {
      let mut resp = next.run(ctx, operation_name).await;
      if let Ok(mut errs) = self.deferred_errors.lock() {
        resp.errors.extend(errs.drain(..));
      }
      resp
    })
  }

  fn resolve<'life0, 'life1, 'life2, 'life3, 'life4, 'async_trait>(
    &'life0 self,
    ctx: &'life1 async_graphql::extensions::ExtensionContext<'life2>,
    info: async_graphql::extensions::ResolveInfo<'life3>,
    next: async_graphql::extensions::NextResolve<'life4>,
  ) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = async_graphql::ServerResult<Option<Value>>> + Send + 'async_trait>,
  >
  where
    'life0: 'async_trait,
    'life1: 'async_trait,
    'life2: 'async_trait,
    'life3: 'async_trait,
    'life4: 'async_trait,
    Self: 'async_trait,
  {
    Box::pin(async move {
      if info.path_node.parent.is_some() || info.name.starts_with("__") {
        return next.run(ctx, info).await;
      }
      if info.parent_type == "Query" || info.parent_type == "Mutation" {
        let rejected_env = if let Some(lazy) = ctx.data_opt::<LazyGraphqlPrincipal>() {
          lazy.resolve_once().await.as_ref().err().cloned()
        } else {
          ctx.data_opt::<RejectedGraphqlAuth>().map(|r| r.0.clone())
        };
        if let Some(env) = rejected_env {
          let response_key = match info.path_node.segment {
            async_graphql::QueryPathSegment::Name(name) => name,
            async_graphql::QueryPathSegment::Index(_) => info.name,
          };
          let pos = info.field.response_key().pos;
          let mut err = envelope_to_graphql(env).into_server_error(pos);
          err.path = vec![async_graphql::PathSegment::Field(response_key.to_owned())];
          if info.return_type.ends_with('!') {
            return Err(err);
          }
          if let Ok(mut errs) = self.deferred_errors.lock() {
            errs.push(err);
          }
          return Ok(Some(Value::Null));
        }
      }
      next.run(ctx, info).await
    })
  }
}

pub(crate) async fn require_authenticated_user(ctx: &Context<'_>) -> Result<CurrentUserView> {
  let Some(auth) = current_authenticated_user(ctx) else {
    if let Some(rejected) = current_rejected_cookie_version(ctx) {
      return Err(envelope_to_graphql(rejected.into_envelope()));
    }
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

pub(crate) async fn require_admin_user(ctx: &Context<'_>) -> Result<CurrentUserView> {
  let user = require_authenticated_user(ctx).await?;
  if !user.is_admin() {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    )));
  }
  Ok(user)
}

#[derive(Default)]
pub struct CoreQuery;

#[Object]
impl CoreQuery {
  async fn current_user(&self, ctx: &Context<'_>) -> Option<UserType> {
    user::resolve_current_user(ctx)
  }

  async fn user(&self, ctx: &Context<'_>, email: String) -> Result<Option<UserOrLimitedUser>> {
    user::resolve_user_by_email(ctx, email).await
  }

  async fn public_user_by_id(&self, ctx: &Context<'_>, id: String) -> Result<Option<PublicUserType>> {
    user::resolve_public_user_by_id(ctx, id).await
  }
}

#[derive(MergedObject, Default)]
#[graphql(name = "Query")]
pub struct QueryRoot(
  CoreQuery,
  auth::AuthQuery,
  admin::AdminQuery,
  workspace::WorkspaceQuery,
  mcp::McpQuery,
  billing::BillingQuery,
);

#[derive(Default)]
pub struct CoreMutation;

#[Object]
impl CoreMutation {
  async fn update_profile(&self, ctx: &Context<'_>, input: UpdateUserInput) -> Result<UserType> {
    user::mutate_update_profile(ctx, input).await
  }

  async fn upload_avatar(&self, ctx: &Context<'_>, avatar: Upload) -> Result<UserType> {
    user::mutate_upload_avatar(ctx, avatar).await
  }

  async fn remove_avatar(&self, ctx: &Context<'_>) -> Result<RemoveAvatar> {
    user::mutate_remove_avatar(ctx).await
  }

  async fn update_settings(&self, ctx: &Context<'_>, input: UpdateUserSettingsInput) -> Result<bool> {
    user::mutate_update_settings(ctx, input).await
  }

  async fn delete_account(&self, ctx: &Context<'_>) -> Result<DeleteAccount> {
    user::mutate_delete_account(ctx).await
  }

  async fn delete_user(&self, ctx: &Context<'_>, id: String) -> Result<DeleteAccount> {
    user::mutate_delete_user(ctx, id).await
  }
}

#[derive(MergedObject, Default)]
#[graphql(name = "Mutation")]
pub struct MutationRoot(
  CoreMutation,
  auth::AuthMutation,
  admin::AdminMutation,
  workspace::WorkspaceMutation,
  doc::DocMutation,
  blob::BlobMutation,
  comment::CommentMutation,
  notification::NotificationMutation,
  license::LicenseMutation,
  calendar::CalendarMutation,
  mcp::McpMutation,
  billing::BillingMutation,
  byok::ByokMutation,
  copilot::CopilotMutation,
);

pub fn build_schema(state: Arc<AppState>) -> AppSchema {
  Schema::build(QueryRoot::default(), MutationRoot::default(), EmptySubscription)
    .extension(GraphqlAuthExtensionFactory)
    .data(state)
    .finish()
}

#[cfg(test)]
mod tests {
  use async_graphql::{Request, Value};
  use chrono::{DateTime, Utc};
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
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .expect("reset schema");
      db.ensure_schema_ready().await.expect("ensure schema ready");

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
        server_spi::CommunityQuotaGate::new()
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
      ) -> std::result::Result<(), server_spi::RateLimitRejection> {
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

  #[test]
  fn merged_schema_sdl_preserves_registered_definitions() {
    use std::collections::{BTreeMap, BTreeSet};

    fn parse_sdl_blocks(sdl: &str) -> BTreeMap<String, BTreeSet<String>> {
      let mut defs: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
      let mut in_doc_block = false;
      let mut current_block: Option<String> = None;
      let mut pending_member = String::new();
      let mut paren_depth: i32 = 0;

      for raw_line in sdl.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
          continue;
        }
        if in_doc_block {
          if line.contains("\"\"\"") {
            in_doc_block = false;
          }
          continue;
        }
        if let Some(rest) = line.strip_prefix("\"\"\"") {
          if !rest.contains("\"\"\"") {
            in_doc_block = true;
          }
          continue;
        }
        if line.starts_with('"') && line.ends_with('"') && line.len() >= 2 {
          continue;
        }

        if let Some(block_key) = current_block.as_ref() {
          if line == "}" {
            if !pending_member.is_empty() {
              defs
                .entry(block_key.clone())
                .or_default()
                .insert(std::mem::take(&mut pending_member));
              paren_depth = 0;
            }
            current_block = None;
            continue;
          }
          if pending_member.is_empty() {
            pending_member.push_str(line);
          } else {
            pending_member.push(' ');
            pending_member.push_str(line);
          }
          for ch in line.chars() {
            match ch {
              '(' => paren_depth += 1,
              ')' => paren_depth -= 1,
              _ => {}
            }
          }
          if paren_depth <= 0 {
            defs
              .entry(block_key.clone())
              .or_default()
              .insert(std::mem::take(&mut pending_member));
            paren_depth = 0;
          }
          continue;
        }

        if let Some(header) = line.strip_suffix('{') {
          let key = header.trim().to_owned();
          defs.entry(key.clone()).or_default();
          current_block = Some(key);
        } else if line.starts_with("union ") || line.starts_with("scalar ") || line.starts_with("directive ") {
          let mut parts = line.split_whitespace();
          let kw = parts.next().unwrap_or_default();
          let name = parts
            .next()
            .unwrap_or_default()
            .split(['(', '='])
            .next()
            .unwrap_or_default();
          let key = format!("{kw} {name}");
          if key != "directive @deprecated" {
            defs.entry(key).or_default().insert(line.to_owned());
          }
        }
      }

      defs
    }

    fn strip_deprecated_directives(sig: &str) -> String {
      let bytes = sig.as_bytes();
      let mut out = String::with_capacity(sig.len());
      let mut i = 0;
      while i < bytes.len() {
        if sig[i..].starts_with("@deprecated") {
          i += "@deprecated".len();
          while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
          }
          if i < bytes.len() && bytes[i] == b'(' {
            let mut depth = 0i32;
            let mut in_str = false;
            while i < bytes.len() {
              let b = bytes[i];
              if in_str {
                if b == b'\\' {
                  i += 2;
                  continue;
                }
                if b == b'"' {
                  in_str = false;
                }
              } else if b == b'"' {
                in_str = true;
              } else if b == b'(' {
                depth += 1;
              } else if b == b')' {
                depth -= 1;
                i += 1;
                if depth == 0 {
                  break;
                }
                continue;
              }
              i += 1;
            }
          }
          continue;
        }
        let ch = sig[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
      }
      out.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn canonicalize_sdl_member(sig: &str) -> String {
      let cleaned = strip_deprecated_directives(sig);
      let Some(open_paren) = cleaned.find('(') else {
        return cleaned;
      };
      let bytes = cleaned.as_bytes();
      let mut depth = 0i32;
      let mut in_str = false;
      let mut close_paren = None;
      let mut i = open_paren;
      while i < bytes.len() {
        let b = bytes[i];
        if in_str {
          if b == b'\\' {
            i += 2;
            continue;
          }
          if b == b'"' {
            in_str = false;
          }
        } else if b == b'"' {
          in_str = true;
        } else if b == b'(' {
          depth += 1;
        } else if b == b')' {
          depth -= 1;
          if depth == 0 {
            close_paren = Some(i);
            break;
          }
        }
        i += 1;
      }
      let Some(close_paren) = close_paren else {
        return cleaned;
      };
      let prefix = cleaned[..open_paren].trim();
      let args_raw = &cleaned[open_paren + 1..close_paren];
      let suffix = cleaned[close_paren + 1..].trim();

      let mut args = Vec::new();
      let mut cur = String::new();
      let mut paren_d = 0i32;
      let mut bracket_d = 0i32;
      let mut brace_d = 0i32;
      let mut in_s = false;
      let mut chars = args_raw.chars().peekable();
      while let Some(c) = chars.next() {
        if in_s {
          cur.push(c);
          if c == '\\' {
            if let Some(esc) = chars.next() {
              cur.push(esc);
            }
          } else if c == '"' {
            in_s = false;
          }
          continue;
        }
        match c {
          '"' => {
            in_s = true;
            cur.push(c);
          }
          '(' => {
            paren_d += 1;
            cur.push(c);
          }
          ')' => {
            paren_d -= 1;
            cur.push(c);
          }
          '[' => {
            bracket_d += 1;
            cur.push(c);
          }
          ']' => {
            bracket_d -= 1;
            cur.push(c);
          }
          '{' => {
            brace_d += 1;
            cur.push(c);
          }
          '}' => {
            brace_d -= 1;
            cur.push(c);
          }
          ',' if paren_d == 0 && bracket_d == 0 && brace_d == 0 => {
            let trimmed = cur.trim();
            if !trimmed.is_empty() {
              args.push(trimmed.to_owned());
            }
            cur.clear();
          }
          _ => cur.push(c),
        }
      }
      let trimmed = cur.trim();
      if !trimmed.is_empty() {
        args.push(trimmed.to_owned());
      }
      args.sort_by(|a, b| {
        let name_a = a.split(':').next().unwrap_or(a).trim();
        let name_b = b.split(':').next().unwrap_or(b).trim();
        name_a.cmp(name_b)
      });
      format!("{prefix}({}){suffix}", args.join(", "))
    }

    let schema = Schema::build(QueryRoot::default(), MutationRoot::default(), EmptySubscription).finish();
    let sdl = schema.sdl();

    let baseline_sdl = include_str!("../../tests/fixtures/pre_split_baseline_schema.gql");
    let oracle_sdl = include_str!("../../../../../tests/oracle-contracts/v0.27.5/schema.gql");

    let baseline_defs = parse_sdl_blocks(baseline_sdl);
    let actual_defs = parse_sdl_blocks(&sdl);
    let oracle_defs = parse_sdl_blocks(oracle_sdl);
    let canonical_oracle_defs: BTreeMap<String, BTreeSet<String>> = oracle_defs
      .iter()
      .map(|(k, v)| (k.clone(), v.iter().map(|m| canonicalize_sdl_member(m)).collect()))
      .collect();

    // 1. Every top-level definition and signature from the pre-split baseline must
    //    remain intact (or match the canonicalized v0.27.5 oracle signature if updated
    //    to align defaults/types with the oracle).
    for (def_key, base_members) in &baseline_defs {
      let actual_members = actual_defs
        .get(def_key)
        .unwrap_or_else(|| panic!("missing pre-split GraphQL definition `{def_key}` in merged SDL"));
      let canonical_actual: BTreeSet<String> = actual_members.iter().map(|m| canonicalize_sdl_member(m)).collect();
      let oracle_canonical = canonical_oracle_defs.get(def_key);
      for base_sig in base_members {
        if actual_members.contains(base_sig) {
          continue;
        }
        let canon = canonicalize_sdl_member(base_sig);
        let matches_oracle =
          oracle_canonical.is_some_and(|os| os.contains(&canon)) && canonical_actual.contains(&canon);
        assert!(
          matches_oracle,
          "pre-split GraphQL signature changed or dropped in `{def_key}`: `{base_sig}`"
        );
      }
    }

    // 2. Any top-level definition or member added beyond the pre-split baseline must
    //    exactly match a canonicalized signature in the frozen v0.27.5 oracle schema.
    for (def_key, actual_members) in &actual_defs {
      if let Some(base_members) = baseline_defs.get(def_key) {
        let oracle_canonical = canonical_oracle_defs.get(def_key);
        for sig in actual_members {
          if !base_members.contains(sig) {
            let canon = canonicalize_sdl_member(sig);
            assert!(
              oracle_canonical.is_some_and(|os| os.contains(&canon)),
              "new GraphQL signature in `{def_key}` does not match v0.27.5 oracle: `{sig}` (canonical: `{canon}`)"
            );
          }
        }
      } else {
        if def_key == "directive @deprecated" {
          continue;
        }
        let oracle_canonical = canonical_oracle_defs
          .get(def_key)
          .unwrap_or_else(|| panic!("new GraphQL top-level definition `{def_key}` is not in v0.27.5 oracle"));
        let canonical_actual: BTreeSet<String> = actual_members.iter().map(|m| canonicalize_sdl_member(m)).collect();
        if def_key == "type Copilot" {
          // `transcriptTask` belongs to the dedicated transcript slice.
          let expected: BTreeSet<String> = oracle_canonical
            .iter()
            .filter(|m| !m.starts_with("transcriptTask("))
            .cloned()
            .collect();
          assert_eq!(
            canonical_actual, expected,
            "new GraphQL definition `{def_key}` does not match v0.27.5 oracle"
          );
        } else {
          assert_eq!(
            &canonical_actual, oracle_canonical,
            "new GraphQL definition `{def_key}` does not match v0.27.5 oracle 1:1"
          );
        }
      }
    }

    // 3. Ensure every merged sub-root preserves the exact root type names (`Query` / `Mutation`)
    //    and never leaks internal sub-root wrapper names into the schema.
    assert!(sdl.contains("schema {\n\tquery: Query\n\tmutation: Mutation\n}"));
    for internal_name in [
      "CoreQuery",
      "AuthQuery",
      "AdminQuery",
      "WorkspaceQuery",
      "McpQuery",
      "BillingQuery",
      "CoreMutation",
      "AuthMutation",
      "AdminMutation",
      "WorkspaceMutation",
      "DocMutation",
      "BlobMutation",
      "CommentMutation",
      "NotificationMutation",
      "LicenseMutation",
      "CalendarMutation",
      "McpMutation",
      "BillingMutation",
      "ByokMutation",
      "CopilotMutation",
    ] {
      assert!(
        !actual_defs.contains_key(&format!("type {internal_name}")),
        "internal merged root `{internal_name}` leaked into SDL"
      );
    }
  }
}
