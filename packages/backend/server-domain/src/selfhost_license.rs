//! Self-hosted workspace license management backed by `server_types::license`
//! (`legacy-v0` / `v1` / `v2`), `public.installed_licenses`, `public.entitlements`,
//! and remote license lifecycle endpoints on `https://app.affine.pro`.

use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde_json::json;
use server_db::{ServerDb, WorkloadTier};
use server_spi::{BillingSpi, QuotaGate};
use server_types::DomainError;
use server_types::license::{
  Keyring, LicenseV2Error, PRO_KID, VerifiedAnyLicense, normalize_license, verify_any_license,
};
use sqlx::{Connection as _, Postgres, Row, Transaction};
use uuid::Uuid;

use crate::acl::load_workspace_docs_access_in;
use crate::events::{InvalidationHintV1, InvalidationPublisher};

const DEFAULT_AFFINE_PRO_ENDPOINT: &str = "https://app.affine.pro";
const LICENSE_HEALTH_SCAN_LOCK_KEY: &str = "affine:license-health-scan";
const LICENSE_HEALTH_SCAN_LIMIT: i64 = 100;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InstalledLicenseView {
  pub key: String,
  pub workspace_id: String,
  pub quantity: i32,
  pub recurring: String,
  pub variant: Option<String>,
  pub installed_at: DateTime<Utc>,
  pub validated_at: DateTime<Utc>,
  pub expired_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LicensePreviewView {
  pub id: String,
  pub workspace_id: String,
  pub plan: String,
  pub recurring: String,
  pub quantity: i32,
  pub issued_at: DateTime<Utc>,
  pub expires_at: DateTime<Utc>,
  pub end_at: DateTime<Utc>,
  pub entity: String,
  pub issuer: String,
  pub valid: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteLicensePayload {
  pub recurring: String,
  pub validate_key: String,
  pub envelope: Vec<u8>,
}

#[derive(Clone, Debug)]
pub enum RemoteHealthOutcome {
  Active(RemoteLicensePayload),
  Denied {
    status: &'static str,
    reason: String,
    error: DomainError,
  },
}

/// Remote license lifecycle API client (`https://app.affine.pro/api/team/v1/licenses/*`).
#[async_trait::async_trait]
pub trait SelfhostLicenseClient: Send + Sync + 'static {
  async fn activate(
    &self,
    license_key: &str,
    workspace_id: &str,
    operation_id: &str,
  ) -> Result<RemoteLicensePayload, DomainError>;

  async fn deactivate(&self, license_key: &str, validate_key: &str) -> Result<(), DomainError>;

  async fn health(
    &self,
    license_key: &str,
    validate_key: &str,
    workspace_id: &str,
  ) -> Result<RemoteHealthOutcome, DomainError>;

  async fn update_seats(&self, license_key: &str, validate_key: &str, seats: u32) -> Result<(), DomainError>;

  async fn create_customer_portal(&self, license_key: &str, validate_key: &str) -> Result<String, DomainError>;
}

/// Default `reqwest`-backed remote license client targeting `https://app.affine.pro`.
#[derive(Clone)]
pub struct ReqwestSelfhostLicenseClient {
  client: reqwest::Client,
  base_url: String,
}

impl Default for ReqwestSelfhostLicenseClient {
  fn default() -> Self {
    Self::new(DEFAULT_AFFINE_PRO_ENDPOINT)
  }
}

impl ReqwestSelfhostLicenseClient {
  pub fn new(base_url: impl Into<String>) -> Self {
    let client = reqwest::Client::builder()
      .timeout(Duration::from_secs(10))
      .build()
      .expect("build selfhost license reqwest client");
    Self {
      client,
      base_url: base_url.into().trim_end_matches('/').to_owned(),
    }
  }

  fn url(&self, path: &str) -> String {
    format!("{}{path}", self.base_url)
  }
}

#[async_trait::async_trait]
impl SelfhostLicenseClient for ReqwestSelfhostLicenseClient {
  async fn activate(
    &self,
    license_key: &str,
    workspace_id: &str,
    operation_id: &str,
  ) -> Result<RemoteLicensePayload, DomainError> {
    let resp = self
      .client
      .post(self.url(&format!("/api/team/v1/licenses/{license_key}/activate")))
      .header("content-type", "application/json")
      .body(
        serde_json::to_vec(&json!({
          "workspaceId": workspace_id,
          "operationId": operation_id,
        }))
        .map_err(|e| DomainError::Internal(format!("serialize activate license body: {e}")))?,
      )
      .send()
      .await
      .map_err(|e| DomainError::Unavailable(format!("activate remote license request failed: {e}")))?;
    parse_remote_license_response(resp).await
  }

  async fn deactivate(&self, license_key: &str, validate_key: &str) -> Result<(), DomainError> {
    let resp = self
      .client
      .post(self.url(&format!("/api/team/v1/licenses/{license_key}/deactivate")))
      .header("x-validate-key", validate_key)
      .send()
      .await
      .map_err(|e| DomainError::Unavailable(format!("deactivate remote license request failed: {e}")))?;
    if !resp.status().is_success() {
      let status = resp.status();
      let body = resp.text().await.unwrap_or_default();
      return Err(map_remote_status(status.as_u16(), &body));
    }
    Ok(())
  }

  async fn health(
    &self,
    license_key: &str,
    validate_key: &str,
    workspace_id: &str,
  ) -> Result<RemoteHealthOutcome, DomainError> {
    let resp = self
      .client
      .post(self.url(&format!("/api/team/v1/licenses/{license_key}/health")))
      .header("x-validate-key", validate_key)
      .header("content-type", "application/json")
      .body(
        serde_json::to_vec(&json!({ "workspaceId": workspace_id }))
          .map_err(|e| DomainError::Internal(format!("serialize license health body: {e}")))?,
      )
      .send()
      .await
      .map_err(|e| DomainError::Unavailable(format!("license health request failed: {e}")))?;
    if !resp.status().is_success() {
      let status = resp.status();
      let body = resp.text().await.unwrap_or_default();
      let error = map_remote_status(status.as_u16(), &body);
      if let Some((denial_status, denial_reason)) = parse_remote_denial(status.as_u16(), &body) {
        return Ok(RemoteHealthOutcome::Denied {
          status: denial_status,
          reason: denial_reason,
          error,
        });
      }
      return Err(error);
    }
    parse_remote_license_response(resp)
      .await
      .map(RemoteHealthOutcome::Active)
  }

  async fn update_seats(&self, license_key: &str, validate_key: &str, seats: u32) -> Result<(), DomainError> {
    let resp = self
      .client
      .post(self.url(&format!("/api/team/v1/licenses/{license_key}/seats")))
      .header("x-validate-key", validate_key)
      .header("content-type", "application/json")
      .body(
        serde_json::to_vec(&json!({ "seats": seats }))
          .map_err(|e| DomainError::Internal(format!("serialize license seats body: {e}")))?,
      )
      .send()
      .await
      .map_err(|e| DomainError::Unavailable(format!("license seats request failed: {e}")))?;
    if !resp.status().is_success() {
      let status = resp.status();
      let body = resp.text().await.unwrap_or_default();
      return Err(map_remote_status(status.as_u16(), &body));
    }
    Ok(())
  }

  async fn create_customer_portal(&self, license_key: &str, validate_key: &str) -> Result<String, DomainError> {
    let resp = self
      .client
      .post(self.url(&format!("/api/team/v1/licenses/{license_key}/create-customer-portal")))
      .header("x-validate-key", validate_key)
      .send()
      .await
      .map_err(|e| DomainError::Unavailable(format!("license customer portal request failed: {e}")))?;
    if !resp.status().is_success() {
      let status = resp.status();
      let body = resp.text().await.unwrap_or_default();
      return Err(map_remote_status(status.as_u16(), &body));
    }
    let bytes = resp
      .bytes()
      .await
      .map_err(|e| DomainError::Unavailable(format!("read customer portal body: {e}")))?;
    let val: serde_json::Value = serde_json::from_slice(&bytes)
      .map_err(|e| DomainError::Unavailable(format!("parse customer portal json: {e}")))?;
    val
      .get("url")
      .and_then(serde_json::Value::as_str)
      .filter(|s| !s.is_empty())
      .map(str::to_owned)
      .ok_or_else(|| DomainError::Unavailable("Invalid AFFiNE Pro portal response.".to_owned()))
  }
}

async fn parse_remote_license_response(resp: reqwest::Response) -> Result<RemoteLicensePayload, DomainError> {
  if !resp.status().is_success() {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    return Err(map_remote_status(status.as_u16(), &body));
  }
  let recurring = resp
    .headers()
    .get("x-license-recurring")
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|value| matches!(*value, "monthly" | "yearly" | "lifetime"))
    .map(str::to_owned)
    .ok_or_else(|| DomainError::Unavailable("Invalid AFFiNE Pro x-license-recurring header.".to_owned()))?;
  let validate_key = resp
    .headers()
    .get("x-next-validate-key")
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|value| Uuid::parse_str(value).is_ok())
    .map(str::to_owned)
    .ok_or_else(|| DomainError::Unavailable("Invalid AFFiNE Pro x-next-validate-key header.".to_owned()))?;
  let envelope = resp
    .bytes()
    .await
    .map_err(|e| DomainError::Unavailable(format!("read remote license body: {e}")))?
    .to_vec();
  Ok(RemoteLicensePayload {
    recurring,
    validate_key,
    envelope,
  })
}

