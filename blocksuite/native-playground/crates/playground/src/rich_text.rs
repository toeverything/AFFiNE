//! Shaped paragraph geometry in document UTF-16 coordinates.
use std::{ops::Range, sync::Arc};

pub use crate::theme::ThemeMode;
use crate::theme::{IconPaint, PlaygroundTheme, tokens as raw_tokens};
use ui::gpui_util::ResultExt as _;
use ui::{
    App, Bounds, FontStyle, FontWeight, Hsla, IntoElement, Pixels, Point, ShapedLine, SharedString,
    Size, Styled, TextAlign, TextRun, Window, WindowTextSystem, canvas, fill, point, px, size,
};
use unicode_bidi::BidiInfo;
use unicode_linebreak::linebreaks;
use unicode_segmentation::UnicodeSegmentation;
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

#[derive(Clone, Copy, Debug)]
struct Boundary {
    byte: usize,
    utf16: u64,
}

/// Character and extended-grapheme boundaries, including a sentinel at the end.
/// Interior offsets snap towards the beginning of the character or grapheme.
#[derive(Debug)]
pub struct TextBiIndex {
    chars: Vec<Boundary>,
    graphemes: Vec<Boundary>,
}

impl TextBiIndex {
    pub fn new(text: &str) -> Self {
        let mut chars = Vec::new();
        let mut graphemes = Vec::new();
        let mut utf16 = 0;
        for (start, cluster) in text.grapheme_indices(true) {
            graphemes.push(Boundary { byte: start, utf16 });
            for (offset, ch) in cluster.char_indices() {
                chars.push(Boundary {
                    byte: start + offset,
                    utf16,
                });
                utf16 += ch.len_utf16() as u64;
            }
        }
        let end = Boundary {
            byte: text.len(),
            utf16,
        };
        chars.push(end);
        graphemes.push(end);
        Self { chars, graphemes }
    }

    pub fn utf16_len(&self) -> u64 {
        self.chars.last().unwrap().utf16
    }

    pub fn utf16_to_utf8_clamped(&self, offset: u64) -> usize {
        self.chars[self.chars.partition_point(|b| b.utf16 <= offset) - 1].byte
    }

    pub fn utf8_to_utf16(&self, offset: usize) -> u64 {
        self.chars[self.chars.partition_point(|b| b.byte <= offset) - 1].utf16
    }

    pub fn grapheme_count(&self) -> usize {
        self.graphemes.len() - 1
    }

    pub fn prev_grapheme_utf16(&self, offset: u64) -> u64 {
        self.graphemes[self
            .graphemes
            .partition_point(|b| b.utf16 < offset.min(self.utf16_len()))
            .saturating_sub(1)]
        .utf16
    }

    pub fn next_grapheme_utf16(&self, offset: u64) -> u64 {
        self.graphemes[self
            .graphemes
            .partition_point(|b| b.utf16 <= offset)
            .min(self.grapheme_count())]
        .utf16
    }

