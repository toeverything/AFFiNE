use crate::collections::FxHashSet;
use crate::{
    AbsoluteLength, App, Bounds, DefiniteLength, Edges, GridTemplate, Length, Pixels, Point, Size,
    Style, Window, size,
    util::{
        ceil_to_device_pixel, round_half_toward_zero, round_stroke_to_device_pixel,
        round_to_device_pixel,
    },
};
use std::{fmt::Debug, ops::Range};
use taffy::{
    TaffyTree, TraversePartialTree as _,
    geometry::{Point as TaffyPoint, Rect as TaffyRect, Size as TaffySize},
    prelude::{max_content, min_content},
    style::AvailableSpace as TaffyAvailableSpace,
    tree::NodeId,
};

pub(crate) type StackSafe<T> = T;

pub(crate) type MeasureFn =
    dyn FnMut(Size<Option<Pixels>>, Size<AvailableSpace>, &mut Window, &mut App) -> Size<Pixels>;
type NodeMeasureFn = StackSafe<Box<MeasureFn>>;

pub(crate) struct NodeContext {
    pub(crate) measure: NodeMeasureFn,
}
pub struct TaffyLayoutEngine {
    pub(crate) taffy: TaffyTree<NodeContext>,
    pub(crate) retention: crate::fast::layout::LayoutRetention,
    pub(crate) absolute_layout_bounds: crate::fast::layout_bounds::LayoutIdMap<Bounds<Pixels>>,
    /// Unrounded absolute border-box top-left per-node coordinate in device pixels.
    pub(crate) absolute_outer_origins: crate::fast::layout_bounds::LayoutIdMap<Point<f32>>,
    computed_layouts: FxHashSet<LayoutId>,
    pub(crate) layout_bounds_scratch_space: Vec<LayoutId>,
}

const EXPECT_MESSAGE: &str = "we should avoid taffy layout errors by construction if possible";

impl TaffyLayoutEngine {
    pub fn new() -> Self {
        let mut taffy = TaffyTree::new();
        taffy.disable_rounding();
        TaffyLayoutEngine {
            taffy,
            retention: crate::fast::layout::LayoutRetention::default(),
            absolute_layout_bounds: crate::fast::layout_bounds::LayoutIdMap::default(),
            absolute_outer_origins: crate::fast::layout_bounds::LayoutIdMap::default(),
            computed_layouts: FxHashSet::default(),
            layout_bounds_scratch_space: Vec::new(),
        }
    }

    pub fn clear(&mut self) {
        crate::fast::layout::release_unclaimed_nodes(self);
        self.absolute_layout_bounds.clear();
        self.absolute_outer_origins.clear();
        self.computed_layouts.clear();
    }

    pub fn request_layout(
        &mut self,
        fast_key: Option<u64>,
        style: Style,
        rem_size: Pixels,
        scale_factor: f32,
        children: &[LayoutId],
    ) -> LayoutId {
        crate::fast::layout::request_retained_layout(
            self,
            fast_key,
            &style,
            rem_size,
            scale_factor,
            children,
        )
    }

    pub fn request_measured_layout(
        &mut self,
        fast_key: Option<u64>,
        style: Style,
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
        crate::fast::layout::request_retained_measured_layout(
            self,
            fast_key,
            &style,
            rem_size,
            scale_factor,
            measure,
        )
    }

    /// Treats any `auto` dimension of the given node's style as filling `size`.
    ///
    /// This is applied to window roots before layout so they behave like the
    /// root element on the web, which stretches to fill the initial containing
    /// block (the viewport) unless given an explicit size. Explicitly styled
    /// dimensions are preserved.
    pub fn stretch_auto_size_to_fill(
        &mut self,
        id: LayoutId,
        size: Size<Pixels>,
        scale_factor: f32,
    ) {
        crate::fast::layout::stretch_retained_auto_size_to_fill(self, id, size, scale_factor);
    }

