use std::collections::BTreeSet;

use affine_core::payment::{FinancialFact, FinancialKind, FinancialStatus};
use sqlx::{Postgres, Row, Transaction};

use super::{
  super::{RuntimeError, RuntimeResult, entitlement::RuntimeEntitlementTarget},
  PaymentConnection, PaymentScope, PaymentSnapshot, SnapshotCoverage,
};

pub(super) struct StoredSubscription {
  pub id: String,
  pub namespace: String,
  pub source_id: String,
  pub target: RuntimeEntitlementTarget,
  pub customer_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum ReceiptDisposition {
  Apply,
  AlreadyProcessed,
}

pub(super) async fn discover_payment_scopes(
  connection: &mut PaymentConnection,
  snapshot: &PaymentSnapshot,
  namespace: &str,
) -> RuntimeResult<Vec<PaymentScope>> {
  let source_ids = snapshot
    .subscriptions
    .iter()
    .map(|subscription| subscription.source_id.as_str())
    .collect::<Vec<_>>();
  let customer_id = snapshot.customer_id.as_deref();
  let targets = |target_type: &str, plans: &[affine_core::access_control::Plan]| {
    snapshot
      .subscriptions
      .iter()
      .filter(|subscription| subscription.target_type == target_type && plans.contains(&subscription.plan))
      .map(|subscription| subscription.target_id.as_str())
      .chain(
        snapshot
          .trials
          .iter()
          .filter(|trial| trial.target_type == target_type && plans.contains(&trial.plan))
          .map(|trial| trial.target_id.as_str()),
      )
      .collect::<Vec<_>>()
  };
  let pro_targets = targets("user", &[affine_core::access_control::Plan::Pro]);
  let ai_targets = targets("user", &[affine_core::access_control::Plan::Ai]);
  let team_targets = targets("workspace", &[affine_core::access_control::Plan::Team]);
  let mut rows = sqlx::query(
    r#"SELECT provider_namespace,source_identity,external_customer_id,target_type,target_id,plan
       FROM provider_subscriptions
       WHERE provider_namespace IS NOT NULL AND source_identity IS NOT NULL AND (
         (provider_namespace=$1 AND (source_identity=ANY($2) OR ($3::text IS NOT NULL AND external_customer_id=$3)))
         OR (target_type='user' AND target_id=ANY($4) AND plan IN ('pro','lifetime_pro'))
         OR (target_type='user' AND target_id=ANY($5) AND plan='ai')
         OR (target_type='workspace' AND target_id=ANY($6) AND plan='team'))
       ORDER BY provider_namespace,source_identity"#,
  )
  .bind(namespace)
  .bind(&source_ids)
  .bind(customer_id)
  .bind(&pro_targets)
  .bind(&ai_targets)
  .bind(&team_targets)
  .fetch_all(connection.connection())
  .await
  .map_err(|error| RuntimeError::database("discover payment lock scopes", error))?;
  let mut discovered_pro_targets = pro_targets
    .iter()
    .map(|target| (*target).to_string())
    .collect::<BTreeSet<_>>();
  let mut discovered_ai_targets = ai_targets
    .iter()
    .map(|target| (*target).to_string())
    .collect::<BTreeSet<_>>();
  let mut discovered_team_targets = team_targets
    .iter()
    .map(|target| (*target).to_string())
    .collect::<BTreeSet<_>>();
  for row in &rows {
    let target_id = row.get::<String, _>("target_id");
    match row.get::<String, _>("plan").as_str() {
      "pro" | "lifetime_pro" => {
        discovered_pro_targets.insert(target_id);
      }
      "ai" => {
        discovered_ai_targets.insert(target_id);
      }
      "team" => {
        discovered_team_targets.insert(target_id);
      }
      "selfhost_team" => {}
      _ => return Err(RuntimeError::invalid_state("unknown stored payment plan")),
    }
  }
  let discovered_pro_targets = discovered_pro_targets.into_iter().collect::<Vec<_>>();
  let discovered_ai_targets = discovered_ai_targets.into_iter().collect::<Vec<_>>();
  let discovered_team_targets = discovered_team_targets.into_iter().collect::<Vec<_>>();
  let contenders = sqlx::query(
    r#"SELECT provider_namespace,source_identity,external_customer_id,target_type,target_id,plan
       FROM provider_subscriptions
       WHERE provider_namespace IS NOT NULL AND source_identity IS NOT NULL AND (
         (target_type='user' AND target_id=ANY($1) AND plan IN ('pro','lifetime_pro'))
         OR (target_type='user' AND target_id=ANY($2) AND plan='ai')
         OR (target_type='workspace' AND target_id=ANY($3) AND plan='team'))
       ORDER BY provider_namespace,source_identity"#,
  )
  .bind(&discovered_pro_targets)
  .bind(&discovered_ai_targets)
  .bind(&discovered_team_targets)
  .fetch_all(connection.connection())
  .await
  .map_err(|error| RuntimeError::database("discover competing payment lock scopes", error))?;
  rows.extend(contenders);
  let mut scopes = Vec::new();
  for row in rows {
    let row_namespace: String = row.get("provider_namespace");
    scopes.push(PaymentScope::source(
      &row_namespace,
      row.get::<String, _>("source_identity").as_str(),
    )?);
    if let Some(customer) = row.get::<Option<String>, _>("external_customer_id") {
      scopes.push(PaymentScope::customer(&row_namespace, &customer)?);
    }
    let plan = affine_core::access_control::Plan::parse(row.get::<String, _>("plan").as_str())
      .ok_or_else(|| RuntimeError::invalid_state("unknown stored payment plan"))?;
    if plan == affine_core::access_control::Plan::SelfHostedTeam {
      scopes.push(PaymentScope::billing_target(
        &row_namespace,
        row.get::<String, _>("target_type").as_str(),
        row.get::<String, _>("target_id").as_str(),
      )?);
    } else {
      scopes.push(PaymentScope::cloud_target(
        row.get::<String, _>("target_type").as_str(),
        row.get::<String, _>("target_id").as_str(),
        plan,
      )?);
    }
  }
  Ok(scopes)
}

pub(super) async fn lock_subscription_rows(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
) -> RuntimeResult<Vec<StoredSubscription>> {
  let source_ids = snapshot
    .subscriptions
    .iter()
    .map(|subscription| subscription.source_id.as_str())
    .collect::<Vec<_>>();
  let external_ids = snapshot
    .subscriptions
    .iter()
    .filter_map(|subscription| subscription.external_subscription_id.as_deref())
    .collect::<Vec<_>>();
  let scan_customer = (matches!(snapshot.coverage, SnapshotCoverage::Complete { .. })
    || snapshot.provider() == affine_core::payment::Provider::RevenueCat)
    .then_some(snapshot.customer_id.as_deref())
    .flatten();
  let rows = sqlx::query(
    r#"SELECT id,provider_namespace,source_identity,target_type,target_id,external_customer_id
       FROM provider_subscriptions
       WHERE (provider_namespace=$1 AND (source_identity=ANY($2) OR ($3::text IS NOT NULL AND external_customer_id=$3)))
          OR (provider=$4::"Provider" AND external_subscription_id=ANY($5))
       ORDER BY provider_namespace NULLS FIRST,source_identity NULLS FIRST,id
       FOR UPDATE"#,
  )
  .bind(namespace)
  .bind(&source_ids)
  .bind(scan_customer)
  .bind(snapshot.provider().as_str())
  .bind(&external_ids)
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("lock payment subscription rows", error))?;
  rows
    .into_iter()
    .map(|row| {
      let namespace = row
        .get::<Option<String>, _>("provider_namespace")
        .ok_or_else(|| RuntimeError::invalid_state("legacy payment source requires pre-repair"))?;
      let source_id = row
        .get::<Option<String>, _>("source_identity")
        .ok_or_else(|| RuntimeError::invalid_state("legacy payment source requires pre-repair"))?;
      Ok(StoredSubscription {
        id: row.get("id"),
        namespace,
        source_id,
        target: RuntimeEntitlementTarget {
          target_type: row.get("target_type"),
          target_id: row.get("target_id"),
        },
        customer_id: row.get("external_customer_id"),
      })
    })
    .collect()
}

