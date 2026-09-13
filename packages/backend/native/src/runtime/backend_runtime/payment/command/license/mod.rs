mod legacy;

use affine_core::access_control::{LicenseIssuance, LicenseIssuer};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};

use super::*;

struct ActiveLicenseSubscription {
  quantity: i32,
  recurring: String,
  period_end: Option<DateTime<Utc>>,
}

impl PaymentRuntime {
  pub(super) async fn activate_license(
    &self,
    license_key: &str,
    workspace_id: &str,
    operation_id: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(license_key, "license")?;
    validate_identity(workspace_id, "license workspace")?;
    validate_uuid(operation_id, "license operation")?;
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let mut connection = license_connection(self, license_key, &namespace).await?;
    let mut tx = connection.begin().await?;
    let subscription = active_license_subscription(&mut tx, license_key, &namespace).await?;
    let license = sqlx::query(
      "SELECT workspace_id,installed_at,validate_key,clock_timestamp() AS now FROM licenses WHERE key=$1 FOR UPDATE",
    )
    .bind(license_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("lock payment license", error))?
    .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
    let bound_workspace: Option<String> = license.get("workspace_id");
    if bound_workspace.as_deref().is_some_and(|bound| bound != workspace_id) {
      return Err(RuntimeError::invalid_state("invalid_license"));
    }
    if bound_workspace.is_none() && license.get::<Option<DateTime<Utc>>, _>("installed_at").is_some() {
      return Err(RuntimeError::invalid_state("license_upgrade_required"));
    }
    let now: DateTime<Utc> = license.get("now");
    let validate_key = license
      .get::<Option<String>, _>("validate_key")
      .unwrap_or_else(|| operation_id.to_string());
    let envelope = issue_license(
      license_key,
      workspace_id,
      subscription.quantity,
      subscription.period_end,
      now,
    )?;
    let updated = sqlx::query(
      "UPDATE licenses SET workspace_id=$2,installed_at=$3,validate_key=$4 WHERE key=$1 AND (workspace_id IS NULL OR \
       workspace_id=$2)",
    )
    .bind(license_key)
    .bind(workspace_id)
    .bind(now)
    .bind(&validate_key)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("bind payment license", error))?;
    if updated.rows_affected() != 1 {
      return Err(RuntimeError::invalid_state("invalid_license"));
    }
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit license activation", error))?;
    Ok(license_response(envelope, validate_key, subscription.recurring))
  }

  pub(super) async fn deactivate_license(&self, license_key: &str, validate_key: &str) -> RuntimeResult<Value> {
    validate_identity(license_key, "license")?;
    validate_uuid(validate_key, "license validate key")?;
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let mut connection = PaymentConnection::try_acquire(
      &self.pool,
      vec![PaymentScope::billing_target(&namespace, "instance", license_key)?],
    )
    .await?
    .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    let mut tx = connection.begin().await?;
    let license = sqlx::query("SELECT workspace_id,validate_key FROM licenses WHERE key=$1 FOR UPDATE")
      .bind(license_key)
      .fetch_optional(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock payment license for deactivation", error))?
      .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
    let bound_workspace: Option<String> = license.get("workspace_id");
    let bound_validate_key: Option<String> = license.get("validate_key");
    if bound_workspace.is_none() && bound_validate_key.is_none() {
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit already-unbound license deactivation", error))?;
      return Ok(json!({ "status": "already_unbound" }));
    }
    if bound_validate_key.as_deref() != Some(validate_key) {
      return Err(RuntimeError::invalid_state("invalid_validate_key"));
    }
    sqlx::query("UPDATE licenses SET workspace_id=NULL,installed_at=NULL,validate_key=NULL WHERE key=$1")
      .bind(license_key)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("deactivate payment license", error))?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit license deactivation", error))?;
    Ok(json!({ "status": "deactivated" }))
  }

  pub(super) async fn check_license_health(
    &self,
    license_key: &str,
    validate_key: &str,
    workspace_id: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(license_key, "license")?;
    validate_identity(workspace_id, "license workspace")?;
    validate_uuid(validate_key, "license validate key")?;
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let mut connection = license_connection(self, license_key, &namespace).await?;
    let mut tx = connection.begin().await?;
    let license = sqlx::query(
      "SELECT workspace_id,validate_key,installed_at,clock_timestamp() AS now FROM licenses WHERE key=$1 FOR UPDATE",
    )
    .bind(license_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("read payment license", error))?
    .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
    if license.get::<Option<DateTime<Utc>>, _>("installed_at").is_none() {
      return Err(RuntimeError::invalid_state("license_unbound"));
    }
    if license.get::<Option<String>, _>("validate_key").as_deref() != Some(validate_key) {
      return Err(RuntimeError::invalid_state("invalid_validate_key"));
    }
    let bound_workspace: Option<String> = license.get("workspace_id");
    if bound_workspace.as_deref().is_some_and(|bound| bound != workspace_id) {
      return Err(RuntimeError::invalid_state("license_workspace_mismatch"));
    }
    let subscription = active_license_subscription(&mut tx, license_key, &namespace).await?;
    let envelope = issue_license(
      license_key,
      workspace_id,
      subscription.quantity,
      subscription.period_end,
      license.get("now"),
    )?;
    if bound_workspace.is_none() {
      sqlx::query("UPDATE licenses SET workspace_id=$2 WHERE key=$1")
        .bind(license_key)
        .bind(workspace_id)
        .execute(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("upgrade license binding", error))?;
    }
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit license health check", error))?;
    Ok(license_response(
      envelope,
      validate_key.to_string(),
      subscription.recurring,
    ))
  }

  pub(in crate::runtime::backend_runtime) async fn license_customer_portal_url(
    &self,
    license_key: &str,
    validate_key: Option<&str>,
  ) -> RuntimeResult<String> {
    validate_identity(license_key, "license")?;
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let mut connection = PaymentConnection::try_acquire(
      &self.pool,
      vec![PaymentScope::billing_target(&namespace, "instance", license_key)?],
    )
    .await?
    .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    assert_license_access(connection.connection(), license_key, validate_key).await?;
    let customer: String = sqlx::query_scalar(
      "SELECT external_customer_id FROM provider_subscriptions WHERE provider_namespace=$1 AND target_type='instance' \
       AND target_id=$2 AND plan='selfhost_team' AND external_customer_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
    )
    .bind(&namespace)
    .bind(license_key)
    .fetch_optional(connection.connection())
    .await
    .map_err(|error| RuntimeError::database("load license portal customer", error))?
    .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
    let mut form = StripeForm::default();
    form.push("customer", StripeFormValue::Text(customer));
    let portal: StripePortalSession = self
      .stripe()?
      .post("v1/billing_portal/sessions", &form, &uuid::Uuid::new_v4().to_string())
      .await
      .map_err(provider_runtime_error)?;
    Ok(portal.url)
  }
}

