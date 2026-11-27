//! Pure-Rust Engine.IO v4 + Socket.IO v4 server mounted on `axum::Router`
//! at `/socket.io/`, supporting real `socket.io-client@4.8.3` HTTP long-polling
//! handshakes, safe WebSocket probe upgrades (`ws_probe_claimed` vs
//! `upgraded_to_ws`), direct WebSocket connections, binary frames, pong/idle
//! session reaping, bounded outbound queues, and ACK-before-close flushing.

use std::{
  collections::{HashMap, VecDeque},
  sync::{
    Arc,
    atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering},
  },
  time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
  Router,
  body::Bytes,
  extract::{
    DefaultBodyLimit, Query, State,
    ws::{Message, WebSocket, WebSocketUpgrade},
  },
  http::{HeaderMap, StatusCode, header},
  response::{IntoResponse, Response},
  routing::get,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::{Mutex, Notify, RwLock};
use tracing::{debug, warn};

use crate::{
  auth::{SyncSessionAuthenticator, SyncUser},
  gateway::SpaceSyncGateway,
};

const ENGINE_IO_RS: char = '\x1e';
const PING_INTERVAL_MS: u64 = 25_000;
const PING_TIMEOUT_MS: u64 = 20_000;
const MAX_PAYLOAD_BYTES: usize = 100_000_000;
const MAX_OUTBOUND_QUEUE: usize = 1024;
const POLL_WAIT_TIMEOUT: Duration = Duration::from_secs(20);
pub const SESSION_IDLE_TIMEOUT_MS: i64 = (PING_INTERVAL_MS + PING_TIMEOUT_MS) as i64;
const SESSION_REAP_INTERVAL: Duration = Duration::from_secs(5);

fn now_millis() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as i64
}

#[derive(Debug, Deserialize)]
pub struct EngineIoQuery {
  #[serde(rename = "EIO")]
  pub eio: Option<String>,
  pub transport: Option<String>,
  pub sid: Option<String>,
}

const MAX_BINARY_ATTACHMENTS: usize = 16;

#[derive(Default)]
struct OutboundState {
  queue: VecDeque<String>,
  close_after_flush: bool,
}

struct PendingBinaryEvent {
  expected_attachments: usize,
  ack_id: Option<u64>,
  event_name: String,
  arg: Value,
  attachments: Vec<Option<Vec<u8>>>,
  total_bytes: usize,
}

fn replace_binary_placeholders(value: &mut Value, attachments: &mut [Option<Vec<u8>>]) -> Result<(), &'static str> {
  match value {
    Value::Object(map) => {
      if map.get("_placeholder") == Some(&Value::Bool(true)) {
        let idx = map
          .get("num")
          .and_then(Value::as_u64)
          .and_then(|n| usize::try_from(n).ok())
          .ok_or("missing or invalid binary placeholder index")?;
        let slot = attachments
          .get_mut(idx)
          .ok_or("binary placeholder index out of bounds")?;
        let bytes = slot.take().ok_or("duplicate binary placeholder reference")?;
        let encoded = BASE64.encode(&bytes);
        drop(bytes);
        *value = Value::String(encoded);
        return Ok(());
      }
      for v in map.values_mut() {
        replace_binary_placeholders(v, attachments)?;
      }
      Ok(())
    }
    Value::Array(arr) => {
      for item in arr.iter_mut() {
        replace_binary_placeholders(item, attachments)?;
      }
      Ok(())
    }
    _ => Ok(()),
  }
}

/// Outbound queue & transport state for a single Engine.IO / Socket.IO session.
pub struct SocketSession {
  pub engine_sid: String,
  pub socket_id: String,
  pub headers: HeaderMap,
  pub user: RwLock<Option<SyncUser>>,
  outbound: Mutex<OutboundState>,
  pending_binary: Mutex<Option<PendingBinaryEvent>>,
  notify: Notify,
  last_activity_ms: AtomicI64,
  sio_connected: AtomicBool,
  ws_probe_claimed: AtomicBool,
  pending_poll_noop: AtomicBool,
  upgraded_to_ws: AtomicBool,
  closed: AtomicBool,
  disconnected_notified: AtomicBool,
}

impl SocketSession {
  fn new(engine_sid: String, socket_id: String, headers: HeaderMap) -> Self {
    Self {
      engine_sid,
      socket_id,
      headers,
      user: RwLock::new(None),
      outbound: Mutex::new(OutboundState::default()),
      pending_binary: Mutex::new(None),
      notify: Notify::new(),
      last_activity_ms: AtomicI64::new(now_millis()),
      sio_connected: AtomicBool::new(false),
      ws_probe_claimed: AtomicBool::new(false),
      pending_poll_noop: AtomicBool::new(false),
      upgraded_to_ws: AtomicBool::new(false),
      closed: AtomicBool::new(false),
      disconnected_notified: AtomicBool::new(false),
    }
  }

  pub fn touch(&self) {
    self.last_activity_ms.store(now_millis(), Ordering::Release);
  }

  pub fn last_activity_ms(&self) -> i64 {
    self.last_activity_ms.load(Ordering::Acquire)
  }

