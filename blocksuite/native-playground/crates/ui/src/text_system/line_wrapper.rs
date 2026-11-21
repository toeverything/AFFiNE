use crate::collections::HashMap;
use crate::{FontId, Pixels, SharedString, TextRun, TextSystem, px};
use std::{borrow::Cow, iter, sync::Arc};
use unicode_segmentation::UnicodeSegmentation;

/// Determines whether to truncate text from the start or end.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TruncateFrom {
    /// Truncate text from the start.
    Start,
    /// Truncate text from the end.
    End,
    /// Truncate text from the middle, preserving the start and end.
    Middle,
}

/// Controls how soft-wrapped continuation lines are indented.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum IndentAdjustment {
    /// No indent - continuation lines start at column 0.
    NoIndent,
    /// Match the original line's leading whitespace.
    #[default]
    SameIndent,
    /// Add N extra columns of indent (in space-character widths).
    ExtraColumns(u32),
}

/// The GPUI line wrapper, used to wrap lines of text to a given width.
pub struct LineWrapper {
    text_system: Arc<TextSystem>,
    pub(crate) font_id: FontId,
    pub(crate) font_size: Pixels,
    char_widths: CharWidthCache,
    text_buffer: String,
}

/// Cached character widths for one font and size.
pub(crate) struct CharWidthCache {
    ascii: [Option<Pixels>; 128],
    other: HashMap<char, Pixels>,
}

impl Default for CharWidthCache {
    fn default() -> Self {
        Self {
            ascii: [None; 128],
            other: HashMap::default(),
        }
    }
}

impl LineWrapper {
    /// The maximum indent that can be applied to a line.
    pub const MAX_INDENT: u32 = 256;

    pub(crate) fn new(
        font_id: FontId,
        font_size: Pixels,
        text_system: Arc<TextSystem>,
        char_widths: CharWidthCache,
    ) -> Self {
        Self {
            text_system,
            font_id,
            font_size,
            char_widths,
            text_buffer: String::new(),
        }
    }

    pub(crate) fn into_char_widths(self) -> CharWidthCache {
        self.char_widths
    }

