//! Where a reused range of shaped lines falls in a new frame, text measurements
//! carried from one frame to the next, and shaping statistics.

use crate::collections::{FxHashMap, FxHasher};
use crate::fast::layout::Adopted;
use crate::fast::truncation::{self, Room};
use crate::gpui_util::ResultExt as _;
use crate::scheduler::Instant;
use crate::{
    App, AvailableSpace, Bounds, DecorationRun, FontRun, FrameCache, Hsla, LayoutId, LineLayout,
    LineLayoutCache, LineLayoutIndex, Pixels, PlatformTextSystem, SharedString, Size,
    StrikethroughStyle, TextLayout, TextLayoutInner, TextOverflow, TextRun, TextStyle,
    TruncateFrom, UnderlineStyle, WhiteSpace, Window, WindowTextSystem, WrappedLine,
};
use parking_lot::Mutex;
use smallvec::SmallVec;
use std::{
    any::Any,
    borrow::Cow,
    cell::RefCell,
    cmp,
    hash::{Hash, Hasher},
    mem,
    rc::Rc,
    sync::Arc,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
};

/// Everything a text element's measurement is taken from, and the layout it
/// keeps the measurement in.
///
/// The element hands its text, runs and style over rather than copying them:
/// its measurement closure reads them from here, and the next frame's element
/// at the same place compares its own against them.
pub(crate) struct TextMeasureInputs {
    text: SharedString,
    /// The runs the element was given, or none for plain text, which is one
    /// run in the text style: that run is only made when the text has to be
    /// shaped, rather than copying the style's font into every element.
    runs: Vec<TextRun>,
    /// The text style in effect, shared with the window's text style stack
    /// and every other element under the same refinements.
    text_style: Rc<TextStyle>,
    font_size: Pixels,
    line_height: Pixels,
    base_direction: crate::BaseDirection,
    /// The layout of the element whose inputs these are, or of a later one
    /// that took the measurement over while leaving the node with these.
    layout: RefCell<TextLayout>,
}

/// The decorations of a run: what it is painted with, and what shaping splits
/// font runs on.
fn decoration_of(
    run: &TextRun,
) -> (
    Hsla,
    Option<Hsla>,
    Option<UnderlineStyle>,
    Option<StrikethroughStyle>,
) {
    (
        run.color,
        run.background_color,
        run.underline,
        run.strikethrough,
    )
}

/// The decorations of plain text in `style`, as [`decoration_of`] its run.
fn style_decoration(
    style: &TextStyle,
) -> (
    Hsla,
    Option<Hsla>,
    Option<UnderlineStyle>,
    Option<StrikethroughStyle>,
) {
    (
        style.color,
        style.background_color,
        style.underline,
        style.strikethrough,
    )
}

/// Whether two text styles have the same font: `style.font() ==
/// other.font()`, without making either font.
fn same_font(style: &TextStyle, other: &TextStyle) -> bool {
    style.font_family == other.font_family
        && style.font_features == other.font_features
        && style.font_fallbacks == other.font_fallbacks
        && style.font_weight == other.font_weight
        && style.font_style == other.font_style
}

impl TextMeasureInputs {
    /// Whether text truncates, in which case it is shaped from a rewritten
    /// string whose runs no longer line up with these.
    fn truncates(&self) -> bool {
        self.text_style.text_overflow.is_some()
    }

    /// Whether this is plain text: one run in the text style.
    fn plain(&self) -> bool {
        self.runs.is_empty()
    }

    /// The runs the text is shaped and painted with.
    fn runs(&self) -> Cow<'_, [TextRun]> {
        if self.plain() {
            Cow::Owned(vec![self.text_style.to_run(self.text.len())])
        } else {
            Cow::Borrowed(&self.runs)
        }
    }

    /// Whether `self` is shaped as `other` is: the same text, sizes, fonts and
    /// wrapping, and decoration changing in the same places, since shaping
    /// splits font runs wherever it changes. What it is painted with may
    /// differ; see [`Self::decorated_as`].
    fn shapes_as(&self, other: &Self) -> bool {
        fn runs(runs: &[TextRun]) -> impl Iterator<Item = &TextRun> {
            runs.iter().filter(|run| run.len > 0)
        }
        fn joins_previous<'a>(
            runs: impl Iterator<Item = &'a TextRun>,
        ) -> impl Iterator<Item = bool> {
            let mut previous = None;
            runs.map(move |run| {
                previous
                    .replace(decoration_of(run))
                    .is_some_and(|previous| previous == decoration_of(run))
            })
        }
        let (style, other_style) = (&*self.text_style, &*other.text_style);
        if !(self.text == other.text
            && self.font_size == other.font_size
            && self.line_height == other.line_height
            && self.base_direction == other.base_direction
            && style.white_space == other_style.white_space
            && style.line_clamp == other_style.line_clamp
            && style.text_overflow == other_style.text_overflow
            // Only truncation reads the style's own font.
            && (!self.truncates() || same_font(style, other_style)))
        {
            return false;
        }
        if self.plain() && other.plain() {
            // One run each, as long as the text, unless there is no text.
            return self.text.is_empty() || same_font(style, other_style);
        }
        let (self_runs, other_runs) = (self.runs(), other.runs());
        runs(&self_runs).count() == runs(&other_runs).count()
            && runs(&self_runs)
                .zip(runs(&other_runs))
                .all(|(run, other)| run.len == other.len && run.font == other.font)
            && joins_previous(runs(&self_runs)).eq(joins_previous(runs(&other_runs)))
    }

    /// Whether `self` is painted with what `other` is.
    fn decorated_as(&self, other: &Self) -> bool {
        if self.plain() && other.plain() {
            return self.text.is_empty()
                || style_decoration(&self.text_style) == style_decoration(&other.text_style);
        }
        let (self_runs, other_runs) = (self.runs(), other.runs());
        self_runs
            .iter()
            .filter(|run| run.len > 0)
            .map(decoration_of)
            .eq(other_runs
                .iter()
                .filter(|run| run.len > 0)
                .map(decoration_of))
    }
}

