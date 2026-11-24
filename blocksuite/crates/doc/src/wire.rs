use serde::{Deserialize, Serialize};
pub use y_octo::DocMessage;
use y_octo::{
    SyncMessage, read_sync_message, read_var_string, write_sync_message, write_var_string,
};

use crate::{DocError, DocResult};

/// Binary frame tag for document sync frames (`varString(docId) + y-protocols SyncMessage::Doc`).
pub const FRAME_TAG_DOC: u8 = 0x00;

/// Binary frame tag for awareness frames (`y-protocols/awareness` binary update).
pub const FRAME_TAG_AWARENESS: u8 = 0x01;

/// Decoded binary room frame exchanged over `/native-sync/rooms/:room`.
#[derive(Debug, Clone, PartialEq)]
pub enum RoomBinaryFrame {
    Doc { doc_id: String, message: DocMessage },
    Awareness(Vec<u8>),
}

/// JSON text control frames exchanged over `/native-sync/rooms/:room`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum RoomControlFrame {
    /// Request single-winner CAS ownership for initial room seeding.
    SeedClaim { key: String },
    /// Hub response to `SeedClaim`.
    SeedClaimResult { key: String, winner: bool },
    /// Hub acknowledgement once reverse `Step2` for `doc_id` has been applied.
    Ready {
        #[serde(rename = "docId")]
        doc_id: String,
    },
}

/// Encode a binary room frame for WebSocket transmission.
pub fn encode_binary_frame(frame: &RoomBinaryFrame) -> DocResult<Vec<u8>> {
    let mut out = Vec::new();
    match frame {
        RoomBinaryFrame::Doc { doc_id, message } => {
            out.push(FRAME_TAG_DOC);
            write_var_string(&mut out, doc_id).map_err(|e| DocError::Wire(e.to_string()))?;
            write_sync_message(&mut out, &SyncMessage::Doc(message.clone()))
                .map_err(|e| DocError::Wire(e.to_string()))?;
        }
        RoomBinaryFrame::Awareness(payload) => {
            out.push(FRAME_TAG_AWARENESS);
            out.extend_from_slice(payload);
        }
    }
    Ok(out)
}

/// Decode a binary room frame received from WebSocket.
pub fn decode_binary_frame(bytes: &[u8]) -> DocResult<RoomBinaryFrame> {
    let (&tag, rest) = bytes
        .split_first()
        .ok_or_else(|| DocError::Wire("empty binary frame".to_string()))?;
    match tag {
        FRAME_TAG_DOC => {
            let (tail, doc_id) = read_var_string(rest)
                .map_err(|e| DocError::Wire(format!("invalid doc_id varString: {e}")))?;
            let (remaining, sync_msg) = read_sync_message(tail)
                .map_err(|e| DocError::Wire(format!("invalid y-protocols sync message: {e}")))?;
            if !remaining.is_empty() {
                return Err(DocError::Wire(format!(
                    "trailing bytes in doc frame: {}",
                    remaining.len()
                )));
            }
            match sync_msg {
                SyncMessage::Doc(message) => Ok(RoomBinaryFrame::Doc { doc_id, message }),
                other => Err(DocError::Wire(format!(
                    "expected SyncMessage::Doc inside doc frame, got {other:?}"
                ))),
            }
        }
        FRAME_TAG_AWARENESS => Ok(RoomBinaryFrame::Awareness(rest.to_vec())),
        other => Err(DocError::Wire(format!(
            "unknown binary frame tag: 0x{other:02x}"
        ))),
    }
}

/// Encode a text JSON control frame.
pub fn encode_control_frame(frame: &RoomControlFrame) -> DocResult<String> {
    Ok(serde_json::to_string(frame)?)
}

/// Decode a text JSON control frame.
pub fn decode_control_frame(text: &str) -> DocResult<RoomControlFrame> {
    Ok(serde_json::from_str(text)?)
}

/// Per-document client-side sync state machine (Sans-I/O, Wasm-compatible).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocSyncPhase {
    Idle,
    Pulling,
    Synced,
}

/// Pure client-side handshake tracker for a single document.
#[derive(Debug, Clone)]
pub struct DocSyncState {
    doc_id: String,
    phase: DocSyncPhase,
    pending_remote_sv: Option<Vec<u8>>,
    received_step2: bool,
}

impl DocSyncState {
    pub fn new(doc_id: impl Into<String>) -> Self {
        Self {
            doc_id: doc_id.into(),
            phase: DocSyncPhase::Idle,
            pending_remote_sv: None,
            received_step2: false,
        }
    }

    pub fn doc_id(&self) -> &str {
        &self.doc_id
    }

    pub fn phase(&self) -> DocSyncPhase {
        self.phase
    }

    /// Begin handshake by emitting `Step1(local_sv)`.
    pub fn begin_pull(&mut self, local_sv: Vec<u8>) -> RoomBinaryFrame {
        self.phase = DocSyncPhase::Pulling;
        self.received_step2 = false;
        self.pending_remote_sv = None;
        RoomBinaryFrame::Doc {
            doc_id: self.doc_id.clone(),
            message: DocMessage::Step1(local_sv),
        }
    }

    /// Reset handshake state on disconnect so reconnect starts cleanly.
    pub fn on_disconnect(&mut self) {
        self.phase = DocSyncPhase::Idle;
        self.received_step2 = false;
        self.pending_remote_sv = None;
    }

    /// Record receipt of hub's `Step2` diff. Returns `Some(remote_sv)` once both
    /// hub's `Step2` and reverse `Step1(remote_sv)` have arrived.
    pub fn on_hub_step2(&mut self) -> Option<Vec<u8>> {
        self.received_step2 = true;
        if let Some(sv) = self.pending_remote_sv.take() {
            self.phase = DocSyncPhase::Synced;
            Some(sv)
        } else {
            None
        }
    }

    /// Record receipt of hub's reverse `Step1(remote_sv)`. Returns `Some(remote_sv)`
    /// once both hub's `Step2` and reverse `Step1(remote_sv)` have arrived.
    pub fn on_hub_step1(&mut self, remote_sv: Vec<u8>) -> Option<Vec<u8>> {
        if self.received_step2 {
            self.phase = DocSyncPhase::Synced;
            Some(remote_sv)
        } else {
            self.pending_remote_sv = Some(remote_sv);
            None
        }
    }

    /// Build the unconditional reverse `Step2(diff_to_hub)` frame (even when empty `[0, 0]`).
    pub fn build_reverse_step2(&self, diff_to_hub: Vec<u8>) -> RoomBinaryFrame {
        RoomBinaryFrame::Doc {
            doc_id: self.doc_id.clone(),
            message: DocMessage::Step2(diff_to_hub),
        }
    }

    /// Build an incremental `Update(bytes)` frame.
    pub fn build_update(&self, update: Vec<u8>) -> RoomBinaryFrame {
        RoomBinaryFrame::Doc {
            doc_id: self.doc_id.clone(),
            message: DocMessage::Update(update),
        }
    }
}
