//! Subtrees drawn again from what they drew on the last frame.
//!
//! Views and cached views are retained subtrees. Each one drawn in a
//! frame leaves a record there: where its hitboxes, dispatch nodes, listeners
//! and primitives went, what it read while it was built, the hovers it was
//! painted by and the layout nodes it holds. On the next frame, a subtree
//! whose record says nothing it depends on has changed is drawn again by
//! copying those stretches of the last frame instead of building, laying out,
//! prepainting and painting it.
//!
//! The records live in the frame rather than in element state because the
//! stretches they point to belong to one frame. A subtree drawn again from
//! last frame is not visited, so the records of subtrees nested in it would
//! otherwise keep pointing into the frame they were last visited in. Instead,
//! drawing a subtree again copies its record and the records nested in it,
//! shifted to where the copy landed, so that any of them can be drawn again
//! on its own later, when what is around it has to be built.

use crate::collections::{FxHashMap, FxHashSet};
use crate::fast::dependencies::{DependencyRecording, RecordedDependencies, RenderDependencies};
use crate::fast::splice::{Prebuilt, Rebuild, Splice, SplicedPrepaint};
use crate::refineable::Refineable;
use crate::window::{PaintIndex, PrepaintStateIndex};
use crate::{
    AnyElement, App, AvailableSpace, Bounds, ContentMask, ElementId, EntityId, GlobalElementId,
    HitboxId, LayoutId, Pixels, PlatformInputHandler, Size, Style, TextStyle, View, ViewElement,
    Window,
};
use smallvec::SmallVec;
use std::{any::TypeId, cell::RefCell, mem, ops::Range, rc::Rc};

/// Starts drawing a window's roots: its phase timing, and the views marked
/// dirty for what they read. See [`Window::mark_changed_retained_views_dirty`].
#[inline(always)]
pub(crate) fn begin_frame(window: &mut Window, cx: &App) {
    window.fast_layout.phase_times.begin();
    window.mark_changed_retained_views_dirty(cx);
}

/// Forwarded to by `Window::draw` as it hands the platform this frame's input
/// handler.
pub(crate) fn note_installed_input_handler(window: &mut Window, handler: &PlatformInputHandler) {
    window.retained_state.installed_input_focus = Some(handler.focus_id());
}

/// Forwarded to by `Window::draw` as it takes back the input handler it gave
/// the platform. A view drawn again from last frame hands the platform that
/// handler again, which is only right if it is the one GPUI gave it: when
/// the platform hands back another, nothing is drawn again from last frame,
/// so the views that paint input handlers paint them anew.
pub(crate) fn note_restored_input_handler(window: &mut Window, handler: &PlatformInputHandler) {
    if window.retained_state.installed_input_focus != Some(handler.focus_id()) {
        window.refreshing = true;
    }
}

/// The retained subtrees being prepainted right now, for something deferred
/// from them to be counted as theirs.
#[inline(always)]
pub(crate) fn enclosing_retained(window: &Window) -> EnclosingRetained {
    window.next_frame.retained.open_records()
}

/// The retained subtrees drawn in one frame, in the order they began
/// prepainting, which puts a subtree's nested subtrees right after it.
#[derive(Default)]
pub(crate) struct RetainedSubtrees {
    pub(crate) records: Vec<RetainedSubtree>,
    pub(crate) by_id: FxHashMap<GlobalElementId, usize>,
    /// The records whose prepaint is under way, innermost last.
    pub(crate) open: Vec<usize>,
    pub(crate) reused_any: bool,
}

pub(crate) struct RetainedSubtree {
    pub(crate) id: GlobalElementId,
    pub(crate) prepaint_range: Range<PrepaintStateIndex>,
    pub(crate) paint_range: Range<PaintIndex>,
    pub(crate) paint: PaintStatus,
    /// How many of the records following this one are nested inside it.
    pub(crate) nested: usize,
    pub(crate) context: Rc<RetainedContext>,
    /// Everything the subtree read, the subtrees nested in it included.
    pub(crate) dependencies: RenderDependencies,
    /// What the subtree read itself, outside the subtrees nested in it. While
    /// none of it changed, the subtree can be drawn again around nested
    /// subtrees that are built again. See [`crate::fast::splice`].
    pub(crate) own_dependencies: RenderDependencies,
    /// The scroll offsets the subtree's render read itself, outside nested
    /// subtrees, when it was rendered: unlike offsets read while it was
    /// prepainted or painted, they shape the elements it built, a scroll
    /// container's content included. `None` when it was laid out without
    /// being rendered. See [`crate::fast::layers::invalidate`].
    /// What the subtree's view read itself while its `render` ran, before
    /// the elements it built were laid out: unlike what they read as they
    /// are laid out, prepainted or painted, it shapes the closures its render
    /// handed its elements, such as a list's row renderer. `None` when the
    /// view was not rendered.
    pub(crate) render_dependencies: Option<RenderDependencies>,
    /// The hovers the subtree was painted by, nested subtrees included.
    pub(crate) hover_dependencies: Rc<[(HitboxId, bool)]>,
    /// The hovers it was painted by itself, outside nested subtrees.
    pub(crate) own_hovers: Rc<[(HitboxId, bool)]>,
    /// The layout nodes the subtree claimed while it was prepainted, list
    /// items for instance, kept while it is drawn again so that building it
    /// again finds them.
    pub(crate) layout_keys: Rc<[u64]>,
    pub(crate) layout: Option<Rc<RetainedLayout>>,
    /// How to build this subtree again on its own, where it was, when the
    /// subtree around it is drawn from last frame.
    pub(crate) rebuild: Option<Rc<Rebuild>>,
}

impl RetainedSubtree {
    /// Whether the subtree is a cached view ([`crate::Entity::cached`]).
    pub(crate) fn is_cached(&self) -> bool {
        self.rebuild
            .as_ref()
            .is_some_and(|rebuild| rebuild.is_cached())
    }
}

pub(crate) enum PaintStatus {
    /// Not painted, so `paint_range` means nothing.
    Unpainted,
    /// Painted this frame into `paint_range`. When that was drawn from last
    /// frame, `source` is where it started there, for the records copied
    /// along with it to shift their own ranges by.
    Painted { source: Option<PaintIndex> },
    /// Copied along with the subtree at `anchor` and still holding last
    /// frame's `paint_range`, which is shifted once that one is painted.
    Pending { anchor: usize },
}

/// What a subtree's prepaint and paint depended on besides what it read: the
/// place it was drawn in and what it inherited there.
#[derive(Clone, PartialEq)]
pub(crate) struct RetainedContext {
    pub(crate) bounds: Bounds<Pixels>,
    pub(crate) content_mask: ContentMask<Pixels>,
    pub(crate) text_style: TextStyle,
    pub(crate) opacity: f32,
}

/// What it takes to lay a view out as it was laid out last frame without
/// building it: the view is laid out by its content, so its layout is only
/// known from the nodes its content left.
pub(crate) struct RetainedLayout {
    /// The node its content is laid out at.
    pub(crate) root: LayoutId,
    /// Every node its content claimed while its layout was requested.
    pub(crate) keys: Vec<u64>,
    /// The element states its content used while its layout was requested,
    /// kept for as long as it is not built.
    pub(crate) element_states: Vec<(GlobalElementId, TypeId)>,
    pub(crate) text_style: TextStyle,
    pub(crate) rem_size: Pixels,
    /// The layout key of the element the view hangs off, which keys the
    /// view's own node, when it was laid out in the request-layout walk.
    pub(crate) parent_layout_key: Option<u64>,
}

/// A layout request being recorded as a [`RetainedLayout`].
pub(crate) struct RetainedLayoutRecording {
    keys: usize,
    transient: usize,
    element_states: usize,
    dependencies: DependencyRecording,
    text_style: TextStyle,
    rem_size: Pixels,
    parent_layout_key: Option<u64>,
    /// What the view read while its `render` ran. See
    /// [`RetainedLayoutRecording::rendered`].
    render: Option<RenderDependencies>,
}

impl RetainedLayoutRecording {
    /// Notes that the view whose layout request this records has rendered,
    /// before the elements it built are laid out.
    pub(crate) fn rendered(&mut self, cx: &mut App) {
        self.render = Some(cx.dependencies_so_far(&self.dependencies));
    }
}

impl RetainedRecording {
    /// What the view this records the prepaint of read while its `render`
    /// ran, taken as `render` returns.
    pub(crate) fn rendered(&self, cx: &mut App) -> RenderDependencies {
        cx.dependencies_so_far(&self.dependencies)
    }
}

/// A retained subtree being prepainted. See [`Window::begin_retained`].
pub(crate) struct RetainedRecording {
    index: Option<usize>,
    dependencies: DependencyRecording,
    layout_keys: usize,
}

