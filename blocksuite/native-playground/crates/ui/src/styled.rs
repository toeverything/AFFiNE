use crate::{
    self as gpui, AbsoluteLength, AlignContent, AlignItems, AlignSelf, BorderStyle, CursorStyle,
    DefiniteLength, Display, Fill, FlexDirection, FlexWrap, Font, FontFeatures, FontStyle,
    FontWeight, GridPlacement, GridTemplate, GridTemplateMinSize, Hsla, JustifyContent, Length,
    SharedString, StrikethroughStyle, StyleRefinement, TextAlign, TextOverflow,
    TextStyleRefinement, UnderlineStyle, WhiteSpace, px, relative, rems,
};
use smallvec::SmallVec;
const ELLIPSIS: SharedString = SharedString::new_static("…");

/// A trait for elements that can be styled.
/// Use this to opt-in to a utility CSS-like styling API.
// gate on rust-analyzer so rust-analyzer never needs to expand this macro, it takes up to 10 seconds to expand due to inefficiencies in rust-analyzers proc-macro srv
pub trait Styled: Sized {
    /// Returns a reference to the style memory of this element.
    fn style(&mut self) -> &mut StyleRefinement;

    fn visible(mut self) -> Self {
        self.style().visibility = Some(crate::Visibility::Visible);
        self
    }

    fn invisible(mut self) -> Self {
        self.style().visibility = Some(crate::Visibility::Hidden);
        self
    }

    fn relative(mut self) -> Self {
        self.style().position = Some(crate::Position::Relative);
        self
    }

    fn absolute(mut self) -> Self {
        self.style().position = Some(crate::Position::Absolute);
        self
    }

    fn overflow_hidden(mut self) -> Self {
        self.style().overflow.x = Some(crate::Overflow::Hidden);
        self.style().overflow.y = Some(crate::Overflow::Hidden);
        self
    }

    fn cursor(mut self, cursor: CursorStyle) -> Self {
        self.style().mouse_cursor = Some(cursor);
        self
    }

    fn cursor_default(mut self) -> Self {
        self.style().mouse_cursor = Some(crate::CursorStyle::Arrow);
        self
    }

    fn cursor_pointer(mut self) -> Self {
        self.style().mouse_cursor = Some(crate::CursorStyle::PointingHand);
        self
    }

    fn cursor_grab(mut self) -> Self {
        self.style().mouse_cursor = Some(crate::CursorStyle::OpenHand);
        self
    }

    fn cursor_grabbing(mut self) -> Self {
        self.style().mouse_cursor = Some(crate::CursorStyle::ClosedHand);
        self
    }

    fn m(mut self, margin: impl Into<Length>) -> Self {
        let margin = margin.into();
        self.style().margin.top = Some(margin);
        self.style().margin.right = Some(margin);
        self.style().margin.bottom = Some(margin);
        self.style().margin.left = Some(margin);
        self
    }

    fn mx(mut self, margin: impl Into<Length>) -> Self {
        let margin = margin.into();
        self.style().margin.left = Some(margin);
        self.style().margin.right = Some(margin);
        self
    }

    fn my(mut self, margin: impl Into<Length>) -> Self {
        let margin = margin.into();
        self.style().margin.top = Some(margin);
        self.style().margin.bottom = Some(margin);
        self
    }

    fn mt(mut self, margin: impl Into<Length>) -> Self {
        self.style().margin.top = Some(margin.into());
        self
    }

    fn mr(mut self, margin: impl Into<Length>) -> Self {
        self.style().margin.right = Some(margin.into());
        self
    }

    fn mb(mut self, margin: impl Into<Length>) -> Self {
        self.style().margin.bottom = Some(margin.into());
        self
    }

    fn mt_1(self) -> Self {
        self.mt(rems(0.25))
    }
    fn mb_2(self) -> Self {
        self.mb(rems(0.5))
    }
    fn w_72(self) -> Self {
        self.w(rems(18.0))
    }

    fn border_color(mut self, border_color: impl Into<Hsla>) -> Self {
        self.style().border_color = Some(border_color.into());
        self
    }

