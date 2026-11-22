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

use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    hash::{Hash, Hasher},
    rc::Rc,
    sync::Arc,
};

use blocksuite_playground_doc::{
    read::{BlockContent, BlockNode, PageSnapshot, RichText, TextAlign as BlockAlign},
    schema::{ListType, ParagraphType},
};
use ui::{
    AnyElement, App, BorderStyle, Bounds, Corners, Edges, Font, FontWeight, Hsla, Pixels, Point,
    RenderImage, ShapedLine, SharedString, TextAlign, TextRun, Window, canvas, div, point,
    prelude::*, px, size,
};

use crate::{
    rich_text::{
        CaretPosition, LaidOutRichParagraph, RichParagraph, RichParagraphStyle, WrapAffinity,
    },
    theme::{FONT_CODE, FONT_SANS, IconPaint, Palette, PlaygroundTheme, TYPOGRAPHY},
};

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

const COLLAPSED_MARKER_SIZE: f32 = 16.0;

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
const PRESENCE_LABEL_HEIGHT: f32 = 18.0;

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

/// Style of a plain, single-style run of text.
#[derive(Clone, Debug, PartialEq)]
pub struct InlineStyle {
    pub family: &'static str,
    pub size: f32,
    pub weight: f32,
    pub color: Hsla,
}

impl InlineStyle {
    pub fn new(family: &'static str, size: f32, weight: f32, color: Hsla) -> Self {
        Self {
            family,
            size,
            weight,
            color,
        }
    }

    fn font(&self) -> Font {
        let mut font = ui::font(self.family);
        font.weight = FontWeight(self.weight);
        font
    }
}

/// Horizontal alignment of inline lines inside their box.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InlineAlign {
    Left,
    Center,
    Right,
}

#[derive(Clone)]
struct InlinePiece {
    line: usize,
    x: f32,
    visible_width: f32,
    baseline_shift: f32,
    shaped: ShapedLine,
    /// Position of the piece in the text, in UTF-16 code units.
    source_start: usize,
    source_len: usize,
}

impl InlinePiece {
    fn source_end(&self) -> usize {
        self.source_start + self.source_len
    }

    /// X of a UTF-16 offset inside this piece, relative to the inline box.
    fn x_at(&self, source_offset: usize) -> f32 {
        if source_offset <= self.source_start {
            return self.x;
        }
        if source_offset >= self.source_end() {
            return self.x + self.visible_width;
        }
        let mut units = 0;
        let mut byte = self.shaped.text.len();
        for (index, ch) in self.shaped.text.char_indices() {
            if units >= source_offset - self.source_start {
                byte = index;
                break;
            }
            units += ch.len_utf16();
        }
        self.x + f32::from(self.shaped.x_for_index(byte))
    }
}

/// Laid-out plain text for labels, titles and code: one style, wrapped at spaces (inside
/// a word only when the word alone is wider than the line), on lines of one height.
pub struct InlineLayout {
    pieces: Vec<InlinePiece>,
    pub line_count: usize,
    pub line_height: f32,
    /// Width the content was wrapped to.
    pub width: f32,
    /// Distance from the top of a line to the baseline.
    pub baseline: f32,
}

impl InlineLayout {
    pub fn height(&self) -> f32 {
        self.line_count as f32 * self.line_height
    }

    /// Width of the widest line's visible content.
    pub fn content_width(&self) -> f32 {
        self.pieces
            .iter()
            .map(|piece| piece.x + piece.visible_width)
            .fold(0.0, f32::max)
    }

    /// Position of a UTF-16 source offset as `(x, line)`.
    pub fn caret(&self, source_offset: usize) -> (f32, usize) {
        let mut best: Option<&InlinePiece> = None;
        for piece in &self.pieces {
            if source_offset < piece.source_start {
                break;
            }
            best = Some(piece);
            if source_offset < piece.source_end() {
                break;
            }
        }
        match best {
            Some(piece) => (piece.x_at(source_offset), piece.line),
            None => (0.0, 0),
        }
    }

    /// Per-line `(line, x0, x1)` spans covering the UTF-16 source range `start..end`.
    pub fn selection_spans(&self, start: usize, end: usize) -> Vec<(usize, f32, f32)> {
        let mut spans: Vec<(usize, f32, f32)> = Vec::new();
        if end <= start {
            return spans;
        }
        for piece in &self.pieces {
            if piece.source_end() <= start || piece.source_start >= end {
                continue;
            }
            let x0 = piece.x_at(start.max(piece.source_start));
            let x1 = if end >= piece.source_end() {
                piece.x + f32::from(piece.shaped.width())
            } else {
                piece.x_at(end)
            };
            match spans.last_mut() {
                Some((line, _, right)) if *line == piece.line => *right = right.max(x1),
                _ => spans.push((piece.line, x0, x1)),
            }
        }
        spans
    }

    fn paint(&self, origin: Point<Pixels>, window: &mut Window, cx: &mut App) {
        for piece in &self.pieces {
            let piece_origin = point(
                origin.x + px(piece.x),
                origin.y + px(piece.line as f32 * self.line_height + piece.baseline_shift),
            );
            let _ = piece.shaped.paint(
                piece_origin,
                px(self.line_height),
                TextAlign::Left,
                None,
                window,
                cx,
            );
        }
    }
}

fn baseline_in_line(line_height: f32, shaped: &ShapedLine) -> f32 {
    let ascent = f32::from(shaped.ascent);
    let descent = f32::from(shaped.descent);
    (line_height - ascent - descent) / 2.0 + ascent
}

fn shape(window: &Window, text: &str, style: &InlineStyle) -> ShapedLine {
    let run = TextRun {
        len: text.len(),
        font: style.font(),
        color: style.color,
        background_color: None,
        underline: None,
        strikethrough: None,
    };
    window.text_system().shape_line(
        SharedString::from(text.to_string()),
        px(style.size),
        &[run],
        None,
    )
}

/// Split text into words that keep their trailing whitespace; `None` marks a hard break.
fn inline_segments(text: &str) -> Vec<Option<&str>> {
    let mut segments = Vec::new();
    for (index, line) in text.split('\n').enumerate() {
        if index > 0 {
            segments.push(None);
        }
        let mut start = 0;
        let mut in_space = false;
        for (offset, ch) in line.char_indices() {
            let space = ch.is_whitespace();
            if in_space && !space {
                segments.push(Some(&line[start..offset]));
                start = offset;
            }
            in_space = space;
        }
        if start < line.len() {
            segments.push(Some(&line[start..]));
        }
    }
    segments
}

/// Shorten `text` with a trailing ellipsis until it fits `max_width`.
fn truncate_to_width(
    window: &Window,
    text: &str,
    style: &InlineStyle,
    max_width: f32,
) -> ShapedLine {
    let shaped = shape(window, text, style);
    if f32::from(shaped.width()) <= max_width {
        return shaped;
    }
    let mut chars: Vec<char> = text.chars().collect();
    while chars.len() > 1 {
        chars.pop();
        let candidate: String = chars.iter().collect::<String>() + "\u{2026}";
        let shaped = shape(window, &candidate, style);
        if f32::from(shaped.width()) <= max_width {
            return shaped;
        }
    }
    shape(window, "\u{2026}", style)
}

/// Where the baseline of an [`InlineLayout`] sits inside its lines.
#[derive(Clone, Copy)]
pub enum InlineBaseline<'a> {
    /// Centered font metrics of this style, so text of another size or family lines up
    /// with text set in it.
    Of(&'a InlineStyle),
    /// A fixed distance from the top of the line.
    At(f32),
}

