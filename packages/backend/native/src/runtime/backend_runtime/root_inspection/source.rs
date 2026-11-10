use super::{
  BASE64, CurrentDoc, CurrentDocUpdate, DateTime, Deserialize, Doc, Engine, PgConnection, RuntimeError, RuntimeResult,
  Serialize, Utc, Value, digest, json, json_digest, load_current_doc_parts_in, load_root_parts, root_was_initialized,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Material {
  pub(super) id: String,
  pub(super) source: String,
  pub(super) workspace_id: String,
  pub(super) timestamp: Option<DateTime<Utc>>,
  pub(super) blob: String,
  pub(super) digest: String,
}

impl Material {
  pub(super) fn new(
    workspace_id: &str,
    source: &str,
    timestamp: Option<DateTime<Utc>>,
    blob: &[u8],
    id: String,
  ) -> Self {
    Self {
      id,
      source: source.into(),
      workspace_id: workspace_id.into(),
      timestamp,
      blob: BASE64.encode(blob),
      digest: digest(blob),
    }
  }
  pub(super) fn decode(&self) -> RuntimeResult<Vec<u8>> {
    let bytes = BASE64
      .decode(&self.blob)
      .map_err(|_| RuntimeError::invalid_input("invalid maintenance material encoding"))?;
    if digest(&bytes) != self.digest {
      return Err(RuntimeError::invalid_input("root material digest mismatch"));
    }
    Ok(bytes)
  }
}

pub(super) struct RootSource {
  pub(super) snapshot: Option<CurrentDoc>,
  pub(super) updates: Vec<CurrentDocUpdate>,
  pub(super) revision: String,
  pub(super) initialized: bool,
  pub(super) reason: &'static str,
  pub(super) projection: Option<Value>,
}

impl RootSource {
  pub(super) fn timestamp_ms(&self) -> Option<i64> {
    self
      .snapshot
      .iter()
      .map(|s| s.updated_at)
      .chain(self.updates.iter().map(|u| u.created_at))
      .max()
      .map(|timestamp| timestamp.timestamp_millis())
  }
  pub(super) fn materials(&self, workspace_id: &str) -> Vec<Material> {
    self
      .snapshot
      .iter()
      .map(|record| {
        Material::new(
          workspace_id,
          "snapshot",
          Some(record.updated_at),
          &record.blob,
          format!("snapshot:{}", record.updated_at.to_rfc3339()),
        )
      })
      .chain(self.updates.iter().map(|record| {
        Material::new(
          workspace_id,
          "update",
          Some(record.created_at),
          &record.blob,
          format!("update:{}", record.created_at.to_rfc3339()),
        )
      }))
      .collect()
  }
  pub(super) fn digest(&self, workspace_id: &str) -> RuntimeResult<String> {
    json_digest(&self.materials(workspace_id))
  }

  pub(super) fn metadata(&self) -> Value {
    json!({"sourceRevision": self.revision, "initialized": self.initialized, "reason": self.reason})
  }
}

pub(super) fn revision(snapshot: Option<DateTime<Utc>>, update: Option<DateTime<Utc>>, initialized: bool) -> String {
  json!({"snapshot":snapshot.map(|v|v.timestamp_micros()),"update":update.map(|v|v.timestamp_micros()),"initialized":initialized}).to_string()
}

pub(super) async fn source_revision(
  connection: &mut PgConnection,
  workspace_id: &str,
) -> RuntimeResult<(String, bool)> {
  let (snapshot, update) = sqlx::query_as::<_, (Option<DateTime<Utc>>, Option<DateTime<Utc>>)>(
    "SELECT (SELECT updated_at FROM snapshots WHERE workspace_id=$1 AND guid=$1), (SELECT max(created_at) FROM \
     updates WHERE workspace_id=$1 AND guid=$1)",
  )
  .bind(workspace_id)
  .fetch_one(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("read root source revision", error))?;
  let initialized = snapshot.is_some() || update.is_some() || root_was_initialized(connection, workspace_id).await?;
  Ok((revision(snapshot, update, initialized), initialized))
}

pub(super) async fn load_source(connection: &mut PgConnection, workspace_id: &str) -> RuntimeResult<RootSource> {
  let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=$1)")
    .bind(workspace_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| RuntimeError::database("check inspected workspace", error))?;
  if !exists {
    return Err(RuntimeError::invalid_input("workspace_not_found"));
  }
  let (snapshot, updates) = load_current_doc_parts_in(connection, workspace_id, workspace_id).await?;
  let exists = snapshot.is_some() || !updates.is_empty();
  let initialized = exists || root_was_initialized(connection, workspace_id).await?;
  let revision = revision(
    snapshot.as_ref().map(|s| s.updated_at),
    updates.last().map(|u| u.created_at),
    initialized,
  );
  let mut source = RootSource {
    snapshot,
    updates,
    revision,
    initialized,
    reason: "healthy",
    projection: None,
  };
  if !exists {
    source.reason = if initialized { "root_missing" } else { "uninitialized" };
    return Ok(source);
  }
  let loaded = match load_root_parts(source.snapshot.as_ref(), &source.updates) {
    Ok(loaded) => loaded,
    Err(_) => {
      source.reason = "invalid_encoding";
      return Ok(source);
    }
  };
  match affine_doc_loader::project_workspace_root_doc(&loaded.doc) {
    Ok(projection) => {
      source.reason = if projection.complete {
        "healthy"
      } else {
        "missing_dependencies"
      };
      source.projection = Some(
        json!({"complete":projection.complete,"docIds":projection.doc_ids,"activeDocIds":projection.active_doc_ids}),
      );
    }
    Err(_) => source.reason = "invalid_root_shape",
  }
  Ok(source)
}

pub(super) fn merge_candidate(source: &RootSource, materials: &[Material]) -> RuntimeResult<Option<(Vec<u8>, Value)>> {
  let selected = materials
    .iter()
    .map(Material::decode)
    .collect::<RuntimeResult<Vec<_>>>()?;
  let fragments = source
    .snapshot
    .iter()
    .map(|snapshot| snapshot.blob.as_slice())
    .chain(source.updates.iter().map(|update| update.blob.as_slice()))
    .chain(selected.iter().map(Vec::as_slice));
  let update =
    y_octo::merge_updates_v1(fragments).map_err(|_| RuntimeError::invalid_input("invalid root repair material"))?;
  let blob = update
    .encode_v1()
    .map_err(|error| RuntimeError::invalid_state(format!("encode repair candidate: {error}")))?;
  let mut doc = Doc::default();
  doc
    .apply_update(update)
    .map_err(|_| RuntimeError::invalid_input("invalid root repair material"))?;
  let projection = match affine_doc_loader::project_workspace_root_doc(&doc) {
    Ok(projection) if projection.complete => projection,
    _ => return Ok(None),
  };
  Ok(Some((
    blob,
    json!({"complete":true,"docIds":projection.doc_ids,"activeDocIds":projection.active_doc_ids}),
  )))
}
