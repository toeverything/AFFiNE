use super::{
  BATCH, BackendRuntime, DateTime, KIND, PgPool, RuntimeError, RuntimeResult, Utc, Value, checkpoint, json,
  load_source, lock_root, prepare_report, read_checkpoint, revision, source_revision, summary,
};

pub(super) async fn record_observation(
  pool: &PgPool,
  workspace_id: &str,
  observed: Option<&str>,
) -> RuntimeResult<bool> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin root observation", error))?;
  if !lock_root(&mut transaction, workspace_id, true).await? {
    return Ok(false);
  }
  let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=$1)")
    .bind(workspace_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("check observed workspace", error))?;
  if !exists {
    return Ok(false);
  }
  let (revision, initialized) = source_revision(&mut transaction, workspace_id).await?;
  if observed.is_some_and(|observed| observed != revision) {
    return Ok(false);
  }
  let existing = read_checkpoint(&mut transaction, workspace_id).await?;
  if existing.as_ref().is_some_and(|(status, metadata)| {
    metadata["sourceRevision"] == revision && (status == "pending" || status == "needs_operator")
  }) {
    return Ok(false);
  }
  let previous_reason = existing
    .as_ref()
    .and_then(|(_, metadata)| metadata.get("reason"))
    .cloned();
  checkpoint(
    &mut transaction,
    workspace_id,
    "pending",
    json!({"sourceRevision":revision,"initialized":initialized,"reason":previous_reason}),
  )
  .await?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit root observation", error))?;
  Ok(true)
}

async fn discover(pool: &PgPool) -> RuntimeResult<usize> {
  let cursor = sqlx::query_scalar::<_, Option<i32>>(
    "SELECT last_sid FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope='__scan__'",
  )
  .bind(KIND)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("read root inspection scan cursor", error))?
  .flatten()
  .unwrap_or(0);
  let rows = sqlx::query_as::<
    _,
    (
      String,
      i32,
      Option<DateTime<Utc>>,
      Option<DateTime<Utc>>,
      Option<String>,
    ),
  >(
    "SELECT workspace.id,workspace.sid,root.updated_at,latest.created_at,checkpoint.metadata->>'sourceRevision' FROM \
     workspaces workspace LEFT JOIN snapshots root ON root.workspace_id=workspace.id AND root.guid=workspace.id LEFT \
     JOIN LATERAL(SELECT max(created_at) AS created_at FROM updates WHERE workspace_id=workspace.id AND \
     guid=workspace.id) latest ON true LEFT JOIN storage_reconciliation_checkpoints checkpoint ON checkpoint.kind=$1 \
     AND checkpoint.scope=workspace.id WHERE workspace.sid>$2 ORDER BY workspace.sid LIMIT $3",
  )
  .bind(KIND)
  .bind(cursor)
  .bind(BATCH)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("scan root source metadata", error))?;
  for (workspace_id, _, snapshot, update, recorded) in &rows {
    let current = if snapshot.is_some() || update.is_some() {
      revision(*snapshot, *update, true)
    } else {
      let mut connection = pool
        .acquire()
        .await
        .map_err(|error| RuntimeError::database("acquire missing root evidence read", error))?;
      source_revision(&mut connection, workspace_id).await?.0
    };
    if recorded.as_deref() != Some(current.as_str()) {
      record_observation(pool, workspace_id, Some(&current)).await?;
    }
  }
  let next = if rows.len() < BATCH as usize {
    0
  } else {
    rows.last().unwrap().1
  };
  sqlx::query(
    "INSERT INTO storage_reconciliation_checkpoints(kind,scope,status,last_sid) VALUES($1,'__scan__','healthy',$2) ON \
     CONFLICT(kind,scope) DO UPDATE SET last_sid=excluded.last_sid,updated_at=clock_timestamp() WHERE \
     COALESCE(storage_reconciliation_checkpoints.last_sid,0)=$3",
  )
  .bind(KIND)
  .bind(next)
  .bind(cursor)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("advance root inspection cursor", error))?;
  Ok(rows.len())
}

pub(super) async fn tick(runtime: &BackendRuntime, pool: &PgPool) -> RuntimeResult<Value> {
  let scanned = discover(pool).await?;
  let pending = sqlx::query_scalar::<_, String>(
    "SELECT scope FROM storage_reconciliation_checkpoints WHERE kind=$1 AND status='pending' ORDER BY \
     updated_at,scope LIMIT $2",
  )
  .bind(KIND)
  .bind(BATCH)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("load pending root inspections", error))?;
  let mut candidate_available = true;
  let mut inspected = 0;
  let mut failures = Vec::new();
  for workspace_id in pending {
    match inspect_pending(runtime, pool, &workspace_id, &mut candidate_available).await {
      Ok(completed) => inspected += usize::from(completed),
      Err(error) => {
        sqlx::query(
          "UPDATE storage_reconciliation_checkpoints SET updated_at=clock_timestamp() WHERE kind=$1 AND scope=$2 AND \
           status='pending'",
        )
        .bind(KIND)
        .bind(&workspace_id)
        .execute(pool)
        .await
        .map_err(|error| RuntimeError::database("reschedule root inspection", error))?;
        failures.push(json!({"workspaceId":workspace_id,"error":error.to_string()}));
      }
    }
  }
  Ok(json!({"scanned":scanned,"inspected":inspected,"failures":failures}))
}

