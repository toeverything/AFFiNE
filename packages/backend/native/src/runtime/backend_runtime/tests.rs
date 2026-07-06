use anyhow::{Context, Result as AnyResult, anyhow};

use super::{
  super::migrations::{RUNTIME_MIGRATIONS, migrate_runtime_tables},
  runtime_state::*,
  *,
};

static PG_TEST_LOCK: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();
const TEST_VERIFICATION_TOKEN_TYPE: i32 = 99_999;

fn pg_test_lock() -> &'static tokio::sync::Mutex<()> {
  PG_TEST_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

#[test]
fn migrations_include_runtime_tables_without_worker_heartbeats() {
  assert!(RUNTIME_MIGRATIONS.contains("runtime_states"));
  assert!(RUNTIME_MIGRATIONS.contains("runtime_gates"));
  assert!(RUNTIME_MIGRATIONS.contains("runtime_leases"));
  assert!(RUNTIME_MIGRATIONS.contains("blob_reconciliation_runs"));
  assert!(RUNTIME_MIGRATIONS.contains("blob_reconciliation_checkpoints"));
  assert!(RUNTIME_MIGRATIONS.contains("doc_blob_refs"));
  assert!(RUNTIME_MIGRATIONS.contains("blob_cleanup_candidates"));
  assert!(!RUNTIME_MIGRATIONS.contains("runtime_worker_heartbeats"));
}

#[test]
fn auth_challenge_state_uses_scoped_purpose_and_token_hash() {
  assert_eq!(auth_challenge_purpose("oauth_state"), "auth_challenge:oauth_state");
  assert_ne!(token_hash("plain-token"), "plain-token");
  assert_eq!(token_hash("plain-token"), token_hash("plain-token"));
  assert_ne!(token_hash("plain-token"), token_hash("other-token"));
}

#[test]
fn verification_token_state_uses_typed_purpose_and_token_hash() {
  assert_eq!(verification_token_purpose(0), "verification_token:0");
  assert_ne!(token_hash("verification-token"), "verification-token");
  assert_eq!(token_hash("verification-token"), token_hash("verification-token"));
  assert_ne!(token_hash("verification-token"), token_hash("other-token"));
}

