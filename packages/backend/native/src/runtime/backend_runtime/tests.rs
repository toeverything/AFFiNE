use anyhow::{Context, Result as AnyResult, anyhow};
use sqlx::postgres::PgPoolOptions;

use super::{
  super::migrations::{RUNTIME_MIGRATIONS, migrate_runtime_tables},
  *,
};

pub(super) fn pg_test_lock() -> &'static tokio::sync::Mutex<()> {
  &crate::runtime::migrations::DATABASE_TEST_LOCK
}

#[test]
fn migrations_include_runtime_tables_without_worker_heartbeats() {
  assert!(RUNTIME_MIGRATIONS.contains("runtime_states"));
  assert!(RUNTIME_MIGRATIONS.contains("runtime_gates"));
  assert!(RUNTIME_MIGRATIONS.contains("runtime_leases"));
  assert!(RUNTIME_MIGRATIONS.contains("storage_reconciliation_runs"));
  assert!(RUNTIME_MIGRATIONS.contains("storage_reconciliation_checkpoints"));
  assert!(RUNTIME_MIGRATIONS.contains("document_cleanup_candidates"));
  assert!(RUNTIME_MIGRATIONS.contains("doc_blob_refs"));
  assert!(RUNTIME_MIGRATIONS.contains("doc_blob_ref_projections"));
  assert!(RUNTIME_MIGRATIONS.contains("blob_cleanup_candidates"));
  assert!(!RUNTIME_MIGRATIONS.contains("runtime_worker_heartbeats"));
}

#[tokio::test]
async fn migrations_enable_embedding_service_and_health_together() -> AnyResult<()> {
  let _guard = pg_test_lock().lock().await;
  let Some(mut runtime) = runtime_from_database_url().await? else {
    return Ok(());
  };
  runtime.role = ServerRole::Frontend;

  runtime
    .run_migrations()
    .await
    .map_err(|error| anyhow!(error.to_string()))?;

  let health = runtime
    .embedding_health()
    .await
    .map_err(|error| anyhow!(error.to_string()))?;
  assert!(health.enabled);
  assert!(runtime.embedding.lock().await.is_some());
  runtime.stop().await.map_err(|error| anyhow!(error.to_string()))?;
  Ok(())
}

#[tokio::test]
async fn failed_start_rolls_back_resources_and_can_restart() -> AnyResult<()> {
  let _guard = pg_test_lock().lock().await;
  let Some(mut runtime) = runtime_from_database_url().await? else {
    return Ok(());
  };
  if let Some(pool) = runtime.pool.lock().await.take() {
    pool.close().await;
  }
  runtime.role = ServerRole::Frontend;
  {
    let mut config = runtime.config.write().unwrap();
    let current = config.as_ref();
    *config = Arc::new(BackendRuntimeConfig {
      database_url: current.database_url.clone(),
      auth: current.auth.clone(),
      invite_quota: current.invite_quota.clone(),
      private_key: Arc::clone(&current.private_key),
      deployment: crate::runtime::Deployment::SelfHosted,
      copilot: current.copilot.clone(),
      search: crate::runtime::config::SearchRuntimeConfig {
        enabled: true,
        provider: "embedded".to_string(),
        ..Default::default()
      },
      redis: current.redis.clone(),
      payment: current.payment.clone(),
    });
  }

  let error = runtime.start_inner().await.unwrap_err();
  assert!(error.to_string().contains("embedded search is only available"));
  assert!(runtime.pool.lock().await.is_none());
  assert!(runtime.blob_access.lock().await.is_none());
  assert!(runtime.quota_read_cache.lock().await.is_none());
  assert!(runtime.invalidation.lock().await.is_none());
  assert!(runtime.search.lock().await.is_none());
  assert!(runtime.embedding.lock().await.is_none());
  assert!(runtime.embedding_worker.lock().await.is_none());

  {
    let mut config = runtime.config.write().unwrap();
    let current = config.as_ref();
    *config = Arc::new(BackendRuntimeConfig {
      database_url: current.database_url.clone(),
      auth: current.auth.clone(),
      invite_quota: current.invite_quota.clone(),
      private_key: Arc::clone(&current.private_key),
      deployment: current.deployment,
      copilot: current.copilot.clone(),
      search: Default::default(),
      redis: current.redis.clone(),
      payment: current.payment.clone(),
    });
  }
  runtime.role = ServerRole::AllInOne;
  runtime
    .start_inner()
    .await
    .map_err(|error| anyhow!(error.to_string()))?;
  assert!(
    runtime
      .health()
      .await
      .map_err(|error| anyhow!(error.to_string()))?
      .started
  );
  assert!(runtime.license_health_worker.lock().await.is_some());
  runtime.stop().await.map_err(|error| anyhow!(error.to_string()))?;
  assert!(runtime.license_health_worker.lock().await.is_none());
  Ok(())
}

