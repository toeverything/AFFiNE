//! Canonical `LicenseEnvelopeV2` verification, keyring privilege separation,
//! and bundled default self-hosted grant.

use std::{borrow::Cow, collections::BTreeMap, sync::OnceLock};

use aes_gcm::{
  AesGcm, KeyInit as _,
  aead::{Aead as _, generic_array::typenum::U12},
  aes::Aes256,
};
use base64::Engine as _;
use chrono::{DateTime, Utc};
use p256::{
  ecdsa::{DerSignature, VerifyingKey, signature::Verifier as _},
  pkcs8::DecodePublicKey as _,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};

use crate::{AccessGrant, BillingSubject, LicenseTier, Limits, Rights};

const LICENSE_AES_KEY: Option<&str> = match option_env!("AFFINE_PRO_LICENSE_AES_KEY") {
  Some(key) => Some(key),
  None if cfg!(any(test, debug_assertions)) => Some("TEST_LICENSE_AES_KEY"),
  None => None,
};

pub const COMMUNITY_DEFAULT_KID: &str = "community-default-v1";
pub const PRO_KID: &str = "pro-v1";
pub const LICENSE_AUDIENCE_SELFHOST: &str = "affine-selfhost";
pub const MAX_SEAT_LIMIT: i32 = 100_000;
/// Maximum ECMAScript safe integer (`2^53 - 1 = 9_007_199_254_740_991`).
pub const MAX_SAFE_INT: i64 = (1_i64 << 53) - 1;

/// Public key for the bundled non-commercial default self-hosted license.
pub const COMMUNITY_DEFAULT_PUBLIC_KEY: &str = "\
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEq3h5nA0kv+Jw1YQmQP+/G0r51oAV
y7eHpKl0eg1/KbtBUZMmOtyo3/dKGl7mPAl/3BdLTcepmArQdirXALJ5Iw==
-----END PUBLIC KEY-----";

