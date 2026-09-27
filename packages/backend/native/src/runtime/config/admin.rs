use jsonschema::Draft;
use napi::{Error, Result, Status};
use schemars::generate::SchemaSettings;
use serde_json::{Value, from_value, json, to_value};

use super::{
  AuthConfigFile, CopilotRuntimeConfig, CopilotRuntimeConfigFile, CryptoConfigFile, MANAGED_PROFILE_REQUIREMENTS,
  OAuthProviderConfigFile, PaymentRuntimeConfigFile, RedisRuntimeConfigFile, RuntimeError, SUPPORTED_BYOK_PROVIDERS,
  SearchRuntimeConfigFile, auth_limit, insert_flat_override, valid_search_endpoint, validate_copilot_config,
};
use crate::runtime::object_storage::{
  StorageBackendConfig, default_storage_provider_config, storage_provider_schema, types::StorageProviderConfig,
};

const AUTH_MODULE: &str = "auth";
const COPILOT_MODULE: &str = "copilot";
const CRYPTO_MODULE: &str = "crypto";
const INDEXER_MODULE: &str = "indexer";
const OAUTH_MODULE: &str = "oauth";
const PAYMENT_MODULE: &str = "payment";
const REDIS_MODULE: &str = "redis";
const STORAGES_MODULE: &str = "storages";

#[napi_derive::napi(object)]
pub struct AppConfigDescriptor {
  pub key: String,
  pub description: String,
  pub default_value: Value,
  pub schema: Value,
  pub internal: bool,
  pub env_name: Option<String>,
  pub env_type: Option<String>,
  pub link: Option<String>,
}

fn invalid_config(message: impl Into<String>) -> Error {
  Error::new(Status::InvalidArg, message.into())
}

fn field<'a>(root: &'a Value, key: &str) -> &'a Value {
  let mut current = root;
  for segment in key.split('.') {
    if let Some(reference) = current
      .get("$ref")
      .or_else(|| current.pointer("/allOf/0/$ref"))
      .and_then(Value::as_str)
    {
      current = root
        .pointer(reference.strip_prefix('#').expect("local schema reference"))
        .expect("generated schema reference");
    }
    current = &current["properties"][segment];
  }
  current
}

fn descriptors() -> Vec<AppConfigDescriptor> {
  let defaults = to_value(CopilotRuntimeConfigFile::default()).expect("copilot defaults should serialize");
  let root = to_value(
    SchemaSettings::draft07()
      .into_generator()
      .into_root_schema_for::<CopilotRuntimeConfigFile>(),
  )
  .expect("copilot schema should serialize");
  let definitions = root.get("$defs").or_else(|| root.get("definitions"));
  [
    (
      "enabled",
      "Enable AI features. Workspace owners configure provider keys in Workspace Settings → Integrations → AI BYOK.",
      false,
    ),
    (
      "byok.enabled",
      "Allow workspace owners and admins to configure AI provider keys through AI BYOK.",
      false,
    ),
    (
      "byok.allowedProviders",
      "AI providers that workspace owners and admins may add through AI BYOK.",
      false,
    ),
    (
      "byok.allowCustomEndpoint",
      "Allow AI BYOK keys to use a custom provider endpoint.",
      false,
    ),
    (
      "byok.allowPrivateEndpoint",
      "Whether workspace BYOK custom endpoints may resolve to private network targets. Enabling this allows workspace \
       owners and admins to send provider probe requests to the private network.",
      false,
    ),
    ("providers.profiles", "The profile list for copilot providers.", true),
  ]
  .into_iter()
  .map(|(key, description, internal)| {
    let pointer = format!("/{}", key.replace('.', "/"));
    let mut schema = field(&root, key).clone();
    if let Some(definitions) = definitions {
      let name = if root.get("$defs").is_some() {
        "$defs"
      } else {
        "definitions"
      };
      schema[name] = definitions.clone();
    }
    if key == "byok.allowedProviders" {
      schema["items"]["enum"] = json!(SUPPORTED_BYOK_PROVIDERS);
    }
    if key == "providers.profiles" {
      let profile = &mut schema["definitions"]["CopilotManagedProfileConfigFile"];
      let requirements = MANAGED_PROFILE_REQUIREMENTS
        .iter()
        .map(|(provider, fields)| {
          let properties = fields
            .iter()
            .map(|field| ((*field).to_string(), json!({ "type": "string", "pattern": "\\S" })))
            .collect::<serde_json::Map<_, _>>();
          json!({
            "if": { "properties": { "type": { "const": provider } }, "required": ["type"] },
            "then": { "properties": { "config": { "required": fields, "properties": properties } } }
          })
        })
        .collect::<Vec<_>>();
      profile["allOf"] = json!([{
        "if": { "properties": { "enabled": { "const": false } }, "required": ["enabled"] },
        "else": { "allOf": requirements }
      }]);
    }
    AppConfigDescriptor {
      key: key.to_string(),
      description: description.to_string(),
      default_value: defaults.pointer(&pointer).expect("copilot default field").clone(),
      schema,
      internal,
      env_name: None,
      env_type: None,
      link: None,
    }
  })
  .chain(std::iter::once(storage_descriptor(
    "storage",
    "copilot",
    "The config for the storage provider.",
  )))
  .collect()
}

