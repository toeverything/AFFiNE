//! Truncation that fits the text as shaped.
//!
//! The line wrapper truncates by adding up the widths of characters shaped
//! one at a time. Shaped together, characters can take more room than that:
//! CoreText sets CJK punctuation such as `：` or `（` half width on its own
//! and close to full width between ideographs, so a Chinese sentence with a
//! few of them comes out several characters wider than the sum. Text cut by
//! the sum then still overflows its box, and the box clips the ellipsis away.
//!
//! So the text the line wrapper cut is shaped (the element shapes it next
//! anyway, so this costs nothing more), and only when it still does not fit
//! is the cut moved: a binary search over how many characters to keep,
//! shaping each candidate. Text whose shaped width is no more than the sum,
//! which is most Latin text, is truncated exactly as the line wrapper did.

use crate::gpui_util::ResultExt as _;
use crate::text_system::{update_runs_after_middle_truncation, update_runs_after_truncation};
use crate::{Pixels, SharedString, TextRun, TruncateFrom, Window, WrappedLine};
use std::borrow::Cow;

/// The room truncated text has to fit in.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Room {
    /// One line no wider than this.
    Line(Pixels),
    /// At most `max_lines` lines, wrapped at `wrap_width`.
    Lines {
        wrap_width: Pixels,
        max_lines: usize,
    },
}

/// `truncated`, which the line wrapper cut from `text` and `runs` with
/// `affix`, if it fits in `room` once shaped; otherwise `text` cut further,
/// keeping as many characters as fit.
#[allow(clippy::too_many_arguments)]
pub(crate) fn fit<'a>(
    text: &SharedString,
    runs: &'a [TextRun],
    truncated: (SharedString, Cow<'a, [TextRun]>),
    affix: &str,
    truncate_from: TruncateFrom,
    room: Room,
    font_size: Pixels,
    window: &Window,
) -> (SharedString, Cow<'a, [TextRun]>) {
    if fits(&truncated.0, &truncated.1, room, font_size, window) {
        return truncated;
    }

    // Keeping as many characters as the line wrapper did overflows; keeping
    // none leaves the affix alone, which is as short as truncation gets.
    let mut overflows = if truncated.0 == *text {
        text.chars().count()
    } else {
        truncated
            .0
            .chars()
            .count()
            .saturating_sub(affix.chars().count())
    };
    let mut fitting = 0;
    while fitting + 1 < overflows {
        let kept = (fitting + overflows) / 2;
        let (candidate, candidate_runs) = keep(text, runs, kept, affix, truncate_from);
        if fits(&candidate, &candidate_runs, room, font_size, window) {
            fitting = kept;
        } else {
            overflows = kept;
        }
    }
    let (text, runs) = keep(text, runs, fitting, affix, truncate_from);
    (text, Cow::Owned(runs))
}

/// `text` truncated with `affix` to `kept` of its characters, the way the
/// line wrapper truncates: from the end, cut back past whitespace and ASCII
/// punctuation; from the start; or in the middle, keeping two thirds of them
/// before the affix.
fn keep(
    text: &str,
    runs: &[TextRun],
    kept: usize,
    affix: &str,
    truncate_from: TruncateFrom,
) -> (SharedString, Vec<TextRun>) {
    let mut runs = runs.to_vec();
    match truncate_from {
        TruncateFrom::End => {
            let kept = text[..first_chars(text, kept)]
                .trim_end_matches(|c: char| c.is_whitespace() || c.is_ascii_punctuation());
            let result = SharedString::from(format!("{kept}{affix}"));
            update_runs_after_truncation(&result, affix, &mut runs, TruncateFrom::End);
            (result, runs)
        }
        TruncateFrom::Start => {
            let result = SharedString::from(format!("{affix}{}", &text[last_chars(text, kept)..]));
            update_runs_after_truncation(&result, affix, &mut runs, TruncateFrom::Start);
            (result, runs)
        }
        TruncateFrom::Middle => {
            let front = (kept * 2).div_ceil(3);
            let front_end = first_chars(text, front);
            let back_start = last_chars(text, kept - front).max(front_end);
            let result = SharedString::from(format!(
                "{}{affix}{}",
                &text[..front_end],
                &text[back_start..]
            ));
            update_runs_after_middle_truncation(affix, &mut runs, front_end, back_start);
            (result, runs)
        }
    }
}

/// The byte offset just past the first `count` characters of `text`.
fn first_chars(text: &str, count: usize) -> usize {
    text.char_indices()
        .nth(count)
        .map_or(text.len(), |(index, _)| index)
}

/// The byte offset at which the last `count` characters of `text` start.
fn last_chars(text: &str, count: usize) -> usize {
    match count.checked_sub(1) {
        None => text.len(),
        Some(skip) => text
            .char_indices()
            .rev()
            .nth(skip)
            .map_or(0, |(index, _)| index),
    }
}

/// Whether `text` shaped with `runs` fits in `room`. Text that cannot be
/// shaped is taken to fit, so it is left as it is.
fn fits(
    text: &SharedString,
    runs: &[TextRun],
    room: Room,
    font_size: Pixels,
    window: &Window,
) -> bool {
    match room {
        Room::Line(width) => window
            .text_system()
            .shape_text(text.clone(), font_size, runs, None, None)
            .log_err()
            .is_none_or(|lines| {
                lines
                    .iter()
                    .all(|line| line.unwrapped_layout.width <= width)
            }),
        // Shaped as the element shapes it, clamped, so that text that does
        // not fit spills over on its last line rather than onto more lines.
        Room::Lines {
            wrap_width,
            max_lines,
        } => window
            .text_system()
            .shape_text(
                text.clone(),
                font_size,
                runs,
                Some(wrap_width),
                Some(max_lines),
            )
            .log_err()
            .is_none_or(|lines| {
                let count: usize = lines
                    .iter()
                    .map(|line| line.wrap_boundaries.len() + 1)
                    .sum();
                count <= max_lines
                    && lines
                        .last()
                        .is_none_or(|line| last_line_width(line) <= wrap_width)
            }),
    }
}

/// The width of the last line `line` wraps into.
fn last_line_width(line: &WrappedLine) -> Pixels {
    let layout = &line.unwrapped_layout;
    let start = line
        .wrap_boundaries
        .last()
        .map_or(Pixels::ZERO, |boundary| {
            layout.runs[boundary.run_ix].glyphs[boundary.glyph_ix]
                .position
                .x
        });
    layout.width - start
}
