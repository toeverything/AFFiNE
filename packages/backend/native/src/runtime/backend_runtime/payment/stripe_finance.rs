use serde::Deserialize;

use super::{
  PaymentProviderError, StripeClient,
  stripe_client::{StripeExpandedId, StripeList, StripePrice, encode_segment},
};

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeInvoice {
  pub id: String,
  pub customer: StripeExpandedId,
  pub status: Option<String>,
  pub currency: String,
  pub total: i64,
  pub billing_reason: Option<String>,
  pub hosted_invoice_url: Option<String>,
  pub created: i64,
  pub lines: StripeList<StripeInvoiceLine>,
  pub parent: Option<StripeInvoiceParent>,
  pub subscription: Option<StripeExpandedId>,
  pub payment_intent: Option<StripeExpandedId>,
  pub last_finalization_error: Option<StripeErrorDetail>,
  #[serde(default)]
  pub status_transitions: StripeInvoiceStatusTransitions,
}

impl StripeInvoice {
  pub(super) fn subscription_id(&self) -> Option<&str> {
    self
      .parent
      .as_ref()
      .and_then(|parent| parent.subscription_details.as_ref())
      .and_then(|details| details.subscription.as_ref())
      .or(self.subscription.as_ref())
      .map(StripeExpandedId::id)
  }
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeInvoiceLine {
  pub price: Option<StripePrice>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeInvoiceParent {
  pub subscription_details: Option<StripeSubscriptionDetails>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeSubscriptionDetails {
  pub subscription: Option<StripeExpandedId>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeErrorDetail {
  pub message: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub(super) struct StripeInvoiceStatusTransitions {
  pub finalized_at: Option<i64>,
  pub paid_at: Option<i64>,
  pub voided_at: Option<i64>,
  pub marked_uncollectible_at: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeCharge {
  pub invoice: Option<StripeExpandedId>,
  pub refunds: Option<StripeList<StripeRefund>>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeRefund {
  pub id: String,
  pub charge: Option<StripeExpandedId>,
  pub payment_intent: Option<StripeExpandedId>,
  pub amount: i64,
  pub currency: String,
  pub status: Option<String>,
  pub created: i64,
  #[serde(default)]
  pub metadata: serde_json::Map<String, serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeDispute {
  pub id: String,
  pub charge: StripeExpandedId,
  pub payment_intent: Option<StripeExpandedId>,
  pub amount: i64,
  pub currency: String,
  pub status: String,
  pub created: i64,
  #[serde(default)]
  pub metadata: serde_json::Map<String, serde_json::Value>,
}

impl StripeClient {
  pub(super) async fn invoice(&self, id: &str) -> Result<StripeInvoice, PaymentProviderError> {
    self
      .get(
        &format!("v1/invoices/{}", encode_segment(id)),
        &[("expand[]", "lines.data.price"), ("expand[]", "subscription")],
      )
      .await
  }

  pub(super) async fn charge(&self, id: &str) -> Result<StripeCharge, PaymentProviderError> {
    self
      .get(
        &format!("v1/charges/{}", encode_segment(id)),
        &[("expand[]", "invoice"), ("expand[]", "refunds")],
      )
      .await
  }

  pub(super) async fn refund(&self, id: &str) -> Result<StripeRefund, PaymentProviderError> {
    self.get(&format!("v1/refunds/{}", encode_segment(id)), &[]).await
  }

  pub(super) async fn dispute(&self, id: &str) -> Result<StripeDispute, PaymentProviderError> {
    self.get(&format!("v1/disputes/{}", encode_segment(id)), &[]).await
  }
}
