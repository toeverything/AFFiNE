use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::Value;

use super::{
    BroadcastDocInvalidationMessage, BroadcastDocUpdatesMessage, DeferredAfterJoin, EngineIoOutput,
    InFlightRequest, JoinSpaceBatchEntry, JoinSpaceBatchMessage, LoadDocMessage,
    OfflinePendingUpdate, PendingAck, PushDocIntent, PushDocUpdateMessage,
    SPACE_BROADCAST_DOC_INVALIDATION, SPACE_BROADCAST_DOC_UPDATES, SPACE_DELETE_DOC,
    SPACE_DOC_LIFECYCLE, SPACE_JOIN_BATCH, SPACE_LOAD_DOC, SPACE_LOAD_DOC_TIMESTAMPS,
    SPACE_PUSH_DOC_UPDATE, SocketIoEvent, SpaceSyncEngine, SpaceSyncEvent, SpaceSyncOutbound,
    SpaceSyncState,
};
use crate::error::StoreResult;

impl SpaceSyncEngine {
    pub(super) fn send_join_docs_batch(
        &mut self,
        wire_doc_ids: Vec<String>,
        deferred: Option<DeferredAfterJoin>,
        now_ms: i64,
    ) -> StoreResult<u64> {
        let spaces = wire_doc_ids
            .iter()
            .map(|wire_id| JoinSpaceBatchEntry {
                space_type: self.config.space_type,
                space_id: self.config.space_id.clone(),
                doc_id: Some(wire_id.clone()),
            })
            .collect();
        let join = JoinSpaceBatchMessage {
            spaces,
            client_version: self.config.client_version.clone(),
            protocol_version: self.config.protocol_version,
        };
        let (ack_id, pkt) = self
            .socket_io
            .encode_event_with_ack(SPACE_JOIN_BATCH, serde_json::to_value(join)?)?;
        self.in_flight.insert(
            ack_id,
            PendingAck {
                sent_at_ms: now_ms,
                request: InFlightRequest::JoinDocs {
                    wire_doc_ids,
                    deferred,
                },
            },
        );
        self.engine_io.send_message(&pkt)?;
        self.flush_engine_io_outputs(now_ms);
        Ok(ack_id)
    }

    pub(super) fn dispatch_load_doc(
        &mut self,
        doc_id: String,
        state_vector: Option<Vec<u8>>,
        retried_not_in_space: bool,
        now_ms: i64,
    ) -> StoreResult<u64> {
        let wire_doc_id = self.id_converter.new_id_to_old_id(&doc_id);
        if !self.joined_doc_ids.contains(&wire_doc_id) {
            return self.send_join_docs_batch(
                vec![wire_doc_id],
                Some(DeferredAfterJoin::LoadDoc {
                    doc_id,
                    state_vector,
                    retried_not_in_space,
                }),
                now_ms,
            );
        }
        let msg = LoadDocMessage {
            space_type: self.config.space_type,
            space_id: self.config.space_id.clone(),
            doc_id: wire_doc_id.clone(),
            state_vector: state_vector.as_deref().map(|sv| BASE64.encode(sv)),
        };
        let (ack_id, packet) = self
            .socket_io
            .encode_event_with_ack(SPACE_LOAD_DOC, serde_json::to_value(msg)?)?;
        self.in_flight.insert(
            ack_id,
            PendingAck {
                sent_at_ms: now_ms,
                request: InFlightRequest::LoadDoc {
                    doc_id,
                    wire_doc_id,
                    state_vector,
                    retried_not_in_space,
                },
            },
        );
        self.engine_io.send_message(&packet)?;
        self.flush_engine_io_outputs(now_ms);
        Ok(ack_id)
    }

