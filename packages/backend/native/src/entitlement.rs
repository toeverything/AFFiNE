use std::collections::HashMap;

use affine_core::access_control::{
  AccessGrant, Deployment, EntitlementInput, EntitlementInputError, LicenseIssuance, LicenseIssuanceError,
  LicenseIssuer, LicenseVerifier, Limits, Plan, Rights, TargetType, ValidatedEntitlement, describe_plan,
  validate_entitlement_input,
};
use chrono::{DateTime, Utc};
use napi::{Error as NapiError, Result, Status, bindgen_prelude::Buffer};
use napi_derive::napi;
use serde_json::Value;

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
  pub now: String,
}

#[napi(object)]
pub struct IssueLicenseInput {
  pub license_id: String,
  pub workspace_id: String,
  pub seat_quantity: f64,
  pub subscription_end: Option<String>,
  pub private_key: String,
  pub now: String,
}

#[napi]
pub fn issue_license_v1(input: IssueLicenseInput) -> Result<Buffer> {
  let now = parse_time(&input.now)?;
  let subscription_end = input.subscription_end.as_deref().map(parse_time).transpose()?;
  let seat_quantity = parse_license_seat_quantity(input.seat_quantity)?;
  LicenseIssuer::issue(
    LicenseIssuance {
      license_id: &input.license_id,
      workspace_id: &input.workspace_id,
      seat_quantity,
      subscription_end,
      now,
    },
    &input.private_key,
  )
  .map(Buffer::from)
  .map_err(|error| {
    let message = match error {
      LicenseIssuanceError::InvalidPrivateKey => "invalid license private key",
      LicenseIssuanceError::InvalidClaims => "invalid license claims",
      LicenseIssuanceError::InvalidTimeWindow => "invalid license time window",
      LicenseIssuanceError::Encoding => "failed to encode license envelope",
    };
    NapiError::new(Status::InvalidArg, message)
  })
}

#[napi]
pub fn validate_license_seat_quantity_v1(seat_quantity: f64) -> Result<()> {
  LicenseIssuer::validate_seat_quantity(parse_license_seat_quantity(seat_quantity)?)
    .map_err(|_| NapiError::new(Status::InvalidArg, "invalid license seat quantity"))
}