fn parse_remote_denial(status: u16, body: &str) -> Option<(&'static str, String)> {
  if status >= 500 || matches!(status, 408 | 429) {
    return None;
  }
  let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
  let name = parsed.get("name").and_then(serde_json::Value::as_str)?;
  match name {
    "LICENSE_EXPIRED" => Some(("expired", "license_expired".to_owned())),
    "LICENSE_NOT_FOUND" => Some(("revoked", "license_not_found".to_owned())),
    "INVALID_LICENSE_TO_ACTIVATE" => {
      let data_reason = parsed.pointer("/data/reason").and_then(serde_json::Value::as_str)?;
      if matches!(
        data_reason,
        "invalid_validate_key" | "license_unbound" | "license_workspace_mismatch"
      ) {
        Some(("revoked", data_reason.to_owned()))
      } else {
        None
      }
    }
    _ => None,
  }
}

fn map_remote_status(status: u16, body: &str) -> DomainError {
  if status >= 500 || matches!(status, 408 | 429) {
    return DomainError::Unavailable(format!("Failed to contact remote license service (status {status})."));
  }
  if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
    let name = parsed.get("name").and_then(serde_json::Value::as_str).unwrap_or("");
    let data_reason = parsed
      .pointer("/data/reason")
      .and_then(serde_json::Value::as_str)
      .unwrap_or("");
    let message = parsed.get("message").and_then(serde_json::Value::as_str).unwrap_or("");
    match name {
      "LICENSE_EXPIRED" => return DomainError::Validation("license_expired".to_owned()),
      "LICENSE_NOT_FOUND" => return DomainError::NotFound("license_not_found".to_owned()),
      "INVALID_LICENSE_TO_ACTIVATE" => {
        let reason = if !data_reason.is_empty() { data_reason } else { message };
        let detail = if reason.is_empty() {
          "invalid_license_to_activate".to_owned()
        } else {
          format!("invalid_license_to_activate:{reason}")
        };
        return DomainError::Validation(detail);
      }
      "WORKSPACE_LICENSE_ALREADY_EXISTS" => {
        return DomainError::Forbidden("workspace_license_already_exists".to_owned());
      }
      _ if !data_reason.is_empty() => {
        if status == 403 {
          return DomainError::Forbidden(data_reason.to_owned());
        }
        return DomainError::Validation(format!("invalid_license_to_activate:{data_reason}"));
      }
      _ => {}
    }
  }
  DomainError::Unavailable(format!("Remote license service returned unexpected status {status}"))
}

#[derive(Clone)]
pub struct SelfhostLicenseService {
  db: ServerDb,
  quota_gate: Arc<dyn QuotaGate>,
  invalidation: Arc<dyn InvalidationPublisher>,
  keyring: Keyring,
  client: Arc<dyn SelfhostLicenseClient>,
  scan_cursor: Arc<std::sync::Mutex<String>>,
}

struct InstalledRow {
  key: String,
  workspace_id: String,
  validate_key: String,
  variant: Option<String>,
}

impl SelfhostLicenseService {
  pub fn new(db: ServerDb, quota_gate: Arc<dyn QuotaGate>, invalidation: Arc<dyn InvalidationPublisher>) -> Self {
    Self {
      db,
      quota_gate,
      invalidation,
      keyring: Keyring::new(),
      client: Arc::new(ReqwestSelfhostLicenseClient::default()),
      scan_cursor: Arc::new(std::sync::Mutex::new(String::new())),
    }
  }

  pub fn with_keyring(mut self, keyring: Keyring) -> Self {
    self.keyring = keyring;
    self
  }

  pub fn with_client(mut self, client: Arc<dyn SelfhostLicenseClient>) -> Self {
    self.client = client;
    self
  }

