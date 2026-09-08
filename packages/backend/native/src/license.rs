use std::{
  collections::HashMap,
  sync::{Mutex, OnceLock},
  time::Duration,
};

use anyhow::{Context, Result as AnyResult, bail};
use serde::de::DeserializeOwned;
use url::Url;

const AFFINE_PRO_ENDPOINT: &str = "https://app.affine.pro";
const AFFINE_PRO_HOST: &str = "app.affine.pro";
const AFFINE_PRO_REQUEST_TIMEOUT_MS: u32 = 10_000;
const AFFINE_PRO_MAX_BYTES: u32 = 1024 * 1024;
const ECH_DNS_QUERY_TIMEOUT_MS: u32 = 5_000;

static AFFINE_PRO_ECH_CONFIG: OnceLock<Mutex<Option<Vec<u8>>>> = OnceLock::new();

pub(crate) struct LicenseKeyRequest {
  pub license_key: String,
  pub workspace_id: Option<String>,
  pub validate_key: Option<String>,
}

pub(crate) struct LicenseHealthRequest {
  pub license_key: String,
  pub validate_key: String,
}

pub(crate) struct LicenseRecurringRequest {
  pub license_key: String,
  pub recurring: String,
}

pub(crate) struct LicenseSeatsRequest {
  pub license_key: String,
  pub seats: u32,
}

pub(crate) struct LicenseInfo {
  pub recurring: String,
  pub validate_key: String,
  pub envelope: napi::bindgen_prelude::Buffer,
}

pub(crate) struct LicenseError {
  pub status: u16,
  pub body: String,
}

pub(crate) struct LicenseResponse {
  pub license: Option<LicenseInfo>,
  pub error: Option<LicenseError>,
}

pub(crate) struct CommandResponse {
  pub error: Option<LicenseError>,
}

pub(crate) struct PortalResponse {
  pub url: Option<String>,
  pub error: Option<LicenseError>,
}

pub(crate) fn activate_license_request(request: &LicenseKeyRequest) -> AnyResult<LicenseResponse> {
  let workspace_id = request.workspace_id.as_deref().context("workspaceId is required")?;
  let body = serde_json::to_vec(&serde_json::json!({
    "workspaceId": workspace_id,
    "operationId": request.validate_key.as_deref().context("validateKey is required")?,
  }))?;
  license_info(
    &format!("/api/team/licenses/{}/activate", request.license_key),
    safefetch::SafeFetchMethod::Post,
    None,
    Some(body),
  )
}

pub(crate) fn deactivate_license_request(request: &LicenseKeyRequest) -> AnyResult<CommandResponse> {
  let validate_key = request.validate_key.clone().context("validateKey is required")?;
  command(
    &format!("/api/team/licenses/{}/deactivate", request.license_key),
    safefetch::SafeFetchMethod::Post,
    Some(HashMap::from([("x-validate-key".to_string(), validate_key)])),
    None,
  )
}

pub(crate) fn check_license_health_request(request: &LicenseHealthRequest) -> AnyResult<LicenseResponse> {
  license_info(
    &format!("/api/team/licenses/{}/health", request.license_key),
    safefetch::SafeFetchMethod::Get,
    Some(HashMap::from([(
      "x-validate-key".to_string(),
      request.validate_key.clone(),
    )])),
    None,
  )
}

pub(crate) fn update_license_recurring_request(request: &LicenseRecurringRequest) -> AnyResult<CommandResponse> {
  let body = serde_json::to_vec(&serde_json::json!({ "recurring": request.recurring }))?;
  command(
    &format!("/api/team/licenses/{}/recurring", request.license_key),
    safefetch::SafeFetchMethod::Post,
    None,
    Some(body),
  )
}

pub(crate) fn update_license_seats_request(request: &LicenseSeatsRequest) -> AnyResult<CommandResponse> {
  let body = serde_json::to_vec(&serde_json::json!({ "seats": request.seats }))?;
  command(
    &format!("/api/team/licenses/{}/seats", request.license_key),
    safefetch::SafeFetchMethod::Post,
    None,
    Some(body),
  )
}

pub(crate) fn create_license_customer_portal_request(request: &LicenseKeyRequest) -> AnyResult<PortalResponse> {
  let validate_key = request.validate_key.clone().context("validateKey is required")?;
  let response = match affine_pro_request(
    &format!("/api/team/licenses/{}/create-customer-portal", request.license_key),
    safefetch::SafeFetchMethod::Post,
    Some(HashMap::from([("x-validate-key".to_string(), validate_key)])),
    None,
  ) {
    Ok(response) => response,
    Err(_) => {
      return Ok(PortalResponse {
        url: None,
        error: Some(internal_affine_pro_error()),
      });
    }
  };
  if let Some(error) = affine_pro_error(&response) {
    return Ok(PortalResponse {
      url: None,
      error: Some(error),
    });
  }
  let body: PortalPayload = match parse_body(&response) {
    Ok(body) => body,
    Err(_) => {
      return Ok(PortalResponse {
        url: None,
        error: Some(internal_affine_pro_error()),
      });
    }
  };
  if body.url.is_empty() {
    return Ok(PortalResponse {
      url: None,
      error: Some(internal_affine_pro_error()),
    });
  }
  Ok(PortalResponse {
    url: Some(body.url),
    error: None,
  })
}

