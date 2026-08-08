use std::sync::Arc;

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::{RuntimeError, RuntimeResult, register_artifact_source, types};
use crate::runtime::object_storage::{
  ObjectStorageService,
  types::{ObjectKey, ObjectLocator, ObjectPutMetadata, StorageScope, WorkspaceBlobKey},
};

const MAX_ARTIFACT_BYTES: usize = 50 * 1024 * 1024;

pub(super) struct ArtifactService {
  pool: PgPool,
  storage: Arc<ObjectStorageService>,
}

#[derive(FromRow)]
struct ArtifactRow {
  id: Uuid,
  workspace_id: String,
  content_hash: String,
  canonical_media_type: String,
  size_bytes: i64,
  storage_scope: String,
  storage_key: String,
  status: String,
  library_owned: bool,
}

impl ArtifactService {
  pub(super) fn new(pool: PgPool, storage: Arc<ObjectStorageService>) -> Self {
    Self { pool, storage }
  }

  pub(super) async fn put(
    &self,
    input: types::PutWorkspaceArtifactInput,
    body: Vec<u8>,
  ) -> RuntimeResult<types::RuntimeWorkspaceArtifact> {
    validate_body(&body)?;
    let content_hash = hash(&body);
    let media_type = canonical_media_type(&input.mime_type);
    let locator = ObjectLocator::new(
      StorageScope::Copilot,
      ObjectKey::new(format!("artifacts/{}/{content_hash}", input.workspace_id))?,
    );
    let row = self
      .reserve(
        &input.workspace_id,
        &content_hash,
        &media_type,
        body.len() as i64,
        &locator,
        input.library_owned.unwrap_or(false),
      )
      .await?;
    let reserved_locator = locator_from_row(&row)?;
    if row.status != "ready" {
      if reserved_locator.scope == StorageScope::Copilot {
        self
          .storage
          .put(
            &reserved_locator,
            body,
            ObjectPutMetadata {
              content_type: Some(media_type),
              ..Default::default()
            },
          )
          .await?;
      }
      self
        .verify_and_complete(&input.workspace_id, &content_hash, &reserved_locator)
        .await?;
    }
    let artifact = self.get(&input.workspace_id, &content_hash).await?;
    register_artifact_source(&self.pool, &artifact).await?;
    Ok(artifact)
  }

  pub(super) async fn alias_blob(
    &self,
    input: types::EnsureWorkspaceBlobArtifactInput,
  ) -> RuntimeResult<types::RuntimeWorkspaceArtifact> {
    let locator = ObjectLocator::new(
      StorageScope::Blob,
      WorkspaceBlobKey::new(&input.workspace_id, &input.blob_id)?.into_object_key(),
    );
    let object = self
      .storage
      .get_limited(&locator, MAX_ARTIFACT_BYTES)
      .await?
      .ok_or_else(|| RuntimeError::invalid_input("artifact_blob_not_found"))?;
    validate_body(&object.body)?;
    let content_hash = hash(&object.body);
    self
      .reserve(
        &input.workspace_id,
        &content_hash,
        &canonical_media_type(&input.mime_type),
        object.body.len() as i64,
        &locator,
        input.library_owned.unwrap_or(false),
      )
      .await?;
    self
      .verify_and_complete(&input.workspace_id, &content_hash, &locator)
      .await?;
    let artifact = self.get(&input.workspace_id, &content_hash).await?;
    register_artifact_source(&self.pool, &artifact).await?;
    Ok(artifact)
  }

