//! Drawing a view again from last frame around the views nested in it that
//! have to be built again.
//!
//! Notifying a view marks every view around it dirty, because they have to be
//! walked to reach it. Upstream builds them all again; a retained view that is
//! dirty only because something nested in it is — it was not notified, and
//! nothing it read itself changed — is instead drawn again from last frame,
//! stretch by stretch, with the nested views that changed built again in the
//! gaps where they were drawn:
//!
//! - its layout is last frame's, and each nested view that changed is laid
//!   out again at its own nodes. If one of them asks for another layout — a
//!   node created, a style or a child list rewritten, a measurement that no
//!   longer stands — the view around it is built after all, as before;
//! - its prepaint and paint are copied from last frame up to where each
//!   nested view began, the nested view is prepainted and painted where it
//!   was, with what it inherited there, and the copy goes on after it.
//!
//! A nested view can be built on its own only if it can be rendered without
//! the view around it: [`RebuildHandle`] holds it as an [`AnyView`] when it
//! was placed as an entity or an `AnyView`, and [`Rebuild`] what it inherited.

use crate::collections::FxHashSet;
use crate::fast::dependencies::RenderDependencies;
use crate::fast::retained::{EnclosingRetained, OpenPaint};
use crate::fast::retained::{
    PaintStatus, RetainedLayout, RetainedSubtree, ViewLayoutState, ViewPrepaint, ViewPrepaintState,
};
use crate::fast::text_style::TextStyleStack;
use crate::key_dispatch::{DispatchNodeId, DispatchTree};
use crate::window::DeferredDraw;
use crate::window::{PaintIndex, PrepaintStateIndex};
use crate::{
    AnyView, App, Bounds, ContentMask, ElementId, EntityId, FocusId, GlobalElementId, HitboxId,
    LayoutId, Pixels, Point, StyleRefinement, View, ViewElement, Window,
};
use smallvec::SmallVec;
use std::{any::TypeId, mem, ops::Range, rc::Rc};

/// The view a [`ViewElement`] renders, kept so that it can be built again on
/// its own. Empty for a view that is not an entity or an [`AnyView`].
#[derive(Default)]
pub(crate) struct RebuildHandle(Option<AnyView>);

/// `view` drawn as a cached view laid out at `style`, as
/// [`AnyView::cached`](crate::AnyView::cached) and
/// [`Entity::cached`](crate::Entity::cached) draw it, kept as `any` so that it
/// can be built again on its own.
#[inline(always)]
pub(crate) fn cached<V: View>(view: V, any: AnyView, style: StyleRefinement) -> ViewElement<V> {
    rebuildable(view, any).cached(style)
}

/// `view` drawn as a view that can be built again on its own, kept as `any`,
/// as [`Entity::into_element`](crate::IntoElement::into_element) and
/// [`AnyView::into_element`](crate::IntoElement::into_element) draw it.
#[inline(always)]
pub(crate) fn rebuildable<V: View>(view: V, any: AnyView) -> ViewElement<V> {
    let view_type_name = any.view_type_name;
    ViewElement::with_type_name(view, view_type_name).rebuildable(any)
}

impl<V: View> ViewElement<V> {
    /// Keeps `view`, which renders what this element does, to build it again
    /// on its own. See [`crate::fast::splice`].
    pub(crate) fn rebuildable(mut self, view: AnyView) -> Self {
        self.rebuild = RebuildHandle(Some(view));
        self
    }
}

/// What it takes to build a view again on its own, where it was drawn.
pub(crate) struct Rebuild {
    view: AnyView,
    /// The layout key its element was requested under, which its own key,
    /// and the keys of its nodes, are derived from.
    parent_layout_key: u64,
    text_style_stack: TextStyleStack,
    layout_direction_stack: SmallVec<[crate::Direction; 8]>,
    element_offset: Point<Pixels>,
    rem_size: Pixels,
    /// The style it is laid out at, when it is a cached view.
    cached_style: Option<StyleRefinement>,
}

impl Rebuild {
    /// The layout key the view's element was requested under.
    pub(crate) fn parent_layout_key(&self) -> u64 {
        self.parent_layout_key
    }

    /// Whether the view is a cached view.
    pub(crate) fn is_cached(&self) -> bool {
        self.cached_style.is_some()
    }
}

impl Window {
    /// How the view whose [`RebuildHandle`] is `handle` can be built again on
    /// its own, from here, if it can: its element was requested under
    /// `parent_layout_key`, and nothing it inherits is out of reach.
    pub(crate) fn rebuild_here(
        &self,
        handle: &RebuildHandle,
        cached_style: Option<&StyleRefinement>,
        parent_layout_key: Option<u64>,
    ) -> Option<Rebuild> {
        if !self.image_cache_stack.is_empty() {
            return None;
        }
        Some(Rebuild {
            view: handle.0.clone()?,
            parent_layout_key: parent_layout_key?,
            text_style_stack: self.text_style_stack.clone(),
            layout_direction_stack: self.layout_direction_stack.clone(),
            element_offset: self.element_offset(),
            rem_size: self.rem_size(),
            cached_style: cached_style.cloned(),
        })
    }
}

/// A nested view built again inside a view drawn from last frame, drawn the
/// way its element would be inside the view around it.
pub(crate) struct Gap {
    /// Its record in the last frame.
    record: usize,
    global_id: GlobalElementId,
    view: ViewElement<AnyView>,
    layout: ViewLayoutState,
    layout_id: LayoutId,
    /// Where a cached view nested in a cached view is drawn: it is laid out on
    /// its own, at the bounds it had, not at a node of the view around it.
    bounds: Option<Bounds<Pixels>>,
    layout_key: u64,
    /// The layout nodes it claimed.
    claimed: Vec<u64>,
    /// The element states it used and what it read while its layout was
    /// requested, which the view around it takes over if it is built after
    /// all.
    element_states: Vec<(GlobalElementId, std::any::TypeId)>,
    dependencies: RenderDependencies,
    /// Its dispatch node and what its prepaint left, once prepainted.
    prepainted: Option<(DispatchNodeId, ViewPrepaintState)>,
}

impl Gap {
    fn element_id(&self) -> ElementId {
        self.global_id
            .ids
            .last()
            .cloned()
            .expect("a view has an id")
    }
}

