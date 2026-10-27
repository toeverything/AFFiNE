use std::{path::Path, sync::Arc};

use super::{
  Deployment, NATIVE_APP_CONFIG_KEYS, ServerConfig, is_secret_native_app_config_key, is_static_app_config_key,
};
use crate::runtime::to_napi_error;

#[napi_derive::napi]
pub struct ServerConfigHandle {
  pub(crate) inner: Arc<ServerConfig>,
}

#[napi_derive::napi]
impl ServerConfigHandle {
  #[napi(constructor)]
  pub fn new(path: String, legacy_deployment_type: Option<String>) -> napi::Result<Self> {
    // TODO(0.27.5): Remove this argument after legacy self-host config files
    // have deployment.type.
    let config = ServerConfig::open(Path::new(&path), legacy_deployment_type.as_deref()).map_err(to_napi_error)?;
    Ok(Self {
      inner: Arc::new(config),
    })
  }

  #[napi(getter)]
  pub fn path(&self) -> String {
    self.inner.path().to_string_lossy().into_owned()
  }

  #[napi(getter)]
  pub fn deployment_type(&self) -> String {
    match self.inner.deployment() {
      Deployment::Cloud => "cloud",
      Deployment::SelfHosted => "selfhosted",
    }
    .to_string()
  }

  #[napi]
  pub fn node_owned_json(&self) -> napi::Result<String> {
    serde_json::to_string(&self.inner.node_owned()).map_err(|error| napi::Error::from_reason(error.to_string()))
  }

  #[napi]
  pub fn public_native_baseline_json(&self) -> napi::Result<String> {
    serde_json::to_string(&self.inner.public_native_baseline())
      .map_err(|error| napi::Error::from_reason(error.to_string()))
  }

  #[napi]
  pub fn has_baseline_config_key(&self, key: String) -> bool {
    self.inner.has_baseline_config_key(&key)
  }

  #[napi]
  pub fn baseline_config_key_configured(&self, key: String) -> bool {
    self.inner.baseline_config_key_configured(&key)
  }

  #[napi]
  pub fn native_app_config_keys(&self) -> Vec<String> {
    NATIVE_APP_CONFIG_KEYS.iter().map(|key| (*key).to_string()).collect()
  }

  #[napi]
  pub fn native_secret_app_config_keys(&self) -> Vec<String> {
    NATIVE_APP_CONFIG_KEYS
      .iter()
      .filter(|key| is_secret_native_app_config_key(key))
      .map(|key| (*key).to_string())
      .collect()
  }

  #[napi]
  pub fn static_app_config_keys(&self) -> Vec<String> {
    NATIVE_APP_CONFIG_KEYS
      .iter()
      .filter(|key| is_static_app_config_key(key))
      .map(|key| (*key).to_string())
      .collect()
  }

  #[napi]
  pub fn redis_url(&self) -> napi::Result<Option<String>> {
    self.inner.redis_url().map_err(to_napi_error)
  }

  #[napi]
  pub fn redis_node_options_json(&self) -> napi::Result<String> {
    serde_json::to_string(&self.inner.redis_node_options()).map_err(|error| napi::Error::from_reason(error.to_string()))
  }
}