/// Wrap `text` to `max_width` on lines of `line_height`.
pub fn layout_inline(
    text: &str,
    style: &InlineStyle,
    max_width: f32,
    line_height: f32,
    baseline: InlineBaseline<'_>,
    align: InlineAlign,
    window: &Window,
) -> InlineLayout {
    let max_width = max_width.max(1.0);
    let baseline = match baseline {
        InlineBaseline::Of(base) => baseline_in_line(line_height, &shape(window, "Ag", base)),
        InlineBaseline::At(baseline) => baseline,
    };
    let mut pieces: Vec<InlinePiece> = Vec::new();
    let mut line = 0_usize;
    let mut x = 0.0_f32;
    let mut source_cursor = 0_usize;

    for segment in inline_segments(text) {
        let Some(mut rest) = segment else {
            line += 1;
            x = 0.0;
            source_cursor += 1;
            continue;
        };
        while !rest.is_empty() {
            let shaped = shape(window, rest, style);
            let trimmed_len = rest.trim_end_matches(char::is_whitespace).len();
            let visible_width = if trimmed_len == rest.len() {
                f32::from(shaped.width())
            } else {
                f32::from(shaped.x_for_index(trimmed_len))
            };

            if x > 0.0 && x + visible_width > max_width {
                line += 1;
                x = 0.0;
                continue;
            }

            let mut piece_text = rest;
            let mut piece_shaped = shaped;
            let mut piece_visible = visible_width;
            let mut wrapped = false;
            if visible_width > max_width && rest.chars().count() > 1 {
                // A single word wider than the line: break it at the last glyph that fits.
                let mut split = piece_shaped
                    .index_for_x(px(max_width))
                    .unwrap_or(rest.len());
                while split > 0 && !rest.is_char_boundary(split) {
                    split -= 1;
                }
                if split == 0 {
                    split = rest.chars().next().map_or(rest.len(), char::len_utf8);
                }
                if split < rest.len() {
                    piece_text = &rest[..split];
                    piece_shaped = shape(window, piece_text, style);
                    piece_visible = f32::from(piece_shaped.width());
                    wrapped = true;
                }
            }

            let source_len = piece_text.encode_utf16().count();
            let advance = f32::from(piece_shaped.width());
            pieces.push(InlinePiece {
                line,
                x,
                visible_width: piece_visible,
                baseline_shift: baseline - baseline_in_line(line_height, &piece_shaped),
                shaped: piece_shaped,
                source_start: source_cursor,
                source_len,
            });
            source_cursor += source_len;
            rest = &rest[piece_text.len()..];
            if wrapped {
                line += 1;
                x = 0.0;
            } else {
                x += advance;
            }
        }
    }

    let line_count = line + 1;
    if align != InlineAlign::Left {
        let mut line_right = vec![0.0_f32; line_count];
        for piece in &pieces {
            let right = piece.x + piece.visible_width;
            line_right[piece.line] = line_right[piece.line].max(right);
        }
        for piece in &mut pieces {
            let free = (max_width - line_right[piece.line]).max(0.0);
            piece.x += match align {
                InlineAlign::Center => (free / 2.0).floor(),
                _ => free.floor(),
            };
        }
    }

    InlineLayout {
        pieces,
        line_count,
        line_height,
        width: max_width,
        baseline,
    }
}

fn paint_quad(
    window: &mut Window,
    bounds: Bounds<Pixels>,
    radius: f32,
    fill: Option<Hsla>,
    border: Option<Hsla>,
    dashed: bool,
) {
    window.paint_quad(ui::quad(
        bounds,
        Corners::all(px(radius)),
        fill.unwrap_or_else(ui::transparent_black),
        Edges::all(px(if border.is_some() { 1.0 } else { 0.0 })),
        border.unwrap_or_else(ui::transparent_black),
        if dashed {
            BorderStyle::Dashed
        } else {
            BorderStyle::Solid
        },
    ));
}

/// What an `affine:image` block shows for its blob.
#[derive(Clone)]
pub enum ImageSlot {
    /// The blob has not arrived yet.
    Loading,
    /// The blob cannot be decoded, or has stayed missing for several fetches.
    Unavailable,
    Ready(Arc<RenderImage>),
}

/// Decode PNG, JPEG, WebP, GIF (first frame) or BMP bytes into a renderable image; any
/// other format is rejected.
pub fn decode_image(bytes: &[u8]) -> Option<Arc<RenderImage>> {
    use image::ImageFormat::{Bmp, Gif, Jpeg, Png, WebP};
    let format = image::guess_format(bytes)
        .ok()
        .filter(|format| matches!(format, Png | Jpeg | WebP | Gif | Bmp))?;
    let mut buffer = image::load_from_memory_with_format(bytes, format)
        .ok()?
        .into_rgba8();
    if buffer.width() == 0 || buffer.height() == 0 {
        return None;
    }
    // The renderer samples BGRA.
    for pixel in buffer.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    Some(Arc::new(RenderImage::new(vec![image::Frame::new(buffer)])))
}

/// Paint primitive of a block, positioned relative to the block's own origin.
enum Prim {
    Quad {
        rect: FlowRect,
        fill: Option<Hsla>,
        border: Option<Hsla>,
        radius: f32,
        dashed: bool,
    },
    Text {
        x: f32,
        y: f32,
        layout: Rc<InlineLayout>,
        clip: Option<FlowRect>,
    },
    Rich {
        x: f32,
        y: f32,
        layout: Arc<LaidOutRichParagraph>,
    },
    /// One line of an unwrapped code block: clipped to the code area and shifted left by
    /// the block's horizontal scroll.
    CodeLine {
        x: f32,
        y: f32,
        layout: Rc<InlineLayout>,
        clip: FlowRect,
    },
    /// Disclosure chevron of a toggle list or a collapsed heading.
    Chevron {
        rect: FlowRect,
        collapsed: bool,
        color: Hsla,
    },
    Icon {
        rect: FlowRect,
        icon: IconPaint,
        color: Hsla,
    },
    Image {
        rect: FlowRect,
        image: Arc<RenderImage>,
    },
}

/// What a laid-out block is, for tests and snapshot consumers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlowKind {
    Title,
    Paragraph(ParagraphType),
    List(ListType),
    Divider,
    Code,
    Image,
    Bookmark,
    Unknown,
}

/// Laid-out text of a block: rich paragraph text or a plain single-style label.
#[derive(Clone)]
pub enum FlowTextLayout {
    Rich(Arc<LaidOutRichParagraph>),
    Plain(Rc<InlineLayout>),
}

impl FlowTextLayout {
    pub fn line_height(&self) -> f32 {
        match self {
            Self::Rich(layout) => f32::from(layout.line_height()),
            Self::Plain(layout) => layout.line_height,
        }
    }

    pub fn line_count(&self) -> usize {
        match self {
            Self::Rich(layout) => layout.lines().len(),
            Self::Plain(layout) => layout.line_count,
        }
    }

    pub fn height(&self) -> f32 {
        self.line_count() as f32 * self.line_height()
    }

    /// Width of the widest line.
    pub fn content_width(&self) -> f32 {
        match self {
            Self::Rich(layout) => f32::from(layout.size().width),
            Self::Plain(layout) => layout.content_width(),
        }
    }

    /// Position of a UTF-16 source offset as `(x, line)`.
    pub fn caret(&self, source_offset: usize) -> (f32, usize) {
        match self {
            Self::Rich(layout) => {
                let (line, x) = layout.caret_line_and_x(CaretPosition {
                    utf16_offset: source_offset as u64,
                    affinity: WrapAffinity::Downstream,
                });
                (f32::from(x), line)
            }
            Self::Plain(layout) => layout.caret(source_offset),
        }
    }

    /// Per-line `(line, x0, x1)` spans covering the UTF-16 source range `start..end`.
    pub fn selection_spans(&self, start: usize, end: usize) -> Vec<(usize, f32, f32)> {
        match self {
            Self::Rich(layout) => {
                let line_height = f32::from(layout.line_height());
                layout
                    .selection_rects(start as u64, end as u64)
                    .into_iter()
                    .map(|rect| {
                        let x0 = f32::from(rect.origin.x);
                        (
                            (f32::from(rect.origin.y) / line_height).round() as usize,
                            x0,
                            x0 + f32::from(rect.size.width),
                        )
                    })
                    .collect()
            }
            Self::Plain(layout) => layout.selection_spans(start, end),
        }
    }

    fn prim(&self, x: f32, y: f32) -> Prim {
        match self {
            Self::Rich(layout) => Prim::Rich {
                x,
                y,
                layout: layout.clone(),
            },
            Self::Plain(layout) => Prim::Text {
                x,
                y,
                layout: layout.clone(),
                clip: None,
            },
        }
    }
}

/// Primary text of a block, kept for caret and selection geometry.
pub struct FlowText {
    pub x: f32,
    pub y: f32,
    pub layout: FlowTextLayout,
}

/// Position-independent layout of one block: size, margins and paint primitives.
pub struct BlockBody {
    pub kind: FlowKind,
    pub width: f32,
    pub height: f32,
    pub margin_top: f32,
    pub margin_bottom: f32,
    /// Plain text recorded on the block's element snapshot.
    pub plain: String,
    pub text: Option<FlowText>,
    /// Box of the list prefix (bullet, number, checkbox or toggle), if the block has one.
    pub prefix: Option<FlowRect>,
    /// Horizontal scroll range of an unwrapped code block whose lines overflow.
    pub code_scroll: Option<CodeScroll>,
    prims: Vec<Prim>,
}

/// The scrollable code area of an unwrapped code block, relative to the block.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CodeScroll {
    pub area: FlowRect,
    /// Largest horizontal scroll offset: the widest line minus the code area width.
    pub max_x: f32,
}

