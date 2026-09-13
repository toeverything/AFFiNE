mod cookie;
mod issuance;
mod keyring;
mod login;
mod mail;
mod methods;
mod oauth;
mod oauth_http;
mod oauth_jwt;
mod principal;
mod refresh;
mod security;
mod security_challenge;
mod session;
mod successor;
mod types;

use serde_json::Value;
use session::{decision_time, lock_refresh_tokens, lock_user};
use types::{AuthSessionCommand, PrincipalInput, TokenPairSession};

use super::{BackendRuntime, RuntimeError, RuntimeResult, to_napi_error};

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn execute_auth_session_command_v1(&self, input: Value) -> napi::Result<Value> {
    let command: AuthSessionCommand = serde_json::from_value(input)
      .map_err(|error| to_napi_error(RuntimeError::json("decode auth session command", error)))?;
    let pool = self.pool().await.map_err(to_napi_error)?;
    let config = self.config().map_err(to_napi_error)?;
    dispatch(&pool, &config, command).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn resolve_auth_principal_v1(&self, input: Value) -> napi::Result<Value> {
    let input: PrincipalInput = serde_json::from_value(input)
      .map_err(|error| to_napi_error(RuntimeError::json("decode auth principal input", error)))?;
    let pool = self.pool().await.map_err(to_napi_error)?;
    let config = self.config().map_err(to_napi_error)?;
    principal::resolve(&pool, &config, input)
      .await
      .and_then(json_value)
      .map_err(to_napi_error)
  }
}

