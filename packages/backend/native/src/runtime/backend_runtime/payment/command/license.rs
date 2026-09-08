use affine_core::access_control::{LicenseIssuance, LicenseIssuer};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};

use super::*;

struct ActiveLicenseSubscription {
  source_id: String,
  customer_id: String,
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
    let updated =
      sqlx::query("UPDATE licenses SET installed_at=NULL,validate_key=NULL WHERE key=$1 AND validate_key=$2")
        .bind(license_key)
        .bind(validate_key)
        .execute(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("deactivate payment license", error))?;
    if updated.rows_affected() != 1 {
      return Err(RuntimeError::invalid_state("invalid_validate_key"));
    }
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit license deactivation", error))?;
    Ok(json!({ "success": true }))
  }

  pub(super) async fn check_license_health(&self, license_key: &str, validate_key: &str) -> RuntimeResult<Value> {
    validate_identity(license_key, "license")?;
    validate_uuid(validate_key, "license validate key")?;
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let mut connection = license_connection(self, license_key, &namespace).await?;
    let mut tx = connection.begin().await?;
    let subscription = active_license_subscription(&mut tx, license_key, &namespace).await?;
    let license =
      sqlx::query("SELECT workspace_id,validate_key,clock_timestamp() AS now FROM licenses WHERE key=$1 FOR SHARE")
        .bind(license_key)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("read payment license", error))?
        .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
    let workspace_id = license
      .get::<Option<String>, _>("workspace_id")
      .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
    if license.get::<Option<String>, _>("validate_key").as_deref() != Some(validate_key) {
      return Err(RuntimeError::invalid_state("invalid_validate_key"));
    }
    let envelope = issue_license(
      license_key,
      &workspace_id,
      subscription.quantity,
      subscription.period_end,
      license.get("now"),
    )?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit license health check", error))?;
    Ok(license_response(
      envelope,
      validate_key.to_string(),
      subscription.recurring,
    ))
  }

  pub(super) async fn create_license_portal(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    license_key: &str,
    intent_id: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(license_key, "license")?;
    validate_intent(intent_id)?;
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let subscription = active_license_subscription_pool(&self.pool, license_key, &namespace).await?;
    let namespace = self.stripe()?.namespace().clone();
    let namespace_key = canonical_namespace(&namespace)?;
    let intent = stripe_operation(
      namespace.clone(),
      "create_license_portal",
      intent_id,
      vec![
        PaymentScope::source(&namespace_key, &subscription.source_id)?,
        PaymentScope::customer(&namespace_key, &subscription.customer_id)?,
        PaymentScope::billing_target(&namespace_key, "instance", license_key)?,
      ],
      Some("instance"),
      Some(license_key),
      "v1/billing_portal/sessions",
      vec![text_field("customer", &subscription.customer_id)],
    );
    match self.execute_stripe_operation(intent).await? {
      OperationExecution::Completed(result) => Ok(result),
      OperationExecution::Sent {
        connection,
        operation_id,
        response,
      } => {
        let portal: super::super::stripe_client::StripePortalSession = serde_json::from_value(response)
          .map_err(|error| RuntimeError::json("invalid Stripe portal response", error))?;
        let result = json!({ "url": portal.url });
        changes.extend(
          self
            .apply_with_connection(
              connection,
              empty_snapshot(namespace, Some(subscription.customer_id), operation_id, result.clone()),
            )
            .await?,
        );
        Ok(result)
      }
    }
  }
}

async fn license_connection(
  runtime: &PaymentRuntime,
  license_key: &str,
  namespace: &str,
) -> RuntimeResult<PaymentConnection> {
  let subscription = active_license_subscription_pool(&runtime.pool, license_key, namespace).await?;
  PaymentConnection::try_acquire(
    &runtime.pool,
    vec![
      PaymentScope::source(namespace, &subscription.source_id)?,
      PaymentScope::customer(namespace, &subscription.customer_id)?,
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
    r#"SELECT source_identity,external_customer_id,quantity,recurring,period_end
       FROM provider_subscriptions
       WHERE provider_namespace=$2 AND target_type='instance' AND target_id=$1 AND plan='selfhost_team'
         AND status='active' AND COALESCE(gives_access,true) AND (period_end IS NULL OR period_end>clock_timestamp())
       ORDER BY updated_at DESC LIMIT 1 FOR SHARE"#,
  )
  .bind(license_key)
  .bind(namespace)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("read license subscription", error))?
  .ok_or_else(|| RuntimeError::invalid_state("invalid_license"))?;
  decode_subscription(row)
}

async fn active_license_subscription_pool(
  pool: &sqlx::PgPool,
  license_key: &str,
  namespace: &str,
) -> RuntimeResult<ActiveLicenseSubscription> {
  let row = sqlx::query(
    r#"SELECT source_identity,external_customer_id,quantity,recurring,period_end
       FROM provider_subscriptions
       WHERE provider_namespace=$2 AND target_type='instance' AND target_id=$1 AND plan='selfhost_team'
         AND status='active' AND COALESCE(gives_access,true) AND (period_end IS NULL OR period_end>clock_timestamp())
       ORDER BY updated_at DESC LIMIT 1"#,
  )
  .bind(license_key)
  .bind(namespace)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("read license subscription", error))?
  .ok_or_else(|| RuntimeError::invalid_state("license_not_found"))?;
  decode_subscription(row)
}

fn decode_subscription(row: sqlx::postgres::PgRow) -> RuntimeResult<ActiveLicenseSubscription> {
  let quantity = row
    .get::<Option<i32>, _>("quantity")
    .filter(|quantity| *quantity > 0)
    .ok_or_else(|| RuntimeError::invalid_state("invalid_license"))?;
  Ok(ActiveLicenseSubscription {
    source_id: required_column(&row, "source_identity", "license subscription identity missing")?,
    customer_id: required_column(&row, "external_customer_id", "license customer identity missing")?,
    quantity,
    recurring: required_column(&row, "recurring", "license recurring is missing")?,
    period_end: row.get("period_end"),
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