/// Per-frame paint state of one block that is not part of its laid-out body.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct BlockPaint {
    /// Disclosure chevron in flight: `0.0` collapsed (pointing right) to `1.0` expanded
    /// (pointing down). `None` paints the chevron of the block's current state.
    pub chevron: Option<f32>,
    /// Horizontal scroll of an unwrapped code block, clamped to its [`CodeScroll`].
    pub code_scroll_x: f32,
}

/// Per-frame paint state of the page, by block id.
#[derive(Clone, Debug, Default)]
pub struct PagePaint {
    pub blocks: HashMap<String, BlockPaint>,
}

impl PagePaint {
    /// The code blocks of `layout` this frame scrolls sideways.
    pub fn scrolled_code(&self, layout: &FlowLayout) -> Vec<ScrolledCode> {
        self.blocks
            .iter()
            .filter(|(_, state)| state.code_scroll_x > 0.0)
            .filter_map(|(block_id, state)| {
                ScrolledCode::of_block(layout.block(block_id)?, state.code_scroll_x)
            })
            .collect()
    }
}

/// A sideways-scrolled code block of one frame, in world space. Carets and selections are
/// laid out on its unscrolled lines; this maps them to where the lines show.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScrolledCode {
    /// The block's box.
    pub block: FlowRect,
    /// The area its lines show in.
    pub area: FlowRect,
    /// How far the lines sit left of where they were laid out.
    pub scroll_x: f32,
}

impl ScrolledCode {
    /// `block` scrolled by `scroll_x`, `None` for a block that does not scroll.
    pub fn of_block(block: &FlowBlock, scroll_x: f32) -> Option<Self> {
        let code = block.body.code_scroll?;
        let scroll_x = scroll_x.clamp(0.0, code.max_x);
        (scroll_x > 0.0).then(|| Self {
            block: block.rect(),
            area: code.area.translated(block.x, block.y),
            scroll_x,
        })
    }

    /// The scrolled block a box laid out on unscrolled lines lies in.
    pub fn containing<'a>(blocks: &'a [Self], rect: &FlowRect) -> Option<&'a Self> {
        let middle = rect.y + rect.h * 0.5;
        blocks
            .iter()
            .find(|code| middle >= code.block.y && middle < code.block.bottom())
    }

    /// A box over text as the scrolled lines show it: moved left and cut to the code
    /// area. `None` when all of it scrolled out.
    pub fn span(&self, mut rect: FlowRect) -> Option<FlowRect> {
        rect.x -= self.scroll_x;
        let (left, right) = (rect.x.max(self.area.x), rect.right().min(self.area.right()));
        (right > left).then(|| FlowRect::new(left, rect.y, right - left, rect.h))
    }

    /// A caret as the scrolled lines show it, `None` when it scrolled out.
    pub fn caret(&self, mut rect: FlowRect) -> Option<FlowRect> {
        rect.x -= self.scroll_x;
        (rect.x + rect.w.max(1.0) > self.area.x && rect.x <= self.area.right()).then_some(rect)
    }
}

/// Paint a disclosure chevron: `progress` runs from `0.0` (collapsed, pointing right) to
/// `1.0` (expanded, pointing down); in between the collapsed glyph turns.
pub fn paint_chevron(
    bounds: Bounds<Pixels>,
    progress: f32,
    color: Hsla,
    window: &mut Window,
    cx: &mut App,
) {
    if progress <= 0.0 {
        IconPaint::named("ToggleRightIcon").paint(bounds, color, window, cx);
    } else if progress >= 1.0 {
        IconPaint::named("ToggleDownIcon").paint(bounds, color, window, cx);
    } else {
        IconPaint::named("ToggleRightIcon").paint_rotated(
            bounds,
            color,
            progress * std::f32::consts::FRAC_PI_2,
            window,
            cx,
        );
    }
}

impl BlockBody {
    /// The block's own disclosure chevron, as its box relative to the block and whether it
    /// shows the collapsed state. A toggle list always has one, a heading only while it
    /// is collapsed.
    pub fn chevron(&self) -> Option<(FlowRect, bool)> {
        self.prims.iter().find_map(|prim| match prim {
            Prim::Chevron {
                rect, collapsed, ..
            } => Some((*rect, *collapsed)),
            _ => None,
        })
    }

    fn paint(&self, origin: Point<Pixels>, state: BlockPaint, window: &mut Window, cx: &mut App) {
        for prim in &self.prims {
            match prim {
                Prim::CodeLine { x, y, layout, clip } => {
                    let scroll = self
                        .code_scroll
                        .map_or(0.0, |code| state.code_scroll_x.clamp(0.0, code.max_x));
                    let text_origin = point(origin.x + px(*x - scroll), origin.y + px(*y));
                    window.with_content_mask(
                        Some(ui::ContentMask {
                            bounds: clip.bounds(origin),
                        }),
                        |window| layout.paint(text_origin, window, cx),
                    );
                }
                Prim::Chevron {
                    rect,
                    collapsed,
                    color,
                } => paint_chevron(
                    rect.bounds(origin),
                    state.chevron.unwrap_or(if *collapsed { 0.0 } else { 1.0 }),
                    *color,
                    window,
                    cx,
                ),
                Prim::Quad {
                    rect,
                    fill,
                    border,
                    radius,
                    dashed,
                } => paint_quad(
                    window,
                    rect.bounds(origin),
                    *radius,
                    *fill,
                    *border,
                    *dashed,
                ),
                Prim::Text { x, y, layout, clip } => {
                    let text_origin = point(origin.x + px(*x), origin.y + px(*y));
                    match clip {
                        Some(clip) => window.with_content_mask(
                            Some(ui::ContentMask {
                                bounds: clip.bounds(origin),
                            }),
                            |window| layout.paint(text_origin, window, cx),
                        ),
                        None => layout.paint(text_origin, window, cx),
                    }
                }
                Prim::Rich { x, y, layout } => layout.paint_at(
                    point(origin.x + px(*x), origin.y + px(*y)),
                    &[],
                    &[],
                    None,
                    window,
                    cx,
                ),
                Prim::Icon { rect, icon, color } => {
                    icon.paint(rect.bounds(origin), *color, window, cx);
                }
                Prim::Image { rect, image } => {
                    let bounds = rect.bounds(origin);
                    let _ = window.paint_image(
                        bounds,
                        bounds,
                        Corners::all(px(0.0)),
                        image.clone(),
                        0,
                        false,
                    );
                }
            }
        }
    }
}

/// A block placed in world space.
pub struct FlowBlock {
    pub block_id: String,
    /// Id of the block's element snapshot (`page.title_block` or `page.block.<id>`).
    pub snapshot_id: SharedString,
    pub x: f32,
    pub y: f32,
    pub body: Rc<BlockBody>,
}

impl FlowBlock {
    pub fn editable(&self) -> bool {
        matches!(
            self.body.kind,
            FlowKind::Title | FlowKind::Paragraph(_) | FlowKind::List(_) | FlowKind::Code
        )
    }

    pub fn caret_rect(&self, caret: CaretPosition) -> Option<FlowRect> {
        let text = self.body.text.as_ref()?;
        let height = text.layout.line_height();
        let (x, line) = match &text.layout {
            FlowTextLayout::Rich(rich) => {
                let (line, x) = rich.caret_line_and_x(caret);
                (f32::from(x), line)
            }
            FlowTextLayout::Plain(plain) => plain.caret(caret.utf16_offset as usize),
        };
        Some(FlowRect::new(
            self.x + text.x + x,
            self.y + text.y + line as f32 * height,
            1.0,
            height,
        ))
    }

    pub fn hit_text(&self, x: f32, y: f32) -> Option<CaretPosition> {
        let text = self.body.text.as_ref()?;
        let x = x - self.x - text.x;
        let y = y - self.y - text.y;
        Some(match &text.layout {
            FlowTextLayout::Rich(rich) => rich.hit_test(point(px(x), px(y))),
            FlowTextLayout::Plain(plain) => {
                let line =
                    ((y / plain.line_height).floor().max(0.0) as usize).min(plain.line_count - 1);
                let index = crate::rich_text::TextBiIndex::new(&self.body.plain);
                let mut offset = 0;
                let mut best = (usize::MAX, f32::MAX, 0);
                loop {
                    let (at, row) = plain.caret(offset as usize);
                    let distance = (line.abs_diff(row), (at - x).abs(), offset);
                    if distance < best {
                        best = distance;
                    }
                    if offset == index.utf16_len() {
                        break;
                    }
                    offset = index.next_grapheme_utf16(offset);
                }
                CaretPosition {
                    utf16_offset: best.2,
                    affinity: WrapAffinity::Downstream,
                }
            }
        })
    }

