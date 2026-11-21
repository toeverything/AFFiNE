use crate::{
    App, Bounds, DevicePixels, Half, Hsla, LineLayout, Pixels, Point, RenderGlyphParams, Result,
    SharedString, StrikethroughStyle, TextAlign, UnderlineStyle, Window, WrapBoundary,
    WrappedLineLayout, black, fill, point, px, size, underline_y_offset,
};
use derive_more::{Deref, DerefMut};
use smallvec::SmallVec;
use std::{ops::Range, sync::Arc};

/// Pre-computed glyph data for efficient painting without per-glyph cache lookups.
///
/// This is produced by `ShapedLine::compute_glyph_raster_data` during prepaint
/// and consumed by `ShapedLine::paint_with_raster_data` during paint.
#[derive(Clone, Debug)]
pub struct GlyphRasterData {
    /// The raster bounds for each glyph, in paint order.
    pub bounds: Vec<Bounds<DevicePixels>>,
    /// The render params for each glyph (needed for sprite atlas lookup).
    pub params: Vec<RenderGlyphParams>,
}

/// Set the text decoration for a run of text.
#[derive(Debug, Clone)]
pub struct DecorationRun {
    /// The length of the run in utf-8 bytes.
    pub len: u32,

    /// The color for this run
    pub color: Hsla,

    /// The background color for this run
    pub background_color: Option<Hsla>,

    /// The underline style for this run
    pub underline: Option<UnderlineStyle>,

    /// The strikethrough style for this run
    pub strikethrough: Option<StrikethroughStyle>,
}

/// A line of text that has been shaped and decorated.
#[derive(Clone, Default, Debug, Deref, DerefMut)]
pub struct ShapedLine {
    #[deref]
    #[deref_mut]
    pub(crate) layout: Arc<LineLayout>,
    /// The text that was shaped for this line.
    pub text: SharedString,
    pub(crate) decoration_runs: SmallVec<[DecorationRun; 32]>,
}