/// Pre-signed bundled default self-hosted license (10 seats / 100 GiB / 100 MiB blob / 30d history / 10 copilot actions).
pub const DEFAULT_SELFHOST_LICENSE_BYTES: &[u8] = include_bytes!("../assets/default-selfhost-10s-100g.license.json");

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LicenseScopeV2 {
  pub kind: String,
  pub workspace_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LicenseLimitsV2 {
  pub blob_limit_bytes: i64,
  pub storage_quota_bytes: i64,
  pub seat_limit: i32,
  pub seat_quota_bytes: Option<i64>,
  pub history_period_seconds: i64,
  pub copilot_action_limit: Option<i32>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LicenseRightsV2 {
  pub commercial: bool,
  pub copilot_byok: bool,
  pub unlimited_copilot: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LicenseClaimsV2 {
  pub format_version: u32,
  pub kid: String,
  pub license_id: String,
  pub audience: String,
  pub scope: LicenseScopeV2,
  pub tier: String,
  pub limits: LicenseLimitsV2,
  pub rights: LicenseRightsV2,
  pub recurring: Option<String>,
  pub issued_at: String,
  pub not_before: String,
  pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LicenseEnvelopeV2 {
  pub claims: LicenseClaimsV2,
  pub signature: String,
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum LicenseV2Error {
  #[error("invalid license JSON: {0}")]
  InvalidJson(String),
  #[error("unsupported license format version: {0}")]
  UnsupportedFormatVersion(u32),
  #[error("unknown license key id: {0}")]
  UnknownKeyId(String),
  #[error("invalid public key for {kid}: {reason}")]
  InvalidPublicKey { kid: String, reason: String },
  #[error("invalid license signature: {0}")]
  InvalidSignature(String),
  #[error("invalid license claims: {0}")]
  InvalidClaims(String),
  #[error("license workspace scope mismatch: expected {expected:?}, got {actual:?}")]
  ScopeMismatch {
    expected: Option<String>,
    actual: Option<String>,
  },
  #[error("license not yet valid: not_before={not_before}, now={now}")]
  NotYetValid {
    not_before: DateTime<Utc>,
    now: DateTime<Utc>,
  },
  #[error("license expired: expires_at={expires_at}, now={now}")]
  Expired {
    expires_at: DateTime<Utc>,
    now: DateTime<Utc>,
  },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedLicenseV2 {
  pub claims: LicenseClaimsV2,
  pub tier: LicenseTier,
  pub issued_at: DateTime<Utc>,
  pub not_before: DateTime<Utc>,
  pub expires_at: Option<DateTime<Utc>>,
}

impl VerifiedLicenseV2 {
  pub fn to_access_grant(&self) -> AccessGrant {
    let copilot_action_limit = if self.claims.rights.unlimited_copilot {
      None
    } else {
      self.claims.limits.copilot_action_limit
    };
    let billing_subject = if self.claims.rights.commercial {
      BillingSubject::Workspace
    } else {
      BillingSubject::Owner
    };
    AccessGrant {
      tier: self.tier,
      billing_subject,
      seat_quantity: Some(self.claims.limits.seat_limit),
      expires_at: self.expires_at,
      limits: Limits {
        blob_limit_bytes: self.claims.limits.blob_limit_bytes,
        storage_quota_bytes: self.claims.limits.storage_quota_bytes,
        seat_limit: self.claims.limits.seat_limit,
        seat_quota_bytes: self.claims.limits.seat_quota_bytes,
        history_period_seconds: self.claims.limits.history_period_seconds,
        copilot_action_limit,
      },
      rights: Rights {
        commercial: self.claims.rights.commercial,
        copilot_byok: self.claims.rights.copilot_byok,
        unlimited_copilot: self.claims.rights.unlimited_copilot,
      },
      diagnostics: Vec::new(),
    }
  }

  pub fn into_access_grant(self) -> AccessGrant {
    self.to_access_grant()
  }
}

#[derive(Clone, Debug)]
pub struct Keyring {
  keys: BTreeMap<String, String>,
}

impl Default for Keyring {
  fn default() -> Self {
    Self::new()
  }
}

impl Keyring {
  /// Builds the default keyring with `community-default-v1` and, when set at
  /// compile time, `pro-v1` from `option_env!("AFFINE_PRO_PUBLIC_KEY")`.
  pub fn new() -> Self {
    let mut keys = BTreeMap::new();
    keys.insert(
      COMMUNITY_DEFAULT_KID.to_owned(),
      COMMUNITY_DEFAULT_PUBLIC_KEY.to_owned(),
    );
    if let Some(pro_pem) = option_env!("AFFINE_PRO_PUBLIC_KEY") {
      let trimmed = pro_pem.trim();
      if !trimmed.is_empty() {
        keys.insert(PRO_KID.to_owned(), trimmed.to_owned());
      }
    }
    Self { keys }
  }

  /// Builds a keyring with `community-default-v1` plus an explicit `pro-v1` PEM public key.
  pub fn with_pro_public_key(pro_public_key_pem: impl Into<String>) -> Self {
    let mut ring = Self::new();
    ring.keys.insert(PRO_KID.to_owned(), pro_public_key_pem.into());
    ring
  }

  /// Inserts or replaces a `kid` entry in the keyring (tests only).
  #[cfg(test)]
  pub fn with_key(mut self, kid: impl Into<String>, public_key_pem: impl Into<String>) -> Self {
    self.keys.insert(kid.into(), public_key_pem.into());
    self
  }

  pub fn get(&self, kid: &str) -> Option<&str> {
    self.keys.get(kid).map(String::as_str)
  }
}

pub fn verify_license_v2(
  payload: &[u8],
  keyring: &Keyring,
  expected_workspace_id: Option<&str>,
  now: DateTime<Utc>,
) -> Result<VerifiedLicenseV2, LicenseV2Error> {
  let envelope: LicenseEnvelopeV2 =
    serde_json::from_slice(payload).map_err(|e| LicenseV2Error::InvalidJson(e.to_string()))?;
  let claims = &envelope.claims;

  if claims.format_version != 2 {
    return Err(LicenseV2Error::UnsupportedFormatVersion(claims.format_version));
  }
  if claims.license_id.trim().is_empty() {
    return Err(LicenseV2Error::InvalidClaims("licenseId must be non-empty".to_owned()));
  }
  if claims.audience != LICENSE_AUDIENCE_SELFHOST {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "invalid audience {:?}, expected {:?}",
      claims.audience, LICENSE_AUDIENCE_SELFHOST
    )));
  }

  if claims.kid != COMMUNITY_DEFAULT_KID && claims.kid != PRO_KID {
    return Err(LicenseV2Error::UnknownKeyId(claims.kid.clone()));
  }
  let public_key_pem = keyring
    .get(&claims.kid)
    .ok_or_else(|| LicenseV2Error::UnknownKeyId(claims.kid.clone()))?;

  // Hard privilege separation for community-default-v1.
  if claims.kid == COMMUNITY_DEFAULT_KID {
    let allowed = claims.scope.kind == "instance_default"
      && claims.scope.workspace_id.is_none()
      && claims.tier == "selfhost_default"
      && !claims.rights.commercial
      && !claims.rights.copilot_byok
      && !claims.rights.unlimited_copilot;
    if !allowed {
      return Err(LicenseV2Error::InvalidClaims(
        "community-default-v1 key may only sign non-commercial instance_default selfhost_default licenses".to_owned(),
      ));
    }
  }

  let tier = match claims.tier.as_str() {
    "selfhost_default" => LicenseTier::SelfhostDefault,
    "selfhost_team" => LicenseTier::SelfhostTeam,
    "selfhost_enterprise" => LicenseTier::SelfhostEnterprise,
    other => {
      return Err(LicenseV2Error::InvalidClaims(format!(
        "unsupported selfhost license tier: {other:?}"
      )));
    }
  };

  match claims.scope.kind.as_str() {
    "instance_default" => {
      if claims.scope.workspace_id.is_some() {
        return Err(LicenseV2Error::InvalidClaims(
          "instance_default scope must not specify workspaceId".to_owned(),
        ));
      }
    }
    "workspace" => {
      if claims.kid == PRO_KID && !matches!(claims.tier.as_str(), "selfhost_team" | "selfhost_enterprise") {
        return Err(LicenseV2Error::InvalidClaims(format!(
          "workspace scope under {PRO_KID} requires tier \"selfhost_team\" or \"selfhost_enterprise\", got {:?}",
          claims.tier
        )));
      }
      let ws = claims
        .scope
        .workspace_id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| LicenseV2Error::InvalidClaims("workspace scope requires a non-empty workspaceId".to_owned()))?;
      if expected_workspace_id != Some(ws) {
        return Err(LicenseV2Error::ScopeMismatch {
          expected: expected_workspace_id.map(str::to_owned),
          actual: Some(ws.to_owned()),
        });
      }
    }
    other => {
      return Err(LicenseV2Error::InvalidClaims(format!(
        "unsupported scope kind: {other:?}"
      )));
    }
  }

  validate_limits(&claims.limits)?;

  if let Some(recurring) = claims.recurring.as_deref()
    && !matches!(recurring, "monthly" | "yearly" | "lifetime")
  {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "invalid recurring interval: {recurring:?}"
    )));
  }

  let issued_at = parse_rfc3339("issuedAt", &claims.issued_at)?;
  let not_before = parse_rfc3339("notBefore", &claims.not_before)?;
  let expires_at = claims
    .expires_at
    .as_deref()
    .map(|raw| parse_rfc3339("expiresAt", raw))
    .transpose()?;

  if not_before > issued_at {
    return Err(LicenseV2Error::InvalidClaims(
      "notBefore must be <= issuedAt".to_owned(),
    ));
  }
  if let Some(exp) = expires_at {
    if issued_at >= exp {
      return Err(LicenseV2Error::InvalidClaims("issuedAt must be < expiresAt".to_owned()));
    }
    if now >= exp {
      return Err(LicenseV2Error::Expired { expires_at: exp, now });
    }
  }
  if now < not_before {
    return Err(LicenseV2Error::NotYetValid { not_before, now });
  }

  // Verify ECDSA P-256 SHA-256 ASN.1 DER signature over canonical struct serialization.
  let verifying_key =
    VerifyingKey::from_public_key_pem(public_key_pem).map_err(|e| LicenseV2Error::InvalidPublicKey {
      kid: claims.kid.clone(),
      reason: e.to_string(),
    })?;
  let canonical =
    serde_json::to_vec(claims).map_err(|e| LicenseV2Error::InvalidJson(format!("claims re-serialization: {e}")))?;
  let sig_bytes = base64::engine::general_purpose::STANDARD
    .decode(&envelope.signature)
    .map_err(|e| LicenseV2Error::InvalidSignature(format!("base64 decode failed: {e}")))?;
  let sig = DerSignature::from_bytes(&sig_bytes)
    .map_err(|e| LicenseV2Error::InvalidSignature(format!("invalid DER signature: {e}")))?;
  verifying_key
    .verify(&canonical, &sig)
    .map_err(|e| LicenseV2Error::InvalidSignature(e.to_string()))?;

  Ok(VerifiedLicenseV2 {
    claims: envelope.claims,
    tier,
    issued_at,
    not_before,
    expires_at,
  })
}

fn check_safe_int(field: &str, value: i64) -> Result<(), LicenseV2Error> {
  if !(-MAX_SAFE_INT..=MAX_SAFE_INT).contains(&value) {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "{field} {value} exceeds ECMAScript safe integer bounds (-{MAX_SAFE_INT}..={MAX_SAFE_INT})"
    )));
  }
  Ok(())
}

