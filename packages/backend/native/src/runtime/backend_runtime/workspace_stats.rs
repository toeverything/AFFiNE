use sqlx::{FromRow, PgPool, Postgres, Row, Transaction};
use tokio::time::{Duration as TokioDuration, sleep};

use super::{
  BackendRuntime, RuntimeError, RuntimeResult,
  constants::{WORKSPACE_STATS_LEASE_KEY, WORKSPACE_STATS_LOCK_NAMESPACE, WORKSPACE_STATS_REFRESH_LOCK_KEY},
  napi_error,
  types::{
    CoordinationLeaseGrant, RuntimeWorkspaceStatsDailyRecalibrationResult, RuntimeWorkspaceStatsRecalibrationResult,
    RuntimeWorkspaceStatsRefreshResult, RuntimeWorkspaceStatsSnapshotResult,
  },
};

const UPSERT_WORKSPACE_ADMIN_STATS_SQL: &str = include_str!("sql/upsert_workspace_admin_stats.sql");

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn refresh_workspace_admin_stats_dirty(
    &self,
    batch_limit: i64,
    owner: String,
    lease_ttl_ms: i64,
  ) -> napi::Result<RuntimeWorkspaceStatsRefreshResult> {
    if batch_limit <= 0 {
      return Err(napi_error("workspace stats dirty refresh limit must be positive"));
    }

    let Some(lease) = self
      .acquire_coordination_lease_inner(WORKSPACE_STATS_LEASE_KEY.to_string(), owner, lease_ttl_ms)
      .await?
    else {
      return Ok(RuntimeWorkspaceStatsRefreshResult {
        processed: 0,
        backlog: 0,
        skipped: true,
      });
    };

    let result = async {
      WorkspaceStatsStore::new(self.pool().await?)
        .refresh_dirty(batch_limit)
        .await
    }
    .await;

    release_workspace_stats_lease(self, lease).await?;
    Ok(result?)
  }

  #[napi]
  pub async fn recalibrate_workspace_admin_stats(
    &self,
    last_sid: i64,
    batch_limit: i64,
    owner: String,
    lease_ttl_ms: i64,
  ) -> napi::Result<RuntimeWorkspaceStatsRecalibrationResult> {
    if batch_limit <= 0 {
      return Err(napi_error("workspace stats recalibration limit must be positive"));
    }

    let Some(lease) = self
      .acquire_coordination_lease_inner(WORKSPACE_STATS_LEASE_KEY.to_string(), owner, lease_ttl_ms)
      .await?
    else {
      return Ok(RuntimeWorkspaceStatsRecalibrationResult {
        processed: 0,
        last_sid,
        skipped: true,
      });
    };

    let result = async {
      WorkspaceStatsStore::new(self.pool().await?)
        .recalibrate(last_sid, batch_limit)
        .await
    }
    .await;

    release_workspace_stats_lease(self, lease).await?;
    Ok(result?)
  }

  #[napi]
  pub async fn write_workspace_admin_stats_daily_snapshot(
    &self,
    owner: String,
    lease_ttl_ms: i64,
  ) -> napi::Result<RuntimeWorkspaceStatsSnapshotResult> {
    let Some(lease) = self
      .acquire_coordination_lease_inner(WORKSPACE_STATS_LEASE_KEY.to_string(), owner, lease_ttl_ms)
      .await?
    else {
      return Ok(RuntimeWorkspaceStatsSnapshotResult {
        snapshotted: 0,
        skipped: true,
      });
    };

    let result = async {
      WorkspaceStatsStore::new(self.pool().await?)
        .write_daily_snapshot()
        .await
    }
    .await;

    release_workspace_stats_lease(self, lease).await?;
    Ok(result?)
  }

  #[napi]
  pub async fn recalibrate_workspace_admin_stats_daily(
    &self,
    batch_limit: i64,
    owner: String,
    lease_ttl_ms: i64,
    lock_retry_times: i64,
    lock_retry_delay_ms: i64,
  ) -> napi::Result<RuntimeWorkspaceStatsDailyRecalibrationResult> {
    if batch_limit <= 0 {
      return Err(napi_error("workspace stats daily recalibration limit must be positive"));
    }
    if lock_retry_times <= 0 {
      return Err(napi_error(
        "workspace stats daily recalibration retry times must be positive",
      ));
    }
    if lock_retry_delay_ms < 0 {
      return Err(napi_error(
        "workspace stats daily recalibration retry delay must be non-negative",
      ));
    }

    let Some(lease) = acquire_workspace_stats_lease_with_retry(
      self,
      owner.clone(),
      lease_ttl_ms,
      lock_retry_times,
      lock_retry_delay_ms,
    )
    .await?
    else {
      return Ok(RuntimeWorkspaceStatsDailyRecalibrationResult {
        processed: 0,
        last_sid: 0,
        snapshotted: 0,
        skipped: true,
      });
    };

    let result: RuntimeResult<RuntimeWorkspaceStatsDailyRecalibrationResult> = async {
      let store = WorkspaceStatsStore::new(self.pool().await?);
      let mut processed = 0;
      let mut last_sid = 0;

      loop {
        let batch = retry_workspace_stats_operation(lock_retry_times, lock_retry_delay_ms, || {
          store.recalibrate(last_sid, batch_limit)
        })
        .await?;

        if batch.skipped {
          return Ok(RuntimeWorkspaceStatsDailyRecalibrationResult {
            processed,
            last_sid,
            snapshotted: 0,
            skipped: true,
          });
        }

        if batch.processed == 0 {
          break;
        }

        processed += batch.processed;
        last_sid = batch.last_sid;

        if batch.processed < batch_limit {
          break;
        }
      }

      let snapshot =
        retry_workspace_stats_operation(lock_retry_times, lock_retry_delay_ms, || store.write_daily_snapshot()).await?;

      Ok(RuntimeWorkspaceStatsDailyRecalibrationResult {
        processed,
        last_sid,
        snapshotted: snapshot.snapshotted,
        skipped: snapshot.skipped,
      })
    }
    .await;

    release_workspace_stats_lease(self, lease).await?;
    Ok(result?)
  }
}

