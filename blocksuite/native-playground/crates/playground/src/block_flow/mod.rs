//! World-space page flow.
//!
//! [`BlockFlow`] lays a [`PageSnapshot`] out in document coordinates: the origin is the
//! top-left corner of the page column and `y` grows down the document, independent of the
//! window and of scrolling. A [`PageViewport`] then maps that world space onto the screen
//! (`screen = viewport origin + world - scroll`), and only the blocks intersecting the
//! viewport become elements.
//!
//! Block metrics follow BlockSuite's page styles as recorded in `tokens/style-oracle.json`:
//! sibling margins collapse the way CSS block margins do, list prefixes sit on the first
//! line, and nested children indent by [`CHILD_INDENT`]. Paragraph and list text is laid
//! out and painted by [`RichParagraph`]; single-style labels use the plain [`InlineLayout`].

mod blocks;
mod body;
mod inline;
mod layout;
mod viewport;

pub use body::{
    BlockBody, BlockPaint, CodeScroll, FlowBlock, FlowInput, FlowKind, FlowLayout, FlowStats,
    FlowText, FlowTextLayout, PagePaint, ScrolledCode, paint_chevron,
};
pub use inline::{
    ImageSlot, InlineAlign, InlineBaseline, InlineLayout, InlineStyle, decode_image, layout_inline,
};
pub use layout::BlockFlow;
pub use viewport::{
    PAGE_SURFACE_ID, PageViewport, PresenceMark, RemotePoint, RemotePresence, RemoteSelection,
    page_elements,
};

use inline::{InlinePiece, Prim, baseline_in_line, paint_quad, shape, truncate_to_width};
use layout::FlowPass;

use blocksuite_playground_doc::schema::ParagraphType;
use ui::{Bounds, Pixels, Point, point, px, size};

use crate::theme::TYPOGRAPHY;

/// `--affine-editor-width`: maximum width of the page container.
pub const EDITOR_WIDTH: f32 = TYPOGRAPHY.editor_width_px;
/// Side padding of the page container on regular viewports.
pub const SIDE_PADDING: f32 = 96.0;
/// Side padding of the page container on viewports up to [`NARROW_VIEWPORT`] wide.
pub const SIDE_PADDING_NARROW: f32 = 24.0;
/// Viewport width at or below which the narrow side padding applies.
pub const NARROW_VIEWPORT: f32 = 640.0;
/// Vertical padding above and below the page title.
pub const TITLE_PADDING_Y: f32 = 38.0;
/// Padding below the last block of the page.
pub const BOTTOM_PADDING: f32 = 32.0;
/// Left indent of a block's children.
pub const CHILD_INDENT: f32 = 24.0;
/// Width reserved for a list prefix; the list text starts here.
pub const LIST_PREFIX_WIDTH: f32 = 24.0;
/// Vertical margin of paragraph and list blocks.
pub const TEXT_BLOCK_MARGIN: f32 = 10.0;
/// Vertical margin of code, image, bookmark and card blocks.
pub const CARD_BLOCK_MARGIN: f32 = 18.0;
/// Height of a horizontal bookmark card.
pub const BOOKMARK_HEIGHT: f32 = 116.0;
/// Height of the divider block container.
pub const DIVIDER_HEIGHT: f32 = 36.0;
/// Vertical and horizontal padding of the code block container.
pub const CODE_PADDING: (f32, f32) = (32.0, 20.0);
/// Corner radius of the code block container.
pub const CODE_RADIUS: f32 = 10.0;
/// Width of the code line-number column, including its gap to the code.
pub const CODE_GUTTER: f32 = 32.0;

pub(super) const COLLAPSED_MARKER_SIZE: f32 = 16.0;

/// Box of a heading's collapse marker in the gutter left of the heading, on its first
/// line of `line_height`, relative to the heading block.
pub fn heading_marker_rect(line_height: f32) -> FlowRect {
    FlowRect::new(
        -COLLAPSED_MARKER_SIZE - 4.0,
        ((line_height - COLLAPSED_MARKER_SIZE) / 2.0).floor(),
        COLLAPSED_MARKER_SIZE,
        COLLAPSED_MARKER_SIZE,
    )
}
pub(super) const PRESENCE_LABEL_HEIGHT: f32 = 18.0;