fn storage_descriptor(key: &str, bucket: &str, description: &str) -> AppConfigDescriptor {
  AppConfigDescriptor {
    key: key.to_string(),
    description: description.to_string(),
    default_value: default_storage_provider_config(bucket),
    schema: storage_provider_schema(),
    internal: false,
    env_name: None,
    env_type: None,
    link: None,
  }
}

fn storage_descriptors() -> Vec<AppConfigDescriptor> {
  vec![
    storage_descriptor("avatar.storage", "avatars", "The config of storage for user avatars."),
    storage_descriptor(
      "blob.storage",
      "blobs",
      "The config of storage for all uploaded blobs(images, videos, etc.).",
    ),
  ]
}

fn payment_descriptors() -> Vec<AppConfigDescriptor> {
  let defaults = to_value(PaymentRuntimeConfigFile::default()).expect("payment defaults should serialize");
  let root = to_value(
    SchemaSettings::draft07()
      .into_generator()
      .into_root_schema_for::<PaymentRuntimeConfigFile>(),
  )
  .expect("payment schema should serialize");
  let definitions = root.get("$defs").or_else(|| root.get("definitions"));
  [
    ("enabled", "Whether to enable payment integration."),
    ("stripe", "Stripe SDK options and credentials."),
    ("revenuecat", "RevenueCat integration configuration."),
  ]
  .into_iter()
  .map(|(key, description)| {
    let mut schema = field(&root, key).clone();
    if let Some(definitions) = definitions {
      let name = if root.get("$defs").is_some() {
        "$defs"
      } else {
        "definitions"
      };
      schema[name] = definitions.clone();
    }
    AppConfigDescriptor {
      key: key.to_string(),
      description: description.to_string(),
      default_value: defaults.get(key).expect("payment default field").clone(),
      schema,
      internal: false,
      env_name: None,
      env_type: None,
      link: None,
    }
  })
  .collect()
}

