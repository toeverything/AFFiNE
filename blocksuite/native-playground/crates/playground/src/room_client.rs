//! Live room sync for the playground view.
//!
//! [`RoomProtocol`] is the sans-I/O client side of the relay's binary room protocol
//! (`SyncStep1` / `SyncStep2` / `Update` document frames and awareness frames from
//! `blocksuite_playground_doc::wire`): it turns incoming frames into document and
//! awareness changes on a [`DocState`] and says which frames to send back.
//!
//! [`connect`] opens the transport that carries those frames: a `tokio-tungstenite`
//! socket on a background thread on native targets, a browser `WebSocket` on the Web.
//! Both deliver [`RoomEvent`]s through a channel read on the UI thread and fetch image
//! blobs over HTTP from the relay's blob endpoint (a bare HTTP/1.1 `GET` natively, `fetch`
//! on the Web).

use std::{
    collections::{BTreeMap, HashMap},
    sync::Arc,
};

use blocksuite_playground_doc::{
    DocResult,
    awareness::{AwarenessPayload, RoomAwareness},
    session::WorkspaceSession,
    wire::{
        DocMessage, DocSyncPhase, DocSyncState, RoomBinaryFrame, RoomControlFrame,
        decode_binary_frame, decode_control_frame, encode_binary_frame,
    },
};

/// Relay address used when a room is requested without one.
pub const DEFAULT_RELAY: &str = "ws://127.0.0.1:8788";

/// Name the native playground announces in room awareness.
pub const LOCAL_AWARENESS_NAME: &str = "Native Playground";
/// Color the native playground announces in room awareness.
pub const LOCAL_AWARENESS_COLOR: &str = "var(--affine-multi-players-blue)";

/// Document, presence and blob state shown by the playground view.
pub struct DocState {
    pub workspace: WorkspaceSession,
    pub awareness: RoomAwareness,
    /// Blob bytes by `sourceId`.
    pub blobs: HashMap<String, Arc<Vec<u8>>>,
}

impl DocState {
    /// Empty state for `room`, authored by `client_id`.
    pub fn new(room: &str, client_id: u64) -> DocResult<Self> {
        Ok(Self {
            workspace: WorkspaceSession::new(room, client_id)?,
            awareness: RoomAwareness::new(client_id)?,
            blobs: HashMap::new(),
        })
    }
}

/// Where a live room is reached.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RoomConfig {
    pub room: String,
    /// WebSocket URL of the room (`…/native-sync/rooms/<room>`).
    pub ws_url: String,
    /// HTTP origin of the relay serving `/api/collection/<room>/blob/<sourceId>`.
    pub http_origin: String,
}

impl RoomConfig {
    /// Resolve a room against a relay address. `relay` may be a relay origin
    /// (`ws://host:port`, `http://host:port`) or the full room WebSocket URL;
    /// [`DEFAULT_RELAY`] is used when it is absent.
    pub fn new(room: &str, relay: Option<&str>) -> Self {
        let relay = relay
            .map(str::trim)
            .filter(|relay| !relay.is_empty())
            .unwrap_or(DEFAULT_RELAY);
        let relay = if let Some(rest) = relay.strip_prefix("http://") {
            format!("ws://{rest}")
        } else if let Some(rest) = relay.strip_prefix("https://") {
            format!("wss://{rest}")
        } else {
            relay.to_string()
        };
        let ws_url = if relay.contains("/native-sync/rooms/") {
            relay
        } else {
            format!(
                "{}/native-sync/rooms/{}",
                relay.trim_end_matches('/'),
                percent_encode(room)
            )
        };
        let (scheme, rest) = ws_url.split_once("://").unwrap_or(("ws", ws_url.as_str()));
        let authority = rest.split('/').next().unwrap_or(rest);
        let http_scheme = if scheme == "wss" { "https" } else { "http" };
        Self {
            room: room.to_string(),
            http_origin: format!("{http_scheme}://{authority}"),
            ws_url,
        }
    }

    /// Check that a native transport can reach this room. Native targets speak plain
    /// `ws://` and `http://` only (no TLS stack is linked); `wss://` and `https://` relays
    /// work on the Web, where the browser handles TLS.
    pub fn validate_native(&self) -> anyhow::Result<()> {
        anyhow::ensure!(
            self.ws_url.starts_with("ws://") && self.http_origin.starts_with("http://"),
            "the native playground reaches relays over plain ws:// and http:// only, not {}",
            self.ws_url
        );
        Ok(())
    }

    /// URL of a blob of this room on the relay.
    pub fn blob_url(&self, source_id: &str) -> String {
        format!(
            "{}/api/collection/{}/blob/{}",
            self.http_origin,
            percent_encode(&self.room),
            percent_encode(source_id)
        )
    }
}

fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(char::from(byte));
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// A WebSocket frame of the room protocol.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RoomFrame {
    Binary(Vec<u8>),
    Text(String),
}

