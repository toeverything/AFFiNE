use std::sync::OnceLock;

use affine_core::access_control::{
  AccessContext, AccessDiagnostic, AccessGrant, Deployment as CoreDeployment, EntitlementFact, LicenseError,
  LicenseVerifier, Limits, Plan, Rights, VerifiedLicenseClaims, resolve_entitlements,
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use chrono::{DateTime, TimeZone, Utc};
use p256::{
  ecdsa::{Signature, VerifyingKey, signature::Verifier},
  pkcs8::DecodePublicKey,
};
use serde::{Deserialize, Serialize};

pub const COMMUNITY_DEFAULT_PUBLIC_KEY: &str = "\
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEq3h5nA0kv+Jw1YQmQP+/G0r51oAV
y7eHpKl0eg1/KbtBUZMmOtyo3/dKGl7mPAl/3BdLTcepmArQdirXALJ5Iw==
-----END PUBLIC KEY-----";

pub const DEFAULT_SELFHOST_LICENSE_BYTES: &[u8] = include_bytes!("default-selfhost-10s-100g.license.json");

static DEFAULT_SELFHOST_GRANT: OnceLock<AccessGrant> = OnceLock::new();

#[derive(Deserialize)]
struct EnvelopeProbe {
  #[serde(rename = "signatureVersion")]
  signature_version: Option<serde::de::IgnoredAny>,
  claims: Option<ClaimsVersionProbe>,
}

#[derive(Deserialize)]
struct ClaimsVersionProbe {
  #[serde(rename = "formatVersion")]
  format_version: Option<u64>,
}

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

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum LicenseV2Error {
  #[error("license public key missing")]
  PublicKeyMissing,
  #[error("invalid license public key")]
  InvalidPublicKey,
  #[error("invalid license envelope")]
  InvalidEnvelope,
  #[error("invalid license signature")]
  InvalidSignature,
  #[error("invalid license claims")]
  InvalidClaims,
  #[error("license workspace mismatch")]
  WorkspaceMismatch,
  #[error("license not yet valid")]
  NotBefore,
  #[error("license expired")]
  Expired,
}

impl LicenseV2Error {
  pub fn code(self) -> &'static str {
    match self {
      Self::PublicKeyMissing => "public_key_missing",
      Self::InvalidPublicKey => "invalid_public_key",
      Self::InvalidEnvelope => "invalid_envelope",
      Self::InvalidSignature => "invalid_signature",
      Self::InvalidClaims => "invalid_claims",
      Self::WorkspaceMismatch => "workspace_mismatch",
      Self::NotBefore => "not_before",
      Self::Expired => "expired",
    }
  }

  pub fn is_server_config_error(self) -> bool {
    matches!(self, Self::PublicKeyMissing | Self::InvalidPublicKey)
  }

  pub fn to_core_license_error(self) -> LicenseError {
    match self {
      Self::PublicKeyMissing | Self::InvalidPublicKey => LicenseError::InvalidPublicKey,
      Self::InvalidEnvelope => LicenseError::InvalidEnvelope,
      Self::InvalidSignature => LicenseError::InvalidSignature,
      Self::InvalidClaims => LicenseError::InvalidClaims,
      Self::WorkspaceMismatch => LicenseError::WorkspaceMismatch,
      Self::NotBefore => LicenseError::NotBefore,
      Self::Expired => LicenseError::Expired,
    }
  }
}

impl From<LicenseError> for LicenseV2Error {
  fn from(error: LicenseError) -> Self {
    match error {
      LicenseError::InvalidPublicKey => Self::InvalidPublicKey,
      LicenseError::InvalidEnvelope => Self::InvalidEnvelope,
      LicenseError::InvalidSignature => Self::InvalidSignature,
      LicenseError::InvalidClaims => Self::InvalidClaims,
      LicenseError::WorkspaceMismatch => Self::WorkspaceMismatch,
      LicenseError::NotBefore => Self::NotBefore,
      LicenseError::Expired => Self::Expired,
      _ => Self::InvalidClaims,
    }
  }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedLicenseV2 {
  pub claims: LicenseClaimsV2,
  pub issued_at: DateTime<Utc>,
  pub not_before: DateTime<Utc>,
  pub expires_at: Option<DateTime<Utc>>,
}

impl VerifiedLicenseV2 {
  fn ensure_commercial(&self) -> Result<(), LicenseV2Error> {
    if self.claims.kid == "community-default-v1" || !self.claims.rights.commercial {
      return Err(LicenseV2Error::InvalidClaims);
    }
    Ok(())
  }