  pub async fn get_license(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
  ) -> Result<Option<InstalledLicenseView>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_license: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("get_license clock: {e}")))?;
    self
      .assert_payment_manage_in(tx.tx_mut(), actor_user_id, workspace_id, now)
      .await?;

    let row = sqlx::query(
      r#"SELECT key, workspace_id, quantity, recurring, variant, installed_at, validated_at, expired_at
         FROM installed_licenses
         WHERE workspace_id = $1
         LIMIT 1"#,
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load installed license: {e}")))?;
    let _ = tx.rollback().await;

    Ok(row.map(installed_view_from_row))
  }

  /// Activates a remote self-hosted license key via `SelfhostLicenseClient`
  /// (`/api/team/v1/licenses/{key}/activate` or `/health` when refreshing the
  /// same recurring key). Enforces cross-workspace uniqueness, generation CAS,
  /// and strict `verified.license_id() == license_key` identity matching.
  pub async fn activate_license(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    license_key_raw: &str,
  ) -> Result<InstalledLicenseView, DomainError> {
    let license_key = license_key_raw.trim();
    if license_key.is_empty() || license_key.starts_with('{') || license_key.len() > 256 {
      return Err(DomainError::Validation(
        "invalid_license_to_activate:license key is required".to_owned(),
      ));
    }

    let existing = {
      let mut tx = self
        .db
        .begin_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Unavailable(format!("begin activate_license check: {e}")))?;
      let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
        .fetch_one(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("activate_license clock: {e}")))?;
      self
        .assert_payment_manage_in(tx.tx_mut(), actor_user_id, workspace_id, now)
        .await?;
      let other_ws: Option<String> =
        sqlx::query_scalar("SELECT workspace_id FROM installed_licenses WHERE key = $1 AND workspace_id <> $2 LIMIT 1")
          .bind(license_key)
          .bind(workspace_id)
          .fetch_optional(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("check cross-workspace license key: {e}")))?;
      if other_ws.is_some() {
        let _ = tx.rollback().await;
        return Err(DomainError::Forbidden("license_already_activated".to_owned()));
      }
      let row = load_installed_row_in(tx.tx_mut(), workspace_id).await?;
      let _ = tx.rollback().await;
      row
    };

    if let Some(installed) = existing {
      if installed.key != license_key || is_onetime_variant(installed.variant.as_deref()) {
        return Err(DomainError::Forbidden("workspace_license_already_exists".to_owned()));
      }
      let remote = match self
        .client
        .health(&installed.key, &installed.validate_key, workspace_id)
        .await?
      {
        RemoteHealthOutcome::Active(payload) => payload,
        RemoteHealthOutcome::Denied { error, .. } => return Err(error),
      };
      if remote.validate_key != installed.validate_key {
        return Err(DomainError::Conflict("license_protocol_generation_changed".to_owned()));
      }
      let view = self
        .refresh_license_in_tx(Some(actor_user_id), &installed, &remote)
        .await?
        .ok_or_else(|| DomainError::Conflict("license_generation_changed".to_owned()))?;
      return Ok(view);
    }

    let operation_id = Uuid::new_v4().to_string();
    let remote = self.client.activate(license_key, workspace_id, &operation_id).await?;
    let recurring = normalize_recurring(Some(&remote.recurring));

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin activate_license persist: {e}")))?;
    lock_workspace_license_in_tx(tx.tx_mut(), workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("activate_license persist clock: {e}")))?;
    self
      .assert_payment_manage_in(tx.tx_mut(), actor_user_id, workspace_id, now)
      .await?;

    let normalized = normalize_license(&remote.envelope).map_err(map_license_error)?;
    let verified = verify_installable_license(normalized.as_ref(), &self.keyring, workspace_id, now)?;
    if verified.license_id() != license_key {
      let _ = tx.rollback().await;
      return Err(DomainError::Validation(
        "invalid_license_to_activate:license_identity_changed".to_owned(),
      ));
    }
    if load_installed_row_in(tx.tx_mut(), workspace_id).await?.is_some() {
      let _ = tx.rollback().await;
      return Err(DomainError::Forbidden("workspace_license_already_exists".to_owned()));
    }

    let inserted = sqlx::query(
      r#"INSERT INTO installed_licenses
           (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $5, $7, $8)
         ON CONFLICT (workspace_id) DO NOTHING
         RETURNING key, workspace_id, quantity, recurring, variant, installed_at, validated_at, expired_at"#,
    )
    .bind(license_key)
    .bind(workspace_id)
    .bind(verified.seat_quantity())
    .bind(recurring)
    .bind(now)
    .bind(&remote.validate_key)
    .bind(verified.expires_at())
    .bind(&remote.envelope)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert activated license: {e}")))?;

    let Some(row) = inserted else {
      let _ = tx.rollback().await;
      return Err(DomainError::Forbidden("workspace_license_already_exists".to_owned()));
    };

    upsert_entitlement_in_tx(
      tx.tx_mut(),
      &EntitlementUpsertParams {
        workspace_id,
        validate_key: &remote.validate_key,
        recurring,
        variant: None,
        normalized_payload: normalized.as_ref(),
      },
      &verified,
      now,
    )
    .await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit activate_license: {e}")))?;

    self.publish_license_invalidation(workspace_id).await;
    Ok(installed_view_from_row(row))
  }

  /// Installs an offline commercial workspace license (`legacy-v0` / AES `.license`,
  /// `v1`, or `v2`). Rejects `instance_default` / non-commercial / invalid / expired
  /// envelopes BEFORE touching `installed_licenses` or `entitlements`.
  pub async fn install_license(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    payload: &[u8],
  ) -> Result<InstalledLicenseView, DomainError> {
    // Pre-check authorization outside the write lock so unauthorized callers never lock workspace rows.
    self.assert_payment_manage(actor_user_id, workspace_id).await?;
    let validate_key = Uuid::new_v4().to_string();

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin install_license: {e}")))?;
    lock_workspace_license_in_tx(tx.tx_mut(), workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("install_license clock: {e}")))?;
    self
      .assert_payment_manage_in(tx.tx_mut(), actor_user_id, workspace_id, now)
      .await?;

    let normalized = normalize_license(payload).map_err(map_license_error)?;
    let verified = verify_installable_license(normalized.as_ref(), &self.keyring, workspace_id, now)?;
    let recurring = normalize_recurring(verified.recurring());
    let key = verified.license_id();

    let row = sqlx::query(
      r#"INSERT INTO installed_licenses
           (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
         VALUES ($1, $2, $3, $4, 'onetime', $5, $6, $5, $7, $8)
         ON CONFLICT (workspace_id) DO UPDATE SET
           key = EXCLUDED.key,
           quantity = EXCLUDED.quantity,
           recurring = EXCLUDED.recurring,
           variant = EXCLUDED.variant,
           installed_at = EXCLUDED.installed_at,
           validate_key = EXCLUDED.validate_key,
           validated_at = EXCLUDED.validated_at,
           expired_at = EXCLUDED.expired_at,
           license = EXCLUDED.license
         RETURNING key, workspace_id, quantity, recurring, variant, installed_at, validated_at, expired_at"#,
    )
    .bind(key)
    .bind(workspace_id)
    .bind(verified.seat_quantity())
    .bind(recurring)
    .bind(now)
    .bind(&validate_key)
    .bind(verified.expires_at())
    .bind(payload)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("upsert installed offline license: {e}")))?;

    upsert_entitlement_in_tx(
      tx.tx_mut(),
      &EntitlementUpsertParams {
        workspace_id,
        validate_key: &validate_key,
        recurring,
        variant: Some("onetime"),
        normalized_payload: normalized.as_ref(),
      },
      &verified,
      now,
    )
    .await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit install_license: {e}")))?;

    self.publish_license_invalidation(workspace_id).await;
    Ok(installed_view_from_row(row))
  }

  /// Deactivates the workspace's installed license using generation CAS
  /// `(workspace_id, key, validate_key)` so a concurrent license replacement
  /// is never revoked.
  pub async fn deactivate_license(&self, actor_user_id: &str, workspace_id: &str) -> Result<bool, DomainError> {
    let installed = {
      let mut tx = self
        .db
        .begin_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Unavailable(format!("begin deactivate_license check: {e}")))?;
      let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
        .fetch_one(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("deactivate_license check clock: {e}")))?;
      self
        .assert_payment_manage_in(tx.tx_mut(), actor_user_id, workspace_id, now)
        .await?;
      let row = load_installed_row_in(tx.tx_mut(), workspace_id).await?;
      let _ = tx.rollback().await;
      row.ok_or_else(|| DomainError::NotFound("license_not_found".to_owned()))?
    };

    if !is_onetime_variant(installed.variant.as_deref()) {
      self.client.deactivate(&installed.key, &installed.validate_key).await?;
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin deactivate_license: {e}")))?;
    lock_workspace_license_in_tx(tx.tx_mut(), workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("deactivate_license clock: {e}")))?;
    self
      .assert_payment_manage_in(tx.tx_mut(), actor_user_id, workspace_id, now)
      .await?;
    let deleted =
      sqlx::query("DELETE FROM installed_licenses WHERE workspace_id = $1 AND key = $2 AND validate_key = $3")
        .bind(workspace_id)
        .bind(&installed.key)
        .bind(&installed.validate_key)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("delete installed license: {e}")))?
        .rows_affected();
    if deleted == 0 {
      let _ = tx.rollback().await;
      return Err(DomainError::NotFound("license_not_found".to_owned()));
    }
    let revoked = revoke_workspace_entitlements_in_tx(tx.tx_mut(), workspace_id, now).await?;
    if revoked > 0 {
      downgrade_workspace_after_license_loss_in_tx(tx.tx_mut(), workspace_id, now).await?;
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit deactivate_license: {e}")))?;

    self.publish_license_invalidation(workspace_id).await;
    Ok(true)
  }

  /// Creates a Stripe/billing customer portal URL for a workspace with an
  /// installed self-hosted license.
  pub async fn create_customer_portal(&self, workspace_id: &str) -> Result<String, DomainError> {
    let installed = {
      let mut tx = self
        .db
        .begin_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Unavailable(format!("begin create_customer_portal: {e}")))?;
      let row = load_installed_row_in(tx.tx_mut(), workspace_id).await?;
      let _ = tx.rollback().await;
      row.ok_or_else(|| DomainError::NotFound("license_not_found".to_owned()))?
    };
    self
      .client
      .create_customer_portal(&installed.key, &installed.validate_key)
      .await
  }

  /// Syncs active + chargeable invitation seat count to the remote license
  /// service for recurring (non-`onetime`) self-hosted licenses.
  pub async fn sync_workspace_seats(&self, workspace_id: &str) -> Result<(), DomainError> {
    let (installed, seats) = {
      let mut tx = self
        .db
        .begin_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Unavailable(format!("begin sync_workspace_seats: {e}")))?;
      let Some(row) = load_installed_row_in(tx.tx_mut(), workspace_id).await? else {
        let _ = tx.rollback().await;
        return Ok(());
      };
      if is_onetime_variant(row.variant.as_deref()) {
        let _ = tx.rollback().await;
        return Ok(());
      }
      let seats: i64 = sqlx::query_scalar(
        r#"SELECT
             (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1 AND state = 'active')
             + (SELECT COUNT(*) FROM workspace_invitations WHERE workspace_id = $1 AND status = ANY($2))"#,
      )
      .bind(workspace_id)
      .bind(crate::workspaces::CHARGEABLE_INVITATION_STATUSES.as_slice())
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("count workspace seats for license sync: {e}")))?;
      let _ = tx.rollback().await;
      (row, seats)
    };

    let seats_u32 = u32::try_from(seats.max(0)).unwrap_or(u32::MAX);
    self
      .client
      .update_seats(&installed.key, &installed.validate_key, seats_u32)
      .await?;

    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire seat sync schedule: {e}")))?;
    sqlx::query(
      "UPDATE installed_licenses
       SET validated_at = LEAST(validated_at, clock_timestamp() - interval '1 hour')
       WHERE workspace_id = $1 AND key = $2 AND validate_key = $3",
    )
    .bind(&installed.workspace_id)
    .bind(&installed.key)
    .bind(&installed.validate_key)
    .execute(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("schedule pending license seat confirmation: {e}")))?;
    Ok(())
  }

  /// Periodic health-check renewal for recurring self-hosted licenses whose
  /// `validated_at` is at least 1 hour old.
  ///
  /// Uses a dedicated off-pool PostgreSQL session advisory lock
  /// (`affine:license-health-scan`) and releases all `PgPool` connections
  /// BEFORE issuing external HTTP requests.
  pub async fn check_licenses(&self) -> Result<usize, DomainError> {
    let mut lock_conn = self
      .db
      .dedicated_session_conn()
      .await
      .map_err(|e| DomainError::Unavailable(format!("open dedicated license scan connection: {e}")))?;
    let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock(hashtextextended($1, 0))")
      .bind(LICENSE_HEALTH_SCAN_LOCK_KEY)
      .fetch_one(&mut lock_conn)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire license health scan lock: {e}")))?;
    if !acquired {
      let _ = lock_conn.close().await;
      return Ok(0);
    }

    let scan_result = self.run_license_health_scan().await;

    let _ = sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1, 0))")
      .bind(LICENSE_HEALTH_SCAN_LOCK_KEY)
      .execute(&mut lock_conn)
      .await;
    let _ = lock_conn.close().await;
    scan_result
  }

  async fn run_license_health_scan(&self) -> Result<usize, DomainError> {
    let cursor = self.scan_cursor.lock().map(|g| g.clone()).unwrap_or_default();

    let candidates: Vec<InstalledRow> = {
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::LongQuery)
        .await
        .map_err(|e| DomainError::Unavailable(format!("acquire license health scan read: {e}")))?;
      let mut rows = sqlx::query(
        r#"SELECT key, workspace_id, validate_key, variant
           FROM installed_licenses
           WHERE workspace_id > $1
             AND (
               validated_at <= clock_timestamp() - interval '1 hour'
               OR (COALESCE(lower(variant), '') <> 'onetime' AND license IS NULL)
             )
           ORDER BY workspace_id ASC
           LIMIT $2"#,
      )
      .bind(&cursor)
      .bind(LICENSE_HEALTH_SCAN_LIMIT)
      .fetch_all(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("list stale licenses for health check: {e}")))?;

      let remaining = LICENSE_HEALTH_SCAN_LIMIT - (rows.len() as i64);
      if remaining > 0 && !cursor.is_empty() {
        let wrapped = sqlx::query(
          r#"SELECT key, workspace_id, validate_key, variant
             FROM installed_licenses
             WHERE workspace_id <= $1
               AND (
                 validated_at <= clock_timestamp() - interval '1 hour'
                 OR (COALESCE(lower(variant), '') <> 'onetime' AND license IS NULL)
               )
             ORDER BY workspace_id ASC
             LIMIT $2"#,
        )
        .bind(&cursor)
        .bind(remaining)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("list wrapped stale licenses for health check: {e}")))?;
        rows.extend(wrapped);
      }
      drop(conn);
      rows
        .into_iter()
        .map(|r| InstalledRow {
          key: r.get("key"),
          workspace_id: r.get("workspace_id"),
          validate_key: r.get("validate_key"),
          variant: r.get("variant"),
        })
        .collect()
    };

    if let Ok(mut guard) = self.scan_cursor.lock() {
      *guard = candidates
        .last()
        .map(|row| row.workspace_id.clone())
        .unwrap_or_default();
    }

    let mut refreshed = 0usize;
    for row in candidates {
      if is_onetime_variant(row.variant.as_deref()) {
        match self.check_offline_license(&row).await {
          Ok(true) => {
            refreshed += 1;
          }
          Ok(false) => {}
          Err(err) => {
            tracing::warn!(
              workspace_id = %row.workspace_id,
              key = %row.key,
              error = %err,
              "offline onetime license check failed"
            );
          }
        }
        continue;
      }
      match self.client.health(&row.key, &row.validate_key, &row.workspace_id).await {
        Ok(RemoteHealthOutcome::Active(remote)) => {
          if remote.validate_key != row.validate_key {
            tracing::warn!(
              workspace_id = %row.workspace_id,
              key = %row.key,
              "license health check returned mismatched validate_key generation; skipping"
            );
            continue;
          }
          match self.refresh_license_in_tx(None, &row, &remote).await {
            Ok(Some(_)) => {
              refreshed += 1;
            }
            Ok(None) => {}
            Err(err) => {
              tracing::warn!(
                workspace_id = %row.workspace_id,
                key = %row.key,
                error = %err,
                "failed to persist refreshed license"
              );
            }
          }
        }
        Ok(RemoteHealthOutcome::Denied { status, reason, .. }) => {
          if let Err(denial_err) = self.record_license_denial(&row, status, &reason).await {
            tracing::warn!(
              workspace_id = %row.workspace_id,
              key = %row.key,
              error = %denial_err,
              "failed to record remote license denial"
            );
          }
        }
        Err(err) => {
          tracing::warn!(
            workspace_id = %row.workspace_id,
            key = %row.key,
            error = %err,
            "license health check failed; will retry on next tick"
          );
        }
      }
    }

    Ok(refreshed)
  }

  async fn check_offline_license(&self, row: &InstalledRow) -> Result<bool, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin offline license check tx: {e}")))?;
    lock_workspace_license_in_tx(tx.tx_mut(), &row.workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("offline license check clock: {e}")))?;

    let installed_license: Option<Option<Vec<u8>>> = sqlx::query_scalar(
      r#"SELECT license
         FROM installed_licenses
         WHERE workspace_id = $1
           AND key = $2
           AND validate_key = $3
           AND COALESCE(lower(variant), '') = 'onetime'
         FOR UPDATE"#,
    )
    .bind(&row.workspace_id)
    .bind(&row.key)
    .bind(&row.validate_key)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock offline license row: {e}")))?;
    let Some(installed_payload) = installed_license else {
      let _ = tx.rollback().await;
      return Ok(false);
    };

    type SubjectEntitlementRow = (String, String, String, String, Option<Vec<u8>>);
    let subject_entitlement: Option<SubjectEntitlementRow> = sqlx::query_as(
      r#"SELECT id, target_type, target_id, status, signed_payload
         FROM entitlements
         WHERE source = 'selfhost_license'
           AND subject_id = $1
         ORDER BY updated_at DESC, id DESC
         LIMIT 1"#,
    )
    .bind(&row.key)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load offline license entitlement by subject: {e}")))?;

    if let Some((_, ref target_type, ref target_id, _, _)) = subject_entitlement
      && (target_type != "workspace" || target_id != &row.workspace_id)
    {
      let _ = tx.rollback().await;
      return Ok(false);
    }

    let has_other_active_subject: bool = sqlx::query_scalar(
      r#"SELECT EXISTS(
           SELECT 1 FROM entitlements
           WHERE source = 'selfhost_license'
             AND target_type = 'workspace'
             AND target_id = $1
             AND subject_id IS DISTINCT FROM $2
             AND status IN ('active', 'grace')
         )"#,
    )
    .bind(&row.workspace_id)
    .bind(&row.key)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("check conflicting active selfhost entitlement: {e}")))?;
    if has_other_active_subject {
      let _ = tx.rollback().await;
      return Ok(false);
    }

    let existing_entitlement = subject_entitlement.map(|(id, _, _, status, payload)| (id, status, payload));

    if let Some((_, ref status, _)) = existing_entitlement
      && status == "revoked"
    {
      sqlx::query(
        "UPDATE installed_licenses SET validated_at = $4 WHERE workspace_id = $1 AND key = $2 AND validate_key = $3",
      )
      .bind(&row.workspace_id)
      .bind(&row.key)
      .bind(&row.validate_key)
      .bind(now)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("touch revoked offline license validated_at: {e}")))?;
      tx.commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit revoked offline license check: {e}")))?;
      return Ok(false);
    }

    let raw_payload = existing_entitlement
      .as_ref()
      .and_then(|(_, _, p)| p.clone())
      .or(installed_payload);

    let verification = match raw_payload.as_deref() {
      Some(bytes) => normalize_license(bytes).and_then(|norm| {
        verify_any_license(norm.as_ref(), &self.keyring, Some(&row.workspace_id), now)
          .map(|verified| (norm.into_owned(), verified))
      }),
      None => Err(LicenseV2Error::InvalidJson(
        "missing offline license payload".to_owned(),
      )),
    };

    match verification {
      Ok((normalized, verified))
        if verified.is_workspace_commercial()
          && verified.workspace_id() == Some(row.workspace_id.as_str())
          && verified.license_id() == row.key =>
      {
        sqlx::query(
          "UPDATE installed_licenses
           SET validated_at = $4,
               quantity = $5,
               recurring = $6,
               expired_at = COALESCE($7, expired_at)
           WHERE workspace_id = $1 AND key = $2 AND validate_key = $3",
        )
        .bind(&row.workspace_id)
        .bind(&row.key)
        .bind(&row.validate_key)
        .bind(now)
        .bind(verified.seat_quantity())
        .bind(normalize_recurring(verified.recurring()))
        .bind(verified.expires_at())
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("update offline license validated_at: {e}")))?;

        let needs_invalidation = if let Some((ent_id, prev_status, prev_payload)) = existing_entitlement {
          sqlx::query(
            "UPDATE entitlements
             SET status = 'active',
                 plan = $3,
                 quantity = $4,
                 signed_payload = $5,
                 expires_at = COALESCE($6, expires_at),
                 grace_until = NULL,
                 metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('errorCode', NULL, 'errorMessage', NULL),
                 validated_at = $2,
                 updated_at = $2
             WHERE id = $1",
          )
          .bind(&ent_id)
          .bind(now)
          .bind(verified.entitlement_plan_name())
          .bind(verified.seat_quantity())
          .bind(&normalized)
          .bind(verified.expires_at())
          .execute(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("repair active offline entitlement: {e}")))?;
          prev_payload.is_none() || prev_status != "active"
        } else {
          let recurring = normalize_recurring(verified.recurring());
          let metadata = json!({
            "recurring": recurring,
            "validateKey": row.validate_key,
            "variant": "onetime",
            "errorCode": null,
            "errorMessage": null,
          });
          sqlx::query(
            r#"INSERT INTO entitlements
                 (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload,
                  metadata, starts_at, expires_at, grace_until, validated_at, updated_at)
               VALUES ($1, 'workspace', $2, 'selfhost_license', $3, $4, 'active', $5, $6, $7, NULL, $8, NULL, $9, $9)"#,
          )
          .bind(Uuid::new_v4().to_string())
          .bind(&row.workspace_id)
          .bind(verified.license_id())
          .bind(verified.entitlement_plan_name())
          .bind(verified.seat_quantity())
          .bind(&normalized)
          .bind(metadata)
          .bind(verified.expires_at())
          .bind(now)
          .execute(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("insert missing offline entitlement: {e}")))?;
          true
        };
        tx.commit()
          .await
          .map_err(|e| DomainError::Internal(format!("commit valid offline license check: {e}")))?;
        if needs_invalidation {
          self.publish_license_invalidation(&row.workspace_id).await;
        }
        Ok(true)
      }
      Err(LicenseV2Error::UnknownKeyId(ref kid)) if kid == PRO_KID => {
        let _ = tx.rollback().await;
        Ok(false)
      }
      Err(LicenseV2Error::InvalidPublicKey { .. }) => {
        let _ = tx.rollback().await;
        Ok(false)
      }
      other => {
        let (new_status, err_code) = match other {
          Err(LicenseV2Error::Expired { .. }) => ("expired", "license_expired"),
          _ => ("needs_reupload", "invalid_license_to_activate"),
        };
        sqlx::query(
          "UPDATE installed_licenses SET validated_at = $4 WHERE workspace_id = $1 AND key = $2 AND validate_key = $3",
        )
        .bind(&row.workspace_id)
        .bind(&row.key)
        .bind(&row.validate_key)
        .bind(now)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("touch expired offline license validated_at: {e}")))?;
        let mut transitioned_from_commercial = false;
        if let Some((ent_id, prev_status, _)) = existing_entitlement {
          if matches!(prev_status.as_str(), "active" | "grace") {
            transitioned_from_commercial = true;
          }
          sqlx::query(
            "UPDATE entitlements
             SET status = $2,
                 metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('errorCode', $3::text, 'errorMessage', $3::text),
                 validated_at = $4,
                 updated_at = $4
             WHERE id = $1",
          )
          .bind(&ent_id)
          .bind(new_status)
          .bind(err_code)
          .bind(now)
          .execute(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("mark offline entitlement {new_status}: {e}")))?;
        }
        if transitioned_from_commercial {
          downgrade_workspace_after_license_loss_in_tx(tx.tx_mut(), &row.workspace_id, now).await?;
        }
        tx.commit()
          .await
          .map_err(|e| DomainError::Internal(format!("commit offline license {new_status}: {e}")))?;
        self.publish_license_invalidation(&row.workspace_id).await;
        Ok(true)
      }
    }
  }

  async fn refresh_license_in_tx(
    &self,
    actor_user_id: Option<&str>,
    row: &InstalledRow,
    remote: &RemoteLicensePayload,
  ) -> Result<Option<InstalledLicenseView>, DomainError> {
    let recurring = normalize_recurring(Some(&remote.recurring));

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin license refresh tx: {e}")))?;
    lock_workspace_license_in_tx(tx.tx_mut(), &row.workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("license refresh clock: {e}")))?;
    if let Some(actor) = actor_user_id {
      self
        .assert_payment_manage_in(tx.tx_mut(), actor, &row.workspace_id, now)
        .await?;
    }

    let normalized = normalize_license(&remote.envelope).map_err(map_license_error)?;
    let verified = verify_installable_license(normalized.as_ref(), &self.keyring, &row.workspace_id, now)?;
    if verified.license_id() != row.key {
      let _ = tx.rollback().await;
      return Err(DomainError::Validation(
        "invalid_license_to_activate:license_identity_changed".to_owned(),
      ));
    }

    let conflicting_subject: Option<String> = sqlx::query_scalar(
      r#"SELECT subject_id FROM entitlements
         WHERE source = 'selfhost_license'
           AND target_type = 'workspace'
           AND target_id = $1
           AND status IN ('active', 'grace')
           AND subject_id IS NOT NULL
           AND subject_id <> $2
         LIMIT 1"#,
    )
    .bind(&row.workspace_id)
    .bind(&row.key)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("verify refreshed license active subject: {e}")))?;
    if conflicting_subject.is_some() {
      let _ = tx.rollback().await;
      return Ok(None);
    }

    let explicitly_revoked: bool = sqlx::query_scalar(
      r#"SELECT EXISTS(
           SELECT 1 FROM entitlements
           WHERE source = 'selfhost_license'
             AND subject_id = $1
             AND target_type = 'workspace'
             AND target_id = $2
             AND status = 'revoked'
         )"#,
    )
    .bind(&row.key)
    .bind(&row.workspace_id)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("check explicit license revocation: {e}")))?;
    if explicitly_revoked {
      let _ = tx.rollback().await;
      return Ok(None);
    }

    let updated = sqlx::query(
      r#"UPDATE installed_licenses
         SET quantity = $4,
             recurring = $5,
             validated_at = $6,
             expired_at = $7,
             license = $8
         WHERE workspace_id = $1
           AND key = $2
           AND validate_key = $3
           AND COALESCE(lower(variant), '') <> 'onetime'
         RETURNING key, workspace_id, quantity, recurring, variant, installed_at, validated_at, expired_at"#,
    )
    .bind(&row.workspace_id)
    .bind(&row.key)
    .bind(&row.validate_key)
    .bind(verified.seat_quantity())
    .bind(recurring)
    .bind(now)
    .bind(verified.expires_at())
    .bind(&remote.envelope)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("cas update refreshed license: {e}")))?;

    let Some(updated_row) = updated else {
      let _ = tx.rollback().await;
      return Ok(None);
    };

    upsert_entitlement_in_tx(
      tx.tx_mut(),
      &EntitlementUpsertParams {
        workspace_id: &row.workspace_id,
        validate_key: &row.validate_key,
        recurring,
        variant: None,
        normalized_payload: normalized.as_ref(),
      },
      &verified,
      now,
    )
    .await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit refreshed license: {e}")))?;

    self.publish_license_invalidation(&row.workspace_id).await;
    Ok(Some(installed_view_from_row(updated_row)))
  }

  async fn record_license_denial(
    &self,
    row: &InstalledRow,
    status: &'static str,
    reason: &str,
  ) -> Result<bool, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin license denial tx: {e}")))?;
    lock_workspace_license_in_tx(tx.tx_mut(), &row.workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("license denial clock: {e}")))?;
    let matches_gen: bool = sqlx::query_scalar(
      r#"SELECT EXISTS(
           SELECT 1 FROM installed_licenses
           WHERE workspace_id = $1
             AND key = $2
             AND validate_key = $3
             AND COALESCE(lower(variant), '') <> 'onetime'
         )"#,
    )
    .bind(&row.workspace_id)
    .bind(&row.key)
    .bind(&row.validate_key)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("verify license denial generation: {e}")))?;
    if !matches_gen {
      let _ = tx.rollback().await;
      return Ok(false);
    }

    sqlx::query(
      "UPDATE installed_licenses SET validated_at = $4 WHERE workspace_id = $1 AND key = $2 AND validate_key = $3",
    )
    .bind(&row.workspace_id)
    .bind(&row.key)
    .bind(&row.validate_key)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("touch denied license validated_at: {e}")))?;

    let had_active_or_grace: bool = sqlx::query_scalar(
      r#"SELECT EXISTS(
           SELECT 1 FROM entitlements
           WHERE source = 'selfhost_license'
             AND target_type = 'workspace'
             AND target_id = $1
             AND subject_id = $2
             AND status IN ('active', 'grace')
         )"#,
    )
    .bind(&row.workspace_id)
    .bind(&row.key)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("check pre-denial license status: {e}")))?;

    let before_grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), &row.workspace_id, now)
      .await?;

    let updated = sqlx::query(
      r#"UPDATE entitlements
         SET status = $3,
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('errorCode', $4::text, 'errorMessage', $4::text),
             validated_at = $5,
             updated_at = $5
         WHERE source = 'selfhost_license'
           AND target_type = 'workspace'
           AND target_id = $1
           AND subject_id = $2
           AND status <> 'revoked'"#,
    )
    .bind(&row.workspace_id)
    .bind(&row.key)
    .bind(status)
    .bind(reason)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("update denied license entitlement: {e}")))?
    .rows_affected();

    let after_grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), &row.workspace_id, now)
      .await?;

    let downgraded = updated > 0
      && ((had_active_or_grace && !matches!(status, "active" | "grace"))
        || before_grant.tier != after_grant.tier
        || before_grant.limits.seat_limit > after_grant.limits.seat_limit);

    if downgraded {
      downgrade_workspace_after_license_loss_in_tx(tx.tx_mut(), &row.workspace_id, now).await?;
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit license denial: {e}")))?;
    if downgraded {
      self.publish_license_invalidation(&row.workspace_id).await;
      Ok(true)
    } else {
      Ok(false)
    }
  }

  /// Startup reconciliation for all installed offline (`variant = 'onetime'`)
  /// self-hosted licenses: verifies signatures, repairs missing entitlements,
  /// and downgrades expired or invalid workspaces.
  pub async fn admit_offline_licenses(&self) -> Result<usize, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire admit_offline_licenses: {e}")))?;
    let rows = sqlx::query(
      r#"SELECT workspace_id, key, validate_key, variant
         FROM installed_licenses
         WHERE COALESCE(lower(variant), '') = 'onetime'
         ORDER BY workspace_id ASC"#,
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("list offline licenses for startup admission: {e}")))?;
    drop(conn);

    let mut processed = 0usize;
    for r in rows {
      let row = InstalledRow {
        workspace_id: r.get("workspace_id"),
        key: r.get("key"),
        validate_key: r.get("validate_key"),
        variant: r.get("variant"),
      };
      if self.check_offline_license(&row).await? {
        processed += 1;
      }
    }
    Ok(processed)
  }

  pub fn preview_license(&self, payload: &[u8]) -> Result<LicensePreviewView, DomainError> {
    let normalized = normalize_license(payload).map_err(map_license_error)?;
    let parsed: serde_json::Value = serde_json::from_slice(normalized.as_ref())
      .map_err(|_| DomainError::Validation("invalid_license_to_activate:invalid JSON".to_owned()))?;
    let expected_ws: Option<String> = parsed
      .pointer("/claims/scope/workspaceId")
      .and_then(serde_json::Value::as_str)
      .or_else(|| {
        parsed
          .pointer("/claims/workspaceId")
          .and_then(serde_json::Value::as_str)
      })
      .map(str::to_owned)
      .or_else(|| {
        if parsed.pointer("/signatureVersion").and_then(serde_json::Value::as_str) == Some("legacy-v0") {
          let inner_raw = parsed.pointer("/payload").and_then(serde_json::Value::as_str)?;
          let inner: serde_json::Value = serde_json::from_str(inner_raw).ok()?;
          inner
            .pointer("/data/workspaceId")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned)
        } else {
          None
        }
      });
    let verified =
      verify_any_license(normalized.as_ref(), &self.keyring, expected_ws.as_deref(), Utc::now()).map_err(|err| {
        match err {
          LicenseV2Error::UnknownKeyId(ref kid) if kid == PRO_KID => {
            DomainError::Internal("License public key is not loaded. Please contact with Affine support.".to_owned())
          }
          LicenseV2Error::InvalidPublicKey { .. } => {
            DomainError::Internal("License public key is not loaded. Please contact with Affine support.".to_owned())
          }
          other => map_license_error(other),
        }
      })?;
    if !verified.is_workspace_commercial() || verified.workspace_id().is_none() {
      return Err(DomainError::Validation(
        "invalid_license_to_activate:Commercial workspace license required.".to_owned(),
      ));
    }
    Ok(preview_from_verified(&verified))
  }

  pub async fn assert_payment_manage(&self, actor_user_id: &str, workspace_id: &str) -> Result<(), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin assert_payment_manage: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("assert_payment_manage clock: {e}")))?;
    self
      .assert_payment_manage_in(tx.tx_mut(), actor_user_id, workspace_id, now)
      .await?;
    let _ = tx.rollback().await;
    Ok(())
  }

  async fn assert_payment_manage_in(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    actor_user_id: &str,
    workspace_id: &str,
    now: DateTime<Utc>,
  ) -> Result<(), DomainError> {
    let access = load_workspace_docs_access_in(
      tx,
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      &[],
      now,
    )
    .await?;
    if !access.workspace_permissions.payment_manage {
      return Err(DomainError::Forbidden("Workspace.Payment.Manage denied".to_owned()));
    }
    Ok(())
  }

  async fn publish_license_invalidation(&self, workspace_id: &str) {
    for hint in [
      InvalidationHintV1::QuotaEntitlement {
        subject: format!("workspace:{workspace_id}"),
      },
      InvalidationHintV1::QuotaSeatUsage {
        workspace_id: workspace_id.to_owned(),
      },
      InvalidationHintV1::QuotaStorageUsage {
        subject: format!("workspace:{workspace_id}"),
      },
    ] {
      let _ = self.invalidation.publish_invalidation(&hint).await;
    }
  }
}