/// A retained subtree being painted. See [`Window::begin_retained_paint`].
pub(crate) struct RetainedPaintRecording {
    index: Option<usize>,
    start: PaintIndex,
    hovers_start: usize,
    dependencies: DependencyRecording,
}

/// A retained subtree whose paint is under way: where its hovers start, and
/// the stretches of them its nested subtrees added.
pub(crate) struct OpenPaint {
    pub(crate) nested: Vec<Range<usize>>,
}

/// A window's state for drawing retained subtrees again, besides the records
/// its frames hold.
pub(crate) struct RetainedState {
    /// The retained subtrees being built or painted, innermost last. An
    /// interaction inside one, a hover or a scroll, marks all of them to be
    /// built again.
    pub(crate) subtree_stack: Vec<GlobalElementId>,
    /// Reusable subtrees that an interaction inside them changed since they
    /// were drawn.
    pub(crate) dirty_subtrees: FxHashSet<GlobalElementId>,
    /// Reusable subtrees found out of date too late in a frame to build them
    /// again, which become [`RetainedState::dirty_subtrees`] for the next one.
    pub(crate) subtrees_dirty_next_frame: FxHashSet<GlobalElementId>,
    /// Whether each hitbox whose hover a retained subtree was painted by was
    /// hovered then, in painting order. A subtree keeps the stretch it
    /// added and is built again once any of them is hovered differently.
    pub(crate) hover_dependencies: Vec<(HitboxId, bool)>,
    /// Hovers read through [`HitboxId::is_hovered`], which only has the window
    /// to read, since `hover_dependencies` last took them in. See
    /// [`note_hover_read`].
    pub(crate) hover_reads: RefCell<Vec<(HitboxId, bool)>>,
    /// For each retained subtree being painted, innermost last, the stretches
    /// of `hover_dependencies` its nested subtrees added.
    pub(crate) open_paints: Vec<OpenPaint>,
    /// Views built for a splice that did not happen, for their elements to
    /// take over. See [`Window::take_prebuilt`].
    pub(crate) prebuilt: FxHashMap<GlobalElementId, crate::fast::splice::PrebuiltGap>,
    /// Every entity notified since the last frame was drawn, views or not. A
    /// retained subtree that read any of them is built again.
    pub(crate) notified_entities: FxHashSet<EntityId>,
    /// Whether a view that was not notified since the last frame, and read
    /// nothing that was, is drawn again from what it drew then. See
    /// [`Window::set_view_retention`].
    pub(crate) view_retention: bool,
    /// Records reads of the pointer and modifier keys while views are drawn.
    pub(crate) ambient_reads: crate::fast::dependencies::AmbientReads,
    /// Room to sort out the layout keys a spliced view keeps, kept from one
    /// splice to the next. See [`crate::fast::splice`].
    pub(crate) splice_keys: FxHashSet<u64>,
    /// Where in the write generation each view rendered this frame began to
    /// render: what it writes from then on is part of building it, not a
    /// change of what it read. See [`note_rendering`].
    pub(crate) rendering_since: FxHashMap<EntityId, u64>,
    /// The writes each view rendered this frame made in its `render` the
    /// last time it ran, `start..end` in the write generation: what it
    /// handed the elements it built, rather than what they wrote as they
    /// were laid out. See [`note_rendered`].
    pub(crate) render_writes: FxHashMap<EntityId, Range<u64>>,
    /// The focus of the input handler last given to the platform window, if
    /// one was. See [`note_restored_input_handler`].
    pub(crate) installed_input_focus: Option<Option<crate::FocusId>>,
}

impl RetainedState {
    pub(crate) fn new(cx: &App) -> Self {
        RetainedState {
            ambient_reads: cx.ambient_reads(),
            subtree_stack: Vec::new(),
            dirty_subtrees: FxHashSet::default(),
            subtrees_dirty_next_frame: FxHashSet::default(),
            hover_dependencies: Vec::new(),
            hover_reads: RefCell::new(Vec::new()),
            open_paints: Vec::new(),
            prebuilt: FxHashMap::default(),
            notified_entities: FxHashSet::default(),
            view_retention: std::env::var("GPUI_VIEW_RETENTION").map_or(true, |value| value != "0"),
            splice_keys: FxHashSet::default(),
            rendering_since: FxHashMap::default(),
            render_writes: FxHashMap::default(),
            installed_input_focus: None,
        }
    }

    /// Notes the entities notified since the last frame was drawn, replacing
    /// those noted then.
    pub(crate) fn note_notified(&mut self, entities: &FxHashSet<EntityId>) {
        self.notified_entities.clear();
        self.notified_entities.extend(entities.iter().copied());
    }
}

/// The retained subtrees, as indices into this frame's records, that were
/// being drawn when something was deferred. What drawing it reads and the
/// hovers it is painted by are theirs too, though it is drawn after them.
#[derive(Clone, Default)]
pub(crate) struct EnclosingRetained(SmallVec<[usize; 4]>);

/// Something deferred from retained subtrees being drawn. See
/// [`begin_deferred_prepaint`].
pub(crate) struct DeferredRetainedRecording {
    enclosing: EnclosingRetained,
    dependencies: DependencyRecording,
    /// Where the hovers it is painted by start, when it is being painted.
    hovers_start: Option<usize>,
}

impl PrepaintStateIndex {
    /// This index, taken from a range that started at `from`, as it falls in
    /// a copy of that range starting at `to`.
    pub(crate) fn shifted(&self, from: &Self, to: &Self) -> Self {
        PrepaintStateIndex {
            hitboxes_index: self.hitboxes_index - from.hitboxes_index + to.hitboxes_index,
            tooltips_index: self.tooltips_index - from.tooltips_index + to.tooltips_index,
            deferred_draws_index: self.deferred_draws_index - from.deferred_draws_index
                + to.deferred_draws_index,
            dispatch_tree_index: self.dispatch_tree_index - from.dispatch_tree_index
                + to.dispatch_tree_index,
            accessed_element_states_index: self.accessed_element_states_index
                - from.accessed_element_states_index
                + to.accessed_element_states_index,
            line_layout_index: self
                .line_layout_index
                .shifted(&from.line_layout_index, &to.line_layout_index),
        }
    }
}

/// Whether two indices stand at the same place in each of a frame's lists.
impl PartialEq for PrepaintStateIndex {
    fn eq(&self, other: &Self) -> bool {
        // Destructured, so that a field upstream adds can't be missed here.
        let PrepaintStateIndex {
            hitboxes_index,
            tooltips_index,
            deferred_draws_index,
            dispatch_tree_index,
            accessed_element_states_index,
            line_layout_index,
        } = self;
        *hitboxes_index == other.hitboxes_index
            && *tooltips_index == other.tooltips_index
            && *deferred_draws_index == other.deferred_draws_index
            && *dispatch_tree_index == other.dispatch_tree_index
            && *accessed_element_states_index == other.accessed_element_states_index
            && *line_layout_index == other.line_layout_index
    }
}

/// Whether two indices stand at the same place in each of a frame's lists.
impl PartialEq for PaintIndex {
    fn eq(&self, other: &Self) -> bool {
        let PaintIndex {
            scene_index,
            #[cfg(any(test, feature = "harness"))]
            debug_bounds_index,
            fast,
            mouse_listeners_index,
            input_handlers_index,
            cursor_styles_index,
            accessed_element_states_index,
            tab_handle_index,
            line_layout_index,
        } = self;
        *fast == other.fast
            && *scene_index == other.scene_index
            && *mouse_listeners_index == other.mouse_listeners_index
            && *input_handlers_index == other.input_handlers_index
            && *cursor_styles_index == other.cursor_styles_index
            && *accessed_element_states_index == other.accessed_element_states_index
            && *tab_handle_index == other.tab_handle_index
            && *line_layout_index == other.line_layout_index
            && {
                #[cfg(any(test, feature = "harness"))]
                let same = *debug_bounds_index == other.debug_bounds_index;
                #[cfg(not(any(test, feature = "harness")))]
                let same = true;
                same
            }
    }
}

impl PaintIndex {
    /// See [`PrepaintStateIndex::shifted`].
    pub(crate) fn shifted(&self, from: &Self, to: &Self) -> Self {
        PaintIndex {
            scene_index: self.scene_index - from.scene_index + to.scene_index,
            #[cfg(any(test, feature = "harness"))]
            debug_bounds_index: self.debug_bounds_index - from.debug_bounds_index
                + to.debug_bounds_index,
            fast: FastPaintIndex {
                window_control_hitboxes: self.fast.window_control_hitboxes
                    - from.fast.window_control_hitboxes
                    + to.fast.window_control_hitboxes,
            },
            mouse_listeners_index: self.mouse_listeners_index - from.mouse_listeners_index
                + to.mouse_listeners_index,
            input_handlers_index: self.input_handlers_index - from.input_handlers_index
                + to.input_handlers_index,
            cursor_styles_index: self.cursor_styles_index - from.cursor_styles_index
                + to.cursor_styles_index,
            accessed_element_states_index: self.accessed_element_states_index
                - from.accessed_element_states_index
                + to.accessed_element_states_index,
            tab_handle_index: self.tab_handle_index - from.tab_handle_index + to.tab_handle_index,
            line_layout_index: self
                .line_layout_index
                .shifted(&from.line_layout_index, &to.line_layout_index),
        }
    }
}