  fn ensure_workspace_commercial(&self) -> Result<(), LicenseV2Error> {
    self.ensure_commercial()?;
    if self.claims.scope.kind != "workspace" {
      return Err(LicenseV2Error::WorkspaceMismatch);
    }
    Ok(())
  }

  pub fn to_access_grant(&self) -> AccessGrant {
    let plan = match self.claims.tier.as_str() {
      "selfhost_default" => Plan::SelfHostedFree,
      "selfhost_team" | "selfhost_enterprise" => Plan::SelfHostedTeam,
      _ => Plan::SelfHostedFree,
    };
    let quantity = (plan == Plan::SelfHostedTeam).then_some(self.claims.limits.seat_limit);
    AccessGrant {
      plan,
      quantity,
      expires_at: self.expires_at,
      limits: Limits {
        blob_limit: self.claims.limits.blob_limit_bytes,
        storage_quota: self.claims.limits.storage_quota_bytes,
        seat_limit: self.claims.limits.seat_limit,
        seat_quota: self.claims.limits.seat_quota_bytes,
        history_period: self.claims.limits.history_period_seconds,
        copilot_action_limit: if self.claims.rights.unlimited_copilot {
          None
        } else {
          self.claims.limits.copilot_action_limit
        },
      },
      rights: Rights {
        commercial: self.claims.rights.commercial,
        copilot_byok: self.claims.rights.copilot_byok,
        unlimited_copilot: self.claims.rights.unlimited_copilot,
      },
      diagnostics: Vec::new(),
    }
  }
}

#[derive(Clone, Debug)]
pub enum VerifiedAnyLicense {
  LegacyOrV1(VerifiedLicenseClaims),
  V2(VerifiedLicenseV2),
}

impl VerifiedAnyLicense {
  pub fn license_id(&self) -> &str {
    match self {
      Self::LegacyOrV1(claims) => claims.license_id(),
      Self::V2(claims) => &claims.claims.license_id,
    }
  }

  pub fn workspace_id(&self) -> Option<&str> {
    match self {
      Self::LegacyOrV1(claims) => Some(claims.workspace_id()),
      Self::V2(claims) => claims.claims.scope.workspace_id.as_deref(),
    }
  }

  // Keep the database plan vocabulary readable by 0.27.4 nodes during rollout.
  // Enterprise arbitration uses the signed tier, not this compatibility label.
  pub fn plan_name(&self) -> &str {
    match self {
      Self::V2(verified) if verified.claims.tier == "selfhost_default" => "selfhost_free",
      _ => "selfhost_team",
    }
  }

  pub fn ensure_workspace_commercial(&self) -> Result<(), LicenseV2Error> {
    match self {
      Self::LegacyOrV1(_) => Ok(()),
      Self::V2(verified) => verified.ensure_workspace_commercial(),
    }
  }

  pub fn seat_quantity(&self) -> i32 {
    match self {
      Self::LegacyOrV1(claims) => claims.seat_quantity(),
      Self::V2(claims) => claims.claims.limits.seat_limit,
    }
  }

  pub fn issued_at(&self) -> DateTime<Utc> {
    match self {
      Self::LegacyOrV1(claims) => claims.issued_at(),
      Self::V2(claims) => claims.issued_at,
    }
  }

  pub fn expires_at(&self) -> Option<DateTime<Utc>> {
    match self {
      Self::LegacyOrV1(claims) => Some(claims.expires_at()),
      Self::V2(claims) => claims.expires_at,
    }
  }

  pub fn recurring(&self) -> Option<&str> {
    match self {
      Self::LegacyOrV1(claims) => claims.recurring(),
      Self::V2(claims) => claims.claims.recurring.as_deref(),
    }
  }

