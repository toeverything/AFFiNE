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
  display_name: Option<String>,
  file_name: Option<String>,
  canonical_media_type: String,
  size_bytes: i64,
  storage_scope: String,
  storage_key: String,
  status: String,
  library_owned: bool,
}

struct ArtifactReservation<'a> {
  workspace_id: &'a str,
  content_hash: &'a str,
  display_name: Option<&'a str>,
  file_name: Option<&'a str>,
  media_type: &'a str,
  size: i64,
  locator: &'a ObjectLocator,
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
    validate_library_display_name(input.library_owned.unwrap_or(false), input.display_name.as_deref())?;
    let content_hash = hash(&body);
    let media_type = canonical_media_type(&input.mime_type);
    let locator = ObjectLocator::new(
      StorageScope::Copilot,
      ObjectKey::new(format!("artifacts/{}/{content_hash}", input.workspace_id))?,
    );
    let row = self
      .reserve(ArtifactReservation {
        workspace_id: &input.workspace_id,
        content_hash: &content_hash,
        display_name: input.display_name.as_deref(),
        file_name: input.file_name.as_deref(),
        media_type: &media_type,
        size: body.len() as i64,
        locator: &locator,
        library_owned: input.library_owned.unwrap_or(false),
      })
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
    validate_library_display_name(input.library_owned.unwrap_or(false), input.display_name.as_deref())?;
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
    let media_type = canonical_media_type(&input.mime_type);
    let row = self
      .reserve(ArtifactReservation {
        workspace_id: &input.workspace_id,
        content_hash: &content_hash,
        display_name: input.display_name.as_deref(),
        file_name: input.file_name.as_deref(),
        media_type: &media_type,
        size: object.body.len() as i64,
        locator: &locator,
        library_owned: input.library_owned.unwrap_or(false),
      })
      .await?;
    let reserved_locator = locator_from_row(&row)?;
    if row.status != "ready" {
      if reserved_locator.scope == StorageScope::Copilot {
        self
          .storage
          .put(
            &reserved_locator,
            object.body,
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

  pub(super) async fn cleanup(&self, limit: i64) -> RuntimeResult<i64> {
    let artifact_ids = sqlx::query_scalar::<_, Uuid>(
      r#"SELECT candidate.id FROM workspace_artifacts candidate
      WHERE candidate.status='deleting'
        OR candidate.reservation_expires_at<clock_timestamp()
        OR candidate.status='ready' AND NOT candidate.library_owned
          AND candidate.updated_at<clock_timestamp()-interval '24 hours'
          AND NOT EXISTS(SELECT 1 FROM ai_message_artifacts reference WHERE reference.artifact_id=candidate.id)
      ORDER BY candidate.updated_at LIMIT $1"#,
    )
    .bind(limit)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load unreferenced artifacts failed", error))?;
    let mut removed = 0;
    for artifact_id in artifact_ids {
      let mut transaction = self
        .pool
        .begin()
        .await
        .map_err(|error| RuntimeError::database("begin artifact cleanup failed", error))?;
      let Some(row) = sqlx::query_as::<_, ArtifactRow>(
        r#"UPDATE workspace_artifacts artifact SET status='deleting',updated_at=now()
        WHERE artifact.id=$1 AND (
          artifact.status='deleting'
          OR
          artifact.reservation_expires_at<clock_timestamp()
          OR artifact.status='ready' AND NOT artifact.library_owned
            AND artifact.updated_at<clock_timestamp()-interval '24 hours'
            AND NOT EXISTS(SELECT 1 FROM ai_message_artifacts reference WHERE reference.artifact_id=artifact.id)
        ) RETURNING id,workspace_id,content_hash,display_name,file_name,canonical_media_type,size_bytes,
          storage_scope,storage_key,status,library_owned"#,
      )
      .bind(artifact_id)
      .fetch_optional(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("lock unreferenced artifact failed", error))?
      else {
        continue;
      };
      sqlx::query(
        r#"UPDATE embedding_sources SET deleted_at=now(),updated_at=now()
        WHERE workspace_id=$1 AND source_kind='artifact' AND source_key=$2 AND deleted_at IS NULL"#,
      )
      .bind(&row.workspace_id)
      .bind(row.id.to_string())
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("tombstone artifact embedding source failed", error))?;
      transaction
        .commit()
        .await
        .map_err(|error| RuntimeError::database("claim artifact cleanup failed", error))?;
      if row.storage_scope == StorageScope::Copilot.as_str() {
        self.storage.delete(&locator_from_row(&row)?).await?;
      }
      removed += sqlx::query("DELETE FROM workspace_artifacts WHERE id=$1 AND status='deleting'")
        .bind(row.id)
        .execute(&self.pool)
        .await
        .map_err(|error| RuntimeError::database("finish artifact cleanup failed", error))?
        .rows_affected() as i64;
    }
    Ok(removed)
  }

  pub(super) async fn set_library_owned(
    &self,
    workspace_id: &str,
    artifact_id: &str,
    library_owned: bool,
    display_name: Option<String>,
  ) -> RuntimeResult<types::RuntimeWorkspaceArtifact> {
    let artifact_id = Uuid::parse_str(artifact_id).map_err(|_| RuntimeError::invalid_input("artifact_id_invalid"))?;
    let current = sqlx::query_as::<_, ArtifactRow>(
      r#"SELECT id,workspace_id,content_hash,display_name,file_name,canonical_media_type,size_bytes,
        storage_scope,storage_key,status,library_owned
      FROM workspace_artifacts WHERE workspace_id=$1 AND id=$2 AND status='ready'"#,
    )
    .bind(workspace_id)
    .bind(artifact_id)
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load artifact library ownership failed", error))?
    .ok_or_else(|| RuntimeError::invalid_input("artifact_not_found"))?;
    validate_library_display_name(
      library_owned,
      display_name.as_deref().or(current.display_name.as_deref()),
    )?;
    sqlx::query_as::<_, ArtifactRow>(
      r#"UPDATE workspace_artifacts SET library_owned=$3,
        display_name=CASE WHEN $3 THEN coalesce($4,display_name) ELSE display_name END,
        updated_at=now()
      WHERE workspace_id=$1 AND id=$2 AND status='ready'
      RETURNING id,workspace_id,content_hash,display_name,file_name,canonical_media_type,size_bytes,
        storage_scope,storage_key,status,library_owned"#,
    )
    .bind(workspace_id)
    .bind(artifact_id)
    .bind(library_owned)
    .bind(display_name)
    .fetch_one(&self.pool)
    .await
    .map(Into::into)
    .map_err(|error| match error {
      sqlx::Error::RowNotFound => RuntimeError::invalid_input("artifact_not_found"),
      error => RuntimeError::database("update artifact library ownership failed", error),
    })
  }

  async fn reserve(&self, input: ArtifactReservation<'_>) -> RuntimeResult<ArtifactRow> {
    sqlx::query_as::<_, ArtifactRow>(
      r#"INSERT INTO workspace_artifacts(
        id,workspace_id,content_hash,display_name,file_name,canonical_media_type,size_bytes,storage_scope,storage_key,status,
        library_owned,reservation_expires_at,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserving',$10,now()+interval '24 hours',now(),now())
      ON CONFLICT(workspace_id,content_hash) DO UPDATE SET
        library_owned=workspace_artifacts.library_owned OR EXCLUDED.library_owned,
        display_name=CASE
          WHEN EXCLUDED.library_owned AND EXCLUDED.display_name IS NOT NULL THEN EXCLUDED.display_name
          ELSE coalesce(workspace_artifacts.display_name,EXCLUDED.display_name)
        END,
        file_name=coalesce(workspace_artifacts.file_name,EXCLUDED.file_name),
        reservation_expires_at=CASE WHEN workspace_artifacts.status='ready' THEN NULL ELSE EXCLUDED.reservation_expires_at END,
        updated_at=now()
      WHERE workspace_artifacts.status<>'deleting'
      RETURNING id,workspace_id,content_hash,display_name,file_name,canonical_media_type,size_bytes,storage_scope,storage_key,status,library_owned"#,
    )
    .bind(Uuid::new_v4())
    .bind(input.workspace_id)
    .bind(input.content_hash)
    .bind(input.display_name)
    .bind(input.file_name)
    .bind(input.media_type)
    .bind(input.size)
    .bind(input.locator.scope.as_str())
    .bind(input.locator.key.as_str())
    .bind(input.library_owned)
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("reserve workspace artifact failed", error))?
    .ok_or_else(|| RuntimeError::invalid_state("artifact_deleting_retry"))
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
    let updated = sqlx::query(
      r#"UPDATE workspace_artifacts SET status='ready',ready_at=coalesce(ready_at,now()),
        reservation_expires_at=NULL,updated_at=now()
      WHERE workspace_id=$1 AND content_hash=$2 AND storage_scope=$3 AND storage_key=$4
        AND status='reserving'"#,
    )
    .bind(workspace_id)
    .bind(content_hash)
    .bind(locator.scope.as_str())
    .bind(locator.key.as_str())
    .execute(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("complete workspace artifact failed", error))?;
    if updated.rows_affected() != 1 {
      return Err(RuntimeError::invalid_state("artifact_reservation_changed"));
    }
    Ok(())
  }

  async fn get(&self, workspace_id: &str, content_hash: &str) -> RuntimeResult<types::RuntimeWorkspaceArtifact> {
    sqlx::query_as::<_, ArtifactRow>(
      r#"SELECT id,workspace_id,content_hash,display_name,file_name,canonical_media_type,size_bytes,storage_scope,storage_key,status,library_owned
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

fn validate_library_display_name(library_owned: bool, display_name: Option<&str>) -> RuntimeResult<()> {
  if library_owned && display_name.is_none_or(|name| name.trim().is_empty()) {
    return Err(RuntimeError::invalid_input("artifact_library_display_name_required"));
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
      display_name: row.display_name,
      file_name: row.file_name,
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
