use affine_core::access_control::{
  EntitlementInput, Plan, TargetType, ValidatedEntitlement, validate_entitlement_input,
};
use napi::{Error, Result, Status};
use serde_json::Value;

use super::{
  BackendRuntime, CoreDeployment, Deployment, EntitlementWrite, RuntimeEntitlementTarget, RuntimeError,
  apply_transitions, entitlement_input_error, load_decision_time, lock_sources, lock_targets, parse_quantity,
  parse_target_type, publish_changes, transition_before, upsert,
};

#[napi_derive::napi(object)]
pub struct RuntimeAdminGrantInput {
  pub target_type: String,
  pub target_id: String,
  pub plan: String,
  #[napi(ts_type = "number")]
  pub quantity: Option<Value>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn upsert_admin_grant_v1(&self, input: RuntimeAdminGrantInput) -> Result<()> {
    if self.config()?.deployment == Deployment::SelfHosted {
      return Err(Error::new(
        Status::InvalidArg,
        "Self-hosted commercial entitlements require a signed license.",
      ));
    }
    let target_type = parse_target_type(&input.target_type)?;
    if target_type == TargetType::Instance {
      return Err(Error::new(
        Status::InvalidArg,
        "admin grant target must be user or workspace",
      ));
    }
    let access = validate_entitlement_input(EntitlementInput {
      deployment: CoreDeployment::Cloud,
      target_type,
      plan: Some(Plan::parse(&input.plan).ok_or_else(|| Error::new(Status::InvalidArg, "unknown entitlement plan"))?),
      quantity: parse_quantity(input.quantity.as_ref())?,
      signed: false,
    })
    .map_err(entitlement_input_error)?;
    let ValidatedEntitlement::Catalog(access) = access else {
      unreachable!()
    };
    let target = RuntimeEntitlementTarget {
      target_type: input.target_type,
      target_id: input.target_id,
    };
    let subject = format!("admin_grant:{}:{}", target.target_type, target.target_id);
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin admin grant", e))?;
    lock_sources(&mut tx, &[format!("admin_grant:{subject}")]).await?;
    let targets = vec![target.clone()];
    let owners = lock_targets(&mut tx, &targets).await?;
    let now = load_decision_time(&mut tx, "admin grant decision clock").await?;
    let deployment = self.config()?.deployment;
    let before = transition_before(&mut tx, &targets, deployment, now).await?;
    let id = upsert(
      &mut tx,
      EntitlementWrite {
        target: &target,
        source: "admin_grant",
        subject_id: &subject,
        plan: access.plan.as_str(),
        status: "active",
        quantity: access.quantity,
        payload: None,
        metadata: serde_json::json!({}),
        starts_at: None,
        expires_at: None,
        grace_until: None,
      },
      now,
    )
    .await?;
    sqlx::query(
      "UPDATE entitlements SET status='revoked',updated_at=$4 WHERE source='admin_grant' AND target_type=$1 AND \
       target_id=$2 AND status IN ('active','grace') AND id<>$3",
    )
    .bind(&target.target_type)
    .bind(&target.target_id)
    .bind(id)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| RuntimeError::database("replace admin grants", e))?;
    apply_transitions(&mut tx, &before, deployment, now).await?;
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit admin grant", e))?;
    publish_changes(self, &targets, &owners).await;
    Ok(())
  }

  #[napi]
  pub async fn revoke_admin_grant_v1(&self, target_type: String, target_id: String) -> Result<()> {
    let parsed_target_type = parse_target_type(&target_type)?;
    if parsed_target_type == TargetType::Instance {
      return Err(Error::new(
        Status::InvalidArg,
        "admin grant target must be user or workspace",
      ));
    }
    let target = RuntimeEntitlementTarget { target_type, target_id };
    let subject = format!("admin_grant:{}:{}", target.target_type, target.target_id);
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin admin grant revoke", e))?;
    lock_sources(&mut tx, &[format!("admin_grant:{subject}")]).await?;
    let targets = vec![target];
    let owners = lock_targets(&mut tx, &targets).await?;
    let now = load_decision_time(&mut tx, "admin grant revoke clock").await?;
    let deployment = self.config()?.deployment;
    let before = transition_before(&mut tx, &targets, deployment, now).await?;
    sqlx::query(
      "UPDATE entitlements SET status='revoked',updated_at=$2 WHERE source='admin_grant' AND subject_id=$1 AND status \
       IN ('active','grace')",
    )
    .bind(&subject)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| RuntimeError::database("revoke admin grant", e))?;
    apply_transitions(&mut tx, &before, deployment, now).await?;
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit admin grant revoke", e))?;
    publish_changes(self, &targets, &owners).await;
    Ok(())
  }
}
