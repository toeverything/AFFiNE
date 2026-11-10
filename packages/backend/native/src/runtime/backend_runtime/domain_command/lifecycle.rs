use affine_core::access_control::{DocLifecycleCommand, DomainCommand};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use chrono::{DateTime, Utc};
use napi::bindgen_prelude::Buffer;
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use y_octo::{Any, Doc, Update, Value as YValue, merge_updates_v1};

use super::{
  DocLifecycle, authorize_domain_after_storage_lock, decode_doc_updates, invalidate_doc_blob_projection,
  load_current_doc_parts_in, load_root, load_root_parts, lock_permission_generation, lock_workspace_doc_update,
  lock_workspace_storage_shared, next_workspace_doc_update_timestamp, project_root, require_complete_root,
  root_was_initialized,
};
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::permission::PermissionAuthorizer};

pub(super) async fn apply(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  doc_id: String,
  lifecycle: DocLifecycle,
  embedding_schema_ready: bool,
) -> RuntimeResult<Value> {
  if workspace_id == doc_id {
    return Err(RuntimeError::invalid_input("doc_is_workspace"));
  }
  lock_workspace_storage_shared(transaction, &workspace_id).await?;
  let mut locked_doc_ids = [&*workspace_id, &*doc_id];
  locked_doc_ids.sort_unstable();
  for locked_doc_id in locked_doc_ids {
    lock_workspace_doc_update(transaction, &workspace_id, locked_doc_id).await?;
  }
  let command = DomainCommand::ApplyDocLifecycle {
    doc_id: doc_id.clone(),
    lifecycle: match lifecycle {
      DocLifecycle::Trash => DocLifecycleCommand::Trash,
      DocLifecycle::Restore => DocLifecycleCommand::Restore,
      DocLifecycle::Delete => DocLifecycleCommand::Delete,
    },
  };
  authorize_domain_after_storage_lock(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&doc_id),
    &command,
  )
  .await?;

  let mut root = load_root(transaction, &workspace_id).await?;
  if !root.exists {
    return Err(RuntimeError::invalid_state("doc_root_source_invalid"));
  }
  let root_update = mutate_loaded_root(&mut root.doc, &doc_id, lifecycle)?;
  let timestamp = next_workspace_doc_update_timestamp(transaction, &workspace_id, &workspace_id).await?;
  sqlx::query("INSERT INTO updates (workspace_id,guid,blob,created_at,created_by) VALUES($1,$1,$2,$3,$4)")
    .bind(&workspace_id)
    .bind(&root_update)
    .bind(timestamp)
    .bind(&actor_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("persist workspace root lifecycle update", error))?;
  invalidate_doc_blob_projection(transaction, &workspace_id, &workspace_id, embedding_schema_ready).await?;

  if matches!(lifecycle, DocLifecycle::Delete) {
    delete_doc_rows(transaction, &workspace_id, &doc_id).await?;
  }
  Ok(json!({
    "workspaceId": workspace_id,
    "docId": doc_id,
    "lifecycle": match lifecycle {
      DocLifecycle::Trash => "trash",
      DocLifecycle::Restore => "restore",
      DocLifecycle::Delete => "delete",
    },
    "rootUpdate": BASE64.encode(root_update),
    "timestamp": timestamp,
  }))
}

pub(super) async fn append_root_update(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  encoded_update: String,
  expected_permission_generation: Option<i64>,
  embedding_schema_ready: bool,
) -> RuntimeResult<Value> {
  let update = BASE64
    .decode(encoded_update)
    .map_err(|_| RuntimeError::invalid_input("doc_update_invalid"))?;
  let updates = vec![Buffer::from(update)];
  let decoded = decode_doc_updates(&updates, true).await?;
  lock_workspace_storage_shared(transaction, &workspace_id).await?;
  lock_workspace_doc_update(transaction, &workspace_id, &workspace_id).await?;
  authorize_domain_after_storage_lock(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&workspace_id),
    &DomainCommand::AppendRootUpdate {
      doc_id: workspace_id.clone(),
    },
  )
  .await?;
  lock_permission_generation(transaction, &workspace_id, expected_permission_generation).await?;
  let timestamp = append_root_updates_in(
    transaction,
    &workspace_id,
    &actor_user_id,
    updates,
    decoded,
    embedding_schema_ready,
  )
  .await?;
  Ok(json!({ "timestamp": DateTime::from_timestamp_millis(timestamp) }))
}

