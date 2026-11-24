//! Reuse global element ids across frames using upstream's incremental path hash.

use crate::GlobalElementId;
use crate::collections::FxHashMap;
use std::mem;

/// The global id of the element id stack of `window`, handed out again from
/// the [`GlobalIdCache`] when it was handed out this frame or the last.
#[inline(always)]
pub(crate) fn current(window: &mut crate::Window) -> GlobalElementId {
    window.global_ids.get(&window.element_id_stack)
}

/// The global ids handed out this frame and the last, by the hash of their
/// path.
///
/// An element whose path is the one it had on the frame before, which is
/// nearly every element, is given the id it had then, rather than a copy of
/// the whole element id stack to be dropped id by id when the frame is done.
#[derive(Default)]
pub(crate) struct GlobalIdCache {
    previous: FxHashMap<u64, GlobalElementId>,
    current: FxHashMap<u64, GlobalElementId>,
}

impl GlobalIdCache {
    /// The global id of `path`: one handed out already if there is one, a
    /// new one otherwise.
    pub(crate) fn get(&mut self, path: &crate::window::ElementIdStack) -> GlobalElementId {
        let hash = path.hash();
        if let Some(id) = self.current.get(&hash)
            && *id.ids == **path
        {
            return id.clone();
        }
        let id = match self.previous.get(&hash) {
            Some(id) if *id.ids == **path => id.clone(),
            _ => path.global_id(),
        };
        self.current.insert(hash, id.clone());
        id
    }

    /// Keeps this frame's ids for the next one to find, and forgets the
    /// previous frame's.
    pub(crate) fn finish_frame(&mut self) {
        mem::swap(&mut self.previous, &mut self.current);
        self.current.clear();
    }
}
