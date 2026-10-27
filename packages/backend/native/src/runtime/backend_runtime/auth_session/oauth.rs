use std::collections::BTreeMap;

use affine_core::auth::{AuthChallengePurpose, OAUTH_STATE_TTL_SECONDS};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Duration;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use super::{
  RuntimeError, RuntimeResult, oauth_http,
  session::decision_time,
  types::{OAuthCallbackResult, OAuthPreflightResult, SessionIssueInput},
};
use crate::runtime::{BackendRuntimeConfig, OAuthProviderRuntimeConfig};

mod identity;
pub(super) use identity::bind_and_issue;

const OAUTH_PURPOSE: &str = AuthChallengePurpose::OAuthState.as_str();

pub(super) async fn available_providers(runtime: &BackendRuntimeConfig) -> RuntimeResult<Vec<String>> {
  let mut providers = Vec::new();
  for name in ["google", "github", "apple"] {
    if runtime.auth.oauth.providers.contains_key(name) {
      providers.push(name.to_string());
    }
  }
  if let Some(config) = runtime.auth.oauth.providers.get("oidc")
    && oauth_http::discover_oidc(config).await.is_ok()
  {
    providers.push("oidc".to_string());
  }
  Ok(providers)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OAuthState {
  pub(super) provider: String,
  pub(super) provider_label: String,
  pub(super) redirect_uri: Option<String>,
  pub(super) client: String,
  pub(super) client_nonce: String,
  pub(super) client_version: Option<String>,
  pub(super) callback_url: String,
  pub(super) pkce_verifier: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct StateEnvelope {
  state: String,
  provider: String,
  client: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pkce: Option<PkceEnvelope>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PkceEnvelope {
  code_challenge: String,
  code_challenge_method: String,
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn preflight(
  pool: &PgPool,
  runtime: &BackendRuntimeConfig,
  provider_input: &str,
  redirect_uri: Option<&str>,
  client: &str,
  client_nonce: &str,
  client_version: Option<&str>,
  callback_url: &str,
  redirect_base_url: &str,
  redirect_allowed_origins: &[String],
  redirect_trusted_domains: &[String],
) -> RuntimeResult<OAuthPreflightResult> {
  let (provider, provider_label) = provider_name(provider_input)?;
  let provider_config = runtime
    .auth
    .oauth
    .providers
    .get(provider)
    .ok_or_else(|| RuntimeError::invalid_state("unknown_oauth_provider"))?;
  validate_preflight(client, client_nonce, redirect_uri, callback_url)?;
  let redirect_uri = redirect_uri
    .map(|value| {
      crate::url_policy::evaluate_redirect_uri_internal(
        value,
        redirect_base_url,
        redirect_allowed_origins,
        redirect_trusted_domains,
      )
      .ok_or_else(|| RuntimeError::invalid_input("invalid_oauth_preflight"))
    })
    .transpose()?;
  let oidc = if provider == "oidc" {
    Some(oauth_http::discover_oidc(provider_config).await?)
  } else {
    None
  };
  let token = uuid::Uuid::new_v4().to_string();
  let pkce_verifier = (provider == "oidc").then(random_verifier);
  let pkce = pkce_verifier.as_deref().map(|verifier| PkceEnvelope {
    code_challenge: URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())),
    code_challenge_method: "S256".to_string(),
  });
  let envelope = StateEnvelope {
    state: token.clone(),
    provider: provider_label.to_string(),
    client: client.to_string(),
    pkce,
  };
  let state_parameter =
    serde_json::to_string(&envelope).map_err(|error| RuntimeError::json("encode OAuth state envelope", error))?;
  let state = OAuthState {
    provider: provider.to_string(),
    provider_label: provider_label.to_string(),
    redirect_uri,
    client: client.to_string(),
    client_nonce: client_nonce.to_string(),
    client_version: client_version.map(str::to_string),
    callback_url: callback_url.to_string(),
    pkce_verifier,
  };
  let authorization_url = auth_url(
    provider,
    provider_config,
    oidc.as_ref(),
    callback_url,
    &state_parameter,
    &token,
    client_nonce,
  )?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin OAuth preflight", error))?;
  let now = decision_time(&mut tx).await?;
  sqlx::query(
    r#"INSERT INTO runtime_states(purpose,token_hash,payload,expires_at)
       VALUES($1,$2,$3,$4)"#,
  )
  .bind(OAUTH_PURPOSE)
  .bind(super::super::token_hash(&token))
  .bind(serde_json::to_value(&state).map_err(|error| RuntimeError::json("encode OAuth state", error))?)
  .bind(now + Duration::seconds(OAUTH_STATE_TTL_SECONDS))
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("create OAuth state", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit OAuth preflight", error))?;
  Ok(OAuthPreflightResult { url: authorization_url })
}

pub(super) async fn callback(
  pool: &PgPool,
  runtime: &BackendRuntimeConfig,
  code: &str,
  raw_state: &str,
  client_nonce: Option<&str>,
  issue: SessionIssueInput,
) -> RuntimeResult<OAuthCallbackResult> {
  if code.is_empty() || code.len() > 4096 {
    return Err(RuntimeError::invalid_input("missing_oauth_query_parameter:code"));
  }
  let (state_token, envelope) = parse_state(raw_state)?;
  let token_hash = super::super::token_hash(&state_token);
  let state = read_state(pool, &token_hash).await?;
  if envelope
    .as_ref()
    .is_some_and(|envelope| envelope.provider != state.provider_label || envelope.client != state.client)
  {
    return Err(RuntimeError::invalid_state("invalid_oauth_callback_state"));
  }
  if state.provider == "apple" && state.client != "web" && envelope.is_some() {
    return Ok(OAuthCallbackResult::Handoff {
      code: code.to_string(),
      provider: state.provider_label,
      state_token,
      client: state.client,
    });
  }
  if state.provider != "apple" && client_nonce != Some(state.client_nonce.as_str()) {
    return Err(RuntimeError::invalid_state("invalid_auth_state"));
  }
  claim_state(pool, &token_hash).await?;
  let provider_config = runtime
    .auth
    .oauth
    .providers
    .get(&state.provider)
    .ok_or_else(|| RuntimeError::invalid_state("unknown_oauth_provider"))?;
  let (account, issuer) = oauth_http::exchange(
    &state.provider,
    provider_config,
    code,
    &state.callback_url,
    &state_token,
    Some(&state.client_nonce),
    state.pkce_verifier.as_deref(),
  )
  .await?;
  let namespace = oauth_http::provider_namespace(&state.provider, provider_config, issuer.as_deref());
  let login = bind_and_issue(pool, runtime, &state, &namespace, account, issue).await?;
  Ok(OAuthCallbackResult::Login {
    login,
    redirect_uri: state.redirect_uri,
    provider: state.provider,
    client: state.client,
  })
}

async fn read_state(pool: &PgPool, token_hash: &str) -> RuntimeResult<OAuthState> {
  let payload: Option<serde_json::Value> = sqlx::query_scalar(
    "SELECT payload FROM runtime_states WHERE purpose=$1 AND token_hash=$2 AND consumed_at IS NULL AND \
     expires_at>clock_timestamp()",
  )
  .bind(OAUTH_PURPOSE)
  .bind(token_hash)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("read OAuth state", error))?;
  serde_json::from_value(payload.ok_or_else(|| RuntimeError::invalid_state("oauth_state_expired"))?)
    .map_err(|_| RuntimeError::invalid_state("invalid_oauth_state"))
}

pub(super) async fn claim_state(pool: &PgPool, token_hash: &str) -> RuntimeResult<()> {
  let claimed = sqlx::query_scalar::<_, i32>(
    r#"UPDATE runtime_states SET consumed_at=clock_timestamp(),updated_at=clock_timestamp()
       WHERE purpose=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp()
       RETURNING 1"#,
  )
  .bind(OAUTH_PURPOSE)
  .bind(token_hash)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("claim OAuth state", error))?;
  if claimed.is_none() {
    return Err(RuntimeError::invalid_state("oauth_state_expired"));
  }
  Ok(())
}

fn auth_url(
  provider: &str,
  config: &OAuthProviderRuntimeConfig,
  oidc: Option<&oauth_http::OidcDiscovery>,
  callback_url: &str,
  state: &str,
  state_token: &str,
  client_nonce: &str,
) -> RuntimeResult<String> {
  let mut fields = BTreeMap::<String, String>::new();
  fields.insert("client_id".into(), config.client_id.clone());
  fields.insert("redirect_uri".into(), callback_url.into());
  let base = match provider {
    "google" => {
      fields.extend([
        ("response_type".into(), "code".into()),
        ("scope".into(), "openid email profile".into()),
        ("prompt".into(), "select_account".into()),
        ("access_type".into(), "offline".into()),
      ]);
      "https://accounts.google.com/o/oauth2/v2/auth"
    }
    "github" => {
      fields.extend([
        ("scope".into(), "read:user user:email".into()),
        ("response_type".into(), "code".into()),
      ]);
      "https://github.com/login/oauth/authorize"
    }
    "apple" => {
      fields.extend([
        ("scope".into(), "name email".into()),
        ("response_type".into(), "code".into()),
        ("response_mode".into(), "form_post".into()),
        ("nonce".into(), client_nonce.into()),
      ]);
      "https://appleid.apple.com/auth/authorize"
    }
    "oidc" => {
      let discovery = oidc.ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_provider_config"))?;
      fields.extend([
        ("scope".into(), "openid profile email".into()),
        ("response_type".into(), "code".into()),
        ("nonce".into(), state_token.into()),
      ]);
      &discovery.authorization_endpoint
    }
    _ => return Err(RuntimeError::invalid_state("unknown_oauth_provider")),
  };
  for (key, value) in &config.args {
    if provider != "oidc" || !key.starts_with("claim_") {
      fields.insert(key.clone(), value.clone());
    }
  }
  if provider == "oidc" {
    let envelope: StateEnvelope =
      serde_json::from_str(state).map_err(|_| RuntimeError::invalid_state("invalid_oauth_state"))?;
    if let Some(pkce) = envelope.pkce {
      fields.insert("code_challenge".into(), pkce.code_challenge);
      fields.insert("code_challenge_method".into(), "S256".into());
    }
  }
  fields.insert("state".into(), state.into());
  oauth_http::query_url(base, fields)
}

fn parse_state(raw: &str) -> RuntimeResult<(String, Option<StateEnvelope>)> {
  if raw.len() == 36 && uuid::Uuid::parse_str(raw).is_ok() {
    return Ok((raw.to_string(), None));
  }
  let envelope: StateEnvelope =
    serde_json::from_str(raw).map_err(|_| RuntimeError::invalid_state("invalid_oauth_callback_state"))?;
  uuid::Uuid::parse_str(&envelope.state).map_err(|_| RuntimeError::invalid_state("invalid_oauth_callback_state"))?;
  Ok((envelope.state.clone(), Some(envelope)))
}

fn provider_name(input: &str) -> RuntimeResult<(&'static str, &'static str)> {
  match input {
    "Google" | "google" => Ok(("google", "Google")),
    "GitHub" | "github" => Ok(("github", "GitHub")),
    "Apple" | "apple" => Ok(("apple", "Apple")),
    "OIDC" | "oidc" => Ok(("oidc", "OIDC")),
    _ => Err(RuntimeError::invalid_state("unknown_oauth_provider")),
  }
}

fn validate_preflight(client: &str, nonce: &str, redirect: Option<&str>, callback: &str) -> RuntimeResult<()> {
  if !matches!(
    client,
    "web" | "affine" | "affine-canary" | "affine-beta" | "affine-dev"
  ) || nonce.is_empty()
    || nonce.len() > 512
    || redirect.is_some_and(|value| value.len() > 2048)
    || url::Url::parse(callback).is_err()
  {
    return Err(RuntimeError::invalid_input("invalid_oauth_preflight"));
  }
  Ok(())
}

fn random_verifier() -> String {
  let mut bytes = [0_u8; 96];
  rand::rng().fill_bytes(&mut bytes);
  URL_SAFE_NO_PAD.encode(bytes)
}
