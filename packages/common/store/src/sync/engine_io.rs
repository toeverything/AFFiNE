use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};

use crate::error::{StoreError, StoreResult};

/// Record separator used by Engine.IO v4 HTTP long-polling multi-packet payloads.
pub const ENGINE_IO_RS: char = '\x1e';

/// Default timeout for initial `ConnectingPolling` / `ConnectingWebsocket` handshake.
pub const DEFAULT_CONNECTING_TIMEOUT_MS: i64 = 15_000;

/// Transport selection mode matching `packages/common/nbstore/src/impls/cloud/socket.ts`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransportMode {
    /// Self-hosted servers: start with HTTP long-polling and upgrade to WebSocket if offered.
    PollingThenWebsocket,
    /// Hosted cloud servers: connect directly over WebSocket.
    WebsocketOnly,
}

/// Engine.IO v4 handshake JSON payload sent in the server's `0{...}` OPEN packet.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineIoHandshake {
    pub sid: String,
    #[serde(default)]
    pub upgrades: Vec<String>,
    pub ping_interval: u64,
    pub ping_timeout: u64,
    #[serde(default)]
    pub max_payload: Option<usize>,
}

/// Decoded Engine.IO v4 packet.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EngineIoPacket {
    Open(EngineIoHandshake),
    Close,
    Ping(String),
    Pong(String),
    Message(String),
    Upgrade,
    Noop,
    Binary(Vec<u8>),
}

impl EngineIoPacket {
    /// Encode a single Engine.IO v4 packet as a text frame (for polling or WebSocket text).
    pub fn encode_text(&self) -> StoreResult<String> {
        match self {
            Self::Open(handshake) => Ok(format!("0{}", serde_json::to_string(handshake)?)),
            Self::Close => Ok("1".to_string()),
            Self::Ping(payload) => Ok(format!("2{payload}")),
            Self::Pong(payload) => Ok(format!("3{payload}")),
            Self::Message(payload) => Ok(format!("4{payload}")),
            Self::Upgrade => Ok("5".to_string()),
            Self::Noop => Ok("6".to_string()),
            Self::Binary(bytes) => Ok(format!("b{}", BASE64.encode(bytes))),
        }
    }

    /// Decode a single Engine.IO v4 text packet.
    pub fn decode_text(raw: &str) -> StoreResult<Self> {
        let mut chars = raw.chars();
        let Some(tag) = chars.next() else {
            return Err(StoreError::InvalidProtocol("empty Engine.IO packet".into()));
        };
        let rest = chars.as_str();
        match tag {
            '0' => {
                let handshake: EngineIoHandshake = serde_json::from_str(rest)?;
                Ok(Self::Open(handshake))
            }
            '1' => Ok(Self::Close),
            '2' => Ok(Self::Ping(rest.to_string())),
            '3' => Ok(Self::Pong(rest.to_string())),
            '4' => Ok(Self::Message(rest.to_string())),
            '5' => Ok(Self::Upgrade),
            '6' => Ok(Self::Noop),
            'b' => {
                let bytes = BASE64
                    .decode(rest)
                    .map_err(|err| StoreError::InvalidProtocol(format!("invalid base64: {err}")))?;
                Ok(Self::Binary(bytes))
            }
            other => Err(StoreError::InvalidProtocol(format!(
                "unknown Engine.IO packet tag `{other}`"
            ))),
        }
    }
}

/// Encode multiple packets into an Engine.IO v4 HTTP long-polling payload separated by `\x1e`.
pub fn encode_polling_payload(packets: &[EngineIoPacket]) -> StoreResult<String> {
    let mut encoded = Vec::with_capacity(packets.len());
    for packet in packets {
        encoded.push(packet.encode_text()?);
    }
    Ok(encoded.join(&ENGINE_IO_RS.to_string()))
}

/// Decode an Engine.IO v4 HTTP long-polling payload separated by `\x1e`.
pub fn decode_polling_payload(body: &str) -> StoreResult<Vec<EngineIoPacket>> {
    if body.is_empty() {
        return Ok(Vec::new());
    }
    body.split(ENGINE_IO_RS)
        .map(EngineIoPacket::decode_text)
        .collect()
}

/// Configuration for the sans-I/O Engine.IO v4 client.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EngineIoConfig {
    pub transport_mode: TransportMode,
}

