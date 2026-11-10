use affine_core::access_control::DomainCommand;
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};

use super::{
  authorize_domain_after_storage_lock, load_current_doc_in, lock_workspace_doc_update, lock_workspace_storage_shared,
};
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::permission::PermissionAuthorizer};

pub(super) async fn recover(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  doc_id: String,
  timestamp: DateTime<Utc>,
) -> RuntimeResult<Value> {
  if workspace_id == doc_id {
    return Err(RuntimeError::invalid_input("doc_is_workspace"));
  }
  lock_workspace_storage_shared(transaction, &workspace_id).await?;
  lock_workspace_doc_update(transaction, &workspace_id, &doc_id).await?;
  let command = DomainCommand::RecoverDoc { doc_id: doc_id.clone() };
  authorize_domain_after_storage_lock(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&doc_id),
    &command,
  )
  .await?;

  let current = load_current_doc_in(transaction, &workspace_id, &doc_id)
    .await?
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
  let retention = history
    .try_get::<i64, _>("retention")
    .map_err(|error| RuntimeError::database("decode recovery retention", error))?;
  let existing = sqlx::query_scalar::<_, Vec<u8>>(
    "SELECT blob FROM snapshot_histories WHERE workspace_id=$1 AND guid=$2 AND timestamp=$3",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(current.updated_at)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load current recovery archive", error))?;
  let archive_timestamp = if existing.as_ref().is_some_and(|blob| blob != &current.blob) {
    let latest = sqlx::query(
      "SELECT timestamp,blob,GREATEST(timestamp + interval '1 millisecond', \
       date_trunc('milliseconds',clock_timestamp())) AS next_timestamp FROM snapshot_histories WHERE workspace_id=$1 \
       AND guid=$2 ORDER BY timestamp DESC LIMIT 1",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("load latest recovery archive", error))?;
    let same_blob = latest
      .try_get::<Vec<u8>, _>("blob")
      .map_err(|error| RuntimeError::database("decode recovery archive", error))?
      == current.blob;
    latest
      .try_get::<DateTime<Utc>, _>(if same_blob { "timestamp" } else { "next_timestamp" })
      .map_err(|error| RuntimeError::database("decode recovery archive timestamp", error))?
  } else {
    current.updated_at
  };
  sqlx::query_scalar::<_, DateTime<Utc>>(
    r#"INSERT INTO snapshot_histories
         (workspace_id, guid, timestamp, blob, state, expired_at, created_by)
       VALUES ($1, $2, $3, $4, NULL, clock_timestamp() + make_interval(secs => $5), $6)
       ON CONFLICT (workspace_id, guid, timestamp) DO UPDATE
         SET expired_at=GREATEST(snapshot_histories.expired_at,EXCLUDED.expired_at)
         WHERE snapshot_histories.blob=EXCLUDED.blob
       RETURNING timestamp"#,
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(archive_timestamp)
  .bind(current.blob)
  .bind(retention)
  .bind(&actor_user_id)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("record fixed recovery", error))?;
  Ok(json!({ "timestamp": timestamp }))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::{
    Deployment,
    storage_runtime::{CurrentDoc, CurrentDocUpdate, merge_current_doc_updates},
  };

  #[tokio::test]
  async fn recovery_archives_current_content_without_replacing_source() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, actor_user_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    for collision in ["none", "same", "different", "gc"] {
      let doc_id = format!("domain-history-{}", uuid::Uuid::new_v4().simple());
      let target_timestamp = Utc::now() - chrono::Duration::minutes(10);
      let current_timestamp = Utc::now() - chrono::Duration::minutes(1);
      let current_blob = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], "current", None).unwrap();
      let pending_blob = affine_doc_loader::add_doc_to_root_doc(current_blob.clone(), "pending", None).unwrap();
      let mut pending = y_octo::Doc::with_options(y_octo::DocOptions::default().auto_gc(false));
      pending
        .apply_update(y_octo::merge_updates_v1([current_blob.as_slice(), pending_blob.as_slice()]).unwrap())
        .unwrap();
      let mut meta = pending.get_map("meta").unwrap();
      meta
        .insert("discarded".to_string(), y_octo::Any::String("old payload".into()))
        .unwrap();
      meta.remove("discarded");
      let pending_blob = pending.encode_update_v1().unwrap();
      let target_blob = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], "target", None).unwrap();
      let expected_current = merge_current_doc_updates(
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

      let collision_blob = match collision {
        "same" => Some(expected_current.blob.clone()),
        "different" => Some(target_blob.clone()),
        "gc" => {
          let compacted = y_octo::Doc::try_from_binary_v1(&expected_current.blob).unwrap();
          compacted.gc().unwrap();
          let blob = compacted.encode_update_v1().unwrap();
          assert_ne!(blob, expected_current.blob);
          assert_eq!(
            affine_doc_loader::project_workspace_root(blob.clone(), true)
              .unwrap()
              .doc_ids,
            affine_doc_loader::project_workspace_root(expected_current.blob.clone(), true)
              .unwrap()
              .doc_ids,
          );
          Some(blob)
        }
        _ => None,
      };
      if let Some(blob) = &collision_blob {
        sqlx::query(
          "INSERT INTO snapshot_histories(workspace_id,guid,timestamp,blob,expired_at,created_by) \
           VALUES($1,$2,$3,$4,clock_timestamp() + interval '1 day',$5)",
        )
        .bind(&workspace_id)
        .bind(&doc_id)
        .bind(pending_timestamp)
        .bind(blob)
        .bind(&actor_user_id)
        .execute(&pool)
        .await
        .unwrap();
      }
      let before_recovery =
        sqlx::query_scalar::<_, DateTime<Utc>>("SELECT date_trunc('milliseconds',clock_timestamp())")
          .fetch_one(&pool)
          .await
          .unwrap();
      let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
      for _ in 0..2 {
        let mut transaction = pool.begin().await.unwrap();
        recover(
          &authorizer,
          &mut transaction,
          actor_user_id.clone(),
          workspace_id.clone(),
          doc_id.clone(),
          target_timestamp,
        )
        .await
        .unwrap();
        transaction.commit().await.unwrap();
      }

      let restored = sqlx::query("SELECT blob,state,updated_at FROM snapshots WHERE workspace_id=$1 AND guid=$2")
        .bind(&workspace_id)
        .bind(&doc_id)
        .fetch_one(&pool)
        .await
        .unwrap();
      assert_eq!(restored.get::<Vec<u8>, _>("blob"), current_blob);
      assert_eq!(restored.get::<Vec<u8>, _>("state"), b"current-state");
      assert_eq!(restored.get::<DateTime<Utc>, _>("updated_at"), current_timestamp);
      let pending_count =
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM updates WHERE workspace_id=$1 AND guid=$2")
          .bind(&workspace_id)
          .bind(&doc_id)
          .fetch_one(&pool)
          .await
          .unwrap();
      assert_eq!(pending_count, 1);
      let pending_stored = sqlx::query_scalar::<_, Vec<u8>>(
        "SELECT blob FROM updates WHERE workspace_id=$1 AND guid=$2 AND created_at=$3",
      )
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind(pending_timestamp)
      .fetch_one(&pool)
      .await
      .unwrap();
      assert_eq!(pending_stored, pending_blob);
      let archives = sqlx::query(
        "SELECT timestamp,blob,expired_at FROM snapshot_histories WHERE workspace_id=$1 AND guid=$2 ORDER BY timestamp",
      )
      .bind(&workspace_id)
      .bind(&doc_id)
      .fetch_all(&pool)
      .await
      .unwrap();
      let collided = matches!(collision, "different" | "gc");
      assert_eq!(archives.len(), if collided { 3 } else { 2 }, "{collision}");
      assert_eq!(archives[0].get::<Vec<u8>, _>("blob"), target_blob);
      if let Some(blob) = collision_blob {
        assert_eq!(archives[1].get::<Vec<u8>, _>("blob"), blob);
      }
      let archived = archives.last().unwrap();
      assert_eq!(archived.get::<Vec<u8>, _>("blob"), expected_current.blob);
      let archived_timestamp = archived.get::<DateTime<Utc>, _>("timestamp");
      if collided {
        assert!(archived_timestamp > pending_timestamp);
        assert!(archived_timestamp >= before_recovery);
      } else {
        assert_eq!(archived_timestamp, pending_timestamp);
      }
      assert!(archived.get::<DateTime<Utc>, _>("expired_at") > before_recovery + chrono::Duration::days(29));
      let mut rejected = pool.begin().await.unwrap();
      let error = recover(
        &authorizer,
        &mut rejected,
        "actor".to_string(),
        workspace_id.clone(),
        workspace_id.clone(),
        target_timestamp,
      )
      .await
      .unwrap_err();
      assert!(error.to_string().contains("doc_is_workspace"));
      rejected.rollback().await.unwrap();
    }
  }
}
