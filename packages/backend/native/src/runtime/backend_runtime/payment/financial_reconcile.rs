use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;

use super::{
  OperationCompletion, OperationIntent, PaymentApplyResult, PaymentConnection, PaymentRuntime, PaymentScope,
  PaymentSendDecision, PaymentSnapshot, PaymentStep, PaymentStepState, freeze_operation, mark_operation_step_sent,
  record_operation_error, record_operation_step_result,
};
use crate::runtime::{RuntimeError, RuntimeResult};

const CURSOR_PURPOSE: &str = "payment_reconcile_cursor:financial";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct FinancialCursor {
  after: Option<String>,
  overlap_pending: bool,
  generation: u64,
}

struct FinancialCandidate {
  namespace: String,
  object_kind: String,
  external_id: String,
  source_id: Option<String>,
  cursor: FinancialCursor,
  next_cursor: FinancialCursor,
}

pub(super) async fn reconcile_one_financial(runtime: &PaymentRuntime) -> RuntimeResult<Option<PaymentApplyResult>> {
  let Some(client) = runtime.stripe.as_ref() else {
    return Ok(None);
  };
  let namespace = client
    .namespace()
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid Stripe provider namespace"))?;
  let Some(candidate) = financial_candidate(runtime, &namespace).await? else {
    return Ok(None);
  };
  let mut resources = vec![PaymentScope::financial(
    &namespace,
    &candidate.object_kind,
    &candidate.external_id,
  )?];
  if let Some(source_id) = candidate.source_id.as_deref() {
    resources.push(PaymentScope::source(&namespace, source_id)?);
  }
  let intent_id = format!(
    "reconcile:financial:{}:{}:{}:{}",
    candidate.cursor.generation,
    u8::from(candidate.cursor.overlap_pending),
    candidate.object_kind,
    candidate.external_id
  );
  let step_key = format!("payment:{intent_id}:verify");
  let mut connection = PaymentConnection::try_acquire(&runtime.pool, resources.clone())
    .await?
    .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
  let frozen = freeze_operation(
    &mut connection,
    &OperationIntent {
      namespace: client.namespace().clone(),
      operation_type: "reconcile_financial".to_string(),
      intent_id,
      resources,
      target_type: None,
      target_id: None,
      steps: vec![PaymentStepState {
        key: step_key.clone(),
        request: PaymentStep::VerifySource {
          source_id: candidate.external_id.clone(),
        },
        first_sent_at: None,
        result: None,
      }],
    },
  )
  .await?;
  if frozen.status == "completed" {
    advance_cursor(runtime, &candidate).await?;
    return Ok(None);
  }
  if frozen.status != "pending" {
    return Err(RuntimeError::invalid_state("payment financial reconcile is blocked"));
  }
  if frozen.steps[0].result.is_none()
    && mark_operation_step_sent(&mut connection, &frozen.id, &step_key, chrono::Duration::days(3650)).await?
      == PaymentSendDecision::Blocked
  {
    return Err(RuntimeError::invalid_state("payment financial reconcile is blocked"));
  }
  let snapshot = recover_financial(runtime, &candidate, &frozen.id).await;
  let snapshot = match snapshot {
    Ok(snapshot) => snapshot,
    Err(error) => {
      record_operation_error(
        &mut connection,
        &frozen.id,
        "payment_financial_reconcile_failed",
        true,
        false,
      )
      .await?;
      return Err(error);
    }
  };
  record_operation_step_result(
    &mut connection,
    &frozen.id,
    &step_key,
    json!({ "objectKind": candidate.object_kind, "externalId": candidate.external_id }),
  )
  .await?;
  let changes = runtime.apply_with_connection(connection, snapshot).await?;
  advance_cursor(runtime, &candidate).await?;
  Ok(Some(changes))
}

async fn recover_financial(
  runtime: &PaymentRuntime,
  candidate: &FinancialCandidate,
  operation_id: &str,
) -> RuntimeResult<PaymentSnapshot> {
  let client = runtime
    .stripe
    .as_ref()
    .ok_or_else(|| RuntimeError::invalid_state("Stripe payment provider is not configured"))?;
  let observed_at = chrono::Utc::now();
  let mut snapshot = match candidate.object_kind.as_str() {
    "invoice" => {
      let invoice = client
        .invoice(&candidate.external_id)
        .await
        .map_err(provider_runtime_error)?;
      super::stripe_invoice_snapshot(&runtime.pool, client, invoice, Vec::new(), observed_at).await?
    }
    "refund" => {
      let refund = client
        .refund(&candidate.external_id)
        .await
        .map_err(provider_runtime_error)?;
      let charge_id = refund
        .charge
        .as_ref()
        .map(|charge| charge.id())
        .ok_or_else(|| RuntimeError::invalid_state("Stripe refund has no charge"))?;
      let charge = client.charge(charge_id).await.map_err(provider_runtime_error)?;
      let invoice_id = charge
        .invoice
        .as_ref()
        .map(|invoice| invoice.id())
        .ok_or_else(|| RuntimeError::invalid_state("Stripe refund charge has no invoice"))?;
      let invoice = client.invoice(invoice_id).await.map_err(provider_runtime_error)?;
      let mut snapshot =
        super::stripe_invoice_snapshot(&runtime.pool, client, invoice, Vec::new(), observed_at).await?;
      super::push_stripe_refund(&mut snapshot, refund, observed_at)?;
      snapshot
    }
    "dispute" => {
      let dispute = client
        .dispute(&candidate.external_id)
        .await
        .map_err(provider_runtime_error)?;
      let charge = client
        .charge(dispute.charge.id())
        .await
        .map_err(provider_runtime_error)?;
      let invoice_id = charge
        .invoice
        .as_ref()
        .map(|invoice| invoice.id())
        .ok_or_else(|| RuntimeError::invalid_state("Stripe dispute charge has no invoice"))?;
      let invoice = client.invoice(invoice_id).await.map_err(provider_runtime_error)?;
      let mut snapshot =
        super::stripe_invoice_snapshot(&runtime.pool, client, invoice, Vec::new(), observed_at).await?;
      super::push_stripe_dispute(&mut snapshot, dispute, observed_at)?;
      snapshot
    }
    _ => return Err(RuntimeError::invalid_state("unknown stored payment financial object")),
  };
  snapshot.operation = Some(OperationCompletion {
    operation_id: operation_id.to_string(),
    result: json!({ "status": "completed" }),
  });
  Ok(snapshot)
}

