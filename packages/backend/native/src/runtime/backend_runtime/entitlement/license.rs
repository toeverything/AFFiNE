use affine_core::access_control::LicenseVerifier;
use chrono::{DateTime, Utc};
use napi::{Error, Result, Status, bindgen_prelude::Buffer};
use sqlx::{Postgres, Row, Transaction};

use super::{
  AFFINE_PRO_PUBLIC_KEY, BackendRuntime, EntitlementWrite, RuntimeEntitlementTarget, RuntimeError, RuntimeResult,
  apply_transitions, load_decision_time, lock_sources, lock_targets, publish_changes, transition_before, upsert,
};

const LICENSE_OPERATION_LEASE_SECONDS: i32 = 60;

pub(super) struct RuntimeLicenseInstallInput {
  pub(super) workspace_id: String,
  pub(super) license: Buffer,
  pub(super) key: Option<String>,
  pub(super) validate_key: String,
  pub(super) recurring: String,
  pub(super) activation: bool,
}

pub(super) struct RuntimeLicenseRefreshInput {
  pub(super) workspace_id: String,
  pub(super) key: String,
  pub(super) expected_validate_key: String,
  pub(super) validate_key: String,
  pub(super) recurring: String,
  pub(super) license: Buffer,
  pub(super) onetime: bool,
}

#[napi_derive::napi(object)]
pub struct RuntimeInstalledLicense {
  pub key: String,
  pub workspace_id: String,
  pub quantity: i32,
  pub recurring: String,
  pub variant: Option<String>,
  pub validate_key: String,
  pub validated_at: String,
  pub expired_at: Option<String>,
  pub installed_at: String,
  pub license: Option<Buffer>,
}

pub(super) struct RuntimePendingLicenseDeactivation {
  pub(super) key: String,
  pub(super) operation_id: String,
}

pub(super) fn installed(row: sqlx::postgres::PgRow) -> RuntimeInstalledLicense {
  RuntimeInstalledLicense {
    key: row.get("key"),
    workspace_id: row.get("workspace_id"),
    quantity: row.get("quantity"),
    recurring: row.get("recurring"),
    variant: row.get("variant"),
    validate_key: row.get("validate_key"),
    validated_at: row.get::<DateTime<Utc>, _>("validated_at").to_rfc3339(),
    expired_at: row
      .get::<Option<DateTime<Utc>>, _>("expired_at")
      .map(|v| v.to_rfc3339()),
    installed_at: row.get::<DateTime<Utc>, _>("installed_at").to_rfc3339(),
    license: row.get::<Option<Vec<u8>>, _>("license").map(Buffer::from),
  }
}

async fn lock_license(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  new_subject: Option<&str>,
) -> RuntimeResult<Vec<String>> {
  let subjects: Vec<String> = sqlx::query_scalar(
    "SELECT subject_id FROM entitlements WHERE source='selfhost_license' AND target_type='workspace' AND target_id=$1 \
     AND subject_id IS NOT NULL ORDER BY subject_id",
  )
  .bind(workspace_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| RuntimeError::database("read license subjects", e))?;
  let sources = subjects
    .iter()
    .map(String::as_str)
    .chain(new_subject)
    .map(|id| format!("selfhost_license:{id}"))
    .collect::<Vec<_>>();
  lock_sources(tx, &sources).await?;
  let owners = lock_targets(
    tx,
    &[RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: workspace_id.into(),
    }],
  )
  .await?;
  let current: Vec<String> = sqlx::query_scalar(
    "SELECT subject_id FROM entitlements WHERE source='selfhost_license' AND target_type='workspace' AND target_id=$1 \
     AND subject_id IS NOT NULL ORDER BY subject_id",
  )
  .bind(workspace_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| RuntimeError::database("verify license subjects", e))?;
  if subjects != current {
    return Err(RuntimeError::invalid_input("license_generation_changed"));
  }
  Ok(owners)
}

fn verify(
  payload: &[u8],
  workspace_id: &str,
  now: DateTime<Utc>,
) -> Result<affine_core::access_control::VerifiedLicenseClaims> {
  let key = AFFINE_PRO_PUBLIC_KEY.ok_or_else(|| Error::new(Status::InvalidArg, "license_public_key_missing"))?;
  LicenseVerifier::verify(payload, key, Some(workspace_id), now)
    .map_err(|e| Error::new(Status::InvalidArg, format!("license_{}", e.code())))
}