/// Requests the layout of a text element, whose measurement it keeps in
/// `layout`: what [`TextLayout`]'s layout does upstream.
///
/// A measured node is given a new closure every frame, and would be dirtied
/// for it, with every node above it: a view built again would have all of its
/// text measured and laid out again, though none of it changed. When last
/// frame's element at this place measured text shaped the same way, its
/// measurement is carried into this one's layout instead, repainted with this
/// one's decorations if only they changed, and the node is left clean,
/// keeping what Taffy cached for it.
///
/// If only the decorations changed, the node is given this element's inputs
/// to measure from when Taffy measures it again under other constraints.
/// Otherwise it keeps last frame's, which measure it the same way, only
/// keeping the measurement in this element's layout from now on: rebuilding
/// the closure and the inputs of every unchanged text element, and dropping
/// last frame's, was most of what it cost.
#[inline]
pub(crate) fn layout_text_with_direction(
    layout: &TextLayout,
    text: SharedString,
    runs: Option<Vec<TextRun>>,
    base_direction: Option<crate::BaseDirection>,
    window: &mut Window,
    cx: &mut App,
) -> LayoutId {
    let inputs = measure_inputs(
        layout,
        text,
        runs.unwrap_or_default(),
        base_direction,
        window,
    );
    window.request_carried_measured_layout(
        inputs,
        adopt_measurement,
        forget_measurement,
        measure_text,
        cx,
    )
}

/// The inputs of text laid out in the text style in effect, keeping its
/// measurement in `layout`.
fn measure_inputs(
    layout: &TextLayout,
    text: SharedString,
    runs: Vec<TextRun>,
    base_direction: Option<crate::BaseDirection>,
    window: &Window,
) -> TextMeasureInputs {
    let text_style = crate::fast::text_style::text_style(window);
    let font_size = text_style.font_size.to_pixels(window.rem_size());
    let line_height = window.pixel_snap(
        text_style
            .line_height
            .to_pixels(font_size.into(), window.rem_size()),
    );
    let base_direction = base_direction.unwrap_or_else(|| match window.layout_direction() {
        crate::Direction::Rtl => crate::BaseDirection::Rtl,
        crate::Direction::Ltr => crate::BaseDirection::Ltr,
    });
    TextMeasureInputs {
        text,
        runs,
        text_style,
        font_size,
        line_height,
        base_direction,
        layout: RefCell::new(layout.clone()),
    }
}

/// [`TextLayout`]'s prepaint: notes the bounds the text is painted in.
///
/// Text should be measured by the time it is prepainted: carried over from
/// last frame as its layout is requested, or by Taffy as it lays the text's
/// node out. Should a gap in retention let text reach prepaint without a
/// measurement (a node no layout computed this frame reaches, say), upstream
/// panics here. It is measured here instead, as plain text in the text style
/// in effect at the size it is prepainted at, so that the frame degrades
/// (the text loses its runs' colors and fonts for a frame) rather than the
/// app aborting.
pub(crate) fn prepaint_text(
    layout: &TextLayout,
    bounds: Bounds<Pixels>,
    text: &str,
    window: &mut Window,
    cx: &mut App,
) {
    prepaint_text_with_direction(layout, bounds, text, None, window, cx)
}

pub(crate) fn prepaint_text_with_direction(
    layout: &TextLayout,
    bounds: Bounds<Pixels>,
    text: &str,
    base_direction: Option<crate::BaseDirection>,
    window: &mut Window,
    cx: &mut App,
) {
    if layout.0.borrow().is_none() {
        report_unmeasured(
            "text reached prepaint unmeasured; measured there as plain text",
            text,
        );
        let inputs = measure_inputs(
            layout,
            SharedString::from(text.to_owned()),
            Vec::new(),
            base_direction,
            window,
        );
        // A node no layout reached has no size: lay the text out unwrapped
        // rather than a glyph to a line.
        let (known, available) = if bounds.size.width > Pixels::ZERO {
            (
                bounds.size.map(Some),
                bounds.size.map(AvailableSpace::Definite),
            )
        } else {
            (
                Size::default(),
                Size::new(AvailableSpace::MaxContent, AvailableSpace::MaxContent),
            )
        };
        measure_text(&inputs, known, available, window, cx);
    }
    if let Some(inner) = layout.0.borrow_mut().as_mut() {
        inner.bounds = Some(bounds);
        inner.text_align = crate::fast::text_style::text_paint_style(window).text_align;
    }
}

