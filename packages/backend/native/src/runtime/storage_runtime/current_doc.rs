use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use y_octo::Doc;

use super::{RuntimeError, RuntimeResult};

#[derive(FromRow)]
pub(in crate::runtime) struct CurrentDoc {
  pub(in crate::runtime) blob: Vec<u8>,
  pub(in crate::runtime) updated_at: DateTime<Utc>,
}

#[derive(FromRow)]
pub(super) struct CurrentDocUpdate {
  pub(super) blob: Vec<u8>,
  pub(super) created_at: DateTime<Utc>,
}

pub(in crate::runtime) async fn load_current_doc(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<CurrentDoc>> {
  let snapshot = sqlx::query_as::<_, CurrentDoc>(
    r#"
    SELECT blob, updated_at
    FROM snapshots
    WHERE workspace_id = $1 AND guid = $2
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("Current doc snapshot load failed", err))?;
  let updates = sqlx::query_as::<_, CurrentDocUpdate>(
    r#"
    SELECT blob, created_at
    FROM updates
    WHERE workspace_id = $1 AND guid = $2
    ORDER BY created_at ASC
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(pool)
  .await
  .map_err(|err| RuntimeError::database("Current doc updates load failed", err))?;
  merge_current_doc(snapshot, updates)
}

pub(super) async fn load_canonical_doc(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<CurrentDoc>> {
  sqlx::query_as::<_, CurrentDoc>(
    r#"
    SELECT blob, updated_at
    FROM snapshots
    WHERE workspace_id = $1 AND guid = $2
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("Canonical doc snapshot load failed", err))
}

pub(super) async fn has_pending_updates(pool: &PgPool, workspace_id: &str, doc_id: &str) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM updates WHERE workspace_id = $1 AND guid = $2)")
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_one(pool)
    .await
    .map_err(|err| RuntimeError::database("Pending doc updates check failed", err))
}

pub(super) fn merge_current_doc(
  snapshot: Option<CurrentDoc>,
  updates: Vec<CurrentDocUpdate>,
) -> RuntimeResult<Option<CurrentDoc>> {
  if snapshot.is_none() && updates.is_empty() {
    return Ok(None);
  }
  if updates.is_empty() {
    return Ok(snapshot);
  }
  let mut doc = Doc::default();
  let mut updated_at = snapshot
    .as_ref()
    .map(|snapshot| snapshot.updated_at)
    .or_else(|| updates.first().map(|update| update.created_at))
    .unwrap_or_else(Utc::now);
  if let Some(snapshot) = &snapshot {
    doc
      .apply_update_from_binary_v1(&snapshot.blob)
      .map_err(|err| RuntimeError::invalid_state(format!("Current doc snapshot merge failed: {err}")))?;
  }
  for update in updates {
    updated_at = updated_at.max(update.created_at);
    doc
      .apply_update_from_binary_v1(&update.blob)
      .map_err(|err| RuntimeError::invalid_state(format!("Current doc update merge failed: {err}")))?;
  }
  let blob = doc
    .encode_update_v1()
    .map_err(|err| RuntimeError::invalid_state(format!("Current doc encode failed: {err}")))?;

  Ok(Some(CurrentDoc { blob, updated_at }))
}

pub(super) async fn load_workspace_live_doc_ids(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  load_workspace_canonical_doc_ids(pool, workspace_id).await
}

pub(super) async fn load_workspace_canonical_doc_ids(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  if has_pending_updates(pool, workspace_id, workspace_id).await? {
    return Err(RuntimeError::invalid_state("Workspace root doc has pending updates"));
  }
  workspace_live_doc_ids(load_canonical_doc(pool, workspace_id, workspace_id).await?)
}

fn workspace_live_doc_ids(root: Option<CurrentDoc>) -> RuntimeResult<Vec<String>> {
  let root = root.ok_or_else(|| RuntimeError::invalid_state("Workspace root doc is missing"))?;
  let projection = affine_doc_loader::project_workspace_root(root.blob, true)
    .map_err(|err| RuntimeError::invalid_state(format!("Workspace root doc parse failed: {err}")))?;
  if !projection.complete {
    return Err(RuntimeError::invalid_state("Workspace root doc is incomplete"));
  }
  let mut ids = projection.doc_ids;
  ids.sort();
  ids.dedup();
  Ok(ids)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn workspace_live_set_merges_pending_updates_and_includes_trash() {
    use y_octo::{Any, Value};

    let snapshot = affine_doc_loader::add_doc_to_root_doc(Vec::new(), "live", None).unwrap();
    let pending = affine_doc_loader::add_doc_to_root_doc(snapshot.clone(), "trash", None).unwrap();
    let merged = merge_current_doc(
      Some(CurrentDoc {
        blob: snapshot,
        updated_at: Utc::now(),
      }),
      vec![CurrentDocUpdate {
        blob: pending,
        created_at: Utc::now(),
      }],
    )
    .unwrap()
    .unwrap();
    let mut root = Doc::default();
    root.apply_update_from_binary_v1(&merged.blob).unwrap();
    let meta = root.get_map("meta").unwrap();
    let mut pages = meta.get("pages").and_then(|value| value.to_array()).unwrap();
    let mut trash = pages
      .iter()
      .find_map(|value| {
        let page = value.to_map()?;
        (page.get("id")?.to_any()? == Any::String("trash".to_string())).then_some(page)
      })
      .unwrap();
    trash.insert("trash".to_string(), Value::Any(Any::True)).unwrap();

    let ids = workspace_live_doc_ids(Some(CurrentDoc {
      blob: root.encode_update_v1().unwrap(),
      updated_at: Utc::now(),
    }))
    .unwrap();
    assert_eq!(ids, ["live", "trash"]);

    let trash_index = pages
      .iter()
      .position(|value| {
        value.to_map().and_then(|page| page.get("id")) == Some(Value::Any(Any::String("trash".to_string())))
      })
      .unwrap();
    pages.remove(trash_index as u64, 1).unwrap();
    let ids = workspace_live_doc_ids(Some(CurrentDoc {
      blob: root.encode_update_v1().unwrap(),
      updated_at: Utc::now(),
    }))
    .unwrap();
    assert_eq!(ids, ["live"]);
  }

  #[test]
  fn workspace_live_set_fails_closed_for_missing_or_corrupt_root() {
    assert!(workspace_live_doc_ids(None).is_err());
    assert!(
      workspace_live_doc_ids(Some(CurrentDoc {
        blob: vec![0xff],
        updated_at: Utc::now(),
      }))
      .is_err()
    );
    assert!(
      workspace_live_doc_ids(Some(CurrentDoc {
        blob: vec![
          1, 1, 1, 1, 40, 0, 1, 0, 11, 115, 117, 98, 95, 109, 97, 112, 95, 107, 101, 121, 1, 119, 13, 115, 117, 98, 95,
          109, 97, 112, 95, 118, 97, 108, 117, 101, 0,
        ],
        updated_at: Utc::now(),
      }))
      .is_err()
    );
  }
}