/// Current lifecycle phase of [`EngineIoClient`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EngineIoState {
    Disconnected,
    ConnectingPolling,
    PollingOpen,
    UpgradingToWebsocket,
    ConnectingWebsocket,
    WebsocketOpen,
    Closed,
}

/// Side-effect outputs emitted by [`EngineIoClient`] for the host transport layer to execute.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EngineIoOutput {
    SendPollingGet { sid: Option<String> },
    SendPollingPost { sid: String, body: String },
    OpenWebsocket { sid: Option<String> },
    SendWsText(String),
    SendWsBinary(Vec<u8>),
    CloseTransport,
    Connected { sid: String, upgraded_ws: bool },
    Message(String),
    BinaryMessage(Vec<u8>),
    Closed { reason: String },
    HeartbeatTimeout,
}

/// Deterministic sans-I/O Engine.IO v4 client supporting serialized HTTP long-polling `POST`s,
/// WebSocket probe/upgrade with full polling drain barrier, fallback to polling, and direct WS.
pub struct EngineIoClient {
    config: EngineIoConfig,
    state: EngineIoState,
    sid: Option<String>,
    ping_interval_ms: i64,
    ping_timeout_ms: i64,
    last_server_activity_ms: i64,
    polling_get_in_flight: bool,
    polling_post_in_flight: bool,
    probe_verified: bool,
    pending_post_packets: Vec<EngineIoPacket>,
    outbound: Vec<EngineIoOutput>,
}

impl EngineIoClient {
    pub fn new(config: EngineIoConfig) -> Self {
        Self {
            config,
            state: EngineIoState::Disconnected,
            sid: None,
            ping_interval_ms: 25_000,
            ping_timeout_ms: 20_000,
            last_server_activity_ms: 0,
            polling_get_in_flight: false,
            polling_post_in_flight: false,
            probe_verified: false,
            pending_post_packets: Vec::new(),
            outbound: Vec::new(),
        }
    }

    pub fn state(&self) -> EngineIoState {
        self.state
    }

    pub fn sid(&self) -> Option<&str> {
        self.sid.as_deref()
    }

    pub fn is_polling_get_in_flight(&self) -> bool {
        self.polling_get_in_flight
    }

    pub fn is_polling_post_in_flight(&self) -> bool {
        self.polling_post_in_flight
    }

    pub fn is_probe_verified(&self) -> bool {
        self.probe_verified
    }

    /// Initiate connection at deterministic timestamp `now_ms`.
    pub fn connect(&mut self, now_ms: i64) {
        self.sid = None;
        self.last_server_activity_ms = now_ms;
        self.polling_get_in_flight = false;
        self.polling_post_in_flight = false;
        self.probe_verified = false;
        self.pending_post_packets.clear();
        match self.config.transport_mode {
            TransportMode::PollingThenWebsocket => {
                self.state = EngineIoState::ConnectingPolling;
                self.polling_get_in_flight = true;
                self.outbound
                    .push(EngineIoOutput::SendPollingGet { sid: None });
            }
            TransportMode::WebsocketOnly => {
                self.state = EngineIoState::ConnectingWebsocket;
                self.outbound
                    .push(EngineIoOutput::OpenWebsocket { sid: None });
            }
        }
    }

    /// Reset internal transport state and instruct the host to close active connections.
    pub fn disconnect(&mut self) {
        let was_active = !matches!(
            self.state,
            EngineIoState::Disconnected | EngineIoState::Closed
        );
        self.state = EngineIoState::Disconnected;
        self.sid = None;
        self.polling_get_in_flight = false;
        self.polling_post_in_flight = false;
        self.probe_verified = false;
        self.pending_post_packets.clear();
        if was_active {
            self.outbound.push(EngineIoOutput::CloseTransport);
        }
    }

