use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};

use super::{
  RuntimeError, RuntimeResult,
  oauth_jwt::{self, IdentityClaims},
};
use crate::runtime::OAuthProviderRuntimeConfig;

const MAX_OAUTH_BODY: u32 = 1024 * 1024;

#[derive(Clone)]
pub(super) struct OAuthHttp {
  private_origin: Option<String>,
}

impl OAuthHttp {
  pub(super) fn public() -> Self {
    Self { private_origin: None }
  }

  pub(super) fn oidc(issuer: Option<&str>) -> Self {
    let private_origin = issuer
      .and_then(|issuer| url::Url::parse(issuer).ok())
      .map(|url| url.origin().ascii_serialization());
    Self { private_origin }
  }

  pub(super) async fn get_json<T: DeserializeOwned>(&self, url: &str, bearer: Option<&str>) -> RuntimeResult<T> {
    let mut headers = HashMap::from([
      ("Accept".to_string(), "application/json".to_string()),
      ("User-Agent".to_string(), "AFFiNE-Server".to_string()),
    ]);
    if let Some(token) = bearer {
      headers.insert("Authorization".to_string(), format!("Bearer {token}"));
    }
    self
      .request_json(url, safefetch::SafeFetchMethod::Get, headers, None)
      .await
  }

  pub(super) async fn post_form_json<T: DeserializeOwned>(
    &self,
    url: &str,
    fields: &BTreeMap<String, String>,
  ) -> RuntimeResult<T> {
    let body = url::form_urlencoded::Serializer::new(String::new())
      .extend_pairs(fields)
      .finish()
      .into_bytes();
    let headers = HashMap::from([
      ("Accept".to_string(), "application/json".to_string()),
      ("User-Agent".to_string(), "AFFiNE-Server".to_string()),
      (
        "Content-Type".to_string(),
        "application/x-www-form-urlencoded".to_string(),
      ),
    ]);
    self
      .request_json(url, safefetch::SafeFetchMethod::Post, headers, Some(body))
      .await
  }

  async fn request_json<T: DeserializeOwned>(
    &self,
    url: &str,
    method: safefetch::SafeFetchMethod,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
  ) -> RuntimeResult<T> {
    let allow_private = self.private_origin.as_ref().is_some_and(|origin| {
      url::Url::parse(url)
        .ok()
        .is_some_and(|url| url.origin().ascii_serialization() == *origin)
    });
    let request = safefetch::SafeFetchRequest {
      url: url.to_string(),
      method: Some(method),
      headers: Some(headers),
      body,
      timeout_ms: Some(10_000),
      max_redirects: Some(0),
      max_bytes: Some(MAX_OAUTH_BODY),
      allowed_headers: Some(vec![
        "accept".to_string(),
        "authorization".to_string(),
        "content-type".to_string(),
        "user-agent".to_string(),
      ]),
      allowed_hosts: None,
      allow_http: Some(allow_private),
      allow_private_target_origin: Some(allow_private),
      ech_config_list: None,
    };
    let response = tokio::task::spawn_blocking(move || safefetch::safe_fetch(&request))
      .await
      .map_err(|_| RuntimeError::invalid_state("oauth_provider_unavailable"))?
      .map_err(|_| RuntimeError::invalid_state("oauth_provider_unavailable"))?;
    if !(200..300).contains(&response.status) {
      return Err(RuntimeError::invalid_state(format!(
        "invalid_oauth_callback_code:{}",
        response.status
      )));
    }
    serde_json::from_slice(&response.body).map_err(|_| RuntimeError::invalid_state("invalid_oauth_response"))
  }
}

pub(super) fn query_url(base: &str, fields: impl IntoIterator<Item = (String, String)>) -> RuntimeResult<String> {
  let mut url = url::Url::parse(base).map_err(|_| RuntimeError::invalid_state("invalid_oauth_provider_config"))?;
  url.query_pairs_mut().extend_pairs(fields);
  Ok(url.into())
}