/// [`BillingSpi`] adapter backed by [`SelfhostLicenseService`] so self-hosted
/// deployments sync seats and open customer portals via the remote license API.
#[derive(Clone)]
pub struct SelfhostLicenseBillingSpi {
  licenses: SelfhostLicenseService,
}

impl SelfhostLicenseBillingSpi {
  pub fn new(licenses: SelfhostLicenseService) -> Self {
    Self { licenses }
  }
}

#[async_trait::async_trait]
impl BillingSpi for SelfhostLicenseBillingSpi {
  async fn on_workspace_members_changed(&self, workspace_id: &str) -> Result<(), DomainError> {
    self.licenses.sync_workspace_seats(workspace_id).await
  }

  async fn create_selfhost_customer_portal(&self, workspace_id: &str) -> Result<String, DomainError> {
    self.licenses.create_customer_portal(workspace_id).await
  }
}

fn verify_installable_license(
  normalized_payload: &[u8],
  keyring: &Keyring,
  workspace_id: &str,
  now: DateTime<Utc>,
) -> Result<VerifiedAnyLicense, DomainError> {
  let verified = verify_any_license(normalized_payload, keyring, Some(workspace_id), now).map_err(map_license_error)?;
  if !verified.is_workspace_commercial() || verified.workspace_id() != Some(workspace_id) {
    return Err(DomainError::Validation(
      "invalid_license_to_activate:Commercial workspace license required.".to_owned(),
    ));
  }
  Ok(verified)
}

