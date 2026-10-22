use std::collections::BTreeSet;

use affine_core::{
  access_control::Plan,
  payment::{FinancialFact, Provider, ProviderLifecycle, ProviderNamespace, SubscriptionRecurring},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
#[error("payment provider request failed ({code})")]
pub(super) struct PaymentProviderError {
  pub code: &'static str,
  pub status: Option<u16>,
  pub request_id: Option<String>,
  pub retryable: bool,
  pub uncertain: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) enum SnapshotCoverage {
  Single,
  Complete {
    verified_missing_revenuecat_sources: BTreeSet<String>,
  },
  Incomplete,
}

#[derive(Clone, Debug)]
pub(super) struct SubscriptionSnapshot {
  pub source_id: String,
  pub target_type: String,
  pub target_id: String,
  pub plan: Plan,
  pub recurring: SubscriptionRecurring,
  pub lifecycle: ProviderLifecycle,
  pub gives_access: Option<bool>,
  pub will_renew: Option<bool>,
  pub quantity: Option<f64>,
  pub external_customer_id: Option<String>,
  pub external_subscription_id: Option<String>,
  pub external_product_id: Option<String>,
  pub external_price_id: Option<String>,
  pub iap_store: Option<String>,
  pub external_ref: Option<String>,
  pub currency: Option<String>,
  pub amount: Option<i32>,
  pub period_start: Option<DateTime<Utc>>,
  pub period_end: Option<DateTime<Utc>>,
  pub trial_start: Option<DateTime<Utc>>,
  pub trial_end: Option<DateTime<Utc>>,
  pub canceled_at: Option<DateTime<Utc>>,
  pub metadata: Value,
}

#[derive(Clone, Debug)]
pub(super) struct FinancialSnapshot {
  pub fact: FinancialFact,
  pub external_id: String,
  pub source_id: Option<String>,
  pub external_invoice_id: Option<String>,
  pub external_payment_id: Option<String>,
  pub amount: Option<i32>,
  pub currency: Option<String>,
  pub occurred_at: Option<DateTime<Utc>>,
  pub metadata: Value,
}

#[derive(Clone, Debug)]
pub(super) struct TrialSnapshot {
  pub target_type: String,
  pub target_id: String,
  pub plan: Plan,
  pub external_ref: Option<String>,
  pub metadata: Value,
}

#[derive(Clone, Debug)]
pub(super) struct InvoiceSnapshot {
  pub external_id: String,
  pub target_id: String,
  pub currency: String,
  pub amount: i32,
  pub status: String,
  pub reason: Option<String>,
  pub last_payment_error: Option<String>,
  pub link: Option<String>,
}

#[derive(Clone, Debug)]
pub(super) struct LicenseSnapshot {
  pub key: String,
  pub workspace_id: Option<String>,
  pub revealed_at: Option<DateTime<Utc>>,
  pub validate_key: Option<String>,
}

#[derive(Clone, Debug)]
pub(super) struct CustomerSnapshot {
  pub user_id: String,
  pub external_customer_id: String,
}

#[derive(Clone, Debug)]
pub(super) struct MailSnapshot {
  pub mail_name: String,
  pub mail_class: String,
  pub dedupe_key: String,
  pub recipient_email: String,
  pub recipient_user_id: Option<String>,
  pub workspace_id: Option<String>,
  pub payload: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize, Eq, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(super) enum PaymentStep {
  StripePost {
    path: String,
    api_version: String,
    form: Vec<PaymentFormField>,
  },
  StripeDelete {
    path: String,
    api_version: String,
  },
  StripeUpdateScheduleRecurring {
    schedule_step_key: String,
    price_id: String,
    phase_anchor: i64,
  },
  CreateCustomer {
    target_type: String,
    target_id: String,
  },
  ChangeSubscription {
    source_id: String,
    desired_recurring: SubscriptionRecurring,
  },
  CancelSubscription {
    source_id: String,
  },
  IdentifyRevenueCat {
    source_customer_id: String,
    customer_id: String,
    source_ids: Vec<String>,
    store_subscription_identifier: String,
  },
  VerifySource {
    source_id: String,
  },
}

#[derive(Clone, Debug, Serialize, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(super) struct PaymentFormField {
  pub key: String,
  pub value: PaymentFormValue,
}

#[derive(Clone, Debug, Serialize, Deserialize, Eq, PartialEq)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub(super) enum PaymentFormValue {
  Text(String),
  Clear,
}

#[derive(Clone, Debug, Eq, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(super) struct PaymentStepState {
  pub key: String,
  pub request: PaymentStep,
  pub first_sent_at: Option<DateTime<Utc>>,
  pub result: Option<Value>,
}

#[derive(Clone, Debug)]
pub(super) struct OperationCompletion {
  pub operation_id: String,
  pub result: Value,
}

#[derive(Clone, Debug)]
pub(super) struct OperationIntent {
  pub namespace: ProviderNamespace,
  pub operation_type: String,
  pub intent_id: String,
  pub resources: Vec<super::PaymentScope>,
  pub target_type: Option<String>,
  pub target_id: Option<String>,
  pub steps: Vec<PaymentStepState>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct RevenueCatOwnershipTransfer {
  pub source_id: String,
  pub customer_id: String,
  pub old_target_type: String,
  pub old_target_id: String,
  pub new_target_type: String,
  pub new_target_id: String,
}

#[derive(Clone, Debug)]
pub(super) struct PaymentSnapshot {
  pub namespace: ProviderNamespace,
  pub coverage: SnapshotCoverage,
  pub customer_id: Option<String>,
  pub customers: Vec<CustomerSnapshot>,
  pub subscriptions: Vec<SubscriptionSnapshot>,
  pub ownership_transfers: Vec<RevenueCatOwnershipTransfer>,
  pub financial_facts: Vec<FinancialSnapshot>,
  pub trials: Vec<TrialSnapshot>,
  pub invoices: Vec<InvoiceSnapshot>,
  pub licenses: Vec<LicenseSnapshot>,
  pub mails: Vec<MailSnapshot>,
  pub captured_event_ids: Vec<String>,
  pub operation: Option<OperationCompletion>,
}

impl PaymentSnapshot {
  pub(super) fn provider(&self) -> Provider {
    self.namespace.provider
  }
}