fn auth_descriptors() -> Vec<AppConfigDescriptor> {
  let defaults = to_value(AuthConfigFile::default()).expect("auth defaults should serialize");
  let root = to_value(
    SchemaSettings::draft07()
      .into_generator()
      .into_root_schema_for::<AuthConfigFile>(),
  )
  .expect("auth schema should serialize");
  let definitions = root.get("$defs").or_else(|| root.get("definitions"));
  [
    ("allowSignup", "Allow new registrations."),
    (
      "allowSignupForOauth",
      "Allow new registrations through configured OAuth providers.",
    ),
    (
      "requireEmailDomainVerification",
      "Require email domain verification for restricted resources.",
    ),
    (
      "newAccountActionDelay",
      "Minimum account age in seconds for invites and document publishing.",
    ),
    ("session.ttl", "Application auth expiration in seconds."),
    ("session.ttr", "Application auth refresh interval in seconds."),
    ("token.accessTokenTtl", "Access JWT expiration in seconds."),
    (
      "token.refreshIdleTtl",
      "Refresh session inactivity expiration in seconds.",
    ),
    (
      "token.refreshAbsoluteTtl",
      "Refresh session absolute expiration in seconds.",
    ),
    (
      "token.refreshGracePeriod",
      "Refresh rotation concurrency grace period in seconds.",
    ),
    (
      "token.refreshRetention",
      "Expired refresh generation retention in seconds.",
    ),
  ]
  .into_iter()
  .map(|(key, description)| {
    let pointer = format!("/{}", key.replace('.', "/"));
    let mut schema = field(&root, key).clone();
    if let Some(definitions) = definitions {
      let name = if root.get("$defs").is_some() {
        "$defs"
      } else {
        "definitions"
      };
      schema[name] = definitions.clone();
    }
    if let Some((min, max)) = auth_limit(key) {
      schema["minimum"] = json!(min);
      if max != i64::MAX {
        schema["maximum"] = json!(max);
      }
    }
    AppConfigDescriptor {
      key: key.to_string(),
      description: description.to_string(),
      default_value: defaults.pointer(&pointer).expect("auth default field").clone(),
      schema,
      internal: false,
      env_name: None,
      env_type: None,
      link: None,
    }
  })
  .collect()
}

fn indexer_descriptors() -> Vec<AppConfigDescriptor> {
  let defaults = to_value(SearchRuntimeConfigFile::default()).expect("indexer defaults should serialize");
  let root = to_value(
    SchemaSettings::draft07()
      .into_generator()
      .into_root_schema_for::<SearchRuntimeConfigFile>(),
  )
  .expect("indexer schema should serialize");
  let definitions = root.get("$defs").or_else(|| root.get("definitions"));
  [
    ("enabled", "Enable the indexer."),
    ("provider.type", "Search provider type."),
    ("provider.endpoint", "Remote search provider endpoint."),
    ("provider.apiKey", "Remote search provider API key."),
    ("provider.username", "Remote search provider username."),
    ("provider.password", "Remote search provider password."),
  ]
  .into_iter()
  .map(|(key, description)| {
    let pointer = format!("/{}", key.replace('.', "/"));
    let mut schema = field(&root, key).clone();
    if let Some(definitions) = definitions {
      let name = if root.get("$defs").is_some() {
        "$defs"
      } else {
        "definitions"
      };
      schema[name] = definitions.clone();
    }
    AppConfigDescriptor {
      key: key.to_string(),
      description: description.to_string(),
      default_value: defaults.pointer(&pointer).expect("indexer default field").clone(),
      schema,
      internal: false,
      env_name: None,
      env_type: None,
      link: None,
    }
  })
  .collect()
}

fn redis_descriptors() -> Vec<AppConfigDescriptor> {
  let defaults = to_value(RedisRuntimeConfigFile::default()).expect("Redis defaults should serialize");
  let root = to_value(
    SchemaSettings::draft07()
      .into_generator()
      .into_root_schema_for::<RedisRuntimeConfigFile>(),
  )
  .expect("Redis schema should serialize");
  [
    ("host", "Redis host."),
    ("port", "Redis port."),
    ("db", "Redis database index."),
    ("username", "Redis username."),
    ("password", "Redis password."),
  ]
  .into_iter()
  .map(|(key, description)| {
    let mut schema = field(&root, key).clone();
    if key == "port" {
      schema["minimum"] = json!(1);
    }
    if key == "db" {
      schema["maximum"] = json!(10);
    }
    AppConfigDescriptor {
      key: key.to_string(),
      description: description.to_string(),
      default_value: defaults.get(key).expect("Redis default field").clone(),
      schema,
      internal: false,
      env_name: Some(format!(
        "REDIS_SERVER_{}",
        match key {
          "db" => "DATABASE",
          "host" => "HOST",
          "port" => "PORT",
          "username" => "USERNAME",
          "password" => "PASSWORD",
          _ => unreachable!(),
        }
      )),
      env_type: Some(
        if matches!(key, "db" | "port") {
          "integer"
        } else {
          "string"
        }
        .to_string(),
      ),
      link: None,
    }
  })
  .collect()
}

