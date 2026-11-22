use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use y_octo::{Awareness, AwarenessEvent, AwarenessState, AwarenessStates};

use crate::{DocError, DocResult, validate_client_id};

/// Local awareness renewal interval matching `y-protocols/awareness.js` (15 seconds).
pub const AWARENESS_RENEW_INTERVAL_MS: u64 = 15_000;

/// Remote awareness expiry timeout matching `y-protocols/awareness.js` (30 seconds).
pub const AWARENESS_EXPIRE_TIMEOUT_MS: u64 = 30_000;

/// User descriptor inside BlockSuite's awareness JSON payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AwarenessUser {
    pub name: String,
}

/// Endpoint of a BlockSuite `TextSelection` range (`framework/std/src/selection/text.ts`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextRangePoint {
    pub block_id: String,
    pub index: u64,
    pub length: u64,
}

/// BlockSuite `TextSelection` JSON representation matching `TextSelectionSchema`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSelectionState {
    #[serde(rename = "type")]
    pub kind: String,
    pub from: TextRangePoint,
    pub to: Option<TextRangePoint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reverse: Option<bool>,
}

impl TextSelectionState {
    pub fn caret(block_id: impl Into<String>, index: u64) -> Self {
        Self {
            kind: "text".to_string(),
            from: TextRangePoint {
                block_id: block_id.into(),
                index,
                length: 0,
            },
            to: None,
            reverse: None,
        }
    }

    pub fn range(from: TextRangePoint, to: Option<TextRangePoint>, reverse: bool) -> Self {
        Self {
            kind: "text".to_string(),
            from,
            to,
            reverse: Some(reverse),
        }
    }
}

/// BlockSuite awareness payload matching `RawAwarenessState` in `@blocksuite/store`.
///
/// Top-level `color` is mandatory so `doc-remote-selection.ts` renders remote selections.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AwarenessPayload {
    pub user: AwarenessUser,
    pub color: String,
    #[serde(rename = "selectionV2", default)]
    pub selection_v2: BTreeMap<String, Vec<serde_json::Value>>,
}

impl AwarenessPayload {
    pub fn new(name: impl Into<String>, color: impl Into<String>) -> Self {
        Self {
            user: AwarenessUser { name: name.into() },
            color: color.into(),
            selection_v2: BTreeMap::new(),
        }
    }

    pub fn set_selection(
        &mut self,
        store_key: impl Into<String>,
        selections: Vec<serde_json::Value>,
    ) {
        self.selection_v2.insert(store_key.into(), selections);
    }

    pub fn set_text_selection(
        &mut self,
        store_key: impl Into<String>,
        selection: TextSelectionState,
    ) -> DocResult {
        self.selection_v2
            .insert(store_key.into(), vec![serde_json::to_value(selection)?]);
        Ok(())
    }

    pub fn validate(&self) -> DocResult {
        if self.color.trim().is_empty() {
            return Err(DocError::Awareness(
                "top-level awareness color must be non-empty".to_string(),
            ));
        }
        Ok(())
    }
}

/// Output of a deterministic [`RoomAwareness::tick`] call.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AwarenessTick {
    /// Binary `y-protocols/awareness` update to broadcast if local state renewed or remotes expired.
    pub outbound_update: Option<Vec<u8>>,
    /// Remote client IDs expired during this tick.
    pub expired_clients: Vec<u64>,
    /// Whether the local client's state was renewed during this tick.
    pub renewed_local: bool,
}

/// Deterministic-clock wrapper around `y_octo::Awareness` for BlockSuite room presence.
pub struct RoomAwareness {
    inner: Awareness,
    last_local_broadcast_ms: Option<u64>,
    remote_last_seen_ms: BTreeMap<u64, u64>,
}

impl RoomAwareness {
    pub fn new(local_client_id: u64) -> DocResult<Self> {
        let local_client_id = validate_client_id(local_client_id)?;
        Ok(Self {
            inner: Awareness::new(local_client_id),
            last_local_broadcast_ms: None,
            remote_last_seen_ms: BTreeMap::new(),
        })
    }

    pub fn local_client_id(&self) -> u64 {
        self.inner.local_id()
    }

    pub fn states(&self) -> &AwarenessStates {
        self.inner.get_states()
    }

    /// Set the local BlockSuite awareness payload at `now_ms`, returning encoded binary bytes.
    pub fn set_local_payload(
        &mut self,
        payload: &AwarenessPayload,
        now_ms: u64,
    ) -> DocResult<Vec<u8>> {
        payload.validate()?;
        let json = serde_json::to_string(payload)?;
        self.inner.set_local_state(json);
        self.last_local_broadcast_ms = Some(now_ms);
        Ok(self.inner.encode_update(Some(&[self.inner.local_id()]))?)
    }

