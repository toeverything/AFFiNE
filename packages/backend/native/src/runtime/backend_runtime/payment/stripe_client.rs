use std::{collections::BTreeSet, time::Duration};

use affine_core::payment::{Provider, ProviderEnvironment, ProviderNamespace};
use chrono::{DateTime, Utc};
use hmac::{Hmac, KeyInit, Mac};
use reqwest::{Client, Method, RequestBuilder, StatusCode, redirect::Policy};
use serde::{Deserialize, de::DeserializeOwned};
use sha2::Sha256;
use url::Url;

use super::{super::webpki_tls_config, PaymentFormField, PaymentFormValue, PaymentProviderError};
use crate::runtime::{RuntimeError, RuntimeResult, StripeRuntimeConfig};

pub(super) const STRIPE_API_VERSION: &str = "2025-02-24.acacia";
const STRIPE_ENDPOINT: &str = "https://api.stripe.com/";
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) enum StripeFormValue {
  Text(String),
  Clear,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(super) struct StripeForm(Vec<(String, StripeFormValue)>);

impl StripeForm {
  pub(super) fn push(&mut self, key: impl Into<String>, value: StripeFormValue) {
    self.0.push((key.into(), value));
  }

  fn encode(&self) -> String {
    let mut encoded = url::form_urlencoded::Serializer::new(String::new());
    for (key, value) in &self.0 {
      match value {
        StripeFormValue::Text(value) => {
          encoded.append_pair(key, value);
        }
        StripeFormValue::Clear => {
          encoded.append_pair(key, "");
        }
      }
    }
    encoded.finish()
  }
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeList<T> {
  pub data: Vec<T>,
  pub has_more: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripePrice {
  pub id: String,
  pub active: bool,
  pub lookup_key: Option<String>,
  pub unit_amount: Option<i64>,
  pub currency: String,
  pub recurring: Option<StripeRecurring>,
  pub product: StripeExpandedId,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeRecurring {
  pub interval: String,
  pub interval_count: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub(super) enum StripeExpandedId {
  Id(String),
  Expanded { id: String, email: Option<String> },
}

impl StripeExpandedId {
  pub(super) fn id(&self) -> &str {
    match self {
      Self::Id(id) | Self::Expanded { id, .. } => id,
    }
  }

  pub(super) fn email(&self) -> Option<&str> {
    match self {
      Self::Id(_) => None,
      Self::Expanded { email, .. } => email.as_deref(),
    }
  }
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeSubscription {
  pub id: String,
  pub created: i64,
  pub customer: StripeExpandedId,
  pub status: String,
  pub cancel_at_period_end: bool,
  pub current_period_start: i64,
  pub current_period_end: i64,
  pub trial_start: Option<i64>,
  pub trial_end: Option<i64>,
  pub canceled_at: Option<i64>,
  pub schedule: Option<StripeExpandedId>,
  pub items: StripeList<StripeSubscriptionItem>,
  #[serde(default)]
  pub metadata: serde_json::Map<String, serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeSubscriptionItem {
  pub id: String,
  pub quantity: Option<u64>,
  pub price: StripePrice,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeSubscriptionSchedule {
  pub id: String,
  pub status: String,
  pub subscription: Option<StripeExpandedId>,
  pub phases: Vec<StripeSchedulePhase>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeSchedulePhase {
  pub start_date: i64,
  pub end_date: i64,
  pub items: Vec<StripeScheduleItem>,
  pub coupon: Option<StripeExpandedId>,
  #[serde(default)]
  pub metadata: serde_json::Map<String, serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeScheduleItem {
  pub price: StripeExpandedId,
  pub quantity: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeCheckoutSession {
  pub id: String,
  pub url: Option<String>,
  pub customer: Option<StripeExpandedId>,
  pub subscription: Option<StripeExpandedId>,
  pub status: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripeCustomer {
  pub id: String,
  pub email: Option<String>,
  #[serde(default)]
  pub deleted: bool,
}

impl StripeCustomer {
  pub(super) fn matches_email(&self, email: &str) -> bool {
    !self.deleted
      && self
        .email
        .as_deref()
        .is_some_and(|value| value.eq_ignore_ascii_case(email))
  }
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripePortalSession {
  pub url: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct StripePromotionCode {
  pub active: bool,
  pub customer: Option<StripeExpandedId>,
  pub coupon: StripeExpandedId,
}

pub(super) struct StripeClient {
  client: Client,
  endpoint: Url,
  api_key: std::sync::Arc<zeroize::Zeroizing<String>>,
  webhook_key: std::sync::Arc<zeroize::Zeroizing<String>>,
  namespace: ProviderNamespace,
}

impl StripeClient {
  pub(super) fn new(config: &StripeRuntimeConfig) -> RuntimeResult<Self> {
    Self::with_endpoint(config, STRIPE_ENDPOINT)
  }

  #[cfg(test)]
  pub(super) fn with_endpoint(config: &StripeRuntimeConfig, endpoint: &str) -> RuntimeResult<Self> {
    Self::build(config, endpoint, Duration::from_secs(1))
  }

  #[cfg(not(test))]
  fn with_endpoint(config: &StripeRuntimeConfig, endpoint: &str) -> RuntimeResult<Self> {
    Self::build(config, endpoint, Duration::from_secs(20))
  }

  fn build(config: &StripeRuntimeConfig, endpoint: &str, timeout: Duration) -> RuntimeResult<Self> {
    let endpoint = Url::parse(endpoint).map_err(|_| RuntimeError::config("invalid Stripe endpoint"))?;
    let client = Client::builder()
      .tls_backend_preconfigured(
        webpki_tls_config()
          .map_err(|error| RuntimeError::invalid_state(format!("payment TLS config failed: {error}")))?,
      )
      .redirect(Policy::none())
      .timeout(timeout)
      .build()
      .map_err(|error| RuntimeError::invalid_state(format!("Stripe HTTP client failed: {error}")))?;
    Ok(Self {
      client,
      endpoint,
      api_key: config.api_key.clone(),
      webhook_key: config.webhook_key.clone(),
      namespace: ProviderNamespace {
        provider: Provider::Stripe,
        environment: if config.live {
          ProviderEnvironment::Live
        } else {
          ProviderEnvironment::Test
        },
        account: config.account_id.clone(),
      },
    })
  }

  pub(super) fn namespace(&self) -> &ProviderNamespace {
    &self.namespace
  }

  pub(super) async fn get<T: DeserializeOwned>(
    &self,
    path: &str,
    query: &[(&str, &str)],
  ) -> Result<T, PaymentProviderError> {
    let url = self.url(path)?;
    self.send(self.request(Method::GET, url).query(query), false).await
  }

  pub(super) async fn subscription(&self, id: &str) -> Result<StripeSubscription, PaymentProviderError> {
    self
      .get(
        &format!("v1/subscriptions/{}", encode_segment(id)),
        &[("expand[]", "customer")],
      )
      .await
  }

  pub(super) async fn customer_subscriptions(
    &self,
    customer_id: &str,
  ) -> Result<Vec<StripeSubscription>, PaymentProviderError> {
    self
      .list_all(
        "v1/subscriptions",
        &[
          ("customer", customer_id),
          ("status", "all"),
          ("expand[]", "data.customer"),
        ],
      )
      .await
  }

  pub(super) async fn checkout_session(&self, id: &str) -> Result<StripeCheckoutSession, PaymentProviderError> {
    self
      .get(
        &format!("v1/checkout/sessions/{}", encode_segment(id)),
        &[("expand[]", "subscription")],
      )
      .await
  }

  pub(super) async fn subscription_schedule(
    &self,
    id: &str,
  ) -> Result<StripeSubscriptionSchedule, PaymentProviderError> {
    self
      .get(&format!("v1/subscription_schedules/{}", encode_segment(id)), &[])
      .await
  }

  pub(super) async fn post<T: DeserializeOwned>(
    &self,
    path: &str,
    form: &StripeForm,
    idempotency_key: &str,
  ) -> Result<T, PaymentProviderError> {
    let url = self.url(path)?;
    self
      .send(
        self
          .request(Method::POST, url)
          .header("Idempotency-Key", idempotency_key)
          .header("Content-Type", "application/x-www-form-urlencoded")
          .body(form.encode()),
        true,
      )
      .await
  }

  pub(super) async fn post_frozen<T: DeserializeOwned>(
    &self,
    path: &str,
    api_version: &str,
    fields: &[PaymentFormField],
    idempotency_key: &str,
  ) -> Result<T, PaymentProviderError> {
    if api_version != STRIPE_API_VERSION {
      return Err(provider_error("stripe_api_version_changed", None, None, false, false));
    }
    let mut form = StripeForm::default();
    for field in fields {
      form.push(
        field.key.clone(),
        match &field.value {
          PaymentFormValue::Text(value) => StripeFormValue::Text(value.clone()),
          PaymentFormValue::Clear => StripeFormValue::Clear,
        },
      );
    }
    self.post(path, &form, idempotency_key).await
  }

  pub(super) async fn delete_frozen<T: DeserializeOwned>(
    &self,
    path: &str,
    api_version: &str,
    idempotency_key: &str,
  ) -> Result<T, PaymentProviderError> {
    if api_version != STRIPE_API_VERSION {
      return Err(provider_error("stripe_api_version_changed", None, None, false, false));
    }
    let url = self.url(path)?;
    self
      .send(
        self
          .request(Method::DELETE, url)
          .header("Idempotency-Key", idempotency_key),
        true,
      )
      .await
  }

  pub(super) async fn list_all<T: DeserializeOwned>(
    &self,
    path: &str,
    query: &[(&str, &str)],
  ) -> Result<Vec<T>, PaymentProviderError> {
    let mut output = Vec::new();
    let mut starting_after = None;
    let mut seen = BTreeSet::new();
    loop {
      let mut page_query = query.to_vec();
      page_query.push(("limit", "100"));
      if let Some(cursor) = starting_after.as_deref() {
        page_query.push(("starting_after", cursor));
      }
      let page: StripeList<serde_json::Value> = self.get(path, &page_query).await?;
      let next = if page.has_more {
        page
          .data
          .last()
          .and_then(|value| value.get("id"))
          .and_then(serde_json::Value::as_str)
          .filter(|id| !id.is_empty())
          .map(str::to_string)
          .ok_or_else(|| provider_error("stripe_invalid_page", None, None, false, false))?
      } else {
        String::new()
      };
      for value in page.data {
        output.push(
          serde_json::from_value(value)
            .map_err(|_| provider_error("stripe_invalid_response", None, None, false, false))?,
        );
      }
      if !page.has_more {
        return Ok(output);
      }
      if !seen.insert(next.clone()) {
        return Err(provider_error("stripe_invalid_page", None, None, false, false));
      }
      starting_after = Some(next);
    }
  }

  pub(super) fn verify_webhook(&self, raw_body: &[u8], signature: &str, now: DateTime<Utc>) -> RuntimeResult<()> {
    let mut timestamp = None;
    let mut signatures = Vec::new();
    for part in signature.split(',') {
      let Some((key, value)) = part.split_once('=') else {
        continue;
      };
      match key {
        "t" => timestamp = value.parse::<i64>().ok(),
        "v1" => signatures.push(value),
        _ => {}
      }
    }
    let timestamp = timestamp.ok_or_else(|| RuntimeError::invalid_input("invalid Stripe webhook signature"))?;
    if (now.timestamp() - timestamp).unsigned_abs() > 300 {
      return Err(RuntimeError::invalid_input("expired Stripe webhook signature"));
    }
    let mut signed = timestamp.to_string().into_bytes();
    signed.push(b'.');
    signed.extend_from_slice(raw_body);
    let valid = signatures.into_iter().any(|signature| {
      let Ok(signature) = hex::decode(signature) else {
        return false;
      };
      let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(self.webhook_key.as_bytes()) else {
        return false;
      };
      mac.update(&signed);
      mac.verify_slice(&signature).is_ok()
    });
    if !valid {
      return Err(RuntimeError::invalid_input("invalid Stripe webhook signature"));
    }
    Ok(())
  }

  fn url(&self, path: &str) -> Result<Url, PaymentProviderError> {
    if !path.starts_with("v1/") || path.contains("..") || path.contains('?') {
      return Err(provider_error("stripe_invalid_path", None, None, false, false));
    }
    self
      .endpoint
      .join(path)
      .map_err(|_| provider_error("stripe_invalid_path", None, None, false, false))
  }

  fn request(&self, method: Method, url: Url) -> RequestBuilder {
    self
      .client
      .request(method, url)
      .basic_auth(self.api_key.as_str(), Some(""))
      .header("Stripe-Version", STRIPE_API_VERSION)
  }

  async fn send<T: DeserializeOwned>(
    &self,
    request: RequestBuilder,
    mutation: bool,
  ) -> Result<T, PaymentProviderError> {
    let response = request
      .send()
      .await
      .map_err(|error| provider_error("stripe_transport", None, None, true, mutation && !error.is_connect()))?;
    let status = response.status();
    let request_id = response
      .headers()
      .get("Request-Id")
      .and_then(|value| value.to_str().ok())
      .map(str::to_string);
    let bytes = response
      .bytes()
      .await
      .map_err(|_| provider_error("stripe_transport", Some(status), request_id.clone(), true, mutation))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
      return Err(provider_error(
        "stripe_response_too_large",
        Some(status),
        request_id,
        false,
        mutation,
      ));
    }
    if !status.is_success() {
      return Err(provider_error(
        "stripe_http",
        Some(status),
        request_id,
        status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error(),
        mutation && status.is_server_error(),
      ));
    }
    serde_json::from_slice(&bytes)
      .map_err(|_| provider_error("stripe_invalid_response", Some(status), request_id, false, mutation))
  }
}

fn provider_error(
  code: &'static str,
  status: Option<StatusCode>,
  request_id: Option<String>,
  retryable: bool,
  uncertain: bool,
) -> PaymentProviderError {
  PaymentProviderError {
    code,
    status: status.map(|status| status.as_u16()),
    request_id,
    retryable,
    uncertain,
  }
}

pub(super) fn encode_segment(value: &str) -> String {
  url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}