    pub fn rect(&self) -> FlowRect {
        FlowRect::new(self.x, self.y, self.body.width, self.body.height)
    }
}

/// Everything the layout pass reads besides the window's text system.
pub struct FlowInput<'a> {
    pub snapshot: &'a PageSnapshot,
    /// Width of the page column, the world-space width of the flow.
    pub width: f32,
    pub theme: PlaygroundTheme,
    /// Titles of the workspace pages by id, for linked-page references.
    pub page_titles: &'a BTreeMap<String, String>,
    /// Image blobs by `sourceId`; a missing entry is still loading.
    pub images: &'a HashMap<String, ImageSlot>,
    /// Bumped whenever `page_titles` or `images` change.
    pub env_rev: u64,
}

/// Counters of the latest [`BlockFlow::layout`] pass.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FlowStats {
    /// Blocks whose body was laid out from scratch.
    pub laid_out: usize,
    /// Blocks whose unchanged body was reused from the previous pass.
    pub reused: usize,
}

/// Result of a layout pass: blocks in document order, in world space.
pub struct FlowLayout {
    pub blocks: Vec<FlowBlock>,
    pub width: f32,
    pub height: f32,
    pub stats: FlowStats,
}

impl FlowLayout {
    /// Hit-test document coordinates against the editable text, including margins
    /// between blocks while dragging. Ties go to the earlier block.
    pub fn hit_document(&self, x: f32, y: f32) -> Option<(String, CaretPosition)> {
        let block = self.blocks.iter().filter(|b| b.editable()).min_by(|a, b| {
            let distance =
                |block: &FlowBlock| (block.y - y).max(y - block.rect().bottom()).max(0.0);
            distance(a).total_cmp(&distance(b))
        })?;
        Some((block.block_id.clone(), block.hit_text(x, y)?))
    }

    pub fn block(&self, block_id: &str) -> Option<&FlowBlock> {
        self.blocks.iter().find(|block| block.block_id == block_id)
    }
}

/// World-space page layout with per-block reuse across passes.
#[derive(Default)]
pub struct BlockFlow {
    bodies: HashMap<String, (u64, Rc<BlockBody>)>,
}

struct FlowPass<'a> {
    dirty: Option<&'a BTreeSet<String>>,
    input: &'a FlowInput<'a>,
    palette: Palette,
    window: &'a Window,
    previous: HashMap<String, (u64, Rc<BlockBody>)>,
    next: HashMap<String, (u64, Rc<BlockBody>)>,
    blocks: Vec<FlowBlock>,
    stats: FlowStats,
    y: f32,
    /// Bottom margin of the previous sibling, `None` at the start of a flow root.
    pending_margin: Option<f32>,
}

impl BlockFlow {
    pub fn new() -> Self {
        Self::default()
    }

    /// Lay the snapshot out in world space, reusing the body of every block whose content,
    /// width and theme did not change since the previous pass.
    pub fn layout(&mut self, input: &FlowInput<'_>, window: &Window) -> FlowLayout {
        self.layout_changed(input, window, None)
    }

    /// The caller may identify text-only changes since the last pass when the environment
    /// and topology are identical. All other passes fingerprint each block normally.
    pub(crate) fn layout_changed(
        &mut self,
        input: &FlowInput<'_>,
        window: &Window,
        dirty: Option<&BTreeSet<String>>,
    ) -> FlowLayout {
        let mut pass = FlowPass {
            dirty,
            input,
            palette: input.theme.palette(),
            window,
            previous: std::mem::take(&mut self.bodies),
            next: HashMap::new(),
            blocks: Vec::new(),
            stats: FlowStats::default(),
            y: 0.0,
            pending_margin: None,
        };

        if let Some(root) = &input.snapshot.root {
            let title = match &root.content {
                BlockContent::Page { title } => title.plain.as_str(),
                _ => "",
            };
            let body = pass.body("\u{0}title", &("title", title), |pass| {
                pass.title_body(title)
            });
            pass.y = TITLE_SPEC.margin_top;
            pass.blocks.push(FlowBlock {
                block_id: root.id.clone(),
                snapshot_id: SharedString::from("page.title_block"),
                x: 0.0,
                y: pass.y,
                body: body.clone(),
            });
            pass.y += body.height + TITLE_SPEC.margin_bottom;

            for child in &root.children {
                if child.is_edgeless_only() {
                    continue;
                }
                // Each note is its own flow root: margins never collapse across notes.
                pass.pending_margin = None;
                match &child.content {
                    BlockContent::Note { hidden: true, .. } => continue,
                    BlockContent::Note { .. } => {
                        pass.flow(&child.children, 0.0, 0, BlockAlign::Left)
                    }
                    _ => pass.flow(std::slice::from_ref(child), 0.0, 0, BlockAlign::Left),
                }
                pass.y += pass.pending_margin.take().unwrap_or(0.0);
            }
            pass.y += BOTTOM_PADDING;
        }

        self.bodies = pass.next;
        FlowLayout {
            blocks: pass.blocks,
            width: input.width,
            height: pass.y,
            stats: pass.stats,
        }
    }
}

fn heading_level(node: &BlockNode) -> Option<u8> {
    match &node.content {
        BlockContent::Paragraph { kind, .. } => match kind {
            ParagraphType::H1 => Some(1),
            ParagraphType::H2 => Some(2),
            ParagraphType::H3 => Some(3),
            ParagraphType::H4 => Some(4),
            ParagraphType::H5 => Some(5),
            ParagraphType::H6 => Some(6),
            _ => None,
        },
        _ => None,
    }
}

impl<'a> FlowPass<'a> {
    fn body(
        &mut self,
        key: &str,
        content: &dyn std::fmt::Debug,
        build: impl FnOnce(&mut Self) -> BlockBody,
    ) -> Rc<BlockBody> {
        if self.dirty.is_some_and(|ids| !ids.contains(key))
            && let Some((id, cached)) = self.previous.remove_entry(key)
        {
            self.stats.reused += 1;
            let body = cached.1.clone();
            self.next.insert(id, cached);
            return body;
        }
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        format!("{content:?}").hash(&mut hasher);
        self.input.width.to_bits().hash(&mut hasher);
        self.input.theme.hash(&mut hasher);
        self.input.env_rev.hash(&mut hasher);
        let fingerprint = hasher.finish();

        let body = match self.previous.get(key) {
            Some((previous, body)) if *previous == fingerprint => {
                self.stats.reused += 1;
                body.clone()
            }
            _ => {
                self.stats.laid_out += 1;
                Rc::new(build(self))
            }
        };
        self.next
            .insert(key.to_string(), (fingerprint, body.clone()));
        body
    }

    /// Place `nodes` as siblings at horizontal offset `x`, collapsing vertical margins.
    /// `inherited_align` is the text alignment of the nearest ancestor that sets one.
    fn flow(
        &mut self,
        nodes: &[BlockNode],
        x: f32,
        list_depth: usize,
        inherited_align: BlockAlign,
    ) {
        let mut collapsed_heading: Option<u8> = None;
        for node in nodes {
            if let Some(level) = collapsed_heading {
                match heading_level(node) {
                    Some(next) if next <= level => collapsed_heading = None,
                    _ => continue,
                }
            }
            if node.is_edgeless_only() {
                continue;
            }

            let width = (self.input.width - x).max(0.0);
            let align = match &node.content {
                BlockContent::Paragraph { text_align, .. }
                | BlockContent::List { text_align, .. } => text_align.unwrap_or(inherited_align),
                _ => inherited_align,
            };
            let fingerprint = (
                &node.content,
                node.children.is_empty(),
                width.to_bits(),
                list_depth,
                align,
            );
            let body = self.body(&node.id, &fingerprint, |pass| {
                pass.block_body(node, width, list_depth, align)
            });
            let gap = match self.pending_margin {
                None => body.margin_top,
                Some(previous) => previous.max(body.margin_top),
            };
            self.y += gap;
            self.blocks.push(FlowBlock {
                block_id: node.id.clone(),
                snapshot_id: SharedString::from(format!("page.block.{}", node.id)),
                x,
                y: self.y,
                body: body.clone(),
            });
            self.y += body.height;
            self.pending_margin = Some(body.margin_bottom);

            let (shows_children, child_depth) = match &node.content {
                BlockContent::List { collapsed, .. } => (!collapsed, list_depth + 1),
                // A collapsed heading hides its own children as well as the siblings under it.
                BlockContent::Paragraph {
                    collapsed: true, ..
                } if heading_level(node).is_some() => (false, 0),
                BlockContent::Unknown(_) => (false, 0),
                _ => (true, 0),
            };
            if shows_children && !node.children.is_empty() {
                // The block's own row has no bottom margin; the last child's bottom margin
                // collapses through the children container into the block's.
                self.pending_margin = Some(0.0);
                self.flow(&node.children, x + CHILD_INDENT, child_depth, align);
                self.pending_margin =
                    Some(self.pending_margin.unwrap_or(0.0).max(body.margin_bottom));
            }

            if let (
                Some(level),
                BlockContent::Paragraph {
                    collapsed: true, ..
                },
            ) = (heading_level(node), &node.content)
            {
                collapsed_heading = Some(level);
            }
        }
    }

