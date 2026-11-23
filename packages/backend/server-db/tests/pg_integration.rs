use std::{
  path::PathBuf,
  time::{Duration, Instant},
};

use postgres::{Client, NoTls};
use server_db::{
  DbConfig, DbError, SchemaReadiness, ServerDb, WorkloadTier, bundled_0275_migration_manifest, phase_a_compat,
  with_query_scope,
};
use server_types::ServerRole;
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, PgCluster},
};

fn repo_migrations_dir() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .unwrap()
    .join("server/migrations")
}

fn test_runtime() -> tokio::runtime::Runtime {
  tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .expect("build tokio runtime")
}

/// Creates a brand-new completely empty database inside the marked test cluster
/// and drops it automatically on drop.
struct EmptyDbGuard {
  admin_url: String,
  db_name: String,
  url: String,
}

impl EmptyDbGuard {
  fn create(cluster: &PgCluster, prefix: &str) -> Self {
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let db_name = format!("test_{prefix}_{}", &suffix[..12]);
    let mut admin = Client::connect(cluster.admin_url(), NoTls).expect("connect test admin");
    admin
      .batch_execute(&format!("CREATE DATABASE \"{db_name}\""))
      .expect("create empty test database");
    let url = cluster.url_for(&db_name);
    Self {
      admin_url: cluster.admin_url().to_owned(),
      db_name,
      url,
    }
  }
}

impl Drop for EmptyDbGuard {
  fn drop(&mut self) {
    if let Ok(mut admin) = Client::connect(&self.admin_url, NoTls) {
      let _ = admin.batch_execute(&format!("DROP DATABASE IF EXISTS \"{}\" WITH (FORCE)", self.db_name));
    }
  }
}

#[test]
fn fresh_empty_db_initializes_0275_baseline_and_is_idempotent() {
  let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
  let empty = EmptyDbGuard::create(&cluster, "fresh0275");
  let disk_set = MigrationSet::load(&repo_migrations_dir()).unwrap();

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");

    let expected_manifest = bundled_0275_migration_manifest();
    assert!(!expected_manifest.is_empty());

    let first = db.ensure_schema_ready().await.expect("fresh DB init");
    assert_eq!(
      first,
      SchemaReadiness::InitializedFresh0275 {
        applied_migrations: expected_manifest.len()
      }
    );

    // Verify core tables + _prisma_migrations exact SHA-256 checksums + checkpoint + native ledger.
    let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
    for table in [
      "users",
      "workspaces",
      "workspace_members",
      "entitlements",
      "snapshots",
      "_prisma_migrations",
      "storage_reconciliation_checkpoints",
      "native_schema_migrations",
    ] {
      let exists: bool = sqlx::query_scalar("SELECT to_regclass($1) IS NOT NULL")
        .bind(format!("public.{table}"))
        .fetch_one(conn.as_conn())
        .await
        .unwrap();
      assert!(exists, "expected table {table} to exist after fresh init");
    }

    let prisma_rows: Vec<(String, String, i32)> = sqlx::query_as(
      r#"SELECT migration_name, checksum, applied_steps_count
         FROM "_prisma_migrations"
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
         ORDER BY migration_name"#,
    )
    .fetch_all(conn.as_conn())
    .await
    .unwrap();
    assert_eq!(prisma_rows.len(), disk_set.migrations.len());
    for ((name, checksum, steps), expected) in prisma_rows.iter().zip(disk_set.migrations.iter()) {
      assert_eq!(name, &expected.name);
      assert_eq!(checksum, &expected.checksum);
      assert_eq!(*steps, 1);
    }

    assert!(
      phase_a_compat::has_schema_baseline_0275_checkpoint(conn.as_conn())
        .await
        .unwrap()
    );
    let cutover = phase_a_compat::check_cutover_invariants(conn.as_conn(), true)
      .await
      .unwrap();
    assert_eq!(cutover.ownerless_workspaces, 0);
    assert_eq!(cutover.active_unsigned_selfhost_entitlements, 0);

    let before_rerun: Vec<(String, String, String)> =
      sqlx::query_as(r#"SELECT id, migration_name, checksum FROM "_prisma_migrations" ORDER BY migration_name"#)
        .fetch_all(conn.as_conn())
        .await
        .unwrap();
    drop(conn);

    // Second run must be an idempotent no-op with zero changes to `_prisma_migrations`.
    let second = db.ensure_schema_ready().await.expect("second ensure_schema_ready");
    assert_eq!(
      second,
      SchemaReadiness::ReadyExisting0275 {
        verified_migrations: expected_manifest.len()
      }
    );
    let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
    let after_rerun: Vec<(String, String, String)> =
      sqlx::query_as(r#"SELECT id, migration_name, checksum FROM "_prisma_migrations" ORDER BY migration_name"#)
        .fetch_all(conn.as_conn())
        .await
        .unwrap();
    assert_eq!(before_rerun, after_rerun);
    drop(conn);
    db.pool().close().await;
  });
}