impl RetainedSubtrees {
    pub(crate) fn clear(&mut self) {
        self.records.clear();
        self.by_id.clear();
        self.open.clear();
        self.reused_any = false;
    }

    /// Whether any subtree was drawn from last frame.

    /// The painted record `id` left, if any.
    pub(crate) fn find(&self, id: &GlobalElementId) -> Option<usize> {
        let index = *self.by_id.get(id)?;
        matches!(self.records[index].paint, PaintStatus::Painted { .. }).then_some(index)
    }

    pub(crate) fn id(&self, index: usize) -> &GlobalElementId {
        &self.records[index].id
    }

    /// The records being prepainted right now, for something deferred from
    /// them to be counted as theirs.
    pub(crate) fn open_records(&self) -> EnclosingRetained {
        EnclosingRetained(self.open.iter().copied().collect())
    }

    /// Adds what was read while something deferred from `records`, innermost
    /// last, was drawn. It is the innermost one's own reading.
    pub(crate) fn add_dependencies(
        &mut self,
        records: &[usize],
        all: &RenderDependencies,
        own: &RenderDependencies,
    ) {
        for &index in records {
            let record = &mut self.records[index];
            record.dependencies = record.dependencies.union(all);
        }
        if let Some(&innermost) = records.last() {
            let record = &mut self.records[innermost];
            record.own_dependencies = record.own_dependencies.union(own);
        }
    }

    /// Adds the hovers something deferred from `records`, innermost last, was
    /// painted by.
    pub(crate) fn add_hover_dependencies(
        &mut self,
        records: &[usize],
        hovers: &[(HitboxId, bool)],
    ) {
        if hovers.is_empty() {
            return;
        }
        let extend = |hovers_so_far: &Rc<[(HitboxId, bool)]>| -> Rc<[(HitboxId, bool)]> {
            let mut all = hovers_so_far.to_vec();
            all.extend_from_slice(hovers);
            all.into()
        };
        for &index in records {
            let record = &mut self.records[index];
            record.hover_dependencies = extend(&record.hover_dependencies);
        }
        if let Some(&innermost) = records.last() {
            let record = &mut self.records[innermost];
            record.own_hovers = extend(&record.own_hovers);
        }
    }

    pub(crate) fn push(&mut self, record: RetainedSubtree) -> usize {
        let index = self.records.len();
        // Two subtrees with one id can only both be drawn; neither can be
        // found to be drawn again.
        match self.by_id.entry(record.id.clone()) {
            crate::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(index);
            }
            crate::collections::hash_map::Entry::Occupied(entry) => {
                let other = *entry.get();
                self.records[other].paint = PaintStatus::Unpainted;
            }
        }
        self.records.push(record);
        index
    }

    /// Shifts the paint ranges of records copied along with a subtree drawn
    /// from last frame, now that it has been painted, and forgets those that
    /// were not.
    pub(crate) fn finish_frame(&mut self) {
        debug_assert!(self.open.is_empty());
        for index in 0..self.records.len() {
            let PaintStatus::Pending { anchor } = self.records[index].paint else {
                continue;
            };
            let shift = match &self.records[anchor].paint {
                PaintStatus::Painted {
                    source: Some(source),
                } if anchor != index => Some((
                    source.clone(),
                    self.records[anchor].paint_range.start.clone(),
                )),
                _ => None,
            };
            let record = &mut self.records[index];
            match shift {
                Some((from, to)) => {
                    record.paint_range = record.paint_range.start.shifted(&from, &to)
                        ..record.paint_range.end.shifted(&from, &to);
                    record.paint = PaintStatus::Painted { source: None };
                }
                None => record.paint = PaintStatus::Unpainted,
            }
        }
    }
}

/// Upstream's work-counter test expects ancestors to render on child updates.
/// Keep that test's upstream drawing semantics; retained behavior is tested in fast/.

impl Window {
    /// Sets whether a view is drawn again from what it drew on the last frame
    /// while nothing it depends on has changed, which is the default. A view
    /// depends on itself, on every entity and global read while it was
    /// rendered, laid out, prepainted and painted, on what it inherits from
    /// where it is drawn — bounds, content mask, text style, opacity — and on
    /// the hovers it was painted by. Anything else a view's render reads, it
    /// is notified of, as a cached view is.
    ///
    /// Turning it off draws every view from scratch each frame, as upstream
    /// GPUI does. The `GPUI_VIEW_RETENTION=0` environment variable turns it
    /// off for every window.
    #[cfg(any(test, feature = "harness"))]
    pub fn set_view_retention(&mut self, enabled: bool) {
        if self.retained_state.view_retention != enabled {
            self.retained_state.view_retention = enabled;
            self.refresh();
        }
    }

    /// Whether views are drawn again from what they drew on the last frame.
    /// See [`Window::set_view_retention`].
    #[cfg(any(test, feature = "harness"))]
    pub fn view_retention(&self) -> bool {
        self.retained_state.view_retention
    }

    /// The record `id` left last frame, if nothing about this frame rules out
    /// drawing it again: it did not read anything that changed, is not
    /// hovered differently and was not marked by an interaction.
    ///
    /// Where it is drawn is not checked here; see
    /// [`Window::retained_context_matches`].
    pub(crate) fn reusable_retained(&self, id: &GlobalElementId, cx: &App) -> Option<usize> {
        self.reusable_record(id, cx, false)
    }

    /// The record the cached view `id` left last frame, if nothing about
    /// this frame rules out drawing it again, as [`Self::reusable_retained`]
    /// finds it, but for what it read updated without being notified, which
    /// does not draw a cached view again (see
    /// [`App::notified_dependencies_changed`]).
    pub(crate) fn reusable_cached(&self, id: &GlobalElementId, cx: &App) -> Option<usize> {
        self.reusable_record(id, cx, true)
    }

    fn reusable_record(&self, id: &GlobalElementId, cx: &App, cached: bool) -> Option<usize> {
        if self.refreshing
            || cx.has_active_drag()
            || self.is_inspector_picking(cx)
            || self.retained_state.dirty_subtrees.contains(id)
            || self.next_frame.retained.by_id.contains_key(id)
        {
            return None;
        }
        let index = self.rendered_frame.retained.find(id)?;
        let record = &self.rendered_frame.retained.records[index];
        let changed = if cached {
            cx.notified_dependencies_changed(&record.dependencies)
        } else {
            cx.dependencies_changed(&record.dependencies, self.inside_notified_view())
        };
        if changed || !self.hovers_unchanged(&record.hover_dependencies) {
            return None;
        }
        Some(index)
    }

    /// Whether the subtree last frame's record `previous` stands for would be
    /// drawn at `bounds` just as it was.
    pub(crate) fn retained_context_matches(&self, previous: usize, bounds: Bounds<Pixels>) -> bool {
        let context = &self.rendered_frame.retained.records[previous].context;
        context.bounds == bounds
            && context.opacity == self.element_opacity
            && context.content_mask == self.content_mask()
            && context.text_style == self.text_style()
    }

    /// Lays out the view last frame's record `previous` stands for as it was
    /// laid out then, without building it, if it can be: its content left
    /// every node it was laid out with, and inherits what it did.
    pub(crate) fn reuse_retained_layout(
        &mut self,
        previous: usize,
        cx: &mut App,
    ) -> Option<LayoutId> {
        let record = &self.rendered_frame.retained.records[previous];
        let layout = record.layout.as_ref()?;
        if layout.rem_size != self.rem_size() || layout.text_style != self.text_style() {
            return None;
        }
        if !self
            .layout_engine
            .as_mut()
            .unwrap()
            .try_keep_retained(&layout.keys)
        {
            return None;
        }
        self.next_frame
            .accessed_element_states
            .extend(layout.element_states.iter().cloned());
        let root = layout.root;
        cx.replay_dependencies(&record.dependencies);
        Some(root)
    }

    /// Gives back the layout nodes [`Window::reuse_retained_layout`] kept, for
    /// a view that has to be built after all.
    pub(crate) fn release_retained_layout(&mut self, previous: usize) {
        if let Some(layout) = self.rendered_frame.retained.records[previous]
            .layout
            .as_ref()
        {
            self.layout_engine
                .as_mut()
                .unwrap()
                .release_kept(&layout.keys);
        }
    }