#[derive(FromRow)]
struct WorkspaceSid {
  id: String,
  sid: i32,
}

struct WorkspaceStatsStore {
  pool: PgPool,
}

impl WorkspaceStatsStore {
  fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  async fn refresh_dirty(&self, batch_limit: i64) -> RuntimeResult<RuntimeWorkspaceStatsRefreshResult> {
    let mut tx = self
      .pool
      .begin()
      .await
      .map_err(|err| RuntimeError::database("WorkspaceStats dirty refresh transaction failed", err))?;
    if !try_transaction_lock(&mut tx).await? {
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("WorkspaceStats dirty refresh commit failed", err))?;
      return Ok(RuntimeWorkspaceStatsRefreshResult {
        processed: 0,
        backlog: 0,
        skipped: true,
      });
    }

    let backlog = count_dirty(&mut tx).await?;
    let dirty = load_dirty(&mut tx, batch_limit).await?;
    if dirty.is_empty() {
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("WorkspaceStats dirty refresh commit failed", err))?;
      return Ok(RuntimeWorkspaceStatsRefreshResult {
        processed: 0,
        backlog,
        skipped: false,
      });
    }

    upsert_stats(&mut tx, &dirty).await?;
    clear_dirty(&mut tx, &dirty).await?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("WorkspaceStats dirty refresh commit failed", err))?;

    Ok(RuntimeWorkspaceStatsRefreshResult {
      processed: dirty.len() as i64,
      backlog,
      skipped: false,
    })
  }

  async fn recalibrate(
    &self,
    last_sid: i64,
    batch_limit: i64,
  ) -> RuntimeResult<RuntimeWorkspaceStatsRecalibrationResult> {
    let mut tx = self
      .pool
      .begin()
      .await
      .map_err(|err| RuntimeError::database("WorkspaceStats recalibration transaction failed", err))?;
    if !try_transaction_lock(&mut tx).await? {
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("WorkspaceStats recalibration commit failed", err))?;
      return Ok(RuntimeWorkspaceStatsRecalibrationResult {
        processed: 0,
        last_sid,
        skipped: true,
      });
    }

    let workspaces = fetch_workspace_batch(&mut tx, last_sid, batch_limit).await?;
    if workspaces.is_empty() {
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("WorkspaceStats recalibration commit failed", err))?;
      return Ok(RuntimeWorkspaceStatsRecalibrationResult {
        processed: 0,
        last_sid,
        skipped: false,
      });
    }

    let ids = workspaces
      .iter()
      .map(|workspace| workspace.id.clone())
      .collect::<Vec<_>>();
    let next_sid = workspaces
      .last()
      .map(|workspace| workspace.sid as i64)
      .unwrap_or(last_sid);
    upsert_stats(&mut tx, &ids).await?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("WorkspaceStats recalibration commit failed", err))?;

    Ok(RuntimeWorkspaceStatsRecalibrationResult {
      processed: ids.len() as i64,
      last_sid: next_sid,
      skipped: false,
    })
  }

  async fn write_daily_snapshot(&self) -> RuntimeResult<RuntimeWorkspaceStatsSnapshotResult> {
    let mut tx = self
      .pool
      .begin()
      .await
      .map_err(|err| RuntimeError::database("WorkspaceStats daily snapshot transaction failed", err))?;
    if !try_transaction_lock(&mut tx).await? {
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("WorkspaceStats daily snapshot commit failed", err))?;
      return Ok(RuntimeWorkspaceStatsSnapshotResult {
        snapshotted: 0,
        skipped: true,
      });
    }
    let snapshotted = write_daily_snapshot(&mut tx).await?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("WorkspaceStats daily snapshot commit failed", err))?;

    Ok(RuntimeWorkspaceStatsSnapshotResult {
      snapshotted,
      skipped: false,
    })
  }
}