    pub fn snap_to_grapheme_boundary_utf16(&self, offset: u64) -> u64 {
        self.graphemes[self.graphemes.partition_point(|b| b.utf16 <= offset) - 1].utf16
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InlineReference {
    pub kind: String,
    pub page_id: String,
    pub title: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct InlineMarkSet {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strike: bool,
    pub code: bool,
    pub link: Option<String>,
    pub reference: Option<InlineReference>,
    /// Text color as stored in the document (`var(--token)` or a hex color).
    pub color: Option<String>,
    /// Highlight color as stored in the document (`var(--token)` or a hex color).
    pub background: Option<String>,
}

fn string_attr(value: Option<&Any>) -> Option<String> {
    match value? {
        Any::String(s) => Some(s.clone()),
        _ => None,
    }
}

impl InlineMarkSet {
    fn from_attrs(attrs: &TextAttributes) -> Self {
        let enabled = |key| attrs.get(key) == Some(&Any::True);
        let reference = match attrs.get("reference") {
            Some(Any::Object(obj)) => string_attr(obj.get("type"))
                .zip(string_attr(obj.get("pageId")))
                .map(|(kind, page_id)| InlineReference {
                    kind,
                    page_id,
                    title: string_attr(obj.get("title")),
                }),
            _ => None,
        };
        Self {
            bold: enabled("bold"),
            italic: enabled("italic"),
            underline: enabled("underline"),
            strike: enabled("strike"),
            code: enabled("code"),
            link: string_attr(attrs.get("link")),
            reference,
            color: string_attr(attrs.get("color")),
            background: string_attr(attrs.get("background")),
        }
    }
}

#[derive(Clone, Debug)]
pub struct RichSpan {
    pub source_utf16: Range<u64>,
    pub display_bytes: Range<usize>,
    pub marks: InlineMarkSet,
    source_bytes: Range<usize>,
    chip: bool,
}

/// Owns the original snapshot, including opaque attributes and embedded values.
pub struct RichParagraph {
    delta: Vec<TextDeltaOp>,
    source: String,
    display: String,
    spans: Vec<RichSpan>,
    index: TextBiIndex,
}

impl RichParagraph {
    pub fn from_delta(delta: Vec<TextDeltaOp>) -> anyhow::Result<Self> {
        Self::from_delta_with_resolver(delta, |_| None)
    }

    pub fn from_delta_with_resolver(
        delta: Vec<TextDeltaOp>,
        resolve_doc_title: impl Fn(&str) -> Option<String>,
    ) -> anyhow::Result<Self> {
        let mut source = String::new();
        let mut display = String::new();
        let mut spans = Vec::new();
        let mut utf16 = 0;
        for op in &delta {
            let TextDeltaOp::Insert { insert, format } = op else {
                anyhow::bail!(
                    "paragraph layout requires a document snapshot containing insert operations"
                );
            };
            let marks = format
                .as_ref()
                .map(InlineMarkSet::from_attrs)
                .unwrap_or_default();
            let mut append = |text: &str, label: &str, chip: bool| {
                if text.is_empty() {
                    return;
                }
                let start = source.len();
                let display_start = display.len();
                source.push_str(text);
                display.push_str(label);
                let end = utf16 + text.encode_utf16().count() as u64;
                spans.push(RichSpan {
                    source_bytes: start..source.len(),
                    source_utf16: utf16..end,
                    display_bytes: display_start..display.len(),
                    marks: marks.clone(),
                    chip,
                });
                utf16 = end;
            };
            match insert {
                TextInsert::Text(s)
                    if marks.reference.is_some() && s.bytes().all(|b| b == b' ') =>
                {
                    let reference = marks.reference.as_ref().unwrap();
                    let resolved = resolve_doc_title(&reference.page_id);
                    let title = resolved
                        .as_deref()
                        .filter(|s| !s.is_empty())
                        .or_else(|| reference.title.as_deref().filter(|s| !s.is_empty()))
                        .unwrap_or("Untitled");
                    let label = format!("{PAGE_PREFIX}{}", title.replace(['\r', '\n'], " "));
                    // Y.Text may coalesce consecutive identically formatted placeholders.
                    for _ in s.bytes() {
                        append(" ", &label, true);
                    }
                }
                TextInsert::Text(s) => append(s, s, false),
                TextInsert::Embed(values) => {
                    let objects = "\u{fffc}".repeat(values.len());
                    append(&objects, &objects, false);
                }
            }
        }
        let index = TextBiIndex::new(&source);
        Ok(Self {
            delta,
            source,
            display,
            spans,
            index,
        })
    }

    pub fn delta(&self) -> &[TextDeltaOp] {
        &self.delta
    }
    pub fn source_text(&self) -> &str {
        &self.source
    }
    pub fn display_text(&self) -> &str {
        &self.display
    }
    pub fn spans(&self) -> &[RichSpan] {
        &self.spans
    }
    pub fn index(&self) -> &TextBiIndex {
        &self.index
    }

    /// Maps a document position to a UTF-8 boundary in the flattened display string.
    pub fn display_byte_for_utf16(&self, offset: u64) -> usize {
        let i = self.spans.partition_point(|s| s.source_utf16.end <= offset);
        self.spans.get(i).map_or(self.display.len(), |s| {
            s.display_bytes.start
                + (self.index.utf16_to_utf8_clamped(offset) - s.source_bytes.start)
        })
    }

    /// Inside a reference label, all interior byte positions address the placeholder's start.
    pub fn utf16_for_display_byte(&self, offset: usize) -> u64 {
        let i = self
            .spans
            .partition_point(|s| s.display_bytes.end <= offset);
        self.spans.get(i).map_or(self.index.utf16_len(), |s| {
            if s.chip {
                s.source_utf16.start
            } else {
                self.index
                    .utf8_to_utf16(s.source_bytes.start + (offset - s.display_bytes.start))
            }
        })
    }
}

// The display index includes the page symbol. Its outline is drawn with the
// paragraph so a platform's font fallback cannot substitute a color emoji.
const PAGE_PREFIX: &str = "▤ ";

#[derive(Clone, Debug)]
pub struct RichParagraphStyle {
    /// Theme that resolves `color` and `background` marks.
    pub theme: PlaygroundTheme,
    pub font_family: SharedString,
    pub code_font_family: SharedString,
    pub font_size: f32,
    pub base_weight: FontWeight,
    pub line_height: f32,
    /// Measured alphabetic baseline within the line box. Defaults to centered font metrics.
    pub baseline_offset: Option<f32>,
    pub letter_spacing: f32,
    /// Where each line sits inside the layout width.
    pub align: TextAlign,
    pub text_color: Hsla,
    pub link_color: Hsla,
    pub code_bg: Hsla,
    pub code_fg: Hsla,
    pub code_font_size: f32,
    pub code_border: Hsla,
    pub code_border_width: f32,
    pub code_radius: f32,
    pub code_padding_x: f32,
    pub code_padding_bottom: f32,
    pub code_baseline: f32,
    pub code_descent: f32,
    pub reference_divider: Hsla,
    pub icon_color: Hsla,
    pub chip_bg: Hsla,
    pub chip_fg: Hsla,
}

impl Default for RichParagraphStyle {
    fn default() -> Self {
        Self::from_theme(ThemeMode::Light)
    }
}

/// Inline code box as measured in the browser (`inline_formats.inline_code` of
/// `tokens/style-oracle.json`); a test keeps these constants equal to the oracle.
#[derive(Clone, Copy, Debug, PartialEq)]
struct CodeBoxMetrics {
    baseline: f32,
    descent: f32,
    border: f32,
    radius: f32,
    padding_x: f32,
    padding_bottom: f32,
}

impl CodeBoxMetrics {
    const LIGHT: Self = Self {
        baseline: 12.0,
        descent: 3.0,
        border: 1.0,
        radius: 4.0,
        padding_x: 4.0,
        padding_bottom: 2.0,
    };
    const DARK: Self = Self {
        baseline: 13.0,
        descent: 3.0,
        border: 1.0,
        radius: 4.0,
        padding_x: 4.0,
        padding_bottom: 2.0,
    };

    fn for_theme(mode: ThemeMode) -> Self {
        match mode {
            ThemeMode::Light => Self::LIGHT,
            ThemeMode::Dark => Self::DARK,
        }
    }
}

impl RichParagraphStyle {
    pub fn from_theme(mode: ThemeMode) -> Self {
        let theme = raw_tokens::theme(mode);
        let typography = &raw_tokens::TYPOGRAPHY;
        let color = |rgba: raw_tokens::Rgba| ui::rgba(rgba.to_u32()).into();
        let family = |stack: &'static str| {
            SharedString::from(stack.split(',').next().unwrap().trim_matches('"'))
        };
        let metrics = CodeBoxMetrics::for_theme(mode);
        Self {
            theme: mode.into(),
            font_family: family(typography.font_family),
            code_font_family: family(typography.font_code_family),
            font_size: typography.font_base_px,
            base_weight: FontWeight::NORMAL,
            line_height: typography.line_height_base_px,
            baseline_offset: None,
            letter_spacing: 0.,
            align: TextAlign::Left,
            text_color: color(theme.text_primary),
            link_color: color(theme.link),
            code_bg: color(theme.background_code_block),
            code_fg: color(theme.text_primary),
            code_font_size: typography.font_base_px - 3.,
            code_border: color(theme.border),
            code_border_width: metrics.border,
            code_radius: metrics.radius,
            code_padding_x: metrics.padding_x,
            code_padding_bottom: metrics.padding_bottom,
            code_baseline: metrics.baseline,
            code_descent: metrics.descent,
            reference_divider: color(theme.divider),
            icon_color: color(theme.icon),
            chip_bg: color(raw_tokens::Rgba::TRANSPARENT),
            chip_fg: color(theme.text_primary),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WrapAffinity {
    Upstream,
    Downstream,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CaretPosition {
    pub utf16_offset: u64,
    pub affinity: WrapAffinity,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DecorationKind {
    CodePill,
    ReferenceChip(InlineReference),
    ReferenceDivider,
    PageGlyph,
    Underline,
    Strikethrough,
    Link(String),
    /// Background of a highlighted run, painted behind its glyphs.
    Highlight,
}

#[derive(Clone, Debug)]
pub struct InlineDecoration {
    pub kind: DecorationKind,
    pub bounds: Bounds<Pixels>,
    pub source_utf16: Range<u64>,
    pub color: Hsla,
}

#[derive(Debug)]
struct Fragment {
    shaped: ShapedLine,
    x: Pixels,
}

#[derive(Debug)]
pub struct LaidOutRichLine {
    pub source_utf16: Range<u64>,
    /// Left edge of the line inside the layout width (non-zero for centered and
    /// right-aligned text).
    pub x: Pixels,
    pub width: Pixels,
    pub baseline_y: Pixels,
    pub top: Pixels,
    cells: Vec<GraphemeCell>,
    fragments: Vec<Fragment>,
}

/// Logical ends of a grapheme have decreasing x in an RTL run.
#[derive(Debug)]
struct GraphemeCell {
    source: Range<u64>,
    leading: Pixels,
    trailing: Pixels,
}

fn visual_ranges(cells: &[GraphemeCell], source: Range<u64>) -> Vec<Range<Pixels>> {
    let first = cells.partition_point(|cell| cell.source.end <= source.start);
    let mut ranges: Vec<_> = cells[first..]
        .iter()
        .take_while(|c| c.source.start < source.end)
        .map(|c| c.leading.min(c.trailing)..c.leading.max(c.trailing))
        .collect();
    ranges.sort_by_key(|r| r.start);
    let mut merged = Vec::<Range<Pixels>>::new();
    for range in ranges {
        if let Some(last) = merged.last_mut()
            && range.start <= last.end
        {
            last.end = last.end.max(range.end);
        } else {
            merged.push(range);
        }
    }
    merged
}

impl LaidOutRichLine {
    fn x_for_offset(&self, offset: u64) -> Pixels {
        self.cells
            .get(self.cells.partition_point(|c| c.source.end <= offset))
            .map(|c| c.leading)
            .or_else(|| self.cells.last().map(|c| c.trailing))
            .unwrap_or(self.x)
    }

    fn nearest_offset(&self, x: Pixels) -> u64 {
        self.cells
            .iter()
            .map(|c| (c.source.start, c.leading))
            .chain(std::iter::once((
                self.source_utf16.end,
                self.cells.last().map_or(self.x, |c| c.trailing),
            )))
            .min_by_key(|(_, pos)| (*pos - x).abs())
            .unwrap()
            .0
    }
}

#[derive(Debug)]
pub struct LaidOutRichParagraph {
    lines: Vec<LaidOutRichLine>,
    decorations: Vec<InlineDecoration>,
    style: RichParagraphStyle,
    size: Size<Pixels>,
    line_height: Pixels,
}

fn line_break_cluster(s: &str) -> bool {
    matches!(
        s,
        "\n" | "\r" | "\r\n" | "\u{000b}" | "\u{000c}" | "\u{0085}" | "\u{2028}" | "\u{2029}"
    )
}

struct ParagraphLayout<'a> {
    paragraph: &'a RichParagraph,
    style: &'a RichParagraphStyle,
    ts: &'a WindowTextSystem,
    limit: Pixels,
    line_height: Pixels,
    baseline: Pixels,
}

struct StyledFragment<'a> {
    spans: &'a [RichSpan],
    bytes: Range<usize>,
    shaped: ShapedLine,
    inset_start: Pixels,
    inset_end: Pixels,
}

impl StyledFragment<'_> {
    fn width(&self) -> Pixels {
        self.inset_start + self.shaped.width() + self.inset_end
    }

    fn cells(&self, index: &TextBiIndex, left: Pixels, right: Pixels) -> Vec<GraphemeCell> {
        let source = index.utf8_to_utf16(self.bytes.start)..index.utf8_to_utf16(self.bytes.end);
        if self.spans[0].chip {
            return vec![GraphemeCell {
                source,
                leading: left,
                trailing: right,
            }];
        }
        let origin = left + self.inset_start;
        let bounds = &index.graphemes;
        let mut clusters: Vec<_> = self
            .shaped
            .runs
            .iter()
            .flat_map(|r| &r.glyphs)
            .map(|g| {
                let i = bounds.partition_point(|b| b.byte <= self.bytes.start + g.index) - 1;
                (
                    bounds[i].byte.max(self.bytes.start),
                    (origin + g.position.x).clamp(left, right),
                )
            })
            .collect();
        clusters.sort_by_key(|&(byte, x)| (byte, x));
        clusters.dedup_by_key(|entry| entry.0);
        if clusters.is_empty() {
            clusters.push((self.bytes.start, left));
        }
        // First recover visual extents independent of the order in which the
        // platform enumerates glyphs. Then walk those extents in logical order.
        clusters.sort_by_key(|&(_, x)| x);
        clusters[0].1 = left;
        let mut edges: Vec<_> = clusters
            .iter()
            .enumerate()
            .map(|(i, &(byte, x))| {
                (
                    byte,
                    x,
                    clusters.get(i + 1).map_or(right, |&(_, next)| next),
                )
            })
            .collect();
        edges.sort_by_key(|&(byte, _, _)| byte);
        edges[0].0 = self.bytes.start;
        let levels =
            (!self.shaped.text.is_ascii()).then(|| BidiInfo::new(self.shaped.text.as_ref(), None));
        let mut cells = Vec::new();
        for (i, &(byte, mut start_x, mut end_x)) in edges.iter().enumerate() {
            let end = edges.get(i + 1).map_or(self.bytes.end, |c| c.0);
            if levels
                .as_ref()
                .is_some_and(|b| b.levels[byte - self.bytes.start].is_rtl())
            {
                std::mem::swap(&mut start_x, &mut end_x);
            }
            let first = bounds.partition_point(|b| b.byte <= byte);
            let last = bounds.partition_point(|b| b.byte <= end);
            let count = last - first;
            let mut leading = start_x;
            for (n, b) in bounds[first..last].iter().enumerate() {
                let trailing = if n + 1 == count {
                    end_x
                } else {
                    start_x + (end_x - start_x) * ((n + 1) as f32 / count as f32)
                };
                cells.push(GraphemeCell {
                    source: bounds[first + n - 1].utf16..b.utf16,
                    leading,
                    trailing,
                });
                leading = trailing;
            }
        }
        cells
    }
}

/// Ink of a span: reference and link colors win, then code, then a custom `color` mark.
fn span_color(style: &RichParagraphStyle, span: &RichSpan) -> Hsla {
    if span.chip {
        style.chip_fg
    } else if span.marks.link.is_some() {
        style.link_color
    } else if span.marks.code {
        style.code_fg
    } else {
        span.marks
            .color
            .as_deref()
            .and_then(|color| style.theme.css_color(color))
            .unwrap_or(style.text_color)
    }
}

impl ParagraphLayout<'_> {
    fn fragments(&self, from: usize, to: usize) -> impl Iterator<Item = StyledFragment<'_>> {
        let p = self.paragraph;
        let start = p.index.graphemes[from].byte;
        let end = p.index.graphemes[to].byte;
        let first = p.spans.partition_point(|s| s.source_bytes.end <= start);
        let last = p
            .spans
            .partition_point(|s| s.source_bytes.start < end)
            .max(first);
        let mut spans = &p.spans[first..last];
        std::iter::from_fn(move || {
            let first = spans.first()?;
            if start == end {
                return None;
            }
            let count = if first.chip || first.marks.code {
                1
            } else {
                spans
                    .iter()
                    .take_while(|s| !s.chip && !s.marks.code)
                    .count()
            };
            let group;
            (group, spans) = spans.split_at(count);
            let bytes = start.max(first.source_bytes.start)
                ..end.min(group.last().unwrap().source_bytes.end);
            let style = self.style;
            let text = if first.chip {
                &p.display[first.display_bytes.start + PAGE_PREFIX.len()..first.display_bytes.end]
            } else {
                &p.source[bytes.clone()]
            };
            let is_code = !first.chip && first.marks.code;
            let font_size = if is_code {
                style.code_font_size
            } else {
                style.font_size
            };
            let text_runs = group
                .iter()
                .map(|s| {
                    let mut font = ui::font(if is_code {
                        &style.code_font_family
                    } else {
                        &style.font_family
                    });
                    // CSS `bolder`: regular and medium text step to 700, heavier text to 900.
                    font.weight = if !s.marks.bold {
                        style.base_weight
                    } else if style.base_weight.0 <= 500.0 {
                        FontWeight::BOLD
                    } else {
                        FontWeight::BLACK
                    };
                    if s.marks.italic {
                        font.style = FontStyle::Italic;
                    }
                    let color = span_color(style, s);
                    let len = if s.chip {
                        text.len()
                    } else {
                        s.source_bytes.end.min(bytes.end) - s.source_bytes.start.max(bytes.start)
                    };
                    TextRun {
                        len,
                        font,
                        color,
                        ..Default::default()
                    }
                })
                .collect::<Vec<_>>();
            let shaped = self.ts.shape_line_with_spacing(
                text.to_owned().into(),
                px(font_size),
                &text_runs,
                style.letter_spacing,
            );
            let (inset_start, inset_end) = if first.chip {
                (px(font_size + 4.), px(2.))
            } else if is_code {
                let inset = px(style.code_padding_x + style.code_border_width);
                (inset, inset)
            } else {
                (Pixels::ZERO, Pixels::ZERO)
            };
            Some(StyledFragment {
                spans: group,
                bytes,
                shaped,
                inset_start,
                inset_end,
            })
        })
    }

    fn fits(&self, start: usize, end: usize) -> bool {
        self.fragments(start, end)
            .map(|f| f.width())
            .sum::<Pixels>()
            <= self.limit
    }

    /// Exponential search bounds the shaping work by the visible line length, even for long URLs.
    fn fit_end(&self, start: usize, end: usize) -> usize {
        if end - start <= 256 && self.fits(start, end) {
            return end;
        }
        let mut lo = start + 1;
        let mut step = 2usize;
        while lo < end {
            let mut hi = start.saturating_add(step).min(end);
            if self.fits(start, hi) {
                lo = hi;
                step = step.saturating_mul(2);
                continue;
            }
            while hi - lo > 1 {
                let mid = lo + (hi - lo) / 2;
                if self.fits(start, mid) {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            break;
        }
        lo
    }

    fn line(
        &self,
        start: usize,
        end: usize,
        top: Pixels,
        decorations: &mut Vec<InlineDecoration>,
    ) -> LaidOutRichLine {
        let index = &self.paragraph.index;
        let baseline_y = top + self.baseline;
        let first_decoration = decorations.len();
        let mut x = Pixels::ZERO;
        let mut fragments = Vec::new();
        let mut cells = Vec::new();
        for fragment in self.fragments(start, end) {
            let right = (x + fragment.width()).min(self.limit);
            let text_x = (x + fragment.inset_start).min(right);
            let fragment_cells = fragment.cells(index, x, right);
            for span in fragment.spans {
                let source = span
                    .source_utf16
                    .start
                    .max(index.utf8_to_utf16(fragment.bytes.start))
                    ..span
                        .source_utf16
                        .end
                        .min(index.utf8_to_utf16(fragment.bytes.end));
                for visual in visual_ranges(&fragment_cells, source.clone()) {
                    let width = visual.end - visual.start;
                    let rect = |y, h| Bounds::new(point(visual.start, y), size(width, h));
                    let mut decorate = |kind, bounds, color| {
                        decorations.push(InlineDecoration {
                            kind,
                            bounds,
                            color,
                            source_utf16: source.clone(),
                        })
                    };
                    let style = self.style;
                    let color = span_color(style, span);
                    if !span.chip
                        && let Some(highlight) = span
                            .marks
                            .background
                            .as_deref()
                            .and_then(|background| style.theme.css_color(background))
                    {
                        decorate(
                            DecorationKind::Highlight,
                            rect(top, self.line_height),
                            highlight,
                        );
                    }
                    if span.chip
                        && let Some(reference) = &span.marks.reference
                    {
                        decorate(
                            DecorationKind::ReferenceChip(reference.clone()),
                            rect(top, self.line_height),
                            style.chip_bg,
                        );
                        let icon_size = px(style.font_size).min(width);
                        decorate(
                            DecorationKind::PageGlyph,
                            Bounds::new(
                                point(
                                    visual.start,
                                    (top + (self.line_height - icon_size) * 0.5).floor(),
                                ),
                                size(icon_size, icon_size),
                            ),
                            style.icon_color,
                        );
                        decorate(
                            DecorationKind::ReferenceDivider,
                            Bounds::new(
                                point(text_x, baseline_y + px(2.)),
                                size(
                                    (right - fragment.inset_end - text_x).max(Pixels::ZERO),
                                    px(0.5),
                                ),
                            ),
                            style.reference_divider,
                        );
                    } else if span.marks.code {
                        decorate(
                            DecorationKind::CodePill,
                            rect(
                                baseline_y - px(style.code_baseline),
                                px(style.code_baseline
                                    + style.code_descent
                                    + style.code_padding_bottom
                                    + style.code_border_width),
                            ),
                            style.code_bg,
                        );
                    }
                    if let Some(link) = &span.marks.link {
                        decorate(
                            DecorationKind::Link(link.clone()),
                            rect(top, self.line_height),
                            color,
                        );
                    }
                    let stroke = |y| {
                        let a = visual.start.max(text_x);
                        let b = visual.end.min((right - fragment.inset_end).max(a));
                        Bounds::new(point(a, y), size((b - a).max(Pixels::ZERO), px(1.)))
                    };
                    if span.marks.underline {
                        decorate(
                            DecorationKind::Underline,
                            stroke(baseline_y + px(1.)),
                            color,
                        );
                    }
                    if span.marks.strike {
                        decorate(
                            DecorationKind::Strikethrough,
                            stroke(baseline_y - fragment.shaped.ascent * 0.32),
                            color,
                        );
                    }
                }
            }
            cells.extend(fragment_cells);
            fragments.push(Fragment {
                x: text_x,
                shaped: fragment.shaped,
            });
            x = right;
        }
        // The line was laid out from the left edge; move it to its aligned position. An
        // empty line keeps its caret there too.
        let free = (self.limit - x).max(Pixels::ZERO);
        let offset = match self.style.align {
            TextAlign::Left => Pixels::ZERO,
            TextAlign::Center => (free * 0.5).floor(),
            TextAlign::Right => free.floor(),
        };
        if offset > Pixels::ZERO {
            for fragment in &mut fragments {
                fragment.x += offset;
            }
            for cell in &mut cells {
                cell.leading += offset;
                cell.trailing += offset;
            }
            for decoration in &mut decorations[first_decoration..] {
                decoration.bounds.origin.x += offset;
            }
        }
        LaidOutRichLine {
            source_utf16: index.graphemes[start].utf16..index.graphemes[end].utf16,
            x: offset,
            width: x,
            baseline_y,
            top,
            cells,
            fragments,
        }
    }
}

impl RichParagraph {
    /// Byte offsets into `source` where a line may end. A reference breaks like an inline
    /// object (UAX #14 class CB) rather than like the space that stands for it in the
    /// document, so the words before it stay on their line when only the reference wraps.
    fn break_opportunities(&self) -> Vec<usize> {
        const OBJECT: char = '\u{fffc}';
        let mut text = String::with_capacity(self.source.len());
        let mut references = Vec::new();
        for span in &self.spans {
            if span.chip {
                references.push(text.len());
                text.push(OBJECT);
            } else {
                text.push_str(&self.source[span.source_bytes.clone()]);
            }
        }
        // Every reference is one source byte but `OBJECT.len_utf8()` bytes of `text`.
        let extra = OBJECT.len_utf8() - 1;
        linebreaks(&text)
            .map(|(byte, _)| byte - extra * references.partition_point(|&at| at < byte))
            .collect()
    }

    pub fn layout(
        &self,
        ts: &WindowTextSystem,
        style: &RichParagraphStyle,
        max_width: f32,
    ) -> LaidOutRichParagraph {
        let line_height = px(style.line_height.max(1.));
        let mut font = ui::font(style.font_family.clone());
        font.weight = style.base_weight;
        let id = ts.resolve_font(&font);
        let ascent = ts.ascent(id, px(style.font_size));
        let descent = ts.descent(id, px(style.font_size)).abs();
        let layout = ParagraphLayout {
            paragraph: self,
            style,
            ts,
            limit: px(max_width.max(0.)),
            line_height,
            baseline: style
                .baseline_offset
                .map(px)
                .unwrap_or_else(|| ((line_height + ascent - descent) / 2.).round()),
        };
        let breaks = self.break_opportunities();
        let mut lines = Vec::new();
        let mut decorations = Vec::new();
        let mut width = Pixels::ZERO;
        let mut top = Pixels::ZERO;
        let mut start = 0;
        let mut append = |a, b| {
            let line = layout.line(a, b, top, &mut decorations);
            width = width.max(line.x + line.width);
            lines.push(line);
            top += line_height;
        };
        let graphemes = &self.index.graphemes;
        for end in (0..self.index.grapheme_count())
            .filter(|&i| line_break_cluster(&self.source[graphemes[i].byte..graphemes[i + 1].byte]))
            .chain(std::iter::once(self.index.grapheme_count()))
        {
            if start == end {
                append(start, end);
            }
            while start < end {
                let fitted = layout.fit_end(start, end);
                let mut next = fitted;
                if fitted < end {
                    let i = breaks.partition_point(|&b| b <= graphemes[fitted].byte);
                    if let Some(&byte) = i.checked_sub(1).and_then(|j| breaks.get(j))
                        && byte > graphemes[start].byte
                        && let Ok(boundary) = graphemes.binary_search_by_key(&byte, |b| b.byte)
                    {
                        next = boundary;
                    }
                }
                append(start, next);
                start = next;
            }
            start = end + 1;
        }
        LaidOutRichParagraph {
            lines,
            decorations,
            style: style.clone(),
            size: size(width, top),
            line_height,
        }
    }
}

impl LaidOutRichParagraph {
    pub fn size(&self) -> Size<Pixels> {
        self.size
    }
    pub fn lines(&self) -> &[LaidOutRichLine] {
        &self.lines
    }
    pub fn inline_decorations(&self) -> &[InlineDecoration] {
        &self.decorations
    }

    pub fn line_height(&self) -> Pixels {
        self.line_height
    }

    /// Index of the line holding `position` and the caret's x on that line.
    pub fn caret_line_and_x(&self, position: CaretPosition) -> (usize, Pixels) {
        let offset = position.utf16_offset;
        let i = match position.affinity {
            WrapAffinity::Upstream => self.lines.partition_point(|l| l.source_utf16.end < offset),
            WrapAffinity::Downstream => self
                .lines
                .partition_point(|l| l.source_utf16.start <= offset)
                .saturating_sub(1),
        };
        let i = i.min(self.lines.len() - 1);
        (i, self.lines[i].x_for_offset(offset))
    }

    pub fn caret_rect(&self, position: CaretPosition) -> Bounds<Pixels> {
        let (line, x) = self.caret_line_and_x(position);
        Bounds::new(
            point(x, self.lines[line].top),
            size(px(1.), self.line_height),
        )
    }

    /// Paint the paragraph with its top-left corner at `origin`: decorations, the given
    /// selection fills, glyphs, strokes, then the given carets.
    pub fn paint_at(
        &self,
        origin: Point<Pixels>,
        selections: &[(Range<u64>, Hsla)],
        carets: &[(CaretPosition, Hsla)],
        hovered_link: Option<&Range<u64>>,
        window: &mut Window,
        cx: &mut App,
    ) {
        static PAGE_ICON: std::sync::OnceLock<IconPaint> = std::sync::OnceLock::new();
        let translated = |b: Bounds<Pixels>| Bounds::new(origin + b.origin, b.size);
        let style = &self.style;
        for d in &self.decorations {
            let bounds = translated(d.bounds);
            match &d.kind {
                DecorationKind::Highlight | DecorationKind::ReferenceChip(_) => {
                    window.paint_quad(fill(bounds, d.color));
                }
                DecorationKind::CodePill => window.paint_quad(
                    fill(bounds, d.color)
                        .corner_radii(px(style.code_radius))
                        .border_widths(px(style.code_border_width))
                        .border_color(style.code_border),
                ),
                DecorationKind::PageGlyph => PAGE_ICON
                    .get_or_init(|| IconPaint::named("LinkedPageIcon"))
                    .paint(bounds, d.color, window, cx),
                _ => {}
            }
        }
        for (range, color) in selections {
            for rect in self.selection_rects(range.start, range.end) {
                window.paint_quad(fill(translated(rect), *color));
            }
        }
        for line in &self.lines {
            for fragment in &line.fragments {
                let shaped = &fragment.shaped;
                let glyph_origin = origin + point(fragment.x, line.baseline_y - shaped.ascent);
                shaped
                    .paint(
                        glyph_origin,
                        shaped.ascent + shaped.descent,
                        TextAlign::Left,
                        None,
                        window,
                        cx,
                    )
                    .log_err();
            }
        }
        for d in &self.decorations {
            if matches!(
                d.kind,
                DecorationKind::Underline
                    | DecorationKind::Strikethrough
                    | DecorationKind::ReferenceDivider
            ) {
                window.paint_quad(fill(translated(d.bounds), d.color));
            } else if matches!(d.kind, DecorationKind::Link(_))
                && hovered_link
                    .is_some_and(|r| r.start < d.source_utf16.end && d.source_utf16.start < r.end)
            {
                let line = &self.lines[self
                    .lines
                    .partition_point(|line| line.top < d.bounds.origin.y)];
                let stroke = Bounds::new(
                    point(d.bounds.origin.x, line.baseline_y + px(1.)),
                    size(d.bounds.size.width, px(1.)),
                );
                window.paint_quad(fill(translated(stroke), d.color));
            }
        }
        self.paint_carets(origin, carets, window);
    }

    /// Paint only the carets, for callers that clip the paragraph but not its carets.
    pub fn paint_carets(
        &self,
        origin: Point<Pixels>,
        carets: &[(CaretPosition, Hsla)],
        window: &mut Window,
    ) {
        for (position, color) in carets {
            let rect = self.caret_rect(*position);
            window.paint_quad(fill(Bounds::new(origin + rect.origin, rect.size), *color));
        }
    }

    pub fn hit_test(&self, local_point: Point<Pixels>) -> CaretPosition {
        let i = self
            .lines
            .partition_point(|l| l.top + self.line_height <= local_point.y)
            .min(self.lines.len() - 1);
        let line = &self.lines[i];
        let offset = line.nearest_offset(local_point.x);
        let at_wrap_end = offset == line.source_utf16.end
            && self
                .lines
                .get(i + 1)
                .is_some_and(|next| next.source_utf16.start == offset);
        CaretPosition {
            utf16_offset: offset,
            affinity: if at_wrap_end {
                WrapAffinity::Upstream
            } else {
                WrapAffinity::Downstream
            },
        }
    }

    pub fn selection_rects(&self, a: u64, b: u64) -> Vec<Bounds<Pixels>> {
        let start = a.min(b);
        let end = a.max(b);
        if start == end {
            return Vec::new();
        }
        self.lines
            .iter()
            .flat_map(|line| {
                visual_ranges(&line.cells, start..end).into_iter().map(|r| {
                    Bounds::new(
                        point(r.start, line.top),
                        size(r.end - r.start, self.line_height),
                    )
                })
            })
            .collect()
    }
}

/// The caller can supply highlights and carets for any number of local or remote users.
pub struct RichParagraphElement {
    pub layout: Arc<LaidOutRichParagraph>,
    pub hovered_link: Option<Range<u64>>,
    pub selections: Vec<(Range<u64>, Hsla)>,
    pub carets: Vec<(CaretPosition, Hsla)>,
}

impl RichParagraphElement {
    pub fn new(layout: Arc<LaidOutRichParagraph>) -> Self {
        Self {
            layout,
            hovered_link: None,
            selections: Vec::new(),
            carets: Vec::new(),
        }
    }

    fn paint(self, bounds: Bounds<Pixels>, window: &mut Window, cx: &mut App) {
        let layout = &self.layout;
        // Glyphs and decorations stay inside the element; carets may sit on its edge.
        window.with_content_mask(Some(ui::ContentMask { bounds }), |window| {
            layout.paint_at(
                bounds.origin,
                &self.selections,
                &[],
                self.hovered_link.as_ref(),
                window,
                cx,
            );
        });
        layout.paint_carets(bounds.origin, &self.carets, window);
    }
}

impl IntoElement for RichParagraphElement {
    type Element = ui::Canvas<()>;

    fn into_element(self) -> Self::Element {
        let size = self.layout.size();
        canvas(
            |_, _, _| (),
            move |bounds, (), window, cx| self.paint(bounds, window, cx),
        )
        .w(size.width)
        .h(size.height)
    }
}

/// Shared fixture for comparing plain document text with its rendered marks.
#[cfg(feature = "harness")]
pub fn sample_paragraph() -> anyhow::Result<RichParagraph> {
    let plain = |s: &str| TextDeltaOp::Insert {
        insert: TextInsert::Text(s.into()),
        format: None,
    };
    let marked = |s: &str, key: &str, value: Any| TextDeltaOp::Insert {
        insert: TextInsert::Text(s.into()),
        format: Some([(key.into(), value)].into()),
    };
    let reference = Any::Object(Box::new(
        [
            ("type".into(), Any::String("LinkedPage".into())),
            ("pageId".into(), Any::String("release".into())),
        ]
        .into_iter()
        .collect(),
    ));
    RichParagraph::from_delta_with_resolver(
        vec![
            plain("The "),
            marked("release", "bold", Any::True),
            plain(" is ready when "),
            marked("cargo test", "code", Any::True),
            plain(" passes.\nStatus: "),
            marked("draft", "strike", Any::True),
            plain(" "),
            marked("approved", "italic", Any::True),
            plain(". Read the "),
            marked(
                "review notes",
                "link",
                Any::String("https://example.org/review".into()),
            ),
            plain(" or "),
            marked(" ", "reference", reference),
            plain("."),
        ],
        |id| (id == "release").then(|| "Release guide".to_owned()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::{
        schema::{BlockSpec, ParagraphType},
        session::PageDocSession,
    };
    use ui::{Application, HeadlessPlatform, Platform as _};

    fn insert(text: &str, format: Option<TextAttributes>) -> TextDeltaOp {
        TextDeltaOp::Insert {
            insert: TextInsert::Text(text.into()),
            format,
        }
    }

    #[test]
    fn text_bi_index_clamps_characters_and_moves_by_extended_grapheme() {
        let text = "A中😀👨‍👩‍👧‍👦";
        let index = TextBiIndex::new(text);
        assert_eq!((index.utf16_len(), index.grapheme_count()), (15, 4));
        for (byte, _) in text
            .char_indices()
            .chain(std::iter::once((text.len(), ' ')))
        {
            let expected = text[..byte].encode_utf16().count() as u64;
            assert_eq!(index.utf8_to_utf16(byte), expected);
            assert_eq!(index.utf16_to_utf8_clamped(expected), byte);
        }
        assert_eq!(index.utf16_to_utf8_clamped(3), "A中".len());
        assert_eq!(index.utf8_to_utf16(5), 2);
        assert_eq!(index.utf16_to_utf8_clamped(u64::MAX), text.len());
        assert_eq!(index.utf8_to_utf16(usize::MAX), 15);
        assert_eq!(index.prev_grapheme_utf16(15), 4);
        assert_eq!(index.next_grapheme_utf16(4), 15);
        for inside in 5..15 {
            assert_eq!(index.prev_grapheme_utf16(inside), 4);
            assert_eq!(index.snap_to_grapheme_boundary_utf16(inside), 4);
            assert_eq!(index.next_grapheme_utf16(inside), 15);
        }
        let empty = TextBiIndex::new("");
        assert_eq!(
            (empty.prev_grapheme_utf16(1), empty.next_grapheme_utf16(0)),
            (0, 0)
        );
    }

    #[test]
    fn document_delta_preserves_marks_and_atomic_reference_offsets() {
        let mut page = PageDocSession::new("test:rich", 17).unwrap();
        page.add_block(
            "p",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
            None,
            None,
            0,
        )
        .unwrap();
        let mut attrs: TextAttributes = ["bold", "italic", "underline", "strike", "code"]
            .into_iter()
            .map(|key| (key.into(), Any::True))
            .collect();
        attrs.insert("link".into(), Any::String("https://example.org".into()));
        attrs.insert("custom".into(), Any::Integer(42));
        let reference = Any::Object(Box::new(
            [
                ("type".into(), Any::String("LinkedPage".into())),
                ("pageId".into(), Any::String("page-x".into())),
                ("title".into(), Any::String("Reference title".into())),
            ]
            .into_iter()
            .collect(),
        ));
        page.apply_text_delta(
            "p",
            "prop:text",
            &[
                insert("😀", Some(attrs)),
                insert(" ", Some([("reference".into(), reference)].into())),
                insert("中", None),
            ],
            1,
        )
        .unwrap();
        let delta = page
            .inner()
            .read_text_delta(&y_octo::TypeTarget::Path(
                y_octo::TypePath::root("blocks").key("p").key("prop:text"),
            ))
            .unwrap();
        let para = RichParagraph::from_delta(delta.clone()).unwrap();
        assert_eq!(para.delta(), delta.as_slice());
        assert_eq!(para.source_text(), "😀 中");
        assert_eq!(para.display_text(), "😀▤ Reference title中");
        let marks = &para.spans()[0].marks;
        assert!(marks.bold && marks.italic && marks.underline && marks.strike && marks.code);
        assert_eq!(marks.link.as_deref(), Some("https://example.org"));
        let chip = &para.spans()[1];
        assert_eq!(chip.marks.reference.as_ref().unwrap().kind, "LinkedPage");
        assert_eq!(chip.source_utf16, 2..3);
        assert_eq!(para.display_byte_for_utf16(2), 4);
        assert_eq!(para.display_byte_for_utf16(3), 23);
        for i in 4..23 {
            assert_eq!(para.utf16_for_display_byte(i), 2);
        }
        assert_eq!(para.utf16_for_display_byte(23), 3);
    }

    #[test]
    fn wrapped_caret_hit_selection_spacing_and_emergency_breaks_share_geometry() {
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform)
            .run_embedded(|cx| crate::register_bundled_fonts(cx).unwrap());
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let style = RichParagraphStyle::default();
            let para = RichParagraph::from_delta(vec![insert(
                "link here https://example.org/averyveryveryveryverylongurl",
                None,
            )])
            .unwrap();
            let layout = para.layout(&ts, &style, 60.);
            assert!(layout.lines().len() > 4);
            assert!(layout.lines().iter().all(|line| line.width <= px(60.)));
            let first = &layout.lines()[0];
            assert_eq!(first.baseline_y, px(17.));
            let upstream = CaretPosition {
                utf16_offset: first.source_utf16.end,
                affinity: WrapAffinity::Upstream,
            };
            let downstream = CaretPosition {
                affinity: WrapAffinity::Downstream,
                ..upstream
            };
            let prev = layout.caret_rect(upstream);
            let next = layout.caret_rect(downstream);
            assert!(prev.origin.y < next.origin.y);
            assert_eq!(
                layout.hit_test(prev.origin + point(px(15.), px(2.))),
                upstream
            );
            assert_eq!(
                layout.hit_test(next.origin + point(px(0.), px(2.))),
                downstream
            );
            let rects = layout.selection_rects(0, para.index.utf16_len());
            assert_eq!(rects.len(), layout.lines().len());
            for (rect, line) in rects.iter().zip(layout.lines()) {
                assert_eq!(rect.size.width, line.width);
            }
            let heading = RichParagraphStyle {
                font_size: 28.,
                line_height: 36.,
                baseline_offset: Some(29.),
                ..style.clone()
            };
            assert!(
                para.layout(
                    &ts,
                    &RichParagraphStyle {
                        letter_spacing: -0.56,
                        ..heading.clone()
                    },
                    1000.
                )
                .size()
                .width
                    < para.layout(&ts, &heading, 1000.).size().width
            );
            assert_eq!(
                para.layout(&ts, &heading, 1000.).lines()[0].baseline_y,
                px(29.)
            );
            let breaks = RichParagraph::from_delta(vec![insert("a\r\n\n😀\n", None)])
                .unwrap()
                .layout(&ts, &style, 1.);
            assert_eq!(
                breaks
                    .lines()
                    .iter()
                    .map(|l| l.source_utf16.clone())
                    .collect::<Vec<_>>(),
                vec![0..1, 3..3, 4..6, 7..7]
            );
            assert!(breaks.size().width <= px(1.));
            for family in ["Inter", "IBM Plex Mono"] {
                assert!(
                    cx.text_system()
                        .all_font_names()
                        .iter()
                        .any(|name| name == family)
                );
            }
        });
    }

    #[test]
    fn themed_inline_geometry_matches_the_browser_oracle() {
        let oracle: serde_json::Value =
            serde_json::from_str(include_str!("../../../tokens/style-oracle.json")).unwrap();
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform)
            .run_embedded(|cx| crate::register_bundled_fonts(cx).unwrap());
        let para = RichParagraph::from_delta(vec![
            insert("code", Some([("code".into(), Any::True)].into())),
            insert(
                "link",
                Some([("link".into(), Any::String("url".into()))].into()),
            ),
        ])
        .unwrap();
        let css_color = |c: Hsla| {
            let c: ui::Rgba = c.into();
            format!(
                "rgb({}, {}, {})",
                (c.r * 255.).round(),
                (c.g * 255.).round(),
                (c.b * 255.).round()
            )
        };
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            for (mode, name) in [(ThemeMode::Light, "light"), (ThemeMode::Dark, "dark")] {
                let style = RichParagraphStyle::from_theme(mode);
                let formats = &oracle["themes"][name]["inline_formats"];
                let code = &formats["inline_code"]["computed"];
                assert_eq!(
                    css_color(style.code_bg),
                    code["background_color"].as_str().unwrap()
                );
                assert_eq!(
                    css_color(style.code_border),
                    code["border_top_color"].as_str().unwrap()
                );
                for (v, key) in [
                    (style.code_font_size, "font_size"),
                    (style.code_border_width, "border_top_width"),
                    (style.code_radius, "border_radius"),
                    (style.code_padding_x, "padding_left"),
                    (style.code_padding_x, "padding_right"),
                    (style.code_padding_bottom, "padding_bottom"),
                ] {
                    assert_eq!(format!("{v}px"), code[key].as_str().unwrap());
                }
                let layout = para.layout(&ts, &style, 300.);
                let pill = layout
                    .inline_decorations()
                    .iter()
                    .find(|d| d.kind == DecorationKind::CodePill)
                    .unwrap();
                assert_eq!(
                    layout.lines()[0].baseline_y - pill.bounds.origin.y,
                    px(formats["inline_code"]["baseline_offset_px"]
                        .as_f64()
                        .unwrap() as f32)
                );
                assert_eq!(
                    pill.bounds.size.height,
                    px(formats["inline_code"]["rect"]["height"].as_f64().unwrap() as f32)
                );
                assert_eq!(
                    css_color(style.link_color),
                    formats["link"]["computed"]["color"].as_str().unwrap()
                );
                assert_eq!(formats["link"]["computed"]["text_decoration_line"], "none");
                assert!(
                    layout
                        .inline_decorations()
                        .iter()
                        .all(|d| d.kind != DecorationKind::Underline)
                );
                assert_eq!(style.chip_bg.a, 0.);
            }
        });
    }

