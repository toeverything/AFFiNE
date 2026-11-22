use std::{
    hash::{Hash, Hasher},
    iter, mem,
    ops::Range,
};

use crate::collections::HashSet;
use crate::refineable::Refineable;
use crate::{
    AbsoluteLength, App, Background, BackgroundTag, BorderStyle, Bounds, ContentMask, Corners,
    CornersRefinement, CursorStyle, DefiniteLength, DevicePixels, Edges, EdgesRefinement, Font,
    FontFallbacks, FontFeatures, FontStyle, FontWeight, GridLocation, Hsla, Length, Pixels, Point,
    PointRefinement, Rgba, SharedString, Size, SizeRefinement, Styled, TextRun, Window, black, phi,
    point, px, quad, rems, size,
};
use serde::{Deserialize, Serialize};

/// Use this struct for interfacing with the 'debug_below' styling from your own elements.
/// If a parent element has this style set on it, then this struct will be set as a global in
/// GPUI.
#[cfg(debug_assertions)]
pub struct DebugBelow;

#[cfg(debug_assertions)]
impl crate::Global for DebugBelow {}

/// How to fit the image into the bounds of the element.
pub enum ObjectFit {
    /// The image will be stretched to fill the bounds of the element.
    Fill,
    /// The image will be scaled to fit within the bounds of the element.
    Contain,
    /// The image will be scaled to cover the bounds of the element.
    Cover,
    /// The image will be scaled down to fit within the bounds of the element.
    ScaleDown,
    /// The image will maintain its original size.
    None,
}

impl ObjectFit {
    /// Get the bounds of the image within the given bounds.
    pub fn get_bounds(
        &self,
        bounds: Bounds<Pixels>,
        image_size: Size<DevicePixels>,
    ) -> Bounds<Pixels> {
        let image_size = image_size.map(|dimension| Pixels::from(u32::from(dimension)));
        let image_ratio = image_size.width / image_size.height;
        let bounds_ratio = bounds.size.width / bounds.size.height;

        match self {
            ObjectFit::Fill => bounds,
            ObjectFit::Contain => {
                let new_size = if bounds_ratio > image_ratio {
                    size(
                        image_size.width * (bounds.size.height / image_size.height),
                        bounds.size.height,
                    )
                } else {
                    size(
                        bounds.size.width,
                        image_size.height * (bounds.size.width / image_size.width),
                    )
                };

                Bounds {
                    origin: point(
                        bounds.origin.x + (bounds.size.width - new_size.width) / 2.0,
                        bounds.origin.y + (bounds.size.height - new_size.height) / 2.0,
                    ),
                    size: new_size,
                }
            }
            ObjectFit::ScaleDown => {
                // Check if the image is larger than the bounds in either dimension.
                if image_size.width > bounds.size.width || image_size.height > bounds.size.height {
                    // If the image is larger, use the same logic as Contain to scale it down.
                    let new_size = if bounds_ratio > image_ratio {
                        size(
                            image_size.width * (bounds.size.height / image_size.height),
                            bounds.size.height,
                        )
                    } else {
                        size(
                            bounds.size.width,
                            image_size.height * (bounds.size.width / image_size.width),
                        )
                    };

                    Bounds {
                        origin: point(
                            bounds.origin.x + (bounds.size.width - new_size.width) / 2.0,
                            bounds.origin.y + (bounds.size.height - new_size.height) / 2.0,
                        ),
                        size: new_size,
                    }
                } else {
                    // If the image is smaller than or equal to the container, display it at its original size,
                    // centered within the container.
                    let original_size = size(image_size.width, image_size.height);
                    Bounds {
                        origin: point(
                            bounds.origin.x + (bounds.size.width - original_size.width) / 2.0,
                            bounds.origin.y + (bounds.size.height - original_size.height) / 2.0,
                        ),
                        size: original_size,
                    }
                }
            }
            ObjectFit::Cover => {
                let new_size = if bounds_ratio > image_ratio {
                    size(
                        bounds.size.width,
                        image_size.height * (bounds.size.width / image_size.width),
                    )
                } else {
                    size(
                        image_size.width * (bounds.size.height / image_size.height),
                        bounds.size.height,
                    )
                };

                Bounds {
                    origin: point(
                        bounds.origin.x + (bounds.size.width - new_size.width) / 2.0,
                        bounds.origin.y + (bounds.size.height - new_size.height) / 2.0,
                    ),
                    size: new_size,
                }
            }
            ObjectFit::None => Bounds {
                origin: bounds.origin,
                size: image_size,
            },
        }
    }
}

/// The minimum size of a column or row in a grid layout
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Debug, Default, Serialize, Deserialize)]
pub enum GridTemplateMinSize {
    /// The column or row size may be 0
    #[default]
    Zero,
    /// The column or row size can be determined by the min content
    MinContent,
    /// The column or row size can be determined by the max content
    MaxContent,
}

/// A simplified representation of the grid-template-* value
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Debug, Default, Serialize, Deserialize)]
pub struct GridTemplate {
    /// How this template directive should be repeated
    pub repeat: u16,
    /// The minimum size in the repeat(<>, minmax(_, 1fr)) equation
    pub min_size: GridTemplateMinSize,
}
#[derive(Clone, Default)]
pub struct GridTemplateRefinement {
    pub repeat: Option<u16>,
    pub min_size: Option<GridTemplateMinSize>,
}

impl crate::refineable::IsEmpty for GridTemplateRefinement {
    fn is_empty(&self) -> bool {
        let mut empty = true;
        {
            empty = empty && self.repeat.is_none();
        }
        {
            empty = empty && self.min_size.is_none();
        }
        empty
    }
}

impl crate::refineable::Refineable for GridTemplate {
    type Refinement = GridTemplateRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.repeat {
            self.repeat = val.clone();
        }
        if let Some(ref val) = refinement.min_size {
            self.min_size = val.clone();
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup && refinement.repeat.as_ref().is_none_or(|v| &self.repeat == v);
        }
        {
            sup = sup
                && refinement
                    .min_size
                    .as_ref()
                    .is_none_or(|v| &self.min_size == v);
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = GridTemplateRefinement::default();
        if refinement.repeat.as_ref() != Some(&self.repeat) {
            out.repeat = Some(self.repeat.clone());
        }
        if refinement.min_size.as_ref() != Some(&self.min_size) {
            out.min_size = Some(self.min_size.clone());
        }
        out
    }
}

impl crate::refineable::Refineable for GridTemplateRefinement {
    type Refinement = GridTemplateRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.repeat {
            self.repeat = Some(val.clone());
        }
        if let Some(ref val) = refinement.min_size {
            self.min_size = Some(val.clone());
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup
                && refinement
                    .repeat
                    .as_ref()
                    .is_none_or(|v| self.repeat.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .min_size
                    .as_ref()
                    .is_none_or(|v| self.min_size.as_ref() == Some(v));
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = GridTemplateRefinement::default();
        if self.repeat != refinement.repeat {
            out.repeat = self.repeat.clone();
        }
        if self.min_size != refinement.min_size {
            out.min_size = self.min_size.clone();
        }
        out
    }
}

/// The CSS styling that can be applied to an element via the `Styled` trait
#[derive(Clone, Debug)]
pub struct Style {
    /// What layout strategy should be used?
    pub display: Display,

    /// Should the element be painted on screen?
    pub visibility: Visibility,

    // Overflow properties
    /// How children overflowing their container should affect layout
    pub overflow: Point<Overflow>,
    /// How much space (in points) should be reserved for the scrollbars of `Overflow::Scroll` and `Overflow::Auto` nodes.
    pub scrollbar_width: AbsoluteLength,
    /// Whether both x and y axis should be scrollable at the same time.
    pub allow_concurrent_scroll: bool,
    /// Whether scrolling should be restricted to the input gesture's axis.
    ///
    /// Pixel-based scroll gestures are locked to their initially dominant axis. The lock may be
    /// released when the gesture changes direction strongly. Touch phases delimit gestures when
    /// available, with a timeout fallback for platforms that only emit moved events.
    ///
    /// This also prevents input from being remapped to another axis. For example, horizontal input
    /// will not scroll a container that only has vertical overflow enabled. Mouse wheel platforms
    /// typically report ordinary wheel input on the Y axis and Shift-modified input on the X axis.
    ///
    /// ## Motivation
    ///
    /// On the web when scrolling with the mouse wheel, scrolling up and down will always scroll the Y axis, even when
    /// the mouse is over a horizontally-scrollable element.
    ///
    /// The only way to scroll horizontally is to hold down `Shift` while scrolling, which then changes the scroll axis
    /// to the X axis.
    ///
    /// Currently, GPUI operates differently from the web in that it will scroll an element in either the X or Y axis
    /// when scrolling with just the mouse wheel. This causes problems when scrolling in a vertical list that contains
    /// horizontally-scrollable elements, as when you get to the horizontally-scrollable elements the scroll will be
    /// hijacked.
    ///
    /// Ideally we would match the web's behavior and not have a need for this, but right now we're adding this opt-in
    /// style property to limit the potential blast radius.
    pub restrict_scroll_to_axis: bool,

    // Position properties
    /// What should the `position` value of this struct use as a base offset?
    pub position: Position,
    /// How should the position of this element be tweaked relative to the layout defined?
    pub inset: Edges<Length>,

    // Size properties
    /// Sets the initial size of the item
    pub size: Size<Length>,
    /// Controls the minimum size of the item
    pub min_size: Size<Length>,
    /// Controls the maximum size of the item
    pub max_size: Size<Length>,
    /// Sets the preferred aspect ratio for the item. The ratio is calculated as width divided by height.
    pub aspect_ratio: Option<f32>,

    // Spacing Properties
    /// How large should the margin be on each side?
    pub margin: Edges<Length>,
    /// How large should the padding be on each side?
    pub padding: Edges<DefiniteLength>,
    /// How large should the border be on each side?
    pub border_widths: Edges<AbsoluteLength>,

    // Alignment properties
    /// How this node's children aligned in the cross/block axis?
    pub align_items: Option<AlignItems>,
    /// How this node should be aligned in the cross/block axis. Falls back to the parents [`AlignItems`] if not set
    pub align_self: Option<AlignSelf>,
    /// How should content contained within this item be aligned in the cross/block axis
    pub align_content: Option<AlignContent>,
    /// How should contained within this item be aligned in the main/inline axis
    pub justify_content: Option<JustifyContent>,
    /// How large should the gaps between items in a flex container be?
    pub gap: Size<DefiniteLength>,

    // Flexbox properties
    /// Which direction does the main axis flow in?
    pub flex_direction: FlexDirection,
    /// Should elements wrap, or stay in a single line?
    pub flex_wrap: FlexWrap,
    /// Sets the initial main axis size of the item
    pub flex_basis: Length,
    /// The relative rate at which this item grows when it is expanding to fill space, 0.0 is the default value, and this value must be positive.
    pub flex_grow: f32,
    /// The relative rate at which this item shrinks when it is contracting to fit into space, 1.0 is the default value, and this value must be positive.
    pub flex_shrink: f32,

