//! Taffy layout nodes retained across frames, and the style fingerprint that decides whether a retained node can be left alone.

use crate::collections::{FxHashMap, FxHashSet, FxHasher};
use crate::{
    AbsoluteLength, App, AvailableSpace, DefiniteLength, Edges, GridTemplate, LayoutId, Length,
    Pixels, Size, Style, Window,
    fast::stats::LayoutStats,
    taffy::{MeasureFn, NodeContext, TaffyLayoutEngine, ToTaffy as _},
    util::round_to_device_pixel,
};
use smallvec::SmallVec;
use std::{
    any::Any,
    cell::{Cell, RefCell},
    fmt::Debug,
    hash::{Hash as _, Hasher as _},
    mem,
    rc::Rc,
};
use taffy::{TaffyTree, TraversePartialTree as _};

/// What a Taffy call that cannot fail by construction panics with, as
/// upstream's layout engine does.
const EXPECT_MESSAGE: &str = "we should avoid taffy layout errors by construction if possible";

/// The retained half of a [`TaffyLayoutEngine`]: the nodes it keeps from one
/// frame to the next, what it needs to tell whether a frame can leave them
/// alone, and the counters describing the work it did.
#[derive(Default)]
pub(crate) struct LayoutRetention {
    /// Nodes surviving from earlier frames, keyed by their position in the
    /// element tree. `push_layout_key` derives the keys.
    retained: FxHashMap<u64, RetainedNode>,
    /// Nodes allocated this frame that are not retained, because the caller had
    /// no key for them or because their key was already claimed. Released at
    /// the end of the frame, which is what used to happen to every node.
    transient: Vec<LayoutId>,
    /// Styles as the element requested them, for the few nodes whose style
    /// Taffy no longer holds verbatim because [`TaffyLayoutEngine::stretch_auto_size_to_fill`]
    /// rewrote it. Without this, every frame would compare an unstretched
    /// request against a stretched style, find a difference, and dirty the
    /// window root.
    unstretched_styles: FxHashMap<LayoutId, taffy::style::Style>,
    /// Incremented once per frame; stamped onto nodes as they are claimed.
    frame: u64,
    /// How many retained entries have been claimed so far this frame. When it
    /// matches the size of `retained` at the end of the frame, nothing has been
    /// orphaned and the sweep can be skipped entirely.
    claimed_this_frame: usize,
    /// The keys claimed while [`TaffyLayoutEngine::record_claimed_keys`] is
    /// recording, for a retained subtree to keep its nodes by. See
    /// [`crate::fast::retained`].
    claimed_key_log: Vec<u64>,
    /// How many recordings are open, nested retained subtrees each having one.
    open_key_recordings: usize,
    pub(crate) stats: LayoutStats,
    /// Whether to time layout and measurements. See [`LayoutStats`].
    pub(crate) timed: bool,
    /// Counts every write that changes what a layout computes: a node created,
    /// a style or a child list rewritten, a measurement that no longer
    /// stands. A subtree laid out again without any of these has the layout
    /// it had. See [`TaffyLayoutEngine::layout_changes`].
    layout_changes: u64,
    /// Counts the measured nodes given a new measurement to take. Their
    /// measurement has to be taken again, since what it produces lives in
    /// state the element made afresh, though it is expected to come out as
    /// before. See [`TaffyLayoutEngine::remeasures`].
    remeasures: u64,
    /// The [`layout_fingerprint`] of the default style, which every text leaf
    /// asks for, under the rem size and scale factor it was taken at.
    default_fingerprint: Option<(Pixels, f32, u64)>,
    /// The leaves the layout being computed measured, kept between
    /// computations so that its table is not allocated for each one. See
    /// [`settle_measured_leaves`].
    pub(crate) measured_leaves: MeasuredLeaves,
    /// Measured nodes given a new closure this frame and left clean for what
    /// their [`MeasureLog`] vouches for, to be measured with it before they
    /// are laid out. See [`replay_pending_measures`].
    pending_replays: Vec<(LayoutId, Rc<MeasureLog>)>,
    /// How many list rows are being laid out, nested. See
    /// [`RetainedNode::lingers`].
    list_rows: usize,
    /// Nodes another node took a child from. Taffy detaches a child from its
    /// old parent when a new one is given it, so the old parent no longer
    /// holds the tree it was laid out with. Requesting it again writes its
    /// children back, but a subtree kept without being requested would keep
    /// it as it is, so [`TaffyLayoutEngine::try_keep_retained`] refuses one
    /// holding any of these.
    robbed_parents: FxHashSet<LayoutId>,
    /// Whether a child taken from a node that claimed it earlier in the same
    /// frame has been reported. See [`TaffyLayoutEngine::set_children`].
    #[cfg(debug_assertions)]
    reported_double_parent: bool,
}

/// How many frames a node of a list row is kept unclaimed before it is
/// released. See [`RetainedNode::lingers`].
const LIST_ROW_NODE_LINGER_FRAMES: u64 = 240;

/// The leaves a layout computation measured, each with the width it was last
/// measured at: the width it was given, or the definite width it was offered,
/// or none when it was asked for its content size.
#[derive(Default)]
pub(crate) struct MeasuredLeaves(FxHashMap<taffy::NodeId, Option<Pixels>>);

impl MeasuredLeaves {
    /// Records that Taffy measured `node` under these constraints, replacing
    /// whatever it was measured at before in this computation.
    #[inline]
    pub(crate) fn note(
        &mut self,
        node: taffy::NodeId,
        known_dimensions: Size<Option<Pixels>>,
        available_space: Size<AvailableSpace>,
    ) {
        let width = known_dimensions.width.or(match available_space.width {
            AvailableSpace::Definite(width) => Some(width),
            AvailableSpace::MinContent | AvailableSpace::MaxContent => None,
        });
        self.0.insert(node, width);
    }
}

