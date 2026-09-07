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
    for pending in self
      .list_pending_license_deactivations_v1(Some(workspace_id.clone()))
      .await?
    {
      self.retry_pending_license_deactivation(&pending.key).await?;
    }
    let operation_id = uuid::Uuid::new_v4().to_string();
    self
      .prepare_license_activation_v1(workspace_id.clone(), license_key.clone(), operation_id.clone())
      .await?;
    let request = crate::license::LicenseKeyRequest {
      license_key: license_key.clone(),
      workspace_id: Some(workspace_id.clone()),
      validate_key: Some(operation_id.clone()),
    };
    let response = match tokio::task::spawn_blocking(move || crate::license::activate_license_request(&request)).await {
      Ok(Ok(response)) => response,
      Ok(Err(_)) => {
        self.compensate_license_activation(&license_key, &operation_id).await?;
        return Err(RuntimeError::invalid_state("license request failed").into());
      }
      Err(_) => {
        self.compensate_license_activation(&license_key, &operation_id).await?;
        return Err(RuntimeError::invalid_state("license request failed").into());
      }
    };
    if let Some(error) = response.error {
      let rejected = error.status < 500;
      if rejected {
        if !self
          .finish_license_deactivation_v1(license_key.clone(), operation_id.clone(), true)
          .await?
        {
          return Err(Error::new(
            Status::GenericFailure,
            "License activation recovery lease was lost.",
          ));
        }
      } else {
        self.compensate_license_activation(&license_key, &operation_id).await?;
      }
      return Err(remote_error(error));
    }
    let Some(remote) = response.license else {
      self.compensate_license_activation(&license_key, &operation_id).await?;
      return Err(Error::new(
        Status::GenericFailure,
        "Invalid AFFiNE Pro license response.",
      ));
    };
    if remote.validate_key != operation_id {
      self.compensate_license_activation(&license_key, &operation_id).await?;
      return Err(Error::new(
        Status::GenericFailure,
        "Invalid license activation generation.",
      ));
    }
    let result = self
      .install_license_v1(RuntimeLicenseInstallInput {
        workspace_id,
        license: remote.envelope,
        key: Some(license_key.clone()),
        validate_key: remote.validate_key,
        recurring: remote.recurring,
        activation: true,
      })
      .await;
    if result.is_err() {
      self.compensate_license_activation(&license_key, &operation_id).await?;
    }
    result
  }

  #[napi]
  pub async fn remove_team_license_v1(&self, workspace_id: String) -> Result<Option<RuntimeLicenseChange>> {
    let Some(license) = self.get_installed_license_v1(workspace_id.clone()).await? else {
      return Ok(None);
    };
    let recurring = license.recurring.clone();
    let remote = license.variant.as_deref() != Some("onetime");
    if !self
      .revoke_installed_license_v1(
        license.workspace_id.clone(),
        license.key.clone(),
        license.validate_key.clone(),
        remote,
      )
      .await?
    {
      return Ok(None);
    }
    if remote {
      let _ = self.retry_pending_license_deactivation(&license.key).await;
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
    let request = crate::license::LicenseRecurringRequest {
      license_key: key,
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
      validate_key: None,
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
  pub async fn update_team_license_seats_v1(&self, workspace_id: String) -> Result<Option<RuntimeInstalledLicense>> {
    let Some(license) = self.get_installed_license_v1(workspace_id.clone()).await? else {
      return Ok(None);
    };
    if license.variant.as_deref() == Some("onetime") {
      return Ok(None);
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
      seats: u32::try_from(seats).map_err(|_| RuntimeError::invalid_state("license seat count is invalid"))?,
    };
    let response = tokio::task::spawn_blocking(move || crate::license::update_license_seats_request(&request))
      .await
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?;
    remote_command(response)?;
    for attempt in 1..=10 {
      if let Ok(Some(refreshed)) = self.refresh_recurring_license(&license).await
        && refreshed.quantity == seats as i32
      {
        return Ok(Some(refreshed));
      }
      if attempt < 10 {
        tokio::time::sleep(std::time::Duration::from_millis(attempt * 2_000)).await;
      }
    }
    Err(Error::new(
      Status::GenericFailure,
      "Timeout checking seat update result.",
    ))
  }

  #[napi]
  pub async fn check_licenses_v1(&self) -> Result<Vec<RuntimeLicenseChange>> {
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
      return Ok(Vec::new());
    }
    let result = self.check_licenses_unlocked().await;
    lock
      .rollback()
      .await
      .map_err(|error| RuntimeError::database("release license health scan lease", error))?;
    result
  }
}

impl BackendRuntime {
  async fn check_licenses_unlocked(&self) -> Result<Vec<RuntimeLicenseChange>> {
    let mut transient_failure = false;
    for pending in self.list_pending_license_deactivations_v1(None).await? {
      if self.retry_pending_license_deactivation(&pending.key).await.is_err() {
        transient_failure = true;
      }
    }
    let rows = sqlx::query(
      "SELECT * FROM installed_licenses WHERE validated_at<=clock_timestamp()-INTERVAL '1 hour' ORDER BY workspace_id",
    )
    .fetch_all(&self.pool().await?)
    .await
    .map_err(|error| RuntimeError::database("load licenses for health check", error))?;
    let mut changes = Vec::new();
    for row in rows {
      let license = installed(row);
      if license.variant.as_deref() == Some("onetime") {
        match license.license.as_ref() {
          Some(payload) => {
            let refreshed = self
              .refresh_license_v1(RuntimeLicenseRefreshInput {
                workspace_id: license.workspace_id.clone(),
                key: license.key.clone(),
                expected_validate_key: license.validate_key.clone(),
                validate_key: license.validate_key.clone(),
                recurring: license.recurring.clone(),
                license: Buffer::from(payload.as_ref().to_vec()),
                onetime: true,
              })
              .await;
            match refreshed {
              Ok(Some(refreshed)) => changes.push(activated_change(&refreshed)),
              Ok(None) => {}
              Err(error) if error.status == Status::GenericFailure => transient_failure = true,
              Err(_) => {
                if self
                  .revoke_installed_license_v1(
                    license.workspace_id.clone(),
                    license.key.clone(),
                    license.validate_key.clone(),
                    false,
                  )
                  .await?
                {
                  changes.push(canceled_change(&license));
                }
              }
            }
          }
          None => {
            if self
              .revoke_installed_license_v1(
                license.workspace_id.clone(),
                license.key.clone(),
                license.validate_key.clone(),
                false,
              )
              .await?
            {
              changes.push(canceled_change(&license));
            }
          }
        }
      } else {
        match self.refresh_recurring_license(&license).await {
          Ok(Some(refreshed)) => changes.push(activated_change(&refreshed)),
          Ok(None) => {}
          Err(error) if error.status == Status::GenericFailure => transient_failure = true,
          Err(_) => {
            if self
              .revoke_installed_license_v1(
                license.workspace_id.clone(),
                license.key.clone(),
                license.validate_key.clone(),
                false,
              )
              .await?
            {
              changes.push(canceled_change(&license));
            }
          }
        }
      }
    }
    if transient_failure {
      return Err(Error::new(
        Status::GenericFailure,
        "One or more license health checks were temporarily unavailable.",
      ));
    }
    Ok(changes)
  }
}

impl BackendRuntime {
  async fn compensate_license_activation(&self, key: &str, operation_id: &str) -> Result<()> {
    if !self
      .finish_license_deactivation_v1(key.to_string(), operation_id.to_string(), false)
      .await?
    {
      return Err(Error::new(
        Status::GenericFailure,
        "License activation recovery lease was lost.",
      ));
    }
    self.retry_pending_license_deactivation(key).await
  }

  async fn retry_pending_license_deactivation(&self, key: &str) -> Result<()> {
    let claim_id = uuid::Uuid::new_v4().to_string();
    let pending = self
      .claim_license_deactivation_v1(key.to_string(), claim_id.clone())
      .await?
      .ok_or_else(|| Error::new(Status::GenericFailure, "License operation is already in progress."))?;
    let request = crate::license::LicenseKeyRequest {
      license_key: key.to_string(),
      workspace_id: None,
      validate_key: Some(pending.operation_id),
    };
    let result = match tokio::task::spawn_blocking(move || crate::license::deactivate_license_request(&request)).await {
      Ok(Ok(response)) => match response.error {
        Some(error) if error.status >= 500 => Err(remote_error(error)),
        _ => Ok(()),
      },
      Ok(Err(_)) | Err(_) => Err(RuntimeError::invalid_state("license request failed").into()),
    };
    self
      .finish_license_deactivation_v1(key.to_string(), claim_id, result.is_ok())
      .await?;
    result
  }

  async fn refresh_recurring_license(
    &self,
    license: &RuntimeInstalledLicense,
  ) -> Result<Option<RuntimeInstalledLicense>> {
    let request = crate::license::LicenseHealthRequest {
      license_key: license.key.clone(),
      validate_key: license.validate_key.clone(),
    };
    let response = tokio::task::spawn_blocking(move || crate::license::check_license_health_request(&request))
      .await
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?
      .map_err(|_| RuntimeError::invalid_state("license request failed"))?;
    let remote = remote_license(response)?;
    let validate_key = if remote.validate_key.is_empty() {
      license.validate_key.clone()
    } else {
      remote.validate_key
    };
    self
      .refresh_license_v1(RuntimeLicenseRefreshInput {
        workspace_id: license.workspace_id.clone(),
        key: license.key.clone(),
        expected_validate_key: license.validate_key.clone(),
        validate_key,
        recurring: remote.recurring,
        license: remote.envelope,
        onetime: false,
      })
      .await
  }
}

fn remote_error(error: crate::license::LicenseError) -> Error {
  Error::new(
    if error.status >= 500 {
      Status::GenericFailure
    } else {
      Status::InvalidArg
    },
    error.body,
  )
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