    // Used to understand performance
    #[allow(dead_code)]
    fn count_all_children(&self, parent: LayoutId) -> anyhow::Result<u32> {
        let mut count = 0;

        for child in self.taffy.children(parent.0)? {
            // Count this child.
            count += 1;

            // Count all of this child's children.
            count += self.count_all_children(LayoutId(child))?
        }

        Ok(count)
    }

    // Used to understand performance
    #[allow(dead_code)]
    fn max_depth(&self, depth: u32, parent: LayoutId) -> anyhow::Result<u32> {
        println!(
            "{parent:?} at depth {depth} has {} children",
            self.taffy.child_count(parent.0)
        );

        let mut max_child_depth = 0;

        for child in self.taffy.children(parent.0)? {
            max_child_depth = std::cmp::max(max_child_depth, self.max_depth(0, LayoutId(child))?);
        }

        Ok(depth + 1 + max_child_depth)
    }

    // Used to understand performance
    #[allow(dead_code)]
    fn get_edges(&self, parent: LayoutId) -> anyhow::Result<Vec<(LayoutId, LayoutId)>> {
        let mut edges = Vec::new();

        for child in self.taffy.children(parent.0)? {
            edges.push((parent, LayoutId(child)));

            edges.extend(self.get_edges(LayoutId(child))?);
        }

        Ok(edges)
    }

    pub fn compute_layout(
        &mut self,
        id: LayoutId,
        available_space: Size<AvailableSpace>,
        window: &mut Window,
        cx: &mut App,
    ) {
        // Leaving this here until we have a better instrumentation approach.
        // println!("Laying out {} children", self.count_all_children(id)?);
        // println!("Max layout depth: {}", self.max_depth(0, id)?);

        // Output the edges (branches) of the tree in Mermaid format for visualization.
        // println!("Edges:");
        // for (a, b) in self.get_edges(id)? {
        //     println!("N{} --> N{}", u64::from(a), u64::from(b));
        // }
        //

        if !self.computed_layouts.insert(id) {
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
        }

        let scale_factor = window.scale_factor();

        let transform = |v: AvailableSpace| match v {
            AvailableSpace::Definite(pixels) => {
                AvailableSpace::Definite(Pixels(pixels.0 * scale_factor))
            }
            AvailableSpace::MinContent => AvailableSpace::MinContent,
            AvailableSpace::MaxContent => AvailableSpace::MaxContent,
        };
        let available_space = size(
            transform(available_space.width),
            transform(available_space.height),
        );

        crate::fast::layout::replay_pending_measures(self, window, cx);
        let mut measures = crate::fast::stats::begin_measure_tally(self);
        self.taffy
            .compute_layout_with_measure(
                id.into(),
                available_space.into(),
                |input, _id, node_context, style| {
                    taffy::compute_leaf_layout(
                        input,
                        style,
                        |_, _| 0.0,
                        |known_dimensions, available_space| {
                            let Some(node_context) = node_context else {
                                return taffy::geometry::Size::default();
                            };
                            let started = crate::fast::stats::MeasureTally::start(&measures);

                            let known_dimensions = Size {
                                width: known_dimensions.width.map(|e| Pixels(e / scale_factor)),
                                height: known_dimensions.height.map(|e| Pixels(e / scale_factor)),
                            };

                            let available_space: Size<AvailableSpace> = available_space.into();
                            let untransform = |ev: AvailableSpace| match ev {
                                AvailableSpace::Definite(pixels) => {
                                    AvailableSpace::Definite(Pixels(pixels.0 / scale_factor))
                                }
                                AvailableSpace::MinContent => AvailableSpace::MinContent,
                                AvailableSpace::MaxContent => AvailableSpace::MaxContent,
                            };
                            let available_space = size(
                                untransform(available_space.width),
                                untransform(available_space.height),
                            );

                            let measured_size: Size<Pixels> = (node_context.measure)(
                                known_dimensions,
                                available_space,
                                window,
                                cx,
                            );
                            crate::fast::stats::MeasureTally::measured(
                                &mut measures,
                                started,
                                _id,
                                known_dimensions,
                                available_space,
                            );
                            snap_measured_size_to_device_pixels(measured_size, scale_factor).into()
                        },
                    )
                },
            )
            .expect(EXPECT_MESSAGE);
        crate::fast::stats::finish_measure_tally(self, measures);
        crate::fast::layout::settle_measured_leaves(self, window, cx);
    }