    fn plain_inline(
        &self,
        text: &str,
        style: InlineStyle,
        width: f32,
        line_height: f32,
        align: InlineAlign,
    ) -> Rc<InlineLayout> {
        Rc::new(layout_inline(
            text,
            &style,
            width,
            line_height,
            InlineBaseline::Of(&style),
            align,
            self.window,
        ))
    }

    /// Lay out a block's rich text with the shared paragraph engine, at the block's
    /// typography. A delta the engine rejects falls back to its plain string.
    fn block_text(
        &self,
        text: &RichText,
        spec: &TextSpec,
        ink: Hsla,
        width: f32,
        align: BlockAlign,
    ) -> FlowTextLayout {
        let width = width.max(1.0);
        let paragraph = RichParagraph::from_delta_with_resolver(text.delta.clone(), |page_id| {
            self.input.page_titles.get(page_id).cloned()
        });
        match paragraph {
            Ok(paragraph) => {
                let mut style = RichParagraphStyle::from_theme(self.input.theme.mode());
                // Inline code is set 3px below the block's size; its measured box scales
                // with it.
                let code_font_size = (spec.font_size - 3.0).max(8.0);
                let code_scale = code_font_size / style.code_font_size;
                style.code_font_size = code_font_size;
                style.code_baseline *= code_scale;
                style.code_descent *= code_scale;
                style.font_size = spec.font_size;
                style.base_weight = FontWeight(spec.font_weight);
                style.line_height = spec.line_height;
                style.baseline_offset = Some(spec.baseline);
                style.letter_spacing = spec.letter_spacing;
                style.align = match align {
                    BlockAlign::Left => TextAlign::Left,
                    BlockAlign::Center => TextAlign::Center,
                    BlockAlign::Right => TextAlign::Right,
                };
                style.text_color = ink;
                FlowTextLayout::Rich(Arc::new(paragraph.layout(
                    self.window.text_system(),
                    &style,
                    width,
                )))
            }
            Err(_) => FlowTextLayout::Plain(Rc::new(layout_inline(
                &text.plain,
                &InlineStyle::new(FONT_SANS, spec.font_size, spec.font_weight, ink),
                width,
                spec.line_height,
                InlineBaseline::At(spec.baseline),
                match align {
                    BlockAlign::Left => InlineAlign::Left,
                    BlockAlign::Center => InlineAlign::Center,
                    BlockAlign::Right => InlineAlign::Right,
                },
                self.window,
            ))),
        }
    }

    fn title_body(&mut self, title: &str) -> BlockBody {
        let width = self.input.width;
        let (text, color) = if title.is_empty() {
            ("Title", self.palette.placeholder.opacity(0.5))
        } else {
            (title, self.palette.text_primary)
        };
        let style = InlineStyle::new(
            FONT_SANS,
            TITLE_SPEC.font_size,
            TITLE_SPEC.font_weight,
            color,
        );
        let layout = Rc::new(layout_inline(
            text,
            &style,
            width,
            TITLE_SPEC.line_height,
            InlineBaseline::At(TITLE_SPEC.baseline),
            InlineAlign::Left,
            self.window,
        ));
        BlockBody {
            kind: FlowKind::Title,
            width,
            height: layout.height(),
            margin_top: TITLE_SPEC.margin_top,
            margin_bottom: TITLE_SPEC.margin_bottom,
            plain: text.to_string(),
            prims: vec![Prim::Text {
                x: 0.0,
                y: 0.0,
                layout: layout.clone(),
                clip: None,
            }],
            text: Some(FlowText {
                x: 0.0,
                y: 0.0,
                layout: FlowTextLayout::Plain(layout),
            }),
            prefix: None,
            code_scroll: None,
        }
    }

    fn block_body(
        &mut self,
        node: &BlockNode,
        width: f32,
        list_depth: usize,
        align: BlockAlign,
    ) -> BlockBody {
        match &node.content {
            BlockContent::Paragraph {
                kind,
                text,
                collapsed,
                ..
            } => self.paragraph_body(*kind, text, *collapsed, width, align),
            BlockContent::List {
                kind,
                checked,
                collapsed,
                text,
                numbered_index,
                ..
            } => self.list_body(
                *kind,
                *checked,
                *collapsed && !node.children.is_empty(),
                text,
                numbered_index.unwrap_or(1),
                list_depth,
                width,
                align,
            ),
            BlockContent::Divider => self.divider_body(width),
            BlockContent::Code {
                language,
                wrap,
                text,
                caption,
            } => self.code_body(language, *wrap, text, caption, width),
            BlockContent::Image {
                source_id,
                width: image_width,
                height: image_height,
                caption,
            } => self.image_body(source_id, *image_width, *image_height, caption, width),
            BlockContent::Bookmark {
                url,
                title,
                description,
                caption,
            } => self.bookmark_body(
                url,
                title.as_deref(),
                description.as_deref(),
                caption,
                width,
            ),
            _ => self.unknown_body(&node.flavour, &node.id, width),
        }
    }

    fn paragraph_body(
        &mut self,
        kind: ParagraphType,
        text: &RichText,
        collapsed: bool,
        width: f32,
        align: BlockAlign,
    ) -> BlockBody {
        let spec = paragraph_spec(kind);
        let (pad_left, pad_top, pad_bottom) = match kind {
            ParagraphType::Quote => QUOTE_PADDING,
            _ => (0.0, 0.0, 0.0),
        };
        let layout = self.block_text(
            text,
            &spec,
            self.palette.text_primary,
            width - pad_left,
            align,
        );
        let height = pad_top + layout.height() + pad_bottom;
        let mut prims = Vec::new();
        if kind == ParagraphType::Quote {
            prims.push(Prim::Quad {
                rect: FlowRect::new(0.0, pad_top, QUOTE_BAR_WIDTH, height - pad_top - pad_bottom),
                fill: Some(self.palette.quote),
                border: None,
                radius: QUOTE_BAR_WIDTH / 2.0,
                dashed: false,
            });
        }
        let is_heading = !matches!(kind, ParagraphType::Text | ParagraphType::Quote);
        if collapsed && is_heading {
            // A collapsed heading hides the blocks under it; a marker in the gutter, on the
            // heading's first line, says so.
            prims.push(Prim::Chevron {
                rect: heading_marker_rect(spec.line_height),
                collapsed: true,
                color: self.palette.icon,
            });
        }
        prims.push(layout.prim(pad_left, pad_top));
        BlockBody {
            kind: FlowKind::Paragraph(kind),
            width,
            height,
            margin_top: spec.margin_top,
            margin_bottom: spec.margin_bottom,
            plain: text.plain.clone(),
            prims,
            text: Some(FlowText {
                x: pad_left,
                y: pad_top,
                layout,
            }),
            prefix: None,
            code_scroll: None,
        }
    }