/// Something the transport reports to the UI thread.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RoomEvent {
    /// The socket is open; the handshake can start.
    Opened,
    Frame(RoomFrame),
    /// The socket closed or failed to open; the transport reconnects on its own.
    Closed(String),
    /// A blob fetch finished; `bytes` is `None` when the relay does not have it.
    Blob {
        source_id: String,
        bytes: Option<Vec<u8>>,
    },
}

/// Something the UI thread asks of the transport.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RoomCommand {
    Send(RoomFrame),
    FetchBlob(String),
    Close,
}

/// Connection state of a live room, as shown to the user.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RoomStatus {
    Connecting,
    /// Connected; `pending` documents have not finished their handshake.
    Syncing {
        pending: usize,
    },
    Live,
    Offline(String),
}

/// What handling an event changed and which frames must be sent in response.
#[derive(Debug, Default)]
pub struct RoomEffects {
    pub outbound: Vec<RoomFrame>,
    pub doc_changed: bool,
    pub awareness_changed: bool,
}

/// Sans-I/O client of the relay's room protocol for one room.
pub struct RoomProtocol {
    room: String,
    sync: BTreeMap<String, DocSyncState>,
    ready: BTreeMap<String, bool>,
    status: RoomStatus,
    /// Whether a socket was open before: the next open is a reconnect.
    has_opened: bool,
}

impl RoomProtocol {
    pub fn new(room: impl Into<String>) -> Self {
        Self {
            room: room.into(),
            sync: BTreeMap::new(),
            ready: BTreeMap::new(),
            status: RoomStatus::Connecting,
            has_opened: false,
        }
    }

    pub fn room(&self) -> &str {
        &self.room
    }

    pub fn status(&self) -> RoomStatus {
        match &self.status {
            RoomStatus::Syncing { .. } => {
                let pending = self.ready.values().filter(|ready| !**ready).count();
                if pending == 0 {
                    RoomStatus::Live
                } else {
                    RoomStatus::Syncing { pending }
                }
            }
            other => other.clone(),
        }
    }

    /// The socket opened: announce local presence and pull the root document and every
    /// page known so far.
    pub fn on_open(&mut self, state: &mut DocState, now_ms: u64) -> DocResult<RoomEffects> {
        let mut effects = RoomEffects::default();
        self.status = RoomStatus::Syncing { pending: 0 };
        self.sync.clear();
        self.ready.clear();

        let payload = AwarenessPayload::new(LOCAL_AWARENESS_NAME, LOCAL_AWARENESS_COLOR);
        // On a reconnect the relay holds a tombstone for this client that the presence
        // has to outrank.
        let awareness = if std::mem::replace(&mut self.has_opened, true) {
            state.awareness.reannounce_local_payload(&payload, now_ms)?
        } else {
            state.awareness.set_local_payload(&payload, now_ms)?
        };
        effects
            .outbound
            .push(binary(&RoomBinaryFrame::Awareness(awareness))?);

        let room = self.room.clone();
        self.begin_pull(state, &room, &mut effects)?;
        self.pull_known_pages(state, &mut effects)?;
        Ok(effects)
    }

    /// The socket closed: every handshake restarts on the next open.
    pub fn on_close(&mut self, reason: impl Into<String>) -> RoomEffects {
        for sync in self.sync.values_mut() {
            sync.on_disconnect();
        }
        self.ready.clear();
        self.status = RoomStatus::Offline(reason.into());
        RoomEffects::default()
    }

    /// Apply one frame from the relay.
    pub fn on_frame(
        &mut self,
        state: &mut DocState,
        frame: &RoomFrame,
        now_ms: u64,
    ) -> DocResult<RoomEffects> {
        let mut effects = RoomEffects::default();
        match frame {
            RoomFrame::Text(text) => {
                if let Ok(RoomControlFrame::Ready { doc_id }) = decode_control_frame(text) {
                    self.ready.insert(doc_id, true);
                }
            }
            RoomFrame::Binary(bytes) => match decode_binary_frame(bytes)? {
                RoomBinaryFrame::Awareness(payload) => {
                    let event = state.awareness.apply_update(&payload, now_ms)?;
                    effects.awareness_changed = !event.added().is_empty()
                        || !event.updated().is_empty()
                        || !event.removed().is_empty();
                }
                RoomBinaryFrame::Doc { doc_id, message } => match message {
                    DocMessage::Step2(diff) => {
                        self.apply(state, &doc_id, &diff, &mut effects)?;
                        let remote_sv = self
                            .sync
                            .get_mut(&doc_id)
                            .and_then(DocSyncState::on_hub_step2);
                        self.finish_handshake(state, &doc_id, remote_sv, &mut effects)?;
                    }
                    DocMessage::Step1(remote_sv) => {
                        let remote_sv = self
                            .sync
                            .get_mut(&doc_id)
                            .and_then(|sync| sync.on_hub_step1(remote_sv));
                        self.finish_handshake(state, &doc_id, remote_sv, &mut effects)?;
                    }
                    DocMessage::Update(update) => {
                        self.apply(state, &doc_id, &update, &mut effects)?;
                    }
                },
            },
        }
        Ok(effects)
    }