/// Measures again, at the size it was laid out at, every leaf whose last
/// measurement in the layout just computed was taken at another width.
///
/// A measured leaf keeps what its last measurement produced, and that is what
/// it paints: text paints the lines it was last shaped into. Upstream lays
/// every node out afresh each frame, and Taffy's last question to a leaf is the
/// one that places it, at the width it ends up with. A retained node keeps the
/// layout Taffy placed it at, and Taffy answers that question from its cache,
/// while it can still ask the leaf for its size under other constraints when a
/// node above it is laid out again. Two such questions can even take turns
/// evicting each other from the one cache slot they share, so the leaf is
/// measured again each time it is asked. Its last measurement is then a probe:
/// a `flex_1` text whose row is sized to its content is measured at width zero,
/// and painted one glyph to a line in the box it was laid out in.
pub(crate) fn settle_measured_leaves(
    engine: &mut TaffyLayoutEngine,
    window: &mut Window,
    cx: &mut App,
) {
    let mut leaves = mem::take(&mut engine.retention.measured_leaves);
    let scale_factor = window.scale_factor();
    for (node, width) in leaves.0.drain() {
        let Ok(layout) = engine.taffy.layout(node) else {
            continue;
        };
        let content = Size {
            width: Pixels(
                (layout.size.width
                    - layout.padding.left
                    - layout.padding.right
                    - layout.border.left
                    - layout.border.right)
                    .max(0.)
                    / scale_factor,
            ),
            height: Pixels(
                (layout.size.height
                    - layout.padding.top
                    - layout.padding.bottom
                    - layout.border.top
                    - layout.border.bottom)
                    .max(0.)
                    / scale_factor,
            ),
        };
        if width == Some(content.width) {
            continue;
        }
        let Some(context) = engine.taffy.get_node_context_mut(node) else {
            continue;
        };
        engine.retention.stats.measure_calls += 1;
        (context.measure)(
            Size {
                width: Some(content.width),
                height: Some(content.height),
            },
            Size {
                width: AvailableSpace::Definite(content.width),
                height: AvailableSpace::Definite(content.height),
            },
            window,
            cx,
        );
    }
    engine.retention.measured_leaves = leaves;
}

/// Removes a node from the tree, and with it what its measurement captured.
///
/// Taffy keeps a removed node's context until another node is given its slot,
/// so a measurement closure, and everything it holds — the text of a text
/// element and the lines shaped from it — would outlive its node by however
/// many frames that takes. Replacing the closure rather than clearing the
/// context releases all of it without dirtying the node, or a parent it is
/// still attached to, on the way out.
fn remove_node(taffy: &mut TaffyTree<NodeContext>, id: LayoutId) {
    if let Some(context) = taffy.get_node_context_mut(id.into()) {
        let released: Box<MeasureFn> = Box::new(|_, _, _, _| Size::default());
        context.measure = released;
    }
    taffy.remove(id.into()).expect(EXPECT_MESSAGE);
}

/// A node kept from one frame to the next, alongside enough of the request
/// that produced it to tell whether this frame can leave it alone.
///
/// Taffy caches layout results per node and discards that cache for a node and
/// all of its ancestors whenever the node is dirtied. Every mutating call —
/// `set_style`, `set_children`, `set_node_context` — dirties unconditionally,
/// so keeping nodes across frames is worth nothing on its own: the value comes
/// from *not writing* to them, which is only possible by remembering what the
/// previous frame asked for and comparing against it first.
struct RetainedNode {
    id: LayoutId,
    /// Frame in which this node was last claimed. A node that goes a whole
    /// frame unclaimed has left the element tree and is released.
    claimed_in_frame: u64,
    /// Whether the node measures its own size.
    measured: bool,
    /// [`layout_fingerprint`] of the style the node was last asked for. While
    /// the request is the same, converting it to a Taffy style and comparing
    /// that against the node's is work with only one possible outcome.
    style_fingerprint: u64,
    /// What the element measuring this node left for the next frame's element
    /// to take its measurement over from. See
    /// [`TaffyLayoutEngine::request_retained_carried_measured_layout`].
    measurement: Option<Rc<dyn Any>>,
    /// The sizes Taffy has taken from the node since it was last dirtied,
    /// for a new measurement to be checked against. See [`MeasureLog`].
    measure_log: Option<Rc<MeasureLog>>,
    /// Whether the node was claimed laying out a list row, and is kept for
    /// [`LIST_ROW_NODE_LINGER_FRAMES`] after it goes unclaimed. A list lays
    /// out only the rows it shows, or, on a scroll layer, those it paints
    /// ahead of the viewport, so a row scrolled out and back in again would
    /// otherwise be laid out, and its text shaped, from scratch. It stays
    /// set when the node is claimed again elsewhere: a view in a row that
    /// moved is laid out again as the list prepaints the row, outside the
    /// row's own layout, and its nodes are still the row's.
    lingers: bool,
}

/// The measurements Taffy took of one measured node since the node was last
/// dirtied: the constraints of each and the size it came out at, in the
/// order they were last taken.
///
/// Taffy caches a node's sizes under the constraints it computed them for,
/// and reuses them until the node is dirtied. Any size it holds for the node
/// was computed from one of these measurements, so a new measurement giving
/// the same size under every one of them would leave all of it — the node's
/// cache and those above it — exactly as it is. Recording stops, and the log
/// can no longer vouch for anything, once it has more entries than a node
/// measured under steady constraints ever needs.
#[derive(Default)]
pub(crate) struct MeasureLog {
    entries: RefCell<SmallVec<[MeasureLogEntry; 4]>>,
    overflowed: Cell<bool>,
}

/// One measurement in a [`MeasureLog`]: the known dimensions and available
/// space it was taken under, and the size it gave.
type MeasureLogEntry = (Size<Option<Pixels>>, Size<AvailableSpace>, Size<Pixels>);

/// How many measurements a [`MeasureLog`] keeps before giving up. Taffy
/// caches ten results per node.
const MEASURE_LOG_CAPACITY: usize = 16;

impl MeasureLog {
    /// Records a measurement Taffy took, moving it to the end if one under the
    /// same constraints was already recorded.
    fn record(
        &self,
        known: Size<Option<Pixels>>,
        available: Size<AvailableSpace>,
        size: Size<Pixels>,
    ) {
        if self.overflowed.get() {
            return;
        }
        let mut entries = self.entries.borrow_mut();
        if let Some(ix) = entries
            .iter()
            .position(|(k, a, _)| *k == known && *a == available)
        {
            entries.remove(ix);
        } else if entries.len() == MEASURE_LOG_CAPACITY {
            self.overflowed.set(true);
            entries.clear();
            return;
        }
        entries.push((known, available, size));
    }