#[derive(Clone, Debug)]
pub(super) struct OAuthAccount {
  pub(super) subject: String,
  pub(super) email: String,
  pub(super) name: Option<String>,
  pub(super) avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
  access_token: String,
  id_token: Option<String>,
}

#[derive(Deserialize)]
struct GoogleUser {
  id: String,
  email: String,
  verified_email: bool,
  name: Option<String>,
  picture: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct GitHubUser {
  id: u64,
  email: Option<String>,
  name: Option<String>,
  avatar_url: Option<String>,
}

impl GitHubUser {
  pub(super) fn subject(&self) -> String {
    self.id.to_string()
  }
}

#[derive(Deserialize)]
struct GitHubEmail {
  email: String,
  primary: bool,
  verified: bool,
}

#[derive(Clone, Deserialize)]
pub(super) struct OidcDiscovery {
  pub(super) authorization_endpoint: String,
  pub(super) token_endpoint: String,
  pub(super) userinfo_endpoint: String,
  pub(super) issuer: String,
  pub(super) jwks_uri: String,
}

pub(super) fn provider_namespace(
  provider: &str,
  config: &OAuthProviderRuntimeConfig,
  discovered_issuer: Option<&str>,
) -> String {
  let issuer = discovered_issuer.unwrap_or(match provider {
    "google" => "https://accounts.google.com",
    "github" => "https://github.com",
    "apple" => "https://appleid.apple.com",
    _ => config.issuer.as_deref().unwrap_or(""),
  });
  let digest = Sha256::digest(format!("{}\n{}", issuer.trim_end_matches('/'), config.client_id).as_bytes());
  format!("oauth:{provider}:{}", hex::encode(&digest[..16]))
}

pub(super) async fn discover_oidc(config: &OAuthProviderRuntimeConfig) -> RuntimeResult<OidcDiscovery> {
  let issuer = config
    .issuer
    .as_deref()
    .ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_provider_config"))?
    .trim_end_matches('/');
  let discovery: OidcDiscovery = OAuthHttp::oidc(config.allow_private_network.then_some(issuer))
    .get_json(&format!("{issuer}/.well-known/openid-configuration"), None)
    .await?;
  if discovery.issuer.trim_end_matches('/') != issuer
    || [
      &discovery.authorization_endpoint,
      &discovery.token_endpoint,
      &discovery.userinfo_endpoint,
      &discovery.jwks_uri,
    ]
    .iter()
    .any(|url| url::Url::parse(url).is_err())
  {
    return Err(RuntimeError::invalid_state("invalid_oauth_provider_config"));
  }
  Ok(discovery)
}

pub(super) async fn exchange(
  provider: &str,
  config: &OAuthProviderRuntimeConfig,
  code: &str,
  callback_url: &str,
  state_token: &str,
  client_nonce: Option<&str>,
  pkce_verifier: Option<&str>,
) -> RuntimeResult<(OAuthAccount, Option<String>)> {
  match provider {
    "google" => google(config, code, callback_url).await.map(|account| (account, None)),
    "github" => github(config, code, callback_url).await.map(|account| (account, None)),
    "apple" => apple(config, code, callback_url, client_nonce)
      .await
      .map(|account| (account, None)),
    "oidc" => oidc(config, code, callback_url, state_token, pkce_verifier).await,
    _ => Err(RuntimeError::invalid_state("unknown_oauth_provider")),
  }
}

async fn google(config: &OAuthProviderRuntimeConfig, code: &str, callback_url: &str) -> RuntimeResult<OAuthAccount> {
  let token: TokenResponse = OAuthHttp::public()
    .post_form_json(
      "https://oauth2.googleapis.com/token",
      &form([
        ("code", code),
        ("client_id", &config.client_id),
        ("client_secret", config.client_secret.as_str()),
        ("redirect_uri", callback_url),
        ("grant_type", "authorization_code"),
      ]),
    )
    .await?;
  let user: GoogleUser = OAuthHttp::public()
    .get_json(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      Some(&token.access_token),
    )
    .await?;
  if !user.verified_email {
    return Err(RuntimeError::invalid_state("invalid_oauth_response"));
  }
  Ok(OAuthAccount {
    subject: required(user.id)?,
    email: required(user.email)?,
    name: user.name,
    avatar_url: user.picture,
  })
}

async fn github(config: &OAuthProviderRuntimeConfig, code: &str, callback_url: &str) -> RuntimeResult<OAuthAccount> {
  let token: TokenResponse = OAuthHttp::public()
    .post_form_json(
      "https://github.com/login/oauth/access_token",
      &form([
        ("code", code),
        ("client_id", &config.client_id),
        ("client_secret", config.client_secret.as_str()),
        ("redirect_uri", callback_url),
      ]),
    )
    .await?;
  let http = OAuthHttp::public();
  let user: GitHubUser = http
    .get_json("https://api.github.com/user", Some(&token.access_token))
    .await?;
  let emails: Vec<GitHubEmail> = http
    .get_json("https://api.github.com/user/emails", Some(&token.access_token))
    .await?;
  let email = user
    .email
    .as_deref()
    .and_then(|value| {
      emails
        .iter()
        .find(|email| email.verified && email.email.eq_ignore_ascii_case(value))
    })
    .or_else(|| emails.iter().find(|email| email.primary && email.verified))
    .or_else(|| emails.iter().find(|email| email.verified))
    .map(|email| email.email.clone())
    .ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_response"))?;
  Ok(OAuthAccount {
    subject: user.subject(),
    email: required(email)?,
    name: user.name,
    avatar_url: user.avatar_url,
  })
}

async fn apple(
  config: &OAuthProviderRuntimeConfig,
  code: &str,
  callback_url: &str,
  nonce: Option<&str>,
) -> RuntimeResult<OAuthAccount> {
  let secret = if !config.client_secret.is_empty() {
    config.client_secret.to_string()
  } else {
    oauth_jwt::apple_client_secret(
      config
        .apple_private_key
        .as_deref()
        .ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_provider_config"))?,
      config
        .apple_key_id
        .as_deref()
        .ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_provider_config"))?,
      config
        .apple_team_id
        .as_deref()
        .ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_provider_config"))?,
      &config.client_id,
      chrono::Utc::now().timestamp(),
    )?
  };
  let token: TokenResponse = OAuthHttp::public()
    .post_form_json(
      "https://appleid.apple.com/auth/token",
      &form([
        ("code", code),
        ("client_id", &config.client_id),
        ("client_secret", &secret),
        ("redirect_uri", callback_url),
        ("grant_type", "authorization_code"),
      ]),
    )
    .await?;
  let claims = verify_remote_token(
    token.id_token.as_deref(),
    "https://appleid.apple.com/auth/keys",
    "https://appleid.apple.com",
    &config.client_id,
    &OAuthHttp::public(),
  )
  .await?;
  if nonce.is_some_and(|nonce| claims.nonce.as_deref() != Some(nonce)) {
    return Err(RuntimeError::invalid_state("invalid_auth_state"));
  }
  if oauth_jwt::claim_bool(&claims, "email_verified") != Some(true) {
    return Err(RuntimeError::invalid_state("invalid_oauth_response"));
  }
  Ok(OAuthAccount {
    subject: required(claims.sub.unwrap_or_default())?,
    email: required(claims.email.unwrap_or_default())?,
    name: None,
    avatar_url: None,
  })
}

async fn oidc(
  config: &OAuthProviderRuntimeConfig,
  code: &str,
  callback_url: &str,
  state_token: &str,
  pkce_verifier: Option<&str>,
) -> RuntimeResult<(OAuthAccount, Option<String>)> {
  let verifier = pkce_verifier.ok_or_else(|| RuntimeError::invalid_state("invalid_auth_state"))?;
  let discovery = discover_oidc(config).await?;
  let http = OAuthHttp::oidc(config.allow_private_network.then_some(discovery.issuer.as_str()));
  let token: TokenResponse = http
    .post_form_json(
      &discovery.token_endpoint,
      &form([
        ("code", code),
        ("client_id", &config.client_id),
        ("client_secret", config.client_secret.as_str()),
        ("redirect_uri", callback_url),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier),
      ]),
    )
    .await?;
  let claims = verify_remote_token(
    token.id_token.as_deref(),
    &discovery.jwks_uri,
    &discovery.issuer,
    &config.client_id,
    &http,
  )
  .await?;
  if claims.nonce.as_deref() != Some(state_token) {
    return Err(RuntimeError::invalid_state("invalid_auth_state"));
  }
  let user: serde_json::Value = http
    .get_json(&discovery.userinfo_endpoint, Some(&token.access_token))
    .await?;
  if user.get("sub").and_then(serde_json::Value::as_str) != claims.sub.as_deref() {
    return Err(RuntimeError::invalid_state("invalid_oauth_response"));
  }
  let subject = resolve_string(config, "claim_id", "sub", &user, &claims)
    .ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_response"))?;
  let email = resolve_string(config, "claim_email", "email", &user, &claims)
    .ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_response"))?;
  if resolve_bool(config, "claim_email_verified", "email_verified", &user, &claims) != Some(true) {
    return Err(RuntimeError::invalid_state("invalid_oauth_response"));
  }
  Ok((
    OAuthAccount {
      subject,
      email,
      name: resolve_string(config, "claim_name", "name", &user, &claims),
      avatar_url: None,
    },
    Some(discovery.issuer),
  ))
}

