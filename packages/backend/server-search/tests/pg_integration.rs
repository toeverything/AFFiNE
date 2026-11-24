use std::sync::{Arc, Mutex};
use std::time::Duration;

// Serialize private-cluster xmin tests so at most one private PG16 container runs at a time,
// and drop each PgCluster at the end of its test so no Docker/Podman container leaks.
static PRIVATE_CLUSTER_LOCK: Mutex<()> = Mutex::new(());

fn private_cluster() -> PgCluster {
  PgCluster::start_docker().expect("start private PG16 cluster")
}

fn enabled_search_config() -> SearchConfig {
  assert!(
    !SearchConfig::default().enabled,
    "SearchConfig::default must be disabled"
  );
  SearchConfig {
    enabled: true,
    ..SearchConfig::default()
  }
}

use server_db::{DbConfig, ServerDb};
use server_search::doc_extract::build_test_doc;
use server_search::generation::{config_hash, provider_identity};
use server_search::worker::{OrphanGcFence, capture_orphan_gc_high_water};
use server_search::{
  AggregateHitsOptions, AggregateOptions, AggregateRequest, SearchConfig, SearchError, SearchOptions, SearchPagination,
  SearchQuery, SearchRequest, SearchRuntime, SearchTable, expire_lockless_v2_lease, is_lockless_v2_active,
  renew_lockless_v2_lease, renew_lockless_v2_lease_for,
};
use server_spi::CommunityQuotaGate;
use server_types::ServerRole;
use sha2::{Digest, Sha256};
use test_db_harness::migrations::MigrationSet;
use test_db_harness::pg::{DEFAULT_LEASE_TTL, DbLease, PgCluster};
use uuid::Uuid;

struct EmptyDbGuard {
  _lease: DbLease,
  url: String,
}

impl EmptyDbGuard {
  fn create(cluster: &PgCluster, _prefix: &str) -> Self {
    let migrations = MigrationSet {
      migrations: vec![],
      digest: "5e20000000000099".to_owned(),
    };
    let template = cluster.ensure_template(&migrations).expect("ensure empty template");
    let lease = cluster
      .lease(&template, DEFAULT_LEASE_TTL)
      .expect("lease test database");
    let url = lease.url().to_owned();
    Self { _lease: lease, url }
  }
}

fn test_runtime() -> tokio::runtime::Runtime {
  tokio::runtime::Builder::new_multi_thread()
    .worker_threads(4)
    .enable_all()
    .build()
    .expect("build tokio runtime")
}

async fn setup_db(url: &str) -> ServerDb {
  let mut cfg = DbConfig::new(url);
  cfg.role = ServerRole::Allinone;
  cfg.max_connections = 12;
  cfg.statement_timeout_ms = 10_000;
  let db = ServerDb::connect(cfg).await.expect("connect test db");
  sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    .execute(db.pool())
    .await
    .expect("reset public schema");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  db
}

async fn activate_workspace_lifecycle(pool: &sqlx::PgPool, workspace_ids: &[&str]) {
  sqlx::query(
    "INSERT INTO storage_reconciliation_checkpoints(kind, scope, status, completed_at)
     VALUES ('workspace_doc_lifecycle_activation', 'global', 'active', now())
     ON CONFLICT (kind, scope) DO UPDATE SET status = 'active'",
  )
  .execute(pool)
  .await
  .unwrap();
  for ws_id in workspace_ids {
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints(kind, scope, status, completed_at)
       VALUES ('workspace_doc_lifecycle', $1, 'completed', now())
       ON CONFLICT (kind, scope) DO UPDATE SET status = 'completed'",
    )
    .bind(ws_id)
    .execute(pool)
    .await
    .unwrap();
  }
}

#[test]
fn cross_workspace_writes_do_not_block_on_generation_or_gc() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_crossws");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();
    renew_lockless_v2_lease(&pool).await.unwrap();
    assert!(is_lockless_v2_active(&pool).await.unwrap());

    let ws_a = format!("ws-a-{}", Uuid::new_v4().simple());
    let ws_b = format!("ws-b-{}", Uuid::new_v4().simple());
    let ws_orphan = format!("ws-orphan-{}", Uuid::new_v4().simple());
    for ws in [&ws_a, &ws_b, &ws_orphan] {
      sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
        .bind(ws)
        .execute(&pool)
        .await
        .unwrap();
    }
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&ws_orphan)
      .execute(&pool)
      .await
      .unwrap();

    let runtime = SearchRuntime::new(
      pool.clone(),
      Arc::new(CommunityQuotaGate::new()),
      enabled_search_config(),
    )
    .expect("build search runtime");
    runtime.initialize().await.unwrap();

    // Workspace A opens a snapshot write transaction and holds it uncommitted.
    let mut tx_a = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, $2, $3, now())")
      .bind(&ws_a)
      .bind("doc-a")
      .bind(build_test_doc("Doc A", "alpha body", "doc-a"))
      .execute(&mut *tx_a)
      .await
      .unwrap();

    // While tx_a is held open:
    // 1) Orphan GC high-water capture for another workspace succeeds immediately.
    let orphan_hw = tokio::time::timeout(Duration::from_secs(2), capture_orphan_gc_high_water(&pool, &ws_orphan))
      .await
      .expect("orphan GC must not block on workspace A write")
      .unwrap();
    assert!(matches!(orphan_hw, OrphanGcFence::Ready(_)));

    // 2) Generation ensure (search-projection-lifecycle) succeeds immediately.
    tokio::time::timeout(Duration::from_secs(2), runtime.initialize())
      .await
      .expect("generation ensure must not block on workspace A write")
      .unwrap();

    // 3) Workspace B writes and commits snapshots immediately with zero wait.
    let mut tx_b = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL lock_timeout = '1s'")
      .execute(&mut *tx_b)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, $2, $3, now())")
      .bind(&ws_b)
      .bind("doc-b")
      .bind(build_test_doc("Doc B", "beta body", "doc-b"))
      .execute(&mut *tx_b)
      .await
      .unwrap();
    tokio::time::timeout(Duration::from_secs(2), tx_b.commit())
      .await
      .expect("workspace B commit must not block on workspace A or generation")
      .unwrap();

    tx_a.commit().await.unwrap();
    db.pool().close().await;
  });
}