    /// Whether `measure` gives every recorded size under the constraints it
    /// was recorded under. The measurements are taken again in the order they
    /// were last taken, so what `measure` keeps of them is what the last one
    /// left, as it would be had Taffy taken them.
    fn replays(
        &self,
        measure: &mut impl FnMut(
            Size<Option<Pixels>>,
            Size<AvailableSpace>,
            &mut Window,
            &mut App,
        ) -> Size<Pixels>,
        stats: &mut LayoutStats,
        window: &mut Window,
        cx: &mut App,
    ) -> bool {
        if self.overflowed.get() {
            return false;
        }
        let entries = self.entries.borrow();
        !entries.is_empty()
            && entries.iter().all(|(known, available, size)| {
                stats.measure_calls += 1;
                measure(*known, *available, window, cx) == *size
            })
    }

    /// Whether the log holds every size Taffy took from its node since the
    /// node was last dirtied: it has some, and did not give up recording.
    fn vouches(&self) -> bool {
        !self.overflowed.get() && !self.entries.borrow().is_empty()
    }

    /// `measure`, boxed for a node, recording what it measures into `log`.
    fn logged(
        log: &Rc<MeasureLog>,
        mut measure: impl FnMut(
            Size<Option<Pixels>>,
            Size<AvailableSpace>,
            &mut Window,
            &mut App,
        ) -> Size<Pixels>
        + 'static,
    ) -> Box<MeasureFn> {
        let log = log.clone();
        Box::new(move |known, available, window: &mut Window, cx: &mut App| {
            let size = measure(known, available, window, cx);
            log.record(known, available, size);
            size
        })
    }
}

/// What an element made of the measurement the node it lays out was left
/// with. See [`TaffyLayoutEngine::request_retained_carried_measured_layout`].
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Adopted {
    /// The measurement does not stand for this element.
    No,
    /// The element took the measurement over, and measures the node from now
    /// on: it differs from the element before it in something measuring it
    /// again would use.
    Measurement,
    /// The element took the measurement over, and the node's closure measures
    /// it as its own would: the node is left as it is.
    Node,
}

/// What [`TaffyLayoutEngine::claim`] found for an element's key.
enum Claim {
    /// A node from an earlier frame, now claimed for this one.
    Reused(u64, LayoutId),
    /// No node yet; one should be allocated and retained under this key.
    Vacant(u64),
    /// No node may be retained for this element: either it has no key, or
    /// another element already claimed the one it has.
    Unkeyed,
}

impl TaffyLayoutEngine {
    /// Takes the node retained under `key` for use in this frame.
    fn claim(&mut self, key: Option<u64>) -> Claim {
        let Some(key) = key else {
            return Claim::Unkeyed;
        };
        let retention = &mut self.retention;
        let frame = retention.frame;
        let Some(node) = retention.retained.get_mut(&key) else {
            return Claim::Vacant(key);
        };
        if node.claimed_in_frame == frame {
            // Two elements resolved to one key. Letting both use the node would
            // corrupt the tree, and retaining the second under the same key
            // would strand the first, so the second goes unkeyed.
            return Claim::Unkeyed;
        }
        node.claimed_in_frame = frame;
        node.lingers |= retention.list_rows > 0;
        retention.claimed_this_frame += 1;
        retention.stats.nodes_reused += 1;
        if retention.open_key_recordings > 0 {
            retention.claimed_key_log.push(key);
        }
        Claim::Reused(key, node.id)
    }

    /// Starts recording the keys of the nodes claimed or allocated from now
    /// on, returning where the recording starts. Recordings nest.
    pub(crate) fn record_claimed_keys(&mut self) -> usize {
        self.retention.open_key_recordings += 1;
        self.retention.claimed_key_log.len()
    }

    /// Ends the recording started at `start`, returning the keys it saw.
    pub(crate) fn finish_recording_claimed_keys(&mut self, start: usize) -> Vec<u64> {
        let retention = &mut self.retention;
        let keys = retention.claimed_key_log[start..].to_vec();
        retention.open_key_recordings -= 1;
        if retention.open_key_recordings == 0 {
            retention.claimed_key_log.clear();
        }
        keys
    }

    /// Keeps the nodes retained under `keys` for another frame without
    /// requesting them, for a subtree drawn from what it drew last frame
    /// rather than laid out again: they are there to be reused when it is
    /// built next. Keys already claimed this frame, or no longer retained,
    /// are passed over.
    pub(crate) fn keep_retained(&mut self, keys: &[u64]) {
        let retention = &mut self.retention;
        let frame = retention.frame;
        for key in keys {
            if let Some(node) = retention.retained.get_mut(key)
                && node.claimed_in_frame != frame
            {
                node.claimed_in_frame = frame;
                retention.claimed_this_frame += 1;
                if retention.open_key_recordings > 0 {
                    retention.claimed_key_log.push(*key);
                }
            }
        }
    }

    /// Takes over nodes claimed this frame by a layout request made before
    /// the one being recorded, as if it had claimed them itself: they are
    /// kept, and recorded as its own.
    pub(crate) fn adopt_claimed(&mut self, keys: &[u64]) {
        let retention = &mut self.retention;
        let frame = retention.frame;
        for key in keys {
            let Some(node) = retention.retained.get_mut(key) else {
                continue;
            };
            if node.claimed_in_frame != frame {
                node.claimed_in_frame = frame;
                retention.claimed_this_frame += 1;
            }
            if retention.open_key_recordings > 0 {
                retention.claimed_key_log.push(*key);
            }
        }
    }

    /// Keeps the nodes retained under `keys` for another frame, as
    /// [`Self::keep_retained`] does, but only if every one of them is still
    /// retained and unclaimed this frame; otherwise keeps none of them and
    /// returns false. A subtree whose layout is reused without being requested
    /// again needs all of its nodes, just as they were.
    /// The layouts last computed for the retained nodes `keys`, to tell once
    /// layout is computed again whether it changed them. See
    /// [`Self::layouts_unchanged`].
    pub(crate) fn retained_layouts(&self, keys: &[u64]) -> Vec<(LayoutId, taffy::Layout)> {
        keys.iter()
            .filter_map(|key| self.retention.retained.get(key))
            .filter_map(|node| Some((node.id, *self.taffy.layout(node.id.into()).ok()?)))
            .collect()
    }

