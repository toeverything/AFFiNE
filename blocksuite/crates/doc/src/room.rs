use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use axum::{
    Json, Router,
    body::Bytes,
    extract::{
        DefaultBodyLimit, Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::sync::{Mutex, mpsc};
use y_octo::{
    Any, Awareness, AwarenessState, AwarenessStates, DocMessage, DocOptions, DocSession,
    SessionConfig, SessionOriginKind, SessionReadValue, SessionUndoConfig, StateVector, TypePath,
    TypeTarget, encode_state_vector_from_update_v1,
};

/// Maximum HTTP body size for `/api/collection/{id}/blob/{key}` (64 MiB).
const MAX_BLOB_BODY_BYTES: usize = crate::MAX_BLOB_BYTES;

use crate::wire::{
    RoomBinaryFrame, RoomControlFrame, decode_binary_frame, decode_control_frame,
    encode_binary_frame, encode_control_frame,
};

type ConnId = u64;
type OutboundTx = mpsc::UnboundedSender<Message>;

enum SeedClaimState {
    Pending {
        winner_conn_id: ConnId,
        waiters: VecDeque<ConnId>,
    },
    Completed,
}

fn doc_id_from_seed_key(key: &str) -> Option<&str> {
    key.strip_prefix("seed:")
}

struct RoomState {
    docs: HashMap<String, DocSession<()>>,
    /// `doc_id -> set of subscribed connection IDs`
    subscriptions: HashMap<String, HashSet<ConnId>>,
    /// Active connections in this room.
    conns: HashMap<ConnId, OutboundTx>,
    /// Single-winner CAS claims for initial seeding (`key -> Pending | Completed`).
    seed_claims: HashMap<String, SeedClaimState>,
    /// Authoritative awareness state for this room (using hub sentinel ID 0).
    awareness: Awareness,
    /// Multi-connection awareness refcounting: `client_id -> set of conn_ids`.
    awareness_refs: HashMap<u64, HashSet<ConnId>>,
    /// Reverse index: `conn_id -> set of client_ids` announced on that connection.
    conn_clients: HashMap<ConnId, HashSet<u64>>,
    /// Randomized 53-bit hub client ID for internal `DocSession`s (rotated on collision).
    hub_client_id: u64,
}

impl RoomState {
    fn new() -> Self {
        Self {
            docs: HashMap::new(),
            subscriptions: HashMap::new(),
            conns: HashMap::new(),
            seed_claims: HashMap::new(),
            awareness: Awareness::new(0),
            awareness_refs: HashMap::new(),
            conn_clients: HashMap::new(),
            hub_client_id: crate::random_client_id(),
        }
    }

    fn doc_has_page_root(&self, doc_id: &str) -> bool {
        let Some(doc) = self.docs.get(doc_id) else {
            return false;
        };
        let Ok(blocks) = doc.read_map(&TypeTarget::Path(TypePath::root("blocks"))) else {
            return false;
        };
        for (block_id, value) in blocks {
            if matches!(value, SessionReadValue::Map(_)) {
                let block_target = TypeTarget::Path(TypePath::root("blocks").key(&block_id));
                if let Ok(Some(SessionReadValue::Any(Any::String(flavour)))) =
                    doc.get_map_value(&block_target, "sys:flavour")
                    && flavour == "affine:page"
                {
                    return true;
                }
            }
        }
        false
    }

    fn maybe_complete_seed_claim_for_doc(&mut self, doc_id: &str) {
        let key = format!("seed:{doc_id}");
        if !matches!(
            self.seed_claims.get(&key),
            Some(SeedClaimState::Pending { .. })
        ) {
            return;
        }
        if !self.doc_has_page_root(doc_id) {
            return;
        }
        if let Some(SeedClaimState::Pending { waiters, .. }) = self
            .seed_claims
            .insert(key.clone(), SeedClaimState::Completed)
            && let Ok(reply) =
                encode_control_frame(&RoomControlFrame::SeedClaimResult { key, winner: false })
        {
            for waiter_id in waiters {
                self.send_to(waiter_id, Message::Text(reply.clone().into()));
            }
        }
    }

    fn doc_mut(&mut self, doc_id: &str) -> &mut DocSession<()> {
        let hub_client_id = self.hub_client_id;
        self.docs.entry(doc_id.to_string()).or_insert_with(|| {
            DocSession::with_config(
                DocOptions::from_identity(hub_client_id, doc_id.to_string()),
                SessionConfig {
                    undo: SessionUndoConfig::Disabled,
                },
            )
        })
    }

    fn send_to(&self, conn_id: ConnId, msg: Message) {
        if let Some(tx) = self.conns.get(&conn_id) {
            let _ = tx.send(msg);
        }
    }

    fn broadcast_doc_update(&self, doc_id: &str, update: Vec<u8>, exclude: Option<ConnId>) {
        if update.is_empty() || (update.len() == 2 && update[0] == 0 && update[1] == 0) {
            return;
        }
        let Ok(bytes) = encode_binary_frame(&RoomBinaryFrame::Doc {
            doc_id: doc_id.to_string(),
            message: DocMessage::Update(update),
        }) else {
            return;
        };
        if let Some(subs) = self.subscriptions.get(doc_id) {
            for &cid in subs {
                if Some(cid) == exclude {
                    continue;
                }
                self.send_to(cid, Message::Binary(bytes.clone().into()));
            }
        }
    }

    fn broadcast_awareness(&self, payload: Vec<u8>, exclude: Option<ConnId>) {
        let Ok(bytes) = encode_binary_frame(&RoomBinaryFrame::Awareness(payload)) else {
            return;
        };
        for (&cid, tx) in &self.conns {
            if Some(cid) == exclude {
                continue;
            }
            let _ = tx.send(Message::Binary(bytes.clone().into()));
        }
    }

    fn handle_doc_message(&mut self, conn_id: ConnId, doc_id: String, msg: DocMessage) {
        match msg {
            DocMessage::Step1(client_sv) => {
                // Atomically subscribe connection and compute Step2 + reverse Step1.
                self.subscriptions
                    .entry(doc_id.clone())
                    .or_default()
                    .insert(conn_id);

                let doc = self.doc_mut(&doc_id);
                let diff_to_client = doc
                    .encode_diff_v1(&client_sv)
                    .unwrap_or_else(|_| vec![0, 0]);
                let hub_sv = doc.encode_state_vector_v1().unwrap_or_else(|_| vec![0]);

                if let Ok(step2_bytes) = encode_binary_frame(&RoomBinaryFrame::Doc {
                    doc_id: doc_id.clone(),
                    message: DocMessage::Step2(diff_to_client),
                }) {
                    self.send_to(conn_id, Message::Binary(step2_bytes.into()));
                }
                if let Ok(step1_bytes) = encode_binary_frame(&RoomBinaryFrame::Doc {
                    doc_id,
                    message: DocMessage::Step1(hub_sv),
                }) {
                    self.send_to(conn_id, Message::Binary(step1_bytes.into()));
                }
            }
            DocMessage::Step2(diff) => {
                self.subscriptions
                    .entry(doc_id.clone())
                    .or_default()
                    .insert(conn_id);
                self.apply_and_broadcast(conn_id, &doc_id, &diff);
                if let Ok(ready_text) = encode_control_frame(&RoomControlFrame::Ready { doc_id }) {
                    self.send_to(conn_id, Message::Text(ready_text.into()));
                }
            }
            DocMessage::Update(update) => {
                self.subscriptions
                    .entry(doc_id.clone())
                    .or_default()
                    .insert(conn_id);
                self.apply_and_broadcast(conn_id, &doc_id, &update);
            }
        }
    }

    fn apply_and_broadcast(&mut self, sender: ConnId, doc_id: &str, bytes: &[u8]) {
        if bytes.is_empty() || (bytes.len() == 2 && bytes[0] == 0 && bytes[1] == 0) {
            return;
        }
        let commits = {
            let doc = self.doc_mut(doc_id);
            if let Ok(incoming_sv_bytes) = encode_state_vector_from_update_v1(bytes)
                && let Ok(incoming_sv) = StateVector::decode_v1(&incoming_sv_bytes)
                && (doc.client_required() || incoming_sv.contains_key(&doc.client()))
            {
                let mut next_id = crate::random_client_id();
                while incoming_sv.contains_key(&next_id) || next_id == doc.client() {
                    next_id = crate::random_client_id();
                }
                doc.set_client(next_id);
            }
            let result = match doc.apply_update_v1(bytes) {
                Ok(commits) => commits,
                Err(err) => {
                    tracing::warn!(%doc_id, %err, "ignoring invalid CRDT update");
                    return;
                }
            };
            if doc.client_required() {
                doc.set_client(crate::random_client_id());
            }
            result
        };
        for commit in commits {
            if commit.update.is_empty() {
                continue;
            }
            if commit.origin_kind == SessionOriginKind::FormattingCleanup {
                // Cleanup commit generated by hub must reach all subscribers including sender.
                self.broadcast_doc_update(doc_id, commit.update, None);
            } else {
                // Broadcast only the actual incremental CommitEvent bytes to other peers.
                self.broadcast_doc_update(doc_id, commit.update, Some(sender));
            }
        }
        self.maybe_complete_seed_claim_for_doc(doc_id);
    }

    fn handle_awareness(&mut self, conn_id: ConnId, payload: Vec<u8>) {
        // Decode incoming frame against a clean probe so equal-clock announcements
        // still record `(client_id, conn_id)` ownership and explicit `"null"` removals
        // are checked against remaining owners BEFORE mutating shared `self.awareness`.
        let mut probe = Awareness::new(0);
        if probe.apply_update_v1(&payload).is_err() {
            return;
        }

        let mut to_apply = AwarenessStates::new();
        for (&cid, state) in probe.get_states() {
            if cid == 0 {
                continue;
            }
            if state.is_deleted() {
                let is_last = match self.awareness_refs.get_mut(&cid) {
                    Some(conns) => {
                        conns.remove(&conn_id);
                        if conns.is_empty() {
                            self.awareness_refs.remove(&cid);
                            true
                        } else {
                            false
                        }
                    }
                    None => true,
                };
                if let Some(clients) = self.conn_clients.get_mut(&conn_id) {
                    clients.remove(&cid);
                }
                if is_last {
                    to_apply.insert(cid, state.clone());
                }
            } else {
                self.awareness_refs.entry(cid).or_default().insert(conn_id);
                self.conn_clients.entry(conn_id).or_default().insert(cid);
                to_apply.insert(cid, state.clone());
            }
        }

        if to_apply.is_empty() {
            return;
        }

        // `y-protocols` expires a remote peer by announcing `{ clock: c, state: null }` at the
        // peer's current clock, and `Awareness::apply_update` accepts that equal-clock
        // live-to-deleted transition, so it must reach the other connections as well.
        let forward_clients: Vec<u64> = to_apply
            .iter()
            .filter_map(|(&cid, incoming)| {
                let changes_state = self
                    .awareness
                    .get_states()
                    .get(&cid)
                    .is_none_or(|existing| {
                        incoming.clock() > existing.clock()
                            || (incoming.clock() == existing.clock()
                                && incoming.is_deleted()
                                && !existing.is_deleted())
                    });
                changes_state.then_some(cid)
            })
            .collect();

        self.awareness.apply_update(to_apply);

        if !forward_clients.is_empty()
            && let Ok(encoded) = self.awareness.encode_update(Some(&forward_clients))
        {
            self.broadcast_awareness(encoded, Some(conn_id));
        }
    }

    fn handle_control(&mut self, conn_id: ConnId, text: &str) {
        let Ok(frame) = decode_control_frame(text) else {
            return;
        };
        if let RoomControlFrame::SeedClaim { key } = frame {
            let Some(doc_id) = doc_id_from_seed_key(&key) else {
                // Generic non-doc CAS key: single-winner immediate decision.
                let winner = !self.seed_claims.contains_key(&key);
                if winner {
                    self.seed_claims
                        .insert(key.clone(), SeedClaimState::Completed);
                }
                if let Ok(reply) =
                    encode_control_frame(&RoomControlFrame::SeedClaimResult { key, winner })
                {
                    self.send_to(conn_id, Message::Text(reply.into()));
                }
                return;
            };

            if self.doc_has_page_root(doc_id) {
                self.seed_claims
                    .insert(key.clone(), SeedClaimState::Completed);
                if let Ok(reply) =
                    encode_control_frame(&RoomControlFrame::SeedClaimResult { key, winner: false })
                {
                    self.send_to(conn_id, Message::Text(reply.into()));
                }
                return;
            }

            match self.seed_claims.get_mut(&key) {
                None => {
                    self.seed_claims.insert(
                        key.clone(),
                        SeedClaimState::Pending {
                            winner_conn_id: conn_id,
                            waiters: VecDeque::new(),
                        },
                    );
                    if let Ok(reply) = encode_control_frame(&RoomControlFrame::SeedClaimResult {
                        key,
                        winner: true,
                    }) {
                        self.send_to(conn_id, Message::Text(reply.into()));
                    }
                }
                Some(SeedClaimState::Completed) => {
                    if let Ok(reply) = encode_control_frame(&RoomControlFrame::SeedClaimResult {
                        key,
                        winner: false,
                    }) {
                        self.send_to(conn_id, Message::Text(reply.into()));
                    }
                }
                Some(SeedClaimState::Pending {
                    winner_conn_id,
                    waiters,
                }) => {
                    if *winner_conn_id == conn_id {
                        if let Ok(reply) =
                            encode_control_frame(&RoomControlFrame::SeedClaimResult {
                                key,
                                winner: true,
                            })
                        {
                            self.send_to(conn_id, Message::Text(reply.into()));
                        }
                    } else if !waiters.contains(&conn_id) {
                        waiters.push_back(conn_id);
                    }
                }
            }
        }
    }

    fn on_connect(&mut self, conn_id: ConnId, tx: OutboundTx) {
        self.conns.insert(conn_id, tx);
        // Send currently active awareness states to the newly connected peer.
        let active: Vec<u64> = self
            .awareness
            .get_states()
            .iter()
            .filter(|(_, s)| !s.is_deleted())
            .map(|(&cid, _)| cid)
            .collect();
        if !active.is_empty()
            && let Ok(encoded) = self.awareness.encode_update(Some(&active))
            && let Ok(frame) = encode_binary_frame(&RoomBinaryFrame::Awareness(encoded))
        {
            self.send_to(conn_id, Message::Binary(frame.into()));
        }
    }

    fn on_disconnect(&mut self, conn_id: ConnId) {
        self.conns.remove(&conn_id);
        for subs in self.subscriptions.values_mut() {
            subs.remove(&conn_id);
        }

        // Recover any pending seed claim abandoned by a disconnecting winner.
        let mut keys_to_remove = Vec::new();
        let mut notifications: Vec<(ConnId, String, bool)> = Vec::new();
        let completed_docs: HashSet<String> = self
            .seed_claims
            .keys()
            .filter_map(|k| {
                doc_id_from_seed_key(k)
                    .filter(|doc_id| self.doc_has_page_root(doc_id))
                    .map(|_| k.clone())
            })
            .collect();

        for (key, state) in &mut self.seed_claims {
            if let SeedClaimState::Pending {
                winner_conn_id,
                waiters,
            } = state
            {
                waiters.retain(|&c| c != conn_id);
                if *winner_conn_id == conn_id {
                    if completed_docs.contains(key) {
                        for waiter_id in waiters.drain(..) {
                            notifications.push((waiter_id, key.clone(), false));
                        }
                        *state = SeedClaimState::Completed;
                    } else {
                        let mut promoted = None;
                        while let Some(next_id) = waiters.pop_front() {
                            if self.conns.contains_key(&next_id) {
                                promoted = Some(next_id);
                                break;
                            }
                        }
                        if let Some(next_id) = promoted {
                            *winner_conn_id = next_id;
                            notifications.push((next_id, key.clone(), true));
                        } else {
                            keys_to_remove.push(key.clone());
                        }
                    }
                }
            }
        }
        for key in keys_to_remove {
            self.seed_claims.remove(&key);
        }
        for (target_conn, key, winner) in notifications {
            if let Ok(reply) =
                encode_control_frame(&RoomControlFrame::SeedClaimResult { key, winner })
            {
                self.send_to(target_conn, Message::Text(reply.into()));
            }
        }

        let Some(clients) = self.conn_clients.remove(&conn_id) else {
            return;
        };
        let mut removals = AwarenessStates::new();
        let mut removed_ids = Vec::new();

        for cid in clients {
            let is_last = match self.awareness_refs.get_mut(&cid) {
                Some(conns) => {
                    conns.remove(&conn_id);
                    if conns.is_empty() {
                        self.awareness_refs.remove(&cid);
                        true
                    } else {
                        false
                    }
                }
                None => true,
            };
            if is_last {
                let next_clock = self
                    .awareness
                    .get_states()
                    .get(&cid)
                    .map_or(1, |s| s.clock().saturating_add(1));
                removals.insert(cid, AwarenessState::new(next_clock, "null".to_string()));
                removed_ids.push(cid);
            }
        }

        if !removed_ids.is_empty() {
            self.awareness.apply_update(removals);
            if let Ok(encoded) = self.awareness.encode_update(Some(&removed_ids)) {
                self.broadcast_awareness(encoded, None);
            }
        }
    }
}

type BlobKey = (String, String);
type BlobEntry = (Bytes, Option<String>);
type BlobMap = HashMap<BlobKey, BlobEntry>;

/// Shared state for the single-port `bs_room` HTTP + WebSocket Hub.
#[derive(Clone, Default)]
pub struct RoomHub {
    rooms: Arc<Mutex<HashMap<String, Arc<Mutex<RoomState>>>>>,
    blobs: Arc<Mutex<BlobMap>>,
    next_conn_id: Arc<AtomicU64>,
}

impl RoomHub {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn router(self) -> Router {
        Router::new()
            .route("/healthz", get(healthz))
            .route("/native-sync/rooms/{room}", get(ws_room_handler))
            .route(
                "/api/collection/{id}/blob/{key}",
                get(blob_get)
                    .put(blob_put)
                    .delete(blob_delete)
                    .options(blob_options),
            )
            .layer(DefaultBodyLimit::max(MAX_BLOB_BODY_BYTES))
            .with_state(self)
    }

    async fn get_or_create_room(&self, room: &str) -> Arc<Mutex<RoomState>> {
        let mut guard = self.rooms.lock().await;
        guard
            .entry(room.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(RoomState::new())))
            .clone()
    }
}

async fn healthz() -> impl IntoResponse {
    Json(json!({ "status": "ok" }))
}

async fn ws_room_handler(
    Path(room): Path<String>,
    State(hub): State<RoomHub>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(hub, room, socket))
}

