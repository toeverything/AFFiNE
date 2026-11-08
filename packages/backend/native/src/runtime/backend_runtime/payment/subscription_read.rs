use std::{cmp::Reverse, collections::BTreeMap};

use affine_core::{
  access_control::Plan,
  payment::{BillingRelationship, FinancialRestriction, Provider, ProviderLifecycle},
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgPool};

use super::{PaymentRuntime, RuntimeError, RuntimeResult, validate_target};
use crate::runtime::Deployment;

#[derive(Default, Serialize)]
pub(super) struct SubscriptionRead {
  subscriptions: Vec<Subscription>,
  conflicts: Vec<BillingGroup>,
  manageable: Vec<BillingGroup>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Subscription {
  stripe_subscription_id: Option<String>,
  stripe_schedule_id: Option<String>,
  status: ProviderLifecycle,
  plan: String,
  recurring: String,
  variant: Option<&'static str>,
  quantity: i32,
  start: Option<DateTime<Utc>>,
  end: Option<DateTime<Utc>>,
  trial_start: Option<DateTime<Utc>>,
  trial_end: Option<DateTime<Utc>>,
  next_bill_at: Option<String>,
  canceled_at: Option<DateTime<Utc>>,
  #[serde(serialize_with = "serialize_provider")]
  provider: Provider,
  iap_store: Option<String>,
  created_at: Option<DateTime<Utc>>,
  updated_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
struct BillingGroup {
  plan: String,
  sources: Vec<BillingSource>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BillingSource {
  id: String,
  #[serde(serialize_with = "serialize_provider")]
  provider: Provider,
  iap_store: Option<String>,
  recurring: Option<String>,
}

fn serialize_provider<S: serde::Serializer>(provider: &Provider, serializer: S) -> Result<S::Ok, S::Error> {
  serializer.serialize_str(provider.as_str())
}

impl SubscriptionRead {
  pub(super) fn should_refresh_revenuecat(&self) -> bool {
    self.subscriptions.is_empty()
      || self
        .subscriptions
        .iter()
        .any(|item| item.provider == Provider::RevenueCat)
      || self
        .conflicts
        .iter()
        .chain(&self.manageable)
        .flat_map(|group| &group.sources)
        .any(|source| source.provider == Provider::RevenueCat)
  }

  pub(super) fn into_value(self) -> RuntimeResult<Value> {
    serde_json::to_value(self).map_err(|error| RuntimeError::json("encode payment subscriptions", error))
  }
}

#[derive(FromRow)]
struct SubscriptionRow {
  now: DateTime<Utc>,
  plan_family: String,
  conflicted: bool,
  bound: bool,
  conflict_member: bool,
  plan: Option<String>,
  entitlement_status: Option<String>,
  entitlement_updated_at: Option<DateTime<Utc>>,
  starts_at: Option<DateTime<Utc>>,
  expires_at: Option<DateTime<Utc>>,
  grace_until: Option<DateTime<Utc>>,
  restriction: Option<String>,
  provider_id: Option<String>,
  provider: Option<String>,
  provider_status: Option<String>,
  provider_created_at: Option<DateTime<Utc>>,
  provider_updated_at: Option<DateTime<Utc>>,
  external_subscription_id: Option<String>,
  iap_store: Option<String>,
  recurring: Option<String>,
  subscription_recurring: String,
  onetime: bool,
  quantity: i32,
  start: Option<DateTime<Utc>>,
  end: Option<DateTime<Utc>>,
  period_end: Option<DateTime<Utc>>,
  trial_start: Option<DateTime<Utc>>,
  trial_end: Option<DateTime<Utc>>,
  canceled_at: Option<DateTime<Utc>>,
  will_renew: Option<bool>,
  next_bill_at: Option<String>,
  stripe_schedule_id: Option<String>,
}

impl PaymentRuntime {
  pub(super) async fn list_subscriptions(&self, target_type: &str, target_id: &str) -> RuntimeResult<SubscriptionRead> {
    list_subscriptions(&self.pool, self.deployment, target_type, target_id).await
  }
}

pub(super) fn effective_entitlement(
  status: &str,
  starts_at: Option<DateTime<Utc>>,
  expires_at: Option<DateTime<Utc>>,
  grace_until: Option<DateTime<Utc>>,
  now: DateTime<Utc>,
) -> bool {
  starts_at.is_none_or(|start| start <= now)
    && match status {
      "active" => expires_at.is_none_or(|end| end > now),
      "grace" => grace_until.is_some_and(|end| end > now),
      _ => false,
    }
}

pub(super) async fn list_subscriptions(
  pool: &PgPool,
  deployment: Deployment,
  target_type: &str,
  target_id: &str,
) -> RuntimeResult<SubscriptionRead> {
  validate_target(target_type, target_id)?;
  if deployment == Deployment::SelfHosted {
    return Ok(SubscriptionRead::default());
  }
  let rows = sqlx::query_as::<_, SubscriptionRow>(
    r#"WITH projected AS (
         SELECT e.*, CASE WHEN e.plan='lifetime_pro' THEN 'pro' ELSE e.plan END AS plan_family
         FROM entitlements e
         WHERE e.target_type=$1 AND e.target_id=$2 AND e.source='cloud_subscription'
           AND (($1='user' AND e.plan IN ('pro','lifetime_pro','ai')) OR ($1='workspace' AND e.plan='team'))
       ), bindings AS (
         SELECT plan_family,bound_provider_namespace,bound_source_identity,conflicted
         FROM cloud_subscription_bindings WHERE $1='user' AND user_id=$2
       ), families AS (
         SELECT plan_family FROM bindings UNION SELECT plan_family FROM projected
       )
       SELECT statement_timestamp() AS now,f.plan_family,COALESCE(b.conflicted,false) AS conflicted,
              ($1='workspace' OR (p.provider_namespace=b.bound_provider_namespace
                AND p.source_identity=b.bound_source_identity)) IS TRUE AS bound,
              (e.metadata->'conflictMember'='true'::jsonb) IS TRUE AS conflict_member,
              e.plan,e.status AS entitlement_status,e.updated_at AS entitlement_updated_at,
              e.starts_at,e.expires_at,e.grace_until,e.metadata->>'financialRestriction' AS restriction,
              p.id AS provider_id,p.provider::text AS provider,p.status AS provider_status,
              p.created_at AS provider_created_at,p.updated_at AS provider_updated_at,
              p.external_subscription_id,p.iap_store::text AS iap_store,p.recurring,
              COALESCE(p.recurring,e.metadata->>'recurring','monthly') AS subscription_recurring,
              (e.plan='lifetime_pro' OR p.metadata->>'variant'='onetime'
                OR e.metadata->>'variant'='onetime') IS TRUE AS onetime,
              COALESCE(p.quantity,e.quantity,1) AS quantity,
              COALESCE(p.period_start,e.starts_at,e.created_at) AS start,
              COALESCE(p.period_end,e.expires_at) AS "end",
              p.period_end,p.trial_start,p.trial_end,p.canceled_at,p.will_renew,
              p.metadata->>'nextBillAt' AS next_bill_at,p.metadata->>'stripeScheduleId' AS stripe_schedule_id
       FROM families f
       LEFT JOIN bindings b ON b.plan_family=f.plan_family
       LEFT JOIN projected e ON e.plan_family=f.plan_family
       LEFT JOIN provider_subscriptions p
         ON p.id=e.metadata->>'providerSubscriptionId'
         AND p.target_type=e.target_type AND p.target_id=e.target_id
         AND e.plan=CASE WHEN p.plan='pro' AND p.recurring='lifetime' THEN 'lifetime_pro' ELSE p.plan END
       ORDER BY f.plan_family,p.provider::text,p.id"#,
  )
  .bind(target_type)
  .bind(target_id)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("list payment subscriptions", error))?;

  let mut subscriptions = Vec::new();
  let mut conflicts = BTreeMap::<String, Vec<BillingSource>>::new();
  let mut manageable = Vec::new();
  for row in rows {
    let conflict_sources = row
      .conflicted
      .then(|| conflicts.entry(row.plan_family.clone()).or_default());
    let Some(id) = row.provider_id else {
      continue;
    };
    let provider = row
      .provider
      .as_deref()
      .and_then(Provider::parse)
      .ok_or_else(|| RuntimeError::invalid_state("unknown billing provider"))?;
    let source = || BillingSource {
      id: id.clone(),
      provider,
      iap_store: row.iap_store.clone(),
      recurring: row.recurring.clone(),
    };
    if let Some(sources) = conflict_sources.filter(|_| row.conflict_member) {
      sources.push(source());
    }
    if !row.bound {
      continue;
    }

    let status = row.entitlement_status.as_deref().unwrap_or_default();
    if effective_entitlement(status, row.starts_at, row.expires_at, row.grace_until, row.now) {
      let next_bill_at = if row.will_renew == Some(false) || row.canceled_at.is_some() {
        None
      } else {
        row.next_bill_at.or_else(|| row.end.map(|end| end.to_rfc3339()))
      };
      let status = if status == "grace" {
        ProviderLifecycle::PastDue
      } else if row.provider_status.as_deref() == Some("trialing") {
        ProviderLifecycle::Trialing
      } else {
        ProviderLifecycle::Active
      };
      subscriptions.push((
        Reverse(row.entitlement_updated_at),
        id,
        Subscription {
          stripe_subscription_id: row.external_subscription_id,
          stripe_schedule_id: row.stripe_schedule_id,
          status,
          plan: row.plan_family,
          recurring: row.subscription_recurring,
          variant: row.onetime.then_some("onetime"),
          quantity: row.quantity,
          start: row.start,
          end: row.end,
          trial_start: row.trial_start,
          trial_end: row.trial_end,
          next_bill_at,
          canceled_at: row.canceled_at,
          provider,
          iap_store: row.iap_store,
          created_at: row.provider_created_at,
          updated_at: row.provider_updated_at,
        },
      ));
    } else if !row.conflicted && target_type == "user" {
      let plan = row
        .plan
        .as_deref()
        .and_then(Plan::parse)
        .ok_or_else(|| RuntimeError::invalid_state("unknown billing plan"))?;
      let restriction = FinancialRestriction::parse(row.restriction.as_deref().unwrap_or("none"))
        .ok_or_else(|| RuntimeError::invalid_state("unknown billing financial restriction"))?;
      let lifecycle = row
        .provider_status
        .as_deref()
        .and_then(ProviderLifecycle::parse)
        .ok_or_else(|| RuntimeError::invalid_state("unknown billing lifecycle"))?;
      let relationship = BillingRelationship {
        provider,
        lifecycle,
        period_end: row.period_end,
        canceled_at: row.canceled_at,
      };
      if relationship.occupies_purchase(plan, restriction, row.now) {
        manageable.push(BillingGroup {
          plan: row.plan_family,
          sources: vec![source()],
        });
      }
    }
  }
  subscriptions.sort_by(|left, right| (&left.0, &left.1).cmp(&(&right.0, &right.1)));
  Ok(SubscriptionRead {
    subscriptions: subscriptions
      .into_iter()
      .map(|(_, _, subscription)| subscription)
      .collect(),
    conflicts: conflicts
      .into_iter()
      .map(|(plan, sources)| BillingGroup { plan, sources })
      .collect(),
    manageable,
  })
}
