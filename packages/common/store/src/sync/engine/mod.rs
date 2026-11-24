mod acks;
mod handlers;

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::{
    BroadcastDocInvalidationMessage, BroadcastDocUpdatesMessage, DEFAULT_CLIENT_VERSION,
    DeleteDocMessage, DocLifecycleAction, DocLifecycleMessage, DocLifecycleResponse,
    EngineIoClient, EngineIoConfig, EngineIoOutput, JoinSpaceBatchEntry, JoinSpaceBatchMessage,
    JoinSpaceBatchResponse, LeaveSpaceBatchMessage, LoadDocMessage, LoadDocResponse,
    LoadDocTimestampsMessage, PushDocIntent, PushDocUpdateMessage, PushDocUpdateResponse,
    SPACE_BROADCAST_DOC_INVALIDATION, SPACE_BROADCAST_DOC_UPDATES, SPACE_DELETE_DOC,
    SPACE_DOC_LIFECYCLE, SPACE_JOIN_BATCH, SPACE_JOIN_BATCH_LIMIT, SPACE_LEAVE_BATCH,
    SPACE_LOAD_DOC, SPACE_LOAD_DOC_TIMESTAMPS, SPACE_PUSH_DOC_UPDATE, SocketIoClient,
    SocketIoEvent, SpaceType, TransportMode, WebsocketResponse,
};
use crate::{
    error::{StoreError, StoreResult},
    id_converter::IdConverter,
    workspace_db::WORKSPACE_SYNC_PROTOCOL_VERSION,
};

/// Socket.IO `40` CONNECT authentication mode.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub enum SocketAuthMode {
    /// Browser / Web Mobile: send empty `{}` auth object and rely on same-origin cookies.
    #[default]
    WebCookie,
    /// Native iOS / Android: send `{"token": ..., "tokenType": "jwt"}` in Socket.IO `40` CONNECT.
    NativeJwt { token: String },
}

impl SocketAuthMode {
    pub(super) fn to_connect_payload(&self) -> Value {
        match self {
            Self::WebCookie => json!({}),
            Self::NativeJwt { token } => json!({
                "token": token,
                "tokenType": "jwt",
            }),
        }
    }
}

/// Deterministic exponential backoff policy for reconnects and transient push retries.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReconnectPolicy {
    pub initial_delay_ms: i64,
    pub max_delay_ms: i64,
    pub ack_timeout_ms: i64,
}

impl Default for ReconnectPolicy {
    fn default() -> Self {
        Self {
            initial_delay_ms: 1_000,
            max_delay_ms: 30_000,
            ack_timeout_ms: 15_000,
        }
    }
}

impl ReconnectPolicy {
    pub fn backoff_ms(&self, attempt: u32) -> i64 {
        let shift = attempt.min(20);
        let factor = 1i64.checked_shl(shift).unwrap_or(i64::MAX);
        self.initial_delay_ms
            .saturating_mul(factor)
            .min(self.max_delay_ms)
    }
}

/// Configuration for [`SpaceSyncEngine`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpaceSyncConfig {
    pub space_type: SpaceType,
    pub space_id: String,
    pub account_id: Option<String>,
    pub client_version: String,
    pub protocol_version: u8,
    pub transport_mode: TransportMode,
    pub auth_mode: SocketAuthMode,
    pub defer_offline_replay_on_join: bool,
    pub reconnect: ReconnectPolicy,
}

impl SpaceSyncConfig {
    pub fn workspace(space_id: impl Into<String>, is_self_hosted: bool) -> Self {
        Self {
            space_type: SpaceType::Workspace,
            space_id: space_id.into(),
            account_id: None,
            client_version: DEFAULT_CLIENT_VERSION.to_string(),
            protocol_version: WORKSPACE_SYNC_PROTOCOL_VERSION,
            transport_mode: if is_self_hosted {
                TransportMode::PollingThenWebsocket
            } else {
                TransportMode::WebsocketOnly
            },
            auth_mode: SocketAuthMode::WebCookie,
            defer_offline_replay_on_join: false,
            reconnect: ReconnectPolicy::default(),
        }
    }
}

/// Persisted offline update queued for ordered replay once connected and joined.
///
/// Tagged with `account_id` so switching accounts never leaks one account's unsynced writes
/// into another account's session.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct OfflinePendingUpdate {
    pub doc_id: String,
    pub update: Vec<u8>,
    pub intent: PushDocIntent,
    #[serde(default)]
    pub account_id: Option<String>,
}

/// Serializable snapshot of unsynced state persisted across restarts.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct SyncEngineSnapshot {
    pub offline_queue: Vec<OfflinePendingUpdate>,
}

/// Connection and join lifecycle state of [`SpaceSyncEngine`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SpaceSyncState {
    Offline,
    Connecting,
    Joining,
    Ready,
    ReconnectScheduled { next_attempt_at_ms: i64 },
    AuthRequired,
    PermissionRevoked,
}

/// Outbound transport commands emitted by [`SpaceSyncEngine`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SpaceSyncOutbound {
    Transport(EngineIoOutput),
    ScheduleTimerAtMs(i64),
}

/// Domain events delivered to the application by [`SpaceSyncEngine`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SpaceSyncEvent {
    Joined {
        client_id: String,
        protocol_version: u8,
        client_version: Option<String>,
    },
    DocsJoined {
        doc_ids: Vec<String>,
    },
    DocLoaded {
        doc_id: String,
        missing: Vec<u8>,
        state: Vec<u8>,
        timestamp: i64,
    },
    DocNotFound {
        doc_id: String,
    },
    DocUpdatePushed {
        doc_id: String,
        timestamp: i64,
        created: bool,
    },
    DocTimestampsLoaded {
        timestamps: BTreeMap<String, i64>,
    },
    DocDeleted {
        doc_id: String,
    },
    DocLifecycleApplied {
        doc_id: String,
        lifecycle: DocLifecycleAction,
        timestamp: i64,
        deleted_doc_ids: Option<Vec<String>>,
    },
    RemoteDocUpdates {
        doc_id: String,
        updates: Vec<Vec<u8>>,
        timestamp: i64,
        editor: Option<String>,
    },
    DocInvalidated {
        timestamp: Option<i64>,
        inventory_changed: bool,
    },
    AuthRequired {
        doc_id: Option<String>,
        code: String,
        message: String,
    },
    PermissionRevoked {
        doc_id: Option<String>,
        code: String,
        message: String,
    },
    RequestFailed {
        op: &'static str,
        doc_id: Option<String>,
        code: String,
        message: String,
    },
    Disconnected {
        reason: String,
        next_reconnect_ms: i64,
    },
}

pub(super) enum DeferredAfterJoin {
    LoadDoc {
        doc_id: String,
        state_vector: Option<Vec<u8>>,
        retried_not_in_space: bool,
    },
    PushDocUpdate {
        entry: OfflinePendingUpdate,
        retried_not_in_space: bool,
    },
}

pub(super) enum InFlightRequest {
    InitialJoin {
        root_wire_id: String,
    },
    JoinDocs {
        wire_doc_ids: Vec<String>,
        deferred: Option<DeferredAfterJoin>,
    },
    LoadDoc {
        doc_id: String,
        wire_doc_id: String,
        state_vector: Option<Vec<u8>>,
        retried_not_in_space: bool,
    },
    PushDocUpdate {
        entry: OfflinePendingUpdate,
        wire_doc_id: String,
        retried_not_in_space: bool,
    },
    LoadDocTimestamps,
    DeleteDoc {
        doc_id: String,
    },
    DocLifecycle {
        doc_id: String,
        lifecycle: DocLifecycleAction,
    },
}