    /// The node the view last frame's record `previous` stands for was laid
    /// out at.
    pub(crate) fn retained_layout_root(&self, previous: usize) -> Option<LayoutId> {
        self.rendered_frame.retained.records[previous]
            .layout
            .as_ref()
            .map(|layout| layout.root)
    }

    /// Starts recording a view's layout request, to lay it out again as it
    /// was without building it. See [`RetainedLayout`].
    pub(crate) fn begin_retained_layout(&mut self, cx: &mut App) -> RetainedLayoutRecording {
        RetainedLayoutRecording {
            keys: self.record_claimed_layout_keys(),
            transient: self.layout_engine.as_ref().unwrap().transient_count(),
            element_states: self.next_frame.accessed_element_states.len(),
            dependencies: cx.begin_recording_dependencies(),
            text_style: self.text_style(),
            rem_size: self.rem_size(),
            parent_layout_key: self.parent_layout_key(),
            render: None,
        }
    }

    /// Ends `recording` for a layout request that produced `root`, returning
    /// what was read during it and, if its layout can be reused, how.
    pub(crate) fn finish_retained_layout(
        &mut self,
        recording: RetainedLayoutRecording,
        root: LayoutId,
        cx: &mut App,
    ) -> (Option<Rc<RetainedLayout>>, RecordedDependencies) {
        let keys = self.finish_recording_claimed_layout_keys(recording.keys);
        let mut dependencies = cx.finish_recording_dependencies(recording.dependencies);
        dependencies.render = recording.render;
        // A node nothing retains is gone at the end of the frame.
        if self.layout_engine.as_ref().unwrap().transient_count() != recording.transient {
            return (None, dependencies);
        }
        let layout = RetainedLayout {
            root,
            keys,
            element_states: self.next_frame.accessed_element_states[recording.element_states..]
                .to_vec(),
            text_style: recording.text_style,
            rem_size: recording.rem_size,
            parent_layout_key: recording.parent_layout_key,
        };
        (Some(Rc::new(layout)), dependencies)
    }

    /// Draws the subtree last frame's record `previous` stands for again, as
    /// far as its prepaint goes, returning its record in this frame for
    /// [`Window::reuse_retained_paint`]. What it read is read again unless
    /// its layout already was reused, which did that.
    pub(crate) fn reuse_retained_prepaint(
        &mut self,
        previous: usize,
        layout_reused: bool,
        cx: &mut App,
    ) -> usize {
        let (prepaint_range, layout_keys) = {
            let record = &self.rendered_frame.retained.records[previous];
            (record.prepaint_range.clone(), record.layout_keys.clone())
        };
        self.keep_retained_layout(&layout_keys);
        self.layout_engine
            .as_mut()
            .unwrap()
            .retention
            .stats
            .views_reused += 1;
        let start = self.prepaint_index();
        self.reuse_prepaint(prepaint_range.clone());
        let end = self.prepaint_index();
        if !layout_reused {
            cx.replay_dependencies(&self.rendered_frame.retained.records[previous].dependencies);
        }

        // The nested records can be shifted into this frame only if the copy
        // is what it was copied from, entry for entry.
        let copied_whole = end == prepaint_range.end.shifted(&prepaint_range.start, &start);
        debug_assert!(copied_whole, "a reused prepaint range changed length");
        if copied_whole {}
        // Nothing written since the records were built changed what they
        // read, or they would not be reused: they are up to date as of now.
        let writes_now = cx.entities.write_generation();
        let source = &self.rendered_frame.retained;
        let target = &mut self.next_frame.retained;
        target.reused_any = true;
        let anchor = target.records.len();
        let nested = if copied_whole {
            source.records[previous].nested
        } else {
            0
        };
        for index in previous..=previous + nested {
            let record = &source.records[index];
            let paint = match record.paint {
                PaintStatus::Painted { .. } => PaintStatus::Pending { anchor },
                _ => PaintStatus::Unpainted,
            };
            let prepaint_range = if index == previous {
                start.clone()..end.clone()
            } else {
                record
                    .prepaint_range
                    .start
                    .shifted(&prepaint_range.start, &start)
                    ..record
                        .prepaint_range
                        .end
                        .shifted(&prepaint_range.start, &start)
            };
            target.push(RetainedSubtree {
                id: record.id.clone(),
                prepaint_range,
                paint_range: record.paint_range.clone(),
                paint,
                nested: if index == previous {
                    nested
                } else {
                    record.nested
                },
                context: record.context.clone(),
                dependencies: record.dependencies.written_up_to(writes_now),
                own_dependencies: record.own_dependencies.written_up_to(writes_now),
                render_dependencies: record
                    .render_dependencies
                    .as_ref()
                    .map(|render| render.written_up_to(writes_now)),
                hover_dependencies: record.hover_dependencies.clone(),
                own_hovers: record.own_hovers.clone(),
                layout_keys: record.layout_keys.clone(),
                layout: record.layout.clone(),
                rebuild: record.rebuild.clone(),
            });
        }
        anchor
    }

    /// Draws the subtree whose prepaint [`Window::reuse_retained_prepaint`]
    /// drew again as far as its paint goes.
    pub(crate) fn reuse_retained_paint(&mut self, index: usize) {
        let record = &self.next_frame.retained.records[index];
        let PaintStatus::Pending { .. } = record.paint else {
            return;
        };
        let source = record.paint_range.clone();
        let hovers = record.hover_dependencies.clone();
        let id = record.id.clone();
        let opacity_changed = record.context.opacity.to_bits() != self.element_opacity.to_bits();

        let start = self.paint_index();
        self.reuse_paint(source.clone());
        let end = self.paint_index();
        let copied_whole = end == source.end.shifted(&source.start, &start);
        debug_assert!(copied_whole, "a reused paint range changed length");
        if copied_whole {}
        let record = &mut self.next_frame.retained.records[index];
        record.paint_range = start..end;
        record.paint = PaintStatus::Painted {
            source: copied_whole.then_some(source.start),
        };

        // The hovers were checked against last frame's hitboxes; this
        // frame's could put something over the subtree. That is found out
        // only now, too late to build it again, so it is built on the next
        // frame, which is asked for. The same goes for paint drawn again
        // under another opacity than it was painted with, as an ancestor's
        // hover style can change it after prepaint.
        if opacity_changed || !self.hovers_unchanged(&hovers) {
            self.retained_state
                .subtrees_dirty_next_frame
                .extend(self.retained_state.subtree_stack.iter().cloned());
            self.retained_state.subtrees_dirty_next_frame.insert(id);
            self.request_animation_frame();
        }
        // Subtrees around this one depend on these hovers too.
        self.add_nested_hovers(&hovers);
    }

    /// Adds the hovers a subtree nested in the one being painted was painted
    /// by, as the enclosing subtrees' hovers but not as their own.
    pub(crate) fn add_nested_hovers(&mut self, hovers: &[(HitboxId, bool)]) {
        if self.retained_state.subtree_stack.is_empty() {
            return;
        }
        self.take_hover_reads();
        let state = &mut self.retained_state;
        let start = state.hover_dependencies.len();
        state.hover_dependencies.extend_from_slice(hovers);
        if let Some(open) = state.open_paints.last_mut() {
            open.nested.push(start..state.hover_dependencies.len());
        }
    }

    /// Starts recording the prepaint of the retained subtree `id`, which is
    /// being built. Interactions inside it mark it to be built again, and
    /// whatever it lays out, reads and inherits is recorded.
    pub(crate) fn begin_retained(
        &mut self,
        id: &GlobalElementId,
        cx: &mut App,
    ) -> RetainedRecording {
        self.layout_engine
            .as_mut()
            .unwrap()
            .retention
            .stats
            .views_built += 1;
        let start = self.prepaint_index();
        let retained = &mut self.next_frame.retained;
        let index = (!retained.by_id.contains_key(id)).then(|| {
            let index = retained.push(RetainedSubtree {
                id: id.clone(),
                prepaint_range: start.clone()..start,
                paint_range: PaintIndex::default()..PaintIndex::default(),
                paint: PaintStatus::Unpainted,
                nested: 0,
                context: Rc::new(RetainedContext {
                    bounds: Bounds::default(),
                    content_mask: ContentMask::default(),
                    text_style: TextStyle::default(),
                    opacity: 1.,
                }),
                dependencies: RenderDependencies::default(),
                own_dependencies: RenderDependencies::default(),
                render_dependencies: None,
                hover_dependencies: Rc::new([]),
                own_hovers: Rc::new([]),
                layout_keys: Rc::new([]),
                layout: None,
                rebuild: None,
            });
            retained.open.push(index);
            index
        });
        self.retained_state.subtree_stack.push(id.clone());
        RetainedRecording {
            index,
            dependencies: cx.begin_recording_dependencies(),
            layout_keys: self.record_claimed_layout_keys(),
        }
    }

