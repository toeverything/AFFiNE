//! Authentication, security challenge, signing key rotation, and error probe
//! GraphQL resolvers aligned 1:1 with `v0.27.5/schema.gql`.

use std::sync::Arc;

use async_graphql::{Context, Enum, Object, Result, SimpleObject, Union};
use chrono::{DateTime, Utc};
use http::{HeaderMap, StatusCode};
use server_domain::auth::canonical_email;
use server_domain::auth::keyring::{SIGNING_KEYS_CONFIG_ID, SigningKeyMetadata};
use server_domain::auth::security_challenge::SecurityChallengeKind;
use server_types::DomainError;

use super::user::{UserType, publish_user_updated_realtime};
use super::{enforce_strict_throttle_graphql, require_admin_user, require_authenticated_user};
use crate::AppState;
use crate::legacy_compat::errors::{LegacyErrorEnvelope, domain_error_to_graphql, envelope_to_graphql};
use crate::rest::{resolve_auth_request_source_for_app, validate_safe_link_callback_url_for_request};

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AuthSigningKeyType")]
pub struct AuthSigningKeyType {
  pub id: String,
  pub status: String,
  pub source: String,
  pub created_at: Option<DateTime<Utc>>,
  pub retired_at: Option<DateTime<Utc>>,
  pub verify_until: Option<DateTime<Utc>>,
  pub can_delete: bool,
}

impl From<SigningKeyMetadata> for AuthSigningKeyType {
  fn from(meta: SigningKeyMetadata) -> Self {
    Self {
      id: meta.id,
      status: meta.status,
      source: meta.source,
      created_at: meta.created_at,
      retired_at: meta.retired_at,
      verify_until: meta.verify_until,
      can_delete: meta.can_delete,
    }
  }
}

