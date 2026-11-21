//! Copying a stretch of last frame's dispatch nodes into this frame's tree in
//! one pass.
//!
//! Upstream's [`DispatchTree::reuse_subtree`] copies a reused stretch node by
//! node: it pops the nodes the previous one left open until it reaches the
//! node's parent, pushes a new node, and pushes and pops the key contexts and
//! views along the way. The nodes of a stretch are last frame's in the same
//! order, so each one's new parent is known without any of that: a parent in
//! the stretch moved by as much as the stretch did, and a parent before it is
//! one of the nodes the copy was left open in, or else the node the copy hangs
//! off. [`copy_nodes`] writes the nodes that way and only then brings the
//! tree's stacks to where node-by-node copying would have left them.

use crate::key_dispatch::{DispatchNode, DispatchNodeId, DispatchTree};
use crate::{EntityId, FocusId};
use std::{mem, ops::Range};

/// A dispatch node's list of listeners. Nearly every node has none: as a
/// `Vec` each list is three words of every node, written when it is pushed
/// and read again when it is dropped; boxed only once something is added, it
/// is one.
pub(crate) type Listeners<T> = crate::fast::interactivity::LazyVec<T>;

/// Copies `source`'s nodes `range` into `target`, as pushing each of them in
/// turn would have, returning whether one of them holds `focus`.
///
/// `open` holds `source`'s nodes copied before, innermost last, that are
/// still open on `target`'s node stack, each above the one before it. With
/// `open`, the copy is left open too: the nodes it closed are popped from
/// `target` and from `open`, and the ones it leaves open pushed onto both.
/// Without it, `target`'s stacks are left as they were, as though every node
/// copied had been popped again.
pub(crate) fn copy_nodes(
    target: &mut DispatchTree,
    source: &mut DispatchTree,
    range: Range<usize>,
    mut open: Option<&mut Vec<DispatchNodeId>>,
    focus: Option<FocusId>,
) -> bool {
    let start = target.nodes.len();
    let open_len = open.as_ref().map_or(0, |open| open.len());
    // The nodes of `target` that `open` stands for, and the one below them.
    let base = target.node_stack.len() - open_len;
    let base_parent = base.checked_sub(1).map(|ix| target.node_stack[ix]);
    // How many of `open` are still open: a node that hangs off one of them
    // closes the ones above it, and one that hangs off none closes them all.
    let mut still_open = open_len;

    let mut contains_focus = false;
    target.nodes.reserve(range.len());
    for index in range.clone() {
        let node = &mut source.nodes[index];
        let parent = match node.parent {
            Some(parent) if range.contains(&parent.0) => {
                Some(DispatchNodeId(parent.0 - range.start + start))
            }
            parent => {
                let found = parent.and_then(|parent| {
                    open.as_deref()?[..still_open]
                        .iter()
                        .rposition(|&node| node == parent)
                });
                match found {
                    Some(position) => {
                        still_open = position + 1;
                        Some(target.node_stack[base + position])
                    }
                    None => {
                        still_open = 0;
                        base_parent
                    }
                }
            }
        };

        let id = DispatchNodeId(target.nodes.len());
        if node.focus_id.is_some() && node.focus_id == focus {
            contains_focus = true;
        }
        if let Some(focus_id) = node.focus_id {
            target.focusable_node_ids.insert(focus_id, id);
        }
        // `DispatchTree::set_view_id` only marks a node whose view is not
        // already the innermost one around it.
        let view_id = node
            .view_id
            .filter(|&view_id| innermost_view(target, parent) != Some(view_id));
        if let Some(view_id) = view_id {
            target.view_node_ids.insert(view_id, id);
        }
        target.nodes.push(DispatchNode {
            key_listeners: mem::take(&mut node.key_listeners),
            action_listeners: mem::take(&mut node.action_listeners),
            modifiers_changed_listeners: mem::take(&mut node.modifiers_changed_listeners),
            context: node.context.clone(),
            focus_id: node.focus_id,
            view_id,
            parent,
        });
    }

    let Some(open) = open.as_mut() else {
        return contains_focus;
    };
    // Close what the copy closed, then open the last node copied and those
    // of its ancestors that were copied with it.
    for _ in still_open..open_len {
        open.pop();
        target.pop_node();
    }
    let end = target.nodes.len();
    if end > start {
        let mut chain = Vec::new();
        let mut node = Some(DispatchNodeId(end - 1));
        while let Some(id) = node.filter(|id| id.0 >= start) {
            chain.push(id);
            node = target.nodes[id.0].parent;
        }
        for &id in chain.iter().rev() {
            open.push(DispatchNodeId(id.0 - start + range.start));
            target.node_stack.push(id);
            let node = &target.nodes[id.0];
            if let Some(context) = node.context.clone() {
                target.context_stack.push(context);
            }
            if let Some(view_id) = node.view_id {
                target.view_stack.push(view_id);
            }
        }
    }
    contains_focus
}

/// The view of the innermost node from `node` outwards that has one: what
/// `target`'s view stack would end with, were `node` the active node.
fn innermost_view(target: &DispatchTree, mut node: Option<DispatchNodeId>) -> Option<EntityId> {
    while let Some(id) = node {
        let node_ref = &target.nodes[id.0];
        if node_ref.view_id.is_some() {
            return node_ref.view_id;
        }
        node = node_ref.parent;
    }
    None
}
