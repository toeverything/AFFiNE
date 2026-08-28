use chrono::{DateTime, Duration, TimeZone, Utc};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

use super::{RuntimeError, RuntimeResult};

const RESERVATION_TTL_SECONDS: i64 = 120;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct ScopeLimit {
  pub(super) scope_key: String,
  pub(super) window_seconds: i32,
  pub(super) bucket_seconds: i64,
  pub(super) limit: i32,
  pub(super) requested: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct QuotaViolation {
  pub(super) scope_key: String,
  pub(super) window_seconds: i32,
  pub(super) limit: i32,
  pub(super) current: i32,
  pub(super) requested: i32,
}

#[derive(Clone, Debug)]
pub(super) struct ReservationDecision {
  pub(super) reservation_id: String,
}

pub(super) fn bucket_seconds(window_seconds: i32) -> i64 {
  match window_seconds {
    60 => 10,
    3600 => 5 * 60,
    86_400 => 60 * 60,
    604_800 => 6 * 60 * 60,
    _ => 60,
  }
}

fn bucket_start(now: DateTime<Utc>, bucket_seconds: i64) -> DateTime<Utc> {
  let timestamp = now.timestamp();
  Utc
    .timestamp_opt(timestamp - timestamp.rem_euclid(bucket_seconds), 0)
    .single()
    .expect("valid unix timestamp bucket")
}

pub(super) fn scope(scope_key: String, window_seconds: i32, limit: i32, requested: i32) -> ScopeLimit {
  ScopeLimit {
    scope_key,
    window_seconds,
    bucket_seconds: bucket_seconds(window_seconds),
    limit,
    requested,
  }
}

pub(super) async fn reserve_scopes(
  pool: &PgPool,
  purpose: &str,
  request_id: Option<&str>,
  scopes: Vec<ScopeLimit>,
) -> RuntimeResult<std::result::Result<ReservationDecision, QuotaViolation>> {
  let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(pool)
    .await
    .map_err(|err| RuntimeError::database("failed to read database clock", err))?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("failed to begin quota reservation transaction", err))?;

  let mut sorted_scope_keys = std::collections::BTreeSet::new();
  for scope in &scopes {
    sorted_scope_keys.insert(scope.scope_key.clone());
  }
  for scope_key in sorted_scope_keys {
    advisory_lock(&mut tx, &scope_key).await?;
  }

  let reservation_id = Uuid::new_v4();
  for scope in &scopes {
    let bucket_start = bucket_start(now, scope.bucket_seconds);
    let window_start = now - Duration::seconds(scope.window_seconds as i64);
    let committed: i64 = sqlx::query_scalar(
      r#"
      SELECT COALESCE(SUM(count), 0)::bigint
      FROM runtime_rolling_quota_counters
      WHERE scope_key = $1
        AND window_seconds = $2
        AND bucket_start >= $3
      "#,
    )
    .bind(&scope.scope_key)
    .bind(scope.window_seconds)
    .bind(window_start)
    .fetch_one(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("failed to read rolling quota counter", err))?;
    let reserved: i64 = sqlx::query_scalar(
      r#"
      SELECT COALESCE(SUM(count), 0)::bigint
      FROM runtime_rolling_quota_reservations
      WHERE scope_key = $1
        AND window_seconds = $2
        AND bucket_start >= $3
        AND status = 'reserved'
        AND expires_at > $4
      "#,
    )
    .bind(&scope.scope_key)
    .bind(scope.window_seconds)
    .bind(window_start)
    .bind(now)
    .fetch_one(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("failed to read rolling quota reservations", err))?;
    let current = committed.saturating_add(reserved) as i32;
    if current.saturating_add(scope.requested) > scope.limit {
      tx.rollback()
        .await
        .map_err(|err| RuntimeError::database("failed to rollback rejected quota reservation", err))?;
      return Ok(Err(QuotaViolation {
        scope_key: scope.scope_key.clone(),
        window_seconds: scope.window_seconds,
        limit: scope.limit,
        current,
        requested: scope.requested,
      }));
    }
    sqlx::query(
      r#"
      INSERT INTO runtime_rolling_quota_reservations (
        id, scope_key, window_seconds, bucket_start, count, status, purpose, request_id, expires_at
      )
      VALUES ($1::uuid, $2, $3, $4, $5, 'reserved', $6, $7, $8)
      "#,
    )
    .bind(reservation_id.to_string())
    .bind(&scope.scope_key)
    .bind(scope.window_seconds)
    .bind(bucket_start)
    .bind(scope.requested)
    .bind(purpose)
    .bind(request_id)
    .bind(now + Duration::seconds(RESERVATION_TTL_SECONDS))
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("failed to create rolling quota reservation", err))?;
  }

  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("failed to commit quota reservation", err))?;
  Ok(Ok(ReservationDecision {
    reservation_id: reservation_id.to_string(),
  }))
}

async fn advisory_lock(tx: &mut Transaction<'_, Postgres>, scope_key: &str) -> RuntimeResult<()> {
  let hash = Sha256::digest(scope_key.as_bytes());
  let mut bytes = [0_u8; 8];
  bytes.copy_from_slice(&hash[..8]);
  let lock_key = i64::from_be_bytes(bytes);
  sqlx::query("SELECT pg_advisory_xact_lock($1)")
    .bind(lock_key)
    .execute(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database("failed to acquire rolling quota advisory lock", err))?;
  Ok(())
}

