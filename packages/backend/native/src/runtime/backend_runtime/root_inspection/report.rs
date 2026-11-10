use super::{
  BASE64, BATCH, BackendRuntime, Backup, DateTime, Deserialize, Engine, Material, PgConnection, PgPool, RootSource,
  RuntimeError, RuntimeResult, Serialize, Utc, Value, checkpoint, digest, invalidate_doc_blob_projection, json,
  json_digest, load_source, lock_root, merge_candidate, next_workspace_doc_update_timestamp, revision,
};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Report {
  workspace_id: String,
  source_revision: String,
  initialized: bool,
  current_materials: Vec<Material>,
  current_digest: String,
  current_projection: Option<Value>,
  reason: String,
  selected_materials: Vec<Material>,
  candidate: Option<String>,
  candidate_digest: Option<String>,
  candidate_projection: Option<Value>,
  inspected_history: Vec<String>,
  inspection_limited: bool,
  report_digest: String,
}

pub(super) async fn history(
  connection: &mut PgConnection,
  workspace_id: &str,
  timestamp: DateTime<Utc>,
) -> RuntimeResult<Option<Material>> {
  let blob = sqlx::query_scalar::<_, Vec<u8>>(
    "SELECT blob FROM snapshot_histories WHERE workspace_id=$1 AND guid=$1 AND timestamp=$2 FOR SHARE",
  )
  .bind(workspace_id)
  .bind(timestamp)
  .fetch_optional(connection)
  .await
  .map_err(|error| RuntimeError::database("load root repair history", error))?;
  Ok(blob.map(|blob| {
    Material::new(
      workspace_id,
      "history",
      Some(timestamp),
      &blob,
      format!("history:{}", timestamp.to_rfc3339()),
    )
  }))
}

pub(super) fn build_report(
  workspace_id: &str,
  source: RootSource,
  selected_materials: Vec<Material>,
  inspected_history: Vec<String>,
  inspection_limited: bool,
  candidate: Option<(Vec<u8>, Value)>,
) -> RuntimeResult<Report> {
  let current_materials = source.materials(workspace_id);
  let current_digest = json_digest(&current_materials)?;
  let (candidate, candidate_digest, candidate_projection) = match candidate {
    Some((blob, projection)) => (Some(BASE64.encode(&blob)), Some(digest(&blob)), Some(projection)),
    None => (None, None, None),
  };
  let mut report = Report {
    workspace_id: workspace_id.into(),
    source_revision: source.revision,
    initialized: source.initialized,
    current_materials,
    current_digest,
    current_projection: source.projection,
    reason: source.reason.into(),
    selected_materials,
    candidate,
    candidate_digest,
    candidate_projection,
    inspected_history,
    inspection_limited,
    report_digest: String::new(),
  };
  report.report_digest = json_digest(&report)?;
  Ok(report)
}

pub(super) fn summary(report: &Report) -> Value {
  json!({"sourceRevision":report.source_revision,"initialized":report.initialized,"reason":report.reason,
    "currentDigest":report.current_digest,"currentProjection":report.current_projection,
    "candidateProjection":report.candidate_projection,"candidateDigest":report.candidate_digest,
    "inspectedHistory":report.inspected_history,"inspectionLimited":report.inspection_limited,
    "selectedMaterials":report.selected_materials.iter().map(|m|json!({"id":m.id,"digest":m.digest})).collect::<Vec<_>>(),
    "candidateStatus":if report.candidate.is_some(){"candidate_available"}else if report.inspection_limited{"inspection_limited"}else{"materials_insufficient"}})
}

pub(super) async fn prepare_report(
  connection: &mut PgConnection,
  workspace_id: &str,
  source: RootSource,
) -> RuntimeResult<Report> {
  let timestamps = sqlx::query_scalar::<_, DateTime<Utc>>(
    "SELECT timestamp FROM snapshot_histories WHERE workspace_id=$1 AND guid=$1 ORDER BY timestamp DESC LIMIT $2",
  )
  .bind(workspace_id)
  .bind(BATCH + 1)
  .fetch_all(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("scan root repair histories", error))?;
  let limited = timestamps.len() > BATCH as usize;
  let mut selected = Vec::new();
  let mut checked = Vec::new();
  let mut candidate = None;
  for timestamp in timestamps.into_iter().take(BATCH as usize) {
    checked.push(timestamp.to_rfc3339());
    if let Some(material) = history(connection, workspace_id, timestamp).await? {
      if let Ok(Some(result)) = merge_candidate(&source, std::slice::from_ref(&material)) {
        candidate = Some(result);
        selected.push(material);
        break;
      }
    }
  }
  let limited = limited && selected.is_empty();
  build_report(workspace_id, source, selected, checked, limited, candidate)
}

