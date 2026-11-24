use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Barrier, Mutex};

use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use server_db::{DbConfig, ServerDb};
use server_domain::histories::{
  compact_pending_doc_updates_with_merge_hook, compact_pending_docs_batch, run_blocking_with_merge_permit,
};
use server_domain::users::UserService;
use server_spi::{BillingSpi, CommunityBillingSpi, CommunityQuotaGate, QuotaGate};
use server_types::{AccessGrant, BillingSubject, DomainError, LicenseTier, Limits, Rights};
use sqlx::{Postgres, Transaction};
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, PgCluster},
};
use tokio::sync::oneshot;
use uuid::Uuid;

fn setup_test_db() -> (test_db_harness::pg::DbLease, tokio::runtime::Runtime, ServerDb) {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster.lease(&template, DEFAULT_LEASE_TTL).expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .expect("build tokio runtime");

  let db = rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 8,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 4],
    })
    .await
    .expect("connect db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .expect("reset schema");
    db.ensure_schema_ready().await.expect("ensure schema");
    db
  });

  (lease, rt, db)
}

fn encode_doc_with_entry(key: &str, value: &str) -> Vec<u8> {
  let doc = y_octo::Doc::default();
  let mut map = doc.get_or_create_map("meta").expect("create map");
  map.insert(key.to_owned(), value.to_owned()).expect("insert entry");
  doc
    .encode_state_as_update_v1(&Default::default())
    .expect("encode update")
}

fn decode_map_value(blobs: &[Vec<u8>], key: &str) -> Option<String> {
  let mut doc = y_octo::Doc::default();
  for blob in blobs {
    doc.apply_update_from_binary_v1(blob).expect("apply update");
  }
  let map = doc.get_or_create_map("meta").expect("get map");
  match map.get(key) {
    Some(y_octo::Value::Any(y_octo::Any::String(value))) => Some(value),
    other => other.map(|v| v.to_string()),
  }
}