    /// Advance awareness to `now_ms`: renew local presence and expire silent peers.
    pub fn tick(&mut self, state: &mut DocState, now_ms: u64) -> DocResult<RoomEffects> {
        let mut effects = RoomEffects::default();
        let tick = state.awareness.tick(now_ms)?;
        effects.awareness_changed = !tick.expired_clients.is_empty();
        if let Some(update) = tick.outbound_update
            && !matches!(self.status, RoomStatus::Connecting | RoomStatus::Offline(_))
        {
            effects
                .outbound
                .push(binary(&RoomBinaryFrame::Awareness(update))?);
        }
        Ok(effects)
    }

    fn begin_pull(
        &mut self,
        state: &mut DocState,
        doc_id: &str,
        effects: &mut RoomEffects,
    ) -> DocResult {
        if doc_id != self.room {
            state.workspace.ensure_page(doc_id)?;
        }
        let state_vector = state.workspace.encode_state_vector_v1(doc_id)?;
        let sync = self
            .sync
            .entry(doc_id.to_string())
            .or_insert_with(|| DocSyncState::new(doc_id));
        effects
            .outbound
            .push(binary(&sync.begin_pull(state_vector))?);
        self.ready.insert(doc_id.to_string(), false);
        Ok(())
    }

    /// Start the handshake of every page listed in the root document that has none yet.
    fn pull_known_pages(&mut self, state: &mut DocState, effects: &mut RoomEffects) -> DocResult {
        let page_ids: Vec<String> = state
            .workspace
            .list_pages()?
            .into_iter()
            .map(|page| page.id)
            .filter(|id| {
                self.sync
                    .get(id)
                    .is_none_or(|sync| sync.phase() == DocSyncPhase::Idle)
            })
            .collect();
        for page_id in page_ids {
            self.begin_pull(state, &page_id, effects)?;
        }
        Ok(())
    }

    fn apply(
        &mut self,
        state: &mut DocState,
        doc_id: &str,
        update: &[u8],
        effects: &mut RoomEffects,
    ) -> DocResult {
        if update.is_empty() || update == [0, 0] {
            return Ok(());
        }
        let cleanup = if doc_id == self.room {
            let result = state.workspace.apply_root_update_v1(update)?;
            result.outbound_updates
        } else {
            let page = state.workspace.ensure_page(doc_id)?;
            page.apply_remote_update_v1(update)?.outbound_updates
        };
        effects.doc_changed = true;
        // Formatting cleanups produced while integrating must reach the other peers.
        for update in cleanup {
            effects.outbound.push(binary(&RoomBinaryFrame::Doc {
                doc_id: doc_id.to_string(),
                message: DocMessage::Update(update),
            })?);
        }
        if doc_id == self.room {
            self.pull_known_pages(state, effects)?;
        }
        Ok(())
    }

    /// Once the hub's `Step2` and reverse `Step1` both arrived, answer with what the hub
    /// is missing (always sent, even when empty, so the hub acknowledges with `ready`).
    fn finish_handshake(
        &mut self,
        state: &mut DocState,
        doc_id: &str,
        remote_sv: Option<Vec<u8>>,
        effects: &mut RoomEffects,
    ) -> DocResult {
        let Some(remote_sv) = remote_sv else {
            return Ok(());
        };
        let diff = state.workspace.encode_diff_v1(doc_id, &remote_sv)?;
        if let Some(sync) = self.sync.get(doc_id) {
            effects
                .outbound
                .push(binary(&sync.build_reverse_step2(diff))?);
        }
        Ok(())
    }
}

fn binary(frame: &RoomBinaryFrame) -> DocResult<RoomFrame> {
    Ok(RoomFrame::Binary(encode_binary_frame(frame)?))
}

/// Handle to a room transport, owned by the UI thread.
pub struct RoomLink {
    events: async_channel::Receiver<RoomEvent>,
    commands: Box<dyn Fn(RoomCommand)>,
}

impl RoomLink {
    /// Build a link from an event channel and a command sink (the seam transports and
    /// in-process loopbacks plug into).
    pub fn from_parts(
        events: async_channel::Receiver<RoomEvent>,
        commands: impl Fn(RoomCommand) + 'static,
    ) -> Self {
        Self {
            events,
            commands: Box::new(commands),
        }
    }

    /// Events reported by the transport, in order.
    pub fn events(&self) -> &async_channel::Receiver<RoomEvent> {
        &self.events
    }

    pub fn send(&self, command: RoomCommand) {
        (self.commands)(command);
    }
}

impl Drop for RoomLink {
    fn drop(&mut self) {
        (self.commands)(RoomCommand::Close);
    }
}

#[cfg(not(target_family = "wasm"))]
pub use native::connect;
#[cfg(target_family = "wasm")]
pub use web::connect;

#[cfg(not(target_family = "wasm"))]
mod native {
    use std::time::Duration;