    /// Set the local payload again after the connection that carried it was lost. The relay
    /// tombstoned this client one clock above its last state when that connection dropped,
    /// so the local clock advances twice to land above the tombstone.
    pub fn reannounce_local_payload(
        &mut self,
        payload: &AwarenessPayload,
        now_ms: u64,
    ) -> DocResult<Vec<u8>> {
        payload.validate()?;
        self.inner.set_local_state(serde_json::to_string(payload)?);
        self.set_local_payload(payload, now_ms)
    }

    /// Mark the local client offline (`null`) and return the encoded removal update.
    pub fn clear_local_state(&mut self) -> DocResult<Vec<u8>> {
        self.inner.clear_local_state();
        self.last_local_broadcast_ms = None;
        Ok(self.inner.encode_update(Some(&[self.inner.local_id()]))?)
    }

    /// Decode and apply a `y-protocols/awareness` binary update at `now_ms`.
    pub fn apply_update(&mut self, bytes: &[u8], now_ms: u64) -> DocResult<AwarenessEvent> {
        let event = self.inner.apply_update_v1(bytes)?;
        let local_id = self.inner.local_id();
        for &cid in event.added().iter().chain(event.updated().iter()) {
            if cid != local_id {
                self.remote_last_seen_ms.insert(cid, now_ms);
            }
        }
        for &cid in event.removed() {
            self.remote_last_seen_ms.remove(&cid);
        }
        Ok(event)
    }

    /// Encode all known states (or a specific subset) as `y-protocols/awareness` binary bytes.
    pub fn encode_update(&self, clients: Option<&[u64]>) -> DocResult<Vec<u8>> {
        Ok(self.inner.encode_update(clients)?)
    }

    /// Parse a client's active BlockSuite payload if present and not deleted (`"null"`).
    pub fn get_payload(&self, client_id: u64) -> Option<AwarenessPayload> {
        let state = self.inner.get_states().get(&client_id)?;
        if state.is_deleted() {
            return None;
        }
        serde_json::from_str::<AwarenessPayload>(state.content()).ok()
    }

    /// List all currently active (non-deleted) remote client IDs.
    pub fn active_remote_clients(&self) -> Vec<u64> {
        let local_id = self.inner.local_id();
        let mut ids: Vec<u64> = self
            .inner
            .get_states()
            .iter()
            .filter(|&(&cid, st)| cid != local_id && !st.is_deleted())
            .map(|(&cid, _)| cid)
            .collect();
        ids.sort_unstable();
        ids
    }

    /// Advance the deterministic awareness clock to `now_ms`:
    /// - Renews local presence if active and >= 15s since last broadcast.
    /// - Expires remote peers unseen for >= 30s.
    pub fn tick(&mut self, now_ms: u64) -> DocResult<AwarenessTick> {
        let mut changed_clients = Vec::new();
        let mut renewed_local = false;

        let local_id = self.inner.local_id();
        if let Some(last_ms) = self.last_local_broadcast_ms
            && now_ms.saturating_sub(last_ms) >= AWARENESS_RENEW_INTERVAL_MS
            && let Some(local_content) = self.inner.get_local_state()
            && local_content != "null"
        {
            self.inner.set_local_state(local_content);
            self.last_local_broadcast_ms = Some(now_ms);
            changed_clients.push(local_id);
            renewed_local = true;
        }

        let expired_clients: Vec<u64> = self
            .remote_last_seen_ms
            .iter()
            .filter_map(|(&cid, &seen_ms)| {
                if now_ms.saturating_sub(seen_ms) >= AWARENESS_EXPIRE_TIMEOUT_MS {
                    Some(cid)
                } else {
                    None
                }
            })
            .collect();

        if !expired_clients.is_empty() {
            let mut removals = AwarenessStates::new();
            for &cid in &expired_clients {
                self.remote_last_seen_ms.remove(&cid);
                let next_clock = self
                    .inner
                    .get_states()
                    .get(&cid)
                    .map_or(1, |s| s.clock().saturating_add(1));
                removals.insert(cid, AwarenessState::new(next_clock, "null".to_string()));
                changed_clients.push(cid);
            }
            self.inner.apply_update(removals);
        }

        let outbound_update = if changed_clients.is_empty() {
            None
        } else {
            Some(self.inner.encode_update(Some(&changed_clients))?)
        };

        Ok(AwarenessTick {
            outbound_update,
            expired_clients,
            renewed_local,
        })
    }
}