#[test]
fn xid8_xmin_fence_captures_late_committing_workspace_and_enforces_acl() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_xid8");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();
    renew_lockless_v2_lease(&pool).await.unwrap();

    let owner_id = format!("owner-{}", Uuid::new_v4().simple());
    let member_id = format!("member-{}", Uuid::new_v4().simple());
    let outsider_id = format!("outsider-{}", Uuid::new_v4().simple());
    for (uid, name) in [(&owner_id, "Owner"), (&member_id, "Member"), (&outsider_id, "Outsider")] {
      sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, $2, $3, true, false)")
        .bind(uid)
        .bind(name)
        .bind(format!("{uid}@affine.test"))
        .execute(&pool)
        .await
        .unwrap();
    }

    let ws_old = format!("ws-old-{}", Uuid::new_v4().simple());
    let ws_late = format!("ws-late-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_old)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state)
       VALUES ($1, $2, $3, 'owner', 'legacy', 'active')",
    )
    .bind(format!("m-old-{}", Uuid::new_v4().simple()))
    .bind(&ws_old)
    .bind(&owner_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, $2, $3, now())")
      .bind(&ws_old)
      .bind("doc-old")
      .bind(build_test_doc("Old Document", "searchable keyword alpha", "doc-old"))
      .execute(&pool)
      .await
      .unwrap();

    // Start late writer T_w BEFORE creating the building generation.
    let mut tx_late = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_late)
      .execute(&mut *tx_late)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state)
       VALUES ($1, $2, $3, 'owner', 'legacy', 'active'),
              ($4, $2, $5, 'member', 'legacy', 'active')",
    )
    .bind(format!("m-l1-{}", Uuid::new_v4().simple()))
    .bind(&ws_late)
    .bind(&owner_id)
    .bind(format!("m-l2-{}", Uuid::new_v4().simple()))
    .bind(&member_id)
    .execute(&mut *tx_late)
    .await
    .unwrap();
    // Private doc (member_default_role = 'none') + member-readable doc.
    sqlx::query(
      "INSERT INTO doc_access_policies(workspace_id, doc_id, visibility, member_default_role)
       VALUES ($1, 'doc-private', 'private', 'none')",
    )
    .bind(&ws_late)
    .execute(&mut *tx_late)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO snapshots(workspace_id, guid, blob, updated_at)
       VALUES ($1, 'doc-private', $2, now()), ($1, 'doc-shared', $3, now())",
    )
    .bind(&ws_late)
    .bind(build_test_doc("Private Secret", "keyword nebula secret", "doc-private"))
    .bind(build_test_doc("Shared Note", "keyword nebula shared", "doc-shared"))
    .execute(&mut *tx_late)
    .await
    .unwrap();

    activate_workspace_lifecycle(&pool, &[&ws_old, &ws_late]).await;

    let runtime = SearchRuntime::new(
      pool.clone(),
      Arc::new(CommunityQuotaGate::new()),
      enabled_search_config(),
    )
    .expect("build search runtime");
    runtime.initialize().await.unwrap();

    // Reconcile twice while T_w is still uncommitted: beat 1 records fenceXid, beat 2 checks
    // pg_snapshot_xmin >= fenceXid and must hold scan_high_water_sid NULL!
    runtime.reconcile_pending(50).await.unwrap();
    runtime.reconcile_pending(50).await.unwrap();
    let (state, hw): (String, Option<i32>) = sqlx::query_as(
      "SELECT state, scan_high_water_sid FROM search_projection.generations ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(state, "building");
    assert!(
      hw.is_none(),
      "scan_high_water_sid must remain NULL while earlier transaction T_w is still open"
    );

    // Now commit T_w.
    tx_late.commit().await.unwrap();

    // Drive reconciliation deterministically until generation activates.
    for _ in 0..12 {
      runtime.reconcile_pending(50).await.unwrap();
      let state: String =
        sqlx::query_scalar("SELECT state FROM search_projection.generations ORDER BY created_at DESC LIMIT 1")
          .fetch_one(&pool)
          .await
          .unwrap();
      if state == "active" {
        break;
      }
    }
    let active_gen = runtime.active_generation().await.expect("generation must activate");
    assert!(active_gen.manifest.get("fenceXid").is_some());
    assert!(active_gen.manifest.get("createdXid").is_none());

    let query_nebula = SearchRequest {
      table: SearchTable::Block,
      query: SearchQuery {
        query_type: "match".to_owned(),
        field: Some("content".to_owned()),
        match_value: Some("nebula".to_owned()),
        query: None,
        queries: None,
        occur: None,
        boost: None,
      },
      options: SearchOptions {
        fields: vec!["docId".to_owned(), "content".to_owned()],
        highlights: vec![],
        pagination: SearchPagination {
          limit: Some(10),
          skip: None,
          cursor: None,
        },
      },
    };

    // Owner sees both private and shared docs in ws_late.
    let owner_res = runtime
      .search_authorized(&owner_id, &ws_late, query_nebula.clone())
      .await
      .unwrap();
    let owner_docs: std::collections::BTreeSet<String> = owner_res["nodes"]
      .as_array()
      .unwrap()
      .iter()
      .map(|n| n["fields"]["doc_id"][0].as_str().unwrap().to_owned())
      .collect();
    assert!(owner_docs.contains("doc-private"));
    assert!(owner_docs.contains("doc-shared"));

    // Member sees only doc-shared, NOT doc-private.
    let member_res = runtime
      .search_authorized(&member_id, &ws_late, query_nebula.clone())
      .await
      .unwrap();
    let member_docs: std::collections::BTreeSet<String> = member_res["nodes"]
      .as_array()
      .unwrap()
      .iter()
      .map(|n| n["fields"]["doc_id"][0].as_str().unwrap().to_owned())
      .collect();
    assert!(!member_docs.contains("doc-private"));
    assert!(member_docs.contains("doc-shared"));

    // Outsider is denied access to private workspace.
    let outsider_err = runtime
      .search_authorized(&outsider_id, &ws_late, query_nebula)
      .await
      .expect_err("outsider must be denied");
    assert_eq!(outsider_err.error_code(), "workspace_denied");

    db.pool().close().await;
  });
}

#[test]
fn same_id_workspace_delete_recreate_preserves_new_projections() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_gc_recreate");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();
    renew_lockless_v2_lease(&pool).await.unwrap();

    let ws_id = format!("ws-reuse-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();

    let high_water = match capture_orphan_gc_high_water(&pool, &ws_id).await.unwrap() {
      OrphanGcFence::Ready(hw) => hw,
      other => panic!("deleted workspace must yield Ready high-water fence, got {other:?}"),
    };

    // Recreate workspace with identical ID and allocate a newer source_version (> high_water).
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();
    let recreated_sv: i64 = sqlx::query_scalar("SELECT nextval('search_projection.source_mutation_version')")
      .fetch_one(&pool)
      .await
      .unwrap();
    assert!(recreated_sv > high_water);

    let runtime = SearchRuntime::new(
      pool.clone(),
      Arc::new(CommunityQuotaGate::new()),
      enabled_search_config(),
    )
    .expect("build search runtime");
    let gen_id = Uuid::new_v4();
    runtime.embedded().prepare_generation(gen_id).await;
    runtime
      .embedded()
      .write_for_generation(
        gen_id,
        "doc",
        vec![
          serde_json::json!({
            "generation_id": gen_id.to_string(),
            "workspace_id": ws_id,
            "doc_id": "old-doc",
            "source_version": high_water,
            "permission_version": 1,
            "title": "old incarnation"
          }),
          serde_json::json!({
            "generation_id": gen_id.to_string(),
            "workspace_id": ws_id,
            "doc_id": "new-doc",
            "source_version": recreated_sv,
            "permission_version": 1,
            "title": "recreated incarnation"
          }),
        ],
      )
      .await
      .unwrap();

    runtime
      .embedded()
      .gc_workspace_for_generation(gen_id, "doc", &ws_id, high_water, 100)
      .await
      .unwrap();

    let remaining = runtime
      .embedded()
      .search_for_generation(
        gen_id,
        "doc",
        serde_json::json!({
          "query": {"term": {"workspace_id": {"value": ws_id}}},
          "fields": ["doc_id", "source_version"],
          "size": 10
        }),
      )
      .await
      .unwrap();
    assert_eq!(remaining["total"], 1);
    assert_eq!(remaining["nodes"][0]["fields"]["doc_id"][0], "new-doc");
    assert_eq!(remaining["nodes"][0]["fields"]["source_version"][0], recreated_sv);

    db.pool().close().await;
  });
}

