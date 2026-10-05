use affine_core::access_control::LicenseVerifier;
use chrono::{DateTime, Utc};
use napi::{Error, Result, Status, bindgen_prelude::Buffer};
use sqlx::{Postgres, Row, Transaction};

use super::{
  AFFINE_PRO_PUBLIC_KEY, BackendRuntime, EntitlementWrite, RuntimeEntitlementTarget, RuntimeError, RuntimeResult,
  apply_transitions, load_decision_time, lock_sources, lock_targets, normalize_license, publish_changes,
  transition_before, upsert,
};

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
  pub(super) recurring: String,
  pub(super) license: Buffer,
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

pub(super) async fn lock_license(
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

pub(super) fn verify(
  payload: &[u8],
  workspace_id: &str,
  now: DateTime<Utc>,
) -> Result<affine_core::access_control::VerifiedLicenseClaims> {
  let key = AFFINE_PRO_PUBLIC_KEY.ok_or_else(|| Error::new(Status::GenericFailure, "license_public_key_missing"))?;
  LicenseVerifier::verify(payload, key, Some(workspace_id), now).map_err(|e| {
    Error::new(
      if e == affine_core::access_control::LicenseError::InvalidPublicKey {
        Status::GenericFailure
      } else {
        Status::InvalidArg
      },
      format!("license_{}", e.code()),
    )
  })
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
  pub(super) async fn install_license_v1(&self, input: RuntimeLicenseInstallInput) -> Result<RuntimeInstalledLicense> {
    let normalized = normalize_license(&input.license)?;
    let identity = verify(&normalized, &input.workspace_id, Utc::now())?;
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin license install", e))?;
    let owners = lock_license(&mut tx, &input.workspace_id, Some(identity.license_id())).await?;
    let now = load_decision_time(&mut tx, "license install clock").await?;
    let claims = verify(&normalized, &input.workspace_id, now)?;
    let target = RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: input.workspace_id.clone(),
    };
    let targets = vec![target.clone()];
    let deployment = self.config()?.deployment;
    let before = transition_before(&mut tx, &targets, deployment, now).await?;
    let key = input.key.as_deref().unwrap_or(claims.license_id());
    if key != claims.license_id() {
      return Err(Error::new(Status::InvalidArg, "license_identity_changed"));
    }
    let variant = (!input.activation).then_some("onetime");
    let recurring = if input.activation {
      &input.recurring
    } else {
      claims.recurring().unwrap_or("lifetime")
    };
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
    .bind(recurring)
    .bind(variant)
    .bind(&input.validate_key)
    .bind(now)
    .bind(claims.expires_at())
    .bind(input.license.as_ref())
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| RuntimeError::database("install license row", e))?;
    revoke_workspace_entitlements(&mut tx, &input.workspace_id, now).await?;
    upsert(&mut tx,EntitlementWrite{target:&target,source:"selfhost_license",subject_id:claims.license_id(),plan:"selfhost_team",status:"active",quantity:Some(claims.seat_quantity()),payload:Some(normalized.as_ref()),metadata:serde_json::json!({"recurring":recurring,"validateKey":input.validate_key,"variant":variant,"errorCode":null,"errorMessage":null}),starts_at:None,expires_at:Some(claims.expires_at()),grace_until:None},now).await?;
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
    if claims.license_id() != input.key || active_subjects.iter().any(|subject| subject != &input.key) {
      return Err(Error::new(Status::InvalidArg, "license_identity_changed"));
    }
    let revoked: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM entitlements WHERE source='selfhost_license' AND subject_id=$1 AND \
       target_type='workspace' AND target_id=$2 AND status='revoked')",
    )
    .bind(&input.key)
    .bind(&input.workspace_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("check explicit license revocation", error))?;
    if revoked {
      return Ok(None);
    }
    let recurring = &input.recurring;
    let targets = vec![RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: input.workspace_id.clone(),
    }];
    let deployment = self.config()?.deployment;
    let before = transition_before(&mut tx, &targets, deployment, now).await?;
    let row = sqlx::query(
      "UPDATE installed_licenses SET quantity=$4,recurring=$5,validated_at=$6,expired_at=$7,license=$8 WHERE \
       workspace_id=$1 AND key=$2 AND validate_key=$3 RETURNING *",
    )
    .bind(&input.workspace_id)
    .bind(&input.key)
    .bind(&input.expected_validate_key)
    .bind(claims.seat_quantity())
    .bind(recurring)
    .bind(now)
    .bind(claims.expires_at())
    .bind(input.license.as_ref())
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| RuntimeError::database("refresh installed license", e))?;
    let Some(row) = row else { return Ok(None) };
    upsert(&mut tx,EntitlementWrite{target:&targets[0],source:"selfhost_license",subject_id:claims.license_id(),plan:"selfhost_team",status:"active",quantity:Some(claims.seat_quantity()),payload:Some(input.license.as_ref()),metadata:serde_json::json!({"recurring":recurring,"validateKey":input.expected_validate_key,"variant":null,"errorCode":null,"errorMessage":null}),starts_at:None,expires_at:Some(claims.expires_at()),grace_until:None},now).await?;
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
    apply_transitions(&mut tx, &before, deployment, now).await?;
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit license revoke", e))?;
    publish_changes(self, &targets, &owners).await;
    Ok(true)
  }

  pub(super) async fn record_license_denial(
    &self,
    license: &RuntimeInstalledLicense,
    status: &str,
    reason: &str,
  ) -> Result<bool> {
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin license denial", error))?;
    let owners = lock_license(&mut tx, &license.workspace_id, Some(&license.key)).await?;
    let current: Option<String> = sqlx::query_scalar(
      "SELECT key FROM installed_licenses WHERE workspace_id=$1 AND key=$2 AND validate_key=$3 AND variant IS \
       DISTINCT FROM 'onetime' FOR UPDATE",
    )
    .bind(&license.workspace_id)
    .bind(&license.key)
    .bind(&license.validate_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("recheck license denial generation", error))?;
    if current.is_none() {
      return Ok(false);
    }
    let now = load_decision_time(&mut tx, "license denial clock").await?;
    let targets = [RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: license.workspace_id.clone(),
    }];
    let deployment = self.config()?.deployment;
    let before = transition_before(&mut tx, &targets, deployment, now).await?;
    sqlx::query(
      "UPDATE entitlements SET status=$3,validated_at=$4,updated_at=$4,metadata=metadata || \
       jsonb_build_object('errorMessage',$5::text) WHERE source='selfhost_license' AND target_type='workspace' AND \
       target_id=$1 AND subject_id=$2 AND status<>'revoked'",
    )
    .bind(&license.workspace_id)
    .bind(&license.key)
    .bind(status)
    .bind(now)
    .bind(reason)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("record license denial", error))?;
    sqlx::query("UPDATE installed_licenses SET validated_at=$2 WHERE workspace_id=$1")
      .bind(&license.workspace_id)
      .bind(now)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("record license check time", error))?;
    apply_transitions(&mut tx, &before, deployment, now).await?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit license denial", error))?;
    publish_changes(self, &targets, &owners).await;
    Ok(true)
  }
}