impl ShapedLine {
    /// Returns a forward-only cursor for this shaped line.
    pub fn cursor(&self) -> ShapedLineCursor<'_> {
        assert_eq!(
            self.len(),
            self.text.len(),
            "cannot split a shaped line with an adjusted length"
        );
        let byte_ordered = self
            .layout
            .runs
            .iter()
            .flat_map(|run| run.glyphs.iter().map(|glyph| glyph.index))
            .is_sorted();
        ShapedLineCursor {
            line: self,
            unordered_remainder: (!byte_ordered).then(|| self.clone()),
            byte_index: 0,
            run_index: 0,
            glyph_index: 0,
            decoration_index: 0,
            decoration_offset: 0,
            x_offset: px(0.),
        }
    }

    /// The length of the line in utf-8 bytes.
    #[allow(clippy::len_without_is_empty)]
    pub fn len(&self) -> usize {
        self.layout.len
    }

    /// The width of the shaped line in pixels.
    ///
    /// This is the glyph advance width computed by the text shaping system and is useful for
    /// incrementally advancing a "pen" when painting multiple fragments on the same row.
    pub fn width(&self) -> Pixels {
        self.layout.width
    }

    /// Override the len, useful if you're rendering text a
    /// as text b (e.g. rendering invisibles).
    pub fn with_len(mut self, len: usize) -> Self {
        let layout = self.layout.as_ref();
        self.layout = Arc::new(LineLayout {
            font_size: layout.font_size,
            width: layout.width,
            ascent: layout.ascent,
            descent: layout.descent,
            runs: layout.runs.clone(),
            len,
        });
        self
    }

    /// Paint the line of text to the window.
    pub fn paint(
        &self,
        origin: Point<Pixels>,
        line_height: Pixels,
        align: TextAlign,
        align_width: Option<Pixels>,
        window: &mut Window,
        cx: &mut App,
    ) -> Result<()> {
        self.paint_with_underline_handler(
            origin,
            line_height,
            align,
            align_width,
            window,
            cx,
            |_, origin, width, style, window| window.paint_underline(origin, width, style),
        )
    }

    /// Paint the line with a handler for each underline.
    pub fn paint_with_underline_handler(
        &self,
        origin: Point<Pixels>,
        line_height: Pixels,
        align: TextAlign,
        align_width: Option<Pixels>,
        window: &mut Window,
        cx: &mut App,
        mut paint_underline: impl FnMut(
            Range<usize>,
            Point<Pixels>,
            Pixels,
            &UnderlineStyle,
            &mut Window,
        ),
    ) -> Result<()> {
        paint_line(
            origin,
            &self.layout,
            line_height,
            align,
            align_width,
            &self.decoration_runs,
            &[],
            window,
            cx,
            &mut paint_underline,
        )
    }

    /// Paint the background of the line to the window.
    pub fn paint_background(
        &self,
        origin: Point<Pixels>,
        line_height: Pixels,
        align: TextAlign,
        align_width: Option<Pixels>,
        window: &mut Window,
        cx: &mut App,
    ) -> Result<()> {
        if !has_background(&self.decoration_runs) {
            return Ok(());
        }
        paint_line_background(
            origin,
            &self.layout,
            line_height,
            align,
            align_width,
            &self.decoration_runs,
            &[],
            window,
            cx,
        )?;

        Ok(())
    }

    /// Split this shaped line at a byte index, returning `(prefix, suffix)`.
    ///
    /// - `prefix` contains glyphs for bytes `[0, byte_index)` with original positions.
    ///   Its width equals the x-advance up to the split point.
    /// - `suffix` contains glyphs for bytes `[byte_index, len)` with positions
    ///   shifted left so the first glyph starts at x=0, and byte indices rebased to 0.
    /// - Decoration runs are partitioned at the boundary; a run that straddles it is
    ///   split into two with adjusted lengths.
    /// - `font_size`, `ascent`, and `descent` are copied to both halves.
    pub fn split_at(&self, byte_index: usize) -> (ShapedLine, ShapedLine) {
        let (left_layout, right_layout) = self.layout.split_at(byte_index);

        // Partition decoration runs. A run straddling the boundary is split into two.
        let mut left_decorations = SmallVec::new();
        let mut right_decorations = SmallVec::new();
        let mut decoration_offset = 0u32;
        let split_point = byte_index as u32;

        for decoration in &self.decoration_runs {
            let run_end = decoration_offset + decoration.len;

            if run_end <= split_point {
                left_decorations.push(decoration.clone());
            } else if decoration_offset >= split_point {
                right_decorations.push(decoration.clone());
            } else {
                let left_len = split_point - decoration_offset;
                let right_len = run_end - split_point;
                left_decorations.push(DecorationRun {
                    len: left_len,
                    color: decoration.color,
                    background_color: decoration.background_color,
                    underline: decoration.underline,
                    strikethrough: decoration.strikethrough,
                });
                right_decorations.push(DecorationRun {
                    len: right_len,
                    color: decoration.color,
                    background_color: decoration.background_color,
                    underline: decoration.underline,
                    strikethrough: decoration.strikethrough,
                });
            }

            decoration_offset = run_end;
        }

        // Split text
        let left_text = if byte_index == self.text.len() {
            self.text.clone()
        } else {
            SharedString::new(&self.text[..byte_index])
        };
        let right_text = if byte_index == 0 {
            self.text.clone()
        } else {
            SharedString::new(&self.text[byte_index..])
        };

        let left = ShapedLine {
            layout: Arc::new(left_layout),
            text: left_text,
            decoration_runs: left_decorations,
        };

        let right = ShapedLine {
            layout: Arc::new(right_layout),
            text: right_text,
            decoration_runs: right_decorations,
        };

        (left, right)
    }
}

