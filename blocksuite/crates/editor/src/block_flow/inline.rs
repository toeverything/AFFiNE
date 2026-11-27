use std::{rc::Rc, sync::Arc};

use ui::{
    App, BorderStyle, Bounds, Corners, Edges, Font, FontWeight, Hsla, Pixels, Point, RenderImage,
    ShapedLine, SharedString, TextAlign, TextRun, Window, point, px,
};

use crate::{rich_text::LaidOutRichParagraph, theme::IconPaint};

use super::*;

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
        font.fallbacks = Some(crate::default_font_fallbacks());
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
pub(super) struct InlinePiece {
    pub(super) line: usize,
    pub(super) x: f32,
    pub(super) visible_width: f32,
    pub(super) baseline_shift: f32,
    pub(super) shaped: ShapedLine,
    /// Position of the piece in the text, in UTF-16 code units.
    pub(super) source_start: usize,
    pub(super) source_len: usize,
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
    pub(super) pieces: Vec<InlinePiece>,
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

    pub(crate) fn paint(&self, origin: Point<Pixels>, window: &mut Window, cx: &mut App) {
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

pub(super) fn baseline_in_line(line_height: f32, shaped: &ShapedLine) -> f32 {
    let ascent = f32::from(shaped.ascent);
    let descent = f32::from(shaped.descent);
    (line_height - ascent - descent) / 2.0 + ascent
}

pub(super) fn shape(window: &Window, text: &str, style: &InlineStyle) -> ShapedLine {
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

pub(super) fn shape_highlighted(
    window: &Window,
    text: &str,
    style: &InlineStyle,
    spans: &[crate::highlight::HighlightSpan],
    mode: crate::theme::ThemeMode,
) -> ShapedLine {
    if text.is_empty() || spans.is_empty() {
        return shape(window, text, style);
    }
    let font = style.font();
    let mut runs = Vec::with_capacity(spans.len());
    let mut cursor = 0usize;
    for span in spans {
        let start = span.bytes.start.min(text.len());
        let end = span.bytes.end.min(text.len());
        if start > cursor {
            runs.push(TextRun {
                len: start - cursor,
                font: font.clone(),
                color: style.color,
                background_color: None,
                underline: None,
                strikethrough: None,
            });
        }
        if end > start {
            runs.push(TextRun {
                len: end - start,
                font: font.clone(),
                color: crate::highlight::syntax_color(span.kind, mode),
                background_color: None,
                underline: None,
                strikethrough: None,
            });
            cursor = end;
        }
    }
    if cursor < text.len() {
        runs.push(TextRun {
            len: text.len() - cursor,
            font,
            color: style.color,
            background_color: None,
            underline: None,
            strikethrough: None,
        });
    }
    window.text_system().shape_line(
        SharedString::from(text.to_string()),
        px(style.size),
        &runs,
        None,
    )
}

/// Lay out a single syntax-highlighted code line, optionally wrapping at `max_width`.
pub(super) fn layout_highlighted_code_line(
    line: &str,
    style: &InlineStyle,
    spans: &[crate::highlight::HighlightSpan],
    mode: crate::theme::ThemeMode,
    max_width: f32,
    line_height: f32,
    window: &Window,
) -> InlineLayout {
    let baseline = baseline_in_line(line_height, &shape(window, "Ag", style));
    if line.is_empty() {
        return InlineLayout {
            pieces: Vec::new(),
            line_count: 1,
            line_height,
            width: max_width,
            baseline,
        };
    }
    let shaped = shape_highlighted(window, line, style, spans, mode);
    let visible_width = f32::from(shaped.width());
    if visible_width <= max_width || !max_width.is_finite() {
        let source_len = line.encode_utf16().count();
        return InlineLayout {
            pieces: vec![InlinePiece {
                line: 0,
                x: 0.0,
                visible_width,
                baseline_shift: baseline - baseline_in_line(line_height, &shaped),
                shaped,
                source_start: 0,
                source_len,
            }],
            line_count: 1,
            line_height,
            width: max_width,
            baseline,
        };
    }

    // Wrap across visual lines while preserving per-byte syntax highlight spans.
    let mut pieces = Vec::new();
    let mut byte_start = 0usize;
    let mut utf16_offset = 0usize;
    let mut line_idx = 0usize;
    while byte_start < line.len() {
        let rem = &line[byte_start..];
        let mut split = rem.len();
        let mut best_space = None;
        for (idx, ch) in rem.char_indices() {
            let end = idx + ch.len_utf8();
            let w = f32::from(shape(window, &rem[..end], style).width());
            if w > max_width && idx > 0 {
                split = best_space.unwrap_or(idx);
                break;
            }
            if ch.is_whitespace() {
                best_space = Some(end);
            }
        }
        let seg = &rem[..split];
        let seg_end = byte_start + split;
        let sub_spans: Vec<crate::highlight::HighlightSpan> = spans
            .iter()
            .filter_map(|s| {
                let s0 = s.bytes.start.max(byte_start);
                let s1 = s.bytes.end.min(seg_end);
                (s1 > s0).then(|| crate::highlight::HighlightSpan {
                    bytes: (s0 - byte_start)..(s1 - byte_start),
                    kind: s.kind,
                })
            })
            .collect();
        let piece_shaped = shape_highlighted(window, seg, style, &sub_spans, mode);
        let piece_w = f32::from(piece_shaped.width());
        let source_len = seg.encode_utf16().count();
        pieces.push(InlinePiece {
            line: line_idx,
            x: 0.0,
            visible_width: piece_w,
            baseline_shift: baseline - baseline_in_line(line_height, &piece_shaped),
            shaped: piece_shaped,
            source_start: utf16_offset,
            source_len,
        });
        byte_start = seg_end;
        utf16_offset += source_len;
        line_idx += 1;
    }
    InlineLayout {
        pieces,
        line_count: line_idx.max(1),
        line_height,
        width: max_width,
        baseline,
    }
}

/// Split text into words that keep their trailing whitespace; `None` marks a hard break.
pub(super) fn inline_segments(text: &str) -> Vec<Option<&str>> {
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
pub(super) fn truncate_to_width(
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

pub(super) fn paint_quad(
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

/// Maximum encoded image payload decoded on the UI thread, matching the room relay's
/// 64 MiB blob limit so existing workspace images up to [`blocksuite_playground_doc::MAX_BLOB_BYTES`]
/// remain readable (picker admission enforces its own stricter limit separately).
const MAX_IMAGE_DECODE_BYTES: usize = blocksuite_playground_doc::MAX_BLOB_BYTES;

/// Decode PNG, JPEG, WebP, GIF (first frame) or BMP bytes into a renderable image along
/// with its intrinsic pixel `(width, height)` in a single pass; any other format or payload
/// exceeding [`MAX_IMAGE_DECODE_BYTES`] is rejected.
pub fn decode_image_with_dimensions(bytes: &[u8]) -> Option<(Arc<RenderImage>, u32, u32)> {
    use image::ImageFormat::{Bmp, Gif, Jpeg, Png, WebP};
    if bytes.len() > MAX_IMAGE_DECODE_BYTES {
        return None;
    }
    let format = image::guess_format(bytes)
        .ok()
        .filter(|format| matches!(format, Png | Jpeg | WebP | Gif | Bmp))?;
    let mut buffer = image::load_from_memory_with_format(bytes, format)
        .ok()?
        .into_rgba8();
    let (width, height) = (buffer.width(), buffer.height());
    if width == 0 || height == 0 {
        return None;
    }
    // The renderer samples BGRA.
    for pixel in buffer.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    Some((
        Arc::new(RenderImage::new(vec![image::Frame::new(buffer)])),
        width,
        height,
    ))
}

/// Decode PNG, JPEG, WebP, GIF (first frame) or BMP bytes into a renderable image; any
/// other format is rejected.
pub fn decode_image(bytes: &[u8]) -> Option<Arc<RenderImage>> {
    decode_image_with_dimensions(bytes).map(|(img, _, _)| img)
}

/// Paint primitive of a block, positioned relative to the block's own origin.
#[derive(Clone)]
pub(super) enum Prim {
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
    Surface {
        rect: FlowRect,
        layout: Rc<crate::surface::SurfaceLayout>,
        world_origin: (f32, f32),
        scale: f32,
    },
}