/// Whether [`TextLayout`]'s paint can paint the text: it was measured and
/// prepainted. Upstream panics when it was not; it is left unpainted instead.
/// See [`prepaint_text`].
pub(crate) fn paintable(layout: &TextLayout, text: &str) -> bool {
    let paintable = layout
        .0
        .borrow()
        .as_ref()
        .is_some_and(|inner| inner.bounds.is_some());
    if !paintable {
        report_unmeasured(
            "text painted before it was measured and prepainted; not painted",
            text,
        );
    }
    paintable
}

/// Whether [`report_unmeasured`] has reported anything in this process.
static REPORTED_UNMEASURED: AtomicBool = AtomicBool::new(false);

/// Logs text found unmeasured where it should not be: as an error the first
/// time, and at debug level after that, since a frame that finds it is likely
/// to be followed by many that find it again.
fn report_unmeasured(what: &str, text: &str) {
    const SHOWN_CHARS: usize = 32;
    let mut shown: String = text.chars().take(SHOWN_CHARS).collect();
    if text.chars().nth(SHOWN_CHARS).is_some() {
        shown.push('…');
    }
    if REPORTED_UNMEASURED.swap(true, Ordering::Relaxed) {
        log::debug!("{what}: {shown:?}");
    } else {
        log::error!("{what}: {shown:?}");
    }
}

/// Takes over the measurement `previous` left, if it stands for `inputs`. See
/// [`layout_text`].
fn adopt_measurement(inputs: &TextMeasureInputs, previous: &dyn Any) -> Adopted {
    let Some(previous) = previous.downcast_ref::<TextMeasureInputs>() else {
        return Adopted::No;
    };
    if !previous.shapes_as(inputs) {
        return Adopted::No;
    }
    let recolored = !previous.decorated_as(inputs);
    if recolored && inputs.truncates() {
        return Adopted::No;
    }
    let Some(mut inner) = carry_measurement(&previous.layout.borrow()) else {
        return Adopted::No;
    };
    let layout = inputs.layout.borrow();
    if recolored {
        update_decoration_runs(&mut inner.lines, &inputs.runs());
        *layout.0.borrow_mut() = Some(inner);
        Adopted::Measurement
    } else {
        *layout.0.borrow_mut() = Some(inner);
        // The node keeps `previous`, which now keeps its measurement where
        // this element looks for it.
        *previous.layout.borrow_mut() = layout.clone();
        Adopted::Node
    }
}

/// Drops the measurement `inputs` were left with, for text laid out afresh:
/// [`measure_text`] answers from a measurement it holds, and one taken under
/// another text's constraints would answer for those.
fn forget_measurement(inputs: &TextMeasureInputs) {
    inputs.layout.borrow().0.borrow_mut().take();
}

