//! Canonical invalidation and event-bus publisher traits plus Redis Pub/Sub
//! implementations matching `v0.27.5` wire envelopes 1:1.

use std::time::Duration;

use redis::aio::MultiplexedConnection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use server_types::DomainError;
use tokio::sync::Mutex;
use uuid::Uuid;

pub const INVALIDATION_CHANNEL_V1: &str = "affine:backend-runtime:invalidation:v1";
pub const EVENTBUS_CHANNEL_V1: &str = "affine:eventbus:v1";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const PUBLISH_TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobSourceRef {
  #[serde(rename = "type")]
  pub kind: String,
  pub workspace_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub doc_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InvalidationHintV1 {
  WorkspaceInventoryChanged {
    workspace_id: String,
    doc_id: Option<String>,
  },
  QuotaSeatUsage {
    workspace_id: String,
  },
  QuotaStorageUsage {
    subject: String,
  },
  QuotaOwnerMapping {
    workspace_id: String,
  },
  BlobSource {
    source: BlobSourceRef,
  },
}

impl InvalidationHintV1 {
  pub fn to_json_value(&self) -> Value {
    match self {
      Self::WorkspaceInventoryChanged { workspace_id, doc_id } => {
        let mut obj = serde_json::Map::new();
        if let Some(doc_id) = doc_id {
          obj.insert("docId".to_owned(), Value::String(doc_id.clone()));
        }
        obj.insert("kind".to_owned(), Value::String("workspaceInventoryChanged".to_owned()));
        obj.insert("version".to_owned(), Value::from(1));
        obj.insert("workspaceId".to_owned(), Value::String(workspace_id.clone()));
        Value::Object(obj)
      }
      Self::QuotaSeatUsage { workspace_id } => serde_json::json!({
        "kind": "quotaSeatUsage",
        "version": 1,
        "workspaceId": workspace_id,
      }),
      Self::QuotaStorageUsage { subject } => serde_json::json!({
        "kind": "quotaStorageUsage",
        "subject": subject,
        "version": 1,
      }),
      Self::QuotaOwnerMapping { workspace_id } => serde_json::json!({
        "kind": "quotaOwnerMapping",
        "version": 1,
        "workspaceId": workspace_id,
      }),
      Self::BlobSource { source } => serde_json::json!({
        "kind": "blobSource",
        "source": source,
        "version": 1,
      }),
    }
  }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventBusEnvelopeV1 {
  pub v: u32,
  pub id: String,
  pub event: String,
  pub origin_id: String,
  pub origin_channel: String,
  pub request_id: Option<String>,
  pub payload: Value,
}

#[async_trait::async_trait]
pub trait InvalidationPublisher: Send + Sync + 'static {
  async fn publish_invalidation(&self, hint: &InvalidationHintV1) -> Result<(), DomainError>;
}

#[async_trait::async_trait]
pub trait EventBusPublisher: Send + Sync + 'static {
  async fn publish_event(
    &self,
    event: &str,
    payload: Value,
    request_id: Option<&str>,
  ) -> Result<EventBusEnvelopeV1, DomainError>;
}

/// No-op publisher for offline tests or configurations without Redis.
#[derive(Clone, Debug)]
pub struct NoopEventPublisher {
  origin_id: String,
  origin_channel: String,
}

impl Default for NoopEventPublisher {
  fn default() -> Self {
    Self {
      origin_id: Uuid::new_v4().to_string(),
      origin_channel: "production".to_owned(),
    }
  }
}

#[async_trait::async_trait]
impl InvalidationPublisher for NoopEventPublisher {
  async fn publish_invalidation(&self, _hint: &InvalidationHintV1) -> Result<(), DomainError> {
    Ok(())
  }
}

#[async_trait::async_trait]
impl EventBusPublisher for NoopEventPublisher {
  async fn publish_event(
    &self,
    event: &str,
    payload: Value,
    request_id: Option<&str>,
  ) -> Result<EventBusEnvelopeV1, DomainError> {
    Ok(EventBusEnvelopeV1 {
      v: 1,
      id: format!("eb_{}", Uuid::new_v4()),
      event: event.to_owned(),
      origin_id: self.origin_id.clone(),
      origin_channel: self.origin_channel.clone(),
      request_id: request_id.map(str::to_owned),
      payload,
    })
  }
}

