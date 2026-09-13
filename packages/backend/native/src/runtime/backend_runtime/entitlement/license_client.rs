use napi::{Error, Result, Status, bindgen_prelude::Buffer};

use super::{
  BackendRuntime, RuntimeError, RuntimeInstalledLicense, RuntimeLicenseInstallInput, RuntimeLicenseRefreshInput,
  installed,
};

#[napi_derive::napi(object)]
pub struct RuntimeLicenseChange {
  pub workspace_id: String,
  pub recurring: String,
  pub quantity: Option<i32>,
  pub canceled: bool,
}

#[napi_derive::napi(object)]
pub struct RuntimeLicenseHealthResult {
  pub changes: Vec<RuntimeLicenseChange>,
  pub transient_failure: bool,
}

#[napi_derive::napi(object)]
pub struct RuntimeLicenseSeatUpdateResult {
  pub status: String,
  pub license: Option<RuntimeInstalledLicense>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn install_team_license_file_v1(
    &self,
    workspace_id: String,
    license: Buffer,
  ) -> Result<RuntimeInstalledLicense> {
    self
      .install_license_v1(RuntimeLicenseInstallInput {
        workspace_id,
        license,
        key: None,
        validate_key: uuid::Uuid::new_v4().to_string(),
        recurring: "lifetime".into(),
        activation: false,
      })
      .await
  }

  #[napi]
  pub async fn activate_team_license_v1(
    &self,
    workspace_id: String,
    license_key: String,
  ) -> Result<RuntimeInstalledLicense> {
    if let Some(installed) = self.get_installed_license_v1(workspace_id.clone()).await? {
      if installed.key != license_key || installed.variant.as_deref() == Some("onetime") {
        return Err(Error::new(Status::InvalidArg, "workspace_license_already_exists"));
      }
      return self
        .refresh_recurring_license(&installed)
        .await?
        .ok_or_else(|| Error::new(Status::InvalidArg, "license_generation_changed"));
    }
    if let Some(previous) = self.installed_license_for_key(&license_key).await?
      && previous.workspace_id != workspace_id
    {
      return Err(Error::new(Status::InvalidArg, "license_already_activated"));
    }
    let operation_id = uuid::Uuid::new_v4().to_string();
    let request = crate::license::LicenseKeyRequest {
      license_key: license_key.clone(),
      workspace_id: Some(workspace_id.clone()),
      validate_key: Some(operation_id.clone()),
    };
    let response = match tokio::task::spawn_blocking(move || crate::license::activate_license_request(&request)).await {
      Ok(Ok(response)) => response,
      Ok(Err(_)) | Err(_) => return Err(RuntimeError::invalid_state("license request failed").into()),
    };
    let remote = remote_license(response)?;
    self
      .install_license_v1(RuntimeLicenseInstallInput {
        workspace_id,
        license: remote.envelope,
        key: Some(license_key),
        validate_key: remote.validate_key,
        recurring: remote.recurring,
        activation: true,
      })
      .await
  }

  #[napi]
  pub async fn remove_team_license_v1(&self, workspace_id: String) -> Result<Option<RuntimeLicenseChange>> {
    let Some(license) = self.get_installed_license_v1(workspace_id.clone()).await? else {
      return Ok(None);
    };
    let recurring = license.recurring.clone();
    let remote = license.variant.as_deref() != Some("onetime");
    if remote {
      self
        .deactivate_remote_license(&license.key, &license.validate_key)
        .await?;
    }
    if !self
      .revoke_installed_license_v1(
        license.workspace_id.clone(),
        license.key.clone(),
        license.validate_key.clone(),
      )
      .await?
    {
      return Ok(None);
    }
    Ok(Some(RuntimeLicenseChange {
      workspace_id,
      recurring,
      quantity: None,
      canceled: true,
    }))
  }

  #[napi]
  pub async fn update_team_license_recurring_v1(&self, key: String, recurring: String) -> Result<()> {
    let license = self
      .installed_license_for_key(&key)
      .await?
      .ok_or_else(|| Error::new(Status::InvalidArg, "license_not_found"))?;
    let request = crate::license::LicenseRecurringRequest {
      license_key: key,
      validate_key: license.validate_key,
      recurring,
    };
    let response = tokio::task::spawn_blocking(move || crate::license::update_license_recurring_request(&request))
      .await
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?;
    remote_command(response)
  }