/// Typography and vertical margins of a text block.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TextSpec {
    pub font_size: f32,
    pub font_weight: f32,
    pub line_height: f32,
    /// Distance from the top of a line to the alphabetic baseline, as the browser places it.
    pub baseline: f32,
    /// Tracking in pixels (`letter-spacing`).
    pub letter_spacing: f32,
    pub margin_top: f32,
    pub margin_bottom: f32,
}

/// Page title typography (`.doc-title-container`).
pub const TITLE_SPEC: TextSpec = TextSpec {
    font_size: 40.0,
    font_weight: 700.0,
    line_height: 50.0,
    baseline: 40.0,
    letter_spacing: 0.0,
    margin_top: TITLE_PADDING_Y,
    margin_bottom: TITLE_PADDING_Y,
};

/// Typography of an `affine:paragraph` by type. Margins are the block's effective margins:
/// the 10px block container margin collapsed with the heading wrapper's own margin.
pub fn paragraph_spec(kind: ParagraphType) -> TextSpec {
    // (font size, weight, line height, baseline, letter spacing, wrapper margin top)
    let (font_size, font_weight, line_height, baseline, letter_spacing, margin_top) = match kind {
        ParagraphType::Text => (
            TYPOGRAPHY.font_base_px,
            400.0,
            TYPOGRAPHY.line_height_base_px,
            17.0,
            0.0,
            0.0,
        ),
        ParagraphType::H1 => (TYPOGRAPHY.font_h1_px, 700.0, 36.0, 29.0, -0.56, 18.0),
        ParagraphType::H2 => (TYPOGRAPHY.font_h2_px, 600.0, 36.0, 28.0, -0.52, 14.0),
        ParagraphType::H3 => (TYPOGRAPHY.font_h3_px, 600.0, 32.0, 25.0, -0.48, 12.0),
        ParagraphType::H4 => (TYPOGRAPHY.font_h4_px, 600.0, 30.0, 24.0, -0.33, 12.0),
        ParagraphType::H5 => (TYPOGRAPHY.font_h5_px, 600.0, 28.0, 21.0, -0.30, 12.0),
        ParagraphType::H6 => (TYPOGRAPHY.font_h6_px, 600.0, 26.0, 20.0, -0.27, 12.0),
        ParagraphType::Quote => (
            TYPOGRAPHY.font_base_px,
            400.0,
            26.0,
            19.0,
            0.0,
            TYPOGRAPHY.paragraph_space_px,
        ),
    };
    TextSpec {
        font_size,
        font_weight,
        line_height,
        baseline,
        letter_spacing,
        margin_top: margin_top.max(TEXT_BLOCK_MARGIN),
        margin_bottom: TEXT_BLOCK_MARGIN,
    }
}

/// Padding (`left`, `top`, `bottom`) of a quote paragraph around its text.
pub const QUOTE_PADDING: (f32, f32, f32) = (17.0, 10.0, 10.0);
/// Width of the quote accent bar.
pub const QUOTE_BAR_WIDTH: f32 = 2.0;

/// Ordered-list prefix for a 1-based `index` at list nesting `depth`: numbers, then
/// letters, then roman numerals, repeating every three levels.
pub fn number_prefix(index: u32, depth: usize) -> String {
    let index = index.max(1);
    let body = match depth % 3 {
        0 => index.to_string(),
        1 => {
            let mut n = i64::from(index) - 1;
            let mut letters = Vec::new();
            while n >= 0 {
                letters.push(b'a' + (n % 26) as u8);
                n = n / 26 - 1;
            }
            letters.reverse();
            String::from_utf8(letters).unwrap_or_default()
        }
        _ => {
            const ROMAN: [(u32, &str); 13] = [
                (1000, "M"),
                (900, "CM"),
                (500, "D"),
                (400, "CD"),
                (100, "C"),
                (90, "XC"),
                (50, "L"),
                (40, "XL"),
                (10, "X"),
                (9, "IX"),
                (5, "V"),
                (4, "IV"),
                (1, "I"),
            ];
            let mut rest = index;
            let mut roman = String::new();
            for (value, symbol) in ROMAN {
                while rest >= value {
                    roman.push_str(symbol);
                    rest -= value;
                }
            }
            roman
        }
    };
    format!("{body}.")
}

/// Horizontal placement of the page container and its content column in the window.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PageGeometry {
    pub viewport_width: f32,
    pub side_padding: f32,
    /// Screen x of the content column's left edge.
    pub column_x: f32,
    /// Width of the content column (the world-space width of the flow).
    pub column_width: f32,
}

