use chrono::{DateTime, Duration, Utc};
use napi::bindgen_prelude::Buffer;
use sqlx::{Postgres, Row, Transaction};

use super::{BackendRuntime, RuntimeError, RuntimeResult, napi_error, types::RuntimeDocHistoryInput};

fn is_empty_doc(bin: &[u8]) -> bool {
  bin.is_empty() || (bin.len() == 1 && bin[0] == 0) || (bin.len() == 2 && bin[0] == 0 && bin[1] == 0)
}

async fn latest_history_timestamp(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<DateTime<Utc>>> {
  sqlx::query(
    r#"
    SELECT timestamp
    FROM snapshot_histories
    WHERE workspace_id = $1 AND guid = $2
    ORDER BY timestamp DESC
    LIMIT 1
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut **transaction)
  .await
  .map(|row| row.map(|row| row.get("timestamp")))
  .map_err(|err| RuntimeError::database("DocStorage load latest history failed", err))
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn upsert_doc_snapshot(
    &self,
    workspace_id: String,
    doc_id: String,
    blob: Buffer,
    timestamp_ms: i64,
    editor_id: Option<String>,
  ) -> napi::Result<bool> {
    if is_empty_doc(blob.as_ref()) {
      return Ok(false);
    }

    let timestamp = DateTime::<Utc>::from_timestamp_millis(timestamp_ms)
      .ok_or_else(|| RuntimeError::invalid_input(format!("Invalid doc snapshot timestamp: {timestamp_ms}")))?;
    let pool = self.pool().await?;
    let mut transaction = pool
      .begin()
      .await
      .map_err(|err| RuntimeError::database("DocStorage begin snapshot transaction failed", err))?;
    super::domain_command::lock_workspace_storage_shared(&mut transaction, &workspace_id).await?;
    super::domain_command::lock_workspace_doc_update(&mut transaction, &workspace_id, &doc_id).await?;
    let row = sqlx::query(
      r#"
      INSERT INTO snapshots
        (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by)
      VALUES
        ($1, $2, $3, $4, $5, $5, $6, $6)
      ON CONFLICT (workspace_id, guid)
      DO UPDATE SET
        blob = $3,
        size = $4,
        updated_at = $5,
        updated_by = $6
      WHERE snapshots.workspace_id = $1
        AND snapshots.guid = $2
        AND snapshots.updated_at <= $5
      RETURNING updated_at
      "#,
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(blob.as_ref())
    .bind(blob.len() as i64)
    .bind(timestamp)
    .bind(editor_id.as_deref())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|err| RuntimeError::database("DocStorage upsert snapshot failed", err))?;
    if row.is_some() {
      super::domain_command::invalidate_doc_blob_projection(
        &mut transaction,
        &workspace_id,
        &doc_id,
        self.embedding_schema_ready()?,
      )
      .await?;
    }
    transaction
      .commit()
      .await
      .map_err(|err| RuntimeError::database("DocStorage commit snapshot transaction failed", err))?;

    Ok(row.is_some())
  }

  #[napi]
  pub async fn create_doc_history(&self, input: RuntimeDocHistoryInput) -> napi::Result<bool> {
    if input.history_min_interval_ms < 0 {
      return Err(napi_error("doc history interval must be non-negative"));
    }
    if input.history_max_age_ms <= 0 || is_empty_doc(input.blob.as_ref()) {
      return Ok(false);
    }

    let timestamp = DateTime::<Utc>::from_timestamp_millis(input.timestamp_ms)
      .ok_or_else(|| RuntimeError::invalid_input(format!("Invalid doc history timestamp: {}", input.timestamp_ms)))?;
    let pool = self.pool().await?;
    let mut transaction = pool
      .begin()
      .await
      .map_err(|err| RuntimeError::database("DocStorage begin history transaction failed", err))?;
    super::domain_command::lock_workspace_storage_shared(&mut transaction, &input.workspace_id).await?;
    super::domain_command::lock_workspace_doc_update(&mut transaction, &input.workspace_id, &input.doc_id).await?;
    super::domain_command::invalidate_doc_blob_projection(
      &mut transaction,
      &input.workspace_id,
      &input.doc_id,
      self.embedding_schema_ready()?,
    )
    .await?;
    let should_create = match latest_history_timestamp(&mut transaction, &input.workspace_id, &input.doc_id).await? {
      None => true,
      Some(last_timestamp) if last_timestamp == timestamp => false,
      Some(last_timestamp) => {
        input.force || last_timestamp < timestamp - Duration::milliseconds(input.history_min_interval_ms)
      }
    };

    if !should_create {
      return Ok(false);
    }

    let expired_at = Utc::now() + Duration::milliseconds(input.history_max_age_ms);
    sqlx::query(
      r#"
      INSERT INTO snapshot_histories
        (workspace_id, guid, timestamp, blob, expired_at, created_by)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (workspace_id, guid, timestamp)
      DO UPDATE SET expired_at = EXCLUDED.expired_at
      "#,
    )
    .bind(&input.workspace_id)
    .bind(&input.doc_id)
    .bind(timestamp)
    .bind(input.blob.as_ref())
    .bind(expired_at)
    .bind(input.editor_id.as_deref())
    .execute(&mut *transaction)
    .await
    .map_err(|err| RuntimeError::database("DocStorage create history failed", err))?;
    transaction
      .commit()
      .await
      .map_err(|err| RuntimeError::database("DocStorage commit history transaction failed", err))?;

    Ok(true)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::{backend_runtime::tests::runtime_from_database_url, migrations::DATABASE_TEST_LOCK};

  #[tokio::test]
  async fn snapshot_writes_invalidate_only_committed_sources() -> anyhow::Result<()> {
    let _guard = DATABASE_TEST_LOCK.lock().await;
    let Some(runtime) = runtime_from_database_url().await? else {
      return Ok(());
    };
    let pool = runtime.pool().await?;
    let workspace_id = format!("snapshot-writer-{}", uuid::Uuid::new_v4());
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    let timestamp = Utc::now().timestamp_millis();
    let blob = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], "live", None)?;
    assert!(
      runtime
        .upsert_doc_snapshot(
          workspace_id.clone(),
          workspace_id.clone(),
          blob.clone().into(),
          timestamp,
          None
        )
        .await?
    );
    for delta in [-1, 0, 1] {
      sqlx::query(
        "INSERT INTO doc_blob_ref_projections(workspace_id,doc_id,source_revision,parser_version,status,indexed_at) \
         VALUES($1,$1,to_timestamp($2::bigint::double precision/1000),1,'fresh',now()) ON \
         CONFLICT(workspace_id,doc_id) DO UPDATE SET status='fresh',indexed_at=now()",
      )
      .bind(&workspace_id)
      .bind(timestamp)
      .execute(&pool)
      .await?;
      sqlx::query(
        "UPDATE workspaces SET last_check_embeddings=to_timestamp($2::bigint::double precision/1000) WHERE id=$1",
      )
      .bind(&workspace_id)
      .bind(timestamp)
      .execute(&pool)
      .await?;
      let accepted = runtime
        .upsert_doc_snapshot(
          workspace_id.clone(),
          workspace_id.clone(),
          blob.clone().into(),
          timestamp + delta,
          None,
        )
        .await?;
      assert_eq!(accepted, delta >= 0);
      let status: String =
        sqlx::query_scalar("SELECT status FROM doc_blob_ref_projections WHERE workspace_id=$1 AND doc_id=$1")
          .bind(&workspace_id)
          .fetch_one(&pool)
          .await?;
      assert_eq!(status, if accepted { "pending" } else { "fresh" });
      let checked_at: DateTime<Utc> = sqlx::query_scalar("SELECT last_check_embeddings FROM workspaces WHERE id=$1")
        .bind(&workspace_id)
        .fetch_one(&pool)
        .await?;
      assert_eq!(checked_at.timestamp_millis(), if accepted { 0 } else { timestamp });
    }
    sqlx::query("DELETE FROM doc_blob_ref_projections WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    Ok(())
  }
}