    /// Whether computing layout at `root` reaches `id`. Element ancestry
    /// does not imply layout ancestry: list items and other children placed
    /// with `prepaint_as_root` belong to separate Taffy trees.
    pub(crate) fn layout_reaches(&self, root: LayoutId, id: LayoutId) -> bool {
        let root = root.into();
        let mut node = id.into();
        loop {
            if node == root {
                return true;
            }
            let Some(parent) = self.taffy.parent(node) else {
                return false;
            };
            node = parent;
        }
    }

    /// Whether the nodes [`Self::retained_layouts`] returned still have the
    /// layouts they had then.
    pub(crate) fn layouts_unchanged(&self, layouts: &[(LayoutId, taffy::Layout)]) -> bool {
        layouts.iter().all(|(id, layout)| {
            self.taffy
                .layout((*id).into())
                .is_ok_and(|now| now == layout)
        })
    }

    pub(crate) fn try_keep_retained(&mut self, keys: &[u64]) -> bool {
        let frame = self.retention.frame;
        let robbed = &self.retention.robbed_parents;
        let all_there = keys.iter().all(|key| {
            self.retention.retained.get(key).is_some_and(|node| {
                node.claimed_in_frame != frame && (robbed.is_empty() || !robbed.contains(&node.id))
            })
        });
        if all_there {
            self.keep_retained(keys);
            self.retention.stats.nodes_reused += keys.len() as u64;
        }
        all_there
    }

    /// Undoes [`Self::try_keep_retained`] for `keys`, so that the subtree can
    /// be laid out again after all this frame and claim its nodes itself.
    pub(crate) fn release_kept(&mut self, keys: &[u64]) {
        let retention = &mut self.retention;
        let frame = retention.frame;
        for key in keys {
            if let Some(node) = retention.retained.get_mut(key)
                && node.claimed_in_frame == frame
            {
                node.claimed_in_frame = frame.wrapping_sub(1);
                retention.claimed_this_frame -= 1;
                retention.stats.nodes_reused = retention.stats.nodes_reused.saturating_sub(1);
            }
        }
    }

    /// How many nodes allocated this frame are not retained. A subtree that
    /// allocated any cannot have its layout reused, since they go at the end
    /// of the frame.
    pub(crate) fn transient_count(&self) -> usize {
        self.retention.transient.len()
    }

    /// See [`LayoutRetention::layout_changes`] on the field.
    pub(crate) fn layout_changes(&self) -> u64 {
        self.retention.layout_changes
    }

    /// See [`LayoutRetention::remeasures`] on the field.
    pub(crate) fn remeasures(&self) -> u64 {
        self.retention.remeasures
    }

    /// Records a freshly allocated node under `key`, or as transient when there
    /// is no key to record it under.
    fn retain(&mut self, key: Option<u64>, id: LayoutId, measured: bool, style_fingerprint: u64) {
        let retention = &mut self.retention;
        let Some(key) = key else {
            retention.transient.push(id);
            return;
        };
        retention.retained.insert(
            key,
            RetainedNode {
                id,
                claimed_in_frame: retention.frame,
                measured,
                style_fingerprint,
                measurement: None,
                measure_log: None,
                lingers: retention.list_rows > 0,
            },
        );
        retention.claimed_this_frame += 1;
        if retention.open_key_recordings > 0 {
            retention.claimed_key_log.push(key);
        }
    }

    /// Brings a retained node's style up to date with `style`, converting and
    /// comparing it only when it is not the request the node was last given.
    fn apply_requested_style(
        &mut self,
        key: u64,
        id: LayoutId,
        style: &Style,
        rem_size: Pixels,
        scale_factor: f32,
    ) {
        let fingerprint = layout_fingerprint(style, rem_size, scale_factor);
        let node = self
            .retention
            .retained
            .get_mut(&key)
            .expect("a claimed key is always present");
        if node.style_fingerprint == fingerprint {
            self.retention.stats.style_compares += 1;
            // A field `layout_fingerprint` fails to read would leave the node
            // with a stale style whenever only that field changed, and nothing
            // would say so; debug builds compare in full to catch one.
            debug_assert!(
                self.retention
                    .unstretched_styles
                    .get(&id)
                    .unwrap_or_else(|| self.taffy.style(id.into()).expect(EXPECT_MESSAGE))
                    == &style.to_taffy(rem_size, scale_factor),
                "layout_fingerprint matched a style that converts differently; \
                 it has to read every field to_taffy does"
            );
            return;
        }
        node.style_fingerprint = fingerprint;
        self.apply_style(id, style.to_taffy(rem_size, scale_factor));
    }

    /// Writes `style` to a node, but only if it differs from what the node was
    /// last asked for.
    fn apply_style(&mut self, id: LayoutId, style: taffy::style::Style) {
        let retention = &mut self.retention;
        retention.stats.style_compares += 1;
        let previous = retention
            .unstretched_styles
            .get(&id)
            .unwrap_or_else(|| self.taffy.style(id.into()).expect(EXPECT_MESSAGE));
        if previous == &style {
            return;
        }
        // Taffy now holds exactly what was requested, so the stretched-style
        // bookkeeping no longer applies.
        retention.unstretched_styles.remove(&id);
        retention.stats.style_writes += 1;
        retention.layout_changes += 1;
        self.taffy
            .set_style(id.into(), style)
            .expect(EXPECT_MESSAGE);
    }

    /// Writes `children` to a retained node, but only if Taffy holds a
    /// different list. Comparing against Taffy rather than against the last
    /// request catches a child another node took since.
    fn apply_children(&mut self, id: LayoutId, children: &[LayoutId]) {
        let retention = &mut self.retention;
        if !retention.robbed_parents.is_empty() {
            retention.robbed_parents.remove(&id);
        }
        if self
            .taffy
            .child_ids(id.into())
            .eq(LayoutId::to_taffy_slice(children).iter().copied())
        {
            return;
        }
        retention.stats.children_writes += 1;
        retention.layout_changes += 1;
        self.set_children(id, children);
    }

    /// Gives `id` its `children`, noting each node a child is taken from in
    /// [`LayoutRetention::robbed_parents`].
    fn set_children(&mut self, id: LayoutId, children: &[LayoutId]) {
        for child in children {
            if let Some(parent) = self.taffy.parent((*child).into())
                && parent != id.into()
            {
                let parent = LayoutId::from(parent);
                #[cfg(debug_assertions)]
                self.report_double_parent(parent, *child);
                self.retention.robbed_parents.insert(parent);
            }
        }
        self.taffy
            // This is safe because LayoutId is repr(transparent) to taffy::tree::NodeId.
            .set_children(id.into(), LayoutId::to_taffy_slice(children))
            .expect(EXPECT_MESSAGE);
    }