/// Resolve the page container for a viewport width: at most [`EDITOR_WIDTH`] wide,
/// centered, with side padding that narrows on small viewports.
pub fn page_geometry(viewport_width: f32) -> PageGeometry {
    let viewport_width = viewport_width.max(0.0).floor();
    let container_width = viewport_width.min(EDITOR_WIDTH);
    let side_padding = if viewport_width <= NARROW_VIEWPORT {
        SIDE_PADDING_NARROW
    } else {
        SIDE_PADDING
    };
    let column_width = (container_width - 2.0 * side_padding).max(0.0);
    let container_x = ((viewport_width - container_width) / 2.0).floor();
    PageGeometry {
        viewport_width,
        side_padding,
        column_x: container_x + side_padding,
        column_width,
    }
}

/// Axis-aligned rectangle in flow units (logical pixels).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FlowRect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl FlowRect {
    pub const fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Self { x, y, w, h }
    }

    pub fn right(&self) -> f32 {
        self.x + self.w
    }

    pub fn bottom(&self) -> f32 {
        self.y + self.h
    }

    /// Whether the point lies inside the rectangle (right and bottom edges excluded).
    pub fn contains(&self, x: f32, y: f32) -> bool {
        x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
    }

    /// The rectangle moved by `(dx, dy)`.
    pub fn translated(&self, dx: f32, dy: f32) -> Self {
        Self::new(self.x + dx, self.y + dy, self.w, self.h)
    }

    /// The rectangle as pixel bounds relative to `origin`.
    pub fn bounds(&self, origin: Point<Pixels>) -> Bounds<Pixels> {
        Bounds::new(
            point(origin.x + px(self.x), origin.y + px(self.y)),
            size(px(self.w), px(self.h)),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::{blocks::host_name, inline::inline_segments, *};

    #[test]
    fn number_prefix_cycles_numbers_letters_and_roman_numerals() {
        assert_eq!(number_prefix(1, 0), "1.");
        assert_eq!(number_prefix(12, 0), "12.");
        assert_eq!(number_prefix(1, 1), "a.");
        assert_eq!(number_prefix(26, 1), "z.");
        assert_eq!(number_prefix(27, 1), "aa.");
        assert_eq!(number_prefix(1, 2), "I.");
        assert_eq!(number_prefix(4, 2), "IV.");
        assert_eq!(number_prefix(14, 2), "XIV.");
        assert_eq!(number_prefix(3, 3), "3.");
        assert_eq!(number_prefix(0, 0), "1.");
    }

    #[test]
    fn page_geometry_centers_the_column_and_narrows_on_small_viewports() {
        let wide = page_geometry(1280.0);
        assert_eq!(wide.column_width, 752.0);
        assert_eq!(wide.column_x, 264.0);
        assert_eq!(wide.side_padding, SIDE_PADDING);

        // Between the narrow breakpoint and the editor width the column fills the viewport.
        let medium = page_geometry(800.0);
        assert_eq!(medium.column_x, SIDE_PADDING);
        assert_eq!(medium.column_width, 800.0 - 2.0 * SIDE_PADDING);

        for width in [640.0, 390.0, 320.0] {
            let narrow = page_geometry(width);
            assert_eq!(narrow.side_padding, SIDE_PADDING_NARROW);
            assert_eq!(narrow.column_x, SIDE_PADDING_NARROW);
            assert_eq!(narrow.column_width, width - 2.0 * SIDE_PADDING_NARROW);
            assert!(narrow.column_x + narrow.column_width <= width);
        }
        assert_eq!(page_geometry(0.0).column_width, 0.0);
    }

    #[test]
    fn inline_segments_keep_trailing_whitespace_and_hard_breaks() {
        assert_eq!(
            inline_segments("two  words\nnext"),
            vec![Some("two  "), Some("words"), None, Some("next")]
        );
        assert_eq!(inline_segments(""), Vec::<Option<&str>>::new());
        assert_eq!(inline_segments("a\n"), vec![Some("a"), None]);
        assert_eq!(inline_segments(" lead"), vec![Some(" "), Some("lead")]);
    }

    #[test]
    fn host_name_strips_scheme_credentials_port_and_path() {
        assert_eq!(host_name("https://affine.pro/blog?x=1"), "affine.pro");
        assert_eq!(
            host_name("http://user:pw@example.com:8080/a"),
            "example.com"
        );
        assert_eq!(host_name("example.org"), "example.org");
        assert_eq!(host_name(""), "");
    }
}