    pub(super) fn dispatch_push_doc_update(
        &mut self,
        entry: OfflinePendingUpdate,
        retried_not_in_space: bool,
        now_ms: i64,
    ) -> StoreResult<()> {
        let wire_doc_id = self.id_converter.new_id_to_old_id(&entry.doc_id);
        let needs_join = (retried_not_in_space
            || (self.config.protocol_version != 1 && entry.intent == PushDocIntent::Update))
            && !self.joined_doc_ids.contains(&wire_doc_id);
        if needs_join {
            self.send_join_docs_batch(
                vec![wire_doc_id],
                Some(DeferredAfterJoin::PushDocUpdate {
                    entry,
                    retried_not_in_space,
                }),
                now_ms,
            )?;
            return Ok(());
        }
        let intent = if self.config.protocol_version == 1 {
            PushDocIntent::Create
        } else {
            entry.intent
        };
        let msg = PushDocUpdateMessage {
            space_type: self.config.space_type,
            space_id: self.config.space_id.clone(),
            doc_id: wire_doc_id.clone(),
            update: BASE64.encode(&entry.update),
            intent,
        };
        let (ack_id, pkt) = self
            .socket_io
            .encode_event_with_ack(SPACE_PUSH_DOC_UPDATE, serde_json::to_value(msg)?)?;
        self.in_flight.insert(
            ack_id,
            PendingAck {
                sent_at_ms: now_ms,
                request: InFlightRequest::PushDocUpdate {
                    entry,
                    wire_doc_id,
                    retried_not_in_space,
                },
            },
        );
        self.engine_io.send_message(&pkt)?;
        self.flush_engine_io_outputs(now_ms);
        Ok(())
    }

    pub(super) fn flush_engine_io_outputs(&mut self, now_ms: i64) {
        self.engine_io_outputs
            .extend(self.engine_io.drain_outputs());
        if self.flushing_engine_io {
            return;
        }
        self.flushing_engine_io = true;
        while let Some(output) = self.engine_io_outputs.pop_front() {
            match output {
                EngineIoOutput::Connected { sid, upgraded_ws } => {
                    self.outbound
                        .push(SpaceSyncOutbound::Transport(EngineIoOutput::Connected {
                            sid,
                            upgraded_ws,
                        }));
                    let auth_payload = self.config.auth_mode.to_connect_payload();
                    if let Ok(connect_pkt) = self.socket_io.encode_connect(Some(auth_payload)) {
                        let _ = self.engine_io.send_message(&connect_pkt);
                    }
                }
                EngineIoOutput::Message(sio_raw) => {
                    if let Ok(Some(ev)) = self.socket_io.on_text_packet(&sio_raw) {
                        self.handle_socket_io_event(ev, now_ms);
                    }
                }
                EngineIoOutput::BinaryMessage(bytes) => {
                    if let Ok(Some(ev)) = self.socket_io.on_binary_attachment(bytes) {
                        self.handle_socket_io_event(ev, now_ms);
                    }
                }
                EngineIoOutput::Closed { reason } => {
                    self.handle_disconnect(&reason, now_ms);
                }
                EngineIoOutput::HeartbeatTimeout => {
                    self.handle_disconnect("heartbeat timeout", now_ms);
                }
                other => {
                    self.outbound.push(SpaceSyncOutbound::Transport(other));
                }
            }
            self.engine_io_outputs
                .extend(self.engine_io.drain_outputs());
        }
        self.flushing_engine_io = false;
    }