fn parse_license_seat_quantity(seat_quantity: f64) -> Result<i32> {
  if !seat_quantity.is_finite()
    || seat_quantity.fract() != 0.0
    || seat_quantity < i32::MIN as f64
    || seat_quantity > i32::MAX as f64
  {
    return invalid_arg("invalid license seat quantity");
  }
  Ok(seat_quantity as i32)
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

#[napi]
pub fn resolve_entitlement_v1(input: ResolveEntitlementInput) -> Result<ResolvedEntitlement> {
  let now = parse_time(&input.now)?;
  let deployment = parse_deployment(&input.deployment_type)?;
  let target_type = parse_target_type(&input.target_type)?;
  let quantity = parse_quantity(input.quantity.as_ref())?;
  let plan = input
    .plan
    .as_deref()
    .map(|plan| Plan::parse(plan).ok_or_else(|| NapiError::new(Status::InvalidArg, "unknown entitlement plan")))
    .transpose()?;
  let validated = validate_entitlement_input(EntitlementInput {
    deployment,
    target_type,
    plan,
    quantity,
    signed: input.signed_payload.is_some(),
  })
  .map_err(entitlement_input_error)?;
  if validated == ValidatedEntitlement::SignedLicense {
    return resolve_selfhost_license(input, now);
  }
  let ValidatedEntitlement::Catalog(access) = validated else {
    unreachable!();
  };
  let grant: AccessGrant = access.into();
  Ok(active_with_grant(
    grant.plan,
    grant.quantity,
    grant.limits,
    grant.rights,
    None,
  ))
}

fn parse_deployment(value: &str) -> Result<Deployment> {
  match value {
    "cloud" => Ok(Deployment::Cloud),
    "selfhosted" => Ok(Deployment::SelfHosted),
    _ => invalid_arg("deploymentType must be cloud or selfhosted"),
  }
}

pub(crate) fn parse_target_type(value: &str) -> Result<TargetType> {
  match value {
    "user" => Ok(TargetType::User),
    "workspace" => Ok(TargetType::Workspace),
    "instance" => Ok(TargetType::Instance),
    _ => invalid_arg("targetType must be user, workspace, or instance"),
  }
}

pub(crate) fn parse_quantity(quantity: Option<&Value>) -> Result<Option<i32>> {
  let Some(quantity) = quantity else {
    return Ok(None);
  };
  let Some(quantity) = quantity.as_i64() else {
    return invalid_arg("quantity must be an integer");
  };
  i32::try_from(quantity)
    .map(Some)
    .map_err(|_| NapiError::new(Status::InvalidArg, "quantity is outside the supported integer range"))
}

pub(crate) fn entitlement_input_error(error: EntitlementInputError) -> NapiError {
  let message = match error {
    EntitlementInputError::InvalidQuantity => "quantity must be between 1 and 100000",
    EntitlementInputError::SignedFieldsConflict => "signed commercial fields must come from license claims",
    EntitlementInputError::SignedTargetMismatch => {
      "signedPayload is only supported for selfhosted workspace entitlements"
    }
    EntitlementInputError::SelfHostedCommercialRequiresSignature => {
      "selfhosted commercial entitlements require signedPayload"
    }
    EntitlementInputError::PlanTargetMismatch => "entitlement plan is not configurable for target type",
  };
  NapiError::new(Status::InvalidArg, message)
}

fn resolve_selfhost_license(input: ResolveEntitlementInput, now: DateTime<Utc>) -> Result<ResolvedEntitlement> {
  let payload = input
    .signed_payload
    .ok_or_else(|| NapiError::new(Status::InvalidArg, "signedPayload is required"))?;
  let Some(public_key) = input.public_key else {
    return invalid_arg("publicKey is required for signed payload verification");
  };

  let normalized = match crate::license_import::normalize_license(payload.as_ref()) {
    Ok(payload) => payload,
    Err(error) if error.status == Status::GenericFailure => return Err(error),
    Err(error) => return Ok(invalid_license(&error.reason, &error.reason)),
  };
  let claims = match LicenseVerifier::verify(normalized.as_ref(), &public_key, input.target_id.as_deref(), now) {
    Ok(claims) => claims,
    Err(error) => return Ok(invalid_license(error.code(), &error.to_string())),
  };
  let grant: AccessGrant = describe_plan(Plan::SelfHostedTeam, Some(claims.seat_quantity()))
    .map_err(entitlement_input_error)?
    .into();
  let mut entitlement = active_with_grant(
    grant.plan,
    grant.quantity,
    grant.limits,
    grant.rights,
    Some(claims.expires_at().to_rfc3339()),
  );
  entitlement.subject_id = Some(claims.license_id().to_string());
  entitlement.target_id = Some(claims.workspace_id().to_string());
  entitlement.issued_at = Some(claims.issued_at().to_rfc3339());
  entitlement.recurring = claims.recurring().map(str::to_string);
  entitlement.entity = Some(claims.audience().to_string());
  entitlement.issuer = Some("affine".to_string());
  Ok(entitlement)
}

fn active_with_grant(
  plan: Plan,
  quantity: Option<i32>,
  limits: Limits,
  rights: Rights,
  expires_at: Option<String>,
) -> ResolvedEntitlement {
  let quantity = quantity.filter(|_| matches!(plan, Plan::Team | Plan::SelfHostedTeam));
  ResolvedEntitlement {
    plan: plan.as_str().to_string(),
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
    quota: quota(limits),
    flags: flags(rights),
    error_code: None,
    error_message: None,
  }
}

fn invalid_license(code: &str, message: &str) -> ResolvedEntitlement {
  let plan = Plan::SelfHostedFree;
  let access = describe_plan(plan, None).expect("self-hosted free plan is valid");
  ResolvedEntitlement {
    plan: plan.as_str().to_string(),
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
    quota: quota(access.limits),
    flags: flags(access.rights),
    error_code: Some(code.to_string()),
    error_message: Some(message.to_string()),
  }
}

fn quota(limits: Limits) -> ResolvedQuota {
  ResolvedQuota {
    blob_limit: limits.blob_limit,
    storage_quota: limits.storage_quota,
    seat_limit: Some(limits.seat_limit),
    seat_quota: limits.seat_quota,
    history_period: limits.history_period,
    copilot_action_limit: limits.copilot_action_limit,
  }
}

fn flags(rights: Rights) -> HashMap<String, bool> {
  let mut flags = HashMap::new();
  flags.insert("unlimitedCopilot".to_string(), rights.unlimited_copilot);
  flags.insert("copilotByok".to_string(), rights.copilot_byok);
  flags.insert("commercial".to_string(), rights.commercial);
  flags
}

pub(crate) fn parse_time(value: &str) -> Result<DateTime<Utc>> {
  DateTime::parse_from_rfc3339(value)
    .map(|value| value.with_timezone(&Utc))
    .map_err(|err| NapiError::new(Status::InvalidArg, err.to_string()))
}

fn invalid_arg<T>(message: &'static str) -> Result<T> {
  Err(NapiError::new(Status::InvalidArg, message))
}

#[cfg(test)]
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct LicenseClaimsV1 {
  format_version: u32,
  license_id: String,
  workspace_id: String,
  audience: String,
  plan: String,
  seat_quantity: i32,
  issued_at: String,
  not_before: String,
  expires_at: String,
}

#[cfg(test)]
#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
struct LicenseEnvelopeV1 {
  claims: LicenseClaimsV1,
  signature: String,
}

#[cfg(test)]
pub(crate) fn signed_test_license(workspace_id: &str) -> (Vec<u8>, String) {
  signed_test_license_with_id(workspace_id, &format!("license:{workspace_id}"))
}

#[cfg(test)]
pub(crate) fn signed_test_license_with_id(workspace_id: &str, license_id: &str) -> (Vec<u8>, String) {
  use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
  use chrono::Duration;
  use p256::{
    ecdsa::{Signature, SigningKey, signature::Signer},
    pkcs8::{DecodePrivateKey, EncodePublicKey, LineEnding},
  };

  let signing_key = SigningKey::from_pkcs8_pem(tests::TEST_PRIVATE_KEY).unwrap();
  let now = Utc::now();
  let claims = LicenseClaimsV1 {
    format_version: 1,
    license_id: license_id.to_string(),
    workspace_id: workspace_id.to_string(),
    audience: "affine-selfhost".to_string(),
    plan: "selfhost_team".to_string(),
    seat_quantity: 10,
    issued_at: (now - Duration::minutes(1)).to_rfc3339(),
    not_before: (now - Duration::minutes(1)).to_rfc3339(),
    expires_at: (now + Duration::minutes(10)).to_rfc3339(),
  };
  let signature: Signature = signing_key.sign(&serde_json::to_vec(&claims).unwrap());
  let payload = serde_json::to_vec(&LicenseEnvelopeV1 {
    claims,
    signature: BASE64.encode(signature.to_der()),
  })
  .unwrap();
  let public_key = signing_key.verifying_key().to_public_key_pem(LineEnding::LF).unwrap();
  (payload, public_key)
}

#[cfg(test)]
pub(crate) mod tests {
  use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
  use p256::ecdsa::Signature;

  use super::*;

  const TEST_WORKSPACE_ID: &str = "d6f52bc7-d62a-4822-804a-335fa7dfe5a6";
  #[rustfmt::skip]
  pub(crate) const TEST_PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----\n\
  MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEObwJiTmbui7rkWfPJ7Lozvuy2Rcl\n\
  otcrb0V6dlS2ijKEShm7ZttTwQn08xzesdjX/AxpoR5X9yfoHkauIBuuMQ==\n\
  -----END PUBLIC KEY-----";
  #[rustfmt::skip]
  pub(crate) const TEST_PRIVATE_KEY: &str = "-----BEGIN PRIVATE KEY-----\n\
  MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgsH+B50OQ7W85sBwV\n\
  Vu1OkczX+OJICAwmwCMDMBhEXB+hRANCAAQ5vAmJOZu6LuuRZ88nsujO+7LZFyWi\n\
  1ytvRXp2VLaKMoRKGbtm21PBCfTzHN6x2Nf8DGmhHlf3J+geRq4gG64x\n\
  -----END PRIVATE KEY-----";

  fn input(plan: Option<&str>, quantity: Option<i32>) -> ResolveEntitlementInput {
    ResolveEntitlementInput {
      deployment_type: "cloud".to_string(),
      target_type: "workspace".to_string(),
      target_id: Some("workspace".to_string()),
      plan: plan.map(str::to_string),
      quantity: quantity.map(Value::from),
      signed_payload: None,
      public_key: None,
      now: "2026-05-14T00:00:00Z".to_string(),
    }
  }

  fn signed_license(claims: LicenseClaimsV1) -> Vec<u8> {
    use p256::{
      ecdsa::{SigningKey, signature::Signer},
      pkcs8::DecodePrivateKey,
    };

    let signing_key = SigningKey::from_pkcs8_pem(TEST_PRIVATE_KEY).unwrap();
    let canonical = serde_json::to_vec(&claims).unwrap();
    let signature: Signature = signing_key.sign(&canonical);
    serde_json::to_vec(&LicenseEnvelopeV1 {
      claims,
      signature: BASE64.encode(signature.to_der()),
    })
    .unwrap()
  }

  fn claims() -> LicenseClaimsV1 {
    LicenseClaimsV1 {
      format_version: 1,
      license_id: "license-id".to_string(),
      workspace_id: TEST_WORKSPACE_ID.to_string(),
      audience: "affine-selfhost".to_string(),
      plan: "selfhost_team".to_string(),
      seat_quantity: 20,
      issued_at: "2026-05-13T00:00:00Z".to_string(),
      not_before: "2026-05-13T00:00:00Z".to_string(),
      expires_at: "2026-05-15T00:00:00Z".to_string(),
    }
  }

  fn license_input(payload: Vec<u8>, workspace_id: &str) -> ResolveEntitlementInput {
    ResolveEntitlementInput {
      deployment_type: "selfhosted".to_string(),
      target_type: "workspace".to_string(),
      target_id: Some(workspace_id.to_string()),
      plan: None,
      quantity: None,
      signed_payload: Some(payload.into()),
      public_key: Some(TEST_PUBLIC_KEY.to_string()),
      now: "2026-05-14T00:00:00Z".to_string(),
    }
  }

  #[test]
  fn maps_catalog_plan_to_napi_output() {
    let resolved = resolve_entitlement_v1(input(Some("team"), Some(5))).unwrap();
    assert!(resolved.valid);
    assert_eq!(resolved.plan, "team");
    assert_eq!(resolved.quantity, Some(5));
    assert_eq!(resolved.quota.seat_limit, Some(5));
    assert!(resolved.flags.get("commercial").copied().unwrap_or_default());
    let mut ai = input(Some("ai"), None);
    ai.target_type = "user".into();
    let ai = resolve_entitlement_v1(ai).unwrap();
    assert_eq!(ai.plan, "free");
    assert_eq!(ai.quota.copilot_action_limit, None);
    assert_eq!(ai.flags.get("copilotByok"), Some(&true));
  }

  #[test]
  fn maps_input_and_domain_errors_to_invalid_arg() {
    let mut invalid_deployment = input(Some("free"), None);
    invalid_deployment.deployment_type = "local".to_string();
    assert_eq!(
      resolve_entitlement_v1(invalid_deployment).unwrap_err().status,
      Status::InvalidArg
    );
    let mut unsigned_commercial = input(Some("team"), Some(5));
    unsigned_commercial.deployment_type = "selfhosted".to_string();
    assert_eq!(
      resolve_entitlement_v1(unsigned_commercial).unwrap_err().status,
      Status::InvalidArg
    );
  }

  #[test]
  fn maps_signed_license_result() {
    let valid = resolve_entitlement_v1(license_input(signed_license(claims()), TEST_WORKSPACE_ID)).unwrap();
    assert!(valid.valid);
    assert_eq!(valid.plan, "selfhost_team");
    assert_eq!(valid.quantity, Some(20));

    let mut preview = license_input(signed_license(claims()), TEST_WORKSPACE_ID);
    preview.target_id = None;
    let preview = resolve_entitlement_v1(preview).unwrap();
    assert!(preview.valid);
    assert_eq!(preview.target_id.as_deref(), Some(TEST_WORKSPACE_ID));

    let mismatch = resolve_entitlement_v1(license_input(signed_license(claims()), "other-workspace")).unwrap();
    assert!(!mismatch.valid);
    assert_eq!(mismatch.error_code.as_deref(), Some("workspace_mismatch"));
  }

  #[test]
  fn maps_license_issuance_types_and_errors() {
    let payload = issue_license_v1(IssueLicenseInput {
      license_id: "license-id".into(),
      workspace_id: TEST_WORKSPACE_ID.into(),
      seat_quantity: 20.0,
      subscription_end: Some("2026-05-16T00:00:00Z".into()),
      private_key: TEST_PRIVATE_KEY.into(),
      now: "2026-05-14T00:00:00Z".into(),
    })
    .unwrap();
    let resolved = resolve_entitlement_v1(license_input(payload.to_vec(), TEST_WORKSPACE_ID)).unwrap();
    assert!(resolved.valid);
    assert_eq!(resolved.quantity, Some(20));

    let error = match issue_license_v1(IssueLicenseInput {
      license_id: "license-id".into(),
      workspace_id: TEST_WORKSPACE_ID.into(),
      seat_quantity: 0.0,
      subscription_end: None,
      private_key: TEST_PRIVATE_KEY.into(),
      now: "2026-05-14T00:00:00Z".into(),
    }) {
      Ok(_) => panic!("invalid quantity was accepted"),
      Err(error) => error,
    };
    assert_eq!(error.status, Status::InvalidArg);

    assert!(validate_license_seat_quantity_v1(1.5).is_err());
    assert!(validate_license_seat_quantity_v1(4_294_967_297.0).is_err());
    assert!(validate_license_seat_quantity_v1(-4_294_967_295.0).is_err());
  }
}
