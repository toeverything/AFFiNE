//! Zero-JNA / zero-UniFFI Android native-island narrow state machines (`S6-NativeIslands`):
//! `ShareIntent`: Incoming `ACTION_SEND` / `ACTION_SEND_MULTIPLE` queue with atomic drain
//! and idempotent deduplication.

use std::collections::{BTreeSet, VecDeque};

use serde::{Deserialize, Serialize};

/// Supported Android `ACTION_SEND` payload kinds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AndroidShareKind {
    Url,
    Text,
    Image,
}

/// One queued item received from Android `ACTION_SEND` / `ACTION_SEND_MULTIPLE`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AndroidShareItem {
    pub id: String,
    pub kind: AndroidShareKind,
    pub title: String,
    pub content: String,
    pub mime_type: String,
}

/// Pure-Rust incoming share queue with scheme & idempotent duplicate validation.
#[derive(Debug, Default)]
pub struct AndroidShareQueue {
    items: VecDeque<AndroidShareItem>,
    consumed_ids: BTreeSet<String>,
}

impl AndroidShareQueue {
    pub fn enqueue(&mut self, item: AndroidShareItem) -> Result<(), &'static str> {
        if item.id.trim().is_empty() {
            return Err("share id must be non-empty");
        }
        if item.content.trim().is_empty() {
            return Err("share content must be non-empty");
        }
        if item.kind == AndroidShareKind::Url {
            let trimmed = item.content.trim();
            if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
                return Err("share url must use http(s) scheme");
            }
        }
        if self.consumed_ids.contains(&item.id)
            || self.items.iter().any(|existing| existing.id == item.id)
        {
            return Err("duplicate share id");
        }
        self.items.push_back(item);
        Ok(())
    }

    pub fn pending_count(&self) -> usize {
        self.items.len()
    }

    pub fn drain_all(&mut self) -> Vec<AndroidShareItem> {
        let drained: Vec<AndroidShareItem> = self.items.drain(..).collect();
        for item in &drained {
            self.consumed_ids.insert(item.id.clone());
        }
        drained
    }
}

/// Combined narrow-bridge state for Android native islands.
#[derive(Debug, Default)]
pub struct AndroidNativeIslandsState {
    pub share_queue: AndroidShareQueue,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn android_native_islands_share_intent_state_machine() {
        let mut islands = AndroidNativeIslandsState::default();
        assert!(
            islands
                .share_queue
                .enqueue(AndroidShareItem {
                    id: "bad".into(),
                    kind: AndroidShareKind::Url,
                    title: "".into(),
                    content: "file:///etc/passwd".into(),
                    mime_type: "text/plain".into(),
                })
                .is_err()
        );
        islands
            .share_queue
            .enqueue(AndroidShareItem {
                id: "intent-1".into(),
                kind: AndroidShareKind::Url,
                title: "AFFiNE".into(),
                content: "https://affine.pro".into(),
                mime_type: "text/plain".into(),
            })
            .expect("enqueue url");
        assert_eq!(islands.share_queue.pending_count(), 1);
        let drained = islands.share_queue.drain_all();
        assert_eq!(drained.len(), 1);
        assert_eq!(islands.share_queue.pending_count(), 0);
        // Re-enqueuing an already-consumed ID must fail idempotently.
        assert!(
            islands
                .share_queue
                .enqueue(AndroidShareItem {
                    id: "intent-1".into(),
                    kind: AndroidShareKind::Url,
                    title: "AFFiNE".into(),
                    content: "https://affine.pro".into(),
                    mime_type: "text/plain".into(),
                })
                .is_err()
        );
    }
}