/// A nested view built for a splice that did not happen, with what the view
/// around it takes over from it. See [`Window::take_prebuilt`].
pub(crate) struct PrebuiltGap {
    prebuilt: Prebuilt,
    layout_id: LayoutId,
    claimed: Vec<u64>,
    element_states: Vec<(GlobalElementId, std::any::TypeId)>,
    dependencies: RenderDependencies,
}

/// A nested view built for a view that could not be drawn around it after
/// all, taken over by its element when the view around it is built.
pub(crate) struct Prebuilt {
    view: ViewElement<AnyView>,
    layout: ViewLayoutState,
}

impl Prebuilt {
    pub(crate) fn prepaint(
        &mut self,
        global_id: Option<&GlobalElementId>,
        bounds: crate::Bounds<Pixels>,
        window: &mut Window,
        cx: &mut App,
    ) -> ViewPrepaintState {
        crate::fast::retained::prepaint_view(
            &mut self.view,
            global_id,
            bounds,
            &mut self.layout,
            window,
            cx,
        )
    }

    pub(crate) fn paint(
        &mut self,
        global_id: Option<&GlobalElementId>,
        prepaint: &mut ViewPrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        crate::fast::retained::paint_view(&mut self.view, global_id, prepaint, window, cx)
    }
}

/// How a gap built again asked to be laid out, against last frame.
enum GapLayout {
    /// As it was.
    Unchanged,
    /// At the node it had, with something inside it laid out differently.
    Changed,
    /// At another node.
    NewRoot,
}

/// A view drawn from last frame around the nested views built again in it.
pub(crate) struct Splice {
    previous: usize,
    entity_updates: u64,
    gaps: Vec<Gap>,
    /// This frame's layout claims, with each rebuilt gap replacing its old
    /// keys and element states. Absent if a gap introduced transient nodes.
    layout: Option<Rc<RetainedLayout>>,
    /// When a gap was laid out differently from last frame, the layouts the
    /// view's own nodes had then, which have to come out of this frame's
    /// layout the same for it to be drawn around the gap. See
    /// [`Window::splice_layout_holds`].
    held: Vec<(LayoutId, taffy::Layout)>,
}

impl Splice {
    /// The record last frame's view is drawn again from.
    pub(crate) fn previous(&self) -> usize {
        self.previous
    }
}

/// What [`Window::splice_prepaint`] leaves for [`Window::splice_paint`].
pub(crate) struct SplicedPrepaint {
    previous: usize,
    /// Its record in this frame.
    index: usize,
    gaps: Vec<Gap>,
    /// The records copied along with it, in this frame, each with the
    /// stretch of last frame's range, between gaps, it was copied from.
    copied: Vec<(usize, usize)>,
}

impl SplicedPrepaint {
    /// Its record in this frame.
    pub(crate) fn index(&self) -> usize {
        self.index
    }
}

/// What the window inherits at some point of the element tree, set aside while
/// a nested view is built where it was.
struct Inherited {
    element_id_stack: crate::window::ElementIdStack,
    text_style_stack: TextStyleStack,
    layout_direction_stack: SmallVec<[crate::Direction; 8]>,
    content_mask_stack: Vec<ContentMask<Pixels>>,
    element_offset_stack: Vec<Point<Pixels>>,
    rem_size_override_stack: SmallVec<[Pixels; 8]>,
    element_opacity: f32,
}

impl Window {
    /// Puts the window where the view with id `id` was drawn last frame,
    /// returning what to put back with [`Window::leave_gap`].
    fn enter_gap(
        &mut self,
        id: &GlobalElementId,
        rebuild: &Rebuild,
        content_mask: ContentMask<Pixels>,
        opacity: f32,
    ) -> Inherited {
        let parent_ids = &id.ids[..id.ids.len() - 1];
        Inherited {
            element_id_stack: mem::replace(&mut self.element_id_stack, {
                let mut stack = crate::window::ElementIdStack::default();
                for id in parent_ids {
                    stack.push(id.clone());
                }
                stack
            }),
            text_style_stack: mem::replace(
                &mut self.text_style_stack,
                rebuild.text_style_stack.clone(),
            ),
            layout_direction_stack: mem::replace(
                &mut self.layout_direction_stack,
                rebuild.layout_direction_stack.clone(),
            ),
            content_mask_stack: mem::replace(&mut self.content_mask_stack, vec![content_mask]),
            element_offset_stack: mem::replace(
                &mut self.element_offset_stack,
                vec![rebuild.element_offset],
            ),
            rem_size_override_stack: mem::replace(
                &mut self.rem_size_override_stack,
                SmallVec::from_slice(&[rebuild.rem_size]),
            ),
            element_opacity: mem::replace(&mut self.element_opacity, opacity),
        }
    }

    fn leave_gap(&mut self, inherited: Inherited) {
        self.element_id_stack = inherited.element_id_stack;
        self.text_style_stack = inherited.text_style_stack;
        self.layout_direction_stack = inherited.layout_direction_stack;
        self.content_mask_stack = inherited.content_mask_stack;
        self.element_offset_stack = inherited.element_offset_stack;
        self.rem_size_override_stack = inherited.rem_size_override_stack;
        self.element_opacity = inherited.element_opacity;
    }