async fn lock_workspace_license_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> Result<(), DomainError> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("affine:selfhost-license:{workspace_id}"))
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock selfhost license advisory: {e}")))?;
  let ws_exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock workspace for license: {e}")))?;
  if ws_exists.is_none() {
    return Err(DomainError::NotFound("workspace_not_found".to_owned()));
  }
  Ok(())
}

async fn load_installed_row_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> Result<Option<InstalledRow>, DomainError> {
  let row = sqlx::query(
    "SELECT key, workspace_id, validate_key, variant FROM installed_licenses WHERE workspace_id = $1 LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load installed license row: {e}")))?;
  Ok(row.map(|r| InstalledRow {
    key: r.get("key"),
    workspace_id: r.get("workspace_id"),
    validate_key: r.get("validate_key"),
    variant: r.get("variant"),
  }))
}

async fn revoke_workspace_entitlements_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  now: DateTime<Utc>,
) -> Result<u64, DomainError> {
  let affected = sqlx::query(
    "UPDATE entitlements
     SET status = 'revoked', updated_at = $2
     WHERE source = 'selfhost_license'
       AND target_type = 'workspace'
       AND target_id = $1
       AND status IN ('active', 'grace')",
  )
  .bind(workspace_id)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("revoke selfhost license entitlements: {e}")))?
  .rows_affected();
  Ok(affected)
}