#[test]
fn phase2_holds_zero_locks_and_preserves_concurrent_appended_updates() {
  let (lease, rt, db) = setup_test_db();
  rt.block_on(async {
    let ws_id = Uuid::new_v4().to_string();
    let doc_a = "doc-phase2-target";
    let doc_b = "doc-phase2-peer";
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .expect("insert workspace");

    let u1 = encode_doc_with_entry("k1", "v1");
    let u2 = encode_doc_with_entry("k2", "v2");
    let peer_u = encode_doc_with_entry("peer", "ok");
    let t0 = Utc::now() - Duration::seconds(20);
    let t1 = Utc::now() - Duration::seconds(10);

    sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, $2, $3, $4)")
      .bind(&ws_id)
      .bind(doc_a)
      .bind(&u1)
      .bind(t0)
      .execute(db.pool())
      .await
      .expect("insert u1");

    let (entered_tx, entered_rx) = oneshot::channel::<()>();
    let (resume_tx, resume_rx) = oneshot::channel::<()>();
    let entered_tx = Arc::new(Mutex::new(Some(entered_tx)));
    let resume_rx = Arc::new(tokio::sync::Mutex::new(Some(resume_rx)));

    let db_compact = db.clone();
    let ws_compact = ws_id.clone();
    let compact_task = tokio::spawn(async move {
      compact_pending_doc_updates_with_merge_hook(&db_compact, &ws_compact, doc_a, 100, 0, 3600, move |attempt| {
        let entered_tx = Arc::clone(&entered_tx);
        let resume_rx = Arc::clone(&resume_rx);
        async move {
          if attempt == 0 {
            if let Some(tx) = entered_tx.lock().unwrap().take() {
              let _ = tx.send(());
            }
            if let Some(rx) = resume_rx.lock().await.take() {
              let _ = rx.await;
            }
          }
        }
      })
      .await
    });

    // Wait deterministically until compaction enters Phase 2.
    entered_rx.await.expect("compaction entered phase 2");

    // Verify no workspace or per-doc advisory lock is held during Phase 2.
    let mut probe_tx = db.pool().begin().await.expect("begin probe tx");
    let got_ws_exclusive: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(format!("storage-workspace:{ws_id}"))
      .fetch_one(&mut *probe_tx)
      .await
      .expect("probe workspace lock");
    let got_doc_exclusive: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(format!("workspace-doc-update:{ws_id}/{doc_a}"))
      .fetch_one(&mut *probe_tx)
      .await
      .expect("probe doc lock");
    assert!(
      got_ws_exclusive,
      "workspace advisory lock must not be held during phase 2"
    );
    assert!(got_doc_exclusive, "doc advisory lock must not be held during phase 2");
    probe_tx.rollback().await.expect("rollback probe tx");

    // Append a new update to the same doc and a write to another doc without blocking.
    sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, $2, $3, $4)")
      .bind(&ws_id)
      .bind(doc_a)
      .bind(&u2)
      .bind(t1)
      .execute(db.pool())
      .await
      .expect("append concurrent update to same doc");
    sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, $2, $3, $4)")
      .bind(&ws_id)
      .bind(doc_b)
      .bind(&peer_u)
      .bind(t1)
      .execute(db.pool())
      .await
      .expect("append concurrent update to peer doc");

    // Release Phase 2 and verify Phase 3 commits only u1 while preserving u2 intact.
    resume_tx.send(()).expect("resume phase 2");
    let outcome = compact_task
      .await
      .expect("join compaction")
      .expect("compaction succeeds");
    assert!(outcome.lock_acquired);
    assert_eq!(outcome.updates_merged, 1);

    let snap_blob: Vec<u8> = sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
      .bind(&ws_id)
      .bind(doc_a)
      .fetch_one(db.pool())
      .await
      .expect("load compacted snapshot");
    let remaining_updates: Vec<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC")
        .bind(&ws_id)
        .bind(doc_a)
        .fetch_all(db.pool())
        .await
        .expect("load remaining updates");
    assert_eq!(remaining_updates.len(), 1, "concurrently appended update must remain");

    let mut all_state = vec![snap_blob];
    all_state.extend(remaining_updates);
    assert_eq!(decode_map_value(&all_state, "k1").as_deref(), Some("v1"));
    assert_eq!(decode_map_value(&all_state, "k2").as_deref(), Some("v2"));
  });
  drop(lease);
}

