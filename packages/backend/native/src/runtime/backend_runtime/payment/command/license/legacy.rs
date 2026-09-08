use super::{
  ActiveLicenseSubscription, DateTime, PaymentConnection, PaymentRuntime, PaymentScope, Row, RuntimeError,
  RuntimeResult, Utc, Value, active_license_subscription, canonical_namespace, json, license_connection,
  validate_identity, validate_uuid,
};

// Retire this protocol only after support for v0.27.4 clients ends. A workspace
// binding belongs to the signed protocol and cannot be changed by legacy calls.
impl PaymentRuntime {
  pub(in crate::runtime::backend_runtime::payment::command) async fn activate_legacy_license(
    &self,
    license_key: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(license_key, "license")?;
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let mut connection = license_connection(self, license_key, &namespace).await?;
    let mut tx = connection.begin().await?;
    let subscription = active_license_subscription(&mut tx, license_key, &namespace).await?;
    let validate_key = uuid::Uuid::new_v4().to_string();
    let updated = sqlx::query(
      "UPDATE licenses SET installed_at=clock_timestamp(),validate_key=$2 WHERE key=$1 AND workspace_id IS NULL AND \
       installed_at IS NULL AND validate_key IS NULL",
    )
    .bind(license_key)
    .bind(&validate_key)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("activate legacy license", error))?;
    if updated.rows_affected() != 1 {
      return Err(RuntimeError::invalid_state("invalid_license"));
    }
    let response = legacy_response(subscription, validate_key)?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit legacy activation", error))?;
    Ok(response)
  }

  pub(in crate::runtime::backend_runtime::payment::command) async fn check_legacy_license_health(
    &self,
    license_key: &str,
    validate_key: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(license_key, "license")?;
    validate_uuid(validate_key, "license validate key")?;
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let mut connection = license_connection(self, license_key, &namespace).await?;
    let mut tx = connection.begin().await?;
    let license = sqlx::query("SELECT workspace_id,installed_at,validate_key FROM licenses WHERE key=$1 FOR SHARE")
      .bind(license_key)
      .fetch_optional(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("read legacy license binding", error))?
      .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
    if license.get::<Option<String>, _>("workspace_id").is_some() {
      return Err(RuntimeError::invalid_state("license_protocol_upgraded"));
    }
    if license.get::<Option<DateTime<Utc>>, _>("installed_at").is_none()
      || license.get::<Option<String>, _>("validate_key").as_deref() != Some(validate_key)
    {
      return Err(RuntimeError::invalid_state("invalid_validate_key"));
    }
    let subscription = active_license_subscription(&mut tx, license_key, &namespace).await?;
    let response = legacy_response(subscription, validate_key.to_string())?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit legacy health check", error))?;
    Ok(response)
  }

  pub(in crate::runtime::backend_runtime::payment::command) async fn deactivate_legacy_license(
    &self,
    license_key: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(license_key, "license")?;
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let mut connection = PaymentConnection::try_acquire(
      &self.pool,
      vec![PaymentScope::billing_target(&namespace, "instance", license_key)?],
    )
    .await?
    .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    let mut tx = connection.begin().await?;
    let updated =
      sqlx::query("UPDATE licenses SET installed_at=NULL,validate_key=NULL WHERE key=$1 AND workspace_id IS NULL")
        .bind(license_key)
        .execute(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("deactivate legacy license", error))?;
    if updated.rows_affected() != 1 {
      return Err(RuntimeError::invalid_state("license_protocol_upgraded"));
    }
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit legacy deactivation", error))?;
    Ok(json!({ "success": true }))
  }
}

fn legacy_response(subscription: ActiveLicenseSubscription, validate_key: String) -> RuntimeResult<Value> {
  let end = subscription
    .period_end
    .ok_or_else(|| RuntimeError::invalid_state("license_expiration_missing"))?;
  Ok(json!({
    "validateKey": validate_key,
    "license": {
      "plan": "selfhostedteam",
      "recurring": subscription.recurring,
      "quantity": subscription.quantity,
      "endAt": end.timestamp_millis(),
    },
  }))
}