    /// The fill color of this element
    pub background: Option<Fill>,

    /// The border color of this element
    pub border_color: Option<Hsla>,

    /// The border style of this element
    pub border_style: BorderStyle,

    /// The radius of the corners of this element
    pub corner_radii: Corners<AbsoluteLength>,

    /// Box shadow of the element
    pub box_shadow: Vec<BoxShadow>,

    /// The text style of this element
    pub text: TextStyleRefinement,

    /// The mouse cursor style shown when the mouse pointer is over an element.
    pub mouse_cursor: Option<CursorStyle>,

    /// The opacity of this element
    pub opacity: Option<f32>,

    /// The grid columns of this element
    /// Roughly equivalent to the Tailwind `grid-cols-<number>`
    pub grid_cols: Option<GridTemplate>,

    /// The row span of this element
    /// Equivalent to the Tailwind `grid-rows-<number>`
    pub grid_rows: Option<GridTemplate>,

    /// The grid location of this element
    pub grid_location: Option<GridLocation>,

    /// Whether to draw a red debugging outline around this element
    #[cfg(debug_assertions)]
    pub debug: bool,

    /// Whether to draw a red debugging outline around this element and all of its conforming children
    #[cfg(debug_assertions)]
    pub debug_below: bool,
}
#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct StyleRefinement {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display: Option<Display>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visibility: Option<Visibility>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub overflow: PointRefinement<Overflow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrollbar_width: Option<AbsoluteLength>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_concurrent_scroll: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restrict_scroll_to_axis: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Position>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub inset: EdgesRefinement<Length>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub size: SizeRefinement<Length>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub min_size: SizeRefinement<Length>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub max_size: SizeRefinement<Length>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aspect_ratio: Option<f32>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub margin: EdgesRefinement<Length>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub padding: EdgesRefinement<DefiniteLength>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub border_widths: EdgesRefinement<AbsoluteLength>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align_items: Option<AlignItems>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align_self: Option<AlignSelf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align_content: Option<AlignContent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub justify_content: Option<JustifyContent>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub gap: SizeRefinement<DefiniteLength>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flex_direction: Option<FlexDirection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flex_wrap: Option<FlexWrap>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flex_basis: Option<Length>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flex_grow: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flex_shrink: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<Fill>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<Hsla>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_style: Option<BorderStyle>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub corner_radii: CornersRefinement<AbsoluteLength>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub box_shadow: Option<Vec<BoxShadow>>,
    #[serde(default, skip_serializing_if = "crate::refineable::IsEmpty::is_empty")]
    pub text: TextStyleRefinement,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mouse_cursor: Option<CursorStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_cols: Option<GridTemplate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_rows: Option<GridTemplate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_location: Option<GridLocation>,
    #[cfg(debug_assertions)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub debug: Option<bool>,
    #[cfg(debug_assertions)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub debug_below: Option<bool>,
}

impl crate::refineable::IsEmpty for StyleRefinement {
    fn is_empty(&self) -> bool {
        let mut empty = true;
        {
            empty = empty && self.display.is_none();
        }
        {
            empty = empty && self.visibility.is_none();
        }
        {
            empty = empty && self.overflow.is_empty();
        }
        {
            empty = empty && self.scrollbar_width.is_none();
        }
        {
            empty = empty && self.allow_concurrent_scroll.is_none();
        }
        {
            empty = empty && self.restrict_scroll_to_axis.is_none();
        }
        {
            empty = empty && self.position.is_none();
        }
        {
            empty = empty && self.inset.is_empty();
        }
        {
            empty = empty && self.size.is_empty();
        }
        {
            empty = empty && self.min_size.is_empty();
        }
        {
            empty = empty && self.max_size.is_empty();
        }
        {
            empty = empty && self.aspect_ratio.is_none();
        }
        {
            empty = empty && self.margin.is_empty();
        }
        {
            empty = empty && self.padding.is_empty();
        }
        {
            empty = empty && self.border_widths.is_empty();
        }
        {
            empty = empty && self.align_items.is_none();
        }
        {
            empty = empty && self.align_self.is_none();
        }
        {
            empty = empty && self.align_content.is_none();
        }
        {
            empty = empty && self.justify_content.is_none();
        }
        {
            empty = empty && self.gap.is_empty();
        }
        {
            empty = empty && self.flex_direction.is_none();
        }
        {
            empty = empty && self.flex_wrap.is_none();
        }
        {
            empty = empty && self.flex_basis.is_none();
        }
        {
            empty = empty && self.flex_grow.is_none();
        }
        {
            empty = empty && self.flex_shrink.is_none();
        }
        {
            empty = empty && self.background.is_none();
        }
        {
            empty = empty && self.border_color.is_none();
        }
        {
            empty = empty && self.border_style.is_none();
        }
        {
            empty = empty && self.corner_radii.is_empty();
        }
        {
            empty = empty && self.box_shadow.is_none();
        }
        {
            empty = empty && self.text.is_empty();
        }
        {
            empty = empty && self.mouse_cursor.is_none();
        }
        {
            empty = empty && self.opacity.is_none();
        }
        {
            empty = empty && self.grid_cols.is_none();
        }
        {
            empty = empty && self.grid_rows.is_none();
        }
        {
            empty = empty && self.grid_location.is_none();
        }
        #[cfg(debug_assertions)]
        {
            empty = empty && self.debug.is_none();
        }
        #[cfg(debug_assertions)]
        {
            empty = empty && self.debug_below.is_none();
        }
        empty
    }
}

