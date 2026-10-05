use std::collections::{BTreeMap, BTreeSet};

use affine_core::payment::{
  FinancialFact, FinancialKind, FinancialRestriction, FinancialStatus, effective_financial_restriction,
};
use sqlx::{Postgres, Row, Transaction};

use super::{
  super::{RuntimeError, RuntimeResult, entitlement::RuntimeEntitlementTarget},
  FinancialSnapshot, PaymentConnection, PaymentScope, PaymentSnapshot, SnapshotCoverage,
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
    r#"SELECT id,provider_namespace,source_identity,external_subscription_id,target_type,target_id,external_customer_id,
              iap_store::text AS iap_store,external_ref,external_product_id
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
  Ok(
    rows
      .into_iter()
      .filter_map(|row| {
        let source_id: Option<String> = row.get::<Option<String>, _>("source_identity").or_else(|| {
          let external_id = row.get::<Option<String>, _>("external_subscription_id");
          let iap_store = row.get::<Option<String>, _>("iap_store");
          let external_ref = row.get::<Option<String>, _>("external_ref");
          let external_product_id = row.get::<Option<String>, _>("external_product_id");
          snapshot.subscriptions.iter().find_map(|subscription| {
            let matches_external_id = external_id.is_some() && subscription.external_subscription_id == external_id;
            let matches_revenuecat_legacy = snapshot.provider() == affine_core::payment::Provider::RevenueCat
              && subscription.iap_store == iap_store
              && subscription.external_ref == external_ref
              && subscription.external_product_id == external_product_id;
            (matches_external_id || matches_revenuecat_legacy).then(|| subscription.source_id.clone())
          })
        });
        source_id.map(|source_id| StoredSubscription {
          id: row.get("id"),
          namespace: row
            .get::<Option<String>, _>("provider_namespace")
            .unwrap_or_else(|| namespace.to_string()),
          source_id,
          target: RuntimeEntitlementTarget {
            target_type: row.get("target_type"),
            target_id: row.get("target_id"),
          },
          customer_id: row.get("external_customer_id"),
        })
      })
      .collect(),
  )
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

pub(super) async fn load_financial_restrictions(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
) -> RuntimeResult<BTreeMap<String, FinancialRestriction>> {
  let source_ids = snapshot
    .subscriptions
    .iter()
    .map(|subscription| subscription.source_id.as_str())
    .chain(
      snapshot
        .financial_facts
        .iter()
        .filter_map(|fact| fact.source_id.as_deref()),
    )
    .collect::<BTreeSet<_>>()
    .into_iter()
    .collect::<Vec<_>>();
  let external_ids = snapshot
    .financial_facts
    .iter()
    .map(|fact| fact.external_id.as_str())
    .collect::<Vec<_>>();
  let rows = sqlx::query(
    "SELECT source_identity,object_kind,external_id,status,occurred_at FROM payment_financial_facts WHERE \
     provider_namespace=$1 AND (source_identity=ANY($2) OR external_id=ANY($3)) ORDER BY object_kind,external_id FOR \
     UPDATE",
  )
  .bind(namespace)
  .bind(&source_ids)
  .bind(&external_ids)
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("read payment financial restrictions", error))?;
  let mut facts = FinancialFacts::new();
  for row in rows {
    let object_kind: String = row.get("object_kind");
    let status: String = row.get("status");
    facts.insert(
      (object_kind.clone(), row.get("external_id")),
      (
        row.get("source_identity"),
        FinancialFact {
          kind: FinancialKind::parse(&object_kind)
            .ok_or_else(|| RuntimeError::invalid_state("unknown stored financial object kind"))?,
          status: FinancialStatus::parse(&status)
            .ok_or_else(|| RuntimeError::invalid_state("unknown stored financial status"))?,
        },
        row.get("occurred_at"),
      ),
    );
  }
  for incoming in &snapshot.financial_facts {
    merge_incoming_fact(&mut facts, incoming)?;
  }
  let mut by_source = BTreeMap::<String, Vec<FinancialFact>>::new();
  for (_, (source, fact, _)) in facts {
    if let Some(source) = source {
      by_source.entry(source).or_default().push(fact);
    }
  }
  Ok(
    by_source
      .into_iter()
      .map(|(source, facts)| (source, effective_financial_restriction(&facts)))
      .collect(),
  )
}

type FinancialFacts =
  BTreeMap<(String, String), (Option<String>, FinancialFact, Option<chrono::DateTime<chrono::Utc>>)>;

fn merge_incoming_fact(facts: &mut FinancialFacts, incoming: &FinancialSnapshot) -> RuntimeResult<()> {
  let key = (incoming.fact.kind.as_str().to_string(), incoming.external_id.clone());
  let existing = facts.get(&key);
  if existing
    .and_then(|(source, _, _)| source.as_ref())
    .zip(incoming.source_id.as_ref())
    .is_some_and(|(stored, incoming)| stored != incoming)
  {
    return Err(RuntimeError::invalid_state(
      "conflicting payment financial source identity",
    ));
  }
  let source = incoming
    .source_id
    .clone()
    .or_else(|| existing.and_then(|(source, _, _)| source.clone()));
  let replaces_stored = if let Some((_, stored_fact, stored_at)) = facts.get(&key) {
    match (incoming.occurred_at, *stored_at) {
      (Some(incoming_at), Some(stored_at))
        if incoming_at
          .signed_duration_since(stored_at)
          .num_microseconds()
          .is_some_and(|difference| difference.abs() < 1_000) =>
      {
        if incoming.fact != *stored_fact {
          return Err(RuntimeError::invalid_state(
            "conflicting payment financial fact at equal timestamp",
          ));
        }
        false
      }
      (Some(incoming_at), Some(stored_at)) => incoming_at > stored_at,
      (None, Some(_)) => false,
      (Some(_), None) => true,
      (None, None) => {
        if incoming.fact != *stored_fact {
          return Err(RuntimeError::invalid_state(
            "conflicting payment financial fact without timestamp",
          ));
        }
        false
      }
    }
  } else {
    true
  };
  if replaces_stored {
    facts.insert(key, (source, incoming.fact, incoming.occurred_at));
  }
  Ok(())
}