    #[test]
    fn code_box_constants_match_the_browser_oracle() {
        let oracle: serde_json::Value =
            serde_json::from_str(include_str!("../../../tokens/style-oracle.json")).unwrap();
        for (mode, name) in [(ThemeMode::Light, "light"), (ThemeMode::Dark, "dark")] {
            let node = &oracle["themes"][name]["inline_formats"]["inline_code"];
            let css = |property: &str| -> f32 {
                node["computed"][property]
                    .as_str()
                    .and_then(|s| s.strip_suffix("px"))
                    .and_then(|v| v.parse().ok())
                    .unwrap_or_else(|| panic!("{name} inline code {property} is a pixel measure"))
            };
            let baseline = node["baseline_offset_px"].as_f64().unwrap() as f32;
            let height = node["rect"]["height"].as_f64().unwrap() as f32;
            let border = css("border_top_width");
            let padding_bottom = css("padding_bottom");
            assert_eq!(
                CodeBoxMetrics::for_theme(mode),
                CodeBoxMetrics {
                    baseline,
                    descent: height - baseline - padding_bottom - border,
                    border,
                    radius: css("border_radius"),
                    padding_x: css("padding_left"),
                    padding_bottom,
                },
                "{name} inline code box"
            );
        }
    }

    #[test]
    fn marks_resolve_colors_highlights_and_css_bolder() {
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform)
            .run_embedded(|cx| crate::register_bundled_fonts(cx).unwrap());
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let style = RichParagraphStyle::default();
            let colored = |key: &str, value: &str| {
                insert(
                    "mark",
                    Some([(key.into(), Any::String(value.into()))].into()),
                )
            };
            let para = RichParagraph::from_delta(vec![
                colored("background", "var(--affine-text-highlight-orange)"),
                insert(" ", None),
                colored("color", "var(--affine-text-highlight-foreground-blue)"),
                insert(" ", None),
                colored("background", "not-a-color"),
            ])
            .unwrap();
            assert_eq!(
                para.spans()[0].marks.background.as_deref(),
                Some("var(--affine-text-highlight-orange)")
            );
            let layout = para.layout(&ts, &style, 300.);
            let highlights: Vec<_> = layout
                .inline_decorations()
                .iter()
                .filter(|d| d.kind == DecorationKind::Highlight)
                .collect();
            // Only a color the theme can resolve becomes a highlight.
            assert_eq!(highlights.len(), 1);
            assert_eq!(highlights[0].source_utf16, 0..4);
            assert_eq!(
                Some(highlights[0].color),
                style.theme.css_var("--affine-text-highlight-orange")
            );
            assert_eq!(highlights[0].bounds.size.height, layout.line_height());
            assert_eq!(
                span_color(&style, &para.spans()[2]),
                style
                    .theme
                    .css_var("--affine-text-highlight-foreground-blue")
                    .unwrap()
            );
            assert_eq!(span_color(&style, &para.spans()[0]), style.text_color);

