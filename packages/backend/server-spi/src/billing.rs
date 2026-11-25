//! Billing SPI and pure domain DTOs for commercial edition hooks.

use chrono::{DateTime, Utc};
use server_types::DomainError;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillingPriceRecord {
  pub price_type: String,
  pub plan: String,
  pub currency: String,
  pub amount: Option<i32>,
  pub yearly_amount: Option<i32>,
  pub lifetime_amount: Option<i32>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillingSubscriptionRecord {
  pub stripe_subscription_id: Option<String>,
  pub stripe_schedule_id: Option<String>,
  pub status: String,
  pub plan: String,
  pub recurring: String,
  pub variant: Option<String>,
  pub quantity: i32,
  pub start: DateTime<Utc>,
  pub end: Option<DateTime<Utc>>,
  pub trial_start: Option<DateTime<Utc>>,
  pub trial_end: Option<DateTime<Utc>>,
  pub next_bill_at: Option<DateTime<Utc>>,
  pub canceled_at: Option<DateTime<Utc>>,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub provider: Option<String>,
  pub iap_store: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillingSourceRecord {
  pub id: String,
  pub provider: String,
  pub iap_store: Option<String>,
  pub recurring: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillingGroupRecord {
  pub plan: String,
  pub sources: Vec<BillingSourceRecord>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct BillingSubscriptionList {
  pub subscriptions: Vec<BillingSubscriptionRecord>,
  pub conflicts: Vec<BillingGroupRecord>,
  pub manageable: Vec<BillingGroupRecord>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillingInvoiceRecord {
  pub currency: String,
  pub amount: i32,
  pub status: String,
  pub reason: String,
  pub last_payment_error: Option<String>,
  pub link: Option<String>,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillingCheckoutInput {
  pub actor_user_id: Option<String>,
  pub user_email: Option<String>,
  pub target_type: String,
  pub target_id: Option<String>,
  pub plan: String,
  pub recurring: String,
  pub variant: Option<String>,
  pub coupon: Option<String>,
  pub quantity: Option<u32>,
  pub success_url: String,
  pub intent_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillingCheckoutResult {
  pub url: String,
  pub session_id: String,
  pub target_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillingAppStorePurchaseInput {
  pub purchase_action: String,
  pub product_id: String,
  pub intent_id: Option<String>,
  pub attempt_id: Option<String>,
  pub transaction_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillingAppStorePurchaseResult {
  pub status: String,
  pub attempt_id: Option<String>,
  pub provider: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminPaymentLookupSpiInput {
  pub user_id: Option<String>,
  pub plan_family: Option<String>,
  pub provider_identity: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminPaymentSourceRecord {
  pub id: String,
  pub provider: String,
  pub provider_namespace: Option<String>,
  pub source_identity: Option<String>,
  pub external_customer_id: Option<String>,
  pub external_subscription_id: Option<String>,
  pub external_ref: Option<String>,
  pub status: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminPaymentAttemptRecord {
  pub id: String,
  pub provider: String,
  pub provider_namespace: String,
  pub status: String,
  pub product_id: Option<String>,
  pub transaction_id: Option<String>,
  pub session_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminPaymentCaseRecord {
  pub user_id: String,
  pub plan_family: String,
  pub conflicted: bool,
  pub bound_provider_namespace: Option<String>,
  pub bound_source_identity: Option<String>,
  pub sources: Vec<AdminPaymentSourceRecord>,
  pub attempts: Vec<AdminPaymentAttemptRecord>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReconcileAdminPaymentSpiInput {
  pub actor_user_id: String,
  pub user_id: String,
  pub plan_family: String,
  pub request_id: String,
  pub evidence: String,
  pub attempt_id: Option<String>,
  pub transaction_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminPaymentResolutionRecord {
  pub user_id: String,
  pub plan_family: String,
  pub conflicted: bool,
  pub bound_provider_namespace: Option<String>,
  pub bound_source_identity: Option<String>,
  pub request_id: String,
  pub status: String,
  pub reason: Option<String>,
  pub attempt_id: Option<String>,
  pub attempt_status: Option<String>,
}

fn payment_unconfigured() -> DomainError {
  DomainError::Internal("payment_runtime_not_ready".to_owned())
}

#[async_trait::async_trait]
pub trait BillingSpi: Send + Sync + 'static {
  fn payment_enabled(&self) -> bool {
    false
  }

  async fn on_pre_delete_user(&self, _user_id: &str) -> Result<(), DomainError> {
    Ok(())
  }

  async fn on_workspace_members_changed(&self, _workspace_id: &str) -> Result<(), DomainError> {
    Ok(())
  }

  async fn create_selfhost_customer_portal(&self, _workspace_id: &str) -> Result<String, DomainError> {
    Err(DomainError::Unavailable(
      "Self-hosted customer portal is not configured.".to_owned(),
    ))
  }

  async fn list_prices(&self, _show_lifetime_price: bool) -> Result<Vec<BillingPriceRecord>, DomainError> {
    Err(payment_unconfigured())
  }

  async fn list_subscriptions(
    &self,
    _target_type: &str,
    _target_id: &str,
  ) -> Result<BillingSubscriptionList, DomainError> {
    Ok(BillingSubscriptionList::default())
  }

  async fn create_checkout(&self, _input: BillingCheckoutInput) -> Result<BillingCheckoutResult, DomainError> {
    Err(payment_unconfigured())
  }

  async fn checkout_attempt(&self, _user_id: &str, _plan: &str) -> Result<Option<String>, DomainError> {
    Err(payment_unconfigured())
  }

  async fn expire_checkout(&self, _user_id: &str, _plan: &str, _attempt_id: &str) -> Result<bool, DomainError> {
    Err(payment_unconfigured())
  }

  async fn create_customer_portal(&self, _user_id: &str) -> Result<String, DomainError> {
    Err(payment_unconfigured())
  }

  async fn mutate_subscription(
    &self,
    _actor_user_id: &str,
    _target_type: &str,
    _target_id: &str,
    _plan: &str,
    _mutation: &str,
    _intent_id: &str,
  ) -> Result<BillingSubscriptionRecord, DomainError> {
    Err(payment_unconfigured())
  }

  async fn update_subscription_recurring(
    &self,
    _actor_user_id: &str,
    _target_type: &str,
    _target_id: &str,
    _plan: &str,
    _recurring: &str,
    _intent_id: &str,
  ) -> Result<BillingSubscriptionRecord, DomainError> {
    Err(payment_unconfigured())
  }

  async fn app_store_purchase(
    &self,
    _user_id: &str,
    _input: BillingAppStorePurchaseInput,
  ) -> Result<BillingAppStorePurchaseResult, DomainError> {
    Err(payment_unconfigured())
  }

  async fn request_apply_subscription(
    &self,
    _user_id: &str,
    _transaction_id: &str,
    _intent_id: &str,
  ) -> Result<Vec<BillingSubscriptionRecord>, DomainError> {
    Err(payment_unconfigured())
  }

  async fn refresh_user_subscriptions(&self, _user_id: &str) -> Result<Vec<BillingSubscriptionRecord>, DomainError> {
    Ok(Vec::new())
  }

  async fn generate_license_key(&self, _session_id: &str, _intent_id: &str) -> Result<String, DomainError> {
    Err(payment_unconfigured())
  }

  async fn inspect_payment_reconciliation(
    &self,
    _input: AdminPaymentLookupSpiInput,
  ) -> Result<Vec<AdminPaymentCaseRecord>, DomainError> {
    Err(payment_unconfigured())
  }

  async fn reconcile_payment(
    &self,
    _input: ReconcileAdminPaymentSpiInput,
  ) -> Result<AdminPaymentResolutionRecord, DomainError> {
    Err(payment_unconfigured())
  }

  async fn upsert_admin_grant(
    &self,
    _target_type: &str,
    _target_id: &str,
    _plan: &str,
    _quantity: Option<i32>,
  ) -> Result<(), DomainError> {
    Err(payment_unconfigured())
  }

  async fn revoke_admin_grant(&self, _target_type: &str, _target_id: &str) -> Result<(), DomainError> {
    Err(payment_unconfigured())
  }
}

/// Default community billing SPI with fail-closed payment methods and no-op hooks.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityBillingSpi;

#[async_trait::async_trait]
impl BillingSpi for CommunityBillingSpi {}