macro_rules! error_data_types {
  ($( $ty:ident { $( $(#[$fmeta:meta])* $field:ident : $fty:ty ),* $(,)? } ),* $(,)?) => {
    $(
      #[derive(SimpleObject, Clone, Debug)]
      pub struct $ty {
        $( $(#[$fmeta])* pub $field: $fty, )*
      }
    )*

    #[derive(Union)]
    #[graphql(name = "ErrorDataUnion")]
    pub enum ErrorDataUnion {
      $( $ty($ty), )*
    }
  };
}

error_data_types! {
  AlreadyInSpaceDataType { space_id: String },
  BlobNotFoundDataType { blob_id: String, space_id: String },
  CalendarProviderRequestErrorDataType { message: String, status: i32 },
  CopilotDocNotFoundDataType { doc_id: String },
  CopilotFailedToAddWorkspaceArtifactDataType { message: String },
  CopilotFailedToGenerateEmbeddingDataType { message: String, provider: String },
  CopilotMessageNotFoundDataType { message_id: String },
  CopilotPromptNotFoundDataType { name: String },
  CopilotProviderNotSupportedDataType { kind: String, provider: String },
  CopilotProviderSideErrorDataType { kind: String, message: String, provider: String },
  DocActionDeniedDataType { action: String, doc_id: String, space_id: String },
  DocHistoryNotFoundDataType { doc_id: String, space_id: String, timestamp: i32 },
  DocNotFoundDataType { doc_id: String, space_id: String },
  DocUpdateBlockedDataType { doc_id: String, space_id: String },
  ExpectToGrantDocUserRolesDataType { doc_id: String, space_id: String },
  ExpectToRevokeDocUserRolesDataType { doc_id: String, space_id: String },
  ExpectToUpdateDocUserRoleDataType { doc_id: String, space_id: String },
  GraphqlBadRequestDataType { code: String, message: String },
  HttpRequestErrorDataType { message: String },
  ImageFormatNotSupportedDataType { format: String },
  InvalidAppConfigDataType { hint: String, key: String, module: String },
  InvalidAppConfigInputDataType { message: String },
  InvalidEmailDataType { email: String },
  InvalidHistoryTimestampDataType { timestamp: String },
  InvalidIndexerInputDataType { reason: String },
  InvalidLicenseToActivateDataType { reason: String },
  InvalidLicenseUpdateParamsDataType { reason: String },
  InvalidOauthCallbackCodeDataType { body: String, status: i32 },
  InvalidOauthResponseDataType { reason: String },
  InvalidPasswordLengthDataType { max: i32, min: i32 },
  InvalidRuntimeConfigTypeDataType { get: String, key: String, want: String },
  InvalidSearchProviderRequestDataType { reason: String, #[graphql(name = "type")] error_type: String },
  MemberNotFoundInSpaceDataType { space_id: String },
  MentionUserDocAccessDeniedDataType { doc_id: String },
  MissingOauthQueryParameterDataType { name: String },
  NoCopilotProviderAvailableDataType { model_id: String },
  NoMoreSeatDataType { space_id: String },
  NotInSpaceDataType { space_id: String },
  QueryTooLongDataType { max: i32 },
  ResponseTooLargeErrorDataType { limit_bytes: i32, received_bytes: i32 },
  RuntimeConfigNotFoundDataType { key: String },
  SameSubscriptionRecurringDataType { recurring: String },
  SearchIndexFailedDataType { diagnostic_id: String },
  SearchIndexNotReadyDataType { space_id: String },
  SpaceAccessDeniedDataType { space_id: String },
  SpaceNotFoundDataType { space_id: String },
  SpaceOwnerNotFoundDataType { space_id: String },
  SpaceShouldHaveOnlyOneOwnerDataType { space_id: String },
  SsrfBlockedErrorDataType { reason: String },
  SubscriptionAlreadyExistsDataType { plan: String },
  SubscriptionNotExistsDataType { plan: String },
  SubscriptionPlanNotFoundDataType { plan: String, recurring: String },
  SyncPermissionGenerationChangedDataType { space_id: String },
  UnknownOauthProviderDataType { name: String },
  UnsupportedClientVersionDataType { client_version: String, required_version: String },
  UnsupportedServerVersionDataType { required_version: String },
  UnsupportedSubscriptionPlanDataType { plan: String },
  ValidationErrorDataType { errors: String },
  VersionRejectedDataType { server_version: String, version: String },
  WorkspacePermissionNotFoundDataType { space_id: String },
  WrongSignInCredentialsDataType { email: String },
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "ErrorNames", rename_items = "SCREAMING_SNAKE_CASE")]
#[allow(non_camel_case_types)]
pub enum ErrorNames {
  ACCESS_DENIED,
  ACCESS_TOKEN_EXPIRED,
  ACCESS_TOKEN_INVALID,
  ACTION_FORBIDDEN,
  ACTION_FORBIDDEN_ON_NON_TEAM_WORKSPACE,
  ALREADY_IN_SPACE,
  AUTHENTICATION_REQUIRED,
  AUTH_SESSION_EXPIRED,
  AUTH_SESSION_REVOKED,
  AUTH_SESSION_TEMPORARILY_UNAVAILABLE,
  BAD_REQUEST,
  BLOB_INVALID,
  BLOB_NOT_FOUND,
  BLOB_QUOTA_EXCEEDED,
  CALENDAR_PROVIDER_REQUEST_ERROR,
  CANNOT_DELETE_ACCOUNT_WITH_OWNED_TEAM_WORKSPACE,
  CANNOT_DELETE_ALL_ADMIN_ACCOUNT,
  CANNOT_DELETE_OWN_ACCOUNT,
  CANT_UPDATE_ONETIME_PAYMENT_SUBSCRIPTION,
  CAN_NOT_BATCH_GRANT_DOC_OWNER_PERMISSIONS,
  CAN_NOT_REVOKE_YOURSELF,
  CAPTCHA_VERIFICATION_FAILED,
  COMMENT_ATTACHMENT_NOT_FOUND,
  COMMENT_ATTACHMENT_QUOTA_EXCEEDED,
  COMMENT_NOT_FOUND,
  COPILOT_ACTION_TAKEN,
  COPILOT_DOCS_NOT_FOUND,
  COPILOT_DOC_NOT_FOUND,
  COPILOT_EMBEDDING_DISABLED,
  COPILOT_EMBEDDING_UNAVAILABLE,
  COPILOT_FAILED_TO_ADD_WORKSPACE_ARTIFACT,
  COPILOT_FAILED_TO_CREATE_MESSAGE,
  COPILOT_FAILED_TO_GENERATE_EMBEDDING,
  COPILOT_FAILED_TO_GENERATE_TEXT,
  COPILOT_MESSAGE_NOT_FOUND,
  COPILOT_PROMPT_INVALID,
  COPILOT_PROMPT_NOT_FOUND,
  COPILOT_PROVIDER_NOT_SUPPORTED,
  COPILOT_PROVIDER_SIDE_ERROR,
  COPILOT_QUOTA_EXCEEDED,
  COPILOT_SELECTED_SOURCES_FAILED,
  COPILOT_SELECTED_SOURCES_LIMIT_EXCEEDED,
  COPILOT_SELECTED_SOURCES_PROCESSING,
  COPILOT_SELECTED_SOURCES_UNAVAILABLE,
  COPILOT_SESSION_DELETED,
  COPILOT_SESSION_INVALID_INPUT,
  COPILOT_SESSION_NOT_FOUND,
  COPILOT_TRANSCRIPTION_AUDIO_NOT_PROVIDED,
  COPILOT_TRANSCRIPTION_JOB_EXISTS,
  COPILOT_TRANSCRIPTION_JOB_NOT_FOUND,
  CUSTOMER_PORTAL_CREATE_FAILED,
  DOC_ACTION_DENIED,
  DOC_DEFAULT_ROLE_CAN_NOT_BE_OWNER,
  DOC_HISTORY_NOT_FOUND,
  DOC_IS_NOT_PUBLIC,
  DOC_NOT_FOUND,
  DOC_UPDATE_BLOCKED,
  DOC_UPDATE_INVALID,
  DOC_UPDATE_TOO_LARGE,
  DOC_VALIDATION_UNAVAILABLE,
  EMAIL_ALREADY_USED,
  EMAIL_SERVICE_NOT_CONFIGURED,
  EMAIL_TOKEN_NOT_FOUND,
  EMAIL_VERIFICATION_REQUIRED,
  EXPECT_TO_GRANT_DOC_USER_ROLES,
  EXPECT_TO_PUBLISH_DOC,
  EXPECT_TO_REVOKE_DOC_USER_ROLES,
  EXPECT_TO_REVOKE_PUBLIC_DOC,
  EXPECT_TO_UPDATE_DOC_USER_ROLE,
  FAILED_TO_CHECKOUT,
  FAILED_TO_SAVE_UPDATES,
  FAILED_TO_UPSERT_SNAPSHOT,
  GRAPHQL_BAD_REQUEST,
  HTTP_REQUEST_ERROR,
  IMAGE_FORMAT_NOT_SUPPORTED,
  INTERNAL_SERVER_ERROR,
  INVALID_APP_CONFIG,
  INVALID_APP_CONFIG_INPUT,
  INVALID_AUTH_STATE,
  INVALID_CHECKOUT_PARAMETERS,
  INVALID_EMAIL,
  INVALID_EMAIL_TOKEN,
  INVALID_HISTORY_TIMESTAMP,
  INVALID_INDEXER_INPUT,
  INVALID_INVITATION,
  INVALID_LICENSE_SESSION_ID,
  INVALID_LICENSE_TO_ACTIVATE,
  INVALID_LICENSE_UPDATE_PARAMS,
  INVALID_OAUTH_CALLBACK_CODE,
  INVALID_OAUTH_CALLBACK_STATE,
  INVALID_OAUTH_RESPONSE,
  INVALID_PASSWORD_LENGTH,
  INVALID_RUNTIME_CONFIG_TYPE,
  INVALID_SEARCH_PROVIDER_REQUEST,
  INVALID_SUBSCRIPTION_PARAMETERS,
  INVITATION_ACCOUNT_MISMATCH,
  LICENSE_EXPIRED,
  LICENSE_NOT_FOUND,
  LICENSE_REVEALED,
  LINK_EXPIRED,
  MAILER_SERVICE_IS_NOT_CONFIGURED,
  MANAGED_BY_APP_STORE_OR_PLAY,
  MEMBER_NOT_FOUND_IN_SPACE,
  MEMBER_QUOTA_EXCEEDED,
  MENTION_USER_DOC_ACCESS_DENIED,
  MENTION_USER_ONESELF_DENIED,
  MISSING_OAUTH_QUERY_PARAMETER,
  NETWORK_ERROR,
  NEW_OWNER_IS_NOT_ACTIVE_MEMBER,
  NOTIFICATION_NOT_FOUND,
  NOT_FOUND,
  NOT_IN_SPACE,
  NO_COPILOT_PROVIDER_AVAILABLE,
  NO_MORE_SEAT,
  OAUTH_ACCOUNT_ALREADY_CONNECTED,
  OAUTH_STATE_EXPIRED,
  OWNER_CAN_NOT_LEAVE_WORKSPACE,
  PASSWORD_REQUIRED,
  PURCHASE_IN_PROGRESS,
  PURCHASE_NEEDS_VERIFICATION,
  QUERY_TOO_LONG,
  REFRESH_TOKEN_INVALID,
  REFRESH_TOKEN_REUSED,
  REPLY_NOT_FOUND,
  RESPONSE_TOO_LARGE_ERROR,
  RUNTIME_CONFIG_NOT_FOUND,
  SAME_EMAIL_PROVIDED,
  SAME_SUBSCRIPTION_RECURRING,
  SEARCH_INDEX_FAILED,
  SEARCH_INDEX_NOT_READY,
  SEARCH_PERMISSION_SYNCING,
  SEARCH_PROVIDER_NOT_FOUND,
  SEARCH_PROVIDER_UNAVAILABLE,
  SIGN_UP_FORBIDDEN,
  SPACE_ACCESS_DENIED,
  SPACE_NOT_FOUND,
  SPACE_OWNER_NOT_FOUND,
  SPACE_SHOULD_HAVE_ONLY_ONE_OWNER,
  SSRF_BLOCKED_ERROR,
  STORAGE_QUOTA_EXCEEDED,
  SUBSCRIPTION_ALREADY_EXISTS,
  SUBSCRIPTION_EXPIRED,
  SUBSCRIPTION_HAS_BEEN_CANCELED,
  SUBSCRIPTION_HAS_NOT_BEEN_CANCELED,
  SUBSCRIPTION_NOT_EXISTS,
  SUBSCRIPTION_PLAN_NOT_FOUND,
  SYNC_PERMISSION_GENERATION_CHANGED,
  TOO_MANY_REQUEST,
  UNKNOWN_OAUTH_PROVIDER,
  UNSPLASH_IS_NOT_CONFIGURED,
  UNSUPPORTED_CLIENT_VERSION,
  UNSUPPORTED_SERVER_VERSION,
  UNSUPPORTED_SUBSCRIPTION_PLAN,
  USER_AVATAR_NOT_FOUND,
  USER_NOT_FOUND,
  VALIDATION_ERROR,
  VERSION_REJECTED,
  WORKSPACE_ID_REQUIRED_FOR_TEAM_SUBSCRIPTION,
  WORKSPACE_ID_REQUIRED_TO_UPDATE_TEAM_SUBSCRIPTION,
  WORKSPACE_LICENSE_ALREADY_EXISTS,
  WORKSPACE_PERMISSION_NOT_FOUND,
  WORKSPACE_SYNC_UNAVAILABLE,
  WRONG_SIGN_IN_CREDENTIALS,
  WRONG_SIGN_IN_METHOD,
}

fn map_security_error(err: &DomainError) -> async_graphql::Error {
  match err {
    DomainError::Forbidden(msg) if msg == "email_verification_required" => envelope_to_graphql(LegacyErrorEnvelope {
      status: StatusCode::FORBIDDEN.as_u16(),
      code: "Forbidden".into(),
      error_type: "ACTION_FORBIDDEN".into(),
      name: "EMAIL_VERIFICATION_REQUIRED".into(),
      message: "You must verify your email before accessing this resource.".into(),
      data: None,
    }),
    DomainError::Conflict(msg) if msg == "email_already_used" => envelope_to_graphql(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "RESOURCE_ALREADY_EXISTS".into(),
      name: "EMAIL_ALREADY_USED".into(),
      message: "This email has already been registered.".into(),
      data: None,
    }),
    DomainError::Validation(msg) if msg == "same_email_provided" => envelope_to_graphql(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "SAME_EMAIL_PROVIDED".into(),
      message: "You are trying to update your account email to the same as the old one.".into(),
      data: None,
    }),
    DomainError::Validation(msg) if msg == "invalid_email_token" => envelope_to_graphql(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "INVALID_EMAIL_TOKEN".into(),
      message: "An invalid email token provided.".into(),
      data: None,
    }),
    DomainError::Validation(msg) if msg == "password_required" => envelope_to_graphql(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "PASSWORD_REQUIRED".into(),
      message: "Password is required.".into(),
      data: None,
    }),
    DomainError::Validation(msg) if msg == "auth_signing_key_changed" => envelope_to_graphql(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "INVALID_APP_CONFIG_INPUT".into(),
      message: "Invalid app config input: The active signing key changed. Reload and try again.".into(),
      data: Some(serde_json::json!({ "message": "The active signing key changed. Reload and try again." })),
    }),
    DomainError::Validation(msg) if msg == "auth_signing_key_not_found" => envelope_to_graphql(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "INVALID_APP_CONFIG_INPUT".into(),
      message: "Invalid app config input: Signing key does not exist.".into(),
      data: Some(serde_json::json!({ "message": "Signing key does not exist." })),
    }),
    DomainError::Forbidden(msg) if msg == "auth_signing_key_cannot_be_deleted" => {
      envelope_to_graphql(LegacyErrorEnvelope {
        status: StatusCode::FORBIDDEN.as_u16(),
        code: "Forbidden".into(),
        error_type: "ACTION_FORBIDDEN".into(),
        name: "ACTION_FORBIDDEN".into(),
        message: "You are not allowed to perform this action.".into(),
        data: None,
      })
    }
    _ => domain_error_to_graphql(err),
  }
}