#[test]
fn same_workspace_steady_state_concurrent_doc_writes_do_not_contend() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_hotrow");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();
    renew_lockless_v2_lease(&pool).await.unwrap();

    let ws_id = format!("ws-steady-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();
    activate_workspace_lifecycle(&pool, &[&ws_id]).await;

    let runtime = SearchRuntime::new(
      pool.clone(),
      Arc::new(CommunityQuotaGate::new()),
      enabled_search_config(),
    )
    .expect("build search runtime");
    runtime.initialize().await.unwrap();
    for _ in 0..8 {
      runtime.reconcile_pending(50).await.unwrap();
    }
    let active_gen = runtime.active_generation().await.unwrap();

    // Verify workspace_states is naturally in completed steady state with available_at > now()
    // (complete_workspace sets available_at = now() + 3600s; do NOT manually rewind it).
    let (covered, available_in_future): (bool, bool) = sqlx::query_as(
      "SELECT covered, available_at > now()
       FROM search_projection.workspace_states
       WHERE generation_id = $1 AND workspace_id = $2",
    )
    .bind(active_gen.id)
    .bind(&ws_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(covered, "workspace must be covered in steady state");
    assert!(
      available_in_future,
      "complete_workspace must set available_at in the future"
    );

    // Hold a FOR NO KEY UPDATE row lock on search_projection.workspace_states for this workspace.
    // PostgreSQL allows FK checks (FOR KEY SHARE from INSERT INTO document_states) concurrently
    // with FOR NO KEY UPDATE, while any UPDATE to workspace_states conflicts with FOR NO KEY
    // UPDATE. Thus tx_writer succeeding while available_at > now() proves capture_snapshot_mutation
    // skipped the hot-row UPDATE on workspace_states in real steady state.
    let mut tx_holder = pool.begin().await.unwrap();
    sqlx::query(
      "SELECT 1 FROM search_projection.workspace_states
       WHERE generation_id = $1 AND workspace_id = $2
       FOR NO KEY UPDATE",
    )
    .bind(active_gen.id)
    .bind(&ws_id)
    .fetch_one(&mut *tx_holder)
    .await
    .unwrap();

    let mut tx_writer = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL lock_timeout = '1s'")
      .execute(&mut *tx_writer)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-1', $2, now())")
      .bind(&ws_id)
      .bind(build_test_doc("Doc 1", "body 1", "doc-1"))
      .execute(&mut *tx_writer)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-2', $2, now())")
      .bind(&ws_id)
      .bind(build_test_doc("Doc 2", "body 2", "doc-2"))
      .execute(&mut *tx_writer)
      .await
      .unwrap();

    tx_writer.commit().await.unwrap();
    tx_holder.rollback().await.unwrap();

    // Verify available_at stayed in the future (workspace_states row was untouched)
    // and both documents were enqueued in document_states.
    let still_future: bool = sqlx::query_scalar(
      "SELECT available_at > now()
       FROM search_projection.workspace_states
       WHERE generation_id = $1 AND workspace_id = $2",
    )
    .bind(active_gen.id)
    .bind(&ws_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
      still_future,
      "steady-state snapshot write must not reset workspace_states.available_at"
    );

    // Verify both documents were enqueued in document_states without touching workspace_states.
    let doc_count: i64 = sqlx::query_scalar(
      "SELECT count(*) FROM search_projection.document_states
       WHERE generation_id = $1 AND workspace_id = $2 AND doc_id IN ('doc-1', 'doc-2')",
    )
    .bind(active_gen.id)
    .bind(&ws_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(doc_count, 2);

    db.pool().close().await;
  });
}

#[test]
fn expired_lockless_v2_lease_falls_back_to_global_shared_lock() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_fallback");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();

    let ws_id = format!("ws-fb-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();

    // Expire lease -> lockless_v2_active() must return false.
    expire_lockless_v2_lease(&pool).await.unwrap();
    assert!(!is_lockless_v2_active(&pool).await.unwrap());

    // Hold legacy exclusive global lock.
    let mut blocker = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
      .execute(&mut *blocker)
      .await
      .unwrap();

    // Snapshot write must block on the legacy global lock and hit lock_timeout (55P03).
    let mut fallback_tx = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL lock_timeout = '100ms'")
      .execute(&mut *fallback_tx)
      .await
      .unwrap();
    let err =
      sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-fb', $2, now())")
        .bind(&ws_id)
        .bind(build_test_doc("Fallback", "body", "doc-fb"))
        .execute(&mut *fallback_tx)
        .await
        .expect_err("expired lease must fall back to legacy global lock");
    assert_eq!(
      err.as_database_error().and_then(|d| d.code()).as_deref(),
      Some("55P03"),
      "expected lock_not_available (55P03), got {err}"
    );
    fallback_tx.rollback().await.unwrap();
    blocker.rollback().await.unwrap();

    // Cold-enable lease (drains legacy global lock once and sets fenced = true).
    renew_lockless_v2_lease(&pool).await.unwrap();
    assert!(is_lockless_v2_active(&pool).await.unwrap());

    // Now re-acquire legacy exclusive global lock -> active lockless_v2 snapshot write must bypass it!
    let mut blocker2 = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
      .execute(&mut *blocker2)
      .await
      .unwrap();

    let mut lockless_tx = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL lock_timeout = '1s'")
      .execute(&mut *lockless_tx)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-v2', $2, now())")
      .bind(&ws_id)
      .bind(build_test_doc("Lockless", "body", "doc-v2"))
      .execute(&mut *lockless_tx)
      .await
      .expect("active lockless_v2 lease must bypass global lock");
    lockless_tx.commit().await.unwrap();

    blocker2.rollback().await.unwrap();
    db.pool().close().await;
  });
}