fn validate_limits(limits: &LicenseLimitsV2) -> Result<(), LicenseV2Error> {
  if !(1..=MAX_SEAT_LIMIT).contains(&limits.seat_limit) {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "seatLimit {} out of allowed range 1..={MAX_SEAT_LIMIT}",
      limits.seat_limit
    )));
  }
  check_safe_int("blobLimitBytes", limits.blob_limit_bytes)?;
  if limits.blob_limit_bytes <= 0 {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "blobLimitBytes must be > 0, got {}",
      limits.blob_limit_bytes
    )));
  }
  check_safe_int("storageQuotaBytes", limits.storage_quota_bytes)?;
  if limits.storage_quota_bytes <= 0 {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "storageQuotaBytes must be > 0, got {}",
      limits.storage_quota_bytes
    )));
  }
  if let Some(seat_quota_bytes) = limits.seat_quota_bytes {
    check_safe_int("seatQuotaBytes", seat_quota_bytes)?;
    if seat_quota_bytes < 0 {
      return Err(LicenseV2Error::InvalidClaims(format!(
        "seatQuotaBytes must be >= 0, got {seat_quota_bytes}"
      )));
    }
  }
  check_safe_int("historyPeriodSeconds", limits.history_period_seconds)?;
  if limits.history_period_seconds < 0 {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "historyPeriodSeconds must be >= 0, got {}",
      limits.history_period_seconds
    )));
  }
  if let Some(copilot_action_limit) = limits.copilot_action_limit
    && copilot_action_limit < 0
  {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "copilotActionLimit must be >= 0, got {copilot_action_limit}"
    )));
  }
  Ok(())
}

fn parse_rfc3339(field: &str, value: &str) -> Result<DateTime<Utc>, LicenseV2Error> {
  DateTime::parse_from_rfc3339(value)
    .map(|dt| dt.with_timezone(&Utc))
    .map_err(|e| LicenseV2Error::InvalidClaims(format!("invalid {field} RFC3339 timestamp {value:?}: {e}")))
}

/// Returns the default self-hosted `AccessGrant` by verifying the bundled signed
/// default license once at its fixed baseline epoch (`2026-01-01T00:00:00Z`).
/// If verification ever fails, fails closed to a 0-seat read-only grant with an
/// actionable diagnostic.
pub fn default_selfhost_access_grant() -> AccessGrant {
  static BUNDLED_DEFAULT: OnceLock<AccessGrant> = OnceLock::new();
  BUNDLED_DEFAULT
    .get_or_init(|| {
      let baseline_epoch = DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z")
        .expect("static RFC3339 baseline epoch")
        .with_timezone(&Utc);
      default_selfhost_access_grant_from(DEFAULT_SELFHOST_LICENSE_BYTES, &Keyring::new(), baseline_epoch)
    })
    .clone()
}

pub fn default_selfhost_access_grant_from(payload: &[u8], keyring: &Keyring, now: DateTime<Utc>) -> AccessGrant {
  match verify_license_v2(payload, keyring, None, now) {
    Ok(verified) => verified.into_access_grant(),
    Err(err) => AccessGrant {
      tier: LicenseTier::SelfhostDefault,
      billing_subject: BillingSubject::Owner,
      seat_quantity: Some(0),
      expires_at: None,
      limits: Limits {
        blob_limit_bytes: 0,
        storage_quota_bytes: 0,
        seat_limit: 0,
        seat_quota_bytes: None,
        history_period_seconds: 0,
        copilot_action_limit: Some(0),
      },
      rights: Rights {
        commercial: false,
        copilot_byok: false,
        unlimited_copilot: false,
      },
      diagnostics: vec![format!("bundled default selfhost license verification failed: {err}")],
    },
  }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyEncryptedEnvelope {
  payload: String,
  signature: String,
}

/// Normalizes either plain JSON (`v1`/`v2`/`legacy-v0`) or legacy AES-256-GCM
/// binary `.license` payloads into canonical JSON bytes.
pub fn normalize_license(payload: &[u8]) -> Result<Cow<'_, [u8]>, LicenseV2Error> {
  normalize_license_with_key(payload, LICENSE_AES_KEY)
}

/// Normalizes a license payload using an explicit optional AES key (for tests
/// and import compatibility with `packages/backend/native/src/license_import.rs`).
pub fn normalize_license_with_key<'a>(
  payload: &'a [u8],
  aes_key: Option<&str>,
) -> Result<Cow<'a, [u8]>, LicenseV2Error> {
  if payload.iter().find(|b| !b.is_ascii_whitespace()) == Some(&b'{') {
    return Ok(Cow::Borrowed(payload));
  }
  if payload.len() <= 26 || payload[..2] != [12, 12] {
    return Err(LicenseV2Error::InvalidJson("license_invalid_envelope".to_owned()));
  }
  let aes_key = aes_key.ok_or_else(|| LicenseV2Error::InvalidClaims("license_aes_key_missing".to_owned()))?;
  let key: [u8; 32] = if aes_key.len() == 64 {
    hex::decode(aes_key)
      .ok()
      .and_then(|bytes| bytes.try_into().ok())
      .unwrap_or_else(|| Sha256::digest(aes_key.as_bytes()).into())
  } else {
    Sha256::digest(aes_key.as_bytes()).into()
  };
  let iv = &payload[2..14];
  let mut ciphertext = payload[26..].to_vec();
  ciphertext.extend_from_slice(&payload[14..26]);
  let cipher = AesGcm::<Aes256, U12, U12>::new(&key.into());
  let plaintext = cipher
    .decrypt(iv.into(), ciphertext.as_ref())
    .map_err(|_| LicenseV2Error::InvalidSignature("license_decrypt_failed".to_owned()))?;
  let envelope: LegacyEncryptedEnvelope = serde_json::from_slice(&plaintext)
    .map_err(|_| LicenseV2Error::InvalidJson("license_invalid_envelope".to_owned()))?;
  serde_json::to_vec(&serde_json::json!({
    "signatureVersion": "legacy-v0",
    "iv": base64::engine::general_purpose::STANDARD.encode(iv),
    "payload": envelope.payload,
    "signature": envelope.signature,
  }))
  .map(Cow::Owned)
  .map_err(|_| LicenseV2Error::InvalidJson("license_invalid_envelope".to_owned()))
}

#[derive(Deserialize)]
struct AnyEnvelopeProbe {
  #[serde(rename = "signatureVersion")]
  signature_version: Option<serde::de::IgnoredAny>,
  claims: Option<AnyClaimsVersionProbe>,
}