  /// Enqueues an outbound packet, enforcing [`MAX_OUTBOUND_QUEUE`] to protect
  /// against slow-consumer memory exhaustion. Returns `false` if dropped/closed.
  pub async fn enqueue_raw(&self, packet: String) -> bool {
    if self.closed.load(Ordering::Acquire) {
      return false;
    }
    let mut guard = self.outbound.lock().await;
    if guard.queue.len() >= MAX_OUTBOUND_QUEUE {
      warn!(
        "closing slow Socket.IO session {} (outbound queue reached {MAX_OUTBOUND_QUEUE})",
        self.socket_id
      );
      guard.queue.clear();
      self.closed.store(true, Ordering::Release);
      drop(guard);
      self.notify.notify_waiters();
      return false;
    }
    guard.queue.push_back(packet);
    drop(guard);
    self.notify.notify_waiters();
    true
  }

  pub fn notified(&self) -> tokio::sync::futures::Notified<'_> {
    self.notify.notified()
  }

  pub async fn has_pending_binary(&self) -> bool {
    self.pending_binary.lock().await.is_some()
  }

  pub async fn emit_event(&self, event: &str, payload: &Value) {
    let encoded = serde_json::to_string(&json!([event, payload])).unwrap_or_default();
    let _ = self.enqueue_raw(format!("42{encoded}")).await;
  }

  pub async fn send_ack(&self, ack_id: u64, payload: &Value) {
    let encoded = serde_json::to_string(&json!([payload])).unwrap_or_default();
    let _ = self.enqueue_raw(format!("43{ack_id}{encoded}")).await;
  }

  /// Atomically enqueues an optional ACK packet and (when `close_after_flush` is
  /// true) sets `close_after_flush` under the same `outbound` mutex before a
  /// single `notify_waiters()`, eliminating any race where the WS writer could
  /// observe `close_after_flush` before the reject ACK is queued.
  pub async fn send_ack_and_maybe_close(&self, ack_id: Option<u64>, payload: &Value, close_after_flush: bool) {
    if self.closed.load(Ordering::Acquire) {
      return;
    }
    let mut guard = self.outbound.lock().await;
    if let Some(id) = ack_id {
      if guard.queue.len() >= MAX_OUTBOUND_QUEUE {
        warn!(
          "closing slow Socket.IO session {} (outbound queue reached {MAX_OUTBOUND_QUEUE})",
          self.socket_id
        );
        guard.queue.clear();
        self.closed.store(true, Ordering::Release);
        drop(guard);
        self.notify.notify_waiters();
        return;
      }
      let encoded = serde_json::to_string(&json!([payload])).unwrap_or_default();
      guard.queue.push_back(format!("43{id}{encoded}"));
    }
    if close_after_flush {
      guard.close_after_flush = true;
    }
    drop(guard);
    self.notify.notify_waiters();
  }

  pub async fn drain_outbound(&self) -> (Vec<String>, bool) {
    let mut guard = self.outbound.lock().await;
    let packets = guard.queue.drain(..).collect();
    let should_close = guard.close_after_flush;
    (packets, should_close)
  }

  /// Wakes an in-flight HTTP polling GET with a `6` (noop) packet during
  /// `2probe` WITHOUT marking the session as upgraded to WebSocket yet.
  pub fn wake_polling_noop(&self) {
    self.pending_poll_noop.store(true, Ordering::Release);
    self.notify.notify_waiters();
  }

  pub fn mark_upgraded(&self) {
    self.upgraded_to_ws.store(true, Ordering::Release);
    self.notify.notify_waiters();
  }

  pub fn mark_closed(&self) {
    self.closed.store(true, Ordering::Release);
    self.notify.notify_waiters();
  }

  pub fn claim_disconnect_once(&self) -> bool {
    !self.disconnected_notified.swap(true, Ordering::AcqRel)
  }
}

pub const MOBILE_CLIENT_ORIGINS: &[&str] = &["https://localhost", "capacitor://localhost", "ionic://localhost"];

pub const DESKTOP_CLIENT_ORIGINS: &[&str] = &["assets://.", "assets://another-host", "file://"];

fn normalize_origin_for_comparison(origin: &str) -> Option<String> {
  let trimmed = origin.trim();
  if trimmed.is_empty() {
    return None;
  }
  let mut parsed = url::Url::parse(trimmed).ok()?;
  match parsed.scheme() {
    "ws" => {
      let _ = parsed.set_scheme("http");
    }
    "wss" => {
      let _ = parsed.set_scheme("https");
    }
    "http" | "https" => {}
    _ => return None,
  }
  Some(parsed.origin().ascii_serialization().to_ascii_lowercase())
}

fn is_dev_loopback_origin(origin: &str) -> bool {
  let Ok(parsed) = url::Url::parse(origin.trim()) else {
    return false;
  };
  if !matches!(parsed.scheme(), "http" | "https" | "ws" | "wss") {
    return false;
  }
  let Some(host) = parsed.host_str() else {
    return false;
  };
  let host = host.trim_start_matches('[').trim_end_matches(']');
  host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1"
}

pub struct EngineIoState {
  pub authenticator: Arc<dyn SyncSessionAuthenticator>,
  pub gateway: Arc<SpaceSyncGateway>,
  /// Keyed by `engine_sid`.
  sessions_by_sid: RwLock<HashMap<String, Arc<SocketSession>>>,
  /// Keyed by Socket.IO `socket_id`.
  sessions_by_socket_id: RwLock<HashMap<String, Arc<SocketSession>>>,
  /// Configurable max payload & cumulative BINARY_EVENT attachment byte budget.
  max_payload_bytes: AtomicUsize,
  /// Normalized allowed browser `Origin` headers (lowercase scheme://host[:port]).
  allowed_origins: Vec<String>,
  /// Whether `http(s)://(localhost|127.0.0.1|[::1])[:port]` origins are allowed.
  allow_dev_loopback: bool,
}