/// Incrementally splits a [`ShapedLine`] at increasing UTF-8 byte boundaries.
///
/// Each piece preserves the original glyphs and decorations, rebased as in
/// [`ShapedLine::split_at`]. Byte-ordered glyphs are advanced in linear time,
/// copying each glyph and byte at most once; visually reordered glyphs fall
/// back to the existing split operation.
pub struct ShapedLineCursor<'a> {
    line: &'a ShapedLine,
    /// Bidirectional shaping can put glyphs out of byte order.
    unordered_remainder: Option<ShapedLine>,
    byte_index: usize,
    run_index: usize,
    glyph_index: usize,
    decoration_index: usize,
    decoration_offset: u32,
    x_offset: Pixels,
}

impl<'a> ShapedLineCursor<'a> {
    /// Takes the bytes since the previous boundary.
    ///
    /// Panics if the boundary precedes the previous one, exceeds the line's
    /// length, or falls inside a UTF-8 character.
    pub fn take_until(&mut self, byte_index: usize) -> ShapedLine {
        assert!(
            byte_index >= self.byte_index,
            "split boundary moved backwards"
        );
        assert!(
            byte_index <= self.line.len(),
            "split boundary exceeds line length"
        );
        assert!(
            self.line.text.is_char_boundary(byte_index),
            "split boundary is not a UTF-8 character boundary"
        );
        let previous_index = self.byte_index;
        let previous_x = self.x_offset;
        if let Some(remainder) = &mut self.unordered_remainder {
            let (piece, rest) = remainder.split_at(byte_index - previous_index);
            *remainder = rest;
            self.byte_index = byte_index;
            self.x_offset = self.line.layout.x_for_index(byte_index);
            return piece;
        }
        let mut runs = Vec::new();
        let mut next_x = self.line.layout.width;
        while let Some(run) = self.line.layout.runs.get(self.run_index) {
            let start = self.glyph_index;
            while let Some(glyph) = run.glyphs.get(self.glyph_index) {
                if glyph.index >= byte_index {
                    break;
                }
                self.glyph_index += 1;
            }
            let end = self.glyph_index;
            if start < end {
                runs.push(crate::ShapedRun {
                    font_id: run.font_id,
                    glyphs: run.glyphs[start..end]
                        .iter()
                        .map(|glyph| crate::ShapedGlyph {
                            id: glyph.id,
                            position: point(glyph.position.x - previous_x, glyph.position.y),
                            index: glyph.index - previous_index,
                            is_emoji: glyph.is_emoji,
                        })
                        .collect(),
                });
            }
            if let Some(glyph) = run.glyphs.get(self.glyph_index) {
                next_x = glyph.position.x;
                break;
            }
            self.run_index += 1;
            self.glyph_index = 0;
        }
        let mut decorations = SmallVec::new();
        while let Some(decoration) = self.line.decoration_runs.get(self.decoration_index)
            && (self.decoration_offset < byte_index as u32
                || (decoration.len == 0 && self.decoration_offset == byte_index as u32))
        {
            let end = self.decoration_offset + decoration.len;
            let start = self.decoration_offset.max(previous_index as u32);
            let len = end.min(byte_index as u32) - start;
            if len > 0 || decoration.len == 0 {
                decorations.push(DecorationRun {
                    len,
                    color: decoration.color,
                    background_color: decoration.background_color,
                    underline: decoration.underline,
                    strikethrough: decoration.strikethrough,
                });
            }
            if end <= byte_index as u32 {
                self.decoration_index += 1;
                self.decoration_offset = end;
            } else {
                break;
            }
        }
        self.byte_index = byte_index;
        self.x_offset = next_x;
        ShapedLine {
            layout: Arc::new(LineLayout {
                font_size: self.line.layout.font_size,
                width: next_x - previous_x,
                ascent: self.line.layout.ascent,
                descent: self.line.layout.descent,
                runs,
                len: byte_index - previous_index,
            }),
            text: SharedString::new(&self.line.text[previous_index..byte_index]),
            decoration_runs: decorations,
        }
    }

    /// Returns the original line's x position at the current boundary.
    pub fn x_offset(&self) -> Pixels {
        self.x_offset
    }
}