#[test]
fn two_beat_fence_xid_closes_gap_a_and_gap_b() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_gap_ab");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();
    renew_lockless_v2_lease(&pool).await.unwrap();

    let owner_id = format!("owner-ab-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, 'Owner', $2, true, false)")
      .bind(&owner_id)
      .bind(format!("{owner_id}@affine.test"))
      .execute(&pool)
      .await
      .unwrap();

    let ws_gap_a = format!("ws-gapa-{}", Uuid::new_v4().simple());
    let ws_gap_b = format!("ws-gapb-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_gap_b)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state)
       VALUES ($1, $2, $3, 'owner', 'legacy', 'active')",
    )
    .bind(format!("m-b-{}", Uuid::new_v4().simple()))
    .bind(&ws_gap_b)
    .bind(&owner_id)
    .execute(&pool)
    .await
    .unwrap();
    activate_workspace_lifecycle(&pool, &[&ws_gap_a, &ws_gap_b]).await;

    let cfg = enabled_search_config();
    let gen_id = Uuid::new_v4();
    let manifest = serde_json::json!({
      "doc": "doc",
      "block": "block",
      "providerIdentity": provider_identity(&cfg)
    });

    // Gap A setup: T_gen inserts the building generation WITHOUT committing yet.
    let mut tx_gen = pool.begin().await.unwrap();
    sqlx::query(
      "INSERT INTO search_projection.generations (id, provider, state, config_hash, schema_version, manifest)
       VALUES ($1, $2, 'building', $3, 1, $4)",
    )
    .bind(gen_id)
    .bind(&cfg.provider)
    .bind(config_hash(&cfg))
    .bind(&manifest)
    .execute(&mut *tx_gen)
    .await
    .unwrap();

    // T_w starts AFTER T_gen inserted (so T_w.xid > T_gen.xid) yet cannot see uncommitted T_gen.
    // T_w inserts new workspace ws_gap_a (Gap A) and doc-1 into existing ws_gap_b (Gap B).
    let mut tx_w = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_gap_a)
      .execute(&mut *tx_w)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state)
       VALUES ($1, $2, $3, 'owner', 'legacy', 'active')",
    )
    .bind(format!("m-a-{}", Uuid::new_v4().simple()))
    .bind(&ws_gap_a)
    .bind(&owner_id)
    .execute(&mut *tx_w)
    .await
    .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-gap-a', $2, now())")
      .bind(&ws_gap_a)
      .bind(build_test_doc("Gap A Doc", "keyword gapalpha", "doc-gap-a"))
      .execute(&mut *tx_w)
      .await
      .unwrap();
    sqlx::query("INSERT INTO updates(workspace_id, guid, blob, created_at) VALUES ($1, 'doc-1', $2, now())")
      .bind(&ws_gap_b)
      .bind(build_test_doc("Gap B Doc 1", "keyword gapbeta", "doc-1"))
      .execute(&mut *tx_w)
      .await
      .unwrap();

    // Commit T_gen while T_w stays uncommitted.
    tx_gen.commit().await.unwrap();

    // Gap B post-fence committed writer T_2 writes doc-2 into existing ws_gap_b (trigger creates
    // workspace_states row for ws_gap_b while T_w is still open).
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-2', $2, now())")
      .bind(&ws_gap_b)
      .bind(build_test_doc("Gap B Doc 2", "keyword gapbeta", "doc-2"))
      .execute(&pool)
      .await
      .unwrap();

    let runtime =
      SearchRuntime::new(pool.clone(), Arc::new(CommunityQuotaGate::new()), cfg).expect("build search runtime");
    runtime.embedded().prepare_generation(gen_id).await;

    // Beat 1 records fenceXid = pg_snapshot_xmax; Beat 2 sees xmin < fenceXid and returns early.
    runtime.reconcile_pending(50).await.unwrap();
    runtime.reconcile_pending(50).await.unwrap();

    let (hw, has_fence): (Option<i32>, bool) = sqlx::query_as(
      "SELECT scan_high_water_sid, manifest ? 'fenceXid' FROM search_projection.generations WHERE id = $1",
    )
    .bind(gen_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(has_fence, "beat 1 must record fenceXid in manifest");
    assert!(
      hw.is_none(),
      "scan_high_water_sid must stay NULL while T_w is uncommitted"
    );

    // Gap B assertion: ws_gap_b must NOT be marked covered = true before T_w commits.
    let gap_b_covered: bool = sqlx::query_scalar(
      "SELECT covered FROM search_projection.workspace_states WHERE generation_id = $1 AND workspace_id = $2",
    )
    .bind(gen_id)
    .bind(&ws_gap_b)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
      !gap_b_covered,
      "ws_gap_b must not become covered while T_w is uncommitted"
    );

    // Commit T_w with ZERO subsequent writes; drive reconciliation to active.
    tx_w.commit().await.unwrap();
    for _ in 0..12 {
      runtime.reconcile_pending(50).await.unwrap();
      let state: String = sqlx::query_scalar("SELECT state FROM search_projection.generations WHERE id = $1")
        .bind(gen_id)
        .fetch_one(&pool)
        .await
        .unwrap();
      if state == "active" {
        break;
      }
    }
    let _ = runtime.active_generation().await.expect("generation must activate");

    // Verify Gap A workspace and doc-gap-a are searchable.
    let res_a = runtime
      .search_authorized(
        &owner_id,
        &ws_gap_a,
        SearchRequest {
          table: SearchTable::Block,
          query: SearchQuery {
            query_type: "match".to_owned(),
            field: Some("content".to_owned()),
            match_value: Some("gapalpha".to_owned()),
            query: None,
            queries: None,
            occur: None,
            boost: None,
          },
          options: SearchOptions {
            fields: vec!["docId".to_owned()],
            highlights: vec![],
            pagination: SearchPagination {
              limit: Some(10),
              skip: None,
              cursor: None,
            },
          },
        },
      )
      .await
      .unwrap();
    assert_eq!(res_a["nodes"].as_array().unwrap().len(), 1);
    assert_eq!(res_a["nodes"][0]["fields"]["doc_id"][0], "doc-gap-a");

    // Verify Gap B workspace has BOTH doc-1 (from T_w) and doc-2 (from T_2).
    let res_b = runtime
      .search_authorized(
        &owner_id,
        &ws_gap_b,
        SearchRequest {
          table: SearchTable::Block,
          query: SearchQuery {
            query_type: "match".to_owned(),
            field: Some("content".to_owned()),
            match_value: Some("gapbeta".to_owned()),
            query: None,
            queries: None,
            occur: None,
            boost: None,
          },
          options: SearchOptions {
            fields: vec!["docId".to_owned()],
            highlights: vec![],
            pagination: SearchPagination {
              limit: Some(10),
              skip: None,
              cursor: None,
            },
          },
        },
      )
      .await
      .unwrap();
    let docs_b: std::collections::BTreeSet<String> = res_b["nodes"]
      .as_array()
      .unwrap()
      .iter()
      .map(|n| n["fields"]["doc_id"][0].as_str().unwrap().to_owned())
      .collect();
    assert!(docs_b.contains("doc-1"), "doc-1 from uncommitted T_w must be indexed");
    assert!(docs_b.contains("doc-2"), "doc-2 from T_2 must be indexed");

    db.pool().close().await;
  });
}