    /// Feed an HTTP polling GET response body received at `now_ms`.
    ///
    /// Tolerates single corrupted frames inside a `\x1e`-delimited batch so valid sibling frames
    /// are still delivered.
    pub fn on_polling_response(&mut self, body: &str, now_ms: i64) -> StoreResult<()> {
        self.polling_get_in_flight = false;
        let mut saw_noop = false;
        if !body.is_empty() {
            for raw_frame in body.split(ENGINE_IO_RS) {
                let Ok(packet) = EngineIoPacket::decode_text(raw_frame) else {
                    continue;
                };
                if matches!(packet, EngineIoPacket::Noop) {
                    saw_noop = true;
                }
                self.handle_packet(packet, false, now_ms)?;
            }
        }

        if self.state == EngineIoState::UpgradingToWebsocket && self.probe_verified {
            self.try_complete_ws_upgrade()?;
            return Ok(());
        }

        if self.state == EngineIoState::PollingOpen
            || (self.state == EngineIoState::UpgradingToWebsocket
                && !saw_noop
                && !self.probe_verified)
        {
            self.ensure_polling_get();
        }
        Ok(())
    }

    /// Notify the state machine that the in-flight HTTP polling `POST` completed.
    pub fn on_polling_post_complete(&mut self, _now_ms: i64) -> StoreResult<()> {
        self.polling_post_in_flight = false;
        if self.state == EngineIoState::UpgradingToWebsocket && self.probe_verified {
            self.try_complete_ws_upgrade()?;
            return Ok(());
        }
        if matches!(
            self.state,
            EngineIoState::PollingOpen | EngineIoState::UpgradingToWebsocket
        ) {
            self.flush_pending_polling_post()?;
        }
        Ok(())
    }

    /// Notify the state machine that the in-flight HTTP polling `POST` failed.
    pub fn on_polling_post_error(&mut self, reason: &str, _now_ms: i64) {
        self.polling_post_in_flight = false;
        if self.state == EngineIoState::WebsocketOpen {
            return;
        }
        if matches!(
            self.state,
            EngineIoState::ConnectingPolling
                | EngineIoState::PollingOpen
                | EngineIoState::UpgradingToWebsocket
        ) {
            self.state = EngineIoState::Closed;
            self.polling_get_in_flight = false;
            self.probe_verified = false;
            self.pending_post_packets.clear();
            self.outbound.push(EngineIoOutput::CloseTransport);
            self.outbound.push(EngineIoOutput::Closed {
                reason: reason.to_string(),
            });
        }
    }

    /// Notify the state machine that the WebSocket transport is open (direct or upgrade).
    pub fn on_ws_open(&mut self, now_ms: i64) {
        self.last_server_activity_ms = now_ms;
        if self.state == EngineIoState::UpgradingToWebsocket {
            self.outbound
                .push(EngineIoOutput::SendWsText("2probe".to_string()));
        }
    }

    /// Notify the state machine that the WebSocket transport failed or closed.
    ///
    /// During `UpgradingToWebsocket`, the underlying HTTP long-polling session remains live
    /// on the server, so the client degrades smoothly back to `PollingOpen` instead of closing.
    pub fn on_ws_error(&mut self, reason: &str, now_ms: i64) {
        match self.state {
            EngineIoState::UpgradingToWebsocket => {
                self.last_server_activity_ms = now_ms;
                self.probe_verified = false;
                self.state = EngineIoState::PollingOpen;
                self.ensure_polling_get();
                let _ = self.flush_pending_polling_post();
            }
            EngineIoState::ConnectingWebsocket | EngineIoState::WebsocketOpen => {
                self.state = EngineIoState::Closed;
                self.polling_get_in_flight = false;
                self.polling_post_in_flight = false;
                self.probe_verified = false;
                self.pending_post_packets.clear();
                self.outbound.push(EngineIoOutput::CloseTransport);
                self.outbound.push(EngineIoOutput::Closed {
                    reason: reason.to_string(),
                });
            }
            _ => {}
        }
    }

    /// Feed an inbound WebSocket text frame received at `now_ms`.
    pub fn on_ws_text(&mut self, frame: &str, now_ms: i64) -> StoreResult<()> {
        let packet = EngineIoPacket::decode_text(frame)?;
        self.handle_packet(packet, true, now_ms)
    }

    /// Feed an inbound WebSocket binary frame received at `now_ms`.
    pub fn on_ws_binary(&mut self, bytes: Vec<u8>, now_ms: i64) {
        self.last_server_activity_ms = now_ms;
        self.outbound.push(EngineIoOutput::BinaryMessage(bytes));
    }