fn license_info(
  path: &str,
  method: safefetch::SafeFetchMethod,
  headers: Option<HashMap<String, String>>,
  body: Option<Vec<u8>>,
) -> AnyResult<LicenseResponse> {
  let response = match affine_pro_request(path, method, headers, body) {
    Ok(response) => response,
    Err(_) => {
      return Ok(LicenseResponse {
        license: None,
        error: Some(internal_affine_pro_error()),
      });
    }
  };
  if let Some(error) = affine_pro_error(&response) {
    return Ok(LicenseResponse {
      license: None,
      error: Some(error),
    });
  }
  let license = match parse_license_info(&response) {
    Ok(license) => license,
    Err(error) if error.to_string() == "license_expired" => {
      return Ok(LicenseResponse {
        license: None,
        error: Some(license_expired_error()),
      });
    }
    Err(_) => {
      return Ok(LicenseResponse {
        license: None,
        error: Some(internal_affine_pro_error()),
      });
    }
  };
  Ok(LicenseResponse {
    license: Some(license),
    error: None,
  })
}

fn command(
  path: &str,
  method: safefetch::SafeFetchMethod,
  headers: Option<HashMap<String, String>>,
  body: Option<Vec<u8>>,
) -> AnyResult<CommandResponse> {
  let response = match affine_pro_request(path, method, headers, body) {
    Ok(response) => response,
    Err(_) => {
      return Ok(CommandResponse {
        error: Some(internal_affine_pro_error()),
      });
    }
  };
  Ok(CommandResponse {
    error: affine_pro_error(&response),
  })
}

fn affine_pro_request(
  path: &str,
  method: safefetch::SafeFetchMethod,
  headers: Option<HashMap<String, String>>,
  body: Option<Vec<u8>>,
) -> AnyResult<safefetch::SafeFetchResponse> {
  let url = Url::parse(AFFINE_PRO_ENDPOINT)
    .context("invalid affine pro endpoint")?
    .join(path)
    .context("invalid affine pro path")?;
  let mut headers = headers.unwrap_or_default();
  headers.insert("Content-Type".to_string(), "application/json".to_string());

  safefetch::safe_fetch(&safefetch::SafeFetchRequest {
    url: url.to_string(),
    method: Some(method),
    headers: Some(headers),
    body,
    timeout_ms: Some(AFFINE_PRO_REQUEST_TIMEOUT_MS),
    max_redirects: Some(3),
    max_bytes: Some(AFFINE_PRO_MAX_BYTES),
    allowed_headers: Some(vec![
      "authorization".to_string(),
      "content-type".to_string(),
      "x-validate-key".to_string(),
    ]),
    allowed_hosts: Some(vec![AFFINE_PRO_HOST.to_string()]),
    allow_http: Some(false),
    allow_private_target_origin: None,
    ech_config_list: Some(affine_pro_ech_config()?),
  })
}

fn parse_license_info(response: &safefetch::SafeFetchResponse) -> AnyResult<LicenseInfo> {
  let envelope: LicenseEnvelope = parse_body(response)?;
  if !envelope.claims.is_object() || envelope.signature.is_empty() {
    bail!("invalid license envelope");
  }
  Ok(LicenseInfo {
    recurring: response.headers.get("x-license-recurring").cloned().unwrap_or_default(),
    validate_key: response.headers.get("x-next-validate-key").cloned().unwrap_or_default(),
    envelope: response.body.clone().into(),
  })
}

fn affine_pro_error(response: &safefetch::SafeFetchResponse) -> Option<LicenseError> {
  if (200..300).contains(&response.status) {
    return None;
  }
  let body = String::from_utf8_lossy(&response.body).to_string();
  if serde_json::from_str::<serde_json::Value>(&body).is_err() {
    return Some(internal_affine_pro_error());
  }
  Some(LicenseError {
    status: response.status,
    body,
  })
}

fn internal_affine_pro_error() -> LicenseError {
  LicenseError {
    status: 500,
    body: serde_json::json!({
      "status": 500,
      "type": "internal_server_error",
      "name": "internal_server_error",
      "message": "Failed to contact with https://app.affine.pro",
      "data": null,
    })
    .to_string(),
  }
}

fn license_expired_error() -> LicenseError {
  LicenseError {
    status: 400,
    body: serde_json::json!({
      "status": 400,
      "type": "bad_request",
      "name": "license_expired",
      "message": "License has expired.",
      "data": null,
    })
    .to_string(),
  }
}

fn parse_body<T: DeserializeOwned>(response: &safefetch::SafeFetchResponse) -> AnyResult<T> {
  serde_json::from_slice(&response.body).context("invalid affine pro response")
}

fn affine_pro_ech_config() -> AnyResult<Vec<u8>> {
  let cache = AFFINE_PRO_ECH_CONFIG.get_or_init(|| Mutex::new(None));
  {
    let cached = cache.lock().map_err(|_| anyhow::anyhow!("ech cache poisoned"))?;
    if let Some(config) = cached.as_ref() {
      return Ok(config.clone());
    }
  }

  let config = safefetch::ech::cloudflare_https_ech_config_list(
    AFFINE_PRO_HOST,
    Duration::from_millis(ECH_DNS_QUERY_TIMEOUT_MS as u64),
  )?;
  let mut cached = cache.lock().map_err(|_| anyhow::anyhow!("ech cache poisoned"))?;
  *cached = Some(config.clone());
  Ok(config)
}

#[derive(serde::Deserialize)]
struct LicenseEnvelope {
  claims: serde_json::Value,
  signature: String,
}

#[derive(serde::Deserialize)]
struct PortalPayload {
  url: String,
}