    /// Ends `recording` for a subtree prepainted at `bounds`, returning its
    /// record, if it has one, for [`Window::begin_retained_paint`].
    /// `layout` and `layout_dependencies` come from its layout request, when
    /// it was laid out by its content. `rebuild` is how the view can be built
    /// again on its own, if it can.
    pub(crate) fn finish_retained_prepaint(
        &mut self,
        recording: RetainedRecording,
        bounds: Bounds<Pixels>,
        layout: Option<Rc<RetainedLayout>>,
        layout_dependencies: Option<RecordedDependencies>,
        rebuild: Option<Rebuild>,
        cx: &mut App,
    ) -> Option<usize> {
        let layout_keys = self.finish_recording_claimed_layout_keys(recording.layout_keys);
        let mut dependencies = cx.finish_recording_dependencies(recording.dependencies);
        let id = self.retained_state.subtree_stack.pop();
        let Some(index) = recording.index else {
            // Inside a layer's content: the layer keeps how it was laid out.
            return None;
        };
        if let Some(layout_dependencies) = layout_dependencies {
            dependencies = RecordedDependencies {
                all: layout_dependencies.all.union(&dependencies.all),
                own: layout_dependencies.own.union(&dependencies.own),
                render: layout_dependencies.render,
            };
        }
        let context = RetainedContext {
            bounds,
            content_mask: self.content_mask(),
            text_style: self.text_style(),
            opacity: self.element_opacity,
        };
        let end = self.prepaint_index();
        let retained = &mut self.next_frame.retained;
        debug_assert_eq!(retained.open.last(), Some(&index));
        retained.open.pop();
        let nested = retained.records.len() - index - 1;
        let record = &mut retained.records[index];
        record.prepaint_range.end = end;
        record.nested = nested;
        record.context = Rc::new(context);
        record.dependencies = dependencies.all;
        record.own_dependencies = dependencies.own;
        record.render_dependencies = dependencies.render;
        record.layout_keys = layout_keys.into();
        record.layout = layout;
        record.rebuild = rebuild.map(Rc::new);
        Some(index)
    }

    /// Starts recording the paint of the retained subtree `id`, whose
    /// prepaint left the record `index`.
    pub(crate) fn begin_retained_paint(
        &mut self,
        index: Option<usize>,
        id: &GlobalElementId,
        cx: &mut App,
    ) -> RetainedPaintRecording {
        self.retained_state.subtree_stack.push(id.clone());
        self.take_hover_reads();
        self.retained_state
            .open_paints
            .push(OpenPaint { nested: Vec::new() });
        RetainedPaintRecording {
            index,
            start: self.paint_index(),
            hovers_start: self.retained_state.hover_dependencies.len(),
            dependencies: cx.begin_recording_dependencies(),
        }
    }

    /// Ends `recording`, keeping what the subtree painted, the hovers it was
    /// painted by and what it read.
    pub(crate) fn finish_retained_paint(
        &mut self,
        recording: RetainedPaintRecording,
        cx: &mut App,
    ) {
        self.take_hover_reads();
        self.retained_state.subtree_stack.pop();
        let dependencies = cx.finish_recording_dependencies(recording.dependencies);
        let nested = self
            .retained_state
            .open_paints
            .pop()
            .map(|open| open.nested)
            .unwrap_or_default();
        let state = &mut self.retained_state;
        let hovers_end = state.hover_dependencies.len();
        // The hovers this subtree added are nested in the one around it.
        if let Some(open) = state.open_paints.last_mut() {
            open.nested.push(recording.hovers_start..hovers_end);
        }
        let Some(index) = recording.index else {
            return;
        };
        let end = self.paint_index();
        let all = &self.retained_state.hover_dependencies[recording.hovers_start..hovers_end];
        let mut own = Vec::new();
        let mut cursor = recording.hovers_start;
        for range in &nested {
            if range.start > cursor {
                own.extend_from_slice(&self.retained_state.hover_dependencies[cursor..range.start]);
            }
            cursor = cursor.max(range.end);
        }
        if hovers_end > cursor {
            own.extend_from_slice(&self.retained_state.hover_dependencies[cursor..hovers_end]);
        }
        let hovers: Rc<[(HitboxId, bool)]> = all.into();
        let record = &mut self.next_frame.retained.records[index];
        record.paint_range = recording.start..end;
        record.paint = PaintStatus::Painted { source: None };
        // Prepaint can only predict the opacity paint applies (an ancestor's
        // hover style depends on this frame's hit test): keep what was painted,
        // so a reuse under another opacity is noticed by `reuse_retained_paint`.
        let opacity = self.element_opacity;
        let record = &mut self.next_frame.retained.records[index];
        if record.context.opacity.to_bits() != opacity.to_bits() {
            Rc::make_mut(&mut record.context).opacity = opacity;
        }
        record.hover_dependencies = hovers;
        record.own_hovers = own.into();
        record.dependencies = record.dependencies.union(&dependencies.all);
        record.own_dependencies = record.own_dependencies.union(&dependencies.own);
    }

    /// Takes the hovers read since the last call into `hover_dependencies`,
    /// in the order they were read, before anything measures it.
    pub(crate) fn take_hover_reads(&mut self) {
        let state = &mut self.retained_state;
        let reads = state.hover_reads.get_mut();
        if !reads.is_empty() {
            state.hover_dependencies.append(reads);
        }
    }

    /// See [`crate::taffy::TaffyLayoutEngine::record_claimed_keys`].
    pub(crate) fn record_claimed_layout_keys(&mut self) -> usize {
        self.layout_engine.as_mut().unwrap().record_claimed_keys()
    }

    /// See [`crate::taffy::TaffyLayoutEngine::finish_recording_claimed_keys`].
    pub(crate) fn finish_recording_claimed_layout_keys(&mut self, start: usize) -> Vec<u64> {
        self.layout_engine
            .as_mut()
            .unwrap()
            .finish_recording_claimed_keys(start)
    }

    /// See [`crate::taffy::TaffyLayoutEngine::keep_retained`].
    pub(crate) fn keep_retained_layout(&mut self, keys: &[u64]) {
        self.layout_engine.as_mut().unwrap().keep_retained(keys);
    }

    /// Whether every hover in `dependencies`, recorded while a reusable
    /// subtree was painted, is still as it was.
    pub(crate) fn hovers_unchanged(&self, dependencies: &[(HitboxId, bool)]) -> bool {
        dependencies
            .iter()
            .all(|(hitbox, hovered)| hitbox.hovered_now(self) == *hovered)
    }

    /// Marks dirty, as if notified, every view that last frame read something
    /// itself, outside the views nested in it, that has changed since: an
    /// entity changed (see [`App::dependencies_changed`]), a global written,
    /// a scroll or list state moved. Such a view is built again anyway; marking it dirty
    /// lets the views around it be drawn from last frame around it (see
    /// [`crate::fast::splice`]) instead of being built again because
    /// something nested in them changed.
    pub(crate) fn mark_changed_retained_views_dirty(&mut self, cx: &App) {
        if !self.retained_state.view_retention || self.refreshing {
            return;
        }
        let notified = &self.retained_state.notified_entities;
        let records = &self.rendered_frame.retained.records;
        let mut changed = SmallVec::<[EntityId; 8]>::new();
        // The last record inside each cached view the walk is in, innermost
        // last.
        let mut cached = SmallVec::<[usize; 4]>::new();
        for (index, record) in records.iter().enumerate() {
            while cached.last().is_some_and(|until| index > *until) {
                cached.pop();
            }
            let Some(entity) = crate::fast::splice::view_entity(&record.id) else {
                continue;
            };
            let changed_alone = || false;
            if record.is_cached() {
                // A cached view is drawn again for what is notified, not
                // for what is only updated. See
                // `App::notified_dependencies_changed`.
                if cx.notified_dependencies_changed(&record.own_dependencies) || changed_alone() {
                    changed.push(entity);
                }
                cached.push(index + record.nested);
                continue;
            }
            let inside_notified = !notified.is_empty()
                && self
                    .rendered_frame
                    .dispatch_tree
                    .view_path_reversed(entity)
                    .any(|view| notified.contains(&view));
            if !cx.dependencies_changed(&record.own_dependencies, inside_notified)
                && !changed_alone()
            {
                continue;
            }
            // A view inside a cached view only updated is built again only
            // if the cached view is, as upstream does.
            if !cached.is_empty() && !cx.notified_dependencies_changed(&record.own_dependencies) {
                continue;
            }
            changed.push(entity);
        }
        // As a notification marks a view and the views around it.
        for entity in changed {
            for view in self.rendered_frame.dispatch_tree.view_path_reversed(entity) {
                if !self.dirty_views.insert(view) {
                    break;
                }
            }
        }
    }

    /// Whether the view being drawn, or one around it, was notified since
    /// the last frame. See [`App::dependencies_changed`].
    pub(crate) fn inside_notified_view(&self) -> bool {
        let notified = &self.retained_state.notified_entities;
        !notified.is_empty()
            && self
                .rendered_entity_stack
                .iter()
                .any(|entity| notified.contains(entity))
    }
}