    /// Wrap a line of text to the given width with this wrapper's font and font size.
    pub fn wrap_line<'a>(
        &'a mut self,
        fragments: &'a [LineFragment],
        wrap_width: Pixels,
        indent_adjustment: IndentAdjustment,
    ) -> impl Iterator<Item = Boundary> + 'a {
        let mut width = px(0.);
        let mut first_non_whitespace_ix = None;
        let mut base_indent = None;
        let mut last_candidate_ix = 0;
        let mut last_candidate_width = px(0.);
        let mut last_wrap_ix = 0;
        let mut index = 0;
        let Self {
            text_buffer: text,
            char_widths,
            text_system,
            font_id,
            font_size,
        } = self;
        text.clear();
        for fragment in fragments {
            match fragment {
                LineFragment::Text {
                    text: fragment_text,
                } => text.push_str(fragment_text),
                // This placeholder keeps inline elements attached to adjacent words
                LineFragment::Element { len_utf8, .. } => {
                    text.extend(iter::repeat_n('a', *len_utf8));
                }
            }
        }
        let mut break_indices = Self::break_indices(text).peekable();
        let mut grapheme_indices = text
            .grapheme_indices(true)
            .map(|(index, _)| index)
            .peekable();
        let mut width_for_char = move |character| {
            width_for_char(char_widths, character, text_system, *font_id, *font_size)
        };
        let mut grapheme_index = 0;
        let mut width_before_grapheme = px(0.);
        let mut candidates = fragments
            .iter()
            .flat_map(move |fragment| fragment.wrap_boundary_candidates())
            .peekable();
        iter::from_fn(move || {
            for candidate in candidates.by_ref() {
                let ix = index;
                index += candidate.len_utf8();
                while grapheme_indices
                    .next_if(|position| *position < ix)
                    .is_some()
                {}
                let is_grapheme_boundary = grapheme_indices.next_if_eq(&ix).is_some();
                if is_grapheme_boundary {
                    grapheme_index = ix;
                    width_before_grapheme = width;
                }
                if break_indices.next_if_eq(&ix).is_some()
                    && is_grapheme_boundary
                    && first_non_whitespace_ix.is_some()
                {
                    last_candidate_ix = ix;
                    last_candidate_width = width;
                }
                let item_width = match candidate {
                    WrapBoundaryCandidate::Char { character: c } => {
                        if c == '\n' {
                            continue;
                        }

                        if c != ' ' && first_non_whitespace_ix.is_none() {
                            first_non_whitespace_ix = Some(ix);
                        }

                        width_for_char(c)
                    }
                    WrapBoundaryCandidate::Element {
                        width: element_width,
                        ..
                    } => {
                        if first_non_whitespace_ix.is_none() {
                            first_non_whitespace_ix = Some(ix);
                        }

                        element_width
                    }
                };

                width += item_width;
                if width > wrap_width && grapheme_index > last_wrap_ix {
                    let wrap_at_candidate = last_candidate_ix > last_wrap_ix
                        && width - last_candidate_width <= wrap_width;

                    let carried_width = if wrap_at_candidate {
                        width - last_candidate_width
                    } else {
                        width - width_before_grapheme
                    };

                    // Compute base indentation from the first non-whitespace character on the line
                    // and retain it for all subsequent wrap rows. If the line begins with leading
                    // whitespace that wraps before any non-whitespace character (or is all whitespace),
                    // base_indent remains None so continuation rows within the leading whitespace
                    // do not receive ExtraColumns indentation and degrade into cascading short rows.
                    if base_indent.is_none() {
                        if let Some(first_non_whitespace_ix) = first_non_whitespace_ix {
                            base_indent =
                                Some(Self::MAX_INDENT.min(
                                    first_non_whitespace_ix.saturating_sub(last_wrap_ix) as u32,
                                ));
                        }
                    }

                    let next_indent = match indent_adjustment {
                        IndentAdjustment::NoIndent => 0,
                        IndentAdjustment::SameIndent => base_indent.unwrap_or(0),
                        IndentAdjustment::ExtraColumns(extra) => {
                            if let Some(base_indent) = base_indent {
                                let candidate = base_indent.saturating_add(extra);
                                let candidate_indent_width = width_for_char(' ') * candidate as f32;
                                // Reserve headroom for any carried suffix from an earlier word boundary
                                // (and at least 2 columns for a full-width character) so the continuation
                                // line does not immediately exceed wrap width.
                                let min_headroom = carried_width.max(width_for_char(' ') * 2.0);
                                if candidate_indent_width + min_headroom > wrap_width {
                                    0
                                } else {
                                    Self::MAX_INDENT.min(candidate)
                                }
                            } else {
                                0
                            }
                        }
                    };

                    if wrap_at_candidate {
                        last_wrap_ix = last_candidate_ix;
                        width -= last_candidate_width;
                        width_before_grapheme -= last_candidate_width;
                    } else {
                        // An oversized grapheme stays intact, even if it exceeds the line width.
                        last_wrap_ix = grapheme_index;
                        width -= width_before_grapheme;
                        width_before_grapheme = px(0.);
                    }
                    last_candidate_ix = 0;

                    let indent_width = width_for_char(' ') * next_indent as f32;
                    width += indent_width;
                    width_before_grapheme += indent_width;

                    return Some(Boundary::new(last_wrap_ix, next_indent));
                }
            }

            None
        })
    }

    /// Determines if a line should be truncated based on its width.
    ///
    /// Returns the truncation index in `line`.
    pub fn should_truncate_line(
        &mut self,
        line: &str,
        truncate_width: Pixels,
        truncation_affix: &str,
        truncate_from: TruncateFrom,
    ) -> Option<usize> {
        let mut width = px(0.);
        let suffix_width = truncation_affix
            .chars()
            .map(|c| self.width_for_char(c))
            .fold(px(0.0), |a, x| a + x);
        let mut truncate_ix = 0;

        match truncate_from {
            TruncateFrom::Start => {
                for (ix, c) in line.char_indices().rev() {
                    if width + suffix_width < truncate_width {
                        truncate_ix = ix;
                    }

                    let char_width = self.width_for_char(c);
                    width += char_width;

                    if width.floor() > truncate_width {
                        return Some(truncate_ix);
                    }
                }
            }
            TruncateFrom::End => {
                for (ix, c) in line.char_indices() {
                    if width + suffix_width < truncate_width {
                        truncate_ix = ix;
                    }

                    let char_width = self.width_for_char(c);
                    width += char_width;

                    if width.floor() > truncate_width {
                        return Some(truncate_ix);
                    }
                }
            }
            TruncateFrom::Middle => {}
        }

        None
    }

    fn should_truncate_line_middle(
        &mut self,
        line: &str,
        truncate_width: Pixels,
        truncation_affix: &str,
    ) -> Option<(usize, usize)> {
        let suffix_width = truncation_affix
            .chars()
            .map(|c| self.width_for_char(c))
            .fold(px(0.0), |a, x| a + x);

        let total_width: Pixels = line
            .chars()
            .map(|c| self.width_for_char(c))
            .fold(px(0.0), |a, x| a + x);

        if total_width <= truncate_width {
            return None;
        }

        let content_budget = truncate_width - suffix_width;
        if content_budget <= px(0.) {
            return Some((0, line.len()));
        }

        let front_budget = content_budget * (2.0 / 3.0);
        let back_budget = content_budget - front_budget;

        let mut front_width = px(0.);
        let mut front_end_ix = 0usize;
        for (ix, c) in line.char_indices() {
            let char_width = self.width_for_char(c);
            if front_width + char_width > front_budget {
                break;
            }
            front_width += char_width;
            front_end_ix = ix + c.len_utf8();
        }

        let mut back_width = px(0.);
        let mut back_start_ix = line.len();
        for (ix, c) in line.char_indices().rev() {
            let char_width = self.width_for_char(c);
            if back_width + char_width > back_budget {
                break;
            }
            back_width += char_width;
            back_start_ix = ix;
        }

        if front_end_ix >= back_start_ix {
            return Some((0, line.len()));
        }

        Some((front_end_ix, back_start_ix))
    }

    /// Truncate a line of text to the given width with this wrapper's font and font size.
    pub fn truncate_line<'a>(
        &mut self,
        line: SharedString,
        truncate_width: Pixels,
        truncation_affix: &str,
        runs: &'a [TextRun],
        truncate_from: TruncateFrom,
    ) -> (SharedString, Cow<'a, [TextRun]>) {
        if truncate_from == TruncateFrom::Middle {
            if let Some((front_end_ix, back_start_ix)) =
                self.should_truncate_line_middle(&line, truncate_width, truncation_affix)
            {
                let result = SharedString::from(format!(
                    "{}{truncation_affix}{}",
                    &line[..front_end_ix],
                    &line[back_start_ix..]
                ));
                let mut runs = runs.to_vec();
                update_runs_after_middle_truncation(
                    truncation_affix,
                    &mut runs,
                    front_end_ix,
                    back_start_ix,
                );
                return (result, Cow::Owned(runs));
            } else {
                return (line, Cow::Borrowed(runs));
            }
        }

        if let Some(truncate_ix) =
            self.should_truncate_line(&line, truncate_width, truncation_affix, truncate_from)
        {
            let result = match truncate_from {
                TruncateFrom::Start => SharedString::from(format!(
                    "{truncation_affix}{}",
                    &line[line.ceil_char_boundary(truncate_ix + 1)..]
                )),
                TruncateFrom::End => SharedString::from(format!(
                    "{}{truncation_affix}",
                    line[..truncate_ix]
                        .trim_end_matches(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
                )),
                TruncateFrom::Middle => unreachable!("Middle truncation is handled above"),
            };
            let mut runs = runs.to_vec();
            update_runs_after_truncation(&result, truncation_affix, &mut runs, truncate_from);
            (result, Cow::Owned(runs))
        } else {
            (line, Cow::Borrowed(runs))
        }
    }

    /// Truncate text to fit within a given number of wrapped lines.
    ///
    /// Unlike `truncate_line` which treats the text as a flat width budget
    /// (`width * max_lines`), this method accounts for word-boundary wrapping:
    /// it walks through characters once, tracking wrap boundaries and the
    /// truncation point simultaneously. When text overflows on the last
    /// allowed line, it truncates there and appends the affix.
    ///
    /// For `max_lines == 1`, this delegates to `truncate_line`.
    pub fn truncate_wrapped_line<'a>(
        &mut self,
        text: SharedString,
        wrap_width: Pixels,
        max_lines: usize,
        truncation_affix: &str,
        runs: &'a [TextRun],
        truncate_from: TruncateFrom,
    ) -> (SharedString, Cow<'a, [TextRun]>) {
        if max_lines <= 1 || truncate_from == TruncateFrom::Start {
            return self.truncate_line(
                text,
                wrap_width * max_lines,
                truncation_affix,
                runs,
                truncate_from,
            );
        }
        if truncate_from == TruncateFrom::Middle {
            return self.truncate_line(text, wrap_width, truncation_affix, runs, truncate_from);
        }

        let affix_width: Pixels = truncation_affix
            .chars()
            .map(|c| self.width_for_char(c))
            .sum();

        let mut width = px(0.);
        let mut line = 0usize;
        let mut first_non_whitespace_ix = None;
        let mut last_candidate_ix = 0usize;
        let mut last_candidate_width = px(0.);
        let mut last_wrap_ix = 0usize;
        let mut indent: Option<u32> = None;
        let mut truncate_ix = 0usize;

        let mut break_indices = Self::break_indices(&text).peekable();
        for (ix, c) in text.char_indices() {
            // Consume boundaries on newlines too, so skipping an empty line does not
            // leave the iterator stuck before subsequent text.
            let is_break = break_indices.next_if_eq(&ix).is_some();
            if c == '\n' {
                if line >= max_lines - 1 && !text[ix + 1..].trim().is_empty() {
                    // Newline on the last allowed line with real content
                    // below. Truncate here.
                    let truncated = text[..truncate_ix]
                        .trim_end_matches(|c: char| c.is_whitespace() || c.is_ascii_punctuation());
                    let result = SharedString::from(format!("{truncated}{truncation_affix}"));
                    let mut runs = runs.to_vec();
                    update_runs_after_truncation(
                        &result,
                        truncation_affix,
                        &mut runs,
                        TruncateFrom::End,
                    );
                    return (result, Cow::Owned(runs));
                }

                // Newline before the last line: it consumes a line.
                line += 1;
                width = px(0.);
                first_non_whitespace_ix = None;
                last_candidate_ix = 0;
                last_candidate_width = px(0.);
                last_wrap_ix = ix + 1;
                indent = None;
                truncate_ix = ix + 1;
                continue;
            }

            let char_width = self.width_for_char(c);

            if is_break && first_non_whitespace_ix.is_some() {
                last_candidate_ix = ix;
                last_candidate_width = width;
            }

            if c != ' ' && first_non_whitespace_ix.is_none() {
                first_non_whitespace_ix = Some(ix);
            }

            width += char_width;

            if line < max_lines - 1 {
                // Before the last line: replicate wrap_line's boundary logic.
                if width > wrap_width && ix > last_wrap_ix {
                    if let (None, Some(first_nw)) = (indent, first_non_whitespace_ix) {
                        indent = Some(Self::MAX_INDENT.min((first_nw - last_wrap_ix) as u32));
                    }

                    if last_candidate_ix > last_wrap_ix {
                        last_wrap_ix = last_candidate_ix;
                        width -= last_candidate_width;
                        last_candidate_ix = 0;
                    } else {
                        last_wrap_ix = ix;
                        width = char_width;
                    }

                    if let Some(ind) = indent {
                        width += self.width_for_char(' ') * ind as f32;
                    }

                    line += 1;
                    truncate_ix = last_wrap_ix;
                }
            } else {
                // On the last line: track the furthest point where the affix
                // still fits, and stop as soon as the line overflows.
                if width + affix_width <= wrap_width {
                    truncate_ix = ix + c.len_utf8();
                }

                if width > wrap_width {
                    let truncated = text[..truncate_ix]
                        .trim_end_matches(|c: char| c.is_whitespace() || c.is_ascii_punctuation());
                    let result = SharedString::from(format!("{truncated}{truncation_affix}"));
                    let mut runs = runs.to_vec();
                    update_runs_after_truncation(
                        &result,
                        truncation_affix,
                        &mut runs,
                        TruncateFrom::End,
                    );
                    return (result, Cow::Owned(runs));
                }
            }
        }

        // Text fits within max_lines without truncation.
        drop(break_indices);
        (text, Cow::Borrowed(runs))
    }

    /// The byte offsets in `text` at which a line break is allowed.
    pub(crate) fn break_indices(text: &str) -> impl Iterator<Item = usize> {
        icu_segmenter::LineSegmenter::new_for_non_complex_scripts(Default::default())
            .segment_str(text)
    }

    #[inline(always)]
    fn width_for_char(&mut self, c: char) -> Pixels {
        width_for_char(
            &mut self.char_widths,
            c,
            &self.text_system,
            self.font_id,
            self.font_size,
        )
    }
}