pub(super) async fn lock_receipts_and_operation(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
) -> RuntimeResult<ReceiptDisposition> {
  let rows = sqlx::query(
    "SELECT external_event_id,processing_status FROM payment_events WHERE provider_namespace=$1 AND \
     external_event_id=ANY($2) ORDER BY external_event_id FOR UPDATE",
  )
  .bind(namespace)
  .bind(&snapshot.captured_event_ids)
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("lock payment inbox receipts", error))?;
  let found = rows
    .iter()
    .map(|row| row.get::<String, _>("external_event_id"))
    .collect::<BTreeSet<_>>();
  if found != snapshot.captured_event_ids.iter().cloned().collect() {
    return Err(RuntimeError::invalid_input("payment inbox receipt not found"));
  }
  let statuses = rows
    .iter()
    .map(|row| row.get::<String, _>("processing_status"))
    .collect::<BTreeSet<_>>();
  if statuses
    .iter()
    .any(|status| matches!(status.as_str(), "blocked" | "ignored"))
  {
    return Err(RuntimeError::invalid_state("payment inbox receipt cannot be applied"));
  }
  if statuses.contains("processed") && statuses.len() > 1 {
    return Err(RuntimeError::invalid_state("mixed payment inbox receipt state"));
  }
  if statuses
    .iter()
    .any(|status| !matches!(status.as_str(), "pending" | "processing" | "failed" | "processed"))
  {
    return Err(RuntimeError::invalid_state("unknown payment inbox receipt state"));
  }
  let already_processed = statuses.len() == 1 && statuses.contains("processed");
  if let Some(operation) = &snapshot.operation {
    let found =
      sqlx::query("SELECT status,result FROM payment_operations WHERE id=$1 AND provider_namespace=$2 FOR UPDATE")
        .bind(&operation.operation_id)
        .bind(namespace)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|error| RuntimeError::database("lock payment operation", error))?;
    if found.is_none() {
      return Err(RuntimeError::invalid_input("payment operation not found"));
    }
    if already_processed {
      let found = found.expect("checked above");
      if found.get::<String, _>("status") != "completed"
        || found.get::<Option<serde_json::Value>, _>("result").as_ref() != Some(&operation.result)
      {
        return Err(RuntimeError::invalid_state(
          "processed receipt operation completion does not match",
        ));
      }
    }
  }
  Ok(if already_processed {
    ReceiptDisposition::AlreadyProcessed
  } else {
    ReceiptDisposition::Apply
  })
}

