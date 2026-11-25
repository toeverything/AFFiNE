//! Community BYOK GraphQL fail-closed contract and SPI injection E2E tests.

use std::sync::Arc;

use async_graphql::{Request, Value};
use chrono::{DateTime, Utc};
use server_db::{DbConfig, ServerDb};
use server_http::{
  AppState, RuntimeConfig,
  graphql::{AuthenticatedUser, AuthorizedWorkspaceUsage, build_schema},
};
use server_spi::{
  ByokCapabilityDto, ByokCatalogDto, ByokCatalogModelDto, ByokCatalogProviderDto, ByokEndpointDto, ByokLocalLeaseDto,
  ByokModelDeclarationDto, ByokPolicyDto, ByokProbeResultDto, ByokProbeStatusDto, ByokProfileDefinitionDto,
  ByokProfileDto, ByokSettingsDto, ByokSpi, ByokUsagePointDto, CommunityExtension, CreateByokLocalLeaseSpiInput,
  CreateByokProfileSpiInput, ProbeByokDraftSpiInput, ProbeByokProfileSpiInput, ReorderByokProfilesSpiInput,
  ReplaceByokProfileSpiInput, RotateByokCredentialSpiInput, ServerExtension,
};
use server_types::{DomainError, ServerRole};

struct StubByokSpi;

#[async_trait::async_trait]
impl ByokSpi for StubByokSpi {
  fn is_enabled(&self) -> bool {
    true
  }

  async fn get_settings(&self, _actor_user_id: &str, workspace_id: &str) -> Result<ByokSettingsDto, DomainError> {
    Ok(ByokSettingsDto {
      workspace_id: workspace_id.to_owned(),
      entitled: true,
      server_entitled: true,
      local_entitled: true,
      profiles: vec![],
      policy: ByokPolicyDto {
        enabled: true,
        allowed_providers: vec!["openai".to_owned()],
        custom_endpoint_mode: "disabled".to_owned(),
        private_endpoint_supported: false,
      },
      catalog: ByokCatalogDto {
        version: "test-v1".to_owned(),
        providers: vec![ByokCatalogProviderDto {
          provider: "openai".to_owned(),
          models: vec![ByokCatalogModelDto {
            model_id: "gpt-4o-mini".to_owned(),
            display_name: "GPT-4o mini".to_owned(),
            recommended: true,
            capabilities: vec![ByokCapabilityDto {
              input: vec!["text".to_owned()],
              output: vec!["text".to_owned()],
              features: vec![],
              attachment_kinds: vec![],
              attachment_sources: vec![],
            }],
          }],
        }],
      },
    })
  }

  async fn get_usage(
    &self,
    _actor_user_id: &str,
    _workspace_id: &str,
    from: DateTime<Utc>,
    _to: DateTime<Utc>,
  ) -> Result<Vec<ByokUsagePointDto>, DomainError> {
    Ok(vec![ByokUsagePointDto {
      date: from,
      feature_kind: "chat".to_owned(),
      total_tokens: 42,
    }])
  }

  async fn create_profile(&self, input: CreateByokProfileSpiInput) -> Result<ByokProfileDto, DomainError> {
    if input.description_omitted {
      return Err(DomainError::Validation(
        "description must be explicitly provided (string or null)".to_owned(),
      ));
    }
    Ok(ByokProfileDto {
      profile_id: "prof-1".to_owned(),
      workspace_id: input.workspace_id,
      provider: input.provider,
      name: input.name,
      description: input.description,
      definition: input.definition,
      enabled: input.enabled,
      sort_order: 0,
      revision: 1,
      validation: None,
    })
  }

  async fn replace_profile(&self, input: ReplaceByokProfileSpiInput) -> Result<ByokProfileDto, DomainError> {
    Ok(ByokProfileDto {
      profile_id: input.profile_id,
      workspace_id: input.workspace_id,
      provider: "openai".to_owned(),
      name: input.name,
      description: input.description,
      definition: input.definition,
      enabled: input.enabled,
      sort_order: 0,
      revision: input.expected_revision + 1,
      validation: None,
    })
  }