  #[napi]
  pub async fn create_team_license_portal_v1(&self, workspace_id: String) -> Result<String> {
    let license = self
      .get_installed_license_v1(workspace_id)
      .await?
      .ok_or_else(|| Error::new(Status::InvalidArg, "license_not_found"))?;
    let request = crate::license::LicenseKeyRequest {
      license_key: license.key,
      workspace_id: None,
      validate_key: Some(license.validate_key),
    };
    let response =
      tokio::task::spawn_blocking(move || crate::license::create_license_customer_portal_request(&request))
        .await
        .map_err(|_| RuntimeError::invalid_state("license request failed"))?
        .map_err(|_| RuntimeError::invalid_state("license request failed"))?;
    if let Some(error) = response.error {
      return Err(remote_error(error));
    }
    response
      .url
      .ok_or_else(|| Error::new(Status::GenericFailure, "Invalid AFFiNE Pro portal response."))
  }

  #[napi]
  pub async fn update_team_license_seats_v1(&self, workspace_id: String) -> Result<RuntimeLicenseSeatUpdateResult> {
    let Some(license) = self.get_installed_license_v1(workspace_id.clone()).await? else {
      return Ok(RuntimeLicenseSeatUpdateResult {
        status: "not_applicable".into(),
        license: None,
      });
    };
    if license.variant.as_deref() == Some("onetime") {
      return Ok(RuntimeLicenseSeatUpdateResult {
        status: "not_applicable".into(),
        license: None,
      });
    }
    let statuses = affine_core::access_control::InvitationStatus::CHARGEABLE
      .map(affine_core::access_control::InvitationStatus::as_str);
    let seats: i64 = sqlx::query_scalar(
      "SELECT (SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND state='active') + (SELECT count(*) \
       FROM workspace_invitations WHERE workspace_id=$1 AND status=ANY($2))",
    )
    .bind(&workspace_id)
    .bind(statuses.as_slice())
    .fetch_one(&self.pool().await?)
    .await
    .map_err(|error| RuntimeError::database("count license seats", error))?;
    let request = crate::license::LicenseSeatsRequest {
      license_key: license.key.clone(),
      validate_key: license.validate_key.clone(),
      seats: u32::try_from(seats).map_err(|_| RuntimeError::invalid_state("license seat count is invalid"))?,
    };
    let response = tokio::task::spawn_blocking(move || crate::license::update_license_seats_request(&request))
      .await
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?;
    remote_command(response)?;
    sqlx::query(
      "UPDATE installed_licenses SET validated_at=LEAST(validated_at,clock_timestamp()-INTERVAL '1 hour') WHERE \
       workspace_id=$1 AND key=$2 AND validate_key=$3",
    )
    .bind(&license.workspace_id)
    .bind(&license.key)
    .bind(&license.validate_key)
    .execute(&self.pool().await?)
    .await
    .map_err(|error| RuntimeError::database("schedule pending license seat confirmation", error))?;
    Ok(RuntimeLicenseSeatUpdateResult {
      status: "pending".into(),
      license: None,
    })
  }

  #[napi]
  pub async fn check_licenses_v1(&self) -> Result<RuntimeLicenseHealthResult> {
    self.check_licenses(false).await
  }
}

impl BackendRuntime {
  pub(in crate::runtime::backend_runtime) async fn check_licenses(
    &self,
    only_unadmitted: bool,
  ) -> Result<RuntimeLicenseHealthResult> {
    let pool = self.pool().await?;
    let mut lock = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin license health scan lease", error))?;
    let acquired: bool =
      sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended('affine:license-health-scan',0))")
        .fetch_one(&mut *lock)
        .await
        .map_err(|error| RuntimeError::database("acquire license health scan lease", error))?;
    if !acquired {
      return Ok(RuntimeLicenseHealthResult {
        changes: Vec::new(),
        transient_failure: false,
      });
    }
    let mut transient_failure = false;
    let rows = sqlx::query(
      "SELECT * FROM installed_licenses WHERE (NOT $1 AND validated_at<=clock_timestamp()-INTERVAL '1 hour') OR \
       (variant IS DISTINCT FROM 'onetime' AND license IS NULL) ORDER BY workspace_id",
    )
    .bind(only_unadmitted)
    .fetch_all(&pool)
    .await
    .map_err(|error| RuntimeError::database("load licenses for health check", error))?;
    let mut changes = Vec::new();
    for row in rows {
      let license = installed(row);
      if license.variant.as_deref() == Some("onetime") {
        match self.check_offline_license(&license).await {
          Ok(Some(change)) => changes.push(change),
          Ok(None) => {}
          Err(_) => transient_failure = true,
        }
      } else {
        match self.refresh_recurring_license(&license).await {
          Ok(Some(refreshed)) => changes.push(activated_change(&refreshed)),
          Ok(None) => {}
          Err(error) => {
            if let Some(status) = remote_denial_status(&error) {
              if self.record_license_denial(&license, status, &error.reason).await? {
                changes.push(canceled_change(&license));
              }
            } else {
              transient_failure = true;
            }
          }
        }
      }
    }
    lock
      .rollback()
      .await
      .map_err(|error| RuntimeError::database("release license health scan lease", error))?;
    Ok(RuntimeLicenseHealthResult {
      changes,
      transient_failure,
    })
  }
}

