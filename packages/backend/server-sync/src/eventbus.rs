//! Bidirectional Redis Pub/Sub bridge for `affine:eventbus:v1` and
//! `affine:backend-runtime:invalidation:v1`, plus multi-replica online user
//! deduplication for `sync_active_users_minutely`.

use std::{
  collections::{HashMap, HashSet},
  num::NonZeroUsize,
  sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  },
  time::{Duration, SystemTime, UNIX_EPOCH},
};

use futures_util::StreamExt;
use lru::LruCache;
use redis::{AsyncCommands, aio::MultiplexedConnection};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::{
  sync::{Mutex, broadcast},
  task::JoinHandle,
};
use tracing::{debug, warn};
use uuid::Uuid;

use crate::protocol::SpaceType;

pub const EVENTBUS_CHANNEL_V1: &str = "affine:eventbus:v1";
pub const INVALIDATION_CHANNEL_V1: &str = "affine:backend-runtime:invalidation:v1";
const REPLICA_ACTIVE_USERS_HASH: &str = "v2:sync:active_users";
const REPLICA_ACTIVE_USERS_TTL_MS: i64 = 90_000;
const DEFAULT_DEDUP_CAPACITY: usize = 8192;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplicaPresenceRecord {
  updated_at_ms: i64,
  users: Vec<String>,
}

fn now_millis() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as i64
}