async fn release_workspace_stats_lease(runtime: &BackendRuntime, lease: CoordinationLeaseGrant) -> RuntimeResult<()> {
  let _ = runtime
    .release_coordination_lease_inner(lease.key, lease.owner, lease.fencing_token)
    .await?;
  Ok(())
}

async fn acquire_workspace_stats_lease_with_retry(
  runtime: &BackendRuntime,
  owner: String,
  lease_ttl_ms: i64,
  retry_times: i64,
  retry_delay_ms: i64,
) -> RuntimeResult<Option<CoordinationLeaseGrant>> {
  for attempt in 0..retry_times {
    let lease = runtime
      .acquire_coordination_lease_inner(WORKSPACE_STATS_LEASE_KEY.to_string(), owner.clone(), lease_ttl_ms)
      .await?;
    if lease.is_some() {
      return Ok(lease);
    }

    if attempt < retry_times - 1 && retry_delay_ms > 0 {
      sleep(TokioDuration::from_millis(retry_delay_ms as u64)).await;
    }
  }

  Ok(None)
}

async fn retry_workspace_stats_operation<T, F, Fut>(
  retry_times: i64,
  retry_delay_ms: i64,
  mut operation: F,
) -> RuntimeResult<T>
where
  T: WorkspaceStatsSkippable,
  F: FnMut() -> Fut,
  Fut: std::future::Future<Output = RuntimeResult<T>>,
{
  for attempt in 0..retry_times {
    let result = operation().await?;
    if !result.skipped() || attempt == retry_times - 1 {
      return Ok(result);
    }

    if retry_delay_ms > 0 {
      sleep(TokioDuration::from_millis(retry_delay_ms as u64)).await;
    }
  }

  unreachable!("workspace stats retry loop validates retry_times > 0")
}

trait WorkspaceStatsSkippable {
  fn skipped(&self) -> bool;
}

impl WorkspaceStatsSkippable for RuntimeWorkspaceStatsRecalibrationResult {
  fn skipped(&self) -> bool {
    self.skipped
  }
}

