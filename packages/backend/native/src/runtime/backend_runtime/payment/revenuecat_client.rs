use std::{collections::BTreeSet, time::Duration};

use affine_core::payment::{Provider, ProviderEnvironment, ProviderNamespace};
use hmac::{Hmac, KeyInit, Mac};
use reqwest::{Client, Method, RequestBuilder, StatusCode, redirect::Policy};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use url::Url;

use super::{super::webpki_tls_config, PaymentProviderError};
use crate::runtime::{RevenueCatRuntimeConfig, RuntimeError, RuntimeResult};

const REVENUECAT_ENDPOINT: &str = "https://api.revenuecat.com/";
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
pub(super) struct RevenueCatList<T> {
  pub items: Vec<T>,
  pub next_page: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct RevenueCatSubscription {
  pub id: String,
  pub customer_id: Option<String>,
  pub product_id: Option<String>,
  pub starts_at: i64,
  pub current_period_ends_at: Option<i64>,
  pub store: String,
  pub store_subscription_identifier: String,
  pub ownership: String,
  pub environment: String,
  pub auto_renewal_status: String,
  pub status: String,
  pub gives_access: bool,
  pub entitlements: RevenueCatList<RevenueCatEntitlement>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct RevenueCatEntitlement {
  pub id: String,
  pub lookup_key: String,
  pub products: Option<RevenueCatList<RevenueCatProduct>>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct RevenueCatProduct {
  pub id: String,
  pub display_name: String,
  pub store_identifier: String,
  pub subscription: Option<RevenueCatProductSubscription>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct RevenueCatProductSubscription {
  pub duration: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct RevenueCatAlias {
  pub id: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct RevenueCatIdentifyResult {
  pub was_created: bool,
}

#[derive(Serialize)]
struct RevenueCatIdentifyRequest<'a> {
  app_user_id: &'a str,
  new_app_user_id: &'a str,
}

pub(super) struct RevenueCatClient {
  client: Client,
  endpoint: Url,
  api_key: std::sync::Arc<zeroize::Zeroizing<String>>,
  webhook_auth: std::sync::Arc<zeroize::Zeroizing<String>>,
  project_path: String,
  namespace: ProviderNamespace,
}

impl RevenueCatClient {
  pub(super) fn new(config: &RevenueCatRuntimeConfig) -> RuntimeResult<Self> {
    Self::with_endpoint(config, REVENUECAT_ENDPOINT)
  }

  #[cfg(test)]
  pub(super) fn with_endpoint(config: &RevenueCatRuntimeConfig, endpoint: &str) -> RuntimeResult<Self> {
    Self::build(config, endpoint, Duration::from_secs(1))
  }

  #[cfg(not(test))]
  fn with_endpoint(config: &RevenueCatRuntimeConfig, endpoint: &str) -> RuntimeResult<Self> {
    Self::build(config, endpoint, Duration::from_secs(20))
  }

  fn build(config: &RevenueCatRuntimeConfig, endpoint: &str, timeout: Duration) -> RuntimeResult<Self> {
    let endpoint = Url::parse(endpoint).map_err(|_| RuntimeError::config("invalid RevenueCat endpoint"))?;
    let client = Client::builder()
      .tls_backend_preconfigured(
        webpki_tls_config()
          .map_err(|error| RuntimeError::invalid_state(format!("payment TLS config failed: {error}")))?,
      )
      .redirect(Policy::none())
      .timeout(timeout)
      .build()
      .map_err(|error| RuntimeError::invalid_state(format!("RevenueCat HTTP client failed: {error}")))?;
    Ok(Self {
      client,
      endpoint,
      api_key: config.api_key.clone(),
      webhook_auth: config.webhook_auth.clone(),
      project_path: format!("v2/projects/{}/", encode_segment(&config.project_id)),
      namespace: ProviderNamespace {
        provider: Provider::RevenueCat,
        environment: if config.production {
          ProviderEnvironment::Production
        } else {
          ProviderEnvironment::Sandbox
        },
        account: config.project_id.clone(),
      },
    })
  }

  pub(super) fn namespace(&self) -> &ProviderNamespace {
    &self.namespace
  }

  pub(super) fn verify_webhook_auth(&self, authorization: &str) -> RuntimeResult<()> {
    if self.webhook_auth.is_empty() || authorization.is_empty() {
      return Err(RuntimeError::invalid_input("invalid RevenueCat webhook authorization"));
    }
    let supplied = authentication_tag(authorization.as_bytes());
    let mut verifier = Hmac::<sha2::Sha256>::new_from_slice(self.webhook_auth.as_bytes())
      .map_err(|_| RuntimeError::invalid_state("RevenueCat authorization verifier failed"))?;
    verifier.update(b"revenuecat-webhook-auth");
    verifier
      .verify_slice(&supplied)
      .map_err(|_| RuntimeError::invalid_input("invalid RevenueCat webhook authorization"))
  }

  pub(super) async fn customer_subscriptions(
    &self,
    customer_id: &str,
  ) -> Result<Vec<RevenueCatSubscription>, PaymentProviderError> {
    self
      .list_all(&format!(
        "{}customers/{}/subscriptions",
        self.project_path,
        encode_segment(customer_id)
      ))
      .await
  }

  pub(super) async fn subscriptions_by_store_id(
    &self,
    store_subscription_identifier: &str,
  ) -> Result<Vec<RevenueCatSubscription>, PaymentProviderError> {
    let mut url = self.url(&format!("{}subscriptions", self.project_path))?;
    url
      .query_pairs_mut()
      .append_pair("store_subscription_identifier", store_subscription_identifier)
      .append_pair("limit", "100");
    self.list_all_url(url).await
  }

  pub(super) async fn customer_aliases(&self, customer_id: &str) -> Result<Vec<RevenueCatAlias>, PaymentProviderError> {
    self
      .list_all(&format!(
        "{}customers/{}/aliases",
        self.project_path,
        encode_segment(customer_id)
      ))
      .await
  }

  pub(super) async fn entitlement(&self, entitlement_id: &str) -> Result<RevenueCatEntitlement, PaymentProviderError> {
    let mut url = self.url(&format!(
      "{}entitlements/{}",
      self.project_path,
      encode_segment(entitlement_id)
    ))?;
    url.query_pairs_mut().append_pair("expand", "product");
    self.send(self.request(Method::GET, url), false).await
  }

  pub(super) async fn identify(
    &self,
    customer_id: &str,
    new_customer_id: &str,
  ) -> Result<RevenueCatIdentifyResult, PaymentProviderError> {
    let url = self.url("v1/subscribers/identify")?;
    let body = serde_json::to_vec(&RevenueCatIdentifyRequest {
      app_user_id: customer_id,
      new_app_user_id: new_customer_id,
    })
    .map_err(|_| provider_error("revenuecat_invalid_request", None, false, false))?;
    self
      .send(
        self
          .request(Method::POST, url)
          .header("Content-Type", "application/json")
          .body(body),
        true,
      )
      .await
  }

  pub(super) async fn list_all<T: DeserializeOwned>(&self, path: &str) -> Result<Vec<T>, PaymentProviderError> {
    let mut url = self.url(path)?;
    url.query_pairs_mut().append_pair("limit", "100");
    self.list_all_url(url).await
  }

  async fn list_all_url<T: DeserializeOwned>(&self, mut url: Url) -> Result<Vec<T>, PaymentProviderError> {
    let mut output = Vec::new();
    let mut seen = BTreeSet::new();
    loop {
      let page: RevenueCatList<T> = self.send(self.request(Method::GET, url.clone()), false).await?;
      output.extend(page.items);
      let Some(next_page) = page.next_page.filter(|page| !page.is_empty()) else {
        return Ok(output);
      };
      url = self.next_page(&next_page)?;
      if !seen.insert(url.as_str().to_string()) {
        return Err(provider_error("revenuecat_invalid_page", None, false, false));
      }
    }
  }

  fn next_page(&self, next_page: &str) -> Result<Url, PaymentProviderError> {
    if !next_page.starts_with(&format!("/{}", self.project_path)) {
      return Err(provider_error("revenuecat_invalid_page", None, false, false));
    }
    let url = self
      .endpoint
      .join(next_page.trim_start_matches('/'))
      .map_err(|_| provider_error("revenuecat_invalid_page", None, false, false))?;
    if url.origin() != self.endpoint.origin() {
      return Err(provider_error("revenuecat_invalid_page", None, false, false));
    }
    Ok(url)
  }

  fn url(&self, path: &str) -> Result<Url, PaymentProviderError> {
    if path.contains("..") || path.contains('?') || !(path.starts_with("v1/") || path.starts_with(&self.project_path)) {
      return Err(provider_error("revenuecat_invalid_path", None, false, false));
    }
    self
      .endpoint
      .join(path)
      .map_err(|_| provider_error("revenuecat_invalid_path", None, false, false))
  }

  fn request(&self, method: Method, url: Url) -> RequestBuilder {
    self
      .client
      .request(method, url)
      .header("Authorization", format!("Bearer {}", self.api_key.as_str()))
  }

  async fn send<T: DeserializeOwned>(
    &self,
    request: RequestBuilder,
    mutation: bool,
  ) -> Result<T, PaymentProviderError> {
    let response = request
      .send()
      .await
      .map_err(|error| provider_error("revenuecat_transport", None, true, mutation && !error.is_connect()))?;
    let status = response.status();
    let bytes = response
      .bytes()
      .await
      .map_err(|_| provider_error("revenuecat_transport", Some(status), true, mutation))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
      return Err(provider_error(
        "revenuecat_response_too_large",
        Some(status),
        false,
        mutation,
      ));
    }
    if !status.is_success() {
      return Err(provider_error(
        "revenuecat_http",
        Some(status),
        status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error(),
        mutation && status.is_server_error(),
      ));
    }
    serde_json::from_slice(&bytes)
      .map_err(|_| provider_error("revenuecat_invalid_response", Some(status), false, mutation))
  }
}

fn provider_error(
  code: &'static str,
  status: Option<StatusCode>,
  retryable: bool,
  uncertain: bool,
) -> PaymentProviderError {
  PaymentProviderError {
    code,
    status: status.map(|status| status.as_u16()),
    request_id: None,
    retryable,
    uncertain,
  }
}

fn encode_segment(value: &str) -> String {
  url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn authentication_tag(value: &[u8]) -> Vec<u8> {
  let mut mac = Hmac::<sha2::Sha256>::new_from_slice(value).expect("HMAC accepts any key length");
  mac.update(b"revenuecat-webhook-auth");
  mac.finalize().into_bytes().to_vec()
}
