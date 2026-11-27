//! `SpaceSyncGateway`: implements all frozen `v0.27.5` `space:*` Socket.IO
//! events, room & doc subscription tracking, lag/reconnect/inventory
//! subscription revalidation, multi-replica presence analytics, and Redis
//! EventBus bidirectional fan-out.

use std::{
  collections::{HashMap, HashSet},
  sync::Arc,
  time::Duration,
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Value, json};
use tokio::sync::{Notify, RwLock};
use tracing::warn;
use uuid::Uuid;

const PRESENCE_DEBOUNCE: Duration = Duration::from_millis(250);
const PRESENCE_HEARTBEAT: Duration = Duration::from_secs(30);

/// Result of handling an inbound Socket.IO event.
pub struct EventResponse {
  pub payload: Value,
  pub close_after_flush: bool,
}

use crate::{
  auth::SyncUser,
  engine_io::EngineIoState,
  error::SyncError,
  eventbus::{ClusterSyncEvent, RedisSyncBridge, SyncDocUpdatesPushedPayload, SyncPermissionsChangedPayload},
  legacy_compat::errors::sync_error_to_ws_envelope,
  protocol::{
    BroadcastDocInvalidationMessage, BroadcastDocUpdatesMessage, DeleteDocMessage, DocLifecycleAction,
    DocLifecycleMessage, LeaveSpaceMessage, LoadDocMessage, LoadDocTimestampsMessage, LoadSpaceAwarenessesMessage,
    LoadWorkspaceStateMessage, PushDocIntent, PushDocUpdateMessage, SpaceType, UpdateAwarenessMessage, active_doc_key,
    canonical_doc_id, is_batch_ws_client_version, parse_join_space_batch_message, parse_leave_space_batch_message,
    space_room,
  },
  storage::{DocAction, SyncStorage},
};

#[derive(Default)]
struct GatewayRooms {
  /// `socket_id -> protocolVersion (1 or 2)`
  socket_protocol_versions: HashMap<String, u8>,
  /// `socket_id -> user_id`
  socket_users: HashMap<String, String>,
  /// `user_id -> active connection count`
  user_connection_counts: HashMap<String, usize>,
  /// `room_name -> set of socket_ids`
  room_sockets: HashMap<String, HashSet<String>>,
  /// `socket_id -> set of room_names`
  socket_rooms: HashMap<String, HashSet<String>>,
  /// `active_doc_key -> set of socket_ids`
  active_doc_sockets: HashMap<String, HashSet<String>>,
  /// `socket_id -> set of active_doc_keys`
  active_socket_docs: HashMap<String, HashSet<String>>,
  /// `socket_id -> active_doc_key -> allowed DocActions`
  active_socket_doc_actions: HashMap<String, HashMap<String, HashSet<DocAction>>>,
  /// `socket_id -> active_doc_key -> permission_generation`
  active_socket_doc_generations: HashMap<String, HashMap<String, i64>>,
  /// `subscription_id -> (socket_id, room_name)` for `realtime:subscribe`
  realtime_subscriptions: HashMap<String, (String, String)>,
}

impl GatewayRooms {
  fn join_room(&mut self, socket_id: &str, room: &str) {
    self
      .room_sockets
      .entry(room.to_owned())
      .or_default()
      .insert(socket_id.to_owned());
    self
      .socket_rooms
      .entry(socket_id.to_owned())
      .or_default()
      .insert(room.to_owned());
  }

  fn leave_room(&mut self, socket_id: &str, room: &str) {
    if let Some(sockets) = self.room_sockets.get_mut(room) {
      sockets.remove(socket_id);
      if sockets.is_empty() {
        self.room_sockets.remove(room);
      }
    }
    if let Some(rooms) = self.socket_rooms.get_mut(socket_id) {
      rooms.remove(room);
      if rooms.is_empty() {
        self.socket_rooms.remove(socket_id);
      }
    }
  }

  fn is_in_room(&self, socket_id: &str, room: &str) -> bool {
    self
      .socket_rooms
      .get(socket_id)
      .is_some_and(|rooms| rooms.contains(room))
  }

  fn add_doc_subscription(
    &mut self,
    socket_id: &str,
    space_type: SpaceType,
    space_id: &str,
    doc_id: &str,
    actions: HashSet<DocAction>,
    generation: i64,
  ) {
    let key = active_doc_key(space_type, space_id, doc_id);
    self
      .active_doc_sockets
      .entry(key.clone())
      .or_default()
      .insert(socket_id.to_owned());
    self
      .active_socket_docs
      .entry(socket_id.to_owned())
      .or_default()
      .insert(key.clone());
    self
      .active_socket_doc_actions
      .entry(socket_id.to_owned())
      .or_default()
      .insert(key.clone(), actions);
    self
      .active_socket_doc_generations
      .entry(socket_id.to_owned())
      .or_default()
      .insert(key, generation);
  }

  fn remove_doc_subscription(&mut self, socket_id: &str, space_type: SpaceType, space_id: &str, doc_id: &str) {
    let key = active_doc_key(space_type, space_id, doc_id);
    self.remove_doc_subscription_by_key(socket_id, &key);
  }

  fn remove_doc_subscription_by_key(&mut self, socket_id: &str, key: &str) {
    if let Some(sockets) = self.active_doc_sockets.get_mut(key) {
      sockets.remove(socket_id);
      if sockets.is_empty() {
        self.active_doc_sockets.remove(key);
      }
    }
    if let Some(docs) = self.active_socket_docs.get_mut(socket_id) {
      docs.remove(key);
      if docs.is_empty() {
        self.active_socket_docs.remove(socket_id);
      }
    }
    if let Some(actions) = self.active_socket_doc_actions.get_mut(socket_id) {
      actions.remove(key);
      if actions.is_empty() {
        self.active_socket_doc_actions.remove(socket_id);
      }
    }
    if let Some(gens) = self.active_socket_doc_generations.get_mut(socket_id) {
      gens.remove(key);
      if gens.is_empty() {
        self.active_socket_doc_generations.remove(socket_id);
      }
    }
  }

  fn remove_space_doc_subscriptions(&mut self, socket_id: &str, space_type: SpaceType, space_id: &str) {
    let prefix = format!("{}:{space_id}:", space_type.as_str());
    let keys: Vec<String> = self
      .active_socket_docs
      .get(socket_id)
      .map(|docs| docs.iter().filter(|k| k.starts_with(&prefix)).cloned().collect())
      .unwrap_or_default();
    for key in keys {
      self.remove_doc_subscription_by_key(socket_id, &key);
    }
  }

  fn remove_socket(&mut self, socket_id: &str) {
    self.socket_protocol_versions.remove(socket_id);
    if let Some(rooms) = self.socket_rooms.remove(socket_id) {
      for room in rooms {
        if let Some(sockets) = self.room_sockets.get_mut(&room) {
          sockets.remove(socket_id);
          if sockets.is_empty() {
            self.room_sockets.remove(&room);
          }
        }
      }
    }
    if let Some(docs) = self.active_socket_docs.remove(socket_id) {
      for key in docs {
        if let Some(sockets) = self.active_doc_sockets.get_mut(&key) {
          sockets.remove(socket_id);
          if sockets.is_empty() {
            self.active_doc_sockets.remove(&key);
          }
        }
      }
    }
    self.active_socket_doc_actions.remove(socket_id);
    self.active_socket_doc_generations.remove(socket_id);
    self.realtime_subscriptions.retain(|_, (sid, _)| sid != socket_id);

    if let Some(user_id) = self.socket_users.remove(socket_id)
      && let Some(count) = self.user_connection_counts.get_mut(&user_id)
    {
      if *count <= 1 {
        self.user_connection_counts.remove(&user_id);
      } else {
        *count -= 1;
      }
    }
  }

  fn evict_stale_subscriptions(&mut self, event: &SyncPermissionsChangedPayload) {
    let prefix = format!("{}:{}:", event.space_type.as_str(), event.space_id);
    let exact = event
      .doc_id
      .as_deref()
      .map(|d| active_doc_key(event.space_type, &event.space_id, d));

    let targets: Vec<(String, String)> = self
      .active_socket_docs
      .iter()
      .flat_map(|(socket_id, docs)| {
        docs
          .iter()
          .filter(|k| match &exact {
            Some(ex) => *k == ex,
            None => k.starts_with(&prefix),
          })
          .map(|k| (socket_id.clone(), k.clone()))
          .collect::<Vec<_>>()
      })
      .collect();

    for (socket_id, key) in targets {
      self.remove_doc_subscription_by_key(&socket_id, &key);
    }
  }
}