impl EngineIoState {
  pub fn new(authenticator: Arc<dyn SyncSessionAuthenticator>, gateway: Arc<SpaceSyncGateway>) -> Arc<Self> {
    Self::with_origin_policy(authenticator, gateway, Vec::new(), true)
  }

  pub fn with_allowed_origins(
    authenticator: Arc<dyn SyncSessionAuthenticator>,
    gateway: Arc<SpaceSyncGateway>,
    allowed_origins: Vec<String>,
  ) -> Arc<Self> {
    Self::with_origin_policy(authenticator, gateway, allowed_origins, false)
  }

  pub fn with_origin_policy(
    authenticator: Arc<dyn SyncSessionAuthenticator>,
    gateway: Arc<SpaceSyncGateway>,
    allowed_origins: Vec<String>,
    allow_dev_loopback: bool,
  ) -> Arc<Self> {
    let normalized = allowed_origins
      .into_iter()
      .filter_map(|origin| {
        normalize_origin_for_comparison(&origin).or_else(|| {
          let s = origin.trim().trim_end_matches('/').to_ascii_lowercase();
          (!s.is_empty()).then_some(s)
        })
      })
      .collect();
    Arc::new(Self {
      authenticator,
      gateway,
      sessions_by_sid: RwLock::new(HashMap::new()),
      sessions_by_socket_id: RwLock::new(HashMap::new()),
      max_payload_bytes: AtomicUsize::new(MAX_PAYLOAD_BYTES),
      allowed_origins: normalized,
      allow_dev_loopback,
    })
  }

  /// Marks all active sessions closed and wakes every in-flight long-polling
  /// GET and WebSocket writer task immediately so graceful shutdown does not
  /// stall on `POLL_WAIT_TIMEOUT`.
  pub async fn close_all_sessions(&self) {
    let sessions: Vec<Arc<SocketSession>> = self.sessions_by_sid.read().await.values().cloned().collect();
    for session in sessions {
      self.cleanup_session(&session).await;
    }
  }

  /// Validates the request `Origin` header matching `v0.27.5`
  /// `packages/backend/server/src/base/cors.ts`:
  /// - No `Origin` header -> `Ok(None)`.
  /// - Native mobile & desktop client origins (`MOBILE_CLIENT_ORIGINS` +
  ///   `DESKTOP_CLIENT_ORIGINS`) -> allowed.
  /// - `ws://` / `wss://` normalized to `http://` / `https://` and compared
  ///   against `allowed_origins`.
  /// - Loopback origins (`localhost` / `127.0.0.1` / `[::1]`) allowed only
  ///   when `allow_dev_loopback` is true or `allowed_origins` is empty.
  /// - Never reflects arbitrary external `Origin` headers or trusts `Host`.
  pub(crate) fn check_origin(&self, headers: &HeaderMap) -> Result<Option<String>, ()> {
    check_origin_with_policy(headers, &self.allowed_origins, self.allow_dev_loopback)
  }
}

fn check_origin_with_policy(
  headers: &HeaderMap,
  allowed_origins: &[String],
  allow_dev_loopback: bool,
) -> Result<Option<String>, ()> {
  let Some(raw) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) else {
    return Ok(None);
  };
  let origin = raw.trim();
  if origin.is_empty() {
    return Err(());
  }
  let lower_exact = origin.to_ascii_lowercase();
  if MOBILE_CLIENT_ORIGINS.contains(&lower_exact.as_str()) || DESKTOP_CLIENT_ORIGINS.contains(&lower_exact.as_str()) {
    return Ok(Some(origin.to_owned()));
  }
  if let Some(normalized) = normalize_origin_for_comparison(origin)
    && allowed_origins.iter().any(|allowed| allowed == &normalized)
  {
    return Ok(Some(origin.to_owned()));
  }
  let trimmed_slash = lower_exact.trim_end_matches('/');
  if allowed_origins.iter().any(|allowed| allowed == trimmed_slash) {
    return Ok(Some(origin.to_owned()));
  }
  if allow_dev_loopback && is_dev_loopback_origin(origin) {
    return Ok(Some(origin.to_owned()));
  }
  Err(())
}

impl EngineIoState {
  pub fn set_max_payload_bytes(&self, bytes: usize) {
    self.max_payload_bytes.store(bytes, Ordering::Release);
  }

  pub async fn get_by_engine_sid(&self, engine_sid: &str) -> Option<Arc<SocketSession>> {
    self.sessions_by_sid.read().await.get(engine_sid).cloned()
  }

  pub async fn get_by_socket_id(&self, socket_id: &str) -> Option<Arc<SocketSession>> {
    self.sessions_by_socket_id.read().await.get(socket_id).cloned()
  }

  pub async fn emit_to_socket(&self, socket_id: &str, event: &str, payload: &Value) {
    if let Some(session) = self.get_by_socket_id(socket_id).await {
      session.emit_event(event, payload).await;
    }
  }

  pub async fn disconnect_socket(&self, socket_id: &str) {
    if let Some(session) = self.get_by_socket_id(socket_id).await {
      let _ = session.enqueue_raw("41".to_owned()).await;
      self.cleanup_session(&session).await;
    }
  }

