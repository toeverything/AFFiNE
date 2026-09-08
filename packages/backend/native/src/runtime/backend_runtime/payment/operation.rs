use affine_core::payment::{
  OperationFailureState, OperationRuleError, OperationSendState, operation_failure_state, operation_result_allowed,
  operation_send_state,
};
use chrono::{Duration, Utc};
use sqlx::Row;

use super::{
  super::{RuntimeError, RuntimeResult},
  OperationIntent, PaymentConnection, PaymentStepState, required_scope_expansion,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct FrozenOperation {
  pub id: String,
  pub status: String,
  pub result: Option<serde_json::Value>,
  pub steps: Vec<PaymentStepState>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum PaymentSendDecision {
  Send,
  Blocked,
}

pub(super) async fn freeze_operation(
  connection: &mut PaymentConnection,
  intent: &OperationIntent,
) -> RuntimeResult<FrozenOperation> {
  let namespace = intent
    .namespace
    .canonical_key()
    .map_err(|error| RuntimeError::invalid_input(format!("invalid provider namespace: {error:?}")))?;
  let resources = intent
    .resources
    .iter()
    .cloned()
    .collect::<std::collections::BTreeSet<_>>()
    .into_iter()
    .collect::<Vec<_>>();
  if intent.intent_id.trim().is_empty()
    || intent.operation_type.trim().is_empty()
    || resources.is_empty()
    || resources.iter().any(|resource| !resource.belongs_to(&namespace))
  {
    return Err(RuntimeError::invalid_input("invalid payment operation intent"));
  }
  let step_keys = intent
    .steps
    .iter()
    .map(|step| step.key.as_str())
    .collect::<std::collections::BTreeSet<_>>();
  if intent.steps.is_empty()
    || step_keys.len() != intent.steps.len()
    || step_keys.iter().any(|key| key.trim().is_empty())
  {
    return Err(RuntimeError::invalid_input("invalid payment operation steps"));
  }
  if !required_scope_expansion(connection.scopes(), resources.clone()).is_empty() {
    return Err(RuntimeError::invalid_state("payment_lock_set_expanded"));
  }
  let resource_keys = resources.iter().map(|resource| resource.as_str()).collect::<Vec<_>>();
  let steps = serde_json::to_value(&intent.steps)
    .map_err(|error| RuntimeError::json("serialize payment operation steps", error))?;
  let mut tx = connection.begin().await?;
  sqlx::query("SET LOCAL statement_timeout = '5s'")
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("set payment operation timeout", error))?;
  let existing = sqlx::query(
    "SELECT id,status,operation_type,primary_resource_key,resource_keys,target_type,target_id,steps,result FROM \
     payment_operations WHERE provider_namespace=$1 AND intent_id=$2 FOR UPDATE",
  )
  .bind(&namespace)
  .bind(&intent.intent_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("lock payment operation intent", error))?;
  if let Some(existing) = existing {
    let frozen_steps: Vec<PaymentStepState> = serde_json::from_value(existing.get("steps"))
      .map_err(|error| RuntimeError::json("decode frozen payment operation steps", error))?;
    let matches = existing.get::<String, _>("operation_type") == intent.operation_type
      && existing.get::<String, _>("primary_resource_key") == resource_keys[0]
      && existing.get::<Vec<String>, _>("resource_keys") == resource_keys
      && existing.get::<Option<String>, _>("target_type") == intent.target_type
      && existing.get::<Option<String>, _>("target_id") == intent.target_id
      && frozen_steps.len() == intent.steps.len()
      && frozen_steps
        .iter()
        .zip(&intent.steps)
        .all(|(frozen, candidate)| frozen.key == candidate.key && frozen.request == candidate.request);
    if !matches {
      return Err(RuntimeError::invalid_state("payment intent payload changed"));
    }
    let result = FrozenOperation {
      id: existing.get("id"),
      status: existing.get("status"),
      result: existing.get("result"),
      steps: frozen_steps,
    };
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit existing payment operation", error))?;
    return Ok(result);
  }
  let overlap: Option<String> = sqlx::query_scalar(
    "SELECT id FROM payment_operations WHERE provider_namespace=$1 AND status IN ('pending','blocked') AND \
     resource_keys && $2 ORDER BY id LIMIT 1 FOR UPDATE",
  )
  .bind(&namespace)
  .bind(&resource_keys)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("check unfinished payment resource", error))?;
  if overlap.is_some() {
    return Err(RuntimeError::invalid_state("payment resource has unfinished operation"));
  }
  let id = uuid::Uuid::new_v4().to_string();
  sqlx::query(
    r#"INSERT INTO payment_operations(id,provider,provider_namespace,operation_type,intent_id,primary_resource_key,resource_keys,target_type,target_id,status,steps)
       VALUES($1,$2::"Provider",$3,$4,$5,$6,$7,$8,$9,'pending',$10)"#,
  )
  .bind(&id)
  .bind(intent.namespace.provider.as_str())
  .bind(&namespace)
  .bind(&intent.operation_type)
  .bind(&intent.intent_id)
  .bind(resource_keys[0])
  .bind(&resource_keys)
  .bind(&intent.target_type)
  .bind(&intent.target_id)
  .bind(steps)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("freeze payment operation", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit payment operation intent", error))?;
  Ok(FrozenOperation {
    id,
    status: "pending".to_string(),
    result: None,
    steps: intent.steps.clone(),
  })
}

pub(super) async fn mark_operation_step_sent(
  connection: &mut PaymentConnection,
  operation_id: &str,
  step_key: &str,
  replay_window: Duration,
) -> RuntimeResult<PaymentSendDecision> {
  if replay_window <= Duration::zero() {
    return Err(RuntimeError::invalid_input("invalid payment replay window"));
  }
  let held = connection
    .scopes()
    .iter()
    .map(|scope| scope.as_str().to_string())
    .collect::<std::collections::BTreeSet<_>>();
  let mut tx = connection.begin().await?;
  let row = sqlx::query(
    "SELECT resource_keys,steps,replay_deadline,clock_timestamp() AS now FROM payment_operations WHERE id=$1 AND \
     status='pending' FOR UPDATE",
  )
  .bind(operation_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("lock payment send boundary", error))?
  .ok_or_else(|| RuntimeError::invalid_input("pending payment operation not found"))?;
  let resources: Vec<String> = row.get("resource_keys");
  if resources.iter().any(|resource| !held.contains(resource.as_str())) {
    return Err(RuntimeError::invalid_state("payment_lock_set_expanded"));
  }
  let mut steps = serde_json::from_value::<Vec<PaymentStepState>>(row.get("steps"))
    .map_err(|error| RuntimeError::json("decode payment operation steps", error))?;
  let step_index = steps
    .iter()
    .position(|step| step.key == step_key)
    .ok_or_else(|| RuntimeError::invalid_input("payment operation step not found"))?;
  let first_unresolved = steps.iter().position(|step| step.result.is_none());
  let step = &mut steps[step_index];
  let now: chrono::DateTime<Utc> = row.get("now");
  match operation_send_state(
    first_unresolved == Some(step_index),
    step.first_sent_at,
    row.get("replay_deadline"),
    now,
  ) {
    Err(OperationRuleError::StepOutOfOrder) => {
      return Err(RuntimeError::invalid_state("payment operation steps are out of order"));
    }
    Err(_) => return Err(RuntimeError::invalid_state("invalid payment operation send state")),
    Ok(OperationSendState::Block) => {
      sqlx::query(
        "UPDATE payment_operations SET \
         status='blocked',last_error_code='replay_window_expired',last_error='replay_window_expired',\
         next_attempt_at=NULL,updated_at=$2 WHERE id=$1",
      )
      .bind(operation_id)
      .bind(now)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("block expired payment operation", error))?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit expired payment operation", error))?;
      return Ok(PaymentSendDecision::Blocked);
    }
    Ok(OperationSendState::Send) => {}
  }
  let sent_at = step.first_sent_at.unwrap_or(now);
  let replay_deadline = sent_at + replay_window;
  step.first_sent_at = Some(sent_at);
  let steps =
    serde_json::to_value(steps).map_err(|error| RuntimeError::json("encode payment operation steps", error))?;
  let updated = sqlx::query(
    "UPDATE payment_operations SET \
     steps=$2,first_sent_at=COALESCE(first_sent_at,$3),replay_deadline=COALESCE(replay_deadline,$4),\
     attempt_count=attempt_count+1,updated_at=clock_timestamp() WHERE id=$1 AND status='pending'",
  )
  .bind(operation_id)
  .bind(steps)
  .bind(sent_at)
  .bind(replay_deadline)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("persist payment send boundary", error))?;
  if updated.rows_affected() != 1 {
    return Err(RuntimeError::invalid_state("payment operation is not pending"));
  }
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit payment send boundary", error))?;
  Ok(PaymentSendDecision::Send)
}