pub(super) struct PendingAck {
    pub(super) sent_at_ms: i64,
    pub(super) request: InFlightRequest,
}

/// Pure deterministic sans-I/O state machine for AFFiNE `SpaceSync` over Engine.IO v4 + Socket.IO v4.
pub struct SpaceSyncEngine {
    pub(super) config: SpaceSyncConfig,
    pub(super) state: SpaceSyncState,
    pub(super) engine_io: EngineIoClient,
    pub(super) socket_io: SocketIoClient,
    pub(super) id_converter: IdConverter,
    pub(super) joined_doc_ids: BTreeSet<String>,
    pub(super) pending_deletes: BTreeMap<String, String>,
    pub(super) offline_queue: VecDeque<OfflinePendingUpdate>,
    pub(super) rejected_updates: Vec<OfflinePendingUpdate>,
    pub(super) in_flight: BTreeMap<u64, PendingAck>,
    pub(super) reconnect_attempts: u32,
    pub(super) offline_retry_attempts: u32,
    pub(super) next_offline_retry_at_ms: Option<i64>,
    pub(super) waiting_for_id_converter: bool,
    pub(super) engine_io_outputs: VecDeque<EngineIoOutput>,
    pub(super) flushing_engine_io: bool,
    pub(super) outbound: Vec<SpaceSyncOutbound>,
    pub(super) events: Vec<SpaceSyncEvent>,
}

impl SpaceSyncEngine {
    pub fn new(config: SpaceSyncConfig, id_converter: IdConverter) -> Self {
        let engine_io = EngineIoClient::new(EngineIoConfig {
            transport_mode: config.transport_mode,
        });
        Self {
            config,
            state: SpaceSyncState::Offline,
            engine_io,
            socket_io: SocketIoClient::new(),
            id_converter,
            joined_doc_ids: BTreeSet::new(),
            pending_deletes: BTreeMap::new(),
            offline_queue: VecDeque::new(),
            rejected_updates: Vec::new(),
            in_flight: BTreeMap::new(),
            reconnect_attempts: 0,
            offline_retry_attempts: 0,
            next_offline_retry_at_ms: None,
            waiting_for_id_converter: false,
            engine_io_outputs: VecDeque::new(),
            flushing_engine_io: false,
            outbound: Vec::new(),
            events: Vec::new(),
        }
    }

    pub fn state(&self) -> SpaceSyncState {
        self.state
    }

    pub fn account_id(&self) -> Option<&str> {
        self.config.account_id.as_deref()
    }

    /// Update the Socket.IO `40` CONNECT authentication mode (for JWT refresh or account switch).
    pub fn set_auth_mode(&mut self, auth_mode: SocketAuthMode) {
        self.config.auth_mode = auth_mode;
    }

    pub fn id_converter(&self) -> &IdConverter {
        &self.id_converter
    }

    pub fn set_id_converter(&mut self, converter: IdConverter) {
        self.id_converter = converter;
    }

    /// Update `IdConverter` after initial `space:join-batch` and drain matching offline writes.
    pub fn notify_id_converter_ready(&mut self, converter: IdConverter, now_ms: i64) {
        self.id_converter = converter;
        self.waiting_for_id_converter = false;
        if self.state == SpaceSyncState::Ready {
            self.replay_offline_queue(now_ms);
        }
    }

    /// Inspect doc-level rejected updates quarantined out of `offline_queue`.
    pub fn rejected_updates(&self) -> &[OfflinePendingUpdate] {
        &self.rejected_updates
    }

    /// Drain doc-level rejected updates for application-layer conflict or permission handling.
    pub fn drain_rejected_updates(&mut self) -> Vec<OfflinePendingUpdate> {
        std::mem::take(&mut self.rejected_updates)
    }

    /// Return the set of wire document IDs currently subscribed on this connection.
    pub fn joined_wire_doc_ids(&self) -> &BTreeSet<String> {
        &self.joined_doc_ids
    }

    /// Snapshot the offline queue for persistence across restarts.
    pub fn offline_queue(&self) -> &VecDeque<OfflinePendingUpdate> {
        &self.offline_queue
    }

    /// Build a serializable snapshot of all unsynced writes (unacknowledged in-flight pushes and
    /// waiting-for-join deferred pushes in send order, followed by `offline_queue`), preserving
    /// each write's `account_id`.
    ///
    /// Document-level `rejected_updates` are intentionally excluded so permission-denied writes
    /// are not replayed across restarts; hosts inspect or drain them via [`Self::rejected_updates`]
    /// and [`Self::drain_rejected_updates`] when handling `PermissionRevoked`.
    pub fn snapshot(&self) -> SyncEngineSnapshot {
        let mut queue = Vec::with_capacity(self.in_flight.len() + self.offline_queue.len());
        for pending in self.in_flight.values() {
            match &pending.request {
                InFlightRequest::PushDocUpdate { entry, .. }
                | InFlightRequest::JoinDocs {
                    deferred: Some(DeferredAfterJoin::PushDocUpdate { entry, .. }),
                    ..
                } => {
                    queue.push(entry.clone());
                }
                _ => {}
            }
        }
        queue.extend(self.offline_queue.iter().cloned());
        SyncEngineSnapshot {
            offline_queue: queue,
        }
    }

    /// Restore a previously persisted snapshot before connecting.
    pub fn restore_snapshot(&mut self, snapshot: SyncEngineSnapshot) {
        self.offline_queue.extend(snapshot.offline_queue);
    }

    /// Restore a previously persisted offline queue before connecting.
    pub fn restore_offline_queue(&mut self, pending: Vec<OfflinePendingUpdate>) {
        self.offline_queue.extend(pending);
    }

    /// Resume syncing after `AuthRequired` / `PermissionRevoked` (or `Offline`) under `account_id`
    /// with fresh Socket.IO authentication credentials.
    pub fn resume_with_auth(
        &mut self,
        account_id: Option<String>,
        auth_mode: SocketAuthMode,
        now_ms: i64,
    ) {
        self.config.auth_mode = auth_mode;
        self.resume_with_account(account_id, now_ms);
    }

    /// Resume syncing after `AuthRequired` / `PermissionRevoked` (or `Offline`) under `account_id`.
    ///
    /// Writes queued under the same `account_id` are automatically replayed once joined; writes
    /// belonging to a different `account_id` remain isolated and frozen.
    pub fn resume_with_account(&mut self, account_id: Option<String>, now_ms: i64) {
        self.config.account_id = account_id;
        self.reconnect_attempts = 0;
        self.offline_retry_attempts = 0;
        self.next_offline_retry_at_ms = None;
        self.waiting_for_id_converter = false;
        self.state = SpaceSyncState::Connecting;
        self.engine_io.connect(now_ms);
        self.flush_engine_io_outputs(now_ms);
    }

    /// Explicitly discard queued offline writes belonging to `account_id`.
    pub fn discard_offline_writes_for_account(&mut self, account_id: Option<&str>) -> usize {
        let before = self.offline_queue.len();
        self.offline_queue
            .retain(|entry| entry.account_id.as_deref() != account_id);
        before - self.offline_queue.len()
    }

    /// Begin connecting to the remote sync server at deterministic timestamp `now_ms`.
    pub fn connect(&mut self, now_ms: i64) {
        if matches!(
            self.state,
            SpaceSyncState::AuthRequired | SpaceSyncState::PermissionRevoked
        ) {
            return;
        }
        self.state = SpaceSyncState::Connecting;
        self.engine_io.connect(now_ms);
        self.flush_engine_io_outputs(now_ms);
    }

