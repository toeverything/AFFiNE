use std::{
  sync::Arc,
  time::{Duration, Instant},
};

use napi::bindgen_prelude::Buffer;
use tokio::sync::Mutex;
use uuid::Uuid;

use super::{BlobAccessService, STREAM_CHUNK_BYTES, SourceIdentity};
use crate::runtime::{
  RuntimeError, RuntimeResult,
  object_storage::types::{ObjectKey, ObjectLocator, StorageScope},
};

const STREAM_TTL: Duration = Duration::from_secs(60);
#[cfg(not(test))]
const STREAM_CLEANUP_INTERVAL: Duration = Duration::from_secs(15);
#[cfg(test)]
const STREAM_CLEANUP_INTERVAL: Duration = Duration::from_millis(10);

fn ensure_stream_capacity(active: usize) -> RuntimeResult<()> {
  if active >= super::MAX_ACTIVE_STREAMS {
    return Err(RuntimeError::invalid_state("blob_stream_limit"));
  }
  Ok(())
}

#[napi_derive::napi(object)]
pub struct RuntimeAuthorizedBlobV1 {
  pub stream_id: String,
  pub mime: String,
  pub size: i64,
  pub last_modified_ms: i64,
}

#[napi_derive::napi(object)]
pub struct RuntimeBlobChunkV1 {
  pub body: Buffer,
  pub done: bool,
}

pub(super) struct BlobStream {
  actor_user_id: Option<String>,
  source: SourceIdentity,
  stamp: String,
  key: String,
  locator: ObjectLocator,
  offset: u64,
  size: u64,
  last_access: Instant,
}

impl BlobAccessService {
  pub(in crate::runtime::backend_runtime) fn start_stream_cleanup(self: &Arc<Self>) {
    let service = Arc::downgrade(self);
    tokio::spawn(async move {
      let mut interval = tokio::time::interval(STREAM_CLEANUP_INTERVAL);
      loop {
        interval.tick().await;
        let Some(service) = service.upgrade() else {
          break;
        };
        service.expire_streams().await;
      }
    });
  }

  pub(super) async fn open_read(
    &self,
    actor_user_id: Option<&str>,
    source: SourceIdentity,
    key: String,
  ) -> RuntimeResult<RuntimeAuthorizedBlobV1> {
    let loaded = self.authorize_and_load(actor_user_id, source).await?;
    let refs = self
      .cache
      .refs(loaded.clone(), || {
        self.confirm_source(actor_user_id, &loaded.identity, &loaded.stamp)
      })
      .await?;
    if refs.binary_search_by(|candidate| candidate.as_ref().cmp(&key)).is_err() {
      return Err(RuntimeError::invalid_input("blob_not_referenced"));
    }
    let verified_key = [key.clone().into_boxed_str()];
    let metadata = self
      .verify_and_metadata(
        actor_user_id,
        &loaded.identity,
        &loaded.stamp,
        &verified_key,
        None,
        None,
      )
      .await?;
    if metadata.len() != 1 {
      return Err(RuntimeError::invalid_input("blob_not_completed"));
    }
    let locator = ObjectLocator::new(
      StorageScope::Blob,
      ObjectKey::new(format!("{}/{key}", loaded.identity.workspace_id()))?,
    );
    let object = self
      .storage
      .head(&locator)
      .await?
      .ok_or_else(|| RuntimeError::invalid_input("blob_object_not_found"))?;
    let final_metadata = self
      .verify_and_metadata(
        actor_user_id,
        &loaded.identity,
        &loaded.stamp,
        &verified_key,
        None,
        None,
      )
      .await?;
    if final_metadata.len() != 1 {
      return Err(RuntimeError::invalid_input("blob_not_completed"));
    }
    if object.content_length != final_metadata[0].size {
      return Err(RuntimeError::invalid_state("blob_object_size_mismatch"));
    }
    let size =
      u64::try_from(final_metadata[0].size).map_err(|_| RuntimeError::invalid_state("blob_object_size_invalid"))?;
    let stream_id = Uuid::new_v4();
    self.expire_streams().await;
    let mut streams = self.streams.lock().await;
    ensure_stream_capacity(streams.len())?;
    streams.insert(
      stream_id,
      Arc::new(Mutex::new(BlobStream {
        actor_user_id: actor_user_id.map(str::to_string),
        source: loaded.identity,
        stamp: loaded.stamp,
        key,
        locator,
        offset: 0,
        size,
        last_access: Instant::now(),
      })),
    );
    drop(streams);
    Ok(RuntimeAuthorizedBlobV1 {
      stream_id: stream_id.to_string(),
      mime: final_metadata[0].mime.clone(),
      size: final_metadata[0].size,
      last_modified_ms: object.last_modified_ms,
    })
  }