#[inline(always)]
fn width_for_char(
    char_widths: &mut CharWidthCache,
    c: char,
    text_system: &TextSystem,
    font_id: FontId,
    font_size: Pixels,
) -> Pixels {
    if (c as u32) < 128 {
        if let Some(cached_width) = char_widths.ascii[c as usize] {
            cached_width
        } else {
            let width = text_system.layout_width(font_id, font_size, c);
            char_widths.ascii[c as usize] = Some(width);
            width
        }
    } else if let Some(cached_width) = char_widths.other.get(&c) {
        *cached_width
    } else {
        let width = text_system.layout_width(font_id, font_size, c);
        char_widths.other.insert(c, width);
        width
    }
}

pub(crate) fn update_runs_after_truncation(
    result: &str,
    ellipsis: &str,
    runs: &mut Vec<TextRun>,
    truncate_from: TruncateFrom,
) {
    let mut truncate_at = result.len() - ellipsis.len();
    match truncate_from {
        TruncateFrom::Start => {
            for (run_index, run) in runs.iter_mut().enumerate().rev() {
                if run.len <= truncate_at {
                    truncate_at -= run.len;
                } else {
                    run.len = truncate_at + ellipsis.len();
                    runs.splice(..run_index, std::iter::empty());
                    break;
                }
            }
        }
        TruncateFrom::End => {
            for (run_index, run) in runs.iter_mut().enumerate() {
                if run.len <= truncate_at {
                    truncate_at -= run.len;
                } else {
                    run.len = truncate_at + ellipsis.len();
                    runs.truncate(run_index + 1);
                    break;
                }
            }
        }
        TruncateFrom::Middle => {
            unreachable!("Middle truncation calls this function with TruncateFrom::End directly")
        }
    }
}