#[test]
fn lockless_v2_enable_and_expiry_transitions_prevent_orphan_gc_race() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_bridge");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();

    // 1. Enable transition: expired lease -> uncommitted same-ID recreate writer holds legacy
    //    shared search-projection-generation lock.
    expire_lockless_v2_lease(&pool).await.unwrap();
    let ws_enable = format!("ws-en-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_enable)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&ws_enable)
      .execute(&pool)
      .await
      .unwrap();

    let mut tx_recreate = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_enable)
      .execute(&mut *tx_recreate)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-en', $2, now())")
      .bind(&ws_enable)
      .bind(build_test_doc("Enable Doc", "body", "doc-en"))
      .execute(&mut *tx_recreate)
      .await
      .unwrap();

    // Non-blocking enable: Beat 1 stages active + fenced=false, Beat 2 records fence_xid and keeps
    // fenced=false without blocking while tx_recreate is still open.
    renew_lockless_v2_lease(&pool).await.unwrap();

    // While fenced = false, capture_orphan_gc_high_water MUST defer and return LeaseDeferred.
    assert_eq!(
      capture_orphan_gc_high_water(&pool, &ws_enable).await.unwrap(),
      OrphanGcFence::LeaseDeferred,
      "orphan GC must defer before enable fence_xid drains"
    );

    // Commit tx_recreate; next renewal sees pg_snapshot_xmin >= fence_xid and flips fenced = true.
    tx_recreate.commit().await.unwrap();
    renew_lockless_v2_lease(&pool).await.unwrap();

    // After fence completes, capture_orphan_gc_high_water sees ws_enable exists.
    assert_eq!(
      capture_orphan_gc_high_water(&pool, &ws_enable).await.unwrap(),
      OrphanGcFence::WorkspaceExists,
      "recreated workspace must not be orphan-GC'd"
    );

    // 2. Expiry bridge transition: place lease inside the final 0..30s bridge window (15s left).
    sqlx::query(
      "UPDATE storage_reconciliation_checkpoints
       SET metadata = jsonb_build_object(
         'lease_expires_at', clock_timestamp() + interval '15 seconds',
         'fenced', true
       )
       WHERE kind = 'search_projection_lockless_v2' AND scope = 'global'",
    )
    .execute(&pool)
    .await
    .unwrap();

    let ws_bridge = format!("ws-br-{}", Uuid::new_v4().simple());
    let ws_orphan = format!("ws-or-{}", Uuid::new_v4().simple());

    // Inside <=30s bridge window, new orphan GC MUST defer even for an orphan workspace.
    assert_eq!(
      capture_orphan_gc_high_water(&pool, &ws_orphan).await.unwrap(),
      OrphanGcFence::LeaseDeferred,
      "orphan GC must defer inside the <=30s bridge window"
    );

    // Start uncommitted recreate writer inside bridge window: trigger takes BOTH
    // search-projection-generation shared AND search-projection-ws:<ws_bridge> shared.
    let mut tx_bridge = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_bridge)
      .execute(&mut *tx_bridge)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-br', $2, now())")
      .bind(&ws_bridge)
      .bind(build_test_doc("Bridge Doc", "body", "doc-br"))
      .execute(&mut *tx_bridge)
      .await
      .unwrap();

    // Lease expires immediately -> legacy exclusive GC on search-projection-generation MUST block
    // on tx_bridge until tx_bridge commits!
    expire_lockless_v2_lease(&pool).await.unwrap();
    let mut legacy_gc = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL lock_timeout = '100ms'")
      .execute(&mut *legacy_gc)
      .await
      .unwrap();
    let err = sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
      .execute(&mut *legacy_gc)
      .await
      .expect_err("legacy GC must block on bridge-window writer");
    assert_eq!(err.as_database_error().and_then(|d| d.code()).as_deref(), Some("55P03"));
    legacy_gc.rollback().await.unwrap();

    tx_bridge.commit().await.unwrap();
    db.pool().close().await;
  });
}

#[test]
fn admin_demotion_with_restricted_doc_excluded_from_search_and_aggregate() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_demote");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();
    renew_lockless_v2_lease(&pool).await.unwrap();

    let owner_id = format!("owner-d-{}", Uuid::new_v4().simple());
    let actor_id = format!("actor-d-{}", Uuid::new_v4().simple());
    for (uid, name) in [(&owner_id, "Owner"), (&actor_id, "DemotedAdmin")] {
      sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, $2, $3, true, false)")
        .bind(uid)
        .bind(name)
        .bind(format!("{uid}@affine.test"))
        .execute(&pool)
        .await
        .unwrap();
    }

    let ws_id = format!("ws-demote-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state)
       VALUES ($1, $2, $3, 'member', 'legacy', 'active'),
              ($4, $2, $5, 'owner', 'legacy', 'active')",
    )
    .bind(format!("m-o-{}", Uuid::new_v4().simple()))
    .bind(&ws_id)
    .bind(&owner_id)
    .bind(format!("m-a-{}", Uuid::new_v4().simple()))
    .bind(&actor_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies(workspace_id, doc_id, visibility, member_default_role)
       VALUES ($1, 'doc-secret', 'private', 'none')",
    )
    .bind(&ws_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO snapshots(workspace_id, guid, blob, updated_at)
       VALUES ($1, 'doc-public', $2, now()), ($1, 'doc-secret', $3, now())",
    )
    .bind(&ws_id)
    .bind(build_test_doc("Public Doc", "keyword zenith public", "doc-public"))
    .bind(build_test_doc("Secret Doc", "keyword zenith secret", "doc-secret"))
    .execute(&pool)
    .await
    .unwrap();
    activate_workspace_lifecycle(&pool, &[&ws_id]).await;

    let runtime = SearchRuntime::new(
      pool.clone(),
      Arc::new(CommunityQuotaGate::new()),
      enabled_search_config(),
    )
    .expect("build search runtime");
    runtime.initialize().await.unwrap();
    for _ in 0..10 {
      runtime.reconcile_pending(50).await.unwrap();
    }

    let make_search = || SearchRequest {
      table: SearchTable::Block,
      query: SearchQuery {
        query_type: "match".to_owned(),
        field: Some("content".to_owned()),
        match_value: Some("zenith".to_owned()),
        query: None,
        queries: None,
        occur: None,
        boost: None,
      },
      options: SearchOptions {
        fields: vec!["docId".to_owned()],
        highlights: vec![],
        pagination: SearchPagination {
          limit: Some(10),
          skip: None,
          cursor: None,
        },
      },
    };
    let make_agg = || AggregateRequest {
      table: SearchTable::Block,
      field: "docId".to_owned(),
      query: SearchQuery {
        query_type: "match".to_owned(),
        field: Some("content".to_owned()),
        match_value: Some("zenith".to_owned()),
        query: None,
        queries: None,
        occur: None,
        boost: None,
      },
      options: AggregateOptions {
        pagination: SearchPagination {
          limit: Some(10),
          skip: None,
          cursor: None,
        },
        hits: AggregateHitsOptions::default(),
      },
    };

    // Before demotion: admin sees both doc-public and doc-secret.
    let before_search = runtime
      .search_authorized(&actor_id, &ws_id, make_search())
      .await
      .unwrap();
    assert_eq!(before_search["nodes"].as_array().unwrap().len(), 2);

    // Demote actor from owner to member (transferring ownership to owner_id) and insert a new restricted doc-secret-2.
    let mut transfer_tx = pool.begin().await.unwrap();
    sqlx::query("UPDATE workspace_members SET role = 'member' WHERE workspace_id = $1 AND user_id = $2")
      .bind(&ws_id)
      .bind(&actor_id)
      .execute(&mut *transfer_tx)
      .await
      .unwrap();
    sqlx::query("UPDATE workspace_members SET role = 'owner' WHERE workspace_id = $1 AND user_id = $2")
      .bind(&ws_id)
      .bind(&owner_id)
      .execute(&mut *transfer_tx)
      .await
      .unwrap();
    transfer_tx.commit().await.unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies(workspace_id, doc_id, visibility, member_default_role)
       VALUES ($1, 'doc-secret-2', 'private', 'none')",
    )
    .bind(&ws_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-secret-2', $2, now())")
      .bind(&ws_id)
      .bind(build_test_doc("Secret Doc 2", "keyword zenith secret2", "doc-secret-2"))
      .execute(&pool)
      .await
      .unwrap();

    // Before reconciliation catches up, repeatable-read gate MUST reject with PermissionSyncing.
    let err_s = runtime
      .search_authorized(&actor_id, &ws_id, make_search())
      .await
      .unwrap_err();
    assert!(matches!(err_s, SearchError::PermissionSyncing), "got {err_s:?}");
    let err_a = runtime
      .aggregate_authorized(&actor_id, &ws_id, make_agg())
      .await
      .unwrap_err();
    assert!(matches!(err_a, SearchError::PermissionSyncing), "got {err_a:?}");

    // After reconciliation, both search_authorized and aggregate_authorized MUST return only doc-public.
    for _ in 0..8 {
      runtime.reconcile_pending(50).await.unwrap();
    }
    let after_search = runtime
      .search_authorized(&actor_id, &ws_id, make_search())
      .await
      .unwrap();
    let search_docs: std::collections::BTreeSet<String> = after_search["nodes"]
      .as_array()
      .unwrap()
      .iter()
      .map(|n| n["fields"]["doc_id"][0].as_str().unwrap().to_owned())
      .collect();
    assert_eq!(search_docs, std::collections::BTreeSet::from(["doc-public".to_owned()]));

    let after_agg = runtime
      .aggregate_authorized(&actor_id, &ws_id, make_agg())
      .await
      .unwrap();
    let agg_keys: std::collections::BTreeSet<String> = after_agg["buckets"]
      .as_array()
      .unwrap()
      .iter()
      .map(|b| b["key"].as_str().unwrap().to_owned())
      .collect();
    assert_eq!(agg_keys, std::collections::BTreeSet::from(["doc-public".to_owned()]));

    db.pool().close().await;
  });
}