fn crypto_descriptors() -> Vec<AppConfigDescriptor> {
  let defaults = to_value(CryptoConfigFile::default()).expect("crypto defaults should serialize");
  let root = to_value(
    SchemaSettings::draft07()
      .into_generator()
      .into_root_schema_for::<CryptoConfigFile>(),
  )
  .expect("crypto schema should serialize");
  vec![AppConfigDescriptor {
    key: "privateKey".to_string(),
    description: "Private key for Node signing and encryption plus native runtime identity.".to_string(),
    default_value: defaults["privateKey"].clone(),
    schema: field(&root, "privateKey").clone(),
    internal: false,
    env_name: Some("AFFINE_PRIVATE_KEY".to_string()),
    env_type: Some("string".to_string()),
    link: None,
  }]
}

fn oauth_descriptors() -> Vec<AppConfigDescriptor> {
  let default = to_value(OAuthProviderConfigFile::default()).expect("OAuth defaults should serialize");
  let root = to_value(
    SchemaSettings::draft07()
      .into_generator()
      .into_root_schema_for::<OAuthProviderConfigFile>(),
  )
  .expect("OAuth schema should serialize");
  [
    (
      "google",
      "Google OAuth provider config",
      "https://developers.google.com/identity/protocols/oauth2/web-server",
    ),
    (
      "github",
      "GitHub OAuth provider config",
      "https://docs.github.com/en/apps/oauth-apps",
    ),
    (
      "oidc",
      "OIDC OAuth provider config. Private network access requires allowPrivateNetwork: true",
      "https://openid.net/specs/openid-connect-core-1_0.html",
    ),
    (
      "apple",
      "Apple OAuth provider config",
      "https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js/implementing_sign_in_with_apple_in_your_app",
    ),
  ]
  .into_iter()
  .map(|(name, description, link)| {
    let mut schema = root.clone();
    let mut default_value = default.clone();
    if name == "oidc" {
      schema["properties"]["issuer"]["description"] = json!("OIDC issuer HTTP(S) URL");
      schema["properties"]["allowPrivateNetwork"]["description"] =
        json!("Allow the OIDC issuer origin to resolve to private network addresses");
    } else {
      for key in ["issuer", "allowPrivateNetwork"] {
        schema["properties"].as_object_mut().expect("OAuth schema properties").remove(key);
        default_value.as_object_mut().expect("OAuth defaults object").remove(key);
      }
    }
    AppConfigDescriptor {
      key: format!("providers.{name}"),
      description: description.to_string(),
      default_value,
      schema,
      internal: false,
      env_name: None,
      env_type: None,
      link: Some(link.to_string()),
    }
  })
  .collect()
}

fn validate_leaf(key: &str, value: Value) -> std::result::Result<(), RuntimeError> {
  let mut raw = to_value(CopilotRuntimeConfigFile::default())
    .map_err(|error| RuntimeError::json("serialize copilot defaults", error))?;
  insert_flat_override(raw.as_object_mut().expect("copilot defaults are an object"), key, value);
  let config: CopilotRuntimeConfigFile =
    from_value(raw).map_err(|error| RuntimeError::json("invalid copilot config", error))?;
  let config = CopilotRuntimeConfig::try_from(config)?;
  validate_copilot_config(&config)
}