/// Where a frame's paint stands in what gpui-fast adds to the frame: the
/// part of a [`PaintIndex`] upstream's lacks.
#[derive(Clone, Default, PartialEq)]
pub(crate) struct FastPaintIndex {
    pub(crate) window_control_hitboxes: usize,
}

impl FastPaintIndex {
    #[inline(always)]
    pub(crate) fn new(window: &Window) -> Self {
        FastPaintIndex {
            window_control_hitboxes: window.next_frame.window_control_hitboxes.len(),
        }
    }
}

/// Copies what last frame's paint of `range` added that upstream's
/// [`Window::reuse_paint`] leaves out: a subtree drawn again from last frame
/// would otherwise lose the window controls it painted and the listeners
/// for accessibility actions it registered.
#[inline(always)]
pub(crate) fn reuse_paint_records(window: &mut Window, range: &Range<PaintIndex>) {
    window.next_frame.window_control_hitboxes.extend(
        window.rendered_frame.window_control_hitboxes
            [range.start.fast.window_control_hitboxes..range.end.fast.window_control_hitboxes]
            .iter()
            .cloned(),
    );
}

/// The retained subtrees around the element being painted, for a listener
/// to mark if what it listens for changes the element's look.
#[inline(always)]
pub(crate) fn enclosing_retained_subtrees(window: &Window) -> SmallVec<[GlobalElementId; 2]> {
    window
        .retained_state
        .subtree_stack
        .iter()
        .cloned()
        .collect()
}

/// Notes that what is being painted inside a retained subtree looks the
/// way it does because `hitbox` is, or is not, hovered: anything painted
/// that asked whether it is, a hover style or an element of its own.
///
/// Returns the answer when it is noted, having worked it out to note it,
/// and `None` when nothing is being drawn to note it for.
#[inline(always)]
pub(crate) fn note_hover_read(window: &Window, hitbox: HitboxId) -> Option<bool> {
    if window.retained_state.subtree_stack.is_empty() {
        return None;
    }
    let hovered = hitbox.hovered_now(window);
    window
        .retained_state
        .hover_reads
        .borrow_mut()
        .push((hitbox, hovered));
    Some(hovered)
}

/// Marks the innermost of the retained subtrees an interaction happened
/// in to be built again rather than reused on the next frame. Its
/// listener notifies the view it is in, which marks the views around it
/// dirty, so they are drawn from last frame around it where they can be
/// rather than built again.
#[inline(always)]
pub(crate) fn invalidate_retained_subtrees(window: &mut Window, subtrees: &[GlobalElementId]) {
    window
        .retained_state
        .dirty_subtrees
        .extend(subtrees.last().cloned());
}

/// Starts prepainting the deferred draw at `deferred_draw_ix` as a part of
/// the retained subtrees it was deferred from, though it is drawn after
/// them: what it listens for marks them, and what it reads is theirs.
#[inline]
pub(crate) fn begin_deferred_prepaint(
    window: &mut Window,
    deferred_draw_ix: usize,
    cx: &mut App,
) -> Option<DeferredRetainedRecording> {
    let enclosing = &window.next_frame.deferred_draws[deferred_draw_ix].enclosing_retained;
    if enclosing.0.is_empty() {
        return None;
    }
    let enclosing = enclosing.clone();
    window.retained_state.subtree_stack.extend(
        enclosing
            .0
            .iter()
            .map(|&index| window.next_frame.retained.id(index).clone()),
    );
    Some(DeferredRetainedRecording {
        enclosing,
        dependencies: cx.begin_recording_dependencies(),
        hovers_start: None,
    })
}

/// Starts painting a deferred draw as a part of the retained subtrees it
/// was deferred from, though it is painted after them: an interaction in
/// it marks them, and what it reads and is hovered by is theirs.
#[inline]
pub(crate) fn begin_deferred_paint(
    window: &mut Window,
    enclosing: &EnclosingRetained,
    cx: &mut App,
) -> Option<DeferredRetainedRecording> {
    if enclosing.0.is_empty() {
        return None;
    }
    window.retained_state.subtree_stack.extend(
        enclosing
            .0
            .iter()
            .map(|&index| window.next_frame.retained.id(index).clone()),
    );
    window.take_hover_reads();
    Some(DeferredRetainedRecording {
        enclosing: enclosing.clone(),
        dependencies: cx.begin_recording_dependencies(),
        hovers_start: Some(window.retained_state.hover_dependencies.len()),
    })
}

/// Ends `recording`, adding what the deferred draw read, and the hovers it
/// was painted by, to the retained subtrees it was deferred from.
#[inline]
pub(crate) fn finish_deferred(
    window: &mut Window,
    recording: Option<DeferredRetainedRecording>,
    cx: &mut App,
) {
    let Some(recording) = recording else {
        return;
    };
    window.take_hover_reads();
    let dependencies = cx.finish_recording_dependencies(recording.dependencies);
    window.retained_state.subtree_stack.clear();
    let enclosing = &recording.enclosing.0;
    window
        .next_frame
        .retained
        .add_dependencies(enclosing, &dependencies.all, &dependencies.own);
    if let Some(hovers_start) = recording.hovers_start {
        let hovers = window
            .retained_state
            .hover_dependencies
            .split_off(hovers_start);
        window
            .next_frame
            .retained
            .add_hover_dependencies(enclosing, &hovers);
    }
}

/// Ends the retained bookkeeping of the frame being drawn, before it
/// becomes the rendered frame.
#[inline]
pub(crate) fn finish_retained_frame(window: &mut Window) {
    // The sprite atlas may be cleared when the frame is presented.
    window.fast_glyph_bounds.finish_frame();
    window.retained_state.prebuilt.clear();
    window.retained_state.dirty_subtrees =
        mem::take(&mut window.retained_state.subtrees_dirty_next_frame);
    window.retained_state.hover_dependencies.clear();
    window.retained_state.hover_reads.get_mut().clear();
    window.retained_state.rendering_since.clear();
    window.retained_state.render_writes.clear();
    window.next_frame.retained.finish_frame();
}

// These reach into the window's layout state, for views drawn again at the
// layout they kept.
impl Window {
    /// How many writes that change a layout the engine has made. See
    /// [`crate::taffy::TaffyLayoutEngine::layout_changes`].
    pub(crate) fn layout_changes(&self) -> u64 {
        self.layout_engine.as_ref().unwrap().layout_changes()
    }

    /// How many measurements the engine has been given to take again. See
    /// [`crate::taffy::TaffyLayoutEngine::remeasures`].
    pub(crate) fn layout_remeasures(&self) -> u64 {
        self.layout_engine.as_ref().unwrap().remeasures()
    }

    /// See [`crate::taffy::TaffyLayoutEngine::relayout_in_place`].
    pub(crate) fn relayout_in_place(
        &mut self,
        layout_id: LayoutId,
        available_space: Size<AvailableSpace>,
        cx: &mut App,
    ) {
        let mut layout_engine = self.layout_engine.take().unwrap();
        layout_engine.relayout_in_place(layout_id, available_space, self, cx);
        self.layout_engine = Some(layout_engine);
    }
}

// These two are the associated types of `impl Element for ViewElement<V>`, so
// Rust requires them to be `pub`; this module is private and they are not
// exported, so nothing outside the crate can name them.

/// How a view was laid out, for its prepaint to follow up on.
#[doc(hidden)]
pub struct ViewLayoutState(ViewLayout);

/// What a view's prepaint left for its paint.
#[doc(hidden)]
pub struct ViewPrepaintState(ViewPrepaint);

enum ViewLayout {
    /// Laid out by the style it is cached with; built at prepaint if at all.
    /// Its node is kept as a view's layout is, for it to be built again on
    /// its own inside a view drawn around it from last frame.
    Cached {
        retained: (Option<Rc<RetainedLayout>>, RecordedDependencies),
    },
    /// Built, and laid out by its content.
    Built {
        element: AnyElement,
        /// How to lay it out again without building it, and what it read
        /// while it was built and laid out, when it is retained.
        retained: Option<(Option<Rc<RetainedLayout>>, RecordedDependencies)>,
    },
    /// Laid out as it was last frame without being built, from the record
    /// it left then, which it is drawn again from if nothing moved it.
    Retained { previous: usize },
    /// Laid out as it was last frame around the nested views that changed,
    /// which were built again. See [`crate::fast::splice`].
    Spliced(Splice),
    /// Built and laid out already, for a view around it that was to be drawn
    /// from last frame and could not be.
    Prebuilt(Box<Prebuilt>),
    /// Laid out as the layer it is drawn in kept it, without being built,
    /// for a frame expected to composite the layer. See
    /// [`crate::fast::layers::reuse::KeptLayout`].
    Kept(Rc<RetainedLayout>),
    /// Moved on to prepaint.
    Taken,
}