/// Exact wire envelope published on `affine:eventbus:v1`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventBusEnvelope {
  pub event: String,
  pub id: String,
  pub origin_channel: String,
  pub origin_id: String,
  pub payload: Value,
  pub request_id: Option<String>,
  pub v: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDocUpdatesPushedPayload {
  pub compressed: bool,
  pub doc_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub editor: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub origin_channel: Option<String>,
  pub space_id: String,
  pub space_type: SpaceType,
  pub timestamp: i64,
  pub updates: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPermissionsChangedPayload {
  pub space_type: SpaceType,
  pub space_id: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub doc_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncAwarenessEventPayload {
  pub space_type: SpaceType,
  pub space_id: String,
  pub doc_id: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub source_socket_id: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub awareness_update: Option<String>,
}

/// Incoming cluster events delivered to the local `SpaceSyncGateway`.
#[derive(Clone, Debug)]
pub enum ClusterSyncEvent {
  DocUpdatesPushed(SyncDocUpdatesPushedPayload),
  PermissionsChanged(SyncPermissionsChangedPayload),
  AwarenessCollect(SyncAwarenessEventPayload),
  AwarenessUpdated(SyncAwarenessEventPayload),
  WorkspaceInventoryChanged {
    workspace_id: String,
    doc_id: Option<String>,
  },
  /// Fired when the Redis pub/sub loop recovers from a disconnect so the
  /// gateway revalidates active document subscriptions before resuming fan-out.
  Reconnected,
}

/// Bounded LRU deduplicator + `originId` self-loop filter.
pub struct EventBusFilter {
  origin_id: String,
  seen: LruCache<String, ()>,
}

impl EventBusFilter {
  pub fn new(origin_id: String, capacity: usize) -> Self {
    let cap = NonZeroUsize::new(capacity.max(1)).expect("capacity >= 1");
    Self {
      origin_id,
      seen: LruCache::new(cap),
    }
  }

  /// Returns `true` if the envelope should be processed (not from self and not seen before).
  pub fn accept(&mut self, envelope: &EventBusEnvelope) -> bool {
    if envelope.origin_id == self.origin_id {
      return false;
    }
    if self.seen.contains(&envelope.id) {
      return false;
    }
    self.seen.put(envelope.id.clone(), ());
    true
  }
}

pub struct RedisSyncBridge {
  origin_id: String,
  origin_channel: String,
  client: Option<redis::Client>,
  publisher: Mutex<Option<MultiplexedConnection>>,
  incoming_tx: broadcast::Sender<ClusterSyncEvent>,
  shutdown: Arc<AtomicBool>,
  subscriber_task: Mutex<Option<JoinHandle<()>>>,
}

impl RedisSyncBridge {
  pub async fn start(redis_url: Option<&str>, origin_channel: impl Into<String>) -> Arc<Self> {
    Self::start_with_origin_id(redis_url, origin_channel, Uuid::new_v4().to_string()).await
  }

  pub async fn start_with_origin_id(
    redis_url: Option<&str>,
    origin_channel: impl Into<String>,
    origin_id: impl Into<String>,
  ) -> Arc<Self> {
    let origin_id = origin_id.into();
    let origin_channel = origin_channel.into();
    let client = redis_url.and_then(|url| redis::Client::open(url).ok());
    let (incoming_tx, _) = broadcast::channel(1024);

    let bridge = Arc::new(Self {
      origin_id,
      origin_channel,
      client,
      publisher: Mutex::new(None),
      incoming_tx,
      shutdown: Arc::new(AtomicBool::new(false)),
      subscriber_task: Mutex::new(None),
    });

    bridge.ensure_publisher().await;

    if let Some(ref client) = bridge.client {
      let client = client.clone();
      let origin_id = bridge.origin_id.clone();
      let incoming_tx = bridge.incoming_tx.clone();
      let shutdown = Arc::clone(&bridge.shutdown);
      let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
      let handle = tokio::spawn(async move {
        run_subscriber_loop(client, origin_id, incoming_tx, shutdown, Some(ready_tx)).await;
      });
      *bridge.subscriber_task.lock().await = Some(handle);
      let _ = tokio::time::timeout(Duration::from_secs(3), ready_rx).await;
    }

    bridge
  }

  pub fn origin_id(&self) -> &str {
    &self.origin_id
  }

  pub fn origin_channel(&self) -> &str {
    &self.origin_channel
  }

  pub fn subscribe(&self) -> broadcast::Receiver<ClusterSyncEvent> {
    self.incoming_tx.subscribe()
  }

  pub async fn stop(&self) {
    self.shutdown.store(true, Ordering::Release);
    if let Some(handle) = self.subscriber_task.lock().await.take() {
      handle.abort();
      let _ = handle.await;
    }
    if let Some(mut conn) = self.publisher.lock().await.take() {
      let _: Result<(), _> = conn.hdel(REPLICA_ACTIVE_USERS_HASH, &self.origin_id).await;
    }
  }

  async fn ensure_publisher(&self) -> Option<MultiplexedConnection> {
    {
      let guard = self.publisher.lock().await;
      if let Some(conn) = guard.as_ref() {
        return Some(conn.clone());
      }
    }
    let client = self.client.as_ref()?;
    match client.get_multiplexed_async_connection().await {
      Ok(conn) => {
        *self.publisher.lock().await = Some(conn.clone());
        Some(conn)
      }
      Err(err) => {
        warn!("server-sync Redis publisher connect failed: {err}");
        None
      }
    }
  }

  async fn publish_raw(&self, channel: &str, payload: &str) {
    let Some(mut conn) = self.ensure_publisher().await else {
      return;
    };
    if let Err(err) = conn.publish::<_, _, ()>(channel, payload).await {
      warn!("server-sync Redis publish to {channel} failed: {err}");
      self.publisher.lock().await.take();
    }
  }

  /// Stores this replica's active user IDs in a single Redis Hash
  /// `v2:sync:active_users` (field = `origin_id`, value = JSON `{updatedAtMs, users}`),
  /// prunes fields older than 90 s via `HDEL`, and returns the deduplicated
  /// union count across all live replicas.
  ///
  /// When Redis is not configured, returns `Some(local_user_ids.len())`.
  /// When Redis IS configured and any Redis operation fails, returns `None`
  /// so callers skip overwriting `sync_active_users_minutely` with a single-node
  /// fallback count.
  pub async fn sync_replica_active_users(&self, local_user_ids: &[String]) -> Option<usize> {
    if self.client.is_none() {
      return Some(local_user_ids.len());
    }
    let mut conn = self.ensure_publisher().await?;
    let now_ms = now_millis();
    if local_user_ids.is_empty() {
      if let Err(err) = conn.hdel::<_, _, ()>(REPLICA_ACTIVE_USERS_HASH, &self.origin_id).await {
        warn!("server-sync Redis hdel({REPLICA_ACTIVE_USERS_HASH}) failed: {err}");
        self.publisher.lock().await.take();
        return None;
      }
    } else if let Ok(serialized) = serde_json::to_string(&ReplicaPresenceRecord {
      updated_at_ms: now_ms,
      users: local_user_ids.to_vec(),
    }) && let Err(err) = conn
      .hset::<_, _, _, ()>(REPLICA_ACTIVE_USERS_HASH, &self.origin_id, serialized)
      .await
    {
      warn!("server-sync Redis hset({REPLICA_ACTIVE_USERS_HASH}) failed: {err}");
      self.publisher.lock().await.take();
      return None;
    }

    let entries: HashMap<String, String> = match conn.hgetall(REPLICA_ACTIVE_USERS_HASH).await {
      Ok(m) => m,
      Err(err) => {
        warn!("server-sync Redis hgetall({REPLICA_ACTIVE_USERS_HASH}) failed: {err}");
        self.publisher.lock().await.take();
        return None;
      }
    };

    let mut union = HashSet::new();
    let mut stale_entries: Vec<(String, String)> = Vec::new();
    for (field, raw) in entries {
      match serde_json::from_str::<ReplicaPresenceRecord>(&raw) {
        Ok(rec) if now_ms.saturating_sub(rec.updated_at_ms) <= REPLICA_ACTIVE_USERS_TTL_MS => {
          union.extend(rec.users);
        }
        _ => {
          stale_entries.push((field, raw));
        }
      }
    }
    if !stale_entries.is_empty() {
      let compare_and_hdel = redis::Script::new(
        "if redis.call('HGET', KEYS[1], ARGV[1]) == ARGV[2] then \
           return redis.call('HDEL', KEYS[1], ARGV[1]) \
         else \
           return 0 \
         end",
      );
      for (field, raw) in stale_entries {
        let _: Result<i32, _> = compare_and_hdel
          .key(REPLICA_ACTIVE_USERS_HASH)
          .arg(&field)
          .arg(&raw)
          .invoke_async(&mut conn)
          .await;
      }
    }
    Some(union.len())
  }

  pub fn build_envelope(&self, event: &str, payload: Value, request_id: Option<String>) -> EventBusEnvelope {
    EventBusEnvelope {
      event: event.to_owned(),
      id: format!("eb_{}", Uuid::new_v4()),
      origin_channel: self.origin_channel.clone(),
      origin_id: self.origin_id.clone(),
      payload,
      request_id,
      v: 1,
    }
  }

  pub async fn publish_event(&self, event: &str, payload: Value, request_id: Option<String>) {
    let envelope = self.build_envelope(event, payload, request_id);
    if let Ok(text) = serde_json::to_string(&envelope) {
      self.publish_raw(EVENTBUS_CHANNEL_V1, &text).await;
    }
  }

  #[allow(clippy::too_many_arguments)]
  pub async fn publish_doc_updates_pushed(
    &self,
    space_type: SpaceType,
    space_id: &str,
    doc_id: &str,
    updates: Vec<String>,
    timestamp: i64,
    editor: Option<String>,
    compressed: bool,
    request_id: String,
  ) {
    let payload = json!({
      "compressed": compressed,
      "docId": doc_id,
      "editor": editor,
      "originChannel": self.origin_channel,
      "spaceId": space_id,
      "spaceType": space_type.as_str(),
      "timestamp": timestamp,
      "updates": updates,
    });
    self
      .publish_event("sync.doc.updates.pushed", payload, Some(request_id))
      .await;
  }

  pub async fn publish_connection_disconnected(&self, connection_id: &str) {
    let payload = json!({
      "connectionId": connection_id,
    });
    self
      .publish_event("realtime.connection.disconnected", payload, None)
      .await;
  }

  pub async fn publish_workspace_inventory_changed(&self, workspace_id: &str, doc_id: Option<&str>) {
    let value = match doc_id {
      Some(doc_id) => json!({
        "docId": doc_id,
        "kind": "workspaceInventoryChanged",
        "version": 1,
        "workspaceId": workspace_id,
      }),
      None => json!({
        "kind": "workspaceInventoryChanged",
        "version": 1,
        "workspaceId": workspace_id,
      }),
    };
    if let Ok(text) = serde_json::to_string(&value) {
      self.publish_raw(INVALIDATION_CHANNEL_V1, &text).await;
    }
  }

  pub async fn publish_blob_source_current_doc(&self, workspace_id: &str, doc_id: &str) {
    let value = json!({
      "kind": "blobSource",
      "source": {
        "docId": doc_id,
        "type": "currentDoc",
        "workspaceId": workspace_id,
      },
      "version": 1,
    });
    if let Ok(text) = serde_json::to_string(&value) {
      self.publish_raw(INVALIDATION_CHANNEL_V1, &text).await;
    }
  }
}

async fn run_subscriber_loop(
  client: redis::Client,
  origin_id: String,
  incoming_tx: broadcast::Sender<ClusterSyncEvent>,
  shutdown: Arc<AtomicBool>,
  mut ready_tx: Option<tokio::sync::oneshot::Sender<()>>,
) {
  let mut filter = EventBusFilter::new(origin_id, DEFAULT_DEDUP_CAPACITY);
  let mut connected_once = false;

  while !shutdown.load(Ordering::Acquire) {
    let Ok(mut pubsub) = client.get_async_pubsub().await else {
      tokio::time::sleep(Duration::from_millis(200)).await;
      continue;
    };
    if pubsub.subscribe(EVENTBUS_CHANNEL_V1).await.is_err() || pubsub.subscribe(INVALIDATION_CHANNEL_V1).await.is_err()
    {
      tokio::time::sleep(Duration::from_millis(200)).await;
      continue;
    }
    if let Some(tx) = ready_tx.take() {
      let _ = tx.send(());
    }
    if connected_once {
      let _ = incoming_tx.send(ClusterSyncEvent::Reconnected);
    }
    connected_once = true;

    let mut stream = pubsub.on_message();
    while !shutdown.load(Ordering::Acquire) {
      let Some(msg) = stream.next().await else {
        break;
      };
      let channel = msg.get_channel_name();
      let Ok(raw) = msg.get_payload::<String>() else {
        continue;
      };

      if channel == EVENTBUS_CHANNEL_V1 {
        let Ok(envelope) = serde_json::from_str::<EventBusEnvelope>(&raw) else {
          debug!("ignoring malformed eventbus message");
          continue;
        };
        if !filter.accept(&envelope) {
          continue;
        }
        match envelope.event.as_str() {
          "sync.doc.updates.pushed" => {
            if let Ok(payload) = serde_json::from_value::<SyncDocUpdatesPushedPayload>(envelope.payload) {
              let _ = incoming_tx.send(ClusterSyncEvent::DocUpdatesPushed(payload));
            }
          }
          "sync.permissions.changed" => {
            if let Ok(payload) = serde_json::from_value::<SyncPermissionsChangedPayload>(envelope.payload) {
              let _ = incoming_tx.send(ClusterSyncEvent::PermissionsChanged(payload));
            }
          }
          "sync.awareness.collect" => {
            if let Ok(payload) = serde_json::from_value::<SyncAwarenessEventPayload>(envelope.payload) {
              let _ = incoming_tx.send(ClusterSyncEvent::AwarenessCollect(payload));
            }
          }
          "sync.awareness.updated" => {
            if let Ok(payload) = serde_json::from_value::<SyncAwarenessEventPayload>(envelope.payload) {
              let _ = incoming_tx.send(ClusterSyncEvent::AwarenessUpdated(payload));
            }
          }
          _ => {}
        }
      } else if channel == INVALIDATION_CHANNEL_V1
        && let Ok(val) = serde_json::from_str::<Value>(&raw)
        && val.get("kind").and_then(Value::as_str) == Some("workspaceInventoryChanged")
        && let Some(workspace_id) = val.get("workspaceId").and_then(Value::as_str)
      {
        let doc_id = val.get("docId").and_then(Value::as_str).map(ToOwned::to_owned);
        let _ = incoming_tx.send(ClusterSyncEvent::WorkspaceInventoryChanged {
          workspace_id: workspace_id.to_owned(),
          doc_id,
        });
      }
    }
  }
}