  /// Reaps all idle sessions (both un-upgraded polling sessions AND upgraded WS
  /// sessions that stopped answering pings/pongs) older than `timeout_ms`.
  pub async fn reap_stale_sessions(&self, timeout_ms: i64) -> usize {
    let now = now_millis();
    let stale: Vec<Arc<SocketSession>> = self
      .sessions_by_sid
      .read()
      .await
      .values()
      .filter(|session| now.saturating_sub(session.last_activity_ms()) >= timeout_ms)
      .cloned()
      .collect();
    let count = stale.len();
    for session in stale {
      self.cleanup_session(&session).await;
    }
    count
  }

  /// Reaps only un-upgraded polling sessions older than `timeout_ms`.
  pub async fn reap_stale_polling_sessions(&self, timeout_ms: i64) -> usize {
    let now = now_millis();
    let stale: Vec<Arc<SocketSession>> = self
      .sessions_by_sid
      .read()
      .await
      .values()
      .filter(|session| {
        !session.upgraded_to_ws.load(Ordering::Acquire) && now.saturating_sub(session.last_activity_ms()) >= timeout_ms
      })
      .cloned()
      .collect();
    let count = stale.len();
    for session in stale {
      self.cleanup_session(&session).await;
    }
    count
  }

  pub fn spawn_session_reaper(self: &Arc<Self>) -> tokio::task::JoinHandle<()> {
    let state = Arc::clone(self);
    tokio::spawn(async move {
      let mut interval = tokio::time::interval(SESSION_REAP_INTERVAL);
      interval.tick().await;
      loop {
        interval.tick().await;
        state.reap_stale_sessions(SESSION_IDLE_TIMEOUT_MS).await;
      }
    })
  }

  async fn create_session(&self, headers: HeaderMap) -> Arc<SocketSession> {
    let engine_sid = generate_sid();
    let socket_id = generate_sid();
    let session = Arc::new(SocketSession::new(engine_sid.clone(), socket_id.clone(), headers));
    self
      .sessions_by_sid
      .write()
      .await
      .insert(engine_sid, Arc::clone(&session));
    self
      .sessions_by_socket_id
      .write()
      .await
      .insert(socket_id, Arc::clone(&session));
    session
  }

  async fn cleanup_session(&self, session: &Arc<SocketSession>) {
    session.mark_closed();
    self.sessions_by_sid.write().await.remove(&session.engine_sid);
    self.sessions_by_socket_id.write().await.remove(&session.socket_id);
    if session.claim_disconnect_once() {
      let user = session.user.read().await.clone();
      if user.is_some() {
        self.gateway.handle_disconnect(&session.socket_id).await;
      }
    }
  }

  async fn handle_engine_packet(self: &Arc<Self>, session: &Arc<SocketSession>, packet: &str) -> bool {
    if session.closed.load(Ordering::Acquire) {
      return false;
    }
    session.touch();
    let Some(first) = packet.chars().next() else {
      return true;
    };
    match first {
      '1' => {
        // Engine.IO close
        self.cleanup_session(session).await;
        false
      }
      '2' => {
        // Engine.IO ping (client -> server)
        if packet == "2probe" {
          let _ = session.enqueue_raw("3probe".to_owned()).await;
        } else {
          let _ = session.enqueue_raw("3".to_owned()).await;
        }
        true
      }
      '3' => {
        // Engine.IO pong (client -> server) — `touch()` already updated `last_activity_ms`.
        true
      }
      '4' => {
        // Engine.IO message -> Socket.IO packet
        self.handle_socketio_packet(session, &packet[1..]).await
      }
      '5' => {
        // Engine.IO upgrade complete
        session.mark_upgraded();
        true
      }
      '6' => true,
      'b' => {
        // Engine.IO v4 HTTP long-polling binary attachment (`b<base64>`)
        if let Ok(bytes) = BASE64.decode(&packet[1..]) {
          return self.handle_binary_attachment(session, bytes).await;
        }
        true
      }
      _ => true,
    }
  }

  async fn dispatch_socketio_event(
    self: &Arc<Self>,
    session: &Arc<SocketSession>,
    ack_id: Option<u64>,
    event_name: &str,
    arg: Value,
  ) {
    let user = session.user.read().await.clone();
    let Some(user) = user else {
      if let Some(id) = ack_id {
        let env = crate::legacy_compat::errors::sync_error_to_ws_envelope(
          &crate::error::SyncError::AuthenticationRequired("not authenticated".into()),
          None,
        );
        session
          .send_ack(id, &serde_json::to_value(env).unwrap_or(Value::Null))
          .await;
      }
      return;
    };

    let response = self
      .gateway
      .handle_event(self, &session.socket_id, &user, event_name, arg)
      .await;

    if ack_id.is_some() || response.close_after_flush {
      session
        .send_ack_and_maybe_close(ack_id, &response.payload, response.close_after_flush)
        .await;
    }
  }