#[test]
fn v0275_migration_prefix_verification_accepts_v6_database() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_v0275_compat");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();

    let sql_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../native/src/runtime/sql");
    let v0275_files = [
      (1_i32, "search_projection.sql"),
      (2_i32, "search_projection_v2.sql"),
      (3_i32, "search_projection_v3.sql"),
      (4_i32, "search_projection_v4.sql"),
      (5_i32, "search_projection_v5.sql"),
    ];

    // Confirm v6 is recorded in native_schema_migrations.
    let max_version: i32 =
      sqlx::query_scalar("SELECT MAX(version) FROM native_schema_migrations WHERE component = 'search_projection'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(max_version, 6);

    // Simulate frozen v0.27.5 per-version checksum verification for versions 1..=5:
    // every checksum must match byte-for-byte and v6 is ignored cleanly.
    for (version, filename) in v0275_files {
      let bytes = std::fs::read(sql_dir.join(filename)).expect("read v0.27.5 sql");
      let expected_checksum: String = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();
      let recorded: Option<String> = sqlx::query_scalar(
        "SELECT checksum FROM native_schema_migrations WHERE component = 'search_projection' AND version = $1",
      )
      .bind(version)
      .fetch_optional(&pool)
      .await
      .unwrap();
      assert_eq!(
        recorded.as_deref(),
        Some(expected_checksum.as_str()),
        "v0.27.5 checksum mismatch for {filename} (version {version})"
      );
    }

    db.pool().close().await;
  });
}

