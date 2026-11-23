mod account;
mod admission;
mod app_store;
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
mod stripe_checkout;

use admission::{load_user_purchase_facts, open_purchase, purchase_time};
use affine_core::{
  access_control::Plan,
  payment::{ProviderNamespace, SubscriptionRecurring},
};
use app_store::AppStorePurchase;
use chrono::Duration;
pub(super) use dispatch::refresh_subscriptions_user;
use helpers::*;
pub(super) use helpers::{validate_identity, validate_target};
use license::assert_license_access;
use recovery::recover_checkout;
pub(in crate::runtime::backend_runtime::payment) use recovery::recover_one_stripe_operation;
pub(in crate::runtime::backend_runtime::payment) use revenuecat::recover_one_revenuecat_identify;
use serde_json::{Value, json};
use sqlx::Row;
use stripe_checkout::{checkout_product, checkout_reserves_trial, finish_purchase};
pub(super) use stripe_checkout::{recover_waiting_checkout, stripe_checkout_receipt};

use super::{
  AppStoreTransaction, CustomerSnapshot, OperationCompletion, OperationIntent, PaymentConnection, PaymentFormField,
  PaymentFormValue, PaymentRuntime, PaymentScope, PaymentSendDecision, PaymentSnapshot, PaymentStep, PaymentStepState,
  Receipt, Reconciliation, SnapshotCoverage, TrialSnapshot,
  apply::{PaymentApplyError, apply_payment_snapshot},
  freeze_operation, freeze_stripe_operation, load_stripe_customer, mark_operation_step_sent, record_operation_error,
  record_operation_step_result, revenuecat_customer_snapshot,
  snapshot::{parse_lookup_key, stripe_subscription_snapshot},
  stored_subscription_decision, stripe_checkout_termination,
  stripe_client::{
    StripeCheckoutSession, StripeCustomer, StripeForm, StripeFormValue, StripePortalSession, StripePrice,
    StripePromotionCode, StripeSubscription,
  },
  stripe_invoice_snapshot,
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