/// Measures text under the constraints Taffy offers, keeping the result in
/// its layout: upstream's measurement, doing less of its work.
///
/// - Taffy asks a node for its intrinsic size before it lays the node out, so
///   a wrapping leaf is measured unconstrained and then again at the width it
///   ends up with. Text that came out narrower than the width now on offer
///   wraps nowhere, and the lines shaped without a wrap width are the same
///   lines, so that is answered from what is already there. The other way
///   round holds only for text that wrapped nowhere at its width.
/// - Which affix to truncate with, and the line wrapper truncation needs, are
///   worked out only when the text truncates and has to be shaped: resolving
///   the font and borrowing a wrapper from the pool on every measurement was
///   for nothing on text that does not truncate.
fn measure_text(
    inputs: &TextMeasureInputs,
    known_dimensions: Size<Option<Pixels>>,
    available_space: Size<AvailableSpace>,
    window: &mut Window,
    cx: &mut App,
) -> Size<Pixels> {
    let TextMeasureInputs {
        text,
        runs: _,
        text_style,
        font_size,
        line_height,
        base_direction,
        layout,
    } = inputs;
    let layout = &*layout.borrow();
    let (font_size, line_height, base_direction) = (*font_size, *line_height, *base_direction);
    let wrap_width = if text_style.white_space == WhiteSpace::Normal {
        known_dimensions.width.or(match available_space.width {
            AvailableSpace::Definite(x) => Some(x),
            _ => None,
        })
    } else {
        None
    };
    let truncate_width = text_style.text_overflow.as_ref().and_then(|_| {
        known_dimensions.width.or(match available_space.width {
            AvailableSpace::Definite(x) => match text_style.line_clamp {
                Some(max_lines) => Some(x * max_lines),
                None => Some(x),
            },
            _ => None,
        })
    });

    // A kept measurement answers when the wrap width is one it was taken at,
    // an unconstrained probe when it wrapped nowhere, or a wrap width it fits
    // within unwrapped, unless truncation is involved either way: a truncated
    // layout would answer an unconstrained probe with the truncated size.
    // Text wrapped at a width is only as wide as that width, and Taffy can
    // measure a retained leaf narrow after laying it out (see
    // `text_laid_out_from_the_cache_paints_the_lines_of_its_box`): answering
    // an unconstrained probe with that would size a box as wide as its
    // content to the narrow width, for good.
    if let Some(text_layout) = layout.0.borrow().as_ref()
        && let Some(size) = text_layout.size
        && (wrap_width == text_layout.wrap_width
            || (wrap_width.is_none()
                && text_layout
                    .lines
                    .iter()
                    .all(|line| line.wrap_boundaries.is_empty() && line.visual_rows.len() <= 1))
            || (text_layout.wrap_width.is_none()
                && wrap_width.is_some_and(|wrap_width| size.width <= wrap_width)))
        && truncate_width.is_none()
        && text_layout.truncate_width.is_none()
    {
        return size;
    }

    let runs = inputs.runs();
    let runs = &*runs;
    let (text, runs) = if let Some(truncate_width) = truncate_width {
        let (truncation_affix, truncate_from) = match text_style.text_overflow.clone() {
            Some(TextOverflow::Truncate(affix)) => (affix, TruncateFrom::End),
            Some(TextOverflow::TruncateStart(affix)) => (affix, TruncateFrom::Start),
            Some(TextOverflow::TruncateMiddle(affix)) => (affix, TruncateFrom::Middle),
            None => (SharedString::default(), TruncateFrom::End),
        };
        let mut line_wrapper = cx.text_system().line_wrapper(text_style.font(), font_size);
        if let Some(max_lines) = text_style.line_clamp
            && let Some(wrap_width) = wrap_width
        {
            let room = Room::Lines {
                wrap_width,
                max_lines: max_lines.max(1),
            };
            if truncation::fits(text, runs, room, font_size, base_direction, window) {
                (text.clone(), Cow::Borrowed(runs))
            } else {
                let truncated = line_wrapper.truncate_wrapped_line(
                    text.clone(),
                    wrap_width,
                    max_lines,
                    &truncation_affix,
                    runs,
                    truncate_from,
                );
                truncation::fit(
                    text,
                    runs,
                    truncated,
                    &truncation_affix,
                    truncate_from,
                    room,
                    font_size,
                    base_direction,
                    window,
                )
            }
        } else if let Some(unclipped) = window
            .text_system()
            .shape_text_with_direction(text.clone(), font_size, runs, None, None, base_direction)
            .log_err()
            && unclipped
                .iter()
                .all(|line| line.size(line_height).width <= truncate_width)
        {
            // Truncation sums per-character advances, which can be more than
            // the shaped width, so text that fits once shaped is not truncated.
            (text.clone(), Cow::Borrowed(runs))
        } else {
            // The sum can also be less than the shaped width, so what it cuts
            // is fitted to the shaped width.
            let truncated = line_wrapper.truncate_line(
                text.clone(),
                truncate_width,
                &truncation_affix,
                runs,
                truncate_from,
            );
            truncation::fit(
                text,
                runs,
                truncated,
                &truncation_affix,
                truncate_from,
                Room::Line(truncate_width),
                font_size,
                base_direction,
                window,
            )
        }
    } else {
        (text.clone(), Cow::Borrowed(runs))
    };
    let len = text.len();

    let Some(lines) = window
        .text_system()
        .shape_text_with_direction(
            text,
            font_size,
            &runs,
            wrap_width,
            text_style.line_clamp,
            base_direction,
        )
        .log_err()
    else {
        layout.0.borrow_mut().replace(TextLayoutInner {
            lines: Default::default(),
            len: 0,
            line_height,
            wrap_width,
            truncate_width,
            text_align: text_style.text_align,
            size: Some(Size::default()),
            bounds: None,
        });
        return Size::default();
    };

    let mut size: Size<Pixels> = Size::default();
    for line in &lines {
        let line_size = line.size(line_height);
        size.height += line_size.height;
        size.width = size.width.max(line_size.width).ceil();
    }
    layout.0.borrow_mut().replace(TextLayoutInner {
        lines,
        len,
        line_height,
        wrap_width,
        truncate_width,
        text_align: text_style.text_align,
        size: Some(size),
        bounds: None,
    });
    size
}

/// Rewrites the decorations of lines already shaped, leaving the shaping
/// alone: recoloring text is a matter of replacing what is painted over it.
///
/// `runs` must split the lines as the runs they were shaped with did: the same
/// lengths, the same fonts, and decoration changing in the same places; see
/// [`TextMeasureInputs::shapes_as`].
pub(crate) fn update_decoration_runs(lines: &mut [WrappedLine], runs: &[TextRun]) {
    let mut runs = runs.iter().filter(|run| run.len > 0).cloned().peekable();
    for line in lines.iter_mut() {
        let line_len = line.text.len();
        line.decoration_runs.clear();
        let mut offset = 0;
        while offset < line_len {
            let Some(run) = runs.peek_mut() else {
                log::warn!("`TextRun`s do not cover the entire shaped text");
                break;
            };
            let len_within_line = cmp::min(line_len - offset, run.len);
            if let Some(last_run) = line.decoration_runs.last_mut()
                && last_run.color == run.color
                && last_run.underline == run.underline
                && last_run.strikethrough == run.strikethrough
                && last_run.background_color == run.background_color
            {
                last_run.len += len_within_line as u32;
            } else {
                line.decoration_runs.push(DecorationRun {
                    len: len_within_line as u32,
                    color: run.color,
                    background_color: run.background_color,
                    underline: run.underline,
                    strikethrough: run.strikethrough,
                });
            }
            run.len -= len_within_line;
            if run.len == 0 {
                runs.next();
            }
            offset += len_within_line;
        }
        // Skip the `\n` that separated this line from the next.
        if let Some(run) = runs.peek_mut() {
            run.len -= 1;
            if run.len == 0 {
                runs.next();
            }
        }
    }
}

