//! Login OAuth/OIDC preflight, atomic state claim, lock-free outbound token
//! exchange via `oauth_http`, and identity binding / session issuance.
pub use super::oauth_http::build_oauth_token_form;
use super::oauth_http::{
  OAuthAccount, OidcDiscovery, discover_oidc, exchange_oauth_code, provider_namespace, validate_oidc_endpoint_url,
};
use super::{
  AUTH_SESSION_EXCHANGE_PURPOSE, AUTH_SESSION_EXCHANGE_TTL_SECONDS, AuthService, CookieSignInResult,
  OpenAppIssueTarget, OpenAppSignInResult, canonical_email, constant_time_equal, decision_time, lock_email, token_hash,
};
use crate::users::load_current_user_in_tx;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Duration;
use rand::RngCore as _;
use serde::{Deserialize, Serialize};
use server_db::{ServerDb, WorkloadTier};
use server_types::DomainError;
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use std::collections::{BTreeMap, HashMap};
use std::fmt;
use url::Url;
use uuid::Uuid;
pub const OAUTH_STATE_PURPOSE: &str = "auth_challenge:oauth_state";
pub const OAUTH_STATE_TTL_SECONDS: i64 = 10_800;
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthProviderConfig {
  #[serde(default)]
  pub client_id: String,
  #[serde(default)]
  pub client_secret: String,
  pub issuer: Option<String>,
  #[serde(default)]
  pub allow_private_network: bool,
  pub apple_private_key: Option<String>,
  pub apple_key_id: Option<String>,
  pub apple_team_id: Option<String>,
  #[serde(default)]
  pub args: HashMap<String, String>,
}
impl fmt::Debug for OAuthProviderConfig {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("OAuthProviderConfig")
      .field("client_id", &self.client_id)
      .field("client_secret", &"[REDACTED]")
      .field("issuer", &self.issuer)
      .field("allow_private_network", &self.allow_private_network)
      .field(
        "apple_private_key",
        &self.apple_private_key.as_ref().map(|_| "[REDACTED]"),
      )
      .field("apple_key_id", &self.apple_key_id)
      .field("apple_team_id", &self.apple_team_id)
      .finish()
  }
}
fn val_err(msg: impl Into<String>) -> DomainError {
  DomainError::Validation(msg.into())
}
#[derive(Clone, Debug)]
pub struct OAuthPreflightInput {
  pub provider: String,
  pub redirect_uri: Option<String>,
  pub client: String,
  pub client_nonce: String,
  pub client_version: Option<String>,
  pub callback_url: String,
  pub redirect_base_url: String,
  pub redirect_allowed_origins: Vec<String>,
  pub redirect_trusted_domains: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct OAuthPreflightResult {
  pub url: String,
}
#[derive(Clone, Debug)]
pub enum OAuthCallbackResult {
  Handoff {
    code: String,
    provider: String,
    state_token: String,
    client: String,
  },
  Login {
    session: OpenAppSignInResult,
    redirect_uri: Option<String>,
    provider: String,
    client: String,
  },
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthStateRecord {
  provider: String,
  provider_label: String,
  redirect_uri: Option<String>,
  client: String,
  client_nonce: String,
  client_version: Option<String>,
  callback_url: String,
  pkce_verifier: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PkceEnvelope {
  code_challenge: String,
  code_challenge_method: String,
}
#[derive(Serialize, Deserialize)]
struct StateEnvelope {
  state: String,
  provider: String,
  client: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  flow: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pkce: Option<PkceEnvelope>,
}
impl AuthService {
  pub async fn available_oauth_providers(&self) -> Result<Vec<String>, DomainError> {
    let configs = load_all_oauth_provider_configs(&self.db, &self.config.oauth_providers).await?;
    let mut providers: Vec<String> = ["google", "github", "apple"]
      .into_iter()
      .filter(|n| configs.contains_key(*n))
      .map(str::to_owned)
      .collect();
    if let Some(oidc) = configs.get("oidc")
      && discover_oidc(oidc).await.is_ok()
    {
      providers.push("oidc".to_owned());
    }
    Ok(providers)
  }
  pub async fn oauth_preflight(&self, input: OAuthPreflightInput) -> Result<OAuthPreflightResult, DomainError> {
    let (provider, provider_label) = normalize_provider_name(&input.provider)?;
    let cfg = load_oauth_provider_config(&self.db, &self.config.oauth_providers, provider)
      .await?
      .ok_or_else(|| val_err(format!("unknown_oauth_provider:{provider}")))?;
    validate_preflight_fields(
      &input.client,
      &input.client_nonce,
      input.redirect_uri.as_deref(),
      &input.callback_url,
    )?;
    let redirect_uri = input
      .redirect_uri
      .as_deref()
      .map(|v| {
        validate_redirect_uri(
          v,
          &input.redirect_base_url,
          &input.redirect_allowed_origins,
          &input.redirect_trusted_domains,
        )
        .ok_or_else(|| DomainError::Forbidden("invalid_oauth_redirect_uri".to_owned()))
      })
      .transpose()?;
    let oidc = if provider == "oidc" {
      Some(discover_oidc(&cfg).await?)
    } else {
      None
    };
    let token = Uuid::new_v4().to_string();
    let pkce_verifier = (provider == "oidc").then(random_pkce_verifier);
    let pkce = pkce_verifier.as_deref().map(|v| PkceEnvelope {
      code_challenge: URL_SAFE_NO_PAD.encode(Sha256::digest(v.as_bytes())),
      code_challenge_method: "S256".to_owned(),
    });
    let state_param = serde_json::to_string(&StateEnvelope {
      state: token.clone(),
      provider: provider_label.to_owned(),
      client: input.client.clone(),
      flow: None,
      pkce,
    })
    .map_err(db_err("encode OAuth state envelope"))?;
    let state = OAuthStateRecord {
      provider: provider.to_owned(),
      provider_label: provider_label.to_owned(),
      redirect_uri,
      client: input.client,
      client_nonce: input.client_nonce.clone(),
      client_version: input.client_version,
      callback_url: input.callback_url.clone(),
      pkce_verifier,
    };
    let url = build_authorization_url(
      provider,
      &cfg,
      oidc.as_deref(),
      &input.callback_url,
      &state_param,
      &token,
      &input.client_nonce,
    )?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(db_err("begin OAuth preflight"))?;
    let now = decision_time(tx.tx_mut()).await?;
    sqlx::query("INSERT INTO runtime_states (purpose, token_hash, payload, expires_at) VALUES ($1, $2, $3, $4)")
      .bind(OAUTH_STATE_PURPOSE)
      .bind(token_hash(&token))
      .bind(serde_json::to_value(&state).map_err(db_err("encode OAuth state"))?)
      .bind(now + Duration::seconds(OAUTH_STATE_TTL_SECONDS))
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(db_err("insert OAuth state"))?;
    tx.commit().await.map_err(db_err("commit OAuth preflight"))?;
    Ok(OAuthPreflightResult { url })
  }
  pub async fn oauth_callback(
    &self,
    code: &str,
    raw_state: &str,
    client_nonce: Option<&str>,
    target: OpenAppIssueTarget<'_>,
  ) -> Result<OAuthCallbackResult, DomainError> {
    if code.is_empty() || code.len() > 4096 {
      return Err(val_err("missing_oauth_query_parameter:code"));
    }
    let (state_token, envelope) = parse_state_parameter(raw_state)?;
    let hashed = token_hash(&state_token);
    let state = read_oauth_state(&self.db, &hashed).await?;
    if envelope
      .as_ref()
      .is_some_and(|e| e.provider != state.provider_label || e.client != state.client)
    {
      return Err(val_err("invalid_oauth_callback_state"));
    }
    if state.provider == "apple" && state.client != "web" && envelope.is_some() {
      return Ok(OAuthCallbackResult::Handoff {
        code: code.to_owned(),
        provider: state.provider_label,
        state_token,
        client: state.client,
      });
    }
    if state.provider != "apple" && !client_nonce.is_some_and(|n| constant_time_equal(n, &state.client_nonce)) {
      return Err(val_err("invalid_auth_state"));
    }
    claim_oauth_state(&self.db, &hashed).await?;
    let cfg = load_oauth_provider_config(&self.db, &self.config.oauth_providers, &state.provider)
      .await?
      .ok_or_else(|| val_err(format!("unknown_oauth_provider:{}", state.provider)))?;
    let (_, allow_signup_for_oauth) =
      load_signup_flags(&self.db, self.config.allow_signup, self.config.allow_signup_for_oauth).await?;
    let (account, issuer) = exchange_oauth_code(
      &state.provider,
      &cfg,
      code,
      &state.callback_url,
      &state_token,
      Some(&state.client_nonce),
      state.pkce_verifier.as_deref(),
    )
    .await?;
    let ns = provider_namespace(&state.provider, &cfg, issuer.as_deref());
    let session = self
      .bind_oauth_identity_and_issue(&state.provider, &ns, account, allow_signup_for_oauth, target)
      .await?;
    Ok(OAuthCallbackResult::Login {
      session,
      redirect_uri: state.redirect_uri,
      provider: state.provider,
      client: state.client,
    })
  }
  async fn bind_oauth_identity_and_issue(
    &self,
    provider: &str,
    namespace: &str,
    account: OAuthAccount,
    allow_signup_for_oauth: bool,
    target: OpenAppIssueTarget<'_>,
  ) -> Result<OpenAppSignInResult, DomainError> {
    let email = canonical_email(&account.email)?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(db_err("begin OAuth binding"))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('auth:oauth:' || $1 || ':' || $2, 0))")
      .bind(namespace)
      .bind(&account.subject)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(db_err("lock OAuth identity"))?;
    lock_email(tx.tx_mut(), &email).await?;
    let err_cred = || DomainError::Unauthorized("wrong_sign_in_credentials".to_owned());
    let existing = find_connected_account(tx.tx_mut(), provider, namespace, &account.subject).await?;
    let now = decision_time(tx.tx_mut()).await?;
    let (user_id, created_user) = if let Some((account_id, user_id, legacy)) = existing {
      let row = sqlx::query("SELECT disabled FROM users WHERE id = $1 FOR UPDATE")
        .bind(&user_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(db_err("lock OAuth bound user"))?
        .ok_or_else(err_cred)?;
      if row.get::<bool, _>("disabled") {
        return Err(err_cred());
      }
      if legacy {
        sqlx::query("UPDATE user_connected_accounts SET provider_namespace = $2, updated_at = $3 WHERE id = $1")
          .bind(account_id)
          .bind(namespace)
          .bind(now)
          .execute(&mut **tx.tx_mut())
          .await
          .map_err(db_err("adopt OAuth namespace"))?;
      }
      sqlx::query("UPDATE users SET email_verified = CASE WHEN lower(email) = lower($2) THEN COALESCE(email_verified, $3) ELSE email_verified END WHERE id = $1")
      .bind(&user_id).bind(&email).bind(now).execute(&mut **tx.tx_mut()).await.map_err(db_err("verify OAuth email"))?;
      (user_id, false)
    } else {
      let users = sqlx::query("SELECT id, disabled FROM users WHERE lower(email) = lower($1) ORDER BY id FOR UPDATE")
        .bind(&email)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(db_err("find OAuth email"))?;
      if users.is_empty() && !allow_signup_for_oauth {
        return Err(DomainError::Forbidden("sign_up_forbidden".to_owned()));
      }
      if users.len() > 1 || users.first().is_some_and(|r| r.get::<bool, _>("disabled")) {
        return Err(err_cred());
      }
      let (user_id, created) = if let Some(row) = users.first() {
        let uid: String = row.get("id");
        sqlx::query("UPDATE users SET registered = true, email_verified = COALESCE(email_verified, $2), name = COALESCE($3, name), avatar_url = COALESCE($4, avatar_url) WHERE id = $1")
        .bind(&uid).bind(now).bind(&account.name).bind(&account.avatar_url).execute(&mut **tx.tx_mut()).await.map_err(db_err("fulfill OAuth user"))?;
        (uid, false)
      } else {
        let uid = Uuid::new_v4().to_string();
        let name = account
          .name
          .as_deref()
          .unwrap_or_else(|| email.split('@').next().unwrap_or(&email));
        sqlx::query("INSERT INTO users (id, name, email, email_verified, avatar_url, registered, disabled, auth_epoch, created_at) VALUES ($1, $2, $3, $4, $5, true, false, 0, $4)")
        .bind(&uid).bind(name).bind(&email).bind(now).bind(&account.avatar_url).execute(&mut **tx.tx_mut()).await.map_err(db_err("create OAuth user"))?;
        (uid, true)
      };
      sqlx::query("INSERT INTO user_connected_accounts (id, user_id, provider, provider_namespace, provider_account_id, scope, access_token, refresh_token, expires_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, NULL, $6, $6)")
      .bind(Uuid::new_v4().to_string()).bind(&user_id).bind(provider).bind(namespace).bind(&account.subject).bind(now)
      .execute(&mut **tx.tx_mut()).await.map_err(db_err("bind OAuth account"))?;
      (user_id, created)
    };
    let auth_epoch: i32 = sqlx::query_scalar("SELECT auth_epoch FROM users WHERE id = $1 FOR UPDATE")
      .bind(&user_id)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(db_err("load OAuth auth_epoch"))?;
    let user = load_current_user_in_tx(tx.tx_mut(), &user_id)
      .await?
      .ok_or_else(|| DomainError::Internal("OAuth user missing".to_owned()))?;
    match target {
      OpenAppIssueTarget::Native { client_version } => {
        let exchange_code = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        sqlx::query(
          "INSERT INTO runtime_states (purpose, token_hash, payload, created_at, updated_at, expires_at) VALUES ($1, $2, $3, $4, $4, $5)",
        )
        .bind(AUTH_SESSION_EXCHANGE_PURPOSE)
        .bind(token_hash(&exchange_code))
        .bind(serde_json::json!({ "userId": user_id, "authEpoch": auth_epoch, "clientVersion": client_version }))
        .bind(now)
        .bind(now + Duration::seconds(AUTH_SESSION_EXCHANGE_TTL_SECONDS))
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(db_err("insert OAuth exchange code"))?;
        tx.commit().await.map_err(db_err("commit OAuth native login"))?;
        Ok(OpenAppSignInResult::Native { user, exchange_code })
      }
      OpenAppIssueTarget::Cookie {
        existing_session_id,
        client_version,
      } => {
        let issued = self
          .sessions
          .issue_cookie_session(
            tx.tx_mut(),
            &user_id,
            existing_session_id,
            client_version,
            self.config.session_ttl_seconds,
            now,
          )
          .await
          .map_err(db_err("issue OAuth cookie session"))?;
        self
          .session_policy
          .on_session_created(tx.tx_mut(), &user_id, &issued.session_id, now)
          .await?;
        tx.commit().await.map_err(db_err("commit OAuth cookie login"))?;
        Ok(OpenAppSignInResult::Cookie(CookieSignInResult {
          user,
          session_id: issued.session_id,
          user_session_id: issued.user_session_id,
          expires_at: issued.expires_at,
          created_user,
        }))
      }
    }
  }
}
pub fn normalize_oauth_provider_config(provider: &str, mut cfg: OAuthProviderConfig) -> Option<OAuthProviderConfig> {
  if provider == "apple" {
    for (arg_key, slot) in [
      ("privateKey", &mut cfg.apple_private_key),
      ("keyId", &mut cfg.apple_key_id),
      ("teamId", &mut cfg.apple_team_id),
    ] {
      if let Some(val) = cfg.args.remove(arg_key)
        && slot.as_deref().is_none_or(|s| s.trim().is_empty())
      {
        *slot = Some(val);
      }
    }
  }
  if cfg.client_id.trim().is_empty() {
    return None;
  }
  let has_apple_key = provider == "apple"
    && [&cfg.apple_private_key, &cfg.apple_key_id, &cfg.apple_team_id]
      .iter()
      .all(|s| s.as_deref().is_some_and(|v| !v.trim().is_empty()));
  (!cfg.client_secret.trim().is_empty() || has_apple_key).then_some(cfg)
}
fn db_err<E: fmt::Display>(ctx: &str) -> impl FnOnce(E) -> DomainError + '_ {
  move |e| DomainError::Internal(format!("{ctx}: {e}"))
}
async fn load_all_oauth_provider_configs(
  db: &ServerDb,
  baseline: &HashMap<String, OAuthProviderConfig>,
) -> Result<HashMap<String, OAuthProviderConfig>, DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveRead)
    .await
    .map_err(db_err("acquire oauth configs"))?;
  let rows = sqlx::query("SELECT id, value FROM app_configs WHERE id LIKE 'oauth.providers.%'")
    .fetch_all(&mut *conn)
    .await
    .map_err(db_err("load oauth configs"))?;
  drop(conn);
  let mut out: HashMap<String, OAuthProviderConfig> = baseline
    .iter()
    .filter_map(|(p, c)| normalize_oauth_provider_config(p, c.clone()).map(|n| (p.clone(), n)))
    .collect();
  for row in rows {
    let id: String = row.get("id");
    let value: serde_json::Value = row.get("value");
    if let Some(provider) = id.strip_prefix("oauth.providers.") {
      out.remove(provider);
      if let Ok(cfg) = serde_json::from_value::<OAuthProviderConfig>(value)
        && let Some(normalized) = normalize_oauth_provider_config(provider, cfg)
      {
        out.insert(provider.to_owned(), normalized);
      }
    }
  }
  Ok(out)
}
async fn load_oauth_provider_config(
  db: &ServerDb,
  baseline: &HashMap<String, OAuthProviderConfig>,
  provider: &str,
) -> Result<Option<OAuthProviderConfig>, DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveRead)
    .await
    .map_err(db_err("acquire oauth config"))?;
  let value: Option<serde_json::Value> = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = $1")
    .bind(format!("oauth.providers.{provider}"))
    .fetch_optional(&mut *conn)
    .await
    .map_err(db_err("load oauth provider config"))?;
  drop(conn);
  let raw = match value {
    Some(v) => serde_json::from_value::<OAuthProviderConfig>(v).ok(),
    None => baseline.get(provider).cloned(),
  };
  Ok(raw.and_then(|cfg| normalize_oauth_provider_config(provider, cfg)))
}
pub(super) async fn load_signup_flags(
  db: &ServerDb,
  default_allow_signup: bool,
  default_allow_oauth: bool,
) -> Result<(bool, bool), DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveRead)
    .await
    .map_err(db_err("acquire signup flags"))?;
  let rows = sqlx::query("SELECT id, value FROM app_configs WHERE id = ANY($1)")
    .bind(&["auth.allowSignup", "auth.allowSignupForOauth"][..])
    .fetch_all(&mut *conn)
    .await
    .map_err(db_err("load signup flags"))?;
  drop(conn);
  let (mut allow_signup, mut allow_oauth) = (default_allow_signup, default_allow_oauth);
  for row in rows {
    if let Some(flag) = row.get::<serde_json::Value, _>("value").as_bool() {
      match row.get::<String, _>("id").as_str() {
        "auth.allowSignup" => allow_signup = flag,
        "auth.allowSignupForOauth" => allow_oauth = flag,
        _ => {}
      }
    }
  }
  Ok((allow_signup, allow_oauth))
}
async fn read_oauth_state(db: &ServerDb, hashed: &str) -> Result<OAuthStateRecord, DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveRead)
    .await
    .map_err(db_err("read OAuth state"))?;
  let payload: Option<serde_json::Value> = sqlx::query_scalar(
    "SELECT payload FROM runtime_states WHERE purpose = $1 AND token_hash = $2 AND consumed_at IS NULL AND expires_at > clock_timestamp()",
  )
  .bind(OAUTH_STATE_PURPOSE)
  .bind(hashed)
  .fetch_optional(&mut *conn)
  .await
  .map_err(db_err("read OAuth state"))?;
  drop(conn);
  let payload = payload.ok_or_else(|| val_err("oauth_state_expired"))?;
  serde_json::from_value(payload).map_err(|_| val_err("invalid_oauth_callback_state"))
}
async fn claim_oauth_state(db: &ServerDb, hashed: &str) -> Result<(), DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveWrite)
    .await
    .map_err(db_err("claim OAuth state"))?;
  let claimed: Option<i32> = sqlx::query_scalar(
    "UPDATE runtime_states SET consumed_at = clock_timestamp(), updated_at = clock_timestamp() WHERE purpose = $1 AND token_hash = $2 AND consumed_at IS NULL AND expires_at > clock_timestamp() RETURNING 1",
  )
  .bind(OAUTH_STATE_PURPOSE)
  .bind(hashed)
  .fetch_optional(&mut *conn)
  .await
  .map_err(db_err("claim OAuth state"))?;
  drop(conn);
  claimed.map(|_| ()).ok_or_else(|| val_err("oauth_state_expired"))
}
async fn find_connected_account(
  tx: &mut Transaction<'_, Postgres>,
  provider: &str,
  namespace: &str,
  subject: &str,
) -> Result<Option<(String, String, bool)>, DomainError> {
  if let Some(row) = sqlx::query(
    "SELECT id, user_id FROM user_connected_accounts WHERE provider_namespace = $1 AND provider_account_id = $2 FOR UPDATE",
  )
  .bind(namespace)
  .bind(subject)
  .fetch_optional(&mut **tx)
  .await
  .map_err(db_err("find OAuth account"))?
  {
    return Ok(Some((row.get("id"), row.get("user_id"), false)));
  }
  // compat(data): oauth-legacy-null-provider-namespace-backfill -- matches and backfills pre-0.27.5 user_connected_accounts rows with NULL provider_namespace
  let legacy = sqlx::query(
    "SELECT id, user_id FROM user_connected_accounts WHERE provider = $1 AND provider_account_id = $2 AND provider_namespace IS NULL ORDER BY id FOR UPDATE",
  )
  .bind(provider)
  .bind(subject)
  .fetch_all(&mut **tx)
  .await
  .map_err(db_err("find legacy OAuth account"))?;
  match legacy.as_slice() {
    [] => Ok(None),
    [row] => Ok(Some((row.get("id"), row.get("user_id"), true))),
    _ => Err(DomainError::Validation("oauth_account_already_connected".to_owned())),
  }
}
fn build_authorization_url(
  provider: &str,
  config: &OAuthProviderConfig,
  oidc: Option<&OidcDiscovery>,
  callback_url: &str,
  state_param: &str,
  state_token: &str,
  client_nonce: &str,
) -> Result<String, DomainError> {
  let mut fields = BTreeMap::from([
    ("client_id".into(), config.client_id.clone()),
    ("redirect_uri".into(), callback_url.to_owned()),
    ("response_type".into(), "code".into()),
  ]);
  let base = match provider {
    "google" => {
      fields.extend([
        ("scope".into(), "openid email profile".into()),
        ("prompt".into(), "select_account".into()),
        ("access_type".into(), "offline".into()),
      ]);
      "https://accounts.google.com/o/oauth2/v2/auth"
    }
    "github" => {
      fields.insert("scope".into(), "read:user user:email".into());
      "https://github.com/login/oauth/authorize"
    }
    "apple" => {
      fields.extend([
        ("scope".into(), "name email".into()),
        ("response_mode".into(), "form_post".into()),
        ("nonce".into(), client_nonce.to_owned()),
      ]);
      "https://appleid.apple.com/auth/authorize"
    }
    "oidc" => {
      let d = oidc.ok_or_else(|| val_err("invalid_oauth_provider_config"))?;
      let issuer_url = Url::parse(&d.issuer).map_err(|_| val_err("invalid_oauth_provider_config"))?;
      if !validate_oidc_endpoint_url(&d.authorization_endpoint, &issuer_url, config.allow_private_network) {
        return Err(val_err("invalid_oauth_provider_config"));
      }
      fields.extend([
        ("scope".into(), "openid profile email".into()),
        ("nonce".into(), state_token.to_owned()),
      ]);
      &d.authorization_endpoint
    }
    _ => return Err(val_err(format!("unknown_oauth_provider:{provider}"))),
  };
  for (key, value) in &config.args {
    if provider != "oidc" || !key.starts_with("claim_") {
      fields.insert(key.clone(), value.clone());
    }
  }
  if provider == "oidc" {
    let env: StateEnvelope = serde_json::from_str(state_param).map_err(|_| val_err("invalid_oauth_callback_state"))?;
    if let Some(pkce) = env.pkce {
      fields.extend([
        ("code_challenge".into(), pkce.code_challenge),
        ("code_challenge_method".into(), pkce.code_challenge_method),
      ]);
    }
  }
  fields.insert("state".into(), state_param.to_owned());
  let mut url = Url::parse(base).map_err(|_| DomainError::Validation("invalid_oauth_provider_config".to_owned()))?;
  url.query_pairs_mut().extend_pairs(fields);
  Ok(url.into())
}
fn parse_state_parameter(raw: &str) -> Result<(String, Option<StateEnvelope>), DomainError> {
  // compat(coexist): oauth-bare-state-token-fallback -- accepts v0.27.5 bare OAuth state tokens alongside prefixed tokens
  if raw.len() == 36 && Uuid::parse_str(raw).is_ok() {
    return Ok((raw.to_owned(), None));
  }
  let envelope: StateEnvelope = serde_json::from_str(raw).map_err(|_| val_err("invalid_oauth_callback_state"))?;
  if envelope
    .flow
    .as_deref()
    .is_some_and(|f| !matches!(f, "popup" | "redirect"))
  {
    return Err(val_err("invalid_oauth_callback_state"));
  }
  Uuid::parse_str(&envelope.state).map_err(|_| val_err("invalid_oauth_callback_state"))?;
  Ok((envelope.state.clone(), Some(envelope)))
}
pub fn normalize_provider_name(input: &str) -> Result<(&'static str, &'static str), DomainError> {
  match input {
    "Google" | "google" => Ok(("google", "Google")),
    "GitHub" | "github" => Ok(("github", "GitHub")),
    "Apple" | "apple" => Ok(("apple", "Apple")),
    "OIDC" | "oidc" => Ok(("oidc", "OIDC")),
    _ => Err(val_err(format!("unknown_oauth_provider:{input}"))),
  }
}
fn validate_preflight_fields(
  client: &str,
  nonce: &str,
  redirect: Option<&str>,
  callback: &str,
) -> Result<(), DomainError> {
  let ok = matches!(
    client,
    "web" | "affine" | "affine-canary" | "affine-beta" | "affine-dev"
  ) && !nonce.is_empty()
    && nonce.len() <= 512
    && redirect.is_none_or(|v| v.len() <= 2048)
    && Url::parse(callback).is_ok();
  ok.then_some(()).ok_or_else(|| val_err("invalid_oauth_preflight"))
}
fn validate_redirect_uri(
  raw: &str,
  base_url: &str,
  allowed_origins: &[String],
  trusted_domains: &[String],
) -> Option<String> {
  let t = raw.trim();
  if t.is_empty() || t.chars().any(char::is_control) || t.starts_with("//") || t.starts_with("/\\") {
    return None;
  }
  let parsed = Url::parse(base_url).ok()?.join(t).ok()?;
  if !matches!(parsed.scheme(), "http" | "https") || !parsed.username().is_empty() || parsed.password().is_some() {
    return None;
  }
  let origin_ok = allowed_origins
    .iter()
    .any(|o| Url::parse(o).ok().is_some_and(|u| u.origin() == parsed.origin()));
  let domain_ok = parsed.host_str().is_some_and(|h| {
    let h = h.trim_end_matches('.');
    trusted_domains.iter().any(|d| {
      h.eq_ignore_ascii_case(d)
        || h
          .to_ascii_lowercase()
          .ends_with(&format!(".{}", d.to_ascii_lowercase()))
    })
  });
  (origin_ok || domain_ok).then(|| parsed.into())
}
fn random_pkce_verifier() -> String {
  let mut bytes = [0_u8; 96];
  rand::rng().fill_bytes(&mut bytes);
  URL_SAFE_NO_PAD.encode(bytes)
}
