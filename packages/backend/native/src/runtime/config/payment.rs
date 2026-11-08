use std::sync::Arc;

use serde::Deserialize;
use zeroize::Zeroizing;

use super::{
  PaymentProductConfig, PaymentRuntimeConfig, RevenueCatRuntimeConfig, RuntimeError, RuntimeResult,
  StripeRuntimeConfig, non_empty_string,
};

#[derive(Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct PaymentRuntimeConfigFile {
  enabled: bool,
  stripe: StripeRuntimeConfigFile,
  revenuecat: RevenueCatRuntimeConfigFile,
}

#[derive(Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
struct StripeRuntimeConfigFile {
  api_key: String,
  webhook_key: String,
  account_id: String,
  environment: String,
}

#[derive(Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
struct RevenueCatRuntimeConfigFile {
  enabled: bool,
  api_key: String,
  webhook_auth: String,
  project_id: String,
  environment: String,
  product_map: std::collections::BTreeMap<String, PaymentProductConfig>,
}

impl Default for StripeRuntimeConfigFile {
  fn default() -> Self {
    Self {
      api_key: String::new(),
      webhook_key: String::new(),
      account_id: String::new(),
      environment: "test".to_string(),
    }
  }
}

impl Default for RevenueCatRuntimeConfigFile {
  fn default() -> Self {
    Self {
      enabled: false,
      api_key: String::new(),
      webhook_auth: String::new(),
      project_id: String::new(),
      environment: "production".to_string(),
      product_map: Default::default(),
    }
  }
}

impl PaymentRuntimeConfig {
  pub(super) fn from_file(file: Option<PaymentRuntimeConfigFile>) -> Self {
    file.map(Self::from_file_value).unwrap_or_default()
  }

  pub(super) fn from_file_value(file: PaymentRuntimeConfigFile) -> Self {
    let stripe = non_empty_string(file.stripe.api_key).map(|api_key| StripeRuntimeConfig {
      api_key: Arc::new(Zeroizing::new(api_key)),
      webhook_key: Arc::new(Zeroizing::new(file.stripe.webhook_key)),
      account_id: file.stripe.account_id,
      live: file.stripe.environment == "live",
    });
    let revenuecat = (file.revenuecat.enabled || !file.revenuecat.api_key.trim().is_empty()).then(|| {
      let mut product_map = std::collections::BTreeMap::from([
        (
          "app.affine.pro.Monthly".to_string(),
          PaymentProductConfig {
            plan: "pro".to_string(),
            recurring: "monthly".to_string(),
          },
        ),
        (
          "app.affine.pro.Annual".to_string(),
          PaymentProductConfig {
            plan: "pro".to_string(),
            recurring: "yearly".to_string(),
          },
        ),
        (
          "app.affine.pro.ai.Annual".to_string(),
          PaymentProductConfig {
            plan: "ai".to_string(),
            recurring: "yearly".to_string(),
          },
        ),
      ]);
      product_map.extend(file.revenuecat.product_map);
      RevenueCatRuntimeConfig {
        api_key: Arc::new(Zeroizing::new(file.revenuecat.api_key)),
        webhook_auth: Arc::new(Zeroizing::new(file.revenuecat.webhook_auth)),
        project_id: file.revenuecat.project_id,
        production: file.revenuecat.environment == "production",
        product_map,
      }
    });
    Self {
      enabled: file.enabled,
      stripe,
      revenuecat,
    }
  }

  pub(super) fn validate(&self) -> RuntimeResult<()> {
    if self.enabled {
      let stripe = self
        .stripe
        .as_ref()
        .ok_or_else(|| RuntimeError::config("payment.stripe.apiKey is required when payment is enabled"))?;
      if stripe.account_id.trim().is_empty() || stripe.account_id != stripe.account_id.trim() {
        return Err(RuntimeError::config(
          "payment.stripe.accountId is required when payment is enabled",
        ));
      }
      if stripe.webhook_key.trim().is_empty() {
        return Err(RuntimeError::config(
          "payment.stripe.webhookKey is required when payment is enabled",
        ));
      }
    }
    if let Some(stripe) = &self.stripe {
      let expected_prefixes = if stripe.live {
        ["sk_live_", "rk_live_"]
      } else {
        ["sk_test_", "rk_test_"]
      };
      if !expected_prefixes
        .iter()
        .any(|prefix| stripe.api_key.starts_with(prefix))
      {
        return Err(RuntimeError::config(
          "payment.stripe.environment does not match the API key",
        ));
      }
    }
    if let Some(revenuecat) = &self.revenuecat {
      if revenuecat.api_key.is_empty() || revenuecat.project_id.trim().is_empty() {
        return Err(RuntimeError::config(
          "payment.revenuecat apiKey and projectId are required when RevenueCat is enabled",
        ));
      }
      for mapping in revenuecat.product_map.values() {
        if affine_core::access_control::Plan::parse(&mapping.plan).is_none()
          || affine_core::payment::SubscriptionRecurring::parse(&mapping.recurring).is_none()
        {
          return Err(RuntimeError::config("invalid payment.revenuecat productMap"));
        }
      }
    }
    Ok(())
  }
}