pub(super) async fn record_operation_error(
  connection: &mut PaymentConnection,
  operation_id: &str,
  code: &str,
  retryable: bool,
  uncertain: bool,
) -> RuntimeResult<()> {
  let mut tx = connection.begin().await?;
  let row = sqlx::query(
    "SELECT replay_deadline,clock_timestamp() AS now FROM payment_operations WHERE id=$1 AND status='pending' FOR \
     UPDATE",
  )
  .bind(operation_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("lock failed payment operation", error))?
  .ok_or_else(|| RuntimeError::invalid_input("pending payment operation not found"))?;
  let now: chrono::DateTime<Utc> = row.get("now");
  let expired = row
    .get::<Option<chrono::DateTime<Utc>>, _>("replay_deadline")
    .is_some_and(|deadline| deadline <= now);
  let status = match operation_failure_state(retryable, uncertain, expired) {
    OperationFailureState::Pending => "pending",
    OperationFailureState::Rejected => "rejected",
    OperationFailureState::Blocked => "blocked",
  };
  let next_attempt_at = (status == "pending").then_some(now + Duration::seconds(5));
  sqlx::query(
    "UPDATE payment_operations SET status=$2,last_error_code=$3,last_error=$3,next_attempt_at=$4,updated_at=$5 WHERE \
     id=$1",
  )
  .bind(operation_id)
  .bind(status)
  .bind(code)
  .bind(next_attempt_at)
  .bind(now)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("record failed payment operation", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit failed payment operation", error))?;
  Ok(())
}

pub(super) async fn record_operation_step_result(
  connection: &mut PaymentConnection,
  operation_id: &str,
  step_key: &str,
  result: serde_json::Value,
) -> RuntimeResult<()> {
  let held = connection
    .scopes()
    .iter()
    .map(|scope| scope.as_str().to_string())
    .collect::<std::collections::BTreeSet<_>>();
  let mut tx = connection.begin().await?;
  let row =
    sqlx::query("SELECT resource_keys,steps FROM payment_operations WHERE id=$1 AND status='pending' FOR UPDATE")
      .bind(operation_id)
      .fetch_optional(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock payment step result", error))?
      .ok_or_else(|| RuntimeError::invalid_input("pending payment operation not found"))?;
  let resources: Vec<String> = row.get("resource_keys");
  if resources.iter().any(|resource| !held.contains(resource.as_str())) {
    return Err(RuntimeError::invalid_state("payment_lock_set_expanded"));
  }
  let mut steps = serde_json::from_value::<Vec<PaymentStepState>>(row.get("steps"))
    .map_err(|error| RuntimeError::json("decode payment operation steps", error))?;
  let step_index = steps
    .iter()
    .position(|step| step.key == step_key)
    .ok_or_else(|| RuntimeError::invalid_input("payment operation step not found"))?;
  let previous_steps_resolved = steps[..step_index].iter().all(|step| step.result.is_some());
  let step = &mut steps[step_index];
  operation_result_allowed(
    previous_steps_resolved,
    step.first_sent_at.is_some(),
    step.result.as_ref().map(|stored| stored == &result),
  )
  .map_err(|error| {
    RuntimeError::invalid_state(match error {
      OperationRuleError::StepOutOfOrder => "payment operation steps are out of order",
      OperationRuleError::StepNotSent => "payment operation step was not sent",
      OperationRuleError::ResultChanged => "payment operation step result changed",
    })
  })?;
  if step.result.is_none() {
    step.result = Some(result);
    let steps =
      serde_json::to_value(steps).map_err(|error| RuntimeError::json("encode payment operation steps", error))?;
    sqlx::query("UPDATE payment_operations SET steps=$2,updated_at=clock_timestamp() WHERE id=$1 AND status='pending'")
      .bind(operation_id)
      .bind(steps)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("persist payment step result", error))?;
  }
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit payment step result", error))?;
  Ok(())
}