#[test]
fn partial_pre_0275_db_fails_with_stepping_stone_required() {
  let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
  let disk_set = MigrationSet::load(&repo_migrations_dir()).unwrap();
  let template = cluster.ensure_template(&disk_set).unwrap();
  let lease = cluster.lease(&template, DEFAULT_LEASE_TTL).unwrap();

  let last_migration = disk_set.migrations.last().unwrap().name.clone();
  {
    let mut client = Client::connect(lease.url(), NoTls).unwrap();
    client
      .execute(
        r#"DELETE FROM "_prisma_migrations" WHERE migration_name = $1"#,
        &[&last_migration],
      )
      .unwrap();
    // Even if a stale `schema_baseline_0275` checkpoint row exists, missing Prisma
    // migrations must still fail the baseline gate.
    client
      .batch_execute(
        r#"CREATE TABLE IF NOT EXISTS storage_reconciliation_checkpoints (
             kind TEXT NOT NULL,
             scope TEXT NOT NULL,
             status TEXT NOT NULL,
             cursor JSONB NOT NULL DEFAULT '{}',
             last_key TEXT,
             last_sid INTEGER,
             completed_at TIMESTAMPTZ(3),
             updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
             metadata JSONB NOT NULL DEFAULT '{}',
             PRIMARY KEY (kind, scope)
           );
           INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, completed_at)
           VALUES ('schema_baseline_0275', 'global', 'completed', now())
           ON CONFLICT (kind, scope) DO UPDATE SET status = 'completed';"#,
      )
      .unwrap();
  }

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(lease.url())).await.unwrap();
    let err = db
      .ensure_schema_ready()
      .await
      .expect_err("partial DB must fail baseline gate check");
    match err {
      DbError::SteppingStoneRequired {
        missing_migrations,
        message,
      } => {
        assert!(
          message.contains("v0.27.5"),
          "error message must instruct v0.27.5 upgrade, got: {message}"
        );
        assert_eq!(missing_migrations, vec![last_migration]);
      }
      other => panic!("expected SteppingStoneRequired, got {other:?}"),
    }
    db.pool().close().await;
  });
}

#[test]
fn existing_0275_db_boots_cleanly_without_touching_prisma_migrations() {
  let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
  let disk_set = MigrationSet::load(&repo_migrations_dir()).unwrap();
  let template = cluster.ensure_template(&disk_set).unwrap();
  let lease = cluster.lease(&template, DEFAULT_LEASE_TTL).unwrap();

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(lease.url())).await.unwrap();
    let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
    let before: Vec<(String, String, String, i32)> = sqlx::query_as(
      r#"SELECT id, migration_name, checksum, applied_steps_count
         FROM "_prisma_migrations"
         ORDER BY migration_name"#,
    )
    .fetch_all(conn.as_conn())
    .await
    .unwrap();
    drop(conn);

    // All Prisma migrations present, but `schema_baseline_0275` cutover checkpoint
    // missing: must be blocked with SteppingStoneRequired.
    let err = db
      .ensure_schema_ready()
      .await
      .expect_err("existing DB without schema_baseline_0275 cutover checkpoint must fail");
    match err {
      DbError::SteppingStoneRequired {
        missing_migrations,
        message,
      } => {
        assert!(missing_migrations.is_empty());
        assert!(message.contains("v0.27.5"), "unexpected message: {message}");
      }
      other => panic!("expected SteppingStoneRequired, got {other:?}"),
    }

    // Simulate v0.27.5 cutover writing the completed `schema_baseline_0275` marker.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      sqlx::raw_sql(
        r#"CREATE TABLE IF NOT EXISTS storage_reconciliation_checkpoints (
             kind TEXT NOT NULL,
             scope TEXT NOT NULL,
             status TEXT NOT NULL,
             cursor JSONB NOT NULL DEFAULT '{}',
             last_key TEXT,
             last_sid INTEGER,
             completed_at TIMESTAMPTZ(3),
             updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
             metadata JSONB NOT NULL DEFAULT '{}',
             PRIMARY KEY (kind, scope)
           );
           INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, completed_at)
           VALUES ('schema_baseline_0275', 'global', 'completed', now())
           ON CONFLICT (kind, scope) DO UPDATE SET status = 'completed';"#,
      )
      .execute(conn.as_conn())
      .await
      .unwrap();
    }

    let readiness = db.ensure_schema_ready().await.unwrap();
    assert_eq!(
      readiness,
      SchemaReadiness::ReadyExisting0275 {
        verified_migrations: disk_set.migrations.len()
      }
    );

    let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
    let after: Vec<(String, String, String, i32)> = sqlx::query_as(
      r#"SELECT id, migration_name, checksum, applied_steps_count
         FROM "_prisma_migrations"
         ORDER BY migration_name"#,
    )
    .fetch_all(conn.as_conn())
    .await
    .unwrap();
    assert_eq!(
      before, after,
      "_prisma_migrations must never be modified on existing DB"
    );

    let ledger_exists: bool = sqlx::query_scalar("SELECT to_regclass('public.native_schema_migrations') IS NOT NULL")
      .fetch_one(conn.as_conn())
      .await
      .unwrap();
    assert!(ledger_exists);
    let runtime_table_exists: bool =
      sqlx::query_scalar("SELECT to_regclass('public.storage_reconciliation_checkpoints') IS NOT NULL")
        .fetch_one(conn.as_conn())
        .await
        .unwrap();
    assert!(runtime_table_exists, "existing-DB bootstrap must ensure runtime tables exist");
    drop(conn);
    db.pool().close().await;
  });
}