    /// Lays out the view `id`, dirty only because views nested in it are, as
    /// it was laid out last frame, with those views built again at their own
    /// nodes, if it can be: nothing it read itself changed, it is hovered as
    /// it was, and the nested views ask for the layout they had.
    pub(crate) fn splice_layout(&mut self, id: &GlobalElementId, cx: &mut App) -> Option<Splice> {
        if self.refreshing
            || cx.has_active_drag()
            || self.is_inspector_picking(cx)
            || self.retained_state.dirty_subtrees.contains(id)
            || self.next_frame.retained.by_id.contains_key(id)
        {
            return None;
        }
        let entity = view_entity(id)?;
        if self.retained_state.notified_entities.contains(&entity) {
            return None;
        }
        let previous = self.rendered_frame.retained.find(id)?;
        let records = &self.rendered_frame.retained.records;
        let record = &records[previous];
        let layout = record.layout.as_ref()?;
        if layout.rem_size != self.rem_size()
            || layout.text_style != self.text_style()
            || cx.dependencies_changed(&record.own_dependencies, self.inside_notified_view())
            || !self.hovers_unchanged(&record.own_hovers)
        {
            return None;
        }

        // The outermost dirty views nested in it are the gaps. Every view
        // around a dirty one is dirty too, so a clean one holds none.
        let mut gaps = Vec::new();
        let mut index = previous + 1;
        while index <= previous + record.nested {
            let nested = &records[index];
            if view_entity(&nested.id).is_some_and(|entity| self.dirty_views.contains(&entity)) {
                if nested.rebuild.is_none()
                    || nested.layout.is_none()
                    || !matches!(nested.paint, PaintStatus::Painted { .. })
                {
                    return None;
                }
                // A splice skips the ancestor's prepaint. If that prepaint
                // places a separate layout root, rebuilding a gap under it
                // would leave its new measurements outside the layout pass.
                // Fall back before claiming nodes or building any gaps so
                // the ancestor can lay out and place that root itself.
                if !self
                    .layout_engine
                    .as_ref()
                    .unwrap()
                    .layout_reaches(layout.root, nested.layout.as_ref().unwrap().root)
                {
                    return None;
                }
                gaps.push(index);
            }
            index += nested.nested + 1;
        }
        if gaps.is_empty() {
            return None;
        }

        // Deferred views are prepainted after their ancestors have closed
        // their records, so they are not among the nested gaps above. Their
        // reads belong to the ancestor's dependencies, but not its own reads.
        // Copying a deferred draw outside the rebuilt gaps could therefore
        // replay a dirty view. Rebuild the ancestor to reach those draws;
        // deferred draws inside a gap are safe because that gap rebuilds them.
        let mut deferred_cursor = record.prepaint_range.start.deferred_draws_index;
        for &gap in &gaps {
            let range = &records[gap].prepaint_range;
            if deferred_cursor != range.start.deferred_draws_index {
                return None;
            }
            deferred_cursor = range.end.deferred_draws_index;
        }
        if deferred_cursor != record.prepaint_range.end.deferred_draws_index {
            return None;
        }

        let mut kept = kept_keys(
            &layout.keys,
            gaps.iter()
                .map(|&gap| records[gap].layout.as_ref().unwrap().keys.as_slice()),
            &mut self.retained_state.splice_keys,
        );
        let mut element_states = kept_element_states(
            &layout.element_states,
            gaps.iter().map(|&gap| {
                records[gap]
                    .layout
                    .as_ref()
                    .unwrap()
                    .element_states
                    .as_slice()
            }),
        );
        // Capture before rebuilding gaps; changes made while they render must
        // still invalidate the ancestor's aggregate on the next frame.
        let entity_updates = cx.entities.access_log.update_generation();
        let previous_layout = layout.clone();
        let engine = self.layout_engine.as_mut().unwrap();
        let transient_before = engine.transient_count();
        if !engine.try_keep_retained(&kept) {
            return None;
        }

        // A gap laid out differently from last frame, at the node it had,
        // changes only what is inside it unless the view's own nodes come out
        // of layout differently too, which is checked once layout is
        // computed. A gap at another node changes the view's own tree.
        let mut built = Vec::with_capacity(gaps.len());
        let mut unchanged = true;
        let mut same_roots = true;
        for gap in gaps {
            let (gap, gap_layout) = self.lay_out_gap(gap, cx)?;
            built.push(gap);
            match gap_layout {
                GapLayout::Unchanged => {}
                GapLayout::Changed => unchanged = false,
                GapLayout::NewRoot => {
                    same_roots = false;
                    break;
                }
            }
        }
        if !same_roots {
            // The view around them is built after all; the views built so
            // far are taken over by their elements there, not built twice.
            self.layout_engine.as_mut().unwrap().release_kept(&kept);
            self.stash_gaps(built);
            return None;
        }

        self.next_frame
            .accessed_element_states
            .extend(element_states.iter().cloned());
        cx.replay_dependencies(&self.rendered_frame.retained.records[previous].dependencies);
        let held = if unchanged {
            Vec::new()
        } else {
            self.layout_engine.as_ref().unwrap().retained_layouts(&kept)
        };
        // The next idle frame keeps this snapshot without walking the gaps.
        // Last frame's keys would lose any newly created nodes (and retain
        // removed element states) even though their scene is still replayed.
        for gap in &built {
            kept.extend_from_slice(&gap.claimed);
            element_states.extend_from_slice(&gap.element_states);
        }
        let layout = (self.layout_engine.as_ref().unwrap().transient_count() == transient_before)
            .then(|| {
                if kept == previous_layout.keys && element_states == previous_layout.element_states
                {
                    previous_layout
                } else {
                    Rc::new(RetainedLayout {
                        root: previous_layout.root,
                        keys: kept,
                        element_states,
                        text_style: previous_layout.text_style.clone(),
                        rem_size: previous_layout.rem_size,
                        parent_layout_key: previous_layout.parent_layout_key,
                    })
                }
            });
        Some(Splice {
            previous,
            entity_updates,
            gaps: built,
            layout,
            held,
        })
    }