pub(crate) fn update_runs_after_middle_truncation(
    ellipsis: &str,
    runs: &mut Vec<TextRun>,
    front_end_ix: usize,
    back_start_ix: usize,
) {
    let original_runs = std::mem::take(runs);
    let mut result_runs: Vec<TextRun> = Vec::with_capacity(original_runs.len());

    // Front segment [0, front_end_ix) + ellipsis: walk forward until the run
    // that straddles or ends at front_end_ix, then extend that run's length
    // to include the ellipsis.
    let mut front_remaining = front_end_ix;
    let mut front_done = false;
    for run in &original_runs {
        if front_done {
            break;
        }
        if run.len <= front_remaining {
            result_runs.push(run.clone());
            front_remaining -= run.len;
        } else {
            let mut partial = run.clone();
            partial.len = front_remaining + ellipsis.len();
            result_runs.push(partial);
            front_done = true;
        }
    }
    if !front_done {
        // front_end_ix landed exactly on a run boundary; append ellipsis to
        // the last front run (or, if the front is empty, to the first back run).
        if let Some(last) = result_runs.last_mut() {
            last.len += ellipsis.len();
        } else if let Some(first) = original_runs.first() {
            let mut affix_run = first.clone();
            affix_run.len = ellipsis.len();
            result_runs.push(affix_run);
        }
    }

    // Back segment [back_start_ix, original.len()): skip runs entirely in the
    // removed middle, keep the rest.
    let mut byte_pos = 0usize;
    for run in &original_runs {
        let run_end = byte_pos + run.len;
        if run_end > back_start_ix {
            if byte_pos < back_start_ix {
                // Run straddles back_start_ix; keep only the tail.
                let mut partial = run.clone();
                partial.len = run_end - back_start_ix;
                result_runs.push(partial);
            } else {
                result_runs.push(run.clone());
            }
        }
        byte_pos = run_end;
    }

    *runs = result_runs;
}