#[test]
fn phase3_cas_detects_concurrent_snapshot_insert_and_update_and_retries_losslessly() {
  let (lease, rt, db) = setup_test_db();
  rt.block_on(async {
    let ws_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .expect("insert workspace");

    // Case 1: Phase 1 sees no snapshot; concurrent writer inserts a snapshot during Phase 2.
    let doc_first = "doc-cas-first-insert";
    let upd_first = encode_doc_with_entry("from_update", "u1");
    let concurrent_snap = encode_doc_with_entry("from_concurrent_insert", "s1");
    let t0 = Utc::now() - Duration::seconds(30);
    sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, $2, $3, $4)")
      .bind(&ws_id)
      .bind(doc_first)
      .bind(&upd_first)
      .bind(t0)
      .execute(db.pool())
      .await
      .expect("insert update for first case");

    let attempts_case1 = Arc::new(Mutex::new(Vec::<usize>::new()));
    let attempts_c1 = Arc::clone(&attempts_case1);
    let db_c1 = db.clone();
    let ws_c1 = ws_id.clone();
    let snap_c1 = concurrent_snap.clone();
    let outcome1 = compact_pending_doc_updates_with_merge_hook(&db, &ws_id, doc_first, 100, 0, 3600, move |attempt| {
      let attempts_c1 = Arc::clone(&attempts_c1);
      let db_c1 = db_c1.clone();
      let ws_c1 = ws_c1.clone();
      let snap_c1 = snap_c1.clone();
      async move {
        attempts_c1.lock().unwrap().push(attempt);
        if attempt == 0 {
          sqlx::query(
            "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)",
          )
          .bind(&ws_c1)
          .bind(doc_first)
          .bind(&snap_c1)
          .bind(snap_c1.len() as i64)
          .bind(Utc::now() - Duration::seconds(15))
          .execute(db_c1.pool())
          .await
          .expect("inject concurrent first snapshot");
        }
      }
    })
    .await
    .expect("case 1 compaction succeeds on retry");

    assert!(outcome1.lock_acquired);
    assert_eq!(outcome1.updates_merged, 1);
    assert_eq!(*attempts_case1.lock().unwrap(), vec![0, 1]);

    let final_blob1: Vec<u8> =
      sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
        .bind(&ws_id)
        .bind(doc_first)
        .fetch_one(db.pool())
        .await
        .expect("load final snapshot case 1");
    assert_eq!(
      decode_map_value(std::slice::from_ref(&final_blob1), "from_update").as_deref(),
      Some("u1")
    );
    assert_eq!(
      decode_map_value(std::slice::from_ref(&final_blob1), "from_concurrent_insert").as_deref(),
      Some("s1")
    );

    // Case 2: Phase 1 sees existing snapshot; concurrent writer updates snapshot during Phase 2.
    let doc_existing = "doc-cas-existing-update";
    let base_snap = encode_doc_with_entry("base", "b0");
    let concurrent_updated_snap = y_octo::merge_updates_v1(vec![
      base_snap.clone(),
      encode_doc_with_entry("concurrent_edit", "c2"),
    ])
    .and_then(|u| u.encode_v1())
    .expect("merge concurrent snapshot");
    let upd_existing = encode_doc_with_entry("pending_edit", "p2");

    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)",
    )
    .bind(&ws_id)
    .bind(doc_existing)
    .bind(&base_snap)
    .bind(base_snap.len() as i64)
    .bind(t0 - Duration::seconds(10))
    .execute(db.pool())
    .await
    .expect("seed base snapshot");
    sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, $2, $3, $4)")
      .bind(&ws_id)
      .bind(doc_existing)
      .bind(&upd_existing)
      .bind(t0)
      .execute(db.pool())
      .await
      .expect("insert update for existing case");

    let attempts_case2 = Arc::new(Mutex::new(Vec::<usize>::new()));
    let attempts_c2 = Arc::clone(&attempts_case2);
    let db_c2 = db.clone();
    let ws_c2 = ws_id.clone();
    let snap_c2 = concurrent_updated_snap.clone();
    let outcome2 =
      compact_pending_doc_updates_with_merge_hook(&db, &ws_id, doc_existing, 100, 0, 3600, move |attempt| {
        let attempts_c2 = Arc::clone(&attempts_c2);
        let db_c2 = db_c2.clone();
        let ws_c2 = ws_c2.clone();
        let snap_c2 = snap_c2.clone();
        async move {
          attempts_c2.lock().unwrap().push(attempt);
          if attempt == 0 {
            sqlx::query(
              "UPDATE snapshots SET blob = $3, size = $4, updated_at = $5 WHERE workspace_id = $1 AND guid = $2",
            )
            .bind(&ws_c2)
            .bind(doc_existing)
            .bind(&snap_c2)
            .bind(snap_c2.len() as i64)
            .bind(Utc::now() - Duration::seconds(5))
            .execute(db_c2.pool())
            .await
            .expect("inject concurrent snapshot update");
          }
        }
      })
      .await
      .expect("case 2 compaction succeeds on retry");

    assert!(outcome2.lock_acquired);
    assert_eq!(outcome2.updates_merged, 1);
    assert_eq!(*attempts_case2.lock().unwrap(), vec![0, 1]);

    let final_blob2: Vec<u8> =
      sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
        .bind(&ws_id)
        .bind(doc_existing)
        .fetch_one(db.pool())
        .await
        .expect("load final snapshot case 2");
    assert_eq!(
      decode_map_value(std::slice::from_ref(&final_blob2), "base").as_deref(),
      Some("b0")
    );
    assert_eq!(
      decode_map_value(std::slice::from_ref(&final_blob2), "concurrent_edit").as_deref(),
      Some("c2")
    );
    assert_eq!(
      decode_map_value(std::slice::from_ref(&final_blob2), "pending_edit").as_deref(),
      Some("p2")
    );
  });
  drop(lease);
}