async fn financial_candidate(runtime: &PaymentRuntime, namespace: &str) -> RuntimeResult<Option<FinancialCandidate>> {
  let token_hash = super::super::token_hash(namespace);
  let initial = FinancialCursor {
    after: None,
    overlap_pending: false,
    generation: 0,
  };
  sqlx::query(
    r#"INSERT INTO runtime_states(purpose,token_hash,lookup_key,payload,expires_at)
       VALUES($1,$2,$3,$4,clock_timestamp()+INTERVAL '10 years') ON CONFLICT DO NOTHING"#,
  )
  .bind(CURSOR_PURPOSE)
  .bind(&token_hash)
  .bind(namespace)
  .bind(json!(initial))
  .execute(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("initialize payment financial cursor", error))?;
  let mut tx = runtime
    .pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin payment financial cursor", error))?;
  let payload: serde_json::Value =
    sqlx::query_scalar("SELECT payload FROM runtime_states WHERE purpose=$1 AND token_hash=$2 FOR UPDATE")
      .bind(CURSOR_PURPOSE)
      .bind(&token_hash)
      .fetch_one(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock payment financial cursor", error))?;
  let cursor: FinancialCursor =
    serde_json::from_value(payload).map_err(|error| RuntimeError::json("decode payment financial cursor", error))?;
  let key = cursor.after.as_deref().unwrap_or_default();
  let comparison = if cursor.after.is_none() {
    ">"
  } else if cursor.overlap_pending {
    "="
  } else {
    ">"
  };
  let query = format!(
    r#"SELECT object_kind,external_id,source_identity FROM payment_financial_facts
       WHERE provider_namespace=$1
         AND ((object_kind='invoice' AND status='open') OR (object_kind='refund' AND status='pending') OR (object_kind='dispute' AND status='open'))
         AND (object_kind || ':' || external_id) {comparison} $2
       ORDER BY object_kind,external_id LIMIT 1"#,
  );
  let mut row = sqlx::query(&query)
    .bind(namespace)
    .bind(key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("load payment financial candidate", error))?;
  let mut overlap_pass = cursor.overlap_pending;
  if row.is_none() && cursor.overlap_pending {
    row = sqlx::query(
      r#"SELECT object_kind,external_id,source_identity FROM payment_financial_facts
         WHERE provider_namespace=$1
           AND ((object_kind='invoice' AND status='open') OR (object_kind='refund' AND status='pending') OR (object_kind='dispute' AND status='open'))
           AND (object_kind || ':' || external_id) > $2
         ORDER BY object_kind,external_id LIMIT 1"#,
    )
      .bind(namespace)
      .bind(key)
      .fetch_optional(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("advance payment financial candidate overlap", error))?;
    overlap_pass = false;
  }
  let Some(row) = row else {
    let wrapped = FinancialCursor {
      after: None,
      overlap_pending: false,
      generation: cursor.generation + 1,
    };
    write_cursor(&mut tx, &token_hash, &wrapped).await?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit payment financial cursor wrap", error))?;
    return Ok(None);
  };
  let object_kind: String = row.get("object_kind");
  let external_id: String = row.get("external_id");
  let next_cursor = FinancialCursor {
    after: Some(format!("{object_kind}:{external_id}")),
    overlap_pending: !overlap_pass,
    generation: cursor.generation,
  };
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit payment financial cursor read", error))?;
  Ok(Some(FinancialCandidate {
    namespace: namespace.to_string(),
    object_kind,
    external_id,
    source_id: row.get("source_identity"),
    cursor,
    next_cursor,
  }))
}

async fn advance_cursor(runtime: &PaymentRuntime, candidate: &FinancialCandidate) -> RuntimeResult<()> {
  let token_hash = super::super::token_hash(&candidate.namespace);
  let mut tx = runtime
    .pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin payment financial cursor advance", error))?;
  let current: serde_json::Value =
    sqlx::query_scalar("SELECT payload FROM runtime_states WHERE purpose=$1 AND token_hash=$2 FOR UPDATE")
      .bind(CURSOR_PURPOSE)
      .bind(&token_hash)
      .fetch_one(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock payment financial cursor advance", error))?;
  if current == json!(candidate.cursor) {
    write_cursor(&mut tx, &token_hash, &candidate.next_cursor).await?;
  }
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit payment financial cursor advance", error))?;
  Ok(())
}

async fn write_cursor(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  token_hash: &str,
  cursor: &FinancialCursor,
) -> RuntimeResult<()> {
  sqlx::query(
    "UPDATE runtime_states SET payload=$3,updated_at=clock_timestamp(),expires_at=clock_timestamp()+INTERVAL '10 \
     years' WHERE purpose=$1 AND token_hash=$2",
  )
  .bind(CURSOR_PURPOSE)
  .bind(token_hash)
  .bind(json!(cursor))
  .execute(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("write payment financial cursor", error))?;
  Ok(())
}

fn provider_runtime_error(error: super::PaymentProviderError) -> RuntimeError {
  RuntimeError::invalid_state(error.code)
}