#[derive(Deserialize)]
struct AnyClaimsVersionProbe {
  #[serde(rename = "formatVersion")]
  format_version: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LegacyV0Envelope {
  pub signature_version: String,
  pub iv: String,
  pub payload: String,
  pub signature: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
struct LegacyV0Payload {
  entity: String,
  issuer: String,
  #[serde(default)]
  subject: Option<String>,
  issued_at: String,
  expires_at: String,
  data: LegacyV0Data,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
struct LegacyV0Data {
  id: String,
  workspace_id: String,
  quantity: i32,
  plan: String,
  recurring: String,
  end_at: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedLegacyV0 {
  pub license_id: String,
  pub workspace_id: String,
  pub entity: String,
  pub issuer: String,
  pub seat_quantity: i32,
  pub recurring: String,
  pub issued_at: DateTime<Utc>,
  pub expires_at: DateTime<Utc>,
  pub end_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LicenseClaimsV1 {
  pub format_version: u32,
  pub license_id: String,
  pub workspace_id: String,
  pub audience: String,
  pub plan: String,
  pub seat_quantity: i32,
  pub issued_at: String,
  pub not_before: String,
  pub expires_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LicenseEnvelopeV1 {
  pub claims: LicenseClaimsV1,
  pub signature: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedLicenseV1 {
  pub claims: LicenseClaimsV1,
  pub issued_at: DateTime<Utc>,
  pub not_before: DateTime<Utc>,
  pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VerifiedAnyLicense {
  LegacyV0(VerifiedLegacyV0),
  V1(VerifiedLicenseV1),
  V2(VerifiedLicenseV2),
}

fn selfhost_team_grant(seat_quantity: i32, expires_at: Option<DateTime<Utc>>) -> AccessGrant {
  const FIVE_HUNDRED_MIB: i64 = 500 * 1024 * 1024;
  const TWENTY_GIB: i64 = 20 * 1024 * 1024 * 1024;
  const HUNDRED_GIB: i64 = 100 * 1024 * 1024 * 1024;
  const THIRTY_DAYS_SECS: i64 = 30 * 86_400;
  let storage_quota_bytes = i64::from(seat_quantity)
    .checked_mul(TWENTY_GIB)
    .and_then(|v| v.checked_add(HUNDRED_GIB))
    .unwrap_or(i64::MAX);
  AccessGrant {
    tier: LicenseTier::SelfhostTeam,
    billing_subject: BillingSubject::Workspace,
    seat_quantity: Some(seat_quantity),
    expires_at,
    limits: Limits {
      blob_limit_bytes: FIVE_HUNDRED_MIB,
      storage_quota_bytes,
      seat_limit: seat_quantity,
      seat_quota_bytes: Some(TWENTY_GIB),
      history_period_seconds: THIRTY_DAYS_SECS,
      copilot_action_limit: None,
    },
    rights: Rights {
      commercial: true,
      copilot_byok: true,
      unlimited_copilot: false,
    },
    diagnostics: Vec::new(),
  }
}

impl VerifiedAnyLicense {
  pub fn license_id(&self) -> &str {
    match self {
      Self::LegacyV0(v) => &v.license_id,
      Self::V1(v) => &v.claims.license_id,
      Self::V2(v) => &v.claims.license_id,
    }
  }

  pub fn workspace_id(&self) -> Option<&str> {
    match self {
      Self::LegacyV0(v) => Some(&v.workspace_id),
      Self::V1(v) => Some(&v.claims.workspace_id),
      Self::V2(v) => v.claims.scope.workspace_id.as_deref(),
    }
  }

  pub fn tier(&self) -> LicenseTier {
    match self {
      Self::LegacyV0(_) | Self::V1(_) => LicenseTier::SelfhostTeam,
      Self::V2(v) => v.tier,
    }
  }

  pub fn seat_quantity(&self) -> i32 {
    match self {
      Self::LegacyV0(v) => v.seat_quantity,
      Self::V1(v) => v.claims.seat_quantity,
      Self::V2(v) => v.claims.limits.seat_limit,
    }
  }

  pub fn issued_at(&self) -> DateTime<Utc> {
    match self {
      Self::LegacyV0(v) => v.issued_at,
      Self::V1(v) => v.issued_at,
      Self::V2(v) => v.issued_at,
    }
  }

  pub fn not_before(&self) -> DateTime<Utc> {
    match self {
      Self::LegacyV0(_) => DateTime::<Utc>::MIN_UTC,
      Self::V1(v) => v.not_before,
      Self::V2(v) => v.not_before,
    }
  }

  pub fn expires_at(&self) -> Option<DateTime<Utc>> {
    match self {
      Self::LegacyV0(v) => Some(v.expires_at.min(v.end_at)),
      Self::V1(v) => Some(v.expires_at),
      Self::V2(v) => v.expires_at,
    }
  }

  pub fn end_at(&self) -> DateTime<Utc> {
    match self {
      Self::LegacyV0(v) => v.end_at,
      Self::V1(v) => v.expires_at,
      Self::V2(v) => v.expires_at.unwrap_or(v.issued_at),
    }
  }

  pub fn recurring(&self) -> Option<&str> {
    match self {
      Self::LegacyV0(v) => Some(v.recurring.as_str()),
      Self::V1(_) => None,
      Self::V2(v) => v.claims.recurring.as_deref(),
    }
  }

  pub fn entity(&self) -> &str {
    match self {
      Self::LegacyV0(v) => &v.entity,
      Self::V1(_) => "workspace",
      Self::V2(v) => &v.claims.scope.kind,
    }
  }

  pub fn issuer(&self) -> &str {
    match self {
      Self::LegacyV0(v) => &v.issuer,
      Self::V1(_) => PRO_KID,
      Self::V2(v) => &v.claims.kid,
    }
  }

  pub fn is_commercial(&self) -> bool {
    match self {
      Self::LegacyV0(_) | Self::V1(_) => true,
      Self::V2(v) => v.claims.kid != COMMUNITY_DEFAULT_KID && v.claims.rights.commercial,
    }
  }

  pub fn is_workspace_scoped(&self) -> bool {
    match self {
      Self::LegacyV0(_) | Self::V1(_) => true,
      Self::V2(v) => v.claims.scope.kind == "workspace",
    }
  }

  pub fn is_workspace_commercial(&self) -> bool {
    self.is_commercial() && self.is_workspace_scoped()
  }

  /// Compatibility DB `entitlements.plan` label readable by `v0.27.5` (`Plan::parse`).
  pub fn entitlement_plan_name(&self) -> &'static str {
    match self.tier() {
      LicenseTier::SelfhostDefault => "selfhost_free",
      LicenseTier::SelfhostTeam | LicenseTier::SelfhostEnterprise => "selfhost_team",
      _ => "selfhost_free",
    }
  }

  pub fn to_access_grant(&self) -> AccessGrant {
    match self {
      Self::LegacyV0(v) => selfhost_team_grant(v.seat_quantity, Some(v.expires_at.min(v.end_at))),
      Self::V1(v) => selfhost_team_grant(v.claims.seat_quantity, Some(v.expires_at)),
      Self::V2(v) => v.to_access_grant(),
    }
  }
}

/// Verifies any supported self-hosted license format (`legacy-v0`, `v1`, `v2`)
/// after JSON/AES normalization.
pub fn verify_any_license(
  payload: &[u8],
  keyring: &Keyring,
  expected_workspace_id: Option<&str>,
  now: DateTime<Utc>,
) -> Result<VerifiedAnyLicense, LicenseV2Error> {
  let probe: AnyEnvelopeProbe =
    serde_json::from_slice(payload).map_err(|e| LicenseV2Error::InvalidJson(e.to_string()))?;
  if probe.signature_version.is_some() {
    return verify_legacy_v0(payload, keyring, expected_workspace_id, now).map(VerifiedAnyLicense::LegacyV0);
  }
  if probe.claims.and_then(|c| c.format_version) == Some(2) {
    return verify_license_v2(payload, keyring, expected_workspace_id, now).map(VerifiedAnyLicense::V2);
  }
  verify_license_v1(payload, keyring, expected_workspace_id, now).map(VerifiedAnyLicense::V1)
}

fn verify_legacy_v0(
  payload: &[u8],
  keyring: &Keyring,
  expected_workspace_id: Option<&str>,
  now: DateTime<Utc>,
) -> Result<VerifiedLegacyV0, LicenseV2Error> {
  let envelope: LegacyV0Envelope =
    serde_json::from_slice(payload).map_err(|e| LicenseV2Error::InvalidJson(e.to_string()))?;
  if envelope.signature_version != "legacy-v0" {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "unsupported legacy signatureVersion {:?}",
      envelope.signature_version
    )));
  }
  let iv = base64::engine::general_purpose::STANDARD
    .decode(envelope.iv.trim())
    .map_err(|e| LicenseV2Error::InvalidSignature(format!("invalid legacy iv base64: {e}")))?;
  if iv.len() != 12 {
    return Err(LicenseV2Error::InvalidSignature(format!(
      "invalid legacy iv length {}, expected 12",
      iv.len()
    )));
  }
  let sig_bytes = hex::decode(envelope.signature.trim())
    .map_err(|e| LicenseV2Error::InvalidSignature(format!("invalid legacy hex signature: {e}")))?;
  let signature = DerSignature::from_bytes(&sig_bytes)
    .map_err(|e| LicenseV2Error::InvalidSignature(format!("invalid legacy DER signature: {e}")))?;

  let public_key_pem = keyring
    .get(PRO_KID)
    .ok_or_else(|| LicenseV2Error::UnknownKeyId(PRO_KID.to_owned()))?;
  let verifying_key =
    VerifyingKey::from_public_key_pem(public_key_pem).map_err(|e| LicenseV2Error::InvalidPublicKey {
      kid: PRO_KID.to_owned(),
      reason: e.to_string(),
    })?;
  let mut message = Vec::with_capacity(iv.len() + envelope.payload.len());
  message.extend_from_slice(&iv);
  message.extend_from_slice(envelope.payload.as_bytes());
  verifying_key
    .verify(&message, &signature)
    .map_err(|e| LicenseV2Error::InvalidSignature(e.to_string()))?;

  let parsed: LegacyV0Payload =
    serde_json::from_str(&envelope.payload).map_err(|e| LicenseV2Error::InvalidJson(e.to_string()))?;
  if parsed.entity.trim().is_empty()
    || parsed.issuer.trim().is_empty()
    || parsed.data.id.trim().is_empty()
    || parsed.data.workspace_id.trim().is_empty()
  {
    return Err(LicenseV2Error::InvalidClaims(
      "legacy license entity, issuer, id, and workspaceId must be non-empty".to_owned(),
    ));
  }
  if parsed.data.plan != "selfhostedteam" {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "unsupported legacy license plan {:?}",
      parsed.data.plan
    )));
  }
  if !(1..=MAX_SEAT_LIMIT).contains(&parsed.data.quantity) {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "legacy license quantity {} out of bounds 1..={MAX_SEAT_LIMIT}",
      parsed.data.quantity
    )));
  }
  let recurring_lower = parsed.data.recurring.to_ascii_lowercase();
  if !matches!(recurring_lower.as_str(), "monthly" | "yearly" | "lifetime") {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "invalid legacy license recurring {:?}",
      parsed.data.recurring
    )));
  }
  let issued_at = parse_rfc3339("issuedAt", &parsed.issued_at)?;
  let expires_at = parse_rfc3339("expiresAt", &parsed.expires_at)?;
  let end_at = parse_rfc3339("endAt", &parsed.data.end_at)?;
  let effective_exp = expires_at.min(end_at);
  if issued_at >= effective_exp {
    return Err(LicenseV2Error::InvalidClaims(
      "legacy license issuedAt must be before min(expiresAt, endAt)".to_owned(),
    ));
  }
  if expected_workspace_id != Some(parsed.data.workspace_id.as_str()) {
    return Err(LicenseV2Error::ScopeMismatch {
      expected: expected_workspace_id.map(str::to_owned),
      actual: Some(parsed.data.workspace_id),
    });
  }
  if now >= effective_exp {
    return Err(LicenseV2Error::Expired {
      expires_at: effective_exp,
      now,
    });
  }

  Ok(VerifiedLegacyV0 {
    license_id: parsed.data.id,
    workspace_id: parsed.data.workspace_id,
    entity: parsed.entity,
    issuer: parsed.issuer,
    seat_quantity: parsed.data.quantity,
    recurring: recurring_lower,
    issued_at,
    expires_at,
    end_at,
  })
}