async fn revoke_workspace_entitlements(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  now: DateTime<Utc>,
) -> RuntimeResult<()> {
  sqlx::query(
    "UPDATE entitlements SET status='revoked',updated_at=$2 WHERE source='selfhost_license' AND \
     target_type='workspace' AND target_id=$1 AND status IN ('active','grace')",
  )
  .bind(workspace_id)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|e| RuntimeError::database("revoke installed entitlement", e))?;
  Ok(())
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn get_installed_license_v1(&self, workspace_id: String) -> Result<Option<RuntimeInstalledLicense>> {
    let row = sqlx::query("SELECT * FROM installed_licenses WHERE workspace_id=$1")
      .bind(workspace_id)
      .fetch_optional(&self.pool().await?)
      .await
      .map_err(|error| RuntimeError::database("load installed license", error))?;
    Ok(row.map(installed))
  }
}

impl BackendRuntime {
  pub(super) async fn prepare_license_activation_v1(
    &self,
    workspace_id: String,
    key: String,
    operation_id: String,
  ) -> Result<()> {
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin license activation intent", e))?;
    let now = load_decision_time(&mut tx, "license activation intent clock").await?;
    let occupied: bool =
      sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM installed_licenses WHERE workspace_id=$1 OR key=$2)")
        .bind(&workspace_id)
        .bind(&key)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| RuntimeError::database("check license activation conflict", e))?;
    if occupied {
      return Err(Error::new(Status::InvalidArg, "workspace_license_already_exists"));
    }
    sqlx::query(
      "INSERT INTO pending_license_deactivations(key,workspace_id,operation_id,claim_id,claimed_until,updated_at) \
       VALUES($1,$2,$3,$3,$4+make_interval(secs=>$5),$4)",
    )
    .bind(&key)
    .bind(&workspace_id)
    .bind(&operation_id)
    .bind(now)
    .bind(LICENSE_OPERATION_LEASE_SECONDS)
    .execute(&mut *tx)
    .await
    .map_err(|e| RuntimeError::database("create license activation intent", e))?;
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit license activation intent", e))?;
    Ok(())
  }

  pub(super) async fn list_pending_license_deactivations_v1(
    &self,
    workspace_id: Option<String>,
  ) -> Result<Vec<RuntimePendingLicenseDeactivation>> {
    let pool = self.pool().await?;
    let rows = sqlx::query(
      "SELECT key,workspace_id,operation_id FROM pending_license_deactivations WHERE $1::varchar IS NULL OR \
       workspace_id=$1 ORDER BY created_at,key",
    )
    .bind(workspace_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| RuntimeError::database("list pending license deactivations", e))?;
    Ok(
      rows
        .into_iter()
        .map(|row| RuntimePendingLicenseDeactivation {
          key: row.get("key"),
          operation_id: row.get("operation_id"),
        })
        .collect(),
    )
  }

  pub(super) async fn claim_license_deactivation_v1(
    &self,
    key: String,
    claim_id: String,
  ) -> Result<Option<RuntimePendingLicenseDeactivation>> {
    let pool = self.pool().await?;
    let row = sqlx::query(
      "UPDATE pending_license_deactivations SET \
       claim_id=$2,claimed_until=clock_timestamp()+make_interval(secs=>$3),updated_at=clock_timestamp() WHERE key=$1 \
       AND (claimed_until IS NULL OR claimed_until<clock_timestamp()) RETURNING key,workspace_id,operation_id",
    )
    .bind(&key)
    .bind(&claim_id)
    .bind(LICENSE_OPERATION_LEASE_SECONDS)
    .fetch_optional(&pool)
    .await
    .map_err(|e| RuntimeError::database("claim license deactivation", e))?;
    Ok(row.map(|row| RuntimePendingLicenseDeactivation {
      key: row.get("key"),
      operation_id: row.get("operation_id"),
    }))
  }

  pub(super) async fn finish_license_deactivation_v1(
    &self,
    key: String,
    claim_id: String,
    succeeded: bool,
  ) -> Result<bool> {
    let pool = self.pool().await?;
    let affected = if succeeded {
      sqlx::query("DELETE FROM pending_license_deactivations WHERE key=$1 AND claim_id=$2")
        .bind(&key)
        .bind(&claim_id)
        .execute(&pool)
        .await
        .map_err(|e| RuntimeError::database("complete license deactivation", e))?
        .rows_affected()
    } else {
      sqlx::query(
        "UPDATE pending_license_deactivations SET \
         attempts=attempts+1,claim_id=NULL,claimed_until=NULL,updated_at=clock_timestamp() WHERE key=$1 AND \
         claim_id=$2",
      )
      .bind(&key)
      .bind(&claim_id)
      .execute(&pool)
      .await
      .map_err(|e| RuntimeError::database("release license deactivation", e))?
      .rows_affected()
    };
    Ok(affected == 1)
  }

  pub(super) async fn install_license_v1(&self, input: RuntimeLicenseInstallInput) -> Result<RuntimeInstalledLicense> {
    let identity = verify(&input.license, &input.workspace_id, Utc::now())?;
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin license install", e))?;
    let owners = lock_license(&mut tx, &input.workspace_id, Some(identity.license_id())).await?;
    let now = load_decision_time(&mut tx, "license install clock").await?;
    let claims = verify(&input.license, &input.workspace_id, now)?;
    let target = RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: input.workspace_id.clone(),
    };
    let targets = vec![target.clone()];
    let deployment = self.config()?.deployment;
    let before = transition_before(&mut tx, &targets, deployment, now).await?;
    let key = input.key.as_deref().unwrap_or(claims.license_id());
    if input.activation {
      let lease = sqlx::query(
        "UPDATE pending_license_deactivations SET claimed_until=$3+make_interval(secs=>$4),updated_at=$3 WHERE key=$1 \
         AND operation_id=$2 AND claim_id=$2 AND claimed_until>$3",
      )
      .bind(key)
      .bind(&input.validate_key)
      .bind(now)
      .bind(LICENSE_OPERATION_LEASE_SECONDS)
      .execute(&mut *tx)
      .await
      .map_err(|e| RuntimeError::database("renew license activation intent", e))?;
      if lease.rows_affected() != 1 {
        return Err(Error::new(Status::GenericFailure, "License activation lease was lost."));
      }
      let occupied: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM installed_licenses WHERE workspace_id=$1 OR key=$2)")
          .bind(&input.workspace_id)
          .bind(key)
          .fetch_one(&mut *tx)
          .await
          .map_err(|e| RuntimeError::database("check installed license", e))?;
      if occupied {
        return Err(Error::new(Status::InvalidArg, "workspace_license_already_exists"));
      }
    }
    let variant = (!input.activation).then_some("onetime");
    let row = sqlx::query(
      "INSERT INTO \
       installed_licenses(key,workspace_id,quantity,recurring,variant,validate_key,validated_at,expired_at,license) \
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(workspace_id) DO UPDATE SET \
       key=EXCLUDED.key,quantity=EXCLUDED.quantity,recurring=EXCLUDED.recurring,variant=EXCLUDED.variant,\
       validate_key=EXCLUDED.validate_key,validated_at=EXCLUDED.validated_at,expired_at=EXCLUDED.expired_at,\
       license=EXCLUDED.license RETURNING *",
    )
    .bind(key)
    .bind(&input.workspace_id)
    .bind(claims.seat_quantity())
    .bind(&input.recurring)
    .bind(variant)
    .bind(&input.validate_key)
    .bind(now)
    .bind(claims.expires_at())
    .bind(input.license.as_ref())
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| RuntimeError::database("install license row", e))?;
    revoke_workspace_entitlements(&mut tx, &input.workspace_id, now).await?;
    upsert(&mut tx,EntitlementWrite{target:&target,source:"selfhost_license",subject_id:claims.license_id(),plan:"selfhost_team",status:"active",quantity:Some(claims.seat_quantity()),payload:Some(input.license.as_ref()),metadata:serde_json::json!({"recurring":input.recurring,"validateKey":input.validate_key,"variant":variant,"errorCode":null,"errorMessage":null}),starts_at:None,expires_at:Some(claims.expires_at()),grace_until:None},now).await?;
    if input.activation {
      let completed = sqlx::query("DELETE FROM pending_license_deactivations WHERE key=$1 AND operation_id=$2")
        .bind(key)
        .bind(&input.validate_key)
        .execute(&mut *tx)
        .await
        .map_err(|e| RuntimeError::database("complete license activation intent", e))?;
      if completed.rows_affected() != 1 {
        return Err(Error::new(Status::GenericFailure, "License activation lease was lost."));
      }
    }
    apply_transitions(&mut tx, &before, deployment, now).await?;
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit license install", e))?;
    publish_changes(self, &targets, &owners).await;
    Ok(installed(row))
  }

  pub(super) async fn refresh_license_v1(
    &self,
    input: RuntimeLicenseRefreshInput,
  ) -> Result<Option<RuntimeInstalledLicense>> {
    let pool = self.pool().await?;
    let current: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM installed_licenses WHERE workspace_id=$1 AND key=$2 AND validate_key=$3)",
    )
    .bind(&input.workspace_id)
    .bind(&input.key)
    .bind(&input.expected_validate_key)
    .fetch_one(&pool)
    .await
    .map_err(|e| RuntimeError::database("check license refresh generation", e))?;
    if !current {
      return Ok(None);
    }
    let identity = verify(&input.license, &input.workspace_id, Utc::now())?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin license refresh", e))?;
    let owners = lock_license(&mut tx, &input.workspace_id, Some(identity.license_id())).await?;
    let now = load_decision_time(&mut tx, "license refresh clock").await?;
    let claims = verify(&input.license, &input.workspace_id, now)?;
    let active_subjects: Vec<String> = sqlx::query_scalar(
      "SELECT subject_id FROM entitlements WHERE source='selfhost_license' AND target_type='workspace' AND \
       target_id=$1 AND status IN ('active','grace') AND subject_id IS NOT NULL ORDER BY subject_id",
    )
    .bind(&input.workspace_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| RuntimeError::database("verify refreshed license identity", e))?;
    if active_subjects.len() != 1 || active_subjects[0] != claims.license_id() {
      return Err(Error::new(Status::InvalidArg, "license_identity_changed"));
    }
    let recurring = if input.onetime { "lifetime" } else { &input.recurring };
    let targets = vec![RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: input.workspace_id.clone(),
    }];
    let deployment = self.config()?.deployment;
    let before = transition_before(&mut tx, &targets, deployment, now).await?;
    let row = sqlx::query(
      "UPDATE installed_licenses SET \
       quantity=$4,recurring=$5,validate_key=$6,validated_at=$7,expired_at=$8,license=$9 WHERE workspace_id=$1 AND \
       key=$2 AND validate_key=$3 RETURNING *",
    )
    .bind(&input.workspace_id)
    .bind(&input.key)
    .bind(&input.expected_validate_key)
    .bind(claims.seat_quantity())
    .bind(recurring)
    .bind(&input.validate_key)
    .bind(now)
    .bind(claims.expires_at())
    .bind(input.license.as_ref())
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| RuntimeError::database("refresh installed license", e))?;
    let Some(row) = row else { return Ok(None) };
    upsert(&mut tx,EntitlementWrite{target:&targets[0],source:"selfhost_license",subject_id:claims.license_id(),plan:"selfhost_team",status:"active",quantity:Some(claims.seat_quantity()),payload:Some(input.license.as_ref()),metadata:serde_json::json!({"recurring":recurring,"validateKey":input.validate_key,"variant":input.onetime.then_some("onetime"),"errorCode":null,"errorMessage":null}),starts_at:None,expires_at:Some(claims.expires_at()),grace_until:None},now).await?;
    apply_transitions(&mut tx, &before, deployment, now).await?;
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit license refresh", e))?;
    publish_changes(self, &targets, &owners).await;
    Ok(Some(installed(row)))
  }

  pub(super) async fn revoke_installed_license_v1(
    &self,
    workspace_id: String,
    key: String,
    validate_key: String,
    schedule_remote: bool,
  ) -> Result<bool> {
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin license revoke", e))?;
    let owners = lock_license(&mut tx, &workspace_id, None).await?;
    let now = load_decision_time(&mut tx, "license revoke clock").await?;
    let targets = vec![RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: workspace_id.clone(),
    }];
    let deployment = self.config()?.deployment;
    let before = transition_before(&mut tx, &targets, deployment, now).await?;
    let deleted = sqlx::query("DELETE FROM installed_licenses WHERE workspace_id=$1 AND key=$2 AND validate_key=$3")
      .bind(&workspace_id)
      .bind(&key)
      .bind(&validate_key)
      .execute(&mut *tx)
      .await
      .map_err(|e| RuntimeError::database("revoke installed license", e))?;
    if deleted.rows_affected() != 1 {
      return Ok(false);
    }
    revoke_workspace_entitlements(&mut tx, &workspace_id, now).await?;
    if schedule_remote {
      sqlx::query(
        "INSERT INTO pending_license_deactivations(key,workspace_id,operation_id,updated_at) VALUES($1,$2,$3,$4) ON \
         CONFLICT(key) DO UPDATE SET \
         workspace_id=EXCLUDED.workspace_id,operation_id=EXCLUDED.operation_id,claim_id=NULL,claimed_until=NULL,\
         updated_at=EXCLUDED.updated_at",
      )
      .bind(&key)
      .bind(&workspace_id)
      .bind(&validate_key)
      .bind(now)
      .execute(&mut *tx)
      .await
      .map_err(|e| RuntimeError::database("schedule license deactivation", e))?;
    }
    apply_transitions(&mut tx, &before, deployment, now).await?;
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit license revoke", e))?;
    publish_changes(self, &targets, &owners).await;
    Ok(true)
  }
}