#[tokio::test]
async fn failed_config_reload_keeps_active_resources() -> AnyResult<()> {
  let _guard = pg_test_lock().lock().await;
  let Some(mut runtime) = runtime_from_database_url().await? else {
    return Ok(());
  };
  runtime.role = ServerRole::Frontend;
  let config_path = std::env::temp_dir().join(format!("affine-runtime-config-{}.json", uuid::Uuid::new_v4()));
  std::fs::write(&config_path, r#"{"indexer":{"enabled":true,"provider":"embedded"}}"#)?;
  runtime.config_source = ConfigSource::new(Some(vec![config_path.to_string_lossy().into_owned()]));
  let active_config = runtime.config()?;
  let active_storage = runtime.object_storage()?;

  let result = runtime.reload_config(None, None, None).await;
  std::fs::remove_file(config_path)?;

  assert!(result.is_err());
  assert!(Arc::ptr_eq(&active_config, &runtime.config()?));
  assert!(Arc::ptr_eq(&active_storage, &runtime.object_storage()?));
  assert!(runtime.search.lock().await.is_none());
  runtime.stop().await.map_err(|error| anyhow!(error.to_string()))?;
  Ok(())
}

pub(super) async fn runtime_from_database_url() -> AnyResult<Option<BackendRuntime>> {
  let Ok(database_url) = std::env::var("DATABASE_URL") else {
    return Ok(None);
  };
  let pool = PgPoolOptions::new()
    .max_connections(5)
    .connect(&database_url)
    .await
    .context("connect postgres for backend runtime tests")?;
  migrate_runtime_tables(&pool)
    .await
    .map_err(|err| anyhow!(err.to_string()))?;
  sqlx::query(
    r#"
    DELETE FROM runtime_states
    WHERE purpose LIKE 'rust_test:%'
       OR purpose LIKE 'auth_challenge:rust_test:%'
       OR purpose = 'verification_token:99999'
    "#,
  )
  .execute(&pool)
  .await
  .context("cleanup runtime_states for backend runtime tests")?;
  sqlx::query("DELETE FROM runtime_gates WHERE key LIKE 'rust-test:%'")
    .execute(&pool)
    .await
    .context("cleanup runtime_gates for backend runtime tests")?;
  sqlx::query("DELETE FROM runtime_rolling_quota_reservations WHERE request_id LIKE 'rust-test:%'")
    .execute(&pool)
    .await
    .context("cleanup rolling quota reservations for backend runtime tests")?;
  sqlx::query("DELETE FROM runtime_rolling_quota_counters WHERE scope_key LIKE 'invite:%rust-test%'")
    .execute(&pool)
    .await
    .context("cleanup rolling quota counters for backend runtime tests")?;
  let abuse_subject_keys: Vec<String> = sqlx::query_scalar(
    "SELECT DISTINCT subject_key FROM runtime_invite_abuse_evidence WHERE user_id LIKE 'rust-test:%' OR workspace_id \
     LIKE 'rust-test:%'",
  )
  .fetch_all(&pool)
  .await
  .context("locate invite abuse subjects for backend runtime tests")?;
  sqlx::query(
    "DELETE FROM runtime_invite_abuse_actions WHERE subject_key LIKE 'rust-test:%' OR evidence_id IN (SELECT id FROM \
     runtime_invite_abuse_evidence WHERE user_id LIKE 'rust-test:%' OR workspace_id LIKE 'rust-test:%')",
  )
  .execute(&pool)
  .await
  .context("cleanup invite abuse actions for backend runtime tests")?;
  sqlx::query(
    "DELETE FROM runtime_invite_abuse_evidence WHERE subject_key LIKE 'rust-test:%' OR user_id LIKE 'rust-test:%' OR \
     workspace_id LIKE 'rust-test:%'",
  )
  .execute(&pool)
  .await
  .context("cleanup invite abuse evidence for backend runtime tests")?;
  sqlx::query(
    "DELETE FROM runtime_invite_abuse_subjects WHERE subject_key LIKE 'rust-test:%' OR user_id LIKE 'rust-test:%' OR \
     subject_key=ANY($1)",
  )
  .bind(&abuse_subject_keys)
  .execute(&pool)
  .await
  .context("cleanup invite abuse subjects for backend runtime tests")?;

  Ok(Some(BackendRuntime {
    config_source: Default::default(),
    inline_config: Arc::new(RwLock::new(None)),
    role: ServerRole::AllInOne,
    script_mode: false,
    config: Arc::new(RwLock::new(Arc::new(BackendRuntimeConfig {
      database_url,
      auth: Default::default(),
      invite_quota: Default::default(),
      private_key: Arc::new(zeroize::Zeroizing::new("test-private-key".to_string())),
      deployment: crate::runtime::Deployment::Cloud,
      copilot: Default::default(),
      search: Default::default(),
      redis: Default::default(),
      payment: Default::default(),
    }))),
    config_reload: Arc::new(Mutex::new(())),
    pool: Arc::new(Mutex::new(Some(pool))),
    embedding_health: Arc::new(RwLock::new(super::EmbeddingHealth::disabled("test", None))),
    object_storage: Arc::new(RwLock::new(Arc::new(
      crate::runtime::object_storage::ObjectStorageService::from_config_files()?,
    ))),
    embedding: Arc::new(Mutex::new(None)),
    embedding_worker: Arc::new(Mutex::new(None)),
    search: Arc::new(Mutex::new(None)),
    managed_token_providers: Arc::new(Default::default()),
    permission_telemetry: Default::default(),
    invalidation_events: Default::default(),
    blob_access: Arc::new(Mutex::new(None)),
    invalidation: Arc::new(Mutex::new(None)),
    quota_read_cache: Arc::new(Mutex::new(None)),
    payment: Arc::new(Mutex::new(None)),
    license_health_worker: Arc::new(Mutex::new(None)),
  }))
}

async fn insert_invite_quota_fixture(
  runtime: &BackendRuntime,
  suffix: &str,
  stale: bool,
) -> AnyResult<(String, String)> {
  let pool = runtime.pool().await.map_err(|err| anyhow!(err.to_string()))?;
  let user_id = format!("rust-test:quota:user:{suffix}");
  let workspace_id = format!("rust-test:quota:workspace:{suffix}");
  let email = format!("rust-test-quota-{suffix}-{}@example.com", uuid::Uuid::new_v4());

  sqlx::query("DELETE FROM effective_workspace_quota_states WHERE workspace_id = $1")
    .bind(&workspace_id)
    .execute(&pool)
    .await?;
  sqlx::query("DELETE FROM entitlements WHERE target_type='workspace' AND target_id=$1")
    .bind(&workspace_id)
    .execute(&pool)
    .await?;
  sqlx::query("DELETE FROM workspaces WHERE id = $1")
    .bind(&workspace_id)
    .execute(&pool)
    .await?;
  sqlx::query("DELETE FROM users WHERE id = $1")
    .bind(&user_id)
    .execute(&pool)
    .await?;
  sqlx::query(
    r#"
    INSERT INTO users (id, name, email, registered, email_verified, disabled, created_at)
    VALUES ($1, 'Rust Quota Actor', $2, true, clock_timestamp(), false, clock_timestamp() - interval '60 days')
    "#,
  )
  .bind(&user_id)
  .bind(email)
  .execute(&pool)
  .await?;
  sqlx::query("INSERT INTO workspaces (id, created_at) VALUES ($1, clock_timestamp() - interval '60 days')")
    .bind(&workspace_id)
    .execute(&pool)
    .await?;
  sqlx::query(
    "INSERT INTO workspace_members (id,workspace_id,user_id,role,state,created_at,updated_at) VALUES \
     ($1,$2,$3,'owner','active',now(),now())",
  )
  .bind(format!("rust-test:quota:member:{suffix}"))
  .bind(&workspace_id)
  .bind(&user_id)
  .execute(&pool)
  .await?;
  sqlx::query(
    "INSERT INTO entitlements (id,target_type,target_id,source,plan,status,quantity) VALUES \
     ($1,'workspace',$2,'cloud_subscription','team','active',10)",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&workspace_id)
  .execute(&pool)
  .await?;
  sqlx::query(
    r#"
    INSERT INTO effective_workspace_quota_states (
      workspace_id,
      plan,
      owner_user_id,
      uses_owner_quota,
      seat_limit,
      member_count,
      overcapacity_member_count,
      blob_limit,
      storage_quota,
      used_storage_quota,
      history_period_seconds,
      readonly,
      readonly_reasons,
      flags,
      known,
      stale,
      last_reconciled_at,
      stale_after
    )
    VALUES ($1, 'paid_team', $2, false, 10, 3, 0, 1, 1, 0, 1, false, ARRAY[]::TEXT[], '{}'::jsonb, true, $3, clock_timestamp(), clock_timestamp() + interval '1 day')
    "#,
  )
  .bind(&workspace_id)
  .bind(&user_id)
  .bind(stale)
  .execute(&pool)
  .await?;

  Ok((user_id, workspace_id))
}

fn invite_quota_input(
  user_id: &str,
  workspace_id: &str,
  request_id: &str,
  count: i32,
) -> types::RuntimeWorkspaceInviteQuotaInput {
  types::RuntimeWorkspaceInviteQuotaInput {
    actor_user_id: user_id.to_string(),
    workspace_id: workspace_id.to_string(),
    request_id: Some(request_id.to_string()),
    target_count: count,
    target_domains: vec![types::RuntimeQuotaTargetDomainInput {
      domain: "example.com".to_string(),
      count,
    }],
    source: None,
  }
}

#[tokio::test]
async fn runtime_gate_sql_semantics_are_atomic_and_ttl_bound() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };

  struct Case {
    key: &'static str,
    first_ttl_ms: i64,
    wait_ms: Option<u64>,
    second_expected: bool,
  }

  for case in [
    Case {
      key: "rust-test:gate:same-key",
      first_ttl_ms: 30_000,
      wait_ms: None,
      second_expected: false,
    },
    Case {
      key: "rust-test:gate:expired-key",
      first_ttl_ms: 1,
      wait_ms: Some(20),
      second_expected: true,
    },
  ] {
    assert!(
      runtime
        .put_runtime_gate_if_absent(case.key.to_string(), case.first_ttl_ms)
        .await
        .unwrap()
    );
    if let Some(wait_ms) = case.wait_ms {
      tokio::time::sleep(Duration::from_millis(wait_ms)).await;
    }
    assert_eq!(
      runtime
        .put_runtime_gate_if_absent(case.key.to_string(), 30_000)
        .await
        .unwrap(),
      case.second_expected,
      "{}",
      case.key
    );
  }

  let mut tasks = Vec::new();
  for _ in 0..16 {
    let runtime = BackendRuntime {
      config_source: Default::default(),
      inline_config: Arc::new(RwLock::new(None)),
      role: ServerRole::AllInOne,
      script_mode: false,
      config: Arc::new(RwLock::new(runtime.config().unwrap())),
      config_reload: Arc::new(Mutex::new(())),
      pool: Arc::new(Mutex::new(Some(runtime.pool().await.unwrap()))),
      embedding_health: Arc::new(RwLock::new(super::EmbeddingHealth::disabled("test", None))),
      object_storage: Arc::new(RwLock::new(runtime.object_storage().unwrap())),
      embedding: Arc::new(Mutex::new(None)),
      embedding_worker: Arc::new(Mutex::new(None)),
      search: Arc::new(Mutex::new(None)),
      managed_token_providers: Arc::new(Default::default()),
      permission_telemetry: Default::default(),
      invalidation_events: Default::default(),
      blob_access: Arc::new(Mutex::new(None)),
      invalidation: Arc::new(Mutex::new(None)),
      quota_read_cache: Arc::new(Mutex::new(None)),
      payment: Arc::new(Mutex::new(None)),
      license_health_worker: Arc::new(Mutex::new(None)),
    };
    tasks.push(tokio::spawn(async move {
      runtime
        .put_runtime_gate_if_absent("rust-test:gate:concurrent".to_string(), 30_000)
        .await
        .unwrap()
    }));
  }
  let mut successful = 0;
  for task in tasks {
    if task.await.unwrap() {
      successful += 1;
    }
  }
  assert_eq!(successful, 1);

  assert!(
    runtime
      .put_runtime_gate_if_absent("rust-test:gate:cleanup".to_string(), 1)
      .await
      .unwrap()
  );
  tokio::time::sleep(Duration::from_millis(20)).await;
  assert_eq!(runtime.cleanup_expired_runtime_gates(100).await.unwrap(), 1);
  assert_eq!(runtime.cleanup_expired_runtime_gates(100).await.unwrap(), 0);
}