    // Pixel snapping
    //
    // Painting primitives at non-integer pixel coordinates produces blurry
    // output. Pixel snapping converts layout coordinates into integer
    // device-pixel coordinates so painted edges land exactly on physical
    // pixel boundaries.
    //
    // Non-integer coordinates can arise for several reasons, including:
    //   - flex distribution, percentages, centering, and text measurement
    //     can produce fractional element sizes and positions;
    //   - at fractional scale factors (for example 125% or 150%), integer
    //     logical-pixel values can map to non-integer device-pixel values.
    //
    // We pixel-snap by rounding in device-pixel space, after multiplying
    // by `scale_factor`, so that snapping targets physical pixels. Bounds
    // are divided by `scale_factor` before being returned to GPUI.
    //
    // Midpoints are rounded toward zero. This is a stylistic choice: a
    // 1-logical-pixel line at 150% scale should render as 1 dp rather than
    // 2 dp.
    //
    // Pixel snapping is done in two phases:
    //
    //  1. Pre-layout metric snapping. Before Taffy computes layout, all
    //     authored absolute lengths are rounded in `to_taffy`. This
    //     includes borders, padding, gaps, and explicit sizes.
    //     Custom-measured leaf nodes have their measured sizes rounded up
    //     to integer device-pixel lengths.
    //
    //  2. Post-layout edge snapping. After Taffy resolves the tree, layout
    //     relationships such as flex shares, grid tracks, percentages, and
    //     centering can produce new fractional edge positions. Boxes now
    //     have edges in absolute coordinates, and snapping must decide
    //     where those edges land on the device-pixel grid.
    //
    // Ideally, post-layout snapping would satisfy:
    //
    //  - Edge closure. Two raw layout edges at the same absolute position
    //    should snap to the same pixel column.
    //  - Translation stability. A component's internal geometry should not
    //    change when it moves to a new absolute position.
    //
    // These goals are in tension because rounding is not associative.
    // The simple local schemes make different tradeoffs:
    //
    //  - Absolute edge rounding gives each window coordinate one answer,
    //    so coincident edges always close globally. But a span's snapped
    //    length is `round(far) - round(near)`, which may change by 1 dp
    //    as its absolute origin moves.
    //
    //  - Parent-relative edge rounding rounds each child inside its
    //    parent's coordinate space. This guarantees translation stability,
    //    but a shared edge reached through different parents can
    //    accumulate different rounding, causing non-closure between
    //    cousins.
    //
    //  - Length rounding rounds each width, height, and thickness
    //    independently and then places boxes from those rounded lengths.
    //    Sizes stay stable under translation, but neighboring boxes derive
    //    their shared boundary from different sources, so closure is not
    //    guaranteed.
    //
    // We apply absolute edge rounding for each element's outer box in
    // post-layout rounding to preserve closure. Border and padding widths
    // are not touched by post-layout rounding; they keep their pre-layout
    // rounded value so that they remain stable under translation.
    //
    // This gives both closure and translation stability in the case that
    // all local metrics are integer device-pixel lengths. Pre-layout
    // rounding covers that in most cases. The exception is metrics
    // resolved by layout relationships, such as percentages. Outer box
    // edges will still close globally, and painted border widths are still
    // snapped independently, but the raw content-box origin can carry a
    // 1dp residual into descendants.