  async fn handle_binary_attachment(self: &Arc<Self>, session: &Arc<SocketSession>, bytes: Vec<u8>) -> bool {
    if session.closed.load(Ordering::Acquire) {
      return false;
    }
    if !session.sio_connected.load(Ordering::Acquire) {
      // Never buffer binary frames before Socket.IO `40` authentication completes.
      return true;
    }
    session.touch();
    let max_bytes = self.max_payload_bytes.load(Ordering::Acquire);
    let mut exceeded = false;
    let completed = {
      let mut guard = session.pending_binary.lock().await;
      if let Some(pending) = guard.as_mut() {
        // Account for expanded Base64 length so header + all substituted strings
        // stay strictly within `max_payload_bytes`.
        let encoded_len = bytes.len().div_ceil(3).saturating_mul(4);
        let new_total = pending.total_bytes.saturating_add(encoded_len);
        if new_total > max_bytes {
          *guard = None;
          exceeded = true;
          None
        } else {
          pending.total_bytes = new_total;
          pending.attachments.push(Some(bytes));
          if pending.attachments.len() >= pending.expected_attachments {
            guard.take()
          } else {
            None
          }
        }
      } else {
        None
      }
    };
    if exceeded {
      warn!(
        "closing Socket.IO session {} (BINARY_EVENT expanded bytes exceeded {max_bytes})",
        session.socket_id
      );
      self.cleanup_session(session).await;
      return false;
    }
    if let Some(mut pending) = completed {
      let substitution = replace_binary_placeholders(&mut pending.arg, &mut pending.attachments);
      if let Err(reason) = substitution {
        warn!(
          "closing Socket.IO session {} (invalid BINARY_EVENT placeholders: {reason})",
          session.socket_id
        );
        self.cleanup_session(session).await;
        return false;
      }
      if !pending.attachments.iter().all(Option::is_none) {
        warn!(
          "closing Socket.IO session {} (BINARY_EVENT had unreferenced attachment slots)",
          session.socket_id
        );
        self.cleanup_session(session).await;
        return false;
      }
      self
        .dispatch_socketio_event(session, pending.ack_id, &pending.event_name, pending.arg)
        .await;
    }
    true
  }

  async fn handle_socketio_packet(self: &Arc<Self>, session: &Arc<SocketSession>, payload: &str) -> bool {
    let Some(sio_type) = payload.chars().next() else {
      return true;
    };
    match sio_type {
      '0' => {
        // Socket.IO CONNECT to default namespace `/` — idempotent if already connected.
        if session.sio_connected.load(Ordering::Acquire) {
          return true;
        }
        let mut effective_headers = session.headers.clone();
        let auth_json = payload[1..].trim();
        if auth_json.starts_with('{')
          && let Ok(auth_obj) = serde_json::from_str::<Value>(auth_json)
          && auth_obj
            .get("tokenType")
            .and_then(Value::as_str)
            .is_some_and(|t| t.eq_ignore_ascii_case("jwt"))
          && let Some(tok) = auth_obj
            .get("token")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
          && let Ok(hv) = header::HeaderValue::from_str(&format!("Bearer {tok}"))
        {
          effective_headers.insert(header::AUTHORIZATION, hv);
        }
        match self.authenticator.authenticate(&effective_headers).await {
          Ok(user) => {
            if session.sio_connected.swap(true, Ordering::AcqRel) {
              return true;
            }
            *session.user.write().await = Some(user.clone());
            self.gateway.handle_connect(&session.socket_id, &user).await;
            let ack = json!({ "sid": session.socket_id });
            let _ = session.enqueue_raw(format!("40{ack}")).await;
            true
          }
          Err(err) => {
            let err_payload = json!({ "message": err.to_string() });
            let _ = session.enqueue_raw(format!("44{err_payload}")).await;
            true
          }
        }
      }
      '1' => {
        // Socket.IO DISCONNECT
        self.cleanup_session(session).await;
        false
      }
      '2' => {
        // Socket.IO EVENT: `2[ack_id]["event", arg0, ...]`
        // Ignore unauthenticated EVENT frames before parsing potentially large JSON.
        if !session.sio_connected.load(Ordering::Acquire) {
          return true;
        }
        let rest = &payload[1..];
        let Some(bracket_idx) = rest.find('[') else {
          return true;
        };
        let ack_id: Option<u64> = if bracket_idx == 0 {
          None
        } else {
          rest[..bracket_idx].parse().ok()
        };
        let Ok(arr) = serde_json::from_str::<Vec<Value>>(&rest[bracket_idx..]) else {
          return true;
        };
        let Some(event_name) = arr.first().and_then(Value::as_str) else {
          return true;
        };
        let arg = arr.get(1).cloned().unwrap_or(Value::Null);
        self.dispatch_socketio_event(session, ack_id, event_name, arg).await;
        true
      }
      '5' => {
        // Socket.IO BINARY_EVENT: `5<attachments>-[ack_id]["event", arg0, ...]`
        // Reject/drop before Socket.IO `40` authentication so anonymous sockets
        // can never allocate `pending_binary` memory.
        if !session.sio_connected.load(Ordering::Acquire) {
          return true;
        }
        let max_bytes = self.max_payload_bytes.load(Ordering::Acquire);
        if payload.len() > max_bytes {
          self.cleanup_session(session).await;
          return false;
        }
        let rest = &payload[1..];
        let Some((count_str, after_dash)) = rest.split_once('-') else {
          return true;
        };
        let Ok(expected_attachments) = count_str.parse::<usize>() else {
          return true;
        };
        if expected_attachments > MAX_BINARY_ATTACHMENTS {
          return true;
        }
        let Some(bracket_idx) = after_dash.find('[') else {
          return true;
        };
        let ack_id: Option<u64> = if bracket_idx == 0 {
          None
        } else {
          after_dash[..bracket_idx].parse().ok()
        };
        let Ok(arr) = serde_json::from_str::<Vec<Value>>(&after_dash[bracket_idx..]) else {
          return true;
        };
        let Some(event_name) = arr.first().and_then(Value::as_str) else {
          return true;
        };
        let mut arg = arr.get(1).cloned().unwrap_or(Value::Null);
        if expected_attachments == 0 {
          if replace_binary_placeholders(&mut arg, &mut []).is_err() {
            self.cleanup_session(session).await;
            return false;
          }
          self.dispatch_socketio_event(session, ack_id, event_name, arg).await;
        } else {
          *session.pending_binary.lock().await = Some(PendingBinaryEvent {
            expected_attachments,
            ack_id,
            event_name: event_name.to_owned(),
            arg,
            attachments: Vec::with_capacity(expected_attachments),
            total_bytes: payload.len(),
          });
        }
        true
      }
      _ => true,
    }
  }
}

