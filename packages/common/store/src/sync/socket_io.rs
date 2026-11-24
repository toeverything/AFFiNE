use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Value, json};

use crate::error::{StoreError, StoreResult};

const MAX_BINARY_ATTACHMENTS: usize = 16;

/// Decoded Socket.IO v4 packet on the default `/` namespace.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SocketIoPacket {
    Connect(Option<Value>),
    Disconnect,
    Event {
        ack_id: Option<u64>,
        event: String,
        payload: Value,
    },
    Ack {
        ack_id: u64,
        payload: Value,
    },
    ConnectError(Value),
    BinaryEventHeader {
        attachments: usize,
        ack_id: Option<u64>,
        event: String,
        payload: Value,
    },
}

impl SocketIoPacket {
    /// Encode a Socket.IO v4 packet as the payload inside an Engine.IO `4` message frame.
    pub fn encode(&self) -> StoreResult<String> {
        match self {
            Self::Connect(None) => Ok("0".to_string()),
            Self::Connect(Some(auth)) => Ok(format!("0{}", serde_json::to_string(auth)?)),
            Self::Disconnect => Ok("1".to_string()),
            Self::Event {
                ack_id,
                event,
                payload,
            } => {
                let body = serde_json::to_string(&json!([event, payload]))?;
                match ack_id {
                    Some(id) => Ok(format!("2{id}{body}")),
                    None => Ok(format!("2{body}")),
                }
            }
            Self::Ack { ack_id, payload } => {
                let body = serde_json::to_string(&json!([payload]))?;
                Ok(format!("3{ack_id}{body}"))
            }
            Self::ConnectError(err) => Ok(format!("4{}", serde_json::to_string(err)?)),
            Self::BinaryEventHeader {
                attachments,
                ack_id,
                event,
                payload,
            } => {
                let body = serde_json::to_string(&json!([event, payload]))?;
                match ack_id {
                    Some(id) => Ok(format!("5{attachments}-{id}{body}")),
                    None => Ok(format!("5{attachments}-{body}")),
                }
            }
        }
    }

    /// Decode a Socket.IO v4 packet (after stripping the outer Engine.IO `4` prefix).
    pub fn decode(raw: &str) -> StoreResult<Self> {
        let mut chars = raw.chars();
        let Some(tag) = chars.next() else {
            return Err(StoreError::InvalidProtocol("empty Socket.IO packet".into()));
        };
        let rest = chars.as_str();
        match tag {
            '0' => {
                if rest.is_empty() {
                    Ok(Self::Connect(None))
                } else {
                    Ok(Self::Connect(Some(serde_json::from_str(rest)?)))
                }
            }
            '1' => Ok(Self::Disconnect),
            '2' => {
                let (ack_id, arr) = parse_ack_and_json_array(rest)?;
                let event = arr
                    .first()
                    .and_then(Value::as_str)
                    .ok_or_else(|| StoreError::InvalidProtocol("missing event name".into()))?
                    .to_string();
                let payload = arr.get(1).cloned().unwrap_or(Value::Null);
                Ok(Self::Event {
                    ack_id,
                    event,
                    payload,
                })
            }
            '3' => {
                let (ack_id, arr) = parse_ack_and_json_array(rest)?;
                let ack_id = ack_id.ok_or_else(|| {
                    StoreError::InvalidProtocol("Socket.IO ACK missing ack_id".into())
                })?;
                let payload = arr.into_iter().next().unwrap_or(Value::Null);
                Ok(Self::Ack { ack_id, payload })
            }
            '4' => Ok(Self::ConnectError(serde_json::from_str(rest)?)),
            '5' => {
                let (count_str, after_dash) = rest.split_once('-').ok_or_else(|| {
                    StoreError::InvalidProtocol("BINARY_EVENT missing attachment separator".into())
                })?;
                let attachments: usize = count_str.parse().map_err(|_| {
                    StoreError::InvalidProtocol("invalid BINARY_EVENT attachment count".into())
                })?;
                if attachments > MAX_BINARY_ATTACHMENTS {
                    return Err(StoreError::InvalidProtocol(
                        "BINARY_EVENT attachment count exceeds limit".into(),
                    ));
                }
                let (ack_id, arr) = parse_ack_and_json_array(after_dash)?;
                let event = arr
                    .first()
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        StoreError::InvalidProtocol("BINARY_EVENT missing event name".into())
                    })?
                    .to_string();
                let payload = arr.get(1).cloned().unwrap_or(Value::Null);
                Ok(Self::BinaryEventHeader {
                    attachments,
                    ack_id,
                    event,
                    payload,
                })
            }
            other => Err(StoreError::InvalidProtocol(format!(
                "unsupported Socket.IO packet type `{other}`"
            ))),
        }
    }
}

