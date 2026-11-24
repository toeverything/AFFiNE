use std::collections::BTreeMap;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::Value;

use super::{
    DeferredAfterJoin, DocLifecycleAction, DocLifecycleResponse, InFlightRequest,
    JoinSpaceBatchResponse, LoadDocResponse, PushDocUpdateResponse, SPACE_DELETE_DOC,
    SPACE_DOC_LIFECYCLE, SPACE_JOIN_BATCH, SPACE_LOAD_DOC, SPACE_LOAD_DOC_TIMESTAMPS,
    SPACE_PUSH_DOC_UPDATE, SpaceSyncEngine, SpaceSyncEvent, SpaceSyncState, WebsocketResponse,
    handlers::deferred_doc_id,
};

impl SpaceSyncEngine {
    pub(super) fn handle_ack(&mut self, ack_id: u64, payload: Value, now_ms: i64) {
        let Some(pending) = self.in_flight.remove(&ack_id) else {
            return;
        };

        match pending.request {
            InFlightRequest::InitialJoin { root_wire_id } => {
                match serde_json::from_value::<WebsocketResponse<JoinSpaceBatchResponse>>(payload) {
                    Ok(WebsocketResponse::Ok { data })
                        if data.success
                            && data.protocol_version == self.config.protocol_version =>
                    {
                        self.joined_doc_ids.insert(root_wire_id);
                        self.state = SpaceSyncState::Ready;
                        self.reconnect_attempts = 0;
                        self.offline_retry_attempts = 0;
                        self.next_offline_retry_at_ms = None;
                        self.waiting_for_id_converter = self.config.defer_offline_replay_on_join;
                        self.events.push(SpaceSyncEvent::Joined {
                            client_id: data.client_id,
                            protocol_version: data.protocol_version,
                            client_version: data.client_version,
                        });
                        if !self.waiting_for_id_converter {
                            self.replay_offline_queue(now_ms);
                        }
                    }
                    Ok(WebsocketResponse::Err { error }) if error.is_permission_revoked() => {
                        let code = error.canonical_code().to_string();
                        self.handle_auth_or_permission_pause(
                            None,
                            &code,
                            error.message,
                            None,
                            now_ms,
                        );
                    }
                    _ => {
                        self.handle_disconnect("space:join-batch rejected", now_ms);
                    }
                }
            }
            InFlightRequest::JoinDocs {
                wire_doc_ids,
                deferred,
            } => {
                match serde_json::from_value::<WebsocketResponse<JoinSpaceBatchResponse>>(payload) {
                    Ok(WebsocketResponse::Ok { data })
                        if data.success
                            && data.protocol_version == self.config.protocol_version =>
                    {
                        let mut local_ids = Vec::with_capacity(wire_doc_ids.len());
                        for wire_id in wire_doc_ids {
                            local_ids.push(self.id_converter.old_id_to_new_id(&wire_id));
                            self.joined_doc_ids.insert(wire_id);
                        }
                        self.events
                            .push(SpaceSyncEvent::DocsJoined { doc_ids: local_ids });
                        if let Some(next_op) = deferred {
                            self.run_deferred_after_join(next_op, now_ms);
                        }
                        if self.state == SpaceSyncState::Ready
                            && !self.waiting_for_id_converter
                            && self.next_offline_retry_at_ms.is_none()
                        {
                            self.replay_offline_queue(now_ms);
                        }
                    }
                    Ok(WebsocketResponse::Err { error }) if error.is_permission_revoked() => {
                        let doc_id = deferred_doc_id(deferred.as_ref());
                        let code = error.canonical_code().to_string();
                        let failed = match deferred {
                            Some(DeferredAfterJoin::PushDocUpdate { entry, .. }) => {
                                Some((ack_id, entry))
                            }
                            _ => None,
                        };
                        self.handle_auth_or_permission_pause(
                            doc_id,
                            &code,
                            error.message,
                            failed,
                            now_ms,
                        );
                    }
                    Ok(WebsocketResponse::Err { error }) => {
                        let doc_id = deferred_doc_id(deferred.as_ref());
                        if let Some(DeferredAfterJoin::PushDocUpdate { entry, .. }) = deferred {
                            self.shelve_push_for_retry(entry, now_ms);
                        }
                        self.emit_request_failed(
                            SPACE_JOIN_BATCH,
                            doc_id,
                            error.canonical_code().to_string(),
                            error.message,
                        );
                    }
                    _ => {
                        let doc_id = deferred_doc_id(deferred.as_ref());
                        if let Some(DeferredAfterJoin::PushDocUpdate { entry, .. }) = deferred {
                            self.shelve_push_for_retry(entry, now_ms);
                        }
                        self.emit_request_failed(
                            SPACE_JOIN_BATCH,
                            doc_id,
                            "INVALID_RESPONSE".into(),
                            "space:join-batch rejected".into(),
                        );
                    }
                }
            }
            InFlightRequest::LoadDoc {
                doc_id,
                wire_doc_id,
                state_vector,
                retried_not_in_space,
            } => match serde_json::from_value::<WebsocketResponse<LoadDocResponse>>(payload) {
                Ok(WebsocketResponse::Ok { data }) => {
                    match (BASE64.decode(&data.missing), BASE64.decode(&data.state)) {
                        (Ok(missing), Ok(state)) => {
                            self.events.push(SpaceSyncEvent::DocLoaded {
                                doc_id,
                                missing,
                                state,
                                timestamp: data.timestamp,
                            });
                        }
                        _ => self.emit_request_failed(
                            SPACE_LOAD_DOC,
                            Some(doc_id),
                            "INVALID_BASE64".into(),
                            "invalid base64 in space:load-doc response".into(),
                        ),
                    }
                }
                Ok(WebsocketResponse::Err { error }) if error.is_doc_not_found() => {
                    self.events.push(SpaceSyncEvent::DocNotFound { doc_id });
                }
                Ok(WebsocketResponse::Err { error })
                    if error.is_not_in_space() && !retried_not_in_space =>
                {
                    self.joined_doc_ids.remove(&wire_doc_id);
                    let _ = self.dispatch_load_doc(doc_id, state_vector, true, now_ms);
                }
                Ok(WebsocketResponse::Err { error }) if error.is_permission_revoked() => {
                    let code = error.canonical_code().to_string();
                    self.handle_auth_or_permission_pause(
                        Some(doc_id),
                        &code,
                        error.message,
                        None,
                        now_ms,
                    );
                }
                Ok(WebsocketResponse::Err { error }) => self.emit_request_failed(
                    SPACE_LOAD_DOC,
                    Some(doc_id),
                    error.canonical_code().to_string(),
                    error.message,
                ),
                Err(err) => self.emit_request_failed(
                    SPACE_LOAD_DOC,
                    Some(doc_id),
                    "INVALID_RESPONSE".into(),
                    err.to_string(),
                ),
            },
            InFlightRequest::PushDocUpdate {
                entry,
                wire_doc_id,
                retried_not_in_space,
            } => {
                match serde_json::from_value::<WebsocketResponse<PushDocUpdateResponse>>(payload) {
                    Ok(WebsocketResponse::Ok { data }) => {
                        self.offline_retry_attempts = 0;
                        self.events.push(SpaceSyncEvent::DocUpdatePushed {
                            doc_id: entry.doc_id,
                            timestamp: data.timestamp,
                            created: data.created,
                        });
                    }
                    Ok(WebsocketResponse::Err { error })
                        if error.is_not_in_space() && !retried_not_in_space =>
                    {
                        self.joined_doc_ids.remove(&wire_doc_id);
                        let _ = self.dispatch_push_doc_update(entry, true, now_ms);
                    }
                    Ok(WebsocketResponse::Err { error }) if error.is_permission_revoked() => {
                        let code = error.canonical_code().to_string();
                        let doc_id = entry.doc_id.clone();
                        self.handle_auth_or_permission_pause(
                            Some(doc_id),
                            &code,
                            error.message,
                            Some((ack_id, entry)),
                            now_ms,
                        );
                    }
                    Ok(WebsocketResponse::Err { error }) => {
                        let doc_id = entry.doc_id.clone();
                        self.shelve_push_for_retry(entry, now_ms);
                        self.emit_request_failed(
                            SPACE_PUSH_DOC_UPDATE,
                            Some(doc_id),
                            error.canonical_code().to_string(),
                            error.message,
                        );
                    }
                    Err(err) => {
                        let doc_id = entry.doc_id.clone();
                        self.shelve_push_for_retry(entry, now_ms);
                        self.emit_request_failed(
                            SPACE_PUSH_DOC_UPDATE,
                            Some(doc_id),
                            "INVALID_RESPONSE".into(),
                            err.to_string(),
                        );
                    }
                }
            }
            InFlightRequest::LoadDocTimestamps => {
                match serde_json::from_value::<WebsocketResponse<BTreeMap<String, i64>>>(payload) {
                    Ok(WebsocketResponse::Ok { data }) => {
                        let mut normalized = BTreeMap::new();
                        for (wire_id, ts) in data {
                            let local_id = self.id_converter.old_id_to_new_id(&wire_id);
                            if self.id_converter.new_id_to_old_id(&local_id) == wire_id {
                                normalized.insert(local_id, ts);
                            }
                        }
                        self.events.push(SpaceSyncEvent::DocTimestampsLoaded {
                            timestamps: normalized,
                        });
                    }
                    Ok(WebsocketResponse::Err { error }) if error.is_permission_revoked() => {
                        let code = error.canonical_code().to_string();
                        self.handle_auth_or_permission_pause(
                            None,
                            &code,
                            error.message,
                            None,
                            now_ms,
                        );
                    }
                    Ok(WebsocketResponse::Err { error }) => self.emit_request_failed(
                        SPACE_LOAD_DOC_TIMESTAMPS,
                        None,
                        error.canonical_code().to_string(),
                        error.message,
                    ),
                    Err(err) => self.emit_request_failed(
                        SPACE_LOAD_DOC_TIMESTAMPS,
                        None,
                        "INVALID_RESPONSE".into(),
                        err.to_string(),
                    ),
                }
            }
            InFlightRequest::DeleteDoc { doc_id } => {
                match serde_json::from_value::<WebsocketResponse<Value>>(payload) {
                    Ok(WebsocketResponse::Ok { .. }) => {
                        self.events.push(SpaceSyncEvent::DocDeleted { doc_id });
                    }
                    Ok(WebsocketResponse::Err { error }) if error.is_permission_revoked() => {
                        let code = error.canonical_code().to_string();
                        self.handle_auth_or_permission_pause(
                            Some(doc_id),
                            &code,
                            error.message,
                            None,
                            now_ms,
                        );
                    }
                    Ok(WebsocketResponse::Err { error }) => self.emit_request_failed(
                        SPACE_DELETE_DOC,
                        Some(doc_id),
                        error.canonical_code().to_string(),
                        error.message,
                    ),
                    Err(err) => self.emit_request_failed(
                        SPACE_DELETE_DOC,
                        Some(doc_id),
                        "INVALID_RESPONSE".into(),
                        err.to_string(),
                    ),
                }
            }
            InFlightRequest::DocLifecycle { doc_id, lifecycle } => {
                match serde_json::from_value::<WebsocketResponse<DocLifecycleResponse>>(payload) {
                    Ok(WebsocketResponse::Ok { data }) => {
                        if lifecycle == DocLifecycleAction::Delete {
                            self.pending_deletes.remove(&doc_id);
                        }
                        self.events.push(SpaceSyncEvent::DocLifecycleApplied {
                            doc_id,
                            lifecycle,
                            timestamp: data.timestamp,
                            deleted_doc_ids: data.deleted_doc_ids,
                        });
                    }
                    Ok(WebsocketResponse::Err { error }) => {
                        if lifecycle == DocLifecycleAction::Delete
                            && error.is_terminal_lifecycle_error()
                        {
                            self.pending_deletes.remove(&doc_id);
                        }
                        if error.is_permission_revoked() {
                            let code = error.canonical_code().to_string();
                            self.handle_auth_or_permission_pause(
                                Some(doc_id),
                                &code,
                                error.message,
                                None,
                                now_ms,
                            );
                        } else {
                            self.emit_request_failed(
                                SPACE_DOC_LIFECYCLE,
                                Some(doc_id),
                                error.canonical_code().to_string(),
                                error.message,
                            );
                        }
                    }
                    Err(err) => self.emit_request_failed(
                        SPACE_DOC_LIFECYCLE,
                        Some(doc_id),
                        "INVALID_RESPONSE".into(),
                        err.to_string(),
                    ),
                }
            }
        }
    }
}