pub fn build_socketio_router(state: Arc<EngineIoState>) -> Router {
  Router::new()
    .route("/socket.io/", get(handle_get).post(handle_post).options(handle_options))
    .route("/socket.io", get(handle_get).post(handle_post).options(handle_options))
    .layer(DefaultBodyLimit::max(MAX_PAYLOAD_BYTES))
    .with_state(state)
}

fn attach_cors_headers(mut resp: Response, origin: Option<&str>) -> Response {
  let headers = resp.headers_mut();
  headers.insert(
    header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
    header::HeaderValue::from_static("true"),
  );
  if let Some(origin) = origin
    && let Ok(val) = header::HeaderValue::from_str(origin)
  {
    headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, val);
    headers.insert(header::VARY, header::HeaderValue::from_static("Origin"));
  }
  resp
}

async fn handle_options(State(state): State<Arc<EngineIoState>>, headers: HeaderMap) -> Response {
  let Ok(origin) = state.check_origin(&headers) else {
    return StatusCode::FORBIDDEN.into_response();
  };
  let mut resp = StatusCode::NO_CONTENT.into_response();
  let h = resp.headers_mut();
  h.insert(
    header::ACCESS_CONTROL_ALLOW_METHODS,
    header::HeaderValue::from_static("GET, POST, OPTIONS"),
  );
  h.insert(
    header::ACCESS_CONTROL_ALLOW_HEADERS,
    header::HeaderValue::from_static(
      "accept, authorization, content-type, cookie, x-affine-version, x-affine-client-kind, x-operation-name, x-request-id, x-captcha-token, x-captcha-challenge, x-captcha-provider, x-affine-csrf-token, x-requested-with, range",
    ),
  );
  attach_cors_headers(resp, origin.as_deref())
}

