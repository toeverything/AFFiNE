use std::{
  collections::HashMap,
  sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
  },
};

use chrono::NaiveDateTime;
use napi::{
  bindgen_prelude::{Error as NapiError, Result, Uint8Array},
  threadsafe_function::ThreadsafeFunction,
};
use napi_derive::napi;
use once_cell::sync::Lazy;
use tokio::sync::RwLock;

mod frontmatter;
mod root_meta;
mod session;
mod state_db;
mod types;
mod utils;

#[cfg(test)]
mod tests;

use session::DiskSession;

static SESSIONS: Lazy<RwLock<HashMap<String, Arc<DiskSession>>>> = Lazy::new(|| RwLock::new(HashMap::new()));
static NEXT_SUBSCRIBER_ID: AtomicU64 = AtomicU64::new(1);

#[napi(object)]
pub struct DiskSessionOptions {
  pub workspace_id: String,
  pub sync_folder: String,
}

#[napi(object)]
pub struct DiskDocUpdateInput {
  pub doc_id: String,
  #[napi(ts_type = "Uint8Array")]
  pub bin: Uint8Array,
  pub editor: Option<String>,
}

#[napi(object)]
pub struct DiskDocClock {
  pub doc_id: String,
  pub timestamp: NaiveDateTime,
  pub review_required: Option<String>,
  pub export_error: Option<String>,
}

#[napi(object)]
pub struct DiskSyncDocUpdateEvent {
  pub doc_id: String,
  pub bin: Uint8Array,
  pub timestamp: NaiveDateTime,
  pub editor: Option<String>,
}

impl Clone for DiskSyncDocUpdateEvent {
  fn clone(&self) -> Self {
    Self {
      doc_id: self.doc_id.clone(),
      bin: Uint8Array::new(self.bin.as_ref().to_vec()),
      timestamp: self.timestamp,
      editor: self.editor.clone(),
    }
  }
}

#[derive(Clone)]
#[napi(object)]
pub struct DiskSyncEvent {
  pub r#type: String,
  pub update: Option<DiskSyncDocUpdateEvent>,
  pub doc_id: Option<String>,
  pub timestamp: Option<NaiveDateTime>,
  pub origin: Option<String>,
  pub message: Option<String>,
}

#[derive(Default)]
#[napi]
pub struct DiskSync;

#[napi]
pub struct DiskSyncSubscriber {
  session_id: String,
  subscriber_id: u64,
}

#[napi]
impl DiskSync {
  #[napi(constructor)]
  pub fn new() -> Self {
    Self
  }

  #[napi]
  pub async fn start_session(&self, session_id: String, options: DiskSessionOptions) -> Result<()> {
    {
      let sessions = SESSIONS.read().await;
      if sessions.contains_key(&session_id) {
        return Ok(());
      }
    }

    let session = DiskSession::new(options).await.map_err(to_napi_error)?;
    session.replay_pending_updates().await.map_err(to_napi_error)?;
    session.scan_once().await.map_err(to_napi_error)?;

    let mut sessions = SESSIONS.write().await;
    sessions.insert(session_id, Arc::new(session));
    Ok(())
  }

  #[napi]
  pub async fn stop_session(&self, session_id: String) -> Result<()> {
    let mut sessions = SESSIONS.write().await;
    if let Some(session) = sessions.remove(&session_id) {
      session.close().await;
    }
    Ok(())
  }

  #[napi]
  pub async fn apply_local_update(&self, session_id: String, update: DiskDocUpdateInput) -> Result<DiskDocClock> {
    let session = {
      let sessions = SESSIONS.read().await;
      sessions
        .get(&session_id)
        .cloned()
        .ok_or_else(|| to_napi_error(format!("disk session {} is not started", session_id)))?
    };

    session.apply_local_update(update).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn acknowledge_source_update(
    &self,
    session_id: String,
    doc_id: String,
    snapshot: Uint8Array,
  ) -> Result<()> {
    let session = {
      let sessions = SESSIONS.read().await;
      sessions
        .get(&session_id)
        .cloned()
        .ok_or_else(|| to_napi_error(format!("disk session {} is not started", session_id)))?
    };
    session
      .acknowledge_source_update(&doc_id, snapshot.as_ref())
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn prepare_source_doc(
    &self,
    session_id: String,
    doc_id: String,
    local_snapshot: Option<Uint8Array>,
    local_root: Option<Uint8Array>,
  ) -> Result<Option<Uint8Array>> {
    let session = {
      let sessions = SESSIONS.read().await;
      sessions
        .get(&session_id)
        .cloned()
        .ok_or_else(|| to_napi_error(format!("disk session {} is not started", session_id)))?
    };
    session
      .prepare_source_doc(&doc_id, local_snapshot.as_deref(), local_root.as_deref())
      .await
      .map(|snapshot| snapshot.map(Uint8Array::new))
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn subscribe_events(
    &self,
    session_id: String,
    callback: ThreadsafeFunction<DiskSyncEvent, ()>,
  ) -> Result<DiskSyncSubscriber> {
    let session = {
      let sessions = SESSIONS.read().await;
      sessions
        .get(&session_id)
        .cloned()
        .ok_or_else(|| to_napi_error(format!("disk session {} is not started", session_id)))?
    };

    let subscriber_id = NEXT_SUBSCRIBER_ID.fetch_add(1, Ordering::Relaxed);
    session
      .add_subscriber(subscriber_id, callback)
      .await
      .map_err(to_napi_error)?;

    Ok(DiskSyncSubscriber {
      session_id,
      subscriber_id,
    })
  }
}

#[cfg(test)]
impl DiskSync {
  pub async fn pull_events(&self, session_id: String) -> Result<Vec<DiskSyncEvent>> {
    let session = {
      let sessions = SESSIONS.read().await;
      sessions
        .get(&session_id)
        .cloned()
        .ok_or_else(|| to_napi_error(format!("disk session {} is not started", session_id)))?
    };
    session.pull_events().await.map_err(to_napi_error)
  }
}

#[napi]
impl DiskSyncSubscriber {
  #[napi]
  pub async fn unsubscribe(&self) -> Result<()> {
    let session = {
      let sessions = SESSIONS.read().await;
      sessions.get(&self.session_id).cloned()
    };

    if let Some(session) = session {
      session.remove_subscriber(self.subscriber_id).await;
    }

    Ok(())
  }
}

fn to_napi_error(message: impl Into<String>) -> NapiError {
  NapiError::from_reason(message.into())
}