    fn p(mut self, padding: impl Into<DefiniteLength>) -> Self {
        let padding = padding.into();
        self.style().padding.top = Some(padding);
        self.style().padding.right = Some(padding);
        self.style().padding.bottom = Some(padding);
        self.style().padding.left = Some(padding);
        self
    }

    fn px(mut self, padding: impl Into<DefiniteLength>) -> Self {
        let padding = padding.into();
        self.style().padding.left = Some(padding);
        self.style().padding.right = Some(padding);
        self
    }

    fn py(mut self, padding: impl Into<DefiniteLength>) -> Self {
        let padding = padding.into();
        self.style().padding.top = Some(padding);
        self.style().padding.bottom = Some(padding);
        self
    }

    fn pt(mut self, padding: impl Into<DefiniteLength>) -> Self {
        self.style().padding.top = Some(padding.into());
        self
    }

    fn pr(mut self, padding: impl Into<DefiniteLength>) -> Self {
        self.style().padding.right = Some(padding.into());
        self
    }

    fn pb(mut self, padding: impl Into<DefiniteLength>) -> Self {
        self.style().padding.bottom = Some(padding.into());
        self
    }

    fn pl(mut self, padding: impl Into<DefiniteLength>) -> Self {
        self.style().padding.left = Some(padding.into());
        self
    }

    fn p_3(self) -> Self {
        self.p(rems(0.75))
    }
    fn py_1(self) -> Self {
        self.py(rems(0.25))
    }
    fn inset(mut self, inset: impl Into<Length>) -> Self {
        let inset = inset.into();
        self.style().inset.top = Some(inset);
        self.style().inset.right = Some(inset);
        self.style().inset.bottom = Some(inset);
        self.style().inset.left = Some(inset);
        self
    }

    fn inset_0(self) -> Self {
        self.inset(px(0.))
    }

    fn top(mut self, top: impl Into<Length>) -> Self {
        self.style().inset.top = Some(top.into());
        self
    }

    fn right(mut self, right: impl Into<Length>) -> Self {
        self.style().inset.right = Some(right.into());
        self
    }

    fn bottom(mut self, bottom: impl Into<Length>) -> Self {
        self.style().inset.bottom = Some(bottom.into());
        self
    }

    fn left(mut self, left: impl Into<Length>) -> Self {
        self.style().inset.left = Some(left.into());
        self
    }

    fn top_0(self) -> Self {
        self.top(px(0.))
    }
    fn left_0(self) -> Self {
        self.left(px(0.))
    }

    fn w(mut self, width: impl Into<Length>) -> Self {
        self.style().size.width = Some(width.into());
        self
    }

    fn h(mut self, height: impl Into<Length>) -> Self {
        self.style().size.height = Some(height.into());
        self
    }

    fn size(mut self, length: impl Into<Length>) -> Self {
        let length = length.into();
        self.style().size.width = Some(length);
        self.style().size.height = Some(length);
        self
    }

    fn w_full(self) -> Self {
        self.w(relative(1.))
    }
    fn size_full(self) -> Self {
        self.size(relative(1.))
    }
    fn min_w(mut self, width: impl Into<Length>) -> Self {
        self.style().min_size.width = Some(width.into());
        self
    }

    fn min_h(mut self, height: impl Into<Length>) -> Self {
        self.style().min_size.height = Some(height.into());
        self
    }

    fn min_h_0(self) -> Self {
        self.min_h(px(0.))
    }

    fn gap(mut self, gap: impl Into<DefiniteLength>) -> Self {
        let gap = gap.into();
        self.style().gap.width = Some(gap);
        self.style().gap.height = Some(gap);
        self
    }

    fn rounded(mut self, radius: impl Into<AbsoluteLength>) -> Self {
        let radius = radius.into();
        self.style().corner_radii.top_left = Some(radius);
        self.style().corner_radii.top_right = Some(radius);
        self.style().corner_radii.bottom_right = Some(radius);
        self.style().corner_radii.bottom_left = Some(radius);
        self
    }

