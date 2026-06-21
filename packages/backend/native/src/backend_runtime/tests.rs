use anyhow::{Context, Result as AnyResult, anyhow};

use super::{runtime_state::*, *};

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

  Ok(Some(BackendRuntime {
    config: RuntimeConfig {
      database_url,
      storage: None,
    },
    pool: Mutex::new(Some(pool)),
  }))
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
      config: runtime.config.clone(),
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
      config: runtime.config.clone(),
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
      config: runtime.config.clone(),
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
