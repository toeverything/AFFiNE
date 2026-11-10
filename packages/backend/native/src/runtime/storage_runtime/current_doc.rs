use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgConnection, PgExecutor, PgPool};
use y_octo::Doc;

use super::{RuntimeError, RuntimeResult, load_root, lock_current_doc_read, require_complete_root};

#[derive(FromRow)]
pub(in crate::runtime) struct CurrentDoc {
  pub(in crate::runtime) blob: Vec<u8>,
  pub(in crate::runtime) updated_at: DateTime<Utc>,
}

#[derive(FromRow)]
pub(in crate::runtime) struct CurrentDocUpdate {
  pub(in crate::runtime) blob: Vec<u8>,
  pub(in crate::runtime) created_at: DateTime<Utc>,
}

pub(in crate::runtime) async fn load_current_doc(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<CurrentDoc>> {
  let (snapshot, updates) = load_current_doc_parts(pool, workspace_id, doc_id).await?;
  merge_current_doc(snapshot, updates)
}

pub(in crate::runtime) async fn load_current_doc_parts(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<(Option<CurrentDoc>, Vec<CurrentDocUpdate>)> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin current document read", error))?;
  lock_current_doc_read(&mut transaction, workspace_id, doc_id).await?;
  let result = load_current_doc_parts_in(&mut transaction, workspace_id, doc_id).await?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit current document read", error))?;
  Ok(result)
}

pub(in crate::runtime) async fn load_current_doc_in(
  connection: &mut PgConnection,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<CurrentDoc>> {
  let (snapshot, updates) = load_current_doc_parts_in(connection, workspace_id, doc_id).await?;
  merge_current_doc_updates(snapshot, updates)
}

pub(in crate::runtime) async fn load_current_doc_parts_in(
  connection: &mut PgConnection,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<(Option<CurrentDoc>, Vec<CurrentDocUpdate>)> {
  let rows = sqlx::query_as::<_, (Vec<u8>, DateTime<Utc>, bool)>(
    "SELECT blob,updated_at AS timestamp,true AS snapshot FROM snapshots WHERE workspace_id=$1 AND guid=$2 UNION ALL \
     SELECT blob,created_at AS timestamp,false AS snapshot FROM updates WHERE workspace_id=$1 AND guid=$2 ORDER BY \
     snapshot DESC,timestamp ASC",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(connection)
  .await
  .map_err(|error| RuntimeError::database("load current document parts", error))?;
  let mut snapshot = None;
  let mut updates = Vec::new();
  for (blob, timestamp, is_snapshot) in rows {
    if is_snapshot {
      snapshot = Some(CurrentDoc {
        blob,
        updated_at: timestamp,
      });
    } else {
      updates.push(CurrentDocUpdate {
        blob,
        created_at: timestamp,
      });
    }
  }
  Ok((snapshot, updates))
}

pub(super) async fn load_canonical_doc<'a>(
  connection: impl PgExecutor<'a>,
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
  .fetch_optional(connection)
  .await
  .map_err(|err| RuntimeError::database("Canonical doc snapshot load failed", err))
}

pub(in crate::runtime) fn merge_current_doc(
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

pub(in crate::runtime) fn merge_current_doc_updates(
  snapshot: Option<CurrentDoc>,
  updates: Vec<CurrentDocUpdate>,
) -> RuntimeResult<Option<CurrentDoc>> {
  if snapshot.is_none() && updates.is_empty() {
    return Ok(None);
  }
  let updated_at = snapshot
    .iter()
    .map(|snapshot| snapshot.updated_at)
    .chain(updates.iter().map(|update| update.created_at))
    .max()
    .expect("current source is not empty");
  let blob = y_octo::merge_updates_v1(
    snapshot
      .iter()
      .map(|snapshot| snapshot.blob.as_slice())
      .chain(updates.iter().map(|update| update.blob.as_slice())),
  )
  .and_then(|update| update.encode_v1())
  .map_err(|error| RuntimeError::invalid_state(format!("Current doc update merge failed: {error}")))?;

  Ok(Some(CurrentDoc { blob, updated_at }))
}

pub(super) async fn load_workspace_live_doc_ids(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin workspace root read", error))?;
  lock_current_doc_read(&mut transaction, workspace_id, workspace_id).await?;
  let ids = load_workspace_canonical_doc_ids(&mut transaction, workspace_id).await?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit workspace root read", error))?;
  Ok(ids)
}

pub(super) async fn load_workspace_canonical_doc_ids(
  connection: &mut PgConnection,
  workspace_id: &str,
) -> RuntimeResult<Vec<String>> {
  let root = load_root(connection, workspace_id).await?;
  if !root.exists {
    return Err(RuntimeError::invalid_state("doc_root_source_invalid"));
  }
  Ok(require_complete_root(&root.doc)?.doc_ids)
}

#[cfg(test)]
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
  fn current_sources_preserve_structs_and_project_root_membership() {
    use y_octo::{Any, Value};

    let snapshot = vec![
      1, 1, 7, 0, 4, 1, 7, 99, 111, 110, 116, 101, 110, 116, 18, 114, 101, 116, 97, 105, 110, 101, 100, 32, 116, 111,
      109, 98, 115, 116, 111, 110, 101, 0,
    ];
    let deletion = vec![0, 1, 7, 1, 0, 18];
    let mut expected = snapshot.clone();
    expected.pop();
    expected.extend_from_slice(&deletion[1..]);
    let timestamp = Utc::now();
    let merged = merge_current_doc_updates(
      Some(CurrentDoc {
        blob: snapshot,
        updated_at: timestamp,
      }),
      vec![CurrentDocUpdate {
        blob: deletion,
        created_at: timestamp,
      }],
    )
    .unwrap()
    .unwrap();
    assert_eq!(merged.blob, expected);

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
      merge_current_doc_updates(
        Some(CurrentDoc {
          blob: vec![0xff],
          updated_at: Utc::now(),
        }),
        vec![]
      )
      .is_err()
    );
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