#[tokio::test]
async fn rolling_quota_sql_state_machine_commits_releases_and_expires() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let (user_id, workspace_id) = insert_invite_quota_fixture(&runtime, "state-machine", false)
    .await
    .unwrap();
  let pool = runtime.pool().await.unwrap();
  let malformed_key = format!("actor_email_sha256:v1:{}", "b".repeat(64));
  sqlx::query("DELETE FROM runtime_invite_abuse_subjects WHERE subject_key=$1")
    .bind(&malformed_key)
    .execute(&pool)
    .await
    .unwrap();

  let decision = runtime
    .assert_workspace_invite_quota_v1(invite_quota_input(&user_id, &workspace_id, "rust-test:quota:commit", 2))
    .await
    .unwrap();
  assert!(
    decision.allowed,
    "reason={:?} scope={:?} current={:?} limit={:?}",
    decision.reason, decision.scope_key, decision.current, decision.limit
  );
  let reservation_id = decision.reservation_id.unwrap();
  assert!(
    runtime
      .commit_workspace_invite_quota_v1(
        reservation_id,
        types::RuntimeWorkspaceInviteQuotaUsage {
          target_count: 1,
          target_domains: vec![types::RuntimeQuotaTargetDomainInput {
            domain: "example.com".to_string(),
            count: 1,
          }],
        },
      )
      .await
      .unwrap()
  );
  let committed: i64 = sqlx::query_scalar(
    r#"
    SELECT COALESCE(SUM(count), 0)::bigint
    FROM runtime_rolling_quota_counters
    WHERE scope_key = $1
    "#,
  )
  .bind(format!("invite:user_domain:{user_id}:example.com"))
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(committed, 1);

  let inconsistent = runtime
    .assert_workspace_invite_quota_v1(invite_quota_input(
      &user_id,
      &workspace_id,
      "rust-test:quota:inconsistent-commit",
      1,
    ))
    .await
    .unwrap()
    .reservation_id
    .unwrap();
  assert!(
    runtime
      .commit_workspace_invite_quota_v1(
        inconsistent.clone(),
        types::RuntimeWorkspaceInviteQuotaUsage {
          target_count: 1,
          target_domains: Vec::new(),
        },
      )
      .await
      .is_err()
  );
  let status: String =
    sqlx::query_scalar("SELECT status FROM runtime_rolling_quota_reservations WHERE id=$1::uuid LIMIT 1")
      .bind(&inconsistent)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(status, "reserved");
  assert!(runtime.release_workspace_invite_quota_v1(inconsistent).await.unwrap());

  let unknown_scope = runtime
    .assert_workspace_invite_quota_v1(invite_quota_input(
      &user_id,
      &workspace_id,
      "rust-test:quota:unknown-scope-commit",
      1,
    ))
    .await
    .unwrap()
    .reservation_id
    .unwrap();
  sqlx::query(
    r#"UPDATE runtime_rolling_quota_reservations
       SET scope_key = 'invite:future_v2:foo'
       WHERE ctid = (
         SELECT ctid FROM runtime_rolling_quota_reservations
         WHERE id = $1::uuid LIMIT 1
       )"#,
  )
  .bind(&unknown_scope)
  .execute(&pool)
  .await
  .unwrap();
  assert!(
    runtime
      .commit_workspace_invite_quota_v1(
        unknown_scope.clone(),
        types::RuntimeWorkspaceInviteQuotaUsage {
          target_count: 1,
          target_domains: vec![types::RuntimeQuotaTargetDomainInput {
            domain: "example.com".to_string(),
            count: 1,
          }],
        },
      )
      .await
      .is_err()
  );
  let status: String =
    sqlx::query_scalar("SELECT status FROM runtime_rolling_quota_reservations WHERE id=$1::uuid LIMIT 1")
      .bind(&unknown_scope)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(status, "reserved");
  assert!(runtime.release_workspace_invite_quota_v1(unknown_scope).await.unwrap());

  let mut forward = invite_quota_input(&user_id, &workspace_id, "rust-test:quota:ordered-locks-a", 2);
  forward.target_domains = vec![
    types::RuntimeQuotaTargetDomainInput {
      domain: "a.example".to_string(),
      count: 1,
    },
    types::RuntimeQuotaTargetDomainInput {
      domain: "b.example".to_string(),
      count: 1,
    },
  ];
  let mut reverse = invite_quota_input(&user_id, &workspace_id, "rust-test:quota:ordered-locks-b", 2);
  reverse.target_domains = vec![
    types::RuntimeQuotaTargetDomainInput {
      domain: "b.example".to_string(),
      count: 1,
    },
    types::RuntimeQuotaTargetDomainInput {
      domain: "a.example".to_string(),
      count: 1,
    },
  ];
  let forward_id = runtime
    .assert_workspace_invite_quota_v1(forward)
    .await
    .unwrap()
    .reservation_id
    .unwrap();
  let reverse_id = runtime
    .assert_workspace_invite_quota_v1(reverse)
    .await
    .unwrap()
    .reservation_id
    .unwrap();
  let forward_usage = types::RuntimeWorkspaceInviteQuotaUsage {
    target_count: 2,
    target_domains: vec![
      types::RuntimeQuotaTargetDomainInput {
        domain: "a.example".to_string(),
        count: 1,
      },
      types::RuntimeQuotaTargetDomainInput {
        domain: "b.example".to_string(),
        count: 1,
      },
    ],
  };
  let reverse_usage = types::RuntimeWorkspaceInviteQuotaUsage {
    target_count: 2,
    target_domains: vec![
      types::RuntimeQuotaTargetDomainInput {
        domain: "b.example".to_string(),
        count: 1,
      },
      types::RuntimeQuotaTargetDomainInput {
        domain: "a.example".to_string(),
        count: 1,
      },
    ],
  };
  let (forward_commit, reverse_commit) = tokio::join!(
    runtime.commit_workspace_invite_quota_v1(forward_id, forward_usage),
    runtime.commit_workspace_invite_quota_v1(reverse_id, reverse_usage),
  );
  assert!(forward_commit.unwrap());
  assert!(reverse_commit.unwrap());

  let decision = runtime
    .assert_workspace_invite_quota_v1(invite_quota_input(
      &user_id,
      &workspace_id,
      "rust-test:quota:release",
      1,
    ))
    .await
    .unwrap();
  let reservation_id = decision.reservation_id.unwrap();
  assert!(
    runtime
      .release_workspace_invite_quota_v1(reservation_id.clone())
      .await
      .unwrap()
  );
  let released: String =
    sqlx::query_scalar("SELECT status FROM runtime_rolling_quota_reservations WHERE id = $1::uuid LIMIT 1")
      .bind(&reservation_id)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(released, "released");

  let decision = runtime
    .assert_workspace_invite_quota_v1(invite_quota_input(&user_id, &workspace_id, "rust-test:quota:expire", 1))
    .await
    .unwrap();
  let reservation_id = decision.reservation_id.unwrap();
  sqlx::query(
    "UPDATE runtime_rolling_quota_reservations SET expires_at = clock_timestamp() - interval '1 second' WHERE id = \
     $1::uuid",
  )
  .bind(&reservation_id)
  .execute(&pool)
  .await
  .unwrap();
  assert!(runtime.cleanup_expired_rolling_quota(100).await.unwrap() > 0);
  let expired: String =
    sqlx::query_scalar("SELECT status FROM runtime_rolling_quota_reservations WHERE id = $1::uuid LIMIT 1")
      .bind(&reservation_id)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(expired, "expired");

  let mut abuse_input = invite_quota_input(&user_id, &workspace_id, "rust-test:quota:abuse", 12);
  abuse_input.target_domains = vec![types::RuntimeQuotaTargetDomainInput {
    domain: "QQ.com.".to_string(),
    count: 12,
  }];
  abuse_input.source = Some(types::RuntimeQuotaSourceInput {
    trusted: true,
    ip: Some("192.168.12.34".to_string()),
    country: Some("US".to_string()),
    asn: Some(13335),
    ray_id: Some("rust-test-ray".to_string()),
  });
  let abuse = runtime.assert_workspace_invite_quota_v1(abuse_input).await.unwrap();
  assert!(!abuse.allowed);
  let reason = abuse.reason.unwrap();
  let action_required = abuse.action_required.unwrap();

  let subject: (String, String, Option<String>) =
    sqlx::query_as("SELECT subject_key,status,action FROM runtime_invite_abuse_subjects WHERE subject_key=$1")
      .bind(&action_required.subject_key)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(subject.0, action_required.subject_key);
  assert_eq!(subject.1, "quarantined");
  assert_eq!(subject.2.as_deref(), Some(action_required.action.as_str()));

  let evidence: (String, String) =
    sqlx::query_as("SELECT decision,reason FROM runtime_invite_abuse_evidence WHERE id=$1::bigint")
      .bind(&action_required.evidence_id)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(evidence, (action_required.action.clone(), reason));
  let action: (String, String) =
    sqlx::query_as("SELECT action,status FROM runtime_invite_abuse_actions WHERE id=$1::bigint")
      .bind(&action_required.action_id)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(action, (action_required.action, "pending".to_string()));

  sqlx::query(
    r#"INSERT INTO runtime_invite_abuse_subjects (
         subject_key,kind,status,user_id,actor_email_hash,email_domain,
         action,action_reason,first_seen_at,last_seen_at
       ) VALUES ($1,'future_kind','quarantined',$2,$1,'example.com',
         'quarantine_actor','high_risk_domain_burst',now(),now())"#,
  )
  .bind(&malformed_key)
  .bind(&user_id)
  .execute(&pool)
  .await
  .unwrap();
  let denied = runtime
    .assert_workspace_invite_quota_v1(invite_quota_input(
      &user_id,
      &workspace_id,
      "rust-test:quota:malformed-persisted-row",
      1,
    ))
    .await
    .unwrap();
  assert!(!denied.allowed);
  assert_eq!(denied.reason.as_deref(), Some("policy_state_invalid"));
  sqlx::query("DELETE FROM runtime_invite_abuse_subjects WHERE subject_key=$1")
    .bind(&malformed_key)
    .execute(&pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn rolling_quota_ignores_stale_effective_projection() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let (user_id, workspace_id) = insert_invite_quota_fixture(&runtime, "stale-projection", true)
    .await
    .unwrap();

  let decision = runtime
    .assert_workspace_invite_quota_v1(invite_quota_input(&user_id, &workspace_id, "rust-test:quota:stale", 1))
    .await
    .unwrap();

  assert!(
    decision.allowed,
    "reason={:?} scope={:?} current={:?} limit={:?}",
    decision.reason, decision.scope_key, decision.current, decision.limit
  );
  assert!(decision.reservation_id.is_some());
}

