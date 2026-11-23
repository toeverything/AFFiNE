//! Real PostgreSQL integration tests proving `SessionPolicyHook` and `QuotaGate`
//! execute in the caller's exact transaction (`txid_current()` equality) and
//! roll back atomically on hook failure or outer transaction rollback.

use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use server_spi::{CommunityExtension, ServerExtension, SessionPolicyHook};
use server_types::DomainError;
use sqlx::{PgPool, Postgres, Transaction};
use test_db_harness::migrations::MigrationSet;
use test_db_harness::pg::{DEFAULT_LEASE_TTL, PgCluster};

struct RecordingSessionPolicyHook {
  fail_with_quota: bool,
  observed_txid: Arc<Mutex<Option<String>>>,
}

impl SessionPolicyHook for RecordingSessionPolicyHook {
  fn on_session_created<'a>(
    &'a self,
    tx: &'a mut Transaction<'_, Postgres>,
    user_id: &'a str,
    session_id: &'a str,
    _now: DateTime<Utc>,
  ) -> Pin<Box<dyn Future<Output = Result<(), DomainError>> + Send + 'a>> {
    let fail = self.fail_with_quota;
    let observed = Arc::clone(&self.observed_txid);
    Box::pin(async move {
      let hook_txid: String = sqlx::query_scalar("SELECT txid_current()::text")
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

      *observed.lock().expect("lock poisoned") = Some(hook_txid.clone());

      sqlx::query("INSERT INTO spi_policy_audit (session_id, user_id, txid) VALUES ($1, $2, $3)")
        .bind(session_id)
        .bind(user_id)
        .bind(&hook_txid)
        .execute(&mut **tx)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

      if fail {
        return Err(DomainError::QuotaExceeded {
          kind: "session_limit",
          message: "forced policy rejection".into(),
        });
      }
      Ok(())
    })
  }
}

async fn setup_test_pool(db_url: &str) -> PgPool {
  let pool = PgPool::connect(db_url).await.expect("connect sqlx pool");

  sqlx::query(
    "CREATE TABLE spi_domain_sessions (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL
     )",
  )
  .execute(&pool)
  .await
  .expect("create spi_domain_sessions");

  sqlx::query(
    "CREATE TABLE spi_policy_audit (
       session_id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       txid TEXT NOT NULL
     )",
  )
  .execute(&pool)
  .await
  .expect("create spi_policy_audit");

  pool
}