    fn list_body(
        &mut self,
        kind: ListType,
        checked: bool,
        collapsed: bool,
        text: &RichText,
        numbered_index: u32,
        list_depth: usize,
        width: f32,
        align: BlockAlign,
    ) -> BlockBody {
        let spec = paragraph_spec(ParagraphType::Text);
        let ink = if kind == ListType::Todo && checked {
            self.palette.text_secondary
        } else {
            self.palette.text_primary
        };
        let line_height = spec.line_height;
        let marker = self.palette.list_marker;
        let mut prims = Vec::new();
        let mut text_x = LIST_PREFIX_WIDTH;
        let prefix;
        // Every prefix is placed against the first line of text, never the whole block.
        let prefix_height = match kind {
            ListType::Toggle => line_height,
            _ => LIST_PREFIX_WIDTH,
        };
        let center_y = (prefix_height / 2.0).floor();

        match kind {
            ListType::Bulleted => {
                let (size, filled, radius) = match list_depth % 4 {
                    0 => (6.0, true, 3.0),
                    1 => (6.0, false, 3.0),
                    2 => (6.0, true, 1.0),
                    _ => (6.0, false, 1.0),
                };
                let origin = (LIST_PREFIX_WIDTH - size) / 2.0;
                prefix = FlowRect::new(origin, center_y - size / 2.0, size, size);
                prims.push(Prim::Quad {
                    rect: prefix,
                    fill: filled.then_some(marker),
                    border: (!filled).then_some(marker),
                    radius,
                    dashed: false,
                });
            }
            ListType::Numbered => {
                // The smaller number shares the baseline of the item's first line.
                let label = number_prefix(numbered_index, list_depth);
                let style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_sm_px, 400.0, marker);
                let layout = Rc::new(layout_inline(
                    &label,
                    &style,
                    f32::MAX,
                    line_height,
                    InlineBaseline::At(spec.baseline),
                    InlineAlign::Left,
                    self.window,
                ));
                let label_width = layout.content_width().ceil();
                text_x = (2.0 + label_width.max(22.0)).max(LIST_PREFIX_WIDTH);
                prefix = FlowRect::new(2.0, 0.0, label_width, line_height);
                prims.push(Prim::Text {
                    x: 2.0,
                    y: 0.0,
                    layout,
                    clip: None,
                });
            }
            ListType::Todo => {
                let (icon, color) = if checked {
                    ("CheckBoxCheckSolidIcon", self.palette.brand)
                } else {
                    ("CheckBoxUnIcon", self.palette.icon)
                };
                prefix = FlowRect::new(0.0, center_y - 10.0, 20.0, 20.0);
                prims.push(Prim::Icon {
                    rect: prefix,
                    icon: IconPaint::named(icon),
                    color,
                });
            }
            ListType::Toggle => {
                prefix = FlowRect::new(2.0, center_y - 10.0, 20.0, 20.0);
                prims.push(Prim::Chevron {
                    rect: prefix,
                    collapsed,
                    color: marker,
                });
            }
        }

        // The prefix stays at the left edge; only the text box follows the alignment.
        let layout = self.block_text(text, &spec, ink, width - text_x, align);
        let height = layout.height().max(prefix_height);
        prims.push(layout.prim(text_x, 0.0));
        BlockBody {
            kind: FlowKind::List(kind),
            width,
            height,
            margin_top: TEXT_BLOCK_MARGIN,
            margin_bottom: TEXT_BLOCK_MARGIN,
            plain: text.plain.clone(),
            prims,
            text: Some(FlowText {
                x: text_x,
                y: 0.0,
                layout,
            }),
            prefix: Some(prefix),
            code_scroll: None,
        }
    }

    fn divider_body(&mut self, width: f32) -> BlockBody {
        BlockBody {
            kind: FlowKind::Divider,
            width,
            height: DIVIDER_HEIGHT,
            margin_top: TYPOGRAPHY.paragraph_space_px,
            margin_bottom: 0.0,
            plain: String::new(),
            prims: vec![Prim::Quad {
                rect: FlowRect::new(8.0, DIVIDER_HEIGHT / 2.0, (width - 16.0).max(0.0), 1.0),
                fill: Some(self.palette.divider),
                border: None,
                radius: 0.0,
                dashed: false,
            }],
            text: None,
            prefix: None,
            code_scroll: None,
        }
    }

    /// Append a centered caption below a block body, if there is one.
    fn push_caption(&self, body: &mut BlockBody, caption: &str) {
        if caption.is_empty() {
            return;
        }
        let style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_sm_px, 400.0, self.palette.icon);
        let layout = self.plain_inline(caption, style, body.width, 22.0, InlineAlign::Center);
        let y = body.height + 4.0;
        body.height = y + layout.height();
        body.prims.push(Prim::Text {
            x: 0.0,
            y,
            layout,
            clip: None,
        });
    }

    fn code_body(
        &mut self,
        language: &str,
        wrap: bool,
        text: &str,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        let (pad_y, pad_x) = CODE_PADDING;
        let line_height = TYPOGRAPHY.font_xs_px + 8.0;
        let code_style = InlineStyle::new(
            FONT_CODE,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_primary,
        );
        let number_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let code_x = pad_x + CODE_GUTTER;
        let code_width = (width - code_x - pad_x).max(1.0);

        let mut prims = Vec::new();
        let mut y = pad_y;
        let mut code_pieces = Vec::new();
        let mut line_offset = 0;
        let mut source_offset = 0;
        let mut widest_line = 0.0_f32;
        for (index, line) in text.split('\n').enumerate() {
            let layout = self.plain_inline(
                line,
                code_style.clone(),
                if wrap { code_width } else { f32::MAX },
                line_height,
                InlineAlign::Left,
            );
            // Line numbers sit on the baseline of the code they count.
            let number = Rc::new(layout_inline(
                &(index + 1).to_string(),
                &number_style,
                f32::MAX,
                line_height,
                InlineBaseline::Of(&code_style),
                InlineAlign::Left,
                self.window,
            ));
            prims.push(Prim::Text {
                x: pad_x,
                y,
                layout: number,
                clip: None,
            });
            let height = layout.height();
            // Empty lines have a caret stop at x=0 even when no glyph was shaped.
            if layout.pieces.is_empty() {
                code_pieces.push(InlinePiece {
                    line: line_offset,
                    x: 0.0,
                    visible_width: 0.0,
                    baseline_shift: 0.0,
                    shaped: shape(self.window, "", &code_style),
                    source_start: source_offset,
                    source_len: 0,
                });
            }
            for piece in &layout.pieces {
                code_pieces.push(InlinePiece {
                    line: line_offset + piece.line,
                    source_start: source_offset + piece.source_start,
                    ..piece.clone()
                });
            }
            line_offset += layout.line_count;
            source_offset += line.encode_utf16().count() + 1;
            widest_line = widest_line.max(layout.content_width());
            prims.push(if wrap {
                Prim::Text {
                    x: code_x,
                    y,
                    layout,
                    clip: None,
                }
            } else {
                // Unwrapped lines stop at the block's padding edge and scroll sideways.
                Prim::CodeLine {
                    x: code_x,
                    y,
                    layout,
                    clip: FlowRect::new(code_x, y, code_width, height),
                }
            });
            y += height;
        }
        let height = y + pad_y;
        let max_scroll_x = (widest_line - code_width).max(0.0).ceil();
        let code_scroll = (!wrap && max_scroll_x > 0.0).then(|| CodeScroll {
            area: FlowRect::new(code_x, pad_y, code_width, y - pad_y),
            max_x: max_scroll_x,
        });

        prims.insert(
            0,
            Prim::Quad {
                rect: FlowRect::new(0.0, 0.0, width, height),
                fill: Some(self.palette.code_background),
                border: None,
                radius: CODE_RADIUS,
                dashed: false,
            },
        );
        let label = if language.is_empty() {
            "Plain Text"
        } else {
            language
        };
        let label_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let label_layout = self.plain_inline(label, label_style, f32::MAX, 16.0, InlineAlign::Left);
        prims.push(Prim::Text {
            x: pad_x,
            y: 8.0,
            layout: label_layout,
            clip: Some(FlowRect::new(
                pad_x,
                8.0,
                (width - 2.0 * pad_x).max(0.0),
                16.0,
            )),
        });

        let mut body = BlockBody {
            kind: FlowKind::Code,
            width,
            height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: text.to_string(),
            prims,
            text: Some(FlowText {
                x: code_x,
                y: pad_y,
                layout: FlowTextLayout::Plain(Rc::new(InlineLayout {
                    pieces: code_pieces,
                    line_count: line_offset,
                    line_height,
                    width: code_width,
                    baseline: baseline_in_line(line_height, &shape(self.window, "Ag", &code_style)),
                })),
            }),
            prefix: None,
            code_scroll,
        };
        self.push_caption(&mut body, caption);
        body
    }

    fn image_body(
        &mut self,
        source_id: &str,
        image_width: Option<f64>,
        image_height: Option<f64>,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        let slot = self.input.images.get(source_id);
        let natural = match slot {
            Some(ImageSlot::Ready(image)) => {
                let size = image.size(0);
                Some((size.width.0 as f32, size.height.0 as f32))
            }
            _ => None,
        };
        // Explicit block dimensions win; otherwise the image's own size, then a 16:9 frame.
        let (mut w, mut h) = match (image_width, image_height, natural) {
            (Some(w), Some(h), _) => (w as f32, h as f32),
            (Some(w), None, Some((nw, nh))) if nw > 0.0 => (w as f32, w as f32 * nh / nw),
            (_, _, Some(natural)) => natural,
            _ => (480.0, 270.0),
        };
        if w > width && w > 0.0 {
            h *= width / w;
            w = width;
        }
        let (w, h) = (w.round().max(1.0), h.round().max(1.0));
        let x = ((width - w) / 2.0).floor().max(0.0);

        let mut prims = Vec::new();
        let plain;
        match slot {
            Some(ImageSlot::Ready(image)) => {
                plain = caption.to_string();
                prims.push(Prim::Image {
                    rect: FlowRect::new(x, 0.0, w, h),
                    image: image.clone(),
                });
            }
            other => {
                // Media frame shown until the blob arrives (or when it cannot be shown).
                // Longest wording first; a small frame falls back to a shorter one.
                let wordings: &[&str] = if matches!(other, Some(ImageSlot::Unavailable)) {
                    &["Image unavailable", "Unavailable", "No image"]
                } else {
                    &["Loading image", "Loading"]
                };
                let status = wordings[0];
                plain = status.to_string();
                prims.push(Prim::Quad {
                    rect: FlowRect::new(x, 0.0, w, h),
                    fill: Some(self.palette.background_secondary),
                    border: Some(self.palette.border),
                    radius: 8.0,
                    dashed: false,
                });
                let inner = (w - 24.0).max(1.0);
                let status_style = InlineStyle::new(
                    FONT_SANS,
                    TYPOGRAPHY.font_sm_px,
                    500.0,
                    self.palette.text_secondary,
                );
                let fitting = wordings
                    .iter()
                    .find(|wording| {
                        f32::from(shape(self.window, wording, &status_style).width()) <= inner
                    })
                    .unwrap_or(&status);
                let lines = [
                    (fitting.to_string(), status_style, 22.0),
                    (
                        format!("{} \u{00d7} {}", w as i64, h as i64),
                        InlineStyle::new(
                            FONT_SANS,
                            TYPOGRAPHY.font_xs_px,
                            400.0,
                            self.palette.text_secondary,
                        ),
                        20.0,
                    ),
                    (
                        source_id.to_string(),
                        InlineStyle::new(
                            FONT_CODE,
                            TYPOGRAPHY.font_xs_px,
                            400.0,
                            self.palette.text_secondary,
                        ),
                        20.0,
                    ),
                ];
                let total: f32 = lines.iter().map(|(_, _, line_height)| line_height).sum();
                let mut y = ((h - total) / 2.0).floor().max(0.0);
                for (text, style, line_height) in lines {
                    if y + line_height > h {
                        break;
                    }
                    let shaped = truncate_to_width(self.window, &text, &style, inner);
                    let text = shaped.text.to_string();
                    let layout =
                        self.plain_inline(&text, style, inner, line_height, InlineAlign::Center);
                    prims.push(Prim::Text {
                        x: x + 12.0,
                        y,
                        layout,
                        clip: None,
                    });
                    y += line_height;
                }
            }
        }

        let mut body = BlockBody {
            kind: FlowKind::Image,
            width,
            height: h,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain,
            prims,
            text: None,
            prefix: None,
            code_scroll: None,
        };
        self.push_caption(&mut body, caption);
        body
    }

    fn bookmark_body(
        &mut self,
        url: &str,
        title: Option<&str>,
        description: Option<&str>,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        // 1px border plus the content's 12px padding.
        let pad = 13.0;
        let inner = (width - 2.0 * pad).max(1.0);
        let host = host_name(url);
        let title = title.filter(|title| !title.is_empty()).unwrap_or(host);
        // Without a fetched description the card falls back to the address itself.
        let description = description
            .filter(|description| !description.is_empty())
            .unwrap_or(url);

        let mut prims = vec![Prim::Quad {
            rect: FlowRect::new(0.0, 0.0, width, BOOKMARK_HEIGHT),
            fill: Some(self.palette.background),
            border: Some(self.palette.card_border),
            radius: 8.0,
            dashed: false,
        }];

        // Title row: 16px link icon centered on the 22px title line.
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            600.0,
            self.palette.text_primary,
        );
        let title_x = pad + 16.0 + 8.0;
        let title_width = (width - title_x - pad).max(1.0);
        let title_text = truncate_to_width(self.window, title, &title_style, title_width)
            .text
            .to_string();
        prims.push(Prim::Icon {
            rect: FlowRect::new(pad, pad + 3.0, 16.0, 16.0),
            icon: IconPaint::named("LinkIcon"),
            color: self.palette.icon,
        });
        prims.push(Prim::Text {
            x: title_x,
            y: pad,
            layout: self.plain_inline(
                &title_text,
                title_style,
                title_width,
                22.0,
                InlineAlign::Left,
            ),
            clip: None,
        });

        // Description: at most two 20px lines.
        let description_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_primary,
        );
        let description_y = pad + 22.0 + 4.0;
        prims.push(Prim::Text {
            x: pad,
            y: description_y,
            layout: self.plain_inline(
                description,
                description_style,
                inner,
                20.0,
                InlineAlign::Left,
            ),
            clip: Some(FlowRect::new(pad, description_y, inner, 40.0)),
        });

        // Address row pinned to the bottom padding edge.
        let url_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let url_text = truncate_to_width(self.window, host, &url_style, inner)
            .text
            .to_string();
        prims.push(Prim::Text {
            x: pad,
            y: BOOKMARK_HEIGHT - pad - 20.0,
            layout: self.plain_inline(&url_text, url_style, inner, 20.0, InlineAlign::Left),
            clip: None,
        });

        let mut body = BlockBody {
            kind: FlowKind::Bookmark,
            width,
            height: BOOKMARK_HEIGHT,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: title.to_string(),
            prims,
            text: None,
            prefix: None,
            code_scroll: None,
        };
        self.push_caption(&mut body, caption);
        body
    }

    fn unknown_body(&mut self, flavour: &str, block_id: &str, width: f32) -> BlockBody {
        let pad = 12.0;
        let inner = (width - 2.0 * pad).max(1.0);
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            500.0,
            self.palette.text_secondary,
        );
        let id_style = InlineStyle::new(
            FONT_CODE,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let label = format!("Unsupported block: {flavour}");
        let title = self.plain_inline(&label, title_style, inner, 22.0, InlineAlign::Left);
        let id_text = truncate_to_width(self.window, block_id, &id_style, inner)
            .text
            .to_string();
        let id = self.plain_inline(&id_text, id_style, inner, 20.0, InlineAlign::Left);
        let height = pad + title.height() + id.height() + pad;
        let id_y = pad + title.height();
        BlockBody {
            kind: FlowKind::Unknown,
            width,
            height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: format!("[Unsupported block: {flavour}]"),
            prims: vec![
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, width, height),
                    fill: None,
                    border: Some(self.palette.divider),
                    radius: 8.0,
                    dashed: true,
                },
                Prim::Text {
                    x: pad,
                    y: pad,
                    layout: title,
                    clip: None,
                },
                Prim::Text {
                    x: pad,
                    y: id_y,
                    layout: id,
                    clip: None,
                },
            ],
            text: None,
            prefix: None,
            code_scroll: None,
        }
    }
}

