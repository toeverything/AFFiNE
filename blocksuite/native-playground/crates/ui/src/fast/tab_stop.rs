//! gpui-fast's tab stop map, which `gpui.rs` puts in place of upstream's
//! `tab_stop.rs`. It answers every query upstream's does, with the same
//! results, but builds its order only when one is asked.
//!
//! Painting inserts every focusable element into the next frame's map, and a
//! reused view or a scroll layer replays all of the insertions it recorded,
//! while only Tab navigation (and, with accessibility active, the tab stop
//! count) queries it. Upstream kept a `SumTree` and a hash map up to date on
//! every insertion, so a frame of focusable content paid for an ordered
//! insert per element whether or not anything asked. Here insertions only
//! append to the history upstream already keeps, and the order and the
//! focus-id lookup are built from it on the first query after a change.

use std::{cell::RefCell, fmt::Debug};

use crate::collections::FxHashMap;

use crate::{FocusHandle, FocusId};

/// Represents a collection of focus handles using the tab-index APIs.
///
/// Only the insertion history is kept as elements are painted; the tab order
/// (by group path, then insertion) and the focus-id lookup are built from it
/// on the first query after a change.
#[derive(Debug, Default)]
pub(crate) struct TabStopMap {
    pub(crate) insertion_history: Vec<TabStopOperation>,
    /// The order and lookup for `insertion_history`, once queried.
    index: RefCell<Option<TabStopIndex>>,
}

/// The queryable form of a [`TabStopMap`]'s insertion history.
#[derive(Debug, Default)]
struct TabStopIndex {
    by_id: FxHashMap<FocusId, TabStopNode>,
    /// Every inserted node, in tab order.
    order: Vec<TabStopNode>,
}

#[derive(Debug, Clone)]
pub enum TabStopOperation {
    Insert(FocusHandle),
    Group(TabIndex),
    GroupEnd,
}

impl TabStopOperation {
    fn focus_handle(&self) -> Option<&FocusHandle> {
        match self {
            TabStopOperation::Insert(focus_handle) => Some(focus_handle),
            _ => None,
        }
    }
}

type TabIndex = isize;

#[derive(Debug, Default, PartialEq, Eq, Clone, Ord, PartialOrd)]
struct TabStopPath(smallvec::SmallVec<[TabIndex; 6]>);

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct TabStopNode {
    /// Path to access the node in the tree
    /// The final node in the list is a leaf node corresponding to an actual focus handle,
    /// all other nodes are group nodes
    path: TabStopPath,
    /// index into the backing array of nodes. Corresponds to insertion order
    node_insertion_index: usize,

    /// Whether this node is a tab stop
    tab_stop: bool,
}

impl Ord for TabStopNode {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.path
            .cmp(&other.path)
            .then(self.node_insertion_index.cmp(&other.node_insertion_index))
    }
}

impl PartialOrd for TabStopNode {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl TabStopIndex {
    /// Replays `history` the way upstream's eager insertions built the map:
    /// the last insertion of a focus id wins its lookup, while every
    /// insertion keeps its place in the order.
    fn build(history: &[TabStopOperation]) -> Self {
        let mut path = TabStopPath::default();
        let mut index = Self::default();
        for (node_insertion_index, operation) in history.iter().enumerate() {
            match operation {
                TabStopOperation::Insert(focus_handle) => {
                    let mut node_path = path.clone();
                    node_path.0.push(focus_handle.tab_index);
                    let node = TabStopNode {
                        path: node_path,
                        node_insertion_index,
                        tab_stop: focus_handle.tab_stop,
                    };
                    index.by_id.insert(focus_handle.id, node.clone());
                    index.order.push(node);
                }
                TabStopOperation::Group(tab_index) => path.0.push(*tab_index),
                TabStopOperation::GroupEnd => {
                    path.0.pop();
                }
            }
        }
        index.order.sort_unstable();
        index
    }

    /// The position of `node`, which is in the order.
    fn position(&self, node: &TabStopNode) -> Option<usize> {
        self.order.binary_search(node).ok()
    }

    fn next_after(&self, node: &TabStopNode) -> Option<&TabStopNode> {
        let start = self.position(node)? + 1;
        self.order[start..].iter().find(|item| item.tab_stop)
    }

    fn prev_before(&self, node: &TabStopNode) -> Option<&TabStopNode> {
        let end = self.position(node)?;
        self.order[..end].iter().rev().find(|item| item.tab_stop)
    }
}

impl TabStopMap {
    pub fn insert(&mut self, focus_handle: &FocusHandle) {
        self.insertion_history
            .push(TabStopOperation::Insert(focus_handle.clone()));
        self.index.get_mut().take();
    }

    pub fn begin_group(&mut self, tab_index: isize) {
        self.insertion_history
            .push(TabStopOperation::Group(tab_index));
        self.index.get_mut().take();
    }

    pub fn end_group(&mut self) {
        self.insertion_history.push(TabStopOperation::GroupEnd);
        self.index.get_mut().take();
    }

    pub fn clear(&mut self) {
        self.insertion_history.clear();
        self.index.get_mut().take();
    }

    /// Runs `f` with the index of the current insertion history.
    fn with_index<R>(&self, f: impl FnOnce(&TabStopIndex) -> R) -> R {
        let mut index = self.index.borrow_mut();
        f(index.get_or_insert_with(|| TabStopIndex::build(&self.insertion_history)))
    }

    pub fn next(&self, focused_id: Option<&FocusId>) -> Option<FocusHandle> {
        self.with_index(|index| {
            let first_stop = || {
                let first = index.order.first()?;
                if first.tab_stop {
                    Some(first)
                } else {
                    index.next_after(first)
                }
            };
            let node = focused_id
                .and_then(|id| index.by_id.get(id))
                .and_then(|node| index.next_after(node))
                .or_else(first_stop)?;
            self.focus_handle_for_order(node)
        })
    }

    pub fn prev(&self, focused_id: Option<&FocusId>) -> Option<FocusHandle> {
        self.with_index(|index| {
            let last_stop = || {
                let last = index.order.last()?;
                if last.tab_stop {
                    Some(last)
                } else {
                    index.prev_before(last)
                }
            };
            let node = focused_id
                .and_then(|id| index.by_id.get(id))
                .and_then(|node| index.prev_before(node))
                .or_else(last_stop)?;
            self.focus_handle_for_order(node)
        })
    }

    pub fn replay(&mut self, nodes: &[TabStopOperation]) {
        if nodes.is_empty() {
            return;
        }
        self.insertion_history.extend_from_slice(nodes);
        self.index.get_mut().take();
    }

    pub fn paint_index(&self) -> usize {
        self.insertion_history.len()
    }

    pub(crate) fn tab_stop_count(&self) -> usize {
        self.with_index(|index| index.by_id.values().filter(|node| node.tab_stop).count())
    }

    fn focus_handle_for_order(&self, order: &TabStopNode) -> Option<FocusHandle> {
        let handle = self.insertion_history[order.node_insertion_index].focus_handle();
        debug_assert!(
            handle.is_some(),
            "The order node did not correspond to an element, this is a GPUI bug"
        );
        handle.cloned()
    }
}