#[napi_derive::napi(catch_unwind)]
pub fn app_config_descriptors(module: String) -> Result<Vec<AppConfigDescriptor>> {
  match module.as_str() {
    AUTH_MODULE => Ok(auth_descriptors()),
    COPILOT_MODULE => Ok(descriptors()),
    CRYPTO_MODULE => Ok(crypto_descriptors()),
    INDEXER_MODULE => Ok(indexer_descriptors()),
    OAUTH_MODULE => Ok(oauth_descriptors()),
    PAYMENT_MODULE => Ok(payment_descriptors()),
    REDIS_MODULE => Ok(redis_descriptors()),
    STORAGES_MODULE => Ok(storage_descriptors()),
    _ => Err(invalid_config(format!("unknown native app config module: {module}"))),
  }
}

#[napi_derive::napi(catch_unwind)]
pub fn validate_app_config_value(module: String, key: String, value: Value) -> Result<Vec<String>> {
  let descriptors = app_config_descriptors(module.clone())?;
  let descriptor = descriptors
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
  if module == INDEXER_MODULE
    && key == "provider.endpoint"
    && !valid_search_endpoint(value.as_str().unwrap_or_default())
  {
    return Ok(vec!["invalid search provider endpoint".to_string()]);
  }
  if module == OAUTH_MODULE && key == "providers.oidc" {
    let issuer = value.get("issuer").and_then(Value::as_str).unwrap_or_default();
    if !valid_search_endpoint(issuer) {
      return Ok(vec!["invalid OIDC issuer URL".to_string()]);
    }
  }
  if module == COPILOT_MODULE {
    if key == "storage" {
      return Ok(validate_storage(value));
    }
    Ok(
      validate_leaf(&key, value)
        .err()
        .map(|error| vec![error.to_string()])
        .unwrap_or_default(),
    )
  } else {
    Ok(if module == STORAGES_MODULE {
      validate_storage(value)
    } else {
      Vec::new()
    })
  }
}