pub(super) async fn stored_subscription_decision(
  tx: &mut Transaction<'_, Postgres>,
  row: &sqlx::postgres::PgRow,
  financial_rows: &[sqlx::postgres::PgRow],
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<(
  affine_core::payment::NormalizedSubscription,
  affine_core::payment::FinancialRestriction,
)> {
  use affine_core::{
    access_control::Plan,
    payment::{Provider, ProviderLifecycle, ProviderSubscriptionFacts, SubscriptionRecurring, decide_subscription},
  };
  let facts = financial_rows
    .iter()
    .map(|row| {
      let kind = FinancialKind::parse(row.get::<String, _>("object_kind").as_str())
        .ok_or_else(|| RuntimeError::invalid_state("unknown financial kind"))?;
      let status = FinancialStatus::parse(row.get::<String, _>("status").as_str())
        .ok_or_else(|| RuntimeError::invalid_state("unknown financial status"))?;
      let metadata: serde_json::Value = row.get("metadata");
      let invoice = metadata
        .get("invoice")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|_| RuntimeError::invalid_state("invalid invoice financial facts"))?;
      Ok(FinancialFact { kind, status, invoice })
    })
    .collect::<RuntimeResult<Vec<_>>>()?;
  let events = sqlx::query(
    "SELECT occurred_at,metadata FROM payment_events WHERE provider_namespace=$1 AND \
     event_type='customer.subscription.updated' AND metadata #>> '{data,object,id}'=$2 AND (metadata #> \
     '{data,previous_attributes}') ? 'pause_collection' ORDER BY occurred_at",
  )
  .bind(row.get::<String, _>("provider_namespace"))
  .bind(row.get::<String, _>("source_identity"))
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("read collection pause facts", error))?;
  let collection_pauses = events
    .iter()
    .map(|event| {
      let metadata: serde_json::Value = event.get("metadata");
      let pause = metadata
        .pointer("/data/object/pause_collection")
        .ok_or_else(|| RuntimeError::invalid_state("missing collection pause change"))?;
      if !pause.is_null()
        && !matches!(
          pause.get("behavior").and_then(serde_json::Value::as_str),
          Some("void" | "keep_as_draft" | "mark_uncollectible")
        )
      {
        return Err(RuntimeError::invalid_state("invalid collection pause behavior"));
      }
      let resumes_at = pause
        .get("resumes_at")
        .filter(|value| !value.is_null())
        .map(|value| {
          chrono::DateTime::from_timestamp(
            value
              .as_i64()
              .ok_or_else(|| RuntimeError::invalid_state("invalid collection resume time"))?,
            0,
          )
          .ok_or_else(|| RuntimeError::invalid_state("invalid collection resume time"))
        })
        .transpose()?;
      Ok(affine_core::payment::CollectionPauseChange {
        occurred_at: event
          .get::<Option<chrono::DateTime<chrono::Utc>>, _>("occurred_at")
          .ok_or_else(|| RuntimeError::invalid_state("missing collection change time"))?,
        paused: !pause.is_null(),
        resumes_at,
      })
    })
    .collect::<RuntimeResult<Vec<_>>>()?;
  let source = ProviderSubscriptionFacts {
    collection_pauses,
    provider: Provider::parse(row.get::<String, _>("provider").as_str())
      .ok_or_else(|| RuntimeError::invalid_state("unknown provider"))?,
    source_id: row.get("source_identity"),
    plan: Plan::parse(row.get::<String, _>("plan").as_str())
      .ok_or_else(|| RuntimeError::invalid_state("unknown plan"))?,
    recurring: SubscriptionRecurring::parse(row.get::<String, _>("recurring").as_str())
      .ok_or_else(|| RuntimeError::invalid_state("unknown recurring"))?,
    lifecycle: ProviderLifecycle::parse(row.get::<String, _>("status").as_str())
      .ok_or_else(|| RuntimeError::invalid_state("unknown lifecycle"))?,
    gives_access: row.get("gives_access"),
    quantity: row.get::<Option<i32>, _>("quantity").map(f64::from),
    trial_end: row.get("trial_end"),
    end: row.get("period_end"),
    will_renew: row.get("will_renew"),
  };
  decide_subscription(
    source,
    &facts,
    row.get::<Option<String>, _>("billing_email").as_deref(),
    now,
  )
  .map_err(|error| RuntimeError::invalid_state(format!("invalid payment source: {error:?}")))
}