    use futures_util::{SinkExt, StreamExt};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpStream,
        sync::mpsc,
        time::timeout,
    };
    use tokio_tungstenite::{connect_async, tungstenite::Message};

    use super::{RoomCommand, RoomConfig, RoomEvent, RoomFrame, RoomLink};

    const RECONNECT_MIN: Duration = Duration::from_millis(250);
    const RECONNECT_MAX: Duration = Duration::from_secs(5);

    /// Connect to the room on a background thread running a single-threaded `tokio`
    /// runtime. The transport reconnects with backoff until the link is dropped.
    pub fn connect(config: RoomConfig) -> RoomLink {
        let (events_tx, events_rx) = async_channel::unbounded();
        if let Err(err) = config.validate_native() {
            // Nothing to retry: report the reason once and stay closed.
            let _ = events_tx.try_send(RoomEvent::Closed(err.to_string()));
            return RoomLink::from_parts(events_rx, |_| {});
        }
        let (commands_tx, commands_rx) = mpsc::unbounded_channel();
        let failure_tx = events_tx.clone();
        let spawned = std::thread::Builder::new()
            .name("room-sync".to_string())
            .spawn(move || {
                match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime.block_on(run(config, events_tx, commands_rx)),
                    Err(err) => {
                        let _ = events_tx.try_send(RoomEvent::Closed(format!(
                            "room sync runtime failed to start: {err}"
                        )));
                    }
                }
            });
        if let Err(err) = spawned {
            let _ = failure_tx.try_send(RoomEvent::Closed(format!(
                "room sync thread failed to start: {err}"
            )));
        }
        RoomLink::from_parts(events_rx, move |command| {
            let _ = commands_tx.send(command);
        })
    }

    /// Largest blob body accepted from the relay.
    const MAX_BLOB_BYTES: usize = 64 * 1024 * 1024;
    /// Longest wait for the relay to connect, finish a handshake, accept a request or send
    /// more bytes.
    const HTTP_TIMEOUT: Duration = Duration::from_secs(5);

    /// Fetch a blob with a plain HTTP/1.1 `GET` over TCP (`http://host[:port]/path`).
    /// `None` when the URL is not plain HTTP, the relay does not answer `2xx` in time, or
    /// the body is malformed or larger than [`MAX_BLOB_BYTES`].
    async fn fetch_blob(url: String) -> Option<Vec<u8>> {
        let rest = url.strip_prefix("http://")?;
        let (authority, path) = match rest.find('/') {
            Some(slash) => rest.split_at(slash),
            None => (rest, "/"),
        };
        let has_port = authority
            .rsplit_once(':')
            .is_some_and(|(_, port)| !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()));
        let address = if has_port {
            authority.to_string()
        } else {
            format!("{authority}:80")
        };
        let mut stream = timeout(HTTP_TIMEOUT, TcpStream::connect(address))
            .await
            .ok()?
            .ok()?;
        let request = format!(
            "GET {path} HTTP/1.1\r\nHost: {authority}\r\nAccept: */*\r\nConnection: close\r\n\r\n"
        );
        timeout(HTTP_TIMEOUT, stream.write_all(request.as_bytes()))
            .await
            .ok()?
            .ok()?;

        // `Connection: close` makes the end of the stream the end of the response.
        let mut response = Vec::new();
        let mut chunk = [0_u8; 16 * 1024];
        loop {
            let read = timeout(HTTP_TIMEOUT, stream.read(&mut chunk))
                .await
                .ok()?
                .ok()?;
            if read == 0 {
                break;
            }
            response.extend_from_slice(&chunk[..read]);
            if response.len() > MAX_BLOB_BYTES + chunk.len() {
                return None;
            }
        }
        parse_http_response(&response)
    }

    /// Body of a complete HTTP/1.1 response with a `2xx` status, honoring `Content-Length`
    /// and chunked framing; without either the body runs to the end of the stream.
    pub(super) fn parse_http_response(response: &[u8]) -> Option<Vec<u8>> {
        let header_end = response.windows(4).position(|w| w == b"\r\n\r\n")?;
        let head = std::str::from_utf8(&response[..header_end]).ok()?;
        let body = &response[header_end + 4..];
        let mut lines = head.split("\r\n");
        let status = lines.next()?.split(' ').nth(1)?;
        if status.len() != 3 || !status.starts_with('2') {
            return None;
        }
        let mut content_length = None;
        let mut chunked = false;
        for line in lines {
            let (name, value) = line.split_once(':')?;
            let value = value.trim();
            if name.eq_ignore_ascii_case("content-length") {
                content_length = Some(value.parse::<usize>().ok()?);
            } else if name.eq_ignore_ascii_case("transfer-encoding") {
                chunked = value.to_ascii_lowercase().contains("chunked");
            }
        }
        let body = if chunked {
            decode_chunked(body)?
        } else if let Some(length) = content_length {
            body.get(..length)?.to_vec()
        } else {
            body.to_vec()
        };
        (body.len() <= MAX_BLOB_BYTES).then_some(body)
    }

    fn decode_chunked(mut body: &[u8]) -> Option<Vec<u8>> {
        let mut decoded = Vec::new();
        loop {
            let line_end = body.windows(2).position(|w| w == b"\r\n")?;
            let size_line = std::str::from_utf8(&body[..line_end]).ok()?;
            let size = usize::from_str_radix(size_line.split(';').next()?.trim(), 16).ok()?;
            body = &body[line_end + 2..];
            if size == 0 {
                return Some(decoded);
            }
            if decoded.len().checked_add(size)? > MAX_BLOB_BYTES {
                return None;
            }
            decoded.extend_from_slice(body.get(..size)?);
            // Each chunk is followed by its own line break.
            let rest = &body[size..];
            if rest.get(..2) != Some(b"\r\n".as_slice()) {
                return None;
            }
            body = &rest[2..];
        }
    }

    fn spawn_fetch(
        config: &RoomConfig,
        events: &async_channel::Sender<RoomEvent>,
        source_id: String,
    ) {
        let url = config.blob_url(&source_id);
        let events = events.clone();
        tokio::spawn(async move {
            let bytes = fetch_blob(url).await;
            let _ = events.try_send(RoomEvent::Blob { source_id, bytes });
        });
    }

    /// Serve a command while no socket is open; `false` once the link is gone.
    fn serve_unconnected(
        command: Option<RoomCommand>,
        config: &RoomConfig,
        events: &async_channel::Sender<RoomEvent>,
    ) -> bool {
        match command {
            Some(RoomCommand::FetchBlob(source_id)) => {
                spawn_fetch(config, events, source_id);
                true
            }
            // Frames addressed to a closed socket are dropped: the next handshake resends
            // whatever the relay is missing.
            Some(RoomCommand::Send(_)) => true,
            Some(RoomCommand::Close) | None => false,
        }
    }

    async fn run(
        config: RoomConfig,
        events: async_channel::Sender<RoomEvent>,
        mut commands: mpsc::UnboundedReceiver<RoomCommand>,
    ) {
        let mut backoff = RECONNECT_MIN;
        loop {
            // A pending connect never holds up blob fetches or shutdown.
            let connecting = timeout(HTTP_TIMEOUT, connect_async(config.ws_url.as_str()));
            tokio::pin!(connecting);
            let connected = loop {
                tokio::select! {
                    result = &mut connecting => break result,
                    command = commands.recv() => {
                        if !serve_unconnected(command, &config, &events) {
                            return;
                        }
                    }
                }
            };
            let reason = match connected {
                Ok(Ok((stream, _))) => {
                    backoff = RECONNECT_MIN;
                    if events.try_send(RoomEvent::Opened).is_err() {
                        return;
                    }
                    let (mut sink, mut source) = stream.split();
                    loop {
                        tokio::select! {
                            message = source.next() => match message {
                                Some(Ok(Message::Binary(bytes))) => {
                                    let frame = RoomFrame::Binary(bytes.to_vec());
                                    if events.try_send(RoomEvent::Frame(frame)).is_err() {
                                        return;
                                    }
                                }
                                Some(Ok(Message::Text(text))) => {
                                    let frame = RoomFrame::Text(text.to_string());
                                    if events.try_send(RoomEvent::Frame(frame)).is_err() {
                                        return;
                                    }
                                }
                                Some(Ok(Message::Close(_))) | None => {
                                    break "connection closed by relay".to_string();
                                }
                                Some(Ok(_)) => {}
                                Some(Err(err)) => break format!("connection lost: {err}"),
                            },
                            command = commands.recv() => match command {
                                Some(RoomCommand::Send(RoomFrame::Binary(bytes))) => {
                                    if let Err(err) = sink.send(Message::Binary(bytes.into())).await {
                                        break format!("send failed: {err}");
                                    }
                                }
                                Some(RoomCommand::Send(RoomFrame::Text(text))) => {
                                    if let Err(err) = sink.send(Message::Text(text.into())).await {
                                        break format!("send failed: {err}");
                                    }
                                }
                                Some(RoomCommand::FetchBlob(source_id)) => {
                                    spawn_fetch(&config, &events, source_id);
                                }
                                Some(RoomCommand::Close) | None => {
                                    let _ = sink.close().await;
                                    return;
                                }
                            },
                        }
                    }
                }
                Ok(Err(err)) => format!("cannot reach {}: {err}", config.ws_url),
                Err(_) => format!("cannot reach {}: the connection timed out", config.ws_url),
            };
            if events.try_send(RoomEvent::Closed(reason)).is_err() {
                return;
            }

            // Wait out the backoff while still serving blob fetches and shutdown.
            let retry = tokio::time::sleep(backoff);
            tokio::pin!(retry);
            loop {
                tokio::select! {
                    () = &mut retry => break,
                    command = commands.recv() => {
                        if !serve_unconnected(command, &config, &events) {
                            return;
                        }
                    }
                }
            }
            backoff = (backoff * 2).min(RECONNECT_MAX);
        }
    }
}