/// What the measurement kept in `layout` left, without where it was last
/// painted, for another element's layout to take over.
///
/// Last frame's element is usually gone by now, and its layout only held by
/// what it left for this frame's, in which case the measurement is moved out
/// of it rather than copied line by line. Something may still hold it (an
/// element kept by a view reused as it was, say, or a caller's clone of a
/// `StyledText`'s layout), and then it is copied, so it still answers.
fn carry_measurement(layout: &TextLayout) -> Option<TextLayoutInner> {
    if Rc::strong_count(&layout.0) == 1 {
        let mut inner = layout.0.borrow_mut().take()?;
        inner.bounds = None;
        Some(inner)
    } else {
        layout.0.borrow().as_ref().map(copy_measurement)
    }
}

/// A copy of what a measurement left, without where it was last painted.
fn copy_measurement(inner: &TextLayoutInner) -> TextLayoutInner {
    TextLayoutInner {
        len: inner.len,
        lines: inner
            .lines
            .iter()
            .map(|line| WrappedLine {
                layout: line.layout.clone(),
                text: line.text.clone(),
                decoration_runs: line.decoration_runs.clone(),
            })
            .collect(),
        line_height: inner.line_height,
        wrap_width: inner.wrap_width,
        truncate_width: inner.truncate_width,
        text_align: inner.text_align,
        size: inner.size,
        bounds: None,
    }
}

impl Window {
    /// Requests a self-measuring leaf, as [`Window::request_measured_layout`]
    /// does, whose measurement can be carried over from the element at the
    /// same place last frame. `adopt` is given `state` and what that element
    /// measured from, and takes its measurement over if it still stands.
    /// Otherwise `measure` may be run here, to tell whether it measures what
    /// the node was measured at before. See
    /// `TaffyLayoutEngine::request_retained_carried_measured_layout`.
    pub(crate) fn request_carried_measured_layout<S: 'static>(
        &mut self,
        state: S,
        adopt: impl FnOnce(&S, &dyn Any) -> Adopted,
        forget: impl FnOnce(&S),
        measure: impl Fn(
            &S,
            Size<Option<Pixels>>,
            Size<AvailableSpace>,
            &mut Window,
            &mut App,
        ) -> Size<Pixels>
        + 'static,
        cx: &mut App,
    ) -> LayoutId {
        self.invalidator.debug_assert_prepaint();
        let rem_size = self.rem_size();
        let scale_factor = self.scale_factor();
        let key = crate::fast::layout_key::layout_key(self);
        let mut layout_engine = self.layout_engine.take().unwrap();
        let id = layout_engine.request_retained_carried_measured_layout(
            key,
            rem_size,
            scale_factor,
            state,
            adopt,
            forget,
            measure,
            self,
            cx,
        );
        self.layout_engine = Some(layout_engine);
        id
    }
}

/// Leaves in `previous` everything the next frame may ask for: what this
/// frame asked for, which is in `current`, and what it did not but something
/// still holds. `current` is left empty.
///
/// Whichever of the two is larger is kept and the other moved into it, so a
/// frame that asked for little costs little, and so does one that asked for
/// everything.
fn carry_over<K: Eq + Hash, V>(
    previous: &mut FxHashMap<Arc<K>, Arc<V>>,
    current: &mut FxHashMap<Arc<K>, Arc<V>>,
) {
    previous.retain(|_, layout| Arc::strong_count(layout) > 1);
    if previous.len() < current.len() {
        mem::swap(previous, current);
    }
    previous.extend(current.drain());
}

/// Ends a frame of the line layout cache: what it laid out, in `current`,
/// becomes what the next frame can reuse, in `previous`.
///
/// Upstream drops every line the frame did not ask for. A text node that
/// takes over last frame's measurement answers from the lines it holds
/// without asking the cache for them, so its lines would be dropped, and its
/// text, sliding onto another node with the rows around it, shaped again
/// there. A line something still holds is kept.
pub(crate) fn carry_over_line_layouts(previous: &mut FrameCache, current: &mut FrameCache) {
    // Wrapped lines hold the lines they were wrapped from, so they are swept
    // first, letting a line they were the last to hold go with them.
    carry_over(&mut previous.wrapped_lines, &mut current.wrapped_lines);
    carry_over(&mut previous.lines, &mut current.lines);

    // The used lists index what this frame laid out, which is what a view
    // reused next frame looks its lines up by.
    mem::swap(&mut previous.used_lines, &mut current.used_lines);
    mem::swap(
        &mut previous.used_wrapped_lines,
        &mut current.used_wrapped_lines,
    );
    current.used_lines.clear();
    current.used_wrapped_lines.clear();
}

impl LineLayoutIndex {
    /// This index, taken from a range that started at `from`, as it falls in
    /// a copy of that range starting at `to`.
    pub(crate) fn shifted(&self, from: &Self, to: &Self) -> Self {
        LineLayoutIndex {
            font_generation: to.font_generation,
            lines_index: self.lines_index - from.lines_index + to.lines_index,
            wrapped_lines_index: self.wrapped_lines_index - from.wrapped_lines_index
                + to.wrapped_lines_index,
        }
    }
}

