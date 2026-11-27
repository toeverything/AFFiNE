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

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeTopicChangedPayload {
  pub topic: String,
  #[serde(default)]
  pub room: Option<String>,
  #[serde(default)]
  pub input: Value,
  #[serde(default)]
  pub event: Value,
  #[serde(default)]
  pub payload: Value,
}

impl RealtimeTopicChangedPayload {
  /// Returns the explicit `room` when present, or derives it from `topic` + `input`
  /// so cross-generation Node `v0.27.5` events (which omit `room`) are never dropped.
  pub fn resolved_room(&self) -> Option<String> {
    if let Some(r) = self.room.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
      return Some(r.to_owned());
    }
    let ws = self
      .input
      .get("workspaceId")
      .and_then(Value::as_str)
      .filter(|s| !s.is_empty());
    let doc = self
      .input
      .get("docId")
      .and_then(Value::as_str)
      .filter(|s| !s.is_empty());
    let uid = self
      .input
      .get("userId")
      .and_then(Value::as_str)
      .filter(|s| !s.is_empty());
    let task_id = self
      .input
      .get("taskId")
      .and_then(Value::as_str)
      .filter(|s| !s.is_empty());
    let client_id = self
      .input
      .get("clientId")
      .and_then(Value::as_str)
      .filter(|s| !s.is_empty());
    match self.topic.as_str() {
      "workspace.access.changed" => ws.map(|w| format!("workspace:{w}:access")),
      "workspace.config.changed" => ws.map(|w| format!("workspace:{w}:config")),
      "workspace.members.changed" => ws.map(|w| format!("workspace:{w}:members")),
      "workspace.invite-link.changed" => ws.map(|w| format!("workspace:{w}:invite-link")),
      "workspace.quota-state.changed" => ws.map(|w| format!("workspace:{w}:quota-state")),
      "workspace.embedding.progress.changed" => ws.map(|w| format!("workspace:{w}:embedding-progress")),
      "doc.share-state.changed" => ws.zip(doc).map(|(w, d)| format!("workspace:{w}:doc:{d}:share-state")),
      "doc.grants.changed" => ws.zip(doc).map(|(w, d)| format!("workspace:{w}:doc:{d}:grants")),
      "comment.changed" => ws.zip(doc).map(|(w, d)| format!("workspace:{w}:doc:{d}:comment")),
      "copilot.transcript.task.changed" => ws.zip(task_id).map(|(w, t)| format!("copilot:transcript:{w}:{t}")),
      "copilot.delegated.tool.requested" => uid.zip(client_id).map(|(u, c)| format!("user:{u}:copilot:{c}")),
      "notification.count.changed" => uid.map(|u| format!("user:{u}:notification")),
      "user.settings.changed" => uid.map(|u| format!("user:{u}:settings")),
      "user.profile.changed" => uid.map(|u| format!("user:{u}:profile")),
      "user.quota-state.changed" => uid.map(|u| format!("user:{u}:quota-state")),
      _ => None,
    }
  }
}