    /// Queue a Socket.IO text payload (`4...` Engine.IO message) over the active transport.
    pub fn send_message(&mut self, sio_payload: &str) -> StoreResult<()> {
        let packet = EngineIoPacket::Message(sio_payload.to_string());
        match self.state {
            EngineIoState::WebsocketOpen => {
                self.outbound
                    .push(EngineIoOutput::SendWsText(packet.encode_text()?));
                Ok(())
            }
            EngineIoState::PollingOpen | EngineIoState::UpgradingToWebsocket => {
                self.enqueue_polling_packet(packet)
            }
            _ => Err(StoreError::InvalidProtocol(
                "cannot send message while Engine.IO is disconnected".into(),
            )),
        }
    }

    /// Check deterministic connecting timeout (15s) and heartbeat timeout at `now_ms`.
    pub fn poll_timeout(&mut self, now_ms: i64) -> bool {
        if matches!(
            self.state,
            EngineIoState::ConnectingPolling | EngineIoState::ConnectingWebsocket
        ) {
            if now_ms.saturating_sub(self.last_server_activity_ms) >= DEFAULT_CONNECTING_TIMEOUT_MS
            {
                self.state = EngineIoState::Closed;
                self.polling_get_in_flight = false;
                self.polling_post_in_flight = false;
                self.probe_verified = false;
                self.pending_post_packets.clear();
                self.outbound.push(EngineIoOutput::CloseTransport);
                self.outbound.push(EngineIoOutput::Closed {
                    reason: "connecting timeout".to_string(),
                });
                return true;
            }
            return false;
        }
        if !matches!(
            self.state,
            EngineIoState::PollingOpen
                | EngineIoState::UpgradingToWebsocket
                | EngineIoState::WebsocketOpen
        ) {
            return false;
        }
        let deadline = self.ping_interval_ms.saturating_add(self.ping_timeout_ms);
        if now_ms.saturating_sub(self.last_server_activity_ms) >= deadline {
            self.state = EngineIoState::Closed;
            self.polling_get_in_flight = false;
            self.polling_post_in_flight = false;
            self.probe_verified = false;
            self.pending_post_packets.clear();
            self.outbound.push(EngineIoOutput::CloseTransport);
            self.outbound.push(EngineIoOutput::HeartbeatTimeout);
            return true;
        }
        false
    }

    /// Drain all queued outputs in FIFO order.
    pub fn drain_outputs(&mut self) -> Vec<EngineIoOutput> {
        std::mem::take(&mut self.outbound)
    }

    fn ensure_polling_get(&mut self) {
        if self.polling_get_in_flight || self.probe_verified {
            return;
        }
        if let Some(sid) = self.sid.clone() {
            self.polling_get_in_flight = true;
            self.outbound
                .push(EngineIoOutput::SendPollingGet { sid: Some(sid) });
        }
    }

    fn enqueue_polling_packet(&mut self, packet: EngineIoPacket) -> StoreResult<()> {
        if self.sid.is_none() {
            return Err(StoreError::InvalidProtocol("missing Engine.IO sid".into()));
        }
        if self.probe_verified || self.polling_post_in_flight {
            self.pending_post_packets.push(packet);
            return Ok(());
        }
        self.pending_post_packets.push(packet);
        self.flush_pending_polling_post()
    }

    fn flush_pending_polling_post(&mut self) -> StoreResult<()> {
        if self.polling_post_in_flight
            || self.probe_verified
            || self.pending_post_packets.is_empty()
        {
            return Ok(());
        }
        let Some(sid) = self.sid.clone() else {
            return Err(StoreError::InvalidProtocol("missing Engine.IO sid".into()));
        };
        let batch = std::mem::take(&mut self.pending_post_packets);
        let body = encode_polling_payload(&batch)?;
        self.polling_post_in_flight = true;
        self.outbound
            .push(EngineIoOutput::SendPollingPost { sid, body });
        Ok(())
    }

    fn try_complete_ws_upgrade(&mut self) -> StoreResult<()> {
        if self.state != EngineIoState::UpgradingToWebsocket
            || !self.probe_verified
            || self.polling_get_in_flight
            || self.polling_post_in_flight
        {
            return Ok(());
        }
        self.state = EngineIoState::WebsocketOpen;
        self.probe_verified = false;
        self.outbound
            .push(EngineIoOutput::SendWsText("5".to_string()));
        for packet in std::mem::take(&mut self.pending_post_packets) {
            match packet {
                EngineIoPacket::Binary(bytes) => {
                    self.outbound.push(EngineIoOutput::SendWsBinary(bytes));
                }
                other => {
                    self.outbound
                        .push(EngineIoOutput::SendWsText(other.encode_text()?));
                }
            }
        }
        Ok(())
    }