    fn rounded_xs(self) -> Self {
        self.rounded(px(2.))
    }
    fn rounded_lg(self) -> Self {
        self.rounded(px(8.))
    }
    fn border(mut self, width: impl Into<AbsoluteLength>) -> Self {
        let width = width.into();
        self.style().border_widths.top = Some(width);
        self.style().border_widths.right = Some(width);
        self.style().border_widths.bottom = Some(width);
        self.style().border_widths.left = Some(width);
        self
    }

    fn border_t(mut self, width: impl Into<AbsoluteLength>) -> Self {
        self.style().border_widths.top = Some(width.into());
        self
    }

    fn border_b(mut self, width: impl Into<AbsoluteLength>) -> Self {
        self.style().border_widths.bottom = Some(width.into());
        self
    }

    fn border_l(mut self, width: impl Into<AbsoluteLength>) -> Self {
        self.style().border_widths.left = Some(width.into());
        self
    }

    fn border_r(mut self, width: impl Into<AbsoluteLength>) -> Self {
        self.style().border_widths.right = Some(width.into());
        self
    }

    fn border_1(self) -> Self {
        self.border(px(1.))
    }
    fn border_2(self) -> Self {
        self.border(px(2.))
    }
    fn border_b_1(self) -> Self {
        self.border_b(px(1.))
    }
    fn shadow(mut self, shadows: SmallVec<[crate::BoxShadow; 2]>) -> Self {
        self.style().box_shadow = Some(shadows.into_vec());
        self
    }

    /// Sets the display type of the element to `block`.
    /// [Docs](https://tailwindcss.com/docs/display)
    fn block(mut self) -> Self {
        self.style().display = Some(Display::Block);
        self
    }

    /// Sets the display type of the element to `flex`.
    /// [Docs](https://tailwindcss.com/docs/display)
    fn flex(mut self) -> Self {
        self.style().display = Some(Display::Flex);
        self
    }

    /// Sets the display type of the element to `grid`.
    /// [Docs](https://tailwindcss.com/docs/display)
    fn grid(mut self) -> Self {
        self.style().display = Some(Display::Grid);
        self
    }

    /// Sets the display type of the element to `none`.
    /// [Docs](https://tailwindcss.com/docs/display)
    fn hidden(mut self) -> Self {
        self.style().display = Some(Display::None);
        self
    }

    /// Set the space to be reserved for rendering the scrollbar.
    ///
    /// This will only affect the layout of the element when overflow for this element is set to
    /// `Overflow::Scroll`.
    fn scrollbar_width(mut self, width: impl Into<AbsoluteLength>) -> Self {
        self.style().scrollbar_width = Some(width.into());
        self
    }

    /// Sets the whitespace of the element to `nowrap`.
    /// [Docs](https://tailwindcss.com/docs/whitespace#nowrap)
    fn whitespace_nowrap(mut self) -> Self {
        self.text_style().white_space = Some(WhiteSpace::Nowrap);
        self
    }

    /// Sets the truncate overflowing text with an ellipsis (…) at the end if needed.
    /// [Docs](https://tailwindcss.com/docs/text-overflow#ellipsis)
    fn text_ellipsis(mut self) -> Self {
        self.text_style().text_overflow = Some(TextOverflow::Truncate(ELLIPSIS));
        self
    }

    /// Sets the text overflow behavior of the element.
    fn text_overflow(mut self, overflow: TextOverflow) -> Self {
        self.text_style().text_overflow = Some(overflow);
        self
    }

    /// Set the text alignment of the element.
    fn text_align(mut self, align: TextAlign) -> Self {
        self.text_style().text_align = Some(align);
        self
    }

    /// Sets the truncate to prevent text from wrapping and truncate overflowing text with an ellipsis (…) if needed.
    /// [Docs](https://tailwindcss.com/docs/text-overflow#truncate)
    fn truncate(self) -> Self {
        self.overflow_hidden().whitespace_nowrap().text_ellipsis()
    }