fn parse_ack_and_json_array(rest: &str) -> StoreResult<(Option<u64>, Vec<Value>)> {
    let bracket_idx = rest
        .find('[')
        .ok_or_else(|| StoreError::InvalidProtocol("Socket.IO packet missing JSON array".into()))?;
    let ack_id = if bracket_idx == 0 {
        None
    } else {
        Some(
            rest[..bracket_idx]
                .parse::<u64>()
                .map_err(|_| StoreError::InvalidProtocol("invalid Socket.IO ack_id".into()))?,
        )
    };
    let arr: Vec<Value> = serde_json::from_str(&rest[bracket_idx..])?;
    Ok((ack_id, arr))
}

fn replace_binary_placeholders(
    value: &mut Value,
    attachments: &mut [Option<Vec<u8>>],
) -> StoreResult<()> {
    match value {
        Value::Object(map) => {
            if map.get("_placeholder") == Some(&Value::Bool(true)) {
                let idx = map
                    .get("num")
                    .and_then(Value::as_u64)
                    .and_then(|n| usize::try_from(n).ok())
                    .ok_or_else(|| {
                        StoreError::InvalidProtocol("invalid binary placeholder index".into())
                    })?;
                let slot = attachments.get_mut(idx).ok_or_else(|| {
                    StoreError::InvalidProtocol("binary placeholder index out of bounds".into())
                })?;
                let bytes = slot.take().ok_or_else(|| {
                    StoreError::InvalidProtocol("duplicate binary placeholder reference".into())
                })?;
                *value = Value::String(BASE64.encode(bytes));
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

struct PendingBinary {
    expected: usize,
    ack_id: Option<u64>,
    event: String,
    payload: Value,
    attachments: Vec<Option<Vec<u8>>>,
}

/// High-level events produced by [`SocketIoClient`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SocketIoEvent {
    Connected {
        sid: Option<String>,
    },
    ConnectError(Value),
    Disconnected,
    Event {
        ack_id: Option<u64>,
        event: String,
        payload: Value,
    },
    Ack {
        ack_id: u64,
        payload: Value,
    },
}

/// Sans-I/O Socket.IO v4 framer handling ACK ID allocation and `BINARY_EVENT` reassembly.
#[derive(Default)]
pub struct SocketIoClient {
    next_ack_id: u64,
    pending_binary: Option<PendingBinary>,
}

impl SocketIoClient {
    pub fn new() -> Self {
        Self::default()
    }

    /// Allocate the next monotonic ACK identifier.
    pub fn allocate_ack_id(&mut self) -> u64 {
        let id = self.next_ack_id;
        self.next_ack_id = self.next_ack_id.saturating_add(1);
        id
    }

    /// Build a Socket.IO `CONNECT` packet (`0` or `0{...}`).
    pub fn encode_connect(&self, auth: Option<Value>) -> StoreResult<String> {
        SocketIoPacket::Connect(auth).encode()
    }

    /// Build a Socket.IO `EVENT` packet with an automatically allocated ACK ID.
    pub fn encode_event_with_ack(
        &mut self,
        event: &str,
        payload: Value,
    ) -> StoreResult<(u64, String)> {
        let ack_id = self.allocate_ack_id();
        let encoded = SocketIoPacket::Event {
            ack_id: Some(ack_id),
            event: event.to_string(),
            payload,
        }
        .encode()?;
        Ok((ack_id, encoded))
    }

    /// Build a fire-and-forget Socket.IO `EVENT` packet without an ACK ID.
    pub fn encode_event(&self, event: &str, payload: Value) -> StoreResult<String> {
        SocketIoPacket::Event {
            ack_id: None,
            event: event.to_string(),
            payload,
        }
        .encode()
    }

    /// Feed an inbound Socket.IO text packet (from Engine.IO `Message`).
    pub fn on_text_packet(&mut self, raw: &str) -> StoreResult<Option<SocketIoEvent>> {
        match SocketIoPacket::decode(raw)? {
            SocketIoPacket::Connect(payload) => {
                let sid = payload
                    .as_ref()
                    .and_then(|v| v.get("sid"))
                    .and_then(Value::as_str)
                    .map(str::to_string);
                Ok(Some(SocketIoEvent::Connected { sid }))
            }
            SocketIoPacket::Disconnect => {
                self.pending_binary = None;
                Ok(Some(SocketIoEvent::Disconnected))
            }
            SocketIoPacket::ConnectError(err) => Ok(Some(SocketIoEvent::ConnectError(err))),
            SocketIoPacket::Event {
                ack_id,
                event,
                payload,
            } => Ok(Some(SocketIoEvent::Event {
                ack_id,
                event,
                payload,
            })),
            SocketIoPacket::Ack { ack_id, payload } => {
                Ok(Some(SocketIoEvent::Ack { ack_id, payload }))
            }
            SocketIoPacket::BinaryEventHeader {
                attachments,
                ack_id,
                event,
                mut payload,
            } => {
                if attachments == 0 {
                    replace_binary_placeholders(&mut payload, &mut [])?;
                    return Ok(Some(SocketIoEvent::Event {
                        ack_id,
                        event,
                        payload,
                    }));
                }
                self.pending_binary = Some(PendingBinary {
                    expected: attachments,
                    ack_id,
                    event,
                    payload,
                    attachments: Vec::with_capacity(attachments),
                });
                Ok(None)
            }
        }
    }

    /// Feed an inbound binary attachment for an in-progress `BINARY_EVENT`.
    pub fn on_binary_attachment(&mut self, bytes: Vec<u8>) -> StoreResult<Option<SocketIoEvent>> {
        let Some(pending) = self.pending_binary.as_mut() else {
            return Err(StoreError::InvalidProtocol(
                "unexpected binary attachment without pending BINARY_EVENT".into(),
            ));
        };
        pending.attachments.push(Some(bytes));
        if pending.attachments.len() < pending.expected {
            return Ok(None);
        }
        let mut completed = self.pending_binary.take().expect("pending exists");
        replace_binary_placeholders(&mut completed.payload, &mut completed.attachments)?;
        if !completed.attachments.iter().all(Option::is_none) {
            return Err(StoreError::InvalidProtocol(
                "BINARY_EVENT had unreferenced attachment slots".into(),
            ));
        }
        Ok(Some(SocketIoEvent::Event {
            ack_id: completed.ack_id,
            event: completed.event,
            payload: completed.payload,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binary_event_placeholder_reassembly_and_ack_pairing() {
        let mut client = SocketIoClient::new();
        let (ack0, encoded) = client
            .encode_event_with_ack("space:load-doc", json!({"docId": "d1"}))
            .unwrap();
        assert_eq!(ack0, 0);
        assert_eq!(encoded, r#"20["space:load-doc",{"docId":"d1"}]"#);

        let ack_ev = client
            .on_text_packet(r#"30[{"data":{"timestamp":42}}]"#)
            .unwrap()
            .unwrap();
        assert_eq!(
            ack_ev,
            SocketIoEvent::Ack {
                ack_id: 0,
                payload: json!({"data": {"timestamp": 42}}),
            }
        );

        let bin_header = r#"51-["space:broadcast-doc-updates",{"docId":"d1","updates":[{"_placeholder":true,"num":0}]}]"#;
        assert!(client.on_text_packet(bin_header).unwrap().is_none());

        let assembled = client
            .on_binary_attachment(vec![0xde, 0xad, 0xbe, 0xef])
            .unwrap()
            .unwrap();
        assert_eq!(
            assembled,
            SocketIoEvent::Event {
                ack_id: None,
                event: "space:broadcast-doc-updates".into(),
                payload: json!({
                    "docId": "d1",
                    "updates": [BASE64.encode([0xde, 0xad, 0xbe, 0xef])]
                }),
            }
        );
    }
}