#[test]
fn session_policy_hook_shares_txid_and_rolls_back_atomically() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = MigrationSet {
    migrations: vec![],
    digest: "5b10000000000001".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure empty template");
  let lease = cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");

  rt.block_on(async move {
    let pool = setup_test_pool(&db_url).await;

    // 1. Commit path: hook observes identical txid_current() and both rows commit.
    let observed_commit = Arc::new(Mutex::new(None));
    let commit_hook = RecordingSessionPolicyHook {
      fail_with_quota: false,
      observed_txid: Arc::clone(&observed_commit),
    };

    let mut tx = pool.begin().await.expect("begin commit tx");
    let outer_txid_1: String = sqlx::query_scalar("SELECT txid_current()::text")
      .fetch_one(&mut *tx)
      .await
      .expect("outer txid 1");
    sqlx::query("INSERT INTO spi_domain_sessions (id, user_id) VALUES ($1, $2)")
      .bind("sess-commit")
      .bind("user-1")
      .execute(&mut *tx)
      .await
      .expect("insert domain row 1");
    commit_hook
      .on_session_created(&mut tx, "user-1", "sess-commit", Utc::now())
      .await
      .expect("hook commit path");

    let hook_txid_1 = observed_commit
      .lock()
      .expect("lock")
      .clone()
      .expect("hook recorded txid");
    eprintln!("spi_transactional_proof_txid_equal outer={outer_txid_1} hook={hook_txid_1}");
    assert_eq!(
      hook_txid_1, outer_txid_1,
      "hook must run inside the exact outer PostgreSQL transaction"
    );
    tx.commit().await.expect("commit tx 1");

    let domain_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM spi_domain_sessions WHERE id = 'sess-commit'")
      .fetch_one(&pool)
      .await
      .expect("count domain committed");
    let stored_txid: String = sqlx::query_scalar("SELECT txid FROM spi_policy_audit WHERE session_id = 'sess-commit'")
      .fetch_one(&pool)
      .await
      .expect("fetch audit txid");
    assert_eq!(domain_count, 1);
    assert_eq!(stored_txid, outer_txid_1);

    // 2. Hook failure path: hook writes audit row then returns QuotaExceeded; rollback leaves zero residue.
    let observed_fail = Arc::new(Mutex::new(None));
    let fail_hook = RecordingSessionPolicyHook {
      fail_with_quota: true,
      observed_txid: Arc::clone(&observed_fail),
    };

    let mut tx = pool.begin().await.expect("begin fail tx");
    let outer_txid_2: String = sqlx::query_scalar("SELECT txid_current()::text")
      .fetch_one(&mut *tx)
      .await
      .expect("outer txid 2");
    sqlx::query("INSERT INTO spi_domain_sessions (id, user_id) VALUES ($1, $2)")
      .bind("sess-hook-fail")
      .bind("user-2")
      .execute(&mut *tx)
      .await
      .expect("insert domain row 2");
    let err = fail_hook
      .on_session_created(&mut tx, "user-2", "sess-hook-fail", Utc::now())
      .await
      .expect_err("hook must fail with QuotaExceeded");
    assert!(matches!(
      err,
      DomainError::QuotaExceeded {
        kind: "session_limit",
        ..
      }
    ));
    assert_eq!(
      observed_fail.lock().expect("lock").as_deref(),
      Some(outer_txid_2.as_str())
    );
    tx.rollback().await.expect("rollback after hook error");

    let leftover_domain: i64 =
      sqlx::query_scalar("SELECT COUNT(*) FROM spi_domain_sessions WHERE id = 'sess-hook-fail'")
        .fetch_one(&pool)
        .await
        .expect("count domain fail");
    let leftover_audit: i64 =
      sqlx::query_scalar("SELECT COUNT(*) FROM spi_policy_audit WHERE session_id = 'sess-hook-fail'")
        .fetch_one(&pool)
        .await
        .expect("count audit fail");
    assert_eq!(leftover_domain, 0, "domain write must roll back atomically");
    assert_eq!(leftover_audit, 0, "hook audit write must roll back atomically");

    // 3. Outer rollback path: hook succeeds, then outer transaction rolls back -> zero residue.
    let mut tx = pool.begin().await.expect("begin outer rollback tx");
    sqlx::query("INSERT INTO spi_domain_sessions (id, user_id) VALUES ($1, $2)")
      .bind("sess-outer-rollback")
      .bind("user-3")
      .execute(&mut *tx)
      .await
      .expect("insert domain row 3");
    commit_hook
      .on_session_created(&mut tx, "user-3", "sess-outer-rollback", Utc::now())
      .await
      .expect("hook ok before outer rollback");
    tx.rollback().await.expect("outer rollback");

    let leftover_domain: i64 =
      sqlx::query_scalar("SELECT COUNT(*) FROM spi_domain_sessions WHERE id = 'sess-outer-rollback'")
        .fetch_one(&pool)
        .await
        .expect("count domain outer rollback");
    let leftover_audit: i64 =
      sqlx::query_scalar("SELECT COUNT(*) FROM spi_policy_audit WHERE session_id = 'sess-outer-rollback'")
        .fetch_one(&pool)
        .await
        .expect("count audit outer rollback");
    assert_eq!(leftover_domain, 0);
    assert_eq!(leftover_audit, 0);

    // 4. CommunityQuotaGate inside real PG tx: 10 seats allowed, 11th rejected.
    let ext = CommunityExtension::new();
    let gate = ext.quota_gate();
    let mut tx = pool.begin().await.expect("begin quota tx");
    let grant = gate
      .check_seat_admission(&mut tx, "ws-1", 9, 1, Utc::now())
      .await
      .expect("10th seat allowed");
    assert_eq!(grant.limits.seat_limit, 10);
    assert_eq!(grant.limits.storage_quota_bytes, 107_374_182_400);

    let err = gate
      .check_seat_admission(&mut tx, "ws-1", 10, 1, Utc::now())
      .await
      .expect_err("11th seat must be rejected");
    assert!(matches!(err, DomainError::QuotaExceeded { kind: "seat_limit", .. }));
    tx.rollback().await.expect("rollback quota tx");

    pool.close().await;
  });
}