impl LineLayout {
    /// Paint this layout to the window, using the given decoration runs to color
    /// glyphs and draw underlines and strikethroughs.
    ///
    /// This is a lower-level alternative to [`ShapedLine::paint`] for callers that
    /// hold a bare layout and track decorations themselves.
    pub fn paint(
        &self,
        origin: Point<Pixels>,
        line_height: Pixels,
        align: TextAlign,
        align_width: Option<Pixels>,
        decoration_runs: &[DecorationRun],
        window: &mut Window,
        cx: &mut App,
    ) -> Result<()> {
        paint_line(
            origin,
            self,
            line_height,
            align,
            align_width,
            decoration_runs,
            &[],
            window,
            cx,
            &mut |_, origin, width, style, window| window.paint_underline(origin, width, style),
        )
    }

    /// Paint the background of this layout to the window, using the given
    /// decoration runs to determine background colors.
    ///
    /// This is a lower-level alternative to [`ShapedLine::paint_background`] for
    /// callers that hold a bare layout and track decorations themselves.
    pub fn paint_background(
        &self,
        origin: Point<Pixels>,
        line_height: Pixels,
        align: TextAlign,
        align_width: Option<Pixels>,
        decoration_runs: &[DecorationRun],
        window: &mut Window,
        cx: &mut App,
    ) -> Result<()> {
        if !has_background(decoration_runs) {
            return Ok(());
        }
        paint_line_background(
            origin,
            self,
            line_height,
            align,
            align_width,
            decoration_runs,
            &[],
            window,
            cx,
        )
    }
}

/// A line of text that has been shaped, decorated, and wrapped by the text layout system.
#[derive(Default, Debug, Deref, DerefMut)]
pub struct WrappedLine {
    #[deref]
    #[deref_mut]
    pub(crate) layout: Arc<WrappedLineLayout>,
    /// The text that was shaped for this line.
    pub text: SharedString,
    pub(crate) decoration_runs: Vec<DecorationRun>,
}

impl WrappedLine {
    /// The length of the underlying, unwrapped layout, in utf-8 bytes.
    #[allow(clippy::len_without_is_empty)]
    pub fn len(&self) -> usize {
        self.layout.len()
    }

    /// Paint this line of text to the window.
    pub fn paint(
        &self,
        origin: Point<Pixels>,
        line_height: Pixels,
        align: TextAlign,
        bounds: Option<Bounds<Pixels>>,
        window: &mut Window,
        cx: &mut App,
    ) -> Result<()> {
        let align_width = match bounds {
            Some(bounds) => Some(bounds.size.width),
            None => self.layout.wrap_width,
        };

        paint_line(
            origin,
            &self.layout.unwrapped_layout,
            line_height,
            align,
            align_width,
            &self.decoration_runs,
            &self.wrap_boundaries,
            window,
            cx,
            &mut |_, origin, width, style, window| window.paint_underline(origin, width, style),
        )?;

        Ok(())
    }

    /// Paint the background of line of text to the window.
    pub fn paint_background(
        &self,
        origin: Point<Pixels>,
        line_height: Pixels,
        align: TextAlign,
        bounds: Option<Bounds<Pixels>>,
        window: &mut Window,
        cx: &mut App,
    ) -> Result<()> {
        let align_width = match bounds {
            Some(bounds) => Some(bounds.size.width),
            None => self.layout.wrap_width,
        };

        if !has_background(&self.decoration_runs) {
            return Ok(());
        }
        paint_line_background(
            origin,
            &self.layout.unwrapped_layout,
            line_height,
            align,
            align_width,
            &self.decoration_runs,
            &self.wrap_boundaries,
            window,
            cx,
        )?;

        Ok(())
    }
}