pub(crate) enum ViewPrepaint {
    /// Built this frame, into its record in this frame if it has one.
    Built {
        element: AnyElement,
        record: Option<usize>,
    },
    /// Drawn from last frame, as the record at this index in this frame.
    Reused(usize),
    /// Drawn from last frame around the nested views built again.
    Spliced(SplicedPrepaint),
    /// Built for a view around it, which could not be drawn from last frame.
    Prebuilt(Box<(Prebuilt, ViewPrepaintState)>),
}

impl<V: View> ViewElement<V> {
    fn request_view_layout_inner(
        &mut self,
        global_id: Option<&GlobalElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, ViewLayout) {
        if let Some(entity_id) = self.entity_id {
            // Stateful path: create a reactive boundary.
            window.with_rendered_view(entity_id, |window| {
                let caching_disabled = window.is_inspector_picking(cx);
                match self.cached_style.as_ref() {
                    Some(style) if !caching_disabled => {
                        let mut root_style = Style::default();
                        root_style.refine(style);
                        let recording = window.begin_retained_layout(cx);
                        let layout_id = window.request_layout(root_style, None, cx);
                        let retained = window.finish_retained_layout(recording, layout_id, cx);
                        (layout_id, ViewLayout::Cached { retained })
                    }
                    _ if window.retained_state.view_retention => {
                        let global_id = global_id.expect("a view always has an id");
                        if let Some((prebuilt, layout_id)) = window.take_prebuilt(global_id, cx) {
                            return (layout_id, ViewLayout::Prebuilt(Box::new(prebuilt)));
                        }
                        if !window.dirty_views.contains(&entity_id)
                            && let Some(previous) = window.reusable_retained(global_id, cx)
                            && let Some(layout_id) = window.reuse_retained_layout(previous, cx)
                        {
                            return (layout_id, ViewLayout::Retained { previous });
                        }
                        if window.dirty_views.contains(&entity_id)
                            && let Some(splice) = window.splice_layout(global_id, cx)
                            && let Some(root) = window.retained_layout_root(splice.previous())
                        {
                            return (root, ViewLayout::Spliced(splice));
                        }
                        let start = note_rendering(window, cx, entity_id);
                        let mut recording = window.begin_retained_layout(cx);
                        let mut element =
                            crate::view::render_view(self.view.take().unwrap(), window, cx);
                        note_rendered(window, cx, entity_id, start);
                        recording.rendered(cx);
                        let layout_id = element.request_layout(window, cx);
                        let retained = window.finish_retained_layout(recording, layout_id, cx);
                        (
                            layout_id,
                            ViewLayout::Built {
                                element,
                                retained: Some(retained),
                            },
                        )
                    }
                    _ => {
                        let mut element =
                            crate::view::render_view(self.view.take().unwrap(), window, cx);
                        let layout_id = element.request_layout(window, cx);
                        (
                            layout_id,
                            ViewLayout::Built {
                                element,
                                retained: None,
                            },
                        )
                    }
                }
            })
        } else {
            // Stateless path: isolate subtree via type name (no entity identity).
            window.with_id(
                ElementId::Name(std::any::type_name::<V>().into()),
                |window| {
                    let mut element =
                        crate::view::render_view(self.view.take().unwrap(), window, cx);
                    let layout_id = element.request_layout(window, cx);
                    (
                        layout_id,
                        ViewLayout::Built {
                            element,
                            retained: None,
                        },
                    )
                },
            )
        }
    }

    fn prepaint_view_inner(
        &mut self,
        global_id: Option<&GlobalElementId>,
        bounds: Bounds<Pixels>,
        layout: ViewLayout,
        window: &mut Window,
        cx: &mut App,
    ) -> ViewPrepaint {
        let Some(entity_id) = self.entity_id else {
            // Stateless path: just prepaint the element.
            let ViewLayout::Built { mut element, .. } = layout else {
                unreachable!("a stateless view is always built");
            };
            window.with_id(
                ElementId::Name(std::any::type_name::<V>().into()),
                |window| {
                    element.prepaint(window, cx);
                },
            );
            return ViewPrepaint::Built {
                element,
                record: None,
            };
        };

        window.set_view_id(entity_id);
        window.with_rendered_view(entity_id, |window| {
            let global_id = global_id.expect("a view always has an id");
            match layout {
                ViewLayout::Built {
                    mut element,
                    retained: None,
                } => {
                    element.prepaint(window, cx);
                    ViewPrepaint::Built {
                        element,
                        record: None,
                    }
                }
                ViewLayout::Built {
                    mut element,
                    retained: Some((layout, dependencies)),
                } => {
                    let rebuild = window.rebuild_here(
                        &self.rebuild,
                        None,
                        layout.as_ref().and_then(|layout| layout.parent_layout_key),
                    );
                    let recording = window.begin_retained(global_id, cx);
                    element.prepaint(window, cx);
                    let record = window.finish_retained_prepaint(
                        recording,
                        bounds,
                        layout,
                        Some(dependencies),
                        rebuild,
                        cx,
                    );
                    ViewPrepaint::Built { element, record }
                }
                ViewLayout::Retained { previous } => {
                    if window.retained_context_matches(previous, bounds) {
                        return ViewPrepaint::Reused(
                            window.reuse_retained_prepaint(previous, true, cx),
                        );
                    }
                    self.build_at_retained_layout(previous, global_id, bounds, window, cx)
                }
                ViewLayout::Kept(layout) => {
                    // The layer is painted afresh after all: the view is
                    // built at the layout it kept.
                    window
                        .layout_engine
                        .as_mut()
                        .unwrap()
                        .release_kept(&layout.keys);
                    self.build_at_layout(
                        Some(layout.root),
                        layout.parent_layout_key,
                        global_id,
                        bounds,
                        window,
                        cx,
                    )
                }
                ViewLayout::Prebuilt(mut prebuilt) => {
                    let prepaint = prebuilt.prepaint(Some(global_id), bounds, window, cx);
                    ViewPrepaint::Prebuilt(Box::new((*prebuilt, prepaint)))
                }
                ViewLayout::Spliced(splice) => {
                    let previous = splice.previous();
                    if window.retained_context_matches(previous, bounds)
                        && window.splice_layout_holds(&splice)
                    {
                        return window.splice_prepaint(global_id, splice, cx);
                    }
                    window.abandon_splice(splice);
                    self.build_at_retained_layout(previous, global_id, bounds, window, cx)
                }
                ViewLayout::Cached {
                    retained: (layout, layout_dependencies),
                } => {
                    // Dirty only because cached views nested in it are: drawn
                    // from last frame around them.
                    if window.dirty_views.contains(&entity_id)
                        && let Some(splice) =
                            window.splice_cached(global_id, bounds, layout.clone(), cx)
                    {
                        let rebuild = window.rebuild_here(
                            &self.rebuild,
                            self.cached_style.as_ref(),
                            layout.as_ref().and_then(|layout| layout.parent_layout_key),
                        );
                        let prepaint = window.splice_prepaint(global_id, splice, cx);
                        if let ViewPrepaint::Spliced(spliced) = &prepaint {
                            window.next_frame.retained.records[spliced.index()].rebuild =
                                rebuild.map(Rc::new);
                        }
                        return prepaint;
                    }
                    if !window.dirty_views.contains(&entity_id)
                        && let Some(previous) = window.reusable_cached(global_id, cx)
                        && window.retained_context_matches(previous, bounds)
                    {
                        let rebuild = window.rebuild_here(
                            &self.rebuild,
                            self.cached_style.as_ref(),
                            layout.as_ref().and_then(|layout| layout.parent_layout_key),
                        );
                        let index = window.reuse_retained_prepaint(previous, false, cx);
                        // Cached paint can survive a changed element path, but
                        // its style node was requested again at the new path.
                        // Keep that node and rebuild location, not the copied
                        // ones which may be released at the end of this frame.
                        let record = &mut window.next_frame.retained.records[index];
                        record.layout = layout;
                        record.rebuild = rebuild.map(Rc::new);
                        return ViewPrepaint::Reused(index);
                    }
                    let start = note_rendering(window, cx, entity_id);
                    let recording = window.begin_retained(global_id, cx);
                    let mut element =
                        crate::view::render_view(self.view.take().unwrap(), window, cx);
                    note_rendered(window, cx, entity_id, start);
                    let render = recording.rendered(cx);
                    element.layout_as_root(bounds.size.into(), window, cx);
                    element.prepaint_at(bounds.origin, window, cx);
                    // Kept so that the view can be built again on its own
                    // at the node it is laid out at, inside a view drawn
                    // around it from last frame.
                    let rebuild = window.rebuild_here(
                        &self.rebuild,
                        self.cached_style.as_ref(),
                        layout.as_ref().and_then(|layout| layout.parent_layout_key),
                    );
                    let record = window.finish_retained_prepaint(
                        recording,
                        bounds,
                        layout,
                        Some(layout_dependencies),
                        rebuild,
                        cx,
                    );
                    if let Some(index) = record {
                        window.next_frame.retained.records[index].render_dependencies =
                            Some(render);
                    }
                    ViewPrepaint::Built { element, record }
                }
                ViewLayout::Taken => unreachable!("a view is prepainted once"),
            }
        })
    }

