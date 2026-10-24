use std::collections::BTreeMap;

use affine_core::{
  access_control::EntitlementStatus,
  payment::{
    CloudSourceCandidate, FinancialRestriction, Provider, SubscriptionRecurring, cloud_plan_family, select_cloud_source,
  },
};
use serde_json::json;
use sqlx::{Postgres, Row, Transaction};

use super::{
  super::{
    RuntimeError, RuntimeResult,
    entitlement::{EntitlementWrite, RuntimeEntitlementTarget, upsert},
  },
  apply::restriction_name,
};

struct ProjectedSource {
  id: String,
  namespace: String,
  target: RuntimeEntitlementTarget,
  starts_at: Option<chrono::DateTime<chrono::Utc>>,
  recurring: SubscriptionRecurring,
  variant: serde_json::Value,
  external_subscription_id: Option<String>,
  candidate: CloudSourceCandidate,
}

pub(super) async fn reconcile_cloud_winners(
  tx: &mut Transaction<'_, Postgres>,
  targets: &[RuntimeEntitlementTarget],
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  let user_ids = targets
    .iter()
    .filter(|target| target.target_type == "user")
    .map(|target| target.target_id.as_str())
    .collect::<Vec<_>>();
  let workspace_ids = targets
    .iter()
    .filter(|target| target.target_type == "workspace")
    .map(|target| target.target_id.as_str())
    .collect::<Vec<_>>();
  let rows = sqlx::query(
    r#"SELECT id,provider::text AS provider,provider_namespace,source_identity,target_type,target_id,
              plan,recurring,status,gives_access,quantity,trial_end,period_start,period_end,will_renew,external_subscription_id,metadata,metadata->'variant' AS variant,(SELECT u.email FROM user_stripe_customers c JOIN users u ON u.id=c.user_id
                WHERE c.provider_namespace=provider_subscriptions.provider_namespace
                  AND c.stripe_customer_id=provider_subscriptions.external_customer_id) AS billing_email
       FROM provider_subscriptions
       WHERE provider_namespace IS NOT NULL AND source_identity IS NOT NULL
         AND ((target_type='user' AND target_id=ANY($1) AND plan IN ('pro','lifetime_pro','ai'))
           OR (target_type='workspace' AND target_id=ANY($2) AND plan='team'))
       ORDER BY provider_namespace,source_identity,id FOR UPDATE"#,
  )
  .bind(&user_ids)
  .bind(&workspace_ids)
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("lock cloud payment sources", error))?;
  let namespaces = rows
    .iter()
    .map(|row| row.get::<String, _>("provider_namespace"))
    .collect::<Vec<_>>();
  let sources = rows
    .iter()
    .map(|row| row.get::<String, _>("source_identity"))
    .collect::<Vec<_>>();
  let fact_rows = sqlx::query(
    "SELECT provider_namespace,source_identity,object_kind,status,amount,metadata FROM payment_financial_facts WHERE \
     provider_namespace=ANY($1) AND source_identity=ANY($2) ORDER BY \
     provider_namespace,source_identity,object_kind,external_id FOR UPDATE",
  )
  .bind(&namespaces)
  .bind(&sources)
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("lock cloud payment financial facts", error))?;
  let mut facts = BTreeMap::<(String, String), Vec<sqlx::postgres::PgRow>>::new();
  for row in fact_rows {
    facts
      .entry((row.get("provider_namespace"), row.get("source_identity")))
      .or_default()
      .push(row);
  }

  let mut groups = BTreeMap::<(String, String, &'static str), Vec<ProjectedSource>>::new();
  for row in rows {
    let namespace: String = row.get("provider_namespace");
    let source_id: String = row.get("source_identity");
    let target = RuntimeEntitlementTarget {
      target_type: row.get("target_type"),
      target_id: row.get("target_id"),
    };
    let (subscription, restriction) = super::stored_subscription_decision(
      tx,
      &row,
      facts
        .get(&(namespace.clone(), source_id))
        .map(Vec::as_slice)
        .unwrap_or_default(),
      now,
    )
    .await?;
    let recurring = SubscriptionRecurring::parse(row.get::<String, _>("recurring").as_str())
      .ok_or_else(|| RuntimeError::invalid_state("unknown stored payment recurring"))?;
    let expected_target = match subscription.target_type {
      affine_core::access_control::TargetType::User => "user",
      affine_core::access_control::TargetType::Workspace => "workspace",
      affine_core::access_control::TargetType::Instance => {
        return Err(RuntimeError::invalid_state("invalid cloud payment target"));
      }
    };
    if target.target_type != expected_target {
      return Err(RuntimeError::invalid_state("stored payment target does not match plan"));
    }
    let family = cloud_plan_family(subscription.access.plan)
      .ok_or_else(|| RuntimeError::invalid_state("invalid stored cloud payment plan"))?;
    groups
      .entry((target.target_type.clone(), target.target_id.clone(), family))
      .or_default()
      .push(ProjectedSource {
        id: row.get("id"),
        namespace: namespace.clone(),
        target: target.clone(),
        starts_at: row.get("period_start"),
        recurring,
        variant: row
          .get::<Option<serde_json::Value>, _>("variant")
          .unwrap_or(serde_json::Value::Null),
        external_subscription_id: row.get("external_subscription_id"),
        candidate: CloudSourceCandidate {
          provider_namespace: namespace,
          target_id: target.target_id.clone(),
          subscription,
          restriction,
        },
      });
  }

  for sources in groups.into_values() {
    let candidates = sources
      .iter()
      .map(|source| source.candidate.clone())
      .collect::<Vec<_>>();
    let winner = select_cloud_source(&candidates, now).map(|winner| {
      (
        winner.provider_namespace.as_str(),
        winner.subscription.source_id.as_str(),
      )
    });
    for source in sources {
      let subscription = &source.candidate.subscription;
      let selected = winner
        == Some((
          source.candidate.provider_namespace.as_str(),
          subscription.source_id.as_str(),
        ));
      let status = if selected {
        subscription.status
      } else if source.candidate.restriction == FinancialRestriction::Revoke
        || subscription.status == EntitlementStatus::Revoked
      {
        EntitlementStatus::Revoked
      } else {
        EntitlementStatus::Expired
      };
      upsert(
        tx,
        EntitlementWrite {
          target: &source.target,
          source: "cloud_subscription",
          subject_id: &entitlement_subject(&source.namespace, &subscription.source_id),
          plan: subscription.access.plan.as_str(),
          status: status.as_str(),
          quantity: subscription.access.quantity,
          payload: None,
          metadata: json!({
            "providerNamespace": source.namespace,
            "providerSubscriptionId": source.id,
            "provider": subscription.provider.as_str(),
            "recurring": source.recurring.as_str(),
            "variant": source.variant,
            "stripeSubscriptionId": (subscription.provider == Provider::Stripe).then_some(source.external_subscription_id).flatten(),
            "financialRestriction": restriction_name(source.candidate.restriction),
            "selected": selected,
          }),
          starts_at: source.starts_at,
          expires_at: subscription.end,
          grace_until: subscription.grace_until,
        },
        now,
      )
      .await?;
    }
  }
  Ok(())
}

pub(super) fn entitlement_subject(namespace: &str, source_id: &str) -> String {
  format!("{namespace}:source:{}:{source_id}", source_id.len())
}
