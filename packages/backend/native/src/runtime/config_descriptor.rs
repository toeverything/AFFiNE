use jsonschema::Draft;
use napi::{Error, Result, Status};
use schemars::{JsonSchema, generate::SchemaSettings};
use serde_json::{Value, from_value, json, to_value};

use super::{
  CopilotManagedProfileConfigFile, CopilotRuntimeConfig, CopilotRuntimeConfigFile, RuntimeError,
  SUPPORTED_BYOK_PROVIDERS, validate_copilot_config,
};

const COPILOT_MODULE: &str = "copilot";

#[napi_derive::napi(object)]
pub struct AppConfigDescriptor {
  pub key: String,
  pub description: String,
  pub default_value: Value,
  pub schema: Value,
  pub internal: bool,
}

fn invalid_config(message: impl Into<String>) -> Error {
  Error::new(Status::InvalidArg, message.into())
}

fn schema_for<T: JsonSchema>() -> Value {
  let schema = SchemaSettings::draft07().into_generator().into_root_schema_for::<T>();
  to_value(schema).expect("config schema should serialize")
}

fn descriptors() -> Vec<AppConfigDescriptor> {
  let defaults = CopilotRuntimeConfigFile::default();
  let mut allowed_providers_schema = schema_for::<Vec<String>>();
  allowed_providers_schema["items"]["enum"] = json!(SUPPORTED_BYOK_PROVIDERS);

  vec![
    AppConfigDescriptor {
      key: "byok.enabled".to_string(),
      description: "Allow workspace owners and admins to configure AI provider keys through AI BYOK.".to_string(),
      default_value: json!(defaults.byok.enabled),
      schema: schema_for::<bool>(),
      internal: false,
    },
    AppConfigDescriptor {
      key: "byok.allowedProviders".to_string(),
      description: "AI providers that workspace owners and admins may add through AI BYOK.".to_string(),
      default_value: json!(defaults.byok.allowed_providers),
      schema: allowed_providers_schema,
      internal: false,
    },
    AppConfigDescriptor {
      key: "byok.allowCustomEndpoint".to_string(),
      description: "Allow AI BYOK keys to use a custom provider endpoint.".to_string(),
      default_value: json!(defaults.byok.allow_custom_endpoint),
      schema: schema_for::<bool>(),
      internal: false,
    },
    AppConfigDescriptor {
      key: "byok.allowPrivateEndpoint".to_string(),
      description: "Whether workspace BYOK custom endpoints may resolve to private network targets. Enabling this \
                    allows workspace owners and admins to send provider probe requests to the private network."
        .to_string(),
      default_value: json!(defaults.byok.allow_private_endpoint),
      schema: schema_for::<bool>(),
      internal: false,
    },
    AppConfigDescriptor {
      key: "providers.profiles".to_string(),
      description: "The profile list for copilot providers.".to_string(),
      default_value: json!(defaults.providers.profiles),
      schema: schema_for::<Vec<CopilotManagedProfileConfigFile>>(),
      internal: true,
    },
  ]
}

fn validate_leaf(key: &str, value: Value) -> std::result::Result<(), RuntimeError> {
  let mut config = CopilotRuntimeConfigFile::default();
  match key {
    "byok.enabled" => {
      config.byok.enabled =
        from_value(value).map_err(|error| RuntimeError::json("invalid copilot BYOK enabled config", error))?;
    }
    "byok.allowedProviders" => {
      config.byok.allowed_providers = from_value(value)
        .map_err(|error| RuntimeError::json("invalid copilot BYOK allowed providers config", error))?;
    }
    "byok.allowCustomEndpoint" => {
      config.byok.allow_custom_endpoint =
        from_value(value).map_err(|error| RuntimeError::json("invalid copilot BYOK custom endpoint config", error))?;
    }
    "byok.allowPrivateEndpoint" => {
      config.byok.allow_private_endpoint =
        from_value(value).map_err(|error| RuntimeError::json("invalid copilot BYOK private endpoint config", error))?;
    }
    "providers.profiles" => {
      config.providers.profiles =
        from_value(value).map_err(|error| RuntimeError::json("invalid managed copilot profiles config", error))?;
    }
    _ => return Err(RuntimeError::config(format!("unknown copilot app config key: {key}"))),
  }
  let config = CopilotRuntimeConfig::try_from(config)?;
  validate_copilot_config(&config)
}