async fn verify_remote_token(
  token: Option<&str>,
  jwks_url: &str,
  issuer: &str,
  audience: &str,
  http: &OAuthHttp,
) -> RuntimeResult<IdentityClaims> {
  let token = token.ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_response"))?;
  let jwks: jsonwebtoken::jwk::JwkSet = http.get_json(jwks_url, None).await?;
  oauth_jwt::verify_identity_token(token, &jwks, issuer, audience)
}

fn resolve_string(
  config: &OAuthProviderRuntimeConfig,
  key: &str,
  default: &str,
  user: &serde_json::Value,
  claims: &IdentityClaims,
) -> Option<String> {
  let name = config.args.get(key).map(String::as_str).unwrap_or(default);
  user
    .get(name)
    .and_then(serde_json::Value::as_str)
    .or_else(|| oauth_jwt::claim_string(claims, name))
    .filter(|value| !value.is_empty())
    .map(str::to_string)
}

fn resolve_bool(
  config: &OAuthProviderRuntimeConfig,
  key: &str,
  default: &str,
  user: &serde_json::Value,
  claims: &IdentityClaims,
) -> Option<bool> {
  let name = config.args.get(key).map(String::as_str).unwrap_or(default);
  user
    .get(name)
    .and_then(value_bool)
    .or_else(|| oauth_jwt::claim_bool(claims, name))
}

fn value_bool(value: &serde_json::Value) -> Option<bool> {
  value.as_bool().or_else(|| {
    value
      .as_str()
      .and_then(|value| match value.to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Some(true),
        "false" | "0" | "no" => Some(false),
        _ => None,
      })
  })
}

fn required(value: String) -> RuntimeResult<String> {
  (!value.trim().is_empty())
    .then_some(value)
    .ok_or_else(|| RuntimeError::invalid_state("invalid_oauth_response"))
}

fn form<const N: usize>(fields: [(&str, &str); N]) -> BTreeMap<String, String> {
  fields
    .into_iter()
    .map(|(key, value)| (key.to_string(), value.to_string()))
    .collect()
}
