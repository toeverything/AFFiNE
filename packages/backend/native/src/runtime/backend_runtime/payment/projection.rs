use std::collections::BTreeMap;

use affine_core::{
  access_control::{EntitlementStatus, Plan, TargetType},
  payment::{
    BillingRelationship, CloudSourceCandidate, FinancialRestriction, Provider, ProviderLifecycle,
    SubscriptionRecurring, cloud_plan_family, resolve_cloud_binding, select_cloud_source, settle_cloud_binding,
  },
};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction, postgres::PgRow};

use super::{
  super::entitlement::{EntitlementWrite, RuntimeEntitlementTarget, upsert},
  PaymentScope, RuntimeError, RuntimeResult,
  apply::restriction_name,
  decide_stored_subscription, load_collection_pauses,
};

struct ProjectedSource {
  id: String,
  trial_end: Option<DateTime<Utc>>,
  recurring: SubscriptionRecurring,
  variant: Value,
  external_subscription_id: Option<String>,
  conflict_member: bool,
  candidate: CloudSourceCandidate,
}

pub(super) struct BindingSettlement<'a> {
  pub user_id: &'a str,
  pub family: &'a str,
}

pub(super) async fn reconcile_cloud_bindings(
  tx: &mut Transaction<'_, Postgres>,
  targets: &[RuntimeEntitlementTarget],
  scopes: &[PaymentScope],
  now: DateTime<Utc>,
  settlement: Option<&BindingSettlement<'_>>,
) -> RuntimeResult<()> {
  let targets_for = |target_type, plan| {
    targets
      .iter()
      .filter(|target| target.target_type == target_type)
      .filter_map(
        |target| match PaymentScope::cloud_target(target_type, &target.target_id, plan) {
          Ok(scope) if scopes.contains(&scope) => Some(Ok(target.target_id.as_str())),
          Ok(_) => None,
          Err(error) => Some(Err(error)),
        },
      )
      .collect::<RuntimeResult<Vec<_>>>()
  };
  let pro_users = targets_for("user", Plan::Pro)?;
  let ai_users = targets_for("user", Plan::Ai)?;
  let workspace_ids = targets_for("workspace", Plan::Team)?;
  if pro_users.is_empty() && ai_users.is_empty() && workspace_ids.is_empty() {
    return Ok(());
  }

  let rows = sqlx::query(
    r#"SELECT id,provider::text AS provider,provider_namespace,source_identity,target_type,target_id,
              plan,recurring,status,gives_access,quantity,trial_end,period_start,period_end,will_renew,canceled_at,
              external_subscription_id,metadata->'variant' AS variant,
              (SELECT u.email FROM user_stripe_customers c JOIN users u ON u.id=c.user_id
                WHERE c.provider_namespace=s.provider_namespace
                  AND c.stripe_customer_id=s.external_customer_id) AS billing_email,
              EXISTS(SELECT 1 FROM entitlements e WHERE e.source='cloud_subscription'
                AND e.target_type=s.target_type AND e.target_id=s.target_id
                AND e.metadata->>'providerSubscriptionId'=s.id
                AND e.metadata->>'conflictMember'='true') AS conflict_member
       FROM provider_subscriptions s
       WHERE provider_namespace IS NOT NULL AND source_identity IS NOT NULL
         AND ((target_type='user' AND target_id=ANY($1) AND plan IN ('pro','lifetime_pro'))
           OR (target_type='user' AND target_id=ANY($2) AND plan='ai')
           OR (target_type='workspace' AND target_id=ANY($3) AND plan='team'))
       ORDER BY provider_namespace,source_identity,id FOR UPDATE"#,
  )
  .bind(&pro_users)
  .bind(&ai_users)
  .bind(&workspace_ids)
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("lock cloud payment sources", error))?;
  let keys = |stripe_only: bool| {
    rows
      .iter()
      .filter(|row| !stripe_only || row.get::<&str, _>("provider") == Provider::Stripe.as_str())
      .map(|row| {
        (
          row.get::<&str, _>("provider_namespace"),
          row.get::<&str, _>("source_identity"),
        )
      })
      .unzip::<_, _, Vec<_>, Vec<_>>()
  };
  let (stripe_namespaces, stripe_sources) = keys(true);
  let mut pauses = load_collection_pauses(tx, &stripe_namespaces, &stripe_sources).await?;

  let mut facts = BTreeMap::<(String, String), Vec<PgRow>>::new();
  if !rows.is_empty() {
    let (namespaces, sources) = keys(false);
    let fact_rows = sqlx::query(
      r#"SELECT f.provider_namespace,f.source_identity,f.object_kind,f.status,f.metadata
         FROM unnest($1::text[], $2::text[]) AS s(provider_namespace,source_identity)
         JOIN payment_financial_facts f USING (provider_namespace,source_identity)
         ORDER BY f.provider_namespace,f.source_identity,f.object_kind,f.external_id FOR UPDATE OF f"#,
    )
    .bind(&namespaces)
    .bind(&sources)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock cloud payment financial facts", error))?;
    for row in fact_rows {
      facts
        .entry((row.get("provider_namespace"), row.get("source_identity")))
        .or_default()
        .push(row);
    }
  }

  let mut groups = BTreeMap::<(&str, &str, &str), Vec<ProjectedSource>>::new();
  for (target_type, family, ids) in [
    ("user", "pro", pro_users),
    ("user", "ai", ai_users),
    ("workspace", "team", workspace_ids),
  ] {
    groups.extend(ids.into_iter().map(|id| ((target_type, id, family), Vec::new())));
  }
  for row in &rows {
    let key = (row.get("provider_namespace"), row.get("source_identity"));
    let (subscription, restriction) = decide_stored_subscription(
      row,
      facts.get(&key).map(Vec::as_slice).unwrap_or_default(),
      pauses.remove(&key).unwrap_or_default(),
      now,
    )?;
    let expected_target = match subscription.target_type {
      TargetType::User => "user",
      TargetType::Workspace => "workspace",
      TargetType::Instance => return Err(RuntimeError::invalid_state("invalid cloud payment target")),
    };
    let target_type: &str = row.get("target_type");
    let target_id: &str = row.get("target_id");
    let family = cloud_plan_family(subscription.access.plan)
      .ok_or_else(|| RuntimeError::invalid_state("invalid stored cloud payment plan"))?;
    if target_type != expected_target {
      return Err(RuntimeError::invalid_state("stored payment target does not match plan"));
    }
    let relationship = BillingRelationship {
      provider: subscription.provider,
      lifecycle: ProviderLifecycle::parse(row.get("status"))
        .ok_or_else(|| RuntimeError::invalid_state("unknown stored payment lifecycle"))?,
      period_end: subscription.end,
      canceled_at: row.get("canceled_at"),
    };
    groups
      .get_mut(&(target_type, target_id, family))
      .ok_or_else(|| RuntimeError::invalid_state("cloud payment source missing target lock"))?
      .push(ProjectedSource {
        id: row.get("id"),
        trial_end: row.get("trial_end"),
        recurring: SubscriptionRecurring::parse(row.get("recurring"))
          .ok_or_else(|| RuntimeError::invalid_state("unknown stored payment recurring"))?,
        variant: row.get::<Option<Value>, _>("variant").unwrap_or(Value::Null),
        external_subscription_id: row.get("external_subscription_id"),
        conflict_member: row.get("conflict_member"),
        candidate: CloudSourceCandidate {
          provider_namespace: key.0,
          target_id: target_id.to_owned(),
          subscription,
          starts_at: row.get("period_start"),
          restriction,
          relationship,
        },
      });
  }

  for ((target_type, target_id, family), sources) in groups {
    let candidates = sources
      .iter()
      .map(|source| source.candidate.clone())
      .collect::<Vec<_>>();
    let (bound, conflicted) = if target_type == "user" {
      let settle = settlement.is_some_and(|settlement| settlement.user_id == target_id && settlement.family == family);
      reconcile_user_binding(tx, target_id, family, &candidates, now, settle).await?
    } else {
      (
        select_cloud_source(&candidates, now).map(CloudSourceCandidate::identity),
        false,
      )
    };
    let target = RuntimeEntitlementTarget {
      target_type: target_type.to_owned(),
      target_id: target_id.to_owned(),
    };
    for source in sources {
      let candidate = &source.candidate;
      let subscription = &candidate.subscription;
      let bound_source = bound == Some(candidate.identity());
      let selected = bound_source && candidate.authorizes(now);
      let status = if selected {
        subscription.status
      } else if candidate.restriction == FinancialRestriction::Revoke
        || subscription.status == EntitlementStatus::Revoked
      {
        EntitlementStatus::Revoked
      } else {
        EntitlementStatus::Expired
      };
      let conflict_member =
        conflicted && (source.conflict_member || bound_source || candidate.occupies_or_authorizes(now));
      let paid_from = selected
        .then(|| candidate.paid_ai_from(source.trial_end, now))
        .flatten();
      upsert(
        tx,
        EntitlementWrite {
          target: &target,
          source: "cloud_subscription",
          subject_id: &entitlement_subject(&candidate.provider_namespace, &subscription.source_id),
          plan: subscription.access.plan.as_str(),
          status: status.as_str(),
          quantity: subscription.access.quantity,
          payload: None,
          metadata: json!({
            "providerNamespace": candidate.provider_namespace,
            "providerSubscriptionId": source.id,
            "provider": subscription.provider.as_str(),
            "recurring": source.recurring.as_str(),
            "variant": source.variant,
            "stripeSubscriptionId": (subscription.provider == Provider::Stripe).then_some(source.external_subscription_id).flatten(),
            "financialRestriction": restriction_name(candidate.restriction),
            "selected": selected,
            "conflictMember": conflict_member,
            "paidFrom": paid_from,
          }),
          starts_at: candidate.starts_at,
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

async fn reconcile_user_binding<'a>(
  tx: &mut Transaction<'_, Postgres>,
  user_id: &str,
  family: &str,
  candidates: &'a [CloudSourceCandidate],
  now: DateTime<Utc>,
  settle: bool,
) -> RuntimeResult<(Option<(&'a str, &'a str)>, bool)> {
  let previous: Option<(Option<String>, Option<String>, bool)> = sqlx::query_as(
    r#"SELECT bound_provider_namespace,bound_source_identity,conflicted
       FROM cloud_subscription_bindings WHERE user_id=$1 AND plan_family=$2 FOR UPDATE"#,
  )
  .bind(user_id)
  .bind(family)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("lock cloud subscription binding", error))?;
  let (namespace, source_id, was_conflicted) = previous.unwrap_or_default();
  let previous_bound = namespace.as_deref().zip(source_id.as_deref());
  let (bound, conflicted) = resolve_cloud_binding(candidates, previous_bound, was_conflicted, now);
  let (bound, conflicted) = if settle && conflicted {
    match settle_cloud_binding(candidates, now) {
      Ok(settled) => (settled, false),
      Err(_) => (bound, true),
    }
  } else {
    (bound, conflicted)
  };
  let bound = bound.map(CloudSourceCandidate::identity);
  let stored_bound = if was_conflicted && conflicted {
    previous_bound
  } else {
    bound
  };
  if stored_bound != previous_bound || conflicted != was_conflicted {
    let (namespace, source_id) = stored_bound.unzip();
    sqlx::query(
      r#"INSERT INTO cloud_subscription_bindings
           (user_id,plan_family,bound_provider_namespace,bound_source_identity,conflicted)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id,plan_family) DO UPDATE SET
           bound_provider_namespace=EXCLUDED.bound_provider_namespace,
           bound_source_identity=EXCLUDED.bound_source_identity,
           conflicted=EXCLUDED.conflicted"#,
    )
    .bind(user_id)
    .bind(family)
    .bind(namespace)
    .bind(source_id)
    .bind(conflicted)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("write cloud subscription binding", error))?;
  }
  Ok((bound, conflicted))
}

pub(super) fn entitlement_subject(namespace: &str, source_id: &str) -> String {
  format!("{namespace}:source:{}:{source_id}", source_id.len())
}