    pub fn layout_bounds(&mut self, id: LayoutId, scale_factor: f32) -> Bounds<Pixels> {
        if let Some(layout) = self.absolute_layout_bounds.get(&id).cloned() {
            return layout;
        }

        let layout = self.taffy.layout(id.into()).expect(EXPECT_MESSAGE);
        let layout_location = layout.location;
        let layout_size = layout.size;
        let parent = self.taffy.parent(id.0);

        let absolute_outer_origin = match parent {
            Some(parent_id) => {
                let parent_id = LayoutId::from(parent_id);
                self.layout_bounds(parent_id, scale_factor);
                let parent_origin = *self
                    .absolute_outer_origins
                    .get(&parent_id)
                    .expect("parent absolute outer origin should be cached");
                parent_origin + Point::from(layout_location)
            }
            None => Point::from(layout_location),
        };
        self.absolute_outer_origins
            .insert(id, absolute_outer_origin);

        let absolute_far = absolute_outer_origin + Point::from(Size::from(layout_size));
        let snapped_bounds = Bounds::from_corners(
            absolute_outer_origin.map(round_half_toward_zero),
            absolute_far.map(round_half_toward_zero),
        );

        let bounds = (snapped_bounds / scale_factor).map(Pixels);
        self.absolute_layout_bounds.insert(id, bounds);
        bounds
    }
}

/// A unique identifier for a layout node, generated when requesting a layout from Taffy
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
#[repr(transparent)]
pub struct LayoutId(NodeId);

impl LayoutId {
    pub(crate) fn to_taffy_slice(node_ids: &[Self]) -> &[taffy::NodeId] {
        // SAFETY: LayoutId is repr(transparent) to taffy::tree::NodeId.
        unsafe { std::mem::transmute::<&[LayoutId], &[taffy::NodeId]>(node_ids) }
    }
}

impl std::hash::Hash for LayoutId {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        u64::from(self.0).hash(state);
    }
}

impl From<NodeId> for LayoutId {
    fn from(node_id: NodeId) -> Self {
        Self(node_id)
    }
}

impl From<LayoutId> for NodeId {
    fn from(layout_id: LayoutId) -> NodeId {
        layout_id.0
    }
}

fn snap_measured_size_to_device_pixels(size: Size<Pixels>, scale_factor: f32) -> Size<f32> {
    size.map(|d| ceil_to_device_pixel(d.0.max(0.0), scale_factor))
}

fn border_widths_to_taffy(
    widths: &Edges<AbsoluteLength>,
    rem_size: Pixels,
    scale_factor: f32,
) -> TaffyRect<taffy::style::LengthPercentage> {
    let snap = |w: &AbsoluteLength| {
        taffy::style::LengthPercentage::length(round_stroke_to_device_pixel(
            w.to_pixels(rem_size).0,
            scale_factor,
        ))
    };
    TaffyRect {
        top: snap(&widths.top),
        right: snap(&widths.right),
        bottom: snap(&widths.bottom),
        left: snap(&widths.left),
    }
}

pub(crate) trait ToTaffy<Output> {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> Output;
}

impl ToTaffy<taffy::style::Style> for Style {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> taffy::style::Style {
        use taffy::style_helpers::{fr, length, minmax, repeat};

        fn to_grid_line(
            placement: &Range<crate::GridPlacement>,
        ) -> taffy::Line<taffy::GridPlacement> {
            taffy::Line {
                start: placement.start.into(),
                end: placement.end.into(),
            }
        }

        fn to_grid_repeat<T: taffy::style::CheapCloneStr>(
            unit: &Option<GridTemplate>,
        ) -> Vec<taffy::GridTemplateComponent<T>> {
            unit.map(|template| {
                match template.min_size {
                    // grid-template-*: repeat(<number>, minmax(0, 1fr));
                    crate::GridTemplateMinSize::Zero => {
                        vec![repeat(
                            template.repeat,
                            vec![minmax(length(0.0_f32), fr(1.0_f32))],
                        )]
                    }
                    // grid-template-*: repeat(<number>, minmax(min-content, 1fr));
                    crate::GridTemplateMinSize::MinContent => {
                        vec![repeat(
                            template.repeat,
                            vec![minmax(min_content(), fr(1.0_f32))],
                        )]
                    }
                    // grid-template-*: repeat(<number>, minmax(0, max-content))
                    crate::GridTemplateMinSize::MaxContent => {
                        vec![repeat(
                            template.repeat,
                            vec![minmax(length(0.0_f32), max_content())],
                        )]
                    }
                }
            })
            .unwrap_or_default()
        }

