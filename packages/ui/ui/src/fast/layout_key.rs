//! The path of keys from the root of the element tree that matches an element to the layout node it had last frame.

use crate::collections::FxHasher;
use crate::{
    AnyElement, App, AvailableSpace, ElementId, Pixels, SharedString, Size, Window,
    fast::stats::FramePhaseTimes,
};
use smallvec::SmallVec;
use std::{
    hash::{Hash, Hasher},
    mem,
};

/// What a window keeps to match elements to the layout nodes they had last
/// frame, and to report the work each frame's layout took.
pub(crate) struct WindowLayout {
    /// Running hashes of the path from the root of the element tree down to the
    /// element currently requesting layout. See [`push_layout_key`].
    key_stack: SmallVec<[LayoutKeyFrame; 32]>,
    /// How many unidentified element trees have been laid out under the
    /// current scope. Window roots, prompts, drags and tooltips each start a
    /// tree of their own and need keys that do not collide with each other.
    root_index: u32,
    /// The layout key of the element currently being prepainted, which anything
    /// it lays out from there hangs off. See [`push_layout_key`].
    prepaint_scope: u64,
    /// How long each phase of the frame took. See [`FramePhaseTimes`].
    pub(crate) phase_times: FramePhaseTimes,
}

impl Default for WindowLayout {
    fn default() -> Self {
        WindowLayout {
            key_stack: SmallVec::new(),
            root_index: 0,
            prepaint_scope: LAYOUT_ROOT_SEED,
            phase_times: FramePhaseTimes::default(),
        }
    }
}

impl WindowLayout {
    /// Starts the key paths of the next frame from the root again.
    pub(crate) fn end_frame(&mut self) {
        debug_assert!(self.key_stack.is_empty());
        self.root_index = 0;
        self.prepaint_scope = LAYOUT_ROOT_SEED;
    }
}

/// One level of [`push_layout_key`]'s path stack.
struct LayoutKeyFrame {
    /// Hash of the path from the root of the element tree to this element.
    key: u64,
    /// How many children without an [`ElementId`] have been entered so far,
    /// which is what identifies the next one.
    next_unidentified_child: u32,
}

/// Where layout key paths start.
const LAYOUT_ROOT_SEED: u64 = 0x9E37_79B9_7F4A_7C15;

/// Separates the elements laid out during an element's prepaint from that same
/// element's children, which are keyed from the same point during request
/// layout and would otherwise land on the same keys.
const LAYOUT_PREPAINT_SALT: u64 = 0x5BF0_3635_931A_2E77;

