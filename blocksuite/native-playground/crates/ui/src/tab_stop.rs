use std::fmt::Debug;

use crate::collections::FxHashMap;

use crate::{FocusHandle, FocusId};

/// Represents a collection of focus handles using the tab-index APIs.
///
/// Every focusable element is inserted on every frame, while the tab order is only needed
/// when the user moves focus with tab. So insertion just appends the node, and the nodes
/// are sorted in place the first time the order is needed after an insertion.
#[derive(Debug, Default)]
pub(crate) struct TabStopMap {
    current_path: TabStopPath,
    pub(crate) insertion_history: Vec<TabStopOperation>,
    /// Index into `nodes` of each focus handle's most recent insertion.
    by_id: FxHashMap<FocusId, usize>,
    nodes: Vec<TabStopNode>,
    sorted: bool,
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
        Some(self.cmp(&other))
    }
}

impl TabStopMap {
    pub fn insert(&mut self, focus_handle: &FocusHandle) {
        self.insertion_history
            .push(TabStopOperation::Insert(focus_handle.clone()));
        let mut path = self.current_path.clone();
        path.0.push(focus_handle.tab_index);
        self.by_id.insert(focus_handle.id, self.nodes.len());
        self.sorted = false;
        self.nodes.push(TabStopNode {
            node_insertion_index: self.insertion_history.len() - 1,
            tab_stop: focus_handle.tab_stop,
            path,
        });
    }

    pub fn begin_group(&mut self, tab_index: isize) {
        self.insertion_history
            .push(TabStopOperation::Group(tab_index));
        self.current_path.0.push(tab_index);
    }

    pub fn end_group(&mut self) {
        self.insertion_history.push(TabStopOperation::GroupEnd);
        self.current_path.0.pop();
    }

    pub fn clear(&mut self) {
        self.current_path.0.clear();
        self.insertion_history.clear();
        self.by_id.clear();
        self.nodes.clear();
        self.sorted = false;
    }

    pub fn next(&mut self, focused_id: Option<&FocusId>) -> Option<FocusHandle> {
        self.ensure_sorted();
        let start = focused_id
            .and_then(|id| self.by_id.get(id))
            .map_or(0, |position| position + 1);
        let node = self.nodes[start..]
            .iter()
            .chain(&self.nodes[..start])
            .find(|node| node.tab_stop)?;
        self.focus_handle_for_order(node)
    }

    pub fn prev(&mut self, focused_id: Option<&FocusId>) -> Option<FocusHandle> {
        self.ensure_sorted();
        let end = focused_id
            .and_then(|id| self.by_id.get(id).copied())
            .unwrap_or(self.nodes.len());
        let node = self.nodes[..end]
            .iter()
            .rev()
            .chain(self.nodes[end..].iter().rev())
            .find(|node| node.tab_stop)?;
        self.focus_handle_for_order(node)
    }

    fn ensure_sorted(&mut self) {
        if self.sorted {
            return;
        }
        // Nodes never compare equal, since their insertion indices differ, so an unstable
        // sort gives the same order as a stable one without allocating a scratch buffer.
        self.nodes.sort_unstable();
        self.by_id.clear();
        for (position, node) in self.nodes.iter().enumerate() {
            let Some(focus_handle) = self
                .insertion_history
                .get(node.node_insertion_index)
                .and_then(TabStopOperation::focus_handle)
            else {
                continue;
            };
            let latest = self.by_id.entry(focus_handle.id).or_insert(position);
            if self.nodes[*latest].node_insertion_index < node.node_insertion_index {
                *latest = position;
            }
        }
        self.sorted = true;
    }

    pub fn replay(&mut self, nodes: &[TabStopOperation]) {
        for node in nodes {
            match node {
                TabStopOperation::Insert(focus_handle) => self.insert(focus_handle),
                TabStopOperation::Group(tab_index) => self.begin_group(*tab_index),
                TabStopOperation::GroupEnd => self.end_group(),
            }
        }
    }

    pub fn paint_index(&self) -> usize {
        self.insertion_history.len()
    }

    pub(crate) fn tab_stop_count(&self) -> usize {
        self.by_id
            .values()
            .filter(|index| self.nodes.get(**index).is_some_and(|node| node.tab_stop))
            .count()
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
