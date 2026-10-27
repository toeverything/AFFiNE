use affine_core::access_control::DomainCommand;
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{FromRow, Postgres, Row, Transaction};

use super::{authorize_domain, invalidate_doc_blob_projection, lock_workspace_doc_update};
use crate::runtime::{
  RuntimeError, RuntimeResult,
  backend_runtime::permission::PermissionAuthorizer,
  storage_runtime::{CurrentDoc, CurrentDocUpdate, merge_current_doc},
};

#[derive(FromRow)]
struct LockedSnapshot {
  blob: Vec<u8>,
  updated_at: DateTime<Utc>,
}

pub(super) async fn recover(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  doc_id: String,
  timestamp: DateTime<Utc>,
  embedding_schema_ready: bool,
) -> RuntimeResult<Value> {
  let command = DomainCommand::RecoverDoc { doc_id: doc_id.clone() };
  authorize_domain(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&doc_id),
    &command,
  )
  .await?;

  lock_workspace_doc_update(transaction, &workspace_id, &doc_id).await?;
  invalidate_doc_blob_projection(transaction, &workspace_id, &doc_id, embedding_schema_ready).await?;

  let snapshot = sqlx::query_as::<_, LockedSnapshot>(
    "SELECT blob, updated_at FROM snapshots WHERE workspace_id=$1 AND guid=$2 FOR UPDATE",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load recovery current snapshot", error))?
  .ok_or_else(|| RuntimeError::invalid_input("doc_not_found"))?;
  let updates = sqlx::query_as::<_, CurrentDocUpdate>(
    "SELECT blob, created_at FROM updates WHERE workspace_id=$1 AND guid=$2 ORDER BY created_at FOR UPDATE",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .fetch_all(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load recovery pending updates", error))?;
  let current = merge_current_doc(
    Some(CurrentDoc {
      blob: snapshot.blob,
      updated_at: snapshot.updated_at,
    }),
    updates,
  )?
  .ok_or_else(|| RuntimeError::invalid_input("doc_not_found"))?;
  let history = sqlx::query(
    "SELECT blob, state, EXTRACT(EPOCH FROM expired_at - timestamp)::bigint AS retention FROM snapshot_histories \
     WHERE workspace_id=$1 AND guid=$2 AND timestamp=$3 FOR UPDATE",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(timestamp)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load recovery history", error))?
  .ok_or_else(|| RuntimeError::invalid_input("doc_history_not_found"))?;
  sqlx::query(
    r#"INSERT INTO snapshot_histories
         (workspace_id, guid, timestamp, blob, state, expired_at, created_by)
       VALUES ($1, $2, $3, $4, NULL, clock_timestamp() + make_interval(secs => $5), $6)
       ON CONFLICT (workspace_id, guid, timestamp) DO NOTHING"#,
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(current.updated_at)
  .bind(current.blob)
  .bind(
    history
      .try_get::<i64, _>("retention")
      .map_err(|error| RuntimeError::database("decode recovery retention", error))?,
  )
  .bind(&actor_user_id)
  .execute(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("record fixed recovery", error))?;
  sqlx::query("DELETE FROM updates WHERE workspace_id=$1 AND guid=$2")
    .bind(&workspace_id)
    .bind(&doc_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("clear recovered pending updates", error))?;
  let recovered = sqlx::query(
    r#"UPDATE snapshots SET blob=$3, state=$4, updated_at=clock_timestamp(), updated_by=$5
       WHERE workspace_id=$1 AND guid=$2
       RETURNING updated_at"#,
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(
    history
      .try_get::<Vec<u8>, _>("blob")
      .map_err(|error| RuntimeError::database("decode recovery history blob", error))?,
  )
  .bind(
    history
      .try_get::<Option<Vec<u8>>, _>("state")
      .map_err(|error| RuntimeError::database("decode recovery history state", error))?,
  )
  .bind(&actor_user_id)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("restore recovery snapshot", error))?;
  Ok(json!({
    "timestamp": timestamp,
    "updatedAt": recovered.try_get::<DateTime<Utc>, _>("updated_at")
      .map_err(|error| RuntimeError::database("decode recovered timestamp", error))?,
  }))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::Deployment;

  #[tokio::test]
  async fn recovery_archives_current_content_and_restores_target_content() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, actor_user_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let doc_id = format!("domain-history-{}", uuid::Uuid::new_v4().simple());
    let target_timestamp = Utc::now() - chrono::Duration::minutes(10);
    let current_timestamp = Utc::now() - chrono::Duration::minutes(1);
    let current_blob = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], "current", None).unwrap();
    let pending_blob = affine_doc_loader::add_doc_to_root_doc(current_blob.clone(), "pending", None).unwrap();
    let target_blob = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], "target", None).unwrap();
    let expected_current = merge_current_doc(
      Some(CurrentDoc {
        blob: current_blob.clone(),
        updated_at: current_timestamp,
      }),
      vec![CurrentDocUpdate {
        blob: pending_blob.clone(),
        created_at: current_timestamp + chrono::Duration::seconds(1),
      }],
    )
    .unwrap()
    .unwrap();
    let current_timestamp = sqlx::query_scalar::<_, DateTime<Utc>>(
      "INSERT INTO snapshots(workspace_id,guid,blob,state,updated_at,created_by,updated_by) \
       VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING updated_at",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&current_blob)
    .bind(b"current-state".as_slice())
    .bind(current_timestamp)
    .bind(&actor_user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let pending_timestamp = sqlx::query_scalar::<_, DateTime<Utc>>(
      "INSERT INTO updates(workspace_id,guid,blob,created_at,created_by) VALUES($1,$2,$3,$4,$5) RETURNING created_at",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&pending_blob)
    .bind(current_timestamp + chrono::Duration::seconds(1))
    .bind(&actor_user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let target_timestamp = sqlx::query_scalar::<_, DateTime<Utc>>(
      "INSERT INTO snapshot_histories(workspace_id,guid,timestamp,blob,state,expired_at,created_by) \
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING timestamp",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(target_timestamp)
    .bind(&target_blob)
    .bind(b"target-state".as_slice())
    .bind(target_timestamp + chrono::Duration::days(30))
    .bind(&actor_user_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
    let mut transaction = pool.begin().await.unwrap();
    recover(
      &authorizer,
      &mut transaction,
      actor_user_id,
      workspace_id.clone(),
      doc_id.clone(),
      target_timestamp,
      true,
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();

    let restored = sqlx::query("SELECT blob,state,updated_at FROM snapshots WHERE workspace_id=$1 AND guid=$2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(restored.get::<Vec<u8>, _>("blob"), target_blob);
    assert_eq!(restored.get::<Vec<u8>, _>("state"), b"target-state");
    assert!(restored.get::<DateTime<Utc>, _>("updated_at") > current_timestamp);
    let pending_count = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM updates WHERE workspace_id=$1 AND guid=$2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(pending_count, 0);
    let archived = sqlx::query_scalar::<_, Vec<u8>>(
      "SELECT blob FROM snapshot_histories WHERE workspace_id=$1 AND guid=$2 AND timestamp=$3",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(pending_timestamp)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(archived, expected_current.blob);
  }
}