/// Incoming cluster events delivered to the local `SpaceSyncGateway`.
#[derive(Clone, Debug)]
pub enum ClusterSyncEvent {
  DocUpdatesPushed(SyncDocUpdatesPushedPayload),
  PermissionsChanged(SyncPermissionsChangedPayload),
  AwarenessCollect(SyncAwarenessEventPayload),
  AwarenessUpdated(SyncAwarenessEventPayload),
  RealtimeTopicChanged(RealtimeTopicChangedPayload),
  WorkspaceInventoryChanged {
    workspace_id: String,
    doc_id: Option<String>,
  },
  CopilotDelegatedEvent {
    event: String,
    payload: Value,
  },
  ConnectionDisconnected {
    connection_id: String,
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

  /// Delivers an event bus event to local subscribers without Redis.
  /// Use it only when no Redis subscriber loop runs, or the event arrives twice.
  pub fn emit_local_event(&self, event: &str, payload: &Value) {
    match event {
      "realtime.topic.changed" => {
        if let Ok(parsed) = serde_json::from_value::<RealtimeTopicChangedPayload>(payload.clone()) {
          let _ = self.incoming_tx.send(ClusterSyncEvent::RealtimeTopicChanged(parsed));
        }
      }
      "copilot.delegated.editor.upserted"
      | "copilot.delegated.editor.released"
      | "copilot.delegated.tool.responded" => {
        let _ = self.incoming_tx.send(ClusterSyncEvent::CopilotDelegatedEvent {
          event: event.to_owned(),
          payload: payload.clone(),
        });
      }
      "realtime.connection.disconnected" => {
        if let Some(connection_id) = disconnected_connection_id(payload) {
          let _ = self
            .incoming_tx
            .send(ClusterSyncEvent::ConnectionDisconnected { connection_id });
        }
      }
      _ => {}
    }
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

fn disconnected_connection_id(payload: &Value) -> Option<String> {
  payload
    .get("connectionId")
    .and_then(Value::as_str)
    .filter(|id| !id.is_empty())
    .map(ToOwned::to_owned)
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
        if envelope.event == "realtime.topic.changed" {
          if !filter.seen.contains(&envelope.id) {
            filter.seen.put(envelope.id.clone(), ());
            if let Ok(payload) = serde_json::from_value::<RealtimeTopicChangedPayload>(envelope.payload) {
              let _ = incoming_tx.send(ClusterSyncEvent::RealtimeTopicChanged(payload));
            }
          }
          continue;
        }
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
          "copilot.delegated.editor.upserted"
          | "copilot.delegated.editor.released"
          | "copilot.delegated.tool.responded" => {
            let _ = incoming_tx.send(ClusterSyncEvent::CopilotDelegatedEvent {
              event: envelope.event,
              payload: envelope.payload,
            });
          }
          "realtime.connection.disconnected" => {
            if let Some(connection_id) = disconnected_connection_id(&envelope.payload) {
              let _ = incoming_tx.send(ClusterSyncEvent::ConnectionDisconnected { connection_id });
            }
          }
          _ => {}
        }
      } else if channel == INVALIDATION_CHANNEL_V1
        && let Ok(val) = serde_json::from_str::<Value>(&raw)
        && let Some(kind) = val.get("kind").and_then(Value::as_str)
      {
        let emit_workspace_quota_and_access = |workspace_id: &str| {
          let _ = incoming_tx.send(ClusterSyncEvent::WorkspaceInventoryChanged {
            workspace_id: workspace_id.to_owned(),
            doc_id: None,
          });
          let _ = incoming_tx.send(ClusterSyncEvent::RealtimeTopicChanged(RealtimeTopicChangedPayload {
            topic: "workspace.quota-state.changed".to_owned(),
            room: Some(format!("workspace:{workspace_id}:quota-state")),
            input: json!({ "workspaceId": workspace_id }),
            event: json!({ "changed": true, "reason": "runtime-invalidation" }),
            payload: Value::Null,
          }));
          let _ = incoming_tx.send(ClusterSyncEvent::RealtimeTopicChanged(RealtimeTopicChangedPayload {
            topic: "workspace.access.changed".to_owned(),
            room: Some(format!("workspace:{workspace_id}:access")),
            input: json!({ "workspaceId": workspace_id }),
            event: json!({ "changed": true, "reason": "quota-state-changed" }),
            payload: Value::Null,
          }));
        };
        match kind {
          "workspaceInventoryChanged" => {
            if let Some(workspace_id) = val.get("workspaceId").and_then(Value::as_str) {
              let doc_id = val.get("docId").and_then(Value::as_str).map(ToOwned::to_owned);
              let _ = incoming_tx.send(ClusterSyncEvent::WorkspaceInventoryChanged {
                workspace_id: workspace_id.to_owned(),
                doc_id,
              });
            }
          }
          "quotaEntitlement" | "quotaStorageUsage" => {
            if let Some(subject) = val.get("subject").and_then(Value::as_str) {
              if let Some(user_id) = subject.strip_prefix("user:").filter(|s| !s.is_empty()) {
                let _ = incoming_tx.send(ClusterSyncEvent::RealtimeTopicChanged(RealtimeTopicChangedPayload {
                  topic: "user.quota-state.changed".to_owned(),
                  room: Some(format!("user:{user_id}:quota-state")),
                  input: json!({}),
                  event: json!({ "changed": true, "reason": "runtime-invalidation" }),
                  payload: Value::Null,
                }));
              } else if let Some(workspace_id) = subject.strip_prefix("workspace:").filter(|s| !s.is_empty()) {
                emit_workspace_quota_and_access(workspace_id);
              }
            }
          }
          "quotaOwnerMapping" | "quotaSeatUsage" => {
            if let Some(workspace_id) = val.get("workspaceId").and_then(Value::as_str).filter(|s| !s.is_empty()) {
              emit_workspace_quota_and_access(workspace_id);
            }
          }
          _ => {}
        }
      }
    }
  }
}

