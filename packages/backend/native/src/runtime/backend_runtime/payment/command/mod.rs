mod account;
mod catalog;
mod checkout;
mod dispatch;
mod executor;
mod helpers;
mod license;
mod mutation;
mod portal;
mod read;
mod recovery;
mod revenuecat;
mod schedule;

use affine_core::{
  access_control::Plan,
  payment::{ProviderNamespace, SubscriptionRecurring},
};
use chrono::Duration;
use helpers::*;
use license::assert_license_access;
pub(in crate::runtime::backend_runtime::payment) use recovery::recover_one_stripe_operation;
pub(in crate::runtime::backend_runtime::payment) use revenuecat::recover_one_revenuecat_identify;
use serde_json::{Value, json};
use sqlx::Row;

use super::{
  CustomerSnapshot, OperationCompletion, OperationIntent, PaymentConnection, PaymentFormField, PaymentFormValue,
  PaymentRuntime, PaymentScope, PaymentSendDecision, PaymentSnapshot, PaymentStep, PaymentStepState, SnapshotCoverage,
  TrialSnapshot, freeze_operation, mark_operation_step_sent, record_operation_error, record_operation_step_result,
  snapshot::parse_lookup_key,
  stripe_client::{
    StripeCheckoutSession, StripeCustomer, StripeForm, StripeFormValue, StripePortalSession, StripePrice,
    StripePromotionCode, StripeSubscription,
  },
};
use crate::runtime::{RuntimeError, RuntimeResult};

enum OperationExecution {
  Completed(Value),
  Sent {
    connection: PaymentConnection,
    operation_id: String,
    response: Value,
  },
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubscriptionTarget {
  target_type: String,
  target_id: String,
  plan: String,
}

pub(super) struct PaymentCommandOutcome {
  pub value: Value,
  pub changes: super::PaymentApplyResult,
}