    /// Reports, once, a child requested under two parents in the same frame.
    /// Each takes it from the other as it is requested, so both, and every
    /// node above them, are laid out again every frame.
    #[cfg(debug_assertions)]
    fn report_double_parent(&mut self, parent: LayoutId, child: LayoutId) {
        let retention = &mut self.retention;
        if retention.reported_double_parent {
            return;
        }
        let frame = retention.frame;
        if retention
            .retained
            .values()
            .any(|node| node.id == parent && node.claimed_in_frame == frame)
        {
            retention.reported_double_parent = true;
            log::warn!(
                "layout node {child:?} was given to two parents in one frame; \
                 an element is passing the same LayoutId as a child twice"
            );
        }
    }

    /// Adds a self-measuring leaf to the layout tree as
    /// [`request_retained_measured_layout`] does, but lets the element
    /// take over the measurement of the node retained under `key`, rather
    /// than have it taken again.
    ///
    /// The element measuring the node last frame left what it measured from,
    /// `state`, there; `adopt` is given this element's and that one, and takes
    /// the measurement over if it still stands, in which case the node is not
    /// dirtied, and keeps what Taffy cached for it and the nodes above it.
    /// When `adopt` finds the node's measurement stands as it is, the node
    /// keeps its closure and state too, and this element's `state` is dropped;
    /// otherwise the node is given this element's, to measure it from and to
    /// leave for the next frame's.
    ///
    /// When the measurement does not stand — a text element whose text
    /// changed — the node is still left clean if `measure` gives every size
    /// Taffy has taken from the node since it was last dirtied, under the
    /// same constraints: what Taffy cached for the node, and for the nodes
    /// above it, is then what measuring it afresh would produce. A price that
    /// ticks in a cell keeps its width, and the row, the list and the window
    /// around it are not laid out again. See [`MeasureLog`].
    ///
    /// Otherwise the node is measured afresh, and `forget` is first given
    /// `state` to drop what those measurements left in it: a measurement
    /// taken under the last element's constraints is not one Taffy asked this
    /// element for, and `measure` may answer later questions from it.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn request_retained_carried_measured_layout<S: 'static>(
        &mut self,
        key: Option<u64>,
        rem_size: Pixels,
        scale_factor: f32,
        state: S,
        adopt: impl FnOnce(&S, &dyn Any) -> Adopted,
        forget: impl FnOnce(&S),
        measure: impl Fn(
            &S,
            Size<Option<Pixels>>,
            Size<AvailableSpace>,
            &mut Window,
            &mut App,
        ) -> Size<Pixels>
        + 'static,
        window: &mut Window,
        cx: &mut App,
    ) -> LayoutId {
        // The leaf is laid out in the default style, whose fingerprint only
        // changes with the rem size and the scale factor.
        let style_fingerprint = match self.retention.default_fingerprint {
            Some((rem, scale, fingerprint)) if rem == rem_size && scale == scale_factor => {
                fingerprint
            }
            _ => {
                let fingerprint = layout_fingerprint(&Style::default(), rem_size, scale_factor);
                self.retention.default_fingerprint = Some((rem_size, scale_factor, fingerprint));
                fingerprint
            }
        };
        let frame = self.retention.frame;
        let reusable = key
            .and_then(|key| self.retention.retained.get(&key))
            .filter(|node| {
                node.claimed_in_frame != frame
                    && node.measured
                    && node.style_fingerprint == style_fingerprint
            })
            .map(|node| (node.measurement.clone(), node.measure_log.clone()));
        if let Some((previous, log)) = reusable {
            let adopted = previous.map_or(Adopted::No, |previous| adopt(&state, &*previous));
            let kept = if adopted != Adopted::No {
                self.retention.stats.measurements_kept += 1;
                true
            } else if let Some(log) = &log
                && log.replays(
                    &mut |known, available, window: &mut Window, cx: &mut App| {
                        measure(&state, known, available, window, cx)
                    },
                    &mut self.retention.stats,
                    window,
                    cx,
                )
            {
                self.retention.stats.measurements_replayed += 1;
                true
            } else {
                false
            };
            if kept
                && let Claim::Reused(key, id) = self.claim(key)
                && let Some(context) = self.taffy.get_node_context_mut(id.into())
            {
                if adopted == Adopted::Node {
                    return id;
                }
                let state = Rc::new(state);
                let memo: Rc<dyn Any> = state.clone();
                let log = log.unwrap_or_default();
                let measure = MeasureLog::logged(&log, move |known, available, window, cx| {
                    measure(&state, known, available, window, cx)
                });
                context.measure = measure;
                let node = self
                    .retention
                    .retained
                    .get_mut(&key)
                    .expect("a claimed key is always present");
                node.measurement = Some(memo);
                node.measure_log = Some(log);
                return id;
            }
            forget(&state);
        }

        let state = Rc::new(state);
        let memo: Rc<dyn Any> = state.clone();
        let measure = move |known, available, window: &mut Window, cx: &mut App| {
            measure(&state, known, available, window, cx)
        };
        let log = Rc::<MeasureLog>::default();
        let measure = MeasureLog::logged(&log, measure);
        // Measured afresh: what the last element measured was forgotten, and
        // measuring under its constraints again would put it back.
        let id = request_measured_node(
            self,
            key,
            &Style::default(),
            rem_size,
            scale_factor,
            measure,
            false,
        );
        if let Some(node) = key.and_then(|key| self.retention.retained.get_mut(&key))
            && node.id == id
        {
            node.measurement = Some(memo);
            node.measure_log = Some(log);
        }
        id
    }

    /// Lays out again the subtree under `id`, a node already placed by its
    /// parent this frame, within `available_space`, leaving it where its
    /// parent put it.
    ///
    /// Computing a layout from a node treats it as a root and moves it to the
    /// origin; its absolute position, worked out before, is put back so that
    /// the bounds of everything under it are found relative to it as before.
    ///
    /// A root is sized by its own style, so a node its parent stretched would
    /// shrink to its content. It is held at the size its parent gave it while
    /// it is laid out, and given back the style it asked for afterwards.
    pub(crate) fn relayout_in_place(
        &mut self,
        id: LayoutId,
        available_space: Size<AvailableSpace>,
        window: &mut Window,
        cx: &mut App,
    ) {
        let scale_factor = window.scale_factor();
        let bounds = self.layout_bounds(id, scale_factor);
        let origin = self
            .absolute_outer_origins
            .get(&id)
            .copied()
            .expect("layout_bounds caches the absolute origin");
        let requested = self.taffy.style(id.into()).expect(EXPECT_MESSAGE).clone();
        let given = self.taffy.layout(id.into()).expect(EXPECT_MESSAGE).size;
        let mut held = requested.clone();
        held.size = taffy::geometry::Size {
            width: taffy::style::Dimension::length(given.width),
            height: taffy::style::Dimension::length(given.height),
        };
        held.min_size = taffy::geometry::Size {
            width: taffy::style::LengthPercentageAuto::length(given.width),
            height: taffy::style::LengthPercentageAuto::length(given.height),
        };
        held.max_size = held.min_size;
        held.box_sizing = taffy::style::BoxSizing::BorderBox;
        self.taffy.set_style(id.into(), held).expect(EXPECT_MESSAGE);
        self.compute_layout(id, available_space, window, cx);
        self.taffy
            .set_style(id.into(), requested)
            .expect(EXPECT_MESSAGE);
        let stack = &mut self.layout_bounds_scratch_space;
        stack.push(id);
        while let Some(id) = stack.pop() {
            self.absolute_layout_bounds.remove(&id);
            self.absolute_outer_origins.remove(&id);
            stack.extend(
                self.taffy
                    .children(id.into())
                    .expect(EXPECT_MESSAGE)
                    .into_iter()
                    .map(LayoutId::from),
            );
        }
        self.absolute_outer_origins.insert(id, origin);
        self.absolute_layout_bounds.insert(id, bounds);
    }
}