fn email_token_not_found_error() -> async_graphql::Error {
  envelope_to_graphql(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: "INVALID_INPUT".into(),
    name: "EMAIL_TOKEN_NOT_FOUND".into(),
    message: "The email token provided is not found.".into(),
    data: None,
  })
}

fn link_expired_error() -> async_graphql::Error {
  envelope_to_graphql(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: "BAD_REQUEST".into(),
    name: "LINK_EXPIRED".into(),
    message: "The link has expired.".into(),
    data: None,
  })
}

fn invalid_email_error(email: &str) -> async_graphql::Error {
  envelope_to_graphql(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: "INVALID_INPUT".into(),
    name: "INVALID_EMAIL".into(),
    message: format!("Invalid email: {email}."),
    data: Some(serde_json::json!({ "email": email })),
  })
}

fn decode_uri_component(input: &str) -> std::result::Result<String, ()> {
  let bytes = input.as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'%' {
      if i + 2 >= bytes.len() {
        return Err(());
      }
      let hi = (bytes[i + 1] as char).to_digit(16).ok_or(())?;
      let lo = (bytes[i + 2] as char).to_digit(16).ok_or(())?;
      out.push(((hi << 4) | lo) as u8);
      i += 3;
    } else {
      out.push(bytes[i]);
      i += 1;
    }
  }
  String::from_utf8(out).map_err(|_| ())
}