/// Counts the lines the line layout cache hands to the platform to be shaped,
/// because neither this frame nor the last one had them, and times them.
///
/// The line layout cache only remembers the lines of this frame and the last
/// one. Numbers that change every frame, like prices, keep coming back to
/// values they had a few frames ago, and a row scrolled out comes back with
/// the same text. So the lines shaped recently are kept here too, in
/// [`RecentShapes`], and a line found there is copied instead of shaped again.
#[derive(Default)]
pub(crate) struct LineShaping {
    /// Lines shaped lately, answered without asking the platform again.
    recent: Mutex<RecentShapes>,
    /// Numbers put together from their glyphs rather than shaped by the
    /// platform.
    numbers: Mutex<crate::fast::number_shaping::NumberShaping>,
    /// Lines handed to the platform to be shaped. See [`LineShaping::stats`].
    lines_shaped: AtomicU64,
    /// Time spent in those calls, in nanoseconds.
    shape_nanos: AtomicU64,
    /// Whether to time shaping, which it does once the stats have been reset.
    shape_timed: AtomicBool,
}

impl LineShaping {
    /// How many lines have been shaped, and how long that took, since the last
    /// [`LineShaping::reset`]. A line answered from the cache is not counted,
    /// so this is the text work the cache failed to save.
    #[cfg(any(test, feature = "harness"))]
    pub(crate) fn stats(&self) -> (u64, std::time::Duration) {
        (
            self.lines_shaped.load(Ordering::Relaxed),
            std::time::Duration::from_nanos(self.shape_nanos.load(Ordering::Relaxed)),
        )
    }

    /// Zeroes the counters reported by [`LineShaping::stats`], and from then
    /// on times shaping too.
    #[cfg(any(test, feature = "harness"))]
    pub(crate) fn reset(&self) {
        self.lines_shaped.store(0, Ordering::Relaxed);
        self.shape_nanos.store(0, Ordering::Relaxed);
        self.shape_timed.store(true, Ordering::Relaxed);
    }

    /// Shapes a line the cache does not have, counting it, unless it was
    /// shaped lately and can be copied from [`RecentShapes`].
    pub(crate) fn shape_line(
        &self,
        platform_text_system: &dyn PlatformTextSystem,
        text: &str,
        font_size: Pixels,
        runs: &[FontRun],
        base_direction: crate::BaseDirection,
    ) -> LineLayout {
        let hash = RecentShapes::hash(text, font_size, runs, base_direction);
        if let Some(layout) = self
            .recent
            .lock()
            .get(hash, text, font_size, runs, base_direction)
        {
            return layout;
        }
        let layout =
            self.shape_line_uncached(platform_text_system, text, font_size, runs, base_direction);
        self.recent.lock().insert(
            hash,
            text,
            font_size,
            runs,
            base_direction,
            copy_layout(&layout),
        );
        layout
    }

    fn shape_line_uncached(
        &self,
        platform_text_system: &dyn PlatformTextSystem,
        text: &str,
        font_size: Pixels,
        runs: &[FontRun],
        base_direction: crate::BaseDirection,
    ) -> LineLayout {
        let started_at = self.shape_timed.load(Ordering::Relaxed).then(Instant::now);
        let layout = if base_direction == crate::BaseDirection::Ltr {
            self.numbers
                .lock()
                .shape(platform_text_system, text, font_size, runs)
        } else {
            None
        }
        .unwrap_or_else(|| {
            platform_text_system.layout_line_with_direction(text, font_size, runs, base_direction)
        });
        self.lines_shaped.fetch_add(1, Ordering::Relaxed);
        if let Some(started_at) = started_at {
            self.shape_nanos
                .fetch_add(started_at.elapsed().as_nanos() as u64, Ordering::Relaxed);
        }
        layout
    }
}

/// Bumped whenever fonts are added to a text system, which can change how a
/// line already shaped would shape now (a fallback font it lacked).
static FONTS_GENERATION: AtomicU64 = AtomicU64::new(0);

/// How many times fonts have been added to a text system.
pub(crate) fn fonts_generation() -> u64 {
    FONTS_GENERATION.load(Ordering::Relaxed)
}

/// Called when fonts are added to a text system, so no line shaped before is
/// taken from [`RecentShapes`] again.
#[inline(always)]
pub(crate) fn fonts_changed() {
    FONTS_GENERATION.fetch_add(1, Ordering::Relaxed);
}

/// How many glyphs the lines of one generation of [`RecentShapes`] may hold
/// before it becomes the old one, which bounds what it keeps to about a
/// megabyte. Between one and two generations' worth of the most recently used
/// lines are remembered: some two thousand short numbers, or a few hundred
/// lines of prose.
pub(crate) const RECENT_GLYPHS_PER_GENERATION: usize = 16 * 1024;

/// A line shaped lately: what it was shaped from, and what that gave.
struct RecentShape {
    text: Box<str>,
    font_size: Pixels,
    runs: SmallVec<[FontRun; 1]>,
    base_direction: crate::BaseDirection,
    layout: LineLayout,
}

/// The lines shaped lately, in two generations: lines are added to the
/// current one, and a line found in the old one moves to the current one.
/// When the current generation is full, the old one is dropped and the
/// current one takes its place, so the lines not used for the longest go.
#[derive(Default)]
pub(crate) struct RecentShapes {
    current: FxHashMap<u64, SmallVec<[RecentShape; 1]>>,
    /// The glyphs in `current`, counting each line at least as one.
    current_glyphs: usize,
    old: FxHashMap<u64, SmallVec<[RecentShape; 1]>>,
    fonts_generation: u64,
}