            // `bolder` widens regular text to 700 and heading weights to 900.
            let bold = RichParagraph::from_delta(vec![insert(
                "Bolder",
                Some([("bold".into(), Any::True)].into()),
            )])
            .unwrap();
            let width = |base_weight| {
                let style = RichParagraphStyle {
                    base_weight,
                    ..RichParagraphStyle::default()
                };
                bold.layout(&ts, &style, 300.).size().width
            };
            let mut font = ui::font("Inter");
            let mut plain_width = |weight| {
                font.weight = weight;
                let run = TextRun {
                    len: 6,
                    font: font.clone(),
                    color: style.text_color,
                    ..Default::default()
                };
                ts.shape_line("Bolder".into(), px(style.font_size), &[run], None)
                    .width()
            };
            assert_eq!(width(FontWeight::NORMAL), plain_width(FontWeight::BOLD));
            assert_eq!(width(FontWeight::SEMIBOLD), plain_width(FontWeight::BLACK));
        });
    }

    #[test]
    fn reference_title_resolution_preserves_document_identity() {
        let reference = |title: Option<&str>| {
            let mut attrs = vec![
                ("type".into(), Any::String("LinkedPage".into())),
                ("pageId".into(), Any::String("doc:abc".into())),
            ];
            if let Some(s) = title {
                attrs.push(("title".into(), Any::String(s.into())));
            }
            vec![insert(
                " ",
                Some(
                    [(
                        "reference".into(),
                        Any::Object(Box::new(attrs.into_iter().collect())),
                    )]
                    .into(),
                ),
            )]
        };
        for (stored, resolved, expected) in [
            (Some("Saved"), Some("Initial Title"), "Initial Title"),
            (Some("Saved"), Some("Renamed Page"), "Renamed Page"),
            (Some("Saved"), Some(""), "Saved"),
            (Some(""), None, "Untitled"),
            (None, None, "Untitled"),
        ] {
            let delta = reference(stored);
            let p = RichParagraph::from_delta_with_resolver(delta.clone(), |id| {
                assert_eq!(id, "doc:abc");
                resolved.map(str::to_owned)
            })
            .unwrap();
            assert_eq!(p.display_text(), format!("{PAGE_PREFIX}{expected}"));
            assert_eq!(p.spans()[0].source_utf16, 0..1);
            assert_eq!(p.delta(), delta);
        }
    }

    #[test]
    fn a_wrapping_reference_leaves_the_words_before_it_on_their_line() {
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform)
            .run_embedded(|cx| crate::register_bundled_fonts(cx).unwrap());
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let style = RichParagraphStyle::default();
            let reference = Any::Object(Box::new(
                [
                    ("type".into(), Any::String("LinkedPage".into())),
                    ("pageId".into(), Any::String("doc:abc".into())),
                    ("title".into(), Any::String("Edgeless notes".into())),
                ]
                .into_iter()
                .collect(),
            ));
            let prefix = "Reference such as ";
            let at = prefix.len() as u64;
            let para = RichParagraph::from_delta(vec![
                insert(prefix, None),
                insert(" ", Some([("reference".into(), reference)].into())),
                insert(". Next", None),
            ])
            .unwrap();
            let chip = para.layout(&ts, &style, 2000.).selection_rects(at, at + 1)[0];
            // Wide enough for the words or for the reference, but not for both.
            let width = f32::from(chip.origin.x + chip.size.width * 0.5);
            let layout = para.layout(&ts, &style, width);
            let lines = layout.lines();
            assert_eq!(lines[0].source_utf16, 0..at);
            // The reference starts the next line and keeps its closing punctuation.
            assert_eq!(lines[1].source_utf16.start, at);
            assert!(lines[1].source_utf16.end > at + 1);
        });
    }

    #[test]
    fn centered_and_right_aligned_lines_move_glyphs_carets_and_decorations_together() {
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform)
            .run_embedded(|cx| crate::register_bundled_fonts(cx).unwrap());
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let limit = 120.;
            let para = RichParagraph::from_delta(vec![
                insert("Aligned ", None),
                insert("code", Some([("code".into(), Any::True)].into())),
                insert(" wraps over several lines", None),
            ])
            .unwrap();
            let left = para.layout(&ts, &RichParagraphStyle::default(), limit);
            assert!(left.lines().len() > 2);
            for align in [TextAlign::Center, TextAlign::Right] {
                let style = RichParagraphStyle {
                    align,
                    ..RichParagraphStyle::default()
                };
                let layout = para.layout(&ts, &style, limit);
                assert_eq!(layout.lines().len(), left.lines().len());
                for (line, reference) in layout.lines().iter().zip(left.lines()) {
                    assert_eq!(line.source_utf16, reference.source_utf16);
                    assert_eq!(line.width, reference.width);
                    let free = px(limit) - line.width;
                    let expected = match align {
                        TextAlign::Right => free.floor(),
                        _ => (free * 0.5).floor(),
                    };
                    assert_eq!(line.x, expected);
                    assert!(line.x + line.width <= px(limit));
                    // Carets, selections and hit testing follow the moved line.
                    let start = CaretPosition {
                        utf16_offset: line.source_utf16.start,
                        affinity: WrapAffinity::Downstream,
                    };
                    assert_eq!(layout.caret_rect(start).origin.x, line.x);
                    let hit = layout.hit_test(point(line.x, line.top + px(1.)));
                    assert_eq!(hit.utf16_offset, line.source_utf16.start);
                }
                let pill = |layout: &LaidOutRichParagraph| {
                    layout
                        .inline_decorations()
                        .iter()
                        .find(|d| d.kind == DecorationKind::CodePill)
                        .unwrap()
                        .bounds
                };
                assert_eq!(
                    pill(&layout).origin.x,
                    pill(&left).origin.x + layout.lines()[0].x
                );
                assert_eq!(layout.size().width.max(px(limit)), px(limit));

                // An empty paragraph keeps its caret at the aligned edge.
                let empty = RichParagraph::from_delta(Vec::new())
                    .unwrap()
                    .layout(&ts, &style, limit);
                let caret = empty.caret_rect(CaretPosition {
                    utf16_offset: 0,
                    affinity: WrapAffinity::Downstream,
                });
                assert_eq!(
                    caret.origin.x,
                    match align {
                        TextAlign::Right => px(limit),
                        _ => px(limit * 0.5),
                    }
                );
            }
        });
    }

    #[test]
    fn paint_only_marks_keep_av_kerning_and_carets() {
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform)
            .run_embedded(|cx| crate::register_bundled_fonts(cx).unwrap());
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let style = RichParagraphStyle::default();
            let layout = |ops| {
                RichParagraph::from_delta(ops)
                    .unwrap()
                    .layout(&ts, &style, 20.)
            };
            let plain = layout(vec![insert("AV", None)]);
            assert_eq!(plain.lines().len(), 1);
            for attr in [
                ("underline", Any::True),
                ("link", Any::String("url".into())),
            ] {
                let marked = layout(vec![
                    insert("A", None),
                    insert("V", Some([(attr.0.into(), attr.1)].into())),
                ]);
                assert_eq!(marked.lines().len(), 1);
                assert_eq!(marked.size(), plain.size());
                for offset in 0..=2 {
                    let pos = CaretPosition {
                        utf16_offset: offset,
                        affinity: WrapAffinity::Downstream,
                    };
                    assert_eq!(marked.caret_rect(pos), plain.caret_rect(pos));
                }
                let d = marked.inline_decorations().first().unwrap();
                assert_eq!(d.source_utf16, 1..2);
                assert_eq!(
                    d.bounds.size.width,
                    marked.selection_rects(1, 2)[0].size.width
                );
            }
        });
    }

    #[test]
    fn rtl_graphemes_have_visual_edges_in_pure_and_mixed_lines() {
        let platform = HeadlessPlatform::new(128, 64, 1.);
        let app = Application::with_platform(platform)
            .run_embedded(|cx| crate::register_bundled_fonts(cx).unwrap());
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            for (text, i) in [("אב", 0), ("Hi אב", 3)] {
                let p = RichParagraph::from_delta(vec![insert(text, None)]).unwrap();
                let layout = p.layout(&ts, &RichParagraphStyle::default(), 128.);
                let caret = |n| CaretPosition {
                    utf16_offset: n,
                    affinity: WrapAffinity::Downstream,
                };
                let edge = |n| layout.caret_rect(caret(n)).origin.x;
                assert!(
                    edge(i) > edge(i + 1) && edge(i + 1) > edge(i + 2),
                    "{text}: {:?}",
                    layout.lines()[0].cells
                );
                for n in 0..p.index().utf16_len() {
                    assert!(layout.selection_rects(n, n + 1)[0].size.width > px(0.));
                }
                for n in 0..=p.index().utf16_len() {
                    assert_eq!(
                        layout.hit_test(layout.caret_rect(caret(n)).origin),
                        caret(n),
                        "{text}"
                    );
                }
                if i > 0 {
                    assert!(edge(0) < edge(1));
                }
            }
        });
    }

    struct InlineSample(Arc<LaidOutRichParagraph>);

    impl ui::Render for InlineSample {
        fn render(&mut self, _: &mut Window, _: &mut ui::Context<Self>) -> impl IntoElement {
            let mut element = RichParagraphElement::new(self.0.clone());
            element.selections.push((0..1, ui::rgb(0xddffdd).into()));
            element.carets.push((
                CaretPosition {
                    utf16_offset: 0,
                    affinity: WrapAffinity::Downstream,
                },
                ui::rgb(0xff0000).into(),
            ));
            element
        }
    }

    #[test]
    fn inline_pills_links_selections_and_carets_paint_from_layout() {
        use ui::AppContext as _;
        let platform = HeadlessPlatform::new(320, 64, 1.);
        let app = Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
            let reference = Any::Object(Box::new(
                [
                    ("type".into(), Any::String("Subpage".into())),
                    ("pageId".into(), Any::String("Home".into())),
                ]
                .into_iter()
                .collect(),
            ));
            let para = RichParagraph::from_delta(vec![
                insert("A ", None),
                insert(
                    "code",
                    Some([("code".into(), Any::True), ("strike".into(), Any::True)].into()),
                ),
                insert(
                    "link",
                    Some([("link".into(), Any::String("https://example.org".into()))].into()),
                ),
                insert(" ", Some([("reference".into(), reference)].into())),
            ])
            .unwrap();
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let style = RichParagraphStyle::default();
            let layout = Arc::new(para.layout(&ts, &style, 320.));
            let decorations = layout.inline_decorations();
            let code = decorations
                .iter()
                .find(|d| d.kind == DecorationKind::CodePill)
                .unwrap();
            assert_eq!(code.source_utf16, 2..6);
            assert!(
                decorations
                    .iter()
                    .any(|d| d.kind == DecorationKind::Strikethrough)
            );
            assert!(decorations.iter().any(
                    |d| matches!(d.kind, DecorationKind::Link(_)) && d.source_utf16 == (6..10)
                ));
            assert!(
                !decorations
                    .iter()
                    .any(|d| d.kind == DecorationKind::Underline)
            );
            let chip = decorations
                .iter()
                .find(|d| matches!(d.kind, DecorationKind::ReferenceChip(_)))
                .unwrap();
            assert_eq!(chip.source_utf16, 10..11);
            let rect = layout.selection_rects(10, 11)[0];
            assert_eq!(rect.origin.x, chip.bounds.origin.x);
            assert_eq!(rect.size.width, chip.bounds.size.width);
            assert_eq!(
                layout
                    .hit_test(rect.origin + point(rect.size.width * 0.75, px(1.)))
                    .utf16_offset,
                11
            );
            cx.open_window(
                ui::WindowOptions {
                    window_bounds: Some(ui::WindowBounds::Windowed(Bounds::new(
                        point(px(0.), px(0.)),
                        size(px(320.), px(64.)),
                    ))),
                    ..Default::default()
                },
                |_, cx| cx.new(|_| InlineSample(layout)),
            )
            .unwrap();
        });
        platform.windows()[0].request_frame();
        app.update(|cx| {
            let view = cx.windows()[0].downcast::<InlineSample>().unwrap();
            view.update(cx, |_, window, _| {
                let scene = window.rendered_scene();
                assert!(scene.monochrome_sprites.len() >= 8);
                let image = window.render_to_image().unwrap();
                assert!(
                    image.pixels().any(|p| p.0 == [255, 0, 0, 255]),
                    "caret should paint over the selection"
                );
                assert!(
                    image.pixels().any(|p| p.0 == [221, 255, 221, 255]),
                    "selection fill should be visible"
                );
            })
            .unwrap();
        });
    }

    #[test]
    fn variable_font_italic_slants_rasterized_glyph_ink() {
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform.clone())
            .run_embedded(|cx| crate::register_bundled_fonts(cx).unwrap());
        app.update(|cx| {
            let system = platform.text_system();
            let measure = |style| {
                let mut font = ui::font("Inter");
                font.style = style;
                let font_id = cx.text_system().resolve_font(&font);
                let text = "Native BlockSuite";
                let font_size = px(24.);
                let line = system.layout_line(
                    text,
                    font_size,
                    &[ui::FontRun {
                        len: text.len(),
                        font_id,
                    }],
                );
                let mut moments = [0.; 2];
                let mut masses = [0.; 2];
                for run in line.runs {
                    for glyph in run.glyphs {
                        if text.as_bytes()[glyph.index] == b' ' {
                            continue;
                        }
                        let params = ui::RenderGlyphParams {
                            font_id: run.font_id,
                            glyph_id: glyph.id,
                            font_size,
                            subpixel_variant: point(0, 0),
                            scale_factor: 1.,
                            is_emoji: false,
                            subpixel_rendering: false,
                            dilation: 0,
                        };
                        let bounds = system.glyph_raster_bounds(&params).unwrap();
                        let (size, mask) = system.rasterize_glyph(&params, bounds).unwrap();
                        let w = size.width.0 as usize;
                        let h = size.height.0 as usize;
                        assert_eq!(mask.len(), w * h);
                        for (i, alpha) in mask.into_iter().enumerate() {
                            let half = usize::from(i / w >= h / 2);
                            let x = bounds.origin.x.0 as f64 + (i % w) as f64;
                            masses[half] += f64::from(alpha);
                            moments[half] += x * f64::from(alpha);
                        }
                    }
                }
                assert!(masses.into_iter().all(|m| m > 0.));
                moments[0] / masses[0] - moments[1] / masses[1]
            };
            let normal = measure(FontStyle::Normal);
            let italic = measure(FontStyle::Italic);
            assert!(
                italic > normal + 0.5,
                "top-minus-bottom ink centroids: italic {italic}, upright {normal}"
            );
        });
    }
}