async fn handle_socket(hub: RoomHub, room_name: String, socket: WebSocket) {
    let conn_id = hub.next_conn_id.fetch_add(1, Ordering::Relaxed) + 1;
    let room = hub.get_or_create_room(&room_name).await;
    let (mut ws_sink, mut ws_stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    {
        let mut guard = room.lock().await;
        guard.on_connect(conn_id, tx);
    }

    let writer = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sink.send(msg).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = ws_stream.next().await {
        match msg {
            Message::Binary(bytes) => match decode_binary_frame(&bytes) {
                Ok(RoomBinaryFrame::Doc { doc_id, message }) => {
                    let mut guard = room.lock().await;
                    guard.handle_doc_message(conn_id, doc_id, message);
                }
                Ok(RoomBinaryFrame::Awareness(payload)) => {
                    let mut guard = room.lock().await;
                    guard.handle_awareness(conn_id, payload);
                }
                Err(err) => {
                    tracing::warn!(%room_name, %conn_id, %err, "malformed binary frame");
                }
            },
            Message::Text(text) => {
                let mut guard = room.lock().await;
                guard.handle_control(conn_id, &text);
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    {
        let mut guard = room.lock().await;
        guard.on_disconnect(conn_id);
    }
    writer.abort();
}

fn with_blob_cors(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, PUT, DELETE, POST, OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Content-Type"),
    );
    response
}

async fn blob_options() -> Response {
    with_blob_cors(StatusCode::NO_CONTENT.into_response())
}

async fn blob_get(Path((id, key)): Path<(String, String)>, State(hub): State<RoomHub>) -> Response {
    let guard = hub.blobs.lock().await;
    let resp = match guard.get(&(id, key)) {
        Some((data, content_type)) => {
            let ct = content_type
                .clone()
                .unwrap_or_else(|| "application/octet-stream".to_string());
            ([(header::CONTENT_TYPE, ct)], data.clone()).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    };
    with_blob_cors(resp)
}

async fn blob_put(
    Path((id, key)): Path<(String, String)>,
    State(hub): State<RoomHub>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(ToString::to_string);
    let mut guard = hub.blobs.lock().await;
    guard.insert((id, key), (body, content_type));
    with_blob_cors(StatusCode::OK.into_response())
}

async fn blob_delete(
    Path((id, key)): Path<(String, String)>,
    State(hub): State<RoomHub>,
) -> Response {
    let mut guard = hub.blobs.lock().await;
    guard.remove(&(id, key));
    with_blob_cors(StatusCode::OK.into_response())
}