/// Mixes `value` into `state`, well enough that path hashes built out of small
/// child indices do not collide in practice.
///
/// This is the finalizer from SplitMix64 applied to the combined value.
fn mix(state: u64, value: u64) -> u64 {
    let mut z = state
        .rotate_left(27)
        .wrapping_add(value)
        .wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

impl Window {
    /// The key of the element enclosing the one currently requesting layout,
    /// which the latter's key is derived from; `None` at the root of a tree.
    pub(crate) fn parent_layout_key(&self) -> Option<u64> {
        let stack = &self.fast_layout.key_stack;
        stack.len().checked_sub(2).map(|parent| stack[parent].key)
    }

    /// Runs `f` as though the element whose key is `parent` were requesting
    /// its layout, so that an element with an id requested in `f` is keyed as
    /// it was when it was requested inside that element.
    pub(crate) fn with_parent_layout_key<R>(
        &mut self,
        parent: u64,
        f: impl FnOnce(&mut Self) -> R,
    ) -> R {
        let saved = mem::take(&mut self.fast_layout.key_stack);
        self.fast_layout.key_stack.push(LayoutKeyFrame {
            key: parent,
            next_unidentified_child: 0,
        });
        let result = f(self);
        self.fast_layout.key_stack = saved;
        result
    }

    /// Lays out whatever `f` lays out under a step of the layout key path
    /// that names the list item at `index`, as though an element identified by
    /// it enclosed them. No such element exists, so the element id stack, and
    /// the element state keyed by it, are untouched. See
    /// [`layout_as_list_item`].
    pub(crate) fn with_list_item_layout_key<R>(
        &mut self,
        index: usize,
        f: impl FnOnce(&mut Self) -> R,
    ) -> R {
        // Named so that it cannot stand for an item that was given the same
        // index as its id.
        let key =
            ElementId::NamedInteger(SharedString::new_static("crate::list_item"), index as u64);
        push_layout_key(self, Some(&key));
        let result = f(self);
        pop_layout_key(self);
        result
    }

    /// Runs `f` as though the element being prepainted were requesting its
    /// layout, so that what `f` lays out is keyed as that element's children
    /// were, and finds the nodes they had.
    pub(crate) fn with_layout_key_of_prepainting_element<R>(
        &mut self,
        f: impl FnOnce(&mut Self) -> R,
    ) -> R {
        let key = self.fast_layout.prepaint_scope;
        self.fast_layout.key_stack.push(LayoutKeyFrame {
            key,
            next_unidentified_child: 0,
        });
        let result = f(self);
        self.fast_layout.key_stack.pop();
        result
    }
}

/// The key identifying the element currently requesting layout, used to
/// match it up with the Taffy node it had on the previous frame.
///
/// `None` while no element tree is being walked — layout requested from the
/// prepaint phase, as uniform lists do when sizing their items, arrives
/// here. Those nodes are not reused.
#[inline(always)]
pub(crate) fn layout_key(window: &Window) -> Option<u64> {
    window.fast_layout.key_stack.last().map(|frame| frame.key)
}

/// Begins an element, deriving the key its layout node is matched by across
/// frames.
///
/// The key is the hash of the path from the root: each element mixes either
/// its [`ElementId`], when it has one, or its index among its unidentified
/// siblings. Identified elements therefore keep their node when siblings are
/// inserted or reordered around them, while unidentified ones are matched
/// purely by position, which is the same bargain the element state map makes.
///
/// Because the parent's key is always mixed in, a key encodes the whole
/// ancestor path, and a node can never be matched to an element that has
/// moved to a different parent.
#[inline]
pub(crate) fn push_layout_key(window: &mut Window, id: Option<&ElementId>) -> u64 {
    let layout = &mut window.fast_layout;
    let component = match id {
        Some(id) => {
            let mut hasher = FxHasher::default();
            id.hash(&mut hasher);
            // Kept distinct from the positional case so that an element
            // identified by index 3 and one whose `ElementId` hashes to 3
            // do not collide.
            mix(hasher.finish(), 1)
        }
        None => {
            let index = match layout.key_stack.last_mut() {
                Some(parent) => &mut parent.next_unidentified_child,
                None => &mut layout.root_index,
            };
            let component = mix(*index as u64, 2);
            *index += 1;
            component
        }
    };
    let parent = layout
        .key_stack
        .last()
        .map(|parent| parent.key)
        .unwrap_or_else(|| mix(layout.prepaint_scope, LAYOUT_PREPAINT_SALT));
    let key = mix(parent, component);
    layout.key_stack.push(LayoutKeyFrame {
        key,
        next_unidentified_child: 0,
    });
    key
}

/// Hangs elements laid out from here on the element whose prepaint is
/// running, and returns what [`exit_prepaint_scope`] needs to
/// undo it.
///
/// The walk that assigns layout keys covers the request-layout phase only.
/// Elements laid out afterwards — list items, which a list can lay out only
/// once it knows how many of them fit — arrive with no path at all, and
/// would otherwise be keyed by the order they happened to be laid out in.
/// A list that scrolled by one row, or gained a row at the top, would
/// renumber every item and rebuild every item's layout nodes. Keyed under
/// the element that lays them out, an item carrying an [`ElementId`] keeps
/// its nodes wherever it moves within its list.
#[inline(always)]
pub(crate) fn enter_prepaint_scope(window: &mut Window, layout_key: u64) -> (u64, u32) {
    let layout = &mut window.fast_layout;
    (
        mem::replace(&mut layout.prepaint_scope, layout_key),
        mem::replace(&mut layout.root_index, 0),
    )
}

/// Restores what [`enter_prepaint_scope`] replaced.
#[inline(always)]
pub(crate) fn exit_prepaint_scope(window: &mut Window, enclosing: (u64, u32)) {
    (
        window.fast_layout.prepaint_scope,
        window.fast_layout.root_index,
    ) = enclosing;
}

/// Ends the element most recently begun by [`push_layout_key`].
#[inline(always)]
pub(crate) fn pop_layout_key(window: &mut Window) {
    window.fast_layout.key_stack.pop();
}

/// Lays this element out as the item at `index` of a list, the way
/// [`AnyElement::layout_as_root`] does.
///
/// A list lays out only the items in view, so an item without an
/// [`ElementId`] is otherwise matched to last frame's nodes by where it
/// comes among the items laid out this frame, and scrolling by a single
/// row hands every item the nodes of its neighbour. Keyed by its index
/// instead, an item keeps its nodes while it stays in view. Only the
/// layout is keyed: element state, which nothing here claims to identify,
/// is left as it was. An item with an id of its own keeps being matched by
/// that, so one keyed by its data still keeps its nodes when items are
/// inserted ahead of it.
#[inline(always)]
pub(crate) fn layout_as_list_item(
    element: &mut AnyElement,
    index: usize,
    available_space: Size<AvailableSpace>,
    window: &mut Window,
    cx: &mut App,
) -> Size<Pixels> {
    let size = crate::fast::layout::laying_out_list_row(window, |window| {
        if element.0.fast_element_id().is_some() {
            return element.layout_as_root(available_space, window, cx);
        }
        window.with_list_item_layout_key(index, |window| {
            element.layout_as_root(available_space, window, cx)
        })
    });
    size
}