    /// Gracefully disconnect, requeue in-flight pushes, reset `EngineIoClient`, and close transport.
    pub fn disconnect(&mut self, now_ms: i64) {
        self.requeue_in_flight_pushes(None);
        self.joined_doc_ids.clear();
        self.next_offline_retry_at_ms = None;
        self.state = SpaceSyncState::Offline;
        self.engine_io.disconnect();
        self.flush_engine_io_outputs(now_ms);
    }

    /// Explicitly subscribe to a deduplicated list of local document IDs in batches of
    /// `SPACE_JOIN_BATCH_LIMIT`.
    pub fn join_docs(&mut self, local_doc_ids: &[&str], now_ms: i64) -> StoreResult<Vec<u64>> {
        self.ensure_ready()?;
        let mut seen = BTreeSet::new();
        let mut wire_ids = Vec::new();
        for id in local_doc_ids {
            let wire = self.id_converter.new_id_to_old_id(id);
            if !self.joined_doc_ids.contains(&wire) && seen.insert(wire.clone()) {
                wire_ids.push(wire);
            }
        }
        let mut ack_ids = Vec::new();
        for chunk in wire_ids.chunks(SPACE_JOIN_BATCH_LIMIT) {
            let ack = self.send_join_docs_batch(chunk.to_vec(), None, now_ms)?;
            ack_ids.push(ack);
        }
        Ok(ack_ids)
    }

    /// Emit `space:leave-batch` in batches of `SPACE_JOIN_BATCH_LIMIT` followed by an empty
    /// `docIds: []` leave packet, then reset `EngineIoClient` and close the underlying transport.
    pub fn leave_space(&mut self, now_ms: i64) -> StoreResult<()> {
        let doc_ids: Vec<String> = std::mem::take(&mut self.joined_doc_ids)
            .into_iter()
            .collect();
        for chunk in doc_ids.chunks(SPACE_JOIN_BATCH_LIMIT) {
            let msg = LeaveSpaceBatchMessage {
                space_type: self.config.space_type,
                space_id: self.config.space_id.clone(),
                doc_ids: chunk.to_vec(),
            };
            let pkt = self
                .socket_io
                .encode_event(SPACE_LEAVE_BATCH, serde_json::to_value(msg)?)?;
            self.engine_io.send_message(&pkt)?;
        }
        let final_msg = LeaveSpaceBatchMessage {
            space_type: self.config.space_type,
            space_id: self.config.space_id.clone(),
            doc_ids: Vec::new(),
        };
        let pkt = self
            .socket_io
            .encode_event(SPACE_LEAVE_BATCH, serde_json::to_value(final_msg)?)?;
        self.engine_io.send_message(&pkt)?;
        self.flush_engine_io_outputs(now_ms);

        self.requeue_in_flight_pushes(None);
        self.next_offline_retry_at_ms = None;
        self.state = SpaceSyncState::Offline;
        self.engine_io.disconnect();
        self.flush_engine_io_outputs(now_ms);
        Ok(())
    }

    /// Queue or immediately push a local document update tagged with the active `account_id`.
    pub fn push_doc_update(
        &mut self,
        doc_id: impl Into<String>,
        update: Vec<u8>,
        intent: PushDocIntent,
        now_ms: i64,
    ) -> StoreResult<()> {
        let entry = OfflinePendingUpdate {
            doc_id: doc_id.into(),
            update,
            intent,
            account_id: self.config.account_id.clone(),
        };
        if self.state == SpaceSyncState::Ready && !self.waiting_for_id_converter {
            self.dispatch_push_doc_update(entry, false, now_ms)
        } else {
            self.offline_queue.push_back(entry);
            Ok(())
        }
    }

    /// Request a document snapshot/diff via `space:load-doc`.
    pub fn load_doc(
        &mut self,
        doc_id: &str,
        state_vector: Option<&[u8]>,
        now_ms: i64,
    ) -> StoreResult<u64> {
        self.ensure_ready()?;
        self.dispatch_load_doc(
            doc_id.to_string(),
            state_vector.map(|sv| sv.to_vec()),
            false,
            now_ms,
        )
    }

    /// Request document timestamps via `space:load-doc-timestamps`.
    pub fn load_doc_timestamps(&mut self, after_ms: Option<i64>, now_ms: i64) -> StoreResult<u64> {
        self.ensure_ready()?;
        let msg = LoadDocTimestampsMessage {
            space_type: self.config.space_type,
            space_id: self.config.space_id.clone(),
            timestamp: after_ms,
        };
        let (ack_id, packet) = self
            .socket_io
            .encode_event_with_ack(SPACE_LOAD_DOC_TIMESTAMPS, serde_json::to_value(msg)?)?;
        self.in_flight.insert(
            ack_id,
            PendingAck {
                sent_at_ms: now_ms,
                request: InFlightRequest::LoadDocTimestamps,
            },
        );
        self.engine_io.send_message(&packet)?;
        self.flush_engine_io_outputs(now_ms);
        Ok(ack_id)
    }

    /// Request document deletion via `space:delete-doc`.
    pub fn delete_doc(&mut self, doc_id: &str, now_ms: i64) -> StoreResult<u64> {
        self.ensure_ready()?;
        let msg = DeleteDocMessage {
            space_type: self.config.space_type,
            space_id: self.config.space_id.clone(),
            doc_id: self.id_converter.new_id_to_old_id(doc_id),
        };
        let (ack_id, packet) = self
            .socket_io
            .encode_event_with_ack(SPACE_DELETE_DOC, serde_json::to_value(msg)?)?;
        self.in_flight.insert(
            ack_id,
            PendingAck {
                sent_at_ms: now_ms,
                request: InFlightRequest::DeleteDoc {
                    doc_id: doc_id.to_string(),
                },
            },
        );
        self.engine_io.send_message(&packet)?;
        self.flush_engine_io_outputs(now_ms);
        Ok(ack_id)
    }

    /// Apply a document lifecycle transition (`trash`, `restore`, `delete`) via `space:doc-lifecycle`.
    pub fn apply_doc_lifecycle(
        &mut self,
        doc_id: &str,
        lifecycle: DocLifecycleAction,
        now_ms: i64,
    ) -> StoreResult<u64> {
        self.ensure_ready()?;
        let (wire_doc_id, physical_doc_id) = match lifecycle {
            DocLifecycleAction::Delete => {
                let phys = self
                    .pending_deletes
                    .entry(doc_id.to_string())
                    .or_insert_with(|| self.id_converter.new_id_to_old_id(doc_id))
                    .clone();
                (doc_id.to_string(), Some(phys))
            }
            DocLifecycleAction::Trash | DocLifecycleAction::Restore => {
                (self.id_converter.new_id_to_old_id(doc_id), None)
            }
        };
        let msg = DocLifecycleMessage {
            space_type: self.config.space_type,
            space_id: self.config.space_id.clone(),
            doc_id: wire_doc_id,
            lifecycle,
            physical_doc_id,
        };
        let (ack_id, packet) = self
            .socket_io
            .encode_event_with_ack(SPACE_DOC_LIFECYCLE, serde_json::to_value(msg)?)?;
        self.in_flight.insert(
            ack_id,
            PendingAck {
                sent_at_ms: now_ms,
                request: InFlightRequest::DocLifecycle {
                    doc_id: doc_id.to_string(),
                    lifecycle,
                },
            },
        );
        self.engine_io.send_message(&packet)?;
        self.flush_engine_io_outputs(now_ms);
        Ok(ack_id)
    }

    /// Feed an HTTP long-polling response body at `now_ms`.
    pub fn on_polling_response(&mut self, body: &str, now_ms: i64) -> StoreResult<()> {
        self.engine_io.on_polling_response(body, now_ms)?;
        self.flush_engine_io_outputs(now_ms);
        Ok(())
    }