pub(in crate::runtime::backend_runtime) async fn append_root_updates_in(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  actor_user_id: &str,
  updates: Vec<Buffer>,
  decoded: Vec<Update>,
  embedding_schema_ready: bool,
) -> RuntimeResult<i64> {
  let (snapshot, current_updates) = load_current_doc_parts_in(transaction, workspace_id, workspace_id).await?;
  let mut root = load_root_parts(snapshot.as_ref(), &current_updates)?;
  if !root.exists && root_was_initialized(transaction, workspace_id).await? {
    return Err(RuntimeError::invalid_state("doc_root_source_invalid"));
  }
  validate_loaded_root_update(&mut root.doc, decoded)?;
  let timestamp = next_workspace_doc_update_timestamp(transaction, workspace_id, workspace_id).await?;
  let mut last_timestamp = timestamp;
  if !root.snapshot_exists {
    let merged = merge_updates_v1(
      current_updates
        .iter()
        .map(|update| update.blob.as_slice())
        .chain(updates.iter().map(|update| update.as_ref())),
    )
    .and_then(|update| update.encode_v1())
    .map_err(|_| RuntimeError::invalid_state("doc_root_source_invalid"))?;
    sqlx::query(
      "INSERT INTO snapshots(workspace_id,guid,blob,size,updated_at,created_by,updated_by) \
       VALUES($1,$1,$2,$3,$4,$5,$5)",
    )
    .bind(workspace_id)
    .bind(&merged)
    .bind(merged.len() as i64)
    .bind(timestamp)
    .bind(actor_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("initialize canonical root snapshot", error))?;
    sqlx::query("DELETE FROM updates WHERE workspace_id=$1 AND guid=$1")
      .bind(workspace_id)
      .execute(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("remove initialized root updates", error))?;
  } else {
    for (index, update) in updates.into_iter().enumerate() {
      last_timestamp = timestamp + chrono::Duration::milliseconds(index as i64);
      sqlx::query("INSERT INTO updates(workspace_id,guid,blob,created_at,created_by) VALUES($1,$1,$2,$3,$4)")
        .bind(workspace_id)
        .bind(update.to_vec())
        .bind(last_timestamp)
        .bind(actor_user_id)
        .execute(&mut **transaction)
        .await
        .map_err(|error| RuntimeError::database("append canonical root update", error))?;
    }
  }
  invalidate_doc_blob_projection(transaction, workspace_id, workspace_id, embedding_schema_ready).await?;
  Ok(last_timestamp.timestamp_millis())
}