        taffy::style::Style {
            display: self.display.into(),
            direction: match self.direction {
                crate::LayoutDirection::Rtl => taffy::style::Direction::Rtl,
                crate::LayoutDirection::Inherit | crate::LayoutDirection::Ltr => {
                    taffy::style::Direction::Ltr
                }
            },
            overflow: self.overflow.into(),
            scrollbar_width: self.scrollbar_width.to_taffy(rem_size, scale_factor),
            position: self.position.into(),
            inset: self.inset.to_taffy(rem_size, scale_factor),
            size: self.size.to_taffy(rem_size, scale_factor),
            min_size: self.min_size.to_taffy(rem_size, scale_factor),
            max_size: self.max_size.to_taffy(rem_size, scale_factor),
            aspect_ratio: self.aspect_ratio,
            margin: self.margin.to_taffy(rem_size, scale_factor),
            padding: self.padding.to_taffy(rem_size, scale_factor),
            border: border_widths_to_taffy(&self.border_widths, rem_size, scale_factor),
            align_items: self.align_items.map(Into::into).unwrap_or_default(),
            align_self: self.align_self.map(|x| x.into()),
            align_content: self.align_content.map(Into::into).unwrap_or_default(),
            justify_content: self.justify_content.map(Into::into).unwrap_or_default(),
            gap: self.gap.to_taffy(rem_size, scale_factor),
            flex_direction: self.flex_direction.into(),
            flex_wrap: self.flex_wrap.into(),
            flex_basis: self.flex_basis.to_taffy(rem_size, scale_factor),
            flex_grow: self.flex_grow,
            flex_shrink: self.flex_shrink,
            grid_template_rows: to_grid_repeat(&self.grid_rows),
            grid_template_columns: to_grid_repeat(&self.grid_cols),
            grid_row: self
                .grid_location
                .as_ref()
                .map(|location| to_grid_line(&location.row))
                .unwrap_or_default(),
            grid_column: self
                .grid_location
                .as_ref()
                .map(|location| to_grid_line(&location.column))
                .unwrap_or_default(),
            ..Default::default()
        }
    }
}

impl ToTaffy<f32> for AbsoluteLength {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> f32 {
        round_to_device_pixel(self.to_pixels(rem_size).0, scale_factor)
    }
}

impl ToTaffy<taffy::style::LengthPercentageAuto> for Length {
    fn to_taffy(
        &self,
        rem_size: Pixels,
        scale_factor: f32,
    ) -> taffy::prelude::LengthPercentageAuto {
        match self {
            Length::Definite(length) => length.to_taffy(rem_size, scale_factor),
            Length::Auto => taffy::prelude::LengthPercentageAuto::auto(),
        }
    }
}

impl ToTaffy<taffy::style::Dimension> for Length {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> taffy::prelude::Dimension {
        match self {
            Length::Definite(length) => length.to_taffy(rem_size, scale_factor),
            Length::Auto => taffy::prelude::Dimension::auto(),
        }
    }
}

impl ToTaffy<taffy::style::LengthPercentage> for DefiniteLength {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> taffy::style::LengthPercentage {
        match self {
            DefiniteLength::Absolute(length) => length.to_taffy(rem_size, scale_factor),
            DefiniteLength::Fraction(fraction) => {
                taffy::style::LengthPercentage::percent(*fraction)
            }
        }
    }
}

impl ToTaffy<taffy::style::LengthPercentageAuto> for DefiniteLength {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> taffy::style::LengthPercentageAuto {
        match self {
            DefiniteLength::Absolute(length) => length.to_taffy(rem_size, scale_factor),
            DefiniteLength::Fraction(fraction) => {
                taffy::style::LengthPercentageAuto::percent(*fraction)
            }
        }
    }
}

impl ToTaffy<taffy::style::Dimension> for DefiniteLength {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> taffy::style::Dimension {
        match self {
            DefiniteLength::Absolute(length) => length.to_taffy(rem_size, scale_factor),
            DefiniteLength::Fraction(fraction) => taffy::style::Dimension::percent(*fraction),
        }
    }
}