async fn inspect_pending(
  runtime: &BackendRuntime,
  pool: &PgPool,
  workspace_id: &str,
  candidate_available: &mut bool,
) -> RuntimeResult<bool> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin pending root inspection", error))?;
  if !lock_root(&mut transaction, workspace_id, true).await? {
    return Ok(false);
  }
  let Some((status, previous)) = read_checkpoint(&mut transaction, workspace_id).await? else {
    return Ok(false);
  };
  if status != "pending" {
    return Ok(false);
  }
  let source = match load_source(&mut transaction, workspace_id).await {
    Ok(source) => source,
    Err(RuntimeError::InvalidInput(reason)) if reason == "workspace_not_found" => {
      sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2")
        .bind(KIND)
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| RuntimeError::database("remove deleted workspace root inspection", error))?;
      transaction
        .commit()
        .await
        .map_err(|error| RuntimeError::database("commit deleted workspace root inspection", error))?;
      return Ok(true);
    }
    Err(error) => return Err(error),
  };
  if source.reason == "healthy" || source.reason == "uninitialized" {
    let timestamp = source.timestamp_ms();
    let changed = previous["reason"]
      .as_str()
      .is_some_and(|reason| reason != "healthy" && reason != "uninitialized");
    checkpoint(&mut transaction, workspace_id, "healthy", source.metadata()).await?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit healthy root diagnosis", error))?;
    if changed && let Some(timestamp) = timestamp {
      runtime.notify_root_source(workspace_id, timestamp).await;
    }
    return Ok(true);
  }
  if source.reason != "missing_dependencies" {
    checkpoint(&mut transaction, workspace_id, "needs_operator", source.metadata()).await?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit invalid root diagnosis", error))?;
    return Ok(true);
  }
  if !*candidate_available {
    return Ok(false);
  }
  *candidate_available = false;
  let report = prepare_report(&mut transaction, workspace_id, source).await?;
  checkpoint(&mut transaction, workspace_id, "needs_operator", summary(&report)).await?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit root candidate diagnosis", error))?;
  Ok(true)
}

#[cfg(test)]
mod tests {
  use y_octo::{Any, Doc, Value as YValue};

  use super::*;
  use crate::runtime::{backend_runtime::tests::runtime_from_database_url, migrations::DATABASE_TEST_LOCK};