    /// Draws the cached view `id` at `bounds` from last frame around the
    /// cached views nested in it that have to be built again, if it can be:
    /// it is dirty only because they are, nothing it read itself changed, it
    /// is drawn where and as it was, and every dirty view in it is a cached
    /// view. A cached view is laid out on its own at the bounds its style gave
    /// it, so building one again where it was leaves the view around it laid
    /// out as it was, and no layout has to be redone around it.
    pub(crate) fn splice_cached(
        &mut self,
        id: &GlobalElementId,
        bounds: Bounds<Pixels>,
        layout: Option<Rc<crate::fast::retained::RetainedLayout>>,
        cx: &mut App,
    ) -> Option<Splice> {
        if self.refreshing
            || cx.has_active_drag()
            || self.is_inspector_picking(cx)
            || self.retained_state.dirty_subtrees.contains(id)
            || self.next_frame.retained.by_id.contains_key(id)
        {
            return None;
        }
        let entity = view_entity(id)?;
        if self.retained_state.notified_entities.contains(&entity) {
            return None;
        }
        let previous = self.rendered_frame.retained.find(id)?;
        if !self.retained_context_matches(previous, bounds) {
            return None;
        }
        let records = &self.rendered_frame.retained.records;
        let record = &records[previous];
        if cx.notified_dependencies_changed(&record.own_dependencies)
            || !self.hovers_unchanged(&record.own_hovers)
        {
            return None;
        }

        let mut gaps = Vec::new();
        let mut index = previous + 1;
        while index <= previous + record.nested {
            let nested = &records[index];
            if view_entity(&nested.id).is_some_and(|entity| self.dirty_views.contains(&entity)) {
                if !nested
                    .rebuild
                    .as_ref()
                    .is_some_and(|rebuild| rebuild.is_cached())
                    || !matches!(nested.paint, PaintStatus::Painted { .. })
                {
                    return None;
                }
                gaps.push(index);
            }
            index += nested.nested + 1;
        }
        if gaps.is_empty() {
            return None;
        }
        // As in `splice_layout`: deferred draws outside the gaps could replay
        // a dirty view.
        let mut deferred_cursor = record.prepaint_range.start.deferred_draws_index;
        for &gap in &gaps {
            let range = &records[gap].prepaint_range;
            if deferred_cursor != range.start.deferred_draws_index {
                return None;
            }
            deferred_cursor = range.end.deferred_draws_index;
        }
        if deferred_cursor != record.prepaint_range.end.deferred_draws_index {
            return None;
        }

        let entity_updates = cx.entities.access_log.update_generation();
        let gaps = gaps
            .into_iter()
            .map(|gap| self.cached_gap(gap, cx))
            .collect::<Option<Vec<_>>>()?;
        Some(Splice {
            previous,
            entity_updates,
            gaps,
            layout,
            held: Vec::new(),
        })
    }

    /// The cached view last frame's record `record` stands for, to be built
    /// again where it was, at the bounds it had.
    fn cached_gap(&mut self, record: usize, cx: &mut App) -> Option<Gap> {
        let nested = &self.rendered_frame.retained.records[record];
        let rebuild = nested.rebuild.clone()?;
        let previous_layout = nested.layout.clone();
        let global_id = nested.id.clone();
        let bounds = nested.context.bounds;
        let element_id = global_id.ids.last().cloned()?;
        let layout_id = previous_layout.as_ref()?.root;
        let layout_key = self.with_parent_layout_key(rebuild.parent_layout_key, |window| {
            let key = crate::fast::layout_key::push_layout_key(window, Some(&element_id));
            crate::fast::layout_key::pop_layout_key(window);
            key
        });
        let mut view = ViewElement::new(rebuild.view.clone()).rebuildable(rebuild.view.clone());
        view.cached_style = rebuild.cached_style.clone();
        // Nothing is read laying it out, but what it reads from here on is
        // checked from now.
        let recording = cx.begin_recording_dependencies();
        let dependencies = cx.finish_recording_dependencies(recording);
        let read = dependencies.all.clone();
        Some(Gap {
            record,
            global_id,
            view,
            layout: crate::fast::retained::cached_layout_state(previous_layout, dependencies),
            layout_id,
            bounds: Some(bounds),
            layout_key,
            claimed: Vec::new(),
            element_states: Vec::new(),
            dependencies: read,
            prepainted: None,
        })
    }

    /// Whether the view `splice` draws around its gaps came out of this
    /// frame's layout as it did last frame, so that what it drew around them
    /// still stands. Checked once layout is computed, when a gap was laid out
    /// differently.
    pub(crate) fn splice_layout_holds(&self, splice: &Splice) -> bool {
        self.layout_engine
            .as_ref()
            .unwrap()
            .layouts_unchanged(&splice.held)
    }

    /// Builds the view last frame's record `record` stands for again, where
    /// it was, and lays it out, returning it and how its layout compares with
    /// the one it had.
    fn lay_out_gap(&mut self, record: usize, cx: &mut App) -> Option<(Gap, GapLayout)> {
        let nested = &self.rendered_frame.retained.records[record];
        let rebuild = nested.rebuild.clone()?;
        let root = nested.layout.as_ref()?.root;
        let global_id = nested.id.clone();
        let context = nested.context.clone();
        let element_id = global_id.ids.last().cloned()?;

        let engine = self.layout_engine.as_ref().unwrap();
        let (changes, remeasures, transient) = (
            engine.layout_changes(),
            engine.remeasures(),
            engine.transient_count(),
        );
        let recording = self.record_claimed_layout_keys();
        let element_states_start = self.next_frame.accessed_element_states.len();
        let dependency_recording = cx.begin_recording_dependencies();
        let inherited = self.enter_gap(&global_id, &rebuild, context.content_mask, context.opacity);
        let mut view = ViewElement::new(rebuild.view.clone()).rebuildable(rebuild.view.clone());
        view.cached_style = rebuild.cached_style.clone();
        // What its element's request for layout does, inside the view around
        // it.
        let (layout_id, layout, layout_key) =
            self.with_parent_layout_key(rebuild.parent_layout_key, |window| {
                let layout_key =
                    crate::fast::layout_key::push_layout_key(window, Some(&element_id));
                window.element_id_stack.push(element_id.clone());
                let (layout_id, layout) = crate::fast::retained::request_view_layout(
                    &mut view,
                    Some(&global_id),
                    window,
                    cx,
                );
                window.element_id_stack.pop();
                crate::fast::layout_key::pop_layout_key(window);
                (layout_id, layout, layout_key)
            });
        self.leave_gap(inherited);
        let dependencies = cx.finish_recording_dependencies(dependency_recording).all;
        let element_states =
            self.next_frame.accessed_element_states[element_states_start..].to_vec();
        let claimed = self.finish_recording_claimed_layout_keys(recording);

        let engine = self.layout_engine.as_ref().unwrap();
        let gap_layout = if layout_id != root {
            GapLayout::NewRoot
        } else if engine.layout_changes() == changes
            && engine.remeasures() == remeasures
            && engine.transient_count() == transient
        {
            GapLayout::Unchanged
        } else {
            GapLayout::Changed
        };
        Some((
            Gap {
                record,
                global_id,
                view,
                layout,
                layout_id,
                bounds: None,
                layout_key,
                claimed,
                element_states,
                dependencies,
                prepainted: None,
            },
            gap_layout,
        ))
    }