  pub fn audience(&self) -> &str {
    match self {
      Self::LegacyOrV1(claims) => claims.audience(),
      Self::V2(claims) => &claims.claims.audience,
    }
  }
}

pub fn is_license_v2(payload: &[u8]) -> bool {
  let Ok(probe) = serde_json::from_slice::<EnvelopeProbe>(payload) else {
    return false;
  };
  probe.signature_version.is_none() && probe.claims.and_then(|claims| claims.format_version) == Some(2)
}

pub fn verify_license_v2(
  payload: &[u8],
  pro_public_key: Option<&str>,
  expected_workspace_id: Option<&str>,
  now: DateTime<Utc>,
) -> Result<VerifiedLicenseV2, LicenseV2Error> {
  let envelope: LicenseEnvelopeV2 = serde_json::from_slice(payload).map_err(|_| LicenseV2Error::InvalidEnvelope)?;
  let claims = &envelope.claims;

  if claims.format_version != 2 || claims.license_id.trim().is_empty() || claims.audience != "affine-selfhost" {
    return Err(LicenseV2Error::InvalidClaims);
  }

  let public_key_pem = match claims.kid.as_str() {
    "community-default-v1" => {
      if claims.scope.kind != "instance_default"
        || claims.scope.workspace_id.is_some()
        || claims.tier != "selfhost_default"
        || claims.rights.commercial
        || claims.rights.copilot_byok
        || claims.rights.unlimited_copilot
      {
        return Err(LicenseV2Error::InvalidClaims);
      }
      COMMUNITY_DEFAULT_PUBLIC_KEY
    }
    "pro-v1" => {
      let valid_scope_and_tier = match claims.scope.kind.as_str() {
        "workspace" => {
          claims
            .scope
            .workspace_id
            .as_deref()
            .is_some_and(|id| !id.trim().is_empty())
            && matches!(claims.tier.as_str(), "selfhost_team" | "selfhost_enterprise")
        }
        "instance_default" => {
          claims.scope.workspace_id.is_none()
            && matches!(
              claims.tier.as_str(),
              "selfhost_default" | "selfhost_team" | "selfhost_enterprise"
            )
        }
        _ => false,
      };
      if !valid_scope_and_tier {
        return Err(LicenseV2Error::InvalidClaims);
      }
      pro_public_key.ok_or(LicenseV2Error::PublicKeyMissing)?
    }
    _ => return Err(LicenseV2Error::InvalidClaims),
  };

  let verifying_key =
    VerifyingKey::from_public_key_pem(public_key_pem).map_err(|_| LicenseV2Error::InvalidPublicKey)?;
  let signature_bytes = BASE64
    .decode(&envelope.signature)
    .map_err(|_| LicenseV2Error::InvalidSignature)?;
  let signature = Signature::from_der(&signature_bytes).map_err(|_| LicenseV2Error::InvalidSignature)?;
  let canonical = serde_json::to_vec(claims).map_err(|_| LicenseV2Error::InvalidEnvelope)?;
  verifying_key
    .verify(&canonical, &signature)
    .map_err(|_| LicenseV2Error::InvalidSignature)?;

  if !(1..=100_000).contains(&claims.limits.seat_limit)
    || claims.limits.blob_limit_bytes <= 0
    || claims.limits.storage_quota_bytes <= 0
    || claims.limits.seat_quota_bytes.is_some_and(|quota| quota < 0)
    || claims.limits.history_period_seconds < 0
    || claims.limits.copilot_action_limit.is_some_and(|limit| limit < 0)
  {
    return Err(LicenseV2Error::InvalidClaims);
  }

  if claims
    .recurring
    .as_deref()
    .is_some_and(|value| !matches!(value, "monthly" | "yearly" | "lifetime"))
  {
    return Err(LicenseV2Error::InvalidClaims);
  }

  let issued_at = parse_rfc3339(&claims.issued_at).ok_or(LicenseV2Error::InvalidClaims)?;
  let not_before = parse_rfc3339(&claims.not_before).ok_or(LicenseV2Error::InvalidClaims)?;
  if not_before > issued_at {
    return Err(LicenseV2Error::InvalidClaims);
  }
  let expires_at = claims
    .expires_at
    .as_deref()
    .map(|value| parse_rfc3339(value).ok_or(LicenseV2Error::InvalidClaims))
    .transpose()?;
  if let Some(exp) = expires_at
    && issued_at >= exp
  {
    return Err(LicenseV2Error::InvalidClaims);
  }

  if claims.scope.kind == "workspace" {
    let Some(scope_ws) = claims.scope.workspace_id.as_deref().filter(|id| !id.trim().is_empty()) else {
      return Err(LicenseV2Error::InvalidClaims);
    };
    match expected_workspace_id {
      Some(expected) if expected == scope_ws => {}
      _ => return Err(LicenseV2Error::WorkspaceMismatch),
    }
  } else if claims.scope.kind == "instance_default" {
    if claims.scope.workspace_id.is_some() {
      return Err(LicenseV2Error::InvalidClaims);
    }
  } else {
    return Err(LicenseV2Error::InvalidClaims);
  }

  if now < not_before {
    return Err(LicenseV2Error::NotBefore);
  }
  if let Some(exp) = expires_at
    && now >= exp
  {
    return Err(LicenseV2Error::Expired);
  }

  Ok(VerifiedLicenseV2 {
    claims: envelope.claims,
    issued_at,
    not_before,
    expires_at,
  })
}

pub fn verify_any_license(
  payload: &[u8],
  pro_public_key: Option<&str>,
  expected_workspace_id: Option<&str>,
  now: DateTime<Utc>,
) -> Result<VerifiedAnyLicense, LicenseV2Error> {
  let probe: EnvelopeProbe = serde_json::from_slice(payload).map_err(|_| LicenseV2Error::InvalidEnvelope)?;
  if probe.signature_version.is_none() && probe.claims.and_then(|claims| claims.format_version) == Some(2) {
    return verify_license_v2(payload, pro_public_key, expected_workspace_id, now).map(VerifiedAnyLicense::V2);
  }
  let key = pro_public_key.ok_or(LicenseV2Error::PublicKeyMissing)?;
  LicenseVerifier::verify(payload, key, expected_workspace_id, now)
    .map(VerifiedAnyLicense::LegacyOrV1)
    .map_err(LicenseV2Error::from)
}

pub fn default_selfhost_access_grant() -> AccessGrant {
  DEFAULT_SELFHOST_GRANT
    .get_or_init(|| bundled_default_grant(DEFAULT_SELFHOST_LICENSE_BYTES))
    .clone()
}

fn bundled_default_grant(payload: &[u8]) -> AccessGrant {
  let baseline_time = Utc
    .with_ymd_and_hms(2026, 1, 1, 0, 0, 0)
    .single()
    .unwrap_or(DateTime::UNIX_EPOCH);
  match verify_license_v2(payload, None, None, baseline_time) {
    Ok(verified) => verified.to_access_grant(),
    Err(error) => AccessGrant {
      plan: Plan::SelfHostedFree,
      quantity: None,
      expires_at: None,
      limits: Limits {
        blob_limit: 0,
        storage_quota: 0,
        seat_limit: 0,
        seat_quota: None,
        history_period: 0,
        copilot_action_limit: Some(0),
      },
      rights: Rights {
        commercial: false,
        copilot_byok: false,
        unlimited_copilot: false,
      },
      diagnostics: vec![AccessDiagnostic::InvalidLicense(error.to_core_license_error())],
    },
  }
}

fn plan_rank(plan: &Plan) -> u8 {
  match plan {
    Plan::SelfHostedTeam | Plan::Team => 3,
    Plan::LifetimePro | Plan::Pro => 2,
    Plan::Ai => 1,
    Plan::SelfHostedFree | Plan::Free => 0,
  }
}

#[derive(Clone, Copy, Eq, Ord, PartialEq, PartialOrd)]
enum ScopePriority {
  InstanceDefault,
  Workspace,
}

pub fn resolve_entitlements_with_v2(context: &AccessContext<'_>, facts: &[EntitlementFact<'_>]) -> AccessGrant {
  if context.deployment != CoreDeployment::SelfHosted {
    return resolve_entitlements(context, facts);
  }

  let mut diagnostics = Vec::new();
  let fallback = default_selfhost_access_grant();
  let mut best_priority = (
    ScopePriority::InstanceDefault,
    0,
    false,
    plan_rank(&fallback.plan),
    fallback.limits.seat_limit,
    fallback.limits.storage_quota,
  );
  let mut best_payload: &[u8] = &[];
  let mut best = fallback;
  for fact in facts {
    let status_priority = match fact.status {
      "active" => 2,
      "grace" => 1,
      _ => 0,
    };
    let (scope, rank, grant) = if fact.source == "selfhost_license"
      && let Some(payload) = fact.signed_payload
      && is_license_v2(payload)
    {
      if status_priority == 0 {
        diagnostics.push(AccessDiagnostic::InvalidStatus);
        continue;
      }
      if context.target_type != affine_core::access_control::TargetType::Workspace {
        diagnostics.push(AccessDiagnostic::IneligibleTarget);
        continue;
      }
      if fact.starts_at.is_some_and(|starts| context.now < starts)
        || if fact.status == "grace" {
          fact.grace_until.is_none_or(|grace| context.now >= grace)
        } else {
          fact.expires_at.is_some_and(|exp| context.now >= exp)
        }
      {
        diagnostics.push(AccessDiagnostic::Inactive);
        continue;
      }
      match verify_license_v2(payload, context.license_public_key, context.workspace_id, context.now) {
        Ok(verified) => {
          if let Err(error) = verified.ensure_commercial() {
            diagnostics.push(AccessDiagnostic::InvalidLicense(error.to_core_license_error()));
            continue;
          }
          let grant = verified.to_access_grant();
          // affine_core 0.0.14 maps enterprise to SelfHostedTeam; retain the
          // signed tier for deterministic enterprise-over-team arbitration.
          let rank = if verified.claims.tier == "selfhost_enterprise" {
            4
          } else {
            plan_rank(&grant.plan)
          };
          let scope = if verified.claims.scope.kind == "workspace" {
            ScopePriority::Workspace
          } else {
            ScopePriority::InstanceDefault
          };
          (scope, rank, grant)
        }
        Err(error) => {
          diagnostics.push(AccessDiagnostic::InvalidLicense(error.to_core_license_error()));
          continue;
        }
      }
    } else {
      // Keep the core V0/V1 verifier and eligibility rules intact, ranking a
      // verified legacy commercial license alongside workspace-scoped V2.
      let mut grant = resolve_entitlements(context, std::slice::from_ref(fact));
      diagnostics.append(&mut grant.diagnostics);
      if !grant.rights.commercial {
        continue;
      }
      (ScopePriority::Workspace, plan_rank(&grant.plan), grant)
    };
    let priority = (
      scope,
      status_priority,
      grant.rights.commercial,
      rank,
      grant.limits.seat_limit,
      grant.limits.storage_quota,
    );
    // Equal quota tuples still need a stable winner if other signed limits
    // differ. The signed envelope bytes provide a final deterministic tie-break.
    let payload = fact.signed_payload.unwrap_or_default();
    if (priority, payload) > (best_priority, best_payload) {
      best_priority = priority;
      best_payload = payload;
      best = grant;
    }
  }

  best.diagnostics.extend(diagnostics);
  best
}