#[cfg(test)]
mod realtime_topic_tests {
  use super::*;

  #[test]
  fn realtime_topic_changed_deserializes_without_room_and_derives_room() {
    let raw = serde_json::json!({
      "topic": "doc.share-state.changed",
      "input": { "workspaceId": "ws-1", "docId": "doc-2" },
      "event": { "changed": true }
    });
    let payload: RealtimeTopicChangedPayload = serde_json::from_value(raw).expect("deserialize without room");
    assert_eq!(payload.room, None);
    assert_eq!(
      payload.resolved_room().as_deref(),
      Some("workspace:ws-1:doc:doc-2:share-state")
    );

    let raw_user = serde_json::json!({
      "topic": "user.quota-state.changed",
      "input": { "userId": "u-42" },
      "event": {}
    });
    let payload_user: RealtimeTopicChangedPayload = serde_json::from_value(raw_user).expect("deserialize user topic");
    assert_eq!(payload_user.resolved_room().as_deref(), Some("user:u-42:quota-state"));

    let raw_transcript = serde_json::json!({
      "topic": "copilot.transcript.task.changed",
      "input": { "workspaceId": "ws-1", "taskId": "task-9" },
      "event": {}
    });
    let payload_transcript: RealtimeTopicChangedPayload =
      serde_json::from_value(raw_transcript).expect("deserialize transcript topic");
    assert_eq!(
      payload_transcript.resolved_room().as_deref(),
      Some("copilot:transcript:ws-1:task-9")
    );

    let raw_embed = serde_json::json!({
      "topic": "workspace.embedding.progress.changed",
      "input": { "workspaceId": "ws-1" },
      "event": {}
    });
    let payload_embed: RealtimeTopicChangedPayload =
      serde_json::from_value(raw_embed).expect("deserialize embedding progress topic");
    assert_eq!(
      payload_embed.resolved_room().as_deref(),
      Some("workspace:ws-1:embedding-progress")
    );
  }

  #[tokio::test]
  async fn emit_local_event_delivers_topic_delegated_and_disconnect_events_without_redis() {
    let bridge = RedisSyncBridge::start(None, "v2:test").await;
    let mut rx = bridge.subscribe();
    let topic =
      json!({ "topic": "workspace.embedding.progress.changed", "input": { "workspaceId": "ws-1" }, "event": {} });
    let delegated = json!({ "clientId": "c-1" });
    let cases: &[(&str, Value, Option<&str>)] = &[
      (
        "realtime.topic.changed",
        topic,
        Some("topic:workspace:ws-1:embedding-progress"),
      ),
      ("realtime.topic.changed", json!({ "bad": true }), None),
      (
        "copilot.delegated.editor.upserted",
        delegated.clone(),
        Some("delegated:copilot.delegated.editor.upserted"),
      ),
      (
        "copilot.delegated.editor.released",
        delegated.clone(),
        Some("delegated:copilot.delegated.editor.released"),
      ),
      (
        "copilot.delegated.tool.responded",
        delegated,
        Some("delegated:copilot.delegated.tool.responded"),
      ),
      (
        "realtime.connection.disconnected",
        json!({ "connectionId": "socket-1" }),
        Some("disconnected:socket-1"),
      ),
      ("realtime.connection.disconnected", json!({ "connectionId": "" }), None),
      ("copilot.delegated.tool.requested", json!({}), None),
    ];
    for (event, payload, expected) in cases {
      bridge.emit_local_event(event, payload);
      let received = rx.try_recv().ok().map(|incoming| match incoming {
        ClusterSyncEvent::RealtimeTopicChanged(parsed) => {
          format!("topic:{}", parsed.resolved_room().unwrap_or_default())
        }
        ClusterSyncEvent::CopilotDelegatedEvent { event, payload: got } => {
          assert_eq!(&got, payload, "{event}");
          format!("delegated:{event}")
        }
        ClusterSyncEvent::ConnectionDisconnected { connection_id } => format!("disconnected:{connection_id}"),
        other => format!("unexpected:{other:?}"),
      });
      assert_eq!(received.as_deref(), *expected, "{event} {payload}");
    }
    bridge.stop().await;
  }
}