pub struct SpaceSyncGateway {
  storage: SyncStorage,
  eventbus: Arc<RedisSyncBridge>,
  rooms: RwLock<GatewayRooms>,
  presence_flush_lock: tokio::sync::Mutex<()>,
  presence_notify: Notify,
  deployment_prefix: String,
}

impl SpaceSyncGateway {
  pub fn new(storage: SyncStorage, eventbus: Arc<RedisSyncBridge>, deployment_prefix: impl Into<String>) -> Arc<Self> {
    Arc::new(Self {
      storage,
      eventbus,
      rooms: RwLock::new(GatewayRooms::default()),
      presence_flush_lock: tokio::sync::Mutex::new(()),
      presence_notify: Notify::new(),
      deployment_prefix: deployment_prefix.into(),
    })
  }

  pub fn storage(&self) -> &SyncStorage {
    &self.storage
  }

  pub fn eventbus(&self) -> &Arc<RedisSyncBridge> {
    &self.eventbus
  }

  /// Spawns the background task that fans out incoming Redis EventBus /
  /// invalidation messages to local Socket.IO clients and revalidates
  /// subscriptions on lag, reconnect, or workspace inventory invalidation.
  pub fn spawn_cluster_fanout(self: &Arc<Self>, engine: Arc<EngineIoState>) -> tokio::task::JoinHandle<()> {
    let gateway = Arc::clone(self);
    let mut rx = self.eventbus.subscribe();
    tokio::spawn(async move {
      loop {
        match rx.recv().await {
          Ok(ClusterSyncEvent::DocUpdatesPushed(payload)) => {
            gateway.fanout_cluster_doc_update(&engine, payload).await;
          }
          Ok(ClusterSyncEvent::PermissionsChanged(payload)) => {
            gateway.handle_cluster_permissions_changed(&engine, payload).await;
          }
          Ok(ClusterSyncEvent::AwarenessCollect(payload)) => {
            let recipients = gateway
              .doc_subscribers(
                payload.space_type,
                &payload.space_id,
                &payload.doc_id,
                payload.source_socket_id.as_deref(),
              )
              .await;
            let body = json!({
              "spaceType": payload.space_type.as_str(),
              "spaceId": payload.space_id,
              "docId": payload.doc_id,
            });
            for sid in recipients {
              engine.emit_to_socket(&sid, "space:collect-awareness", &body).await;
            }
          }
          Ok(ClusterSyncEvent::AwarenessUpdated(payload)) => {
            let recipients = gateway
              .doc_subscribers(
                payload.space_type,
                &payload.space_id,
                &payload.doc_id,
                payload.source_socket_id.as_deref(),
              )
              .await;
            let body = json!({
              "spaceType": payload.space_type.as_str(),
              "spaceId": payload.space_id,
              "docId": payload.doc_id,
              "awarenessUpdate": payload.awareness_update.unwrap_or_default(),
            });
            for sid in recipients {
              engine
                .emit_to_socket(&sid, "space:broadcast-awareness-update", &body)
                .await;
            }
          }
          Ok(ClusterSyncEvent::RealtimeTopicChanged(payload)) => {
            let Some(room) = payload.resolved_room() else {
              continue;
            };
            let recipients_with_users: Vec<(String, Option<String>)> = {
              let rooms = gateway.rooms.read().await;
              rooms
                .room_sockets
                .get(&room)
                .map(|s| {
                  s.iter()
                    .map(|sid| (sid.clone(), rooms.socket_users.get(sid).cloned()))
                    .collect()
                })
                .unwrap_or_default()
            };
            let doc_room_check = parse_doc_realtime_room(&room);
            let event_val = if payload.event.is_null() {
              payload.payload
            } else {
              payload.event
            };
            let input_key = realtime_input_key(&payload.input);
            let body = json!({
              "topic": payload.topic,
              "inputKey": input_key,
              "sentAt": chrono::Utc::now().timestamp_millis(),
              "event": event_val,
            });
            for (sid, user_id_opt) in recipients_with_users {
              if let Some((ws_id, doc_id, topic)) = doc_room_check {
                let allowed = match user_id_opt.as_deref() {
                  Some(uid) => gateway
                    .storage
                    .assert_doc_realtime_topic_access(ws_id, doc_id, uid, topic)
                    .await
                    .is_ok(),
                  None => false,
                };
                if !allowed {
                  let mut rooms = gateway.rooms.write().await;
                  rooms
                    .realtime_subscriptions
                    .retain(|_, (other_sid, other_room)| !(other_sid == &sid && other_room == &room));
                  rooms.leave_room(&sid, &room);
                  continue;
                }
              }
              engine.emit_to_socket(&sid, "realtime:event", &body).await;
            }
          }
          Ok(ClusterSyncEvent::WorkspaceInventoryChanged { workspace_id, doc_id }) => {
            gateway
              .revalidate_subscriptions(&engine, Some((workspace_id.as_str(), doc_id.as_deref())))
              .await;
          }
          Ok(ClusterSyncEvent::Reconnected) => {
            warn!("server-sync Redis pub/sub reconnected; revalidating active doc subscriptions");
            gateway.revalidate_subscriptions(&engine, None).await;
          }
          Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
            warn!("server-sync cluster fanout lagged by {n} events; revalidating active doc subscriptions");
            gateway.revalidate_subscriptions(&engine, None).await;
          }
          Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
      }
    })
  }

  /// Spawns the background presence worker that coalesces connect/disconnect
  /// bursts with a 250 ms debounce and refreshes active-user presence every 30 s
  /// so long-lived connections stay well within the 90 s Redis Hash TTL.
  pub fn spawn_presence_worker(self: &Arc<Self>) -> tokio::task::JoinHandle<()> {
    let gateway = Arc::clone(self);
    tokio::spawn(async move {
      let mut heartbeat = tokio::time::interval(PRESENCE_HEARTBEAT);
      heartbeat.tick().await;
      loop {
        tokio::select! {
          _ = gateway.presence_notify.notified() => {
            tokio::time::sleep(PRESENCE_DEBOUNCE).await;
            gateway.flush_active_users_minutely().await;
          }
          _ = heartbeat.tick() => {
            let has_local = !gateway.rooms.read().await.user_connection_counts.is_empty();
            if has_local {
              gateway.flush_active_users_minutely().await;
            }
          }
        }
      }
    })
  }