#[test]
fn marker_xid_fence_covers_inverted_xid_order_and_quiet_natural_expiry() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_handover");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();

    // Case 1 (n / n+1 XID order): peer tx allocates XID n first, legacy writer allocates XID n+1
    // and stays uncommitted, then peer tx n commits (so latestCompletedXid == n and xmax == n+1 == xmin).
    // Enabling lockless_v2 must allocate a committed marker XID m > n+1 and keep fenced = false!
    expire_lockless_v2_lease(&pool).await.unwrap();
    let ws_inv = format!("ws-inv-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_inv)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&ws_inv)
      .execute(&pool)
      .await
      .unwrap();

    let mut tx_peer_n = pool.begin().await.unwrap();
    let xid_n: String = sqlx::query_scalar("SELECT pg_current_xact_id()::text")
      .fetch_one(&mut *tx_peer_n)
      .await
      .unwrap();

    let mut tx_writer_n1 = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_inv)
      .execute(&mut *tx_writer_n1)
      .await
      .unwrap();
    let xid_n1: String = sqlx::query_scalar("SELECT pg_current_xact_id()::text")
      .fetch_one(&mut *tx_writer_n1)
      .await
      .unwrap();
    assert!(xid_n1.parse::<u64>().unwrap() > xid_n.parse::<u64>().unwrap());

    // Commit XID n while XID n+1 remains uncommitted -> snapshot now has xmin == xmax == n+1!
    tx_peer_n.commit().await.unwrap();
    let xmin_eq_xmax: bool =
      sqlx::query_scalar("SELECT pg_snapshot_xmin(pg_current_snapshot()) = pg_snapshot_xmax(pg_current_snapshot())")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(xmin_eq_xmax, "reproduced xmin == xmax == n+1 snapshot state");

    renew_lockless_v2_lease(&pool).await.unwrap();
    assert_eq!(
      capture_orphan_gc_high_water(&pool, &ws_inv).await.unwrap(),
      OrphanGcFence::LeaseDeferred,
      "marker XID fence must stay unfenced while writer n+1 is uncommitted"
    );

    tx_writer_n1.commit().await.unwrap();
    renew_lockless_v2_lease(&pool).await.unwrap();
    assert_eq!(
      capture_orphan_gc_high_water(&pool, &ws_inv).await.unwrap(),
      OrphanGcFence::WorkspaceExists
    );

    // Case 2 (quiet-DB natural lease expiry): steady-state writer starts before natural expiry,
    // lease expires with zero writes after writer allocated its XID, operator commits marker XID M
    // via SELECT pg_current_xact_id() and waits for pg_snapshot_xmin > M.
    let ws_id = format!("ws-ho-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();

    // Set lease to expire naturally in the past after tx_steady already entered steady mode:
    // first start tx_steady while lease is steady (>30s), then move lease_expires_at into the past
    // BEFORE tx_steady allocates a higher XID? To simulate natural wall-clock expiry with ZERO DB
    // writes after tx_steady, set lease_expires_at = clock_timestamp() - 1s only before marker XID:
    let mut tx_steady = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_id)
      .execute(&mut *tx_steady)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-ho', $2, now())")
      .bind(&ws_id)
      .bind(build_test_doc("Handover Doc", "body", "doc-ho"))
      .execute(&mut *tx_steady)
      .await
      .unwrap();

    expire_lockless_v2_lease(&pool).await.unwrap();
    assert!(!is_lockless_v2_active(&pool).await.unwrap());
    let marker_xid: String = sqlx::query_scalar("SELECT pg_current_xact_id()::text")
      .fetch_one(&pool)
      .await
      .unwrap();
    let drained_before: bool = sqlx::query_scalar("SELECT pg_snapshot_xmin(pg_current_snapshot()) > $1::xid8")
      .bind(&marker_xid)
      .fetch_one(&pool)
      .await
      .unwrap();
    assert!(
      !drained_before,
      "marker XID check must report false while steady-state writer tx_steady is uncommitted"
    );

    tx_steady.commit().await.unwrap();
    let drained_after: bool = sqlx::query_scalar("SELECT pg_snapshot_xmin(pg_current_snapshot()) > $1::xid8")
      .bind(&marker_xid)
      .fetch_one(&pool)
      .await
      .unwrap();
    assert!(
      drained_after,
      "marker XID check must report true immediately on a quiet database once tx_steady commits"
    );

    let mut legacy_gc = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
      .execute(&mut *legacy_gc)
      .await
      .unwrap();
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
      .bind(&ws_id)
      .fetch_one(&mut *legacy_gc)
      .await
      .unwrap();
    assert!(
      exists,
      "legacy GC after handover drain must observe recreated workspace"
    );
    legacy_gc.rollback().await.unwrap();

    // Case 3 (Beat 2 paused after writing marker XID and before commit while Beat 1's deadline expires):
    // Pause production `renew_lockless_v2_lease_for` inside an AFTER UPDATE trigger right after Beat 2
    // allocates `fence_xid = m` (before Beat 2 commits), let Beat 1's committed deadline expire, start a
    // same-ID workspace recreate + snapshot write `tx_w` in legacy mode (`XID w > m`, uncommitted), then
    // release Beat 2. Production `renew_lockless_v2_lease_for` must preserve Beat 1's deadline during
    // Beat 2, detect that the deadline expired before Beat 2 committed, re-stage Beat 1 and allocate a
    // fresh marker `m2 > w`, and keep `OrphanGcFence::LeaseDeferred` until `tx_w` commits.
    expire_lockless_v2_lease(&pool).await.unwrap();

    let ws_exp_stage = format!("ws-exp-stage-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_exp_stage)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&ws_exp_stage)
      .execute(&pool)
      .await
      .unwrap();

    sqlx::raw_sql(
      "CREATE FUNCTION test_pause_beat2_marker() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.kind = 'search_projection_lockless_v2'
            AND NEW.scope = 'global'
            AND (NEW.metadata ? 'fence_xid')
            AND NEW.metadata->>'fenced' = 'false'
         THEN
           PERFORM pg_advisory_xact_lock(0, 770011);
         END IF;
         RETURN NEW;
       END;
       $$;
       CREATE TRIGGER test_pause_beat2_marker_trg
         AFTER UPDATE ON storage_reconciliation_checkpoints
         FOR EACH ROW EXECUTE FUNCTION test_pause_beat2_marker();",
    )
    .execute(&pool)
    .await
    .unwrap();

    let mut gate_conn = db.dedicated_session_conn().await.unwrap();
    sqlx::query("SELECT pg_advisory_lock(0, 770011)")
      .execute(&mut gate_conn)
      .await
      .unwrap();

    let renew_pool = pool.clone();
    let renew_handle = tokio::spawn(async move { renew_lockless_v2_lease_for(&renew_pool, 2).await });

    loop {
      let waiting: bool = sqlx::query_scalar(
        "SELECT EXISTS(
           SELECT 1 FROM pg_locks
           WHERE locktype = 'advisory'
             AND classid = 0
             AND objid = 770011
             AND objsubid = 2
             AND NOT granted
         )",
      )
      .fetch_one(&pool)
      .await
      .unwrap();
      if waiting {
        break;
      }
      tokio::task::yield_now().await;
    }

    // Wait for Beat 1's committed 2s deadline to pass while Beat 2 stays uncommitted.
    while is_lockless_v2_active(&pool).await.unwrap() {
      tokio::task::yield_now().await;
    }

    // Start legacy writer `tx_w` (`XID w > m`): recreates same-ID workspace and writes a snapshot
    // (allocating projection version `v` under the legacy global shared lock), staying uncommitted.
    let mut tx_w = pool.begin().await.unwrap();
    let w_xid: String = sqlx::query_scalar("SELECT pg_current_xact_id()::text")
      .fetch_one(&mut *tx_w)
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_exp_stage)
      .execute(&mut *tx_w)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-b2', $2, now())")
      .bind(&ws_exp_stage)
      .bind(build_test_doc("Beat2 Pause Doc", "body", "doc-b2"))
      .execute(&mut *tx_w)
      .await
      .unwrap();

    // Release Beat 2; production `renew_lockless_v2_lease_for` must re-stage Beat 1 + Beat 2 (`m2 > w`).
    sqlx::query("SELECT pg_advisory_unlock(0, 770011)")
      .execute(&mut gate_conn)
      .await
      .unwrap();
    renew_handle.await.unwrap().unwrap();

    let (fence_gt_w, fenced_flag): (bool, String) = sqlx::query_as(
      "SELECT (metadata->>'fence_xid')::xid8 > $1::xid8, metadata->>'fenced'
       FROM storage_reconciliation_checkpoints
       WHERE kind = 'search_projection_lockless_v2' AND scope = 'global'",
    )
    .bind(&w_xid)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
      fence_gt_w,
      "re-staged Beat 2 must commit a fresh fence_xid strictly greater than tx_w's XID"
    );
    assert_eq!(fenced_flag, "false");

    assert_eq!(
      capture_orphan_gc_high_water(&pool, &ws_exp_stage).await.unwrap(),
      OrphanGcFence::LeaseDeferred,
      "orphan GC must not return Ready(H) while legacy writer tx_w (w > m) is uncommitted"
    );

    tx_w.commit().await.unwrap();
    renew_lockless_v2_lease(&pool).await.unwrap();
    assert_eq!(
      capture_orphan_gc_high_water(&pool, &ws_exp_stage).await.unwrap(),
      OrphanGcFence::WorkspaceExists
    );

    sqlx::raw_sql(
      "DROP TRIGGER test_pause_beat2_marker_trg ON storage_reconciliation_checkpoints;
       DROP FUNCTION test_pause_beat2_marker();",
    )
    .execute(&pool)
    .await
    .unwrap();
    drop(gate_conn);

    db.pool().close().await;
  });
}