    /// Keeps views built for a splice that did not happen, for their elements
    /// to take over. See [`Window::take_prebuilt`].
    fn stash_gaps(&mut self, gaps: Vec<Gap>) {
        for gap in gaps {
            self.retained_state.prebuilt.insert(
                gap.global_id,
                PrebuiltGap {
                    prebuilt: Prebuilt {
                        view: gap.view,
                        layout: gap.layout,
                    },
                    layout_id: gap.layout_id,
                    claimed: gap.claimed,
                    element_states: gap.element_states,
                    dependencies: gap.dependencies,
                },
            );
        }
    }

    /// The view built for the element `id` by a splice that did not happen,
    /// if there is one, with the layout it requested. The view being built
    /// around it takes over its nodes, the element states it used and what it
    /// read, as though it had built it itself.
    pub(crate) fn take_prebuilt(
        &mut self,
        id: &GlobalElementId,
        cx: &mut App,
    ) -> Option<(Prebuilt, LayoutId)> {
        let gap = self.retained_state.prebuilt.remove(id)?;
        self.layout_engine
            .as_mut()
            .unwrap()
            .adopt_claimed(&gap.claimed);
        self.next_frame
            .accessed_element_states
            .extend(gap.element_states);
        cx.replay_dependencies(&gap.dependencies);
        Some((gap.prebuilt, gap.layout_id))
    }

    /// Hands the views [`Window::splice_layout`] built over to their elements,
    /// for a view that has to be built after all.
    pub(crate) fn abandon_splice(&mut self, splice: Splice) {
        self.stash_gaps(splice.gaps);
    }

    /// Prepaints the view `id` that [`Window::splice_layout`] laid out: last
    /// frame's prepaint, copied around the gaps, and the gaps prepainted where
    /// they were.
    pub(crate) fn splice_prepaint(
        &mut self,
        id: &GlobalElementId,
        splice: Splice,
        cx: &mut App,
    ) -> ViewPrepaint {
        let Splice {
            previous,
            mut gaps,
            layout,
            entity_updates,
            ..
        } = splice;
        let writes_now = cx.entities.write_generation();
        let source = &self.rendered_frame.retained;
        let record = &source.records[previous];
        let prepaint_range = record.prepaint_range.clone();
        let last = previous + record.nested;
        let kept_layout_keys = kept_keys(
            &record.layout_keys,
            gaps.iter()
                .map(|gap| &*source.records[gap.record].layout_keys),
            &mut self.retained_state.splice_keys,
        );
        let mut own = copy_record(record, prepaint_range.clone(), 0);
        own.layout = layout;
        // Painted by `splice_paint`, if at all.
        own.paint = PaintStatus::Unpainted;
        self.keep_retained_layout(&kept_layout_keys);
        self.layout_engine
            .as_mut()
            .unwrap()
            .retention
            .stats
            .views_reused += 1;

        let target = &mut self.next_frame.retained;
        target.reused_any = true;
        let index = target.push(own);
        target.open.push(index);
        self.retained_state.subtree_stack.push(id.clone());

        let start = self.prepaint_index();
        let mut dispatch = OpenDispatchCopy::default();
        let mut copied = Vec::new();
        let mut cursor = prepaint_range.start.clone();
        let mut next_record = previous + 1;
        for segment in 0..gaps.len() {
            let gap = &gaps[segment];
            let gap_record = &self.rendered_frame.retained.records[gap.record];
            let gap_range = gap_record.prepaint_range.clone();
            let gap_nested = gap_record.nested;
            let context = gap_record.context.clone();
            let rebuild = gap_record.rebuild.clone().unwrap();
            let gap_id = gap_record.id.clone();

            let segment_start = self.prepaint_index();
            let removed_states = self.copy_prepaint_segment(
                cursor.clone()..gap_range.start.clone(),
                &gaps,
                &mut dispatch,
            );
            self.copy_records(
                next_record..gap.record,
                &cursor,
                &segment_start,
                &removed_states,
                (segment, index),
                &mut copied,
            );

            // The gap hangs off the dispatch node it hung off last frame: its
            // element's own node, which its element pushed before the view
            // began and which was copied with the stretch before it. Pushing
            // another would nest the gap one node deeper every frame.
            let parent =
                self.rendered_frame.dispatch_tree.nodes[gap_range.start.dispatch_tree_index].parent;
            dispatch.unwind_to(parent, &mut self.next_frame.dispatch_tree);
            let copied_node = parent
                .and_then(|parent| dispatch.copied(parent))
                .filter(|&node| self.next_frame.dispatch_tree.active_node_id() == Some(node));
            let inherited =
                self.enter_gap(&gap_id, &rebuild, context.content_mask, context.opacity);
            // What its element's prepaint does, inside the view around it.
            let bounds = gap
                .bounds
                .unwrap_or_else(|| self.layout_bounds(gap.layout_id));
            self.element_id_stack.push(gap.element_id());
            let node = match copied_node {
                Some(node) => node,
                None => self.next_frame.dispatch_tree.push_node(),
            };
            let scope = crate::fast::layout_key::enter_prepaint_scope(self, gap.layout_key);
            let gap = &mut gaps[segment];
            let prepaint = crate::fast::retained::prepaint_view(
                &mut gap.view,
                Some(&gap.global_id),
                bounds,
                &mut gap.layout,
                self,
                cx,
            );
            crate::fast::layout_key::exit_prepaint_scope(self, scope);
            if copied_node.is_none() {
                self.next_frame.dispatch_tree.pop_node();
            }
            self.element_id_stack.pop();
            gap.prepainted = Some((node, prepaint));
            self.leave_gap(inherited);

            cursor = gap_range.end.clone();
            next_record = gap.record + gap_nested + 1;
        }
        let segment = gaps.len();
        let segment_start = self.prepaint_index();
        let removed_states =
            self.copy_prepaint_segment(cursor.clone()..prepaint_range.end, &gaps, &mut dispatch);
        self.copy_records(
            next_record..last + 1,
            &cursor,
            &segment_start,
            &removed_states,
            (segment, index),
            &mut copied,
        );
        dispatch.close(&mut self.next_frame.dispatch_tree);
        let end = self.prepaint_index();

        self.retained_state.subtree_stack.pop();
        let target = &mut self.next_frame.retained;
        debug_assert_eq!(target.open.last(), Some(&index));
        target.open.pop();
        let nested = target.records.len() - index - 1;

        // The gaps' layout keys, dependencies and hovers are this frame's.
        let mut layout_keys = kept_layout_keys;
        // What the view read itself was checked before it was spliced, so it
        // is up to date with every write so far.
        let mut dependencies = self.rendered_frame.retained.records[previous]
            .dependencies
            .written_up_to(writes_now);
        // Advance only the aggregate; each view keeps its own read checkpoint.
        dependencies.updates = entity_updates;
        for gap in &gaps {
            let gap_id = &self.rendered_frame.retained.records[gap.record].id;
            if let Some(&gap_index) = target.by_id.get(gap_id) {
                let gap_record = &target.records[gap_index];
                layout_keys.extend(gap_record.layout_keys.iter().copied());
                dependencies = dependencies.union(&gap_record.dependencies);
            }
        }
        // The union only grows: a view that is spliced frame after frame would
        // keep every entity the views in it ever read, and replay them all on
        // every frame. Those that were released cannot change, so they go.
        let previous_dependencies = &self.rendered_frame.retained.records[previous].dependencies;
        if !dependencies.shares_entities_with(previous_dependencies) {
            dependencies = dependencies.without_released_entities(cx);
        }
        let record = &mut target.records[index];
        record.prepaint_range = start..end;
        record.nested = nested;
        record.layout_keys = layout_keys.into();
        record.dependencies = dependencies;

        ViewPrepaint::Spliced(SplicedPrepaint {
            previous,
            index,
            gaps,
            copied,
        })
    }

