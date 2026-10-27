use super::*;

impl PaymentRuntime {
  pub(super) async fn execute_stripe_operation(&self, intent: OperationIntent) -> RuntimeResult<OperationExecution> {
    let connection = PaymentConnection::try_acquire(&self.pool, intent.resources.clone())
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    self.execute_locked_stripe_operation(connection, intent).await
  }

  pub(super) async fn execute_locked_stripe_operation(
    &self,
    mut connection: PaymentConnection,
    intent: OperationIntent,
  ) -> RuntimeResult<OperationExecution> {
    let stripe = self.stripe()?;
    let frozen = freeze_operation(&mut connection, &intent).await?;
    match frozen.status.as_str() {
      "completed" => {
        return frozen
          .result
          .map(OperationExecution::Completed)
          .ok_or_else(|| RuntimeError::invalid_state("completed payment operation has no result"));
      }
      "pending" => {}
      "blocked" => return Err(RuntimeError::invalid_state("payment_operation_blocked")),
      _ => return Err(RuntimeError::invalid_state("payment_operation_rejected")),
    }
    let mut steps = frozen.steps;
    for index in 0..steps.len() {
      if steps[index].result.is_some() {
        continue;
      }
      let step = &steps[index];
      if mark_operation_step_sent(&mut connection, &frozen.id, &step.key, Duration::minutes(10)).await?
        == PaymentSendDecision::Blocked
      {
        return Err(RuntimeError::invalid_state("payment_operation_blocked"));
      }
      let response = match &step.request {
        PaymentStep::StripePost {
          path,
          api_version,
          form,
        } => stripe.post_frozen(path, api_version, form, &step.key).await,
        PaymentStep::StripeDelete { path, api_version } => stripe.delete_frozen(path, api_version, &step.key).await,
        PaymentStep::StripeUpdateScheduleRecurring {
          schedule_step_key,
          price_id,
          phase_anchor,
        } => {
          let schedule = steps
            .iter()
            .find(|candidate| candidate.key == *schedule_step_key)
            .and_then(|candidate| candidate.result.clone())
            .ok_or_else(|| RuntimeError::invalid_state("payment schedule create result is missing"))?;
          let schedule: super::super::stripe_client::StripeSubscriptionSchedule = serde_json::from_value(schedule)
            .map_err(|error| RuntimeError::json("invalid Stripe schedule response", error))?;
          let path = format!("v1/subscription_schedules/{}", encode_segment(&schedule.id));
          let form = schedule::recurring_fields(&schedule, *phase_anchor, price_id)?;
          stripe
            .post_frozen(&path, super::super::stripe_client::STRIPE_API_VERSION, &form, &step.key)
            .await
        }
        _ => {
          return Err(RuntimeError::invalid_state(
            "payment operation step is not executable by Stripe",
          ));
        }
      };
      let response: Value = match response {
        Ok(response) => response,
        Err(error) => {
          record_operation_error(
            &mut connection,
            &frozen.id,
            error.code,
            error.retryable,
            error.uncertain,
          )
          .await?;
          return Err(provider_runtime_error(error));
        }
      };
      record_operation_step_result(&mut connection, &frozen.id, &step.key, response.clone()).await?;
      steps[index].result = Some(response);
    }
    let response = steps
      .last()
      .and_then(|step| step.result.clone())
      .ok_or_else(|| RuntimeError::invalid_state("payment operation produced no result"))?;
    Ok(OperationExecution::Sent {
      connection,
      operation_id: frozen.id,
      response,
    })
  }

  pub(super) async fn assert_workspace_payment(
    &self,
    actor_user_id: Option<&str>,
    workspace_id: &str,
  ) -> RuntimeResult<()> {
    let actor_user_id = actor_user_id.ok_or_else(|| RuntimeError::invalid_input("payment actor is required"))?;
    let allowed: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND role='owner' AND \
       state='active')",
    )
    .bind(workspace_id)
    .bind(actor_user_id)
    .fetch_one(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("authorize workspace payment", error))?;
    if !allowed {
      return Err(RuntimeError::invalid_state("workspace_payment_denied"));
    }
    Ok(())
  }

  pub(super) fn stripe(&self) -> RuntimeResult<&super::super::StripeClient> {
    self
      .stripe
      .as_deref()
      .ok_or_else(|| RuntimeError::invalid_state("Stripe payment provider is not configured"))
  }
}