    /// Notify that the in-flight HTTP long-polling `POST` completed at `now_ms`.
    pub fn on_polling_post_complete(&mut self, now_ms: i64) -> StoreResult<()> {
        self.engine_io.on_polling_post_complete(now_ms)?;
        self.flush_engine_io_outputs(now_ms);
        Ok(())
    }

    /// Notify that the in-flight HTTP long-polling `POST` failed at `now_ms`.
    pub fn on_polling_post_error(&mut self, reason: &str, now_ms: i64) {
        self.engine_io.on_polling_post_error(reason, now_ms);
        self.flush_engine_io_outputs(now_ms);
    }

    /// Notify that the WebSocket connection opened at `now_ms`.
    pub fn on_ws_open(&mut self, now_ms: i64) {
        self.engine_io.on_ws_open(now_ms);
        self.flush_engine_io_outputs(now_ms);
    }

    /// Notify that the WebSocket transport failed or closed.
    pub fn on_ws_error(&mut self, reason: &str, now_ms: i64) {
        self.engine_io.on_ws_error(reason, now_ms);
        self.flush_engine_io_outputs(now_ms);
    }

    /// Feed an inbound WebSocket text frame at `now_ms`.
    pub fn on_ws_text(&mut self, frame: &str, now_ms: i64) -> StoreResult<()> {
        self.engine_io.on_ws_text(frame, now_ms)?;
        self.flush_engine_io_outputs(now_ms);
        Ok(())
    }

    /// Feed an inbound WebSocket binary frame at `now_ms`.
    pub fn on_ws_binary(&mut self, bytes: Vec<u8>, now_ms: i64) -> StoreResult<()> {
        self.engine_io.on_ws_binary(bytes, now_ms);
        self.flush_engine_io_outputs(now_ms);
        Ok(())
    }

    /// Notify the engine that the underlying transport dropped at `now_ms`.
    pub fn on_transport_error(&mut self, reason: &str, now_ms: i64) {
        self.handle_disconnect(reason, now_ms);
    }

    /// Advance deterministic timers (heartbeat/connect timeout, ACK timeouts, shelved push retries,
    /// and reconnect backoff).
    pub fn on_tick(&mut self, now_ms: i64) -> StoreResult<()> {
        if let SpaceSyncState::ReconnectScheduled { next_attempt_at_ms } = self.state {
            if now_ms >= next_attempt_at_ms {
                self.connect(now_ms);
            }
            return Ok(());
        }

        if self.engine_io.poll_timeout(now_ms) {
            self.flush_engine_io_outputs(now_ms);
            return Ok(());
        }

        if self.state == SpaceSyncState::Ready
            && !self.waiting_for_id_converter
            && self
                .next_offline_retry_at_ms
                .is_some_and(|retry_at| now_ms >= retry_at)
        {
            self.next_offline_retry_at_ms = None;
            self.replay_offline_queue(now_ms);
        }

        let timed_out_ids: Vec<u64> = self
            .in_flight
            .iter()
            .filter(|(_, pending)| {
                now_ms.saturating_sub(pending.sent_at_ms) >= self.config.reconnect.ack_timeout_ms
            })
            .map(|(id, _)| *id)
            .collect();

        for ack_id in timed_out_ids {
            if let Some(pending) = self.in_flight.remove(&ack_id) {
                self.handle_ack_timeout(pending.request, now_ms)?;
            }
        }

        Ok(())
    }

    pub fn drain_outbound(&mut self) -> Vec<SpaceSyncOutbound> {
        std::mem::take(&mut self.outbound)
    }

    pub fn drain_events(&mut self) -> Vec<SpaceSyncEvent> {
        std::mem::take(&mut self.events)
    }