/// Ends the frame for the retained nodes: releases nodes that no longer
/// appear in the element tree. See [`TaffyLayoutEngine::clear`].
///
/// Nodes that were claimed this frame stay, along with their Taffy layout
/// caches, which is what lets the next frame skip recomputing the parts of
/// the tree that did not change.
#[inline]
pub(crate) fn release_unclaimed_nodes(engine: &mut TaffyLayoutEngine) {
    // A measured node left clean but not laid out this frame is measured
    // afresh the next time it is.
    for (id, _) in mem::take(&mut engine.retention.pending_replays) {
        let _ = engine.taffy.mark_dirty(id.into());
    }
    let retention = &mut engine.retention;
    retention.stats.frames += 1;

    for id in retention.transient.drain(..) {
        retention.unstretched_styles.remove(&id);
        if !retention.robbed_parents.is_empty() {
            retention.robbed_parents.remove(&id);
        }
        remove_node(&mut engine.taffy, id);
        retention.stats.nodes_freed += 1;
    }

    // In a steady frame every retained node was claimed, and there is
    // nothing to sweep.
    if retention.retained.len() != retention.claimed_this_frame {
        let frame = retention.frame;
        let taffy = &mut engine.taffy;
        let unstretched_styles = &mut retention.unstretched_styles;
        let robbed_parents = &mut retention.robbed_parents;
        let freed = &mut retention.stats.nodes_freed;
        retention.retained.retain(|_, node| {
            if node.claimed_in_frame == frame
                || node.lingers && frame - node.claimed_in_frame < LIST_ROW_NODE_LINGER_FRAMES
            {
                return true;
            }
            unstretched_styles.remove(&node.id);
            robbed_parents.remove(&node.id);
            remove_node(taffy, node.id);
            *freed += 1;
            false
        });
    }

    retention.claimed_this_frame = 0;
    retention.frame += 1;
}

/// [`Window::request_layout`] for a style the caller keeps, and children it
/// holds in a slice: neither is copied on the way to the layout engine, where
/// the window's method takes a style of 600-odd bytes by value, and copies it
/// at every call it passes through.
#[inline]
pub(crate) fn request_layout(
    window: &mut Window,
    style: &Style,
    children: &[LayoutId],
) -> LayoutId {
    window.invalidator.debug_assert_prepaint();
    let rem_size = window.rem_size();
    let scale_factor = window.scale_factor();
    let key = crate::fast::layout_key::layout_key(window);
    request_retained_layout(
        window.layout_engine.as_mut().unwrap(),
        key,
        style,
        rem_size,
        scale_factor,
        children,
    )
}

/// Adds a node to the layout tree, reusing the one retained under `key`
/// when there is one. See [`TaffyLayoutEngine::request_layout`].
///
/// `key` identifies this element's position in the element tree across
/// frames; `None` opts out of reuse, and the node is released at the end of
/// the frame.
#[inline]
pub(crate) fn request_retained_layout(
    engine: &mut TaffyLayoutEngine,
    key: Option<u64>,
    style: &Style,
    rem_size: Pixels,
    scale_factor: f32,
    children: &[LayoutId],
) -> LayoutId {
    let key = match engine.claim(key) {
        Claim::Reused(key, id) => {
            engine.apply_requested_style(key, id, style, rem_size, scale_factor);
            engine.apply_children(id, children);
            // A node that measured itself on an earlier frame no longer does.
            if engine
                .retention
                .retained
                .get(&key)
                .is_some_and(|node| node.measured)
            {
                let node = engine
                    .retention
                    .retained
                    .get_mut(&key)
                    .expect("a claimed key is always present");
                node.measured = false;
                node.measurement = None;
                node.measure_log = None;
                engine
                    .taffy
                    .set_node_context(id.into(), None)
                    .expect(EXPECT_MESSAGE);
            }
            return id;
        }
        Claim::Vacant(key) => Some(key),
        Claim::Unkeyed => None,
    };

    engine.retention.stats.nodes_created += 1;
    engine.retention.layout_changes += 1;
    let style_fingerprint = layout_fingerprint(style, rem_size, scale_factor);
    let taffy_style = style.to_taffy(rem_size, scale_factor);
    let id: LayoutId = engine
        .taffy
        .new_leaf(taffy_style)
        .expect(EXPECT_MESSAGE)
        .into();
    if !children.is_empty() {
        // A retained child can arrive here still listed under the parent
        // it had last frame. `new_with_children` would leave it listed
        // there, so when that parent's children were next rewritten the
        // child would lose its parent link, and with it the offset
        // `layout_bounds` adds up from its ancestors. `set_children`
        // detaches each child from wherever it was first.
        engine.set_children(id, children);
    }
    engine.retain(key, id, false, style_fingerprint);
    id
}