/// Redis Pub/Sub implementation of [`InvalidationPublisher`] and
/// [`EventBusPublisher`].
pub struct RedisEventPublisher {
  client: redis::Client,
  conn: Mutex<Option<MultiplexedConnection>>,
  origin_id: String,
  origin_channel: String,
}

impl RedisEventPublisher {
  pub fn new(redis_url: &str, origin_channel: impl Into<String>) -> Result<Self, DomainError> {
    let client =
      redis::Client::open(redis_url).map_err(|e| DomainError::Validation(format!("invalid redis URL: {e}")))?;
    Ok(Self {
      client,
      conn: Mutex::new(None),
      origin_id: Uuid::new_v4().to_string(),
      origin_channel: origin_channel.into(),
    })
  }

  pub fn origin_id(&self) -> &str {
    &self.origin_id
  }

  pub fn origin_channel(&self) -> &str {
    &self.origin_channel
  }

  async fn publish_raw(&self, channel: &str, payload: &str) -> Result<(), DomainError> {
    let mut guard = self.conn.lock().await;
    if guard.is_none() {
      let connected = tokio::time::timeout(CONNECT_TIMEOUT, self.client.get_multiplexed_async_connection())
        .await
        .map_err(|_| DomainError::Unavailable("redis publisher connect timed out".to_owned()))?
        .map_err(|e| DomainError::Unavailable(format!("redis publisher connect failed: {e}")))?;
      *guard = Some(connected);
    }
    let Some(connection) = guard.as_mut() else {
      return Err(DomainError::Unavailable("redis publisher unavailable".to_owned()));
    };
    let res = tokio::time::timeout(
      PUBLISH_TIMEOUT,
      redis::cmd("PUBLISH")
        .arg(channel)
        .arg(payload)
        .query_async::<i64>(connection),
    )
    .await;
    match res {
      Ok(Ok(_)) => Ok(()),
      Ok(Err(e)) => {
        guard.take();
        Err(DomainError::Unavailable(format!("redis publish failed: {e}")))
      }
      Err(_) => {
        guard.take();
        Err(DomainError::Unavailable("redis publish timed out".to_owned()))
      }
    }
  }
}

#[async_trait::async_trait]
impl InvalidationPublisher for RedisEventPublisher {
  async fn publish_invalidation(&self, hint: &InvalidationHintV1) -> Result<(), DomainError> {
    let payload = serde_json::to_string(&hint.to_json_value())
      .map_err(|e| DomainError::Internal(format!("encode invalidation hint: {e}")))?;
    self.publish_raw(INVALIDATION_CHANNEL_V1, &payload).await
  }
}

#[async_trait::async_trait]
impl EventBusPublisher for RedisEventPublisher {
  async fn publish_event(
    &self,
    event: &str,
    payload: Value,
    request_id: Option<&str>,
  ) -> Result<EventBusEnvelopeV1, DomainError> {
    let envelope = EventBusEnvelopeV1 {
      v: 1,
      id: format!("eb_{}", Uuid::new_v4()),
      event: event.to_owned(),
      origin_id: self.origin_id.clone(),
      origin_channel: self.origin_channel.clone(),
      request_id: request_id.map(str::to_owned),
      payload,
    };
    let encoded =
      serde_json::to_string(&envelope).map_err(|e| DomainError::Internal(format!("encode eventbus envelope: {e}")))?;
    self.publish_raw(EVENTBUS_CHANNEL_V1, &encoded).await?;
    Ok(envelope)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn workspace_inventory_invalidation_matches_v0275_wire_format() {
    let hint = InvalidationHintV1::WorkspaceInventoryChanged {
      workspace_id: "ws-1".to_owned(),
      doc_id: None,
    };
    assert_eq!(
      hint.to_json_value(),
      serde_json::json!({
        "kind": "workspaceInventoryChanged",
        "version": 1,
        "workspaceId": "ws-1",
      })
    );
  }
}