async fn safe_callback_url(ctx: &Context<'_>, state: &AppState, raw: &str) -> Result<String> {
  validate_safe_link_callback_url_for_request(state, ctx.data_opt::<HeaderMap>(), raw)
    .await
    .map_err(|e| domain_error_to_graphql(&e))
}

async fn graphql_request_source(ctx: &Context<'_>, state: &AppState) -> Option<server_domain::auth::AuthRequestSource> {
  let headers = ctx.data_opt::<HeaderMap>()?;
  Some(resolve_auth_request_source_for_app(state, headers).await)
}

async fn broadcast_signing_keys_changed(state: &AppState) {
  state.app_config.invalidate_cache();
  let _ = state
    .event_bus
    .publish_event(
      "config.changed.broadcast",
      serde_json::json!({ "keys": [SIGNING_KEYS_CONFIG_ID] }),
      None,
    )
    .await;
}

#[derive(Default)]
pub struct AuthQuery;

#[Object]
impl AuthQuery {
  async fn auth_signing_keys(&self, ctx: &Context<'_>) -> Result<Vec<AuthSigningKeyType>> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let keys = state
      .auth
      .list_signing_keys()
      .await
      .map_err(|e| map_security_error(&e))?;
    Ok(keys.into_iter().map(AuthSigningKeyType::from).collect())
  }

