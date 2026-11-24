//! The tables [`TaffyLayoutEngine::layout_bounds`] caches absolute bounds in,
//! indexed by the node's Taffy slot instead of hashed.
//!
//! Every element asks for its bounds in prepaint, thousands of them a frame,
//! and each first query of a node looks its parent up, then stores the node's
//! origin and bounds. Upstream keeps both in `FxHashMap<LayoutId, _>`s and
//! clears them at the end of every frame. [`LayoutIdMap`] answers the same
//! calls from a `Vec` indexed by the slot half of the node id, and forgets
//! everything at the end of a frame by starting a new pass instead of
//! clearing. What `layout_bounds` computes, pixel snapping included, is left
//! exactly as upstream wrote it.
//!
//! [`TaffyLayoutEngine::layout_bounds`]: crate::taffy::TaffyLayoutEngine::layout_bounds

use crate::LayoutId;

/// One slot of a [`LayoutIdMap`].
#[derive(Clone, Copy, Default)]
struct Entry<V> {
    /// The whole node id, slot and version, since Taffy gives a removed node's
    /// slot to the next node it creates.
    node: u64,
    /// The pass the value was stored in. It stands only in the current one.
    pass: u32,
    value: V,
}

/// A map from layout node to `V`, for the few calls `layout_bounds` and
/// `compute_layout` make of their caches: `get`, `insert`, `remove` and
/// `clear`, as on the `FxHashMap` it replaces.
pub(crate) struct LayoutIdMap<V> {
    /// Indexed by the slot of the node's id. Slots are dense, as Taffy reuses
    /// those of removed nodes.
    entries: Vec<Entry<V>>,
    /// Entries of any other pass are absent. Never 0, the pass of an entry that
    /// was never stored or has been removed.
    pass: u32,
}

impl<V> Default for LayoutIdMap<V> {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            pass: 1,
        }
    }
}

/// The id Taffy gave the node: a slotmap key's `as_ffi` value, the version in
/// the high half and the slot in the low.
#[inline]
fn raw(id: &LayoutId) -> u64 {
    u64::from(taffy::NodeId::from(*id))
}

#[inline]
fn slot(raw: u64) -> usize {
    raw as u32 as usize
}

impl<V: Copy + Default> LayoutIdMap<V> {
    #[inline]
    pub(crate) fn get(&self, id: &LayoutId) -> Option<&V> {
        let raw = raw(id);
        self.entries
            .get(slot(raw))
            .filter(|entry| entry.pass == self.pass && entry.node == raw)
            .map(|entry| &entry.value)
    }

    #[inline]
    pub(crate) fn insert(&mut self, id: LayoutId, value: V) {
        let raw = raw(&id);
        let slot = slot(raw);
        if slot >= self.entries.len() {
            self.entries.resize(slot + 1, Entry::default());
        }
        self.entries[slot] = Entry {
            node: raw,
            pass: self.pass,
            value,
        };
    }

    #[inline]
    pub(crate) fn remove(&mut self, id: &LayoutId) {
        let raw = raw(id);
        if let Some(entry) = self.entries.get_mut(slot(raw))
            && entry.node == raw
        {
            entry.pass = 0;
        }
    }

    /// Forgets every entry, at the end of a frame, without touching them.
    pub(crate) fn clear(&mut self) {
        self.pass = self.pass.wrapping_add(1);
        if self.pass == 0 {
            // Four billion frames on, entries stored in pass 1 would be back.
            self.entries.fill(Entry::default());
            self.pass = 1;
        }
    }
}