#[test]
fn legacy_mode_pre_lock_gap_rechecks_and_acquires_workspace_lock() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_prelock");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();
    expire_lockless_v2_lease(&pool).await.unwrap();

    let ws_id = format!("ws-gap-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();

    // Hold legacy exclusive search-projection-generation lock so tx_gap reads rem <= 0s and
    // blocks waiting to acquire the legacy shared lock (exact pre-lock gap).
    let mut legacy_holder = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
      .execute(&mut *legacy_holder)
      .await
      .unwrap();

    let writer_pool = pool.clone();
    let ws_writer = ws_id.clone();
    let (done_tx, done_rx) = tokio::sync::oneshot::channel::<()>();
    let (commit_tx, commit_rx) = tokio::sync::oneshot::channel::<()>();
    let writer_handle = tokio::spawn(async move {
      let mut tx_gap = writer_pool.begin().await.unwrap();
      sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
        .bind(&ws_writer)
        .execute(&mut *tx_gap)
        .await
        .unwrap();
      sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-gap', $2, now())")
        .bind(&ws_writer)
        .bind(build_test_doc("Gap Doc", "body", "doc-gap"))
        .execute(&mut *tx_gap)
        .await
        .unwrap();
      let _ = done_tx.send(());
      let _ = commit_rx.await;
      tx_gap.commit().await.unwrap();
    });

    // Wait deterministically via pg_locks WHERE NOT granted until tx_gap is blocked on
    // search-projection-generation (zero sleep).
    loop {
      let waiting: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted)")
          .fetch_one(&pool)
          .await
          .unwrap();
      if waiting {
        break;
      }
      tokio::task::yield_now().await;
    }

    // Enable lockless_v2 while tx_gap is paused in the pre-lock gap: must return immediately
    // without blocking on legacy_holder!
    tokio::time::timeout(Duration::from_secs(2), renew_lockless_v2_lease(&pool))
      .await
      .expect("renew_lockless_v2_lease must never block on legacy global lock")
      .unwrap();

    // Release legacy_holder so tx_gap acquires the legacy shared lock, re-checks rem2 > 0s,
    // and automatically acquires search-projection-ws:<ws_id> shared lock before pausing uncommitted.
    legacy_holder.rollback().await.unwrap();
    done_rx.await.unwrap();

    // Verify tx_gap holds search-projection-ws:<ws_id> shared lock (exclusive try-lock fails).
    let mut probe_tx = pool.begin().await.unwrap();
    let got_ws_lock: bool =
      sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended('search-projection-ws:' || $1, 0))")
        .bind(&ws_id)
        .fetch_one(&mut *probe_tx)
        .await
        .unwrap();
    assert!(
      !got_ws_lock,
      "post-lock re-check must have acquired search-projection-ws:<ws> shared lock on tx_gap"
    );
    probe_tx.rollback().await.unwrap();

    // Also verify another workspace's orphan GC is still LeaseDeferred because fence_xid hasn't drained.
    let ws_other = format!("ws-other-{}", Uuid::new_v4().simple());
    assert_eq!(
      capture_orphan_gc_high_water(&pool, &ws_other).await.unwrap(),
      OrphanGcFence::LeaseDeferred
    );

    // Commit tx_gap and renew lease -> fence drains and capture_orphan_gc_high_water sees ws_id exists.
    let _ = commit_tx.send(());
    writer_handle.await.unwrap();
    renew_lockless_v2_lease(&pool).await.unwrap();
    assert_eq!(
      capture_orphan_gc_high_water(&pool, &ws_id).await.unwrap(),
      OrphanGcFence::WorkspaceExists
    );

    db.pool().close().await;
  });
}

#[test]
fn bridge_window_defers_deleted_workspace_gc_until_lease_recovers() {
  let _xmin_guard = PRIVATE_CLUSTER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let cluster = private_cluster();
  let empty = EmptyDbGuard::create(&cluster, "s_defer_gc");

  test_runtime().block_on(async {
    let db = setup_db(&empty.url).await;
    let pool = db.pool().clone();
    renew_lockless_v2_lease(&pool).await.unwrap();

    let ws_id = format!("ws-del-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id, guid, blob, updated_at) VALUES ($1, 'doc-del', $2, now())")
      .bind(&ws_id)
      .bind(build_test_doc("Deleted Doc", "keyword phantom", "doc-del"))
      .execute(&pool)
      .await
      .unwrap();
    activate_workspace_lifecycle(&pool, &[&ws_id]).await;

    let runtime = SearchRuntime::new(
      pool.clone(),
      Arc::new(CommunityQuotaGate::new()),
      enabled_search_config(),
    )
    .expect("build search runtime");
    runtime.initialize().await.unwrap();
    for _ in 0..10 {
      runtime.reconcile_pending(50).await.unwrap();
    }
    let active_gen = runtime.active_generation().await.unwrap();

    // Confirm doc-del is published in the embedded index.
    let before = runtime
      .embedded()
      .search_for_generation(
        active_gen.id,
        "doc",
        serde_json::json!({
          "query": {"term": {"workspace_id": {"value": ws_id}}},
          "fields": ["doc_id"],
          "size": 10
        }),
      )
      .await
      .unwrap();
    assert_eq!(before["total"], 1);

    // Delete the workspace so workspace_states enters Deleted phase.
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&ws_id)
      .execute(&pool)
      .await
      .unwrap();

    // Hold an open write transaction on an unrelated workspace and move the lease into the
    // <= 30s bridge window (15s remaining). During reconcile_pending, renew_lockless_v2_lease
    // stages fenced = false with fence_xid > tx_open.xid, so orphan GC returns LeaseDeferred.
    let mut tx_open = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
      .bind(format!("ws-open-{}", Uuid::new_v4().simple()))
      .execute(&mut *tx_open)
      .await
      .unwrap();
    sqlx::query(
      "UPDATE storage_reconciliation_checkpoints
       SET metadata = jsonb_build_object(
         'lease_expires_at', clock_timestamp() + interval '15 seconds',
         'fenced', true
       )
       WHERE kind = 'search_projection_lockless_v2' AND scope = 'global'",
    )
    .execute(&pool)
    .await
    .unwrap();

    runtime.reconcile_pending(50).await.unwrap();

    // workspace_states row MUST be retained (not prematurely marked Complete) and old doc still present.
    let ws_state_count: i64 = sqlx::query_scalar(
      "SELECT count(*) FROM search_projection.workspace_states WHERE generation_id = $1 AND workspace_id = $2",
    )
    .bind(active_gen.id)
    .bind(&ws_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
      ws_state_count, 1,
      "LeaseDeferred must preserve deleted workspace_states progress row"
    );
    let during = runtime
      .embedded()
      .search_for_generation(
        active_gen.id,
        "doc",
        serde_json::json!({
          "query": {"term": {"workspace_id": {"value": ws_id}}},
          "fields": ["doc_id"],
          "size": 10
        }),
      )
      .await
      .unwrap();
    assert_eq!(
      during["total"], 1,
      "deferred GC must not purge docs before fence recovers"
    );

    // Release tx_open, recover steady fenced lease, and drive reconcile_pending through quiet sweep.
    tx_open.commit().await.unwrap();
    renew_lockless_v2_lease(&pool).await.unwrap();
    for _ in 0..8 {
      runtime.reconcile_pending(50).await.unwrap();
    }

    let after = runtime
      .embedded()
      .search_for_generation(
        active_gen.id,
        "doc",
        serde_json::json!({
          "query": {"term": {"workspace_id": {"value": ws_id}}},
          "fields": ["doc_id"],
          "size": 10
        }),
      )
      .await
      .unwrap();
    assert_eq!(
      after["total"], 0,
      "recovered lease must purge all deleted workspace docs"
    );

    // Advance the 120s quiet-phase timer deterministically (zero sleep) so the second pass
    // completes and removes the deleted workspace_states row.
    sqlx::query(
      "UPDATE search_projection.workspace_states SET available_at = now()
       WHERE generation_id = $1 AND workspace_id = $2",
    )
    .bind(active_gen.id)
    .bind(&ws_id)
    .execute(&pool)
    .await
    .unwrap();
    for _ in 0..4 {
      runtime.reconcile_pending(50).await.unwrap();
    }
    let ws_state_after: i64 = sqlx::query_scalar(
      "SELECT count(*) FROM search_projection.workspace_states WHERE generation_id = $1 AND workspace_id = $2",
    )
    .bind(active_gen.id)
    .bind(&ws_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
      ws_state_after, 0,
      "deleted workspace_states row must converge and be removed"
    );

    db.pool().close().await;
  });
}
