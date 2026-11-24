//! Outbound OAuth/OIDC discovery and token/userinfo exchange via `safe_fetch`
//! with bounded in-memory TTL caching.
use super::oauth::OAuthProviderConfig;
use super::oauth_crypto::{self, IdentityClaims, JwkSet};
use crate::safe_fetch::{SafeFetchPolicy, SafeFetchRequest, safe_fetch};
use chrono::Utc;
use reqwest::Method;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue, USER_AGENT};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use server_types::DomainError;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};
use std::time::{Duration as StdDuration, Instant};
use url::Url;
const MAX_OAUTH_BODY_BYTES: usize = 1024 * 1024;
const OAUTH_CACHE_MAX_ENTRIES: usize = 64;
const OAUTH_CACHE_TTL: StdDuration = StdDuration::from_secs(300);
const JWKS_FORCE_REFRESH_COOLDOWN: StdDuration = StdDuration::from_secs(30);
#[derive(Clone, Deserialize)]
pub(super) struct OidcDiscovery {
  pub(super) authorization_endpoint: String,
  pub(super) token_endpoint: String,
  pub(super) userinfo_endpoint: String,
  pub(super) issuer: String,
  pub(super) jwks_uri: String,
}
type DiscoveryCache = HashMap<(String, bool), (Instant, Arc<OidcDiscovery>)>;
type JwksCache = HashMap<(String, Option<String>), (Instant, Option<Instant>, Arc<JwkSet>)>;
fn insert_bounded_cache<K: Eq + std::hash::Hash + Clone, V>(
  map: &mut HashMap<K, V>,
  key: K,
  val: V,
  now: Instant,
  fetched_at: impl Fn(&V) -> Instant,
) {
  if map.len() >= OAUTH_CACHE_MAX_ENTRIES {
    map.retain(|_, v| now.duration_since(fetched_at(v)) < OAUTH_CACHE_TTL);
    if map.len() >= OAUTH_CACHE_MAX_ENTRIES
      && let Some(oldest) = map.iter().min_by_key(|(_, v)| fetched_at(v)).map(|(k, _)| k.clone())
    {
      map.remove(&oldest);
    }
  }
  map.insert(key, val);
}
fn discovery_cache() -> &'static RwLock<DiscoveryCache> {
  static CACHE: OnceLock<RwLock<DiscoveryCache>> = OnceLock::new();
  CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}
fn jwks_cache() -> &'static RwLock<JwksCache> {
  static CACHE: OnceLock<RwLock<JwksCache>> = OnceLock::new();
  CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}