fn paint_line(
    origin: Point<Pixels>,
    layout: &LineLayout,
    line_height: Pixels,
    align: TextAlign,
    align_width: Option<Pixels>,
    decoration_runs: &[DecorationRun],
    wrap_boundaries: &[WrapBoundary],
    window: &mut Window,
    cx: &mut App,
    paint_underline: &mut dyn FnMut(
        Range<usize>,
        Point<Pixels>,
        Pixels,
        &UnderlineStyle,
        &mut Window,
    ),
) -> Result<()> {
    let line_bounds = line_paint_bounds(
        origin,
        layout,
        line_height,
        align,
        align_width,
        wrap_boundaries,
    );
    window.paint_layer(line_bounds, |window| {
        let padding_top = (line_height - layout.ascent - layout.descent) / 2.;
        let baseline_offset = point(px(0.), padding_top + layout.ascent);
        let underline_y_offset = underline_y_offset(line_height, layout.ascent, layout.descent);
        let all_decorations = decoration_runs;
        let mut decoration_runs = all_decorations.iter();
        let mut run_start = 0;
        let mut wraps = wrap_boundaries.iter().peekable();
        let mut run_end = 0;
        let mut color = black();
        let mut current_underline: Option<(Point<Pixels>, UnderlineStyle, Range<usize>)> = None;
        let mut current_strikethrough: Option<(Point<Pixels>, StrikethroughStyle)> = None;
        let mut glyph_painter = crate::fast::glyphs::LineGlyphPainter::new(window);
        let mut glyph_origin = point(
            aligned_origin_x(
                origin,
                align_width.unwrap_or(layout.width),
                px(0.0),
                &align,
                layout,
                wraps.peek(),
            ),
            origin.y,
        );
        let mut prev_glyph_position = Point::default();
        let mut max_glyph_size = size(px(0.), px(0.));
        let mut first_glyph_x = origin.x;
        for (run_ix, run) in layout.runs.iter().enumerate() {
            max_glyph_size =
                crate::fast::glyphs::bounding_box(window, cx, run.font_id, layout.font_size).size;

            for (glyph_ix, glyph) in run.glyphs.iter().enumerate() {
                glyph_origin.x += glyph.position.x - prev_glyph_position.x;
                if glyph_ix == 0 && run_ix == 0 {
                    first_glyph_x = glyph_origin.x;
                }

                if wraps.peek() == Some(&&WrapBoundary { run_ix, glyph_ix }) {
                    wraps.next();
                    if let Some((underline_origin, underline_style, underline_range)) =
                        current_underline.as_mut()
                    {
                        if glyph_origin.x == underline_origin.x {
                            underline_origin.x -= max_glyph_size.width.half();
                        };
                        paint_underline(
                            underline_range.clone(),
                            *underline_origin,
                            glyph_origin.x - underline_origin.x,
                            underline_style,
                            window,
                        );
                        if glyph.index < run_end {
                            underline_origin.x = origin.x;
                            underline_origin.y += line_height;
                        } else {
                            current_underline = None;
                        }
                    }
                    if let Some((strikethrough_origin, strikethrough_style)) =
                        current_strikethrough.as_mut()
                    {
                        if glyph_origin.x == strikethrough_origin.x {
                            strikethrough_origin.x -= max_glyph_size.width.half();
                        };
                        window.paint_strikethrough(
                            *strikethrough_origin,
                            glyph_origin.x - strikethrough_origin.x,
                            strikethrough_style,
                        );
                        if glyph.index < run_end {
                            strikethrough_origin.x = origin.x;
                            strikethrough_origin.y += line_height;
                        } else {
                            current_strikethrough = None;
                        }
                    }

                    glyph_origin.x = aligned_origin_x(
                        origin,
                        align_width.unwrap_or(layout.width),
                        glyph.position.x,
                        &align,
                        layout,
                        wraps.peek(),
                    );
                    glyph_origin.y += line_height;
                }
                prev_glyph_position = glyph.position;

                let mut finished_underline: Option<(Point<Pixels>, UnderlineStyle, Range<usize>)> =
                    None;
                let mut finished_strikethrough: Option<(Point<Pixels>, StrikethroughStyle)> = None;
                if glyph.index < run_start {
                    // Visual order may traverse the logical color runs backwards.
                    decoration_runs = all_decorations.iter();
                    run_end = 0;
                }
                if glyph.index >= run_end {
                    let mut style_run = decoration_runs.next();

                    // ignore style runs that apply to a partial glyph
                    while let Some(run) = style_run {
                        if glyph.index < run_end + (run.len as usize) {
                            break;
                        }
                        run_end += run.len as usize;
                        style_run = decoration_runs.next();
                    }

                    if let Some(style_run) = style_run {
                        run_start = run_end;
                        let style_run_start = run_end;
                        if let Some((_, underline_style, underline_range)) = &mut current_underline
                        {
                            if style_run.underline.as_ref() != Some(underline_style) {
                                finished_underline = current_underline.take();
                            } else {
                                underline_range.end = style_run_start + style_run.len as usize;
                            }
                        }
                        if let Some(run_underline) = style_run.underline.as_ref() {
                            current_underline.get_or_insert((
                                point(glyph_origin.x, glyph_origin.y + underline_y_offset),
                                UnderlineStyle {
                                    color: Some(run_underline.color.unwrap_or(style_run.color)),
                                    thickness: run_underline.thickness,
                                    wavy: run_underline.wavy,
                                },
                                style_run_start..style_run_start + style_run.len as usize,
                            ));
                        }
                        if let Some((_, strikethrough_style)) = &mut current_strikethrough
                            && style_run.strikethrough.as_ref() != Some(strikethrough_style)
                        {
                            finished_strikethrough = current_strikethrough.take();
                        }
                        if let Some(run_strikethrough) = style_run.strikethrough.as_ref() {
                            current_strikethrough.get_or_insert((
                                point(
                                    glyph_origin.x,
                                    glyph_origin.y
                                        + (((layout.ascent * 0.5) + baseline_offset.y) * 0.5),
                                ),
                                StrikethroughStyle {
                                    color: Some(run_strikethrough.color.unwrap_or(style_run.color)),
                                    thickness: run_strikethrough.thickness,
                                },
                            ));
                        }

                        run_end += style_run.len as usize;
                        color = style_run.color;
                    } else {
                        run_end = layout.len;
                        finished_underline = current_underline.take();
                        finished_strikethrough = current_strikethrough.take();
                    }
                }

                if let Some((mut underline_origin, underline_style, underline_range)) =
                    finished_underline
                {
                    if underline_origin.x == glyph_origin.x {
                        underline_origin.x -= max_glyph_size.width.half();
                    };
                    paint_underline(
                        underline_range,
                        underline_origin,
                        glyph_origin.x - underline_origin.x,
                        &underline_style,
                        window,
                    );
                }

                if let Some((mut strikethrough_origin, strikethrough_style)) =
                    finished_strikethrough
                {
                    if strikethrough_origin.x == glyph_origin.x {
                        strikethrough_origin.x -= max_glyph_size.width.half();
                    };
                    window.paint_strikethrough(
                        strikethrough_origin,
                        glyph_origin.x - strikethrough_origin.x,
                        &strikethrough_style,
                    );
                }

                let max_glyph_bounds = Bounds {
                    origin: glyph_origin,
                    size: max_glyph_size,
                };

                let content_mask = window.content_mask();
                if crate::fast::glyphs::LineGlyphPainter::may_reach(
                    &mut glyph_painter,
                    max_glyph_bounds,
                    baseline_offset.y + glyph.position.y,
                    &content_mask.bounds,
                ) {
                    let vertical_offset = point(px(0.0), glyph.position.y);
                    if glyph.is_emoji {
                        window.paint_emoji(
                            glyph_origin + baseline_offset + vertical_offset,
                            run.font_id,
                            glyph.id,
                            layout.font_size,
                        )?;
                    } else {
                        crate::fast::glyphs::LineGlyphPainter::paint_glyph(
                            &mut glyph_painter,
                            window,
                            glyph_origin + baseline_offset + vertical_offset,
                            run.font_id,
                            glyph.id,
                            layout.font_size,
                            color,
                        )?;
                    }
                }
            }
        }

        let mut last_line_end_x = first_glyph_x + layout.width;
        if let Some(boundary) = wrap_boundaries.last() {
            let run = &layout.runs[boundary.run_ix];
            let glyph = &run.glyphs[boundary.glyph_ix];
            last_line_end_x -= glyph.position.x;
        }

        if let Some((mut underline_start, underline_style, underline_range)) =
            current_underline.take()
        {
            if last_line_end_x == underline_start.x {
                underline_start.x -= max_glyph_size.width.half()
            };
            paint_underline(
                underline_range,
                underline_start,
                last_line_end_x - underline_start.x,
                &underline_style,
                window,
            );
        }

        if let Some((mut strikethrough_start, strikethrough_style)) = current_strikethrough.take() {
            if last_line_end_x == strikethrough_start.x {
                strikethrough_start.x -= max_glyph_size.width.half()
            };
            window.paint_strikethrough(
                strikethrough_start,
                last_line_end_x - strikethrough_start.x,
                &strikethrough_style,
            );
        }

        Ok(())
    })
}

