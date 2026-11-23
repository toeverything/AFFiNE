use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres, types::Json};

use super::{RuntimeError, RuntimeResult};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Case {
  pub user_id: String,
  pub plan_family: String,
  pub conflicted: bool,
  pub bound_provider_namespace: Option<String>,
  pub bound_source_identity: Option<String>,
  pub sources: Vec<CaseSource>,
  pub attempts: Vec<CaseAttempt>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CaseSource {
  pub id: String,
  pub provider: String,
  pub provider_namespace: Option<String>,
  pub source_identity: Option<String>,
  pub external_customer_id: Option<String>,
  pub external_subscription_id: Option<String>,
  pub external_ref: Option<String>,
  pub status: String,
  pub financial_facts: Vec<CaseFinancialFact>,
}

#[derive(Deserialize, Serialize)]
pub(super) struct CaseFinancialFact {
  pub kind: String,
  pub id: String,
  pub status: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CaseAttempt {
  pub id: String,
  pub provider: String,
  pub provider_namespace: String,
  pub status: String,
  pub product_id: Option<String>,
  pub transaction_id: Option<String>,
  pub session_id: Option<String>,
  pub first_sent_at: Option<DateTime<Utc>>,
}

pub(super) async fn load_cases<'e>(
  executor: impl Executor<'e, Database = Postgres>,
  user_id: Option<&str>,
  family: Option<&str>,
  provider_identity: Option<&str>,
  include_resolved: bool,
  attempt_id: Option<&str>,
) -> RuntimeResult<Vec<Case>> {
  let cases: Vec<Json<Case>> = sqlx::query_scalar(
    r#"WITH attempts AS (
         SELECT o.*, f.family
           FROM payment_operations o
           CROSS JOIN (VALUES ('pro'),('ai')) AS f(family)
          WHERE o.operation_type IN ('app_store_purchase','purchase_checkout') AND o.target_type='user'
            AND ($1::text IS NULL OR o.target_id=$1) AND ($2::text IS NULL OR f.family=$2)
            AND o.primary_resource_key=concat('payment:v1:cloud:lock:billing-target:user:',f.family,':',
                                               octet_length(o.target_id),':',o.target_id)
            AND (o.id=$5 OR o.status IN ('waiting','blocked')
                 OR (o.status='pending' AND (o.replay_deadline IS NULL OR o.replay_deadline>statement_timestamp()
                      OR o.first_sent_at IS NOT NULL)))
       ), candidates AS (
         SELECT user_id,plan_family FROM cloud_subscription_bindings
          WHERE conflicted AND ($1 IS NULL OR user_id=$1) AND ($2 IS NULL OR plan_family=$2)
         UNION SELECT target_id,family FROM attempts
         UNION SELECT id,$2 FROM users WHERE $4 AND id=$1
       ), selected AS (
         SELECT user_id,plan_family FROM candidates c
          WHERE $3::text IS NULL OR EXISTS (
            SELECT 1 FROM provider_subscriptions s
             WHERE s.target_type='user' AND s.target_id=c.user_id
               AND (s.plan=c.plan_family OR (c.plan_family='pro' AND s.plan='lifetime_pro'))
               AND ($3 IN (s.source_identity,s.external_subscription_id,s.external_ref,s.external_customer_id)
                    OR EXISTS (SELECT 1 FROM payment_financial_facts f
                                WHERE f.provider_namespace=s.provider_namespace AND f.source_identity=s.source_identity
                                  AND $3 IN (f.external_id,f.external_invoice_id,f.external_payment_id)))
          ) OR EXISTS (
            SELECT 1 FROM attempts a WHERE a.target_id=c.user_id AND a.family=c.plan_family
              AND $3 IN (a.id,a.result->>'transactionId',a.result->>'sessionId')
          ) OR EXISTS (
            SELECT 1 FROM user_stripe_customers sc WHERE sc.user_id=c.user_id AND sc.stripe_customer_id=$3
          )
          ORDER BY user_id,plan_family LIMIT 50
       )
       SELECT jsonb_build_object(
         'userId',c.user_id,'planFamily',c.plan_family,'conflicted',coalesce(b.conflicted,false),
         'boundProviderNamespace',b.bound_provider_namespace,'boundSourceIdentity',b.bound_source_identity,
         'sources',coalesce((
           SELECT jsonb_agg(jsonb_build_object(
             'id',s.id,'provider',s.provider,'providerNamespace',s.provider_namespace,'sourceIdentity',s.source_identity,
             'externalCustomerId',s.external_customer_id,'externalSubscriptionId',s.external_subscription_id,
             'externalRef',s.external_ref,'status',s.status,
             'financialFacts',coalesce((
               SELECT jsonb_agg(jsonb_build_object('kind',f.object_kind,'id',f.external_id,'status',f.status)
                                ORDER BY f.object_kind,f.external_id)
                 FROM payment_financial_facts f
                WHERE f.provider_namespace=s.provider_namespace AND f.source_identity=s.source_identity
             ),'[]'::jsonb)
           ) ORDER BY s.provider_namespace,s.source_identity,s.id)
             FROM provider_subscriptions s WHERE s.target_type='user' AND s.target_id=c.user_id
               AND (s.plan=c.plan_family OR (c.plan_family='pro' AND s.plan='lifetime_pro'))
         ),'[]'::jsonb),
         'attempts',coalesce((
           SELECT jsonb_agg(jsonb_build_object(
             'id',a.id,'provider',a.provider,'providerNamespace',a.provider_namespace,'status',a.status,
             'productId',a.result->>'productId','transactionId',a.result->>'transactionId',
             'sessionId',a.result->>'sessionId','firstSentAt',a.first_sent_at
           ) ORDER BY a.created_at,a.id) FROM attempts a WHERE a.target_id=c.user_id AND a.family=c.plan_family
         ),'[]'::jsonb)
       ) FROM selected c LEFT JOIN cloud_subscription_bindings b USING (user_id,plan_family)
       ORDER BY c.user_id,c.plan_family"#,
  )
  .bind(user_id)
  .bind(family)
  .bind(provider_identity)
  .bind(include_resolved)
  .bind(attempt_id)
  .fetch_all(executor)
  .await
  .map_err(|error| RuntimeError::database("load payment reconciliation cases", error))?;
  Ok(cases.into_iter().map(|Json(case)| case).collect())
}