async fn runtime_from_database_url() -> AnyResult<Option<BackendRuntime>> {
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
  sqlx::query("DELETE FROM runtime_leases WHERE key LIKE 'rust-test:%'")
    .execute(&pool)
    .await
    .context("cleanup runtime_leases for backend runtime tests")?;
  sqlx::query("DELETE FROM runtime_rolling_quota_reservations WHERE request_id LIKE 'rust-test:%'")
    .execute(&pool)
    .await
    .context("cleanup rolling quota reservations for backend runtime tests")?;
  sqlx::query("DELETE FROM runtime_rolling_quota_counters WHERE scope_key LIKE 'invite:%rust-test%'")
    .execute(&pool)
    .await
    .context("cleanup rolling quota counters for backend runtime tests")?;
  sqlx::query("DELETE FROM runtime_invite_abuse_actions WHERE subject_key LIKE 'rust-test:%'")
    .execute(&pool)
    .await
    .context("cleanup invite abuse actions for backend runtime tests")?;
  sqlx::query("DELETE FROM runtime_invite_abuse_evidence WHERE subject_key LIKE 'rust-test:%'")
    .execute(&pool)
    .await
    .context("cleanup invite abuse evidence for backend runtime tests")?;
  sqlx::query(
    "DELETE FROM runtime_invite_abuse_subjects WHERE subject_key LIKE 'rust-test:%' OR user_id LIKE 'rust-test:%'",
  )
  .execute(&pool)
  .await
  .context("cleanup invite abuse subjects for backend runtime tests")?;

  Ok(Some(BackendRuntime {
    config: std::sync::RwLock::new(BackendRuntimeConfig {
      database_url,
      invite_quota: Default::default(),
    }),
    pool: Mutex::new(Some(pool)),
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
  let email = format!("rust-test-quota-{suffix}@example.com");

  sqlx::query("DELETE FROM effective_workspace_quota_states WHERE workspace_id = $1")
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
  sqlx::query(
    "INSERT INTO workspaces (id, public, created_at) VALUES ($1, false, clock_timestamp() - interval '60 days')",
  )
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
      config: std::sync::RwLock::new(runtime.config().unwrap()),
      pool: Mutex::new(Some(runtime.pool().await.unwrap())),
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

  let decision = runtime
    .assert_workspace_invite_quota_v1(invite_quota_input(&user_id, &workspace_id, "rust-test:quota:commit", 2))
    .await
    .unwrap();
  assert!(decision.allowed);
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
}

#[tokio::test]
async fn rolling_quota_projection_stale_fails_closed() {
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

  assert!(!decision.allowed);
  assert_eq!(decision.reason.as_deref(), Some("quota_projection_stale"));
  assert!(decision.reservation_id.is_none());
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
  let subject_key = "rust-test:invite-abuse-action:subject";
  let action_id: i64 = sqlx::query_scalar(
    r#"
    WITH subject AS (
      INSERT INTO runtime_invite_abuse_subjects (
        subject_key,
        kind,
        user_id,
        actor_email_hash,
        status,
        first_seen_at,
        last_seen_at
      )
      VALUES ($1, 'actor_email', $2, 'hash', 'quarantined', now(), now())
      RETURNING subject_key
    ),
    evidence AS (
      INSERT INTO runtime_invite_abuse_evidence (
        subject_key,
        workspace_id,
        user_id,
        actor_email_hash,
        decision,
        reason
      )
      VALUES ($1, $3, $2, 'hash', 'quarantine_actor', 'test')
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
  .bind(subject_key)
  .bind(actor_id)
  .bind(workspace_id)
  .fetch_one(&pool)
  .await
  .unwrap();

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
}

#[tokio::test]
async fn coordination_lease_sql_semantics_are_fenced_and_ttl_bound() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };

  let lease = runtime
    .acquire_coordination_lease("rust-test:lease:basic".to_string(), "owner-1".to_string(), 30_000)
    .await
    .unwrap()
    .expect("first owner should acquire lease");
  assert_eq!(lease.fencing_token, 1);
  assert!(
    !runtime
      .release_coordination_lease(lease.key.clone(), "owner-2".to_string(), lease.fencing_token)
      .await
      .unwrap()
  );
  assert!(
    runtime
      .release_coordination_lease(lease.key.clone(), lease.owner.clone(), lease.fencing_token)
      .await
      .unwrap()
  );

  let mut tasks = Vec::new();
  for index in 0..16 {
    let runtime = BackendRuntime {
      config: std::sync::RwLock::new(runtime.config().unwrap()),
      pool: Mutex::new(Some(runtime.pool().await.unwrap())),
    };
    tasks.push(tokio::spawn(async move {
      runtime
        .acquire_coordination_lease(
          "rust-test:lease:concurrent".to_string(),
          format!("owner-{index}"),
          30_000,
        )
        .await
        .unwrap()
        .is_some()
    }));
  }
  let mut successful = 0;
  for task in tasks {
    if task.await.unwrap() {
      successful += 1;
    }
  }
  assert_eq!(successful, 1);

  let stale = runtime
    .acquire_coordination_lease("rust-test:lease:stale".to_string(), "owner-1".to_string(), 1)
    .await
    .unwrap()
    .expect("stale lease owner should acquire");
  tokio::time::sleep(Duration::from_millis(20)).await;
  let takeover = runtime
    .acquire_coordination_lease("rust-test:lease:stale".to_string(), "owner-2".to_string(), 30_000)
    .await
    .unwrap()
    .expect("expired lease should be taken over");
  assert_eq!(takeover.fencing_token, stale.fencing_token + 1);
  assert!(
    !runtime
      .release_coordination_lease(stale.key.clone(), stale.owner.clone(), stale.fencing_token)
      .await
      .unwrap()
  );

  let renew = runtime
    .acquire_coordination_lease("rust-test:lease:renew".to_string(), "owner-1".to_string(), 30_000)
    .await
    .unwrap()
    .expect("renew lease owner should acquire");
  assert!(
    !runtime
      .renew_coordination_lease(renew.key.clone(), "owner-2".to_string(), renew.fencing_token, 30_000)
      .await
      .unwrap()
  );
  assert!(
    !runtime
      .renew_coordination_lease(renew.key.clone(), renew.owner.clone(), renew.fencing_token + 1, 30_000)
      .await
      .unwrap()
  );
  assert!(
    runtime
      .renew_coordination_lease(renew.key.clone(), renew.owner.clone(), renew.fencing_token, 30_000)
      .await
      .unwrap()
  );
}

#[tokio::test]
async fn runtime_state_cleanup_deletes_expired_and_consumed_rows() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };

  assert!(
    runtime
      .create_auth_challenge(
        "rust_test:cleanup".to_string(),
        "expired".to_string(),
        serde_json::json!({}),
        1
      )
      .await
      .unwrap()
  );
  assert!(
    runtime
      .create_auth_challenge(
        "rust_test:cleanup".to_string(),
        "consumed".to_string(),
        serde_json::json!({}),
        30_000,
      )
      .await
      .unwrap()
  );
  assert!(
    runtime
      .consume_auth_challenge("rust_test:cleanup".to_string(), "consumed".to_string())
      .await
      .unwrap()
      .is_some()
  );
  tokio::time::sleep(Duration::from_millis(20)).await;

  assert_eq!(runtime.cleanup_expired_runtime_states(100).await.unwrap(), 2);
  assert_eq!(runtime.cleanup_expired_runtime_states(100).await.unwrap(), 0);
}

#[tokio::test]
async fn verification_token_sql_state_machine_handles_keep_verify_and_cleanup() {
  let _guard = pg_test_lock().lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };

  let mismatch_token = runtime
    .create_verification_token(
      TEST_VERIFICATION_TOKEN_TYPE,
      Some("user@affine.test".to_string()),
      30_000,
    )
    .await
    .unwrap();
  assert!(
    runtime
      .verify_verification_token(
        TEST_VERIFICATION_TOKEN_TYPE,
        mismatch_token.clone(),
        Some("wrong@affine.test".to_string()),
        None,
      )
      .await
      .unwrap()
      .is_none()
  );
  assert!(
    runtime
      .verify_verification_token(
        TEST_VERIFICATION_TOKEN_TYPE,
        mismatch_token.clone(),
        Some("user@affine.test".to_string()),
        None,
      )
      .await
      .unwrap()
      .is_some()
  );
  assert!(
    runtime
      .verify_verification_token(
        TEST_VERIFICATION_TOKEN_TYPE,
        mismatch_token.clone(),
        Some("user@affine.test".to_string()),
        None,
      )
      .await
      .unwrap()
      .is_none()
  );

  let keep_token = runtime
    .create_verification_token(
      TEST_VERIFICATION_TOKEN_TYPE,
      Some("keep@affine.test".to_string()),
      30_000,
    )
    .await
    .unwrap();
  assert!(
    runtime
      .get_verification_token(TEST_VERIFICATION_TOKEN_TYPE, keep_token.clone(), Some(true))
      .await
      .unwrap()
      .is_some()
  );
  assert!(
    runtime
      .get_verification_token(TEST_VERIFICATION_TOKEN_TYPE, keep_token.clone(), None)
      .await
      .unwrap()
      .is_some()
  );
  assert!(
    runtime
      .get_verification_token(TEST_VERIFICATION_TOKEN_TYPE, keep_token.clone(), None)
      .await
      .unwrap()
      .is_none()
  );

  let concurrent_token = runtime
    .create_verification_token(
      TEST_VERIFICATION_TOKEN_TYPE,
      Some("concurrent@affine.test".to_string()),
      30_000,
    )
    .await
    .unwrap();
  let mut tasks = Vec::new();
  for _ in 0..16 {
    let runtime = BackendRuntime {
      config: std::sync::RwLock::new(runtime.config().unwrap()),
      pool: Mutex::new(Some(runtime.pool().await.unwrap())),
    };
    let token = concurrent_token.clone();
    tasks.push(tokio::spawn(async move {
      runtime
        .verify_verification_token(
          TEST_VERIFICATION_TOKEN_TYPE,
          token,
          Some("concurrent@affine.test".to_string()),
          None,
        )
        .await
        .unwrap()
        .is_some()
    }));
  }
  let mut successful = 0;
  for task in tasks {
    if task.await.unwrap() {
      successful += 1;
    }
  }
  assert_eq!(successful, 1);

  let expired_token = runtime
    .create_verification_token(TEST_VERIFICATION_TOKEN_TYPE, Some("expired@affine.test".to_string()), 1)
    .await
    .unwrap();
  tokio::time::sleep(Duration::from_millis(20)).await;
  assert!(
    runtime
      .get_verification_token(TEST_VERIFICATION_TOKEN_TYPE, expired_token.clone(), None)
      .await
      .unwrap()
      .is_none()
  );
  assert_eq!(runtime.cleanup_expired_verification_tokens(100).await.unwrap(), 1);
  assert_eq!(runtime.cleanup_expired_verification_tokens(100).await.unwrap(), 0);
}
