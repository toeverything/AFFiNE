use std::collections::HashMap;

use aes_gcm::{
  AesGcm, KeyInit,
  aead::{
    Aead,
    generic_array::{GenericArray, typenum::U12},
  },
  aes::Aes256,
};
use chrono::{DateTime, Utc};
use napi::{Error as NapiError, Result, Status, bindgen_prelude::Buffer};
use napi_derive::napi;
use p256::{
  ecdsa::{Signature, VerifyingKey, signature::Verifier},
  pkcs8::DecodePublicKey,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

type Aes256Gcm12 = AesGcm<Aes256, U12, U12>;
type LicenseError = (&'static str, &'static str);
type LicenseResult<T> = std::result::Result<T, LicenseError>;

const ONE_MB: i64 = 1024 * 1024;
const ONE_GB: i64 = 1024 * ONE_MB;
const ONE_DAY_SECONDS: i64 = 24 * 60 * 60;
const MAX_SEAT_QUANTITY: i32 = 100_000;

#[napi(object)]
pub struct ResolveEntitlementInput {
  pub deployment_type: String,
  pub target_type: String,
  pub target_id: Option<String>,
  pub plan: Option<String>,
  #[napi(ts_type = "number")]
  pub quantity: Option<Value>,
  pub signed_payload: Option<Buffer>,
  pub public_key: Option<String>,
  pub license_aes_key: Option<String>,
  pub now: String,
}

#[derive(Debug)]
#[napi(object)]
pub struct ResolvedQuota {
  pub blob_limit: i64,
  pub storage_quota: i64,
  pub seat_limit: Option<i32>,
  pub seat_quota: Option<i64>,
  pub history_period: i64,
  pub copilot_action_limit: Option<i32>,
}

#[derive(Debug)]
#[napi(object)]
pub struct ResolvedEntitlement {
  pub plan: String,
  pub valid: bool,
  pub status: String,
  pub quantity: Option<i32>,
  pub expires_at: Option<String>,
  pub subject_id: Option<String>,
  pub target_id: Option<String>,
  pub recurring: Option<String>,
  pub issued_at: Option<String>,
  pub entity: Option<String>,
  pub issuer: Option<String>,
  pub quota: ResolvedQuota,
  pub flags: HashMap<String, bool>,
  pub error_code: Option<String>,
  pub error_message: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LicenseEnvelope {
  payload: String,
  signature: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicensePayload {
  entity: String,
  issuer: String,
  issued_at: String,
  expires_at: String,
  data: LicenseData,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseData {
  id: String,
  workspace_id: String,
  plan: String,
  recurring: String,
  quantity: i32,
  end_at: String,
}

struct PlanQuota {
  name: &'static str,
  blob_limit: i64,
  storage_quota: i64,
  history_period: i64,
  member_limit: Option<i32>,
  seat_quota: Option<i64>,
  copilot_action_limit: Option<i32>,
  unlimited_copilot: bool,
}

#[napi]
pub fn resolve_entitlement_v1(input: ResolveEntitlementInput) -> Result<ResolvedEntitlement> {
  validate_input(&input)?;
  let now = parse_time(&input.now)?;

  if input.signed_payload.is_some() {
    if input.deployment_type != "selfhosted" || input.target_type != "workspace" {
      return invalid_arg("signedPayload is only supported for selfhosted workspace entitlements");
    }
    return resolve_selfhost_license(input, now);
  }

  let plan = input.plan.as_deref().unwrap_or_else(|| {
    if input.deployment_type == "selfhosted" {
      "selfhost_free"
    } else {
      "free"
    }
  });
  if input.deployment_type == "selfhosted" && plan != "selfhost_free" {
    return invalid_arg("selfhosted commercial entitlements require signedPayload");
  }
  let quantity = parse_quantity(input.quantity.as_ref())?;
  Ok(active(plan, quantity, None))
}

fn validate_input(input: &ResolveEntitlementInput) -> Result<()> {
  if !matches!(input.deployment_type.as_str(), "cloud" | "selfhosted") {
    return invalid_arg("deploymentType must be cloud or selfhosted");
  }
  if !matches!(input.target_type.as_str(), "user" | "workspace" | "instance") {
    return invalid_arg("targetType must be user, workspace, or instance");
  }
  parse_quantity(input.quantity.as_ref())?;
  Ok(())
}

fn parse_quantity(quantity: Option<&Value>) -> Result<Option<i32>> {
  let Some(quantity) = quantity else {
    return Ok(None);
  };
  let Some(quantity) = quantity.as_i64() else {
    return invalid_arg("quantity must be an integer");
  };
  if quantity <= 0 || quantity > MAX_SEAT_QUANTITY as i64 {
    return invalid_arg("quantity must be between 1 and 100000");
  }
  Ok(Some(quantity as i32))
}

fn resolve_selfhost_license(input: ResolveEntitlementInput, now: DateTime<Utc>) -> Result<ResolvedEntitlement> {
  let Some(payload) = input.signed_payload else {
    return Ok(active("selfhost_free", None, None));
  };
  let Some(public_key) = input.public_key else {
    return invalid_arg("publicKey is required for signed payload verification");
  };
  let Some(license_aes_key) = input.license_aes_key else {
    return invalid_arg("licenseAesKey is required for signed payload verification");
  };

  let payload = match decrypt_license(payload.as_ref(), &license_aes_key)
    .and_then(|decrypted| verify_license(&decrypted, &public_key))
  {
    Ok(payload) => payload,
    Err((code, message)) => return Ok(invalid_license(code, message)),
  };

  if let Err((code, message)) = validate_license_payload(&payload) {
    return Ok(invalid_license(code, message));
  }

  if payload.data.plan != "selfhostedteam" {
    return Ok(invalid_license("invalid_payload", "license plan is not selfhostedteam"));
  }

  if let Some(target_id) = input.target_id.as_deref()
    && target_id != payload.data.workspace_id.as_str()
  {
    return Ok(invalid_license(
      "workspace_mismatch",
      "workspace mismatched with license",
    ));
  }

  if payload.issued_at.is_empty() || payload.entity.is_empty() || payload.issuer.is_empty() {
    return Ok(invalid_license("invalid_payload", "license payload is incomplete"));
  }

  let file_expires_at = match parse_time(&payload.expires_at) {
    Ok(time) => time,
    Err(_) => return Ok(invalid_license("invalid_payload", "invalid expiresAt")),
  };
  let license_expires_at = match parse_time(&payload.data.end_at) {
    Ok(time) => time,
    Err(_) => return Ok(invalid_license("invalid_payload", "invalid endAt")),
  };

  let expires_at = file_expires_at.min(license_expires_at);
  if expires_at < now {
    let mut entitlement = expired(
      "selfhost_team",
      Some(payload.data.quantity),
      Some(expires_at.to_rfc3339()),
    );
    entitlement.error_code = Some(
      if license_expires_at < now && license_expires_at <= file_expires_at {
        "expired_end_at"
      } else {
        "expired"
      }
      .to_string(),
    );
    fill_license_metadata(&mut entitlement, &payload);
    return Ok(entitlement);
  }

  let mut entitlement = active(
    "selfhost_team",
    Some(payload.data.quantity),
    Some(expires_at.to_rfc3339()),
  );
  fill_license_metadata(&mut entitlement, &payload);
  Ok(entitlement)
}

fn fill_license_metadata(entitlement: &mut ResolvedEntitlement, payload: &LicensePayload) {
  entitlement.subject_id = Some(payload.data.id.clone());
  entitlement.target_id = Some(payload.data.workspace_id.clone());
  entitlement.recurring = Some(payload.data.recurring.clone());
  entitlement.issued_at = Some(payload.issued_at.clone());
  entitlement.entity = Some(payload.entity.clone());
  entitlement.issuer = Some(payload.issuer.clone());
}

fn validate_license_payload(payload: &LicensePayload) -> LicenseResult<()> {
  if payload.data.id.is_empty()
    || payload.data.workspace_id.is_empty()
    || !matches!(payload.data.recurring.as_str(), "monthly" | "yearly" | "lifetime")
    || payload.data.quantity <= 0
    || payload.data.quantity > MAX_SEAT_QUANTITY
  {
    return Err(("invalid_payload", "license payload is incomplete"));
  }

  Ok(())
}

fn decrypt_license(buf: &[u8], aes_key: &str) -> LicenseResult<(Vec<u8>, Vec<u8>)> {
  if buf.len() < 2 {
    return Err(("invalid_file", "invalid license file"));
  }

  let iv_len = buf[0] as usize;
  let tag_len = buf[1] as usize;
  let payload_start = 2 + iv_len + tag_len;
  if iv_len != 12 || tag_len != 12 || buf.len() <= payload_start {
    return Err(("invalid_file", "invalid license file"));
  }

  let iv = &buf[2..2 + iv_len];
  let tag = &buf[2 + iv_len..payload_start];
  let payload = &buf[payload_start..];
  let key = license_aes_key(aes_key)?;
  let cipher = Aes256Gcm12::new_from_slice(&key).map_err(|_| ("invalid_key", "invalid aes key"))?;
  let nonce = GenericArray::from_slice(iv);
  let mut encrypted = Vec::with_capacity(payload.len() + tag.len());
  encrypted.extend_from_slice(payload);
  encrypted.extend_from_slice(tag);
  let decrypted = cipher
    .decrypt(nonce, encrypted.as_ref())
    .map_err(|_| ("decrypt_failed", "failed to verify the license"))?;

  Ok((iv.to_vec(), decrypted))
}

fn license_aes_key(aes_key: &str) -> LicenseResult<[u8; 32]> {
  if aes_key.len() == 64
    && let Ok(decoded) = hex::decode(aes_key)
    && decoded.len() == 32
  {
    let mut key = [0; 32];
    key.copy_from_slice(&decoded);
    return Ok(key);
  }

  Ok(Sha256::digest(aes_key.as_bytes()).into())
}

fn verify_license(decrypted: &(Vec<u8>, Vec<u8>), public_key: &str) -> LicenseResult<LicensePayload> {
  let (iv, decrypted) = decrypted;
  let envelope: LicenseEnvelope =
    serde_json::from_slice(decrypted).map_err(|_| ("invalid_file", "invalid license file"))?;
  let signature = hex::decode(&envelope.signature).map_err(|_| ("invalid_signature", "invalid license signature"))?;
  let signature = Signature::from_der(&signature).map_err(|_| ("invalid_signature", "invalid license signature"))?;
  let verifying_key =
    VerifyingKey::from_public_key_pem(public_key).map_err(|_| ("invalid_public_key", "invalid public key"))?;
  let mut message = Vec::with_capacity(iv.len() + envelope.payload.len());
  message.extend_from_slice(iv);
  message.extend_from_slice(envelope.payload.as_bytes());
  verifying_key
    .verify(&message, &signature)
    .map_err(|_| ("invalid_signature", "invalid license signature"))?;

  serde_json::from_str::<LicensePayload>(&envelope.payload).map_err(|_| ("invalid_payload", "invalid license payload"))
}

fn active(plan: &str, quantity: Option<i32>, expires_at: Option<String>) -> ResolvedEntitlement {
  let quantity = quantity_for_plan(plan, quantity);
  let catalog = plan_catalog(plan, quantity);
  ResolvedEntitlement {
    plan: catalog.name.to_string(),
    valid: true,
    status: "active".to_string(),
    quantity,
    expires_at,
    subject_id: None,
    target_id: None,
    recurring: None,
    issued_at: None,
    entity: None,
    issuer: None,
    quota: quota(&catalog),
    flags: flags(&catalog),
    error_code: None,
    error_message: None,
  }
}

fn expired(plan: &str, quantity: Option<i32>, expires_at: Option<String>) -> ResolvedEntitlement {
  let quantity = quantity_for_plan(plan, quantity);
  let catalog = plan_catalog(plan, quantity);
  ResolvedEntitlement {
    plan: catalog.name.to_string(),
    valid: false,
    status: "expired".to_string(),
    quantity,
    expires_at,
    subject_id: None,
    target_id: None,
    recurring: None,
    issued_at: None,
    entity: None,
    issuer: None,
    quota: quota(&catalog),
    flags: flags(&catalog),
    error_code: Some("expired".to_string()),
    error_message: Some("license expired".to_string()),
  }
}

fn invalid_license(code: &'static str, message: &'static str) -> ResolvedEntitlement {
  let catalog = plan_catalog("selfhost_free", None);
  ResolvedEntitlement {
    plan: catalog.name.to_string(),
    valid: false,
    status: "needs_reupload".to_string(),
    quantity: None,
    expires_at: None,
    subject_id: None,
    target_id: None,
    recurring: None,
    issued_at: None,
    entity: None,
    issuer: None,
    quota: quota(&catalog),
    flags: flags(&catalog),
    error_code: Some(code.to_string()),
    error_message: Some(message.to_string()),
  }
}

fn quantity_for_plan(plan: &str, quantity: Option<i32>) -> Option<i32> {
  if matches!(plan, "team" | "selfhost_team") {
    quantity
  } else {
    None
  }
}

fn plan_catalog(plan: &str, quantity: Option<i32>) -> PlanQuota {
  let seats = quantity.unwrap_or(1);
  match plan {
    "pro" => PlanQuota {
      name: "pro",
      blob_limit: 100 * ONE_MB,
      storage_quota: 100 * ONE_GB,
      history_period: 30 * ONE_DAY_SECONDS,
      member_limit: Some(10),
      seat_quota: None,
      copilot_action_limit: Some(10),
      unlimited_copilot: false,
    },
    "lifetime_pro" => PlanQuota {
      name: "lifetime_pro",
      blob_limit: 100 * ONE_MB,
      storage_quota: 1024 * ONE_GB,
      history_period: 30 * ONE_DAY_SECONDS,
      member_limit: Some(10),
      seat_quota: None,
      copilot_action_limit: Some(10),
      unlimited_copilot: false,
    },
    "ai" => PlanQuota {
      name: "ai",
      blob_limit: 10 * ONE_MB,
      storage_quota: 10 * ONE_GB,
      history_period: 7 * ONE_DAY_SECONDS,
      member_limit: Some(3),
      seat_quota: None,
      copilot_action_limit: None,
      unlimited_copilot: true,
    },
    "team" | "selfhost_team" => {
      let seat_quota = 20 * ONE_GB;
      let storage_quota = (seats as i64)
        .checked_mul(seat_quota)
        .and_then(|storage| storage.checked_add(100 * ONE_GB))
        .unwrap_or(i64::MAX);
      PlanQuota {
        name: if plan == "team" { "team" } else { "selfhost_team" },
        blob_limit: 500 * ONE_MB,
        storage_quota,
        history_period: 30 * ONE_DAY_SECONDS,
        member_limit: Some(seats),
        seat_quota: Some(seat_quota),
        copilot_action_limit: None,
        unlimited_copilot: false,
      }
    }
    "selfhost_free" => PlanQuota {
      name: "selfhost_free",
      blob_limit: 100 * ONE_MB,
      storage_quota: 100 * ONE_GB,
      history_period: 30 * ONE_DAY_SECONDS,
      member_limit: Some(10),
      seat_quota: None,
      copilot_action_limit: Some(10),
      unlimited_copilot: false,
    },
    _ => PlanQuota {
      name: "free",
      blob_limit: 10 * ONE_MB,
      storage_quota: 10 * ONE_GB,
      history_period: 7 * ONE_DAY_SECONDS,
      member_limit: Some(3),
      seat_quota: None,
      copilot_action_limit: Some(10),
      unlimited_copilot: false,
    },
  }
}

fn quota(catalog: &PlanQuota) -> ResolvedQuota {
  ResolvedQuota {
    blob_limit: catalog.blob_limit,
    storage_quota: catalog.storage_quota,
    seat_limit: catalog.member_limit,
    seat_quota: catalog.seat_quota,
    history_period: catalog.history_period,
    copilot_action_limit: catalog.copilot_action_limit,
  }
}

fn flags(catalog: &PlanQuota) -> HashMap<String, bool> {
  let mut flags = HashMap::new();
  flags.insert("unlimitedCopilot".to_string(), catalog.unlimited_copilot);
  flags
}

fn parse_time(value: &str) -> Result<DateTime<Utc>> {
  DateTime::parse_from_rfc3339(value)
    .map(|value| value.with_timezone(&Utc))
    .map_err(|err| NapiError::new(Status::InvalidArg, err.to_string()))
}

fn invalid_arg<T>(message: &'static str) -> Result<T> {
  Err(NapiError::new(Status::InvalidArg, message))
}

#[cfg(test)]
mod tests {
  use super::*;

  const TEST_WORKSPACE_ID: &str = "d6f52bc7-d62a-4822-804a-335fa7dfe5a6";
  #[rustfmt::skip]
  const TEST_PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----\n\
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqrxlczPknUuj4q4xx1VGr063Cgu7\n\
Hc3w7v4FGmoA5MNzzhrkho1ckDYw2wrX6zBnehFzcivURv80HherE2GQjg==\n\
-----END PUBLIC KEY-----";
  const TEST_LICENSE_AES_KEY: &str = "TEST_LICENSE_AES_KEY";

  fn input(plan: Option<&str>, quantity: Option<i32>) -> ResolveEntitlementInput {
    ResolveEntitlementInput {
      deployment_type: "cloud".to_string(),
      target_type: "workspace".to_string(),
      target_id: Some("workspace".to_string()),
      plan: plan.map(str::to_string),
      quantity: quantity.map(Value::from),
      signed_payload: None,
      public_key: None,
      license_aes_key: None,
      now: "2026-05-14T00:00:00Z".to_string(),
    }
  }

  fn license_input(file: &str, workspace_id: &str) -> ResolveEntitlementInput {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("../server/src/__tests__/e2e/license/__fixtures__")
      .join(file);
    ResolveEntitlementInput {
      deployment_type: "selfhosted".to_string(),
      target_type: "workspace".to_string(),
      target_id: Some(workspace_id.to_string()),
      plan: None,
      quantity: None,
      signed_payload: Some(std::fs::read(fixture).unwrap().into()),
      public_key: Some(TEST_PUBLIC_KEY.to_string()),
      license_aes_key: Some(TEST_LICENSE_AES_KEY.to_string()),
      now: "2026-05-14T00:00:00Z".to_string(),
    }
  }

  fn decrypted_license(file: &str) -> (Vec<u8>, Vec<u8>) {
    let input = license_input(file, TEST_WORKSPACE_ID);
    let payload = input.signed_payload.unwrap();
    decrypt_license(payload.as_ref(), TEST_LICENSE_AES_KEY).unwrap()
  }

  #[test]
  fn decrypts_license_with_raw_or_hashed_aes_key() {
    let input = license_input("valid.license", TEST_WORKSPACE_ID);
    let payload = input.signed_payload.unwrap();
    let hashed_key = hex::encode(Sha256::digest(TEST_LICENSE_AES_KEY.as_bytes()));

    let raw = decrypt_license(payload.as_ref(), TEST_LICENSE_AES_KEY).unwrap();
    let hashed = decrypt_license(payload.as_ref(), &hashed_key).unwrap();

    assert_eq!(raw.0, hashed.0);
    assert_eq!(raw.1, hashed.1);
  }

  #[test]
  fn derives_plan_quota() {
    let cases = [
      ("free", None, 3, 10 * ONE_GB, Some(10)),
      ("pro", None, 10, 100 * ONE_GB, Some(10)),
      ("lifetime_pro", None, 10, 1024 * ONE_GB, Some(10)),
      ("team", Some(5), 5, 200 * ONE_GB, None),
      ("selfhost_team", Some(20), 20, 500 * ONE_GB, None),
      ("selfhost_free", None, 10, 100 * ONE_GB, Some(10)),
    ];

    for (plan, quantity, seat_limit, storage_quota, copilot_limit) in cases {
      let mut input = input(Some(plan), quantity);
      if plan == "selfhost_free" {
        input.deployment_type = "selfhosted".to_string();
      }
      let resolved = resolve_entitlement_v1(input).unwrap();
      assert!(resolved.valid, "{plan}");
      assert_eq!(
        resolved.quantity,
        if matches!(plan, "team" | "selfhost_team") {
          quantity
        } else {
          None
        },
        "{plan}"
      );
      assert_eq!(resolved.quota.seat_limit, Some(seat_limit), "{plan}");
      assert_eq!(resolved.quota.storage_quota, storage_quota, "{plan}");
      assert_eq!(resolved.quota.copilot_action_limit, copilot_limit, "{plan}");
    }
  }

  #[test]
  fn ignores_quantity_for_fixed_catalog_plans() {
    for plan in ["free", "pro", "lifetime_pro", "ai", "selfhost_free"] {
      let mut input = input(Some(plan), Some(50));
      if plan == "selfhost_free" {
        input.deployment_type = "selfhosted".to_string();
      }

      let resolved = resolve_entitlement_v1(input).unwrap();

      assert_eq!(resolved.quantity, None, "{plan}");
      assert_ne!(resolved.quota.seat_limit, Some(50), "{plan}");
    }
  }

  #[test]
  fn rejects_invalid_quantity() {
    for quantity in [0, -1, MAX_SEAT_QUANTITY + 1] {
      let err = resolve_entitlement_v1(input(Some("team"), Some(quantity))).unwrap_err();
      assert_eq!(err.status, Status::InvalidArg, "{quantity}");
    }
  }

  #[test]
  fn rejects_unsigned_selfhosted_commercial_entitlements() {
    for plan in ["pro", "lifetime_pro", "ai", "team", "selfhost_team"] {
      let mut input = input(Some(plan), Some(50));
      input.deployment_type = "selfhosted".to_string();

      let err = resolve_entitlement_v1(input).unwrap_err();

      assert_eq!(err.status, Status::InvalidArg, "{plan}");
    }
  }

  #[test]
  fn rejects_schema_errors() {
    let mut input = input(Some("free"), None);
    input.deployment_type = "local".to_string();
    let err = resolve_entitlement_v1(input).unwrap_err();
    assert_eq!(err.status, Status::InvalidArg);
  }

  #[test]
  fn rejects_signed_payload_outside_selfhost_workspace_boundary() {
    let cases = [
      ("cloud", "workspace"),
      ("selfhosted", "user"),
      ("selfhosted", "instance"),
    ];

    for (deployment_type, target_type) in cases {
      let mut input = license_input("valid.license", TEST_WORKSPACE_ID);
      input.deployment_type = deployment_type.to_string();
      input.target_type = target_type.to_string();
      let err = resolve_entitlement_v1(input).unwrap_err();
      assert_eq!(err.status, Status::InvalidArg, "{deployment_type}/{target_type}");
    }
  }

  #[test]
  fn verifies_selfhost_license_files() {
    let cases = [
      ("valid.license", TEST_WORKSPACE_ID, true, "active", None, Some(20)),
      (
        "valid.license",
        "other-workspace",
        false,
        "needs_reupload",
        Some("workspace_mismatch"),
        None,
      ),
      (
        "expired.license",
        TEST_WORKSPACE_ID,
        false,
        "expired",
        Some("expired"),
        Some(20),
      ),
      (
        "expired-end-at.license",
        TEST_WORKSPACE_ID,
        false,
        "expired",
        Some("expired_end_at"),
        Some(20),
      ),
    ];

    for (file, workspace_id, valid, status, error_code, quantity) in cases {
      let resolved = resolve_entitlement_v1(license_input(file, workspace_id)).unwrap();
      assert_eq!(resolved.valid, valid, "{file}");
      assert_eq!(resolved.status, status, "{file}");
      assert_eq!(resolved.error_code.as_deref(), error_code, "{file}");
      assert_eq!(resolved.quantity, quantity, "{file}");
      if valid {
        assert_eq!(resolved.plan, "selfhost_team", "{file}");
        assert_eq!(resolved.quota.seat_limit, quantity, "{file}");
        assert_eq!(resolved.quota.storage_quota, 500 * ONE_GB, "{file}");
        assert_eq!(resolved.quota.blob_limit, 500 * ONE_MB, "{file}");
      }
    }
  }

  #[test]
  fn verifies_signature_branch() {
    let (iv, decrypted) = decrypted_license("valid.license");
    let mut envelope: LicenseEnvelope = serde_json::from_slice(&decrypted).unwrap();
    envelope.signature = "00".to_string();
    let decrypted = serde_json::to_vec(&envelope).unwrap();
    let err = verify_license(&(iv, decrypted), TEST_PUBLIC_KEY).unwrap_err();

    assert_eq!(err.0, "invalid_signature");
  }

  #[test]
  fn rejects_license_payload_schema_and_quantity_errors() {
    let mut payload: LicensePayload = serde_json::from_str(
      &serde_json::from_slice::<LicenseEnvelope>(&decrypted_license("valid.license").1)
        .unwrap()
        .payload,
    )
    .unwrap();

    for quantity in [0, -1] {
      payload.data.quantity = quantity;
      let err = validate_license_payload(&payload).unwrap_err();
      assert_eq!(err.0, "invalid_payload");
    }

    payload.data.quantity = 20;
    payload.data.workspace_id.clear();
    let err = validate_license_payload(&payload).unwrap_err();
    assert_eq!(err.0, "invalid_payload");
  }
}
