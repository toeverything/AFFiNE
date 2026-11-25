//! PostgreSQL 16 integration tests for periodic background maintenance workers
//! (activation-gated real workspace_doc_lifecycle migration, 365-day notification
//! expiry with event bus publish, expire-first mail housekeeping & settled_at
//! retention, runtime_states/runtime_gates/runtime_leases cleanup, and batched
//! workspace admin stats refresh & recalibration).

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use serde_json::Value;
use server_db::{DbConfig, ServerDb};
use server_domain::events::{EventBusEnvelopeV1, EventBusPublisher};
use server_types::{DomainError, ServerRole};
use server_worker::CancellationToken;
use server_worker::maintenance::{
  advance_workspace_lifecycle_migrations, cleanup_expired_notifications, cleanup_expired_runtime_housekeeping,
  cleanup_mail_deliveries_and_skip_disabled, recalibrate_workspace_stats, refresh_dirty_workspace_stats,
};
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, DbLease, PgCluster},
};
use y_octo::{Any, Doc};

fn leased_0275_database() -> DbLease {
  let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
  let migrations = MigrationSet::load(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations"))
    .expect("load v0.27.5 migrations");
  let template = cluster.ensure_template(&migrations).expect("v0.27.5 template");
  cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database")
}

async fn connect_db(url: &str) -> ServerDb {
  let db = ServerDb::connect(DbConfig {
    database_url: url.to_owned(),
    channel: "canary".into(),
    role: ServerRole::Worker,
    selfhosted: true,
    max_connections: 4,
    statement_timeout_ms: 5_000,
    tier_permits: [4, 2, 2, 2],
  })
  .await
  .expect("connect db");
  sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    .execute(db.pool())
    .await
    .expect("reset schema");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  db
}

#[derive(Default)]
struct RecordingBus {
  events: Mutex<Vec<(String, Value)>>,
}

#[async_trait]
impl EventBusPublisher for RecordingBus {
  async fn publish_event(
    &self,
    event: &str,
    payload: Value,
    request_id: Option<&str>,
  ) -> Result<EventBusEnvelopeV1, DomainError> {
    self.events.lock().unwrap().push((event.to_owned(), payload.clone()));
    Ok(EventBusEnvelopeV1 {
      v: 1,
      id: "test-ev".into(),
      event: event.to_owned(),
      origin_id: "test".into(),
      origin_channel: "canary".into(),
      request_id: request_id.map(str::to_owned),
      payload,
    })
  }
}

fn build_root_doc_with_trashed_page(active_id: &str, trashed_id: &str) -> Vec<u8> {
  let doc = Doc::default();
  let mut meta = doc.get_or_create_map("meta").unwrap();
  let mut pages = doc.create_array().unwrap();
  let mut p1 = doc.create_map().unwrap();
  p1.insert("id".to_owned(), Any::String(active_id.into())).unwrap();
  pages.push(p1).unwrap();
  let mut p2 = doc.create_map().unwrap();
  p2.insert("id".to_owned(), Any::String(trashed_id.into())).unwrap();
  p2.insert("trash".to_owned(), Any::True).unwrap();
  pages.push(p2).unwrap();
  meta.insert("pages".to_owned(), pages).unwrap();
  doc.encode_state_as_update_v1(&y_octo::StateVector::default()).unwrap()
}

#[test]
fn background_maintenance_workers_are_correct_and_idempotent() {
  let lease = leased_0275_database();
  let db_url = lease.url().to_owned();
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = connect_db(&db_url).await;
    let cancel = CancellationToken::new();

    sqlx::query(
      "INSERT INTO users (id, name, email, disabled) VALUES ('u-disabled', 'Disabled', 'disabled@example.com', true)",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ('ws-maint', 'Maint WS')")
      .execute(db.pool())
      .await
      .unwrap();
    let root_bin = build_root_doc_with_trashed_page("doc-active", "doc-trashed");
    sqlx::query("INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ('ws-maint', 'ws-maint', $1, now())")
      .bind(&root_bin)
      .execute(db.pool())
      .await
      .unwrap();

    // Notifications: 400d (expired past 365d) + 120d (must be retained under 365d).
    sqlx::query(
      "INSERT INTO notifications (id, user_id, type, level, body, created_at) \
       VALUES ('notif-400d', 'u-disabled', 'Comment', 'Default', '{}'::jsonb, clock_timestamp() - interval '400 days'), \
              ('notif-120d', 'u-disabled', 'Comment', 'Default', '{}'::jsonb, clock_timestamp() - interval '120 days')",
    )
    .execute(db.pool())
    .await
    .unwrap();

    // Mail deliveries: 1 expired disabled (must expire FIRST -> failed/expired), 1 live disabled (-> skipped/disabled_recipient), 1 settled 40d ago (-> deleted).
    sqlx::query(
      "INSERT INTO mail_deliveries (mail_name, mail_class, status, recipient_email, recipient_hash, recipient_domain, payload, expires_at) \
       VALUES ('SignIn', 'auth', 'queued', 'disabled@example.com', 'h1', 'example.com', '{}'::jsonb, clock_timestamp() + interval '1 hour'), \
              ('SignIn', 'auth', 'queued', 'disabled@example.com', 'h2', 'example.com', '{}'::jsonb, clock_timestamp() - interval '1 hour')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO mail_deliveries (mail_name, mail_class, status, retention_state, recipient_hash, recipient_domain, settled_at, anonymized_at) \
       VALUES ('SignIn', 'auth', 'sent', 'anonymized', 'h3', 'example.com', clock_timestamp() - interval '40 days', clock_timestamp() - interval '40 days')",
    )
    .execute(db.pool())
    .await
    .unwrap();

    sqlx::query(
      "INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, expires_at) \
       VALUES ('session_nonce', 'hash-1', 'e1', '{}'::jsonb, clock_timestamp() - interval '1 day')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("INSERT INTO runtime_gates (key, expires_at) VALUES ('rate:k1', clock_timestamp() - interval '1 hour')")
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO runtime_leases (key, owner, fencing_token, expires_at) \
       VALUES ('lease:k1', 'worker-1', 1, clock_timestamp() - interval '1 hour')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspace_admin_stats_dirty (workspace_id) VALUES ('ws-maint') ON CONFLICT DO NOTHING")
      .execute(db.pool())
      .await
      .unwrap();

    // 1. Lifecycle migration: inactive by default -> 0 writes.
    let lc0 = advance_workspace_lifecycle_migrations(&db, 100, None, &cancel).await.unwrap();
    assert_eq!(lc0.migrated_workspaces, 0);

    // Activate lifecycle migration -> migrates trashed page & retains active doc identity.
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints (kind, scope, status) \
       VALUES ('workspace_doc_lifecycle_activation', 'global', 'active')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    // 1a. Holding slash-separated workspace-doc-update:{ws}/{ws} advisory lock blocks migration cleanly.
    let mut lock_tx = db.pool().begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('workspace-doc-update:ws-maint/ws-maint', 0))")
      .execute(&mut *lock_tx)
      .await
      .unwrap();
    let lc_blocked = advance_workspace_lifecycle_migrations(&db, 100, None, &cancel).await.unwrap();
    assert_eq!(lc_blocked.migrated_workspaces, 0);
    lock_tx.rollback().await.unwrap();

    let lc1 = advance_workspace_lifecycle_migrations(&db, 100, None, &cancel).await.unwrap();
    assert_eq!(lc1.migrated_workspaces, 1);
    let trashed_state: String = sqlx::query_scalar(
      "SELECT lifecycle_state::text FROM workspace_pages WHERE workspace_id='ws-maint' AND page_id='doc-trashed'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(trashed_state, "trashed");
    let retained_active: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM updates WHERE workspace_id='ws-maint' AND guid='doc-active'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(retained_active, 1);
    let lc2 = advance_workspace_lifecycle_migrations(&db, 100, None, &cancel).await.unwrap();
    assert_eq!(lc2.migrated_workspaces, 0);

    // 1b. Pending updates gauge reflects updates table backlog and drops to 0 when cleared.
    let gauge = std::sync::atomic::AtomicI64::new(-1);
    let pending_before = server_worker::maintenance::record_pending_doc_updates_count(&db, &gauge)
      .await
      .unwrap();
    assert!(pending_before > 0);
    assert_eq!(gauge.load(std::sync::atomic::Ordering::Relaxed), pending_before);
    sqlx::query("DELETE FROM updates WHERE workspace_id='ws-maint'")
      .execute(db.pool())
      .await
      .unwrap();
    let pending_after = server_worker::maintenance::record_pending_doc_updates_count(&db, &gauge)
      .await
      .unwrap();
    assert_eq!(pending_after, 0);
    assert_eq!(gauge.load(std::sync::atomic::Ordering::Relaxed), 0);

    // 2. Notification cleanup (365-day retention + notification.count.changed event).
    let bus = Arc::new(RecordingBus::default());
    let n1 = cleanup_expired_notifications(&db, 365, 100, Some(bus.as_ref()), &cancel).await.unwrap();
    assert_eq!(n1.deleted_expired, 1);
    assert_eq!(n1.notified_users, 1);
    let events = bus.events.lock().unwrap().clone();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].1["topic"], "notification.count.changed");
    assert_eq!(events[0].1["event"]["reason"], "expired-cleanup");
    let n2 = cleanup_expired_notifications(&db, 365, 100, Some(bus.as_ref()), &cancel).await.unwrap();
    assert_eq!(n2.deleted_expired, 0);

    // 3. Mail housekeeping (expire first -> failed, then skip disabled, then delete settled > 30d).
    let m1 = cleanup_mail_deliveries_and_skip_disabled(&db, 30, 100, &cancel).await.unwrap();
    assert_eq!(m1.expired_marked_failed, 1);
    assert_eq!(m1.skipped_disabled_recipients, 1);
    assert_eq!(m1.deleted_retained, 1);
    let m2 = cleanup_mail_deliveries_and_skip_disabled(&db, 30, 100, &cancel).await.unwrap();
    assert_eq!(m2.expired_marked_failed, 0);
    assert_eq!(m2.skipped_disabled_recipients, 0);
    assert_eq!(m2.deleted_retained, 0);

    // 4. Runtime states/gates/leases cleanup.
    let r1 = cleanup_expired_runtime_housekeeping(&db, 100, &cancel).await.unwrap();
    assert_eq!(r1.deleted_runtime_states, 1);
    assert_eq!(r1.deleted_runtime_gates, 1);
    assert_eq!(r1.deleted_runtime_leases, 1);
    let r2 = cleanup_expired_runtime_housekeeping(&db, 100, &cancel).await.unwrap();
    assert_eq!(r2.deleted_runtime_states, 0);
    assert_eq!(r2.deleted_runtime_gates, 0);
    assert_eq!(r2.deleted_runtime_leases, 0);

    // 5. Dirty workspace stats refresh & full batched recalibration + daily snapshot.
    let s1 = refresh_dirty_workspace_stats(&db, 100, &cancel).await.unwrap();
    assert!(s1.locked);
    assert_eq!(s1.processed_workspaces, 1);
    let s2 = refresh_dirty_workspace_stats(&db, 100, &cancel).await.unwrap();
    assert_eq!(s2.processed_workspaces, 0);
    let rec = recalibrate_workspace_stats(&db, 100, &cancel).await.unwrap();
    assert!(rec.locked);
    assert_eq!(rec.processed_workspaces, 1);
    assert!(rec.daily_snapshot_written);

    db.pool().close().await;
  });
}