pub(super) async fn assert_license_access(
  connection: &mut sqlx::PgConnection,
  license_key: &str,
  validate_key: Option<&str>,
) -> RuntimeResult<()> {
  if let Some(validate_key) = validate_key {
    validate_uuid(validate_key, "license validate key")?;
  }
  let valid: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM licenses WHERE key=$1 AND (($2::text IS NULL AND workspace_id IS NULL) OR ($2::text \
     IS NOT NULL AND validate_key=$2 AND installed_at IS NOT NULL)))",
  )
  .bind(license_key)
  .bind(validate_key)
  .fetch_one(connection)
  .await
  .map_err(|error| RuntimeError::database("authorize payment license", error))?;
  if !valid {
    return Err(RuntimeError::invalid_state("invalid_validate_key"));
  }
  Ok(())
}

async fn license_connection(
  runtime: &PaymentRuntime,
  license_key: &str,
  namespace: &str,
) -> RuntimeResult<PaymentConnection> {
  let subscription = sqlx::query(
    "SELECT source_identity,external_customer_id FROM provider_subscriptions WHERE provider_namespace=$1 AND \
     target_type='instance' AND target_id=$2 AND plan='selfhost_team' ORDER BY updated_at DESC LIMIT 1",
  )
  .bind(namespace)
  .bind(license_key)
  .fetch_optional(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("load license subscription lock scopes", error))?
  .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
  let source_id = required_column(
    &subscription,
    "source_identity",
    "license subscription identity missing",
  )?;
  let customer_id = required_column(
    &subscription,
    "external_customer_id",
    "license customer identity missing",
  )?;
  PaymentConnection::try_acquire(
    &runtime.pool,
    vec![
      PaymentScope::source(namespace, &source_id)?,
      PaymentScope::customer(namespace, &customer_id)?,
      PaymentScope::billing_target(namespace, "instance", license_key)?,
    ],
  )
  .await?
  .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))
}

async fn active_license_subscription(
  tx: &mut Transaction<'_, Postgres>,
  license_key: &str,
  namespace: &str,
) -> RuntimeResult<ActiveLicenseSubscription> {
  let row = sqlx::query(
    r#"SELECT quantity,recurring,period_end,status,COALESCE(gives_access,true) AS gives_access,clock_timestamp() AS now
       FROM provider_subscriptions
       WHERE provider_namespace=$2 AND target_type='instance' AND target_id=$1 AND plan='selfhost_team'
       ORDER BY updated_at DESC LIMIT 1 FOR SHARE"#,
  )
  .bind(license_key)
  .bind(namespace)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("read license subscription", error))?
  .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
  decode_subscription(row)
}

fn decode_subscription(row: sqlx::postgres::PgRow) -> RuntimeResult<ActiveLicenseSubscription> {
  let period_end: Option<DateTime<Utc>> = row.get("period_end");
  if row.get::<String, _>("status") != "active"
    || !row.get::<bool, _>("gives_access")
    || period_end.is_some_and(|end| end <= row.get::<DateTime<Utc>, _>("now"))
  {
    return Err(RuntimeError::invalid_state("license_expired"));
  }
  let quantity = row
    .get::<Option<i32>, _>("quantity")
    .filter(|quantity| *quantity > 0)
    .ok_or_else(|| RuntimeError::invalid_state("invalid_license"))?;
  Ok(ActiveLicenseSubscription {
    quantity,
    recurring: required_column(&row, "recurring", "license recurring is missing")?,
    period_end,
  })
}

fn issue_license(
  license_id: &str,
  workspace_id: &str,
  seat_quantity: i32,
  subscription_end: Option<DateTime<Utc>>,
  now: DateTime<Utc>,
) -> RuntimeResult<Vec<u8>> {
  let private_key = std::env::var("AFFINE_PRO_LICENSE_PRIVATE_KEY")
    .map_err(|_| RuntimeError::invalid_state("license_private_key_missing"))?;
  LicenseIssuer::issue(
    LicenseIssuance {
      license_id,
      workspace_id,
      seat_quantity,
      subscription_end,
      now,
    },
    &private_key,
  )
  .map_err(|_| RuntimeError::invalid_state("license_issue_failed"))
}

fn license_response(envelope: Vec<u8>, validate_key: String, recurring: String) -> Value {
  json!({
    "license": BASE64.encode(envelope),
    "validateKey": validate_key,
    "recurring": recurring,
  })
}

fn validate_uuid(value: &str, name: &str) -> RuntimeResult<()> {
  uuid::Uuid::parse_str(value)
    .map(|_| ())
    .map_err(|_| RuntimeError::invalid_input(format!("invalid {name}")))
}