fn validate_storage(value: Value) -> Vec<String> {
  let config: StorageProviderConfig = match from_value(value) {
    Ok(config) => config,
    Err(error) => return vec![error.to_string()],
  };
  StorageBackendConfig::from_provider_config(Some(config))
    .err()
    .map(|error| vec![error.to_string()])
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {

  use super::{app_config_descriptors, json, validate_app_config_value};

  #[test]
  fn native_descriptors_and_validation_share_runtime_contract() {
    let storages = app_config_descriptors("storages".to_string()).unwrap();
    let copilot_storage = app_config_descriptors("copilot".to_string())
      .unwrap()
      .into_iter()
      .find(|descriptor| descriptor.key == "storage")
      .unwrap();
    for (module, descriptor) in storages
      .iter()
      .map(|descriptor| ("storages", descriptor))
      .chain(std::iter::once(("copilot", &copilot_storage)))
    {
      assert!(
        validate_app_config_value(
          module.to_string(),
          descriptor.key.clone(),
          descriptor.default_value.clone()
        )
        .unwrap()
        .is_empty(),
        "{}.{}",
        module,
        descriptor.key
      );
      assert!(
        !validate_app_config_value(
          module.to_string(),
          descriptor.key.clone(),
          json!({ "provider": "fs", "bucket": "blobs", "config": {} })
        )
        .unwrap()
        .is_empty()
      );
      assert!(
        !validate_app_config_value(module.to_string(), descriptor.key.clone(), json!({ "provider": "cloudflare-r2", "bucket": "blobs", "config": { "accountId": "x", "usePresignedURL": { "enabled": "yes" } } }))
          .unwrap()
          .is_empty()
      );
    }

    let crypto = app_config_descriptors("crypto".to_string()).unwrap();
    assert_eq!(crypto.len(), 1);
    assert_eq!(crypto[0].default_value, "");
    assert_eq!(crypto[0].env_name.as_deref(), Some("AFFINE_PRIVATE_KEY"));
    assert!(
      !validate_app_config_value("crypto".to_string(), "privateKey".to_string(), json!(true))
        .unwrap()
        .is_empty()
    );

    let oauth = app_config_descriptors("oauth".to_string()).unwrap();
    assert_eq!(oauth.len(), 4);
    for descriptor in &oauth {
      assert!(descriptor.link.is_some());
      assert!(
        validate_app_config_value(
          "oauth".to_string(),
          descriptor.key.clone(),
          descriptor.default_value.clone()
        )
        .unwrap()
        .is_empty()
      );
    }
    assert!(
      validate_app_config_value(
        "oauth".to_string(),
        "providers.oidc".to_string(),
        json!({ "clientId": "id", "clientSecret": "secret", "issuer": "https://example.com", "args": {} })
      )
      .unwrap()
      .is_empty()
    );
    assert!(
      !validate_app_config_value(
        "oauth".to_string(),
        "providers.oidc".to_string(),
        json!({ "clientId": "id", "clientSecret": "secret", "issuer": "file:///etc/passwd", "args": {} })
      )
      .unwrap()
      .is_empty()
    );

    let redis = app_config_descriptors("redis".to_string()).unwrap();
    assert_eq!(
      redis
        .iter()
        .map(|descriptor| descriptor.key.as_str())
        .collect::<Vec<_>>(),
      ["host", "port", "db", "username", "password"]
    );
    assert_eq!(redis[0].default_value, "localhost");
    assert_eq!(redis[1].default_value, 6379);
    assert_eq!(redis[0].env_name.as_deref(), Some("REDIS_SERVER_HOST"));
    assert_eq!(redis[2].env_name.as_deref(), Some("REDIS_SERVER_DATABASE"));
    for descriptor in &redis {
      assert!(
        validate_app_config_value(
          "redis".to_string(),
          descriptor.key.clone(),
          descriptor.default_value.clone()
        )
        .unwrap()
        .is_empty(),
        "{}",
        descriptor.key
      );
    }
    assert!(
      !validate_app_config_value("redis".to_string(), "port".to_string(), json!(0))
        .unwrap()
        .is_empty()
    );
    assert!(
      !validate_app_config_value("redis".to_string(), "db".to_string(), json!(11))
        .unwrap()
        .is_empty()
    );

    let auth = app_config_descriptors("auth".to_string()).unwrap();
    assert_eq!(auth.len(), 11);
    assert_eq!(
      auth
        .iter()
        .find(|descriptor| descriptor.key == "allowSignup")
        .unwrap()
        .default_value,
      true
    );
    assert_eq!(
      auth
        .iter()
        .find(|descriptor| descriptor.key == "token.accessTokenTtl")
        .unwrap()
        .default_value,
      15 * 60
    );
    for descriptor in &auth {
      assert!(
        validate_app_config_value(
          "auth".to_string(),
          descriptor.key.clone(),
          descriptor.default_value.clone()
        )
        .unwrap()
        .is_empty(),
        "{}",
        descriptor.key
      );
    }
    assert!(
      !validate_app_config_value("auth".to_string(), "token.accessTokenTtl".to_string(), json!(30))
        .unwrap()
        .is_empty()
    );
    assert!(
      !validate_app_config_value("auth".to_string(), "newAccountActionDelay".to_string(), json!(-1))
        .unwrap()
        .is_empty()
    );

    let descriptors = app_config_descriptors("copilot".to_string()).unwrap();
    assert_eq!(
      descriptors
        .iter()
        .map(|descriptor| descriptor.key.as_str())
        .collect::<Vec<_>>(),
      [
        "enabled",
        "byok.enabled",
        "byok.allowedProviders",
        "byok.allowCustomEndpoint",
        "byok.allowPrivateEndpoint",
        "providers.profiles",
        "storage",
      ]
    );
    assert_eq!(descriptors[0].default_value, json!(false));
    assert_eq!(descriptors[1].default_value, json!(true));
    assert!(descriptors[5].internal);
    let profile_schema = jsonschema::options()
      .with_draft(jsonschema::Draft::Draft7)
      .build(&descriptors[5].schema)
      .unwrap();
    for (profile, accepted) in [
      (
        json!({"id":"openai","type":"openai","models":["gpt-5.6-luna"],"config":{"apiKey":"test"}}),
        true,
      ),
      (
        json!({"id":"openai","type":"openai","models":["gpt-5.6-luna"],"config":{}}),
        false,
      ),
      (
        json!({"id":"openai","type":"openai","enabled":false,"models":["gpt-5.6-luna"],"config":{}}),
        true,
      ),
      (
        json!({"id":"cloudflare","type":"cloudflareWorkersAi","models":["@cf/baai/bge-reranker-base"],"config":{"apiToken":"test"}}),
        false,
      ),
      (
        json!({"id":"vertex","type":"geminiVertex","models":["gemini-3.7-flash"],"config":{"project":"test","location":"global"}}),
        true,
      ),
    ] {
      let value = json!([profile]);
      assert_eq!(profile_schema.is_valid(&value), accepted);
      assert_eq!(
        validate_app_config_value("copilot".to_string(), "providers.profiles".to_string(), value)
          .unwrap()
          .is_empty(),
        accepted
      );
    }
    for descriptor in &descriptors {
      assert!(
        validate_app_config_value(
          "copilot".to_string(),
          descriptor.key.clone(),
          descriptor.default_value.clone()
        )
        .unwrap()
        .is_empty(),
        "{}",
        descriptor.key
      );
    }
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

    let payment = app_config_descriptors("payment".to_string()).unwrap();
    assert_eq!(
      payment
        .iter()
        .map(|descriptor| descriptor.key.as_str())
        .collect::<Vec<_>>(),
      ["enabled", "stripe", "revenuecat"]
    );
    assert_eq!(payment[0].default_value, json!(false));
    assert_eq!(payment[1].default_value["environment"], "test");
    assert_eq!(payment[2].default_value["environment"], "production");
    for descriptor in &payment {
      assert!(
        validate_app_config_value(
          "payment".to_string(),
          descriptor.key.clone(),
          descriptor.default_value.clone()
        )
        .unwrap()
        .is_empty(),
        "{}",
        descriptor.key
      );
    }
    assert!(
      !validate_app_config_value("payment".to_string(), "enabled".to_string(), json!("true"))
        .unwrap()
        .is_empty()
    );
    assert!(
      !validate_app_config_value("payment".to_string(), "stripe".to_string(), json!("invalid"))
        .unwrap()
        .is_empty()
    );

    let indexer = app_config_descriptors("indexer".to_string()).unwrap();
    assert_eq!(
      indexer
        .iter()
        .map(|descriptor| descriptor.key.as_str())
        .collect::<Vec<_>>(),
      [
        "enabled",
        "provider.type",
        "provider.endpoint",
        "provider.apiKey",
        "provider.username",
        "provider.password",
      ]
    );
    assert_eq!(indexer[1].default_value, "embedded");
    for descriptor in &indexer {
      assert!(
        validate_app_config_value(
          "indexer".to_string(),
          descriptor.key.clone(),
          descriptor.default_value.clone()
        )
        .unwrap()
        .is_empty(),
        "{}",
        descriptor.key
      );
    }
    assert!(
      !validate_app_config_value("indexer".to_string(), "provider.type".to_string(), json!("unknown"))
        .unwrap()
        .is_empty()
    );
    assert!(
      !validate_app_config_value(
        "indexer".to_string(),
        "provider.endpoint".to_string(),
        json!("not a URL")
      )
      .unwrap()
      .is_empty()
    );
  }

  #[test]
  fn copilot_validation_rejects_invalid_leaf_values() {
    for (key, value) in [
      ("enabled", json!("yes")),
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