async fn dispatch(
  pool: &sqlx::PgPool,
  config: &super::BackendRuntimeConfig,
  command: AuthSessionCommand,
) -> RuntimeResult<Value> {
  match command {
    AuthSessionCommand::InitializeKeyring => keyring::initialize(pool, config).await.and_then(json_value),
    AuthSessionCommand::Exchange {
      code,
      installation_id,
      platform,
      device_name,
      app_version,
    } => session::exchange(
      pool,
      config,
      &code,
      &installation_id,
      &platform,
      device_name.as_deref(),
      app_version.as_deref(),
    )
    .await
    .and_then(json_value),
    AuthSessionCommand::Refresh {
      refresh_token,
      app_version,
    } => refresh::refresh(pool, config, &refresh_token, app_version.as_deref())
      .await
      .and_then(json_value),
    AuthSessionCommand::RevokeRefresh { refresh_token } => refresh::revoke_by_token(pool, &refresh_token)
      .await
      .and_then(json_value),
    AuthSessionCommand::RevokeSession {
      auth_session_id,
      user_id,
      reason,
    } => session::revoke(pool, &auth_session_id, user_id.as_deref(), &reason)
      .await
      .and_then(json_value),
    AuthSessionCommand::RevokeUser { user_id, reason } => security::revoke_user(pool, &user_id, &reason)
      .await
      .and_then(json_value),
    AuthSessionCommand::SetUserEmail { user_id, email, reason } => {
      security::set_user_email(pool, &user_id, &email, &reason)
        .await
        .and_then(json_value)
    }
    AuthSessionCommand::SetUserDisabled {
      user_id,
      disabled,
      reason,
    } => security::set_user_disabled(pool, &user_id, disabled, &reason)
      .await
      .and_then(json_value),
    AuthSessionCommand::List { user_id } => session::list(pool, &user_id).await.and_then(json_value),
    AuthSessionCommand::CookieSignOut { session_id, user_id } => {
      cookie::sign_out(pool, &session_id, user_id.as_deref())
        .await
        .and_then(json_value)
    }
    AuthSessionCommand::CookieUsers { session_id } => cookie::users(pool, &session_id).await.and_then(json_value),
    AuthSessionCommand::Cleanup { limit } => session::cleanup(pool, config, limit).await.and_then(json_value),
    AuthSessionCommand::SigningKeyMetadata => keyring::metadata(pool, config).await.and_then(json_value),
    AuthSessionCommand::RotateSigningKey {
      actor_id,
      expected_active_key_id,
    } => keyring::rotate(pool, config, &actor_id, &expected_active_key_id)
      .await
      .and_then(json_value),
    AuthSessionCommand::DeleteSigningKey { actor_id, key_id } => keyring::delete(pool, config, &actor_id, &key_id)
      .await
      .and_then(json_value),
    AuthSessionCommand::PasswordLogin { email, password, issue } => {
      login::password(pool, config, &email, &password, issue)
        .await
        .and_then(json_value)
    }
    AuthSessionCommand::LoginPreflight { email } => methods::login_preflight(pool, config, &email)
      .await
      .and_then(json_value),
    AuthSessionCommand::BoundMethods { user_id } => methods::bound_methods(pool, &user_id).await.and_then(json_value),
    AuthSessionCommand::IssueUser { user_id, issue } => issuance::issue_existing(pool, config, &user_id, issue)
      .await
      .and_then(json_value),
    AuthSessionCommand::PrepareMagicLink {
      email,
      callback_url,
      client_nonce,
      server_name,
      source,
    } => login::prepare_magic_link(
      pool,
      config,
      &email,
      &callback_url,
      client_nonce.as_deref(),
      &server_name,
      source.as_ref(),
    )
    .await
    .and_then(json_value),
    AuthSessionCommand::CompleteMagicLink {
      email,
      otp,
      client_nonce,
      issue,
    } => login::complete_magic_link(pool, config, &email, &otp, client_nonce.as_deref(), issue)
      .await
      .and_then(json_value),
    AuthSessionCommand::CreateOpenAppCode { user_id } => {
      login::create_open_app_code(pool, &user_id).await.and_then(json_value)
    }
    AuthSessionCommand::CompleteOpenApp { code, issue } => login::complete_open_app(pool, config, &code, issue)
      .await
      .and_then(json_value),
    AuthSessionCommand::OAuthPreflight {
      provider,
      redirect_uri,
      client,
      client_nonce,
      client_version,
      callback_url,
      redirect_base_url,
      redirect_allowed_origins,
      redirect_trusted_domains,
    } => oauth::preflight(
      pool,
      config,
      &provider,
      redirect_uri.as_deref(),
      &client,
      &client_nonce,
      client_version.as_deref(),
      &callback_url,
      &redirect_base_url,
      &redirect_allowed_origins,
      &redirect_trusted_domains,
    )
    .await
    .and_then(json_value),
    AuthSessionCommand::OAuthCallback {
      code,
      state,
      client_nonce,
      issue,
    } => oauth::callback(pool, config, &code, &state, client_nonce.as_deref(), issue)
      .await
      .and_then(json_value),
    AuthSessionCommand::OAuthProviders => oauth::available_providers(config).await.and_then(json_value),
    AuthSessionCommand::PrepareSecurityChallenge {
      kind,
      user_id,
      callback_url,
      source,
    } => security_challenge::prepare(pool, config, kind, &user_id, &callback_url, source.as_ref())
      .await
      .and_then(json_value),
    AuthSessionCommand::PrepareVerifyChangeEmail {
      user_id,
      token,
      email,
      callback_url,
      source,
    } => security_challenge::prepare_verify_change_email(
      pool,
      config,
      &user_id,
      &token,
      &email,
      &callback_url,
      source.as_ref(),
    )
    .await
    .and_then(json_value),
    AuthSessionCommand::CompletePasswordChallenge {
      user_id,
      token,
      password,
    } => security_challenge::complete_password(pool, &user_id, &token, &password)
      .await
      .and_then(json_value),
    AuthSessionCommand::CompleteEmailChallenge { user_id, token, email } => {
      security_challenge::complete_email(pool, config, &user_id, &token, &email)
        .await
        .and_then(json_value)
    }
    AuthSessionCommand::CompleteVerifyEmailChallenge { user_id, token } => {
      security_challenge::complete_verify_email(pool, &user_id, &token)
        .await
        .and_then(json_value)
    }
    AuthSessionCommand::CreateSecurityUrl {
      kind,
      user_id,
      callback_url,
    } => security_challenge::create_url(pool, kind, &user_id, &callback_url)
      .await
      .and_then(json_value),
  }
}

fn json_value(value: impl serde::Serialize) -> RuntimeResult<Value> {
  serde_json::to_value(value).map_err(|error| RuntimeError::json("encode auth session result", error))
}

#[cfg(test)]
mod tests;