  /// Revalidates active workspace room memberships and document subscriptions
  /// against `Workspace.Sync`, `Doc.Read`, and `workspace_sync_permission_generations`
  /// (fail-closed on any denial, DB error, or generation mismatch), evicting
  /// revoked sockets from `sync` / `sync-027` rooms and document subscriptions.
  async fn revalidate_subscriptions(&self, engine: &Arc<EngineIoState>, filter: Option<(&str, Option<&str>)>) {
    let mut workspaces_to_notify = HashSet::new();
    type WsUserSockets = HashMap<(String, String), HashSet<String>>;
    type WsUserSubs = HashMap<(String, String), Vec<(String, String)>>;

    let (by_ws_user_sockets, by_ws_user_subs): (WsUserSockets, WsUserSubs) = {
      let rooms = self.rooms.read().await;
      if let Some((ws_id, _)) = filter {
        workspaces_to_notify.insert(ws_id.to_owned());
      }
      let mut sockets_map: WsUserSockets = HashMap::new();
      let mut subs_map: WsUserSubs = HashMap::new();

      // Collect all sockets currently in any `workspace:<ws>:sync` or `sync-027` room.
      for (room, sids) in &rooms.room_sockets {
        let Some(rest) = room.strip_prefix("workspace:") else {
          continue;
        };
        let ws_id = if let Some(ws) = rest.strip_suffix(":sync-027") {
          ws
        } else if let Some(ws) = rest.strip_suffix(":sync") {
          ws
        } else {
          continue;
        };
        if let Some((filter_ws, _)) = filter
          && ws_id != filter_ws
        {
          continue;
        }
        workspaces_to_notify.insert(ws_id.to_owned());
        for socket_id in sids {
          if let Some(user_id) = rooms.socket_users.get(socket_id) {
            sockets_map
              .entry((ws_id.to_owned(), user_id.clone()))
              .or_default()
              .insert(socket_id.clone());
          }
        }
      }

      // Collect active doc subscriptions matching the filter.
      for (socket_id, docs) in &rooms.active_socket_docs {
        let Some(user_id) = rooms.socket_users.get(socket_id) else {
          continue;
        };
        for key in docs {
          let Some(rest) = key.strip_prefix("workspace:") else {
            continue;
          };
          let Some((ws_id, doc_id)) = rest.split_once(':') else {
            continue;
          };
          if let Some((filter_ws, filter_doc)) = filter {
            if ws_id != filter_ws {
              continue;
            }
            if let Some(fd) = filter_doc
              && doc_id != fd
            {
              continue;
            }
          }
          workspaces_to_notify.insert(ws_id.to_owned());
          sockets_map
            .entry((ws_id.to_owned(), user_id.clone()))
            .or_default()
            .insert(socket_id.clone());
          subs_map
            .entry((ws_id.to_owned(), user_id.clone()))
            .or_default()
            .push((socket_id.clone(), doc_id.to_owned()));
        }
      }
      (sockets_map, subs_map)
    };

    for ((ws_id, user_id), user_sockets) in by_ws_user_sockets {
      // 1. Re-verify `Workspace.Sync` membership first (1:1 with gateway.ts:1070-1180):
      //    - Explicit access denial: evict doc subscriptions AND leave sync/sync-027 rooms.
      //    - Transient DB error: fail-closed evict doc subscriptions, but keep rooms so
      //      clients still receive room-level invalidations once the DB recovers.
      match self
        .storage
        .assert_space_accessible(SpaceType::Workspace, &ws_id, &user_id)
        .await
      {
        Ok(()) => {}
        Err(SyncError::SpaceAccessDenied { .. } | SyncError::AccessDenied(_)) => {
          let mut rooms = self.rooms.write().await;
          let sync_room = space_room(SpaceType::Workspace, &ws_id, "sync");
          let batch_room = space_room(SpaceType::Workspace, &ws_id, "sync-027");
          for socket_id in &user_sockets {
            rooms.remove_space_doc_subscriptions(socket_id, SpaceType::Workspace, &ws_id);
            rooms.leave_room(socket_id, &sync_room);
            rooms.leave_room(socket_id, &batch_room);
          }
          continue;
        }
        Err(err) => {
          warn!("revalidate_subscriptions transient DB error for ws={ws_id} user={user_id}: {err}");
          let mut rooms = self.rooms.write().await;
          for socket_id in &user_sockets {
            rooms.remove_space_doc_subscriptions(socket_id, SpaceType::Workspace, &ws_id);
          }
          continue;
        }
      }

      let Some(subs) = by_ws_user_subs.get(&(ws_id.clone(), user_id.clone())) else {
        continue;
      };
      let doc_ids: Vec<String> = subs
        .iter()
        .map(|(_, doc_id)| doc_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

      // 2. Generation-bracketed doc permission check (up to 2 attempts, fail-closed).
      let mut resolved: Option<(i64, HashMap<String, HashSet<DocAction>>)> = None;
      for _ in 0..2 {
        let Ok(before_gen) = self.storage.get_sync_permission_generation(&ws_id).await else {
          resolved = None;
          break;
        };
        let Ok(perms) = self
          .storage
          .resolve_workspace_doc_permissions(&ws_id, &user_id, &doc_ids)
          .await
        else {
          resolved = None;
          break;
        };
        let Ok(after_gen) = self.storage.get_sync_permission_generation(&ws_id).await else {
          resolved = None;
          break;
        };
        if before_gen == after_gen {
          resolved = Some((after_gen, perms));
          break;
        }
      }

      let mut rooms = self.rooms.write().await;
      match resolved {
        Some((confirmed_gen, perms)) => {
          for (socket_id, doc_id) in subs {
            let key = active_doc_key(SpaceType::Workspace, &ws_id, doc_id);
            let still_subscribed = rooms
              .active_socket_docs
              .get(socket_id)
              .is_some_and(|docs| docs.contains(&key));
            if !still_subscribed {
              continue;
            }
            let allowed = perms.get(doc_id).cloned().unwrap_or_default();
            if allowed.contains(&DocAction::Read) {
              rooms.add_doc_subscription(socket_id, SpaceType::Workspace, &ws_id, doc_id, allowed, confirmed_gen);
            } else {
              rooms.remove_doc_subscription(socket_id, SpaceType::Workspace, &ws_id, doc_id);
            }
          }
        }
        None => {
          // Fail-closed: evict affected doc subscriptions on DB error or unstable generation.
          for (socket_id, doc_id) in subs {
            rooms.remove_doc_subscription(socket_id, SpaceType::Workspace, &ws_id, doc_id);
          }
        }
      }
    }

    for ws_id in workspaces_to_notify {
      self
        .emit_inventory_invalidation(engine, SpaceType::Workspace, &ws_id)
        .await;
    }

    // Revalidate realtime room subscriptions (`workspace:<ws>:config`,
    // `workspace:<ws>:access`, and doc-scoped `workspace:<ws>:doc:<doc>:<scope>`)
    // and evict sockets that lost workspace or document-level permissions.
    let rt_candidates: Vec<(String, String, String, String)> = {
      let rooms = self.rooms.read().await;
      rooms
        .realtime_subscriptions
        .iter()
        .filter_map(|(sub_id, (sid, room))| {
          let ws_id = if let Some((ws, _doc, _topic)) = parse_doc_realtime_room(room) {
            ws
          } else {
            let rest = room.strip_prefix("workspace:")?;
            let (ws, kind) = rest.rsplit_once(':')?;
            if !matches!(kind, "config" | "access" | "members") {
              return None;
            }
            ws
          };
          if let Some((filter_ws, _)) = filter
            && filter_ws != ws_id
          {
            return None;
          }
          let user_id = rooms.socket_users.get(sid)?.clone();
          Some((sub_id.clone(), sid.clone(), user_id, room.clone()))
        })
        .collect()
    };

    for (sub_id, sid, user_id, room) in rt_candidates {
      let still_allowed = if let Some((ws_id, doc_id, topic)) = parse_doc_realtime_room(&room) {
        self
          .storage
          .assert_doc_realtime_topic_access(ws_id, doc_id, &user_id, topic)
          .await
          .is_ok()
      } else if let Some((ws_id, kind)) = room.strip_prefix("workspace:").and_then(|r| r.rsplit_once(':')) {
        match kind {
          "config" => self
            .storage
            .assert_space_accessible(SpaceType::Workspace, ws_id, &user_id)
            .await
            .is_ok(),
          "access" => self.storage.assert_workspace_readable(ws_id, &user_id).await.is_ok(),
          "members" => self
            .storage
            .assert_workspace_members_readable(ws_id, &user_id)
            .await
            .is_ok(),
          _ => true,
        }
      } else {
        true
      };
      if !still_allowed {
        let mut rooms = self.rooms.write().await;
        if rooms.realtime_subscriptions.remove(&sub_id).is_some() {
          let still_in_room = rooms
            .realtime_subscriptions
            .values()
            .any(|(other_sid, other_room)| other_sid == &sid && other_room == &room);
          if !still_in_room {
            rooms.leave_room(&sid, &room);
          }
        }
      }
    }
  }

  async fn flush_active_users_minutely(&self) {
    let _guard = self.presence_flush_lock.lock().await;
    let local_user_ids: Vec<String> = self.rooms.read().await.user_connection_counts.keys().cloned().collect();
    let Some(active_users) = self.eventbus.sync_replica_active_users(&local_user_ids).await else {
      warn!("skipping sync_active_users_minutely upsert because Redis presence sync failed");
      return;
    };
    if let Err(err) = self.storage.upsert_sync_active_users_minutely(active_users).await {
      warn!("failed to upsert sync_active_users_minutely: {err}");
    }
  }

  pub async fn handle_connect(&self, socket_id: &str, user: &SyncUser) {
    let inserted = {
      let mut rooms = self.rooms.write().await;
      if rooms.socket_users.contains_key(socket_id) {
        false
      } else {
        rooms.socket_users.insert(socket_id.to_owned(), user.id.clone());
        *rooms.user_connection_counts.entry(user.id.clone()).or_insert(0) += 1;
        true
      }
    };
    if inserted {
      self.presence_notify.notify_one();
    }
  }

  pub async fn handle_disconnect(&self, socket_id: &str) {
    {
      let mut rooms = self.rooms.write().await;
      rooms.remove_socket(socket_id);
    }
    self.presence_notify.notify_one();
    self.eventbus.publish_connection_disconnected(socket_id).await;
  }

  pub async fn handle_event(
    &self,
    engine: &Arc<EngineIoState>,
    socket_id: &str,
    user: &SyncUser,
    event: &str,
    payload: Value,
  ) -> EventResponse {
    let request_id = format!("{}:ws:{}", self.deployment_prefix, Uuid::new_v4());
    if event == "space:join-batch" {
      return match self.on_join_batch(socket_id, user, &payload).await {
        Ok(resp) => resp,
        Err(err) => {
          let env = sync_error_to_ws_envelope(&err, Some(request_id));
          EventResponse {
            payload: serde_json::to_value(env)
              .unwrap_or_else(|_| json!({ "error": { "status": 500, "code": "INTERNAL_SERVER_ERROR" } })),
            close_after_flush: false,
          }
        }
      };
    }

    let result = match event {
      "space:leave" => self.on_leave(socket_id, payload).await,
      "space:leave-batch" => self.on_leave_batch(socket_id, &payload).await,
      "space:push-doc-update" => {
        self
          .on_push_doc_update(engine, socket_id, user, payload, request_id.clone())
          .await
      }
      "space:load-doc" => self.on_load_doc(socket_id, payload).await,
      "space:load-doc-timestamps" => self.on_load_doc_timestamps(socket_id, user, payload).await,
      "space:load-workspace-state" => self.on_load_workspace_state(socket_id, user, payload).await,
      "space:delete-doc" => self.on_delete_doc(socket_id, user, payload).await,
      "space:doc-lifecycle" => self.on_doc_lifecycle(socket_id, user, payload).await,
      "space:load-awarenesses" => self.on_load_awarenesses(engine, socket_id, payload).await,
      "space:update-awareness" => self.on_update_awareness(engine, socket_id, payload).await,
      "realtime:request" => self.on_realtime_request(user, payload).await,
      "realtime:subscribe" => self.on_realtime_subscribe(socket_id, user, payload).await,
      "realtime:unsubscribe" => self.on_realtime_unsubscribe(socket_id, payload).await,
      other => Err(SyncError::BadRequest(format!("Unsupported event: {other}"))),
    };

    let payload = match result {
      Ok(val) => val,
      Err(err) => {
        let env = sync_error_to_ws_envelope(&err, Some(request_id));
        serde_json::to_value(env)
          .unwrap_or_else(|_| json!({ "error": { "status": 500, "code": "INTERNAL_SERVER_ERROR" } }))
      }
    };
    EventResponse {
      payload,
      close_after_flush: false,
    }
  }

  async fn on_join_batch(&self, socket_id: &str, user: &SyncUser, payload: &Value) -> Result<EventResponse, SyncError> {
    let msg = parse_join_space_batch_message(payload)?;
    if !is_batch_ws_client_version(&msg.client_version) {
      // Return `close_after_flush: true` so `EngineIoState` atomically enqueues
      // the reject ACK and arms `close_after_flush` under one lock.
      return Ok(EventResponse {
        payload: json!({
          "data": {
            "clientId": socket_id,
            "success": false,
            "protocolVersion": msg.protocol_version,
          }
        }),
        close_after_flush: true,
      });
    }

    let first = &msg.spaces[0];
    self
      .storage
      .assert_space_accessible(first.space_type, &first.space_id, &user.id)
      .await?;

    if first.space_type == SpaceType::Workspace {
      self
        .storage
        .ensure_workspace_lifecycle(&first.space_id, msg.protocol_version)
        .await?;
    }

    let doc_ids: Vec<String> = msg.spaces.iter().filter_map(|s| s.doc_id.clone()).collect();
    let mut doc_actions = HashMap::new();
    let mut permission_generation = 0_i64;

    if first.space_type == SpaceType::Userspace {
      for doc_id in &doc_ids {
        let mut set = HashSet::new();
        set.insert(DocAction::Read);
        set.insert(DocAction::Update);
        doc_actions.insert(doc_id.clone(), set);
      }
    } else if !doc_ids.is_empty() {
      let mut resolved = false;
      for _ in 0..3 {
        let before = self.storage.get_sync_permission_generation(&first.space_id).await?;
        let perms = self
          .storage
          .resolve_workspace_doc_permissions(&first.space_id, &user.id, &doc_ids)
          .await?;
        let after = self.storage.get_sync_permission_generation(&first.space_id).await?;
        if before != after {
          continue;
        }
        for doc_id in &doc_ids {
          let allowed = perms.get(doc_id).cloned().unwrap_or_default();
          if !allowed.contains(&DocAction::Read) {
            return Err(SyncError::DocActionDenied {
              action: "Doc.Read".into(),
              doc_id: doc_id.clone(),
              space_id: first.space_id.clone(),
            });
          }
          doc_actions.insert(doc_id.clone(), allowed);
        }
        permission_generation = after;
        resolved = true;
        break;
      }
      if !resolved {
        return Err(SyncError::SyncPermissionGenerationChanged {
          space_id: first.space_id.clone(),
        });
      }
    }

    {
      let mut rooms = self.rooms.write().await;
      rooms
        .socket_protocol_versions
        .insert(socket_id.to_owned(), msg.protocol_version);
      rooms.join_room(socket_id, &space_room(first.space_type, &first.space_id, "sync"));
      rooms.join_room(socket_id, &space_room(first.space_type, &first.space_id, "sync-027"));
      for doc_id in &doc_ids {
        let actions = doc_actions.remove(doc_id).unwrap_or_default();
        rooms.add_doc_subscription(
          socket_id,
          first.space_type,
          &first.space_id,
          doc_id,
          actions,
          permission_generation,
        );
      }
    }

    Ok(EventResponse {
      payload: json!({
        "data": {
          "clientId": socket_id,
          "success": true,
          "protocolVersion": msg.protocol_version,
        }
      }),
      close_after_flush: false,
    })
  }

  async fn on_leave(&self, socket_id: &str, payload: Value) -> Result<Value, SyncError> {
    let msg: LeaveSpaceMessage =
      serde_json::from_value(payload).map_err(|e| SyncError::BadRequest(format!("Invalid leave payload: {e}")))?;
    {
      let mut rooms = self.rooms.write().await;
      rooms.remove_space_doc_subscriptions(socket_id, msg.space_type, &msg.space_id);
      rooms.leave_room(socket_id, &space_room(msg.space_type, &msg.space_id, "sync"));
      rooms.leave_room(socket_id, &space_room(msg.space_type, &msg.space_id, "sync-027"));
    }
    Ok(json!({
      "data": {
        "clientId": socket_id,
        "success": true,
      }
    }))
  }

  async fn on_leave_batch(&self, socket_id: &str, payload: &Value) -> Result<Value, SyncError> {
    let msg = parse_leave_space_batch_message(payload)?;
    {
      let mut rooms = self.rooms.write().await;
      for doc_id in &msg.doc_ids {
        rooms.remove_doc_subscription(socket_id, msg.space_type, &msg.space_id, doc_id);
      }
      let prefix = format!("{}:{}:", msg.space_type.as_str(), msg.space_id);
      let has_active_docs = rooms
        .active_socket_docs
        .get(socket_id)
        .is_some_and(|docs| docs.iter().any(|k| k.starts_with(&prefix)));
      if msg.doc_ids.is_empty() && !has_active_docs {
        rooms.leave_room(socket_id, &space_room(msg.space_type, &msg.space_id, "sync-027"));
        rooms.leave_room(socket_id, &space_room(msg.space_type, &msg.space_id, "sync"));
      }
    }
    Ok(json!({
      "data": {
        "clientId": socket_id,
        "success": true,
      }
    }))
  }

  async fn on_push_doc_update(
    &self,
    engine: &Arc<EngineIoState>,
    socket_id: &str,
    user: &SyncUser,
    payload: Value,
    request_id: String,
  ) -> Result<Value, SyncError> {
    let msg: PushDocUpdateMessage =
      serde_json::from_value(payload).map_err(|e| SyncError::BadRequest(format!("Invalid push payload: {e}")))?;
    let doc_id = canonical_doc_id(&msg.doc_id, &msg.space_id)?;
    let intent = match msg.intent.as_deref() {
      Some("create") => PushDocIntent::Create,
      Some("update") => PushDocIntent::Update,
      _ => return Err(SyncError::BadRequest("Document update intent is required.".into())),
    };

    let (permission_generation, protocol_version) = {
      let rooms = self.rooms.read().await;
      self.assert_in_space(&rooms, socket_id, msg.space_type, &msg.space_id)?;
      let protocol_version = rooms.socket_protocol_versions.get(socket_id).copied();
      let perm_gen = if intent == PushDocIntent::Update {
        let key = active_doc_key(msg.space_type, &msg.space_id, &doc_id);
        let actions = rooms
          .active_socket_doc_actions
          .get(socket_id)
          .and_then(|m| m.get(&key))
          .ok_or_else(|| SyncError::NotInSpace {
            space_id: msg.space_id.clone(),
          })?;
        if !actions.contains(&DocAction::Update) {
          return Err(SyncError::DocActionDenied {
            action: "Doc.Update".into(),
            doc_id: doc_id.clone(),
            space_id: msg.space_id.clone(),
          });
        }
        let generation = rooms
          .active_socket_doc_generations
          .get(socket_id)
          .and_then(|m| m.get(&key))
          .copied()
          .ok_or_else(|| SyncError::NotInSpace {
            space_id: msg.space_id.clone(),
          })?;
        Some(generation)
      } else {
        None
      };
      (perm_gen, protocol_version)
    };

    let update_bytes = BASE64
      .decode(&msg.update)
      .map_err(|_| SyncError::DocUpdateInvalid("invalid base64 update".into()))?;

    let write_result = self
      .storage
      .push_doc_update(
        msg.space_type,
        &msg.space_id,
        &doc_id,
        &update_bytes,
        &user.id,
        intent,
        permission_generation,
        protocol_version,
      )
      .await?;

    // Post-commit side effects:
    // 1. Local room fan-out (`space:broadcast-doc-invalidation` + `space:broadcast-doc-updates`)
    let broadcast_updates = BroadcastDocUpdatesMessage {
      space_type: msg.space_type,
      space_id: msg.space_id.clone(),
      doc_id: doc_id.clone(),
      updates: vec![msg.update.clone()],
      timestamp: write_result.timestamp,
      editor: Some(user.id.clone()),
      compressed: Some(false),
    };
    self
      .fanout_local_doc_update(engine, &broadcast_updates, Some(socket_id))
      .await;

    // 2. Redis invalidation channel (workspaceInventoryChanged on create + blobSource always)
    if msg.space_type == SpaceType::Workspace {
      if write_result.created {
        self
          .eventbus
          .publish_workspace_inventory_changed(&msg.space_id, Some(&doc_id))
          .await;
      }
      self
        .eventbus
        .publish_blob_source_current_doc(&msg.space_id, &doc_id)
        .await;
    }

    // 3. Redis EventBus broadcast (`sync.doc.updates.pushed`)
    self
      .eventbus
      .publish_doc_updates_pushed(
        msg.space_type,
        &msg.space_id,
        &doc_id,
        vec![msg.update],
        write_result.timestamp,
        Some(user.id.clone()),
        false,
        request_id,
      )
      .await;

    Ok(json!({
      "data": {
        "accepted": true,
        "timestamp": write_result.timestamp,
        "created": write_result.created,
      }
    }))
  }

  async fn on_load_doc(&self, socket_id: &str, payload: Value) -> Result<Value, SyncError> {
    let msg: LoadDocMessage =
      serde_json::from_value(payload).map_err(|e| SyncError::BadRequest(format!("Invalid load-doc payload: {e}")))?;
    let canonical_id = canonical_doc_id(&msg.doc_id, &msg.space_id)?;

    let permission_generation = {
      let rooms = self.rooms.read().await;
      self.assert_in_space(&rooms, socket_id, msg.space_type, &msg.space_id)?;
      let key = active_doc_key(msg.space_type, &msg.space_id, &canonical_id);
      rooms
        .active_socket_doc_generations
        .get(socket_id)
        .and_then(|m| m.get(&key))
        .copied()
        .ok_or_else(|| SyncError::NotInSpace {
          space_id: msg.space_id.clone(),
        })?
    };

    let state_vector = match msg.state_vector.as_deref() {
      Some(s) if !s.is_empty() => Some(
        BASE64
          .decode(s)
          .map_err(|_| SyncError::BadRequest("Invalid base64 stateVector".into()))?,
      ),
      _ => None,
    };

    let doc = self
      .storage
      .load_doc_diff(msg.space_type, &msg.space_id, &canonical_id, state_vector.as_deref())
      .await?;

    if msg.space_type == SpaceType::Workspace {
      let current_gen = self.storage.get_sync_permission_generation(&msg.space_id).await?;
      if current_gen != permission_generation {
        self
          .rooms
          .write()
          .await
          .remove_doc_subscription(socket_id, msg.space_type, &msg.space_id, &canonical_id);
        return Err(SyncError::NotInSpace { space_id: msg.space_id });
      }
    }

    let doc = doc.ok_or(SyncError::DocNotFound {
      space_id: msg.space_id,
      doc_id: msg.doc_id,
    })?;

    Ok(json!({
      "data": {
        "missing": BASE64.encode(&doc.missing),
        "state": BASE64.encode(&doc.state),
        "timestamp": doc.timestamp,
      }
    }))
  }

  async fn on_load_workspace_state(
    &self,
    socket_id: &str,
    user: &SyncUser,
    payload: Value,
  ) -> Result<Value, SyncError> {
    let msg: LoadWorkspaceStateMessage = serde_json::from_value(payload)
      .map_err(|e| SyncError::BadRequest(format!("Invalid load-workspace-state payload: {e}")))?;
    if msg.space_type != SpaceType::Workspace {
      return Err(SyncError::BadRequest("Workspace state requires a workspace.".into()));
    }
    {
      let rooms = self.rooms.read().await;
      self.assert_in_space(&rooms, socket_id, msg.space_type, &msg.space_id)?;
      if rooms.socket_protocol_versions.get(socket_id).copied() != Some(2) {
        return Err(SyncError::BadRequest(
          "Workspace state requires sync protocol 2.".into(),
        ));
      }
    }
    let state = self.storage.load_workspace_state(&msg.space_id, &user.id).await?;
    Ok(json!({ "data": state }))
  }

  async fn on_load_doc_timestamps(&self, socket_id: &str, user: &SyncUser, payload: Value) -> Result<Value, SyncError> {
    let msg: LoadDocTimestampsMessage = serde_json::from_value(payload)
      .map_err(|e| SyncError::BadRequest(format!("Invalid load-doc-timestamps payload: {e}")))?;
    {
      let rooms = self.rooms.read().await;
      self.assert_in_space(&rooms, socket_id, msg.space_type, &msg.space_id)?;
    }

    if msg.space_type == SpaceType::Userspace {
      let clocks = self
        .storage
        .load_userspace_doc_timestamps(&msg.space_id, msg.timestamp)
        .await?;
      return Ok(json!({ "data": clocks }));
    }

    let state = self.storage.load_workspace_state(&msg.space_id, &user.id).await?;
    let mut clocks = state.clocks;
    for doc in state.docs {
      clocks.insert(doc.doc_id, doc.timestamp);
    }
    if let Some(min_ts) = msg.timestamp {
      clocks.retain(|_, v| *v > min_ts);
    }
    Ok(json!({ "data": clocks }))
  }

  async fn on_delete_doc(&self, socket_id: &str, user: &SyncUser, payload: Value) -> Result<Value, SyncError> {
    let msg: DeleteDocMessage =
      serde_json::from_value(payload).map_err(|e| SyncError::BadRequest(format!("Invalid delete-doc payload: {e}")))?;
    let doc_id = canonical_doc_id(&msg.doc_id, &msg.space_id)?;
    {
      let rooms = self.rooms.read().await;
      self.assert_in_space(&rooms, socket_id, msg.space_type, &msg.space_id)?;
    }

    if msg.space_type == SpaceType::Workspace {
      self
        .storage
        .apply_doc_lifecycle(&msg.space_id, &doc_id, None, &user.id, DocLifecycleAction::Delete)
        .await?;
      self
        .eventbus
        .publish_workspace_inventory_changed(&msg.space_id, Some(&doc_id))
        .await;
    } else {
      if msg.space_id != user.id {
        return Err(SyncError::SpaceAccessDenied { space_id: msg.space_id });
      }
      self.storage.delete_userspace_doc(&msg.space_id, &doc_id).await?;
    }

    Ok(json!({ "data": { "success": true } }))
  }

  async fn on_doc_lifecycle(&self, socket_id: &str, user: &SyncUser, payload: Value) -> Result<Value, SyncError> {
    let msg: DocLifecycleMessage = serde_json::from_value(payload)
      .map_err(|e| SyncError::BadRequest(format!("Invalid doc-lifecycle payload: {e}")))?;
    let action = match msg.lifecycle.as_str() {
      "trash" => DocLifecycleAction::Trash,
      "restore" => DocLifecycleAction::Restore,
      "delete" => DocLifecycleAction::Delete,
      _ => return Err(SyncError::BadRequest("Invalid document lifecycle".into())),
    };
    let doc_id = canonical_doc_id(&msg.doc_id, &msg.space_id)?;
    if msg.space_type != SpaceType::Workspace {
      return Err(SyncError::DocActionDenied {
        action: if action == DocLifecycleAction::Delete {
          "Doc.Delete".into()
        } else {
          "Doc.Update".into()
        },
        doc_id,
        space_id: msg.space_id,
      });
    }
    {
      let rooms = self.rooms.read().await;
      self.assert_in_space(&rooms, socket_id, msg.space_type, &msg.space_id)?;
    }

    if msg.physical_doc_id.is_some() && action != DocLifecycleAction::Delete {
      return Err(SyncError::BadRequest(
        "logical document identity is only valid for deletion".into(),
      ));
    }

    let (storage_doc_id, logical_doc_id) = match msg.physical_doc_id {
      Some(phys) => {
        let phys_canonical = canonical_doc_id(&phys, &msg.space_id)?;
        let logical = (phys_canonical != doc_id).then_some(doc_id);
        (phys_canonical, logical)
      }
      None => (doc_id, None),
    };

    let result = self
      .storage
      .apply_doc_lifecycle(
        &msg.space_id,
        &storage_doc_id,
        logical_doc_id.as_deref(),
        &user.id,
        action,
      )
      .await?;

    self
      .eventbus
      .publish_workspace_inventory_changed(&msg.space_id, Some(&storage_doc_id))
      .await;

    let mut data = json!({ "timestamp": result.timestamp });
    if let Some(deleted) = result.deleted_doc_ids {
      data["deletedDocIds"] = json!(deleted);
    }
    Ok(json!({ "data": data }))
  }

  fn validate_realtime_client_version(payload: &Value) -> Result<(), SyncError> {
    const REQUIRED: &str = ">=0.26.0";
    let raw = payload
      .get("clientVersion")
      .and_then(Value::as_str)
      .map(str::trim)
      .filter(|s| !s.is_empty());
    let Some(ver) = raw else {
      return Err(SyncError::UnsupportedClientVersion {
        client_version: "unset_or_invalid".to_owned(),
        required_version: REQUIRED.to_owned(),
      });
    };
    if is_supported_realtime_client_version(ver) {
      Ok(())
    } else {
      Err(SyncError::UnsupportedClientVersion {
        client_version: ver.to_owned(),
        required_version: REQUIRED.to_owned(),
      })
    }
  }

  async fn on_realtime_request(&self, user: &SyncUser, payload: Value) -> Result<Value, SyncError> {
    Self::validate_realtime_client_version(&payload)?;
    let op = payload
      .get("op")
      .and_then(Value::as_str)
      .ok_or_else(|| SyncError::BadRequest("Missing realtime request op".into()))?;
    let input = payload.get("input").cloned().unwrap_or_else(|| json!({}));
    match op {
      "workspace.access.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let access = self
          .storage
          .get_workspace_access_snapshot(workspace_id, &user.id)
          .await?;
        Ok(json!({ "data": { "access": access } }))
      }
      "workspace.config.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let config = self
          .storage
          .get_workspace_config_snapshot(workspace_id, &user.id)
          .await?;
        Ok(json!({ "data": { "config": config } }))
      }
      "doc.share-state.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let doc_id = input
          .get("docId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing docId".into()))?;
        let state = self
          .storage
          .get_doc_share_state_snapshot(workspace_id, doc_id, &user.id)
          .await?;
        Ok(json!({ "data": { "state": state } }))
      }
      "doc.grants.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let doc_id = input
          .get("docId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing docId".into()))?;
        let pagination = input.get("pagination");
        let first = pagination
          .and_then(|p| p.get("first"))
          .and_then(Value::as_i64)
          .unwrap_or(10);
        let offset = pagination
          .and_then(|p| p.get("offset"))
          .and_then(Value::as_i64)
          .unwrap_or(0);
        let after = pagination.and_then(|p| p.get("after")).and_then(Value::as_str);
        let grants = self
          .storage
          .get_doc_grants_snapshot(workspace_id, doc_id, &user.id, first, offset, after)
          .await?;
        Ok(json!({ "data": grants }))
      }
      "user.settings.get" => {
        let settings = self.storage.get_user_settings_snapshot(&user.id).await?;
        Ok(json!({ "data": { "settings": settings } }))
      }
      "notification.count.get" => {
        let count = self.storage.get_notification_count_snapshot(&user.id).await?;
        Ok(json!({ "data": { "count": count } }))
      }
      "comment.changes.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let doc_id = input
          .get("docId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing docId".into()))?;
        let after = input.get("after").and_then(Value::as_str);
        let first = input.get("first").and_then(Value::as_i64);
        let changes = self
          .storage
          .get_comment_changes_snapshot(workspace_id, doc_id, &user.id, after, first)
          .await?;
        Ok(json!({ "data": changes }))
      }
      "workspace.members.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let skip = input.get("skip").and_then(Value::as_i64).unwrap_or(0).max(0);
        let take = input.get("take").and_then(Value::as_i64).unwrap_or(8).clamp(1, 100);
        let query = input.get("query").and_then(Value::as_str);
        let members = self
          .storage
          .get_workspace_members_snapshot(workspace_id, &user.id, skip, take, query)
          .await?;
        Ok(json!({ "data": members }))
      }
      "workspace.invite-link.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let invite_link = self
          .storage
          .get_workspace_invite_link_snapshot(workspace_id, &user.id)
          .await?;
        Ok(json!({ "data": { "inviteLink": invite_link } }))
      }
      "user.profile.get" => {
        let profile = self.storage.get_user_profile_snapshot(&user.id).await?;
        Ok(json!({ "data": { "user": profile } }))
      }
      "user.quota-state.get" => {
        let state = self.storage.get_user_quota_state_snapshot(&user.id).await?;
        Ok(json!({ "data": { "state": state } }))
      }
      "workspace.quota-state.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let state = self
          .storage
          .get_workspace_quota_state_snapshot(workspace_id, &user.id)
          .await?;
        Ok(json!({ "data": { "state": state } }))
      }
      "workspace.embedding.progress.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let progress = self
          .storage
          .copilot_realtime_get_embedding_progress(&user.id, workspace_id)
          .await?;
        Ok(json!({ "data": progress }))
      }
      "copilot.transcript.task.get" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let blob_id = input.get("blobId").and_then(Value::as_str).filter(|s| !s.is_empty());
        let task_id = input.get("taskId").and_then(Value::as_str).filter(|s| !s.is_empty());
        if blob_id.is_none() && task_id.is_none() {
          return Err(SyncError::BadRequest("Missing blobId or taskId".into()));
        }
        let task = self
          .storage
          .copilot_realtime_get_transcript_task(&user.id, workspace_id, blob_id, task_id)
          .await?;
        Ok(json!({ "data": { "task": task } }))
      }
      "copilot.transcript.task.retry" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let task_id = input
          .get("taskId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing taskId".into()))?;
        let task = self
          .storage
          .copilot_realtime_retry_transcript_task(&user.id, workspace_id, task_id)
          .await?;
        Ok(json!({ "data": { "task": task } }))
      }
      other => Err(SyncError::BadRequest(format!("Unsupported realtime op: {other}"))),
    }
  }

  async fn on_realtime_subscribe(&self, socket_id: &str, user: &SyncUser, payload: Value) -> Result<Value, SyncError> {
    Self::validate_realtime_client_version(&payload)?;
    let topic = payload
      .get("topic")
      .and_then(Value::as_str)
      .ok_or_else(|| SyncError::BadRequest("Missing realtime topic".into()))?;
    let input = payload.get("input").cloned().unwrap_or_else(|| json!({}));

    let room = match topic {
      "workspace.access.changed" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        self.storage.assert_workspace_readable(workspace_id, &user.id).await?;
        format!("workspace:{workspace_id}:access")
      }
      "workspace.members.changed" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        self
          .storage
          .assert_workspace_members_readable(workspace_id, &user.id)
          .await?;
        format!("workspace:{workspace_id}:members")
      }
      "workspace.config.changed" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        self
          .storage
          .assert_space_accessible(SpaceType::Workspace, workspace_id, &user.id)
          .await?;
        format!("workspace:{workspace_id}:config")
      }
      "doc.share-state.changed" | "doc.grants.changed" | "comment.changed" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let doc_id = input
          .get("docId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing docId".into()))?;
        let (rt_topic, scope) = match topic {
          "doc.share-state.changed" => (crate::storage::DocRealtimeTopic::ShareState, "share-state"),
          "doc.grants.changed" => (crate::storage::DocRealtimeTopic::Grants, "grants"),
          _ => (crate::storage::DocRealtimeTopic::Comment, "comment"),
        };
        self
          .storage
          .assert_doc_realtime_topic_access(workspace_id, doc_id, &user.id, rt_topic)
          .await?;
        format!("workspace:{workspace_id}:doc:{doc_id}:{scope}")
      }
      "workspace.invite-link.changed" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        self
          .storage
          .assert_workspace_invite_manage(workspace_id, &user.id)
          .await?;
        format!("workspace:{workspace_id}:invite-link")
      }
      "workspace.quota-state.changed" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        self.storage.assert_workspace_readable(workspace_id, &user.id).await?;
        format!("workspace:{workspace_id}:quota-state")
      }
      "workspace.embedding.progress.changed" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        self
          .storage
          .copilot_realtime_authorize_embedding_progress(&user.id, workspace_id)
          .await?;
        format!("workspace:{workspace_id}:embedding-progress")
      }
      "copilot.transcript.task.changed" => {
        let workspace_id = input
          .get("workspaceId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing workspaceId".into()))?;
        let task_id = input
          .get("taskId")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| SyncError::BadRequest("Missing taskId".into()))?;
        self
          .storage
          .copilot_realtime_authorize_transcript_task(&user.id, workspace_id, task_id)
          .await?;
        format!("copilot:transcript:{workspace_id}:{task_id}")
      }
      "notification.count.changed" => format!("user:{}:notification", user.id),
      "user.settings.changed" => format!("user:{}:settings", user.id),
      "user.profile.changed" => format!("user:{}:profile", user.id),
      "user.quota-state.changed" => format!("user:{}:quota-state", user.id),
      other => return Err(SyncError::BadRequest(format!("Unsupported realtime topic: {other}"))),
    };

    let input_key = realtime_input_key(&input);
    let subscription_id = format!("{socket_id}:{topic}:{input_key}");
    {
      const MAX_REALTIME_SUBSCRIPTIONS_PER_SOCKET: usize = 256;
      let mut rooms = self.rooms.write().await;
      if !rooms.realtime_subscriptions.contains_key(&subscription_id) {
        let current_count = rooms
          .realtime_subscriptions
          .values()
          .filter(|(sid, _)| sid == socket_id)
          .count();
        if current_count >= MAX_REALTIME_SUBSCRIPTIONS_PER_SOCKET {
          return Err(SyncError::BadRequest("Too many realtime subscriptions".into()));
        }
      }
      rooms.join_room(socket_id, &room);
      rooms
        .realtime_subscriptions
        .insert(subscription_id.clone(), (socket_id.to_owned(), room));
    }
    Ok(json!({ "data": { "subscriptionId": subscription_id } }))
  }

  async fn on_realtime_unsubscribe(&self, socket_id: &str, payload: Value) -> Result<Value, SyncError> {
    Self::validate_realtime_client_version(&payload)?;
    let Some(subscription_id) = payload
      .get("subscriptionId")
      .and_then(Value::as_str)
      .map(str::trim)
      .filter(|s| !s.is_empty())
    else {
      return Ok(json!({ "data": { "ok": true } }));
    };

    let mut rooms = self.rooms.write().await;
    let should_remove = rooms
      .realtime_subscriptions
      .get(subscription_id)
      .is_some_and(|(owner_sid, _)| owner_sid == socket_id);
    if should_remove && let Some((_, room)) = rooms.realtime_subscriptions.remove(subscription_id) {
      let still_subscribed = rooms
        .realtime_subscriptions
        .values()
        .any(|(sid, r)| sid == socket_id && r == &room);
      if !still_subscribed {
        rooms.leave_room(socket_id, &room);
      }
    }
    Ok(json!({ "data": { "ok": true } }))
  }

  async fn on_load_awarenesses(
    &self,
    engine: &Arc<EngineIoState>,
    socket_id: &str,
    payload: Value,
  ) -> Result<Value, SyncError> {
    let msg: LoadSpaceAwarenessesMessage = serde_json::from_value(payload)
      .map_err(|e| SyncError::BadRequest(format!("Invalid load-awarenesses payload: {e}")))?;
    let doc_id = canonical_doc_id(&msg.doc_id, &msg.space_id)?;
    let recipients = {
      let rooms = self.rooms.read().await;
      self.assert_in_space(&rooms, socket_id, msg.space_type, &msg.space_id)?;
      let key = active_doc_key(msg.space_type, &msg.space_id, &doc_id);
      if !rooms
        .active_socket_docs
        .get(socket_id)
        .is_some_and(|docs| docs.contains(&key))
      {
        return Err(SyncError::NotInSpace { space_id: msg.space_id });
      }
      rooms
        .active_doc_sockets
        .get(&key)
        .map(|s| {
          s.iter()
            .filter(|id| id.as_str() != socket_id)
            .cloned()
            .collect::<Vec<_>>()
        })
        .unwrap_or_default()
    };

    let body = json!({
      "spaceType": msg.space_type.as_str(),
      "spaceId": msg.space_id,
      "docId": doc_id,
    });
    for sid in recipients {
      engine.emit_to_socket(&sid, "space:collect-awareness", &body).await;
    }
    self
      .eventbus
      .publish_event(
        "sync.awareness.collect",
        json!({
          "spaceType": msg.space_type.as_str(),
          "spaceId": msg.space_id,
          "docId": doc_id,
          "sourceSocketId": socket_id,
        }),
        None,
      )
      .await;

    Ok(json!({ "data": { "clientId": socket_id } }))
  }

  async fn on_update_awareness(
    &self,
    engine: &Arc<EngineIoState>,
    socket_id: &str,
    payload: Value,
  ) -> Result<Value, SyncError> {
    let msg: UpdateAwarenessMessage = serde_json::from_value(payload)
      .map_err(|e| SyncError::BadRequest(format!("Invalid update-awareness payload: {e}")))?;
    let doc_id = canonical_doc_id(&msg.doc_id, &msg.space_id)?;
    let recipients = {
      let rooms = self.rooms.read().await;
      self.assert_in_space(&rooms, socket_id, msg.space_type, &msg.space_id)?;
      let key = active_doc_key(msg.space_type, &msg.space_id, &doc_id);
      if !rooms
        .active_socket_docs
        .get(socket_id)
        .is_some_and(|docs| docs.contains(&key))
      {
        return Err(SyncError::NotInSpace { space_id: msg.space_id });
      }
      rooms
        .active_doc_sockets
        .get(&key)
        .map(|s| {
          s.iter()
            .filter(|id| id.as_str() != socket_id)
            .cloned()
            .collect::<Vec<_>>()
        })
        .unwrap_or_default()
    };

    let body = json!({
      "spaceType": msg.space_type.as_str(),
      "spaceId": msg.space_id,
      "docId": doc_id,
      "awarenessUpdate": msg.awareness_update,
    });
    for sid in recipients {
      engine
        .emit_to_socket(&sid, "space:broadcast-awareness-update", &body)
        .await;
    }
    self
      .eventbus
      .publish_event(
        "sync.awareness.updated",
        json!({
          "spaceType": msg.space_type.as_str(),
          "spaceId": msg.space_id,
          "docId": doc_id,
          "awarenessUpdate": msg.awareness_update,
          "sourceSocketId": socket_id,
        }),
        None,
      )
      .await;

    Ok(json!({}))
  }

  async fn fanout_local_doc_update(
    &self,
    engine: &Arc<EngineIoState>,
    broadcast: &BroadcastDocUpdatesMessage,
    exclude_socket_id: Option<&str>,
  ) {
    let (batch_recipients, doc_recipients) = {
      let rooms = self.rooms.read().await;
      let batch_room = space_room(broadcast.space_type, &broadcast.space_id, "sync-027");
      let batch_sids: Vec<String> = rooms
        .room_sockets
        .get(&batch_room)
        .map(|s| {
          s.iter()
            .filter(|id| exclude_socket_id != Some(id.as_str()))
            .cloned()
            .collect()
        })
        .unwrap_or_default();

      let doc_key = active_doc_key(broadcast.space_type, &broadcast.space_id, &broadcast.doc_id);
      let doc_sids: Vec<String> = rooms
        .active_doc_sockets
        .get(&doc_key)
        .map(|s| {
          s.iter()
            .filter(|id| exclude_socket_id != Some(id.as_str()))
            .cloned()
            .collect()
        })
        .unwrap_or_default();

      (batch_sids, doc_sids)
    };

    let invalidation = BroadcastDocInvalidationMessage {
      space_type: broadcast.space_type,
      space_id: broadcast.space_id.clone(),
      timestamp: Some(broadcast.timestamp),
      inventory_changed: None,
    };
    let invalidation_val = serde_json::to_value(&invalidation).unwrap_or(Value::Null);
    for sid in batch_recipients {
      engine
        .emit_to_socket(&sid, "space:broadcast-doc-invalidation", &invalidation_val)
        .await;
    }

    let broadcast_val = serde_json::to_value(broadcast).unwrap_or(Value::Null);
    for sid in doc_recipients {
      engine
        .emit_to_socket(&sid, "space:broadcast-doc-updates", &broadcast_val)
        .await;
    }
  }

  async fn fanout_cluster_doc_update(&self, engine: &Arc<EngineIoState>, payload: SyncDocUpdatesPushedPayload) {
    let broadcast = BroadcastDocUpdatesMessage {
      space_type: payload.space_type,
      space_id: payload.space_id,
      doc_id: payload.doc_id,
      updates: payload.updates,
      timestamp: payload.timestamp,
      editor: payload.editor,
      compressed: Some(payload.compressed),
    };
    self.fanout_local_doc_update(engine, &broadcast, None).await;
  }

  async fn emit_inventory_invalidation(&self, engine: &Arc<EngineIoState>, space_type: SpaceType, space_id: &str) {
    let batch_recipients = {
      let rooms = self.rooms.read().await;
      let batch_room = space_room(space_type, space_id, "sync-027");
      rooms
        .room_sockets
        .get(&batch_room)
        .map(|s| s.iter().cloned().collect::<Vec<_>>())
        .unwrap_or_default()
    };

    let invalidation = BroadcastDocInvalidationMessage {
      space_type,
      space_id: space_id.to_owned(),
      timestamp: None,
      inventory_changed: Some(true),
    };
    let val = serde_json::to_value(&invalidation).unwrap_or(Value::Null);
    for sid in batch_recipients {
      engine
        .emit_to_socket(&sid, "space:broadcast-doc-invalidation", &val)
        .await;
    }
  }

  async fn handle_cluster_permissions_changed(
    &self,
    engine: &Arc<EngineIoState>,
    event: SyncPermissionsChangedPayload,
  ) {
    // 1. Evict targeted doc subscriptions immediately.
    {
      let mut rooms = self.rooms.write().await;
      rooms.evict_stale_subscriptions(&event);
    }

    // 2. For workspace spaces, also re-verify `Workspace.Sync` for all connected
    //    room members (fail-closed) so removed members are evicted from `sync`
    //    and `sync-027` rooms even in public workspaces, then notify remaining
    //    `sync-027` clients of `inventoryChanged: true`.
    if event.space_type == SpaceType::Workspace {
      self
        .revalidate_subscriptions(engine, Some((&event.space_id, event.doc_id.as_deref())))
        .await;
      return;
    }

    self
      .emit_inventory_invalidation(engine, event.space_type, &event.space_id)
      .await;
  }

  async fn doc_subscribers(
    &self,
    space_type: SpaceType,
    space_id: &str,
    doc_id: &str,
    exclude_socket_id: Option<&str>,
  ) -> Vec<String> {
    let rooms = self.rooms.read().await;
    let key = active_doc_key(space_type, space_id, doc_id);
    rooms
      .active_doc_sockets
      .get(&key)
      .map(|s| {
        s.iter()
          .filter(|id| exclude_socket_id != Some(id.as_str()))
          .cloned()
          .collect()
      })
      .unwrap_or_default()
  }

  fn assert_in_space(
    &self,
    rooms: &GatewayRooms,
    socket_id: &str,
    space_type: SpaceType,
    space_id: &str,
  ) -> Result<(), SyncError> {
    let room = space_room(space_type, space_id, "sync");
    if !rooms.is_in_room(socket_id, &room) {
      return Err(SyncError::NotInSpace {
        space_id: space_id.to_owned(),
      });
    }
    match rooms.socket_protocol_versions.get(socket_id).copied() {
      Some(1 | 2) => Ok(()),
      _ => Err(SyncError::BadRequest("Sync protocol upgrade required.".into())),
    }
  }
}

