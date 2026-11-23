use affine_core::payment::{
  BillingRelationship, FinancialRestriction, Provider, ProviderLifecycle, PurchaseAdmission, PurchaseRelationship,
  UserPlanFamily, purchase_admission,
};
use chrono::{DateTime, Utc};

use super::*;

pub(super) struct OpenPurchase {
  pub id: String,
  pub namespace: String,
  pub operation_type: String,
  pub intent_id: String,
  pub status: String,
  pub steps: Vec<PaymentStepState>,
  pub result: Option<Value>,
}

pub(super) async fn purchase_time(connection: &mut PaymentConnection) -> RuntimeResult<DateTime<Utc>> {
  sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(connection.connection())
    .await
    .map_err(|error| RuntimeError::database("load purchase decision time", error))
}

pub(super) async fn open_purchase(
  connection: &mut PaymentConnection,
  scope: &PaymentScope,
  now: DateTime<Utc>,
) -> RuntimeResult<Option<OpenPurchase>> {
  sqlx::query(
    "UPDATE payment_operations SET status='rejected',last_error_code='preparation_expired',updated_at=$2
     WHERE primary_resource_key=$1 AND operation_type='app_store_purchase'
       AND status='pending' AND replay_deadline<=$2",
  )
  .bind(scope.as_str())
  .bind(now)
  .execute(connection.connection())
  .await
  .map_err(|error| RuntimeError::database("expire App Store preparation", error))?;
  let row = sqlx::query(
    "SELECT id,provider_namespace,operation_type,intent_id,status,steps,result
       FROM payment_operations WHERE primary_resource_key=$1 AND status IN ('pending','waiting','blocked')
       AND operation_type IN ('purchase_checkout','app_store_purchase')",
  )
  .bind(scope.as_str())
  .fetch_optional(connection.connection())
  .await
  .map_err(|error| RuntimeError::database("load open purchase", error))?;
  row
    .map(|row| {
      Ok(OpenPurchase {
        id: row.get("id"),
        namespace: row.get("provider_namespace"),
        operation_type: row.get("operation_type"),
        intent_id: row.get("intent_id"),
        status: row.get("status"),
        steps: serde_json::from_value(row.get("steps"))
          .map_err(|error| RuntimeError::json("decode open purchase", error))?,
        result: row.get("result"),
      })
    })
    .transpose()
}

pub(super) struct UserPurchaseFacts {
  relationships: Vec<PurchaseRelationship>,
  binding_conflict: bool,
}

impl UserPurchaseFacts {
  pub(super) fn admission(
    &self,
    family: UserPlanFamily,
    provider: Provider,
    recurring: SubscriptionRecurring,
    now: DateTime<Utc>,
    has_attempt: bool,
  ) -> PurchaseAdmission {
    purchase_admission(
      family,
      provider,
      recurring,
      now,
      &self.relationships,
      has_attempt,
      self.binding_conflict,
    )
  }
}

pub(super) async fn load_user_purchase_facts(
  connection: &mut PaymentConnection,
  user_id: &str,
  family: UserPlanFamily,
) -> RuntimeResult<UserPurchaseFacts> {
  let plans: &[&str] = match family {
    UserPlanFamily::Pro => &["pro", "lifetime_pro"],
    UserPlanFamily::Ai => &["ai"],
  };
  let rows = sqlx::query(
    "SELECT s.provider::text AS provider,s.status,s.plan,s.recurring,s.period_end,s.canceled_at,
            ARRAY(
              SELECT DISTINCT e.metadata->>'financialRestriction'
              FROM entitlements e
              WHERE e.target_type=s.target_type AND e.target_id=s.target_id AND e.source='cloud_subscription'
                AND e.metadata->>'providerSubscriptionId'=s.id
                AND e.metadata->>'providerNamespace'=s.provider_namespace
                AND e.metadata->>'financialRestriction' IS NOT NULL
            ) AS financial_restrictions
       FROM provider_subscriptions s WHERE s.target_type='user' AND s.target_id=$1 AND s.plan=ANY($2)",
  )
  .bind(user_id)
  .bind(plans)
  .fetch_all(connection.connection())
  .await
  .map_err(|error| RuntimeError::database("load billing relationships for purchase", error))?;
  let relationships = rows
    .into_iter()
    .map(|row| {
      let provider =
        Provider::parse(row.get("provider")).ok_or_else(|| RuntimeError::invalid_state("invalid purchase provider"))?;
      let lifecycle = ProviderLifecycle::parse(row.get("status"))
        .ok_or_else(|| RuntimeError::invalid_state("invalid purchase lifecycle"))?;
      let recurring = row
        .get::<Option<&str>, _>("recurring")
        .and_then(SubscriptionRecurring::parse)
        .ok_or_else(|| RuntimeError::invalid_state("invalid purchase recurring"))?;
      let plan = match (parse_plan(row.get("plan"))?, recurring) {
        (Plan::Pro, SubscriptionRecurring::Lifetime) => Plan::LifetimePro,
        (plan, _) => plan,
      };
      let restriction = row.get::<Vec<String>, _>("financial_restrictions").iter().try_fold(
        FinancialRestriction::None,
        |current, value| {
          FinancialRestriction::parse(value)
            .map(|restriction| current.max(restriction))
            .ok_or_else(|| RuntimeError::invalid_state("invalid purchase financial restriction"))
        },
      )?;
      Ok(PurchaseRelationship {
        plan,
        recurring,
        restriction,
        billing: BillingRelationship {
          provider,
          lifecycle,
          period_end: row.get("period_end"),
          canceled_at: row.get("canceled_at"),
        },
      })
    })
    .collect::<RuntimeResult<Vec<_>>>()?;
  let binding_conflict = sqlx::query_scalar(
    "SELECT EXISTS(
       SELECT 1 FROM cloud_subscription_bindings WHERE user_id=$1 AND plan_family=$2 AND conflicted
     )",
  )
  .bind(user_id)
  .bind(family.as_str())
  .fetch_one(connection.connection())
  .await
  .map_err(|error| RuntimeError::database("load purchase binding conflict", error))?;
  Ok(UserPurchaseFacts {
    relationships,
    binding_conflict,
  })
}