    fn handle_socket_io_event(&mut self, event: SocketIoEvent, now_ms: i64) {
        match event {
            SocketIoEvent::Connected { .. } => {
                self.state = SpaceSyncState::Joining;
                let root_wire_id = self.id_converter.new_id_to_old_id(&self.config.space_id);
                let join = JoinSpaceBatchMessage {
                    spaces: vec![JoinSpaceBatchEntry {
                        space_type: self.config.space_type,
                        space_id: self.config.space_id.clone(),
                        doc_id: Some(root_wire_id.clone()),
                    }],
                    client_version: self.config.client_version.clone(),
                    protocol_version: self.config.protocol_version,
                };
                if let Ok(val) = serde_json::to_value(join)
                    && let Ok((ack_id, pkt)) =
                        self.socket_io.encode_event_with_ack(SPACE_JOIN_BATCH, val)
                {
                    self.in_flight.insert(
                        ack_id,
                        PendingAck {
                            sent_at_ms: now_ms,
                            request: InFlightRequest::InitialJoin { root_wire_id },
                        },
                    );
                    if self.engine_io.send_message(&pkt).is_ok() {
                        self.flush_engine_io_outputs(now_ms);
                    }
                }
            }
            SocketIoEvent::ConnectError(err) => {
                self.requeue_in_flight_pushes(None);
                self.joined_doc_ids.clear();
                self.next_offline_retry_at_ms = None;
                self.waiting_for_id_converter = false;
                self.state = SpaceSyncState::AuthRequired;
                self.engine_io.disconnect();
                self.flush_engine_io_outputs(now_ms);
                self.events.push(SpaceSyncEvent::AuthRequired {
                    doc_id: None,
                    code: "CONNECT_ERROR".to_string(),
                    message: err.to_string(),
                });
            }
            SocketIoEvent::Disconnected => {
                self.handle_disconnect("socket.io disconnect", now_ms);
            }
            SocketIoEvent::Event {
                event: name,
                payload,
                ..
            } => {
                self.handle_server_event(&name, payload);
            }
            SocketIoEvent::Ack { ack_id, payload } => {
                self.handle_ack(ack_id, payload, now_ms);
            }
        }
    }

    fn handle_server_event(&mut self, name: &str, payload: Value) {
        match name {
            SPACE_BROADCAST_DOC_UPDATES => {
                if let Ok(msg) = serde_json::from_value::<BroadcastDocUpdatesMessage>(payload) {
                    if msg.space_type != self.config.space_type
                        || msg.space_id != self.config.space_id
                    {
                        return;
                    }
                    let doc_id = self.id_converter.old_id_to_new_id(&msg.doc_id);
                    if self.id_converter.new_id_to_old_id(&doc_id) != msg.doc_id {
                        return;
                    }
                    let mut decoded = Vec::with_capacity(msg.updates.len());
                    for encoded in msg.updates {
                        if let Ok(bytes) = BASE64.decode(encoded) {
                            decoded.push(bytes);
                        }
                    }
                    self.events.push(SpaceSyncEvent::RemoteDocUpdates {
                        doc_id,
                        updates: decoded,
                        timestamp: msg.timestamp,
                        editor: msg.editor,
                    });
                }
            }
            SPACE_BROADCAST_DOC_INVALIDATION => {
                if let Ok(msg) = serde_json::from_value::<BroadcastDocInvalidationMessage>(payload)
                {
                    if msg.space_type != self.config.space_type
                        || msg.space_id != self.config.space_id
                    {
                        return;
                    }
                    self.events.push(SpaceSyncEvent::DocInvalidated {
                        timestamp: msg.timestamp,
                        inventory_changed: msg.inventory_changed.unwrap_or(false),
                    });
                }
            }
            _ => {}
        }
    }