#[tokio::test]
async fn strict_storage_reservation_serializes_last_bytes_and_recovers_ledger_rows() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let pool = runtime.pool().await.unwrap();
  let temp = tempfile::tempdir().unwrap();
  runtime
    .configure_object_storage(format!(
      r#"{{"storages":{{"blob.storage":{{"provider":"fs","bucket":"strict-storage","config":{{"path":{}}}}}}}}}"#,
      serde_json::to_string(temp.path()).unwrap()
    ))
    .unwrap();
  let user_id = "rust-test:strict-storage:user";
  let workspace_id = "rust-test:strict-storage:workspace";
  sqlx::query("DELETE FROM workspaces WHERE id=$1")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=$1")
    .bind(user_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO users (id,name,email,created_at) VALUES ($1,'Strict Storage',$2,now())")
    .bind(user_id)
    .bind("rust-test-strict-storage@example.com")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspaces (id,created_at) VALUES ($1,now())")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO workspace_members (id,workspace_id,user_id,role,state,created_at,updated_at) VALUES \
     ($1,$2,$3,'owner','active',now(),now())",
  )
  .bind("rust-test:strict-storage:member")
  .bind(workspace_id)
  .bind(user_id)
  .execute(&pool)
  .await
  .unwrap();
  *runtime.quota_read_cache.lock().await = Some(Arc::new(super::quota_read_cache::QuotaReadCache::new(
    pool.clone(),
    crate::runtime::Deployment::Cloud,
    Default::default(),
  )));
  let limits = runtime
    .get_workspace_quota_state_v1(workspace_id.to_string())
    .await
    .unwrap();
  let oversized = runtime
    .reserve_storage_quota_v1(types::RuntimeStorageReservationInput {
      workspace_id: workspace_id.to_string(),
      user_id: user_id.to_string(),
      key: "oversized".to_string(),
      size: limits.blob_limit + 1,
      mime: "application/octet-stream".to_string(),
      kind: "blob".to_string(),
      doc_id: None,
      name: None,
      upload_id: None,
    })
    .await
    .unwrap();
  assert!(!oversized.allowed);
  assert_eq!(oversized.reason.as_deref(), Some("blob_limit"));
  assert_eq!(oversized.limit, Some(limits.blob_limit));

  for index in 0..3 {
    sqlx::query(
      "INSERT INTO workspace_invitations \
       (id,workspace_id,normalized_email,inviter_user_id,status,kind,created_at,updated_at) VALUES \
       ($1,$2,$3,$4,'pending','email',now(),now())",
    )
    .bind(format!("rust-test:strict-storage:readonly:{index}"))
    .bind(workspace_id)
    .bind(format!("strict-storage-readonly-{index}@example.com"))
    .bind(user_id)
    .execute(&pool)
    .await
    .unwrap();
  }
  let readonly = runtime
    .reserve_storage_quota_v1(types::RuntimeStorageReservationInput {
      workspace_id: workspace_id.to_string(),
      user_id: user_id.to_string(),
      key: "member-overflow".to_string(),
      size: 1,
      mime: "application/octet-stream".to_string(),
      kind: "blob".to_string(),
      doc_id: None,
      name: None,
      upload_id: None,
    })
    .await
    .unwrap();
  assert!(!readonly.allowed);
  assert_eq!(readonly.reason.as_deref(), Some("storage_limit"));
  assert!(
    !sqlx::query_scalar::<_, bool>(
      "SELECT EXISTS(SELECT 1 FROM blobs WHERE workspace_id=$1 AND key='member-overflow')",
    )
    .bind(workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap()
  );
  sqlx::query("DELETE FROM workspace_invitations WHERE workspace_id=$1")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();

  let pending_input = |mime: &str| types::RuntimeStorageReservationInput {
    workspace_id: workspace_id.to_string(),
    user_id: user_id.to_string(),
    key: "pending-resume".to_string(),
    size: 4,
    mime: mime.to_string(),
    kind: "blob".to_string(),
    doc_id: None,
    name: None,
    upload_id: None,
  };
  let pending = runtime
    .reserve_storage_quota_v1(pending_input("text/plain"))
    .await
    .unwrap();
  let resumed = runtime
    .reserve_storage_quota_v1(pending_input("text/plain"))
    .await
    .unwrap();
  assert_eq!(resumed.reservation_id, pending.reservation_id);
  let mismatch = match runtime
    .reserve_storage_quota_v1(pending_input("application/octet-stream"))
    .await
  {
    Ok(_) => panic!("a live reservation must reject a MIME change"),
    Err(error) => error,
  };
  assert!(mismatch.to_string().contains("blob mime mismatch"));
  assert_eq!(
    sqlx::query_as::<_, (String, String)>(
      "SELECT status::text,mime FROM blobs WHERE workspace_id=$1 AND key='pending-resume'",
    )
    .bind(workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap(),
    ("pending".to_string(), "text/plain".to_string())
  );
  assert!(
    runtime
      .abort_storage_reservation_v1(types::RuntimeStorageReservationMutation {
        workspace_id: workspace_id.to_string(),
        user_id: user_id.to_string(),
        key: "pending-resume".to_string(),
        reservation_id: pending.reservation_id.unwrap(),
        kind: "blob".to_string(),
        doc_id: None,
        size: None,
        mime: None,
      })
      .await
      .unwrap()
  );

  let quota = limits.storage_quota;
  let chunk = i32::MAX;
  let mut remaining = quota - 1_000;
  let mut index = 0;
  while remaining > 0 {
    let size = remaining.min(i64::from(chunk)) as i32;
    sqlx::query(
      "INSERT INTO blobs (workspace_id,key,size,mime,status) VALUES ($1,$2,$3,'application/octet-stream','completed')",
    )
    .bind(workspace_id)
    .bind(format!("existing-{index}"))
    .bind(size)
    .execute(&pool)
    .await
    .unwrap();
    remaining -= i64::from(size);
    index += 1;
  }
  let input = |key: &str| types::RuntimeStorageReservationInput {
    workspace_id: workspace_id.to_string(),
    user_id: user_id.to_string(),
    key: key.to_string(),
    size: 800,
    mime: "application/octet-stream".to_string(),
    kind: "blob".to_string(),
    doc_id: None,
    name: None,
    upload_id: None,
  };
  let (first, second) = tokio::join!(
    runtime.reserve_storage_quota_v1(input("last-byte-a")),
    runtime.reserve_storage_quota_v1(input("last-byte-b"))
  );
  let first = first.unwrap();
  let second = second.unwrap();
  assert_ne!(first.allowed, second.allowed);
  let denied = if first.allowed { &second } else { &first };
  assert_eq!(denied.reason.as_deref(), Some("storage_limit"));
  assert_eq!(denied.limit, Some(quota));
  let allowed = if first.allowed { first } else { second };
  let reservation_id = allowed.reservation_id.unwrap();
  assert!(
    runtime
      .abort_storage_reservation_v1(types::RuntimeStorageReservationMutation {
        workspace_id: workspace_id.to_string(),
        user_id: user_id.to_string(),
        key: if sqlx::query_scalar::<_, bool>(
          "SELECT EXISTS(SELECT 1 FROM blobs WHERE workspace_id=$1 AND key='last-byte-a' AND reservation_id=$2::uuid)",
        )
        .bind(workspace_id)
        .bind(&reservation_id)
        .fetch_one(&pool)
        .await
        .unwrap()
        {
          "last-byte-a".to_string()
        } else {
          "last-byte-b".to_string()
        },
        reservation_id,
        kind: "blob".to_string(),
        doc_id: None,
        size: None,
        mime: None,
      })
      .await
      .unwrap()
  );

  sqlx::query("INSERT INTO blobs (workspace_id,key,size,mime,status) VALUES ($1,$2,100,$3,'completed')")
    .bind(workspace_id)
    .bind("missing-completed-object")
    .bind("application/octet-stream")
    .execute(&pool)
    .await
    .unwrap();
  let repaired = runtime
    .reserve_storage_quota_v1(types::RuntimeStorageReservationInput {
      workspace_id: workspace_id.to_string(),
      user_id: user_id.to_string(),
      key: "missing-completed-object".to_string(),
      size: 100,
      mime: "application/octet-stream".to_string(),
      kind: "blob".to_string(),
      doc_id: None,
      name: None,
      upload_id: None,
    })
    .await
    .unwrap();
  assert!(repaired.allowed);
  assert!(!repaired.already_uploaded);
  assert!(repaired.reservation_id.is_some());
  assert_eq!(
    sqlx::query_scalar::<_, String>("SELECT status::text FROM blobs WHERE workspace_id=$1 AND key=$2")
      .bind(workspace_id)
      .bind("missing-completed-object")
      .fetch_one(&pool)
      .await
      .unwrap(),
    "pending"
  );

  let expired_reservation_id = uuid::Uuid::new_v4();
  sqlx::query(
    "INSERT INTO blobs (workspace_id,key,size,mime,status,reservation_id,reservation_expires_at) VALUES \
     ($1,'expired-race',50,'application/octet-stream','pending',$2,clock_timestamp()-interval '1 minute')",
  )
  .bind(workspace_id)
  .bind(expired_reservation_id)
  .execute(&pool)
  .await
  .unwrap();
  let expired_input = || types::RuntimeStorageReservationInput {
    workspace_id: workspace_id.to_string(),
    user_id: user_id.to_string(),
    key: "expired-race".to_string(),
    size: 50,
    mime: "application/octet-stream".to_string(),
    kind: "blob".to_string(),
    doc_id: None,
    name: None,
    upload_id: None,
  };
  let (expired_first, expired_second) = tokio::join!(
    runtime.reserve_storage_quota_v1(expired_input()),
    runtime.reserve_storage_quota_v1(expired_input())
  );
  let expired_first = expired_first.unwrap();
  let expired_second = expired_second.unwrap();
  assert!(expired_first.allowed && expired_second.allowed);
  assert_ne!(expired_first.reservation_id, Some(expired_reservation_id.to_string()));
  assert_eq!(expired_first.reservation_id, expired_second.reservation_id);
  assert_eq!(
    sqlx::query_scalar::<_, i64>(
      "SELECT count(*) FROM blobs WHERE workspace_id=$1 AND key='expired-race' AND status='pending'",
    )
    .bind(workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap(),
    1
  );

  sqlx::query(
    "INSERT INTO blobs (workspace_id,key,size,mime,status) VALUES \
     ($1,'duplicate-object',50,'application/octet-stream','completed')",
  )
  .bind(workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  let duplicate_locator = crate::runtime::object_storage::types::ObjectLocator::new(
    crate::runtime::object_storage::types::StorageScope::Blob,
    crate::runtime::object_storage::types::ObjectKey::new(format!("{workspace_id}/duplicate-object")).unwrap(),
  );
  runtime
    .object_storage()
    .unwrap()
    .put(
      &duplicate_locator,
      vec![0; 50],
      crate::runtime::object_storage::types::ObjectPutMetadata {
        content_type: Some("application/octet-stream".to_string()),
        content_length: Some(50),
        checksum_crc32: None,
      },
    )
    .await
    .unwrap();
  for _ in 0..2 {
    let duplicate = runtime
      .reserve_storage_quota_v1(types::RuntimeStorageReservationInput {
        workspace_id: workspace_id.to_string(),
        user_id: user_id.to_string(),
        key: "duplicate-object".to_string(),
        size: 50,
        mime: "application/octet-stream".to_string(),
        kind: "blob".to_string(),
        doc_id: None,
        name: None,
        upload_id: None,
      })
      .await
      .unwrap();
    assert!(duplicate.allowed);
    assert!(duplicate.already_uploaded);
    assert!(duplicate.reservation_id.is_none());
  }
  assert!(
    !runtime
      .abort_storage_reservation_v1(types::RuntimeStorageReservationMutation {
        workspace_id: workspace_id.to_string(),
        user_id: user_id.to_string(),
        key: "duplicate-object".to_string(),
        reservation_id: uuid::Uuid::new_v4().to_string(),
        kind: "blob".to_string(),
        doc_id: None,
        size: None,
        mime: None,
      })
      .await
      .unwrap()
  );
  assert!(
    runtime
      .object_storage()
      .unwrap()
      .head(&duplicate_locator)
      .await
      .unwrap()
      .is_some(),
    "a stale abort must not delete the completed final object"
  );

  sqlx::query(
    r#"CREATE OR REPLACE FUNCTION rust_test_strict_storage_block_expired_update()
       RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$"#,
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    r#"CREATE TRIGGER rust_test_strict_storage_rows_fence
       BEFORE UPDATE ON blobs FOR EACH ROW
       WHEN (OLD.workspace_id = 'rust-test:strict-storage:workspace' AND OLD.key = 'rows-fence')
       EXECUTE FUNCTION rust_test_strict_storage_block_expired_update()"#,
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO blobs (workspace_id,key,size,mime,status,reservation_id,reservation_expires_at) VALUES \
     ($1,'rows-fence',25,'application/octet-stream','pending',$2,clock_timestamp()-interval '1 minute')",
  )
  .bind(workspace_id)
  .bind(uuid::Uuid::new_v4())
  .execute(&pool)
  .await
  .unwrap();
  let fenced = match runtime
    .reserve_storage_quota_v1(types::RuntimeStorageReservationInput {
      workspace_id: workspace_id.to_string(),
      user_id: user_id.to_string(),
      key: "rows-fence".to_string(),
      size: 25,
      mime: "application/octet-stream".to_string(),
      kind: "blob".to_string(),
      doc_id: None,
      name: None,
      upload_id: None,
    })
    .await
  {
    Ok(_) => panic!("the rows-affected fence must reject a lost expired-row update"),
    Err(error) => error,
  };
  assert!(fenced.to_string().contains("storage reservation changed"));
  sqlx::query("DROP TRIGGER rust_test_strict_storage_rows_fence ON blobs")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION rust_test_strict_storage_block_expired_update()")
    .execute(&pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn strict_blob_management_authorizes_inventory_and_denies_before_object_cleanup() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let temp = tempfile::tempdir().unwrap();
  runtime
    .configure_object_storage(format!(
      r#"{{"storages":{{"blob.storage":{{"provider":"fs","bucket":"blob-management","config":{{"path":{}}}}}}}}}"#,
      serde_json::to_string(temp.path()).unwrap()
    ))
    .unwrap();
  let pool = runtime.pool().await.unwrap();
  let workspace_id = "rust-test:blob-management:workspace";
  let owner_id = "rust-test:blob-management:owner";
  let member_id = "rust-test:blob-management:member";
  sqlx::query("DELETE FROM workspaces WHERE id=$1")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=ANY($1)")
    .bind(vec![owner_id, member_id])
    .execute(&pool)
    .await
    .unwrap();
  for (id, email) in [
    (owner_id, "blob-owner@example.com"),
    (member_id, "blob-member@example.com"),
  ] {
    sqlx::query("INSERT INTO users(id,name,email,created_at) VALUES($1,'Blob Management',$2,now())")
      .bind(id)
      .bind(email)
      .execute(&pool)
      .await
      .unwrap();
  }
  sqlx::query("INSERT INTO workspaces(id,created_at) VALUES($1,now())")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  for (id, user_id, role) in [
    ("rust-test:blob-management:owner-member", owner_id, "owner"),
    ("rust-test:blob-management:ordinary-member", member_id, "member"),
  ] {
    sqlx::query(
      "INSERT INTO workspace_members(id,workspace_id,user_id,role,state,created_at,updated_at) \
       VALUES($1,$2,$3,$4,'active',now(),now())",
    )
    .bind(id)
    .bind(workspace_id)
    .bind(user_id)
    .bind(role)
    .execute(&pool)
    .await
    .unwrap();
  }
  sqlx::query(
    "INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,'managed-key',7,'image/png','completed')",
  )
  .bind(workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  let locator = |key: &str| {
    crate::runtime::object_storage::types::ObjectLocator::new(
      crate::runtime::object_storage::types::StorageScope::Blob,
      crate::runtime::object_storage::types::ObjectKey::new(format!("{workspace_id}/{key}")).unwrap(),
    )
  };
  runtime
    .object_storage()
    .unwrap()
    .put(
      &locator("managed-key"),
      b"managed".to_vec(),
      crate::runtime::object_storage::types::ObjectPutMetadata {
        content_type: Some("image/png".to_string()),
        content_length: Some(7),
        checksum_crc32: None,
      },
    )
    .await
    .unwrap();

  assert!(
    runtime
      .list_managed_workspace_blobs_v1(member_id.into(), workspace_id.into())
      .await
      .is_err()
  );
  let inventory = runtime
    .list_managed_workspace_blobs_v1(owner_id.into(), workspace_id.into())
    .await
    .unwrap();
  assert_eq!(inventory.len(), 1);
  assert_eq!(inventory[0].key, "managed-key");
  sqlx::query(
    "INSERT INTO blobs(workspace_id,key,size,mime,status) SELECT $1,'managed-cap-' || \
     value,1,'text/plain','completed' FROM generate_series(1,1000) value",
  )
  .bind(workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  assert!(
    runtime
      .list_managed_workspace_blobs_v1(owner_id.into(), workspace_id.into())
      .await
      .is_err()
  );
  sqlx::query("DELETE FROM blobs WHERE workspace_id=$1 AND key LIKE 'managed-cap-%'")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    runtime
      .manage_workspace_blob_v1(types::RuntimeBlobManagementInput {
        workspace_id: workspace_id.into(),
        actor_user_id: owner_id.into(),
        key: "managed-key".into(),
        permanently: false,
      })
      .await
      .unwrap()
  );
  assert!(
    runtime
      .list_managed_workspace_blobs_v1(owner_id.into(), workspace_id.into())
      .await
      .unwrap()
      .is_empty()
  );
  let deleted_at = sqlx::query_scalar::<_, Option<chrono::DateTime<chrono::Utc>>>(
    "SELECT deleted_at FROM blobs WHERE workspace_id=$1 AND key='managed-key'",
  )
  .bind(workspace_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert!(deleted_at.is_some());
  assert!(
    runtime
      .object_storage()
      .unwrap()
      .head(&locator("managed-key"))
      .await
      .unwrap()
      .is_some()
  );

  for key in ["permanent-key", "release-a", "release-b"] {
    sqlx::query(
      "INSERT INTO blobs(workspace_id,key,size,mime,status,deleted_at) VALUES($1,$2,1,'text/plain','completed',CASE \
       WHEN $2='permanent-key' THEN NULL ELSE now() END)",
    )
    .bind(workspace_id)
    .bind(key)
    .execute(&pool)
    .await
    .unwrap();
    runtime
      .object_storage()
      .unwrap()
      .put(
        &locator(key),
        b"x".to_vec(),
        crate::runtime::object_storage::types::ObjectPutMetadata {
          content_type: Some("text/plain".to_string()),
          content_length: Some(1),
          checksum_crc32: None,
        },
      )
      .await
      .unwrap();
  }
  assert!(
    runtime
      .manage_workspace_blob_v1(types::RuntimeBlobManagementInput {
        workspace_id: workspace_id.into(),
        actor_user_id: owner_id.into(),
        key: "permanent-key".into(),
        permanently: true,
      })
      .await
      .unwrap()
  );
  assert!(
    runtime
      .object_storage()
      .unwrap()
      .head(&locator("permanent-key"))
      .await
      .unwrap()
      .is_none()
  );
  assert!(
    !sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM blobs WHERE workspace_id=$1 AND key='permanent-key')",)
      .bind(workspace_id)
      .fetch_one(&pool)
      .await
      .unwrap()
  );
  assert!(
    runtime
      .release_managed_workspace_blobs_v1(owner_id.into(), workspace_id.into(), 0)
      .await
      .is_err()
  );
  assert_eq!(
    runtime
      .release_managed_workspace_blobs_v1(owner_id.into(), workspace_id.into(), 1)
      .await
      .unwrap(),
    1
  );
  assert_eq!(
    runtime
      .release_managed_workspace_blobs_v1(owner_id.into(), workspace_id.into(), 10)
      .await
      .unwrap(),
    2
  );
  assert_eq!(
    sqlx::query_scalar::<_, i64>("SELECT count(*) FROM blobs WHERE workspace_id=$1 AND deleted_at IS NOT NULL")
      .bind(workspace_id)
      .fetch_one(&pool)
      .await
      .unwrap(),
    0
  );

  sqlx::query(
    "INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,'failed-permanent-key',1,'text/plain','completed')",
  )
  .bind(workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  runtime
    .object_storage()
    .unwrap()
    .put(
      &locator("failed-permanent-key"),
      b"x".to_vec(),
      crate::runtime::object_storage::types::ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(1),
        checksum_crc32: None,
      },
    )
    .await
    .unwrap();
  let metadata = temp
    .path()
    .join("blob-management")
    .join(workspace_id)
    .join("failed-permanent-key.metadata.json");
  std::fs::remove_file(&metadata).unwrap();
  std::fs::create_dir(&metadata).unwrap();
  assert!(
    runtime
      .manage_workspace_blob_v1(types::RuntimeBlobManagementInput {
        workspace_id: workspace_id.into(),
        actor_user_id: owner_id.into(),
        key: "failed-permanent-key".into(),
        permanently: true,
      })
      .await
      .is_err()
  );
  assert!(
    sqlx::query_scalar::<_, bool>(
      "SELECT deleted_at IS NOT NULL FROM blobs WHERE workspace_id=$1 AND key='failed-permanent-key'",
    )
    .bind(workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap()
  );
}

#[tokio::test]
async fn strict_comment_reservation_rejects_hijack_and_cleans_expired_generation() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let pool = runtime.pool().await.unwrap();
  let owner_id = "rust-test:strict-comment:owner";
  let member_id = "rust-test:strict-comment:member";
  let workspace_id = "rust-test:strict-comment:workspace";
  let doc_id = "rust-test:strict-comment:doc";
  sqlx::query("DELETE FROM workspaces WHERE id=$1")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=ANY($1)")
    .bind(vec![owner_id, member_id])
    .execute(&pool)
    .await
    .unwrap();
  for (id, email) in [
    (owner_id, "strict-comment-owner@example.com"),
    (member_id, "strict-comment-member@example.com"),
  ] {
    sqlx::query("INSERT INTO users (id,name,email,created_at) VALUES ($1,'Strict Comment',$2,now())")
      .bind(id)
      .bind(email)
      .execute(&pool)
      .await
      .unwrap();
  }
  sqlx::query("INSERT INTO workspaces (id,created_at) VALUES ($1,now())")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  for (id, user_id, role) in [
    ("rust-test:strict-comment:owner-member", owner_id, "owner"),
    ("rust-test:strict-comment:collaborator-member", member_id, "member"),
  ] {
    sqlx::query(
      "INSERT INTO workspace_members (id,workspace_id,user_id,role,state,created_at,updated_at) VALUES \
       ($1,$2,$3,$4,'active',now(),now())",
    )
    .bind(id)
    .bind(workspace_id)
    .bind(user_id)
    .bind(role)
    .execute(&pool)
    .await
    .unwrap();
  }
  let temp = tempfile::tempdir().unwrap();
  runtime
    .configure_object_storage(format!(
      r#"{{"storages":{{"blob.storage":{{"provider":"fs","bucket":"strict-comment","config":{{"path":{}}}}}}}}}"#,
      serde_json::to_string(temp.path()).unwrap()
    ))
    .unwrap();
  while runtime.cleanup_expired_storage_reservations_v1(100).await.unwrap() > 0 {}
  let input = |user_id: &str| types::RuntimeStorageReservationInput {
    workspace_id: workspace_id.to_string(),
    user_id: user_id.to_string(),
    key: "attachment-key".to_string(),
    size: 4,
    mime: "text/plain".to_string(),
    kind: "comment_attachment".to_string(),
    doc_id: Some(doc_id.to_string()),
    name: Some("attachment.txt".to_string()),
    upload_id: None,
  };
  let reserved = runtime.reserve_storage_quota_v1(input(owner_id)).await.unwrap();
  let reservation_id = reserved.reservation_id.unwrap();
  assert!(runtime.reserve_storage_quota_v1(input(member_id)).await.is_err());
  let mut mime_mismatch = input(owner_id);
  mime_mismatch.mime = "application/octet-stream".to_string();
  let mime_mismatch = match runtime.reserve_storage_quota_v1(mime_mismatch).await {
    Ok(_) => panic!("a comment reservation must reject a persisted MIME mismatch"),
    Err(error) => error,
  };
  assert!(mime_mismatch.to_string().contains("blob mime mismatch"));
  assert_eq!(
    sqlx::query_scalar::<_, String>(
      "SELECT mime FROM comment_attachments WHERE workspace_id=$1 AND doc_id=$2 AND key='attachment-key'",
    )
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await
    .unwrap(),
    "text/plain"
  );

  let reservation_uuid = uuid::Uuid::parse_str(&reservation_id).unwrap();
  let locator = crate::runtime::object_storage::types::ObjectLocator::new(
    crate::runtime::object_storage::types::StorageScope::Blob,
    crate::runtime::object_storage::types::ObjectKey::new(format!(
      "comment-attachments/{workspace_id}/{doc_id}/.reservations/{reservation_uuid}/attachment-key"
    ))
    .unwrap(),
  );
  runtime
    .object_storage()
    .unwrap()
    .put(
      &locator,
      b"test".to_vec(),
      crate::runtime::object_storage::types::ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(4),
        checksum_crc32: None,
      },
    )
    .await
    .unwrap();
  sqlx::query(
    "UPDATE comment_attachments SET reservation_expires_at=clock_timestamp()-interval '1 minute' WHERE \
     workspace_id=$1 AND doc_id=$2 AND key='attachment-key'",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .execute(&pool)
  .await
  .unwrap();
  assert_eq!(runtime.cleanup_expired_storage_reservations_v1(100).await.unwrap(), 1);
  assert!(
    runtime
      .object_storage()
      .unwrap()
      .head(&locator)
      .await
      .unwrap()
      .is_none()
  );
  assert!(
    !sqlx::query_scalar::<_, bool>(
      "SELECT EXISTS(SELECT 1 FROM comment_attachments WHERE workspace_id=$1 AND doc_id=$2 AND key='attachment-key')",
    )
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await
    .unwrap()
  );

  let mut promotion_input = input(owner_id);
  promotion_input.key = "promotion-key".to_string();
  let promotion_reservation = runtime
    .reserve_storage_quota_v1(promotion_input)
    .await
    .unwrap()
    .reservation_id
    .unwrap();
  let final_key = format!("comment-attachments/{workspace_id}/{doc_id}/promotion-key");
  let promotion_temp = crate::runtime::object_storage::types::ObjectLocator::new(
    crate::runtime::object_storage::types::StorageScope::Blob,
    crate::runtime::object_storage::types::ObjectKey::new(format!(
      "comment-attachments/{workspace_id}/{doc_id}/.reservations/{promotion_reservation}/promotion-key"
    ))
    .unwrap(),
  );
  runtime
    .object_storage()
    .unwrap()
    .put(
      &promotion_temp,
      b"test".to_vec(),
      crate::runtime::object_storage::types::ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(4),
        checksum_crc32: None,
      },
    )
    .await
    .unwrap();
  let mutation = || types::RuntimeStorageReservationMutation {
    workspace_id: workspace_id.to_string(),
    user_id: owner_id.to_string(),
    doc_id: Some(doc_id.to_string()),
    key: "promotion-key".to_string(),
    reservation_id: promotion_reservation.clone(),
    kind: "comment_attachment".to_string(),
    size: Some(4),
    mime: Some("text/plain".to_string()),
  };
  let hold = super::StorageOperation::acquire(&pool, workspace_id, Some(&final_key))
    .await
    .unwrap();
  let finalize = runtime.finalize_storage_reservation_v1(mutation());
  tokio::pin!(finalize);
  assert!(
    tokio::time::timeout(std::time::Duration::from_millis(100), &mut finalize)
      .await
      .is_err(),
    "finalization must wait for the same object's lifecycle lock"
  );
  let mut probe = pool.begin().await.unwrap();
  sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE NOWAIT")
    .bind(owner_id)
    .execute(&mut *probe)
    .await
    .unwrap();
  sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE NOWAIT")
    .bind(workspace_id)
    .execute(&mut *probe)
    .await
    .unwrap();
  probe.rollback().await.unwrap();
  hold.release().await.unwrap();
  assert!(finalize.await.unwrap());
  assert!(!runtime.finalize_storage_reservation_v1(mutation()).await.unwrap());
  let final_locator = crate::runtime::object_storage::types::ObjectLocator::new(
    crate::runtime::object_storage::types::StorageScope::Blob,
    crate::runtime::object_storage::types::ObjectKey::new(final_key.clone()).unwrap(),
  );
  assert_eq!(
    runtime
      .object_storage()
      .unwrap()
      .get(&final_locator)
      .await
      .unwrap()
      .unwrap()
      .body,
    b"test"
  );

  let hold = super::StorageOperation::acquire(&pool, workspace_id, Some(&final_key))
    .await
    .unwrap();
  assert!(
    tokio::time::timeout(
      std::time::Duration::from_millis(100),
      super::StorageOperation::acquire(&pool, workspace_id, None)
    )
    .await
    .is_err(),
    "workspace cleanup must wait for in-flight object operations"
  );
  let independent = super::StorageOperation::acquire(&pool, workspace_id, Some("another-key"))
    .await
    .unwrap();
  independent.release().await.unwrap();
  for object_key in [None, Some(final_key.as_str())] {
    let error = match super::StorageOperation::acquire(&pool, workspace_id, object_key).await {
      Err(error) => error,
      Ok(_) => panic!("a busy lifecycle lock must time out"),
    };
    assert_eq!(error.to_string(), "storage_lifecycle_lock_timeout");
  }
  sqlx::query(
    "UPDATE comment_attachments SET deleted_at=now() WHERE workspace_id=$1 AND doc_id=$2 AND key='promotion-key'",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .execute(&pool)
  .await
  .unwrap();
  let cleanup = runtime.cleanup_expired_storage_reservations_v1(100);
  tokio::pin!(cleanup);
  assert!(
    tokio::time::timeout(std::time::Duration::from_millis(100), &mut cleanup)
      .await
      .is_err(),
    "reservation cleanup must share the object lifecycle lock"
  );
  sqlx::query(
    "UPDATE comment_attachments SET deleted_at=NULL WHERE workspace_id=$1 AND doc_id=$2 AND key='promotion-key'",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .execute(&pool)
  .await
  .unwrap();
  hold.release().await.unwrap();
  assert_eq!(
    cleanup.await.unwrap(),
    0,
    "cleanup must recheck candidates after waiting for their lock"
  );
  assert!(
    runtime
      .object_storage()
      .unwrap()
      .head(&final_locator)
      .await
      .unwrap()
      .is_some()
  );
  let exclusive = tokio::time::timeout(
    std::time::Duration::from_secs(2),
    super::StorageOperation::acquire(&pool, workspace_id, None),
  )
  .await
  .unwrap()
  .unwrap();
  let mut shared = pool.begin().await.unwrap();
  let error = super::super::lock_workspace_storage_shared_transaction(&mut shared, workspace_id)
    .await
    .unwrap_err();
  assert_eq!(error.to_string(), "storage_lifecycle_lock_timeout");
  shared.rollback().await.unwrap();
  exclusive.release().await.unwrap();

  let completed_input = |key: &str| types::RuntimeStorageReservationInput {
    workspace_id: workspace_id.to_string(),
    user_id: owner_id.to_string(),
    key: key.to_string(),
    size: 4,
    mime: "text/plain".to_string(),
    kind: "comment_attachment".to_string(),
    doc_id: Some(doc_id.to_string()),
    name: Some("attachment.txt".to_string()),
    upload_id: None,
  };
  sqlx::query(
    "INSERT INTO comment_attachments (workspace_id,doc_id,key,size,mime,name,status,created_by) VALUES \
     ($1,$2,'completed-attachment',4,'text/plain','attachment.txt','completed',$3)",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(owner_id)
  .execute(&pool)
  .await
  .unwrap();
  let completed_locator = crate::runtime::object_storage::types::ObjectLocator::new(
    crate::runtime::object_storage::types::StorageScope::Blob,
    crate::runtime::object_storage::types::ObjectKey::new(format!(
      "comment-attachments/{workspace_id}/{doc_id}/completed-attachment"
    ))
    .unwrap(),
  );
  runtime
    .object_storage()
    .unwrap()
    .put(
      &completed_locator,
      b"test".to_vec(),
      crate::runtime::object_storage::types::ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(4),
        checksum_crc32: None,
      },
    )
    .await
    .unwrap();
  for _ in 0..2 {
    let duplicate = runtime
      .reserve_storage_quota_v1(completed_input("completed-attachment"))
      .await
      .unwrap();
    assert!(duplicate.allowed && duplicate.already_uploaded);
    assert!(duplicate.reservation_id.is_none());
  }

  sqlx::query(
    "INSERT INTO comment_attachments (workspace_id,doc_id,key,size,mime,name,status,created_by) VALUES \
     ($1,$2,'missing-attachment',4,'text/plain','attachment.txt','completed',$3)",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(owner_id)
  .execute(&pool)
  .await
  .unwrap();
  let repaired = runtime
    .reserve_storage_quota_v1(completed_input("missing-attachment"))
    .await
    .unwrap();
  assert!(repaired.allowed && !repaired.already_uploaded);
  assert!(repaired.reservation_id.is_some());
  assert_eq!(
    sqlx::query_scalar::<_, String>(
      "SELECT status::text FROM comment_attachments WHERE workspace_id=$1 AND doc_id=$2 AND key='missing-attachment'",
    )
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await
    .unwrap(),
    "pending"
  );

  sqlx::query(
    "INSERT INTO comment_attachments (workspace_id,doc_id,key,size,mime,name,status,created_by) VALUES \
     ($1,$2,'metadata-mismatch',4,'text/plain','attachment.txt','completed',$3)",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(owner_id)
  .execute(&pool)
  .await
  .unwrap();
  let mismatched_locator = crate::runtime::object_storage::types::ObjectLocator::new(
    crate::runtime::object_storage::types::StorageScope::Blob,
    crate::runtime::object_storage::types::ObjectKey::new(format!(
      "comment-attachments/{workspace_id}/{doc_id}/metadata-mismatch"
    ))
    .unwrap(),
  );
  runtime
    .object_storage()
    .unwrap()
    .put(
      &mismatched_locator,
      b"test".to_vec(),
      crate::runtime::object_storage::types::ObjectPutMetadata {
        content_type: Some("application/octet-stream".to_string()),
        content_length: Some(4),
        checksum_crc32: None,
      },
    )
    .await
    .unwrap();
  let mismatch = match runtime
    .reserve_storage_quota_v1(completed_input("metadata-mismatch"))
    .await
  {
    Ok(_) => panic!("a completed attachment must reject mismatched object metadata"),
    Err(error) => error,
  };
  assert!(mismatch.to_string().contains("storage final object metadata mismatch"));
  assert!(
    sqlx::query_scalar::<_, bool>(
      "SELECT deleted_at IS NOT NULL FROM comment_attachments WHERE workspace_id=$1 AND doc_id=$2 AND \
       key='metadata-mismatch'",
    )
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await
    .unwrap()
  );
  assert!(
    runtime
      .object_storage()
      .unwrap()
      .head(&mismatched_locator)
      .await
      .unwrap()
      .is_none()
  );
}

#[tokio::test]
async fn strict_seat_reservation_serializes_last_seats() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let pool = runtime.pool().await.unwrap();
  let user_id = "rust-test:strict-seat:user";
  let workspace_id = "rust-test:strict-seat:workspace";
  sqlx::query("DELETE FROM workspaces WHERE id=$1")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=$1")
    .bind(user_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO users (id,name,email,created_at) VALUES ($1,'Strict Seat',$2,now())")
    .bind(user_id)
    .bind("rust-test-strict-seat@example.com")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspaces (id,created_at) VALUES ($1,now())")
    .bind(workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO workspace_members (id,workspace_id,user_id,role,state,created_at,updated_at) VALUES \
     ($1,$2,$3,'owner','active',now(),now())",
  )
  .bind("rust-test:strict-seat:member")
  .bind(workspace_id)
  .bind(user_id)
  .execute(&pool)
  .await
  .unwrap();
  let input = |suffix: &str| types::RuntimeSeatReservationInput {
    workspace_id: workspace_id.to_string(),
    actor_user_id: user_id.to_string(),
    targets: vec![
      types::RuntimeSeatReservationTarget {
        email: format!("rust-test-seat-{suffix}-a@example.com"),
      },
      types::RuntimeSeatReservationTarget {
        email: format!("rust-test-seat-{suffix}-b@example.com"),
      },
    ],
  };
  let (first, second) = tokio::join!(
    runtime.reserve_workspace_seats_v1(input("first")),
    runtime.reserve_workspace_seats_v1(input("second"))
  );
  let first = first.unwrap();
  let second = second.unwrap();
  assert_ne!(first.allowed, second.allowed);
  assert_eq!(first.reservations.len() + second.reservations.len(), 2);
  assert_eq!(
    sqlx::query_scalar::<_, i64>(
      "SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1 AND status='pending'",
    )
    .bind(workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap(),
    2
  );
  let mut reservations = first
    .reservations
    .into_iter()
    .chain(second.reservations)
    .collect::<Vec<_>>();
  reservations.sort_by(|left, right| left.email.cmp(&right.email));
  let self_invitation = &reservations[0];
  assert!(
    runtime
      .activate_workspace_seat_v1(types::RuntimeSeatActivationInput {
        workspace_id: workspace_id.to_string(),
        actor_user_id: self_invitation.user_id.clone(),
        target_user_id: self_invitation.user_id.clone(),
        require_manage_permission: false,
      })
      .await
      .unwrap()
  );

  let managed_invitation = &reservations[1];
  sqlx::query("UPDATE workspace_invitations SET status='waiting_review' WHERE id=$1")
    .bind(&managed_invitation.invitation_id)
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    runtime
      .activate_workspace_seat_v1(types::RuntimeSeatActivationInput {
        workspace_id: workspace_id.to_string(),
        actor_user_id: user_id.to_string(),
        target_user_id: managed_invitation.user_id.clone(),
        require_manage_permission: true,
      })
      .await
      .unwrap_err()
      .to_string()
      .contains("workspace_invitation_invalid")
  );
  sqlx::query("UPDATE workspace_invitations SET kind='link',requested_role='admin' WHERE id=$1")
    .bind(&managed_invitation.invitation_id)
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    runtime
      .activate_workspace_seat_v1(types::RuntimeSeatActivationInput {
        workspace_id: workspace_id.to_string(),
        actor_user_id: user_id.to_string(),
        target_user_id: managed_invitation.user_id.clone(),
        require_manage_permission: true,
      })
      .await
      .unwrap_err()
      .to_string()
      .contains("workspace_invitation_invalid")
  );
  sqlx::query("UPDATE workspace_invitations SET requested_role='member' WHERE id=$1")
    .bind(&managed_invitation.invitation_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP TRIGGER IF EXISTS test_keep_strict_seat_invitation ON workspace_invitations")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION IF EXISTS test_keep_strict_seat_invitation()")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "CREATE FUNCTION test_keep_strict_seat_invitation() RETURNS trigger AS $$ BEGIN RETURN NULL; END $$ LANGUAGE \
     plpgsql",
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "CREATE TRIGGER test_keep_strict_seat_invitation BEFORE DELETE ON workspace_invitations FOR EACH ROW EXECUTE \
     FUNCTION test_keep_strict_seat_invitation()",
  )
  .execute(&pool)
  .await
  .unwrap();
  assert!(
    runtime
      .activate_workspace_seat_v1(types::RuntimeSeatActivationInput {
        workspace_id: workspace_id.to_string(),
        actor_user_id: user_id.to_string(),
        target_user_id: managed_invitation.user_id.clone(),
        require_manage_permission: true,
      })
      .await
      .unwrap_err()
      .to_string()
      .contains("workspace_invitation_changed")
  );
  assert!(
    !sqlx::query_scalar::<_, bool>(
      "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active')",
    )
    .bind(workspace_id)
    .bind(&managed_invitation.user_id)
    .fetch_one(&pool)
    .await
    .unwrap()
  );
  sqlx::query("DROP TRIGGER test_keep_strict_seat_invitation ON workspace_invitations")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION test_keep_strict_seat_invitation()")
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    runtime
      .activate_workspace_seat_v1(types::RuntimeSeatActivationInput {
        workspace_id: workspace_id.to_string(),
        actor_user_id: user_id.to_string(),
        target_user_id: managed_invitation.user_id.clone(),
        require_manage_permission: true,
      })
      .await
      .unwrap()
  );
  assert_eq!(
    sqlx::query_scalar::<_, i64>("SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND state='active'")
      .bind(workspace_id)
      .fetch_one(&pool)
      .await
      .unwrap(),
    3
  );
  assert_eq!(
    sqlx::query_scalar::<_, i64>("SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1")
      .bind(workspace_id)
      .fetch_one(&pool)
      .await
      .unwrap(),
    0
  );
}

#[tokio::test]
async fn strict_seat_crossed_owner_target_locks_do_not_deadlock() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let pool = runtime.pool().await.unwrap();
  let user_a = "rust-test:strict-seat-cross:user-a";
  let user_b = "rust-test:strict-seat-cross:user-b";
  let workspace_a = "rust-test:strict-seat-cross:workspace-a";
  let workspace_b = "rust-test:strict-seat-cross:workspace-b";
  sqlx::query("DELETE FROM workspaces WHERE id=ANY($1)")
    .bind(vec![workspace_a, workspace_b])
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=ANY($1)")
    .bind(vec![user_a, user_b])
    .execute(&pool)
    .await
    .unwrap();
  for (id, email) in [
    (user_a, "strict-seat-cross-a@example.com"),
    (user_b, "strict-seat-cross-b@example.com"),
  ] {
    sqlx::query("INSERT INTO users (id,name,email,created_at) VALUES ($1,'Strict Seat Cross',$2,now())")
      .bind(id)
      .bind(email)
      .execute(&pool)
      .await
      .unwrap();
  }
  for (workspace_id, owner_id, member_id) in [
    (workspace_a, user_a, "rust-test:strict-seat-cross:member-a"),
    (workspace_b, user_b, "rust-test:strict-seat-cross:member-b"),
  ] {
    sqlx::query("INSERT INTO workspaces (id,created_at) VALUES ($1,now())")
      .bind(workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id,workspace_id,user_id,role,state,created_at,updated_at) VALUES \
       ($1,$2,$3,'owner','active',now(),now())",
    )
    .bind(member_id)
    .bind(workspace_id)
    .bind(owner_id)
    .execute(&pool)
    .await
    .unwrap();
  }
  let result = tokio::time::timeout(std::time::Duration::from_secs(2), async {
    tokio::join!(
      runtime.reserve_workspace_review_seat_v1(types::RuntimeSeatReviewInput {
        workspace_id: workspace_a.to_string(),
        target_user_id: user_b.to_string(),
        inviter_user_id: user_a.to_string(),
      }),
      runtime.reserve_workspace_review_seat_v1(types::RuntimeSeatReviewInput {
        workspace_id: workspace_b.to_string(),
        target_user_id: user_a.to_string(),
        inviter_user_id: user_b.to_string(),
      })
    )
  })
  .await
  .expect("crossed owner/target locks must complete");
  assert!(result.0.unwrap());
  assert!(result.1.unwrap());
}

#[tokio::test]
async fn invite_abuse_action_sql_state_machine_retries_and_fences_workers() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let pool = runtime.pool().await.unwrap();
  let actor_id = "rust-test:invite-abuse-action:user";
  let workspace_id = "rust-test:invite-abuse-action:workspace";
  let subject_key = format!("actor_email_sha256:v1:{}", "a".repeat(64));
  sqlx::query("DELETE FROM runtime_invite_abuse_actions WHERE subject_key=$1")
    .bind(&subject_key)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM runtime_invite_abuse_evidence WHERE subject_key=$1")
    .bind(&subject_key)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM runtime_invite_abuse_subjects WHERE subject_key=$1")
    .bind(&subject_key)
    .execute(&pool)
    .await
    .unwrap();
  let action_id: i64 = sqlx::query_scalar(
    r#"
    WITH subject AS (
      INSERT INTO runtime_invite_abuse_subjects (
        subject_key,
        kind,
        user_id,
        actor_email_hash,
        email_domain,
        status,
        action,
        action_reason,
        first_seen_at,
        last_seen_at
      )
      VALUES ($1, 'actor_email', $2, $1, 'example.com', 'quarantined', 'quarantine_actor', 'high_risk_domain_burst', now(), now())
      RETURNING subject_key
    ),
    evidence AS (
      INSERT INTO runtime_invite_abuse_evidence (
        subject_key,
        workspace_id,
        user_id,
        actor_email_hash,
        target_domains,
        counters,
        decision,
        reason
      )
      VALUES ($1, $3, $2, $1, '[{"domain":"qq.com","count":1}]'::jsonb, '{"requested":1}'::jsonb, 'quarantine_actor', 'high_risk_domain_burst')
      RETURNING id
    )
    INSERT INTO runtime_invite_abuse_actions (
      subject_key,
      evidence_id,
      action,
      status
    )
    SELECT $1, evidence.id, 'quarantine_actor', 'pending'
    FROM evidence
    RETURNING id
    "#,
  )
  .bind(&subject_key)
  .bind(actor_id)
  .bind(workspace_id)
  .fetch_one(&pool)
  .await
  .unwrap();

  let invalid_subject_key = format!("workspace:v1:{}", "c".repeat(24));
  sqlx::query("DELETE FROM runtime_invite_abuse_actions WHERE subject_key=$1")
    .bind(&invalid_subject_key)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM runtime_invite_abuse_evidence WHERE subject_key=$1")
    .bind(&invalid_subject_key)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM runtime_invite_abuse_subjects WHERE subject_key=$1")
    .bind(&invalid_subject_key)
    .execute(&pool)
    .await
    .unwrap();
  let invalid_action_id: i64 = sqlx::query_scalar(
    r#"
    WITH subject AS (
      INSERT INTO runtime_invite_abuse_subjects (
        subject_key, kind, actor_email_hash, email_domain, status, action,
        action_reason, first_seen_at, last_seen_at
      ) VALUES (
        $1, 'workspace', $2, 'example.com', 'quarantined',
        'quarantine_workspace', 'workspace_high_risk_domain_burst', now(), now()
      ) RETURNING subject_key
    ), evidence AS (
      INSERT INTO runtime_invite_abuse_evidence (
        subject_key, workspace_id, user_id, actor_email_hash, target_domains,
        counters, decision, reason
      ) VALUES (
        $1, $3, $4, $2, '[{"domain":"qq.com","count":1}]'::jsonb,
        '{"requested":1}'::jsonb, 'quarantine_actor', 'high_risk_domain_burst'
      ) RETURNING id
    )
    INSERT INTO runtime_invite_abuse_actions (subject_key, evidence_id, action, status)
    SELECT $1, evidence.id, 'quarantine_workspace', 'pending' FROM evidence
    RETURNING id
    "#,
  )
  .bind(&invalid_subject_key)
  .bind(&subject_key)
  .bind(workspace_id)
  .bind(actor_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert!(
    !runtime
      .claim_invite_abuse_action(invalid_action_id.to_string(), "rust-test:invalid-worker".to_string())
      .await
      .unwrap()
  );

  assert!(
    runtime
      .claim_invite_abuse_action(action_id.to_string(), "rust-test:inline-worker".to_string())
      .await
      .unwrap()
  );
  assert!(
    runtime
      .mark_invite_abuse_action(
        action_id.to_string(),
        "rust-test:inline-worker".to_string(),
        "failed".to_string(),
        Some("transient cleanup failure".to_string())
      )
      .await
      .unwrap()
  );

  let waiting = sqlx::query(
    r#"
    SELECT status, attempts, last_error
    FROM runtime_invite_abuse_actions
    WHERE id = $1
    "#,
  )
  .bind(action_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(waiting.get::<String, _>("status"), "retry_wait");
  assert_eq!(waiting.get::<i32, _>("attempts"), 1);
  assert_eq!(
    waiting.get::<Option<String>, _>("last_error").as_deref(),
    Some("transient cleanup failure")
  );

  sqlx::query(
    r#"
    UPDATE runtime_invite_abuse_actions
    SET next_attempt_at = now() - interval '1 second'
    WHERE id = $1
    "#,
  )
  .bind(action_id)
  .execute(&pool)
  .await
  .unwrap();

  let claimed = runtime
    .claim_retryable_invite_abuse_actions("rust-test:worker".to_string(), 10)
    .await
    .unwrap();
  assert!(
    claimed
      .iter()
      .all(|action| action.action_id != invalid_action_id.to_string())
  );
  let current = claimed
    .iter()
    .find(|action| action.action_id == action_id.to_string())
    .expect("retryable action should be claimed");
  assert_eq!(current.action, "quarantine_actor");
  assert_eq!(current.subject_key, subject_key);
  assert_eq!(current.actor_user_id, actor_id);
  assert_eq!(current.workspace_id, workspace_id);

  assert!(
    !runtime
      .mark_invite_abuse_action(
        action_id.to_string(),
        "rust-test:inline-worker".to_string(),
        "succeeded".to_string(),
        None
      )
      .await
      .unwrap()
  );
  let still_claimed = sqlx::query(
    r#"
    SELECT status, locked_by
    FROM runtime_invite_abuse_actions
    WHERE id = $1
    "#,
  )
  .bind(action_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(still_claimed.get::<String, _>("status"), "running");
  assert_eq!(
    still_claimed.get::<Option<String>, _>("locked_by").as_deref(),
    Some("rust-test:worker")
  );

  assert!(
    runtime
      .mark_invite_abuse_action(
        action_id.to_string(),
        "rust-test:worker".to_string(),
        "succeeded".to_string(),
        None
      )
      .await
      .unwrap()
  );
  for key in [&subject_key, &invalid_subject_key] {
    sqlx::query("DELETE FROM runtime_invite_abuse_actions WHERE subject_key=$1")
      .bind(key)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM runtime_invite_abuse_evidence WHERE subject_key=$1")
      .bind(key)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM runtime_invite_abuse_subjects WHERE subject_key=$1")
      .bind(key)
      .execute(&pool)
      .await
      .unwrap();
  }
}

#[tokio::test]
async fn runtime_state_cleanup_deletes_expired_and_consumed_rows() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };

  let pool = runtime.pool().await.unwrap();
  sqlx::query(
    "INSERT INTO runtime_states(purpose,token_hash,payload,expires_at) VALUES \
     ('rust_test:cleanup','expired','{}',clock_timestamp()-INTERVAL '1 second'), \
     ('rust_test:cleanup','consumed','{}',clock_timestamp()+INTERVAL '1 minute')",
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query("UPDATE runtime_states SET consumed_at=clock_timestamp() WHERE token_hash='consumed'")
    .execute(&pool)
    .await
    .unwrap();
  tokio::time::sleep(Duration::from_millis(20)).await;

  assert!(runtime.cleanup_expired_runtime_states(100).await.unwrap() >= 2);
  let remaining: i64 = sqlx::query_scalar(
    "SELECT count(*) FROM runtime_states WHERE purpose='rust_test:cleanup' AND token_hash IN ('expired','consumed')",
  )
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(remaining, 0);
}