  pub(super) async fn read_chunk(&self, stream_id: Uuid) -> RuntimeResult<RuntimeBlobChunkV1> {
    let stream = self
      .streams
      .lock()
      .await
      .get(&stream_id)
      .cloned()
      .ok_or_else(|| RuntimeError::invalid_input("blob_stream_not_found"))?;
    let mut stream = stream.lock().await;
    if stream.last_access.elapsed() >= STREAM_TTL {
      drop(stream);
      self.streams.lock().await.remove(&stream_id);
      return Err(RuntimeError::invalid_input("blob_stream_expired"));
    }
    if stream.offset >= stream.size {
      drop(stream);
      self.streams.lock().await.remove(&stream_id);
      return Ok(RuntimeBlobChunkV1 {
        body: Vec::new().into(),
        done: true,
      });
    }
    let remaining = usize::try_from(stream.size - stream.offset).unwrap_or(usize::MAX);
    let length = remaining.min(STREAM_CHUNK_BYTES);
    let verified_key = [stream.key.clone().into_boxed_str()];
    let metadata = self
      .verify_and_metadata(
        stream.actor_user_id.as_deref(),
        &stream.source,
        &stream.stamp,
        &verified_key,
        None,
        None,
      )
      .await?;
    if metadata.len() != 1 || metadata[0].size != stream.size as i64 {
      return Err(RuntimeError::invalid_input("blob_not_completed"));
    }
    let body = self
      .storage
      .get_range(&stream.locator, stream.offset, length)
      .await?
      .ok_or_else(|| RuntimeError::invalid_input("blob_object_not_found"))?;
    if body.is_empty() || body.len() > length {
      return Err(RuntimeError::invalid_state("blob_stream_range_invalid"));
    }
    let metadata = self
      .verify_and_metadata(
        stream.actor_user_id.as_deref(),
        &stream.source,
        &stream.stamp,
        &verified_key,
        None,
        None,
      )
      .await?;
    if metadata.len() != 1 || metadata[0].size != stream.size as i64 {
      return Err(RuntimeError::invalid_input("blob_not_completed"));
    }
    stream.offset += body.len() as u64;
    stream.last_access = Instant::now();
    let done = stream.offset >= stream.size;
    drop(stream);
    if done {
      self.streams.lock().await.remove(&stream_id);
    }
    Ok(RuntimeBlobChunkV1 {
      body: body.into(),
      done,
    })
  }

  async fn expire_streams(&self) {
    let entries = self
      .streams
      .lock()
      .await
      .iter()
      .map(|(id, stream)| (*id, Arc::clone(stream)))
      .collect::<Vec<_>>();
    for (id, stream) in entries {
      let Ok(stream_guard) = stream.try_lock() else {
        continue;
      };
      if stream_guard.last_access.elapsed() < STREAM_TTL {
        continue;
      }
      let mut streams = self.streams.lock().await;
      if streams.get(&id).is_some_and(|current| Arc::ptr_eq(current, &stream)) {
        streams.remove(&id);
      }
    }
  }

  #[cfg(test)]
  pub(super) async fn age_stream(&self, stream_id: Uuid, age: Duration) {
    if let Some(stream) = self.streams.lock().await.get(&stream_id).cloned() {
      stream.lock().await.last_access = Instant::now() - age;
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn active_stream_admission_is_bounded() {
    assert!(ensure_stream_capacity(super::super::MAX_ACTIVE_STREAMS - 1).is_ok());
    assert_eq!(
      ensure_stream_capacity(super::super::MAX_ACTIVE_STREAMS)
        .unwrap_err()
        .to_string(),
      "blob_stream_limit"
    );
  }
}
