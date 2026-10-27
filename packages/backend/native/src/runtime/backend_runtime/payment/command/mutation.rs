use affine_core::payment::{
  SubscriptionMutation, validate_subscription_mutation, validate_subscription_mutation_target,
};

use super::*;

impl PaymentRuntime {
  pub(super) async fn mutate_subscription(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    actor_user_id: &str,
    target: &SubscriptionTarget,
    mutation: &str,
    intent_id: &str,
  ) -> RuntimeResult<Value> {
    let SubscriptionTarget {
      target_type,
      target_id,
      plan,
    } = target;
    let (target_type, target_id) = (target_type.as_str(), target_id.as_str());
    validate_target(target_type, target_id)?;
    validate_intent(intent_id)?;
    if target_type == "user" && actor_user_id != target_id {
      return Err(RuntimeError::invalid_input("payment actor does not match user target"));
    }
    if target_type == "workspace" {
      self.assert_workspace_payment(Some(actor_user_id), target_id).await?;
    }
    let plan = parse_plan(plan)?;
    let mutation = match mutation {
      "cancel" => SubscriptionMutation::Cancel,
      "resume" => SubscriptionMutation::Resume,
      _ => return Err(RuntimeError::invalid_input("unknown payment subscription mutation")),
    };
    validate_subscription_mutation_target(plan, billing_target(target_type)?, mutation)
      .map_err(subscription_mutation_error)?;
    let stripe = self.stripe()?;
    let namespace = stripe.namespace().clone();
    let namespace_key = canonical_namespace(&namespace)?;
    let locked = self
      .lock_stripe_subscription(&namespace_key, target_type, target_id, plan)
      .await?;
    let subscription_id = locked.subscription_id.clone();
    let canceled_at = locked.canceled_at;
    let stored_recurring = locked
      .recurring
      .as_deref()
      .and_then(SubscriptionRecurring::parse)
      .ok_or_else(|| RuntimeError::invalid_state("payment subscription recurring is invalid"))?;
    validate_subscription_mutation(
      plan,
      billing_target(target_type)?,
      stored_recurring,
      canceled_at.is_some(),
      mutation,
    )
    .map_err(subscription_mutation_error)?;
    let direct_form = vec![text_field(
      "cancel_at_period_end",
      if mutation == SubscriptionMutation::Cancel {
        "true"
      } else {
        "false"
      },
    )];
    let schedule_id = locked
      .metadata
      .get("stripeScheduleId")
      .and_then(Value::as_str)
      .map(str::to_string);
    let (path, form) = if let Some(schedule_id) = schedule_id.as_deref() {
      let schedule = stripe
        .subscription_schedule(schedule_id)
        .await
        .map_err(provider_runtime_error)?;
      super::schedule::validate_subscription(&schedule, &subscription_id)?;
      let anchor = locked
        .period_start
        .map(|value| value.timestamp())
        .ok_or_else(|| RuntimeError::invalid_state("payment subscription period is missing"))?;
      let form = if mutation == SubscriptionMutation::Cancel {
        schedule::cancel_fields(&schedule, anchor)?
      } else {
        schedule::resume_fields(&schedule, anchor)?
      };
      (
        format!("v1/subscription_schedules/{}", encode_segment(schedule_id)),
        form,
      )
    } else {
      (
        format!("v1/subscriptions/{}", encode_segment(&subscription_id)),
        direct_form,
      )
    };
    let intent = stripe_operation(
      namespace.clone(),
      mutation.as_str(),
      intent_id,
      locked.resources.clone(),
      Some((target_type, target_id)),
      &path,
      form,
    );
    match self.execute_locked_stripe_operation(locked.connection, intent).await? {
      OperationExecution::Completed(result) => Ok(result),
      OperationExecution::Sent {
        connection,
        operation_id,
        response,
      } => {
        let subscription: StripeSubscription = if schedule_id.is_some() {
          stripe
            .subscription(&subscription_id)
            .await
            .map_err(provider_runtime_error)?
        } else {
          serde_json::from_value(response)
            .map_err(|error| RuntimeError::json("invalid Stripe subscription response", error))?
        };
        let result = subscription_result(&subscription, plan);
        let snapshot = super::super::snapshot::stripe_subscription_snapshot(
          &self.pool,
          stripe,
          subscription,
          Vec::new(),
          Some(OperationCompletion {
            operation_id,
            result: result.clone(),
          }),
        )
        .await?;
        changes.extend(self.apply_with_connection(connection, snapshot).await?);
        Ok(result)
      }
    }
  }
}
