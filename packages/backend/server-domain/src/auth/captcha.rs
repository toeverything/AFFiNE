//! Captcha challenge issuance and verification (PostgreSQL Hashcash and Cloudflare Turnstile).
use super::token_hash;
use crate::safe_fetch::{SafeFetchPolicy, SafeFetchRequest, safe_fetch};
use chrono::{DateTime, Duration, NaiveDateTime, Utc};
use rand::Rng as _;
use reqwest::Method;
use reqwest::header::{CONTENT_TYPE, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use server_db::{ServerDb, WorkloadTier};
use server_types::DomainError;
use std::time::Duration as StdDuration;
use url::Url;
use uuid::Uuid;
pub const CAPTCHA_CHALLENGE_TTL_SECONDS: i64 = 300;
pub const CAPTCHA_PURPOSE: &str = "auth_challenge:captcha";
const TURNSTILE_SITEVERIFY_URL: &str = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnstileRuntimeConfig {
  #[serde(default)]
  pub secret: String,
  #[serde(default)]
  pub site_key: String,
  #[serde(default = "default_turnstile_action")]
  pub action: String,
}
fn default_turnstile_action() -> String {
  "auth-sign-in".to_owned()
}
impl Default for TurnstileRuntimeConfig {
  fn default() -> Self {
    Self {
      secret: String::new(),
      site_key: String::new(),
      action: default_turnstile_action(),
    }
  }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashcashRuntimeConfig {
  #[serde(default = "default_hashcash_bits")]
  pub bits: u32,
}
fn default_hashcash_bits() -> u32 {
  20
}
impl Default for HashcashRuntimeConfig {
  fn default() -> Self {
    Self { bits: 20 }
  }
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptchaPluginConfig {
  #[serde(default)]
  pub turnstile: TurnstileRuntimeConfig,
  #[serde(default)]
  pub challenge: HashcashRuntimeConfig,
}
#[derive(Clone, Debug, Default)]
pub struct EffectiveCaptchaConfig {
  pub enabled: bool,
  pub config: CaptchaPluginConfig,
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashcashChallenge {
  pub challenge: String,
  pub resource: String,
}
#[derive(Clone, Debug)]
pub struct CaptchaVerificationRequest {
  pub provider: String,
  pub token: String,
  pub challenge: Option<String>,
  pub ip: Option<String>,
  pub allowed_hosts: Vec<String>,
  pub dev_mode: bool,
}
fn db_err<E: std::fmt::Display>(ctx: &str) -> impl FnOnce(E) -> DomainError + '_ {
  move |e| DomainError::Internal(format!("{ctx}: {e}"))
}
pub async fn load_effective_captcha_config(db: &ServerDb) -> Result<EffectiveCaptchaConfig, DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveRead)
    .await
    .map_err(db_err("captcha config conn"))?;
  let rows = sqlx::query("SELECT id, value FROM app_configs WHERE id = ANY($1)")
    .bind(&["captcha.enabled", "captcha.config"][..])
    .fetch_all(&mut *conn)
    .await
    .map_err(db_err("load captcha config"))?;
  drop(conn);
  let (mut enabled, mut config) = (false, CaptchaPluginConfig::default());
  for row in rows {
    use sqlx::Row as _;
    let id: String = row.get("id");
    let value: serde_json::Value = row.get("value");
    match id.as_str() {
      "captcha.enabled" => enabled = value.as_bool().unwrap_or(false),
      "captcha.config" => {
        if let Ok(parsed) = serde_json::from_value::<CaptchaPluginConfig>(value) {
          config = parsed;
        }
      }
      _ => {}
    }
  }
  Ok(EffectiveCaptchaConfig { enabled, config })
}
pub async fn create_hashcash_challenge(db: &ServerDb) -> Result<HashcashChallenge, DomainError> {
  let (challenge, resource) = (Uuid::new_v4().to_string(), Uuid::new_v4().to_string());
  let mut tx = db
    .begin_tiered(WorkloadTier::InteractiveWrite)
    .await
    .map_err(db_err("begin captcha"))?;
  let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(db_err("captcha clock"))?;
  sqlx::query(
    "INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, expires_at) VALUES ($1, $2, $3, $4, $5)",
  )
  .bind(CAPTCHA_PURPOSE)
  .bind(token_hash(&challenge))
  .bind(&challenge)
  .bind(serde_json::json!({ "resource": resource }))
  .bind(now + Duration::seconds(CAPTCHA_CHALLENGE_TTL_SECONDS))
  .execute(&mut **tx.tx_mut())
  .await
  .map_err(db_err("store captcha"))?;
  tx.commit().await.map_err(db_err("commit captcha"))?;
  Ok(HashcashChallenge { challenge, resource })
}
pub async fn verify_captcha(
  db: &ServerDb,
  cfg: &CaptchaPluginConfig,
  req: &CaptchaVerificationRequest,
) -> Result<bool, DomainError> {
  verify_captcha_with_turnstile_endpoint(db, cfg, req, None).await
}
pub async fn verify_captcha_with_turnstile_endpoint(
  db: &ServerDb,
  cfg: &CaptchaPluginConfig,
  req: &CaptchaVerificationRequest,
  turnstile_endpoint_override: Option<&str>,
) -> Result<bool, DomainError> {
  match req.provider.as_str() {
    "hashcash" => match req.challenge.as_deref().filter(|s| !s.is_empty()) {
      Some(challenge) => verify_hashcash(db, challenge, &req.token, cfg.challenge.bits).await,
      None => Ok(false),
    },
    "turnstile" if req.challenge.is_none() => verify_turnstile(cfg, req, turnstile_endpoint_override).await,
    _ => Ok(false),
  }
}
async fn verify_hashcash(db: &ServerDb, challenge: &str, token: &str, required_bits: u32) -> Result<bool, DomainError> {
  let mut tx = db
    .begin_tiered(WorkloadTier::InteractiveWrite)
    .await
    .map_err(db_err("begin captcha verify"))?;
  let hashed = token_hash(challenge);
  let payload: Option<serde_json::Value> = sqlx::query_scalar(
    "SELECT payload FROM runtime_states WHERE purpose = $1 AND token_hash = $2 AND consumed_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE",
  ).bind(CAPTCHA_PURPOSE).bind(&hashed).fetch_optional(&mut **tx.tx_mut()).await.map_err(db_err("load captcha"))?;
  let Some(resource) = payload
    .as_ref()
    .and_then(|v| v.get("resource"))
    .and_then(serde_json::Value::as_str)
  else {
    tx.rollback().await.map_err(db_err("rollback missing captcha"))?;
    return Ok(false);
  };
  if !HashcashStamp::parse(token).is_ok_and(|stamp| stamp.check(required_bits, resource, Utc::now())) {
    tx.rollback().await.map_err(db_err("rollback invalid captcha"))?;
    return Ok(false);
  }
  let consumed = sqlx::query("UPDATE runtime_states SET consumed_at = clock_timestamp(), updated_at = clock_timestamp() WHERE purpose = $1 AND token_hash = $2 AND consumed_at IS NULL")
    .bind(CAPTCHA_PURPOSE).bind(&hashed).execute(&mut **tx.tx_mut()).await.map_err(db_err("consume captcha"))?.rows_affected();
  if consumed != 1 {
    return Err(DomainError::Conflict("captcha challenge generation changed".to_owned()));
  }
  tx.commit().await.map_err(db_err("commit captcha verify"))?;
  Ok(true)
}
async fn verify_turnstile(
  cfg: &CaptchaPluginConfig,
  req: &CaptchaVerificationRequest,
  endpoint_override: Option<&str>,
) -> Result<bool, DomainError> {
  let unavailable = || DomainError::Unavailable("captcha_provider_unavailable".to_owned());
  if cfg.turnstile.secret.is_empty() || cfg.turnstile.action.is_empty() {
    return Err(unavailable());
  }
  let endpoint = endpoint_override
    .filter(|u| !u.is_empty())
    .unwrap_or(TURNSTILE_SITEVERIFY_URL);
  let mut headers = HeaderMap::new();
  headers.insert(
    CONTENT_TYPE,
    HeaderValue::from_static("application/x-www-form-urlencoded"),
  );
  let mut policy = SafeFetchPolicy {
    max_redirects: 0,
    timeout: StdDuration::from_secs(5),
    connect_timeout: StdDuration::from_secs(5),
    max_response_bytes: 64 * 1024,
    ..SafeFetchPolicy::default()
  };
  if let Some(custom) = endpoint_override.filter(|u| !u.is_empty())
    && let Ok(parsed) = Url::parse(custom)
  {
    policy.allow_http = parsed.scheme() == "http";
    policy.allow_private_origins.push(parsed.origin());
  }
  let body = {
    let mut ser = url::form_urlencoded::Serializer::new(String::new());
    ser
      .append_pair("secret", &cfg.turnstile.secret)
      .append_pair("response", &req.token);
    if let Some(ip) = req.ip.as_deref().filter(|s| !s.is_empty()) {
      ser.append_pair("remoteip", ip);
    }
    ser
      .append_pair("idempotency_key", &Uuid::new_v4().to_string())
      .finish()
      .into_bytes()
  };
  let response = safe_fetch(SafeFetchRequest {
    method: Method::POST,
    url: endpoint.to_owned(),
    headers,
    body: Some(body),
    policy,
  })
  .await
  .map_err(|_| unavailable())?;
  if !response.status.is_success() {
    return Err(unavailable());
  }
  let v: serde_json::Value = serde_json::from_slice(&response.body).map_err(|_| unavailable())?;
  let host_ok = v["hostname"]
    .as_str()
    .is_some_and(|h| req.allowed_hosts.iter().any(|a| a == h));
  Ok(
    v["success"].as_bool() == Some(true)
      && v["action"].as_str() == Some(cfg.turnstile.action.as_str())
      && (host_ok || req.dev_mode),
  )
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HashcashStamp {
  pub version: String,
  pub claim: u32,
  pub ts: String,
  pub resource: String,
  pub ext: String,
  pub rand: String,
  pub counter: String,
}
impl HashcashStamp {
  pub fn parse(value: &str) -> Result<Self, &'static str> {
    let p: Vec<&str> = value.split(':').collect();
    if p.len() != 7 || p.iter().enumerate().any(|(i, s)| i != 4 && s.is_empty()) {
      return Err("malformed hashcash stamp");
    }
    Ok(Self {
      version: p[0].to_owned(),
      claim: p[1].parse::<u32>().map_err(|_| "invalid hashcash bits")?,
      ts: p[2].to_owned(),
      resource: p[3].to_owned(),
      ext: p[4].to_owned(),
      rand: p[5].to_owned(),
      counter: p[6].to_owned(),
    })
  }
  pub fn format(&self) -> String {
    format!(
      "{}:{}:{}:{}:{}:{}:{}",
      self.version, self.claim, self.ts, self.resource, self.ext, self.rand, self.counter
    )
  }
  pub fn check(&self, required_bits: u32, resource: &str, now: DateTime<Utc>) -> bool {
    if self.version != "1" || required_bits > self.claim || self.resource != resource {
      return false;
    }
    let valid_ts = NaiveDateTime::parse_from_str(&self.ts, "%Y%m%d%H%M%S")
      .ok()
      .and_then(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc).checked_add_signed(Duration::minutes(5)))
      .is_some_and(|deadline| now <= deadline);
    if !valid_ts {
      return false;
    }
    let hex_digits = (self.claim / 4) as usize;
    let digest = hex::encode(sha3_256(self.format().as_bytes()));
    digest.len() >= hex_digits && digest.as_bytes()[..hex_digits].iter().all(|&b| b == b'0')
  }
  pub fn mint(resource: &str, bits: u32) -> Self {
    let ts = Utc::now().format("%Y%m%d%H%M%S").to_string();
    let charset = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let mut rng = rand::rng();
    let rand_str: String = (0..16)
      .map(|_| charset[rng.random_range(0..charset.len())] as char)
      .collect();
    let prefix = format!("1:{bits}:{ts}:{resource}::{rand_str}");
    let hex_digits = bits.div_ceil(4) as usize;
    for counter in 0_u64.. {
      let digest = hex::encode(sha3_256(format!("{prefix}:{counter:x}").as_bytes()));
      if digest.as_bytes()[..hex_digits].iter().all(|&b| b == b'0') {
        return Self {
          version: "1".to_owned(),
          claim: bits,
          ts,
          resource: resource.to_owned(),
          ext: String::new(),
          rand: rand_str,
          counter: format!("{counter:x}"),
        };
      }
    }
    unreachable!()
  }
}
pub fn sha3_256(input: &[u8]) -> [u8; 32] {
  const RATE: usize = 136;
  let (mut state, mut offset) = ([0_u64; 25], 0);
  while offset + RATE <= input.len() {
    for (i, chunk) in input[offset..offset + RATE].as_chunks::<8>().0.iter().enumerate() {
      state[i] ^= u64::from_le_bytes(*chunk);
    }
    keccak_f1600(&mut state);
    offset += RATE;
  }
  let (mut block, rem) = ([0_u8; RATE], input.len() - offset);
  block[..rem].copy_from_slice(&input[offset..]);
  block[rem] ^= 0x06;
  block[RATE - 1] ^= 0x80;
  for (i, chunk) in block.as_chunks::<8>().0.iter().enumerate() {
    state[i] ^= u64::from_le_bytes(*chunk);
  }
  keccak_f1600(&mut state);
  let mut out = [0_u8; 32];
  for (i, chunk) in out.as_chunks_mut::<8>().0.iter_mut().enumerate() {
    chunk.copy_from_slice(&state[i].to_le_bytes());
  }
  out
}
fn keccak_f1600(a: &mut [u64; 25]) {
  #[rustfmt::skip]
  const RC: [u64; 24] = [
    0x0000_0000_0000_0001, 0x0000_0000_0000_8082, 0x8000_0000_0000_808a, 0x8000_0000_8000_8000,
    0x0000_0000_0000_808b, 0x0000_0000_8000_0001, 0x8000_0000_8000_8081, 0x8000_0000_0000_8009,
    0x0000_0000_0000_008a, 0x0000_0000_0000_0088, 0x0000_0000_8000_8009, 0x0000_0000_8000_000a,
    0x0000_0000_8000_808b, 0x8000_0000_0000_008b, 0x8000_0000_0000_8089, 0x8000_0000_0000_8003,
    0x8000_0000_0000_8002, 0x8000_0000_0000_0080, 0x0000_0000_0000_800a, 0x8000_0000_8000_000a,
    0x8000_0000_8000_8081, 0x8000_0000_0000_8080, 0x0000_0000_8000_0001, 0x8000_0000_8000_8008,
  ];
  const RHO: [u32; 24] = [
    1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
  ];
  const PI: [usize; 24] = [
    10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
  ];
  for &rc in &RC {
    let c: [u64; 5] = std::array::from_fn(|x| a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20]);
    for x in 0..5 {
      let d = c[(x + 4) % 5] ^ c[(x + 1) % 5].rotate_left(1);
      for y in (0..25).step_by(5) {
        a[x + y] ^= d;
      }
    }
    let mut cur = a[1];
    for i in 0..24 {
      let saved = a[PI[i]];
      a[PI[i]] = cur.rotate_left(RHO[i]);
      cur = saved;
    }
    for y in (0..25).step_by(5) {
      let t = [a[y], a[y + 1], a[y + 2], a[y + 3], a[y + 4]];
      for x in 0..5 {
        a[y + x] = t[x] ^ ((!t[(x + 1) % 5]) & t[(x + 2) % 5]);
      }
    }
    a[0] ^= rc;
  }
}