  async fn error(&self, ctx: &Context<'_>, _name: ErrorNames) -> Result<ErrorDataUnion> {
    let _user = require_authenticated_user(ctx).await?;
    Err(envelope_to_graphql(LegacyErrorEnvelope {
      status: StatusCode::FORBIDDEN.as_u16(),
      code: "Forbidden".into(),
      error_type: "ACTION_FORBIDDEN".into(),
      name: "ACTION_FORBIDDEN".into(),
      message: "You are not allowed to perform this action.".into(),
      data: None,
    }))
  }
}

#[derive(Default)]
pub struct AuthMutation;

#[Object]
impl AuthMutation {
  async fn send_verify_email(&self, ctx: &Context<'_>, callback_url: String) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let url = safe_callback_url(ctx, state, &callback_url).await?;
    let source = graphql_request_source(ctx, state).await;
    state
      .auth
      .prepare_security_challenge(SecurityChallengeKind::VerifyEmail, &user.id, &url, source.as_ref())
      .await
      .map_err(|e| map_security_error(&e))
  }

  async fn verify_email(&self, ctx: &Context<'_>, token: String) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    if token.is_empty() {
      return Err(email_token_not_found_error());
    }
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .auth
      .complete_verify_email_challenge(&user.id, &token)
      .await
      .map_err(|e| map_security_error(&e))
  }

  async fn send_change_password_email(
    &self,
    ctx: &Context<'_>,
    callback_url: String,
    #[graphql(deprecation = "fetched from signed in user")] email: Option<String>,
  ) -> Result<bool> {
    let _ = email;
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let url = safe_callback_url(ctx, state, &callback_url).await?;
    let source = graphql_request_source(ctx, state).await;
    state
      .auth
      .prepare_security_challenge(SecurityChallengeKind::ChangePassword, &user.id, &url, source.as_ref())
      .await
      .map_err(|e| map_security_error(&e))
  }

  async fn send_set_password_email(
    &self,
    ctx: &Context<'_>,
    callback_url: String,
    #[graphql(deprecation = "fetched from signed in user")] email: Option<String>,
  ) -> Result<bool> {
    let _ = email;
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let url = safe_callback_url(ctx, state, &callback_url).await?;
    let source = graphql_request_source(ctx, state).await;
    state
      .auth
      .prepare_security_challenge(SecurityChallengeKind::SetPassword, &user.id, &url, source.as_ref())
      .await
      .map_err(|e| map_security_error(&e))
  }

  async fn change_password(
    &self,
    ctx: &Context<'_>,
    new_password: String,
    token: String,
    user_id: Option<String>,
  ) -> Result<bool> {
    enforce_strict_throttle_graphql(ctx).await?;
    let Some(user_id) = user_id.filter(|s| !s.is_empty()) else {
      return Err(link_expired_error());
    };
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let ok = state
      .auth
      .complete_password_challenge(&user_id, &token, &new_password)
      .await
      .map_err(|e| map_security_error(&e))?;
    publish_user_updated_realtime(state, &user_id).await;
    Ok(ok)
  }

  async fn create_change_password_url(
    &self,
    ctx: &Context<'_>,
    callback_url: String,
    user_id: String,
  ) -> Result<String> {
    let _ = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let url = safe_callback_url(ctx, state, &callback_url).await?;
    state
      .auth
      .create_security_url(SecurityChallengeKind::ChangePassword, &user_id, &url)
      .await
      .map_err(|e| map_security_error(&e))
  }

  async fn send_change_email(&self, ctx: &Context<'_>, callback_url: String) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let url = safe_callback_url(ctx, state, &callback_url).await?;
    let source = graphql_request_source(ctx, state).await;
    state
      .auth
      .prepare_security_challenge(SecurityChallengeKind::ChangeEmail, &user.id, &url, source.as_ref())
      .await
      .map_err(|e| map_security_error(&e))
  }

  async fn send_verify_change_email(
    &self,
    ctx: &Context<'_>,
    callback_url: String,
    email: String,
    token: String,
  ) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    if token.is_empty() {
      return Err(email_token_not_found_error());
    }
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let url = safe_callback_url(ctx, state, &callback_url).await?;
    let source = graphql_request_source(ctx, state).await;
    state
      .auth
      .prepare_verify_change_email(&user.id, &token, &email, &url, source.as_ref())
      .await
      .map_err(|e| map_security_error(&e))
  }

  async fn change_email(&self, ctx: &Context<'_>, email: String, token: String) -> Result<UserType> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let decoded = decode_uri_component(&email).map_err(|()| invalid_email_error(&email))?;
    let validated = canonical_email(&decoded).map_err(|_| invalid_email_error(&decoded))?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .auth
      .complete_email_challenge(&user.id, &token, &validated)
      .await
      .map_err(|e| map_security_error(&e))?;
    publish_user_updated_realtime(state, &user.id).await;
    Ok(UserType::session(user))
  }

  async fn rotate_auth_signing_key(
    &self,
    ctx: &Context<'_>,
    expected_active_key_id: String,
  ) -> Result<Vec<AuthSigningKeyType>> {
    let admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let keys = state
      .auth
      .rotate_signing_key(&admin.id, &expected_active_key_id)
      .await
      .map_err(|e| map_security_error(&e))?;
    broadcast_signing_keys_changed(state).await;
    if let Some(active) = keys.iter().find(|k| k.status == "active") {
      let _ = state
        .event_bus
        .publish_event(
          "auth.signing_key.rotated",
          serde_json::json!({
            "actorId": admin.id,
            "previousKeyId": expected_active_key_id,
            "activeKeyId": active.id,
          }),
          None,
        )
        .await;
    }
    Ok(keys.into_iter().map(AuthSigningKeyType::from).collect())
  }

  async fn delete_auth_signing_key(&self, ctx: &Context<'_>, id: String) -> Result<Vec<AuthSigningKeyType>> {
    let admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let keys = state
      .auth
      .delete_signing_key(&admin.id, &id)
      .await
      .map_err(|e| map_security_error(&e))?;
    broadcast_signing_keys_changed(state).await;
    let _ = state
      .event_bus
      .publish_event(
        "auth.signing_key.deleted",
        serde_json::json!({ "actorId": admin.id, "keyId": id }),
        None,
      )
      .await;
    Ok(keys.into_iter().map(AuthSigningKeyType::from).collect())
  }
}