#[napi_derive::napi(catch_unwind)]
pub fn app_config_descriptors(module: String) -> Result<Vec<AppConfigDescriptor>> {
  if module != COPILOT_MODULE {
    return Err(invalid_config(format!("unknown native app config module: {module}")));
  }
  Ok(descriptors())
}

#[napi_derive::napi(catch_unwind)]
pub fn validate_app_config_value(module: String, key: String, value: Value) -> Result<Vec<String>> {
  if module != COPILOT_MODULE {
    return Err(invalid_config(format!("unknown native app config module: {module}")));
  }
  let descriptor = descriptors()
    .into_iter()
    .find(|descriptor| descriptor.key == key)
    .ok_or_else(|| invalid_config(format!("unknown native app config key: {module}.{key}")))?;
  let schema = jsonschema::options()
    .with_draft(Draft::Draft7)
    .build(&descriptor.schema)
    .map_err(|error| invalid_config(format!("failed to compile app config schema: {error}")))?;
  let errors = schema
    .iter_errors(&value)
    .map(|error| error.to_string())
    .collect::<Vec<_>>();
  if !errors.is_empty() {
    return Ok(errors);
  }
  Ok(
    validate_leaf(&key, value)
      .err()
      .map(|error| vec![error.to_string()])
      .unwrap_or_default(),
  )
}

#[cfg(test)]
mod tests {

  use super::{app_config_descriptors, json, validate_app_config_value};

  #[test]
  fn copilot_descriptors_and_validation_share_runtime_contract() {
    let descriptors = app_config_descriptors("copilot".to_string()).unwrap();
    assert_eq!(
      descriptors
        .iter()
        .map(|descriptor| descriptor.key.as_str())
        .collect::<Vec<_>>(),
      [
        "byok.enabled",
        "byok.allowedProviders",
        "byok.allowCustomEndpoint",
        "byok.allowPrivateEndpoint",
        "providers.profiles",
      ]
    );
    assert_eq!(descriptors[0].default_value, json!(true));
    assert!(descriptors[4].internal);
    assert!(
      validate_app_config_value(
        "copilot".to_string(),
        "providers.profiles".to_string(),
        json!([{
          "id": "managed-openai",
          "type": "openai",
          "displayName": "OpenAI",
          "priority": 1,
          "enabled": true,
          "models": ["gpt-5.6-luna"],
          "middleware": {
            "rust": { "request": ["normalize_messages"] },
            "node": { "text": ["citation_footnote"] }
          },
          "config": { "apiKey": "test" }
        }]),
      )
      .unwrap()
      .is_empty()
    );
  }

  #[test]
  fn copilot_validation_rejects_invalid_leaf_values() {
    for (key, value) in [
      ("byok.enabled", json!("yes")),
      ("byok.allowedProviders", json!(["openai", "openai"])),
      (
        "providers.profiles",
        json!([{
          "id": "invalid id",
          "type": "openai",
          "models": ["gpt-5.6-luna"],
          "config": {}
        }]),
      ),
      (
        "providers.profiles",
        json!([{
          "id": "managed-openai",
          "type": "openai",
          "models": ["gpt-5.6-luna"],
          "middleware": { "node": { "text": ["unknown"] } },
          "config": {}
        }]),
      ),
    ] {
      assert!(
        !validate_app_config_value("copilot".to_string(), key.to_string(), value)
          .unwrap()
          .is_empty(),
        "{key}"
      );
    }
  }
}