pub(in crate::runtime::backend_runtime) async fn workspace_root_contains_active_doc(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<bool> {
  let root = load_root(transaction, workspace_id).await?;
  if !root.exists {
    return Err(RuntimeError::invalid_state("doc_root_source_invalid"));
  }
  Ok(
    require_complete_root(&root.doc)?
      .active_doc_ids
      .iter()
      .any(|id| id == doc_id),
  )
}

fn validate_loaded_root_update(root: &mut Doc, updates: Vec<Update>) -> RuntimeResult<()> {
  let before = require_complete_root(root)?;
  root
    .apply_update(Update::merge(updates))
    .map_err(|_| RuntimeError::invalid_input("doc_update_invalid"))?;
  let after = project_root(root).map_err(|_| RuntimeError::invalid_input("doc_update_invalid"))?;
  if !after.complete {
    return Err(RuntimeError::invalid_input("doc_source_incomplete"));
  }
  let old_all = before.doc_ids.iter().collect::<std::collections::BTreeSet<_>>();
  let old_active = before.active_doc_ids.iter().collect::<std::collections::BTreeSet<_>>();
  let new_all = after.doc_ids.iter().collect::<std::collections::BTreeSet<_>>();
  let new_active = after.active_doc_ids.iter().collect::<std::collections::BTreeSet<_>>();
  if !old_all.is_subset(&new_all)
    || !old_active.is_subset(&new_active)
    || new_active
      .iter()
      .any(|id| old_all.contains(id) && !old_active.contains(id))
  {
    return Err(RuntimeError::invalid_input("doc_lifecycle_requires_command"));
  }
  Ok(())
}

#[cfg(test)]
fn validate_root_update(snapshot: Vec<u8>, updates: Vec<Vec<u8>>, incoming: &[u8]) -> RuntimeResult<Vec<u8>> {
  let mut root = Doc::default();
  root
    .apply_update(
      y_octo::merge_updates_v1(std::iter::once(snapshot).chain(updates))
        .map_err(|_| RuntimeError::invalid_state("doc_root_source_invalid"))?,
    )
    .map_err(|_| RuntimeError::invalid_state("doc_root_source_invalid"))?;
  let incoming = Update::decode_v1(incoming).map_err(|_| RuntimeError::invalid_input("doc_update_invalid"))?;
  validate_loaded_root_update(&mut root, vec![incoming])?;
  root
    .encode_update_v1()
    .map_err(|_| RuntimeError::invalid_state("doc_root_source_invalid"))
}

#[cfg(test)]
fn mutate_root(
  snapshot: Vec<u8>,
  updates: Vec<Vec<u8>>,
  doc_id: &str,
  lifecycle: DocLifecycle,
) -> RuntimeResult<Vec<u8>> {
  let mut root = Doc::default();
  root
    .apply_update_from_binary_v1(&snapshot)
    .map_err(|error| RuntimeError::invalid_state(format!("workspace root snapshot invalid: {error}")))?;
  for update in updates {
    root
      .apply_update_from_binary_v1(&update)
      .map_err(|error| RuntimeError::invalid_state(format!("workspace root update invalid: {error}")))?;
  }
  mutate_loaded_root(&mut root, doc_id, lifecycle)
}

fn mutate_loaded_root(root: &mut Doc, doc_id: &str, lifecycle: DocLifecycle) -> RuntimeResult<Vec<u8>> {
  require_complete_root(root)?;
  let state = root.get_state_vector();
  let mut pages = affine_doc_loader::workspace_root_pages(root)
    .map_err(|_| RuntimeError::invalid_state("doc_root_source_invalid"))?;
  let index = pages
    .iter()
    .position(|value| {
      value
        .to_map()
        .and_then(|page| page.get("id"))
        .and_then(|id| id.to_any())
        == Some(Any::String(doc_id.to_string()))
    })
    .ok_or_else(|| RuntimeError::invalid_input("doc_not_found"))?;
  match lifecycle {
    DocLifecycle::Trash | DocLifecycle::Restore => {
      let mut page = pages
        .iter()
        .nth(index)
        .and_then(|value| value.to_map())
        .ok_or_else(|| RuntimeError::invalid_state("workspace root doc meta invalid"))?;
      page
        .insert(
          "trash".to_string(),
          YValue::Any(if matches!(lifecycle, DocLifecycle::Trash) {
            Any::True
          } else {
            Any::False
          }),
        )
        .map_err(|error| RuntimeError::invalid_state(format!("write doc lifecycle failed: {error}")))?;
      if matches!(lifecycle, DocLifecycle::Trash) {
        page
          .insert(
            "trashDate".to_string(),
            YValue::Any(Any::BigInt64(Utc::now().timestamp_millis())),
          )
          .map_err(|error| RuntimeError::invalid_state(format!("write trash timestamp failed: {error}")))?;
      } else {
        page.remove("trashDate");
      }
    }
    DocLifecycle::Delete => pages
      .remove(index as u64, 1)
      .map_err(|error| RuntimeError::invalid_state(format!("delete doc meta failed: {error}")))?,
  }
  root
    .encode_state_as_update_v1(&state)
    .map_err(|error| RuntimeError::invalid_state(format!("encode workspace root lifecycle failed: {error}")))
}

async fn delete_doc_rows(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<()> {
  for statement in [
    "DELETE FROM replies WHERE workspace_id=$1 AND doc_id=$2",
    "DELETE FROM comments WHERE workspace_id=$1 AND doc_id=$2",
    "DELETE FROM updates WHERE workspace_id=$1 AND guid=$2",
    "DELETE FROM snapshot_histories WHERE workspace_id=$1 AND guid=$2",
    "DELETE FROM snapshots WHERE workspace_id=$1 AND guid=$2",
    "DELETE FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2",
    "DELETE FROM doc_access_policies WHERE workspace_id=$1 AND doc_id=$2",
    "DELETE FROM workspace_pages WHERE workspace_id=$1 AND page_id=$2",
  ] {
    sqlx::query(statement)
      .bind(workspace_id)
      .bind(doc_id)
      .execute(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("delete document domain rows", error))?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use std::collections::BTreeSet;

  use super::*;
  use crate::runtime::{Deployment, backend_runtime::permission::PermissionAuthorizer};

  fn merge_root(snapshot: &[u8], updates: &[&[u8]]) -> Vec<u8> {
    let mut root = Doc::default();
    root.apply_update_from_binary_v1(snapshot).unwrap();
    for update in updates {
      root.apply_update_from_binary_v1(update).unwrap();
    }
    root.encode_update_v1().unwrap()
  }

  #[test]
  fn lifecycle_mutation_changes_only_target_membership() {
    let snapshot = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], "a", None).unwrap();
    let add_b = affine_doc_loader::add_doc_to_root_doc(snapshot.clone(), "b", None).unwrap();
    let snapshot = merge_root(&snapshot, &[&add_b]);
    let trashed = mutate_root(snapshot.clone(), Vec::new(), "a", DocLifecycle::Trash).unwrap();
    let trashed_root = merge_root(&snapshot, &[&trashed]);
    let current = affine_doc_loader::get_doc_ids_from_binary(trashed_root.clone(), false).unwrap();
    assert_eq!(current, vec!["b"]);
    let all = affine_doc_loader::get_doc_ids_from_binary(trashed_root, true).unwrap();
    assert_eq!(BTreeSet::from_iter(all), BTreeSet::from(["a".into(), "b".into()]));
    let restored = mutate_root(snapshot.clone(), vec![trashed.clone()], "a", DocLifecycle::Restore).unwrap();
    let restored_root = merge_root(&snapshot, &[&trashed, &restored]);
    let current = affine_doc_loader::get_doc_ids_from_binary(restored_root, false).unwrap();
    assert_eq!(BTreeSet::from_iter(current), BTreeSet::from(["a".into(), "b".into()]));
    let deleted = mutate_root(snapshot.clone(), Vec::new(), "a", DocLifecycle::Delete).unwrap();
    let deleted_root = merge_root(&snapshot, &[&deleted]);
    assert_eq!(
      affine_doc_loader::get_doc_ids_from_binary(deleted_root, true).unwrap(),
      vec!["b"]
    );
  }

  #[test]
  fn ordinary_root_updates_cannot_encode_lifecycle_effects() {
    let snapshot = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], "a", None).unwrap();
    let trash = mutate_root(snapshot.clone(), Vec::new(), "a", DocLifecycle::Trash).unwrap();
    assert!(validate_root_update(snapshot.clone(), Vec::new(), &trash).is_err());

    let restore = mutate_root(snapshot.clone(), vec![trash.clone()], "a", DocLifecycle::Restore).unwrap();
    assert!(validate_root_update(snapshot.clone(), vec![trash], &restore).is_err());

    let delete = mutate_root(snapshot.clone(), Vec::new(), "a", DocLifecycle::Delete).unwrap();
    assert!(validate_root_update(snapshot.clone(), Vec::new(), &delete).is_err());

    let add = affine_doc_loader::add_doc_to_root_doc(snapshot.clone(), "b", None).unwrap();
    assert!(validate_root_update(snapshot, Vec::new(), &add).is_ok());
  }

  #[test]
  fn partial_workspace_root_is_rejected_before_semantic_comparison() {
    let snapshot = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], "a", None).unwrap();
    let dependent_delta = mutate_root(snapshot.clone(), Vec::new(), "a", DocLifecycle::Trash).unwrap();
    assert!(validate_root_update(vec![0, 0], Vec::new(), &dependent_delta).is_err());
    assert!(
      validate_root_update(dependent_delta, Vec::new(), &snapshot).is_err(),
      "a root update with missing client-clock predecessors must fail closed"
    );
    let source = Doc::default();
    let mut meta = source.get_or_create_map("meta").unwrap();
    meta.insert("name".into(), Any::String("first".into())).unwrap();
    let prefix = source.encode_update_v1().unwrap();
    let state = source.get_state_vector();
    meta.insert("title".into(), Any::String("second".into())).unwrap();
    let middle = source.encode_state_as_update_v1(&state).unwrap();
    let state = source.get_state_vector();
    meta.insert("avatar".into(), Any::String("third".into())).unwrap();
    let tail = source.encode_state_as_update_v1(&state).unwrap();
    let fragments = [prefix, middle, tail];
    for order in [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] {
      let mut target = Doc::default();
      let updates = order
        .into_iter()
        .map(|index| Update::decode_v1(&fragments[index]).unwrap())
        .collect();
      validate_loaded_root_update(&mut target, updates).unwrap();
      assert!(!target.has_pending_updates());
    }
    let mut target = Doc::default();
    let updates = fragments[1..]
      .iter()
      .map(|fragment| Update::decode_v1(fragment).unwrap())
      .collect();
    assert!(validate_loaded_root_update(&mut target, updates).is_err());
  }

  #[tokio::test]
  async fn readonly_denies_restore_but_allows_trash_and_delete() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, actor_user_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let doc_id = format!("domain-lifecycle-{suffix}");
    let root = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], &doc_id, None).unwrap();
    let source = Doc::with_client(98232);
    let mut hidden = source.get_or_create_map("hidden").unwrap();
    hidden.insert("deleted".into(), "retained root payload").unwrap();
    let prefix = source.encode_update_v1().unwrap();
    let state = source.get_state_vector();
    hidden.remove("deleted");
    let deletion = source.encode_state_as_update_v1(&state).unwrap();
    let incoming = y_octo::merge_updates_v1([root, deletion]).unwrap().encode_v1().unwrap();
    let expected = y_octo::merge_updates_v1([prefix.clone(), incoming.clone()])
      .unwrap()
      .encode_v1()
      .unwrap();
    sqlx::query("INSERT INTO updates(workspace_id,guid,blob,created_at) VALUES($1,$1,$2,clock_timestamp())")
      .bind(&workspace_id)
      .bind(prefix)
      .execute(&pool)
      .await
      .unwrap();
    let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
    let mut transaction = pool.begin().await.unwrap();
    append_root_update(
      &authorizer,
      &mut transaction,
      actor_user_id.clone(),
      workspace_id.clone(),
      BASE64.encode(incoming),
      None,
      true,
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();
    let persisted: Vec<u8> = sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id=$1 AND guid=$1")
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(persisted, expected);
    let mut applied = Doc::default();
    applied.apply_update_from_binary_v1(&persisted).unwrap();
    assert_ne!(persisted, applied.encode_update_v1().unwrap());

    for index in 0..3 {
      let user_id = format!("domain-lifecycle-overflow-{index}-{suffix}");
      sqlx::query(
        "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Overflow',$2,true,now(),false)",
      )
      .bind(&user_id)
      .bind(format!("{user_id}@example.com"))
      .execute(&pool)
      .await
      .unwrap();
      sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'member','active')")
        .bind(&workspace_id)
        .bind(&user_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    let mut root_writer = pool.begin().await.unwrap();
    lock_workspace_doc_update(&mut root_writer, &workspace_id, &workspace_id)
      .await
      .unwrap();
    let racing_pool = pool.clone();
    let racing_workspace_id = workspace_id.clone();
    let racing_actor_user_id = actor_user_id.clone();
    let racing_doc_id = doc_id.clone();
    let trash = tokio::spawn(async move {
      let authorizer = PermissionAuthorizer::new(racing_pool.clone(), Deployment::Cloud);
      let mut transaction = racing_pool.begin().await.unwrap();
      apply(
        &authorizer,
        &mut transaction,
        racing_actor_user_id,
        racing_workspace_id,
        racing_doc_id,
        DocLifecycle::Trash,
        true,
      )
      .await
      .unwrap();
      transaction.commit().await.unwrap();
    });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert!(
      !trash.is_finished(),
      "a lifecycle update must wait for an in-flight workspace root writer"
    );
    root_writer.commit().await.unwrap();
    trash.await.unwrap();

    let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
    let mut transaction = pool.begin().await.unwrap();
    let restore = apply(
      &authorizer,
      &mut transaction,
      actor_user_id.clone(),
      workspace_id.clone(),
      doc_id.clone(),
      DocLifecycle::Restore,
      true,
    )
    .await;
    assert!(restore.is_err());
    transaction.rollback().await.unwrap();

    let mut transaction = pool.begin().await.unwrap();
    apply(
      &authorizer,
      &mut transaction,
      actor_user_id,
      workspace_id.clone(),
      doc_id,
      DocLifecycle::Delete,
      true,
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();
    let timestamps = sqlx::query_scalar::<_, chrono::DateTime<Utc>>(
      "SELECT created_at FROM updates WHERE workspace_id=$1 AND guid=$1 ORDER BY created_at",
    )
    .bind(&workspace_id)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(timestamps.len(), 2);
    assert!(timestamps[0] < timestamps[1]);
  }
}
