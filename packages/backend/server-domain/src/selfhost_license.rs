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
    revoke_workspace_entitlements_in_tx(tx.tx_mut(), workspace_id, now).await?;

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
    let _ = sqlx::query(
      "UPDATE installed_licenses
       SET validated_at = LEAST(validated_at, clock_timestamp() - interval '1 hour')
       WHERE workspace_id = $1 AND key = $2 AND validate_key = $3",
    )
    .bind(&installed.workspace_id)
    .bind(&installed.key)
    .bind(&installed.validate_key)
    .execute(&mut *conn)
    .await;
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
        if let Some((ent_id, _, _)) = existing_entitlement {
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

    let updated = sqlx::query(
      r#"UPDATE entitlements
         SET status = $3,
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('errorCode', $4::text, 'errorMessage', $4::text),
             updated_at = $5
         WHERE source = 'selfhost_license'
           AND target_type = 'workspace'
           AND target_id = $1
           AND subject_id = $2
           AND status IN ('active', 'grace')"#,
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

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit license denial: {e}")))?;
    if updated > 0 {
      self.publish_license_invalidation(&row.workspace_id).await;
      Ok(true)
    } else {
      Ok(false)
    }
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
) -> Result<(), DomainError> {
  sqlx::query(
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
  .map_err(|e| DomainError::Internal(format!("revoke selfhost license entitlements: {e}")))?;
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
  use crate::events::NoopEventPublisher;
  use aes_gcm::{
    AesGcm, KeyInit as _,
    aead::{Aead as _, generic_array::typenum::U12},
    aes::Aes256,
  };
  use chrono::Duration;
  use p256::ecdsa::{DerSignature, Signature, SigningKey, VerifyingKey, signature::Signer as _};
  use p256::pkcs8::{EncodePublicKey as _, LineEnding};
  use server_db::DbConfig;
  use server_spi::CommunityQuotaGate;
  use server_types::license::{
    DEFAULT_SELFHOST_LICENSE_BYTES, LICENSE_AUDIENCE_SELFHOST, LicenseClaimsV1, LicenseClaimsV2, LicenseEnvelopeV1,
    LicenseEnvelopeV2, LicenseLimitsV2, LicenseRightsV2, LicenseScopeV2,
  };
  use sha2::{Digest as _, Sha256};
  use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
  use tokio::net::TcpListener;
  use tokio::sync::{Barrier, Notify};

  fn test_keypair(seed: u8) -> (SigningKey, String) {
    let signing_key = SigningKey::from_slice(&[seed; 32]).unwrap();
    let pem = VerifyingKey::from(&signing_key)
      .to_public_key_pem(LineEnding::LF)
      .unwrap();
    (signing_key, pem)
  }

  fn sign_v2_license(signing_key: &SigningKey, license_id: &str, ws_id: &str, tier: &str, seats: i32) -> Vec<u8> {
    let claims = LicenseClaimsV2 {
      format_version: 2,
      kid: PRO_KID.to_owned(),
      license_id: license_id.to_owned(),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      scope: LicenseScopeV2 {
        kind: "workspace".to_owned(),
        workspace_id: Some(ws_id.to_owned()),
      },
      tier: tier.to_owned(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: seats,
        seat_quota_bytes: None,
        history_period_seconds: 31_536_000,
        copilot_action_limit: None,
      },
      rights: LicenseRightsV2 {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: true,
      },
      recurring: Some("yearly".to_owned()),
      issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
      not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
      expires_at: Some((Utc::now() + Duration::days(365)).to_rfc3339()),
    };
    let canonical = serde_json::to_vec(&claims).unwrap();
    let sig: DerSignature = signing_key.sign(&canonical);
    serde_json::to_vec(&LicenseEnvelopeV2 {
      claims,
      signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.as_bytes()),
    })
    .unwrap()
  }

  fn sign_v1_license(signing_key: &SigningKey, license_id: &str, ws_id: &str, seats: i32) -> Vec<u8> {
    let claims = LicenseClaimsV1 {
      format_version: 1,
      license_id: license_id.to_owned(),
      workspace_id: ws_id.to_owned(),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      plan: "selfhost_team".to_owned(),
      seat_quantity: seats,
      issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
      not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
      expires_at: (Utc::now() + Duration::days(90)).to_rfc3339(),
    };
    let canonical = serde_json::to_vec(&claims).unwrap();
    let canonical_str = std::str::from_utf8(&canonical).unwrap();
    assert!(!canonical_str.contains("\"recurring\""));
    assert!(canonical_str.find("\"workspaceId\"") < canonical_str.find("\"audience\""));
    let sig: DerSignature = signing_key.sign(&canonical);
    serde_json::to_vec(&LicenseEnvelopeV1 {
      claims,
      signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.as_bytes()),
    })
    .unwrap()
  }

  fn sign_legacy_aes_license(signing_key: &SigningKey, license_id: &str, ws_id: &str, seats: i32) -> Vec<u8> {
    let expires_at = Utc::now() + Duration::days(180);
    let payload = serde_json::to_string_pretty(&json!({
      "entity": "acme",
      "issuer": "Toeverything",
      "subject": "selfhostedteam",
      "issuedAt": (Utc::now() - Duration::days(1)).to_rfc3339(),
      "expiresAt": expires_at.to_rfc3339(),
      "data": {
        "id": license_id,
        "workspaceId": ws_id,
        "quantity": seats,
        "plan": "selfhostedteam",
        "recurring": "monthly",
        "endAt": (expires_at + Duration::days(1)).to_rfc3339(),
      }
    }))
    .unwrap();
    let iv = [9u8; 12];
    let mut message = iv.to_vec();
    message.extend_from_slice(payload.as_bytes());
    let sig: Signature = signing_key.sign(&message);
    let plaintext = serde_json::to_vec(&json!({
      "payload": payload,
      "signature": hex::encode(sig.to_der()),
    }))
    .unwrap();
    let aes_key: [u8; 32] = Sha256::digest(b"TEST_LICENSE_AES_KEY").into();
    let cipher = AesGcm::<Aes256, U12, U12>::new(&aes_key.into());
    let ciphertext = cipher.encrypt((&iv).into(), plaintext.as_ref()).unwrap();
    let split = ciphertext.len() - 12;
    let mut out = vec![12, 12];
    out.extend_from_slice(&iv);
    out.extend_from_slice(&ciphertext[split..]);
    out.extend_from_slice(&ciphertext[..split]);
    out
  }

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

  #[test]
  fn license_install_legacy_v1_v2_and_deactivate_dual_write_entitlements() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 2, 2],
      })
      .await
      .unwrap();
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .unwrap();
      db.ensure_schema_ready().await.unwrap();

      let owner_id = Uuid::new_v4().to_string();
      let ws_id = Uuid::new_v4().to_string();
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Owner', 'lic-owner@example.com')")
        .bind(&owner_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(&ws_id)
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();

      let (signing_key, pro_pem) = test_keypair(0x5A);
      let keyring = Keyring::with_pro_public_key(pro_pem);
      let gate = CommunityQuotaGate::with_keyring(keyring.clone());
      let svc = SelfhostLicenseService::new(
        db.clone(),
        Arc::new(gate.clone()),
        Arc::new(NoopEventPublisher::default()),
      )
      .with_keyring(keyring);

      // 1. Default bundled non-commercial license and commercial instance_default license
      //    must both be rejected on preview and install BEFORE any DB write.
      assert!(svc.preview_license(DEFAULT_SELFHOST_LICENSE_BYTES).is_err());
      assert!(svc.install_license(&owner_id, &ws_id, DEFAULT_SELFHOST_LICENSE_BYTES).await.is_err());
      let inst_default_claims = LicenseClaimsV2 {
        format_version: 2,
        kid: PRO_KID.to_owned(),
        license_id: "inst-default-commercial".to_owned(),
        audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
        scope: LicenseScopeV2 {
          kind: "instance_default".to_owned(),
          workspace_id: None,
        },
        tier: "selfhost_team".to_owned(),
        limits: LicenseLimitsV2 {
          blob_limit_bytes: 524_288_000,
          storage_quota_bytes: 1_099_511_627_776,
          seat_limit: 100,
          seat_quota_bytes: None,
          history_period_seconds: 31_536_000,
          copilot_action_limit: None,
        },
        rights: LicenseRightsV2 {
          commercial: true,
          copilot_byok: true,
          unlimited_copilot: false,
        },
        recurring: Some("yearly".to_owned()),
        issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
        not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
        expires_at: Some((Utc::now() + Duration::days(365)).to_rfc3339()),
      };
      let inst_sig: DerSignature = signing_key.sign(&serde_json::to_vec(&inst_default_claims).unwrap());
      let inst_default_bytes = serde_json::to_vec(&LicenseEnvelopeV2 {
        claims: inst_default_claims,
        signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, inst_sig.as_bytes()),
      })
      .unwrap();
      assert!(svc.preview_license(&inst_default_bytes).is_err());
      assert!(svc.install_license(&owner_id, &ws_id, &inst_default_bytes).await.is_err());

      // 2. Legacy AES .license -> preview + install stores raw binary in installed_licenses
      //    and normalized JSON in entitlements with plan = 'selfhost_team' and lowercase recurring.
      let legacy_bin = sign_legacy_aes_license(&signing_key, &format!("legacy-{ws_id}"), &ws_id, 15);
      let preview_legacy = svc.preview_license(&legacy_bin).unwrap();
      assert_eq!(preview_legacy.plan, "SelfHostedTeam");
      assert_eq!(preview_legacy.quantity, 15);
      let installed_legacy = svc.install_license(&owner_id, &ws_id, &legacy_bin).await.unwrap();
      assert_eq!(installed_legacy.quantity, 15);
      assert_eq!(installed_legacy.recurring, "monthly");

      let (ent_plan, ent_payload, ent_recurring): (String, Vec<u8>, String) = sqlx::query_as(
        "SELECT plan, signed_payload, metadata->>'recurring' FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(ent_plan, "selfhost_team");
      assert_eq!(ent_recurring, "monthly");
      assert!(ent_payload.starts_with(b"{"), "entitlement signed_payload must be normalized JSON");
      {
        // Legacy-v0 has no `not_before` restriction: test `now < issued_at` cold + cached.
        let before_issued = Utc::now() - Duration::days(3);
        let mut tx = db.pool().begin().await.unwrap();
        let grant_cold = gate.resolve_workspace_grant(&mut tx, &ws_id, before_issued).await.unwrap();
        let grant_cached = gate.resolve_workspace_grant(&mut tx, &ws_id, before_issued).await.unwrap();
        assert_eq!(grant_cold, grant_cached);
        assert_eq!(grant_cold.limits.seat_limit, 15);
        assert_eq!(grant_cold.limits.blob_limit_bytes, 524_288_000);
        assert_eq!(grant_cold.limits.storage_quota_bytes, 429_496_729_600);
        assert_eq!(grant_cold.limits.seat_quota_bytes, Some(21_474_836_480));
        assert_eq!(grant_cold.limits.history_period_seconds, 2_592_000);
        assert_eq!(grant_cold.limits.copilot_action_limit, None);
        assert!(grant_cold.rights.commercial);
        assert!(grant_cold.rights.copilot_byok);
        assert!(!grant_cold.rights.unlimited_copilot);
        tx.rollback().await.unwrap();
      }

      // 3. V1 license preview & install (exact affine_core 9-field canonical claims).
      let v1_bytes = sign_v1_license(&signing_key, &format!("v1-{ws_id}"), &ws_id, 15);
      let preview_v1 = svc.preview_license(&v1_bytes).unwrap();
      assert_eq!(preview_v1.quantity, 15);
      let installed_v1 = svc.install_license(&owner_id, &ws_id, &v1_bytes).await.unwrap();
      assert_eq!(installed_v1.quantity, 15);
      assert_eq!(installed_v1.recurring, "lifetime");
      {
        let mut tx = db.pool().begin().await.unwrap();
        let grant = gate.resolve_workspace_grant(&mut tx, &ws_id, Utc::now()).await.unwrap();
        assert_eq!(grant.limits.seat_limit, 15);
        assert_eq!(grant.limits.blob_limit_bytes, 524_288_000);
        assert_eq!(grant.limits.storage_quota_bytes, 429_496_729_600);
        assert_eq!(grant.limits.seat_quota_bytes, Some(21_474_836_480));
        assert!(!grant.rights.unlimited_copilot);
        tx.rollback().await.unwrap();
      }

      // 4. V2 enterprise license writes DB compatibility plan = 'selfhost_team',
      //    lowercase recurring = 'yearly', while GraphQL preview keeps "Enterprise".
      let v2_ent = sign_v2_license(&signing_key, &format!("v2-{ws_id}"), &ws_id, "selfhost_enterprise", 50);
      assert_eq!(svc.preview_license(&v2_ent).unwrap().plan, "Enterprise");
      let installed_v2 = svc.install_license(&owner_id, &ws_id, &v2_ent).await.unwrap();
      assert_eq!(installed_v2.quantity, 50);
      assert_eq!(installed_v2.recurring, "yearly");
      let (ent_plan_v2, db_recurring_v2): (String, String) = sqlx::query_as(
        "SELECT e.plan, l.recurring
         FROM entitlements e
         JOIN installed_licenses l ON l.workspace_id = e.target_id
         WHERE e.source = 'selfhost_license' AND e.target_id = $1 AND e.status = 'active'",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(ent_plan_v2, "selfhost_team");
      assert_eq!(db_recurring_v2, "yearly");
      {
        let mut tx = db.pool().begin().await.unwrap();
        let grant = gate.resolve_workspace_grant(&mut tx, &ws_id, Utc::now()).await.unwrap();
        assert_eq!(grant.limits.seat_limit, 50);
        tx.rollback().await.unwrap();
      }

      // 5. Destructive install attempts (tampered signature, cross-workspace, expired)
      //    must fail with v0.27.5 error messages and leave the active 50-seat license intact.
      let tampered = String::from_utf8(v2_ent.clone()).unwrap().replace("50", "99");
      let other_ws_lic = sign_v2_license(&signing_key, "v2-other-ws", "other-ws", "selfhost_team", 30);
      let expired_claims = LicenseClaimsV2 {
        format_version: 2,
        kid: PRO_KID.to_owned(),
        license_id: format!("v2-expired-{ws_id}"),
        audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
        scope: LicenseScopeV2 {
          kind: "workspace".to_owned(),
          workspace_id: Some(ws_id.clone()),
        },
        tier: "selfhost_team".to_owned(),
        limits: LicenseLimitsV2 {
          blob_limit_bytes: 524_288_000,
          storage_quota_bytes: 1_099_511_627_776,
          seat_limit: 30,
          seat_quota_bytes: None,
          history_period_seconds: 31_536_000,
          copilot_action_limit: None,
        },
        rights: LicenseRightsV2 {
          commercial: true,
          copilot_byok: true,
          unlimited_copilot: true,
        },
        recurring: Some("monthly".to_owned()),
        issued_at: (Utc::now() - Duration::days(30)).to_rfc3339(),
        not_before: (Utc::now() - Duration::days(31)).to_rfc3339(),
        expires_at: Some((Utc::now() - Duration::days(1)).to_rfc3339()),
      };
      let expired_sig: DerSignature = signing_key.sign(&serde_json::to_vec(&expired_claims).unwrap());
      let expired_lic = serde_json::to_vec(&LicenseEnvelopeV2 {
        claims: expired_claims,
        signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, expired_sig.as_bytes()),
      })
      .unwrap();

      let bad_attempts: [(&str, Vec<u8>, Option<&str>); 3] = [
        ("tampered", tampered.into_bytes(), None),
        ("cross_workspace", other_ws_lic, Some("Workspace mismatched with license.")),
        ("expired", expired_lic, Some("license expired")),
      ];
      for (label, bad_bytes, expected_msg) in bad_attempts {
        let err = svc
          .install_license(&owner_id, &ws_id, &bad_bytes)
          .await
          .expect_err(&format!("{label} license must be rejected"));
        if let Some(substr) = expected_msg {
          assert!(
            err.to_string().contains(substr),
            "{label} error must contain {substr:?}, got: {err}"
          );
        }
        let still_installed = svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap();
        assert_eq!(still_installed.quantity, 50, "{label} must not overwrite installed license");
        let ent_qty: i32 = sqlx::query_scalar(
          "SELECT quantity FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
        )
        .bind(&ws_id)
        .fetch_one(db.pool())
        .await
        .unwrap();
        assert_eq!(ent_qty, 50, "{label} must not revoke or alter active entitlement");
        let mut tx = db.pool().begin().await.unwrap();
        let grant = gate.resolve_workspace_grant(&mut tx, &ws_id, Utc::now()).await.unwrap();
        assert_eq!(grant.limits.seat_limit, 50, "{label} must not degrade quota grant");
        tx.rollback().await.unwrap();
      }

      // 6. Deactivate revokes entitlements cleanly and restores default 10-seat grant.
      assert!(svc.deactivate_license(&owner_id, &ws_id).await.unwrap());
      let active_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(active_count, 0);
      {
        let mut tx = db.pool().begin().await.unwrap();
        let grant = gate.resolve_workspace_grant(&mut tx, &ws_id, Utc::now()).await.unwrap();
        assert_eq!(grant.limits.seat_limit, 10);
        tx.rollback().await.unwrap();
      }
    });
    drop(lease);
  }

  #[test]
  fn check_licenses_holds_zero_pool_connections_during_http_and_cas_prevents_resurrection() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_multi_thread()
      .worker_threads(2)
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async move {
      // Single-connection pool proves check_licenses holds ZERO PgPool connections while awaiting HTTP.
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 1,
        statement_timeout_ms: 5_000,
        tier_permits: [1, 1, 1, 1],
      })
      .await
      .unwrap();
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .unwrap();
      db.ensure_schema_ready().await.unwrap();

      let owner_id = Uuid::new_v4().to_string();
      let ws_id = Uuid::new_v4().to_string();
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Owner', 'cas-owner@example.com')")
        .bind(&owner_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(&ws_id)
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();

      let (signing_key, pro_pem) = test_keypair(0x6B);
      let key_a = "KEY-A-10";
      let vk_a = Uuid::new_v4().to_string();
      let env_a = sign_v2_license(&signing_key, key_a, &ws_id, "selfhost_team", 10);
      let env_a_refreshed = sign_v2_license(&signing_key, key_a, &ws_id, "selfhost_team", 12);
      let key_b = "KEY-B-25";
      let env_b = sign_v2_license(&signing_key, key_b, &ws_id, "selfhost_team", 25);

      struct BarrierClient {
        entered: Arc<Notify>,
        release: Arc<Barrier>,
        health_envelope: Vec<u8>,
        activate_envelope: Vec<u8>,
        vk: String,
      }
      #[async_trait::async_trait]
      impl SelfhostLicenseClient for BarrierClient {
        async fn activate(&self, _k: &str, _w: &str, _op: &str) -> Result<RemoteLicensePayload, DomainError> {
          Ok(RemoteLicensePayload {
            recurring: "yearly".into(),
            validate_key: self.vk.clone(),
            envelope: self.activate_envelope.clone(),
          })
        }
        async fn deactivate(&self, _k: &str, _vk: &str) -> Result<(), DomainError> {
          self.entered.notify_one();
          self.release.wait().await;
          Ok(())
        }
        async fn health(&self, _k: &str, vk: &str, _w: &str) -> Result<RemoteHealthOutcome, DomainError> {
          self.entered.notify_one();
          self.release.wait().await;
          Ok(RemoteHealthOutcome::Active(RemoteLicensePayload {
            recurring: "yearly".into(),
            validate_key: vk.to_owned(),
            envelope: self.health_envelope.clone(),
          }))
        }
        async fn update_seats(&self, _k: &str, _vk: &str, _s: u32) -> Result<(), DomainError> {
          Ok(())
        }
        async fn create_customer_portal(&self, _k: &str, _vk: &str) -> Result<String, DomainError> {
          Ok("https://portal.test".into())
        }
      }

      // 1. Mismatched license_id on activate is rejected with license_identity_changed.
      let mismatch_client = Arc::new(BarrierClient {
        entered: Arc::new(Notify::new()),
        release: Arc::new(Barrier::new(1)),
        health_envelope: env_a.clone(),
        activate_envelope: env_b.clone(),
        vk: vk_a.clone(),
      });
      let svc_mismatch = SelfhostLicenseService::new(
        db.clone(),
        Arc::new(CommunityQuotaGate::new()),
        Arc::new(NoopEventPublisher::default()),
      )
      .with_keyring(Keyring::with_pro_public_key(pro_pem.clone()))
      .with_client(mismatch_client);
      let err = svc_mismatch.activate_license(&owner_id, &ws_id, key_a).await.unwrap_err();
      assert!(err.to_string().contains("license_identity_changed"), "got {err}");

      // 2. Seed stale license A; suspend health HTTP on barrier; while suspended,
      //    verify a normal DB query succeeds on the 1-connection pool!
      let entered = Arc::new(Notify::new());
      let release = Arc::new(Barrier::new(2));
      let client = Arc::new(BarrierClient {
        entered: Arc::clone(&entered),
        release: Arc::clone(&release),
        health_envelope: env_a_refreshed.clone(),
        activate_envelope: env_a.clone(),
        vk: vk_a.clone(),
      });
      let svc = SelfhostLicenseService::new(
        db.clone(),
        Arc::new(CommunityQuotaGate::new()),
        Arc::new(NoopEventPublisher::default()),
      )
      .with_keyring(Keyring::with_pro_public_key(pro_pem.clone()))
      .with_client(client);
      svc.activate_license(&owner_id, &ws_id, key_a).await.unwrap();
      sqlx::query("UPDATE installed_licenses SET validated_at = clock_timestamp() - interval '2 hours' WHERE workspace_id = $1")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .unwrap();

      let svc_scan = svc.clone();
      let scan_handle = tokio::spawn(async move { svc_scan.check_licenses().await });
      entered.notified().await;

      // Pool has max_connections = 1; this query would deadlock if check_licenses held a pool conn!
      let ping: i32 = sqlx::query_scalar("SELECT 1").fetch_one(db.pool()).await.unwrap();
      assert_eq!(ping, 1);

      release.wait().await;
      assert_eq!(scan_handle.await.unwrap().unwrap(), 1);
      assert_eq!(svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().quantity, 12);

      // 3. CAS race: suspend health for A, replace with offline license B mid-flight,
      //    release A -> B and its entitlement remain intact, A does NOT resurrect!
      sqlx::query("UPDATE installed_licenses SET validated_at = clock_timestamp() - interval '2 hours' WHERE workspace_id = $1")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .unwrap();
      let svc_scan2 = svc.clone();
      let scan_handle2 = tokio::spawn(async move { svc_scan2.check_licenses().await });
      entered.notified().await;

      svc.install_license(&owner_id, &ws_id, &env_b).await.unwrap();
      release.wait().await;
      assert_eq!(scan_handle2.await.unwrap().unwrap(), 0);
      let current = svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap();
      assert_eq!(current.key, key_b);
      assert_eq!(current.quantity, 25);

      let active_subject: String = sqlx::query_scalar(
        "SELECT subject_id FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(active_subject, key_b);

      // 4. CAS race on deactivate: re-activate A, suspend deactivate(A) mid-flight,
      //    replace with B -> deactivate(A) returns license_not_found and B stays active!
      assert!(svc.deactivate_license(&owner_id, &ws_id).await.unwrap());
      svc.activate_license(&owner_id, &ws_id, key_a).await.unwrap();
      let svc_deact = svc.clone();
      let owner_clone = owner_id.clone();
      let ws_clone = ws_id.clone();
      let deact_handle = tokio::spawn(async move { svc_deact.deactivate_license(&owner_clone, &ws_clone).await });
      entered.notified().await;

      svc.install_license(&owner_id, &ws_id, &env_b).await.unwrap();
      release.wait().await;
      assert!(matches!(
        deact_handle.await.unwrap(),
        Err(DomainError::NotFound(_))
      ));
      assert_eq!(svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().key, key_b);
      let active_subject_after: String = sqlx::query_scalar(
        "SELECT subject_id FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(active_subject_after, key_b);
    });
    drop(lease);
  }

  #[test]
  fn quota_gate_enforces_entitlement_time_windows_and_multi_candidate_arbitration() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 2, 2],
      })
      .await
      .unwrap();
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .unwrap();
      db.ensure_schema_ready().await.unwrap();

      let ws_id = Uuid::new_v4().to_string();
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .unwrap();

      let (signing_key, pro_pem) = test_keypair(0x7C);
      let gate = CommunityQuotaGate::with_keyring(Keyring::with_pro_public_key(pro_pem));
      // Align to millisecond precision matching PG `timestamptz(3)` so exact boundary equality is deterministic.
      let now = DateTime::from_timestamp_millis(Utc::now().timestamp_millis()).unwrap();
      let payload_30 = sign_v2_license(&signing_key, "lic-30", &ws_id, "selfhost_team", 30);
      let payload_40 = sign_v2_license(&signing_key, "lic-40", &ws_id, "selfhost_team", 40);

      // (a) starts_at > now rejected; now == starts_at allowed.
      let starts_future = now + Duration::minutes(10);
      let ent_a = Uuid::new_v4().to_string();
      sqlx::query(
        "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, starts_at, expires_at, updated_at)
         VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-30', 'selfhost_team', 'active', 30, $3, $4, $5, $6)",
      )
      .bind(&ent_a)
      .bind(&ws_id)
      .bind(&payload_30)
      .bind(starts_future)
      .bind(now + Duration::days(30))
      .bind(now)
      .execute(db.pool())
      .await
      .unwrap();

      let mut tx = db.pool().begin().await.unwrap();
      assert_eq!(gate.resolve_workspace_grant(&mut tx, &ws_id, now).await.unwrap().limits.seat_limit, 10);
      assert_eq!(
        gate.resolve_workspace_grant(&mut tx, &ws_id, starts_future).await.unwrap().limits.seat_limit,
        30
      );
      tx.rollback().await.unwrap();

      // (b) grace: now < grace_until allowed; now == grace_until rejected even if signed_payload not expired.
      let grace_until = now + Duration::minutes(5);
      sqlx::query("UPDATE entitlements SET status = 'grace', starts_at = NULL, grace_until = $2 WHERE id = $1")
        .bind(&ent_a)
        .bind(grace_until)
        .execute(db.pool())
        .await
        .unwrap();
      let mut tx = db.pool().begin().await.unwrap();
      assert_eq!(gate.resolve_workspace_grant(&mut tx, &ws_id, now).await.unwrap().limits.seat_limit, 30);
      assert_eq!(
        gate.resolve_workspace_grant(&mut tx, &ws_id, grace_until).await.unwrap().limits.seat_limit,
        10
      );
      tx.rollback().await.unwrap();

      // (c) active: now == expires_at rejected.
      let row_exp = now + Duration::minutes(2);
      sqlx::query("UPDATE entitlements SET status = 'active', grace_until = NULL, expires_at = $2 WHERE id = $1")
        .bind(&ent_a)
        .bind(row_exp)
        .execute(db.pool())
        .await
        .unwrap();
      let mut tx = db.pool().begin().await.unwrap();
      assert_eq!(
        gate.resolve_workspace_grant(&mut tx, &ws_id, row_exp).await.unwrap().limits.seat_limit,
        10
      );
      tx.rollback().await.unwrap();

      // (d) Latest row is past grace_until, older row is valid active -> picks the valid active candidate!
      let ent_b = Uuid::new_v4().to_string();
      sqlx::query(
        "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, starts_at, expires_at, grace_until, updated_at)
         VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-40', 'selfhost_team', 'grace', 40, $3, NULL, $4, $5, $6)",
      )
      .bind(&ent_b)
      .bind(&ws_id)
      .bind(&payload_40)
      .bind(now + Duration::days(30))
      .bind(now - Duration::seconds(1))
      .bind(now + Duration::seconds(10))
      .execute(db.pool())
      .await
      .unwrap();
      let mut tx = db.pool().begin().await.unwrap();
      assert_eq!(gate.resolve_workspace_grant(&mut tx, &ws_id, now).await.unwrap().limits.seat_limit, 30);
      tx.rollback().await.unwrap();
    });
    drop(lease);
  }

  #[test]
  fn write_transactions_recheck_permission_and_expiry_after_acquiring_lock() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_multi_thread()
      .worker_threads(2)
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 2, 2],
      })
      .await
      .unwrap();
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .unwrap();
      db.ensure_schema_ready().await.unwrap();

      let owner_id = Uuid::new_v4().to_string();
      let ws_id = Uuid::new_v4().to_string();
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Owner', 'lock-owner@example.com')")
        .bind(&owner_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(&ws_id)
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();

      let (signing_key, pro_pem) = test_keypair(0x8D);
      let keyring = Keyring::with_pro_public_key(pro_pem);
      let svc = SelfhostLicenseService::new(
        db.clone(),
        Arc::new(CommunityQuotaGate::with_keyring(keyring.clone())),
        Arc::new(NoopEventPublisher::default()),
      )
      .with_keyring(keyring);

      let valid_lic = sign_v2_license(&signing_key, "lic-valid-20", &ws_id, "selfhost_team", 20);

      // Deterministic PG lock-queue waiter scoped to current_database() and the lock holder PID.
      let wait_for_blocked_lock = |pool: sqlx::PgPool, holder_pid: i32| async move {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
          let blocked: bool = sqlx::query_scalar(
            "SELECT EXISTS(
               SELECT 1
               FROM pg_locks
               WHERE NOT granted
                 AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
                 AND $1 = ANY(pg_blocking_pids(pid))
             )",
          )
          .bind(holder_pid)
          .fetch_one(&pool)
          .await
          .unwrap();
          if blocked {
            return;
          }
          assert!(
            std::time::Instant::now() < deadline,
            "timed out waiting for concurrent write transaction to block on pg_locks"
          );
          tokio::task::yield_now().await;
        }
      };

      // (a) Tx1 holds lock, demotes actor to member, commits -> blocked install_license rejects with Forbidden and 0 writes.
      let mut lock_tx = db.begin_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      let holder_pid_1: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut **lock_tx.tx_mut())
        .await
        .unwrap();
      lock_workspace_license_in_tx(lock_tx.tx_mut(), &ws_id).await.unwrap();

      let svc_inst = svc.clone();
      let owner_c = owner_id.clone();
      let ws_c = ws_id.clone();
      let lic_c = valid_lic.clone();
      let inst_handle = tokio::spawn(async move { svc_inst.install_license(&owner_c, &ws_c, &lic_c).await });
      wait_for_blocked_lock(db.pool().clone(), holder_pid_1).await;
      assert!(!inst_handle.is_finished(), "install_license must wait on workspace license lock");

      sqlx::query("UPDATE workspace_members SET role = 'member' WHERE workspace_id = $1 AND user_id = $2")
        .bind(&ws_id)
        .bind(&owner_id)
        .execute(&mut **lock_tx.tx_mut())
        .await
        .unwrap();
      lock_tx.commit().await.unwrap();

      let err = inst_handle.await.unwrap().expect_err("demoted actor must be rejected");
      assert!(matches!(err, DomainError::Forbidden(_)), "expected Forbidden, got {err:?}");
      let lic_count: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM installed_licenses WHERE workspace_id = $1")
        .bind(&ws_id)
        .fetch_one(db.pool())
        .await
        .unwrap();
      assert_eq!(lic_count, 0);

      // Restore owner & install valid license, then test deactivate_license blocked while actor is demoted.
      sqlx::query("UPDATE workspace_members SET role = 'owner' WHERE workspace_id = $1 AND user_id = $2")
        .bind(&ws_id)
        .bind(&owner_id)
        .execute(db.pool())
        .await
        .unwrap();
      svc.install_license(&owner_id, &ws_id, &valid_lic).await.unwrap();

      let mut lock_tx2 = db.begin_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      let holder_pid_2: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut **lock_tx2.tx_mut())
        .await
        .unwrap();
      lock_workspace_license_in_tx(lock_tx2.tx_mut(), &ws_id).await.unwrap();
      let svc_deact = svc.clone();
      let owner_c2 = owner_id.clone();
      let ws_c2 = ws_id.clone();
      let deact_handle = tokio::spawn(async move { svc_deact.deactivate_license(&owner_c2, &ws_c2).await });
      wait_for_blocked_lock(db.pool().clone(), holder_pid_2).await;
      assert!(!deact_handle.is_finished(), "deactivate_license must wait on workspace license lock");
      sqlx::query("UPDATE workspace_members SET role = 'member' WHERE workspace_id = $1 AND user_id = $2")
        .bind(&ws_id)
        .bind(&owner_id)
        .execute(&mut **lock_tx2.tx_mut())
        .await
        .unwrap();
      lock_tx2.commit().await.unwrap();
      let deact_err = deact_handle.await.unwrap().expect_err("demoted actor deactivate must fail");
      assert!(matches!(deact_err, DomainError::Forbidden(_)));

      // Restore owner and confirm license + entitlement were untouched.
      sqlx::query("UPDATE workspace_members SET role = 'owner' WHERE workspace_id = $1 AND user_id = $2")
        .bind(&ws_id)
        .bind(&owner_id)
        .execute(db.pool())
        .await
        .unwrap();
      assert_eq!(svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().quantity, 20);

      // (b) License expires while install_license is blocked waiting for the workspace lock -> rejected with 0 writes.
      let db_now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
        .fetch_one(db.pool())
        .await
        .unwrap();
      let exp_soon = db_now + Duration::milliseconds(150);
      let short_claims = LicenseClaimsV2 {
        format_version: 2,
        kid: PRO_KID.to_owned(),
        license_id: "lic-expiring-mid-lock".to_owned(),
        audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
        scope: LicenseScopeV2 {
          kind: "workspace".to_owned(),
          workspace_id: Some(ws_id.clone()),
        },
        tier: "selfhost_team".to_owned(),
        limits: LicenseLimitsV2 {
          blob_limit_bytes: 524_288_000,
          storage_quota_bytes: 1_099_511_627_776,
          seat_limit: 99,
          seat_quota_bytes: None,
          history_period_seconds: 31_536_000,
          copilot_action_limit: None,
        },
        rights: LicenseRightsV2 {
          commercial: true,
          copilot_byok: true,
          unlimited_copilot: true,
        },
        recurring: Some("monthly".to_owned()),
        issued_at: (db_now - Duration::minutes(1)).to_rfc3339(),
        not_before: (db_now - Duration::minutes(2)).to_rfc3339(),
        expires_at: Some(exp_soon.to_rfc3339()),
      };
      let short_sig: DerSignature = signing_key.sign(&serde_json::to_vec(&short_claims).unwrap());
      let short_lic = serde_json::to_vec(&LicenseEnvelopeV2 {
        claims: short_claims,
        signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, short_sig.as_bytes()),
      })
      .unwrap();

      let mut lock_tx3 = db.begin_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      let holder_pid_3: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut **lock_tx3.tx_mut())
        .await
        .unwrap();
      lock_workspace_license_in_tx(lock_tx3.tx_mut(), &ws_id).await.unwrap();
      let svc_exp = svc.clone();
      let owner_c3 = owner_id.clone();
      let ws_c3 = ws_id.clone();
      let exp_handle = tokio::spawn(async move { svc_exp.install_license(&owner_c3, &ws_c3, &short_lic).await });
      wait_for_blocked_lock(db.pool().clone(), holder_pid_3).await;
      let clock_deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
      loop {
        let past: bool = sqlx::query_scalar("SELECT clock_timestamp() >= $1")
          .bind(exp_soon)
          .fetch_one(&mut **lock_tx3.tx_mut())
          .await
          .unwrap();
        if past {
          break;
        }
        assert!(
          std::time::Instant::now() < clock_deadline,
          "timed out waiting for DB clock_timestamp() to pass exp_soon"
        );
        tokio::task::yield_now().await;
      }
      lock_tx3.commit().await.unwrap();

      let exp_err = exp_handle.await.unwrap().expect_err("expired-in-wait license must be rejected");
      assert!(exp_err.to_string().contains("license expired"), "got {exp_err}");
      assert_eq!(svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().quantity, 20);
    });
    drop(lease);
  }

  #[test]
  fn check_licenses_rotates_cursor_past_100_failures_expires_onetime_and_syncs_chargeable_seats() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 2, 2],
      })
      .await
      .unwrap();
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .unwrap();
      db.ensure_schema_ready().await.unwrap();

      let (signing_key, pro_pem) = test_keypair(0x9E);
      let keyring = Keyring::with_pro_public_key(pro_pem);
      let gate = CommunityQuotaGate::with_keyring(keyring.clone());

      let stale_at = Utc::now() - Duration::hours(2);
      // Seed 100 failing recurring workspaces (ws-000 .. ws-099) + 101st healthy (ws-100) + expired onetime (ws-101).
      for i in 0..=101 {
        let ws = format!("ws-{i:03}");
        sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
          .bind(&ws)
          .execute(db.pool())
          .await
          .unwrap();
        let vk = Uuid::new_v4().to_string();
        if i <= 100 {
          let key = format!("key-{i:03}");
          let env = sign_v2_license(&signing_key, &key, &ws, "selfhost_team", 10);
          sqlx::query(
            "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
             VALUES ($1, $2, 10, 'monthly', NULL, $3, $4, $3, $5, $6)",
          )
          .bind(&key)
          .bind(&ws)
          .bind(stale_at)
          .bind(&vk)
          .bind(Utc::now() + Duration::days(30))
          .bind(&env)
          .execute(db.pool())
          .await
          .unwrap();
        } else {
          // ws-101: expired offline onetime license with previously active entitlement.
          let key = "key-onetime-expired";
          let exp_claims = LicenseClaimsV2 {
            format_version: 2,
            kid: PRO_KID.to_owned(),
            license_id: key.to_owned(),
            audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
            scope: LicenseScopeV2 {
              kind: "workspace".to_owned(),
              workspace_id: Some(ws.clone()),
            },
            tier: "selfhost_team".to_owned(),
            limits: LicenseLimitsV2 {
              blob_limit_bytes: 524_288_000,
              storage_quota_bytes: 1_099_511_627_776,
              seat_limit: 25,
              seat_quota_bytes: None,
              history_period_seconds: 31_536_000,
              copilot_action_limit: None,
            },
            rights: LicenseRightsV2 {
              commercial: true,
              copilot_byok: true,
              unlimited_copilot: true,
            },
            recurring: Some("lifetime".to_owned()),
            issued_at: (Utc::now() - Duration::days(60)).to_rfc3339(),
            not_before: (Utc::now() - Duration::days(61)).to_rfc3339(),
            expires_at: Some((Utc::now() - Duration::hours(1)).to_rfc3339()),
          };
          let sig: DerSignature = signing_key.sign(&serde_json::to_vec(&exp_claims).unwrap());
          let exp_bytes = serde_json::to_vec(&LicenseEnvelopeV2 {
            claims: exp_claims,
            signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.as_bytes()),
          })
          .unwrap();
          sqlx::query(
            "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
             VALUES ($1, $2, 25, 'lifetime', 'onetime', $3, $4, $3, $5, $6)",
          )
          .bind(key)
          .bind(&ws)
          .bind(stale_at)
          .bind(&vk)
          .bind(Utc::now() - Duration::hours(1))
          .bind(&exp_bytes)
          .execute(db.pool())
          .await
          .unwrap();
          sqlx::query(
            "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
             VALUES ($1, 'workspace', $2, 'selfhost_license', $3, 'selfhost_team', 'active', 25, $4, $5, $6, $6)",
          )
          .bind(Uuid::new_v4().to_string())
          .bind(&ws)
          .bind(key)
          .bind(&exp_bytes)
          .bind(Utc::now() - Duration::hours(1))
          .bind(stale_at)
          .execute(db.pool())
          .await
          .unwrap();
        }
      }

      let synced_seats = Arc::new(std::sync::Mutex::new(Vec::<u32>::new()));
      struct CursorClient {
        signing_key: SigningKey,
        synced_seats: Arc<std::sync::Mutex<Vec<u32>>>,
      }
      #[async_trait::async_trait]
      impl SelfhostLicenseClient for CursorClient {
        async fn activate(&self, _k: &str, _w: &str, _op: &str) -> Result<RemoteLicensePayload, DomainError> {
          Err(DomainError::Unavailable("unused".into()))
        }
        async fn deactivate(&self, _k: &str, _vk: &str) -> Result<(), DomainError> {
          Ok(())
        }
        async fn health(&self, key: &str, vk: &str, ws: &str) -> Result<RemoteHealthOutcome, DomainError> {
          if ws == "ws-100" {
            Ok(RemoteHealthOutcome::Active(RemoteLicensePayload {
              recurring: "monthly".into(),
              validate_key: vk.to_owned(),
              envelope: sign_v2_license(&self.signing_key, key, ws, "selfhost_team", 33),
            }))
          } else {
            Err(DomainError::Unavailable("simulated remote outage".into()))
          }
        }
        async fn update_seats(&self, _k: &str, _vk: &str, seats: u32) -> Result<(), DomainError> {
          self.synced_seats.lock().unwrap().push(seats);
          Ok(())
        }
        async fn create_customer_portal(&self, _k: &str, _vk: &str) -> Result<String, DomainError> {
          Ok("https://portal.test".into())
        }
      }

      let svc = SelfhostLicenseService::new(
        db.clone(),
        Arc::new(gate.clone()),
        Arc::new(NoopEventPublisher::default()),
      )
      .with_keyring(keyring)
      .with_client(Arc::new(CursorClient {
        signing_key,
        synced_seats: Arc::clone(&synced_seats),
      }));

      // Tick 1 processes ws-000..ws-099 (all fail); Tick 2 rotates cursor to ws-100 & ws-101!
      assert_eq!(svc.check_licenses().await.unwrap(), 0);
      assert_eq!(svc.check_licenses().await.unwrap(), 2);

      let ws100_qty: i32 = sqlx::query_scalar("SELECT quantity FROM installed_licenses WHERE workspace_id = 'ws-100'")
        .fetch_one(db.pool())
        .await
        .unwrap();
      assert_eq!(ws100_qty, 33, "101st healthy license must not starve behind 100 failing licenses");

      let (ws101_status, ws101_err): (String, String) = sqlx::query_as(
        "SELECT status, metadata->>'errorCode' FROM entitlements WHERE source = 'selfhost_license' AND target_id = 'ws-101'",
      )
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(ws101_status, "expired");
      assert_eq!(ws101_err, "license_expired");
      let ws101_validated: DateTime<Utc> =
        sqlx::query_scalar("SELECT validated_at FROM installed_licenses WHERE workspace_id = 'ws-101'")
          .fetch_one(db.pool())
          .await
          .unwrap();
      assert!(ws101_validated > stale_at);
      {
        let mut tx = db.pool().begin().await.unwrap();
        let grant = gate.resolve_workspace_grant(&mut tx, "ws-101", Utc::now()).await.unwrap();
        assert_eq!(grant.limits.seat_limit, 10);
        tx.rollback().await.unwrap();
      }

      // Verify sync_workspace_seats counts active members + CHARGEABLE_INVITATION_STATUSES (excluding revoked).
      let owner_id = Uuid::new_v4().to_string();
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'S', 'seat-owner@example.com')")
        .bind(&owner_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, 'ws-100', $2, 'owner', 'active', 'legacy')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
      for (idx, status) in ["pending", "waiting_review", "waiting_seat", "revoked"].into_iter().enumerate() {
        let inv_uid = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)")
          .bind(&inv_uid)
          .bind(format!("Inv {idx}"))
          .bind(format!("inv-{idx}@example.com"))
          .execute(db.pool())
          .await
          .unwrap();
        sqlx::query(
          "INSERT INTO workspace_invitations
             (id, workspace_id, invitee_user_id, normalized_email, inviter_user_id, requested_role, status, kind, created_at, updated_at)
           VALUES ($1, 'ws-100', $2, $3, $4, 'member', $5, 'email', clock_timestamp(), clock_timestamp())",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&inv_uid)
        .bind(format!("inv-{idx}@example.com"))
        .bind(&owner_id)
        .bind(status)
        .execute(db.pool())
        .await
        .unwrap();
      }
      svc.sync_workspace_seats("ws-100").await.unwrap();
      assert_eq!(synced_seats.lock().unwrap().as_slice(), &[4]);
    });
    drop(lease);
  }

  #[test]
  fn offline_repair_conflict_skip_and_strict_remote_denial_whitelist() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 2, 2],
      })
      .await
      .unwrap();
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .unwrap();
      db.ensure_schema_ready().await.unwrap();

      let (signing_key, pro_pem) = test_keypair(0xAF);
      let keyring = Keyring::with_pro_public_key(pro_pem);
      let gate = CommunityQuotaGate::with_keyring(keyring.clone());
      let stale_at = Utc::now() - Duration::hours(2);

      // State 1: valid onetime license A (30 seats) in installed_licenses (with stale quantity = 15),
      //          existing entitlement row for A has signed_payload = NULL -> check_licenses repairs both!
      let owner_id = Uuid::new_v4().to_string();
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Repair Owner', 'repair-owner@example.com')")
        .bind(&owner_id)
        .execute(db.pool())
        .await
        .unwrap();
      let ws_repair = "ws-repair";
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(ws_repair)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(ws_repair)
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
      let lic_a_30 = sign_v2_license(&signing_key, "lic-a-30", ws_repair, "selfhost_team", 30);
      sqlx::query(
        "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
         VALUES ('lic-a-30', $1, 15, 'monthly', 'onetime', $2, $3, $2, $4, $5)",
      )
      .bind(ws_repair)
      .bind(stale_at)
      .bind(Uuid::new_v4().to_string())
      .bind(Utc::now() + Duration::days(30))
      .bind(&lic_a_30)
      .execute(db.pool())
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
         VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-a-30', 'selfhost_team', 'active', 15, NULL, $3, $4, $4)",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(ws_repair)
      .bind(Utc::now() + Duration::days(30))
      .bind(stale_at)
      .execute(db.pool())
      .await
      .unwrap();

      // State 2: stale onetime A (15 seats) in installed_licenses while entitlements has active B (40 seats) ->
      //          check_licenses must NOT revoke B!
      let ws_conflict = "ws-conflict";
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(ws_conflict)
        .execute(db.pool())
        .await
        .unwrap();
      let lic_a_15 = sign_v2_license(&signing_key, "lic-stale-a", ws_conflict, "selfhost_team", 15);
      let lic_b_40 = sign_v2_license(&signing_key, "lic-active-b", ws_conflict, "selfhost_team", 40);
      sqlx::query(
        "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
         VALUES ('lic-stale-a', $1, 15, 'lifetime', 'onetime', $2, $3, $2, $4, $5)",
      )
      .bind(ws_conflict)
      .bind(stale_at)
      .bind(Uuid::new_v4().to_string())
      .bind(Utc::now() + Duration::days(30))
      .bind(&lic_a_15)
      .execute(db.pool())
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
         VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-active-b', 'selfhost_team', 'active', 40, $3, $4, $5, $5)",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(ws_conflict)
      .bind(&lic_b_40)
      .bind(Utc::now() + Duration::days(30))
      .bind(Utc::now())
      .execute(db.pool())
      .await
      .unwrap();

      // State 3: typed RemoteHealthOutcome strictly checks (name, data.reason) without string-prefix collision.
      let (base_url, http_handle) = spawn_http_stub(|req| {
        let line = req.lines().next().unwrap_or("");
        if line.contains("/lic-unknown-name/health") {
          (
            400,
            vec![("content-type".into(), "application/json".into())],
            b"{\"name\":\"UNKNOWN_ERROR\",\"data\":{\"reason\":\"remote_denial:license_unbound\"}}".to_vec(),
          )
        } else if line.contains("/lic-msg-only/health") {
          (
            400,
            vec![("content-type".into(), "application/json".into())],
            b"{\"name\":\"INVALID_LICENSE_TO_ACTIVATE\",\"message\":\"remote_denial:license_unbound\"}".to_vec(),
          )
        } else {
          (
            400,
            vec![("content-type".into(), "application/json".into())],
            b"{\"name\":\"INVALID_LICENSE_TO_ACTIVATE\",\"message\":\"bad\",\"data\":{\"reason\":\"license_unbound\"}}".to_vec(),
          )
        }
      })
      .await;

      let http_client = Arc::new(ReqwestSelfhostLicenseClient::new(base_url));
      assert!(http_client.health("lic-unknown-name", "vk", "ws").await.is_err());
      assert!(http_client.health("lic-msg-only", "vk", "ws").await.is_err());
      let exact_outcome = http_client.health("lic-exact-denial", "vk", "ws").await.unwrap();
      assert!(matches!(
        exact_outcome,
        RemoteHealthOutcome::Denied {
          status: "revoked",
          ref reason,
          ..
        } if reason == "license_unbound"
      ));

      for (ws, key) in [
        ("ws-deny-1", "lic-unknown-name"),
        ("ws-deny-2", "lic-msg-only"),
        ("ws-deny-3", "lic-exact-denial"),
      ] {
        sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
          .bind(ws)
          .execute(db.pool())
          .await
          .unwrap();
        let env = sign_v2_license(&signing_key, key, ws, "selfhost_team", 25);
        sqlx::query(
          "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
           VALUES ($1, $2, 25, 'monthly', NULL, $3, $4, $3, $5, $6)",
        )
        .bind(key)
        .bind(ws)
        .bind(stale_at)
        .bind(Uuid::new_v4().to_string())
        .bind(Utc::now() + Duration::days(30))
        .bind(&env)
        .execute(db.pool())
        .await
        .unwrap();
        sqlx::query(
          "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
           VALUES ($1, 'workspace', $2, 'selfhost_license', $3, 'selfhost_team', 'active', 25, $4, $5, $6, $6)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(ws)
        .bind(key)
        .bind(&env)
        .bind(Utc::now() + Duration::days(30))
        .bind(stale_at)
        .execute(db.pool())
        .await
        .unwrap();
      }

      let svc = SelfhostLicenseService::new(
        db.clone(),
        Arc::new(gate.clone()),
        Arc::new(NoopEventPublisher::default()),
      )
      .with_keyring(keyring)
      .with_client(http_client);

      svc.check_licenses().await.unwrap();

      // Verify State 1: signed_payload repaired, installed_licenses.quantity synced to 30, and gate resolves 30 seats.
      let repaired_payload: Option<Vec<u8>> = sqlx::query_scalar(
        "SELECT signed_payload FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND subject_id = 'lic-a-30'",
      )
      .bind(ws_repair)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert!(repaired_payload.as_deref().is_some_and(|b| b.starts_with(b"{")));
      let repaired_installed = svc.get_license(&owner_id, ws_repair).await.unwrap().unwrap();
      assert_eq!(repaired_installed.quantity, 30);
      assert_eq!(repaired_installed.recurring, "yearly");
      {
        let mut tx = db.pool().begin().await.unwrap();
        assert_eq!(gate.resolve_workspace_grant(&mut tx, ws_repair, Utc::now()).await.unwrap().limits.seat_limit, 30);
        tx.rollback().await.unwrap();
      }

      // Verify State 2: active B was NOT revoked and gate still resolves 40 seats.
      let b_status: String = sqlx::query_scalar(
        "SELECT status FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND subject_id = 'lic-active-b'",
      )
      .bind(ws_conflict)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(b_status, "active");
      {
        let mut tx = db.pool().begin().await.unwrap();
        assert_eq!(gate.resolve_workspace_grant(&mut tx, ws_conflict, Utc::now()).await.unwrap().limits.seat_limit, 40);
        tx.rollback().await.unwrap();
      }

      // Verify State 3: unknown name & message-only stay active; exact (INVALID_LICENSE_TO_ACTIVATE, data.reason) revoked!
      let s1: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE target_id = 'ws-deny-1'")
        .fetch_one(db.pool())
        .await
        .unwrap();
      let s2: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE target_id = 'ws-deny-2'")
        .fetch_one(db.pool())
        .await
        .unwrap();
      let s3: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE target_id = 'ws-deny-3'")
        .fetch_one(db.pool())
        .await
        .unwrap();
      assert_eq!(s1, "active");
      assert_eq!(s2, "active");
      assert_eq!(s3, "revoked");

      // State 4: commercial workspace V2 license with `expires_at: None` must preserve
      //          existing DB row `expired_at` / `expires_at` deadlines on offline scan (COALESCE).
      let ws_no_sig_exp = "ws-no-sig-exp";
      let row_deadline =
        DateTime::from_timestamp_millis((Utc::now() + Duration::days(10)).timestamp_millis()).unwrap();
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(ws_no_sig_exp)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(ws_no_sig_exp)
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
      let no_exp_claims = LicenseClaimsV2 {
        format_version: 2,
        kid: PRO_KID.to_owned(),
        license_id: "lic-no-sig-exp".to_owned(),
        audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
        scope: LicenseScopeV2 {
          kind: "workspace".to_owned(),
          workspace_id: Some(ws_no_sig_exp.to_owned()),
        },
        tier: "selfhost_team".to_owned(),
        limits: LicenseLimitsV2 {
          blob_limit_bytes: 524_288_000,
          storage_quota_bytes: 1_099_511_627_776,
          seat_limit: 30,
          seat_quota_bytes: None,
          history_period_seconds: 31_536_000,
          copilot_action_limit: None,
        },
        rights: LicenseRightsV2 {
          commercial: true,
          copilot_byok: true,
          unlimited_copilot: false,
        },
        recurring: Some("lifetime".to_owned()),
        issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
        not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
        expires_at: None,
      };
      let no_exp_sig: DerSignature = signing_key.sign(&serde_json::to_vec(&no_exp_claims).unwrap());
      let no_exp_bytes = serde_json::to_vec(&LicenseEnvelopeV2 {
        claims: no_exp_claims,
        signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, no_exp_sig.as_bytes()),
      })
      .unwrap();
      sqlx::query(
        "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
         VALUES ('lic-no-sig-exp', $1, 30, 'lifetime', 'onetime', $2, $3, $2, $4, $5)",
      )
      .bind(ws_no_sig_exp)
      .bind(stale_at)
      .bind(Uuid::new_v4().to_string())
      .bind(row_deadline)
      .bind(&no_exp_bytes)
      .execute(db.pool())
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
         VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-no-sig-exp', 'selfhost_team', 'active', 30, $3, $4, $5, $5)",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(ws_no_sig_exp)
      .bind(&no_exp_bytes)
      .bind(row_deadline)
      .bind(stale_at)
      .execute(db.pool())
      .await
      .unwrap();

      svc.check_licenses().await.unwrap();
      assert_eq!(
        svc.get_license(&owner_id, ws_no_sig_exp).await.unwrap().unwrap().expired_at,
        Some(row_deadline)
      );
      {
        let mut tx = db.pool().begin().await.unwrap();
        assert_eq!(
          gate
            .resolve_workspace_grant(&mut tx, ws_no_sig_exp, row_deadline - Duration::seconds(1))
            .await
            .unwrap()
            .limits
            .seat_limit,
          30
        );
        assert_eq!(
          gate
            .resolve_workspace_grant(&mut tx, ws_no_sig_exp, row_deadline)
            .await
            .unwrap()
            .limits
            .seat_limit,
          10
        );
        tx.rollback().await.unwrap();
      }

      http_handle.abort();
    });
    drop(lease);
  }
}