impl WorkspaceStatsSkippable for RuntimeWorkspaceStatsSnapshotResult {
  fn skipped(&self) -> bool {
    self.skipped
  }
}

async fn try_transaction_lock(tx: &mut Transaction<'_, Postgres>) -> RuntimeResult<bool> {
  let row = sqlx::query(
    r#"
    SELECT pg_try_advisory_xact_lock(($1::bigint << 32) + $2::bigint) AS locked
    "#,
  )
  .bind(WORKSPACE_STATS_LOCK_NAMESPACE)
  .bind(WORKSPACE_STATS_REFRESH_LOCK_KEY)
  .fetch_one(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("WorkspaceStats transaction lock failed", err))?;

  Ok(row.get::<bool, _>("locked"))
}

async fn load_dirty(tx: &mut Transaction<'_, Postgres>, limit: i64) -> RuntimeResult<Vec<String>> {
  let rows = sqlx::query(
    r#"
    SELECT workspace_id
    FROM workspace_admin_stats_dirty
    ORDER BY updated_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
    "#,
  )
  .bind(limit)
  .fetch_all(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("WorkspaceStats load dirty workspaces failed", err))?;

  Ok(rows.into_iter().map(|row| row.get("workspace_id")).collect())
}

async fn count_dirty(tx: &mut Transaction<'_, Postgres>) -> RuntimeResult<i64> {
  let row = sqlx::query("SELECT COUNT(*) AS total FROM workspace_admin_stats_dirty")
    .fetch_one(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database("WorkspaceStats count dirty workspaces failed", err))?;
  Ok(row.get::<i64, _>("total"))
}

async fn clear_dirty(tx: &mut Transaction<'_, Postgres>, workspace_ids: &[String]) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    DELETE FROM workspace_admin_stats_dirty
    WHERE workspace_id = ANY($1::varchar[])
    "#,
  )
  .bind(workspace_ids)
  .execute(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("WorkspaceStats clear dirty workspaces failed", err))?;
  Ok(())
}

async fn upsert_stats(tx: &mut Transaction<'_, Postgres>, workspace_ids: &[String]) -> RuntimeResult<()> {
  if workspace_ids.is_empty() {
    return Ok(());
  }

  sqlx::query(UPSERT_WORKSPACE_ADMIN_STATS_SQL)
    .bind(workspace_ids)
    .execute(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database("WorkspaceStats upsert stats failed", err))?;
  Ok(())
}

async fn fetch_workspace_batch(
  tx: &mut Transaction<'_, Postgres>,
  last_sid: i64,
  limit: i64,
) -> RuntimeResult<Vec<WorkspaceSid>> {
  sqlx::query_as::<_, WorkspaceSid>(
    r#"
    SELECT id, sid
    FROM workspaces
    WHERE sid > $1
    ORDER BY sid
    LIMIT $2
    "#,
  )
  .bind(last_sid)
  .bind(limit)
  .fetch_all(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("WorkspaceStats fetch workspace batch failed", err))
}

async fn write_daily_snapshot(tx: &mut Transaction<'_, Postgres>) -> RuntimeResult<i64> {
  let result = sqlx::query(
    r#"
    INSERT INTO workspace_admin_stats_daily (
      workspace_id,
      date,
      snapshot_size,
      blob_size,
      member_count,
      updated_at
    )
    SELECT
      workspace_id,
      CURRENT_DATE,
      snapshot_size,
      blob_size,
      member_count,
      NOW()
    FROM workspace_admin_stats
    ON CONFLICT (workspace_id, date)
    DO UPDATE SET
      snapshot_size = EXCLUDED.snapshot_size,
      blob_size = EXCLUDED.blob_size,
      member_count = EXCLUDED.member_count,
      updated_at = EXCLUDED.updated_at
    "#,
  )
  .execute(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("WorkspaceStats daily snapshot failed", err))?;

  Ok(result.rows_affected() as i64)
}