    /// Copies last frame's prepaint of `range` as [`Window::reuse_prepaint`]
    /// does, but leaves the dispatch nodes it enters open in `dispatch`, for
    /// what follows to hang off them.
    fn copy_prepaint_segment(
        &mut self,
        range: Range<PrepaintStateIndex>,
        gaps: &[Gap],
        dispatch: &mut OpenDispatchCopy,
    ) -> Vec<usize> {
        self.next_frame.hitboxes.extend(
            self.rendered_frame.hitboxes[range.start.hitboxes_index..range.end.hitboxes_index]
                .iter()
                .cloned(),
        );
        self.next_frame.tooltip_requests.extend(
            self.rendered_frame.tooltip_requests
                [range.start.tooltips_index..range.end.tooltips_index]
                .iter_mut()
                .map(|request| request.take()),
        );
        let removed_states = copy_splice_state_accesses(
            self,
            range.start.accessed_element_states_index..range.end.accessed_element_states_index,
            gaps,
        );
        self.text_system()
            .reuse_layouts(range.start.line_layout_index..range.end.line_layout_index);

        let contains_focus = dispatch.copy(
            range.start.dispatch_tree_index..range.end.dispatch_tree_index,
            &mut self.rendered_frame.dispatch_tree,
            &mut self.next_frame.dispatch_tree,
            self.focus,
        );
        if contains_focus {
            self.next_frame.focus = self.focus;
        }

        for deferred_draw in &self.rendered_frame.deferred_draws
            [range.start.deferred_draws_index..range.end.deferred_draws_index]
        {
            self.next_frame.deferred_draws.push(DeferredDraw {
                current_view: deferred_draw.current_view,
                parent_node: dispatch.refresh(deferred_draw.parent_node),
                element_id_stack: deferred_draw.element_id_stack.clone(),
                text_style_stack: deferred_draw.text_style_stack.clone(),
                layout_direction_stack: deferred_draw.layout_direction_stack.clone(),
                content_mask: deferred_draw.content_mask,
                rem_size: deferred_draw.rem_size,
                priority: deferred_draw.priority,
                element: None,
                absolute_offset: deferred_draw.absolute_offset,
                prepaint_range: deferred_draw.prepaint_range.clone(),
                paint_range: deferred_draw.paint_range.clone(),
                accessed_entities: deferred_draw.accessed_entities.clone(),
                enclosing_retained: EnclosingRetained::default(),
            });
        }
        removed_states
    }

    /// Copies last frame's records `records`, whose prepaint was copied from
    /// `from` on to `to`, into this frame inside the spliced view `anchor`,
    /// adding to `copied` where they went and `segment`, for their paint to
    /// be shifted by it.
    fn copy_records(
        &mut self,
        records: Range<usize>,
        from: &PrepaintStateIndex,
        to: &PrepaintStateIndex,
        removed_states: &[usize],
        (segment, anchor): (usize, usize),
        copied: &mut Vec<(usize, usize)>,
    ) {
        let source = &self.rendered_frame.retained;
        let target = &mut self.next_frame.retained;
        copied.reserve(records.len());
        for index in records {
            let record = &source.records[index];
            let mut prepaint_range = record.prepaint_range.start.shifted(from, to)
                ..record.prepaint_range.end.shifted(from, to);
            if !removed_states.is_empty() {
                // Each boundary loses only accesses removed before it.
                prepaint_range.start.accessed_element_states_index -= removed_states
                    .partition_point(|&removed| {
                        removed < record.prepaint_range.start.accessed_element_states_index
                    });
                prepaint_range.end.accessed_element_states_index -=
                    removed_states.partition_point(|&removed| {
                        removed < record.prepaint_range.end.accessed_element_states_index
                    });
            }
            let painted = matches!(record.paint, PaintStatus::Painted { .. });
            let mut copy = copy_record(record, prepaint_range, anchor);
            if !painted {
                copy.paint = PaintStatus::Unpainted;
            }
            copied.push((target.push(copy), segment));
        }
    }

