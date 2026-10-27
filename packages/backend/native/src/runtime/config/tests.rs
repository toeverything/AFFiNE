use std::fs;

use serde_json::Map;

use super::*;

#[test]
fn server_config_uses_one_explicit_path() {
  let directory = tempfile::tempdir().unwrap();
  let config_path = directory.path().join("config.json");
  fs::write(
    &config_path,
    r#"{"deployment":{"type":"selfhosted"},"copilot":{"enabled":false,"exa":{"key":"node"}},"crypto":{"privateKey":"native-only"},"redis":{"ioredis":{"enableAutoPipelining":true}},"server":{"name":"example"}}"#,
  )
  .unwrap();
  let config = ServerConfig::open(&config_path, None).unwrap();
  assert!(ServerConfig::open(&config_path, Some("unknown")).is_ok());
  assert_eq!(config.path(), config_path.canonicalize().unwrap());
  assert!(config.deployment() == Deployment::SelfHosted);
  assert_eq!(config.baseline()["copilot"]["enabled"], false);
  assert_eq!(
    config.node_owned(),
    serde_json::json!({"copilot":{"exa":{"key":"node"}},"server":{"name":"example"}})
  );
  assert_eq!(
    config.redis_node_options(),
    serde_json::json!({"enableAutoPipelining":true})
  );
  assert_eq!(
    config.public_native_baseline(),
    serde_json::json!({"copilot":{"enabled":false}})
  );
  let native = BackendRuntimeConfig::from_server_config(None, &config).unwrap();
  assert!(native.deployment == Deployment::SelfHosted);
  assert_eq!(native.private_key.as_str(), "native-only");
  assert_eq!(native.redis.url, config.redis_url().unwrap());
  let storage = crate::runtime::storage_runtime::StorageRuntimeConfig::from_server_config(&config).unwrap();
  assert_eq!(native.database_url, storage.database_url);
  assert!(storage.object_storage.backends.contains_key("blob"));
  fs::write(&config_path, r#"{"copilot":{"enabled":false}}"#).unwrap();
  assert!(ServerConfig::open(&config_path, None).is_err());
  let upgraded = ServerConfig::open(&config_path, Some("selfhosted")).unwrap();
  assert!(upgraded.deployment() == Deployment::SelfHosted);
  assert!(ServerConfig::open(&config_path, Some("unknown")).is_err());
  fs::write(
    &config_path,
    r#"{"deployment":{"type":"selfhosted"},"copilot":{"enabled":"yes"}}"#,
  )
  .unwrap();
  assert!(ServerConfig::open(&config_path, None).is_err());
  fs::write(
    &config_path,
    r#"{"deployment":{"type":"selfhosted"},"indexer":{"provider":{"type":"unknown"}}}"#,
  )
  .unwrap();
  assert!(ServerConfig::open(&config_path, None).is_err());
  fs::write(
    &config_path,
    r#"{"deployment":{"type":"selfhosted"},"indexer":{"provider":{"type":"elasticsearch","endpoint":"invalid"}}}"#,
  )
  .unwrap();
  let config = ServerConfig::open(&config_path, None).unwrap();
  assert!(BackendRuntimeConfig::from_server_config(None, &config).is_err());
  fs::write(
    &config_path,
    r#"{"deployment":{"type":"selfhosted"},"auth":{"token":{"accessTokenTtl":30}}}"#,
  )
  .unwrap();
  assert!(ServerConfig::open(&config_path, None).is_err());
  fs::write(
    &config_path,
    r#"{"deployment":{"type":"selfhosted"},"redis":{"port":0}}"#,
  )
  .unwrap();
  assert!(ServerConfig::open(&config_path, None).is_err());
  fs::write(
    &config_path,
    r#"{"deployment":{"type":"selfhosted"},"oauth":{"providers":{"oidc":{"issuer":"file:///etc/passwd"}}}}"#,
  )
  .unwrap();
  assert!(ServerConfig::open(&config_path, None).is_err());
}

#[test]
fn blank_database_urls_are_ignored() {
  assert_eq!(non_empty_string("".to_string()), None);
  assert_eq!(non_empty_string("   ".to_string()), None);
  assert_eq!(
    non_empty_string("postgresql://affine:affine@localhost:5432/affine".to_string()),
    Some("postgresql://affine:affine@localhost:5432/affine".to_string())
  );
}

#[test]
fn ignores_storage_app_config_values() {
  let app_config = app_config_from_flat_overrides([
    (
      "storages.blob.storage",
      serde_json::json!({"provider": "cloudflare-r2"}),
    ),
    ("db.datasourceUrl", serde_json::json!("postgresql://example/runtime")),
  ])
  .unwrap();

  assert_eq!(
    app_config.database_url().as_deref(),
    Some("postgresql://example/runtime")
  );
}

#[test]
fn expands_module_config_paths_from_json_files() {
  let app_config = app_config_from_module_json(serde_json::json!({
    "copilot": {
      "enabled": true,
      "byok.enabled": false,
      "providers.profiles": [{
        "id": "managed-openai",
        "type": "openai",
        "models": ["gpt-5.6-luna"],
        "config": { "apiKey": "test" }
      }]
    }
  }))
  .unwrap();
  let copilot: CopilotRuntimeConfig = app_config.copilot.unwrap().try_into().unwrap();

  assert!(copilot.enabled);
  assert!(!copilot.byok.enabled);
  assert_eq!(copilot.providers.profiles.len(), 1);
  assert_eq!(copilot.providers.profiles[0].id, "managed-openai");

  let missing_models = app_config_from_flat_overrides([(
    "copilot.providers.profiles",
    serde_json::json!([{
      "id": "managed-openai",
      "type": "openai",
      "config": {}
    }]),
  )]);
  assert!(missing_models.is_err());

  let app_config = app_config_from_flat_overrides([(
    "copilot.providers.profiles",
    serde_json::json!([{
      "id": "managed-openai",
      "type": "openai",
      "models": [],
      "config": {}
    }]),
  )])
  .unwrap();
  let copilot: CopilotRuntimeConfig = app_config.copilot.unwrap().try_into().unwrap();
  assert!(validate_copilot_config(&copilot).is_err());

  let app_config = app_config_from_flat_overrides([(
    "copilot.providers.profiles",
    serde_json::json!([
      {
        "id": "anthropic-direct",
        "type": "anthropic",
        "models": ["claude-sonnet-4-6"],
        "config": {}
      },
      {
        "id": "anthropic-vertex",
        "type": "anthropicVertex",
        "models": ["claude-sonnet-4-6"],
        "config": {}
      }
    ]),
  )])
  .unwrap();
  let copilot: CopilotRuntimeConfig = app_config.copilot.unwrap().try_into().unwrap();
  assert!(validate_copilot_config(&copilot).is_err());

  let directory = tempfile::tempdir().unwrap();
  let config_path = directory.path().join("config.json");
  fs::write(
    &config_path,
    r#"{"deployment":{"type":"cloud"},"copilot":{"enabled":true,"byok.enabled":false,"byok.allowCustomEndpoint":true}}"#,
  )
  .unwrap();
  let config = ServerConfig::open(&config_path, None).unwrap();
  let copilot = BackendRuntimeConfig::from_server_config(None, &config).unwrap().copilot;
  assert!(!copilot.byok.enabled);
  assert!(copilot.byok.allow_custom_endpoint);
}

#[test]
fn search_config_keeps_disabled_state_separate_from_embedded_provider() {
  let disabled = app_config_from_flat_overrides([
    ("indexer.enabled", serde_json::json!(false)),
    ("indexer.provider.type", serde_json::json!("embedded")),
  ])
  .unwrap();
  let disabled: SearchRuntimeConfig = disabled.indexer.unwrap().into();
  assert!(!disabled.enabled);
  assert_eq!(disabled.provider, "embedded");

  let enabled = app_config_from_flat_overrides([
    ("indexer.enabled", serde_json::json!(true)),
    ("indexer.provider.type", serde_json::json!("elasticsearch")),
  ])
  .unwrap();
  let enabled: SearchRuntimeConfig = enabled.indexer.unwrap().into();
  assert!(enabled.enabled);
  assert_eq!(enabled.provider, "elasticsearch");

  let enabled_without_provider = app_config_from_module_json(serde_json::json!({
    "indexer": { "enabled": true }
  }))
  .unwrap();
  let enabled_without_provider: SearchRuntimeConfig = enabled_without_provider.indexer.unwrap().into();
  assert!(enabled_without_provider.enabled);
  assert_eq!(enabled_without_provider.provider, "embedded");

  let manticore = app_config_from_flat_overrides([
    ("indexer.enabled", serde_json::json!(true)),
    ("indexer.provider.type", serde_json::json!("manticoresearch")),
    ("indexer.provider.endpoint", serde_json::json!("http://localhost:9308")),
  ])
  .unwrap();
  let manticore: SearchRuntimeConfig = manticore.indexer.unwrap().into();
  assert!(manticore.enabled);
  assert_eq!(manticore.provider, "manticoresearch");
}

#[test]
fn partial_database_config_preserves_file_config_siblings() {
  let mut file_config = expand_module_config_paths(serde_json::json!({
    "copilot": {
      "enabled": true,
      "byok": { "enabled": true, "allowCustomEndpoint": true },
      "providers": {
        "profiles": [{
          "id": "managed-openai",
          "type": "openai",
          "models": ["gpt-5.6-luna"],
          "config": { "apiKey": "test" }
        }]
      }
    }
  }));
  let database_config = app_config_value_from_flat_overrides([("copilot.byok.enabled", serde_json::json!(false))]);

  merge_config_value(&mut file_config, database_config);
  let copilot: CopilotRuntimeConfig = deserialize_app_config(file_config)
    .unwrap()
    .copilot
    .unwrap()
    .try_into()
    .unwrap();

  assert!(copilot.enabled);
  assert!(!copilot.byok.enabled);
  assert!(copilot.byok.allow_custom_endpoint);
  assert_eq!(copilot.providers.profiles.len(), 1);
  assert_eq!(copilot.providers.profiles[0].id, "managed-openai");
}

#[test]
fn nested_database_config_overrides_are_order_independent() {
  let app_config = app_config_from_flat_overrides([
    ("copilot.byok.enabled", serde_json::json!(false)),
    (
      "copilot.byok",
      serde_json::json!({ "enabled": true, "allowCustomEndpoint": true }),
    ),
  ])
  .unwrap();
  let byok = CopilotRuntimeConfig::try_from(app_config.copilot.unwrap())
    .unwrap()
    .byok;

  assert!(!byok.enabled);
  assert!(byok.allow_custom_endpoint);
}

#[test]
fn database_config_only_replaces_an_active_private_key_explicitly() {
  let active = BackendRuntimeConfig {
    database_url: "postgresql://active".to_string(),
    auth: AuthRuntimeConfig::default(),
    invite_quota: InviteQuotaConfig::default(),
    private_key: Arc::new(Zeroizing::new("active-private-key".to_string())),
    deployment: Deployment::Cloud,
    copilot: CopilotRuntimeConfig::default(),
    search: SearchRuntimeConfig::default(),
    redis: RedisRuntimeConfig::default(),
    payment: PaymentRuntimeConfig::default(),
  };
  let empty = serde_json::Value::Object(Map::new());

  let unchanged = active.apply_db_overrides(empty.clone(), empty.clone()).unwrap();
  assert_eq!(unchanged.private_key.as_str(), "active-private-key");

  let overridden = active
    .apply_db_overrides(
      empty,
      app_config_value_from_flat_overrides([("crypto.privateKey", serde_json::json!("database-private-key"))]),
    )
    .unwrap();
  assert_eq!(overridden.private_key.as_str(), "database-private-key");
}

#[test]
fn invite_abuse_policy_is_internal_while_action_delay_is_configurable() {
  let app_config = app_config_from_flat_overrides([
    ("auth.newAccountActionDelay", serde_json::json!(123)),
    ("auth.untrustedPolicyOverride", serde_json::json!("runtime-salt-v2")),
    ("auth.untrustedDomainList", serde_json::json!(["Example.COM."])),
  ])
  .unwrap();

  let config = app_config.invite_quota_config();
  assert_eq!(config.new_account_action_delay_seconds, 123);
}