/// Adds a engine-measuring leaf to the layout tree, reusing the node retained
/// under `key` when there is one. See
/// [`TaffyLayoutEngine::request_measured_layout`].
///
/// Nothing says what the measurement depends on, so a reused node is given
/// the new closure, and `measure` is guaranteed to run: before the node is
/// laid out, under every constraint Taffy measured the node under since it
/// was last dirtied, when its [`MeasureLog`] holds them all, and the node is
/// dirtied only if a size comes out different (see
/// [`replay_pending_measures`]); as Taffy lays it out otherwise.
#[inline]
pub(crate) fn request_retained_measured_layout(
    engine: &mut TaffyLayoutEngine,
    key: Option<u64>,
    style: &Style,
    rem_size: Pixels,
    scale_factor: f32,
    measure: impl FnMut(
        Size<Option<Pixels>>,
        Size<AvailableSpace>,
        &mut Window,
        &mut App,
    ) -> Size<Pixels>
    + 'static,
) -> LayoutId {
    request_measured_node(engine, key, style, rem_size, scale_factor, measure, true)
}

/// [`request_retained_measured_layout`], checking a reused node's new closure
/// against its [`MeasureLog`] only when `replay`.
fn request_measured_node(
    engine: &mut TaffyLayoutEngine,
    key: Option<u64>,
    style: &Style,
    rem_size: Pixels,
    scale_factor: f32,
    measure: impl FnMut(
        Size<Option<Pixels>>,
        Size<AvailableSpace>,
        &mut Window,
        &mut App,
    ) -> Size<Pixels>
    + 'static,
    replay: bool,
) -> LayoutId {
    engine.retention.stats.measure_rebinds += 1;
    // What the node measured since it was last dirtied, if it can vouch for
    // it: the new closure is then checked against it before the node is laid
    // out, rather than the node dirtied now.
    let vouching = match &key {
        Some(key) if replay => engine
            .retention
            .retained
            .get(key)
            .and_then(|node| node.measure_log.clone())
            .filter(|log| log.vouches()),
        _ => None,
    };
    let log = vouching.clone().unwrap_or_default();
    let measure = MeasureLog::logged(&log, measure);

    let (key, id) = match engine.claim(key) {
        Claim::Reused(key, id) => (key, id),
        claim => {
            let key = match claim {
                Claim::Vacant(key) => Some(key),
                _ => None,
            };
            let style_fingerprint = layout_fingerprint(style, rem_size, scale_factor);
            let taffy_style = style.to_taffy(rem_size, scale_factor);
            engine.retention.stats.nodes_created += 1;
            engine.retention.layout_changes += 1;
            let id: LayoutId = engine
                .taffy
                .new_leaf_with_context(taffy_style, NodeContext { measure })
                .expect(EXPECT_MESSAGE)
                .into();
            engine.retain(key, id, true, style_fingerprint);
            if let Some(node) = key.and_then(|key| engine.retention.retained.get_mut(&key))
                && node.id == id
            {
                node.measure_log = Some(log);
            }
            return id;
        }
    };

    engine.apply_requested_style(key, id, style, rem_size, scale_factor);
    engine.apply_children(id, &[]);

    // Nothing says whether the measurement still stands, and what it
    // produces lives in state the element made afresh this frame, so it
    // has to be taken again: before the node is laid out, against what it
    // measured before, when that is known, or as Taffy lays it out.
    engine.retention.remeasures += 1;
    if let Some(context) = engine.taffy.get_node_context_mut(id.into()) {
        context.measure = measure;
    } else {
        engine
            .taffy
            .set_node_context(id.into(), Some(NodeContext { measure }))
            .expect(EXPECT_MESSAGE);
    }
    match vouching {
        Some(log) => engine.retention.pending_replays.push((id, log)),
        None => engine.taffy.mark_dirty(id.into()).expect(EXPECT_MESSAGE),
    }
    let node = engine
        .retention
        .retained
        .get_mut(&key)
        .expect("a claimed key is always present");
    node.measured = true;
    node.measurement = None;
    node.measure_log = Some(log);

    id
}

/// Measures, with the closures they were given this frame, the measured
/// nodes [`request_retained_measured_layout`] left clean, under every
/// constraint their [`MeasureLog`] holds, dirtying those whose size came out
/// different under any of them. Called before a layout is computed, as the
/// closures need the window to measure.
///
/// A node every one of whose sizes stands keeps what Taffy cached for it and
/// for the nodes above it: a list row whose text is laid out again, as it is
/// on every frame the row is built, is not laid out afresh. The measurements
/// are taken in the order they were last taken, so what the element keeps of
/// them is what the last one left, as it would be had Taffy taken them.
pub(crate) fn replay_pending_measures(
    engine: &mut TaffyLayoutEngine,
    window: &mut Window,
    cx: &mut App,
) {
    if engine.retention.pending_replays.is_empty() {
        return;
    }
    let pending = mem::take(&mut engine.retention.pending_replays);
    for (id, log) in &pending {
        let entries = log.entries.borrow().clone();
        let Some(context) = engine.taffy.get_node_context_mut((*id).into()) else {
            continue;
        };
        let stands = entries.iter().all(|(known, available, size)| {
            engine.retention.stats.measure_calls += 1;
            (context.measure)(*known, *available, window, cx) == *size
        });
        if stands {
            engine.retention.stats.measurements_replayed += 1;
            // What the element keeps is what the last measurement left; the
            // node is measured again at the width it is laid out at, should
            // that be another, once the layout is computed.
            if let Some((known, available, _)) = entries.last() {
                engine
                    .retention
                    .measured_leaves
                    .note((*id).into(), *known, *available);
            }
        } else {
            engine.retention.layout_changes += 1;
            engine.taffy.mark_dirty((*id).into()).expect(EXPECT_MESSAGE);
        }
    }
    engine.retention.pending_replays = pending;
    engine.retention.pending_replays.clear();
}

/// Runs `f`, laying out a list row: the nodes it claims linger. See
/// [`RetainedNode::lingers`].
pub(crate) fn laying_out_list_row<R>(window: &mut Window, f: impl FnOnce(&mut Window) -> R) -> R {
    window.layout_engine.as_mut().unwrap().retention.list_rows += 1;
    let result = f(window);
    window.layout_engine.as_mut().unwrap().retention.list_rows -= 1;
    result
}