impl RecentShapes {
    pub(crate) fn hash(
        text: &str,
        font_size: Pixels,
        runs: &[FontRun],
        base_direction: crate::BaseDirection,
    ) -> u64 {
        let mut hasher = FxHasher::default();
        text.hash(&mut hasher);
        font_size.0.to_bits().hash(&mut hasher);
        runs.hash(&mut hasher);
        base_direction.hash(&mut hasher);
        hasher.finish()
    }

    pub(crate) fn get(
        &mut self,
        hash: u64,
        text: &str,
        font_size: Pixels,
        runs: &[FontRun],
        base_direction: crate::BaseDirection,
    ) -> Option<LineLayout> {
        let fonts_generation = FONTS_GENERATION.load(Ordering::Relaxed);
        if fonts_generation != self.fonts_generation {
            self.current.clear();
            self.current_glyphs = 0;
            self.old.clear();
            self.fonts_generation = fonts_generation;
            return None;
        }
        let matches = |shape: &RecentShape| {
            &*shape.text == text
                && shape.font_size.0.to_bits() == font_size.0.to_bits()
                && shape.runs.as_slice() == runs
                && shape.base_direction == base_direction
        };
        if let Some(shape) = self
            .current
            .get(&hash)
            .and_then(|shapes| shapes.iter().find(|shape| matches(shape)))
        {
            return Some(copy_layout(&shape.layout));
        }
        let shapes = self.old.get_mut(&hash)?;
        let ix = shapes.iter().position(matches)?;
        let shape = shapes.swap_remove(ix);
        if shapes.is_empty() {
            self.old.remove(&hash);
        }
        let layout = copy_layout(&shape.layout);
        self.push(hash, shape);
        Some(layout)
    }

    pub(crate) fn insert(
        &mut self,
        hash: u64,
        text: &str,
        font_size: Pixels,
        runs: &[FontRun],
        base_direction: crate::BaseDirection,
        layout: LineLayout,
    ) {
        if self.fonts_generation != FONTS_GENERATION.load(Ordering::Relaxed) {
            return;
        }
        self.push(
            hash,
            RecentShape {
                text: text.into(),
                font_size,
                runs: SmallVec::from(runs),
                base_direction,
                layout,
            },
        );
    }

    fn push(&mut self, hash: u64, shape: RecentShape) {
        if self.current_glyphs >= RECENT_GLYPHS_PER_GENERATION {
            self.old = mem::take(&mut self.current);
            self.current_glyphs = 0;
        }
        self.current_glyphs += shape
            .layout
            .runs
            .iter()
            .map(|run| run.glyphs.len())
            .sum::<usize>()
            .max(1);
        self.current.entry(hash).or_default().push(shape);
    }
}

/// A copy of a shaped line. (`LineLayout` is public, and cloning it isn't
/// part of upstream's API.)
fn copy_layout(layout: &LineLayout) -> LineLayout {
    // Destructured, so that a field upstream adds can't be missed here.
    let LineLayout {
        font_size,
        width,
        ascent,
        descent,
        runs,
        len,
        base_direction,
    } = layout;
    LineLayout {
        font_size: *font_size,
        width: *width,
        ascent: *ascent,
        descent: *descent,
        runs: runs.clone(),
        len: *len,
        base_direction: *base_direction,
    }
}

/// Shapes a line `cache` does not have, counting it. See [`LineShaping`].
#[inline(always)]
pub(crate) fn shape_line(
    cache: &LineLayoutCache,
    text: &str,
    font_size: Pixels,
    runs: &[FontRun],
    base_direction: crate::BaseDirection,
) -> LineLayout {
    cache.shaping.shape_line(
        &*cache.platform_text_system,
        text,
        font_size,
        runs,
        base_direction,
    )
}

/// The decoration runs of a line about to be measured. Most lines carry one
/// decoration run, and highlighted ones a handful; reserving for the worst
/// case, as upstream does, allocated two kilobytes on every measurement, which
/// is much of what a short line costs.
#[inline(always)]
pub(crate) fn decoration_runs() -> Vec<DecorationRun> {
    Vec::with_capacity(4)
}

/// Whether two decoration runs decorate alike, so a line measured with one
/// can be reused for the other.
impl PartialEq for DecorationRun {
    fn eq(&self, other: &Self) -> bool {
        // Destructured, so that a field upstream adds can't be missed here.
        let DecorationRun {
            len,
            color,
            background_color,
            underline,
            strikethrough,
        } = self;
        *len == other.len
            && *color == other.color
            && *background_color == other.background_color
            && *underline == other.underline
            && *strikethrough == other.strikethrough
    }
}

/// Where each of the line layout cache's lists stood, compared to tell
/// whether a reused range of lines is the one recorded.
impl PartialEq for LineLayoutIndex {
    fn eq(&self, other: &Self) -> bool {
        let LineLayoutIndex {
            font_generation,
            lines_index,
            wrapped_lines_index,
        } = self;
        *font_generation == other.font_generation
            && *lines_index == other.lines_index
            && *wrapped_lines_index == other.wrapped_lines_index
    }
}

impl std::fmt::Debug for LineLayoutIndex {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let LineLayoutIndex {
            font_generation,
            lines_index,
            wrapped_lines_index,
        } = self;
        f.debug_struct("LineLayoutIndex")
            .field("font_generation", font_generation)
            .field("lines_index", lines_index)
            .field("wrapped_lines_index", wrapped_lines_index)
            .finish()
    }
}