#[test]
fn embedded_begin_commit_migration_rolls_back_atomically_and_retries_cleanly() {
  let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
  let empty = EmptyDbGuard::create(&cluster, "txatom");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url)).await.unwrap();
    let mut conn = db.dedicated_session_conn().await.unwrap();

    sqlx::raw_sql(
      r#"CREATE TABLE "_prisma_migrations" (
           "id" VARCHAR(36) PRIMARY KEY NOT NULL,
           "checksum" VARCHAR(64) NOT NULL,
           "finished_at" TIMESTAMPTZ,
           "migration_name" VARCHAR(255) NOT NULL,
           "logs" TEXT,
           "rolled_back_at" TIMESTAMPTZ,
           "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
           "applied_steps_count" INTEGER NOT NULL DEFAULT 0
         )"#,
    )
    .execute(&mut conn)
    .await
    .unwrap();

    let migration_sql = "\
BEGIN;
CREATE TABLE atomic_tx_probe (id INT PRIMARY KEY);
COMMIT;
";
    let checksum = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    // Simulate a failure after DDL runs (before transaction commit): if embedded
    // `COMMIT;` were not stripped, `atomic_tx_probe` would survive rollback.
    {
      use sqlx::Connection as _;
      let mut tx = conn.begin().await.unwrap();
      server_db::schema::apply_migration_sql_and_record_in_tx(
        &mut tx,
        "20261107092000_atomic_probe",
        checksum,
        migration_sql,
      )
      .await
      .unwrap();
      tx.rollback().await.unwrap();
    }

    let table_survived: bool = sqlx::query_scalar("SELECT to_regclass('public.atomic_tx_probe') IS NOT NULL")
      .fetch_one(&mut conn)
      .await
      .unwrap();
    assert!(
      !table_survived,
      "DDL inside embedded BEGIN/COMMIT must roll back completely when outer tx rolls back"
    );
    let ledger_rows: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "_prisma_migrations""#)
      .fetch_one(&mut conn)
      .await
      .unwrap();
    assert_eq!(ledger_rows, 0);

    // Retry cleanly and commit: both DDL and `_prisma_migrations` row commit together.
    {
      use sqlx::Connection as _;
      let mut tx = conn.begin().await.unwrap();
      server_db::schema::apply_migration_sql_and_record_in_tx(
        &mut tx,
        "20261107092000_atomic_probe",
        checksum,
        migration_sql,
      )
      .await
      .unwrap();
      tx.commit().await.unwrap();
    }

    let table_exists: bool = sqlx::query_scalar("SELECT to_regclass('public.atomic_tx_probe') IS NOT NULL")
      .fetch_one(&mut conn)
      .await
      .unwrap();
    assert!(table_exists);
    let ledger_rows: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "_prisma_migrations""#)
      .fetch_one(&mut conn)
      .await
      .unwrap();
    assert_eq!(ledger_rows, 1);

    drop(conn);
    db.pool().close().await;
  });
}