#[test]
fn loose_index_scan_cursor_rotates_fairly_across_workspaces() {
  let (lease, rt, db) = setup_test_db();
  rt.block_on(async {
    let ws_a = "ws-a-heavy";
    let ws_b = "ws-b-second";
    let ws_c = "ws-c-third";
    for ws in [ws_a, ws_b, ws_c] {
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(ws)
        .execute(db.pool())
        .await
        .expect("insert workspace");
    }

    let payload = encode_doc_with_entry("x", "1");
    let t0 = Utc::now() - Duration::seconds(30);
    // Workspace A has 3 docs; B and C have 1 doc each (5 docs total).
    for (ws, doc) in [
      (ws_a, "doc-1"),
      (ws_a, "doc-2"),
      (ws_a, "doc-3"),
      (ws_b, "doc-1"),
      (ws_c, "doc-1"),
    ] {
      sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, $2, $3, $4)")
        .bind(ws)
        .bind(doc)
        .bind(&payload)
        .bind(t0)
        .execute(db.pool())
        .await
        .expect("insert update");
    }

    let gate = CommunityQuotaGate::default();
    let mut total_compacted = 0usize;
    // Run batches of 2 docs; rotating cursor advances through all 5 docs in 3 ticks.
    for _ in 0..3 {
      let n = compact_pending_docs_batch(&db, &gate, 2, 100, 0, || false)
        .await
        .expect("batch compact");
      total_compacted += n;
    }
    assert_eq!(total_compacted, 5);

    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM updates")
      .fetch_one(db.pool())
      .await
      .expect("count updates");
    assert_eq!(remaining, 0);

    // Re-seed docs in ws_a and ws_c to confirm wrap-around from the last cursor position.
    for (ws, doc) in [(ws_a, "doc-wrap"), (ws_c, "doc-wrap")] {
      sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, $2, $3, $4)")
        .bind(ws)
        .bind(doc)
        .bind(&payload)
        .bind(Utc::now())
        .execute(db.pool())
        .await
        .expect("insert wrap update");
    }
    let wrapped = compact_pending_docs_batch(&db, &gate, 2, 100, 0, || false)
      .await
      .expect("wrap batch compact");
    assert_eq!(wrapped, 2);
  });
  drop(lease);
}

struct TeamWorkspaceQuotaGate {
  team_ws_id: String,
}

#[async_trait]
impl QuotaGate for TeamWorkspaceQuotaGate {
  async fn resolve_workspace_grant(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    if workspace_id == self.team_ws_id {
      return Ok(AccessGrant {
        tier: LicenseTier::SelfhostTeam,
        billing_subject: BillingSubject::Workspace,
        seat_quantity: Some(10),
        limits: Limits {
          blob_limit_bytes: 100 * 1024 * 1024,
          storage_quota_bytes: 10 * 1024 * 1024 * 1024,
          seat_limit: 10,
          seat_quota_bytes: None,
          history_period_seconds: 86_400,
          copilot_action_limit: None,
        },
        rights: Rights {
          commercial: true,
          copilot_byok: true,
          unlimited_copilot: false,
        },
        expires_at: None,
        diagnostics: Vec::new(),
      });
    }
    CommunityQuotaGate::default()
      .resolve_workspace_grant(tx, workspace_id, now)
      .await
  }

  async fn check_seat_admission(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    current_active_seats: i32,
    adding_seats: i32,
    now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    CommunityQuotaGate::default()
      .check_seat_admission(tx, workspace_id, current_active_seats, adding_seats, now)
      .await
  }
}

