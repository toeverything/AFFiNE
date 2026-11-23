use serde_json::{Value, json};
use sqlx::PgConnection;

use super::{AppStoreTransaction, RevenueCatClient, RuntimeError, RuntimeResult, locate_app_store_transaction};

pub(super) async fn observe_app_store_attempt(
  client: &RevenueCatClient,
  transaction: &AppStoreTransaction<'_>,
) -> RuntimeResult<(Option<String>, Value)> {
  let matches = locate_app_store_transaction(client, transaction.transaction_id).await?;
  let observation = json!({
    "transactionId": transaction.transaction_id,
    "matches": matches.iter().map(|source| json!({
      "sourceIdentity": source.id, "customerId": source.customer_id, "status": source.status, "startsAt": source.starts_at
    })).collect::<Vec<_>>()
  });
  let source_id = match matches.as_slice() {
    [matched] => Some(matched.id.clone()),
    _ => None,
  };
  Ok((source_id, observation))
}

pub(super) async fn finish_stripe_attempt(
  connection: &mut PgConnection,
  attempt_id: &str,
  reason: &str,
) -> RuntimeResult<()> {
  sqlx::query(
    "UPDATE payment_operations SET status='completed',next_attempt_at=NULL,last_error_code=$2,
       updated_at=statement_timestamp() WHERE id=$1 AND status='waiting'",
  )
  .bind(attempt_id)
  .bind(reason)
  .execute(connection)
  .await
  .map_err(|error| RuntimeError::database("finish reconciled Stripe payment attempt", error))?;
  Ok(())
}