    fn ensure_ready(&self) -> StoreResult<()> {
        if self.state != SpaceSyncState::Ready {
            return Err(StoreError::InvalidProtocol(
                "SpaceSyncEngine is not in Ready state".into(),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

    use super::*;

    fn connect_and_join_ws(engine: &mut SpaceSyncEngine) {
        engine.connect(1_000);
        let _ = engine.drain_outbound();
        let open =
            r#"0{"sid":"e1","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;
        engine.on_polling_response(open, 1_050).unwrap();
        engine.on_ws_open(1_100);
        // Drain the in-flight polling GET + POST so the WS upgrade barrier completes cleanly.
        engine.on_polling_response("6", 1_120).unwrap();
        engine.on_polling_post_complete(1_130).unwrap();
        engine.on_ws_text("3probe", 1_150).unwrap();
        engine.on_ws_text(r#"40{"sid":"sio-1"}"#, 1_200).unwrap();
        let _ = engine.drain_outbound();
        engine
            .on_ws_text(
                r#"430[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#,
                1_300,
            )
            .unwrap();
        let _ = engine.drain_events();
        let _ = engine.drain_outbound();
    }

    #[test]
    fn offline_queue_replay_ack_timeout_retry_and_permission_revocation() {
        let config = SpaceSyncConfig::workspace("ws-1", true);
        let mut engine = SpaceSyncEngine::new(config, IdConverter::new("ws-1"));

        engine
            .push_doc_update("doc-1", vec![1, 2, 3], PushDocIntent::Update, 100)
            .unwrap();
        assert_eq!(engine.offline_queue().len(), 1);

        engine.connect(1_000);
        let _ = engine.drain_outbound();
        let open =
            r#"0{"sid":"e1","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;
        engine.on_polling_response(open, 1_050).unwrap();
        engine.on_ws_open(1_100);
        engine.on_polling_response("6", 1_120).unwrap();
        engine.on_polling_post_complete(1_130).unwrap();
        engine.on_ws_text("3probe", 1_150).unwrap();
        engine.on_ws_text(r#"40{"sid":"sio-1"}"#, 1_200).unwrap();
        let out = engine.drain_outbound();
        assert!(out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.contains(SPACE_JOIN_BATCH) && t.contains("\"clientVersion\":\"0.27.5\"")
        )));

        engine
            .on_ws_text(
                r#"430[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#,
                1_300,
            )
            .unwrap();
        assert_eq!(engine.state(), SpaceSyncState::Ready);
        assert!(engine.joined_wire_doc_ids().contains("ws-1"));
        assert!(engine.offline_queue().is_empty());

        // ACK timeout retries push_doc_update with new ack_id = 2.
        let _ = engine.drain_outbound();
        engine.on_tick(1_300 + 15_000).unwrap();
        let retry_out = engine.drain_outbound();
        assert!(retry_out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.starts_with("422[\"space:push-doc-update\"")
        )));

        engine
            .on_ws_text(
                r#"432[{"data":{"accepted":true,"timestamp":9999,"created":true}}]"#,
                16_500,
            )
            .unwrap();
        assert!(
            engine
                .drain_events()
                .contains(&SpaceSyncEvent::DocUpdatePushed {
                    doc_id: "doc-1".into(),
                    timestamp: 9_999,
                    created: true,
                })
        );

        // Inbound broadcast maps oldId -> newId and decodes base64.
        let bcast = format!(
            r#"42["space:broadcast-doc-updates",{{"spaceType":"workspace","spaceId":"ws-1","docId":"db$ws-1$folders","updates":["{}"],"timestamp":10001}}]"#,
            BASE64.encode([9, 8, 7])
        );
        engine.on_ws_text(&bcast, 17_000).unwrap();
        assert_eq!(
            engine.drain_events(),
            vec![SpaceSyncEvent::RemoteDocUpdates {
                doc_id: "db$folders".into(),
                updates: vec![vec![9, 8, 7]],
                timestamp: 10_001,
                editor: None,
            }]
        );

        // Load root doc (already joined) -> permission revocation pauses sync.
        let ack_id = engine.load_doc("ws-1", None, 17_500).unwrap();
        let err_ack = format!(
            r#"43{ack_id}[{{"error":{{"status":403,"code":"SPACE_ACCESS_DENIED","name":"SPACE_ACCESS_DENIED","message":"denied"}}}}]"#
        );
        engine.on_ws_text(&err_ack, 17_600).unwrap();
        assert_eq!(engine.state(), SpaceSyncState::PermissionRevoked);
        assert!(matches!(
            engine.drain_events().as_slice(),
            [SpaceSyncEvent::PermissionRevoked { code, .. }] if code == "SPACE_ACCESS_DENIED"
        ));
    }

    #[test]
    fn auth_required_preserves_inflight_and_queued_writes_isolated_per_account() {
        let mut config = SpaceSyncConfig::workspace("ws-auth", false);
        config.account_id = Some("acct-A".into());
        config.auth_mode = SocketAuthMode::NativeJwt {
            token: "jwt-a".into(),
        };
        let mut engine = SpaceSyncEngine::new(config, IdConverter::new("ws-auth"));

        // Direct WebSocket connect verifies JWT auth payload in Socket.IO 40 CONNECT.
        engine.connect(1_000);
        let _ = engine.drain_outbound();
        engine
            .on_ws_text(
                r#"0{"sid":"e-jwt","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
                1_050,
            )
            .unwrap();
        let connect_out = engine.drain_outbound();
        assert!(connect_out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.contains("\"token\":\"jwt-a\"") && t.contains("\"tokenType\":\"jwt\"")
        )));
        engine.on_ws_text(r#"40{"sid":"sio-jwt"}"#, 1_100).unwrap();
        let _ = engine.drain_outbound();
        engine
            .on_ws_text(
                r#"430[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#,
                1_150,
            )
            .unwrap();
        let _ = engine.drain_events();
        let _ = engine.drain_outbound();

        // Doc 1 is in-flight (ack_id = 1); Doc 2 is also queued (simulate via offline_queue).
        engine
            .push_doc_update("doc-inflight", vec![1, 1], PushDocIntent::Update, 2_000)
            .unwrap();
        engine.offline_queue.push_back(OfflinePendingUpdate {
            doc_id: "doc-queued".into(),
            update: vec![2, 2],
            intent: PushDocIntent::Update,
            account_id: Some("acct-A".into()),
        });
        let _ = engine.drain_outbound();

        // Server rejects doc-inflight with AUTHENTICATION_REQUIRED.
        engine
            .on_ws_text(
                r#"431[{"error":{"status":401,"code":"AUTHENTICATION_REQUIRED","name":"AUTHENTICATION_REQUIRED","message":"expired"}}]"#,
                2_100,
            )
            .unwrap();
        assert_eq!(engine.state(), SpaceSyncState::AuthRequired);
        assert!(matches!(
            engine.drain_events().as_slice(),
            [SpaceSyncEvent::AuthRequired { code, .. }] if code == "AUTHENTICATION_REQUIRED"
        ));

        // Both doc-inflight (first) and doc-queued (second) MUST be preserved in order!
        let snap = engine.snapshot();
        assert_eq!(snap.offline_queue.len(), 2);
        assert_eq!(snap.offline_queue[0].doc_id, "doc-inflight");
        assert_eq!(snap.offline_queue[1].doc_id, "doc-queued");
        assert_eq!(snap.offline_queue[0].account_id.as_deref(), Some("acct-A"));

        // Switching to a different account (acct-B) must NOT send acct-A's writes!
        engine.resume_with_account(Some("acct-B".into()), 3_000);
        let _ = engine.drain_outbound();
        engine
            .on_ws_text(
                r#"0{"sid":"e-b","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
                3_050,
            )
            .unwrap();
        engine.on_ws_text(r#"40{"sid":"sio-b"}"#, 3_100).unwrap();
        let _ = engine.drain_outbound();
        engine
            .on_ws_text(
                r#"432[{"data":{"clientId":"c-b","success":true,"protocolVersion":1}}]"#,
                3_150,
            )
            .unwrap();
        let acct_b_out = engine.drain_outbound();
        assert!(
            !acct_b_out.iter().any(|o| matches!(
                o,
                SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                    if t.contains(SPACE_PUSH_DOC_UPDATE)
            )),
            "acct-B must never send acct-A's frozen offline writes"
        );
        assert_eq!(engine.offline_queue().len(), 2);

        // Resuming with original account (acct-A) replays BOTH writes in exact original order!
        engine.disconnect(4_000);
        let _ = engine.drain_outbound();
        engine.resume_with_account(Some("acct-A".into()), 4_100);
        let _ = engine.drain_outbound();
        engine
            .on_ws_text(
                r#"0{"sid":"e-a2","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
                4_150,
            )
            .unwrap();
        engine.on_ws_text(r#"40{"sid":"sio-a2"}"#, 4_200).unwrap();
        let _ = engine.drain_outbound();
        engine
            .on_ws_text(
                r#"433[{"data":{"clientId":"c-a2","success":true,"protocolVersion":1}}]"#,
                4_250,
            )
            .unwrap();
        let acct_a_pushes: Vec<String> = engine
            .drain_outbound()
            .into_iter()
            .filter_map(|o| match o {
                SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                    if t.contains(SPACE_PUSH_DOC_UPDATE) =>
                {
                    Some(t)
                }
                _ => None,
            })
            .collect();
        assert_eq!(acct_a_pushes.len(), 2);
        assert!(acct_a_pushes[0].contains("\"docId\":\"doc-inflight\""));
        assert!(acct_a_pushes[1].contains("\"docId\":\"doc-queued\""));
        assert!(engine.offline_queue().is_empty());
    }

    #[test]
    fn v1_push_doc_update_not_in_space_auto_joins_and_retries() {
        let mut engine = SpaceSyncEngine::new(
            SpaceSyncConfig::workspace("ws-v1", true),
            IdConverter::new("ws-v1"),
        );
        connect_and_join_ws(&mut engine);

        // Under protocol_version == 1, push_doc_update sends directly (ack_id = 1).
        engine
            .push_doc_update("doc-new", vec![7, 8], PushDocIntent::Update, 2_000)
            .unwrap();
        let first_out = engine.drain_outbound();
        assert!(first_out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.starts_with("421[\"space:push-doc-update\"")
        )));

        // Server replies NOT_IN_SPACE -> v1 must send space:join-batch (ack_id = 2) first!
        engine
            .on_ws_text(
                r#"431[{"error":{"status":400,"code":"NOT_IN_SPACE","name":"NOT_IN_SPACE","message":"not in space"}}]"#,
                2_100,
            )
            .unwrap();
        let join_out = engine.drain_outbound();
        assert!(join_out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.starts_with("422[\"space:join-batch\"") && t.contains("\"docId\":\"doc-new\"")
        )));