#[test]
fn delete_user_cleans_multiple_personal_workspaces_in_short_txs_and_blocks_team_workspace() {
  let (lease, rt, db) = setup_test_db();
  rt.block_on(async {
    let user_svc = UserService::new(db.clone());
    let billing: Arc<dyn BillingSpi> = Arc::new(CommunityBillingSpi);

    // 1. User with two personal workspaces, blobs, attachments, snapshots, updates, histories, sessions, mail.
    let user_id = Uuid::new_v4().to_string();
    let ws1 = Uuid::new_v4().to_string();
    let ws2 = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email, avatar_url) VALUES ($1, 'Alice', 'alice@example.com', 'avatar-1')")
      .bind(&user_id)
      .execute(db.pool())
      .await
      .expect("insert user");

    let blob_data = encode_doc_with_entry("k", "v");
    for (idx, ws) in [&ws1, &ws2].into_iter().enumerate() {
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(ws)
        .execute(db.pool())
        .await
        .expect("insert personal workspace");
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(ws)
      .bind(&user_id)
      .execute(db.pool())
      .await
      .expect("insert owner membership");
      sqlx::query(
        "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at) VALUES ($1, 'doc-1', $2, $3, now(), now())",
      )
      .bind(ws)
      .bind(&blob_data)
      .bind(blob_data.len() as i64)
      .execute(db.pool())
      .await
      .expect("insert snapshot");
      sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, 'doc-1', $2, now())")
        .bind(ws)
        .bind(&blob_data)
        .execute(db.pool())
        .await
        .expect("insert update");
      sqlx::query(
        "INSERT INTO snapshot_histories (workspace_id, guid, timestamp, blob, expired_at) VALUES ($1, 'doc-1', now(), $2, now() + interval '1 day')",
      )
      .bind(ws)
      .bind(&blob_data)
      .execute(db.pool())
      .await
      .expect("insert snapshot_history");
      sqlx::query(
        "INSERT INTO blobs (workspace_id, key, mime, size, created_at) VALUES ($1, $2, 'application/octet-stream', 4, now())",
      )
      .bind(ws)
      .bind(format!("blob-{idx}"))
      .execute(db.pool())
      .await
      .expect("insert blob");
      sqlx::query(
        "INSERT INTO comment_attachments (workspace_id, doc_id, key, name, mime, size, created_by, created_at) VALUES ($1, 'doc-1', $2, 'att.bin', 'application/octet-stream', 4, $3, now())",
      )
      .bind(ws)
      .bind(format!("att-{idx}"))
      .bind(&user_id)
      .execute(db.pool())
      .await
      .expect("insert comment attachment");
    }

    let cleanup = user_svc
      .delete_user(&user_id, &CommunityQuotaGate::default(), billing.as_ref())
      .await
      .expect("delete personal user");
    assert_eq!(cleanup.deleted_workspace_ids.len(), 2);
    assert_eq!(cleanup.blob_keys.len(), 2);
    assert_eq!(cleanup.comment_attachment_keys.len(), 2);
    assert_eq!(cleanup.avatar_url.as_deref(), Some("avatar-1"));

    let remaining_users: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM users WHERE id = $1")
      .bind(&user_id)
      .fetch_one(db.pool())
      .await
      .expect("count users");
    let remaining_ws: i64 =
      sqlx::query_scalar("SELECT COUNT(*)::bigint FROM workspaces WHERE id = ANY($1)")
        .bind(&[ws1.as_str(), ws2.as_str()][..])
        .fetch_one(db.pool())
        .await
        .expect("count workspaces");
    let remaining_snaps: i64 =
      sqlx::query_scalar("SELECT COUNT(*)::bigint FROM snapshots WHERE workspace_id = ANY($1)")
        .bind(&[ws1.as_str(), ws2.as_str()][..])
        .fetch_one(db.pool())
        .await
        .expect("count snapshots");
    assert_eq!(remaining_users, 0);
    assert_eq!(remaining_ws, 0);
    assert_eq!(remaining_snaps, 0);

    // 2. User owning a team workspace must be rejected and both workspaces preserved intact.
    let team_owner = Uuid::new_v4().to_string();
    let ws_personal = Uuid::new_v4().to_string();
    let ws_team = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Bob', 'bob@example.com')")
      .bind(&team_owner)
      .execute(db.pool())
      .await
      .expect("insert team owner");
    for ws in [&ws_personal, &ws_team] {
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(ws)
        .execute(db.pool())
        .await
        .expect("insert workspace");
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(ws)
      .bind(&team_owner)
      .execute(db.pool())
      .await
      .expect("insert owner member");
    }

    let team_gate = TeamWorkspaceQuotaGate {
      team_ws_id: ws_team.clone(),
    };
    let err = user_svc
      .delete_user(&team_owner, &team_gate, billing.as_ref())
      .await
      .expect_err("team workspace owner must not be deleted");
    assert!(
      matches!(&err.error, DomainError::Validation(msg) if msg == "cannot_delete_account_with_owned_team_workspace"),
      "unexpected error: {err:?}"
    );
    assert!(err.partial_cleanup.is_empty());

    let team_owner_still_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
      .bind(&team_owner)
      .fetch_one(db.pool())
      .await
      .expect("check team owner exists");
    let team_ws_count: i64 =
      sqlx::query_scalar("SELECT COUNT(*)::bigint FROM workspaces WHERE id = ANY($1)")
        .bind(&[ws_personal.as_str(), ws_team.as_str()][..])
        .fetch_one(db.pool())
        .await
        .expect("count team owner workspaces");
    assert!(team_owner_still_exists);
    assert_eq!(team_ws_count, 2);
  });
  drop(lease);
}