  async fn rotate_credential(&self, input: RotateByokCredentialSpiInput) -> Result<ByokProfileDto, DomainError> {
    Ok(ByokProfileDto {
      profile_id: input.profile_id,
      workspace_id: input.workspace_id,
      provider: "openai".to_owned(),
      name: "OpenAI".to_owned(),
      description: None,
      definition: ByokProfileDefinitionDto {
        endpoint: ByokEndpointDto {
          kind: "provider_default".to_owned(),
          url: None,
          dialect: None,
        },
        models: vec![ByokModelDeclarationDto {
          model_id: "gpt-4o-mini".to_owned(),
          enabled: true,
          capabilities: vec![ByokCapabilityDto {
            input: vec!["text".to_owned()],
            output: vec!["text".to_owned()],
            features: vec![],
            attachment_kinds: vec![],
            attachment_sources: vec![],
          }],
        }],
      },
      enabled: true,
      sort_order: 0,
      revision: input.expected_revision + 1,
      validation: None,
    })
  }

  async fn delete_profile(
    &self,
    _actor_user_id: &str,
    _workspace_id: &str,
    _profile_id: &str,
  ) -> Result<bool, DomainError> {
    Ok(true)
  }

  async fn reorder_profiles(&self, _input: ReorderByokProfilesSpiInput) -> Result<Vec<ByokProfileDto>, DomainError> {
    Ok(vec![])
  }

  async fn probe_profile(
    &self,
    _actor_user_id: &str,
    _input: ProbeByokProfileSpiInput,
  ) -> Result<ByokProbeResultDto, DomainError> {
    Ok(ByokProbeResultDto {
      definition_fingerprint: "fp-1".to_owned(),
      stale: false,
      connection: ByokProbeStatusDto {
        kind: "verified".to_owned(),
        tested_at_ms: Some(1_700_000_000_000),
        error_kind: None,
      },
      models: vec![],
    })
  }

  async fn probe_draft(
    &self,
    _actor_user_id: &str,
    _input: ProbeByokDraftSpiInput,
  ) -> Result<ByokProbeResultDto, DomainError> {
    Ok(ByokProbeResultDto {
      definition_fingerprint: "fp-draft".to_owned(),
      stale: false,
      connection: ByokProbeStatusDto {
        kind: "not_tested".to_owned(),
        tested_at_ms: None,
        error_kind: None,
      },
      models: vec![],
    })
  }

  async fn create_local_lease(&self, _input: CreateByokLocalLeaseSpiInput) -> Result<ByokLocalLeaseDto, DomainError> {
    Ok(ByokLocalLeaseDto {
      lease_id: "lease-1".to_owned(),
      expires_at: Utc::now(),
    })
  }
}

struct CustomByokExtension {
  base: CommunityExtension,
  byok: Arc<dyn ByokSpi>,
}

impl ServerExtension for CustomByokExtension {
  fn edition_name(&self) -> &'static str {
    "test-custom-byok"
  }
  fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
    self.base.quota_gate()
  }
  fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
    self.base.session_policy()
  }
  fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
    self.base.copilot_policy()
  }
  fn byok_spi(&self) -> Arc<dyn ByokSpi> {
    Arc::clone(&self.byok)
  }
}

