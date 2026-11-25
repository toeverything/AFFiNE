//! Periodic public background maintenance workers.

use std::collections::{BTreeMap, HashSet};
use std::sync::atomic::{AtomicI64, Ordering};

use serde_json::json;
use server_db::{ServerDb, TieredConn, TieredTx, WorkloadTier};
use server_domain::events::{EventBusPublisher, InvalidationHintV1, InvalidationPublisher};
use server_types::DomainError;
use sha2::{Digest as _, Sha256};
use y_octo::{Any, Doc, Value as YValue};

use crate::CancellationToken;

const WORKSPACE_STATS_LOCK_ID: i64 = (97_301_i64 << 32) + 1;

fn db_err(ctx: &'static str) -> impl FnOnce(sqlx::Error) -> DomainError {
  move |err| DomainError::Internal(format!("{ctx}: {err}"))
}
async fn long_conn(db: &ServerDb) -> Result<TieredConn, DomainError> {
  db.acquire_tiered(WorkloadTier::LongQuery)
    .await
    .map_err(|e| DomainError::Unavailable(e.to_string()))
}
async fn long_tx(db: &ServerDb) -> Result<TieredTx<'_>, DomainError> {
  db.begin_tiered(WorkloadTier::LongQuery)
    .await
    .map_err(|e| DomainError::Unavailable(e.to_string()))
}
async fn commit_tx(tx: TieredTx<'_>) -> Result<(), DomainError> {
  tx.commit().await.map_err(|e| DomainError::Internal(e.to_string()))
}
type PgTx<'a> = sqlx::Transaction<'a, sqlx::Postgres>;
async fn set_tx(tx: &mut PgTx<'_>, sql: &str) -> Result<(), DomainError> {
  sqlx::query(sql)
    .execute(&mut **tx)
    .await
    .map(|_| ())
    .map_err(|e| DomainError::Internal(format!("{sql}: {e}")))
}
async fn try_advisory_lock_key(tx: &mut PgTx<'_>, key: &str, ctx: &'static str) -> Result<bool, DomainError> {
  match sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(key)
    .execute(&mut **tx)
    .await
  {
    Ok(_) => Ok(true),
    Err(sqlx::Error::Database(db)) if db.code().as_deref() == Some("55P03") => Ok(false),
    Err(err) => Err(db_err(ctx)(err)),
  }
}
pub async fn record_pending_doc_updates_count(db: &ServerDb, gauge: &AtomicI64) -> Result<i64, DomainError> {
  let count: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM updates")
    .fetch_one(long_conn(db).await?.as_conn())
    .await
    .map_err(db_err("count pending doc updates"))?;
  gauge.store(count, Ordering::Relaxed);
  Ok(count)
}
fn compute_source_revision(snapshot: &Option<Vec<u8>>, updates: &[Vec<u8>]) -> String {
  let mut h = Sha256::new();
  for b in snapshot.iter() {
    h.update((b.len() as u64).to_be_bytes());
    h.update(b);
  }
  h.update((updates.len() as u64).to_be_bytes());
  for u in updates {
    h.update((u.len() as u64).to_be_bytes());
    h.update(u);
  }
  hex::encode(h.finalize())
}
async fn load_root_doc_parts(tx: &mut PgTx<'_>, ws_id: &str) -> Result<(Option<Vec<u8>>, Vec<Vec<u8>>), DomainError> {
  let snap = sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id=$1 AND guid=$1")
    .bind(ws_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_err("load root snapshot"))?;
  let upds = sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id=$1 AND guid=$1 ORDER BY created_at ASC")
    .bind(ws_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_err("load root updates"))?;
  Ok((snap, upds))
}
fn decode_root_pages(
  ws_id: &str,
  snapshot: &Option<Vec<u8>>,
  updates: &[Vec<u8>],
) -> (Vec<(String, bool)>, &'static str) {
  if snapshot.is_none() && updates.is_empty() {
    return (Vec::new(), "absent");
  }
  let mut doc = Doc::default();
  for b in snapshot.iter().chain(updates.iter()) {
    if !b.is_empty() && doc.apply_update_from_binary_v1(b).is_err() {
      return (Vec::new(), "invalid_binary");
    }
  }
  let Ok(meta) = doc.get_or_create_map("meta") else {
    return (Vec::new(), "decoded");
  };
  let Some(YValue::Array(pages)) = meta.get("pages") else {
    return (Vec::new(), "decoded");
  };
  let mut unique = BTreeMap::<String, Option<bool>>::new();
  for item in pages.iter() {
    if let YValue::Map(page) = item
      && let Some(YValue::Any(Any::String(doc_id))) = page.get("id")
      && !doc_id.is_empty()
      && doc_id != ws_id
      && !doc_id.starts_with("db$")
      && !doc_id.starts_with("userdata$")
    {
      let trashed = matches!(page.get("trash"), Some(YValue::Any(Any::True)));
      unique.entry(doc_id).and_modify(|s| *s = None).or_insert(Some(trashed));
    }
  }
  (
    unique.into_iter().filter_map(|(id, st)| st.map(|t| (id, t))).collect(),
    "decoded",
  )
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct LifecycleMigrationReport {
  pub migrated_workspaces: usize,
}
pub async fn advance_workspace_lifecycle_migrations(
  db: &ServerDb,
  batch_limit: i64,
  invalidation: Option<&dyn InvalidationPublisher>,
  cancel: &CancellationToken,
) -> Result<LifecycleMigrationReport, DomainError> {
  let limit = batch_limit.clamp(1, 1000);
  let mut report = LifecycleMigrationReport::default();
  if cancel.is_cancelled() {
    return Ok(report);
  }
  let active: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
     WHERE kind='workspace_doc_lifecycle_activation' AND scope='global' AND status='active')",
  )
  .fetch_one(long_conn(db).await?.as_conn())
  .await
  .map_err(db_err("check lifecycle activation"))?;
  if !active {
    return Ok(report);
  }
  let mut last_sid: i32 = 0;
  loop {
    if cancel.is_cancelled() {
      break;
    }
    let rows: Vec<(String, i32)> = sqlx::query_as(
      "SELECT w.id, w.sid FROM workspaces w WHERE w.sid > $1 \
         AND NOT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints c \
           WHERE c.kind='workspace_doc_lifecycle' AND c.scope=w.id AND c.status='completed') \
       ORDER BY w.sid ASC LIMIT $2",
    )
    .bind(last_sid)
    .bind(limit)
    .fetch_all(long_conn(db).await?.as_conn())
    .await
    .map_err(db_err("select pending lifecycle workspaces"))?;
    if rows.is_empty() {
      break;
    }
    for (ws_id, sid) in &rows {
      if cancel.is_cancelled() {
        break;
      }
      last_sid = *sid;
      let mut rtx = long_tx(db).await?;
      set_tx(
        rtx.tx_mut(),
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      )
      .await?;
      let (snapshot, updates) = load_root_doc_parts(rtx.tx_mut(), ws_id).await?;
      let source_rev = compute_source_revision(&snapshot, &updates);
      let (docs, root_status) = decode_root_pages(ws_id, &snapshot, &updates);
      commit_tx(rtx).await?;
      let mut wtx = long_tx(db).await?;
      set_tx(wtx.tx_mut(), "SET LOCAL lock_timeout = '250ms'").await?;
      let k1 = format!("storage-workspace:{ws_id}");
      let k2 = format!("workspace-doc-update:{ws_id}/{ws_id}");
      if !try_advisory_lock_key(wtx.tx_mut(), &k1, "lock workspace lifecycle").await?
        || !try_advisory_lock_key(wtx.tx_mut(), &k2, "lock root doc").await?
      {
        let _ = wtx.rollback().await;
        continue;
      }
      set_tx(wtx.tx_mut(), "SET LOCAL lock_timeout = DEFAULT").await?;
      let (still_active, ws_pending): (bool, bool) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
           WHERE kind='workspace_doc_lifecycle_activation' AND scope='global' AND status='active'), \
         EXISTS(SELECT 1 FROM workspaces WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
           WHERE kind='workspace_doc_lifecycle' AND scope=$1 AND status='completed') FOR KEY SHARE)",
      )
      .bind(ws_id)
      .fetch_one(&mut **wtx.tx_mut())
      .await
      .map_err(db_err("recheck lifecycle activation and identity"))?;
      if !still_active {
        let _ = wtx.rollback().await;
        return Ok(report);
      }
      if !ws_pending {
        commit_tx(wtx).await?;
        continue;
      }
      let (cur_snap, cur_upds) = load_root_doc_parts(wtx.tx_mut(), ws_id).await?;
      if compute_source_revision(&cur_snap, &cur_upds) != source_rev {
        let _ = wtx.rollback().await;
        continue;
      }
      let (doc_ids, trashed): (Vec<String>, Vec<bool>) = docs.into_iter().unzip();
      if !doc_ids.is_empty() {
        sqlx::query(
          "INSERT INTO updates(workspace_id, guid, blob, created_at) \
           SELECT $1, i.doc_id, $3, date_trunc('milliseconds', clock_timestamp()) \
           FROM unnest($2::text[]) i(doc_id) \
           LEFT JOIN workspace_pages p ON p.workspace_id=$1 AND p.page_id=i.doc_id \
           WHERE p.lifecycle_state IS DISTINCT FROM 'deleted' \
             AND NOT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$1 AND guid=i.doc_id) \
             AND NOT EXISTS(SELECT 1 FROM updates WHERE workspace_id=$1 AND guid=i.doc_id)",
        )
        .bind(ws_id)
        .bind(&doc_ids)
        .bind(&[0u8, 0][..])
        .execute(&mut **wtx.tx_mut())
        .await
        .map_err(db_err("retain legacy doc identities"))?;
        sqlx::query(
          "INSERT INTO workspace_pages(workspace_id, page_id, lifecycle_state, lifecycle_changed_at) \
           SELECT $1, i.doc_id, 'trashed', date_trunc('milliseconds', clock_timestamp()) \
           FROM unnest($2::text[], $3::bool[]) i(doc_id, trashed) WHERE i.trashed \
           ON CONFLICT(workspace_id, page_id) DO UPDATE SET \
             lifecycle_state='trashed', lifecycle_changed_at=EXCLUDED.lifecycle_changed_at \
           WHERE workspace_pages.lifecycle_changed_at IS NULL \
             AND workspace_pages.lifecycle_state IS DISTINCT FROM 'deleted'",
        )
        .bind(ws_id)
        .bind(&doc_ids)
        .bind(&trashed)
        .execute(&mut **wtx.tx_mut())
        .await
        .map_err(db_err("migrate legacy doc trash"))?;
      }
      sqlx::query(
        "INSERT INTO storage_reconciliation_checkpoints(kind, scope, status, metadata, completed_at, updated_at) \
         VALUES('workspace_doc_lifecycle', $1, 'completed', $2, clock_timestamp(), clock_timestamp()) \
         ON CONFLICT(kind, scope) DO UPDATE SET status='completed', metadata=EXCLUDED.metadata, \
           completed_at=COALESCE(storage_reconciliation_checkpoints.completed_at, EXCLUDED.completed_at), \
           updated_at=clock_timestamp()",
      )
      .bind(ws_id)
      .bind(json!({"protocolVersion": 2, "sourceRevision": source_rev, "rootStatus": root_status}))
      .execute(&mut **wtx.tx_mut())
      .await
      .map_err(db_err("complete lifecycle migration"))?;
      commit_tx(wtx).await?;
      if let Some(inv) = invalidation {
        let _ = inv
          .publish_invalidation(&InvalidationHintV1::WorkspaceInventoryChanged {
            workspace_id: ws_id.clone(),
            doc_id: None,
          })
          .await;
      }
      report.migrated_workspaces += 1;
    }
    if (rows.len() as i64) < limit {
      break;
    }
  }
  Ok(report)
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct NotificationHousekeepingReport {
  pub deleted_expired: usize,
  pub notified_users: usize,
}
pub async fn cleanup_expired_notifications(
  db: &ServerDb,
  retention_days: i32,
  batch_limit: i64,
  event_bus: Option<&dyn EventBusPublisher>,
  cancel: &CancellationToken,
) -> Result<NotificationHousekeepingReport, DomainError> {
  let (limit, days) = (batch_limit.clamp(1, 1000), retention_days.max(1));
  let (mut report, mut affected) = (NotificationHousekeepingReport::default(), HashSet::new());
  for _ in 0..100 {
    if cancel.is_cancelled() {
      break;
    }
    let users: Vec<String> = sqlx::query_scalar(
      "WITH v AS (SELECT id FROM notifications WHERE created_at < clock_timestamp() - make_interval(days => $1) ORDER BY id ASC LIMIT $2) \
       DELETE FROM notifications n USING v WHERE n.id = v.id RETURNING n.user_id",
    )
    .bind(days).bind(limit).fetch_all(long_conn(db).await?.as_conn()).await.map_err(db_err("cleanup expired notifications"))?;
    let n = users.len();
    report.deleted_expired += n;
    affected.extend(users);
    if (n as i64) < limit {
      break;
    }
  }
  if let Some(bus) = event_bus
    && !affected.is_empty()
  {
    let user_ids: Vec<String> = affected.into_iter().collect();
    let res: Result<Vec<(String, i64)>, sqlx::Error> = sqlx::query_as(
      "SELECT u.id AS user_id, COUNT(n.id)::bigint AS cnt FROM unnest($1::text[]) AS u(id) \
       LEFT JOIN notifications n ON n.user_id = u.id AND n.read = false GROUP BY u.id",
    )
    .bind(&user_ids)
    .fetch_all(long_conn(db).await?.as_conn())
    .await;
    for (uid, unread) in res.unwrap_or_default() {
      if cancel.is_cancelled() {
        break;
      }
      let payload = json!({"topic": "notification.count.changed", "room": format!("user:{uid}:notification"), "input": {}, "event": {"count": unread, "reason": "expired-cleanup"}});
      let _ = bus.publish_event("realtime.topic.changed", payload, None).await;
      report.notified_users += 1;
    }
  }
  Ok(report)
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct MailHousekeepingReport {
  pub expired_marked_failed: usize,
  pub skipped_disabled_recipients: usize,
  pub deleted_retained: usize,
}
pub async fn cleanup_mail_deliveries_and_skip_disabled(
  db: &ServerDb,
  retention_days: i32,
  batch_limit: i64,
  cancel: &CancellationToken,
) -> Result<MailHousekeepingReport, DomainError> {
  let (limit, days) = (batch_limit.clamp(1, 1000), retention_days.max(1));
  let steps = [
    (
      "expire stale mail deliveries",
      "WITH t AS (SELECT id FROM mail_deliveries \
         WHERE (status IN ('queued', 'retry_wait') OR (status = 'sending' AND locked_until < clock_timestamp())) \
           AND expires_at IS NOT NULL AND expires_at <= clock_timestamp() \
         ORDER BY id ASC LIMIT $1 FOR UPDATE SKIP LOCKED) \
       UPDATE mail_deliveries m SET status='failed', retention_state='anonymized', recipient_email=NULL, payload=NULL, \
         locked_by=NULL, locked_until=NULL, failed_at=COALESCE(failed_at, CURRENT_TIMESTAMP), \
         settled_at=COALESCE(settled_at, CURRENT_TIMESTAMP), anonymized_at=COALESCE(anonymized_at, CURRENT_TIMESTAMP), \
         last_error_code='expired', updated_at=CURRENT_TIMESTAMP \
       FROM t WHERE m.id = t.id \
         AND (m.status IN ('queued', 'retry_wait') OR (m.status = 'sending' AND m.locked_until < clock_timestamp()))",
    ),
    (
      "skip disabled mail recipients",
      "WITH t AS (SELECT m.id FROM mail_deliveries m JOIN users u ON lower(u.email) = lower(m.recipient_email) \
         WHERE (m.status IN ('queued', 'retry_wait') OR (m.status = 'sending' AND m.locked_until < clock_timestamp())) \
           AND u.disabled = true ORDER BY m.id ASC LIMIT $1 FOR UPDATE OF m SKIP LOCKED) \
       UPDATE mail_deliveries m SET status='skipped', retention_state='anonymized', recipient_email=NULL, payload=NULL, \
         locked_by=NULL, locked_until=NULL, settled_at=COALESCE(settled_at, CURRENT_TIMESTAMP), \
         anonymized_at=COALESCE(anonymized_at, CURRENT_TIMESTAMP), last_error_code='disabled_recipient', \
         updated_at=CURRENT_TIMESTAMP \
       FROM t WHERE m.id = t.id \
         AND (m.status IN ('queued', 'retry_wait') OR (m.status = 'sending' AND m.locked_until < clock_timestamp()))",
    ),
  ];
  let mut counts = [0usize; 2];
  for (i, (ctx, sql)) in steps.iter().enumerate() {
    if cancel.is_cancelled() {
      break;
    }
    let mut tx = long_tx(db).await?;
    let n = sqlx::query(sql)
      .bind(limit)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(db_err(ctx))?
      .rows_affected();
    commit_tx(tx).await?;
    counts[i] = usize::try_from(n).unwrap_or(0);
  }
  let deleted_retained = if cancel.is_cancelled() {
    0
  } else {
    let n = sqlx::query(
      "WITH t AS (SELECT id FROM mail_deliveries \
         WHERE settled_at IS NOT NULL AND settled_at <= clock_timestamp() - make_interval(days => $1) \
         ORDER BY id ASC LIMIT $2) \
       DELETE FROM mail_deliveries m USING t WHERE m.id = t.id",
    )
    .bind(days)
    .bind(limit)
    .execute(long_conn(db).await?.as_conn())
    .await
    .map_err(db_err("delete retained mail deliveries"))?
    .rows_affected();
    usize::try_from(n).unwrap_or(0)
  };
  Ok(MailHousekeepingReport {
    expired_marked_failed: counts[0],
    skipped_disabled_recipients: counts[1],
    deleted_retained,
  })
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RuntimeHousekeepingReport {
  pub deleted_runtime_states: usize,
  pub deleted_runtime_gates: usize,
  pub deleted_runtime_leases: usize,
}
pub async fn cleanup_expired_runtime_housekeeping(
  db: &ServerDb,
  batch_limit: i64,
  cancel: &CancellationToken,
) -> Result<RuntimeHousekeepingReport, DomainError> {
  let limit = batch_limit.clamp(1, 1000);
  let specs = [
    (
      "public.runtime_states",
      "WITH v AS (SELECT purpose, token_hash FROM runtime_states \
         WHERE expires_at <= clock_timestamp() OR consumed_at IS NOT NULL ORDER BY expires_at ASC LIMIT $1) \
       DELETE FROM runtime_states rs USING v WHERE rs.purpose=v.purpose AND rs.token_hash=v.token_hash \
         AND (rs.expires_at <= clock_timestamp() OR rs.consumed_at IS NOT NULL)",
    ),
    (
      "public.runtime_gates",
      "WITH v AS (SELECT key FROM runtime_gates WHERE expires_at <= clock_timestamp() ORDER BY expires_at ASC LIMIT $1) \
       DELETE FROM runtime_gates rg USING v WHERE rg.key=v.key AND rg.expires_at <= clock_timestamp()",
    ),
    (
      "public.runtime_leases",
      "WITH v AS (SELECT key FROM runtime_leases WHERE expires_at <= clock_timestamp() ORDER BY expires_at ASC LIMIT $1) \
       DELETE FROM runtime_leases rl USING v WHERE rl.key=v.key AND rl.expires_at <= clock_timestamp()",
    ),
  ];
  let mut counts = [0usize; 3];
  for (i, (rc, sql)) in specs.iter().enumerate() {
    let ok: bool = sqlx::query_scalar("SELECT to_regclass($1) IS NOT NULL")
      .bind(rc)
      .fetch_one(long_conn(db).await?.as_conn())
      .await
      .map_err(db_err("check runtime table"))?;
    for _ in 0..usize::from(ok) * 100 {
      if cancel.is_cancelled() {
        break;
      }
      let n = sqlx::query(sql)
        .bind(limit)
        .execute(long_conn(db).await?.as_conn())
        .await
        .map_err(db_err("cleanup expired runtime rows"))?
        .rows_affected() as usize;
      counts[i] += n;
      if (n as i64) < limit {
        break;
      }
    }
  }
  Ok(RuntimeHousekeepingReport {
    deleted_runtime_states: counts[0],
    deleted_runtime_gates: counts[1],
    deleted_runtime_leases: counts[2],
  })
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct WorkspaceStatsReport {
  pub locked: bool,
  pub processed_workspaces: usize,
  pub daily_snapshot_written: bool,
}
async fn try_lock_stats_tx(tx: &mut PgTx<'_>, wait: bool) -> Result<bool, DomainError> {
  if !wait {
    return sqlx::query_scalar("SELECT pg_try_advisory_xact_lock($1)")
      .bind(WORKSPACE_STATS_LOCK_ID)
      .fetch_one(&mut **tx)
      .await
      .map_err(db_err("acquire workspace stats lock"));
  }
  set_tx(tx, "SET LOCAL lock_timeout = '250ms'").await?;
  let res = sqlx::query("SELECT pg_advisory_xact_lock($1)")
    .bind(WORKSPACE_STATS_LOCK_ID)
    .execute(&mut **tx)
    .await;
  if let Err(sqlx::Error::Database(db)) = &res
    && db.code().as_deref() == Some("55P03")
  {
    return Ok(false);
  }
  res.map_err(db_err("acquire workspace stats lock"))?;
  set_tx(tx, "SET LOCAL lock_timeout = DEFAULT").await?;
  Ok(true)
}
async fn upsert_workspace_admin_stats(tx: &mut PgTx<'_>, workspace_ids: &[String]) -> Result<(), DomainError> {
  if workspace_ids.is_empty() {
    return Ok(());
  }
  sqlx::query(
    "WITH t AS (SELECT UNNEST($1::varchar[]) AS workspace_id), \
     ss AS (SELECT workspace_id, COUNT(*) AS sc, COALESCE(SUM(COALESCE(size, octet_length(blob))), 0) AS sz \
       FROM snapshots WHERE workspace_id IN (SELECT workspace_id FROM t) GROUP BY workspace_id), \
     bs AS (SELECT workspace_id, COUNT(*) FILTER (WHERE deleted_at IS NULL AND status='completed') AS bc, \
       COALESCE(SUM(size) FILTER (WHERE deleted_at IS NULL AND status='completed'), 0) AS bz \
       FROM blobs WHERE workspace_id IN (SELECT workspace_id FROM t) GROUP BY workspace_id), \
     ms AS (SELECT workspace_id, COUNT(*) AS mc FROM workspace_members \
       WHERE workspace_id IN (SELECT workspace_id FROM t) AND state='active' GROUP BY workspace_id), \
     pp AS (SELECT workspace_id, COUNT(*) AS pc FROM doc_access_policies \
       WHERE visibility='public' AND public_role='external' AND workspace_id IN (SELECT workspace_id FROM t) GROUP BY workspace_id) \
     INSERT INTO workspace_admin_stats (workspace_id, snapshot_count, snapshot_size, blob_count, blob_size, member_count, public_page_count, updated_at) \
     SELECT t.workspace_id, COALESCE(ss.sc,0), COALESCE(ss.sz,0), COALESCE(bs.bc,0), COALESCE(bs.bz,0), COALESCE(ms.mc,0), COALESCE(pp.pc,0), NOW() \
     FROM t LEFT JOIN ss ON ss.workspace_id=t.workspace_id LEFT JOIN bs ON bs.workspace_id=t.workspace_id \
       LEFT JOIN ms ON ms.workspace_id=t.workspace_id LEFT JOIN pp ON pp.workspace_id=t.workspace_id \
     ON CONFLICT (workspace_id) DO UPDATE SET snapshot_count=EXCLUDED.snapshot_count, snapshot_size=EXCLUDED.snapshot_size, \
       blob_count=EXCLUDED.blob_count, blob_size=EXCLUDED.blob_size, member_count=EXCLUDED.member_count, \
       public_page_count=EXCLUDED.public_page_count, updated_at=EXCLUDED.updated_at",
  )
  .bind(workspace_ids).execute(&mut **tx).await.map_err(db_err("upsert workspace_admin_stats"))?;
  Ok(())
}
pub async fn refresh_dirty_workspace_stats(
  db: &ServerDb,
  batch_limit: i64,
  cancel: &CancellationToken,
) -> Result<WorkspaceStatsReport, DomainError> {
  let (limit, mut report) = (batch_limit.clamp(1, 1000), WorkspaceStatsReport::default());
  if cancel.is_cancelled() {
    return Ok(report);
  }
  let mut tx = long_tx(db).await?;
  if !try_lock_stats_tx(tx.tx_mut(), false).await? {
    let _ = tx.rollback().await;
    return Ok(report);
  }
  report.locked = true;
  let dirty_ids: Vec<String> = sqlx::query_scalar(
    "SELECT workspace_id FROM workspace_admin_stats_dirty ORDER BY updated_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED",
  )
  .bind(limit)
  .fetch_all(&mut **tx.tx_mut())
  .await
  .map_err(db_err("load dirty workspace stats"))?;
  if !dirty_ids.is_empty() {
    upsert_workspace_admin_stats(tx.tx_mut(), &dirty_ids).await?;
    sqlx::query("DELETE FROM workspace_admin_stats_dirty WHERE workspace_id = ANY($1)")
      .bind(&dirty_ids)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(db_err("clear dirty workspace stats"))?;
    report.processed_workspaces = dirty_ids.len();
  }
  commit_tx(tx).await?;
  Ok(report)
}
pub async fn recalibrate_workspace_stats(
  db: &ServerDb,
  batch_limit: i64,
  cancel: &CancellationToken,
) -> Result<WorkspaceStatsReport, DomainError> {
  let (limit, mut report) = (batch_limit.clamp(1, 1000), WorkspaceStatsReport::default());
  if cancel.is_cancelled() {
    return Ok(report);
  }
  let high_water: i32 = sqlx::query_scalar("SELECT COALESCE(MAX(sid), 0) FROM workspaces")
    .fetch_one(long_conn(db).await?.as_conn())
    .await
    .map_err(db_err("load workspace sid high water"))?;
  for phase in 0..2 {
    let (mut last_sid, mut completed) = (0_i32, true);
    while !cancel.is_cancelled() {
      let mut tx = long_tx(db).await?;
      if !try_lock_stats_tx(tx.tx_mut(), true).await? {
        let _ = tx.rollback().await;
        completed = false;
        break;
      }
      report.locked = true;
      let rows: Vec<(String, i32)> =
        sqlx::query_as("SELECT id, sid FROM workspaces WHERE sid > $1 AND sid <= $2 ORDER BY sid ASC LIMIT $3")
          .bind(last_sid)
          .bind(high_water)
          .bind(limit)
          .fetch_all(&mut **tx.tx_mut())
          .await
          .map_err(db_err("fetch workspace sid batch"))?;
      let Some(&(_, sid)) = rows.last() else {
        commit_tx(tx).await?;
        report.daily_snapshot_written |= phase == 1;
        break;
      };
      last_sid = sid;
      let ids: Vec<String> = rows.into_iter().map(|(id, _)| id).collect();
      if phase == 0 {
        upsert_workspace_admin_stats(tx.tx_mut(), &ids).await?;
        report.processed_workspaces += ids.len();
      } else {
        sqlx::query(
          "INSERT INTO workspace_admin_stats_daily (workspace_id, date, snapshot_size, blob_size, member_count, updated_at) \
           SELECT workspace_id, CURRENT_DATE, snapshot_size, blob_size, member_count, NOW() \
           FROM workspace_admin_stats WHERE workspace_id = ANY($1) \
           ON CONFLICT (workspace_id, date) DO UPDATE SET snapshot_size=EXCLUDED.snapshot_size, \
             blob_size=EXCLUDED.blob_size, member_count=EXCLUDED.member_count, updated_at=EXCLUDED.updated_at",
        )
        .bind(&ids).execute(&mut **tx.tx_mut()).await.map_err(db_err("write workspace_admin_stats_daily batch"))?;
        report.daily_snapshot_written = true;
      }
      commit_tx(tx).await?;
      if (ids.len() as i64) < limit {
        break;
      }
    }
    if !completed || cancel.is_cancelled() {
      break;
    }
  }
  Ok(report)
}