impl crate::refineable::Refineable for Style {
    type Refinement = StyleRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.display {
            self.display = val.clone();
        }
        if let Some(ref val) = refinement.visibility {
            self.visibility = val.clone();
        }
        self.overflow.refine(&refinement.overflow);
        if let Some(ref val) = refinement.scrollbar_width {
            self.scrollbar_width = val.clone();
        }
        if let Some(ref val) = refinement.allow_concurrent_scroll {
            self.allow_concurrent_scroll = val.clone();
        }
        if let Some(ref val) = refinement.restrict_scroll_to_axis {
            self.restrict_scroll_to_axis = val.clone();
        }
        if let Some(ref val) = refinement.position {
            self.position = val.clone();
        }
        self.inset.refine(&refinement.inset);
        self.size.refine(&refinement.size);
        self.min_size.refine(&refinement.min_size);
        self.max_size.refine(&refinement.max_size);
        if let Some(ref val) = refinement.aspect_ratio {
            self.aspect_ratio = Some(val.clone());
        }
        self.margin.refine(&refinement.margin);
        self.padding.refine(&refinement.padding);
        self.border_widths.refine(&refinement.border_widths);
        if let Some(ref val) = refinement.align_items {
            self.align_items = Some(val.clone());
        }
        if let Some(ref val) = refinement.align_self {
            self.align_self = Some(val.clone());
        }
        if let Some(ref val) = refinement.align_content {
            self.align_content = Some(val.clone());
        }
        if let Some(ref val) = refinement.justify_content {
            self.justify_content = Some(val.clone());
        }
        self.gap.refine(&refinement.gap);
        if let Some(ref val) = refinement.flex_direction {
            self.flex_direction = val.clone();
        }
        if let Some(ref val) = refinement.flex_wrap {
            self.flex_wrap = val.clone();
        }
        if let Some(ref val) = refinement.flex_basis {
            self.flex_basis = val.clone();
        }
        if let Some(ref val) = refinement.flex_grow {
            self.flex_grow = val.clone();
        }
        if let Some(ref val) = refinement.flex_shrink {
            self.flex_shrink = val.clone();
        }
        if let Some(ref val) = refinement.background {
            self.background = Some(val.clone());
        }
        if let Some(ref val) = refinement.border_color {
            self.border_color = Some(val.clone());
        }
        if let Some(ref val) = refinement.border_style {
            self.border_style = val.clone();
        }
        self.corner_radii.refine(&refinement.corner_radii);
        if let Some(ref val) = refinement.box_shadow {
            self.box_shadow = val.clone();
        }
        self.text.refine(&refinement.text);
        if let Some(ref val) = refinement.mouse_cursor {
            self.mouse_cursor = Some(val.clone());
        }
        if let Some(ref val) = refinement.opacity {
            self.opacity = Some(val.clone());
        }
        if let Some(ref val) = refinement.grid_cols {
            self.grid_cols = Some(val.clone());
        }
        if let Some(ref val) = refinement.grid_rows {
            self.grid_rows = Some(val.clone());
        }
        if let Some(ref val) = refinement.grid_location {
            self.grid_location = Some(val.clone());
        }
        #[cfg(debug_assertions)]
        if let Some(ref val) = refinement.debug {
            self.debug = val.clone();
        }
        #[cfg(debug_assertions)]
        if let Some(ref val) = refinement.debug_below {
            self.debug_below = val.clone();
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup
                && refinement
                    .display
                    .as_ref()
                    .is_none_or(|v| &self.display == v);
        }
        {
            sup = sup
                && refinement
                    .visibility
                    .as_ref()
                    .is_none_or(|v| &self.visibility == v);
        }
        {
            sup = sup && self.overflow.is_superset_of(&refinement.overflow);
        }
        {
            sup = sup
                && refinement
                    .scrollbar_width
                    .as_ref()
                    .is_none_or(|v| &self.scrollbar_width == v);
        }
        {
            sup = sup
                && refinement
                    .allow_concurrent_scroll
                    .as_ref()
                    .is_none_or(|v| &self.allow_concurrent_scroll == v);
        }
        {
            sup = sup
                && refinement
                    .restrict_scroll_to_axis
                    .as_ref()
                    .is_none_or(|v| &self.restrict_scroll_to_axis == v);
        }
        {
            sup = sup
                && refinement
                    .position
                    .as_ref()
                    .is_none_or(|v| &self.position == v);
        }
        {
            sup = sup && self.inset.is_superset_of(&refinement.inset);
        }
        {
            sup = sup && self.size.is_superset_of(&refinement.size);
        }
        {
            sup = sup && self.min_size.is_superset_of(&refinement.min_size);
        }
        {
            sup = sup && self.max_size.is_superset_of(&refinement.max_size);
        }
        {
            sup = sup
                && refinement
                    .aspect_ratio
                    .as_ref()
                    .is_none_or(|v| self.aspect_ratio.as_ref() == Some(v));
        }
        {
            sup = sup && self.margin.is_superset_of(&refinement.margin);
        }
        {
            sup = sup && self.padding.is_superset_of(&refinement.padding);
        }
        {
            sup = sup && self.border_widths.is_superset_of(&refinement.border_widths);
        }
        {
            sup = sup
                && refinement
                    .align_items
                    .as_ref()
                    .is_none_or(|v| self.align_items.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .align_self
                    .as_ref()
                    .is_none_or(|v| self.align_self.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .align_content
                    .as_ref()
                    .is_none_or(|v| self.align_content.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .justify_content
                    .as_ref()
                    .is_none_or(|v| self.justify_content.as_ref() == Some(v));
        }
        {
            sup = sup && self.gap.is_superset_of(&refinement.gap);
        }
        {
            sup = sup
                && refinement
                    .flex_direction
                    .as_ref()
                    .is_none_or(|v| &self.flex_direction == v);
        }
        {
            sup = sup
                && refinement
                    .flex_wrap
                    .as_ref()
                    .is_none_or(|v| &self.flex_wrap == v);
        }
        {
            sup = sup
                && refinement
                    .flex_basis
                    .as_ref()
                    .is_none_or(|v| &self.flex_basis == v);
        }
        {
            sup = sup
                && refinement
                    .flex_grow
                    .as_ref()
                    .is_none_or(|v| &self.flex_grow == v);
        }
        {
            sup = sup
                && refinement
                    .flex_shrink
                    .as_ref()
                    .is_none_or(|v| &self.flex_shrink == v);
        }
        {
            sup = sup
                && refinement
                    .background
                    .as_ref()
                    .is_none_or(|v| self.background.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .border_color
                    .as_ref()
                    .is_none_or(|v| self.border_color.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .border_style
                    .as_ref()
                    .is_none_or(|v| &self.border_style == v);
        }
        {
            sup = sup && self.corner_radii.is_superset_of(&refinement.corner_radii);
        }
        {
            sup = sup
                && refinement
                    .box_shadow
                    .as_ref()
                    .is_none_or(|v| &self.box_shadow == v);
        }
        {
            sup = sup && self.text.is_superset_of(&refinement.text);
        }
        {
            sup = sup
                && refinement
                    .mouse_cursor
                    .as_ref()
                    .is_none_or(|v| self.mouse_cursor.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .opacity
                    .as_ref()
                    .is_none_or(|v| self.opacity.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .grid_cols
                    .as_ref()
                    .is_none_or(|v| self.grid_cols.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .grid_rows
                    .as_ref()
                    .is_none_or(|v| self.grid_rows.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .grid_location
                    .as_ref()
                    .is_none_or(|v| self.grid_location.as_ref() == Some(v));
        }
        #[cfg(debug_assertions)]
        {
            sup = sup && refinement.debug.as_ref().is_none_or(|v| &self.debug == v);
        }
        #[cfg(debug_assertions)]
        {
            sup = sup
                && refinement
                    .debug_below
                    .as_ref()
                    .is_none_or(|v| &self.debug_below == v);
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = StyleRefinement::default();
        if refinement.display.as_ref() != Some(&self.display) {
            out.display = Some(self.display.clone());
        }
        if refinement.visibility.as_ref() != Some(&self.visibility) {
            out.visibility = Some(self.visibility.clone());
        }
        out.overflow = self.overflow.subtract(&refinement.overflow);
        if refinement.scrollbar_width.as_ref() != Some(&self.scrollbar_width) {
            out.scrollbar_width = Some(self.scrollbar_width.clone());
        }
        if refinement.allow_concurrent_scroll.as_ref() != Some(&self.allow_concurrent_scroll) {
            out.allow_concurrent_scroll = Some(self.allow_concurrent_scroll.clone());
        }
        if refinement.restrict_scroll_to_axis.as_ref() != Some(&self.restrict_scroll_to_axis) {
            out.restrict_scroll_to_axis = Some(self.restrict_scroll_to_axis.clone());
        }
        if refinement.position.as_ref() != Some(&self.position) {
            out.position = Some(self.position.clone());
        }
        out.inset = self.inset.subtract(&refinement.inset);
        out.size = self.size.subtract(&refinement.size);
        out.min_size = self.min_size.subtract(&refinement.min_size);
        out.max_size = self.max_size.subtract(&refinement.max_size);
        if self.aspect_ratio != refinement.aspect_ratio {
            out.aspect_ratio = self.aspect_ratio.clone();
        }
        out.margin = self.margin.subtract(&refinement.margin);
        out.padding = self.padding.subtract(&refinement.padding);
        out.border_widths = self.border_widths.subtract(&refinement.border_widths);
        if self.align_items != refinement.align_items {
            out.align_items = self.align_items.clone();
        }
        if self.align_self != refinement.align_self {
            out.align_self = self.align_self.clone();
        }
        if self.align_content != refinement.align_content {
            out.align_content = self.align_content.clone();
        }
        if self.justify_content != refinement.justify_content {
            out.justify_content = self.justify_content.clone();
        }
        out.gap = self.gap.subtract(&refinement.gap);
        if refinement.flex_direction.as_ref() != Some(&self.flex_direction) {
            out.flex_direction = Some(self.flex_direction.clone());
        }
        if refinement.flex_wrap.as_ref() != Some(&self.flex_wrap) {
            out.flex_wrap = Some(self.flex_wrap.clone());
        }
        if refinement.flex_basis.as_ref() != Some(&self.flex_basis) {
            out.flex_basis = Some(self.flex_basis.clone());
        }
        if refinement.flex_grow.as_ref() != Some(&self.flex_grow) {
            out.flex_grow = Some(self.flex_grow.clone());
        }
        if refinement.flex_shrink.as_ref() != Some(&self.flex_shrink) {
            out.flex_shrink = Some(self.flex_shrink.clone());
        }
        if self.background != refinement.background {
            out.background = self.background.clone();
        }
        if self.border_color != refinement.border_color {
            out.border_color = self.border_color.clone();
        }
        if refinement.border_style.as_ref() != Some(&self.border_style) {
            out.border_style = Some(self.border_style.clone());
        }
        out.corner_radii = self.corner_radii.subtract(&refinement.corner_radii);
        if refinement.box_shadow.as_ref() != Some(&self.box_shadow) {
            out.box_shadow = Some(self.box_shadow.clone());
        }
        out.text = self.text.subtract(&refinement.text);
        if self.mouse_cursor != refinement.mouse_cursor {
            out.mouse_cursor = self.mouse_cursor.clone();
        }
        if self.opacity != refinement.opacity {
            out.opacity = self.opacity.clone();
        }
        if self.grid_cols != refinement.grid_cols {
            out.grid_cols = self.grid_cols.clone();
        }
        if self.grid_rows != refinement.grid_rows {
            out.grid_rows = self.grid_rows.clone();
        }
        if self.grid_location != refinement.grid_location {
            out.grid_location = self.grid_location.clone();
        }
        #[cfg(debug_assertions)]
        if refinement.debug.as_ref() != Some(&self.debug) {
            out.debug = Some(self.debug.clone());
        }
        #[cfg(debug_assertions)]
        if refinement.debug_below.as_ref() != Some(&self.debug_below) {
            out.debug_below = Some(self.debug_below.clone());
        }
        out
    }
}

impl crate::refineable::Refineable for StyleRefinement {
    type Refinement = StyleRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.display {
            self.display = Some(val.clone());
        }
        if let Some(ref val) = refinement.visibility {
            self.visibility = Some(val.clone());
        }
        self.overflow.refine(&refinement.overflow);
        if let Some(ref val) = refinement.scrollbar_width {
            self.scrollbar_width = Some(val.clone());
        }
        if let Some(ref val) = refinement.allow_concurrent_scroll {
            self.allow_concurrent_scroll = Some(val.clone());
        }
        if let Some(ref val) = refinement.restrict_scroll_to_axis {
            self.restrict_scroll_to_axis = Some(val.clone());
        }
        if let Some(ref val) = refinement.position {
            self.position = Some(val.clone());
        }
        self.inset.refine(&refinement.inset);
        self.size.refine(&refinement.size);
        self.min_size.refine(&refinement.min_size);
        self.max_size.refine(&refinement.max_size);
        if let Some(ref val) = refinement.aspect_ratio {
            self.aspect_ratio = Some(val.clone());
        }
        self.margin.refine(&refinement.margin);
        self.padding.refine(&refinement.padding);
        self.border_widths.refine(&refinement.border_widths);
        if let Some(ref val) = refinement.align_items {
            self.align_items = Some(val.clone());
        }
        if let Some(ref val) = refinement.align_self {
            self.align_self = Some(val.clone());
        }
        if let Some(ref val) = refinement.align_content {
            self.align_content = Some(val.clone());
        }
        if let Some(ref val) = refinement.justify_content {
            self.justify_content = Some(val.clone());
        }
        self.gap.refine(&refinement.gap);
        if let Some(ref val) = refinement.flex_direction {
            self.flex_direction = Some(val.clone());
        }
        if let Some(ref val) = refinement.flex_wrap {
            self.flex_wrap = Some(val.clone());
        }
        if let Some(ref val) = refinement.flex_basis {
            self.flex_basis = Some(val.clone());
        }
        if let Some(ref val) = refinement.flex_grow {
            self.flex_grow = Some(val.clone());
        }
        if let Some(ref val) = refinement.flex_shrink {
            self.flex_shrink = Some(val.clone());
        }
        if let Some(ref val) = refinement.background {
            self.background = Some(val.clone());
        }
        if let Some(ref val) = refinement.border_color {
            self.border_color = Some(val.clone());
        }
        if let Some(ref val) = refinement.border_style {
            self.border_style = Some(val.clone());
        }
        self.corner_radii.refine(&refinement.corner_radii);
        if let Some(ref val) = refinement.box_shadow {
            self.box_shadow = Some(val.clone());
        }
        self.text.refine(&refinement.text);
        if let Some(ref val) = refinement.mouse_cursor {
            self.mouse_cursor = Some(val.clone());
        }
        if let Some(ref val) = refinement.opacity {
            self.opacity = Some(val.clone());
        }
        if let Some(ref val) = refinement.grid_cols {
            self.grid_cols = Some(val.clone());
        }
        if let Some(ref val) = refinement.grid_rows {
            self.grid_rows = Some(val.clone());
        }
        if let Some(ref val) = refinement.grid_location {
            self.grid_location = Some(val.clone());
        }
        #[cfg(debug_assertions)]
        if let Some(ref val) = refinement.debug {
            self.debug = Some(val.clone());
        }
        #[cfg(debug_assertions)]
        if let Some(ref val) = refinement.debug_below {
            self.debug_below = Some(val.clone());
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup
                && refinement
                    .display
                    .as_ref()
                    .is_none_or(|v| self.display.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .visibility
                    .as_ref()
                    .is_none_or(|v| self.visibility.as_ref() == Some(v));
        }
        {
            sup = sup && self.overflow.is_superset_of(&refinement.overflow);
        }
        {
            sup = sup
                && refinement
                    .scrollbar_width
                    .as_ref()
                    .is_none_or(|v| self.scrollbar_width.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .allow_concurrent_scroll
                    .as_ref()
                    .is_none_or(|v| self.allow_concurrent_scroll.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .restrict_scroll_to_axis
                    .as_ref()
                    .is_none_or(|v| self.restrict_scroll_to_axis.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .position
                    .as_ref()
                    .is_none_or(|v| self.position.as_ref() == Some(v));
        }
        {
            sup = sup && self.inset.is_superset_of(&refinement.inset);
        }
        {
            sup = sup && self.size.is_superset_of(&refinement.size);
        }
        {
            sup = sup && self.min_size.is_superset_of(&refinement.min_size);
        }
        {
            sup = sup && self.max_size.is_superset_of(&refinement.max_size);
        }
        {
            sup = sup
                && refinement
                    .aspect_ratio
                    .as_ref()
                    .is_none_or(|v| self.aspect_ratio.as_ref() == Some(v));
        }
        {
            sup = sup && self.margin.is_superset_of(&refinement.margin);
        }
        {
            sup = sup && self.padding.is_superset_of(&refinement.padding);
        }
        {
            sup = sup && self.border_widths.is_superset_of(&refinement.border_widths);
        }
        {
            sup = sup
                && refinement
                    .align_items
                    .as_ref()
                    .is_none_or(|v| self.align_items.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .align_self
                    .as_ref()
                    .is_none_or(|v| self.align_self.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .align_content
                    .as_ref()
                    .is_none_or(|v| self.align_content.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .justify_content
                    .as_ref()
                    .is_none_or(|v| self.justify_content.as_ref() == Some(v));
        }
        {
            sup = sup && self.gap.is_superset_of(&refinement.gap);
        }
        {
            sup = sup
                && refinement
                    .flex_direction
                    .as_ref()
                    .is_none_or(|v| self.flex_direction.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .flex_wrap
                    .as_ref()
                    .is_none_or(|v| self.flex_wrap.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .flex_basis
                    .as_ref()
                    .is_none_or(|v| self.flex_basis.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .flex_grow
                    .as_ref()
                    .is_none_or(|v| self.flex_grow.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .flex_shrink
                    .as_ref()
                    .is_none_or(|v| self.flex_shrink.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .background
                    .as_ref()
                    .is_none_or(|v| self.background.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .border_color
                    .as_ref()
                    .is_none_or(|v| self.border_color.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .border_style
                    .as_ref()
                    .is_none_or(|v| self.border_style.as_ref() == Some(v));
        }
        {
            sup = sup && self.corner_radii.is_superset_of(&refinement.corner_radii);
        }
        {
            sup = sup
                && refinement
                    .box_shadow
                    .as_ref()
                    .is_none_or(|v| self.box_shadow.as_ref() == Some(v));
        }
        {
            sup = sup && self.text.is_superset_of(&refinement.text);
        }
        {
            sup = sup
                && refinement
                    .mouse_cursor
                    .as_ref()
                    .is_none_or(|v| self.mouse_cursor.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .opacity
                    .as_ref()
                    .is_none_or(|v| self.opacity.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .grid_cols
                    .as_ref()
                    .is_none_or(|v| self.grid_cols.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .grid_rows
                    .as_ref()
                    .is_none_or(|v| self.grid_rows.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .grid_location
                    .as_ref()
                    .is_none_or(|v| self.grid_location.as_ref() == Some(v));
        }
        #[cfg(debug_assertions)]
        {
            sup = sup
                && refinement
                    .debug
                    .as_ref()
                    .is_none_or(|v| self.debug.as_ref() == Some(v));
        }
        #[cfg(debug_assertions)]
        {
            sup = sup
                && refinement
                    .debug_below
                    .as_ref()
                    .is_none_or(|v| self.debug_below.as_ref() == Some(v));
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = StyleRefinement::default();
        if self.display != refinement.display {
            out.display = self.display.clone();
        }
        if self.visibility != refinement.visibility {
            out.visibility = self.visibility.clone();
        }
        out.overflow = self.overflow.subtract(&refinement.overflow);
        if self.scrollbar_width != refinement.scrollbar_width {
            out.scrollbar_width = self.scrollbar_width.clone();
        }
        if self.allow_concurrent_scroll != refinement.allow_concurrent_scroll {
            out.allow_concurrent_scroll = self.allow_concurrent_scroll.clone();
        }
        if self.restrict_scroll_to_axis != refinement.restrict_scroll_to_axis {
            out.restrict_scroll_to_axis = self.restrict_scroll_to_axis.clone();
        }
        if self.position != refinement.position {
            out.position = self.position.clone();
        }
        out.inset = self.inset.subtract(&refinement.inset);
        out.size = self.size.subtract(&refinement.size);
        out.min_size = self.min_size.subtract(&refinement.min_size);
        out.max_size = self.max_size.subtract(&refinement.max_size);
        if self.aspect_ratio != refinement.aspect_ratio {
            out.aspect_ratio = self.aspect_ratio.clone();
        }
        out.margin = self.margin.subtract(&refinement.margin);
        out.padding = self.padding.subtract(&refinement.padding);
        out.border_widths = self.border_widths.subtract(&refinement.border_widths);
        if self.align_items != refinement.align_items {
            out.align_items = self.align_items.clone();
        }
        if self.align_self != refinement.align_self {
            out.align_self = self.align_self.clone();
        }
        if self.align_content != refinement.align_content {
            out.align_content = self.align_content.clone();
        }
        if self.justify_content != refinement.justify_content {
            out.justify_content = self.justify_content.clone();
        }
        out.gap = self.gap.subtract(&refinement.gap);
        if self.flex_direction != refinement.flex_direction {
            out.flex_direction = self.flex_direction.clone();
        }
        if self.flex_wrap != refinement.flex_wrap {
            out.flex_wrap = self.flex_wrap.clone();
        }
        if self.flex_basis != refinement.flex_basis {
            out.flex_basis = self.flex_basis.clone();
        }
        if self.flex_grow != refinement.flex_grow {
            out.flex_grow = self.flex_grow.clone();
        }
        if self.flex_shrink != refinement.flex_shrink {
            out.flex_shrink = self.flex_shrink.clone();
        }
        if self.background != refinement.background {
            out.background = self.background.clone();
        }
        if self.border_color != refinement.border_color {
            out.border_color = self.border_color.clone();
        }
        if self.border_style != refinement.border_style {
            out.border_style = self.border_style.clone();
        }
        out.corner_radii = self.corner_radii.subtract(&refinement.corner_radii);
        if self.box_shadow != refinement.box_shadow {
            out.box_shadow = self.box_shadow.clone();
        }
        out.text = self.text.subtract(&refinement.text);
        if self.mouse_cursor != refinement.mouse_cursor {
            out.mouse_cursor = self.mouse_cursor.clone();
        }
        if self.opacity != refinement.opacity {
            out.opacity = self.opacity.clone();
        }
        if self.grid_cols != refinement.grid_cols {
            out.grid_cols = self.grid_cols.clone();
        }
        if self.grid_rows != refinement.grid_rows {
            out.grid_rows = self.grid_rows.clone();
        }
        if self.grid_location != refinement.grid_location {
            out.grid_location = self.grid_location.clone();
        }
        #[cfg(debug_assertions)]
        if self.debug != refinement.debug {
            out.debug = self.debug.clone();
        }
        #[cfg(debug_assertions)]
        if self.debug_below != refinement.debug_below {
            out.debug_below = self.debug_below.clone();
        }
        out
    }
}

impl Styled for StyleRefinement {
    fn style(&mut self) -> &mut StyleRefinement {
        self
    }
}

impl StyleRefinement {
    /// The grid location of this element
    pub fn grid_location_mut(&mut self) -> &mut GridLocation {
        self.grid_location.get_or_insert_default()
    }
}

/// The value of the visibility property, similar to the CSS property `visibility`
#[derive(Default, Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum Visibility {
    /// The element should be drawn as normal.
    #[default]
    Visible,
    /// The element should not be drawn, but should still take up space in the layout.
    Hidden,
}

/// The possible values of the box-shadow property
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BoxShadow {
    /// What color should the shadow have?
    pub color: Hsla,
    /// How should it be offset from its element?
    pub offset: Point<Pixels>,
    /// How much should the shadow be blurred?
    pub blur_radius: Pixels,
    /// How much should the shadow spread?
    pub spread_radius: Pixels,
    /// Whether this is an inset shadow (drawn inside the element's bounds).
    pub inset: bool,
}

impl BoxShadow {
    /// Creates a new [`BoxShadow`] with the given offset and color, matching the order
    /// of the CSS `box-shadow` property. Use the builder methods to set blur radius,
    /// spread radius, and inset.
    pub fn new(offset_x: Pixels, offset_y: Pixels, color: Hsla) -> Self {
        Self {
            color,
            offset: point(offset_x, offset_y),
            blur_radius: px(0.),
            spread_radius: px(0.),
            inset: false,
        }
    }

    /// Sets the shadow blur radius.
    pub fn blur_radius(mut self, blur_radius: Pixels) -> Self {
        self.blur_radius = blur_radius;
        self
    }

    /// Sets the shadow spread radius.
    pub fn spread_radius(mut self, spread_radius: Pixels) -> Self {
        self.spread_radius = spread_radius;
        self
    }

    /// Marks the shadow as inset (drawn inside the element's bounds).
    pub fn inset(mut self) -> Self {
        self.inset = true;
        self
    }
}

/// How to handle whitespace in text
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum WhiteSpace {
    /// Normal line wrapping when text overflows the width of the element
    #[default]
    Normal,
    /// No line wrapping, text will overflow the width of the element
    Nowrap,
}

/// How to truncate text that overflows the width of the element
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TextOverflow {
    /// Truncate the text at the end when it doesn't fit, and represent this truncation by
    /// displaying the provided string (e.g., "very long te…").
    Truncate(SharedString),
    /// Truncate the text at the start when it doesn't fit, and represent this truncation by
    /// displaying the provided string at the beginning (e.g., "…ong text here").
    /// Typically more adequate for file paths where the end is more important than the beginning.
    TruncateStart(SharedString),
    /// Truncate the text in the middle when it doesn't fit, preserving both the start and end
    /// of the string (e.g., "long fi…name.rs"). Useful for filenames where both the prefix
    /// and the extension are important context.
    TruncateMiddle(SharedString),
}

/// How to align text within the element
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum TextAlign {
    /// Align the text to the left of the element
    #[default]
    Left,

    /// Center the text within the element
    Center,

    /// Align the text to the right of the element
    Right,
}

/// The properties that can be used to style text in GPUI
#[derive(Clone, Debug, PartialEq)]
pub struct TextStyle {
    /// The color of the text
    pub color: Hsla,

    /// The font family to use
    pub font_family: SharedString,

    /// The font features to use
    pub font_features: FontFeatures,

    /// The fallback fonts to use
    pub font_fallbacks: Option<FontFallbacks>,

    /// The font size to use, in pixels or rems.
    pub font_size: AbsoluteLength,

    /// The line height to use, in pixels or fractions
    pub line_height: DefiniteLength,

    /// The font weight, e.g. bold
    pub font_weight: FontWeight,

    /// The font style, e.g. italic
    pub font_style: FontStyle,

    /// The background color of the text
    pub background_color: Option<Hsla>,

    /// The underline style of the text
    pub underline: Option<UnderlineStyle>,

    /// The strikethrough style of the text
    pub strikethrough: Option<StrikethroughStyle>,

    /// How to handle whitespace in the text
    pub white_space: WhiteSpace,

    /// The text should be truncated if it overflows the width of the element
    pub text_overflow: Option<TextOverflow>,

    /// How the text should be aligned within the element
    pub text_align: TextAlign,

    /// The number of lines to display before truncating the text
    pub line_clamp: Option<usize>,
}
#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct TextStyleRefinement {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<Hsla>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<SharedString>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_features: Option<FontFeatures>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_fallbacks: Option<FontFallbacks>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<AbsoluteLength>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<DefiniteLength>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<FontWeight>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_style: Option<FontStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<Hsla>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub underline: Option<UnderlineStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strikethrough: Option<StrikethroughStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub white_space: Option<WhiteSpace>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_overflow: Option<TextOverflow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_align: Option<TextAlign>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_clamp: Option<usize>,
}

impl crate::refineable::IsEmpty for TextStyleRefinement {
    fn is_empty(&self) -> bool {
        let mut empty = true;
        {
            empty = empty && self.color.is_none();
        }
        {
            empty = empty && self.font_family.is_none();
        }
        {
            empty = empty && self.font_features.is_none();
        }
        {
            empty = empty && self.font_fallbacks.is_none();
        }
        {
            empty = empty && self.font_size.is_none();
        }
        {
            empty = empty && self.line_height.is_none();
        }
        {
            empty = empty && self.font_weight.is_none();
        }
        {
            empty = empty && self.font_style.is_none();
        }
        {
            empty = empty && self.background_color.is_none();
        }
        {
            empty = empty && self.underline.is_none();
        }
        {
            empty = empty && self.strikethrough.is_none();
        }
        {
            empty = empty && self.white_space.is_none();
        }
        {
            empty = empty && self.text_overflow.is_none();
        }
        {
            empty = empty && self.text_align.is_none();
        }
        {
            empty = empty && self.line_clamp.is_none();
        }
        empty
    }
}

impl crate::refineable::Refineable for TextStyle {
    type Refinement = TextStyleRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.color {
            self.color = val.clone();
        }
        if let Some(ref val) = refinement.font_family {
            self.font_family = val.clone();
        }
        if let Some(ref val) = refinement.font_features {
            self.font_features = val.clone();
        }
        if let Some(ref val) = refinement.font_fallbacks {
            self.font_fallbacks = Some(val.clone());
        }
        if let Some(ref val) = refinement.font_size {
            self.font_size = val.clone();
        }
        if let Some(ref val) = refinement.line_height {
            self.line_height = val.clone();
        }
        if let Some(ref val) = refinement.font_weight {
            self.font_weight = val.clone();
        }
        if let Some(ref val) = refinement.font_style {
            self.font_style = val.clone();
        }
        if let Some(ref val) = refinement.background_color {
            self.background_color = Some(val.clone());
        }
        if let Some(ref val) = refinement.underline {
            self.underline = Some(val.clone());
        }
        if let Some(ref val) = refinement.strikethrough {
            self.strikethrough = Some(val.clone());
        }
        if let Some(ref val) = refinement.white_space {
            self.white_space = val.clone();
        }
        if let Some(ref val) = refinement.text_overflow {
            self.text_overflow = Some(val.clone());
        }
        if let Some(ref val) = refinement.text_align {
            self.text_align = val.clone();
        }
        if let Some(ref val) = refinement.line_clamp {
            self.line_clamp = Some(val.clone());
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup && refinement.color.as_ref().is_none_or(|v| &self.color == v);
        }
        {
            sup = sup
                && refinement
                    .font_family
                    .as_ref()
                    .is_none_or(|v| &self.font_family == v);
        }
        {
            sup = sup
                && refinement
                    .font_features
                    .as_ref()
                    .is_none_or(|v| &self.font_features == v);
        }
        {
            sup = sup
                && refinement
                    .font_fallbacks
                    .as_ref()
                    .is_none_or(|v| self.font_fallbacks.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .font_size
                    .as_ref()
                    .is_none_or(|v| &self.font_size == v);
        }
        {
            sup = sup
                && refinement
                    .line_height
                    .as_ref()
                    .is_none_or(|v| &self.line_height == v);
        }
        {
            sup = sup
                && refinement
                    .font_weight
                    .as_ref()
                    .is_none_or(|v| &self.font_weight == v);
        }
        {
            sup = sup
                && refinement
                    .font_style
                    .as_ref()
                    .is_none_or(|v| &self.font_style == v);
        }
        {
            sup = sup
                && refinement
                    .background_color
                    .as_ref()
                    .is_none_or(|v| self.background_color.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .underline
                    .as_ref()
                    .is_none_or(|v| self.underline.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .strikethrough
                    .as_ref()
                    .is_none_or(|v| self.strikethrough.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .white_space
                    .as_ref()
                    .is_none_or(|v| &self.white_space == v);
        }
        {
            sup = sup
                && refinement
                    .text_overflow
                    .as_ref()
                    .is_none_or(|v| self.text_overflow.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .text_align
                    .as_ref()
                    .is_none_or(|v| &self.text_align == v);
        }
        {
            sup = sup
                && refinement
                    .line_clamp
                    .as_ref()
                    .is_none_or(|v| self.line_clamp.as_ref() == Some(v));
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = TextStyleRefinement::default();
        if refinement.color.as_ref() != Some(&self.color) {
            out.color = Some(self.color.clone());
        }
        if refinement.font_family.as_ref() != Some(&self.font_family) {
            out.font_family = Some(self.font_family.clone());
        }
        if refinement.font_features.as_ref() != Some(&self.font_features) {
            out.font_features = Some(self.font_features.clone());
        }
        if self.font_fallbacks != refinement.font_fallbacks {
            out.font_fallbacks = self.font_fallbacks.clone();
        }
        if refinement.font_size.as_ref() != Some(&self.font_size) {
            out.font_size = Some(self.font_size.clone());
        }
        if refinement.line_height.as_ref() != Some(&self.line_height) {
            out.line_height = Some(self.line_height.clone());
        }
        if refinement.font_weight.as_ref() != Some(&self.font_weight) {
            out.font_weight = Some(self.font_weight.clone());
        }
        if refinement.font_style.as_ref() != Some(&self.font_style) {
            out.font_style = Some(self.font_style.clone());
        }
        if self.background_color != refinement.background_color {
            out.background_color = self.background_color.clone();
        }
        if self.underline != refinement.underline {
            out.underline = self.underline.clone();
        }
        if self.strikethrough != refinement.strikethrough {
            out.strikethrough = self.strikethrough.clone();
        }
        if refinement.white_space.as_ref() != Some(&self.white_space) {
            out.white_space = Some(self.white_space.clone());
        }
        if self.text_overflow != refinement.text_overflow {
            out.text_overflow = self.text_overflow.clone();
        }
        if refinement.text_align.as_ref() != Some(&self.text_align) {
            out.text_align = Some(self.text_align.clone());
        }
        if self.line_clamp != refinement.line_clamp {
            out.line_clamp = self.line_clamp.clone();
        }
        out
    }
}

impl crate::refineable::Refineable for TextStyleRefinement {
    type Refinement = TextStyleRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.color {
            self.color = Some(val.clone());
        }
        if let Some(ref val) = refinement.font_family {
            self.font_family = Some(val.clone());
        }
        if let Some(ref val) = refinement.font_features {
            self.font_features = Some(val.clone());
        }
        if let Some(ref val) = refinement.font_fallbacks {
            self.font_fallbacks = Some(val.clone());
        }
        if let Some(ref val) = refinement.font_size {
            self.font_size = Some(val.clone());
        }
        if let Some(ref val) = refinement.line_height {
            self.line_height = Some(val.clone());
        }
        if let Some(ref val) = refinement.font_weight {
            self.font_weight = Some(val.clone());
        }
        if let Some(ref val) = refinement.font_style {
            self.font_style = Some(val.clone());
        }
        if let Some(ref val) = refinement.background_color {
            self.background_color = Some(val.clone());
        }
        if let Some(ref val) = refinement.underline {
            self.underline = Some(val.clone());
        }
        if let Some(ref val) = refinement.strikethrough {
            self.strikethrough = Some(val.clone());
        }
        if let Some(ref val) = refinement.white_space {
            self.white_space = Some(val.clone());
        }
        if let Some(ref val) = refinement.text_overflow {
            self.text_overflow = Some(val.clone());
        }
        if let Some(ref val) = refinement.text_align {
            self.text_align = Some(val.clone());
        }
        if let Some(ref val) = refinement.line_clamp {
            self.line_clamp = Some(val.clone());
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup
                && refinement
                    .color
                    .as_ref()
                    .is_none_or(|v| self.color.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .font_family
                    .as_ref()
                    .is_none_or(|v| self.font_family.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .font_features
                    .as_ref()
                    .is_none_or(|v| self.font_features.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .font_fallbacks
                    .as_ref()
                    .is_none_or(|v| self.font_fallbacks.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .font_size
                    .as_ref()
                    .is_none_or(|v| self.font_size.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .line_height
                    .as_ref()
                    .is_none_or(|v| self.line_height.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .font_weight
                    .as_ref()
                    .is_none_or(|v| self.font_weight.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .font_style
                    .as_ref()
                    .is_none_or(|v| self.font_style.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .background_color
                    .as_ref()
                    .is_none_or(|v| self.background_color.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .underline
                    .as_ref()
                    .is_none_or(|v| self.underline.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .strikethrough
                    .as_ref()
                    .is_none_or(|v| self.strikethrough.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .white_space
                    .as_ref()
                    .is_none_or(|v| self.white_space.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .text_overflow
                    .as_ref()
                    .is_none_or(|v| self.text_overflow.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .text_align
                    .as_ref()
                    .is_none_or(|v| self.text_align.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .line_clamp
                    .as_ref()
                    .is_none_or(|v| self.line_clamp.as_ref() == Some(v));
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = TextStyleRefinement::default();
        if self.color != refinement.color {
            out.color = self.color.clone();
        }
        if self.font_family != refinement.font_family {
            out.font_family = self.font_family.clone();
        }
        if self.font_features != refinement.font_features {
            out.font_features = self.font_features.clone();
        }
        if self.font_fallbacks != refinement.font_fallbacks {
            out.font_fallbacks = self.font_fallbacks.clone();
        }
        if self.font_size != refinement.font_size {
            out.font_size = self.font_size.clone();
        }
        if self.line_height != refinement.line_height {
            out.line_height = self.line_height.clone();
        }
        if self.font_weight != refinement.font_weight {
            out.font_weight = self.font_weight.clone();
        }
        if self.font_style != refinement.font_style {
            out.font_style = self.font_style.clone();
        }
        if self.background_color != refinement.background_color {
            out.background_color = self.background_color.clone();
        }
        if self.underline != refinement.underline {
            out.underline = self.underline.clone();
        }
        if self.strikethrough != refinement.strikethrough {
            out.strikethrough = self.strikethrough.clone();
        }
        if self.white_space != refinement.white_space {
            out.white_space = self.white_space.clone();
        }
        if self.text_overflow != refinement.text_overflow {
            out.text_overflow = self.text_overflow.clone();
        }
        if self.text_align != refinement.text_align {
            out.text_align = self.text_align.clone();
        }
        if self.line_clamp != refinement.line_clamp {
            out.line_clamp = self.line_clamp.clone();
        }
        out
    }
}

impl Default for TextStyle {
    fn default() -> Self {
        TextStyle {
            color: black(),
            // todo(linux) make this configurable or choose better default
            font_family: ".SystemUIFont".into(),
            font_features: FontFeatures::default(),
            font_fallbacks: None,
            font_size: rems(1.).into(),
            line_height: phi(),
            font_weight: FontWeight::default(),
            font_style: FontStyle::default(),
            background_color: None,
            underline: None,
            strikethrough: None,
            white_space: WhiteSpace::Normal,
            text_overflow: None,
            text_align: TextAlign::default(),
            line_clamp: None,
        }
    }
}

impl TextStyle {
    /// Create a new text style with the given highlighting applied.
    pub fn highlight(mut self, style: impl Into<HighlightStyle>) -> Self {
        let style = style.into();
        if let Some(weight) = style.font_weight {
            self.font_weight = weight;
        }
        if let Some(style) = style.font_style {
            self.font_style = style;
        }

        if let Some(color) = style.color {
            self.color = self.color.blend(color);
        }

        if let Some(factor) = style.fade_out {
            self.color.fade_out(factor);
        }

        if let Some(background_color) = style.background_color {
            self.background_color = Some(background_color);
        }

        if let Some(underline) = style.underline {
            self.underline = Some(underline);
        }

        if let Some(strikethrough) = style.strikethrough {
            self.strikethrough = Some(strikethrough);
        }

        self
    }

    /// Get the font configured for this text style.
    pub fn font(&self) -> Font {
        Font {
            family: self.font_family.clone(),
            features: self.font_features.clone(),
            fallbacks: self.font_fallbacks.clone(),
            weight: self.font_weight,
            style: self.font_style,
        }
    }

    /// Returns the rounded line height in pixels.
    pub fn line_height_in_pixels(&self, rem_size: Pixels) -> Pixels {
        self.line_height.to_pixels(self.font_size, rem_size).round()
    }

    /// Convert this text style into a [`TextRun`], for the given length of the text.
    pub fn to_run(&self, len: usize) -> TextRun {
        TextRun {
            len,
            font: Font {
                family: self.font_family.clone(),
                features: self.font_features.clone(),
                fallbacks: self.font_fallbacks.clone(),
                weight: self.font_weight,
                style: self.font_style,
            },
            color: self.color,
            background_color: self.background_color,
            underline: self.underline,
            strikethrough: self.strikethrough,
        }
    }
}

/// A highlight style to apply, similar to a `TextStyle` except
/// for a single font, uniformly sized and spaced text.
#[derive(Copy, Clone, Debug, Default, PartialEq)]
pub struct HighlightStyle {
    /// The color of the text
    pub color: Option<Hsla>,

    /// The font weight, e.g. bold
    pub font_weight: Option<FontWeight>,

    /// The font style, e.g. italic
    pub font_style: Option<FontStyle>,

    /// The background color of the text
    pub background_color: Option<Hsla>,

    /// The underline style of the text
    pub underline: Option<UnderlineStyle>,

    /// The underline style of the text
    pub strikethrough: Option<StrikethroughStyle>,

    /// Similar to the CSS `opacity` property, this will cause the text to be less vibrant.
    pub fade_out: Option<f32>,
}

impl Eq for HighlightStyle {}

impl Hash for HighlightStyle {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.color.hash(state);
        self.font_weight.hash(state);
        self.font_style.hash(state);
        self.background_color.hash(state);
        self.underline.hash(state);
        self.strikethrough.hash(state);
        state.write_u32(u32::from_be_bytes(
            self.fade_out.map(|f| f.to_be_bytes()).unwrap_or_default(),
        ));
    }
}

impl Style {
    /// Returns true if the style is visible and the background is opaque.
    pub fn has_opaque_background(&self) -> bool {
        self.background
            .as_ref()
            .is_some_and(|fill| fill.color().is_some_and(|color| !color.is_transparent()))
    }

    /// Get the text style in this element style.
    pub fn text_style(&self) -> Option<&TextStyleRefinement> {
        if self.text.is_some() {
            Some(&self.text)
        } else {
            None
        }
    }

    /// Get the content mask for this element style, based on the given bounds.
    /// If the element does not hide its overflow, this will return `None`.
    pub fn overflow_mask(
        &self,
        bounds: Bounds<Pixels>,
        rem_size: Pixels,
    ) -> Option<ContentMask<Pixels>> {
        match self.overflow {
            Point {
                x: Overflow::Visible,
                y: Overflow::Visible,
            } => None,
            _ => {
                let mut min = bounds.origin;
                let mut max = bounds.bottom_right();

                if self
                    .border_color
                    .is_some_and(|color| !color.is_transparent())
                {
                    min.x += self.border_widths.left.to_pixels(rem_size);
                    max.x -= self.border_widths.right.to_pixels(rem_size);
                    min.y += self.border_widths.top.to_pixels(rem_size);
                    max.y -= self.border_widths.bottom.to_pixels(rem_size);
                }

                let bounds = match (
                    self.overflow.x == Overflow::Visible,
                    self.overflow.y == Overflow::Visible,
                ) {
                    // x and y both visible
                    (true, true) => return None,
                    // x visible, y hidden
                    (true, false) => Bounds::from_corners(
                        point(min.x, bounds.origin.y),
                        point(max.x, bounds.bottom_right().y),
                    ),
                    // x hidden, y visible
                    (false, true) => Bounds::from_corners(
                        point(bounds.origin.x, min.y),
                        point(bounds.bottom_right().x, max.y),
                    ),
                    // both hidden
                    (false, false) => Bounds::from_corners(min, max),
                };

                Some(ContentMask { bounds })
            }
        }
    }

    /// Paints the background of an element styled with this style.
    pub fn paint(
        &self,
        bounds: Bounds<Pixels>,
        window: &mut Window,
        cx: &mut App,
        continuation: impl FnOnce(&mut Window, &mut App),
    ) {
        #[cfg(debug_assertions)]
        if self.debug_below {
            cx.set_global(DebugBelow)
        }

        #[cfg(debug_assertions)]
        if self.debug || cx.has_global::<DebugBelow>() {
            window.paint_quad(crate::outline(bounds, crate::red(), BorderStyle::default()));
        }

        let rem_size = window.rem_size();
        let corner_radii = self
            .corner_radii
            .to_pixels(rem_size)
            .clamp_radii_for_quad_size(bounds.size);

        window.paint_drop_shadows(bounds, corner_radii, &self.box_shadow);

        let background_color = self.background.as_ref().and_then(Fill::color);
        if background_color.is_some_and(|color| !color.is_transparent()) {
            let mut border_color = match background_color {
                Some(color) => match color.tag {
                    BackgroundTag::Solid
                    | BackgroundTag::PatternSlash
                    | BackgroundTag::Checkerboard
                    | BackgroundTag::DotGrid => color.solid,

                    BackgroundTag::LinearGradient => color
                        .colors
                        .first()
                        .map(|stop| stop.color)
                        .unwrap_or_default(),
                },
                None => Hsla::default(),
            };
            border_color.a = 0.;
            window.paint_quad(quad(
                bounds,
                corner_radii,
                background_color.unwrap_or_default(),
                Edges::default(),
                border_color,
                self.border_style,
            ));
        }

        window.paint_inset_shadows(bounds, corner_radii, &self.box_shadow);

        crate::fast::rounded_clip::paint_children(self, bounds, window, cx, continuation);

        if self.is_border_visible() {
            let border_widths = self.border_widths.to_pixels(rem_size);
            let mut background = self.border_color.unwrap_or_default();
            background.a = 0.;
            window.paint_quad(quad(
                bounds,
                corner_radii,
                background,
                border_widths,
                self.border_color.unwrap_or_default(),
                self.border_style,
            ));
        }

        #[cfg(debug_assertions)]
        if self.debug_below {
            cx.remove_global::<DebugBelow>();
        }
    }

    fn is_border_visible(&self) -> bool {
        self.border_color
            .is_some_and(|color| !color.is_transparent())
            && self.border_widths.any(|length| !length.is_zero())
    }
}

impl Default for Style {
    fn default() -> Self {
        Style {
            display: Display::Block,
            visibility: Visibility::Visible,
            overflow: Point {
                x: Overflow::Visible,
                y: Overflow::Visible,
            },
            allow_concurrent_scroll: false,
            restrict_scroll_to_axis: false,
            scrollbar_width: AbsoluteLength::default(),
            position: Position::Relative,
            inset: Edges::auto(),
            margin: Edges::<Length>::zero(),
            padding: Edges::<DefiniteLength>::zero(),
            border_widths: Edges::<AbsoluteLength>::zero(),
            size: Size::auto(),
            min_size: Size::auto(),
            max_size: Size::auto(),
            aspect_ratio: None,
            gap: Size::default(),
            // Alignment
            align_items: None,
            align_self: None,
            align_content: None,
            justify_content: None,
            // Flexbox
            flex_direction: FlexDirection::Row,
            flex_wrap: FlexWrap::NoWrap,
            flex_grow: 0.0,
            flex_shrink: 1.0,
            flex_basis: Length::Auto,
            background: None,
            border_color: None,
            border_style: BorderStyle::default(),
            corner_radii: Corners::default(),
            box_shadow: Default::default(),
            text: TextStyleRefinement::default(),
            mouse_cursor: None,
            opacity: None,
            grid_rows: None,
            grid_cols: None,
            grid_location: None,

            #[cfg(debug_assertions)]
            debug: false,
            #[cfg(debug_assertions)]
            debug_below: false,
        }
    }
}

/// The properties that can be applied to an underline.
#[derive(Copy, Clone, Default, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct UnderlineStyle {
    /// The thickness of the underline.
    pub thickness: Pixels,

    /// The color of the underline.
    pub color: Option<Hsla>,

    /// Whether the underline should be wavy, like in a spell checker.
    pub wavy: bool,
}
#[derive(Clone, Default)]
pub struct UnderlineStyleRefinement {
    pub thickness: Option<Pixels>,
    pub color: Option<Hsla>,
    pub wavy: Option<bool>,
}

impl crate::refineable::IsEmpty for UnderlineStyleRefinement {
    fn is_empty(&self) -> bool {
        let mut empty = true;
        {
            empty = empty && self.thickness.is_none();
        }
        {
            empty = empty && self.color.is_none();
        }
        {
            empty = empty && self.wavy.is_none();
        }
        empty
    }
}

impl crate::refineable::Refineable for UnderlineStyle {
    type Refinement = UnderlineStyleRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.thickness {
            self.thickness = val.clone();
        }
        if let Some(ref val) = refinement.color {
            self.color = Some(val.clone());
        }
        if let Some(ref val) = refinement.wavy {
            self.wavy = val.clone();
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup
                && refinement
                    .thickness
                    .as_ref()
                    .is_none_or(|v| &self.thickness == v);
        }
        {
            sup = sup
                && refinement
                    .color
                    .as_ref()
                    .is_none_or(|v| self.color.as_ref() == Some(v));
        }
        {
            sup = sup && refinement.wavy.as_ref().is_none_or(|v| &self.wavy == v);
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = UnderlineStyleRefinement::default();
        if refinement.thickness.as_ref() != Some(&self.thickness) {
            out.thickness = Some(self.thickness.clone());
        }
        if self.color != refinement.color {
            out.color = self.color.clone();
        }
        if refinement.wavy.as_ref() != Some(&self.wavy) {
            out.wavy = Some(self.wavy.clone());
        }
        out
    }
}

impl crate::refineable::Refineable for UnderlineStyleRefinement {
    type Refinement = UnderlineStyleRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.thickness {
            self.thickness = Some(val.clone());
        }
        if let Some(ref val) = refinement.color {
            self.color = Some(val.clone());
        }
        if let Some(ref val) = refinement.wavy {
            self.wavy = Some(val.clone());
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup
                && refinement
                    .thickness
                    .as_ref()
                    .is_none_or(|v| self.thickness.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .color
                    .as_ref()
                    .is_none_or(|v| self.color.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .wavy
                    .as_ref()
                    .is_none_or(|v| self.wavy.as_ref() == Some(v));
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = UnderlineStyleRefinement::default();
        if self.thickness != refinement.thickness {
            out.thickness = self.thickness.clone();
        }
        if self.color != refinement.color {
            out.color = self.color.clone();
        }
        if self.wavy != refinement.wavy {
            out.wavy = self.wavy.clone();
        }
        out
    }
}

/// The properties that can be applied to a strikethrough.
#[derive(Copy, Clone, Default, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct StrikethroughStyle {
    /// The thickness of the strikethrough.
    pub thickness: Pixels,

    /// The color of the strikethrough.
    pub color: Option<Hsla>,
}
#[derive(Clone, Default)]
pub struct StrikethroughStyleRefinement {
    pub thickness: Option<Pixels>,
    pub color: Option<Hsla>,
}

impl crate::refineable::IsEmpty for StrikethroughStyleRefinement {
    fn is_empty(&self) -> bool {
        let mut empty = true;
        {
            empty = empty && self.thickness.is_none();
        }
        {
            empty = empty && self.color.is_none();
        }
        empty
    }
}

impl crate::refineable::Refineable for StrikethroughStyle {
    type Refinement = StrikethroughStyleRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.thickness {
            self.thickness = val.clone();
        }
        if let Some(ref val) = refinement.color {
            self.color = Some(val.clone());
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup
                && refinement
                    .thickness
                    .as_ref()
                    .is_none_or(|v| &self.thickness == v);
        }
        {
            sup = sup
                && refinement
                    .color
                    .as_ref()
                    .is_none_or(|v| self.color.as_ref() == Some(v));
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = StrikethroughStyleRefinement::default();
        if refinement.thickness.as_ref() != Some(&self.thickness) {
            out.thickness = Some(self.thickness.clone());
        }
        if self.color != refinement.color {
            out.color = self.color.clone();
        }
        out
    }
}

impl crate::refineable::Refineable for StrikethroughStyleRefinement {
    type Refinement = StrikethroughStyleRefinement;

    fn refine(&mut self, refinement: &Self::Refinement) {
        if let Some(ref val) = refinement.thickness {
            self.thickness = Some(val.clone());
        }
        if let Some(ref val) = refinement.color {
            self.color = Some(val.clone());
        }
    }

    fn refined(mut self, refinement: Self::Refinement) -> Self {
        self.refine(&refinement);
        self
    }

    fn is_superset_of(&self, refinement: &Self::Refinement) -> bool {
        let mut sup = true;
        {
            sup = sup
                && refinement
                    .thickness
                    .as_ref()
                    .is_none_or(|v| self.thickness.as_ref() == Some(v));
        }
        {
            sup = sup
                && refinement
                    .color
                    .as_ref()
                    .is_none_or(|v| self.color.as_ref() == Some(v));
        }
        sup
    }

    fn subtract(&self, refinement: &Self::Refinement) -> Self::Refinement {
        let mut out = StrikethroughStyleRefinement::default();
        if self.thickness != refinement.thickness {
            out.thickness = self.thickness.clone();
        }
        if self.color != refinement.color {
            out.color = self.color.clone();
        }
        out
    }
}

/// The kinds of fill that can be applied to a shape.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Fill {
    /// A solid color fill.
    Color(Background),
}

impl Fill {
    /// Unwrap this fill into a solid color, if it is one.
    ///
    /// If the fill is not a solid color, this method returns `None`.
    pub fn color(&self) -> Option<Background> {
        match self {
            Fill::Color(color) => Some(*color),
        }
    }
}

impl Default for Fill {
    fn default() -> Self {
        Self::Color(Background::default())
    }
}

impl From<Hsla> for Fill {
    fn from(color: Hsla) -> Self {
        Self::Color(color.into())
    }
}

impl From<Rgba> for Fill {
    fn from(color: Rgba) -> Self {
        Self::Color(color.into())
    }
}

impl From<Background> for Fill {
    fn from(background: Background) -> Self {
        Self::Color(background)
    }
}

impl From<TextStyle> for HighlightStyle {
    fn from(other: TextStyle) -> Self {
        Self::from(&other)
    }
}

impl From<&TextStyle> for HighlightStyle {
    fn from(other: &TextStyle) -> Self {
        Self {
            color: Some(other.color),
            font_weight: Some(other.font_weight),
            font_style: Some(other.font_style),
            background_color: other.background_color,
            underline: other.underline,
            strikethrough: other.strikethrough,
            fade_out: None,
        }
    }
}

impl HighlightStyle {
    /// Create a highlight style with just a color
    pub fn color(color: Hsla) -> Self {
        Self {
            color: Some(color),
            ..Default::default()
        }
    }
    /// Blend this highlight style with another.
    /// Non-continuous properties, like font_weight and font_style, are overwritten.
    #[must_use]
    pub fn highlight(self, other: HighlightStyle) -> Self {
        Self {
            color: other
                .color
                .map(|other_color| {
                    if let Some(color) = self.color {
                        color.blend(other_color)
                    } else {
                        other_color
                    }
                })
                .or(self.color),
            font_weight: other.font_weight.or(self.font_weight),
            font_style: other.font_style.or(self.font_style),
            background_color: other.background_color.or(self.background_color),
            underline: other.underline.or(self.underline),
            strikethrough: other.strikethrough.or(self.strikethrough),
            fade_out: other
                .fade_out
                .map(|source_fade| {
                    self.fade_out
                        .map(|dest_fade| (dest_fade * (1. + source_fade)).clamp(0., 1.))
                        .unwrap_or(source_fade)
                })
                .or(self.fade_out),
        }
    }
}

impl From<Hsla> for HighlightStyle {
    fn from(color: Hsla) -> Self {
        Self {
            color: Some(color),
            ..Default::default()
        }
    }
}

impl From<FontWeight> for HighlightStyle {
    fn from(font_weight: FontWeight) -> Self {
        Self {
            font_weight: Some(font_weight),
            ..Default::default()
        }
    }
}

impl From<FontStyle> for HighlightStyle {
    fn from(font_style: FontStyle) -> Self {
        Self {
            font_style: Some(font_style),
            ..Default::default()
        }
    }
}

impl From<Rgba> for HighlightStyle {
    fn from(color: Rgba) -> Self {
        Self {
            color: Some(color.into()),
            ..Default::default()
        }
    }
}

/// Combine and merge the highlights and ranges in the two iterators.
pub fn combine_highlights(
    a: impl IntoIterator<Item = (Range<usize>, HighlightStyle)>,
    b: impl IntoIterator<Item = (Range<usize>, HighlightStyle)>,
) -> impl Iterator<Item = (Range<usize>, HighlightStyle)> {
    let mut endpoints = Vec::new();
    let mut highlights = Vec::new();
    for (range, highlight) in a.into_iter().chain(b) {
        if !range.is_empty() {
            let highlight_id = highlights.len();
            endpoints.push((range.start, highlight_id, true));
            endpoints.push((range.end, highlight_id, false));
            highlights.push(highlight);
        }
    }
    endpoints.sort_unstable_by_key(|(position, _, _)| *position);
    let mut endpoints = endpoints.into_iter().peekable();

    let mut active_styles = HashSet::default();
    let mut ix = 0;
    iter::from_fn(move || {
        while let Some((endpoint_ix, highlight_id, is_start)) = endpoints.peek() {
            let prev_index = mem::replace(&mut ix, *endpoint_ix);
            if ix > prev_index && !active_styles.is_empty() {
                let current_style = active_styles
                    .iter()
                    .fold(HighlightStyle::default(), |acc, highlight_id| {
                        acc.highlight(highlights[*highlight_id])
                    });
                return Some((prev_index..ix, current_style));
            }

            if *is_start {
                active_styles.insert(*highlight_id);
            } else {
                active_styles.remove(highlight_id);
            }
            endpoints.next();
        }
        None
    })
}

/// Used to control how child nodes are aligned.
/// For Flexbox it controls alignment in the cross axis
/// For Grid it controls alignment in the block axis
///
/// [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/align-items)
#[derive(Copy, Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
// Copy of taffy::style type of the same name, to derive JsonSchema.
pub enum AlignItems {
    /// Items are packed toward the start of the axis
    Start,
    /// Items are packed toward the end of the axis
    End,
    /// Items are packed towards the flex-relative start of the axis.
    ///
    /// For flex containers with flex_direction RowReverse or ColumnReverse this is equivalent
    /// to End. In all other cases it is equivalent to Start.
    FlexStart,
    /// Items are packed towards the flex-relative end of the axis.
    ///
    /// For flex containers with flex_direction RowReverse or ColumnReverse this is equivalent
    /// to Start. In all other cases it is equivalent to End.
    FlexEnd,
    /// Items are packed along the center of the cross axis
    Center,
    /// Items are aligned such as their baselines align
    Baseline,
    /// Stretch to fill the container
    Stretch,
}
/// Used to control how child nodes are aligned.
/// Does not apply to Flexbox, and will be ignored if specified on a flex container
/// For Grid it controls alignment in the inline axis
///
/// [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/justify-items)
pub type JustifyItems = AlignItems;
/// Used to control how the specified nodes is aligned.
/// Overrides the parent Node's `AlignItems` property.
/// For Flexbox it controls alignment in the cross axis
/// For Grid it controls alignment in the block axis
///
/// [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/align-self)
pub type AlignSelf = AlignItems;
/// Used to control how the specified nodes is aligned.
/// Overrides the parent Node's `JustifyItems` property.
/// Does not apply to Flexbox, and will be ignored if specified on a flex child
/// For Grid it controls alignment in the inline axis
///
/// [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/justify-self)
pub type JustifySelf = AlignItems;

/// Sets the distribution of space between and around content items
/// For Flexbox it controls alignment in the cross axis
/// For Grid it controls alignment in the block axis
///
/// [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/align-content)
#[derive(Copy, Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
// Copy of taffy::style type of the same name, to derive JsonSchema.
pub enum AlignContent {
    /// Items are packed toward the start of the axis
    Start,
    /// Items are packed toward the end of the axis
    End,
    /// Items are packed towards the flex-relative start of the axis.
    ///
    /// For flex containers with flex_direction RowReverse or ColumnReverse this is equivalent
    /// to End. In all other cases it is equivalent to Start.
    FlexStart,
    /// Items are packed towards the flex-relative end of the axis.
    ///
    /// For flex containers with flex_direction RowReverse or ColumnReverse this is equivalent
    /// to Start. In all other cases it is equivalent to End.
    FlexEnd,
    /// Items are centered around the middle of the axis
    Center,
    /// Items are stretched to fill the container
    Stretch,
    /// The first and last items are aligned flush with the edges of the container (no gap)
    /// The gap between items is distributed evenly.
    SpaceBetween,
    /// The gap between the first and last items is exactly THE SAME as the gap between items.
    /// The gaps are distributed evenly
    SpaceEvenly,
    /// The gap between the first and last items is exactly HALF the gap between items.
    /// The gaps are distributed evenly in proportion to these ratios.
    SpaceAround,
}

/// Sets the distribution of space between and around content items
/// For Flexbox it controls alignment in the main axis
/// For Grid it controls alignment in the inline axis
///
/// [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content)
pub type JustifyContent = AlignContent;

/// Sets the layout used for the children of this node
///
/// The default values depends on on which feature flags are enabled. The order of precedence is: Flex, Grid, Block, None.
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
// Copy of taffy::style type of the same name, to derive JsonSchema.
pub enum Display {
    /// The children will follow the block layout algorithm
    Block,
    /// The children will follow the flexbox layout algorithm
    #[default]
    Flex,
    /// The children will follow the CSS Grid layout algorithm
    Grid,
    /// The children will not be laid out, and will follow absolute positioning
    None,
}

/// Controls whether flex items are forced onto one line or can wrap onto multiple lines.
///
/// Defaults to [`FlexWrap::NoWrap`]
///
/// [Specification](https://www.w3.org/TR/css-flexbox-1/#flex-wrap-property)
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
// Copy of taffy::style type of the same name, to derive JsonSchema.
pub enum FlexWrap {
    /// Items will not wrap and stay on a single line
    #[default]
    NoWrap,
    /// Items will wrap according to this item's [`FlexDirection`]
    Wrap,
    /// Items will wrap in the opposite direction to this item's [`FlexDirection`]
    WrapReverse,
}

/// The direction of the flexbox layout main axis.
///
/// There are always two perpendicular layout axes: main (or primary) and cross (or secondary).
/// Adding items will cause them to be positioned adjacent to each other along the main axis.
/// By varying this value throughout your tree, you can create complex axis-aligned layouts.
///
/// Items are always aligned relative to the cross axis, and justified relative to the main axis.
///
/// The default behavior is [`FlexDirection::Row`].
///
/// [Specification](https://www.w3.org/TR/css-flexbox-1/#flex-direction-property)
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
// Copy of taffy::style type of the same name, to derive JsonSchema.
pub enum FlexDirection {
    /// Defines +x as the main axis
    ///
    /// Items will be added from left to right in a row.
    #[default]
    Row,
    /// Defines +y as the main axis
    ///
    /// Items will be added from top to bottom in a column.
    Column,
    /// Defines -x as the main axis
    ///
    /// Items will be added from right to left in a row.
    RowReverse,
    /// Defines -y as the main axis
    ///
    /// Items will be added from bottom to top in a column.
    ColumnReverse,
}

/// How children overflowing their container should affect layout
///
/// In CSS the primary effect of this property is to control whether contents of a parent container that overflow that container should
/// be displayed anyway, be clipped, or trigger the container to become a scroll container. However it also has secondary effects on layout,
/// the main ones being:
///
///   - The automatic minimum size Flexbox/CSS Grid items with non-`Visible` overflow is `0` rather than being content based
///   - `Overflow::Scroll` nodes have space in the layout reserved for a scrollbar (width controlled by the `scrollbar_width` property)
///
/// In Taffy, we only implement the layout related secondary effects as we are not concerned with drawing/painting. The amount of space reserved for
/// a scrollbar is controlled by the `scrollbar_width` property. If this is `0` then `Scroll` behaves identically to `Hidden`.
///
/// <https://developer.mozilla.org/en-US/docs/Web/CSS/overflow>
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
// Copy of taffy::style type of the same name, to derive JsonSchema.
pub enum Overflow {
    /// The automatic minimum size of this node as a flexbox/grid item should be based on the size of its content.
    /// Content that overflows this node *should* contribute to the scroll region of its parent.
    #[default]
    Visible,
    /// The automatic minimum size of this node as a flexbox/grid item should be based on the size of its content.
    /// Content that overflows this node should *not* contribute to the scroll region of its parent.
    Clip,
    /// The automatic minimum size of this node as a flexbox/grid item should be `0`.
    /// Content that overflows this node should *not* contribute to the scroll region of its parent.
    Hidden,
    /// The automatic minimum size of this node as a flexbox/grid item should be `0`. Additionally, space should be reserved
    /// for a scrollbar. The amount of space reserved is controlled by the `scrollbar_width` property.
    /// Content that overflows this node should *not* contribute to the scroll region of its parent.
    Scroll,
}

/// The positioning strategy for this item.
///
/// This controls both how the origin is determined for the [`Style::position`] field,
/// and whether or not the item will be controlled by flexbox's layout algorithm.
///
/// WARNING: this enum follows the behavior of [CSS's `position` property](https://developer.mozilla.org/en-US/docs/Web/CSS/position),
/// which can be unintuitive.
///
/// [`Position::Relative`] is the default value, in contrast to the default behavior in CSS.
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
// Copy of taffy::style type of the same name, to derive JsonSchema.
pub enum Position {
    /// The offset is computed relative to the final position given by the layout algorithm.
    /// Offsets do not affect the position of any other items; they are effectively a correction factor applied at the end.
    #[default]
    Relative,
    /// The offset is computed relative to this item's closest positioned ancestor, if any.
    /// Otherwise, it is placed relative to the origin.
    /// No space is created for the item in the page layout, and its size will not be altered.
    ///
    /// WARNING: to opt-out of layouting entirely, you must use [`Display::None`] instead on your [`Style`] object.
    Absolute,
}

impl From<AlignItems> for taffy::style::AlignItems {
    fn from(value: AlignItems) -> Self {
        match value {
            AlignItems::Start => Self::START,
            AlignItems::End => Self::END,
            AlignItems::FlexStart => Self::FLEX_START,
            AlignItems::FlexEnd => Self::FLEX_END,
            AlignItems::Center => Self::CENTER,
            AlignItems::Baseline => Self::BASELINE,
            AlignItems::Stretch => Self::STRETCH,
        }
    }
}

impl From<AlignContent> for taffy::style::AlignContent {
    fn from(value: AlignContent) -> Self {
        match value {
            AlignContent::Start => Self::START,
            AlignContent::End => Self::END,
            AlignContent::FlexStart => Self::FLEX_START,
            AlignContent::FlexEnd => Self::FLEX_END,
            AlignContent::Center => Self::CENTER,
            AlignContent::Stretch => Self::STRETCH,
            AlignContent::SpaceBetween => Self::SPACE_BETWEEN,
            AlignContent::SpaceEvenly => Self::SPACE_EVENLY,
            AlignContent::SpaceAround => Self::SPACE_AROUND,
        }
    }
}

impl From<Display> for taffy::style::Display {
    fn from(value: Display) -> Self {
        match value {
            Display::Block => Self::Block,
            Display::Flex => Self::Flex,
            Display::Grid => Self::Grid,
            Display::None => Self::None,
        }
    }
}

impl From<FlexWrap> for taffy::style::FlexWrap {
    fn from(value: FlexWrap) -> Self {
        match value {
            FlexWrap::NoWrap => Self::NoWrap,
            FlexWrap::Wrap => Self::Wrap,
            FlexWrap::WrapReverse => Self::WrapReverse,
        }
    }
}

impl From<FlexDirection> for taffy::style::FlexDirection {
    fn from(value: FlexDirection) -> Self {
        match value {
            FlexDirection::Row => Self::Row,
            FlexDirection::Column => Self::Column,
            FlexDirection::RowReverse => Self::RowReverse,
            FlexDirection::ColumnReverse => Self::ColumnReverse,
        }
    }
}

impl From<Overflow> for taffy::style::Overflow {
    fn from(value: Overflow) -> Self {
        match value {
            Overflow::Visible => Self::Visible,
            Overflow::Clip => Self::Clip,
            Overflow::Hidden => Self::Hidden,
            Overflow::Scroll => Self::Scroll,
        }
    }
}

impl From<Position> for taffy::style::Position {
    fn from(value: Position) -> Self {
        match value {
            Position::Relative => Self::Relative,
            Position::Absolute => Self::Absolute,
        }
    }
}

impl TextStyleRefinement {
    pub fn is_some(&self) -> bool {
        !crate::refineable::IsEmpty::is_empty(self)
    }
}