#[cfg(target_family = "wasm")]
mod web {
    use std::{cell::RefCell, rc::Rc};

    use wasm_bindgen::{JsCast, closure::Closure};
    use web_sys::{BinaryType, CloseEvent, MessageEvent, WebSocket};

    use super::{RoomCommand, RoomConfig, RoomEvent, RoomFrame, RoomLink};

    const RECONNECT_MIN_MS: i32 = 250;
    const RECONNECT_MAX_MS: i32 = 5_000;

    struct WebTransport {
        config: RoomConfig,
        events: async_channel::Sender<RoomEvent>,
        socket: RefCell<Option<WebSocket>>,
        backoff_ms: RefCell<i32>,
        closed: RefCell<bool>,
    }

    /// Connect to the room with a browser `WebSocket` carrying binary `ArrayBuffer`
    /// frames. The transport reconnects with backoff until the link is dropped.
    pub fn connect(config: RoomConfig) -> RoomLink {
        let (events_tx, events_rx) = async_channel::unbounded();
        let transport = Rc::new(WebTransport {
            config,
            events: events_tx,
            socket: RefCell::new(None),
            backoff_ms: RefCell::new(RECONNECT_MIN_MS),
            closed: RefCell::new(false),
        });
        open(&transport);
        RoomLink::from_parts(events_rx, move |command| match command {
            RoomCommand::Send(frame) => {
                if let Some(socket) = transport.socket.borrow().as_ref()
                    && socket.ready_state() == WebSocket::OPEN
                {
                    let _ = match &frame {
                        RoomFrame::Binary(bytes) => socket.send_with_u8_array(bytes),
                        RoomFrame::Text(text) => socket.send_with_str(text),
                    };
                }
            }
            RoomCommand::FetchBlob(source_id) => fetch_blob(&transport, source_id),
            RoomCommand::Close => {
                *transport.closed.borrow_mut() = true;
                let socket = transport.socket.borrow_mut().take();
                if let Some(socket) = socket {
                    let _ = socket.close();
                }
            }
        })
    }