    pub(super) fn handle_ack_timeout(
        &mut self,
        request: InFlightRequest,
        now_ms: i64,
    ) -> StoreResult<()> {
        match request {
            InFlightRequest::PushDocUpdate { entry, .. } => {
                if self.state == SpaceSyncState::Ready {
                    self.dispatch_push_doc_update(entry, false, now_ms)?;
                } else {
                    self.offline_queue.push_front(entry);
                }
            }
            InFlightRequest::InitialJoin { .. } => {
                self.handle_disconnect("join ACK timeout", now_ms);
            }
            InFlightRequest::JoinDocs { deferred, .. } => {
                let doc_id = deferred_doc_id(deferred.as_ref());
                if let Some(DeferredAfterJoin::PushDocUpdate { entry, .. }) = deferred {
                    self.shelve_push_for_retry(entry, now_ms);
                }
                self.emit_request_failed(
                    SPACE_JOIN_BATCH,
                    doc_id,
                    "ACK_TIMEOUT".into(),
                    "space:join-batch ACK timed out".into(),
                );
            }
            InFlightRequest::LoadDoc { doc_id, .. } => self.emit_request_failed(
                SPACE_LOAD_DOC,
                Some(doc_id),
                "ACK_TIMEOUT".into(),
                "space:load-doc ACK timed out".into(),
            ),
            InFlightRequest::LoadDocTimestamps => self.emit_request_failed(
                SPACE_LOAD_DOC_TIMESTAMPS,
                None,
                "ACK_TIMEOUT".into(),
                "space:load-doc-timestamps ACK timed out".into(),
            ),
            InFlightRequest::DeleteDoc { doc_id } => self.emit_request_failed(
                SPACE_DELETE_DOC,
                Some(doc_id),
                "ACK_TIMEOUT".into(),
                "space:delete-doc ACK timed out".into(),
            ),
            InFlightRequest::DocLifecycle { doc_id, .. } => self.emit_request_failed(
                SPACE_DOC_LIFECYCLE,
                Some(doc_id),
                "ACK_TIMEOUT".into(),
                "space:doc-lifecycle ACK timed out".into(),
            ),
        }
        Ok(())
    }

    pub(super) fn run_deferred_after_join(&mut self, op: DeferredAfterJoin, now_ms: i64) {
        match op {
            DeferredAfterJoin::LoadDoc {
                doc_id,
                state_vector,
                retried_not_in_space,
            } => {
                let _ = self.dispatch_load_doc(doc_id, state_vector, retried_not_in_space, now_ms);
            }
            DeferredAfterJoin::PushDocUpdate {
                entry,
                retried_not_in_space,
            } => {
                let _ = self.dispatch_push_doc_update(entry, retried_not_in_space, now_ms);
            }
        }
    }

    pub(super) fn emit_request_failed(
        &mut self,
        op: &'static str,
        doc_id: Option<String>,
        code: String,
        message: String,
    ) {
        self.events.push(SpaceSyncEvent::RequestFailed {
            op,
            doc_id,
            code,
            message,
        });
    }

    pub(super) fn shelve_push_for_retry(&mut self, entry: OfflinePendingUpdate, now_ms: i64) {
        self.offline_queue.push_front(entry);
        if self.state == SpaceSyncState::Ready {
            let delay = self
                .config
                .reconnect
                .backoff_ms(self.offline_retry_attempts);
            self.offline_retry_attempts = self.offline_retry_attempts.saturating_add(1);
            let retry_at = now_ms.saturating_add(delay);
            self.next_offline_retry_at_ms = Some(retry_at);
            self.outbound
                .push(SpaceSyncOutbound::ScheduleTimerAtMs(retry_at));
        }
    }

    /// Requeue all unacknowledged `PushDocUpdate` requests (and optional currently-failing entry)
    /// back to the front of `offline_queue` in their original ACK-ID order.
    pub(super) fn requeue_in_flight_pushes(
        &mut self,
        extra_failed: Option<(u64, OfflinePendingUpdate)>,
    ) {
        let mut requeue: Vec<(u64, OfflinePendingUpdate)> = Vec::new();
        if let Some(extra) = extra_failed {
            requeue.push(extra);
        }
        for (ack_id, pending) in std::mem::take(&mut self.in_flight) {
            match pending.request {
                InFlightRequest::PushDocUpdate { entry, .. }
                | InFlightRequest::JoinDocs {
                    deferred: Some(DeferredAfterJoin::PushDocUpdate { entry, .. }),
                    ..
                } => {
                    requeue.push((ack_id, entry));
                }
                _ => {}
            }
        }
        requeue.sort_by_key(|(ack_id, _)| *ack_id);
        for (_, entry) in requeue.into_iter().rev() {
            self.offline_queue.push_front(entry);
        }
    }

