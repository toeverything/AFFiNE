use affine_core::access_control::{StorageIntegrityError, validate_storage_object};
use uuid::Uuid;

use super::{
  super::{BackendRuntime, RuntimeError, RuntimeResult},
  storage::storage_resource,
};
use crate::runtime::{
  object_storage::types::{ObjectKey, ObjectLocator, ObjectPutMetadata, StorageScope},
  types::RuntimeStorageReservationMutation,
};

pub(super) async fn promote_storage_object(
  runtime: &BackendRuntime,
  input: &RuntimeStorageReservationMutation,
  reservation_id: Uuid,
) -> RuntimeResult<(crate::runtime::object_storage::types::ObjectMetadata, ObjectLocator)> {
  let storage = runtime.object_storage()?;
  let final_locator = final_storage_locator(&input.kind, &input.workspace_id, input.doc_id.as_deref(), &input.key)?;
  let temporary_locator = temporary_storage_locator(
    &input.kind,
    &input.workspace_id,
    input.doc_id.as_deref(),
    &input.key,
    reservation_id,
  )?;
  let temporary = storage.get(&temporary_locator).await?;
  let object = match temporary {
    Some(object) => {
      validate_promoted_object(input, &object.body, &object.metadata)?;
      if let Some(existing) = storage.get(&final_locator).await? {
        validate_promoted_object(input, &existing.body, &existing.metadata)?;
        if existing.body != object.body {
          return Err(RuntimeError::invalid_input("storage final object collision"));
        }
        existing
      } else {
        let metadata = storage
          .put(
            &final_locator,
            object.body.clone(),
            ObjectPutMetadata {
              content_type: Some(object.metadata.content_type),
              content_length: Some(object.metadata.content_length),
              checksum_crc32: object.metadata.checksum_crc32,
            },
          )
          .await?;
        crate::runtime::object_storage::types::ObjectGetResult {
          body: object.body,
          metadata,
        }
      }
    }
    None => storage
      .get(&final_locator)
      .await?
      .ok_or_else(|| RuntimeError::invalid_input("storage object not found"))?,
  };
  validate_promoted_object(input, &object.body, &object.metadata)?;
  Ok((object.metadata, temporary_locator))
}

fn validate_promoted_object(
  input: &RuntimeStorageReservationMutation,
  body: &[u8],
  metadata: &crate::runtime::object_storage::types::ObjectMetadata,
) -> RuntimeResult<()> {
  validate_storage_object(
    storage_resource(&input.kind)?,
    &input.key,
    body,
    input.size,
    input.mime.as_deref(),
    metadata.content_length,
    &metadata.content_type,
  )
  .map_err(|error| {
    RuntimeError::invalid_input(match error {
      StorageIntegrityError::MetadataMismatch => "storage object metadata mismatch",
      StorageIntegrityError::ChecksumMismatch => "storage object checksum mismatch",
    })
  })
}

pub(super) fn temporary_storage_locator(
  kind: &str,
  workspace_id: &str,
  doc_id: Option<&str>,
  key: &str,
  reservation_id: Uuid,
) -> RuntimeResult<ObjectLocator> {
  let path = if kind == "blob" {
    format!("{workspace_id}/.reservations/{reservation_id}/{key}")
  } else {
    format!(
      "comment-attachments/{}/{}/.reservations/{reservation_id}/{}",
      workspace_id,
      doc_id.unwrap_or_default(),
      key
    )
  };
  Ok(ObjectLocator::new(StorageScope::Blob, ObjectKey::new(path)?))
}

pub(super) fn final_storage_locator(
  kind: &str,
  workspace_id: &str,
  doc_id: Option<&str>,
  key: &str,
) -> RuntimeResult<ObjectLocator> {
  let path = if kind == "blob" {
    format!("{workspace_id}/{key}")
  } else {
    format!(
      "comment-attachments/{}/{}/{}",
      workspace_id,
      doc_id.unwrap_or_default(),
      key
    )
  };
  Ok(ObjectLocator::new(StorageScope::Blob, ObjectKey::new(path)?))
}

#[cfg(test)]
mod tests {
  use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
  use sha2::{Digest, Sha256};

  use super::*;

  #[tokio::test]
  async fn promotes_valid_blob_and_rejects_late_overwrite() {
    let temp = tempfile::tempdir().unwrap();
    let runtime = BackendRuntime::new(None, None, None, None, None).unwrap();
    runtime
      .configure_object_storage(format!(
        r#"{{"storages":{{"blob.storage":{{"provider":"fs","bucket":"promotion","config":{{"path":{}}}}}}}}}"#,
        serde_json::to_string(temp.path()).unwrap()
      ))
      .unwrap();
    let body = b"immutable blob".to_vec();
    let key = URL_SAFE_NO_PAD.encode(Sha256::digest(&body));
    let reservation_id = Uuid::new_v4();
    let input = RuntimeStorageReservationMutation {
      workspace_id: "workspace".to_string(),
      user_id: "user".to_string(),
      key: key.clone(),
      reservation_id: reservation_id.to_string(),
      kind: "blob".to_string(),
      doc_id: None,
      size: Some(i64::try_from(body.len()).unwrap()),
      mime: Some("text/plain".to_string()),
    };
    let temporary = temporary_storage_locator("blob", "workspace", None, &key, reservation_id).unwrap();
    let storage = runtime.object_storage().unwrap();
    storage
      .put(
        &temporary,
        body.clone(),
        ObjectPutMetadata {
          content_type: Some("application/octet-stream".to_string()),
          content_length: Some(i64::try_from(body.len()).unwrap()),
          checksum_crc32: None,
        },
      )
      .await
      .unwrap();
    assert!(
      promote_storage_object(&runtime, &input, reservation_id)
        .await
        .unwrap_err()
        .to_string()
        .contains("storage object metadata mismatch")
    );
    storage
      .put(
        &temporary,
        body.clone(),
        ObjectPutMetadata {
          content_type: Some("text/plain".to_string()),
          content_length: Some(i64::try_from(body.len()).unwrap()),
          checksum_crc32: None,
        },
      )
      .await
      .unwrap();

    let (_, promoted_temporary) = promote_storage_object(&runtime, &input, reservation_id).await.unwrap();
    assert_eq!(promoted_temporary, temporary);
    storage.delete(&temporary).await.unwrap();
    let final_locator = final_storage_locator("blob", "workspace", None, &key).unwrap();
    assert_eq!(storage.get(&final_locator).await.unwrap().unwrap().body, body);

    let late = b"late overwrite".to_vec();
    storage
      .put(
        &temporary,
        late.clone(),
        ObjectPutMetadata {
          content_type: Some("text/plain".to_string()),
          content_length: Some(i64::try_from(late.len()).unwrap()),
          checksum_crc32: None,
        },
      )
      .await
      .unwrap();
    let mut late_input = input;
    late_input.size = Some(i64::try_from(late.len()).unwrap());
    assert!(
      promote_storage_object(&runtime, &late_input, reservation_id)
        .await
        .unwrap_err()
        .to_string()
        .contains("storage object checksum mismatch")
    );
    assert_eq!(storage.get(&final_locator).await.unwrap().unwrap().body, body);
  }
}