  #[tokio::test]
  async fn root_inspection_keeps_candidates_readonly_and_applies_reviewed_sources() -> anyhow::Result<()> {
    let _guard = DATABASE_TEST_LOCK.lock().await;
    let Some(runtime) = runtime_from_database_url().await? else {
      return Ok(());
    };
    let pool = runtime.pool().await?;
    let workspace_id = format!("root-inspection-{}", uuid::Uuid::new_v4());
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    let original = Doc::default();
    let mut meta = original.get_or_create_map("meta")?;
    let mut pages = original.create_array()?;
    let mut page = original.create_map()?;
    page.insert("id".to_string(), Any::String("a".into()))?;
    pages.push(YValue::Map(page))?;
    meta.insert("pages".to_string(), YValue::Array(pages))?;
    let prefix = original.encode_update_v1()?;
    let state = original.get_state_vector();
    meta.insert("name".to_string(), Any::String("current".into()))?;
    let partial = original.encode_state_as_update_v1(&state)?;
    let root_time = DateTime::from_timestamp_millis(Utc::now().timestamp_millis()).unwrap();
    let history_time = root_time - chrono::Duration::minutes(1);
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,size,updated_at) VALUES($1,$1,$2,$3,$4)")
      .bind(&workspace_id)
      .bind(&partial)
      .bind(partial.len() as i64)
      .bind(root_time)
      .execute(&pool)
      .await?;
    sqlx::query(
      "INSERT INTO snapshot_histories(workspace_id,guid,timestamp,blob,expired_at) VALUES($1,$1,$2,$3,now()+interval \
       '1 day')",
    )
    .bind(&workspace_id)
    .bind(history_time)
    .bind(&prefix)
    .execute(&pool)
    .await?;
    assert!(record_observation(&pool, &workspace_id, None).await?);
    let mut budget = true;
    assert!(inspect_pending(&runtime, &pool, &workspace_id, &mut budget).await?);
    assert!(!budget);
    let row = sqlx::query_as::<_, (String, Value, DateTime<Utc>)>(
      "SELECT status,metadata,updated_at FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2",
    )
    .bind(KIND)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(row.0, "needs_operator");
    assert_eq!(row.1["reason"], "missing_dependencies");
    assert_eq!(row.1["candidateStatus"], "candidate_available");
    assert_eq!(
      sqlx::query_scalar::<_, Vec<u8>>("SELECT blob FROM snapshots WHERE workspace_id=$1 AND guid=$1")
        .bind(&workspace_id)
        .fetch_one(&pool)
        .await?,
      partial
    );
    assert!(!record_observation(&pool, &workspace_id, None).await?);
    let unchanged = sqlx::query_scalar::<_, DateTime<Utc>>(
      "SELECT updated_at FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2",
    )
    .bind(KIND)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(unchanged, row.2);
    let report = runtime
      .workspace_root_maintenance_v1(
        json!({"command":"inspect","workspaceId":workspace_id,"historyTimestamps":[history_time]}),
      )
      .await?;
    assert!(report["candidate"].is_string());
    let state = original.get_state_vector();
    meta.insert("avatar".to_string(), Any::String("concurrent".into()))?;
    let concurrent = original.encode_state_as_update_v1(&state)?;
    sqlx::query("INSERT INTO updates(workspace_id,guid,blob,created_at) VALUES($1,$1,$2,$3)")
      .bind(&workspace_id)
      .bind(&concurrent)
      .bind(root_time + chrono::Duration::milliseconds(1))
      .execute(&pool)
      .await?;
    let error = runtime
      .workspace_root_maintenance_v1(json!({"command":"apply","report":report}))
      .await
      .unwrap_err();
    assert!(error.to_string().contains("stale_report"));
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM updates WHERE workspace_id=$1 AND guid=$1")
        .bind(&workspace_id)
        .fetch_one(&pool)
        .await?,
      1
    );
    let fragments = [&prefix, &partial, &concurrent];
    for order in [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] {
      let snapshot = super::super::CurrentDoc {
        blob: fragments[order[0]].clone(),
        updated_at: root_time,
      };
      let updates = order[1..]
        .iter()
        .map(|index| super::super::CurrentDocUpdate {
          blob: fragments[*index].clone(),
          created_at: root_time,
        })
        .collect::<Vec<_>>();
      let loaded = super::super::load_root_parts(Some(&snapshot), &updates)?;
      assert!(!loaded.doc.has_pending_updates(), "stored fragment order {order:?}");
    }
    let gap = super::super::RootSource {
      snapshot: Some(super::super::CurrentDoc {
        blob: partial.clone(),
        updated_at: root_time,
      }),
      updates: vec![super::super::CurrentDocUpdate {
        blob: concurrent.clone(),
        created_at: root_time,
      }],
      initialized: true,
      revision: String::new(),
      reason: "missing_dependencies",
      projection: None,
    };
    assert!(super::super::merge_candidate(&gap, &[])?.is_none());
    let material = super::super::Material::new(&workspace_id, "history", Some(history_time), &prefix, "prefix".into());
    assert!(super::super::merge_candidate(&gap, std::slice::from_ref(&material))?.is_some());
    meta.remove("name");
    let deletes = original.encode_state_as_update_v1(&original.get_state_vector())?;
    let deleted = super::super::RootSource {
      updates: vec![super::super::CurrentDocUpdate {
        blob: deletes,
        created_at: root_time,
      }],
      ..gap
    };
    let (blob, _) = super::super::merge_candidate(&deleted, &[material])?.unwrap();
    let preserved = y_octo::merge_updates_v1([
      partial.as_slice(),
      deleted.updates[0].blob.as_slice(),
      prefix.as_slice(),
    ])?
    .encode_v1()?;
    assert_eq!(blob, preserved);
    assert!(Doc::try_from_binary_v1(blob)?.get_map("meta")?.get("name").is_none());
    let report = runtime
      .workspace_root_maintenance_v1(
        json!({"command":"inspect","workspaceId":workspace_id,"historyTimestamps":[history_time]}),
      )
      .await?;
    assert!(
      report["candidate"].is_string(),
      "fresh repair candidate missing: reason={}, projection={}",
      report["reason"],
      report["currentProjection"]
    );
    let approved_candidate = base64::Engine::decode(
      &base64::engine::general_purpose::STANDARD,
      report["candidate"].as_str().unwrap(),
    )?;
    let installed = runtime
      .workspace_root_maintenance_v1(json!({"command":"apply","report":report}))
      .await?;
    assert!(installed["timestampMs"].as_i64().unwrap() > root_time.timestamp_millis() + 1);
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM updates WHERE workspace_id=$1 AND guid=$1")
        .bind(&workspace_id)
        .fetch_one(&pool)
        .await?,
      0
    );
    let repaired = sqlx::query_scalar::<_, Vec<u8>>("SELECT blob FROM snapshots WHERE workspace_id=$1 AND guid=$1")
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await?;
    assert_eq!(repaired, approved_candidate);
    let projection = affine_doc_loader::project_workspace_root(repaired, true)?;
    assert!(projection.complete);
    assert_eq!(projection.doc_ids, ["a"]);
    runtime
      .workspace_root_maintenance_v1(json!({"command":"notify","workspaceId":workspace_id}))
      .await?;
    sqlx::query("DELETE FROM snapshots WHERE workspace_id=$1 AND guid=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    assert!(record_observation(&pool, &workspace_id, None).await?);
    let mut budget = true;
    assert!(inspect_pending(&runtime, &pool, &workspace_id, &mut budget).await?);
    assert!(budget);
    let metadata = sqlx::query_scalar::<_, Value>(
      "SELECT metadata FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2",
    )
    .bind(KIND)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(metadata["reason"], "root_missing");
    assert_eq!(metadata["initialized"], true);
    sqlx::query("DELETE FROM snapshot_histories WHERE workspace_id=$1 AND guid=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2")
      .bind(KIND)
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    assert!(record_observation(&pool, &workspace_id, None).await?);
    let mut budget = true;
    assert!(inspect_pending(&runtime, &pool, &workspace_id, &mut budget).await?);
    let metadata = sqlx::query_scalar::<_, Value>(
      "SELECT metadata FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2",
    )
    .bind(KIND)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(metadata["reason"], "uninitialized");
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,size,updated_at) VALUES($1,'child',$2,2,now())")
      .bind(&workspace_id)
      .bind(vec![0_u8, 0])
      .execute(&pool)
      .await?;
    assert!(record_observation(&pool, &workspace_id, None).await?);
    assert!(inspect_pending(&runtime, &pool, &workspace_id, &mut budget).await?);
    let metadata = sqlx::query_scalar::<_, Value>(
      "SELECT metadata FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2",
    )
    .bind(KIND)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(metadata["reason"], "root_missing");
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,size,updated_at) VALUES($1,$1,$2,$3,$4)")
      .bind(&workspace_id)
      .bind(&partial)
      .bind(partial.len() as i64)
      .bind(root_time + chrono::Duration::minutes(1))
      .execute(&pool)
      .await?;
    for index in 0..=100 {
      let blob = if index == 100 { &prefix } else { &partial };
      sqlx::query(
        "INSERT INTO snapshot_histories(workspace_id,guid,timestamp,blob,expired_at) \
         VALUES($1,$1,$2,$3,now()+interval '1 day')",
      )
      .bind(&workspace_id)
      .bind(history_time - chrono::Duration::milliseconds(index))
      .bind(blob)
      .execute(&pool)
      .await?;
    }
    assert!(record_observation(&pool, &workspace_id, None).await?);
    let mut held = pool.begin().await?;
    super::super::lock_root(&mut held, &workspace_id, false).await?;
    assert!(
      !tokio::time::timeout(
        std::time::Duration::from_secs(1),
        record_observation(&pool, &workspace_id, None)
      )
      .await??
    );
    held.rollback().await?;
    let mut budget = true;
    assert!(inspect_pending(&runtime, &pool, &workspace_id, &mut budget).await?);
    let metadata = sqlx::query_scalar::<_, Value>(
      "SELECT metadata FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2",
    )
    .bind(KIND)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(metadata["candidateStatus"], "inspection_limited");
    assert_eq!(metadata["inspectedHistory"].as_array().unwrap().len(), 100);
    assert!(metadata["candidateDigest"].is_null());
    sqlx::query("DELETE FROM snapshots WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM snapshot_histories WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("UPDATE storage_reconciliation_checkpoints SET status='pending' WHERE kind=$1 AND scope=$2")
      .bind(KIND)
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    for _ in 0..2 {
      let result = tick(&runtime, &pool).await?;
      assert!(
        result["failures"]
          .as_array()
          .unwrap()
          .iter()
          .all(|failure| failure["workspaceId"] != workspace_id)
      );
      assert_eq!(
        sqlx::query_scalar::<_, i64>(
          "SELECT count(*) FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2"
        )
        .bind(KIND)
        .bind(&workspace_id)
        .fetch_one(&pool)
        .await?,
        0
      );
    }
    Ok(())
  }
}