    /// Pause syncing on auth/permission error while preserving all unacknowledged and queued writes
    /// in `offline_queue` (isolated by `account_id`) so re-authentication never loses local data.
    pub(super) fn handle_auth_or_permission_pause(
        &mut self,
        doc_id: Option<String>,
        code: &str,
        message: String,
        failed_push: Option<(u64, OfflinePendingUpdate)>,
        now_ms: i64,
    ) {
        let pauses_space = self.state == SpaceSyncState::Joining
            || (doc_id.is_none() && code == "ACCESS_DENIED")
            || matches!(
                code,
                "AUTHENTICATION_REQUIRED"
                    | "FORBIDDEN"
                    | "SPACE_ACCESS_DENIED"
                    | "UNSUPPORTED_CLIENT_VERSION"
            );
        if pauses_space {
            self.requeue_in_flight_pushes(failed_push);
            self.joined_doc_ids.clear();
            self.next_offline_retry_at_ms = None;
            self.waiting_for_id_converter = false;
            self.state = if code == "AUTHENTICATION_REQUIRED" {
                SpaceSyncState::AuthRequired
            } else {
                SpaceSyncState::PermissionRevoked
            };
            self.engine_io.disconnect();
            self.flush_engine_io_outputs(now_ms);
        } else if let Some((_, entry)) = failed_push {
            // Quarantine doc-level rejected updates instead of re-queueing them into an infinite
            // retry loop on subsequent join_docs ACKs.
            self.rejected_updates.push(entry);
        }

        if code == "AUTHENTICATION_REQUIRED" {
            self.events.push(SpaceSyncEvent::AuthRequired {
                doc_id,
                code: code.to_string(),
                message,
            });
        } else {
            self.events.push(SpaceSyncEvent::PermissionRevoked {
                doc_id,
                code: code.to_string(),
                message,
            });
        }
    }

    /// Replay only queued writes belonging to the active `account_id`, keeping other accounts'
    /// writes isolated and frozen in `offline_queue`.
    pub(super) fn replay_offline_queue(&mut self, now_ms: i64) {
        let active_account = self.config.account_id.clone();
        let existing = std::mem::take(&mut self.offline_queue);
        let mut frozen_or_remaining = std::collections::VecDeque::new();
        let mut stopped = false;

        for entry in existing {
            if stopped || entry.account_id != active_account {
                frozen_or_remaining.push_back(entry);
                continue;
            }
            if self
                .dispatch_push_doc_update(entry.clone(), false, now_ms)
                .is_err()
            {
                frozen_or_remaining.push_back(entry);
                stopped = true;
            }
        }
        self.offline_queue = frozen_or_remaining;
    }

    pub(super) fn handle_disconnect(&mut self, reason: &str, now_ms: i64) {
        if matches!(
            self.state,
            SpaceSyncState::AuthRequired | SpaceSyncState::PermissionRevoked
        ) {
            return;
        }
        self.joined_doc_ids.clear();
        self.next_offline_retry_at_ms = None;
        self.waiting_for_id_converter = false;
        self.requeue_in_flight_pushes(None);
        self.engine_io.disconnect();
        self.flush_engine_io_outputs(now_ms);

        let delay = self.config.reconnect.backoff_ms(self.reconnect_attempts);
        self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
        let next_at = now_ms.saturating_add(delay);
        self.state = SpaceSyncState::ReconnectScheduled {
            next_attempt_at_ms: next_at,
        };
        self.outbound
            .push(SpaceSyncOutbound::ScheduleTimerAtMs(next_at));
        self.events.push(SpaceSyncEvent::Disconnected {
            reason: reason.to_string(),
            next_reconnect_ms: next_at,
        });
    }
}

pub(super) fn deferred_doc_id(deferred: Option<&DeferredAfterJoin>) -> Option<String> {
    match deferred {
        Some(DeferredAfterJoin::LoadDoc { doc_id, .. }) => Some(doc_id.clone()),
        Some(DeferredAfterJoin::PushDocUpdate { entry, .. }) => Some(entry.doc_id.clone()),
        None => None,
    }
}
