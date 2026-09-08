use chrono::Utc;
use napi::{Result, Status};
use sqlx::{PgPool, Row};

use super::{
  BackendRuntime, Deployment, EntitlementWrite, RuntimeEntitlementTarget, RuntimeError, RuntimeInstalledLicense,
  RuntimeLicenseChange, RuntimeResult, apply_transitions, installed, load_decision_time, lock_license,
  normalize_license, publish_changes, transition_before, upsert, verify,
};

impl BackendRuntime {
  // Preserve uploaded files for recovery; only entitlement payloads are
  // normalized.
  pub(in crate::runtime::backend_runtime) async fn admit_offline_licenses(&self, pool: &PgPool) -> RuntimeResult<()> {
    let mut after = String::new();
    loop {
      let rows = sqlx::query(
        "SELECT * FROM installed_licenses WHERE variant='onetime' AND license IS NOT NULL AND workspace_id>$1 ORDER \
         BY workspace_id LIMIT 100",
      )
      .bind(&after)
      .fetch_all(pool)
      .await
      .map_err(|error| RuntimeError::database("load offline license admission page", error))?;
      if rows.is_empty() {
        break;
      }
      for row in rows {
        let license = installed(row);
        after.clone_from(&license.workspace_id);
        let existing = sqlx::query(
          "SELECT status,signed_payload FROM entitlements WHERE source='selfhost_license' AND subject_id=$1 AND \
           target_type='workspace' AND target_id=$2 ORDER BY updated_at DESC LIMIT 1",
        )
        .bind(&license.key)
        .bind(&license.workspace_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| RuntimeError::database("check admitted offline license", error))?;
        if let Some(existing) = existing {
          if existing.get::<String, _>("status") == "revoked" {
            continue;
          }
          if let Some(payload) = existing.get::<Option<Vec<u8>>, _>("signed_payload") {
            match verify(&payload, &license.workspace_id, Utc::now()) {
              Ok(claims) if claims.license_id() == license.key && existing.get::<String, _>("status") == "active" => {
                continue;
              }
              Err(error) if matches!(error.reason.as_str(), "license_expired" | "license_not_before") => continue,
              Err(error) if error.status == Status::GenericFailure => {
                return Err(RuntimeError::config(error.reason.clone()));
              }
              _ => {}
            }
          }
        }
        let payload = license.license.as_ref().expect("selected non-null license");
        let normalized = match normalize_license(payload) {
          Ok(payload) => payload,
          Err(error) if error.status == Status::GenericFailure => {
            return Err(RuntimeError::config(error.reason.clone()));
          }
          Err(_) => continue,
        };
        let identity = match verify(&normalized, &license.workspace_id, Utc::now()) {
          Ok(claims) => claims,
          Err(error) if error.status == Status::GenericFailure => {
            return Err(RuntimeError::config(error.reason.clone()));
          }
          Err(_) => continue,
        };
        if identity.license_id() != license.key {
          eprintln!(
            "Skipping offline license for workspace {}: identity mismatch",
            license.workspace_id
          );
          continue;
        }
        let mut tx = pool
          .begin()
          .await
          .map_err(|error| RuntimeError::database("begin offline license admission", error))?;
        let owners = lock_license(&mut tx, &license.workspace_id, Some(identity.license_id())).await?;
        let current = sqlx::query(
          "SELECT * FROM installed_licenses WHERE workspace_id=$1 AND key=$2 AND validate_key=$3 FOR UPDATE",
        )
        .bind(&license.workspace_id)
        .bind(&license.key)
        .bind(&license.validate_key)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("recheck offline installation", error))?;
        let Some(current) = current.map(installed) else {
          continue;
        };
        if current.variant.as_deref() != Some("onetime") || current.license.as_deref() != Some(payload.as_ref()) {
          continue;
        }
        let existing = sqlx::query(
          "SELECT target_type,target_id,status,signed_payload FROM entitlements WHERE source='selfhost_license' AND \
           subject_id=$1 ORDER BY updated_at DESC LIMIT 1",
        )
        .bind(&license.key)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("read offline entitlement admission", error))?;
        if let Some(existing) = existing {
          if existing.get::<String, _>("target_type") != "workspace"
            || existing.get::<String, _>("target_id") != license.workspace_id
          {
            eprintln!(
              "Skipping offline license for workspace {}: subject conflict",
              license.workspace_id
            );
            continue;
          }
          let status: String = existing.get("status");
          if status == "revoked"
            || (status == "active"
              && existing.get::<Option<Vec<u8>>, _>("signed_payload").as_deref() == Some(normalized.as_ref()))
          {
            continue;
          }
        }
        let conflict: bool = sqlx::query_scalar(
          "SELECT EXISTS(SELECT 1 FROM entitlements WHERE source='selfhost_license' AND target_type='workspace' AND \
           target_id=$1 AND subject_id IS DISTINCT FROM $2 AND status IN ('active','grace'))",
        )
        .bind(&license.workspace_id)
        .bind(&license.key)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("check offline entitlement conflict", error))?;
        if conflict {
          eprintln!(
            "Skipping offline license for workspace {}: workspace conflict",
            license.workspace_id
          );
          continue;
        }
        let now = load_decision_time(&mut tx, "offline license admission clock").await?;
        let claims = match verify(&normalized, &license.workspace_id, now) {
          Ok(claims) => claims,
          Err(error) if error.status == Status::GenericFailure => {
            return Err(RuntimeError::config(error.reason.clone()));
          }
          Err(_) => continue,
        };
        let targets = [RuntimeEntitlementTarget {
          target_type: "workspace".into(),
          target_id: license.workspace_id.clone(),
        }];
        let before = transition_before(&mut tx, &targets, Deployment::SelfHosted, now).await?;
        upsert(&mut tx, EntitlementWrite {
          target: &targets[0], source: "selfhost_license", subject_id: claims.license_id(), plan: "selfhost_team",
          status: "active", quantity: Some(claims.seat_quantity()), payload: Some(&normalized),
          metadata: serde_json::json!({ "recurring": license.recurring, "validateKey": license.validate_key, "variant": "onetime" }),
          starts_at: None, expires_at: Some(claims.expires_at()), grace_until: None,
        }, now).await?;
        apply_transitions(&mut tx, &before, Deployment::SelfHosted, now).await?;
        tx.commit()
          .await
          .map_err(|error| RuntimeError::database("commit offline license admission", error))?;
        publish_changes(self, &targets, &owners).await;
      }
    }
    Ok(())
  }

  pub(super) async fn check_offline_license(
    &self,
    license: &RuntimeInstalledLicense,
  ) -> Result<Option<RuntimeLicenseChange>> {
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin offline license check", error))?;
    let owners = lock_license(&mut tx, &license.workspace_id, Some(&license.key)).await?;
    let current: Option<String> = sqlx::query_scalar(
      "SELECT key FROM installed_licenses WHERE workspace_id=$1 AND key=$2 AND validate_key=$3 AND variant='onetime' \
       FOR UPDATE",
    )
    .bind(&license.workspace_id)
    .bind(&license.key)
    .bind(&license.validate_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("recheck offline license generation", error))?;
    if current.is_none() {
      return Ok(None);
    }
    let entitlement = sqlx::query(
      "SELECT status,signed_payload FROM entitlements WHERE source='selfhost_license' AND target_type='workspace' AND \
       target_id=$1 AND subject_id=$2 ORDER BY updated_at DESC LIMIT 1",
    )
    .bind(&license.workspace_id)
    .bind(&license.key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("load offline license envelope", error))?;
    let now = load_decision_time(&mut tx, "offline license check clock").await?;
    let payload = entitlement
      .as_ref()
      .and_then(|row| row.get::<Option<Vec<u8>>, _>("signed_payload"));
    let revoked = entitlement
      .as_ref()
      .is_some_and(|row| row.get::<String, _>("status") == "revoked");
    let verified = payload
      .as_deref()
      .map(|payload| verify(payload, &license.workspace_id, now))
      .transpose();
    let (claims, error_code) = match verified {
      Ok(claims) => (claims, None),
      Err(error) if error.status == Status::GenericFailure => return Err(error),
      Err(error) => (None, Some(error.reason.clone())),
    };
    let valid = !revoked && claims.as_ref().is_some_and(|claims| claims.license_id() == license.key);
    let status = if valid {
      "active"
    } else if revoked {
      "revoked"
    } else if error_code.as_deref() == Some("license_expired") {
      "expired"
    } else {
      "needs_reupload"
    };
    let targets = [RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: license.workspace_id.clone(),
    }];
    let before = transition_before(&mut tx, &targets, Deployment::SelfHosted, now).await?;
    let quantity = claims.as_ref().filter(|_| valid).map(|claims| claims.seat_quantity());
    let expires_at = claims.as_ref().filter(|_| valid).map(|claims| claims.expires_at());
    let recurring = claims
      .as_ref()
      .filter(|_| valid)
      .map(|claims| claims.recurring().unwrap_or("lifetime"));
    sqlx::query(
      "UPDATE installed_licenses SET \
       validated_at=$4,quantity=COALESCE($5,quantity),expired_at=COALESCE($6,expired_at),recurring=COALESCE($7,\
       recurring) WHERE workspace_id=$1 AND key=$2 AND validate_key=$3",
    )
    .bind(&license.workspace_id)
    .bind(&license.key)
    .bind(&license.validate_key)
    .bind(now)
    .bind(quantity)
    .bind(expires_at)
    .bind(recurring)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("record offline license check", error))?;
    sqlx::query(
      "UPDATE entitlements SET status=$3,metadata=metadata || \
       jsonb_build_object('errorCode',$4::text),validated_at=$5,updated_at=$5,quantity=COALESCE($6,quantity),\
       expires_at=COALESCE($7,expires_at) WHERE source='selfhost_license' AND target_type='workspace' AND \
       target_id=$1 AND subject_id=$2",
    )
    .bind(&license.workspace_id)
    .bind(&license.key)
    .bind(status)
    .bind(error_code)
    .bind(now)
    .bind(quantity)
    .bind(expires_at)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("record offline entitlement check", error))?;
    apply_transitions(&mut tx, &before, Deployment::SelfHosted, now).await?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit offline license check", error))?;
    publish_changes(self, &targets, &owners).await;
    Ok(Some(RuntimeLicenseChange {
      workspace_id: license.workspace_id.clone(),
      recurring: recurring.unwrap_or(&license.recurring).to_string(),
      quantity,
      canceled: !valid,
    }))
  }
}
