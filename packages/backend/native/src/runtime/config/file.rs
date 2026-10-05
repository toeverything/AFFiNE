use std::{
  fs,
  path::{Path, PathBuf},
};

use serde_json::{Map, Value};

use super::{
  Deployment, NATIVE_APP_CONFIG_KEYS, RedisRuntimeConfig, RedisRuntimeConfigFile, RuntimeError, RuntimeResult,
  deserialize_app_config, insert_flat_override, is_secret_native_app_config_key,
};
use crate::runtime::object_storage::ObjectStorageService;

pub(crate) struct ServerConfig {
  path: PathBuf,
  baseline: serde_json::Value,
  deployment: Deployment,
  object_storage: ObjectStorageService,
}

impl ServerConfig {
  pub(crate) fn open(path: &Path, legacy_deployment_type: Option<&str>) -> RuntimeResult<Self> {
    let path = fs::canonicalize(path).map_err(|error| RuntimeError::io("failed to locate config file", error))?;
    let raw = fs::read_to_string(&path).map_err(|error| RuntimeError::io("failed to read config file", error))?;
    let source: Value =
      serde_json::from_str(&raw).map_err(|error| RuntimeError::json("failed to parse config file", error))?;
    let baseline = expand_module_config_paths(source.clone());
    let deployment = match baseline.pointer("/deployment/type").and_then(serde_json::Value::as_str) {
      Some("cloud") => Deployment::Cloud,
      Some("selfhosted") => Deployment::SelfHosted,
      // TODO(0.27.5): Remove the old deployment env fallback after self-host config files are upgraded.
      None => match legacy_deployment_type {
        Some("cloud") => Deployment::Cloud,
        Some("selfhosted") => Deployment::SelfHosted,
        _ => return Err(RuntimeError::config("deployment.type must be cloud or selfhosted")),
      },
      _ => return Err(RuntimeError::config("deployment.type must be cloud or selfhosted")),
    };
    deserialize_app_config(baseline.clone())?;
    let object_storage = ObjectStorageService::from_config_value(&source)?;
    Ok(Self {
      path,
      baseline,
      deployment,
      object_storage,
    })
  }

  pub(crate) fn path(&self) -> &Path {
    &self.path
  }

  pub(crate) fn baseline(&self) -> &serde_json::Value {
    &self.baseline
  }

  pub(crate) fn has_baseline_config_key(&self, key: &str) -> bool {
    key
      .split('.')
      .try_fold(&self.baseline, |value, segment| value.get(segment))
      .is_some()
  }

  pub(crate) fn baseline_config_key_configured(&self, key: &str) -> bool {
    fn configured(value: &Value) -> bool {
      match value {
        Value::Null => false,
        Value::String(value) => !value.is_empty(),
        Value::Array(values) => !values.is_empty(),
        Value::Object(values) => values.values().any(configured),
        Value::Bool(_) | Value::Number(_) => true,
      }
    }
    key
      .split('.')
      .try_fold(&self.baseline, |value, segment| value.get(segment))
      .is_some_and(configured)
  }

  pub(crate) fn redis_url(&self) -> RuntimeResult<Option<String>> {
    let file = self
      .baseline
      .get("redis")
      .cloned()
      .map(serde_json::from_value::<RedisRuntimeConfigFile>)
      .transpose()
      .map_err(|error| RuntimeError::json("invalid Redis config", error))?;
    Ok(RedisRuntimeConfig::from_sources(file)?.url)
  }

  pub(crate) fn redis_node_options(&self) -> Value {
    self
      .baseline
      .pointer("/redis/ioredis")
      .cloned()
      .unwrap_or_else(|| Value::Object(Map::new()))
  }

  pub(crate) fn node_owned(&self) -> Value {
    let baseline = self.baseline();
    let mut modules = Map::new();
    for name in [
      "calendar",
      "captcha",
      "client",
      "doc",
      "flags",
      "graphql",
      "mailer",
      "metrics",
      "server",
      "telemetry",
      "throttle",
      "websocket",
      "worker",
    ] {
      if let Some(value) = baseline.get(name) {
        modules.insert(name.to_string(), value.clone());
      }
    }
    for (module, key) in [
      ("auth", "passwordRequirements"),
      ("auth", "signInRateLimit"),
      ("auth", "trustedCloudflareHeaders"),
      ("copilot", "exa"),
      ("copilot", "unsplash"),
      ("db", "prisma"),
      ("payment", "showLifetimePrice"),
      ("storages", "avatar.publicPath"),
    ] {
      if let Some(value) = baseline.pointer(&format!("/{}/{}", module, key.replace('.', "/"))) {
        let entry = modules
          .entry(module.to_string())
          .or_insert_with(|| Value::Object(Map::new()));
        insert_flat_override(
          entry.as_object_mut().expect("node projection module must be an object"),
          key,
          value.clone(),
        );
      }
    }
    Value::Object(modules)
  }

  pub(crate) fn public_native_baseline(&self) -> Value {
    let mut modules = Map::new();
    for key in NATIVE_APP_CONFIG_KEYS {
      if is_secret_native_app_config_key(key) {
        continue;
      }
      if let Some(value) = key.split('.').try_fold(&self.baseline, |item, part| item.get(part)) {
        insert_flat_override(&mut modules, key, value.clone());
      }
    }
    Value::Object(modules)
  }

  pub(crate) fn deployment(&self) -> Deployment {
    self.deployment
  }

  pub(crate) fn object_storage(&self) -> &ObjectStorageService {
    &self.object_storage
  }
}

pub(super) fn expand_module_config_paths(mut value: serde_json::Value) -> serde_json::Value {
  if let Some(root) = value.as_object_mut() {
    for module in root.values_mut().filter_map(serde_json::Value::as_object_mut) {
      let entries = std::mem::take(module);
      for (path, value) in entries {
        insert_flat_override(module, &path, value);
      }
    }
  }

  value
}