/// Downgrades workspace state after losing a commercial self-hosted license:
/// revokes pending invitations and demotes non-owner admins to collaborators.
async fn downgrade_workspace_after_license_loss_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  now: DateTime<Utc>,
) -> Result<(), DomainError> {
  sqlx::query(
    "DELETE FROM workspace_invitations \
     WHERE workspace_id = $1 AND status::text IN ('pending', 'waiting_review', 'waiting_seat')",
  )
  .bind(workspace_id)
  .execute(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("revoke invitations on license downgrade: {e}")))?;
  sqlx::query(
    "UPDATE workspace_members
     SET role = 'member', updated_at = $2
     WHERE workspace_id = $1 AND role = 'admin' AND state = 'active'",
  )
  .bind(workspace_id)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("demote admins on license downgrade: {e}")))?;
  Ok(())
}

struct EntitlementUpsertParams<'a> {
  workspace_id: &'a str,
  validate_key: &'a str,
  recurring: &'a str,
  variant: Option<&'a str>,
  normalized_payload: &'a [u8],
}

async fn upsert_entitlement_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  params: &EntitlementUpsertParams<'_>,
  verified: &VerifiedAnyLicense,
  now: DateTime<Utc>,
) -> Result<(), DomainError> {
  let EntitlementUpsertParams {
    workspace_id,
    validate_key,
    recurring,
    variant,
    normalized_payload,
  } = *params;
  revoke_workspace_entitlements_in_tx(tx, workspace_id, now).await?;

  let existing_entitlement_id: Option<String> = sqlx::query_scalar(
    "SELECT id FROM entitlements WHERE source = 'selfhost_license' AND subject_id = $1 ORDER BY updated_at DESC LIMIT 1",
  )
  .bind(verified.license_id())
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("lookup selfhost entitlement: {e}")))?;
  let ent_id = existing_entitlement_id.unwrap_or_else(|| Uuid::new_v4().to_string());
  let plan = verified.entitlement_plan_name();
  let metadata = json!({
    "recurring": recurring,
    "validateKey": validate_key,
    "variant": variant,
    "errorCode": null,
    "errorMessage": null,
  });

  sqlx::query(
    r#"INSERT INTO entitlements
         (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload,
          metadata, starts_at, expires_at, grace_until, validated_at, updated_at)
       VALUES ($1, 'workspace', $2, 'selfhost_license', $3, $4, 'active', $5, $6, $7, NULL, $8, NULL, $9, $9)
       ON CONFLICT (id) DO UPDATE SET
         target_type = EXCLUDED.target_type,
         target_id = EXCLUDED.target_id,
         plan = EXCLUDED.plan,
         status = EXCLUDED.status,
         quantity = EXCLUDED.quantity,
         signed_payload = EXCLUDED.signed_payload,
         metadata = EXCLUDED.metadata,
         expires_at = EXCLUDED.expires_at,
         grace_until = NULL,
         validated_at = EXCLUDED.validated_at,
         updated_at = EXCLUDED.updated_at"#,
  )
  .bind(&ent_id)
  .bind(workspace_id)
  .bind(verified.license_id())
  .bind(plan)
  .bind(verified.seat_quantity())
  .bind(normalized_payload)
  .bind(metadata)
  .bind(verified.expires_at())
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("upsert selfhost entitlement: {e}")))?;
  Ok(())
}