    fn open(transport: &Rc<WebTransport>) {
        if *transport.closed.borrow() {
            return;
        }
        let socket = match WebSocket::new(&transport.config.ws_url) {
            Ok(socket) => socket,
            Err(err) => {
                let _ = transport
                    .events
                    .try_send(RoomEvent::Closed(format!("cannot open WebSocket: {err:?}")));
                schedule_reconnect(transport);
                return;
            }
        };
        socket.set_binary_type(BinaryType::Arraybuffer);

        let on_open = {
            let transport = transport.clone();
            Closure::<dyn FnMut()>::new(move || {
                *transport.backoff_ms.borrow_mut() = RECONNECT_MIN_MS;
                let _ = transport.events.try_send(RoomEvent::Opened);
            })
        };
        socket.set_onopen(Some(on_open.as_ref().unchecked_ref()));
        on_open.forget();

        let on_message = {
            let transport = transport.clone();
            Closure::<dyn FnMut(MessageEvent)>::new(move |event: MessageEvent| {
                let data = event.data();
                let frame = if let Some(text) = data.as_string() {
                    RoomFrame::Text(text)
                } else if data.is_instance_of::<js_sys::ArrayBuffer>() {
                    RoomFrame::Binary(js_sys::Uint8Array::new(&data).to_vec())
                } else {
                    return;
                };
                let _ = transport.events.try_send(RoomEvent::Frame(frame));
            })
        };
        socket.set_onmessage(Some(on_message.as_ref().unchecked_ref()));
        on_message.forget();

        let on_close = {
            let transport = transport.clone();
            Closure::<dyn FnMut(CloseEvent)>::new(move |event: CloseEvent| {
                transport.socket.borrow_mut().take();
                if *transport.closed.borrow() {
                    return;
                }
                let reason = match event.reason() {
                    reason if reason.is_empty() => format!("connection closed ({})", event.code()),
                    reason => reason,
                };
                let _ = transport.events.try_send(RoomEvent::Closed(reason));
                schedule_reconnect(&transport);
            })
        };
        socket.set_onclose(Some(on_close.as_ref().unchecked_ref()));
        on_close.forget();

        *transport.socket.borrow_mut() = Some(socket);
    }

    fn schedule_reconnect(transport: &Rc<WebTransport>) {
        let Some(window) = web_sys::window() else {
            return;
        };
        let delay = *transport.backoff_ms.borrow();
        *transport.backoff_ms.borrow_mut() = (delay * 2).min(RECONNECT_MAX_MS);
        let transport = transport.clone();
        let retry = Closure::once_into_js(move || open(&transport));
        let _ = window
            .set_timeout_with_callback_and_timeout_and_arguments_0(retry.unchecked_ref(), delay);
    }

