use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgConnection, PgPool};

use super::{RuntimeError, RuntimeResult, lock_current_doc_read};

#[derive(FromRow)]
pub(in crate::runtime) struct CurrentDoc {
  pub(in crate::runtime) blob: Vec<u8>,
  pub(in crate::runtime) updated_at: DateTime<Utc>,
  pub(in crate::runtime) updated_by: Option<String>,
}

#[derive(FromRow)]
pub(in crate::runtime) struct CurrentDocUpdate {
  pub(in crate::runtime) blob: Vec<u8>,
  pub(in crate::runtime) created_at: DateTime<Utc>,
  pub(in crate::runtime) created_by: Option<String>,
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
  merge_current_doc(snapshot, updates)
}

pub(in crate::runtime) async fn load_current_doc_parts_in(
  connection: &mut PgConnection,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<(Option<CurrentDoc>, Vec<CurrentDocUpdate>)> {
  let rows = sqlx::query_as::<_, (Vec<u8>, DateTime<Utc>, bool, Option<String>)>(
    "SELECT blob,updated_at AS timestamp,true AS snapshot,updated_by AS editor FROM snapshots WHERE workspace_id=$1 \
     AND guid=$2 UNION ALL SELECT blob,created_at AS timestamp,false AS snapshot,created_by AS editor FROM updates \
     WHERE workspace_id=$1 AND guid=$2 ORDER BY snapshot DESC,timestamp ASC",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(connection)
  .await
  .map_err(|error| RuntimeError::database("load current document parts", error))?;
  let mut snapshot = None;
  let mut updates = Vec::new();
  for (blob, timestamp, is_snapshot, editor) in rows {
    if is_snapshot {
      snapshot = Some(CurrentDoc {
        blob,
        updated_at: timestamp,
        updated_by: editor,
      });
    } else {
      updates.push(CurrentDocUpdate {
        blob,
        created_at: timestamp,
        created_by: editor,
      });
    }
  }
  Ok((snapshot, updates))
}

pub(in crate::runtime) fn merge_current_doc(
  snapshot: Option<CurrentDoc>,
  updates: Vec<CurrentDocUpdate>,
) -> RuntimeResult<Option<CurrentDoc>> {
  if snapshot.is_none() && updates.is_empty() {
    return Ok(None);
  }
  let (updated_at, updated_by) = snapshot
    .iter()
    .map(|snapshot| (snapshot.updated_at, &snapshot.updated_by))
    .chain(updates.iter().map(|update| (update.created_at, &update.created_by)))
    .max_by_key(|(timestamp, _)| *timestamp)
    .expect("current source is not empty");
  let updated_by = updated_by.clone();
  let blob = y_octo::merge_updates_v1(
    snapshot
      .iter()
      .map(|snapshot| snapshot.blob.as_slice())
      .chain(updates.iter().map(|update| update.blob.as_slice())),
  )
  .and_then(|update| update.encode_v1())
  .map_err(|error| RuntimeError::invalid_state(format!("Current doc update merge failed: {error}")))?;

  Ok(Some(CurrentDoc {
    blob,
    updated_at,
    updated_by,
  }))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn current_sources_preserve_structs() {
    let snapshot = vec![
      1, 1, 7, 0, 4, 1, 7, 99, 111, 110, 116, 101, 110, 116, 18, 114, 101, 116, 97, 105, 110, 101, 100, 32, 116, 111,
      109, 98, 115, 116, 111, 110, 101, 0,
    ];
    let deletion = vec![0, 1, 7, 1, 0, 18];
    let mut expected = snapshot.clone();
    expected.pop();
    expected.extend_from_slice(&deletion[1..]);
    let timestamp = Utc::now();
    let merged = merge_current_doc(
      Some(CurrentDoc {
        blob: snapshot,
        updated_at: timestamp,
        updated_by: Some("snapshot-editor".into()),
      }),
      vec![CurrentDocUpdate {
        blob: deletion,
        created_at: timestamp,
        created_by: Some("update-editor".into()),
      }],
    )
    .unwrap()
    .unwrap();
    assert_eq!(merged.blob, expected);
    assert_eq!(merged.updated_by.as_deref(), Some("update-editor"));

    assert!(
      merge_current_doc(
        Some(CurrentDoc {
          blob: vec![0xff],
          updated_at: timestamp,
          updated_by: None,
        }),
        vec![]
      )
      .is_err()
    );
  }
}