impl ToTaffy<taffy::style::LengthPercentage> for AbsoluteLength {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> taffy::style::LengthPercentage {
        taffy::style::LengthPercentage::length(self.to_taffy(rem_size, scale_factor))
    }
}

impl ToTaffy<taffy::style::LengthPercentageAuto> for AbsoluteLength {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> taffy::style::LengthPercentageAuto {
        taffy::style::LengthPercentageAuto::length(self.to_taffy(rem_size, scale_factor))
    }
}

impl ToTaffy<taffy::style::Dimension> for AbsoluteLength {
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> taffy::style::Dimension {
        taffy::style::Dimension::length(self.to_taffy(rem_size, scale_factor))
    }
}

impl<T, T2> From<TaffyPoint<T>> for Point<T2>
where
    T: Into<T2>,
    T2: Clone + Debug + Default + PartialEq,
{
    fn from(point: TaffyPoint<T>) -> Point<T2> {
        Point {
            x: point.x.into(),
            y: point.y.into(),
        }
    }
}

impl<T, T2> From<Point<T>> for TaffyPoint<T2>
where
    T: Into<T2> + Clone + Debug + Default + PartialEq,
{
    fn from(val: Point<T>) -> Self {
        TaffyPoint {
            x: val.x.into(),
            y: val.y.into(),
        }
    }
}

impl<T, U> ToTaffy<TaffySize<U>> for Size<T>
where
    T: ToTaffy<U> + Clone + Debug + Default + PartialEq,
{
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> TaffySize<U> {
        TaffySize {
            width: self.width.to_taffy(rem_size, scale_factor),
            height: self.height.to_taffy(rem_size, scale_factor),
        }
    }
}

impl<T, U> ToTaffy<TaffyRect<U>> for Edges<T>
where
    T: ToTaffy<U> + Clone + Debug + Default + PartialEq,
{
    fn to_taffy(&self, rem_size: Pixels, scale_factor: f32) -> TaffyRect<U> {
        TaffyRect {
            top: self.top.to_taffy(rem_size, scale_factor),
            right: self.right.to_taffy(rem_size, scale_factor),
            bottom: self.bottom.to_taffy(rem_size, scale_factor),
            left: self.left.to_taffy(rem_size, scale_factor),
        }
    }
}

impl<T, U> From<TaffySize<T>> for Size<U>
where
    T: Into<U>,
    U: Clone + Debug + Default + PartialEq,
{
    fn from(taffy_size: TaffySize<T>) -> Self {
        Size {
            width: taffy_size.width.into(),
            height: taffy_size.height.into(),
        }
    }
}

impl<T, U> From<Size<T>> for TaffySize<U>
where
    T: Into<U> + Clone + Debug + Default + PartialEq,
{
    fn from(size: Size<T>) -> Self {
        TaffySize {
            width: size.width.into(),
            height: size.height.into(),
        }
    }
}

/// The space available for an element to be laid out in
#[derive(Copy, Clone, Default, Debug, Eq, PartialEq)]
pub enum AvailableSpace {
    /// The amount of space available is the specified number of pixels
    Definite(Pixels),
    /// The amount of space available is indefinite and the node should be laid out under a min-content constraint
    #[default]
    MinContent,
    /// The amount of space available is indefinite and the node should be laid out under a max-content constraint
    MaxContent,
}

impl AvailableSpace {
    /// Returns a `Size` with both width and height set to `AvailableSpace::MinContent`.
    ///
    /// This function is useful when you want to create a `Size` with the minimum content constraints
    /// for both dimensions.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::AvailableSpace;
    /// let min_content_size = AvailableSpace::min_size();
    /// assert_eq!(min_content_size.width, AvailableSpace::MinContent);
    /// assert_eq!(min_content_size.height, AvailableSpace::MinContent);
    /// ```
    pub const fn min_size() -> Size<Self> {
        Size {
            width: Self::MinContent,
            height: Self::MinContent,
        }
    }
}