#[test]
fn owned_compaction_permit_stays_held_in_spawn_blocking_after_outer_abort() {
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .expect("build tokio runtime");

  rt.block_on(async {
    let sem = Arc::new(tokio::sync::Semaphore::new(2));
    let entered = Arc::new(Barrier::new(3));
    let release = Arc::new(Barrier::new(3));

    let mut handles = Vec::new();
    for _ in 0..2 {
      let sem = Arc::clone(&sem);
      let entered = Arc::clone(&entered);
      let release = Arc::clone(&release);
      handles.push(tokio::spawn(async move {
        run_blocking_with_merge_permit(&sem, move || {
          entered.wait();
          release.wait();
          Ok(())
        })
        .await
      }));
    }

    tokio::task::spawn_blocking({
      let entered = Arc::clone(&entered);
      move || entered.wait()
    })
    .await
    .expect("wait for blocking tasks to enter");

    // Abort one outer future while its blocking closure still runs.
    handles[0].abort();
    let _ = (&mut handles[0]).await;

    assert!(
      sem.try_acquire().is_err(),
      "semaphore permit must remain held until the blocking closure finishes"
    );

    tokio::task::spawn_blocking({
      let release = Arc::clone(&release);
      move || release.wait()
    })
    .await
    .expect("release blocking tasks");

    (&mut handles[1])
      .await
      .expect("join second task")
      .expect("second task succeeds");

    // Both permits are returned once the blocking closures exit.
    let p1 = sem.acquire().await.expect("reacquire permit 1");
    let p2 = sem.acquire().await.expect("reacquire permit 2");
    drop((p1, p2));
    assert_eq!(sem.available_permits(), 2);
  });
}