/// Host of a URL without scheme, credentials, port or path; the input itself if it has none.
fn host_name(url: &str) -> &str {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    let host = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host)| host);
    let host = host.split(':').next().unwrap_or(host);
    if host.is_empty() { url } else { host }
}

/// One end of a remote text selection: a UTF-16 range inside a block's text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemotePoint {
    pub block_id: String,
    pub index: usize,
    pub length: usize,
}

/// A remote collaborator's text selection (BlockSuite `TextSelection`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteSelection {
    pub from: RemotePoint,
    pub to: Option<RemotePoint>,
    pub reverse: bool,
}

/// A remote collaborator from room awareness.
#[derive(Clone, Debug, PartialEq)]
pub struct RemotePresence {
    pub client_id: u64,
    pub name: String,
    pub color: Hsla,
    pub selection: Option<RemoteSelection>,
}

/// World-space geometry of a remote collaborator's selection, caret and name tag.
pub struct PresenceMark {
    pub client_id: u64,
    pub name: SharedString,
    pub color: Hsla,
    pub highlights: Vec<FlowRect>,
    pub caret: FlowRect,
    pub label: FlowRect,
    label_text: ShapedLine,
}

impl FlowLayout {
    /// Resolve remote selections against this layout. Collaborators whose selection points
    /// at a block that is not laid out (or has no text) produce no mark.
    pub fn presence_marks(
        &self,
        presences: &[RemotePresence],
        palette: &Palette,
        window: &Window,
    ) -> Vec<PresenceMark> {
        let text_blocks: Vec<(usize, &FlowBlock, &FlowText)> = self
            .blocks
            .iter()
            .enumerate()
            .filter_map(|(index, block)| block.body.text.as_ref().map(|text| (index, block, text)))
            .collect();
        let find = |block_id: &str| {
            text_blocks
                .iter()
                .position(|(_, block, _)| block.block_id == block_id)
        };

        let mut marks = Vec::new();
        for presence in presences {
            let Some(selection) = &presence.selection else {
                continue;
            };
            let Some(from_index) = find(&selection.from.block_id) else {
                continue;
            };
            let to_index = selection
                .to
                .as_ref()
                .and_then(|to| find(&to.block_id))
                .filter(|to_index| *to_index > from_index);

            let mut highlights = Vec::new();
            let mut cover = |position: usize, start: usize, end: usize| {
                let (_, block, text) = text_blocks[position];
                for (line, x0, x1) in text.layout.selection_spans(start, end) {
                    let left = (block.x + text.x + x0).floor();
                    let right = (block.x + text.x + x1).ceil().min(self.width);
                    highlights.push(FlowRect::new(
                        left,
                        block.y + text.y + line as f32 * text.layout.line_height(),
                        (right - left).max(0.0),
                        text.layout.line_height(),
                    ));
                }
            };
            let from_end = selection.from.index.saturating_add(selection.from.length);
            cover(from_index, selection.from.index, from_end);
            if let (Some(to_index), Some(to)) = (to_index, &selection.to) {
                for between in from_index + 1..to_index {
                    cover(between, 0, usize::MAX);
                }
                cover(to_index, to.index, to.index.saturating_add(to.length));
            }

            // The caret sits at the focus end of the selection.
            let (caret_position, caret_offset) = if selection.reverse {
                (from_index, selection.from.index)
            } else {
                match (to_index, &selection.to) {
                    (Some(to_index), Some(to)) => (to_index, to.index.saturating_add(to.length)),
                    _ => (from_index, from_end),
                }
            };
            let (_, block, text) = text_blocks[caret_position];
            let (caret_x, caret_line) = text.layout.caret(caret_offset);
            let line_height = text.layout.line_height();
            let caret = FlowRect::new(
                (block.x + text.x + caret_x - 1.0)
                    .round()
                    .clamp(0.0, (self.width - 2.0).max(0.0)),
                block.y + text.y + caret_line as f32 * line_height,
                2.0,
                line_height,
            );

            let label_style =
                InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 500.0, palette.on_accent);
            let max_label = (self.width - 8.0).max(1.0);
            let label_text = truncate_to_width(window, &presence.name, &label_style, max_label);
            let label_width = (f32::from(label_text.width()).ceil() + 8.0).min(self.width);
            // The tag hangs above the caret, shifted left at the column edge and flipped
            // below the caret when there is no room above.
            let label_x = caret.x.min((self.width - label_width).max(0.0));
            let label_y = if caret.y >= PRESENCE_LABEL_HEIGHT {
                caret.y - PRESENCE_LABEL_HEIGHT
            } else {
                caret.bottom()
            };
            marks.push(PresenceMark {
                client_id: presence.client_id,
                name: SharedString::from(presence.name.clone()),
                color: presence.color,
                highlights,
                caret,
                label: FlowRect::new(label_x, label_y, label_width, PRESENCE_LABEL_HEIGHT),
                label_text,
            });
        }
        marks
    }
}