    /// Paints the view [`Window::splice_prepaint`] prepainted: last frame's
    /// paint, copied around the gaps, and the gaps painted where they were.
    pub(crate) fn splice_paint(
        &mut self,
        id: &GlobalElementId,
        spliced: &mut SplicedPrepaint,
        cx: &mut App,
    ) {
        let SplicedPrepaint {
            previous,
            index,
            gaps,
            copied,
        } = spliced;
        let record = &self.rendered_frame.retained.records[*previous];
        let paint_range = record.paint_range.clone();
        let own_hovers = record.own_hovers.clone();

        self.retained_state.subtree_stack.push(id.clone());
        // The gaps' hovers are nested in this view's.
        self.retained_state
            .open_paints
            .push(OpenPaint { nested: Vec::new() });
        let hovers_start = self.retained_state.hover_dependencies.len();
        let start = self.paint_index();
        let mut segments: Vec<(PaintIndex, PaintIndex)> = Vec::with_capacity(gaps.len() + 1);
        let mut cursor = paint_range.start.clone();
        for gap in gaps.iter_mut() {
            let gap_record = &self.rendered_frame.retained.records[gap.record];
            let gap_range = gap_record.paint_range.clone();
            let context = gap_record.context.clone();
            let rebuild = gap_record.rebuild.clone().unwrap();
            let gap_id = gap_record.id.clone();

            segments.push((cursor.clone(), self.paint_index()));
            self.reuse_paint(cursor.clone()..gap_range.start.clone());
            let inherited =
                self.enter_gap(&gap_id, &rebuild, context.content_mask, context.opacity);
            // What its element's paint does, inside the view around it.
            let element_id = gap.element_id();
            if let Some((node, prepaint)) = gap.prepainted.as_mut() {
                self.element_id_stack.push(element_id);
                self.next_frame.dispatch_tree.set_active_node(*node);
                crate::fast::retained::paint_view(
                    &mut gap.view,
                    Some(&gap.global_id),
                    prepaint,
                    self,
                    cx,
                );
                self.element_id_stack.pop();
            }
            self.leave_gap(inherited);
            cursor = gap_range.end.clone();
        }
        segments.push((cursor.clone(), self.paint_index()));
        self.reuse_paint(cursor..paint_range.end);
        let end = self.paint_index();

        // The records copied along with it land where their stretch did.
        let mut copied_hovers: Vec<(HitboxId, bool)> = Vec::new();
        for &(copy, segment) in copied.iter() {
            let (from, to) = &segments[segment];
            let record = &mut self.next_frame.retained.records[copy];
            if let PaintStatus::Pending { .. } = record.paint {
                record.paint_range = record.paint_range.start.shifted(from, to)
                    ..record.paint_range.end.shifted(from, to);
                record.paint = PaintStatus::Painted { source: None };
                copied_hovers.extend_from_slice(&record.hover_dependencies);
            }
        }

        // Its hovers: its own, the copied records', and the gaps' new ones,
        // which painting them added.
        let gap_hovers = &self.retained_state.hover_dependencies[hovers_start..];
        let mut hovers =
            Vec::with_capacity(own_hovers.len() + copied_hovers.len() + gap_hovers.len());
        hovers.extend_from_slice(&own_hovers);
        hovers.extend_from_slice(&copied_hovers);
        hovers.extend_from_slice(gap_hovers);
        let record = &mut self.next_frame.retained.records[*index];
        record.paint_range = start..end;
        record.paint = PaintStatus::Painted { source: None };
        record.hover_dependencies = hovers.into();
        self.retained_state.open_paints.pop();
        self.retained_state.subtree_stack.pop();

        // As for a view drawn from last frame, a hover found changed only now
        // builds it on the next frame.
        if !(self.hovers_unchanged(&own_hovers) && self.hovers_unchanged(&copied_hovers)) {
            self.retained_state
                .subtrees_dirty_next_frame
                .extend(self.retained_state.subtree_stack.iter().cloned());
            self.retained_state
                .subtrees_dirty_next_frame
                .insert(id.clone());
            self.request_animation_frame();
        }
        // The views around it depend on its hovers too, but not as their own.
        self.retained_state
            .hover_dependencies
            .truncate(hovers_start);
        let all = self.next_frame.retained.records[*index]
            .hover_dependencies
            .clone();
        self.add_nested_hovers(&all);
    }
}

fn copy_splice_state_accesses(
    window: &mut Window,
    range: Range<usize>,
    gaps: &[Gap],
) -> Vec<usize> {
    if range.is_empty() {
        return Vec::new();
    }
    let source = &window.rendered_frame;
    let states = &source.accessed_element_states[range.clone()];
    let target = &mut window.next_frame;
    if gaps.is_empty() {
        target.accessed_element_states.extend_from_slice(states);
        Vec::new()
    } else {
        match gaps {
            [gap] => {
                let prefix = &gap.global_id.ids;
                let depth = prefix.len() - 1;
                let view = &prefix[depth];
                copy_state_accesses(
                    states,
                    &mut target.accessed_element_states,
                    range.start,
                    |id| id.ids.get(depth) == Some(view) && id.ids.starts_with(prefix),
                )
            }
            _ => copy_state_accesses(
                states,
                &mut target.accessed_element_states,
                range.start,
                |id| {
                    gaps.iter().any(|gap| {
                        let prefix = &gap.global_id.ids;
                        id.ids.get(prefix.len() - 1) == prefix.last() && id.ids.starts_with(prefix)
                    })
                },
            ),
        }
    }
}

/// A gap's state accesses may occur anywhere, including in another view's
/// prepaint. Only the actual accesses prove that a copied stretch needs no
/// filtering. Copy its clean prefix in bulk, then filter after the first match.
fn copy_state_accesses(
    states: &[(GlobalElementId, TypeId)],
    target: &mut Vec<(GlobalElementId, TypeId)>,
    start: usize,
    in_gap: impl Fn(&GlobalElementId) -> bool,
) -> Vec<usize> {
    let Some(first) = states.iter().position(|(id, _)| in_gap(id)) else {
        target.extend_from_slice(states);
        return Vec::new();
    };
    target.extend_from_slice(&states[..first]);
    let mut removed = vec![start + first];
    target.extend(states[first + 1..].iter().enumerate().filter_map(
        |(offset, state @ (id, _))| {
            if in_gap(id) {
                removed.push(start + first + 1 + offset);
                None
            } else {
                Some(state.clone())
            }
        },
    ));
    removed
}