    /// Builds a view whose layout was reused, but which cannot be drawn again
    /// from last frame because it is drawn somewhere else: it moved, or what it
    /// inherits changed. It is laid out at the nodes it kept, which it finds
    /// again as it requests them. Nothing it depends on changed, so it asks
    /// for the layout it had; if it asks for another after all, it is laid out
    /// within the bounds it was given, and on the next frame from scratch.
    #[inline(never)]
    fn build_at_retained_layout(
        &mut self,
        previous: usize,
        global_id: &GlobalElementId,
        bounds: Bounds<Pixels>,
        window: &mut Window,
        cx: &mut App,
    ) -> ViewPrepaint {
        let root = window.retained_layout_root(previous);
        window.release_retained_layout(previous);
        // Where it is drawn has not changed its place in the element tree.
        let parent_layout_key = window.rendered_frame.retained.records[previous]
            .rebuild
            .as_ref()
            .map(|rebuild| rebuild.parent_layout_key());
        self.build_at_layout(root, parent_layout_key, global_id, bounds, window, cx)
    }

    /// Builds a view laid out at `root`, whose nodes were given back, as
    /// [`Self::build_at_retained_layout`] does; `parent_layout_key` keys the
    /// node of the element it hangs off.
    fn build_at_layout(
        &mut self,
        root: Option<LayoutId>,
        parent_layout_key: Option<u64>,
        global_id: &GlobalElementId,
        bounds: Bounds<Pixels>,
        window: &mut Window,
        cx: &mut App,
    ) -> ViewPrepaint {
        let mut layout_recording = window.begin_retained_layout(cx);
        let changes_before = window.layout_changes();
        let remeasures_before = window.layout_remeasures();
        let entity_id = self.entity_id;
        let start = entity_id.map(|entity_id| note_rendering(window, cx, entity_id));
        let view = self.view.take().unwrap();
        let (mut element, layout_id) = window.with_layout_key_of_prepainting_element(|window| {
            let mut element = crate::view::render_view(view, window, cx);
            if let (Some(entity_id), Some(start)) = (entity_id, start) {
                note_rendered(window, cx, entity_id, start);
            }
            layout_recording.rendered(cx);
            let layout_id = element.request_layout(window, cx);
            (element, layout_id)
        });
        let unchanged = window.layout_changes() == changes_before;
        let remeasured = window.layout_remeasures() != remeasures_before;
        let (layout, dependencies) = window.finish_retained_layout(layout_recording, layout_id, cx);

        let recording = window.begin_retained(global_id, cx);
        if Some(layout_id) == root {
            // Measurements taken again are laid out again within the view,
            // which is held at its size. Only a layout that changed can
            // change that size, which the next frame lays out from scratch.
            if !unchanged || remeasured {
                window.relayout_in_place(layout_id, bounds.size.into(), cx);
            }
            if !unchanged {
                window.request_animation_frame();
            }
            element.prepaint(window, cx);
        } else {
            element.layout_as_root(bounds.size.into(), window, cx);
            element.prepaint_at(bounds.origin, window, cx);
            window.request_animation_frame();
        }
        let rebuild = window.rebuild_here(&self.rebuild, None, parent_layout_key);
        let record = window.finish_retained_prepaint(
            recording,
            bounds,
            layout,
            Some(dependencies),
            rebuild,
            cx,
        );
        ViewPrepaint::Built { element, record }
    }
}

/// Notes that the view `entity_id` begins to render, if it has not yet this
/// frame: see [`RetainedState::rendering_since`]. Returns where in the write
/// generation this render begins.
fn note_rendering(window: &mut Window, cx: &App, entity_id: EntityId) -> u64 {
    let since = cx.entities.write_generation();
    window
        .retained_state
        .rendering_since
        .entry(entity_id)
        .or_insert(since);
    since
}

/// Notes that the `render` of the view `entity_id`, begun at `start` in the
/// write generation, returned: see [`RetainedState::render_writes`].
fn note_rendered(window: &mut Window, cx: &App, entity_id: EntityId, start: u64) {
    let end = cx.entities.write_generation();
    window
        .retained_state
        .render_writes
        .insert(entity_id, start..end);
}

/// Lays the view out as [`crate::Element::request_layout`] does, drawing it
/// again from last frame when it is retained and nothing it depends on
/// changed.
#[inline(always)]
pub(crate) fn request_view_layout<V: View>(
    view: &mut ViewElement<V>,
    global_id: Option<&GlobalElementId>,
    window: &mut Window,
    cx: &mut App,
) -> (LayoutId, ViewLayoutState) {
    let (layout_id, layout) = view.request_view_layout_inner(global_id, window, cx);
    (layout_id, ViewLayoutState(layout))
}

/// Attributes the time since `start` to the view's type in the window's
/// profiler, as upstream's `ViewElement` does for views with an entity.

/// The layout of a cached view laid out as it was, at the style node it had,
/// for a cached view built again inside a view drawn from last frame.
pub(crate) fn cached_layout_state(
    layout: Option<Rc<RetainedLayout>>,
    dependencies: RecordedDependencies,
) -> ViewLayoutState {
    ViewLayoutState(ViewLayout::Cached {
        retained: (layout, dependencies),
    })
}

/// Prepaints the view as [`crate::Element::prepaint`] does, following up on how
/// [`request_view_layout`] laid it out.
#[inline(always)]
pub(crate) fn prepaint_view<V: View>(
    view: &mut ViewElement<V>,
    global_id: Option<&GlobalElementId>,
    bounds: Bounds<Pixels>,
    layout: &mut ViewLayoutState,
    window: &mut Window,
    cx: &mut App,
) -> ViewPrepaintState {
    let layout = mem::replace(&mut layout.0, ViewLayout::Taken);
    let prepaint = view.prepaint_view_inner(global_id, bounds, layout, window, cx);
    ViewPrepaintState(prepaint)
}

/// Paints the view as [`crate::Element::paint`] does.
#[inline(always)]
pub(crate) fn paint_view<V: View>(
    view: &mut ViewElement<V>,
    global_id: Option<&GlobalElementId>,
    prepaint: &mut ViewPrepaintState,
    window: &mut Window,
    cx: &mut App,
) {
    if let Some(entity_id) = view.entity_id {
        // Stateful path.
        paint_entity_view(entity_id, global_id, &mut prepaint.0, window, cx);
    } else {
        // Stateless path: just paint the element.
        paint_component(std::any::type_name::<V>(), &mut prepaint.0, window, cx);
    }
}

#[inline(never)]
fn paint_entity_view(
    entity_id: EntityId,
    global_id: Option<&GlobalElementId>,
    prepaint: &mut ViewPrepaint,
    window: &mut Window,
    cx: &mut App,
) {
    window.with_rendered_view(entity_id, |window| match prepaint {
        ViewPrepaint::Reused(index) => window.reuse_retained_paint(*index),
        ViewPrepaint::Spliced(spliced) => {
            let global_id = global_id.expect("a view always has an id");
            window.splice_paint(global_id, spliced, cx)
        }
        ViewPrepaint::Prebuilt(prebuilt) => {
            let (prebuilt, prepaint) = &mut **prebuilt;
            prebuilt.paint(global_id, prepaint, window, cx)
        }
        ViewPrepaint::Built {
            element,
            record: None,
        } => element.paint(window, cx),
        ViewPrepaint::Built {
            element,
            record: Some(record),
        } => {
            let global_id = global_id.expect("a view always has an id");
            let recording = window.begin_retained_paint(Some(*record), global_id, cx);
            element.paint(window, cx);
            window.finish_retained_paint(recording, cx);
        }
    });
}

#[inline(never)]
fn paint_component(
    name: &'static str,
    prepaint: &mut ViewPrepaint,
    window: &mut Window,
    cx: &mut App,
) {
    let ViewPrepaint::Built { element, .. } = prepaint else {
        unreachable!("a stateless view is always built");
    };
    window.with_id(ElementId::Name(name.into()), |window| {
        element.paint(window, cx);
    });
}

impl HitboxId {
    /// Whether the hitbox is hovered, as [`HitboxId::is_hovered`] answers,
    /// without noting that it was asked.
    pub(crate) fn hovered_now(self, window: &Window) -> bool {
        if window.captured_hitbox == Some(self) {
            return true;
        }
        self.hit_test(window)
    }
}