pub(super) async fn inspect(
  pool: &PgPool,
  workspace_id: &str,
  timestamps: &[DateTime<Utc>],
  backups: Vec<Backup>,
) -> RuntimeResult<Report> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin root repair inspection", error))?;
  lock_root(&mut transaction, workspace_id, false).await?;
  let source = load_source(&mut transaction, workspace_id).await?;
  if timestamps.is_empty() && backups.is_empty() && source.reason == "missing_dependencies" {
    let report = prepare_report(&mut transaction, workspace_id, source).await?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit root candidate inspection", error))?;
    return Ok(report);
  }
  let mut selected = Vec::new();
  for timestamp in timestamps {
    selected.push(
      history(&mut transaction, workspace_id, *timestamp)
        .await?
        .ok_or_else(|| RuntimeError::invalid_input("root history material missing"))?,
    );
  }
  for backup in backups {
    if backup.workspace_id != workspace_id {
      return Err(RuntimeError::invalid_input("backup workspace mismatch"));
    }
    let blob = BASE64
      .decode(&backup.blob)
      .map_err(|_| RuntimeError::invalid_input("invalid backup encoding"))?;
    selected.push(Material::new(workspace_id, "backup", None, &blob, backup.id));
  }
  let candidate = if selected.is_empty() || source.reason == "invalid_encoding" {
    None
  } else {
    merge_candidate(&source, &selected)?
  };
  let report = build_report(
    workspace_id,
    source,
    selected,
    timestamps.iter().map(DateTime::to_rfc3339).collect(),
    false,
    candidate,
  )?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit root repair inspection", error))?;
  Ok(report)
}

pub(super) async fn install(runtime: &BackendRuntime, pool: &PgPool, mut report: Report) -> RuntimeResult<Value> {
  let approved_digest = std::mem::take(&mut report.report_digest);
  if json_digest(&report)? != approved_digest {
    return Err(RuntimeError::invalid_input("root report digest mismatch"));
  }
  let expected_candidate = report
    .candidate_digest
    .as_ref()
    .ok_or_else(|| RuntimeError::invalid_input("root report has no valid candidate"))?;
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin root repair apply", error))?;
  lock_root(&mut transaction, &report.workspace_id, false).await?;
  let current = load_source(&mut transaction, &report.workspace_id).await?;
  if current.revision != report.source_revision || current.digest(&report.workspace_id)? != report.current_digest {
    return Err(RuntimeError::invalid_state("stale_report"));
  }
  for material in &report.selected_materials {
    if material.workspace_id != report.workspace_id {
      return Err(RuntimeError::invalid_input("repair material workspace mismatch"));
    }
    match material.source.as_str() {
      "history" => {
        let timestamp = material
          .timestamp
          .ok_or_else(|| RuntimeError::invalid_input("history material timestamp missing"))?;
        if history(&mut transaction, &report.workspace_id, timestamp)
          .await?
          .is_none_or(|actual| actual.digest != material.digest)
        {
          return Err(RuntimeError::invalid_state("stale_report"));
        }
      }
      "backup" => {
        material.decode()?;
      }
      _ => return Err(RuntimeError::invalid_input("unsupported repair material source")),
    }
  }
  let (blob, projection) = merge_candidate(&current, &report.selected_materials)?
    .ok_or_else(|| RuntimeError::invalid_input("root repair candidate is invalid"))?;
  if digest(&blob) != *expected_candidate {
    return Err(RuntimeError::invalid_state("stale_report"));
  }
  let timestamp =
    next_workspace_doc_update_timestamp(&mut transaction, &report.workspace_id, &report.workspace_id).await?;
  sqlx::query(
    "INSERT INTO snapshots(workspace_id,guid,blob,size,updated_at) VALUES($1,$1,$2,$3,$4) ON \
     CONFLICT(workspace_id,guid) DO UPDATE SET \
     blob=excluded.blob,size=excluded.size,state=NULL,updated_at=excluded.updated_at",
  )
  .bind(&report.workspace_id)
  .bind(&blob)
  .bind(blob.len() as i64)
  .bind(timestamp)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("install repaired root snapshot", error))?;
  let covered = current
    .updates
    .iter()
    .map(|update| update.created_at)
    .collect::<Vec<_>>();
  sqlx::query("DELETE FROM updates WHERE workspace_id=$1 AND guid=$1 AND created_at=ANY($2)")
    .bind(&report.workspace_id)
    .bind(&covered)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("remove covered root updates", error))?;
  invalidate_doc_blob_projection(
    &mut transaction,
    &report.workspace_id,
    &report.workspace_id,
    runtime.embedding_schema_ready()?,
  )
  .await?;
  let installed_revision = revision(Some(timestamp), None, true);
  checkpoint(&mut transaction,&report.workspace_id,"healthy",json!({"sourceRevision":installed_revision,"initialized":true,"reason":"healthy","appliedReportDigest":approved_digest,"projection":projection})).await?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit repaired root snapshot", error))?;
  runtime
    .notify_root_source(&report.workspace_id, timestamp.timestamp_millis())
    .await;
  Ok(
    json!({"workspaceId":report.workspace_id,"installedRevision":installed_revision,"timestampMs":timestamp.timestamp_millis(),"notification":"attempted"}),
  )
}
