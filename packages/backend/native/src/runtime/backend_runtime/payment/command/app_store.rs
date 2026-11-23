use affine_core::payment::{BillingRelationship, FinancialRestriction, Provider, PurchaseAdmission, UserPlanFamily};
use serde::Deserialize;

use super::*;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum AppStoreAction {
  Prepare,
  Claim,
  Cancel,
  Submit,
  Restore,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AppStorePurchase {
  purchase_action: AppStoreAction,
  product_id: String,
  intent_id: Option<String>,
  attempt_id: Option<String>,
  transaction_id: Option<String>,
}

impl PaymentRuntime {
  pub(super) async fn app_store_purchase(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    user_id: &str,
    input: AppStorePurchase,
  ) -> RuntimeResult<Value> {
    let client = self
      .revenuecat
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat is not configured"))?;
    let config = self
      .revenuecat_config
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat is not configured"))?;
    let namespace = canonical_namespace(client.namespace())?;
    let product = config
      .product_map
      .get(&input.product_id)
      .ok_or_else(|| RuntimeError::invalid_input("invalid App Store product"))?;
    let plan = parse_plan(&product.plan)?;
    let family =
      UserPlanFamily::from_plan(plan).ok_or_else(|| RuntimeError::invalid_input("invalid App Store plan"))?;
    let recurring = SubscriptionRecurring::parse(&product.recurring)
      .ok_or_else(|| RuntimeError::invalid_input("invalid App Store recurring"))?;
    let scope = PaymentScope::cloud_target("user", user_id, plan)?;
    let mut scopes = vec![scope.clone()];
    if matches!(input.purchase_action, AppStoreAction::Cancel) {
      scopes.push(PaymentScope::customer(&namespace, user_id)?);
    }
    let mut connection = PaymentConnection::try_acquire(&self.pool, scopes)
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    let now = purchase_time(&mut connection).await?;
    let open = open_purchase(&mut connection, &scope, now).await?;

    if matches!(input.purchase_action, AppStoreAction::Prepare) {
      let intent_id = input
        .intent_id
        .as_deref()
        .ok_or_else(|| RuntimeError::invalid_input("missing purchase intent"))?;
      validate_intent(intent_id)?;
      if let Some(attempt) = open
        .as_ref()
        .filter(|attempt| attempt.namespace == namespace && attempt.intent_id == intent_id)
      {
        if attempt.result.as_ref().and_then(|result| result["productId"].as_str()) != Some(&input.product_id) {
          return Err(RuntimeError::invalid_state("payment intent payload changed"));
        }
        if attempt.status == "pending" {
          return Ok(json!({ "status": "prepared", "attemptId": attempt.id }));
        }
      }
      let facts = load_user_purchase_facts(&mut connection, user_id, family).await?;
      return match facts.admission(family, Provider::RevenueCat, recurring, now, open.is_some()) {
        PurchaseAdmission::Allowed => {
          let attempt_id = uuid::Uuid::new_v4().to_string();
          let inserted = sqlx::query(
            "INSERT INTO payment_operations(
               id,provider,provider_namespace,operation_type,intent_id,primary_resource_key,resource_keys,
               target_type,target_id,status,result,replay_deadline)
             VALUES($1,'revenuecat',$2,'app_store_purchase',$3,$4,ARRAY[$4],'user',$5,'pending',$6,$7)
             ON CONFLICT(provider_namespace,intent_id) DO NOTHING",
          )
          .bind(&attempt_id)
          .bind(&namespace)
          .bind(intent_id)
          .bind(scope.as_str())
          .bind(user_id)
          .bind(json!({ "productId": input.product_id }))
          .bind(now + Duration::minutes(5))
          .execute(connection.connection())
          .await
          .map_err(|error| RuntimeError::database("prepare App Store purchase", error))?;
          if inserted.rows_affected() == 0 {
            return Ok(json!({ "status": "processing" }));
          }
          Ok(json!({ "status": "prepared", "attemptId": attempt_id }))
        }
        PurchaseAdmission::Existing(provider) => Ok(json!({ "status": "existing", "provider": provider })),
        PurchaseAdmission::InProgress => {
          let stripe_checkout =
            open.filter(|attempt| attempt.operation_type == "purchase_checkout" && attempt.status == "waiting");
          Ok(match stripe_checkout {
            Some(attempt) => json!({ "status": "processing", "provider": "stripe", "attemptId": attempt.id }),
            None => json!({ "status": "processing" }),
          })
        }
        PurchaseAdmission::NeedsVerification => Ok(json!({ "status": "conflict" })),
      };
    }

    let restore = matches!(input.purchase_action, AppStoreAction::Restore);
    let attempt = open.filter(|attempt| {
      attempt.namespace == namespace
        && attempt.operation_type == "app_store_purchase"
        && attempt.result.as_ref().and_then(|result| result["productId"].as_str()) == Some(&input.product_id)
        && (restore || input.attempt_id.as_deref() == Some(&attempt.id))
    });
    match input.purchase_action {
      AppStoreAction::Prepare => unreachable!(),
      AppStoreAction::Claim => {
        let Some(attempt) = attempt.filter(|attempt| attempt.status == "pending") else {
          return Ok(json!({ "status": "processing" }));
        };
        let facts = load_user_purchase_facts(&mut connection, user_id, family).await?;
        match facts.admission(family, Provider::RevenueCat, recurring, now, false) {
          PurchaseAdmission::Allowed => {}
          PurchaseAdmission::Existing(provider) => return Ok(json!({ "status": "existing", "provider": provider })),
          _ => return Ok(json!({ "status": "conflict" })),
        }
        sqlx::query(
          "UPDATE payment_operations SET status='waiting',first_sent_at=$2,replay_deadline=NULL,updated_at=$2
             WHERE id=$1 AND status='pending'",
        )
        .bind(&attempt.id)
        .bind(now)
        .execute(connection.connection())
        .await
        .map_err(|error| RuntimeError::database("claim App Store purchase", error))?;
        Ok(json!({ "status": "start", "attemptId": attempt.id }))
      }
      AppStoreAction::Cancel => {
        let Some(attempt) = attempt.filter(|attempt| attempt.status == "waiting") else {
          let canceled: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM payment_operations WHERE id=$1 AND provider_namespace=$2
               AND target_type='user' AND target_id=$3 AND operation_type='app_store_purchase'
               AND status='completed' AND result->>'productId'=$4 AND last_error_code='sdk_cancelled')",
          )
          .bind(input.attempt_id.as_deref())
          .bind(&namespace)
          .bind(user_id)
          .bind(&input.product_id)
          .fetch_one(connection.connection())
          .await
          .map_err(|error| RuntimeError::database("load App Store cancellation result", error))?;
          return Ok(json!({ "status": if canceled { "canceled" } else { "processing" } }));
        };
        if attempt
          .result
          .as_ref()
          .and_then(|result| result["transactionId"].as_str())
          .is_some()
        {
          return Ok(json!({ "status": "processing" }));
        }
        let mut now = now;
        for expansions in 0..=4 {
          let snapshot = self.observe_revenuecat_customer(user_id).await?;
          let occupies = snapshot.subscriptions.iter().any(|subscription| {
            UserPlanFamily::from_plan(subscription.plan) == Some(family)
              && BillingRelationship {
                provider: Provider::RevenueCat,
                lifecycle: subscription.lifecycle,
                period_end: subscription.period_end,
                canceled_at: subscription.canceled_at,
              }
              .occupies_purchase(subscription.plan, FinancialRestriction::None, now)
          });
          match apply_payment_snapshot(&mut connection, snapshot, self.deployment, &self.mail_hash_key).await {
            Ok(applied) => changes.extend(applied),
            Err(PaymentApplyError::Runtime(error)) => return Err(error),
            Err(PaymentApplyError::LockSetExpanded(expansion)) => {
              if expansions == 4 {
                break;
              }
              let Some(reacquired) = connection.reacquire_with(&self.pool, expansion).await? else {
                return Ok(json!({ "status": "processing" }));
              };
              connection = reacquired;
              now = purchase_time(&mut connection).await?;
              continue;
            }
          }
          let cancelable: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM payment_operations
               WHERE id=$1 AND status='waiting' AND result->>'transactionId' IS NULL)",
          )
          .bind(&attempt.id)
          .fetch_one(connection.connection())
          .await
          .map_err(|error| RuntimeError::database("check App Store cancellation after observation", error))?;
          if occupies || !cancelable {
            return Ok(json!({ "status": "processing" }));
          }
          finish_purchase(&mut connection, &attempt.id, "sdk_cancelled").await?;
          return Ok(json!({ "status": "canceled" }));
        }
        Ok(json!({ "status": "processing" }))
      }
      AppStoreAction::Submit | AppStoreAction::Restore => {
        let transaction_id = input
          .transaction_id
          .as_deref()
          .ok_or_else(|| RuntimeError::invalid_input("missing App Store transaction"))?;
        validate_identity(transaction_id, "App Store transaction")?;
        let attempt = attempt.filter(|attempt| attempt.status == "waiting");
        if !restore && attempt.is_none() {
          let prior: Option<Value> = sqlx::query_scalar(
            "SELECT result FROM payment_operations WHERE id=$1 AND provider_namespace=$2 AND target_id=$3
               AND target_type='user' AND operation_type='app_store_purchase' AND status='completed'
               AND result->>'productId'=$4 AND result->>'transactionId'=$5",
          )
          .bind(input.attempt_id.as_deref())
          .bind(&namespace)
          .bind(user_id)
          .bind(&input.product_id)
          .bind(transaction_id)
          .fetch_optional(connection.connection())
          .await
          .map_err(|error| RuntimeError::database("load App Store purchase result", error))?;
          return Ok(match prior {
            Some(mut prior) => {
              prior["attemptId"] = json!(input.attempt_id);
              prior
            }
            None => json!({ "status": "processing" }),
          });
        }
        if let Some(attempt) = attempt.as_ref().filter(|_| !restore) {
          let recorded = sqlx::query(
            "UPDATE payment_operations SET result=result || jsonb_build_object('transactionId',$2::text),
               next_attempt_at=clock_timestamp()+INTERVAL '1 minute' WHERE id=$1 AND status='waiting'
                 AND (result->>'transactionId' IS NULL OR result->>'transactionId'=$2)",
          )
          .bind(&attempt.id)
          .bind(transaction_id)
          .execute(connection.connection())
          .await
          .map_err(|error| RuntimeError::database("record App Store transaction", error))?;
          if recorded.rows_affected() == 0 {
            return Ok(json!({ "status": "processing" }));
          }
        }
        drop(connection);
        let transaction = AppStoreTransaction {
          namespace: &namespace,
          user_id,
          product_id: &input.product_id,
          transaction_id,
          family,
        };
        let status = self
          .verify_app_store_purchase(
            changes,
            &transaction,
            &scope,
            attempt.as_ref().map(|attempt| attempt.id.as_str()),
          )
          .await?;
        let mut result = json!({ "status": status });
        if !restore && let Some(attempt) = attempt {
          result["attemptId"] = json!(attempt.id);
        }
        Ok(result)
      }
    }
  }
}
