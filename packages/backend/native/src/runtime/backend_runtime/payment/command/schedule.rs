use affine_core::payment::{
  SubscriptionMutation, SubscriptionRecurring, validate_subscription_mutation, validate_subscription_mutation_target,
};
use serde_json::Value;

use super::*;
use crate::runtime::backend_runtime::payment::stripe_client::{
  StripeExpandedId, StripeSchedulePhase, StripeSubscriptionSchedule,
};

impl PaymentRuntime {
  pub(super) async fn update_recurring(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    actor_user_id: Option<&str>,
    validate_key: Option<&str>,
    target: &SubscriptionTarget,
    recurring: &str,
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
    match target_type {
      "user" if actor_user_id != Some(target_id) => {
        return Err(RuntimeError::invalid_input("payment actor does not match user target"));
      }
      "workspace" => self.assert_workspace_payment(actor_user_id, target_id).await?,
      _ => {}
    }
    let plan = parse_plan(plan)?;
    let recurring = SubscriptionRecurring::parse(recurring)
      .ok_or_else(|| RuntimeError::invalid_input("invalid payment recurring"))?;
    validate_subscription_mutation_target(
      plan,
      billing_target(target_type)?,
      SubscriptionMutation::ChangeRecurring(recurring),
    )
    .map_err(subscription_mutation_error)?;
    let namespace = self.stripe()?.namespace().clone();
    let namespace_key = canonical_namespace(&namespace)?;
    let mut locked = self
      .lock_stripe_subscription(&namespace_key, target_type, target_id, plan)
      .await?;
    if target_type == "instance" {
      assert_license_access(locked.connection.connection(), target_id, validate_key).await?;
    }
    let stored_recurring = locked
      .recurring
      .as_deref()
      .and_then(SubscriptionRecurring::parse)
      .ok_or_else(|| RuntimeError::invalid_state("payment subscription recurring is invalid"))?;
    validate_subscription_mutation(
      plan,
      billing_target(target_type)?,
      stored_recurring,
      locked.canceled_at.is_some(),
      SubscriptionMutation::ChangeRecurring(recurring),
    )
    .map_err(subscription_mutation_error)?;
    let subscription_id = locked.subscription_id.clone();
    let phase_anchor = locked
      .period_start
      .map(|value| value.timestamp())
      .ok_or_else(|| RuntimeError::invalid_state("payment subscription period is missing"))?;
    let lookup_key = stripe_lookup_key(plan, recurring, None)?;
    let price = self.find_price(&lookup_key, recurring).await?;
    let steps = if let Some(schedule_id) = locked.metadata.get("stripeScheduleId").and_then(Value::as_str) {
      let schedule = self
        .stripe()?
        .subscription_schedule(schedule_id)
        .await
        .map_err(provider_runtime_error)?;
      validate_subscription(&schedule, &subscription_id)?;
      vec![PaymentStepState {
        key: format!("payment:{intent_id}:schedule-update"),
        request: PaymentStep::StripePost {
          path: format!("v1/subscription_schedules/{}", encode_segment(schedule_id)),
          api_version: super::super::stripe_client::STRIPE_API_VERSION.to_string(),
          form: recurring_fields(&schedule, phase_anchor, &price.id)?,
        },
        first_sent_at: None,
        result: None,
      }]
    } else {
      let create_key = format!("payment:{intent_id}:schedule-create");
      vec![
        PaymentStepState {
          key: create_key.clone(),
          request: PaymentStep::StripePost {
            path: "v1/subscription_schedules".to_string(),
            api_version: super::super::stripe_client::STRIPE_API_VERSION.to_string(),
            form: vec![text_field("from_subscription", &subscription_id)],
          },
          first_sent_at: None,
          result: None,
        },
        PaymentStepState {
          key: format!("payment:{intent_id}:schedule-update"),
          request: PaymentStep::StripeUpdateScheduleRecurring {
            schedule_step_key: create_key,
            price_id: price.id,
            phase_anchor,
          },
          first_sent_at: None,
          result: None,
        },
      ]
    };
    let intent = OperationIntent {
      namespace: namespace.clone(),
      operation_type: "update_recurring".to_string(),
      intent_id: intent_id.to_string(),
      resources: locked.resources.clone(),
      target_type: Some(target_type.to_string()),
      target_id: Some(target_id.to_string()),
      steps,
    };
    match self.execute_locked_stripe_operation(locked.connection, intent).await? {
      OperationExecution::Completed(result) => Ok(result),
      OperationExecution::Sent {
        connection,
        operation_id,
        ..
      } => {
        let subscription = self
          .stripe()?
          .subscription(&subscription_id)
          .await
          .map_err(provider_runtime_error)?;
        let result = subscription_result(&subscription, plan);
        let snapshot = super::super::snapshot::stripe_subscription_snapshot(
          &self.pool,
          self.stripe()?,
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

  pub(super) async fn update_quantity(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    actor_user_id: Option<&str>,
    validate_key: Option<&str>,
    target: &SubscriptionTarget,
    quantity: u32,
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
    match target_type {
      "user" if actor_user_id != Some(target_id) => {
        return Err(RuntimeError::invalid_input("payment actor does not match user target"));
      }
      "workspace" => self.assert_workspace_payment(actor_user_id, target_id).await?,
      _ => {}
    }
    let plan = parse_plan(plan)?;
    validate_subscription_mutation_target(
      plan,
      billing_target(target_type)?,
      SubscriptionMutation::ChangeQuantity(quantity),
    )
    .map_err(subscription_mutation_error)?;
    let namespace = self.stripe()?.namespace().clone();
    let namespace_key = canonical_namespace(&namespace)?;
    let mut locked = self
      .lock_stripe_subscription(&namespace_key, target_type, target_id, plan)
      .await?;
    if target_type == "instance" {
      assert_license_access(locked.connection.connection(), target_id, validate_key).await?;
    }
    let stored_recurring = locked
      .recurring
      .as_deref()
      .and_then(SubscriptionRecurring::parse)
      .ok_or_else(|| RuntimeError::invalid_state("payment subscription recurring is invalid"))?;
    validate_subscription_mutation(
      plan,
      billing_target(target_type)?,
      stored_recurring,
      locked.canceled_at.is_some(),
      SubscriptionMutation::ChangeQuantity(quantity),
    )
    .map_err(subscription_mutation_error)?;
    if locked.quantity == i32::try_from(quantity).ok() {
      return Ok(json!({ "status": "unchanged", "quantity": quantity }));
    }
    let subscription_id = locked.subscription_id.clone();
    let remote_subscription = self
      .stripe()?
      .subscription(&subscription_id)
      .await
      .map_err(provider_runtime_error)?;
    let item_id = match remote_subscription.items.data.as_slice() {
      [item] => item.id.clone(),
      _ => {
        return Err(RuntimeError::invalid_state(
          "payment subscription items are not canonical",
        ));
      }
    };
    let recurring = stored_recurring;
    let phase_anchor = locked
      .period_start
      .map(|value| value.timestamp())
      .ok_or_else(|| RuntimeError::invalid_state("payment subscription period is missing"))?;
    let mut steps = vec![PaymentStepState {
      key: format!("payment:{intent_id}:subscription-quantity"),
      request: PaymentStep::StripePost {
        path: format!("v1/subscriptions/{}", encode_segment(&subscription_id)),
        api_version: super::super::stripe_client::STRIPE_API_VERSION.to_string(),
        form: vec![
          text_field("items[0][id]", &item_id),
          text_field("items[0][quantity]", quantity.to_string()),
          text_field("payment_behavior", "pending_if_incomplete"),
          text_field(
            "proration_behavior",
            if recurring == SubscriptionRecurring::Yearly {
              "always_invoice"
            } else {
              "none"
            },
          ),
        ],
      },
      first_sent_at: None,
      result: None,
    }];
    if let Some(schedule_id) = locked.metadata.get("stripeScheduleId").and_then(Value::as_str) {
      let schedule = self
        .stripe()?
        .subscription_schedule(schedule_id)
        .await
        .map_err(provider_runtime_error)?;
      validate_subscription(&schedule, &subscription_id)?;
      steps.push(PaymentStepState {
        key: format!("payment:{intent_id}:schedule-quantity"),
        request: PaymentStep::StripePost {
          path: format!("v1/subscription_schedules/{}", encode_segment(schedule_id)),
          api_version: super::super::stripe_client::STRIPE_API_VERSION.to_string(),
          form: quantity_fields(&schedule, phase_anchor, quantity)?,
        },
        first_sent_at: None,
        result: None,
      });
    }
    let intent = OperationIntent {
      namespace: namespace.clone(),
      operation_type: "update_quantity".to_string(),
      intent_id: intent_id.to_string(),
      resources: locked.resources.clone(),
      target_type: Some(target_type.to_string()),
      target_id: Some(target_id.to_string()),
      steps,
    };
    match self.execute_locked_stripe_operation(locked.connection, intent).await? {
      OperationExecution::Completed(result) => Ok(result),
      OperationExecution::Sent {
        connection,
        operation_id,
        ..
      } => {
        let subscription = self
          .stripe()?
          .subscription(&subscription_id)
          .await
          .map_err(provider_runtime_error)?;
        let result = subscription_result(&subscription, plan);
        let snapshot = super::super::snapshot::stripe_subscription_snapshot(
          &self.pool,
          self.stripe()?,
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

pub(super) fn recurring_fields(
  schedule: &StripeSubscriptionSchedule,
  phase_anchor: i64,
  price_id: &str,
) -> RuntimeResult<Vec<PaymentFormField>> {
  if schedule.status != "active" {
    return Err(RuntimeError::invalid_state("subscription_schedule_not_active"));
  }
  let current = current_phase(schedule, phase_anchor)?;
  let item = only_item(current)?;
  let mut fields = phase_fields(0, current, item.price.id(), item.quantity)?;
  fields.extend(phase_item_fields(1, price_id, item.quantity));
  fields.push(text_field("end_behavior", "release"));
  Ok(fields)
}

pub(super) fn validate_subscription(schedule: &StripeSubscriptionSchedule, subscription_id: &str) -> RuntimeResult<()> {
  if schedule.subscription.as_ref().map(StripeExpandedId::id) != Some(subscription_id) {
    return Err(RuntimeError::invalid_state("subscription_schedule_source_mismatch"));
  }
  Ok(())
}

pub(super) fn cancel_fields(
  schedule: &StripeSubscriptionSchedule,
  phase_anchor: i64,
) -> RuntimeResult<Vec<PaymentFormField>> {
  if schedule.status != "active" {
    return Err(RuntimeError::invalid_state("subscription_schedule_not_active"));
  }
  let current = current_phase(schedule, phase_anchor)?;
  let item = only_item(current)?;
  let mut fields = phase_fields(0, current, item.price.id(), item.quantity)?;
  if let Some(next) = schedule
    .phases
    .iter()
    .find(|phase| phase.start_date >= current.end_date)
  {
    let next_item = only_item(next)?;
    fields.push(text_field("phases[0][metadata][next_price]", next_item.price.id()));
    if let Some(coupon) = next.coupon.as_ref() {
      fields.push(text_field("phases[0][metadata][next_coupon]", coupon.id()));
    }
  }
  fields.push(text_field("end_behavior", "cancel"));
  Ok(fields)
}

pub(super) fn resume_fields(
  schedule: &StripeSubscriptionSchedule,
  phase_anchor: i64,
) -> RuntimeResult<Vec<PaymentFormField>> {
  if schedule.status != "active" {
    return Err(RuntimeError::invalid_state("subscription_schedule_not_active"));
  }
  let current = current_phase(schedule, phase_anchor)?;
  let item = only_item(current)?;
  let mut fields = phase_fields(0, current, item.price.id(), item.quantity)?;
  fields.push(PaymentFormField {
    key: "phases[0][metadata][next_price]".to_string(),
    value: PaymentFormValue::Clear,
  });
  fields.push(PaymentFormField {
    key: "phases[0][metadata][next_coupon]".to_string(),
    value: PaymentFormValue::Clear,
  });
  if let Some(price) = current.metadata.get("next_price").and_then(Value::as_str) {
    fields.extend(phase_item_fields(1, price, item.quantity));
    if let Some(coupon) = current.metadata.get("next_coupon").and_then(Value::as_str) {
      fields.push(text_field("phases[1][coupon]", coupon));
    }
  }
  fields.push(text_field("end_behavior", "release"));
  Ok(fields)
}

pub(super) fn quantity_fields(
  schedule: &StripeSubscriptionSchedule,
  phase_anchor: i64,
  quantity: u32,
) -> RuntimeResult<Vec<PaymentFormField>> {
  if schedule.status != "active" {
    return Err(RuntimeError::invalid_state("subscription_schedule_not_active"));
  }
  current_phase(schedule, phase_anchor)?;
  let mut fields = Vec::new();
  for (index, phase) in schedule.phases.iter().enumerate() {
    let item = only_item(phase)?;
    fields.extend(phase_fields(index, phase, item.price.id(), Some(quantity.into()))?);
  }
  Ok(fields)
}

fn current_phase(schedule: &StripeSubscriptionSchedule, anchor: i64) -> RuntimeResult<&StripeSchedulePhase> {
  schedule
    .phases
    .iter()
    .find(|phase| phase.start_date <= anchor && anchor < phase.end_date)
    .ok_or_else(|| RuntimeError::invalid_state("subscription_schedule_has_no_current_phase"))
}

fn only_item(
  phase: &StripeSchedulePhase,
) -> RuntimeResult<&crate::runtime::backend_runtime::payment::stripe_client::StripeScheduleItem> {
  match phase.items.as_slice() {
    [item] => Ok(item),
    _ => Err(RuntimeError::invalid_state(
      "subscription_schedule_items_are_not_canonical",
    )),
  }
}

fn phase_fields(
  index: usize,
  phase: &StripeSchedulePhase,
  price_id: &str,
  quantity: Option<u64>,
) -> RuntimeResult<Vec<PaymentFormField>> {
  let mut fields = phase_item_fields(index, price_id, quantity);
  fields.push(text_field(
    format!("phases[{index}][start_date]"),
    phase.start_date.to_string(),
  ));
  fields.push(text_field(
    format!("phases[{index}][end_date]"),
    phase.end_date.to_string(),
  ));
  if let Some(coupon) = phase.coupon.as_ref() {
    fields.push(text_field(format!("phases[{index}][coupon]"), coupon.id()));
  }
  Ok(fields)
}

fn phase_item_fields(index: usize, price_id: &str, quantity: Option<u64>) -> Vec<PaymentFormField> {
  let mut fields = vec![text_field(format!("phases[{index}][items][0][price]"), price_id)];
  if let Some(quantity) = quantity {
    fields.push(text_field(
      format!("phases[{index}][items][0][quantity]"),
      quantity.to_string(),
    ));
  }
  fields
}