fn verify_license_v1(
  payload: &[u8],
  keyring: &Keyring,
  expected_workspace_id: Option<&str>,
  now: DateTime<Utc>,
) -> Result<VerifiedLicenseV1, LicenseV2Error> {
  let envelope: LicenseEnvelopeV1 =
    serde_json::from_slice(payload).map_err(|e| LicenseV2Error::InvalidJson(e.to_string()))?;
  let claims = &envelope.claims;
  if claims.format_version != 1 {
    return Err(LicenseV2Error::UnsupportedFormatVersion(claims.format_version));
  }
  if claims.license_id.trim().is_empty() || claims.workspace_id.trim().is_empty() {
    return Err(LicenseV2Error::InvalidClaims(
      "v1 licenseId and workspaceId must be non-empty".to_owned(),
    ));
  }
  if claims.audience != LICENSE_AUDIENCE_SELFHOST {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "invalid v1 audience {:?}",
      claims.audience
    )));
  }
  if claims.plan != "selfhost_team" {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "unsupported v1 plan {:?}",
      claims.plan
    )));
  }
  if !(1..=MAX_SEAT_LIMIT).contains(&claims.seat_quantity) {
    return Err(LicenseV2Error::InvalidClaims(format!(
      "v1 seatQuantity {} out of bounds 1..={MAX_SEAT_LIMIT}",
      claims.seat_quantity
    )));
  }

  let public_key_pem = keyring
    .get(PRO_KID)
    .ok_or_else(|| LicenseV2Error::UnknownKeyId(PRO_KID.to_owned()))?;
  let verifying_key =
    VerifyingKey::from_public_key_pem(public_key_pem).map_err(|e| LicenseV2Error::InvalidPublicKey {
      kid: PRO_KID.to_owned(),
      reason: e.to_string(),
    })?;
  let sig_bytes = base64::engine::general_purpose::STANDARD
    .decode(envelope.signature.trim())
    .map_err(|e| LicenseV2Error::InvalidSignature(format!("invalid v1 base64 signature: {e}")))?;
  let signature = DerSignature::from_bytes(&sig_bytes)
    .map_err(|e| LicenseV2Error::InvalidSignature(format!("invalid v1 DER signature: {e}")))?;
  let canonical = serde_json::to_vec(claims).map_err(|e| LicenseV2Error::InvalidJson(e.to_string()))?;
  verifying_key
    .verify(&canonical, &signature)
    .map_err(|e| LicenseV2Error::InvalidSignature(e.to_string()))?;

  let issued_at = parse_rfc3339("issuedAt", &claims.issued_at)?;
  let not_before = parse_rfc3339("notBefore", &claims.not_before)?;
  let expires_at = parse_rfc3339("expiresAt", &claims.expires_at)?;
  if not_before > issued_at || issued_at >= expires_at {
    return Err(LicenseV2Error::InvalidClaims(
      "v1 timestamps must satisfy notBefore <= issuedAt < expiresAt".to_owned(),
    ));
  }
  if expected_workspace_id != Some(claims.workspace_id.as_str()) {
    return Err(LicenseV2Error::ScopeMismatch {
      expected: expected_workspace_id.map(str::to_owned),
      actual: Some(claims.workspace_id.clone()),
    });
  }
  if now < not_before {
    return Err(LicenseV2Error::NotYetValid { not_before, now });
  }
  if now >= expires_at {
    return Err(LicenseV2Error::Expired { expires_at, now });
  }

  Ok(VerifiedLicenseV1 {
    claims: envelope.claims,
    issued_at,
    not_before,
    expires_at,
  })
}