/// A copy of `record`, with its prepaint at `prepaint_range` in this frame and
/// its paint to be placed once `anchor`, the view it was copied along with,
/// is painted. A spliced view places it itself; if it is never painted, the
/// copy is forgotten at the end of the frame.
fn copy_record(
    record: &RetainedSubtree,
    prepaint_range: Range<PrepaintStateIndex>,
    anchor: usize,
) -> RetainedSubtree {
    RetainedSubtree {
        id: record.id.clone(),
        prepaint_range,
        paint_range: record.paint_range.clone(),
        paint: PaintStatus::Pending { anchor },
        nested: record.nested,
        context: record.context.clone(),
        dependencies: record.dependencies.clone(),
        own_dependencies: record.own_dependencies.clone(),
        render_dependencies: record.render_dependencies.clone(),
        hover_dependencies: record.hover_dependencies.clone(),
        own_hovers: record.own_hovers.clone(),
        layout_keys: record.layout_keys.clone(),
        layout: record.layout.clone(),
        rebuild: record.rebuild.clone(),
    }
}

/// The entity of the view whose element has the id `id`.
#[inline(always)]
pub(crate) fn view_entity(id: &GlobalElementId) -> Option<EntityId> {
    match id.ids.last()? {
        ElementId::View(entity) => Some(*entity),
        _ => None,
    }
}

/// Last frame's dispatch nodes copied stretch by stretch, with the nodes the
/// copy is inside of left open between stretches.
#[derive(Default)]
struct OpenDispatchCopy {
    /// Last frame's nodes the copy is inside of, innermost last.
    open: Vec<DispatchNodeId>,
    /// Each stretch copied, and where it landed.
    stretches: Vec<(Range<usize>, usize)>,
}

impl OpenDispatchCopy {
    /// Copies the nodes `range` of `source` into `target`, returning whether
    /// one of them holds `focus`.
    fn copy(
        &mut self,
        range: Range<usize>,
        source: &mut DispatchTree,
        target: &mut DispatchTree,
        focus: Option<FocusId>,
    ) -> bool {
        self.stretches.push((range.clone(), target.len()));
        crate::fast::dispatch::copy_nodes(target, source, range, Some(&mut self.open), focus)
    }

    /// Closes open nodes until the innermost is `parent`, or none is.
    fn unwind_to(&mut self, parent: Option<DispatchNodeId>, target: &mut DispatchTree) {
        while let Some(&open) = self.open.last() {
            if Some(open) == parent {
                break;
            }
            self.open.pop();
            target.pop_node();
        }
    }

    fn close(&mut self, target: &mut DispatchTree) {
        self.unwind_to(None, target);
    }

    /// Where last frame's node `node`, which was copied, is now.
    fn refresh(&self, node: DispatchNodeId) -> DispatchNodeId {
        self.copied(node)
            .expect("a copied deferred draw hangs off a copied node")
    }

    /// Where last frame's node `node` is now, if it was copied.
    fn copied(&self, node: DispatchNodeId) -> Option<DispatchNodeId> {
        let (range, start) = self
            .stretches
            .iter()
            .find(|(range, _)| range.contains(&node.0))?;
        Some(DispatchNodeId(node.0 - range.start + start))
    }
}

/// `keys` without the keys of `gaps`, in their order: the layout nodes a view
/// drawn from last frame keeps, besides those of the nested views built
/// again in it.
///
/// Keys are recorded in the order they are claimed, so a nested view's keys
/// usually lie in the view's in one stretch, and the gaps' stretches follow
/// one another as the gaps do. When they do, only the keys outside those
/// stretches can be kept, and only those are looked up; when the stretches
/// cover every key, none is kept and nothing is looked up. Otherwise the
/// gaps' keys are gathered into `scratch`, which keeps its room from one
/// splice to the next.
/// The element states a view drawn around `gaps` keeps from last frame: those
/// it used itself. Its record lists every state used while its layout was
/// requested, the nested views' included, and a nested view built again in
/// its gap uses its own states anew; one it no longer uses, such as the state
/// of an element it no longer has, is dropped at the end of the frame, as
/// upstream drops the state of every element a frame does not draw.
pub(crate) fn kept_element_states<'a>(
    element_states: &[(GlobalElementId, std::any::TypeId)],
    gaps: impl Iterator<Item = &'a [(GlobalElementId, std::any::TypeId)]>,
) -> Vec<(GlobalElementId, std::any::TypeId)> {
    let in_gaps: FxHashSet<&(GlobalElementId, std::any::TypeId)> = gaps.flatten().collect();
    element_states
        .iter()
        .filter(|state| !in_gaps.contains(state))
        .cloned()
        .collect()
}

pub(crate) fn kept_keys<'a>(
    keys: &[u64],
    gaps: impl Iterator<Item = &'a [u64]> + Clone,
    scratch: &mut FxHashSet<u64>,
) -> Vec<u64> {
    scratch.clear();
    let mut outside: SmallVec<[Range<usize>; 4]> = SmallVec::new();
    let mut cursor = 0;
    let mut in_stretches = true;
    for gap in gaps.clone() {
        let Some(&first) = gap.first() else {
            continue;
        };
        let start = keys[cursor..]
            .iter()
            .position(|&key| key == first)
            .map(|offset| cursor + offset);
        match start {
            Some(start) if keys.get(start..start + gap.len()) == Some(gap) => {
                if start > cursor {
                    outside.push(cursor..start);
                }
                cursor = start + gap.len();
            }
            _ => {
                in_stretches = false;
                break;
            }
        }
    }

    if !in_stretches {
        scratch.extend(gaps.flatten().copied());
        let kept = keys
            .iter()
            .copied()
            .filter(|key| !scratch.contains(key))
            .collect();
        scratch.clear();
        return kept;
    }
    if cursor < keys.len() {
        outside.push(cursor..keys.len());
    }
    if outside.is_empty() {
        return Vec::new();
    }
    // A key outside the stretches may still be a gap's, recorded twice.
    scratch.extend(
        outside
            .iter()
            .flat_map(|range| keys[range.clone()].iter().copied()),
    );
    for key in gaps.flatten() {
        scratch.remove(key);
        if scratch.is_empty() {
            break;
        }
    }
    let kept = outside
        .iter()
        .flat_map(|range| keys[range.clone()].iter().copied())
        .filter(|key| scratch.contains(key))
        .collect();
    scratch.clear();
    kept
}