fn installed_view_from_row(r: sqlx::postgres::PgRow) -> InstalledLicenseView {
  InstalledLicenseView {
    key: r.get("key"),
    workspace_id: r.get("workspace_id"),
    quantity: r.get("quantity"),
    recurring: r.get("recurring"),
    variant: r.get("variant"),
    installed_at: r.get("installed_at"),
    validated_at: r.get("validated_at"),
    expired_at: r.get("expired_at"),
  }
}

fn is_onetime_variant(variant: Option<&str>) -> bool {
  variant.is_some_and(|v| v.eq_ignore_ascii_case("onetime"))
}

fn normalize_recurring(raw: Option<&str>) -> &'static str {
  match raw.map(str::to_ascii_lowercase).as_deref() {
    Some("monthly") => "monthly",
    Some("yearly") => "yearly",
    _ => "lifetime",
  }
}

fn preview_from_verified(v: &VerifiedAnyLicense) -> LicensePreviewView {
  let plan = match v.tier() {
    server_types::LicenseTier::SelfhostEnterprise => "Enterprise",
    server_types::LicenseTier::SelfhostTeam => "SelfHostedTeam",
    _ => "SelfHosted",
  };
  let issued_at = v.issued_at();
  let expires_at = v.expires_at().unwrap_or(issued_at);
  LicensePreviewView {
    id: v.license_id().to_owned(),
    workspace_id: v.workspace_id().unwrap_or_default().to_owned(),
    plan: plan.to_owned(),
    recurring: normalize_recurring(v.recurring()).to_owned(),
    quantity: v.seat_quantity(),
    issued_at,
    expires_at,
    end_at: v.end_at(),
    entity: v.entity().to_owned(),
    issuer: v.issuer().to_owned(),
    valid: true,
  }
}