/// Parses `workspace:<ws>:doc:<doc>:<scope>` into `(workspace_id, doc_id, topic)`.
fn parse_doc_realtime_room(room: &str) -> Option<(&str, &str, crate::storage::DocRealtimeTopic)> {
  let rest = room.strip_prefix("workspace:")?;
  let (ws_id, after_ws) = rest.split_once(":doc:")?;
  let (doc_id, scope) = after_ws.rsplit_once(':')?;
  if ws_id.is_empty() || doc_id.is_empty() {
    return None;
  }
  let topic = crate::storage::DocRealtimeTopic::from_room_scope(scope)?;
  Some((ws_id, doc_id, topic))
}

/// Deterministic JSON serialization matching `getRealtimeInputKey` in
/// `packages/common/realtime/src/index.ts`.
fn realtime_input_key(input: &Value) -> String {
  match input {
    Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
      serde_json::to_string(input).unwrap_or_else(|_| "null".to_owned())
    }
    Value::Array(items) => {
      let inner = items.iter().map(realtime_input_key).collect::<Vec<_>>().join(",");
      format!("[{inner}]")
    }
    Value::Object(map) => {
      let mut keys: Vec<&str> = map.keys().map(String::as_str).collect();
      keys.sort_unstable();
      let inner = keys
        .into_iter()
        .map(|k| {
          let ek = serde_json::to_string(k).unwrap_or_else(|_| "\"\"".to_owned());
          format!("{ek}:{}", realtime_input_key(&map[k]))
        })
        .collect::<Vec<_>>()
        .join(",");
      format!("{{{inner}}}")
    }
  }
}