/// Painting backgrounds walks every glyph and opens a layer, so callers skip it when there's
/// nothing to paint.
fn has_background(decoration_runs: &[DecorationRun]) -> bool {
    decoration_runs
        .iter()
        .any(|run| run.background_color.is_some())
}

fn paint_line_background(
    origin: Point<Pixels>,
    layout: &LineLayout,
    line_height: Pixels,
    align: TextAlign,
    align_width: Option<Pixels>,
    decoration_runs: &[DecorationRun],
    wrap_boundaries: &[WrapBoundary],
    window: &mut Window,
    cx: &mut App,
) -> Result<()> {
    if crate::fast::glyphs::has_no_background(decoration_runs) {
        return Ok(());
    }
    let line_bounds = line_paint_bounds(
        origin,
        layout,
        line_height,
        align,
        align_width,
        wrap_boundaries,
    );
    window.paint_layer(line_bounds, |window| {
        let mut decoration_runs = decoration_runs.iter();
        let mut wraps = wrap_boundaries.iter().peekable();
        let mut run_end = 0;
        let mut current_background: Option<(Point<Pixels>, Hsla)> = None;
        let text_system = cx.text_system().clone();
        let mut glyph_origin = point(
            aligned_origin_x(
                origin,
                align_width.unwrap_or(layout.width),
                px(0.0),
                &align,
                layout,
                wraps.peek(),
            ),
            origin.y,
        );
        let mut prev_glyph_position = Point::default();
        let mut max_glyph_size = size(px(0.), px(0.));
        for (run_ix, run) in layout.runs.iter().enumerate() {
            max_glyph_size = text_system.bounding_box(run.font_id, layout.font_size).size;

            for (glyph_ix, glyph) in run.glyphs.iter().enumerate() {
                glyph_origin.x += glyph.position.x - prev_glyph_position.x;

                if wraps.peek() == Some(&&WrapBoundary { run_ix, glyph_ix }) {
                    wraps.next();
                    if let Some((background_origin, background_color)) = current_background.as_mut()
                    {
                        if glyph_origin.x == background_origin.x {
                            background_origin.x -= max_glyph_size.width.half()
                        }
                        window.paint_quad(fill(
                            Bounds {
                                origin: *background_origin,
                                size: size(glyph_origin.x - background_origin.x, line_height),
                            },
                            *background_color,
                        ));
                        if glyph.index < run_end {
                            background_origin.x = origin.x;
                            background_origin.y += line_height;
                        } else {
                            current_background = None;
                        }
                    }

                    glyph_origin.x = aligned_origin_x(
                        origin,
                        align_width.unwrap_or(layout.width),
                        glyph.position.x,
                        &align,
                        layout,
                        wraps.peek(),
                    );
                    glyph_origin.y += line_height;
                }
                prev_glyph_position = glyph.position;

                let mut finished_background: Option<(Point<Pixels>, Hsla)> = None;
                if glyph.index >= run_end {
                    let mut style_run = decoration_runs.next();

                    // ignore style runs that apply to a partial glyph
                    while let Some(run) = style_run {
                        if glyph.index < run_end + (run.len as usize) {
                            break;
                        }
                        run_end += run.len as usize;
                        style_run = decoration_runs.next();
                    }

                    if let Some(style_run) = style_run {
                        if let Some((_, background_color)) = &mut current_background
                            && style_run.background_color.as_ref() != Some(background_color)
                        {
                            finished_background = current_background.take();
                        }
                        if let Some(run_background) = style_run.background_color {
                            current_background.get_or_insert((
                                point(glyph_origin.x, glyph_origin.y),
                                run_background,
                            ));
                        }
                        run_end += style_run.len as usize;
                    } else {
                        run_end = layout.len;
                        finished_background = current_background.take();
                    }
                }

                if let Some((mut background_origin, background_color)) = finished_background {
                    let width = glyph_origin.x - background_origin.x;
                    if background_origin.x == glyph_origin.x {
                        background_origin.x -= max_glyph_size.width.half();
                    };
                    window.paint_quad(fill(
                        Bounds {
                            origin: background_origin,
                            size: size(width, line_height),
                        },
                        background_color,
                    ));
                }
            }
        }

        let mut last_line_end_x = origin.x + layout.width;
        if let Some(boundary) = wrap_boundaries.last() {
            let run = &layout.runs[boundary.run_ix];
            let glyph = &run.glyphs[boundary.glyph_ix];
            last_line_end_x -= glyph.position.x;
        }

        if let Some((mut background_origin, background_color)) = current_background.take() {
            if last_line_end_x == background_origin.x {
                background_origin.x -= max_glyph_size.width.half()
            };
            window.paint_quad(fill(
                Bounds {
                    origin: background_origin,
                    size: size(last_line_end_x - background_origin.x, line_height),
                },
                background_color,
            ));
        }

        Ok(())
    })
}