fn parse_rfc3339(value: &str) -> Option<DateTime<Utc>> {
  DateTime::parse_from_rfc3339(value)
    .ok()
    .map(|dt| dt.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
  use affine_core::access_control::{TargetType, describe_plan};
  use p256::{
    ecdsa::{SigningKey, signature::Signer},
    pkcs8::DecodePrivateKey,
  };

  use super::*;
  use crate::entitlement::tests::{TEST_PRIVATE_KEY, TEST_PUBLIC_KEY};

  fn sign_v2(claims: LicenseClaimsV2) -> Vec<u8> {
    let key = SigningKey::from_pkcs8_pem(TEST_PRIVATE_KEY).unwrap();
    let canonical = serde_json::to_vec(&claims).unwrap();
    let signature: Signature = key.sign(&canonical);
    serde_json::to_vec(&LicenseEnvelopeV2 {
      claims,
      signature: BASE64.encode(signature.to_der()),
    })
    .unwrap()
  }

  fn sample_pro_v2_claims(workspace_id: &str) -> LicenseClaimsV2 {
    LicenseClaimsV2 {
      format_version: 2,
      kid: "pro-v1".to_string(),
      license_id: "lic-v2-pro-001".to_string(),
      audience: "affine-selfhost".to_string(),
      scope: LicenseScopeV2 {
        kind: "workspace".to_string(),
        workspace_id: Some(workspace_id.to_string()),
      },
      tier: "selfhost_team".to_string(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: 25,
        seat_quota_bytes: Some(107_374_182_400),
        history_period_seconds: 31_536_000,
        copilot_action_limit: Some(100),
      },
      rights: LicenseRightsV2 {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: true,
      },
      recurring: Some("yearly".to_string()),
      issued_at: "2026-06-01T00:00:00Z".to_string(),
      not_before: "2026-06-01T00:00:00Z".to_string(),
      expires_at: Some("2027-06-01T00:00:00Z".to_string()),
    }
  }

  #[test]
  fn v2_dispatch_rejects_duplicate_json_fields() {
    let now = parse_rfc3339("2026-11-22T00:00:00Z").unwrap();
    let payload = String::from_utf8(sign_v2(sample_pro_v2_claims("ws-123"))).unwrap();
    for (field, replacement) in [
      ("\"formatVersion\":2", "\"formatVersion\":1,\"formatVersion\":2"),
      ("\"seatLimit\":25", "\"seatLimit\":1,\"seatLimit\":25"),
      ("\"commercial\":true", "\"commercial\":false,\"commercial\":true"),
    ] {
      let duplicate = payload.replacen(field, replacement, 1);
      assert!(matches!(
        verify_any_license(duplicate.as_bytes(), Some(TEST_PUBLIC_KEY), Some("ws-123"), now),
        Err(LicenseV2Error::InvalidEnvelope)
      ));
    }
  }

  fn fact(payload: &[u8]) -> EntitlementFact<'_> {
    EntitlementFact {
      source: "selfhost_license",
      status: "active",
      plan: "selfhost_team",
      quantity: None,
      starts_at: None,
      expires_at: None,
      grace_until: None,
      signed_payload: Some(payload),
    }
  }

  #[test]
  fn commercial_v2_arbitration_is_deterministic_and_supports_instance_defaults() {
    let now = parse_rfc3339("2026-11-22T00:00:00Z").unwrap();
    let context = AccessContext {
      deployment: CoreDeployment::SelfHosted,
      target_type: TargetType::Workspace,
      workspace_id: Some("ws-123"),
      now,
      license_public_key: Some(TEST_PUBLIC_KEY),
    };
    let claims = sample_pro_v2_claims("ws-123");
    let small = sign_v2(claims.clone());
    for (tier, seats, storage) in [
      ("selfhost_team", 50, 1_099_511_627_776),
      ("selfhost_team", 25, 2_199_023_255_552),
      ("selfhost_enterprise", 20, 1_099_511_627_776),
    ] {
      let mut preferred = claims.clone();
      preferred.tier = tier.into();
      preferred.limits.seat_limit = seats;
      preferred.limits.storage_quota_bytes = storage;
      let payload = sign_v2(preferred);
      let winner = resolve_entitlements_with_v2(&context, &[fact(&small), fact(&payload)]);
      assert_eq!(
        winner,
        resolve_entitlements_with_v2(&context, &[fact(&payload), fact(&small)])
      );
      assert_eq!(winner.limits.seat_limit, seats);
      assert_eq!(winner.limits.storage_quota, storage);
    }
    let mut grace = fact(&small);
    grace.status = "grace";
    grace.grace_until = Some(now + chrono::Duration::days(1));
    let mut bigger = claims.clone();
    bigger.limits.seat_limit = 50;
    let active = sign_v2(bigger);
    assert_eq!(
      resolve_entitlements_with_v2(&context, &[grace, fact(&active)])
        .limits
        .seat_limit,
      50
    );

    let resolved = resolve_entitlements_with_v2(&context, &[fact(DEFAULT_SELFHOST_LICENSE_BYTES)]);
    assert_eq!(resolved.plan, Plan::SelfHostedFree);
    assert!(!resolved.diagnostics.is_empty());
    let mut instance = claims.clone();
    instance.scope = LicenseScopeV2 {
      kind: "instance_default".into(),
      workspace_id: None,
    };
    instance.limits.seat_limit = 100;
    let payload = sign_v2(instance);
    let verified = verify_any_license(&payload, Some(TEST_PUBLIC_KEY), Some("ws-123"), now).unwrap();
    assert!(verified.ensure_workspace_commercial().is_err());
    let resolved = resolve_entitlements_with_v2(&context, &[fact(&payload)]);
    assert_eq!(resolved.plan, Plan::SelfHostedTeam);
    assert_eq!(resolved.limits.seat_limit, 100);
    let mut grace = fact(&small);
    grace.status = "grace";
    grace.grace_until = Some(now + chrono::Duration::days(1));
    assert_eq!(
      resolve_entitlements_with_v2(&context, &[fact(&payload), grace])
        .limits
        .seat_limit,
      25
    );
    let mut noncommercial = claims;
    noncommercial.rights.commercial = false;
    let payload = sign_v2(noncommercial);
    let verified = verify_any_license(&payload, Some(TEST_PUBLIC_KEY), Some("ws-123"), now).unwrap();
    assert_eq!(
      verified.ensure_workspace_commercial(),
      Err(LicenseV2Error::InvalidClaims)
    );
    assert_eq!(
      resolve_entitlements_with_v2(&context, &[fact(&payload)]).plan,
      Plan::SelfHostedFree
    );
  }

  #[test]
  fn corrupt_embedded_license_fails_closed_and_negative_seat_quota_is_rejected() {
    let grant = bundled_default_grant(b"{}");
    assert_eq!(grant.limits.seat_limit, 0);
    assert_eq!(grant.limits.blob_limit, 0);
    assert_eq!(grant.limits.storage_quota, 0);
    assert_eq!(grant.limits.history_period, 0);
    assert_eq!(grant.limits.copilot_action_limit, Some(0));
    assert_eq!(
      grant.rights,
      Rights {
        commercial: false,
        copilot_byok: false,
        unlimited_copilot: false
      }
    );
    assert_eq!(
      grant.diagnostics,
      vec![AccessDiagnostic::InvalidLicense(LicenseError::InvalidEnvelope)]
    );
    let mut claims = sample_pro_v2_claims("ws-123");
    claims.limits.seat_quota_bytes = Some(-1);
    let now = parse_rfc3339("2026-11-22T00:00:00Z").unwrap();
    assert_eq!(
      verify_license_v2(&sign_v2(claims), Some(TEST_PUBLIC_KEY), Some("ws-123"), now),
      Err(LicenseV2Error::InvalidClaims)
    );
    let mut claims = sample_pro_v2_claims("ws-123");
    claims.tier = "selfhost_enterprise".into();
    let verified = verify_any_license(&sign_v2(claims), Some(TEST_PUBLIC_KEY), Some("ws-123"), now).unwrap();
    assert_eq!(verified.plan_name(), "selfhost_team");
  }

  #[test]
  fn embedded_default_v2_license_matches_selfhosted_free_grant_exactly() {
    let now = parse_rfc3339("2026-11-22T00:00:00Z").unwrap();
    let verified = verify_license_v2(DEFAULT_SELFHOST_LICENSE_BYTES, None, None, now)
      .expect("embedded default selfhost license must verify without pro key");
    let v2_grant = verified.to_access_grant();
    let expected: AccessGrant = describe_plan(Plan::SelfHostedFree, None)
      .expect("SelfHostedFree catalog plan must exist")
      .into();

    assert_eq!(v2_grant, expected);
    assert_eq!(default_selfhost_access_grant(), expected);
    assert_eq!(default_selfhost_access_grant(), expected);
    assert_eq!(v2_grant.plan, expected.plan);
    assert_eq!(v2_grant.quantity, expected.quantity);
    assert_eq!(v2_grant.limits.blob_limit, expected.limits.blob_limit);
    assert_eq!(v2_grant.limits.storage_quota, expected.limits.storage_quota);
    assert_eq!(v2_grant.limits.seat_limit, expected.limits.seat_limit);
    assert_eq!(v2_grant.limits.seat_quota, expected.limits.seat_quota);
    assert_eq!(v2_grant.limits.history_period, expected.limits.history_period);
    assert_eq!(
      v2_grant.limits.copilot_action_limit,
      expected.limits.copilot_action_limit
    );
    assert_eq!(v2_grant.rights.commercial, expected.rights.commercial);
    assert_eq!(v2_grant.rights.copilot_byok, expected.rights.copilot_byok);
    assert_eq!(v2_grant.rights.unlimited_copilot, expected.rights.unlimited_copilot);
    assert_eq!(v2_grant.limits.blob_limit, 104_857_600);
    assert_eq!(v2_grant.limits.storage_quota, 107_374_182_400);
    assert_eq!(v2_grant.limits.seat_limit, 10);
    assert_eq!(v2_grant.limits.history_period, 2_592_000);
    assert_eq!(v2_grant.limits.copilot_action_limit, Some(10));
  }

  #[test]
  fn community_default_kid_rejects_privilege_escalation() {
    let now = parse_rfc3339("2026-11-22T00:00:00Z").unwrap();
    let base = LicenseClaimsV2 {
      format_version: 2,
      kid: "community-default-v1".to_string(),
      license_id: "forged".to_string(),
      audience: "affine-selfhost".to_string(),
      scope: LicenseScopeV2 {
        kind: "instance_default".to_string(),
        workspace_id: None,
      },
      tier: "selfhost_default".to_string(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 104_857_600,
        storage_quota_bytes: 107_374_182_400,
        seat_limit: 10,
        seat_quota_bytes: None,
        history_period_seconds: 2_592_000,
        copilot_action_limit: Some(10),
      },
      rights: LicenseRightsV2 {
        commercial: false,
        copilot_byok: false,
        unlimited_copilot: false,
      },
      recurring: None,
      issued_at: "2026-01-01T00:00:00Z".to_string(),
      not_before: "2026-01-01T00:00:00Z".to_string(),
      expires_at: None,
    };

    let mut commercial = base.clone();
    commercial.rights.commercial = true;
    assert_eq!(
      verify_license_v2(&sign_v2(commercial), Some(TEST_PUBLIC_KEY), None, now),
      Err(LicenseV2Error::InvalidClaims)
    );

    let mut workspace_scoped = base.clone();
    workspace_scoped.scope = LicenseScopeV2 {
      kind: "workspace".to_string(),
      workspace_id: Some("ws-1".to_string()),
    };
    assert_eq!(
      verify_license_v2(&sign_v2(workspace_scoped), Some(TEST_PUBLIC_KEY), Some("ws-1"), now),
      Err(LicenseV2Error::InvalidClaims)
    );

    let mut team_tier = base.clone();
    team_tier.tier = "selfhost_team".to_string();
    assert_eq!(
      verify_license_v2(&sign_v2(team_tier), Some(TEST_PUBLIC_KEY), None, now),
      Err(LicenseV2Error::InvalidClaims)
    );
  }

  #[test]
  fn pro_v1_v2_license_verifies_and_falls_back_to_embedded_default() {
    let now = parse_rfc3339("2026-11-22T00:00:00Z").unwrap();
    let payload = sign_v2(sample_pro_v2_claims("ws-123"));

    // Missing pro public key yields PublicKeyMissing
    assert_eq!(
      verify_license_v2(&payload, None, Some("ws-123"), now),
      Err(LicenseV2Error::PublicKeyMissing)
    );

    // Valid verification
    let verified = verify_license_v2(&payload, Some(TEST_PUBLIC_KEY), Some("ws-123"), now).unwrap();
    let grant = verified.to_access_grant();
    assert_eq!(grant.plan, Plan::SelfHostedTeam);
    assert_eq!(grant.quantity, Some(25));
    assert_eq!(grant.limits.seat_limit, 25);
    assert_eq!(grant.limits.copilot_action_limit, None); // unlimited_copilot => None
    assert!(grant.rights.commercial);
    assert!(grant.rights.copilot_byok);
    assert!(grant.rights.unlimited_copilot);

    // Workspace mismatch (including expected_workspace_id == None)
    assert_eq!(
      verify_license_v2(&payload, Some(TEST_PUBLIC_KEY), Some("ws-other"), now),
      Err(LicenseV2Error::WorkspaceMismatch)
    );
    assert_eq!(
      verify_license_v2(&payload, Some(TEST_PUBLIC_KEY), None, now),
      Err(LicenseV2Error::WorkspaceMismatch)
    );

    // Grace workspace V2 license takes priority over Active instance_default V2 license
    let mut instance_claims = sample_pro_v2_claims("ws-123");
    instance_claims.scope = LicenseScopeV2 {
      kind: "instance_default".to_string(),
      workspace_id: None,
    };
    instance_claims.limits.seat_limit = 50;
    let instance_payload = sign_v2(instance_claims);
    let priority_resolved = resolve_entitlements_with_v2(
      &AccessContext {
        deployment: CoreDeployment::SelfHosted,
        target_type: TargetType::Workspace,
        workspace_id: Some("ws-123"),
        now,
        license_public_key: Some(TEST_PUBLIC_KEY),
      },
      &[
        EntitlementFact {
          source: "selfhost_license",
          status: "active",
          plan: "selfhost_team",
          quantity: Some(50),
          starts_at: None,
          expires_at: None,
          grace_until: None,
          signed_payload: Some(&instance_payload),
        },
        EntitlementFact {
          source: "selfhost_license",
          status: "grace",
          plan: "selfhost_team",
          quantity: Some(25),
          starts_at: None,
          expires_at: None,
          grace_until: Some(now + chrono::Duration::days(1)),
          signed_payload: Some(&payload),
        },
      ],
    );
    assert_eq!(priority_resolved.plan, Plan::SelfHostedTeam);
    assert_eq!(priority_resolved.limits.seat_limit, 25);

    // Expired
    let expired_now = parse_rfc3339("2027-06-01T00:00:00Z").unwrap();
    assert_eq!(
      verify_license_v2(&payload, Some(TEST_PUBLIC_KEY), Some("ws-123"), expired_now),
      Err(LicenseV2Error::Expired)
    );

    // resolve_entitlements_with_v2: valid V2 fact grants SelfHostedTeam
    let fact = EntitlementFact {
      source: "selfhost_license",
      status: "active",
      plan: "selfhost_team",
      quantity: Some(25),
      starts_at: None,
      expires_at: None,
      grace_until: None,
      signed_payload: Some(&payload),
    };
    let resolved = resolve_entitlements_with_v2(
      &AccessContext {
        deployment: CoreDeployment::SelfHosted,
        target_type: TargetType::Workspace,
        workspace_id: Some("ws-123"),
        now,
        license_public_key: Some(TEST_PUBLIC_KEY),
      },
      &[fact],
    );
    assert_eq!(resolved.plan, Plan::SelfHostedTeam);
    assert_eq!(resolved.limits.seat_limit, 25);

    // resolve_entitlements_with_v2: expired V2 fact falls back to embedded default with diagnostic
    let expired_resolved = resolve_entitlements_with_v2(
      &AccessContext {
        deployment: CoreDeployment::SelfHosted,
        target_type: TargetType::Workspace,
        workspace_id: Some("ws-123"),
        now: expired_now,
        license_public_key: Some(TEST_PUBLIC_KEY),
      },
      &[EntitlementFact {
        source: "selfhost_license",
        status: "active",
        plan: "selfhost_team",
        quantity: Some(25),
        starts_at: None,
        expires_at: None,
        grace_until: None,
        signed_payload: Some(&payload),
      }],
    );
    assert_eq!(expired_resolved.plan, Plan::SelfHostedFree);
    assert_eq!(expired_resolved.limits.seat_limit, 10);
    assert!(
      expired_resolved
        .diagnostics
        .contains(&AccessDiagnostic::InvalidLicense(LicenseError::Expired))
    );
  }
}