    fn handle_packet(
        &mut self,
        packet: EngineIoPacket,
        from_ws: bool,
        now_ms: i64,
    ) -> StoreResult<()> {
        self.last_server_activity_ms = now_ms;
        match packet {
            EngineIoPacket::Open(handshake) => {
                self.sid = Some(handshake.sid.clone());
                self.ping_interval_ms = handshake.ping_interval as i64;
                self.ping_timeout_ms = handshake.ping_timeout as i64;
                let can_upgrade_ws = handshake
                    .upgrades
                    .iter()
                    .any(|u| u.eq_ignore_ascii_case("websocket"));

                if from_ws {
                    self.state = EngineIoState::WebsocketOpen;
                    self.outbound.push(EngineIoOutput::Connected {
                        sid: handshake.sid,
                        upgraded_ws: true,
                    });
                } else if can_upgrade_ws
                    && self.config.transport_mode == TransportMode::PollingThenWebsocket
                {
                    self.state = EngineIoState::UpgradingToWebsocket;
                    self.outbound.push(EngineIoOutput::Connected {
                        sid: handshake.sid.clone(),
                        upgraded_ws: false,
                    });
                    self.outbound.push(EngineIoOutput::OpenWebsocket {
                        sid: Some(handshake.sid),
                    });
                } else {
                    self.state = EngineIoState::PollingOpen;
                    self.outbound.push(EngineIoOutput::Connected {
                        sid: handshake.sid,
                        upgraded_ws: false,
                    });
                }
            }
            EngineIoPacket::Ping(payload) => {
                let pong = EngineIoPacket::Pong(payload);
                if from_ws || self.state == EngineIoState::WebsocketOpen {
                    self.outbound
                        .push(EngineIoOutput::SendWsText(pong.encode_text()?));
                } else if self.sid.is_some() {
                    self.enqueue_polling_packet(pong)?;
                }
            }
            EngineIoPacket::Pong(payload) => {
                if from_ws
                    && payload == "probe"
                    && self.state == EngineIoState::UpgradingToWebsocket
                {
                    self.probe_verified = true;
                    self.try_complete_ws_upgrade()?;
                }
            }
            EngineIoPacket::Message(msg) => {
                self.outbound.push(EngineIoOutput::Message(msg));
            }
            EngineIoPacket::Binary(bytes) => {
                self.outbound.push(EngineIoOutput::BinaryMessage(bytes));
            }
            EngineIoPacket::Close => {
                // Node Engine.IO v4 servers emit a Close ("1") on the stale long-polling GET
                // during or right after WebSocket upgrade; ignore it once WS probe succeeded.
                if !from_ws && (self.state == EngineIoState::WebsocketOpen || self.probe_verified) {
                    return Ok(());
                }
                self.state = EngineIoState::Closed;
                self.polling_get_in_flight = false;
                self.polling_post_in_flight = false;
                self.probe_verified = false;
                self.pending_post_packets.clear();
                self.outbound.push(EngineIoOutput::CloseTransport);
                self.outbound.push(EngineIoOutput::Closed {
                    reason: "server close".to_string(),
                });
            }
            EngineIoPacket::Upgrade | EngineIoPacket::Noop => {}
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn polling_to_websocket_upgrade_and_heartbeat_timeout() {
        let mut client = EngineIoClient::new(EngineIoConfig {
            transport_mode: TransportMode::PollingThenWebsocket,
        });
        client.connect(1_000);
        assert_eq!(
            client.drain_outputs(),
            vec![EngineIoOutput::SendPollingGet { sid: None }]
        );

        let open =
            r#"0{"sid":"s1","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;
        client.on_polling_response(open, 1_100).unwrap();
        assert_eq!(client.state(), EngineIoState::UpgradingToWebsocket);
        assert!(client.is_polling_get_in_flight());
        assert_eq!(
            client.drain_outputs(),
            vec![
                EngineIoOutput::Connected {
                    sid: "s1".into(),
                    upgraded_ws: false,
                },
                EngineIoOutput::OpenWebsocket {
                    sid: Some("s1".into()),
                },
                EngineIoOutput::SendPollingGet {
                    sid: Some("s1".into()),
                },
            ]
        );

        client.on_ws_open(1_200);
        assert_eq!(
            client.drain_outputs(),
            vec![EngineIoOutput::SendWsText("2probe".into())]
        );

        // Server wakes in-flight polling GET with noop ("6") during probe without re-polling.
        client.on_polling_response("6", 1_250).unwrap();
        assert!(!client.is_polling_get_in_flight());
        assert!(client.drain_outputs().is_empty());

        client.on_ws_text("3probe", 1_300).unwrap();
        assert_eq!(client.state(), EngineIoState::WebsocketOpen);
        assert_eq!(
            client.drain_outputs(),
            vec![EngineIoOutput::SendWsText("5".into())]
        );

        // Server ping answered with pong.
        client.on_ws_text("2", 26_300).unwrap();
        assert_eq!(
            client.drain_outputs(),
            vec![EngineIoOutput::SendWsText("3".into())]
        );

        // Not timed out yet at +44_999 ms, timed out at +45_000 ms.
        assert!(!client.poll_timeout(26_300 + 44_999));
        assert!(client.poll_timeout(26_300 + 45_000));
        assert_eq!(client.state(), EngineIoState::Closed);
        assert_eq!(
            client.drain_outputs(),
            vec![
                EngineIoOutput::CloseTransport,
                EngineIoOutput::HeartbeatTimeout,
            ]
        );
    }

    #[test]
    fn polling_post_serializes_batches_and_waits_for_ws_upgrade_drain_barrier() {
        let mut client = EngineIoClient::new(EngineIoConfig {
            transport_mode: TransportMode::PollingThenWebsocket,
        });
        client.connect(1_000);
        let _ = client.drain_outputs();
        let open =
            r#"0{"sid":"s-ser","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;
        client.on_polling_response(open, 1_050).unwrap();
        let _ = client.drain_outputs();
        client.on_ws_open(1_100);
        let _ = client.drain_outputs();

        // First message starts the single in-flight HTTP POST.
        client.send_message("0{}").unwrap();
        assert!(client.is_polling_post_in_flight());
        assert_eq!(
            client.drain_outputs(),
            vec![EngineIoOutput::SendPollingPost {
                sid: "s-ser".into(),
                body: "40{}".into(),
            }]
        );

        // Interleave a polling Ping + two business messages while the first POST is still in flight.
        // None may start a concurrent POST!
        client.on_polling_response("2\x1e?corrupt", 1_150).unwrap();
        client.send_message(r#"2["m1"]"#).unwrap();
        client.send_message(r#"2["m2"]"#).unwrap();
        let interleaved_out = client.drain_outputs();
        assert!(
            !interleaved_out
                .iter()
                .any(|o| matches!(o, EngineIoOutput::SendPollingPost { .. })),
            "at most 1 polling POST may be in flight at once"
        );

        // Completing the first POST flushes queued Pong + m1 + m2 in one \x1e-batched POST.
        client.on_polling_post_complete(1_200).unwrap();
        assert!(client.is_polling_post_in_flight());
        assert_eq!(
            client.drain_outputs(),
            vec![EngineIoOutput::SendPollingPost {
                sid: "s-ser".into(),
                body: "3\x1e42[\"m1\"]\x1e42[\"m2\"]".into(),
            }]
        );

        // 3probe arrives while both polling GET and POST are still in flight:
        // must hold "5" and hold new message m3 until both drain!
        client.on_ws_text("3probe", 1_250).unwrap();
        assert_eq!(client.state(), EngineIoState::UpgradingToWebsocket);
        assert!(client.is_probe_verified());
        client.send_message(r#"2["m3"]"#).unwrap();
        assert!(client.drain_outputs().is_empty());

        // Old polling GET returns "1" (Close) during drain -> must NOT close, still waiting on POST.
        client.on_polling_response("1", 1_300).unwrap();
        assert_eq!(client.state(), EngineIoState::UpgradingToWebsocket);
        assert!(!client.is_polling_get_in_flight());
        assert!(client.drain_outputs().is_empty());

        // Completing the in-flight POST releases the drain barrier: sends "5" then m3 in FIFO order!
        client.on_polling_post_complete(1_350).unwrap();
        assert_eq!(client.state(), EngineIoState::WebsocketOpen);
        assert_eq!(
            client.drain_outputs(),
            vec![
                EngineIoOutput::SendWsText("5".into()),
                EngineIoOutput::SendWsText(r#"42["m3"]"#.into()),
            ]
        );

        // Even a late stale polling Close ("1") after WebsocketOpen is ignored.
        client.on_polling_response("1", 1_400).unwrap();
        assert_eq!(client.state(), EngineIoState::WebsocketOpen);
        assert!(client.drain_outputs().is_empty());
    }

    #[test]
    fn probe_before_server_noop_and_late_polling_close_stays_websocket_open() {
        let mut client = EngineIoClient::new(EngineIoConfig {
            transport_mode: TransportMode::PollingThenWebsocket,
        });
        client.connect(1_000);
        let _ = client.drain_outputs();
        let open = r#"0{"sid":"s-race","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;
        client.on_polling_response(open, 1_050).unwrap();
        let _ = client.drain_outputs();
        client.on_ws_open(1_100);
        let _ = client.drain_outputs();

        // 3probe arrives before server's 100ms noop while polling GET is in flight.
        assert!(client.is_polling_get_in_flight());
        client.on_ws_text("3probe", 1_120).unwrap();
        assert_eq!(client.state(), EngineIoState::UpgradingToWebsocket);
        assert!(client.drain_outputs().is_empty());

        // Old polling GET returns "1" (Close) instead of noop -> transitions cleanly to WebsocketOpen.
        client.on_polling_response("1", 1_220).unwrap();
        assert_eq!(client.state(), EngineIoState::WebsocketOpen);
        assert_eq!(
            client.drain_outputs(),
            vec![EngineIoOutput::SendWsText("5".into())]
        );
    }

    #[test]
    fn connecting_timeout_closes_stalled_handshake_after_15s() {
        let mut client = EngineIoClient::new(EngineIoConfig {
            transport_mode: TransportMode::WebsocketOnly,
        });
        client.connect(5_000);
        let _ = client.drain_outputs();
        assert!(!client.poll_timeout(5_000 + 14_999));
        assert!(client.poll_timeout(5_000 + 15_000));
        assert_eq!(client.state(), EngineIoState::Closed);
        assert_eq!(
            client.drain_outputs(),
            vec![
                EngineIoOutput::CloseTransport,
                EngineIoOutput::Closed {
                    reason: "connecting timeout".into(),
                },
            ]
        );
    }

    #[test]
    fn polling_loop_continues_and_ws_upgrade_failure_degrades_to_polling() {
        let mut client = EngineIoClient::new(EngineIoConfig {
            transport_mode: TransportMode::PollingThenWebsocket,
        });
        client.connect(1_000);
        let _ = client.drain_outputs();

        let open =
            r#"0{"sid":"s2","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}"#;
        client.on_polling_response(open, 1_050).unwrap();
        let _ = client.drain_outputs();

        // Simulate reverse proxy blocking WS upgrade after noop cleared the in-flight GET.
        client.on_polling_response("6", 1_100).unwrap();
        assert!(!client.is_polling_get_in_flight());

        client.on_ws_error("403 upgrade blocked", 1_200);
        assert_eq!(client.state(), EngineIoState::PollingOpen);
        assert!(client.is_polling_get_in_flight());
        assert_eq!(
            client.drain_outputs(),
            vec![EngineIoOutput::SendPollingGet {
                sid: Some("s2".into()),
            }]
        );

        // Subsequent polling response delivers message and keeps the GET loop running.
        client
            .on_polling_response(r#"40{"sid":"sio-1"}"#, 1_300)
            .unwrap();
        assert_eq!(
            client.drain_outputs(),
            vec![
                EngineIoOutput::Message(r#"0{"sid":"sio-1"}"#.into()),
                EngineIoOutput::SendPollingGet {
                    sid: Some("s2".into()),
                },
            ]
        );
    }

    #[test]
    fn polling_multi_packet_roundtrip_and_binary() {
        let packets = vec![
            EngineIoPacket::Ping(String::new()),
            EngineIoPacket::Message("40{\"sid\":\"sock\"}".into()),
            EngineIoPacket::Binary(vec![1, 2, 3, 4]),
            EngineIoPacket::Noop,
        ];
        let encoded = encode_polling_payload(&packets).unwrap();
        let decoded = decode_polling_payload(&encoded).unwrap();
        assert_eq!(decoded, packets);
    }
}
