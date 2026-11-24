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

    pool.close().await;
  });
}

#[test]
fn community_quota_gate_enforces_seats_and_arbitrates_commercial_licenses() {
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

    // 1. CommunityQuotaGate inside real PG tx: 10 seats allowed, 11th rejected.
    sqlx::query("CREATE TABLE IF NOT EXISTS installed_licenses (workspace_id TEXT PRIMARY KEY, license BYTEA)")
      .execute(&pool)
      .await
      .expect("create installed_licenses table");
    sqlx::query(
      "CREATE TABLE IF NOT EXISTS entitlements (id TEXT, target_type TEXT, target_id TEXT, source TEXT, status TEXT, starts_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, grace_until TIMESTAMPTZ, signed_payload BYTEA, updated_at TIMESTAMPTZ)",
    )
    .execute(&pool)
    .await
    .expect("create entitlements table");
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

    // 2. Commercial pro-v1 instance_default acceptance, workspace > instance_default priority,
    //    and deterministic signed_payload lexicographic tie-breaking independent of updated_at.
    use base64::Engine as _;
    use p256::ecdsa::{DerSignature, SigningKey, VerifyingKey, signature::Signer as _};
    use p256::pkcs8::{EncodePublicKey as _, LineEnding};
    use server_spi::QuotaGate as _;
    use server_types::license::{
      Keyring, LICENSE_AUDIENCE_SELFHOST, LicenseClaimsV2, LicenseEnvelopeV2, LicenseLimitsV2, LicenseRightsV2,
      LicenseScopeV2, PRO_KID,
    };

    let signing_key = SigningKey::from_slice(&[0x33u8; 32]).unwrap();
    let pro_pem = VerifyingKey::from(&signing_key)
      .to_public_key_pem(LineEnding::LF)
      .unwrap();
    let pro_gate = server_spi::CommunityQuotaGate::with_keyring(Keyring::with_pro_public_key(pro_pem));
    let now = Utc::now();

    let sign_v2 = |scope_kind: &str, ws: Option<&str>, seats: i32, blob_mib: i64, id: &str| -> Vec<u8> {
      let claims = LicenseClaimsV2 {
        format_version: 2,
        kid: PRO_KID.to_owned(),
        license_id: id.to_owned(),
        audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
        scope: LicenseScopeV2 {
          kind: scope_kind.to_owned(),
          workspace_id: ws.map(str::to_owned),
        },
        tier: "selfhost_team".to_owned(),
        limits: LicenseLimitsV2 {
          blob_limit_bytes: blob_mib * 1024 * 1024,
          storage_quota_bytes: 1_099_511_627_776,
          seat_limit: seats,
          seat_quota_bytes: None,
          history_period_seconds: 31_536_000,
          copilot_action_limit: None,
        },
        rights: LicenseRightsV2 {
          commercial: true,
          copilot_byok: true,
          unlimited_copilot: false,
        },
        recurring: Some("yearly".to_owned()),
        issued_at: (now - chrono::Duration::days(1)).to_rfc3339(),
        not_before: (now - chrono::Duration::days(2)).to_rfc3339(),
        expires_at: Some((now + chrono::Duration::days(365)).to_rfc3339()),
      };
      let sig: DerSignature = signing_key.sign(&serde_json::to_vec(&claims).unwrap());
      serde_json::to_vec(&LicenseEnvelopeV2 {
        claims,
        signature: base64::engine::general_purpose::STANDARD.encode(sig.as_bytes()),
      })
      .unwrap()
    };

    // (a) Single 100-seat pro-v1 instance_default commercial entitlement -> returns 100 seats.
    let inst_100 = sign_v2("instance_default", None, 100, 500, "lic-inst-100");
    sqlx::query(
      "INSERT INTO entitlements (id, target_type, target_id, source, status, starts_at, expires_at, grace_until, signed_payload, updated_at)
       VALUES ('ent-inst', 'workspace', 'ws-arb', 'selfhost_license', 'active', NULL, $1, NULL, $2, $3)",
    )
    .bind(now + chrono::Duration::days(30))
    .bind(&inst_100)
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();
    {
      let mut tx = pool.begin().await.unwrap();
      let g = pro_gate.resolve_workspace_grant(&mut tx, "ws-arb", now).await.unwrap();
      assert_eq!(g.limits.seat_limit, 100);
      tx.rollback().await.unwrap();
    }

    // (b) 100-seat instance_default (active) + 20-seat workspace (valid grace) -> workspace wins (20 seats).
    let ws_20 = sign_v2("workspace", Some("ws-arb"), 20, 500, "lic-ws-20");
    sqlx::query(
      "INSERT INTO entitlements (id, target_type, target_id, source, status, starts_at, expires_at, grace_until, signed_payload, updated_at)
       VALUES ('ent-ws-grace', 'workspace', 'ws-arb', 'selfhost_license', 'grace', NULL, $1, $2, $3, $4)",
    )
    .bind(now - chrono::Duration::minutes(1))
    .bind(now + chrono::Duration::hours(1))
    .bind(&ws_20)
    .bind(now - chrono::Duration::seconds(5))
    .execute(&pool)
    .await
    .unwrap();
    {
      let mut tx = pool.begin().await.unwrap();
      let g = pro_gate.resolve_workspace_grant(&mut tx, "ws-arb", now).await.unwrap();
      assert_eq!(g.limits.seat_limit, 20);
      tx.rollback().await.unwrap();
    }

    // (c) Two identical-priority active workspace V2 licenses (same seats/storage/tier, blob 200 MiB vs 500 MiB):
    //     swapping updated_at must select the exact same winner via raw signed_payload byte order.
    let ws_tie_200 = sign_v2("workspace", Some("ws-tie"), 30, 200, "lic-tie-a");
    let ws_tie_500 = sign_v2("workspace", Some("ws-tie"), 30, 500, "lic-tie-b");
    let t1 = now - chrono::Duration::seconds(10);
    let t2 = now;
    sqlx::query(
      "INSERT INTO entitlements (id, target_type, target_id, source, status, starts_at, expires_at, grace_until, signed_payload, updated_at)
       VALUES ('tie-1', 'workspace', 'ws-tie', 'selfhost_license', 'active', NULL, $1, NULL, $2, $3),
              ('tie-2', 'workspace', 'ws-tie', 'selfhost_license', 'active', NULL, $1, NULL, $4, $5)",
    )
    .bind(now + chrono::Duration::days(30))
    .bind(&ws_tie_200)
    .bind(t1)
    .bind(&ws_tie_500)
    .bind(t2)
    .execute(&pool)
    .await
    .unwrap();
    let winner_before = {
      let mut tx = pool.begin().await.unwrap();
      let g = pro_gate.resolve_workspace_grant(&mut tx, "ws-tie", now).await.unwrap();
      tx.rollback().await.unwrap();
      g
    };
    sqlx::query("UPDATE entitlements SET updated_at = $1 WHERE id = 'tie-1'")
      .bind(t2)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("UPDATE entitlements SET updated_at = $1 WHERE id = 'tie-2'")
      .bind(t1)
      .execute(&pool)
      .await
      .unwrap();
    let winner_after = {
      let mut tx = pool.begin().await.unwrap();
      let g = pro_gate.resolve_workspace_grant(&mut tx, "ws-tie", now).await.unwrap();
      tx.rollback().await.unwrap();
      g
    };
    assert_eq!(
      winner_before, winner_after,
      "equal-priority tie-break must depend on signed_payload bytes, not updated_at"
    );

    pool.close().await;
  });
}