        // Join ACK succeeds -> replays push-doc-update (ack_id = 3) -> succeeds!
        engine
            .on_ws_text(
                r#"432[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#,
                2_200,
            )
            .unwrap();
        let retry_out = engine.drain_outbound();
        assert!(retry_out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.starts_with("423[\"space:push-doc-update\"")
        )));
        engine
            .on_ws_text(
                r#"433[{"data":{"accepted":true,"timestamp":4444,"created":false}}]"#,
                2_300,
            )
            .unwrap();
        assert!(
            engine
                .drain_events()
                .contains(&SpaceSyncEvent::DocUpdatePushed {
                    doc_id: "doc-new".into(),
                    timestamp: 4_444,
                    created: false,
                })
        );
    }

    #[test]
    fn load_doc_auto_joins_unjoined_doc_and_retries_once_on_not_in_space() {
        let mut engine = SpaceSyncEngine::new(
            SpaceSyncConfig::workspace("ws-1", true),
            IdConverter::new("ws-1"),
        );
        connect_and_join_ws(&mut engine);

        let join_ack = engine.load_doc("doc-42", None, 2_000).unwrap();
        let out = engine.drain_outbound();
        assert!(out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.contains(SPACE_JOIN_BATCH) && t.contains("\"docId\":\"doc-42\"")
        )));

        engine
            .on_ws_text(
                &format!(
                    r#"43{join_ack}[{{"data":{{"clientId":"c1","success":true,"protocolVersion":1}}}}]"#
                ),
                2_100,
            )
            .unwrap();
        assert!(engine.joined_wire_doc_ids().contains("doc-42"));
        let out = engine.drain_outbound();
        assert!(out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.starts_with("422[\"space:load-doc\"")
        )));

        engine
            .on_ws_text(
                r#"432[{"error":{"status":400,"code":"NOT_IN_SPACE","name":"NOT_IN_SPACE","message":"not in space"}}]"#,
                2_200,
            )
            .unwrap();
        assert!(!engine.joined_wire_doc_ids().contains("doc-42"));
        let retry_join_out = engine.drain_outbound();
        assert!(retry_join_out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.starts_with("423[\"space:join-batch\"")
        )));

        engine
            .on_ws_text(
                r#"433[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#,
                2_300,
            )
            .unwrap();
        let _ = engine.drain_outbound();
        let payload = BASE64.encode([0, 0]);
        engine
            .on_ws_text(
                &format!(
                    r#"434[{{"data":{{"missing":"{payload}","state":"{payload}","timestamp":5000}}}}]"#
                ),
                2_400,
            )
            .unwrap();
        assert!(engine.drain_events().contains(&SpaceSyncEvent::DocLoaded {
            doc_id: "doc-42".into(),
            missing: vec![0, 0],
            state: vec![0, 0],
            timestamp: 5_000,
        }));
    }

    #[test]
    fn leave_space_dedup_join_docs_doc_lifecycle_and_explicit_request_failures() {
        let mut converter = IdConverter::new("ws-1");
        converter.register_page_mapping("logical-1", "physical-guid-1");
        let mut engine = SpaceSyncEngine::new(SpaceSyncConfig::workspace("ws-1", true), converter);
        connect_and_join_ws(&mut engine);

        // join_docs deduplicates duplicate doc IDs.
        let join_acks = engine
            .join_docs(&["doc-a", "doc-a", "doc-b"], 2_500)
            .unwrap();
        assert_eq!(join_acks.len(), 1);
        let join_frames: Vec<String> = engine
            .drain_outbound()
            .into_iter()
            .filter_map(|o| match o {
                SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t)) => Some(t),
                _ => None,
            })
            .collect();
        assert_eq!(join_frames[0].matches("\"docId\":\"doc-a\"").count(), 1);
        assert_eq!(join_frames[0].matches("\"docId\":\"doc-b\"").count(), 1);

        let ack = engine
            .apply_doc_lifecycle("logical-1", DocLifecycleAction::Delete, 3_000)
            .unwrap();
        let out = engine.drain_outbound();
        assert!(out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.contains(SPACE_DOC_LIFECYCLE)
                    && t.contains("\"physicalDocId\":\"physical-guid-1\"")
        )));
        engine
            .on_ws_text(
                &format!(
                    r#"43{ack}[{{"data":{{"timestamp":7777,"deletedDocIds":["physical-guid-1"]}}}}]"#
                ),
                3_100,
            )
            .unwrap();
        assert_eq!(
            engine.drain_events(),
            vec![SpaceSyncEvent::DocLifecycleApplied {
                doc_id: "logical-1".into(),
                lifecycle: DocLifecycleAction::Delete,
                timestamp: 7_777,
                deleted_doc_ids: Some(vec!["physical-guid-1".into()]),
            }]
        );

        let _ = engine.load_doc_timestamps(None, 4_000).unwrap();
        engine.on_tick(4_000 + 15_000).unwrap();
        assert!(
            engine
                .drain_events()
                .iter()
                .any(|ev| matches!(ev, SpaceSyncEvent::RequestFailed { op: SPACE_LOAD_DOC_TIMESTAMPS, code, .. } if code == "ACK_TIMEOUT"))
        );

        // leave_space emits batched leave + trailing empty docIds: [] and closes transport.
        engine.leave_space(20_000).unwrap();
        let leave_out = engine.drain_outbound();
        let leave_frames: Vec<&str> = leave_out
            .iter()
            .filter_map(|o| match o {
                SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                    if t.contains(SPACE_LEAVE_BATCH) =>
                {
                    Some(t.as_str())
                }
                _ => None,
            })
            .collect();
        assert_eq!(leave_frames.len(), 2);
        assert!(leave_frames[0].contains("\"docIds\":[\"ws-1\"]"));
        assert!(leave_frames[1].contains("\"docIds\":[]"));
        assert!(leave_out.contains(&SpaceSyncOutbound::Transport(
            EngineIoOutput::CloseTransport
        )));
        assert_eq!(engine.state(), SpaceSyncState::Offline);
    }

    #[test]
    fn direct_websocket_connect_and_ws_upgrade_error_keeps_polling_alive() {
        let mut cloud = SpaceSyncEngine::new(
            SpaceSyncConfig::workspace("ws-cloud", false),
            IdConverter::new("ws-cloud"),
        );
        cloud.connect(1_000);
        let _ = cloud.drain_outbound();
        cloud.on_transport_error("network drop 1", 2_000);
        assert_eq!(
            cloud.state(),
            SpaceSyncState::ReconnectScheduled {
                next_attempt_at_ms: 3_000,
            }
        );
        cloud.on_tick(3_000).unwrap();
        assert_eq!(cloud.state(), SpaceSyncState::Connecting);
        cloud.on_transport_error("network drop 2", 3_500);
        assert_eq!(
            cloud.state(),
            SpaceSyncState::ReconnectScheduled {
                next_attempt_at_ms: 5_500,
            }
        );

        let mut selfhost = SpaceSyncEngine::new(
            SpaceSyncConfig::workspace("ws-sh", true),
            IdConverter::new("ws-sh"),
        );
        selfhost.connect(1_000);
        let _ = selfhost.drain_outbound();
        let open =
            r#"0{"sid":"sh1","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;
        selfhost.on_polling_response(open, 1_050).unwrap();
        selfhost.on_ws_error("proxy rejected ws", 1_100);
        assert_eq!(selfhost.state(), SpaceSyncState::Connecting);
        assert!(selfhost.drain_events().is_empty());
    }

    #[test]
    fn ready_state_shelved_updates_replay_on_backoff_tick_and_v2_join_timeout() {
        let mut config = SpaceSyncConfig::workspace("ws-v2", true);
        config.protocol_version = 2;
        let mut engine = SpaceSyncEngine::new(config, IdConverter::new("ws-v2"));
        engine.connect(1_000);
        let _ = engine.drain_outbound();
        let open =
            r#"0{"sid":"e2","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;
        engine.on_polling_response(open, 1_050).unwrap();
        engine.on_ws_open(1_100);
        engine.on_polling_response("6", 1_120).unwrap();
        engine.on_polling_post_complete(1_130).unwrap();
        engine.on_ws_text("3probe", 1_150).unwrap();
        engine.on_ws_text(r#"40{"sid":"sio-2"}"#, 1_200).unwrap();
        engine
            .on_ws_text(
                r#"430[{"data":{"clientId":"c2","success":true,"protocolVersion":2}}]"#,
                1_300,
            )
            .unwrap();
        let _ = engine.drain_events();
        let _ = engine.drain_outbound();

        // Push to unjoined doc triggers JoinDocs with deferred PushDocUpdate; timeout shelves it
        // and schedules a Ready-state backoff retry.
        engine
            .push_doc_update("doc-v2", vec![4, 5, 6], PushDocIntent::Update, 2_000)
            .unwrap();
        assert!(engine.offline_queue().is_empty());
        let _ = engine.drain_outbound();
        engine.on_tick(2_000 + 15_000).unwrap();
        assert_eq!(engine.offline_queue().len(), 1);
        assert_eq!(engine.offline_queue()[0].doc_id, "doc-v2");
        let _ = engine.drain_outbound();

        // Advancing tick to backoff deadline (17_000 + 1_000 = 18_000) automatically replays it!
        engine.on_tick(18_000).unwrap();
        assert!(engine.offline_queue().is_empty());
        let replay_out = engine.drain_outbound();
        assert!(replay_out.iter().any(|o| matches!(
            o,
            SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t))
                if t.contains(SPACE_JOIN_BATCH) && t.contains("\"docId\":\"doc-v2\"")
        )));

        // Disconnect during join also requeues the deferred PushDocUpdate.
        engine.on_transport_error("drop during join", 18_500);
        assert_eq!(engine.offline_queue().len(), 1);
        assert_eq!(engine.offline_queue()[0].doc_id, "doc-v2");
    }

    fn ws_texts(out: Vec<SpaceSyncOutbound>) -> Vec<String> {
        out.into_iter()
            .filter_map(|o| match o {
                SpaceSyncOutbound::Transport(EngineIoOutput::SendWsText(t)) => Some(t),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn p1a_upgrade_packet_precedes_offline_replay_when_join_ack_lands_on_draining_get() {
        const OPEN: &str =
            r#"0{"sid":"e1","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;
        const JOIN_OK_0: &str =
            r#"430[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#;

        let mut e = SpaceSyncEngine::new(
            SpaceSyncConfig::workspace("ws", true),
            IdConverter::new("ws"),
        );
        e.push_doc_update("doc-1", vec![1, 2, 3], PushDocIntent::Update, 10)
            .unwrap();
        e.connect(1_000);
        e.on_polling_response(OPEN, 1_010).unwrap();
        e.on_polling_post_complete(1_020).unwrap();
        e.on_polling_response(r#"40{"sid":"sio"}"#, 1_030).unwrap();
        e.on_ws_open(1_040);
        let _ = e.drain_outbound();
        e.on_ws_text("3probe", 1_050).unwrap();
        e.on_polling_post_complete(1_060).unwrap();
        assert!(ws_texts(e.drain_outbound()).is_empty());
        e.on_polling_response(JOIN_OK_0, 1_070).unwrap();
        let frames = ws_texts(e.drain_outbound());
        assert_eq!(
            frames.first().map(String::as_str),
            Some("5"),
            "upgrade packet must precede any other WebSocket frame"
        );
    }

    #[test]
    fn p1b_upgrade_packet_precedes_join_when_sio_connect_lands_on_draining_get() {
        const OPEN: &str =
            r#"0{"sid":"e1","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;

        let mut e = SpaceSyncEngine::new(
            SpaceSyncConfig::workspace("ws", true),
            IdConverter::new("ws"),
        );
        e.connect(1_000);
        e.on_polling_response(OPEN, 1_010).unwrap();
        e.on_ws_open(1_020);
        e.on_ws_text("3probe", 1_030).unwrap();
        e.on_polling_post_complete(1_040).unwrap();
        let _ = e.drain_outbound();
        e.on_polling_response(r#"40{"sid":"sio"}"#, 1_050).unwrap();
        let frames = ws_texts(e.drain_outbound());
        assert_eq!(frames.first().map(String::as_str), Some("5"));
    }

    #[test]
    fn p3_deferred_offline_replay_waits_for_id_converter_after_join_docs_ack() {
        const JOIN_OK_0: &str =
            r#"430[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#;

        let mut config = SpaceSyncConfig::workspace("ws", false);
        config.defer_offline_replay_on_join = true;
        let mut e = SpaceSyncEngine::new(config, IdConverter::new("ws"));
        e.push_doc_update("legacy-page", vec![9], PushDocIntent::Update, 10)
            .unwrap();
        e.connect(1_000);
        e.on_ws_open(1_010);
        e.on_ws_text(
            r#"0{"sid":"e1","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
            1_020,
        )
        .unwrap();
        e.on_ws_text(r#"40{"sid":"sio"}"#, 1_030).unwrap();
        e.on_ws_text(JOIN_OK_0, 1_040).unwrap();
        let after_join = ws_texts(e.drain_outbound());
        assert!(!after_join.iter().any(|t| t.contains(SPACE_PUSH_DOC_UPDATE)));
        assert_eq!(e.offline_queue().len(), 1);

        e.join_docs(&["doc-x"], 1_050).unwrap();
        e.on_ws_text(
            r#"431[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#,
            1_060,
        )
        .unwrap();
        let frames = ws_texts(e.drain_outbound());
        assert!(
            !frames.iter().any(|t| t.contains(SPACE_PUSH_DOC_UPDATE)),
            "offline write left before notify_id_converter_ready"
        );

        let mut converter = IdConverter::new("ws");
        converter.register_page_mapping("legacy-page", "legacy-guid");
        e.notify_id_converter_ready(converter, 1_070);
        let replayed = ws_texts(e.drain_outbound());
        assert!(
            replayed
                .iter()
                .any(|t| t.contains(SPACE_PUSH_DOC_UPDATE)
                    && t.contains("\"docId\":\"legacy-guid\""))
        );
    }

    #[test]
    fn initial_join_access_denied_connect_error_jwt_rotation_and_doc_rejection_quarantine() {
        // 1. InitialJoin ACCESS_DENIED pauses space instead of stalling in Joining.
        let mut e1 = SpaceSyncEngine::new(
            SpaceSyncConfig::workspace("ws-deny", false),
            IdConverter::new("ws-deny"),
        );
        e1.connect(1_000);
        e1.on_ws_text(
            r#"0{"sid":"e1","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
            1_010,
        )
        .unwrap();
        e1.on_ws_text(r#"40{"sid":"sio"}"#, 1_020).unwrap();
        let _ = e1.drain_outbound();
        assert_eq!(e1.state(), SpaceSyncState::Joining);
        e1.on_ws_text(
            r#"430[{"error":{"status":403,"code":"ACCESS_DENIED","name":"ACCESS_DENIED","message":"denied"}}]"#,
            1_030,
        )
        .unwrap();
        assert_eq!(e1.state(), SpaceSyncState::PermissionRevoked);
        assert!(e1.drain_outbound().contains(&SpaceSyncOutbound::Transport(
            EngineIoOutput::CloseTransport
        )));

        // 2. Socket.IO 44 CONNECT_ERROR pauses in AuthRequired, preserves offline queue, and
        //    resume_with_auth sends the rotated JWT on reconnect.
        let mut cfg = SpaceSyncConfig::workspace("ws-jwt", false);
        cfg.account_id = Some("acct-1".into());
        cfg.auth_mode = SocketAuthMode::NativeJwt {
            token: "jwt-old".into(),
        };
        let mut e2 = SpaceSyncEngine::new(cfg, IdConverter::new("ws-jwt"));
        e2.push_doc_update("doc-1", vec![1], PushDocIntent::Update, 10)
            .unwrap();
        e2.connect(1_000);
        e2.on_ws_text(
            r#"0{"sid":"e2","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
            1_010,
        )
        .unwrap();
        let _ = e2.drain_outbound();
        e2.on_ws_text(r#"44{"message":"jwt expired"}"#, 1_020)
            .unwrap();
        assert_eq!(e2.state(), SpaceSyncState::AuthRequired);
        assert_eq!(e2.offline_queue().len(), 1);
        assert!(matches!(
            e2.drain_events().as_slice(),
            [SpaceSyncEvent::AuthRequired { code, .. }] if code == "CONNECT_ERROR"
        ));

        e2.resume_with_auth(
            Some("acct-1".into()),
            SocketAuthMode::NativeJwt {
                token: "jwt-new".into(),
            },
            2_000,
        );
        let _ = e2.drain_outbound();
        e2.on_ws_text(
            r#"0{"sid":"e2b","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
            2_010,
        )
        .unwrap();
        let connect_frames = ws_texts(e2.drain_outbound());
        assert!(
            connect_frames
                .iter()
                .any(|t| t.contains("\"token\":\"jwt-new\"") && !t.contains("jwt-old"))
        );

        // 3. Doc-level DOC_ACTION_DENIED quarantines the update in rejected_updates instead of
        //    re-queueing it in offline_queue.
        e2.on_ws_text(r#"40{"sid":"sio2"}"#, 2_020).unwrap();
        let _ = e2.drain_outbound();
        e2.on_ws_text(
            r#"430[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#,
            2_030,
        )
        .unwrap();
        let _ = e2.drain_outbound();
        e2.on_ws_text(
            r#"431[{"error":{"status":403,"code":"DOC_ACTION_DENIED","name":"DOC_ACTION_DENIED","message":"read only"}}]"#,
            2_040,
        )
        .unwrap();
        assert_eq!(e2.state(), SpaceSyncState::Ready);
        assert!(e2.offline_queue().is_empty());
        assert_eq!(e2.rejected_updates().len(), 1);
        assert_eq!(e2.drain_rejected_updates()[0].doc_id, "doc-1");

        // 4. Live local writes made after Joined while waiting_for_id_converter is still true
        //    must stay queued until notify_id_converter_ready refreshes the converter.
        let mut defer_cfg = SpaceSyncConfig::workspace("ws-defer", false);
        defer_cfg.defer_offline_replay_on_join = true;
        let mut e3 = SpaceSyncEngine::new(defer_cfg, IdConverter::new("ws-defer"));
        e3.connect(1_000);
        e3.on_ws_open(1_010);
        e3.on_ws_text(
            r#"0{"sid":"e3","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
            1_020,
        )
        .unwrap();
        e3.on_ws_text(r#"40{"sid":"sio3"}"#, 1_030).unwrap();
        e3.on_ws_text(
            r#"430[{"data":{"clientId":"c1","success":true,"protocolVersion":1}}]"#,
            1_040,
        )
        .unwrap();
        let _ = e3.drain_outbound();
        e3.push_doc_update("legacy-page", vec![9], PushDocIntent::Update, 1_050)
            .unwrap();
        let premature = ws_texts(e3.drain_outbound());
        assert!(
            !premature
                .iter()
                .any(|t| t.contains("space:push-doc-update")),
            "live write must not leave before notify_id_converter_ready"
        );
        let mut refreshed = IdConverter::new("ws-defer");
        refreshed.register_page_mapping("legacy-page", "legacy-guid-77");
        e3.notify_id_converter_ready(refreshed, 1_060);
        let flushed = ws_texts(e3.drain_outbound());
        assert!(flushed.iter().any(
            |t| t.contains(SPACE_PUSH_DOC_UPDATE) && t.contains("\"docId\":\"legacy-guid-77\"")
        ));
    }

    #[test]
    fn snapshot_captures_inflight_and_deferred_join_pushes_with_account_isolation() {
        let mut config = SpaceSyncConfig::workspace("ws-snap", false);
        config.protocol_version = 2;
        config.account_id = Some("acct-A".into());
        let mut engine = SpaceSyncEngine::new(config.clone(), IdConverter::new("ws-snap"));

        engine.connect(1_000);
        let _ = engine.drain_outbound();
        engine
            .on_ws_text(
                r#"0{"sid":"e-s","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
                1_010,
            )
            .unwrap();
        engine.on_ws_text(r#"40{"sid":"sio-s"}"#, 1_020).unwrap();
        let _ = engine.drain_outbound();
        engine
            .on_ws_text(
                r#"430[{"data":{"clientId":"c1","success":true,"protocolVersion":2}}]"#,
                1_030,
            )
            .unwrap();
        let _ = engine.drain_events();
        let _ = engine.drain_outbound();

        // Path 1: already-joined doc ("ws-snap") enters in_flight PushDocUpdate (ack 1).
        engine
            .push_doc_update("ws-snap", vec![1, 2], PushDocIntent::Update, 2_000)
            .unwrap();
        // Path 2: unjoined doc ("doc-unjoined") enters in_flight JoinDocs deferred push (ack 2).
        engine
            .push_doc_update("doc-unjoined", vec![3, 4], PushDocIntent::Update, 2_010)
            .unwrap();
        assert!(engine.offline_queue().is_empty());

        // Host snapshots directly in Ready state without calling disconnect().
        let snap = engine.snapshot();
        assert_eq!(snap.offline_queue.len(), 2);
        assert_eq!(snap.offline_queue[0].doc_id, "ws-snap");
        assert_eq!(snap.offline_queue[0].account_id.as_deref(), Some("acct-A"));
        assert_eq!(snap.offline_queue[1].doc_id, "doc-unjoined");
        assert_eq!(snap.offline_queue[1].account_id.as_deref(), Some("acct-A"));

        // Different account (acct-B) keeps both writes isolated (zero pushes sent).
        let mut other_cfg = config.clone();
        other_cfg.account_id = Some("acct-B".into());
        let mut other = SpaceSyncEngine::new(other_cfg, IdConverter::new("ws-snap"));
        other.restore_snapshot(snap.clone());
        other.connect(3_000);
        let _ = other.drain_outbound();
        other
            .on_ws_text(
                r#"0{"sid":"e-b","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
                3_010,
            )
            .unwrap();
        other.on_ws_text(r#"40{"sid":"sio-b"}"#, 3_020).unwrap();
        let _ = other.drain_outbound();
        other
            .on_ws_text(
                r#"430[{"data":{"clientId":"c2","success":true,"protocolVersion":2}}]"#,
                3_030,
            )
            .unwrap();
        let other_frames = ws_texts(other.drain_outbound());
        assert!(
            !other_frames
                .iter()
                .any(|t| t.contains(SPACE_PUSH_DOC_UPDATE)),
            "different account must not send acct-A's snapshotted in-flight writes"
        );
        assert_eq!(other.offline_queue().len(), 2);

        // Same account (acct-A) replays both writes in exact send order.
        let mut recovered = SpaceSyncEngine::new(config, IdConverter::new("ws-snap"));
        recovered.restore_snapshot(snap);
        recovered.connect(4_000);
        let _ = recovered.drain_outbound();
        recovered
            .on_ws_text(
                r#"0{"sid":"e-a","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
                4_010,
            )
            .unwrap();
        recovered.on_ws_text(r#"40{"sid":"sio-a"}"#, 4_020).unwrap();
        let _ = recovered.drain_outbound();
        recovered
            .on_ws_text(
                r#"430[{"data":{"clientId":"c3","success":true,"protocolVersion":2}}]"#,
                4_030,
            )
            .unwrap();
        let replay_frames = ws_texts(recovered.drain_outbound());
        assert!(
            replay_frames
                .iter()
                .any(|t| t.contains(SPACE_PUSH_DOC_UPDATE) && t.contains("\"docId\":\"ws-snap\""))
        );
        assert!(
            replay_frames
                .iter()
                .any(|t| t.contains(SPACE_JOIN_BATCH) && t.contains("\"docId\":\"doc-unjoined\""))
        );
        assert!(recovered.offline_queue().is_empty());
    }
}
