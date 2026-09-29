use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::{mail::AuthRequestSource, security_challenge::SecurityChallengeKind};

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub(super) enum AuthSessionCommand {
  InitializeKeyring,
  Exchange {
    code: String,
    #[serde(rename = "installationId")]
    installation_id: String,
    platform: String,
    #[serde(rename = "deviceName")]
    device_name: Option<String>,
    #[serde(rename = "appVersion")]
    app_version: Option<String>,
  },
  Refresh {
    #[serde(rename = "refreshToken")]
    refresh_token: String,
    #[serde(rename = "appVersion")]
    app_version: Option<String>,
  },
  RevokeRefresh {
    #[serde(rename = "refreshToken")]
    refresh_token: String,
  },
  RevokeSession {
    #[serde(rename = "authSessionId")]
    auth_session_id: String,
    #[serde(rename = "userId")]
    user_id: Option<String>,
    reason: String,
  },
  RevokeUser {
    #[serde(rename = "userId")]
    user_id: String,
    reason: String,
  },
  SetUserEmail {
    #[serde(rename = "userId")]
    user_id: String,
    email: String,
    reason: String,
  },
  SetUserDisabled {
    #[serde(rename = "userId")]
    user_id: String,
    disabled: bool,
    reason: String,
  },
  List {
    #[serde(rename = "userId")]
    user_id: String,
  },
  CookieSignOut {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "userId")]
    user_id: Option<String>,
  },
  CookieUsers {
    #[serde(rename = "sessionId")]
    session_id: String,
  },
  Cleanup {
    limit: i64,
  },
  SigningKeyMetadata,
  RotateSigningKey {
    #[serde(rename = "actorId")]
    actor_id: String,
    #[serde(rename = "expectedActiveKeyId")]
    expected_active_key_id: String,
  },
  DeleteSigningKey {
    #[serde(rename = "actorId")]
    actor_id: String,
    #[serde(rename = "keyId")]
    key_id: String,
  },
  PasswordLogin {
    email: String,
    password: String,
    issue: SessionIssueInput,
  },
  LoginPreflight {
    email: String,
  },
  BoundMethods {
    #[serde(rename = "userId")]
    user_id: String,
  },
  IssueUser {
    #[serde(rename = "userId")]
    user_id: String,
    issue: SessionIssueInput,
  },
  PrepareMagicLink {
    email: String,
    #[serde(rename = "callbackUrl")]
    callback_url: String,
    #[serde(rename = "clientNonce")]
    client_nonce: Option<String>,
    #[serde(rename = "serverName")]
    server_name: String,
    source: Option<AuthRequestSource>,
  },
  CompleteMagicLink {
    email: String,
    otp: String,
    #[serde(rename = "clientNonce")]
    client_nonce: Option<String>,
    issue: SessionIssueInput,
  },
  CreateOpenAppCode {
    #[serde(rename = "userId")]
    user_id: String,
  },
  CompleteOpenApp {
    code: String,
    issue: SessionIssueInput,
  },
  #[serde(rename = "oauth_preflight")]
  OAuthPreflight {
    provider: String,
    #[serde(rename = "redirectUri")]
    redirect_uri: Option<String>,
    client: String,
    #[serde(rename = "clientNonce")]
    client_nonce: String,
    #[serde(rename = "clientVersion")]
    client_version: Option<String>,
    #[serde(rename = "callbackUrl")]
    callback_url: String,
    #[serde(rename = "redirectBaseUrl")]
    redirect_base_url: String,
    #[serde(rename = "redirectAllowedOrigins")]
    redirect_allowed_origins: Vec<String>,
    #[serde(rename = "redirectTrustedDomains")]
    redirect_trusted_domains: Vec<String>,
  },
  #[serde(rename = "oauth_callback")]
  OAuthCallback {
    code: String,
    state: String,
    #[serde(rename = "clientNonce")]
    client_nonce: Option<String>,
    issue: SessionIssueInput,
  },
  #[serde(rename = "oauth_providers")]
  OAuthProviders,
  PrepareSecurityChallenge {
    kind: SecurityChallengeKind,
    #[serde(rename = "userId")]
    user_id: String,
    #[serde(rename = "callbackUrl")]
    callback_url: String,
    source: Option<AuthRequestSource>,
  },
  PrepareVerifyChangeEmail {
    #[serde(rename = "userId")]
    user_id: String,
    token: String,
    email: String,
    #[serde(rename = "callbackUrl")]
    callback_url: String,
    source: Option<AuthRequestSource>,
  },
  CompletePasswordChallenge {
    #[serde(rename = "userId")]
    user_id: String,
    token: String,
    password: String,
  },
  CompleteEmailChallenge {
    #[serde(rename = "userId")]
    user_id: String,
    token: String,
    email: String,
  },
  CompleteVerifyEmailChallenge {
    #[serde(rename = "userId")]
    user_id: String,
    token: String,
  },
  CreateSecurityUrl {
    kind: SecurityChallengeKind,
    #[serde(rename = "userId")]
    user_id: String,
    #[serde(rename = "callbackUrl")]
    callback_url: String,
  },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(super) enum SessionIssueInput {
  Cookie {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "clientVersion")]
    client_version: Option<String>,
  },
  Native {
    #[serde(rename = "clientVersion")]
    client_version: Option<String>,
  },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LoginResult {
  pub(super) user: CurrentUser,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(super) session_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(super) session_expires_at: Option<DateTime<Utc>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(super) exchange_code: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(super) created: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OAuthPreflightResult {
  pub(super) url: String,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(super) enum OAuthCallbackResult {
  Handoff {
    code: String,
    provider: String,
    #[serde(rename = "stateToken")]
    state_token: String,
    client: String,
  },
  Login {
    #[serde(flatten)]
    login: LoginResult,
    #[serde(rename = "redirectUri", skip_serializing_if = "Option::is_none")]
    redirect_uri: Option<String>,
    provider: String,
    client: String,
  },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(super) enum PrincipalInput {
  AccessToken {
    token: String,
  },
  Cookie {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "userId")]
    user_id: Option<String>,
    #[serde(rename = "refreshClientVersion")]
    refresh_client_version: Option<String>,
    refresh: bool,
  },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CurrentUser {
  pub(super) id: String,
  pub(super) email: String,
  pub(super) avatar_url: Option<String>,
  pub(super) name: String,
  pub(super) disabled: bool,
  pub(super) has_password: bool,
  pub(super) email_verified: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Principal {
  pub(super) id: String,
  pub(super) session_id: String,
  pub(super) user_id: String,
  pub(super) expires_at: Option<DateTime<Utc>>,
  pub(super) sign_in_client_version: Option<String>,
  pub(super) refresh_client_version: Option<String>,
  pub(super) created_at: DateTime<Utc>,
  pub(super) auth_session_id: Option<String>,
  pub(super) authenticated_at: Option<DateTime<Utc>>,
  pub(super) user: CurrentUser,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub(super) enum PrincipalResult {
  Valid {
    principal: Box<Principal>,
    #[serde(rename = "refreshedExpiresAt")]
    refreshed_expires_at: Option<DateTime<Utc>>,
  },
  Invalid,
  AccessTokenExpired,
  AuthSessionExpired,
  AuthSessionRevoked,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TokenPair {
  pub(super) user_id: String,
  pub(super) token_type: &'static str,
  pub(super) access_token: String,
  pub(super) expires_in: i64,
  pub(super) refresh_token: String,
  pub(super) refresh_expires_at: DateTime<Utc>,
  pub(super) session: TokenPairSession,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(super) is_new_device: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TokenPairSession {
  pub(super) id: String,
  pub(super) absolute_expires_at: DateTime<Utc>,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub(super) enum RefreshResult {
  Rotated {
    #[serde(flatten)]
    pair: TokenPair,
    #[serde(rename = "authSessionId")]
    auth_session_id: String,
    platform: String,
    grace: bool,
  },
  Invalid {
    code: &'static str,
  },
  Expired {
    code: &'static str,
  },
  Revoked {
    code: &'static str,
  },
  Reused {
    code: &'static str,
    #[serde(rename = "userId")]
    user_id: String,
    #[serde(rename = "authSessionId")]
    auth_session_id: String,
    platform: String,
  },
  TemporarilyUnavailable {
    code: &'static str,
  },
  RateLimited {
    code: &'static str,
  },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AuthSessionListItem {
  pub(super) id: String,
  pub(super) installation_id: String,
  pub(super) platform: String,
  pub(super) device_name: Option<String>,
  pub(super) app_version: Option<String>,
  pub(super) created_at: DateTime<Utc>,
  pub(super) last_seen_at: DateTime<Utc>,
  pub(super) idle_expires_at: DateTime<Utc>,
  pub(super) absolute_expires_at: DateTime<Utc>,
  pub(super) revoked_at: Option<DateTime<Utc>>,
  pub(super) revoke_reason: Option<String>,
}