impl From<AvailableSpace> for TaffyAvailableSpace {
    fn from(space: AvailableSpace) -> TaffyAvailableSpace {
        match space {
            AvailableSpace::Definite(Pixels(value)) => TaffyAvailableSpace::Definite(value),
            AvailableSpace::MinContent => TaffyAvailableSpace::MinContent,
            AvailableSpace::MaxContent => TaffyAvailableSpace::MaxContent,
        }
    }
}

impl From<TaffyAvailableSpace> for AvailableSpace {
    fn from(space: TaffyAvailableSpace) -> AvailableSpace {
        match space {
            TaffyAvailableSpace::Definite(value) => AvailableSpace::Definite(Pixels(value)),
            TaffyAvailableSpace::MinContent => AvailableSpace::MinContent,
            TaffyAvailableSpace::MaxContent => AvailableSpace::MaxContent,
        }
    }
}

impl From<Pixels> for AvailableSpace {
    fn from(pixels: Pixels) -> Self {
        AvailableSpace::Definite(pixels)
    }
}

impl From<Size<Pixels>> for Size<AvailableSpace> {
    fn from(size: Size<Pixels>) -> Self {
        Size {
            width: AvailableSpace::Definite(size.width),
            height: AvailableSpace::Definite(size.height),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Corners, DefiniteLength, Direction, Display, Edges, FlexDirection, LayoutDirection, Length,
        physical_x_to_scroll_inline_offset, px, scroll_inline_offset_to_physical_x,
    };

    #[test]
    fn rtl_logical_geometry_and_taffy_direction_mirror_symmetry() {
        // Table-driven Edges, Corners, and LayoutDirection inheritance checks.
        let edge_cases = [
            (10.0_f32, 12.0_f32, 14.0_f32, 24.0_f32),
            (0.0, 8.0, 0.0, 32.0),
            (4.0, 0.0, 6.0, 16.0),
        ];
        for (top, start, bottom, end) in edge_cases {
            let ltr = Edges::from_logical(top, start, bottom, end, Direction::Ltr);
            let rtl = Edges::from_logical(top, start, bottom, end, Direction::Rtl);
            assert_eq!(ltr.left, start);
            assert_eq!(ltr.right, end);
            assert_eq!(rtl.right, start);
            assert_eq!(rtl.left, end);
            assert_eq!(*ltr.inline_start(Direction::Ltr), start);
            assert_eq!(*ltr.inline_end(Direction::Ltr), end);
            assert_eq!(*rtl.inline_start(Direction::Rtl), start);
            assert_eq!(*rtl.inline_end(Direction::Rtl), end);
            assert_eq!(ltr.resolve_physical(Direction::Rtl), rtl);
            assert_eq!(rtl.resolve_physical(Direction::Rtl), ltr);
        }

        let corner_cases = [
            (2.0_f32, 6.0_f32, 10.0_f32, 14.0_f32),
            (8.0, 0.0, 4.0, 12.0),
        ];
        for (ts, te, be, bs) in corner_cases {
            let ltr = Corners::from_logical(ts, te, be, bs, Direction::Ltr);
            let rtl = Corners::from_logical(ts, te, be, bs, Direction::Rtl);
            assert_eq!(*ltr.top_start(Direction::Ltr), ts);
            assert_eq!(*ltr.top_end(Direction::Ltr), te);
            assert_eq!(*ltr.bottom_end(Direction::Ltr), be);
            assert_eq!(*ltr.bottom_start(Direction::Ltr), bs);
            assert_eq!(*rtl.top_start(Direction::Rtl), ts);
            assert_eq!(*rtl.top_end(Direction::Rtl), te);
            assert_eq!(*rtl.bottom_end(Direction::Rtl), be);
            assert_eq!(*rtl.bottom_start(Direction::Rtl), bs);
            assert_eq!(ltr.resolve_physical(Direction::Rtl), rtl);
        }

        // Scroll inline offset <-> physical x symmetry.
        let scroll_cases = [
            (0.0_f32, 600.0_f32, 200.0_f32),
            (75.0, 600.0, 200.0),
            (400.0, 600.0, 200.0),
            (999.0, 600.0, 200.0),
            (50.0, 150.0, 200.0),
        ];
        for (offset, content_w, viewport_w) in scroll_cases {
            let max_scroll = (content_w - viewport_w).max(0.0);
            let expected = offset.clamp(0.0, max_scroll);
            for dir in [Direction::Ltr, Direction::Rtl] {
                let phys_x = scroll_inline_offset_to_physical_x(
                    px(offset),
                    px(content_w),
                    px(viewport_w),
                    dir,
                );
                let round_trip =
                    physical_x_to_scroll_inline_offset(phys_x, px(content_w), px(viewport_w), dir);
                assert!((f32::from(round_trip) - expected).abs() < 1e-4);
            }
            let ltr_x = scroll_inline_offset_to_physical_x(
                px(offset),
                px(content_w),
                px(viewport_w),
                Direction::Ltr,
            );
            let rtl_x = scroll_inline_offset_to_physical_x(
                px(offset),
                px(content_w),
                px(viewport_w),
                Direction::Rtl,
            );
            assert!((f32::from(ltr_x) + f32::from(rtl_x) + max_scroll).abs() < 1e-4);
        }

        // LayoutDirection inheritance.
        assert_eq!(
            LayoutDirection::Inherit.resolve(Direction::Ltr),
            Direction::Ltr
        );
        assert_eq!(
            LayoutDirection::Inherit.resolve(Direction::Rtl),
            Direction::Rtl
        );
        assert_eq!(LayoutDirection::Ltr.resolve(Direction::Rtl), Direction::Ltr);
        assert_eq!(LayoutDirection::Rtl.resolve(Direction::Ltr), Direction::Rtl);

        // Taffy Direction::Ltr vs Direction::Rtl exact mirror symmetry:
        // left_rtl == container_w - right_ltr.
        let container_w = 320.0_f32;
        let child_widths = [40.0_f32, 96.0, 64.0];
        let run_layout = |dir: LayoutDirection| -> Vec<(f32, f32)> {
            let mut engine = TaffyLayoutEngine::new();
            let children: Vec<LayoutId> = child_widths
                .iter()
                .map(|&w| {
                    let mut style = Style::default();
                    style.size.width = Length::Definite(DefiniteLength::Absolute(px(w).into()));
                    style.size.height = Length::Definite(DefiniteLength::Absolute(px(32.0).into()));
                    engine.request_layout(None, style, px(16.0), 1.0, &[])
                })
                .collect();
            let mut root_style = Style::default();
            root_style.display = Display::Flex;
            root_style.flex_direction = FlexDirection::Row;
            root_style.direction = dir;
            root_style.size.width =
                Length::Definite(DefiniteLength::Absolute(px(container_w).into()));
            root_style.size.height = Length::Definite(DefiniteLength::Absolute(px(48.0).into()));
            root_style.gap.width = DefiniteLength::Absolute(px(12.0).into());
            let root = engine.request_layout(None, root_style, px(16.0), 1.0, &children);
            engine
                .taffy
                .compute_layout(
                    root.into(),
                    taffy::geometry::Size {
                        width: taffy::style::AvailableSpace::Definite(container_w),
                        height: taffy::style::AvailableSpace::Definite(48.0),
                    },
                )
                .expect("taffy layout");
            children
                .into_iter()
                .map(|child| {
                    let layout = engine.taffy.layout(child.into()).expect("child layout");
                    (layout.location.x, layout.location.x + layout.size.width)
                })
                .collect()
        };

        let ltr_boxes = run_layout(LayoutDirection::Ltr);
        let rtl_boxes = run_layout(LayoutDirection::Rtl);
        for ((left_ltr, right_ltr), (left_rtl, right_rtl)) in ltr_boxes.iter().zip(rtl_boxes.iter())
        {
            assert!(
                (left_rtl - (container_w - right_ltr)).abs() < 1e-3,
                "expected left_rtl ({left_rtl}) == container_w - right_ltr ({})",
                container_w - right_ltr
            );
            assert!(
                (right_rtl - (container_w - left_ltr)).abs() < 1e-3,
                "expected right_rtl ({right_rtl}) == container_w - left_ltr ({})",
                container_w - left_ltr
            );
        }
    }
}