fn map_license_error(err: LicenseV2Error) -> DomainError {
  match err {
    LicenseV2Error::Expired { .. } => DomainError::Validation("invalid_license_to_activate:license expired".to_owned()),
    LicenseV2Error::ScopeMismatch { .. } => {
      DomainError::Validation("invalid_license_to_activate:Workspace mismatched with license.".to_owned())
    }
    other => DomainError::Validation(format!("invalid_license_to_activate:{other}")),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
  use tokio::net::TcpListener;

  async fn spawn_http_stub(
    handler: impl Fn(String) -> (u16, Vec<(String, String)>, Vec<u8>) + Send + Sync + 'static,
  ) -> (String, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let handler = Arc::new(handler);
    let task = tokio::spawn(async move {
      while let Ok((mut stream, _)) = listener.accept().await {
        let handler = Arc::clone(&handler);
        tokio::spawn(async move {
          let mut buf = vec![0u8; 8192];
          let n = stream.read(&mut buf).await.unwrap_or(0);
          let req = String::from_utf8_lossy(&buf[..n]).into_owned();
          let (status, headers, body) = handler(req);
          let mut resp = format!("HTTP/1.1 {status} OK\r\nContent-Length: {}\r\n", body.len());
          for (k, v) in headers {
            resp.push_str(&format!("{k}: {v}\r\n"));
          }
          resp.push_str("Connection: close\r\n\r\n");
          let _ = stream.write_all(resp.as_bytes()).await;
          let _ = stream.write_all(&body).await;
        });
      }
    });
    (format!("http://{addr}"), task)
  }

  #[tokio::test]
  async fn reqwest_client_parses_v0275_headers_and_rejects_missing_or_invalid_headers() {
    let vk = Uuid::new_v4().to_string();
    let vk_clone = vk.clone();
    let (base_url, handle) = spawn_http_stub(move |req| {
      let line = req.lines().next().unwrap_or("");
      if line.contains("/lic-ok/activate") || line.contains("/lic-ok/health") {
        (
          200,
          vec![
            ("x-license-recurring".into(), "monthly".into()),
            ("x-next-validate-key".into(), vk_clone.clone()),
          ],
          b"{\"claims\":{},\"signature\":\"sig\"}".to_vec(),
        )
      } else if line.contains("/lic-bad-rec/activate") {
        (
          200,
          vec![
            ("x-license-recurring".into(), "weekly".into()),
            ("x-next-validate-key".into(), vk_clone.clone()),
          ],
          b"{}".to_vec(),
        )
      } else if line.contains("/lic-bad-vk/health") {
        (
          200,
          vec![
            ("x-license-recurring".into(), "yearly".into()),
            ("x-next-validate-key".into(), "not-a-uuid".into()),
          ],
          b"{}".to_vec(),
        )
      } else if line.contains("/lic-missing-rec/activate") {
        (
          200,
          vec![("x-next-validate-key".into(), vk_clone.clone())],
          b"{}".to_vec(),
        )
      } else if line.contains("/lic-missing-vk/health") {
        (
          200,
          vec![("x-license-recurring".into(), "monthly".into())],
          b"{}".to_vec(),
        )
      } else if line.contains("/lic-empty-404/health") {
        (404, vec![], Vec::new())
      } else if line.contains("/lic-html-404/health") {
        (
          404,
          vec![("content-type".into(), "text/html".into())],
          b"<html><body>404 Not Found</body></html>".to_vec(),
        )
      } else if line.contains("/lic-ok/deactivate") || line.contains("/lic-ok/seats") {
        (200, vec![], b"{}".to_vec())
      } else if line.contains("/lic-ok/create-customer-portal") {
        (
          200,
          vec![("content-type".into(), "application/json".into())],
          b"{\"url\":\"https://billing.affine.test/session/1\"}".to_vec(),
        )
      } else {
        (
          400,
          vec![("content-type".into(), "application/json".into())],
          b"{\"name\":\"INVALID_LICENSE_TO_ACTIVATE\",\"message\":\"bad\",\"data\":{\"reason\":\"invalid_validate_key\"}}".to_vec(),
        )
      }
    })
    .await;

    let client = ReqwestSelfhostLicenseClient::new(base_url);
    let act = client.activate("lic-ok", "ws-1", "op-1").await.unwrap();
    assert_eq!(act.recurring, "monthly");
    assert_eq!(act.validate_key, vk);

    let RemoteHealthOutcome::Active(health) = client.health("lic-ok", &vk, "ws-1").await.unwrap() else {
      panic!("expected active remote health outcome");
    };
    assert_eq!(health.recurring, "monthly");
    assert_eq!(health.validate_key, vk);

    client.update_seats("lic-ok", &vk, 12).await.unwrap();
    assert_eq!(
      client.create_customer_portal("lic-ok", &vk).await.unwrap(),
      "https://billing.affine.test/session/1"
    );
    client.deactivate("lic-ok", &vk).await.unwrap();

    assert!(client.activate("lic-bad-rec", "ws-1", "op-2").await.is_err());
    assert!(client.health("lic-bad-vk", &vk, "ws-1").await.is_err());
    assert!(client.activate("lic-missing-rec", "ws-1", "op-3").await.is_err());
    assert!(client.health("lic-missing-vk", &vk, "ws-1").await.is_err());

    let empty_404 = client.health("lic-empty-404", &vk, "ws-1").await.unwrap_err();
    assert!(matches!(empty_404, DomainError::Unavailable(_)));

    let html_404 = client.health("lic-html-404", &vk, "ws-1").await.unwrap_err();
    assert!(matches!(html_404, DomainError::Unavailable(_)));

    let denied = client.health("lic-denied", &vk, "ws-1").await.unwrap();
    assert!(matches!(
      denied,
      RemoteHealthOutcome::Denied {
        status: "revoked",
        ref reason,
        ..
      } if reason == "invalid_validate_key"
    ));
    handle.abort();
  }
}