#[test]
fn tiered_semaphores_timeouts_and_query_scope_counters() {
  let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
  let empty = EmptyDbGuard::create(&cluster, "runtime");

  let rt = test_runtime();
  rt.block_on(async {
    let mut cfg = DbConfig::new(&empty.url);
    cfg.channel = "canary".to_owned();
    cfg.role = ServerRole::Graphql;
    cfg.max_connections = 6;
    cfg.statement_timeout_ms = 200;
    cfg.tier_permits = [1, 1, 1, 1];

    let db = ServerDb::connect(cfg).await.unwrap();

    // 1. Verify per-connection session parameters (`application_name`, `statement_timeout`, `idle_in_transaction_session_timeout`).
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let (app_name, stmt_timeout, idle_tx_timeout): (String, String, String) = sqlx::query_as(
        "SELECT current_setting('application_name'), \
                current_setting('statement_timeout'), \
                current_setting('idle_in_transaction_session_timeout')",
      )
      .fetch_one(conn.as_conn())
      .await
      .unwrap();
      assert_eq!(app_name, "affine:canary:graphql:v2");
      assert_eq!(stmt_timeout, "200ms");
      assert_eq!(idle_tx_timeout, "10s");
    }

    // 2. Verify 4-tier Semaphore backpressure: holding InteractiveRead blocks a second
    // InteractiveRead until released, while InteractiveWrite proceeds immediately.
    {
      let held_read = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let write_conn = tokio::time::timeout(
        Duration::from_millis(500),
        db.acquire_tiered(WorkloadTier::InteractiveWrite),
      )
      .await
      .expect("InteractiveWrite must not be blocked by InteractiveRead permit exhaustion")
      .unwrap();
      drop(write_conn);

      let db_clone = db.clone();
      let waiter = tokio::spawn(async move {
        let started = Instant::now();
        let _conn = db_clone.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
        started.elapsed()
      });
      tokio::time::sleep(Duration::from_millis(120)).await;
      drop(held_read);
      let waited = waiter.await.unwrap();
      assert!(
        waited >= Duration::from_millis(100),
        "second InteractiveRead should wait for permit release, waited {waited:?}"
      );
    }

    // 3. Verify statement_timeout actually aborts slow pg_sleep with SQLSTATE 57014.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let err = sqlx::query("SELECT pg_sleep(1.5)")
        .execute(conn.as_conn())
        .await
        .expect_err("pg_sleep(1.5) must be canceled by 200ms statement_timeout");
      assert_eq!(
        err.as_database_error().and_then(|d| d.code()).as_deref(),
        Some("57014"),
        "expected query_canceled (57014), got {err}"
      );
    }

    // 4. Verify with_long_query_timeout locally relaxes statement_timeout inside the transaction
    // and automatically counts business queries inside `with_query_scope`.
    let (long_ok, long_snap) = with_query_scope(async {
      db.with_long_query_timeout(2_500, |tx| {
        Box::pin(async move {
          sqlx::query("SELECT pg_sleep(0.35)").execute(&mut *tx).await?;
          let val: i32 = sqlx::query_scalar("SELECT 42").fetch_one(&mut *tx).await?;
          Ok(val)
        })
      })
      .await
      .expect("with_long_query_timeout must allow 350ms query")
    })
    .await;
    assert_eq!(long_ok, 42);
    assert_eq!(long_snap.pool_acquires, 1);
    assert_eq!(long_snap.transactions, 1);
    assert_eq!(long_snap.queries, 2);

    // Confirm pooled connections still enforce the default 200ms timeout afterward.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::LongQuery).await.unwrap();
      let stmt_timeout: String = sqlx::query_scalar("SHOW statement_timeout")
        .fetch_one(conn.as_conn())
        .await
        .unwrap();
      assert_eq!(stmt_timeout, "200ms");
    }

    // 5. Verify with_query_scope automatic query counting & isolation across concurrent tasks.
    let db_a = db.clone();
    let db_b = db.clone();
    let (res_a, res_b) = tokio::join!(
      tokio::spawn(async move {
        with_query_scope(async move {
          let mut c = db_a.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
          let _: i32 = sqlx::query_scalar("SELECT 1").fetch_one(&mut c).await.unwrap();
          let _: i32 = sqlx::query_scalar("SELECT 2").fetch_one(&mut c).await.unwrap();
        })
        .await
        .1
      }),
      tokio::spawn(async move {
        with_query_scope(async move {
          let mut tx = db_b.begin_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
          let _: i32 = sqlx::query_scalar("SELECT 3").fetch_one(&mut tx).await.unwrap();
          tx.commit().await.unwrap();
        })
        .await
        .1
      }),
    );
    let snap_a = res_a.unwrap();
    let snap_b = res_b.unwrap();
    assert_eq!(snap_a.pool_acquires, 1);
    assert_eq!(snap_a.transactions, 0);
    assert_eq!(snap_a.queries, 2);
    assert!(snap_a.assert_within(2, 0, 1).is_ok());

    assert_eq!(snap_b.pool_acquires, 1);
    assert_eq!(snap_b.transactions, 1);
    assert_eq!(snap_b.queries, 1);
    assert!(snap_b.assert_within(1, 1, 1).is_ok());
    assert!(snap_b.assert_within(0, 1, 1).is_err());

    db.pool().close().await;
  });
}