impl BackendRuntime {
  async fn installed_license_for_key(&self, key: &str) -> Result<Option<RuntimeInstalledLicense>> {
    let row = sqlx::query("SELECT * FROM installed_licenses WHERE key=$1")
      .bind(key)
      .fetch_optional(&self.pool().await?)
      .await
      .map_err(|error| RuntimeError::database("load installed license by key", error))?;
    Ok(row.map(installed))
  }

  async fn deactivate_remote_license(&self, key: &str, validate_key: &str) -> Result<()> {
    let request = crate::license::LicenseKeyRequest {
      license_key: key.to_string(),
      workspace_id: None,
      validate_key: Some(validate_key.to_string()),
    };
    let response = tokio::task::spawn_blocking(move || crate::license::deactivate_license_request(&request))
      .await
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?;
    remote_command(response)
  }

  async fn refresh_recurring_license(
    &self,
    license: &RuntimeInstalledLicense,
  ) -> Result<Option<RuntimeInstalledLicense>> {
    let request = crate::license::LicenseHealthRequest {
      license_key: license.key.clone(),
      validate_key: license.validate_key.clone(),
      workspace_id: license.workspace_id.clone(),
    };
    let response = tokio::task::spawn_blocking(move || crate::license::check_license_health_request(&request))
      .await
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?;
    let remote = remote_license(response)?;
    if remote.validate_key != license.validate_key {
      return Err(Error::new(
        Status::GenericFailure,
        "license_protocol_generation_changed",
      ));
    }
    self
      .refresh_license_v1(RuntimeLicenseRefreshInput {
        workspace_id: license.workspace_id.clone(),
        key: license.key.clone(),
        expected_validate_key: license.validate_key.clone(),
        recurring: remote.recurring,
        license: remote.envelope,
      })
      .await
  }
}

fn remote_error(error: crate::license::LicenseError) -> Error {
  Error::new(
    if error.status >= 500 || matches!(error.status, 408 | 429) {
      Status::GenericFailure
    } else {
      Status::InvalidArg
    },
    error.body,
  )
}

fn remote_denial_status(error: &Error) -> Option<&'static str> {
  if error.status != Status::InvalidArg {
    return None;
  }
  let body: serde_json::Value = serde_json::from_str(&error.reason).ok()?;
  match body.get("name")?.as_str()? {
    "LICENSE_EXPIRED" => Some("expired"),
    "LICENSE_NOT_FOUND" => Some("revoked"),
    "INVALID_LICENSE_TO_ACTIVATE"
      if matches!(
        body.pointer("/data/reason")?.as_str()?,
        "invalid_validate_key" | "license_unbound" | "license_workspace_mismatch"
      ) =>
    {
      Some("revoked")
    }
    _ => None,
  }
}

fn remote_license(response: crate::license::LicenseResponse) -> Result<crate::license::LicenseInfo> {
  if let Some(error) = response.error {
    return Err(remote_error(error));
  }
  response
    .license
    .ok_or_else(|| Error::new(Status::GenericFailure, "Invalid AFFiNE Pro license response."))
}

fn remote_command(response: crate::license::CommandResponse) -> Result<()> {
  match response.error {
    Some(error) => Err(remote_error(error)),
    None => Ok(()),
  }
}

fn activated_change(license: &RuntimeInstalledLicense) -> RuntimeLicenseChange {
  RuntimeLicenseChange {
    workspace_id: license.workspace_id.clone(),
    recurring: license.recurring.clone(),
    quantity: Some(license.quantity),
    canceled: false,
  }
}

fn canceled_change(license: &RuntimeInstalledLicense) -> RuntimeLicenseChange {
  RuntimeLicenseChange {
    workspace_id: license.workspace_id.clone(),
    recurring: license.recurring.clone(),
    quantity: None,
    canceled: true,
  }
}