impl WindowTextSystem {
    /// Lines shaped by the platform, and the time that took, since the last
    /// [`Self::reset_shaping_stats`]. Lines answered from the cache do not count.
    #[cfg(any(test, feature = "harness"))]
    pub(crate) fn shaping_stats(&self) -> (u64, std::time::Duration) {
        self.line_layout_cache.shaping.stats()
    }

    /// Zeroes the counters reported by [`Self::shaping_stats`].
    #[cfg(any(test, feature = "harness"))]
    pub(crate) fn reset_shaping_stats(&self) {
        self.line_layout_cache.shaping.reset()
    }
}

/// How many fonts [`resolve_font`] remembers, most recently resolved last.
const RESOLVED_FONTS: usize = 16;

/// A font resolved lately: the text system that resolved it, the fonts
/// generation it was resolved in, the font asked for and what it resolved to.
struct ResolvedFont {
    text_system: std::sync::Weak<dyn PlatformTextSystem>,
    generation: u64,
    font: crate::Font,
    font_id: crate::FontId,
}

thread_local! {
    static RESOLVED: std::cell::RefCell<SmallVec<[ResolvedFont; RESOLVED_FONTS]>> =
        const { std::cell::RefCell::new(SmallVec::new_const()) };
}

/// Resolves `font` as [`TextSystem::resolve_font`] does, remembering the few
/// fonts resolved lately: every run of every line shaped asks for its font,
/// and looking it up hashes the font and takes a lock each time, where a
/// frame's text uses a handful of fonts.
#[inline]
pub(crate) fn resolve_font(text_system: &crate::TextSystem, font: &crate::Font) -> crate::FontId {
    let generation = FONTS_GENERATION.load(Ordering::Relaxed);
    let platform = &text_system.platform_text_system;
    let remembered = RESOLVED.with_borrow(|resolved| {
        resolved.iter().rev().find_map(|entry| {
            (entry.generation == generation
                && entry.text_system.strong_count() > 0
                && std::ptr::addr_eq(entry.text_system.as_ptr(), Arc::as_ptr(platform))
                && entry.font == *font)
                .then_some(entry.font_id)
        })
    });
    if let Some(font_id) = remembered {
        return font_id;
    }
    let font_id = resolve_font_uncached(text_system, font);
    RESOLVED.with_borrow_mut(|resolved| {
        if resolved.len() == RESOLVED_FONTS {
            resolved.remove(0);
        }
        resolved.push(ResolvedFont {
            text_system: Arc::downgrade(platform),
            generation,
            font: font.clone(),
            font_id,
        });
    });
    font_id
}

/// [`TextSystem::resolve_font`]: the font, or else the first of the
/// fallbacks that resolves with the features asked for, or else upstream's
/// plain fallback.
///
/// Upstream resolves a fallback as the fallback stack names it, plain: its
/// features — tabular numerals, say — dropped, so digits of a family that
/// isn't installed took their proportional widths, and a ticking price
/// changed width, and laid out its row again, every time it changed. The
/// fallback's weight and style stay upstream's.
fn resolve_font_uncached(text_system: &crate::TextSystem, font: &crate::Font) -> crate::FontId {
    if let Some(
        crate::text_system::CachedFont::Direct(font_id)
        | crate::text_system::CachedFont::Fallback(font_id),
    ) = text_system.font_ids_by_font.read().get(font)
    {
        return *font_id;
    }
    let mut font_error = None;
    if let Some(font_id) = cached_font_id(text_system, font, font, &mut font_error) {
        return font_id;
    }
    for fallback in &text_system.fallback_font_stack {
        let as_asked = crate::Font {
            features: font.features.clone(),
            ..fallback.clone()
        };
        if let Some(font_id) = cached_font_id(text_system, &as_asked, font, &mut font_error) {
            if let Some(error) = font_error {
                log::warn!("failed to load font {font:?}: {error:#}");
            }
            text_system.font_ids_by_font.write().insert(
                font.clone(),
                crate::text_system::CachedFont::Fallback(font_id),
            );
            return font_id;
        }
    }
    // No fallback has the font as asked: upstream's resolution takes the
    // first fallback as the stack names it, or panics.
    text_system.resolve_font_uncached(font)
}

/// `candidate`'s own font id, looked up once per text system and remembered
/// in upstream's cache, misses included. Only a miss for the font `asked`
/// for is reported, as upstream reports only explicitly requested fonts.
fn cached_font_id(
    text_system: &crate::TextSystem,
    candidate: &crate::Font,
    asked: &crate::Font,
    font_error: &mut Option<Arc<anyhow::Error>>,
) -> Option<crate::FontId> {
    use crate::text_system::CachedFont;
    let cached = text_system.font_ids_by_font.read().get(candidate).cloned();
    let cached = cached.unwrap_or_else(|| {
        let cached = match text_system.platform_text_system.font_id(candidate) {
            Ok(font_id) => CachedFont::Direct(font_id),
            Err(error) => CachedFont::Missing(Arc::new(error)),
        };
        text_system
            .font_ids_by_font
            .write()
            .insert(candidate.clone(), cached.clone());
        cached
    });
    match cached {
        CachedFont::Direct(font_id) => Some(font_id),
        CachedFont::Fallback(_) => None,
        CachedFont::Missing(error) => {
            if candidate == asked {
                *font_error = Some(error);
            }
            None
        }
    }
}