/// Treats any `auto` dimension of the given node's style as filling `size`.
/// See [`TaffyLayoutEngine::stretch_auto_size_to_fill`].
///
/// The style Taffy ends up holding is not the one the element asked for, and
/// the difference is not recoverable from the result — a stretched `auto`
/// looks exactly like an explicit length. The requested style is therefore
/// kept aside so the next frame compares like with like instead of
/// rewriting, and dirtying, the root on every frame.
#[inline]
pub(crate) fn stretch_retained_auto_size_to_fill(
    engine: &mut TaffyLayoutEngine,
    id: LayoutId,
    size: Size<Pixels>,
    scale_factor: f32,
) {
    let retention = &mut engine.retention;
    let requested = match retention.unstretched_styles.get(&id) {
        Some(requested) => requested,
        None => engine.taffy.style(id.into()).expect(EXPECT_MESSAGE),
    };
    let stretch_width = requested.size.width.is_auto();
    let stretch_height = requested.size.height.is_auto();
    if !stretch_width && !stretch_height {
        return;
    }

    let requested = requested.clone();
    let mut style = requested.clone();
    if stretch_width {
        style.size.width =
            taffy::style::Dimension::length(round_to_device_pixel(size.width.0, scale_factor));
    }
    if stretch_height {
        style.size.height =
            taffy::style::Dimension::length(round_to_device_pixel(size.height.0, scale_factor));
    }
    if engine.taffy.style(id.into()).expect(EXPECT_MESSAGE) != &style {
        retention.stats.style_writes += 1;
        engine
            .taffy
            .set_style(id.into(), style)
            .expect(EXPECT_MESSAGE);
    }
    retention.unstretched_styles.insert(id, requested);
}

/// A hash of everything in `style` that its conversion to a Taffy style reads,
/// and of what that conversion resolves lengths against.
///
/// It has to read exactly the fields [`ToTaffy`](crate::taffy::ToTaffy) does:
/// a field it misses leaves a retained node with a stale style whenever only
/// that field changes. Debug builds check every match against a full conversion.
fn layout_fingerprint(style: &Style, rem_size: Pixels, scale_factor: f32) -> u64 {
    fn absolute(hasher: &mut FxHasher, length: &AbsoluteLength) {
        match length {
            AbsoluteLength::Pixels(pixels) => (0u8, pixels.0.to_bits()).hash(hasher),
            AbsoluteLength::Rems(rems) => (1u8, rems.0.to_bits()).hash(hasher),
        }
    }
    fn definite(hasher: &mut FxHasher, length: &DefiniteLength) {
        match length {
            DefiniteLength::Absolute(length) => {
                0u8.hash(hasher);
                absolute(hasher, length);
            }
            DefiniteLength::Fraction(fraction) => (1u8, fraction.to_bits()).hash(hasher),
        }
    }
    fn length(hasher: &mut FxHasher, length: &Length) {
        match length {
            Length::Definite(length) => {
                0u8.hash(hasher);
                definite(hasher, length);
            }
            Length::Auto => 1u8.hash(hasher),
        }
    }
    fn edges<T: Clone + Debug + Default + PartialEq>(
        hasher: &mut FxHasher,
        edges: &Edges<T>,
        each: fn(&mut FxHasher, &T),
    ) {
        each(hasher, &edges.top);
        each(hasher, &edges.right);
        each(hasher, &edges.bottom);
        each(hasher, &edges.left);
    }
    fn sizes<T: Clone + Debug + Default + PartialEq>(
        hasher: &mut FxHasher,
        size: &Size<T>,
        each: fn(&mut FxHasher, &T),
    ) {
        each(hasher, &size.width);
        each(hasher, &size.height);
    }
    fn placement(hasher: &mut FxHasher, placement: &crate::GridPlacement) {
        match placement {
            crate::GridPlacement::Line(line) => (0u8, *line).hash(hasher),
            crate::GridPlacement::Span(span) => (1u8, *span).hash(hasher),
            crate::GridPlacement::Auto => 2u8.hash(hasher),
        }
    }
    fn template(hasher: &mut FxHasher, template: &Option<GridTemplate>) {
        match template {
            Some(template) => {
                (1u8, template.repeat).hash(hasher);
                mem::discriminant(&template.min_size).hash(hasher);
            }
            None => 0u8.hash(hasher),
        }
    }

    let mut hasher = FxHasher::default();
    let hasher = &mut hasher;
    rem_size.0.to_bits().hash(hasher);
    scale_factor.to_bits().hash(hasher);

    mem::discriminant(&style.display).hash(hasher);
    mem::discriminant(&style.overflow.x).hash(hasher);
    mem::discriminant(&style.overflow.y).hash(hasher);
    absolute(hasher, &style.scrollbar_width);
    mem::discriminant(&style.position).hash(hasher);
    edges(hasher, &style.inset, length);
    sizes(hasher, &style.size, length);
    sizes(hasher, &style.min_size, length);
    sizes(hasher, &style.max_size, length);
    style.aspect_ratio.map(f32::to_bits).hash(hasher);
    edges(hasher, &style.margin, length);
    edges(hasher, &style.padding, definite);
    edges(hasher, &style.border_widths, absolute);
    style
        .align_items
        .map(|x| mem::discriminant(&x))
        .hash(hasher);
    style.align_self.map(|x| mem::discriminant(&x)).hash(hasher);
    style
        .align_content
        .map(|x| mem::discriminant(&x))
        .hash(hasher);
    style
        .justify_content
        .map(|x| mem::discriminant(&x))
        .hash(hasher);
    sizes(hasher, &style.gap, definite);
    mem::discriminant(&style.flex_direction).hash(hasher);
    mem::discriminant(&style.flex_wrap).hash(hasher);
    length(hasher, &style.flex_basis);
    style.flex_grow.to_bits().hash(hasher);
    style.flex_shrink.to_bits().hash(hasher);
    template(hasher, &style.grid_rows);
    template(hasher, &style.grid_cols);
    match &style.grid_location {
        Some(location) => {
            1u8.hash(hasher);
            for line in [&location.row, &location.column] {
                placement(hasher, &line.start);
                placement(hasher, &line.end);
            }
        }
        None => 0u8.hash(hasher),
    }
    hasher.finish()
}