async fn handle_get(
  State(state): State<Arc<EngineIoState>>,
  Query(query): Query<EngineIoQuery>,
  headers: HeaderMap,
  ws: Result<WebSocketUpgrade, axum::extract::ws::rejection::WebSocketUpgradeRejection>,
) -> Response {
  let Ok(origin) = state.check_origin(&headers) else {
    return StatusCode::FORBIDDEN.into_response();
  };
  let transport = query.transport.as_deref().unwrap_or("polling");

  if transport == "websocket" {
    let Ok(ws) = ws else {
      return attach_cors_headers(
        (StatusCode::BAD_REQUEST, "expected websocket upgrade").into_response(),
        origin.as_deref(),
      );
    };
    if let Some(sid) = query.sid {
      let session = state.sessions_by_sid.read().await.get(&sid).cloned();
      let Some(session) = session else {
        return attach_cors_headers(
          (StatusCode::BAD_REQUEST, r#"{"code":1,"message":"Session ID unknown"}"#).into_response(),
          origin.as_deref(),
        );
      };
      // Reject concurrent second WebSocket upgrade on the same session ID.
      if session.upgraded_to_ws.load(Ordering::Acquire) || session.ws_probe_claimed.swap(true, Ordering::AcqRel) {
        return attach_cors_headers(
          (
            StatusCode::BAD_REQUEST,
            r#"{"code":3,"message":"Upgrade already in progress or completed"}"#,
          )
            .into_response(),
          origin.as_deref(),
        );
      }
      let max_payload = state.max_payload_bytes.load(Ordering::Acquire);
      return ws
        .max_message_size(max_payload)
        .max_frame_size(max_payload)
        .on_upgrade(move |socket| handle_ws_upgraded(state, session, socket))
        .into_response();
    } else {
      let session = state.create_session(headers).await;
      session.ws_probe_claimed.store(true, Ordering::Release);
      session.mark_upgraded();
      let max_payload = state.max_payload_bytes.load(Ordering::Acquire);
      return ws
        .max_message_size(max_payload)
        .max_frame_size(max_payload)
        .on_upgrade(move |socket| handle_ws_direct(state, session, socket))
        .into_response();
    }
  }

  // HTTP long-polling
  if let Some(sid) = query.sid {
    let session = state.sessions_by_sid.read().await.get(&sid).cloned();
    let Some(session) = session else {
      return attach_cors_headers(
        (StatusCode::BAD_REQUEST, r#"{"code":1,"message":"Session ID unknown"}"#).into_response(),
        origin.as_deref(),
      );
    };
    return attach_cors_headers(handle_polling_get(state, session).await, origin.as_deref());
  }

  // Initial Engine.IO polling handshake
  let session = state.create_session(headers).await;
  let open = json!({
    "sid": session.engine_sid,
    "upgrades": ["websocket"],
    "pingInterval": PING_INTERVAL_MS,
    "pingTimeout": PING_TIMEOUT_MS,
    "maxPayload": MAX_PAYLOAD_BYTES,
  });
  attach_cors_headers(text_response(format!("0{open}")), origin.as_deref())
}

async fn handle_polling_get(state: Arc<EngineIoState>, session: Arc<SocketSession>) -> Response {
  session.touch();
  let notified = session.notify.notified();
  tokio::pin!(notified);
  notified.as_mut().enable();

  let (mut packets, mut should_close) = session.drain_outbound().await;
  if packets.is_empty() && !should_close {
    if session.upgraded_to_ws.load(Ordering::Acquire) || session.pending_poll_noop.swap(false, Ordering::AcqRel) {
      return text_response("6".to_owned());
    }
    if session.closed.load(Ordering::Acquire) {
      return text_response("1".to_owned());
    }
    let _ = tokio::time::timeout(POLL_WAIT_TIMEOUT, &mut notified).await;
    if session.upgraded_to_ws.load(Ordering::Acquire) || session.pending_poll_noop.swap(false, Ordering::AcqRel) {
      return text_response("6".to_owned());
    }
    if session.closed.load(Ordering::Acquire) {
      return text_response("1".to_owned());
    }
    let drained = session.drain_outbound().await;
    packets = drained.0;
    should_close = drained.1;
    if packets.is_empty() && !should_close {
      return text_response("2".to_owned());
    }
  }
  if should_close {
    packets.push("41".to_owned());
    state.cleanup_session(&session).await;
  }
  let body = packets.join(&ENGINE_IO_RS.to_string());
  text_response(body)
}

async fn handle_post(
  State(state): State<Arc<EngineIoState>>,
  Query(query): Query<EngineIoQuery>,
  headers: HeaderMap,
  body: Bytes,
) -> Response {
  let Ok(origin) = state.check_origin(&headers) else {
    return StatusCode::FORBIDDEN.into_response();
  };
  let Some(sid) = query.sid else {
    return attach_cors_headers(
      (StatusCode::BAD_REQUEST, r#"{"code":1,"message":"Session ID unknown"}"#).into_response(),
      origin.as_deref(),
    );
  };
  let session = state.sessions_by_sid.read().await.get(&sid).cloned();
  let Some(session) = session else {
    return attach_cors_headers(
      (StatusCode::BAD_REQUEST, r#"{"code":1,"message":"Session ID unknown"}"#).into_response(),
      origin.as_deref(),
    );
  };
  if session.closed.load(Ordering::Acquire) {
    return attach_cors_headers(
      (StatusCode::BAD_REQUEST, r#"{"code":1,"message":"Session ID unknown"}"#).into_response(),
      origin.as_deref(),
    );
  }
  session.touch();

  let Ok(text) = std::str::from_utf8(&body) else {
    return attach_cors_headers(
      (StatusCode::BAD_REQUEST, "invalid utf-8").into_response(),
      origin.as_deref(),
    );
  };

  for packet in text.split(ENGINE_IO_RS) {
    if !packet.is_empty() && !state.handle_engine_packet(&session, packet).await {
      break;
    }
  }

  attach_cors_headers(text_response("ok".to_owned()), origin.as_deref())
}

async fn handle_ws_direct(state: Arc<EngineIoState>, session: Arc<SocketSession>, mut socket: WebSocket) {
  let open = json!({
    "sid": session.engine_sid,
    "upgrades": [],
    "pingInterval": PING_INTERVAL_MS,
    "pingTimeout": PING_TIMEOUT_MS,
    "maxPayload": MAX_PAYLOAD_BYTES,
  });
  if socket.send(Message::Text(format!("0{open}").into())).await.is_err() {
    state.cleanup_session(&session).await;
    return;
  }
  run_ws_loop(state, session, socket).await;
}

async fn handle_ws_upgraded(state: Arc<EngineIoState>, session: Arc<SocketSession>, mut socket: WebSocket) {
  // Engine.IO v4 upgrade handshake:
  // 1. Client sends `2probe` on WS -> server replies `3probe` AND wakes any
  //    in-flight polling GET with `6` (noop) WITHOUT setting `upgraded_to_ws`.
  // 2. Only when client sends `5` (UPGRADE) do we atomically switch to WS.
  // 3. If the probe disconnects BEFORE sending `5`, we ONLY release
  //    `ws_probe_claimed` and NEVER kill the live HTTP polling session!
  let mut upgraded = false;
  while let Some(Ok(msg)) = socket.next().await {
    let Message::Text(text) = msg else {
      if matches!(msg, Message::Close(_)) {
        break;
      }
      continue;
    };
    let s = text.as_str();
    if s == "2probe" {
      session.touch();
      if socket.send(Message::Text("3probe".into())).await.is_err() {
        break;
      }
      session.wake_polling_noop();
    } else if s == "5" {
      session.touch();
      session.mark_upgraded();
      upgraded = true;
      break;
    } else if !state.handle_engine_packet(&session, s).await {
      session.ws_probe_claimed.store(false, Ordering::Release);
      return;
    }
  }
  if !upgraded {
    // Probe abandoned before `5`: release probe lock only, keep polling alive.
    session.ws_probe_claimed.store(false, Ordering::Release);
    return;
  }
  run_ws_loop(state, session, socket).await;
}

async fn run_ws_loop(state: Arc<EngineIoState>, session: Arc<SocketSession>, socket: WebSocket) {
  let (mut ws_tx, mut ws_rx) = socket.split();

  // Writer task: flushes outbound packets and periodic Engine.IO pings.
  let writer_session = Arc::clone(&session);
  let writer_task = tokio::spawn(async move {
    let mut ping_interval = tokio::time::interval(Duration::from_millis(PING_INTERVAL_MS));
    ping_interval.tick().await;

    loop {
      let notified = writer_session.notify.notified();
      tokio::pin!(notified);
      notified.as_mut().enable();

      let (packets, should_close) = writer_session.drain_outbound().await;
      for pkt in packets {
        if ws_tx.send(Message::Text(pkt.into())).await.is_err() {
          return;
        }
      }
      if should_close {
        let _ = ws_tx.send(Message::Text("41".into())).await;
        let _ = ws_tx.send(Message::Close(None)).await;
        writer_session.mark_closed();
        return;
      }
      if writer_session.closed.load(Ordering::Acquire) {
        let _ = ws_tx.send(Message::Close(None)).await;
        return;
      }
      tokio::select! {
        _ = &mut notified => {}
        _ = ping_interval.tick() => {
          if ws_tx.send(Message::Text("2".into())).await.is_err() {
            return;
          }
        }
      }
    }
  });

  // Reader loop
  while let Some(msg) = ws_rx.next().await {
    if session.closed.load(Ordering::Acquire) {
      break;
    }
    match msg {
      Ok(Message::Text(text)) => {
        if !state.handle_engine_packet(&session, text.as_str()).await {
          break;
        }
      }
      Ok(Message::Binary(bin)) => {
        if !state.handle_binary_attachment(&session, bin.to_vec()).await {
          break;
        }
      }
      Ok(Message::Pong(_)) | Ok(Message::Ping(_)) => {
        session.touch();
      }
      Ok(Message::Close(_)) => break,
      Err(err) => {
        debug!("ws read error for {}: {err}", session.socket_id);
        break;
      }
    }
    if session.closed.load(Ordering::Acquire) {
      break;
    }
  }

  state.cleanup_session(&session).await;
  writer_task.abort();
  let _ = writer_task.await;
}

fn text_response(body: String) -> Response {
  (
    StatusCode::OK,
    [(header::CONTENT_TYPE, "text/plain; charset=UTF-8")],
    body,
  )
    .into_response()
}

fn generate_sid() -> String {
  const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let mut rng = rand::rng();
  (0..20)
    .map(|_| ALPHABET[rng.random_range(0..ALPHABET.len())] as char)
    .collect()
}

#[cfg(test)]
mod tests {
  use http::HeaderValue;

  use super::*;

  fn check(allowed: &[&str], allow_dev_loopback: bool, origin: Option<&str>) -> Result<Option<String>, ()> {
    let mut headers = HeaderMap::new();
    if let Some(o) = origin {
      headers.insert(header::ORIGIN, HeaderValue::from_str(o).unwrap());
    }
    let normalized: Vec<String> = allowed
      .iter()
      .filter_map(|o| {
        normalize_origin_for_comparison(o).or_else(|| {
          let s = o.trim().trim_end_matches('/').to_ascii_lowercase();
          (!s.is_empty()).then_some(s)
        })
      })
      .collect();
    check_origin_with_policy(&headers, &normalized, allow_dev_loopback)
  }

  #[test]
  fn origin_policy_allows_native_clients_ws_normalization_and_blocks_untrusted() {
    // 1. All 6 mobile + desktop native client origins are always allowed even in production.
    for native in [
      "https://localhost",
      "capacitor://localhost",
      "ionic://localhost",
      "assets://.",
      "assets://another-host",
      "file://",
    ] {
      assert!(
        check(&["https://app.affine.pro"], false, Some(native)).is_ok(),
        "expected native origin {native} to be allowed"
      );
    }

    // 2. ws:// and wss:// normalize to http:// and https:// against allowed_origins.
    assert!(check(&["https://app.affine.pro"], false, Some("wss://app.affine.pro")).is_ok());
    assert!(check(&["http://affine.parity.test"], false, Some("ws://affine.parity.test")).is_ok());
    assert!(check(&["https://app.affine.pro"], false, Some("ws://app.affine.pro")).is_err());

    // 3. Empty allowed_origins NEVER reflects arbitrary external origins or production loopback.
    assert!(check(&[], false, Some("https://evil.example")).is_err());
    assert!(check(&[], false, Some("http://127.0.0.1:3010")).is_err());
    assert!(check(&[], true, Some("http://127.0.0.1:3010")).is_ok());

    // 4. Production mode (allow_dev_loopback = false) with explicit allowed_origins rejects unconfigured loopback ports.
    assert!(check(&["https://app.affine.pro"], false, Some("http://localhost:8080")).is_err());
    assert!(check(&["https://app.affine.pro"], false, Some("http://127.0.0.1:8080")).is_err());
    assert!(check(&["https://app.affine.pro"], true, Some("http://localhost:8080")).is_ok());
  }
}