    /// Sets number of lines to show before truncating the text.
    /// [Docs](https://tailwindcss.com/docs/line-clamp)
    fn line_clamp(mut self, lines: usize) -> Self {
        let text_style = self.text_style();
        text_style.line_clamp = Some(lines);
        self.overflow_hidden()
    }

    /// Sets the flex direction of the element to `column`.
    /// [Docs](https://tailwindcss.com/docs/flex-direction#column)
    fn flex_col(mut self) -> Self {
        self.style().flex_direction = Some(FlexDirection::Column);
        self
    }

    /// Sets the flex direction of the element to `row`.
    /// [Docs](https://tailwindcss.com/docs/flex-direction#row)
    fn flex_row(mut self) -> Self {
        self.style().flex_direction = Some(FlexDirection::Row);
        self
    }

    /// Sets the element to allow a flex item to grow and shrink as needed, ignoring its initial size.
    /// [Docs](https://tailwindcss.com/docs/flex#flex-1)
    fn flex_1(mut self) -> Self {
        self.style().flex_grow = Some(1.);
        self.style().flex_shrink = Some(1.);
        self.style().flex_basis = Some(relative(0.).into());
        self
    }

    /// Sets the element to prevent a flex item from growing or shrinking.
    /// [Docs](https://tailwindcss.com/docs/flex#none)
    fn flex_none(mut self) -> Self {
        self.style().flex_grow = Some(0.);
        self.style().flex_shrink = Some(0.);
        self.style().flex_basis = Some(Length::Auto);
        self
    }

    /// Sets the initial size of flex items for this element.
    /// [Docs](https://tailwindcss.com/docs/flex-basis)
    fn flex_basis(mut self, basis: impl Into<Length>) -> Self {
        self.style().flex_basis = Some(basis.into());
        self
    }

    /// Sets the flex item's grow factor.
    /// [Docs](https://tailwindcss.com/docs/flex-grow)
    fn flex_grow(mut self, grow: f32) -> Self {
        self.style().flex_grow = Some(grow);
        self
    }

    /// Sets the flex item's shrink factor.
    /// [Docs](https://tailwindcss.com/docs/flex-shrink)
    fn flex_shrink(mut self, shrink: f32) -> Self {
        self.style().flex_shrink = Some(shrink);
        self
    }

    /// Sets the element to allow flex items to wrap.
    /// [Docs](https://tailwindcss.com/docs/flex-wrap#wrap-normally)
    fn flex_wrap(mut self) -> Self {
        self.style().flex_wrap = Some(FlexWrap::Wrap);
        self
    }

    /// Sets the element to align flex items along the center of the container's cross axis.
    /// [Docs](https://tailwindcss.com/docs/align-items#center)
    fn items_center(mut self) -> Self {
        self.style().align_items = Some(AlignItems::Center);
        self
    }

    /// Sets the element to justify flex items along the center of the container's main axis.
    /// [Docs](https://tailwindcss.com/docs/justify-content#center)
    fn justify_center(mut self) -> Self {
        self.style().justify_content = Some(JustifyContent::Center);
        self
    }

    /// Sets the element to justify items along the container's main axis such
    /// that there is an equal amount of space on each side of each item.
    /// [Docs](https://tailwindcss.com/docs/justify-content#space-around)
    fn justify_around(mut self) -> Self {
        self.style().justify_content = Some(JustifyContent::SpaceAround);
        self
    }

    /// Sets the aspect ratio of the element.
    /// [Docs](https://tailwindcss.com/docs/aspect-ratio)
    fn aspect_ratio(mut self, ratio: f32) -> Self {
        self.style().aspect_ratio = Some(ratio);
        self
    }

    /// Sets the background color of the element.
    fn bg<F>(mut self, fill: F) -> Self
    where
        F: Into<Fill>,
        Self: Sized,
    {
        self.style().background = Some(fill.into());
        self
    }

    /// Returns a mutable reference to the text style that has been configured on this element.
    fn text_style(&mut self) -> &mut TextStyleRefinement {
        let style: &mut StyleRefinement = self.style();
        &mut style.text
    }