fn line_paint_bounds(
    origin: Point<Pixels>,
    layout: &LineLayout,
    line_height: Pixels,
    align: TextAlign,
    align_width: Option<Pixels>,
    wrap_boundaries: &[WrapBoundary],
) -> Bounds<Pixels> {
    let mut bounds = Bounds::new(
        origin,
        size(
            layout.width,
            line_height * (wrap_boundaries.len() as f32 + 1.),
        ),
    );
    if align == TextAlign::Left || layout.len == 0 {
        return bounds;
    }

    let align_width = align_width.unwrap_or(layout.width);
    let mut row_start = Pixels::ZERO;
    let row_ends = wrap_boundaries
        .iter()
        .map(|boundary| {
            layout.runs[boundary.run_ix].glyphs[boundary.glyph_ix]
                .position
                .x
        })
        .chain([layout.width]);
    for (row, row_end) in row_ends.enumerate() {
        let width = row_end - row_start;
        let offset = match align {
            TextAlign::Left => Pixels::ZERO,
            TextAlign::Center => (align_width - width) / 2.,
            TextAlign::Right => align_width - width,
        };
        bounds = bounds.union(&Bounds::new(
            point(origin.x + offset, origin.y + line_height * row as f32),
            size(width, line_height),
        ));
        row_start = row_end;
    }
    bounds
}

fn aligned_origin_x(
    origin: Point<Pixels>,
    align_width: Pixels,
    last_glyph_x: Pixels,
    align: &TextAlign,
    layout: &LineLayout,
    wrap_boundary: Option<&&WrapBoundary>,
) -> Pixels {
    let end_of_line = if let Some(WrapBoundary { run_ix, glyph_ix }) = wrap_boundary {
        layout.runs[*run_ix].glyphs[*glyph_ix].position.x
    } else {
        layout.width
    };

    let line_width = end_of_line - last_glyph_x;

    match align {
        TextAlign::Left => origin.x,
        TextAlign::Center => (origin.x * 2.0 + align_width - line_width) / 2.0,
        TextAlign::Right => origin.x + align_width - line_width,
    }
}