#[test]
fn community_byok_fails_closed_and_custom_spi_wires_end_to_end() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("PG16 cluster");
  let migrations = test_db_harness::migrations::MigrationSet {
    migrations: vec![],
    digest: "byok_comm_000001".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure empty template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("tokio runtime");

  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: ServerRole::Graphql,
      selfhosted: true,
      max_connections: 2,
      statement_timeout_ms: 5_000,
      tier_permits: [4, 2, 2, 1],
    })
    .await
    .expect("connect test db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .expect("reset schema");
    db.ensure_schema_ready().await.expect("ensure schema ready");

    let user_id = "user-byok-comm-1";
    let ws_id = "ws-byok-comm-1";
    sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, 'Comm', 'comm@test.local', true, false)")
      .bind(user_id)
      .execute(db.pool())
      .await
      .expect("insert user");

    let comm_state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Graphql,
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let comm_schema = build_schema(comm_state);

    // 1. Anonymous BYOK mutation -> 401 AUTHENTICATION_REQUIRED (auth precedes throttle: 15x all 401, never 429).
    for _ in 0..15 {
      let anon = comm_schema
        .execute(Request::new(format!(
          r#"mutation {{
            createWorkspaceByokProfile(input: {{
              workspaceId: "{ws_id}",
              provider: openai,
              name: "Anon",
              description: null,
              credential: "sk-anon",
              enabled: true,
              definition: {{
                endpoint: {{ kind: provider_default }},
                models: [{{
                  modelId: "gpt-4o-mini",
                  enabled: true,
                  capabilities: [{{
                    input: [text],
                    output: [text],
                    features: [],
                    attachmentKinds: [],
                    attachmentSources: []
                  }}]
                }}]
              }}
            }}) {{ profileId }}
          }}"#
        )))
        .await;
      assert_eq!(anon.errors.len(), 1);
      assert_eq!(
        anon.errors[0].extensions.as_ref().unwrap().get("status"),
        Some(&Value::from(401))
      );
    }

    // 2. Authenticated Community BYOK settings, usage, and mutations -> 403 ACTION_FORBIDDEN ("Copilot is disabled.").
    let auth_req = |query: String| {
      Request::new(query)
        .data(AuthenticatedUser {
          user_id: user_id.to_owned(),
          user: None,
        })
        .data(AuthorizedWorkspaceUsage {
          workspace_id: ws_id.to_owned(),
          used_storage_quota: 0,
          member_count: 1,
        })
    };

    for q in [
      format!(r#"query {{ workspace(id: "{ws_id}") {{ byokSettings {{ entitled }} }} }}"#),
      format!(
        r#"query {{ workspace(id: "{ws_id}") {{ byokUsage(from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z") {{ totalTokens }} }} }}"#
      ),
      format!(r#"mutation {{ deleteWorkspaceByokProfile(workspaceId: "{ws_id}", profileId: "p1") }}"#),
    ] {
      let resp = comm_schema.execute(auth_req(q)).await;
      assert_eq!(resp.errors.len(), 1);
      let ext = resp.errors[0].extensions.as_ref().unwrap();
      assert_eq!(ext.get("status"), Some(&Value::from(403)));
      assert_eq!(ext.get("type"), Some(&Value::from("ACTION_FORBIDDEN")));
      assert_eq!(ext.get("message"), Some(&Value::from("Copilot is disabled.")));
    }

    // 3. Explicit description guard rejects omitted description before hitting SPI.
    sqlx::query(
      "INSERT INTO app_configs (id, value, last_updated_by, created_at, updated_at) \
       VALUES ('copilot.enabled', 'true'::jsonb, $1, clock_timestamp(), clock_timestamp()) \
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(user_id)
    .execute(db.pool())
    .await
    .expect("enable copilot for custom spi test");
    let custom_ext = Arc::new(CustomByokExtension {
      base: CommunityExtension::new(),
      byok: Arc::new(StubByokSpi),
    });
    let custom_state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Graphql,
        ..RuntimeConfig::default()
      },
      custom_ext,
    );
    let custom_app_config = custom_state.app_config.clone();
    let custom_schema = build_schema(custom_state);

    let missing_desc = custom_schema
      .execute(auth_req(format!(
        r#"mutation {{
          createWorkspaceByokProfile(input: {{
            workspaceId: "{ws_id}",
            provider: openai,
            name: "OpenAI",
            credential: "sk-test",
            enabled: true,
            definition: {{
              endpoint: {{ kind: provider_default }},
              models: [{{
                modelId: "gpt-4o-mini",
                enabled: true,
                capabilities: [{{
                  input: [text],
                  output: [text],
                  features: [],
                  attachmentKinds: [],
                  attachmentSources: []
                }}]
              }}]
            }}
          }}) {{ profileId }}
        }}"#
      )))
      .await;
    assert_eq!(missing_desc.errors.len(), 1);
    assert_eq!(
      missing_desc.errors[0].extensions.as_ref().unwrap().get("status"),
      Some(&Value::from(400))
    );

    // 4. Custom ByokSpi resolves settings, usage, and explicit null description mutation cleanly.
    let ok_settings = custom_schema
      .execute(auth_req(format!(
        r#"query {{
          workspace(id: "{ws_id}") {{
            byokSettings {{ workspaceId entitled serverEntitled localEntitled policy {{ enabled customEndpointMode }} catalog {{ version }} }}
            byokUsage(from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z") {{ featureKind totalTokens }}
          }}
        }}"#
      )))
      .await;
    assert!(ok_settings.errors.is_empty(), "errors: {:?}", ok_settings.errors);
    let data = serde_json::to_value(&ok_settings.data).unwrap();
    assert_eq!(data["workspace"]["byokSettings"]["entitled"], true);
    assert_eq!(data["workspace"]["byokSettings"]["catalog"]["version"], "test-v1");
    assert_eq!(data["workspace"]["byokUsage"][0]["totalTokens"], 42);

    let ok_create = custom_schema
      .execute(auth_req(format!(
        r#"mutation {{
          createWorkspaceByokProfile(input: {{
            workspaceId: "{ws_id}",
            provider: openai,
            name: "OpenAI",
            description: null,
            credential: "sk-test",
            enabled: true,
            definition: {{
              endpoint: {{ kind: provider_default }},
              models: [{{
                modelId: "gpt-4o-mini",
                enabled: true,
                capabilities: [{{
                  input: [text],
                  output: [text],
                  features: [],
                  attachmentKinds: [],
                  attachmentSources: []
                }}]
              }}]
            }}
          }}) {{ profileId revision }}
        }}"#
      )))
      .await;
    assert!(ok_create.errors.is_empty(), "errors: {:?}", ok_create.errors);
    let created = serde_json::to_value(&ok_create.data).unwrap();
    assert_eq!(created["createWorkspaceByokProfile"]["profileId"], "prof-1");
    assert_eq!(created["createWorkspaceByokProfile"]["revision"], 1);

    // 5. Dynamic app_configs copilot.enabled = false blocks BYOK even when custom ByokSpi is enabled.
    sqlx::query(
      "INSERT INTO app_configs (id, value, last_updated_by, created_at, updated_at) \
       VALUES ('copilot.enabled', 'false'::jsonb, $1, clock_timestamp(), clock_timestamp()) \
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(user_id)
    .execute(db.pool())
    .await
    .expect("disable copilot dynamically");
    custom_app_config
      .refresh_effective_app_config()
      .await
      .expect("refresh app config");
    for q in [
      format!(r#"query {{ workspace(id: "{ws_id}") {{ byokSettings {{ entitled }} }} }}"#),
      format!(r#"mutation {{ deleteWorkspaceByokProfile(workspaceId: "{ws_id}", profileId: "prof-1") }}"#),
    ] {
      let disabled = custom_schema.execute(auth_req(q)).await;
      assert_eq!(disabled.errors.len(), 1);
      let ext = disabled.errors[0].extensions.as_ref().unwrap();
      assert_eq!(ext.get("status"), Some(&Value::from(403)));
      assert_eq!(ext.get("message"), Some(&Value::from("Copilot is disabled.")));
    }

    db.pool().close().await;
  });
}