/// Validates realtime `clientVersion` (`>= 0.26.0-0` or valid canary date version).
fn is_supported_realtime_client_version(ver: &str) -> bool {
  let trimmed = ver.trim().trim_start_matches('v');
  if trimmed.is_empty() {
    return false;
  }
  let (core, pre) = match trimmed.split_once('-') {
    Some((c, p)) => (c, Some(p)),
    None => (trimmed, None),
  };
  let core = core.split('+').next().unwrap_or(core);
  let mut parts = core.split('.');
  let (Some(maj_s), Some(min_s), Some(pat_s), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else {
    return false;
  };
  let (Ok(maj), Ok(min), Ok(_pat)) = (maj_s.parse::<u64>(), min_s.parse::<u64>(), pat_s.parse::<u64>()) else {
    return false;
  };
  if maj > 0 || min >= 26 {
    return true;
  }
  // Allow non-expired canary date versions (within 30 days of current UTC date).
  if let Some(pre) = pre {
    let digits: String = pre.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() >= 8
      && pre.to_ascii_lowercase().contains("canary")
      && let Ok(date) = chrono::NaiveDate::parse_from_str(&digits[..8], "%Y%m%d")
    {
      let today = chrono::Utc::now().date_naive();
      if (today - date).num_days() <= 30 {
        return true;
      }
    }
  }
  false
}