  pub(super) async fn cleanup(&self, limit: i64) -> RuntimeResult<i64> {
    let rows = sqlx::query_as::<_, ArtifactRow>(
      r#"SELECT id,workspace_id,content_hash,canonical_media_type,size_bytes,
        storage_scope,storage_key,status,library_owned
      FROM workspace_artifacts artifact
      WHERE artifact.id IN(
        SELECT candidate.id FROM workspace_artifacts candidate
        WHERE candidate.reservation_expires_at<clock_timestamp()
          OR candidate.status='ready' AND NOT candidate.library_owned
            AND candidate.created_at<clock_timestamp()-interval '24 hours'
            AND NOT EXISTS(SELECT 1 FROM ai_message_artifacts reference WHERE reference.artifact_id=candidate.id)
        ORDER BY candidate.created_at LIMIT $1
      ) FOR UPDATE SKIP LOCKED"#,
    )
    .bind(limit)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load unreferenced artifacts failed", error))?;
    let mut removed = 0;
    for row in rows {
      if row.storage_scope == StorageScope::Copilot.as_str() {
        self.storage.delete(&locator_from_row(&row)?).await?;
      }
      let mut transaction = self
        .pool
        .begin()
        .await
        .map_err(|error| RuntimeError::database("begin artifact cleanup failed", error))?;
      sqlx::query(
        r#"UPDATE embedding_sources SET deleted_at=now(),updated_at=now()
        WHERE workspace_id=$1 AND source_kind='artifact' AND source_key=$2 AND deleted_at IS NULL"#,
      )
      .bind(&row.workspace_id)
      .bind(row.id.to_string())
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("tombstone artifact embedding source failed", error))?;
      removed += sqlx::query("DELETE FROM workspace_artifacts WHERE id=$1")
        .bind(row.id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| RuntimeError::database("delete unreferenced artifact failed", error))?
        .rows_affected() as i64;
      transaction
        .commit()
        .await
        .map_err(|error| RuntimeError::database("commit artifact cleanup failed", error))?;
    }
    Ok(removed)
  }

  pub(super) async fn set_library_owned(
    &self,
    workspace_id: &str,
    artifact_id: &str,
    library_owned: bool,
  ) -> RuntimeResult<types::RuntimeWorkspaceArtifact> {
    let artifact_id = Uuid::parse_str(artifact_id).map_err(|_| RuntimeError::invalid_input("artifact_id_invalid"))?;
    sqlx::query_as::<_, ArtifactRow>(
      r#"UPDATE workspace_artifacts SET library_owned=$3,updated_at=now()
      WHERE workspace_id=$1 AND id=$2 AND status='ready'
      RETURNING id,workspace_id,content_hash,canonical_media_type,size_bytes,
        storage_scope,storage_key,status,library_owned"#,
    )
    .bind(workspace_id)
    .bind(artifact_id)
    .bind(library_owned)
    .fetch_one(&self.pool)
    .await
    .map(Into::into)
    .map_err(|error| RuntimeError::database("update artifact library ownership failed", error))
  }

  async fn reserve(
    &self,
    workspace_id: &str,
    content_hash: &str,
    media_type: &str,
    size: i64,
    locator: &ObjectLocator,
    library_owned: bool,
  ) -> RuntimeResult<ArtifactRow> {
    sqlx::query_as::<_, ArtifactRow>(
      r#"INSERT INTO workspace_artifacts(
        id,workspace_id,content_hash,canonical_media_type,size_bytes,storage_scope,storage_key,status,
        library_owned,reservation_expires_at,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'reserving',$8,now()+interval '24 hours',now(),now())
      ON CONFLICT(workspace_id,content_hash) DO UPDATE SET
        library_owned=workspace_artifacts.library_owned OR EXCLUDED.library_owned,
        reservation_expires_at=CASE WHEN workspace_artifacts.status='ready' THEN NULL ELSE EXCLUDED.reservation_expires_at END,
        updated_at=now()
      RETURNING id,workspace_id,content_hash,canonical_media_type,size_bytes,storage_scope,storage_key,status,library_owned"#,
    )
    .bind(Uuid::new_v4())
    .bind(workspace_id)
    .bind(content_hash)
    .bind(media_type)
    .bind(size)
    .bind(locator.scope.as_str())
    .bind(locator.key.as_str())
    .bind(library_owned)
    .fetch_one(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("reserve workspace artifact failed", error))
  }

  async fn verify_and_complete(
    &self,
    workspace_id: &str,
    content_hash: &str,
    locator: &ObjectLocator,
  ) -> RuntimeResult<()> {
    let object = self
      .storage
      .get_limited(locator, MAX_ARTIFACT_BYTES)
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("reserved artifact object is missing"))?;
    if hash(&object.body) != content_hash {
      return Err(RuntimeError::invalid_state("artifact object hash mismatch"));
    }
    sqlx::query(
      r#"UPDATE workspace_artifacts SET status='ready',ready_at=coalesce(ready_at,now()),
        reservation_expires_at=NULL,updated_at=now()
      WHERE workspace_id=$1 AND content_hash=$2 AND storage_scope=$3 AND storage_key=$4"#,
    )
    .bind(workspace_id)
    .bind(content_hash)
    .bind(locator.scope.as_str())
    .bind(locator.key.as_str())
    .execute(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("complete workspace artifact failed", error))?;
    Ok(())
  }

  async fn get(&self, workspace_id: &str, content_hash: &str) -> RuntimeResult<types::RuntimeWorkspaceArtifact> {
    sqlx::query_as::<_, ArtifactRow>(
      r#"SELECT id,workspace_id,content_hash,canonical_media_type,size_bytes,storage_scope,storage_key,status,library_owned
      FROM workspace_artifacts WHERE workspace_id=$1 AND content_hash=$2"#,
    )
    .bind(workspace_id)
    .bind(content_hash)
    .fetch_one(&self.pool)
    .await
    .map(Into::into)
    .map_err(|error| RuntimeError::database("load workspace artifact failed", error))
  }
}

fn canonical_media_type(value: &str) -> String {
  value
    .split(';')
    .next()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("application/octet-stream")
    .to_ascii_lowercase()
}

fn hash(body: &[u8]) -> String {
  URL_SAFE_NO_PAD.encode(Sha256::digest(body))
}

fn validate_body(body: &[u8]) -> RuntimeResult<()> {
  if body.is_empty() || body.len() > MAX_ARTIFACT_BYTES {
    return Err(RuntimeError::invalid_input("artifact_size_invalid"));
  }
  Ok(())
}

fn locator_from_row(row: &ArtifactRow) -> RuntimeResult<ObjectLocator> {
  Ok(ObjectLocator::new(
    StorageScope::parse(&row.storage_scope)?,
    ObjectKey::new(row.storage_key.clone())?,
  ))
}

impl From<ArtifactRow> for types::RuntimeWorkspaceArtifact {
  fn from(row: ArtifactRow) -> Self {
    Self {
      id: row.id.to_string(),
      workspace_id: row.workspace_id,
      content_hash: row.content_hash,
      canonical_media_type: row.canonical_media_type,
      size: row.size_bytes,
      storage_scope: row.storage_scope,
      storage_key: row.storage_key,
      status: row.status,
      library_owned: row.library_owned,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn media_type_and_content_identity_are_canonical() {
    assert_eq!(canonical_media_type(" Text/Plain; charset=utf-8 "), "text/plain");
    assert_eq!(hash(b"same"), hash(b"same"));
    assert_ne!(hash(b"same"), hash(b"different"));
  }
}