    /// Sets the text color of this element.
    ///
    /// This value cascades to its child elements.
    fn text_color(mut self, color: impl Into<Hsla>) -> Self {
        self.text_style().color = Some(color.into());
        self
    }

    /// Sets the font weight of this element
    ///
    /// This value cascades to its child elements.
    fn font_weight(mut self, weight: FontWeight) -> Self {
        self.text_style().font_weight = Some(weight);
        self
    }

    /// Sets the text size of this element.
    ///
    /// This value cascades to its child elements.
    fn text_size(mut self, size: impl Into<AbsoluteLength>) -> Self {
        self.text_style().font_size = Some(size.into());
        self
    }

    /// Sets the text size to 'small'.
    /// [Docs](https://tailwindcss.com/docs/font-size#setting-the-font-size)
    fn text_sm(mut self) -> Self {
        self.text_style().font_size = Some(rems(0.875).into());
        self
    }

    /// Sets the font style of the element to italic.
    /// [Docs](https://tailwindcss.com/docs/font-style#italicizing-text)
    fn italic(mut self) -> Self {
        self.text_style().font_style = Some(FontStyle::Italic);
        self
    }

    /// Sets the text decoration to underline.
    /// [Docs](https://tailwindcss.com/docs/text-decoration-line#underling-text)
    fn underline(mut self) -> Self {
        let style = self.text_style();
        style.underline = Some(UnderlineStyle {
            thickness: px(1.),
            ..Default::default()
        });
        self
    }

    /// Sets the font family of this element and its children.
    fn font_family(mut self, family_name: impl Into<SharedString>) -> Self {
        self.text_style().font_family = Some(family_name.into());
        self
    }

    /// Sets the font features of this element and its children.
    fn font_features(mut self, features: FontFeatures) -> Self {
        self.text_style().font_features = Some(features);
        self
    }

    /// Sets the font of this element and its children.
    fn font(mut self, font: Font) -> Self {
        let Font {
            family,
            features,
            fallbacks,
            weight,
            style,
        } = font;

        let text_style = self.text_style();
        text_style.font_family = Some(family);
        text_style.font_features = Some(features);
        text_style.font_weight = Some(weight);
        text_style.font_style = Some(style);
        text_style.font_fallbacks = fallbacks;

        self
    }

    /// Sets the line height of this element and its children.
    fn line_height(mut self, line_height: impl Into<DefiniteLength>) -> Self {
        self.text_style().line_height = Some(line_height.into());
        self
    }

    /// Sets the opacity of this element and its children.
    fn opacity(mut self, opacity: f32) -> Self {
        self.style().opacity = Some(opacity);
        self
    }

    /// Sets the grid columns of this element.
    fn grid_cols(mut self, cols: u16) -> Self {
        self.style().grid_cols = Some(GridTemplate {
            repeat: cols,
            min_size: GridTemplateMinSize::Zero,
        });
        self
    }

    /// Sets the grid rows of this element.
    fn grid_rows(mut self, rows: u16) -> Self {
        self.style().grid_rows = Some(GridTemplate {
            repeat: rows,
            min_size: GridTemplateMinSize::Zero,
        });
        self
    }

    /// Sets the row start of this element.
    fn row_start(mut self, start: i16) -> Self {
        let grid_location = self.style().grid_location_mut();
        grid_location.row.start = GridPlacement::Line(start);
        self
    }

    /// Sets the row end of this element.
    fn row_end(mut self, end: i16) -> Self {
        let grid_location = self.style().grid_location_mut();
        grid_location.row.end = GridPlacement::Line(end);
        self
    }

    /// Draws a debug border around this element.
    #[cfg(debug_assertions)]
    fn debug(mut self) -> Self {
        self.style().debug = Some(true);
        self
    }

    /// Draws a debug border on all conforming elements below this element.
    #[cfg(debug_assertions)]
    fn debug_below(mut self) -> Self {
        self.style().debug_below = Some(true);
        self
    }
}