/// Mapping of world space onto the screen for one frame.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PageViewport {
    /// X of the page column's left edge inside the viewport element.
    pub column_x: f32,
    /// Height of the viewport element.
    pub height: f32,
    /// World y shown at the top of the viewport.
    pub scroll_y: f32,
}

impl PageViewport {
    /// Whether a world-space rectangle lies completely inside the viewport, vertically.
    pub fn fully_visible(&self, rect: &FlowRect) -> bool {
        rect.y >= self.scroll_y && rect.bottom() <= self.scroll_y + self.height
    }

    /// Whether a world-space rectangle shows in the viewport at all, vertically.
    pub fn intersects(&self, rect: &FlowRect) -> bool {
        rect.bottom() > self.scroll_y && rect.y < self.scroll_y + self.height
    }

    /// A world-space rectangle in the coordinates of the viewport element.
    pub fn to_local(&self, rect: &FlowRect) -> FlowRect {
        FlowRect::new(
            self.column_x + rect.x,
            rect.y - self.scroll_y,
            rect.w,
            rect.h,
        )
    }
}

/// Snapshot parent id of every page block element.
pub const PAGE_SURFACE_ID: &str = "page.editor_surface";

/// Build the elements of the blocks and presence marks intersecting `viewport`, positioned
/// absolutely inside the viewport element. `paint` carries the per-frame state of blocks
/// that is not part of their layout (a chevron in flight, a code block's scroll).
///
/// Only blocks lying completely inside the viewport record an element snapshot: a block
/// cut by the fold is clipped on purpose and would read as a clipping fault otherwise.
pub fn page_elements(
    layout: &Rc<FlowLayout>,
    marks: Vec<PresenceMark>,
    viewport: PageViewport,
    paint: &PagePaint,
) -> Vec<AnyElement> {
    let mut elements = Vec::new();
    for block in &layout.blocks {
        let rect = block.rect();
        if !viewport.intersects(&rect) {
            continue;
        }
        let body = block.body.clone();
        let state = paint
            .blocks
            .get(&block.block_id)
            .copied()
            .unwrap_or_default();
        let mut element = div()
            .absolute()
            .left(px(viewport.column_x + rect.x))
            .top(px(rect.y - viewport.scroll_y))
            .w(px(rect.w))
            .h(px(rect.h));
        if viewport.fully_visible(&rect) {
            element = element
                .snapshot(block.snapshot_id.clone(), Some(PAGE_SURFACE_ID))
                .snapshot_text(block.body.plain.clone());
        }
        elements.push(
            element
                .child(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, window, cx| body.paint(bounds.origin, state, window, cx),
                    )
                    .size_full(),
                )
                .into_any_element(),
        );
    }

    // Presence paints after every block so name tags stay above neighbouring text. Marks
    // in a sideways-scrolled code block follow its lines and stay inside its code area.
    let scrolled = paint.scrolled_code(layout);
    for mut mark in marks {
        if let Some(code) = ScrolledCode::containing(&scrolled, &mark.caret) {
            mark.highlights = mark
                .highlights
                .iter()
                .filter_map(|rect| code.span(*rect))
                .collect();
            match code.caret(mark.caret) {
                Some(caret) => {
                    mark.label.x = (mark.label.x - (mark.caret.x - caret.x)).max(0.0);
                    mark.caret = caret;
                }
                None => {
                    // The caret scrolled out; its name tag goes with it.
                    mark.caret.w = 0.0;
                    mark.label.w = 0.0;
                }
            }
        }
        let screen = |rect: &FlowRect| {
            FlowRect::new(
                viewport.column_x + rect.x,
                rect.y - viewport.scroll_y,
                rect.w,
                rect.h,
            )
        };
        // Same wash and corner radius as BlockSuite's remote selection rects.
        let highlight = mark.color.opacity(0.2);
        for rect in &mark.highlights {
            if !viewport.intersects(rect) {
                continue;
            }
            let rect = screen(rect);
            elements.push(
                div()
                    .absolute()
                    .left(px(rect.x))
                    .top(px(rect.y))
                    .w(px(rect.w))
                    .h(px(rect.h))
                    .rounded(px(3.0))
                    .bg(highlight)
                    .into_any_element(),
            );
        }
        if mark.caret.w > 0.0 && viewport.intersects(&mark.caret) {
            let rect = screen(&mark.caret);
            let mut caret = div()
                .absolute()
                .left(px(rect.x))
                .top(px(rect.y))
                .w(px(rect.w))
                .h(px(rect.h))
                .bg(mark.color);
            if viewport.fully_visible(&mark.caret) {
                caret = caret.snapshot(
                    SharedString::from(format!("page.presence.{}.caret", mark.client_id)),
                    Some(PAGE_SURFACE_ID),
                );
            }
            elements.push(caret.into_any_element());
        }
        if mark.label.w > 0.0 && viewport.intersects(&mark.label) {
            let rect = screen(&mark.label);
            let text = mark.label_text.clone();
            let mut label = div()
                .absolute()
                .left(px(rect.x))
                .top(px(rect.y))
                .w(px(rect.w))
                .h(px(rect.h))
                .rounded(px(4.0))
                .bg(mark.color);
            if viewport.fully_visible(&mark.label) {
                label = label
                    .snapshot(
                        SharedString::from(format!("page.presence.{}.label", mark.client_id)),
                        Some(PAGE_SURFACE_ID),
                    )
                    .snapshot_text(mark.name.clone());
            }
            elements.push(
                label
                    .child(
                        canvas(
                            |_, _, _| (),
                            move |bounds, _, window, cx| {
                                let origin = point(bounds.origin.x + px(4.0), bounds.origin.y);
                                let _ = text.paint(
                                    origin,
                                    px(PRESENCE_LABEL_HEIGHT),
                                    TextAlign::Left,
                                    None,
                                    window,
                                    cx,
                                );
                            },
                        )
                        .size_full(),
                    )
                    .into_any_element(),
            );
        }
    }
    elements
}

#[cfg(test)]
mod tests {
    use super::*;

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