    fn fetch_blob(transport: &Rc<WebTransport>, source_id: String) {
        let url = transport.config.blob_url(&source_id);
        let events = transport.events.clone();
        wasm_bindgen_futures::spawn_local(async move {
            let bytes = fetch_bytes(&url).await;
            let _ = events.try_send(RoomEvent::Blob { source_id, bytes });
        });
    }

    async fn fetch_bytes(url: &str) -> Option<Vec<u8>> {
        let window = web_sys::window()?;
        let response = wasm_bindgen_futures::JsFuture::from(window.fetch_with_str(url))
            .await
            .ok()?
            .dyn_into::<web_sys::Response>()
            .ok()?;
        if !response.ok() {
            return None;
        }
        let buffer = wasm_bindgen_futures::JsFuture::from(response.array_buffer().ok()?)
            .await
            .ok()?;
        Some(js_sys::Uint8Array::new(&buffer).to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::{
        client_id_from_seed,
        schema::{BlockSpec, ParagraphType},
    };

    #[test]
    fn room_config_resolves_relay_origins_and_full_room_urls() {
        let default = RoomConfig::new("demo", None);
        assert_eq!(default.ws_url, "ws://127.0.0.1:8788/native-sync/rooms/demo");
        assert_eq!(default.http_origin, "http://127.0.0.1:8788");
        assert_eq!(
            default.blob_url("img 1.png"),
            "http://127.0.0.1:8788/api/collection/demo/blob/img%201.png"
        );

        let origin = RoomConfig::new("my room", Some("https://relay.example.com/"));
        assert_eq!(
            origin.ws_url,
            "wss://relay.example.com/native-sync/rooms/my%20room"
        );
        assert_eq!(origin.http_origin, "https://relay.example.com");

        let full = RoomConfig::new("demo", Some("ws://localhost:9000/native-sync/rooms/demo"));
        assert_eq!(full.ws_url, "ws://localhost:9000/native-sync/rooms/demo");
        assert_eq!(full.http_origin, "http://localhost:9000");
    }

    #[test]
    fn http_response_bodies_follow_length_chunked_and_close_framing() {
        use super::native::parse_http_response;

        assert_eq!(
            parse_http_response(
                b"HTTP/1.1 200 OK\r\ncontent-type: image/png\r\nContent-Length: 3\r\n\r\nabcTRAILING"
            ),
            Some(b"abc".to_vec())
        );
        assert_eq!(
            parse_http_response(
                b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWiki\r\n5;x=1\r\npedia\r\n0\r\n\r\n"
            ),
            Some(b"Wikipedia".to_vec())
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 204 No Content\r\n\r\n"),
            Some(Vec::new())
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 200 OK\r\n\r\nuntil close"),
            Some(b"until close".to_vec())
        );
        // Anything but a complete 2xx response is no blob.
        assert_eq!(
            parse_http_response(b"HTTP/1.1 404 Not Found\r\n\r\nmissing"),
            None
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nshort"),
            None
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWi"),
            None
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 200 OK\r\nContent-Length: 3"),
            None
        );
        // A chunk must end with its own line break and declare a size that fits.
        assert_eq!(
            parse_http_response(
                b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWikiXX0\r\n\r\n"
            ),
            None
        );
        assert_eq!(
            parse_http_response(
                b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nffffffffffffffff\r\nWiki\r\n0\r\n\r\n"
            ),
            None
        );
    }

    #[test]
    fn native_transport_rejects_tls_relays_up_front() {
        for relay in ["wss://relay.example", "https://relay.example"] {
            let config = RoomConfig::new("room", Some(relay));
            assert_eq!(config.ws_url, "wss://relay.example/native-sync/rooms/room");
            assert_eq!(config.http_origin, "https://relay.example");
            let error = config.validate_native().unwrap_err().to_string();
            assert!(error.contains("ws://") && error.contains("wss://relay.example"));

            // The transport reports the reason once and never starts a reconnect loop.
            let link = connect(config);
            assert_eq!(link.events().try_recv(), Ok(RoomEvent::Closed(error)));
            assert!(link.events().is_closed());
        }
        for relay in [
            None,
            Some("ws://127.0.0.1:8788"),
            Some("http://relay.local:9000"),
        ] {
            assert!(RoomConfig::new("room", relay).validate_native().is_ok());
        }
    }

    #[test]
    fn closing_the_link_ends_a_pending_connect() {
        // A listener that never answers the WebSocket handshake keeps the connect pending.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let relay = format!("ws://{}", listener.local_addr().unwrap());
        let link = connect(RoomConfig::new("room", Some(&relay)));
        let events = link.events().clone();
        // A frame for the unopened socket is dropped without ending the transport.
        link.send(RoomCommand::Send(RoomFrame::Text("early".to_string())));
        drop(link);
        for _ in 0..300 {
            if events.is_closed() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert!(
            events.is_closed(),
            "the transport kept connecting after its link was dropped"
        );
        assert!(events.try_recv().is_err());
    }

    /// Minimal in-memory hub: answers a `Step1` the way the relay does, from a seeded peer.
    fn hub_reply(hub: &mut DocState, room: &str, frame: &RoomFrame) -> Vec<RoomFrame> {
        let RoomFrame::Binary(bytes) = frame else {
            return Vec::new();
        };
        match decode_binary_frame(bytes).unwrap() {
            RoomBinaryFrame::Doc {
                doc_id,
                message: DocMessage::Step1(client_sv),
            } => {
                if doc_id != room {
                    hub.workspace.ensure_page(&doc_id).unwrap();
                }
                let diff = hub.workspace.encode_diff_v1(&doc_id, &client_sv).unwrap();
                let hub_sv = hub.workspace.encode_state_vector_v1(&doc_id).unwrap();
                vec![
                    binary(&RoomBinaryFrame::Doc {
                        doc_id: doc_id.clone(),
                        message: DocMessage::Step2(diff),
                    })
                    .unwrap(),
                    binary(&RoomBinaryFrame::Doc {
                        doc_id,
                        message: DocMessage::Step1(hub_sv),
                    })
                    .unwrap(),
                ]
            }
            RoomBinaryFrame::Doc {
                doc_id,
                message: DocMessage::Step2(_),
            } => vec![RoomFrame::Text(
                serde_json::json!({ "type": "ready", "docId": doc_id }).to_string(),
            )],
            _ => Vec::new(),
        }
    }

    #[test]
    fn protocol_pulls_root_then_discovered_pages_and_applies_live_updates() {
        let room = "room-protocol";
        let mut hub = DocState::new(room, client_id_from_seed(1)).unwrap();
        hub.workspace.initialize_meta().unwrap();
        hub.workspace.create_page("doc:home", "Home", 1).unwrap();
        {
            let page = hub.workspace.page_mut("doc:home").unwrap();
            page.add_block(
                "page",
                BlockSpec::Page {
                    title: "Home".to_string(),
                },
                None,
                None,
                10,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("page"),
                None,
                20,
            )
            .unwrap();
        }

        let mut client = DocState::new(room, client_id_from_seed(2)).unwrap();
        let mut protocol = RoomProtocol::new(room);
        assert_eq!(protocol.status(), RoomStatus::Connecting);

        // Drive the handshake to a fixed point through the in-memory hub.
        let mut outbound = protocol.on_open(&mut client, 0).unwrap().outbound;
        let mut doc_changed = false;
        let mut rounds = 0;
        while !outbound.is_empty() {
            rounds += 1;
            assert!(rounds < 16, "handshake did not settle");
            let mut next = Vec::new();
            for frame in &outbound {
                for reply in hub_reply(&mut hub, room, frame) {
                    let effects = protocol.on_frame(&mut client, &reply, 5).unwrap();
                    doc_changed |= effects.doc_changed;
                    next.extend(effects.outbound);
                }
            }
            outbound = next;
        }
        assert!(doc_changed);
        assert_eq!(protocol.status(), RoomStatus::Live);
        assert_eq!(client.workspace.list_pages().unwrap()[0].id, "doc:home");
        let snapshot = client
            .workspace
            .page("doc:home")
            .unwrap()
            .read_page_snapshot()
            .unwrap();
        assert_eq!(snapshot.title(), "Home");
        assert_eq!(snapshot.block_count(), 2);

        // A live update from another peer lands in the client document.
        let commit = hub
            .workspace
            .page_mut("doc:home")
            .unwrap()
            .add_block(
                "p-live",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "typed remotely".to_string(),
                },
                Some("note"),
                None,
                30,
            )
            .unwrap()
            .expect("commit");
        let update = binary(&RoomBinaryFrame::Doc {
            doc_id: "doc:home".to_string(),
            message: DocMessage::Update(commit.update),
        })
        .unwrap();
        let effects = protocol.on_frame(&mut client, &update, 10).unwrap();
        assert!(effects.doc_changed);
        assert!(effects.outbound.is_empty());
        let snapshot = client
            .workspace
            .page("doc:home")
            .unwrap()
            .read_page_snapshot()
            .unwrap();
        assert!(snapshot.block("p-live").is_some());

        // Remote presence arrives, then expires after the awareness timeout.
        let mut peer = RoomAwareness::new(client_id_from_seed(3)).unwrap();
        let presence = peer
            .set_local_payload(&AwarenessPayload::new("Peer", "#ff8a00"), 0)
            .unwrap();
        let effects = protocol
            .on_frame(
                &mut client,
                &binary(&RoomBinaryFrame::Awareness(presence)).unwrap(),
                100,
            )
            .unwrap();
        assert!(effects.awareness_changed);
        assert_eq!(client.awareness.active_remote_clients().len(), 1);
        let effects = protocol.tick(&mut client, 100 + 30_000).unwrap();
        assert!(effects.awareness_changed);
        assert!(client.awareness.active_remote_clients().is_empty());

        protocol.on_close("relay stopped");
        assert_eq!(
            protocol.status(),
            RoomStatus::Offline("relay stopped".to_string())
        );
    }
}
