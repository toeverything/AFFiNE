use std::ops::Range;

use ui::{
    Bounds, FontStyle, FontWeight, Hsla, Pixels, Point, ShapedLine, Size, TextAlign, TextRun,
    WindowTextSystem, point, px, size,
};
use unicode_bidi::BidiInfo;
use unicode_linebreak::linebreaks;

use super::{
    CaretPosition, DecorationKind, InlineDecoration, PAGE_PREFIX, RichParagraph,
    RichParagraphStyle, RichSpan, TextBiIndex, WrapAffinity,
};

#[derive(Debug)]
pub(super) struct Fragment {
    pub(super) shaped: ShapedLine,
    pub(super) x: Pixels,
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
    pub(super) fragments: Vec<Fragment>,
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
    pub(super) lines: Vec<LaidOutRichLine>,
    pub(super) decorations: Vec<InlineDecoration>,
    pub(super) style: RichParagraphStyle,
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
        let bounds = index.graphemes();
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
        let graphemes = p.index.graphemes();
        let start = graphemes[from].byte;
        let end = graphemes[to].byte;
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
                let raw = &p.display[first.display_bytes.clone()];
                if first.marks.reference.is_some() {
                    raw.strip_prefix(PAGE_PREFIX).unwrap_or(raw)
                } else {
                    raw
                }
            } else {
                &p.source[bytes.clone()]
            };
            let is_code = !first.chip && first.marks.code;
            let is_latex = first.chip && first.marks.latex.is_some();
            let font_size = if is_code || is_latex {
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
            let (inset_start, inset_end) = if first.chip && first.marks.reference.is_some() {
                (px(font_size + 4.), px(2.))
            } else if is_code || is_latex {
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
                    } else if span.chip
                        && let Some(latex) = &span.marks.latex
                    {
                        decorate(
                            DecorationKind::LatexChip(latex.clone()),
                            rect(
                                baseline_y - px(style.code_baseline),
                                px(style.code_baseline
                                    + style.code_descent
                                    + style.code_padding_bottom
                                    + style.code_border_width),
                            ),
                            style.code_bg,
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
        let graphemes = index.graphemes();
        LaidOutRichLine {
            source_utf16: graphemes[start].utf16..graphemes[end].utf16,
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
        let graphemes = self.index.graphemes();
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theme::ThemeMode;
    use ui::{Application, HeadlessPlatform};
    use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

    fn insert(text: &str, format: Option<TextAttributes>) -> TextDeltaOp {
        TextDeltaOp::Insert {
            insert: TextInsert::Text(text.into()),
            format,
        }
    }

    /// Runs every layout, wrapping, alignment, mark, oracle, kerning, and bidi assertion
    /// inside a single `HeadlessPlatform` + font-registration session.
    #[test]
    fn rich_paragraph_layout_geometry_marks_alignment_and_bidi_invariants() {
        let oracle: serde_json::Value =
            serde_json::from_str(include_str!("../../../oracle/style-oracle.json")).unwrap();
        let platform = HeadlessPlatform::new(128, 64, 1.);
        let app = Application::with_platform(platform)
            .run_embedded(|cx| crate::register_bundled_fonts(cx).unwrap());
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let style = RichParagraphStyle::default();

            // 1. Wrapping, caret affinity, hit-testing, selection, letter-spacing & emergency breaks.
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

            // 2. Themed inline code & link geometry against the browser oracle (Light & Dark).
            let inline_para = RichParagraph::from_delta(vec![
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
            for (mode, name) in [(ThemeMode::Light, "light"), (ThemeMode::Dark, "dark")] {
                let themed = RichParagraphStyle::from_theme(mode);
                let formats = &oracle["themes"][name]["inline_formats"];
                let code = &formats["inline_code"]["computed"];
                assert_eq!(
                    css_color(themed.code_bg),
                    code["background_color"].as_str().unwrap()
                );
                assert_eq!(
                    css_color(themed.code_border),
                    code["border_top_color"].as_str().unwrap()
                );
                for (v, key) in [
                    (themed.code_font_size, "font_size"),
                    (themed.code_border_width, "border_top_width"),
                    (themed.code_radius, "border_radius"),
                    (themed.code_padding_x, "padding_left"),
                    (themed.code_padding_x, "padding_right"),
                    (themed.code_padding_bottom, "padding_bottom"),
                ] {
                    assert_eq!(format!("{v}px"), code[key].as_str().unwrap());
                }
                let layout = inline_para.layout(&ts, &themed, 300.);
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
                    css_color(themed.link_color),
                    formats["link"]["computed"]["color"].as_str().unwrap()
                );
                assert_eq!(formats["link"]["computed"]["text_decoration_line"], "none");
                assert!(
                    layout
                        .inline_decorations()
                        .iter()
                        .all(|d| d.kind != DecorationKind::Underline)
                );
                assert_eq!(themed.chip_bg.a, 0.);
            }

            // 3. Color/highlight resolution and CSS `bolder` weight stepping.
            let colored = |key: &str, value: &str| {
                insert(
                    "mark",
                    Some([(key.into(), Any::String(value.into()))].into()),
                )
            };
            let marked_para = RichParagraph::from_delta(vec![
                colored("background", "var(--affine-text-highlight-orange)"),
                insert(" ", None),
                colored("color", "var(--affine-text-highlight-foreground-blue)"),
                insert(" ", None),
                colored("background", "not-a-color"),
            ])
            .unwrap();
            assert_eq!(
                marked_para.spans()[0].marks.background.as_deref(),
                Some("var(--affine-text-highlight-orange)")
            );
            let layout = marked_para.layout(&ts, &style, 300.);
            let highlights: Vec<_> = layout
                .inline_decorations()
                .iter()
                .filter(|d| d.kind == DecorationKind::Highlight)
                .collect();
            assert_eq!(highlights.len(), 1);
            assert_eq!(highlights[0].source_utf16, 0..4);
            assert_eq!(
                Some(highlights[0].color),
                style.theme.css_var("--affine-text-highlight-orange")
            );
            assert_eq!(highlights[0].bounds.size.height, layout.line_height());
            assert_eq!(
                span_color(&style, &marked_para.spans()[2]),
                style
                    .theme
                    .css_var("--affine-text-highlight-foreground-blue")
                    .unwrap()
            );
            assert_eq!(
                span_color(&style, &marked_para.spans()[0]),
                style.text_color
            );
            let bold = RichParagraph::from_delta(vec![insert(
                "Bolder",
                Some([("bold".into(), Any::True)].into()),
            )])
            .unwrap();
            let bold_width = |base_weight| {
                let s = RichParagraphStyle {
                    base_weight,
                    ..RichParagraphStyle::default()
                };
                bold.layout(&ts, &s, 300.).size().width
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
            for (base, expected) in [
                (FontWeight::NORMAL, FontWeight::BOLD),
                (FontWeight::SEMIBOLD, FontWeight::BLACK),
            ] {
                assert_eq!(bold_width(base), plain_width(expected));
            }

            // 4. Inline reference wraps as an atomic object leaving preceding words on their line.
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
            let ref_para = RichParagraph::from_delta(vec![
                insert(prefix, None),
                insert(" ", Some([("reference".into(), reference)].into())),
                insert(". Next", None),
            ])
            .unwrap();
            let chip = ref_para
                .layout(&ts, &style, 2000.)
                .selection_rects(at, at + 1)[0];
            let ref_width = f32::from(chip.origin.x + chip.size.width * 0.5);
            let ref_layout = ref_para.layout(&ts, &style, ref_width);
            assert_eq!(ref_layout.lines()[0].source_utf16, 0..at);
            assert_eq!(ref_layout.lines()[1].source_utf16.start, at);
            assert!(ref_layout.lines()[1].source_utf16.end > at + 1);

            // 5. Center & right alignment move glyphs, carets, and decorations together.
            let limit = 120.;
            let aligned_para = RichParagraph::from_delta(vec![
                insert("Aligned ", None),
                insert("code", Some([("code".into(), Any::True)].into())),
                insert(" wraps over several lines", None),
            ])
            .unwrap();
            let left = aligned_para.layout(&ts, &style, limit);
            assert!(left.lines().len() > 2);
            for align in [TextAlign::Center, TextAlign::Right] {
                let aligned_style = RichParagraphStyle {
                    align,
                    ..RichParagraphStyle::default()
                };
                let layout = aligned_para.layout(&ts, &aligned_style, limit);
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
                let empty = RichParagraph::from_delta(Vec::new()).unwrap().layout(
                    &ts,
                    &aligned_style,
                    limit,
                );
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

            // 6. Paint-only marks preserve AV kerning and carets.
            let kern_layout = |ops| {
                RichParagraph::from_delta(ops)
                    .unwrap()
                    .layout(&ts, &style, 20.)
            };
            let plain = kern_layout(vec![insert("AV", None)]);
            assert_eq!(plain.lines().len(), 1);
            for attr in [
                ("underline", Any::True),
                ("link", Any::String("url".into())),
            ] {
                let marked = kern_layout(vec![
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

            // 7. RTL graphemes have decreasing visual edges in pure and mixed lines.
            for (text, i) in [("אב", 0), ("Hi אב", 3)] {
                let p = RichParagraph::from_delta(vec![insert(text, None)]).unwrap();
                let layout = p.layout(&ts, &style, 128.);
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

            // 8. Inline latex chips (populated, empty, mixed with inline code and references).
            let mixed_ref = Any::Object(Box::new(
                [
                    ("type".into(), Any::String("LinkedPage".into())),
                    ("pageId".into(), Any::String("doc:math".into())),
                    ("title".into(), Any::String("Algebra".into())),
                ]
                .into_iter()
                .collect(),
            ));
            let latex_cases: [(&str, Vec<TextDeltaOp>, usize, usize, &str); 5] = [
                (
                    "simple inline latex",
                    vec![
                        insert("m ", None),
                        insert(
                            " ",
                            Some([("latex".into(), Any::String("x".into()))].into()),
                        ),
                        insert(" ", None),
                    ],
                    1,
                    0,
                    "m x ",
                ),
                (
                    "latex starting with PAGE_PREFIX keeps literal text",
                    vec![insert(
                        " ",
                        Some([("latex".into(), Any::String(format!("{PAGE_PREFIX}x")))].into()),
                    )],
                    1,
                    0,
                    PAGE_PREFIX,
                ),
                (
                    "mixed inline latex and code",
                    vec![
                        insert("m ", None),
                        insert(
                            " ",
                            Some([("latex".into(), Any::String("x^2".into()))].into()),
                        ),
                        insert(" c ", None),
                        insert("k", Some([("code".into(), Any::True)].into())),
                        insert(" e", None),
                    ],
                    2,
                    0,
                    "m x^2 c k e",
                ),
                (
                    "empty inline latex displays Equation",
                    vec![
                        insert(" ", Some([("latex".into(), Any::String("".into()))].into())),
                        insert(" ", None),
                    ],
                    1,
                    0,
                    "Equation ",
                ),
                (
                    "mixed reference chip and inline latex chip",
                    vec![
                        insert("See ", None),
                        insert(" ", Some([("reference".into(), mixed_ref)].into())),
                        insert(" for ", None),
                        insert(
                            " ",
                            Some([("latex".into(), Any::String("a+b".into()))].into()),
                        ),
                    ],
                    1,
                    1,
                    "See ",
                ),
            ];
            for (name, ops, expected_pills, expected_refs, display_prefix) in latex_cases {
                let para = RichParagraph::from_delta(ops).unwrap();
                assert!(
                    para.display_text().starts_with(display_prefix),
                    "{name}: display {:?}",
                    para.display_text()
                );
                let layout = para.layout(&ts, &style, 480.);
                assert_eq!(
                    layout
                        .inline_decorations()
                        .iter()
                        .filter(|d| matches!(
                            d.kind,
                            DecorationKind::CodePill | DecorationKind::LatexChip(_)
                        ))
                        .count(),
                    expected_pills,
                    "{name}: pill/latex chip count"
                );
                assert_eq!(
                    layout
                        .inline_decorations()
                        .iter()
                        .filter(|d| matches!(d.kind, DecorationKind::ReferenceChip(_)))
                        .count(),
                    expected_refs,
                    "{name}: ReferenceChip count"
                );
                assert_eq!(
                    layout
                        .inline_decorations()
                        .iter()
                        .filter(|d| d.kind == DecorationKind::PageGlyph)
                        .count(),
                    expected_refs,
                    "{name}: PageGlyph count"
                );
                let len = para.index().utf16_len();
                for offset in 0..=len {
                    let pos = CaretPosition {
                        utf16_offset: offset,
                        affinity: WrapAffinity::Downstream,
                    };
                    let rect = layout.caret_rect(pos);
                    let hit = layout.hit_test(rect.origin + point(px(0.), px(2.)));
                    assert!(hit.utf16_offset <= len, "{name}: hit out of range");
                }
                for offset in 0..len {
                    let rects = layout.selection_rects(offset, offset + 1);
                    assert!(!rects.is_empty(), "{name}: selection rect at {offset}");
                    assert!(rects[0].size.width > px(0.), "{name}: non-zero width");
                }
            }
        });
    }
}