#[cfg(test)]
mod tests {
  use p256::{
    ecdsa::{SigningKey, signature::Signer as _},
    pkcs8::{EncodePublicKey as _, LineEnding},
  };

  use super::*;

  fn fixed_now() -> DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-06-01T00:00:00Z")
      .unwrap()
      .with_timezone(&Utc)
  }

  fn test_pro_keypair(seed: u8) -> (SigningKey, String) {
    let signing_key = SigningKey::from_slice(&[seed; 32]).unwrap();
    let pem = VerifyingKey::from(&signing_key)
      .to_public_key_pem(LineEnding::LF)
      .unwrap();
    (signing_key, pem)
  }

  fn sign_claims(claims: &LicenseClaimsV2, signing_key: &SigningKey) -> Vec<u8> {
    let canonical = serde_json::to_vec(claims).unwrap();
    let sig: DerSignature = signing_key.sign(&canonical);
    let envelope = LicenseEnvelopeV2 {
      claims: claims.clone(),
      signature: base64::engine::general_purpose::STANDARD.encode(sig.as_bytes()),
    };
    serde_json::to_vec(&envelope).unwrap()
  }

  fn sample_pro_workspace_claims(workspace_id: &str, tier: &str, seats: i32) -> LicenseClaimsV2 {
    LicenseClaimsV2 {
      format_version: 2,
      kid: PRO_KID.to_owned(),
      license_id: format!("lic-{workspace_id}-{tier}-{seats}"),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      scope: LicenseScopeV2 {
        kind: "workspace".to_owned(),
        workspace_id: Some(workspace_id.to_owned()),
      },
      tier: tier.to_owned(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: seats,
        seat_quota_bytes: Some(10_737_418_240),
        history_period_seconds: 31_536_000,
        copilot_action_limit: Some(500),
      },
      rights: LicenseRightsV2 {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: true,
      },
      recurring: Some("yearly".to_owned()),
      issued_at: "2026-01-01T00:00:00Z".to_owned(),
      not_before: "2026-01-01T00:00:00Z".to_owned(),
      expires_at: Some("2027-01-01T00:00:00Z".to_owned()),
    }
  }

  #[test]
  fn bundled_default_license_verifies_and_matches_contract() {
    let keyring = Keyring::new();
    let verified = verify_license_v2(DEFAULT_SELFHOST_LICENSE_BYTES, &keyring, None, fixed_now())
      .expect("bundled default license must verify against COMMUNITY_DEFAULT_PUBLIC_KEY");
    assert_eq!(verified.tier, LicenseTier::SelfhostDefault);
    let grant = verified.into_access_grant();
    assert_eq!(grant.tier, LicenseTier::SelfhostDefault);
    assert_eq!(grant.billing_subject, BillingSubject::Owner);
    assert_eq!(grant.seat_quantity, Some(10));
    assert_eq!(grant.limits.seat_limit, 10);
    assert_eq!(grant.limits.blob_limit_bytes, 104_857_600);
    assert_eq!(grant.limits.storage_quota_bytes, 107_374_182_400);
    assert_eq!(grant.limits.history_period_seconds, 2_592_000);
    assert_eq!(grant.limits.copilot_action_limit, Some(10));
    assert!(!grant.rights.commercial);
    assert!(!grant.rights.copilot_byok);
    assert!(!grant.rights.unlimited_copilot);
    assert!(grant.diagnostics.is_empty());

    let default_grant = default_selfhost_access_grant();
    assert_eq!(default_grant, grant);
  }

  #[test]
  fn default_grant_fails_closed_when_bundled_verification_fails() {
    let grant = default_selfhost_access_grant_from(b"{}", &Keyring::new(), fixed_now());
    assert_eq!(grant.tier, LicenseTier::SelfhostDefault);
    assert_eq!(grant.billing_subject, BillingSubject::Owner);
    assert_eq!(grant.seat_quantity, Some(0));
    assert_eq!(grant.limits.seat_limit, 0);
    assert_eq!(grant.limits.blob_limit_bytes, 0);
    assert_eq!(grant.limits.storage_quota_bytes, 0);
    assert_eq!(grant.limits.copilot_action_limit, Some(0));
    assert!(!grant.rights.commercial);
    assert_eq!(grant.diagnostics.len(), 1);
  }

  #[test]
  fn pro_v1_workspace_and_instance_licenses_verify_and_enforce_invariants() {
    let (signing_key, pro_pem) = test_pro_keypair(0x42);
    let keyring = Keyring::with_pro_public_key(&pro_pem);

    let ws_claims = sample_pro_workspace_claims("ws-1", "selfhost_team", 25);
    let ws_raw = sign_claims(&ws_claims, &signing_key);
    let verified = verify_license_v2(&ws_raw, &keyring, Some("ws-1"), fixed_now()).unwrap();
    let grant = verified.into_access_grant();
    assert_eq!(grant.tier, LicenseTier::SelfhostTeam);
    assert_eq!(grant.billing_subject, BillingSubject::Workspace);
    assert_eq!(grant.limits.seat_limit, 25);
    assert_eq!(grant.limits.copilot_action_limit, None); // unlimited_copilot => None

    // workspace scope with selfhost_default tier under pro-v1 must be rejected.
    let mut ws_default_tier = ws_claims.clone();
    ws_default_tier.tier = "selfhost_default".to_owned();
    let ws_default_raw = sign_claims(&ws_default_tier, &signing_key);
    assert!(matches!(
      verify_license_v2(&ws_default_raw, &keyring, Some("ws-1"), fixed_now()),
      Err(LicenseV2Error::InvalidClaims(_))
    ));

    // Scope mismatch rejected.
    assert!(matches!(
      verify_license_v2(&ws_raw, &keyring, Some("ws-other"), fixed_now()),
      Err(LicenseV2Error::ScopeMismatch { .. })
    ));
    assert!(matches!(
      verify_license_v2(&ws_raw, &keyring, None, fixed_now()),
      Err(LicenseV2Error::ScopeMismatch { .. })
    ));

    // Negative seat_quota_bytes rejected.
    let mut neg_quota = ws_claims.clone();
    neg_quota.limits.seat_quota_bytes = Some(-1);
    let neg_raw = sign_claims(&neg_quota, &signing_key);
    assert!(matches!(
      verify_license_v2(&neg_raw, &keyring, Some("ws-1"), fixed_now()),
      Err(LicenseV2Error::InvalidClaims(_))
    ));

    // Commercial instance_default allowed under pro-v1.
    let mut inst_claims = ws_claims.clone();
    inst_claims.scope = LicenseScopeV2 {
      kind: "instance_default".to_owned(),
      workspace_id: None,
    };
    inst_claims.tier = "selfhost_enterprise".to_owned();
    let inst_raw = sign_claims(&inst_claims, &signing_key);
    let verified_inst = verify_license_v2(&inst_raw, &keyring, None, fixed_now()).unwrap();
    assert_eq!(verified_inst.tier, LicenseTier::SelfhostEnterprise);
    assert_eq!(
      verified_inst.into_access_grant().billing_subject,
      BillingSubject::Workspace
    );
  }

  #[test]
  fn community_default_kid_cannot_authorize_commercial_or_workspace() {
    let (signing_key, pem) = test_pro_keypair(0x55);
    let keyring = Keyring::new().with_key(COMMUNITY_DEFAULT_KID, pem);

    let mut commercial = sample_pro_workspace_claims("ws-1", "selfhost_team", 50);
    commercial.kid = COMMUNITY_DEFAULT_KID.to_owned();
    let raw = sign_claims(&commercial, &signing_key);
    assert!(matches!(
      verify_license_v2(&raw, &keyring, Some("ws-1"), fixed_now()),
      Err(LicenseV2Error::InvalidClaims(_))
    ));

    let mut byok = LicenseClaimsV2 {
      format_version: 2,
      kid: COMMUNITY_DEFAULT_KID.to_owned(),
      license_id: "fake-byok".to_owned(),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      scope: LicenseScopeV2 {
        kind: "instance_default".to_owned(),
        workspace_id: None,
      },
      tier: "selfhost_default".to_owned(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 1024,
        storage_quota_bytes: 2048,
        seat_limit: 10,
        seat_quota_bytes: None,
        history_period_seconds: 0,
        copilot_action_limit: Some(10),
      },
      rights: LicenseRightsV2 {
        commercial: false,
        copilot_byok: true,
        unlimited_copilot: false,
      },
      recurring: None,
      issued_at: "2026-01-01T00:00:00Z".to_owned(),
      not_before: "2026-01-01T00:00:00Z".to_owned(),
      expires_at: None,
    };
    let byok_raw = sign_claims(&byok, &signing_key);
    assert!(matches!(
      verify_license_v2(&byok_raw, &keyring, None, fixed_now()),
      Err(LicenseV2Error::InvalidClaims(_))
    ));

    byok.rights.copilot_byok = false;
    byok.rights.unlimited_copilot = true;
    let unlimited_raw = sign_claims(&byok, &signing_key);
    assert!(matches!(
      verify_license_v2(&unlimited_raw, &keyring, None, fixed_now()),
      Err(LicenseV2Error::InvalidClaims(_))
    ));
  }

  #[test]
  fn rejects_duplicate_json_fields_and_unknown_fields() {
    let keyring = Keyring::new();
    let dup_top = br#"{"claims":{},"claims":{},"signature":"AA=="}"#;
    assert!(matches!(
      verify_license_v2(dup_top, &keyring, None, fixed_now()),
      Err(LicenseV2Error::InvalidJson(_))
    ));

    let raw_str = std::str::from_utf8(DEFAULT_SELFHOST_LICENSE_BYTES).unwrap();
    let dup_nested = raw_str.replacen(r#""seatLimit":10"#, r#""seatLimit":10,"seatLimit":999"#, 1);
    assert!(matches!(
      verify_license_v2(dup_nested.as_bytes(), &keyring, None, fixed_now()),
      Err(LicenseV2Error::InvalidJson(_))
    ));

    let unknown_field = raw_str.replacen(r#""seatLimit":10"#, r#""seatLimit":10,"extra":1"#, 1);
    assert!(matches!(
      verify_license_v2(unknown_field.as_bytes(), &keyring, None, fixed_now()),
      Err(LicenseV2Error::InvalidJson(_))
    ));
  }

  #[test]
  fn cloud_lifetime_pro_tier_and_safe_int_bounds() {
    assert_eq!(LicenseTier::CloudLifetimePro.as_str(), "cloud_lifetime_pro");
    let encoded = serde_json::to_string(&LicenseTier::CloudLifetimePro).unwrap();
    assert_eq!(encoded, r#""cloud_lifetime_pro""#);
    let decoded: LicenseTier = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded, LicenseTier::CloudLifetimePro);

    assert_eq!(MAX_SAFE_INT, 9_007_199_254_740_991);
    let (signing_key, pro_pem) = test_pro_keypair(0x77);
    let keyring = Keyring::with_pro_public_key(&pro_pem);

    let mut at_boundary = sample_pro_workspace_claims("ws-safe", "selfhost_enterprise", 10);
    at_boundary.limits.blob_limit_bytes = MAX_SAFE_INT;
    at_boundary.limits.storage_quota_bytes = MAX_SAFE_INT;
    at_boundary.limits.seat_quota_bytes = Some(MAX_SAFE_INT);
    at_boundary.limits.history_period_seconds = MAX_SAFE_INT;
    let boundary_raw = sign_claims(&at_boundary, &signing_key);
    assert!(verify_license_v2(&boundary_raw, &keyring, Some("ws-safe"), fixed_now()).is_ok());

    type LimitMutator = fn(&mut LicenseLimitsV2);
    let cases: [(&str, LimitMutator); 4] = [
      ("blob_limit_bytes", |l| l.blob_limit_bytes = MAX_SAFE_INT + 1),
      ("storage_quota_bytes", |l| l.storage_quota_bytes = MAX_SAFE_INT + 1),
      ("seat_quota_bytes", |l| l.seat_quota_bytes = Some(MAX_SAFE_INT + 1)),
      ("history_period_seconds", |l| {
        l.history_period_seconds = MAX_SAFE_INT + 1
      }),
    ];
    for (label, mutate) in cases {
      let mut over = sample_pro_workspace_claims("ws-safe", "selfhost_enterprise", 10);
      mutate(&mut over.limits);
      let raw = sign_claims(&over, &signing_key);
      assert!(
        matches!(
          verify_license_v2(&raw, &keyring, Some("ws-safe"), fixed_now()),
          Err(LicenseV2Error::InvalidClaims(_))
        ),
        "expected {label} > MAX_SAFE_INT to be rejected"
      );
    }
  }

  #[test]
  fn legacy_v0_aes_v1_and_v2_verification_and_rejection() {
    let (signing_key, pro_pem) = test_pro_keypair(0x88);
    let keyring = Keyring::with_pro_public_key(&pro_pem);
    let now = fixed_now();

    // 1. Legacy AES .license -> normalized legacy-v0 JSON -> VerifiedAnyLicense::LegacyV0
    let payload_str = serde_json::to_string_pretty(&serde_json::json!({
      "entity": "acme",
      "issuer": "Toeverything",
      "subject": "selfhostedteam",
      "issuedAt": "2026-01-01T00:00:00Z",
      "expiresAt": "2027-01-01T00:00:00Z",
      "data": {
        "id": "legacy-lic-1",
        "workspaceId": "ws-legacy",
        "quantity": 12,
        "plan": "selfhostedteam",
        "recurring": "monthly",
        "endAt": "2027-01-02T00:00:00Z"
      }
    }))
    .unwrap();
    let iv = [5u8; 12];
    let mut msg = iv.to_vec();
    msg.extend_from_slice(payload_str.as_bytes());
    let sig: p256::ecdsa::Signature = signing_key.sign(&msg);
    let plaintext = serde_json::to_vec(&serde_json::json!({
      "payload": payload_str,
      "signature": hex::encode(sig.to_der()),
    }))
    .unwrap();
    let aes_key: [u8; 32] = Sha256::digest(b"TEST_LICENSE_AES_KEY").into();
    let cipher = AesGcm::<Aes256, U12, U12>::new(&aes_key.into());
    let ct = cipher.encrypt((&iv).into(), plaintext.as_ref()).unwrap();
    let split = ct.len() - 12;
    let mut legacy_bin = vec![12, 12];
    legacy_bin.extend_from_slice(&iv);
    legacy_bin.extend_from_slice(&ct[split..]);
    legacy_bin.extend_from_slice(&ct[..split]);

    let normalized = normalize_license_with_key(&legacy_bin, Some("TEST_LICENSE_AES_KEY")).unwrap();
    let verified = verify_any_license(normalized.as_ref(), &keyring, Some("ws-legacy"), now).unwrap();
    assert_eq!(verified.license_id(), "legacy-lic-1");
    assert_eq!(verified.seat_quantity(), 12);
    assert_eq!(verified.entitlement_plan_name(), "selfhost_team");
    assert!(verified.is_workspace_commercial());
    assert_eq!(verified.not_before(), DateTime::<Utc>::MIN_UTC);
    let legacy_grant = verified.to_access_grant();
    assert_eq!(legacy_grant.limits.blob_limit_bytes, 524_288_000);
    assert_eq!(legacy_grant.limits.seat_quota_bytes, Some(21_474_836_480));
    assert_eq!(
      legacy_grant.limits.storage_quota_bytes,
      100 * 1024 * 1024 * 1024 + 12 * 21_474_836_480
    );
    assert_eq!(legacy_grant.limits.seat_limit, 12);
    assert_eq!(legacy_grant.limits.history_period_seconds, 2_592_000);
    assert_eq!(legacy_grant.limits.copilot_action_limit, None);
    assert!(legacy_grant.rights.commercial);
    assert!(legacy_grant.rights.copilot_byok);
    assert!(!legacy_grant.rights.unlimited_copilot);

    // Wrong workspace, None workspace (instance context), and expired rejected.
    assert!(matches!(
      verify_any_license(normalized.as_ref(), &keyring, Some("ws-other"), now),
      Err(LicenseV2Error::ScopeMismatch { .. })
    ));
    assert!(matches!(
      verify_any_license(normalized.as_ref(), &keyring, None, now),
      Err(LicenseV2Error::ScopeMismatch { .. })
    ));
    let after_exp = DateTime::parse_from_rfc3339("2027-02-01T00:00:00Z")
      .unwrap()
      .with_timezone(&Utc);
    assert!(matches!(
      verify_any_license(normalized.as_ref(), &keyring, Some("ws-legacy"), after_exp),
      Err(LicenseV2Error::Expired { .. })
    ));

    // 2. V1 license golden vector matching frozen `affine_core::LicenseIssuer::issue` byte-for-byte:
    //    `workspaceId` precedes `audience` and no `recurring` field exists.
    let golden_claims_json = r#"{"formatVersion":1,"licenseId":"v1-lic-1","workspaceId":"ws-v1","audience":"affine-selfhost","plan":"selfhost_team","seatQuantity":15,"issuedAt":"2026-01-01T00:00:00Z","notBefore":"2026-01-01T00:00:00Z","expiresAt":"2027-01-01T00:00:00Z"}"#;
    assert!(!golden_claims_json.contains("\"recurring\""));
    assert!(golden_claims_json.find("\"workspaceId\"") < golden_claims_json.find("\"audience\""));
    let v1_claims: LicenseClaimsV1 = serde_json::from_str(golden_claims_json).unwrap();
    let v1_canonical = serde_json::to_vec(&v1_claims).unwrap();
    assert_eq!(v1_canonical.as_slice(), golden_claims_json.as_bytes());
    let v1_sig: DerSignature = signing_key.sign(golden_claims_json.as_bytes());
    let v1_raw = serde_json::to_vec(&LicenseEnvelopeV1 {
      claims: v1_claims,
      signature: base64::engine::general_purpose::STANDARD.encode(v1_sig.as_bytes()),
    })
    .unwrap();
    let v1_verified = verify_any_license(&v1_raw, &keyring, Some("ws-v1"), now).unwrap();
    assert_eq!(v1_verified.license_id(), "v1-lic-1");
    assert_eq!(v1_verified.seat_quantity(), 15);
    assert_eq!(v1_verified.recurring(), None);
    assert_eq!(v1_verified.entitlement_plan_name(), "selfhost_team");
    let v1_grant = v1_verified.to_access_grant();
    assert_eq!(v1_grant.limits.blob_limit_bytes, 524_288_000);
    assert_eq!(v1_grant.limits.storage_quota_bytes, 429_496_729_600);
    assert_eq!(v1_grant.limits.seat_quota_bytes, Some(21_474_836_480));
    assert_eq!(v1_grant.limits.seat_limit, 15);
    assert_eq!(v1_grant.limits.history_period_seconds, 2_592_000);
    assert_eq!(v1_grant.limits.copilot_action_limit, None);
    assert!(v1_grant.rights.commercial);
    assert!(v1_grant.rights.copilot_byok);
    assert!(!v1_grant.rights.unlimited_copilot);
    assert!(matches!(
      verify_any_license(&v1_raw, &keyring, None, now),
      Err(LicenseV2Error::ScopeMismatch { .. })
    ));
    let v1_tampered = String::from_utf8(v1_raw).unwrap().replace("15", "99");
    assert!(matches!(
      verify_any_license(v1_tampered.as_bytes(), &keyring, Some("ws-v1"), now),
      Err(LicenseV2Error::InvalidSignature(_))
    ));
  }
}