#[derive(Deserialize)]
struct TokenResponse {
  access_token: String,
  id_token: Option<String>,
}
pub(super) struct OAuthAccount {
  pub(super) subject: String,
  pub(super) email: String,
  pub(super) name: Option<String>,
  pub(super) avatar_url: Option<String>,
}
pub(super) fn provider_namespace(
  provider: &str,
  config: &OAuthProviderConfig,
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
pub(super) fn validate_oidc_endpoint_url(endpoint: &str, issuer_url: &Url, allow_private_network: bool) -> bool {
  let Ok(parsed) = Url::parse(endpoint) else { return false };
  if parsed.host_str().is_none_or(str::is_empty) || !parsed.username().is_empty() || parsed.password().is_some() {
    return false;
  }
  parsed.scheme() == "https"
    || (allow_private_network && parsed.scheme() == "http" && parsed.origin() == issuer_url.origin())
}
#[derive(Default)]
struct OAuthHttpClient {
  private_origin: Option<url::Origin>,
  allow_http: bool,
}
impl OAuthHttpClient {
  fn for_oidc(issuer: Option<&str>, allow_private_network: bool) -> Self {
    let parsed = allow_private_network
      .then(|| issuer.and_then(|u| Url::parse(u).ok()))
      .flatten();
    Self {
      allow_http: parsed.as_ref().is_some_and(|u| u.scheme() == "http"),
      private_origin: parsed.map(|u| u.origin()),
    }
  }
  fn policy_for(&self, target_url: &str) -> SafeFetchPolicy {
    let mut policy = SafeFetchPolicy {
      max_redirects: 0,
      timeout: StdDuration::from_secs(10),
      connect_timeout: StdDuration::from_secs(5),
      max_response_bytes: MAX_OAUTH_BODY_BYTES,
      ..SafeFetchPolicy::default()
    };
    if let Some(origin) = &self.private_origin
      && let Ok(parsed) = Url::parse(target_url)
      && parsed.origin() == *origin
    {
      policy.allow_private_origins.push(origin.clone());
      policy.allow_http = self.allow_http;
    }
    policy
  }
  async fn request_json<T: DeserializeOwned>(
    &self,
    method: Method,
    url: &str,
    bearer: Option<&str>,
    form: Option<&[(&str, &str)]>,
  ) -> Result<T, DomainError> {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("AFFiNE-Server"));
    if let Some(tok) = bearer
      && let Ok(val) = HeaderValue::from_str(&format!("Bearer {tok}"))
    {
      headers.insert(AUTHORIZATION, val);
    }
    let body = form.map(|fields| {
      headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
      );
      url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(fields)
        .finish()
        .into_bytes()
    });
    let resp = safe_fetch(SafeFetchRequest {
      method,
      url: url.to_owned(),
      headers,
      body,
      policy: self.policy_for(url),
    })
    .await
    .map_err(|_| DomainError::Unavailable("oauth_provider_unavailable".to_owned()))?;
    if !resp.status.is_success() {
      return Err(DomainError::Validation(format!(
        "invalid_oauth_callback_code:{}",
        resp.status.as_u16()
      )));
    }
    serde_json::from_slice(&resp.body).map_err(|_| bad_response())
  }
  async fn get_json<T: DeserializeOwned>(&self, url: &str, bearer: Option<&str>) -> Result<T, DomainError> {
    self.request_json(Method::GET, url, bearer, None).await
  }
  async fn post_token(&self, url: &str, form: &[(&str, &str)]) -> Result<TokenResponse, DomainError> {
    self.request_json(Method::POST, url, None, Some(form)).await
  }
}
fn bad_config() -> DomainError {
  DomainError::Validation("invalid_oauth_provider_config".to_owned())
}
fn bad_response() -> DomainError {
  DomainError::Validation("invalid_oauth_response".to_owned())
}
pub fn build_oauth_token_form<'a>(
  client_id: &'a str,
  secret: &'a str,
  code: &'a str,
  cb: &'a str,
  include_grant_type: bool,
  verifier: Option<&'a str>,
) -> Vec<(&'static str, &'a str)> {
  let mut f = vec![
    ("code", code),
    ("client_id", client_id),
    ("client_secret", secret),
    ("redirect_uri", cb),
  ];
  if include_grant_type {
    f.push(("grant_type", "authorization_code"));
  }
  if let Some(v) = verifier {
    f.push(("code_verifier", v));
  }
  f
}
pub(super) async fn discover_oidc(config: &OAuthProviderConfig) -> Result<Arc<OidcDiscovery>, DomainError> {
  let issuer = config.issuer.as_deref().ok_or_else(bad_config)?.trim_end_matches('/');
  let issuer_url = Url::parse(issuer).map_err(|_| bad_config())?;
  if !validate_oidc_endpoint_url(issuer, &issuer_url, config.allow_private_network) {
    return Err(bad_config());
  }
  let cache_key = (issuer.to_owned(), config.allow_private_network);
  let now = Instant::now();
  if let Ok(guard) = discovery_cache().read()
    && let Some((ts, doc)) = guard.get(&cache_key)
    && now.duration_since(*ts) < OAUTH_CACHE_TTL
  {
    return Ok(Arc::clone(doc));
  }
  let http = OAuthHttpClient::for_oidc(Some(issuer), config.allow_private_network);
  let d: OidcDiscovery = http
    .get_json(&format!("{issuer}/.well-known/openid-configuration"), None)
    .await?;
  if d.issuer.trim_end_matches('/') != issuer
    || [
      &d.authorization_endpoint,
      &d.token_endpoint,
      &d.userinfo_endpoint,
      &d.jwks_uri,
    ]
    .iter()
    .any(|u| !validate_oidc_endpoint_url(u, &issuer_url, config.allow_private_network))
  {
    return Err(bad_config());
  }
  let doc = Arc::new(d);
  if let Ok(mut guard) = discovery_cache().write() {
    let t = Instant::now();
    insert_bounded_cache(&mut guard, cache_key, (t, Arc::clone(&doc)), t, |v| v.0);
  }
  Ok(doc)
}
async fn fetch_jwks(
  http: &OAuthHttpClient,
  jwks_uri: &str,
  token_kid: Option<&str>,
) -> Result<Arc<JwkSet>, DomainError> {
  let cache_key = (
    jwks_uri.to_owned(),
    http.private_origin.as_ref().map(|o| o.ascii_serialization()),
  );
  let (now, mut forced, mut fallback) = (Instant::now(), false, None);
  if let Ok(guard) = jwks_cache().read()
    && let Some((ts, last_force, jwks)) = guard.get(&cache_key)
    && now.duration_since(*ts) < OAUTH_CACHE_TTL
  {
    if token_kid.is_none_or(|kid| jwks.keys.iter().any(|k| k.kid.as_deref() == Some(kid)))
      || last_force.is_some_and(|t| now.duration_since(t) < JWKS_FORCE_REFRESH_COOLDOWN)
    {
      return Ok(Arc::clone(jwks));
    }
    forced = true;
    fallback = Some(Arc::clone(jwks));
  }
  let fetched: JwkSet = match http.get_json(jwks_uri, None).await {
    Ok(jwks) => jwks,
    Err(err) => return fallback.ok_or(err),
  };
  let jwks = Arc::new(fetched);
  if let Ok(mut guard) = jwks_cache().write() {
    let t = Instant::now();
    insert_bounded_cache(
      &mut guard,
      cache_key,
      (t, forced.then_some(t), Arc::clone(&jwks)),
      t,
      |v| v.0,
    );
  }
  Ok(jwks)
}
pub(super) async fn exchange_oauth_code(
  provider: &str,
  config: &OAuthProviderConfig,
  code: &str,
  callback_url: &str,
  state_token: &str,
  client_nonce: Option<&str>,
  pkce_verifier: Option<&str>,
) -> Result<(OAuthAccount, Option<String>), DomainError> {
  match provider {
    "google" => Ok((exchange_google(config, code, callback_url).await?, None)),
    "github" => Ok((exchange_github(config, code, callback_url).await?, None)),
    "apple" => Ok((exchange_apple(config, code, callback_url, client_nonce).await?, None)),
    "oidc" => exchange_oidc(config, code, callback_url, state_token, pkce_verifier).await,
    _ => Err(DomainError::Validation(format!("unknown_oauth_provider:{provider}"))),
  }
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
struct GitHubUser {
  id: u64,
  email: Option<String>,
  name: Option<String>,
  avatar_url: Option<String>,
}
#[derive(Deserialize)]
struct GitHubEmail {
  email: String,
  primary: bool,
  verified: bool,
}
async fn exchange_google(
  config: &OAuthProviderConfig,
  code: &str,
  callback_url: &str,
) -> Result<OAuthAccount, DomainError> {
  let http = OAuthHttpClient::default();
  let form = build_oauth_token_form(&config.client_id, &config.client_secret, code, callback_url, true, None);
  let token = http.post_token("https://oauth2.googleapis.com/token", &form).await?;
  let u: GoogleUser = http
    .get_json(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      Some(&token.access_token),
    )
    .await?;
  if !u.verified_email {
    return Err(bad_response());
  }
  Ok(OAuthAccount {
    subject: required_non_empty(u.id)?,
    email: required_non_empty(u.email)?,
    name: u.name,
    avatar_url: u.picture,
  })
}
async fn exchange_github(
  config: &OAuthProviderConfig,
  code: &str,
  callback_url: &str,
) -> Result<OAuthAccount, DomainError> {
  let http = OAuthHttpClient::default();
  let form = build_oauth_token_form(
    &config.client_id,
    &config.client_secret,
    code,
    callback_url,
    false,
    None,
  );
  let token = http
    .post_token("https://github.com/login/oauth/access_token", &form)
    .await?;
  let u: GitHubUser = http
    .get_json("https://api.github.com/user", Some(&token.access_token))
    .await?;
  let emails: Vec<GitHubEmail> = http
    .get_json("https://api.github.com/user/emails", Some(&token.access_token))
    .await?;
  let email = u
    .email
    .as_deref()
    .and_then(|val| emails.iter().find(|e| e.verified && e.email.eq_ignore_ascii_case(val)))
    .or_else(|| emails.iter().find(|e| e.primary && e.verified))
    .or_else(|| emails.iter().find(|e| e.verified))
    .map(|e| e.email.clone())
    .ok_or_else(bad_response)?;
  Ok(OAuthAccount {
    subject: u.id.to_string(),
    email: required_non_empty(email)?,
    name: u.name,
    avatar_url: u.avatar_url,
  })
}
async fn exchange_apple(
  config: &OAuthProviderConfig,
  code: &str,
  callback_url: &str,
  nonce: Option<&str>,
) -> Result<OAuthAccount, DomainError> {
  let secret = if !config.client_secret.trim().is_empty() {
    config.client_secret.clone()
  } else {
    oauth_crypto::apple_client_secret(
      config.apple_private_key.as_deref().ok_or_else(bad_config)?,
      config.apple_key_id.as_deref().ok_or_else(bad_config)?,
      config.apple_team_id.as_deref().ok_or_else(bad_config)?,
      &config.client_id,
      Utc::now().timestamp(),
    )?
  };
  let http = OAuthHttpClient::default();
  let form = build_oauth_token_form(&config.client_id, &secret, code, callback_url, true, None);
  let token = http.post_token("https://appleid.apple.com/auth/token", &form).await?;
  let id_token = token.id_token.as_deref().ok_or_else(bad_response)?;
  let jwks = fetch_jwks(
    &http,
    "https://appleid.apple.com/auth/keys",
    oauth_crypto::extract_jwt_kid(id_token).as_deref(),
  )
  .await?;
  let claims = oauth_crypto::verify_identity_token(id_token, &jwks, "https://appleid.apple.com", &config.client_id)?;
  if nonce.is_some_and(|expected| claims.nonce.as_deref() != Some(expected)) {
    return Err(DomainError::Validation("invalid_auth_state".to_owned()));
  }
  if oauth_crypto::claim_bool(&claims, "email_verified") != Some(true) {
    return Err(bad_response());
  }
  Ok(OAuthAccount {
    subject: required_non_empty(claims.sub.unwrap_or_default())?,
    email: required_non_empty(claims.email.unwrap_or_default())?,
    name: None,
    avatar_url: None,
  })
}
async fn exchange_oidc(
  config: &OAuthProviderConfig,
  code: &str,
  callback_url: &str,
  state_token: &str,
  pkce_verifier: Option<&str>,
) -> Result<(OAuthAccount, Option<String>), DomainError> {
  let verifier = pkce_verifier.ok_or_else(|| DomainError::Validation("invalid_auth_state".to_owned()))?;
  let d = discover_oidc(config).await?;
  let http = OAuthHttpClient::for_oidc(Some(d.issuer.as_str()), config.allow_private_network);
  let form = build_oauth_token_form(
    &config.client_id,
    &config.client_secret,
    code,
    callback_url,
    true,
    Some(verifier),
  );
  let token = http.post_token(&d.token_endpoint, &form).await?;
  let id_token = token.id_token.as_deref().ok_or_else(bad_response)?;
  let jwks = fetch_jwks(&http, &d.jwks_uri, oauth_crypto::extract_jwt_kid(id_token).as_deref()).await?;
  let claims = oauth_crypto::verify_identity_token(id_token, &jwks, &d.issuer, &config.client_id)?;
  if claims.nonce.as_deref() != Some(state_token) {
    return Err(DomainError::Validation("invalid_auth_state".to_owned()));
  }
  let user: Value = http.get_json(&d.userinfo_endpoint, Some(&token.access_token)).await?;
  if user.get("sub").and_then(Value::as_str) != claims.sub.as_deref() {
    return Err(bad_response());
  }
  let subject = resolve_oidc_string(config, "claim_id", "sub", &user, &claims).ok_or_else(bad_response)?;
  let email = resolve_oidc_string(config, "claim_email", "email", &user, &claims).ok_or_else(bad_response)?;
  if resolve_oidc_bool(config, "claim_email_verified", "email_verified", &user, &claims) != Some(true) {
    return Err(bad_response());
  }
  Ok((
    OAuthAccount {
      subject,
      email,
      name: resolve_oidc_string(config, "claim_name", "name", &user, &claims),
      avatar_url: None,
    },
    Some(d.issuer.clone()),
  ))
}
fn resolve_oidc_string(
  config: &OAuthProviderConfig,
  key: &str,
  default: &str,
  user: &Value,
  claims: &IdentityClaims,
) -> Option<String> {
  let name = config.args.get(key).map_or(default, String::as_str);
  user
    .get(name)
    .and_then(Value::as_str)
    .or_else(|| oauth_crypto::claim_string(claims, name))
    .filter(|v| !v.is_empty())
    .map(str::to_owned)
}
fn resolve_oidc_bool(
  config: &OAuthProviderConfig,
  key: &str,
  default: &str,
  user: &Value,
  claims: &IdentityClaims,
) -> Option<bool> {
  let name = config.args.get(key).map_or(default, String::as_str);
  user
    .get(name)
    .and_then(oauth_crypto::json_bool)
    .or_else(|| oauth_crypto::claim_bool(claims, name))
}
fn required_non_empty(value: String) -> Result<String, DomainError> {
  (!value.trim().is_empty()).then_some(value).ok_or_else(bad_response)
}