/// A fragment of a line that can be wrapped.
pub enum LineFragment<'a> {
    /// A text fragment consisting of characters.
    Text {
        /// The text content of the fragment.
        text: &'a str,
    },
    /// A non-text element with a fixed width.
    Element {
        /// The width of the element in pixels.
        width: Pixels,
        /// The UTF-8 encoded length of the element.
        len_utf8: usize,
    },
}

impl<'a> LineFragment<'a> {
    /// Creates a new text fragment from the given text.
    pub fn text(text: &'a str) -> Self {
        LineFragment::Text { text }
    }

    /// Creates a new non-text element with the given width and UTF-8 encoded length.
    pub fn element(width: Pixels, len_utf8: usize) -> Self {
        LineFragment::Element { width, len_utf8 }
    }

    fn wrap_boundary_candidates(&self) -> impl Iterator<Item = WrapBoundaryCandidate> {
        let text = match self {
            LineFragment::Text { text } => text,
            LineFragment::Element { .. } => "\0",
        };
        text.chars().map(move |character| {
            if let LineFragment::Element { width, len_utf8 } = self {
                WrapBoundaryCandidate::Element {
                    width: *width,
                    len_utf8: *len_utf8,
                }
            } else {
                WrapBoundaryCandidate::Char { character }
            }
        })
    }
}

enum WrapBoundaryCandidate {
    Char { character: char },
    Element { width: Pixels, len_utf8: usize },
}

impl WrapBoundaryCandidate {
    pub fn len_utf8(&self) -> usize {
        match self {
            WrapBoundaryCandidate::Char { character } => character.len_utf8(),
            WrapBoundaryCandidate::Element { len_utf8: len, .. } => *len,
        }
    }
}

/// A boundary between two lines of text.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct Boundary {
    /// The index of the last character in a line
    pub ix: usize,
    /// The indent of the next line.
    pub next_indent: u32,
}

impl Boundary {
    fn new(ix: usize, next_indent: u32) -> Self {
        Self { ix, next_indent }
    }
}