#[test]
fn delete_user_rechecks_team_grant_under_workspace_lock() {
  let (lease, rt, db) = setup_test_db();
  rt.block_on(async {
    let user_svc = UserService::new(db.clone());
    let billing: Arc<dyn BillingSpi> = Arc::new(CommunityBillingSpi);

    let user_id = Uuid::new_v4().to_string();
    let ws1 = format!("ws-a-{}", Uuid::new_v4());
    sqlx::query(
      "INSERT INTO users (id, name, email, avatar_url) VALUES ($1, 'Carol', 'carol@example.com', 'avatar-carol')",
    )
    .bind(&user_id)
    .execute(db.pool())
    .await
    .expect("insert user");
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(&ws1)
      .execute(db.pool())
      .await
      .expect("insert workspace");
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&ws1)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .expect("insert owner member");

    // Call 0 is Phase 1 pre-check (returns personal); call 1 is inside ws_tx under workspaces FOR UPDATE (returns Team).
    struct UpgradeBeforeWorkspaceLockGate {
      ws_id: String,
      calls: AtomicUsize,
    }
    #[async_trait]
    impl QuotaGate for UpgradeBeforeWorkspaceLockGate {
      async fn resolve_workspace_grant(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        workspace_id: &str,
        now: DateTime<Utc>,
      ) -> Result<AccessGrant, DomainError> {
        if workspace_id == self.ws_id && self.calls.fetch_add(1, Ordering::SeqCst) >= 1 {
          return Ok(AccessGrant {
            tier: LicenseTier::SelfhostTeam,
            billing_subject: BillingSubject::Workspace,
            seat_quantity: Some(10),
            limits: Limits {
              blob_limit_bytes: 100 * 1024 * 1024,
              storage_quota_bytes: 10 * 1024 * 1024 * 1024,
              seat_limit: 10,
              seat_quota_bytes: None,
              history_period_seconds: 86_400,
              copilot_action_limit: None,
            },
            rights: Rights {
              commercial: true,
              copilot_byok: true,
              unlimited_copilot: false,
            },
            expires_at: None,
            diagnostics: Vec::new(),
          });
        }
        CommunityQuotaGate::default()
          .resolve_workspace_grant(tx, workspace_id, now)
          .await
      }

      async fn check_seat_admission(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        workspace_id: &str,
        current_active_seats: i32,
        adding_seats: i32,
        now: DateTime<Utc>,
      ) -> Result<AccessGrant, DomainError> {
        CommunityQuotaGate::default()
          .check_seat_admission(tx, workspace_id, current_active_seats, adding_seats, now)
          .await
      }
    }

    let gate = UpgradeBeforeWorkspaceLockGate {
      ws_id: ws1.clone(),
      calls: AtomicUsize::new(0),
    };

    let del_err = user_svc
      .delete_user(&user_id, &gate, billing.as_ref())
      .await
      .expect_err("team upgrade before workspace lock must reject delete_user");
    assert!(
      matches!(&del_err.error, DomainError::Validation(msg) if msg == "cannot_delete_account_with_owned_team_workspace"),
      "unexpected error: {del_err:?}"
    );
    assert!(del_err.partial_cleanup.is_empty());

    let ws_still_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
      .bind(&ws1)
      .fetch_one(db.pool())
      .await
      .expect("check workspace exists");
    let user_disabled: bool = sqlx::query_scalar("SELECT disabled FROM users WHERE id = $1")
      .bind(&user_id)
      .fetch_one(db.pool())
      .await
      .expect("check user disabled");
    assert!(ws_still_exists, "upgraded team workspace must remain intact");
    assert!(!user_disabled, "user must remain enabled");
  });
  drop(lease);
}