pub(super) async fn commit_reservation<F>(
  pool: &PgPool,
  reservation_id: &str,
  settle_usage: i32,
  actual_usage_for_scope: F,
) -> RuntimeResult<bool>
where
  F: Fn(&str, i32) -> i32,
{
  let reservation_id =
    Uuid::parse_str(reservation_id).map_err(|_| RuntimeError::invalid_input("invalid reservation id"))?;
  let reservation_id = reservation_id.to_string();
  let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(pool)
    .await
    .map_err(|err| RuntimeError::database("failed to read database clock", err))?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("failed to begin quota commit transaction", err))?;
  let rows = sqlx::query(
    r#"
    SELECT scope_key, window_seconds, bucket_start, count
    FROM runtime_rolling_quota_reservations
    WHERE id = $1::uuid AND status = 'reserved'
    FOR UPDATE
    "#,
  )
  .bind(&reservation_id)
  .fetch_all(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("failed to load quota reservation", err))?;
  if rows.is_empty() {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("failed to rollback empty quota commit", err))?;
    return Ok(false);
  }
  for row in &rows {
    advisory_lock(&mut tx, row.get("scope_key")).await?;
  }
  for row in &rows {
    let reserved_count: i32 = row.get("count");
    let scope_key: String = row.get("scope_key");
    let count = actual_usage_for_scope(&scope_key, reserved_count)
      .min(reserved_count)
      .max(0);
    if count > 0 {
      let window_seconds: i32 = row.get("window_seconds");
      sqlx::query(
        r#"
        INSERT INTO runtime_rolling_quota_counters (scope_key, window_seconds, bucket_start, count, expires_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (scope_key, window_seconds, bucket_start)
        DO UPDATE SET count = runtime_rolling_quota_counters.count + EXCLUDED.count,
                      expires_at = GREATEST(runtime_rolling_quota_counters.expires_at, EXCLUDED.expires_at),
                      updated_at = EXCLUDED.updated_at
        "#,
      )
      .bind(scope_key)
      .bind(window_seconds)
      .bind(row.get::<DateTime<Utc>, _>("bucket_start"))
      .bind(count)
      .bind(now + Duration::seconds(window_seconds as i64 * 2))
      .bind(now)
      .execute(&mut *tx)
      .await
      .map_err(|err| RuntimeError::database("failed to commit rolling quota counter", err))?;
    }
  }
  sqlx::query(
    r#"
    UPDATE runtime_rolling_quota_reservations
    SET status = CASE WHEN $2 > 0 THEN 'committed' ELSE 'released' END,
        committed_at = CASE WHEN $2 > 0 THEN $3 ELSE committed_at END,
        released_at = CASE WHEN $2 <= 0 THEN $3 ELSE released_at END,
        updated_at = $3
    WHERE id = $1::uuid AND status = 'reserved'
    "#,
  )
  .bind(&reservation_id)
  .bind(settle_usage)
  .bind(now)
  .execute(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("failed to settle quota reservation", err))?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("failed to commit quota commit transaction", err))?;
  Ok(true)
}

pub(super) async fn release_reservation(pool: &PgPool, reservation_id: &str) -> RuntimeResult<bool> {
  let reservation_id =
    Uuid::parse_str(reservation_id).map_err(|_| RuntimeError::invalid_input("invalid reservation id"))?;
  let reservation_id = reservation_id.to_string();
  let result = sqlx::query(
    r#"
    UPDATE runtime_rolling_quota_reservations
    SET status = 'released',
        released_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = $1::uuid AND status = 'reserved'
    "#,
  )
  .bind(reservation_id)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to release quota reservation", err))?;
  Ok(result.rows_affected() > 0)
}

pub(super) async fn cleanup_expired(pool: &PgPool, limit: i64) -> RuntimeResult<i64> {
  let released = sqlx::query(
    r#"
    UPDATE runtime_rolling_quota_reservations
    SET status = 'expired',
        updated_at = clock_timestamp()
    WHERE (id, scope_key, window_seconds, bucket_start) IN (
      SELECT id, scope_key, window_seconds, bucket_start
      FROM runtime_rolling_quota_reservations
      WHERE status = 'reserved' AND expires_at <= clock_timestamp()
      LIMIT $1
    )
    "#,
  )
  .bind(limit)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to expire rolling quota reservations", err))?
  .rows_affected() as i64;

  let counters = sqlx::query(
    r#"
    DELETE FROM runtime_rolling_quota_counters
    WHERE (scope_key, window_seconds, bucket_start) IN (
      SELECT scope_key, window_seconds, bucket_start
      FROM runtime_rolling_quota_counters
      WHERE expires_at <= clock_timestamp()
      LIMIT $1
    )
    "#,
  )
  .bind(limit)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to delete expired rolling quota counters", err))?
  .rows_affected() as i64;

  Ok(released + counters)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn bucket_boundaries_match_policy_windows() {
    let now = Utc.with_ymd_and_hms(2026, 7, 6, 1, 2, 3).single().unwrap();
    assert_eq!(bucket_seconds(60), 10);
    assert_eq!(bucket_seconds(3600), 300);
    assert_eq!(bucket_seconds(86_400), 3600);
    assert_eq!(bucket_seconds(604_800), 21_600);
    assert_eq!(
      bucket_start(now, 300),
      Utc.with_ymd_and_hms(2026, 7, 6, 1, 0, 0).single().unwrap()
    );
  }
}