#[test]
fn delete_user_returns_partial_cleanup_on_midway_error_and_leaves_account_retryable() {
  let (lease, rt, db) = setup_test_db();
  let db_url = lease.url().to_owned();
  rt.block_on(async {
    let short_db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 8,
      statement_timeout_ms: 250,
      tier_permits: [8, 4, 2, 4],
    })
    .await
    .expect("connect short timeout db");
    let user_svc = UserService::new(short_db);
    let billing: Arc<dyn BillingSpi> = Arc::new(CommunityBillingSpi);
    let gate = CommunityQuotaGate::default();

    let user_id = Uuid::new_v4().to_string();
    let ws1 = format!("ws-a-{}", Uuid::new_v4());
    let ws2 = format!("ws-b-{}", Uuid::new_v4());
    sqlx::query(
      "INSERT INTO users (id, name, email, avatar_url) VALUES ($1, 'Dave', 'dave@example.com', 'https://cdn.test/avatars/avatar-dave')",
    )
    .bind(&user_id)
    .execute(db.pool())
    .await
    .expect("insert user");

    for (ws, blob_key, att_key) in [(&ws1, "blob-ws1", "att-ws1"), (&ws2, "blob-ws2", "att-ws2")] {
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(ws)
        .execute(db.pool())
        .await
        .expect("insert workspace");
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(ws)
      .bind(&user_id)
      .execute(db.pool())
      .await
      .expect("insert owner member");
      sqlx::query(
        "INSERT INTO blobs (workspace_id, key, mime, size, created_at) VALUES ($1, $2, 'application/octet-stream', 4, now())",
      )
      .bind(ws)
      .bind(blob_key)
      .execute(db.pool())
      .await
      .expect("insert blob");
      sqlx::query(
        "INSERT INTO comment_attachments (workspace_id, doc_id, key, name, mime, size, created_by, created_at) VALUES ($1, 'doc-1', $2, 'att.bin', 'application/octet-stream', 4, $3, now())",
      )
      .bind(ws)
      .bind(att_key)
      .bind(&user_id)
      .execute(db.pool())
      .await
      .expect("insert comment attachment");
    }

    // Hold storage-workspace lock on ws2 so ws1 commits in its short tx and ws2 times out.
    let mut blocker_tx = db.pool().begin().await.expect("begin blocker tx");
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(format!("storage-workspace:{ws2}"))
      .execute(&mut *blocker_tx)
      .await
      .expect("lock ws2 storage");

    let del_err = user_svc
      .delete_user(&user_id, &gate, billing.as_ref())
      .await
      .expect_err("ws2 storage lock timeout must fail midway");
    assert!(matches!(del_err.error, DomainError::Internal(_)));
    assert_eq!(del_err.partial_cleanup.deleted_workspace_ids, vec![ws1.clone()]);
    assert_eq!(
      del_err.partial_cleanup.blob_keys,
      vec![(ws1.clone(), "blob-ws1".to_owned())]
    );
    assert_eq!(
      del_err.partial_cleanup.comment_attachment_keys,
      vec![(ws1.clone(), "doc-1".to_owned(), "att-ws1".to_owned())]
    );
    assert!(del_err.partial_cleanup.avatar_url.is_none());

    // Account remains enabled (never frozen) so the user can retry normally once contention clears.
    let user_disabled: bool = sqlx::query_scalar("SELECT disabled FROM users WHERE id = $1")
      .bind(&user_id)
      .fetch_one(db.pool())
      .await
      .expect("check user disabled");
    assert!(!user_disabled, "midway failure must not freeze or lock out the user");

    blocker_tx.rollback().await.expect("release ws2 lock");
    let final_cleanup = user_svc
      .delete_user(&user_id, &gate, billing.as_ref())
      .await
      .expect("retry delete_user succeeds");
    assert_eq!(final_cleanup.deleted_workspace_ids, vec![ws2.clone()]);
    assert_eq!(
      final_cleanup.blob_keys,
      vec![(ws2.clone(), "blob-ws2".to_owned())]
    );
    assert_eq!(
      final_cleanup.comment_attachment_keys,
      vec![(ws2.clone(), "doc-1".to_owned(), "att-ws2".to_owned())]
    );
    assert_eq!(
      final_cleanup.avatar_url.as_deref(),
      Some("https://cdn.test/avatars/avatar-dave")
    );

    let remaining_users: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM users WHERE id = $1")
      .bind(&user_id)
      .fetch_one(db.pool())
      .await
      .expect("count users");
    assert_eq!(remaining_users, 0);
  });
  drop(lease);
}
