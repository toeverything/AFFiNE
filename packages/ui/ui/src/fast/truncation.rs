//! Truncation that fits shaped text on valid glyph-cluster boundaries.
//!
//! The line wrapper truncates by summing the advances of characters shaped in
//! isolation. Shaped together, text can differ in both directions:
//! - Contextual forms and CJK punctuation (such as `：` or `（` between
//!   ideographs) can make shaped runs wider than the per-character sum, so a
//!   naive char-sum cut still overflows its container.
//! - Multi-codepoint ligatures (such as Arabic lam-alef `لا`) compress into a
//!   single narrower glyph cluster, so a per-character cut can truncate text
//!   that already fits or split a ligature mid-cluster.
//!
//! [`fit`] extracts valid glyph-cluster byte boundaries from the shaper, maps
//! the line wrapper's char-based cut to a cluster-count seed (`hint_ix`),
//! reconstructs a cluster-aligned candidate via [`keep`], and refines the count
//! with a bidirectional binary search (`fitting` fits, `overflows` overflows).
//! For `TruncateFrom::Middle`, `hint_ix` is an approximate byte-prefix cluster
//! seed that the same binary search refines to a fitting cluster count.

use crate::gpui_util::ResultExt as _;
use crate::text_system::{update_runs_after_middle_truncation, update_runs_after_truncation};
use crate::{BaseDirection, Pixels, SharedString, TextRun, TruncateFrom, Window, WrappedLine};
use std::borrow::Cow;

/// The layout room truncated text must fit within.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Room {
    /// A single line no wider than this pixel budget.
    Line(Pixels),
    /// At most `max_lines` visual lines when wrapped at `wrap_width`.
    Lines {
        wrap_width: Pixels,
        max_lines: usize,
    },
}

/// Refines the line wrapper's `truncated` hint so the returned string and runs
/// fit within `room` once shaped and slice `text` only on valid glyph-cluster
/// boundaries.
#[allow(clippy::too_many_arguments)]
pub(crate) fn fit<'a>(
    text: &SharedString,
    runs: &'a [TextRun],
    truncated: (SharedString, Cow<'a, [TextRun]>),
    affix: &str,
    truncate_from: TruncateFrom,
    room: Room,
    font_size: Pixels,
    base_direction: BaseDirection,
    window: &Window,
) -> (SharedString, Cow<'a, [TextRun]>) {
    let bounds = cluster_boundaries(text, runs, font_size, base_direction, window);
    let total = bounds.len().saturating_sub(1);
    if total == 0 {
        return truncated;
    }

    // Convert the line wrapper's kept byte span into a glyph-cluster count seed.
    let hint_ix = if truncated.0 == *text {
        total
    } else {
        let kept_bytes = truncated.0.len().saturating_sub(affix.len());
        match truncate_from {
            TruncateFrom::End | TruncateFrom::Middle => bounds
                .partition_point(|&b| b <= kept_bytes)
                .saturating_sub(1)
                .min(total),
            TruncateFrom::Start => {
                let start_byte = text.len().saturating_sub(kept_bytes);
                total.saturating_sub(bounds.partition_point(|&b| b < start_byte).min(total))
            }
        }
    };

    // Always rebuild the seed candidate on `bounds` so a mid-ligature cut from
    // the char-by-char wrapper never escapes through the fast return path.
    let (hint_text, hint_runs) = if hint_ix >= total {
        (text.clone(), Cow::Borrowed(runs))
    } else {
        let (cand, cand_runs) = keep(text, runs, &bounds, hint_ix, affix, truncate_from);
        (cand, Cow::Owned(cand_runs))
    };

    let (mut fitting, mut overflows) = if fits(
        &hint_text,
        &hint_runs,
        room,
        font_size,
        base_direction,
        window,
    ) {
        let Some(probe_ix) = next_distinct_kept_clusters(text, &bounds, hint_ix, truncate_from)
        else {
            return (hint_text, hint_runs);
        };
        let (probe_text, probe_runs) = keep(text, runs, &bounds, probe_ix, affix, truncate_from);
        if !fits(
            &probe_text,
            &probe_runs,
            room,
            font_size,
            base_direction,
            window,
        ) {
            return (hint_text, hint_runs);
        }
        (probe_ix, total)
    } else {
        (0, hint_ix)
    };

    while fitting + 1 < overflows {
        let kept = (fitting + overflows) / 2;
        let (candidate, candidate_runs) = keep(text, runs, &bounds, kept, affix, truncate_from);
        if fits(
            &candidate,
            &candidate_runs,
            room,
            font_size,
            base_direction,
            window,
        ) {
            fitting = kept;
        } else {
            overflows = kept;
        }
    }
    let (text, runs) = keep(text, runs, &bounds, fitting, affix, truncate_from);
    (text, Cow::Owned(runs))
}

/// Sorted, deduplicated UTF-8 byte offsets of shaped glyph-cluster starts in
/// `text`, beginning with `0` and ending with `text.len()`. Falls back to
/// `char_indices` if shaping fails.
fn cluster_boundaries(
    text: &SharedString,
    runs: &[TextRun],
    font_size: Pixels,
    base_direction: BaseDirection,
    window: &Window,
) -> Vec<usize> {
    let Some(lines) = window
        .text_system()
        .shape_text_with_direction(text.clone(), font_size, runs, None, None, base_direction)
        .log_err()
    else {
        return text
            .char_indices()
            .map(|(i, _)| i)
            .chain([text.len()])
            .collect();
    };
    let mut bounds = Vec::with_capacity(text.len() / 2 + 2);
    bounds.push(0);
    let mut line_off = 0usize;
    for (line_str, wrapped) in text.split('\n').zip(lines.iter()) {
        for run in &wrapped.unwrapped_layout.runs {
            for glyph in &run.glyphs {
                let rel = glyph.index.min(line_str.len());
                if line_str.is_char_boundary(rel) {
                    bounds.push(line_off + rel);
                }
            }
        }
        let end = line_off + line_str.len();
        bounds.push(end);
        if end < text.len() {
            line_off = end + 1;
            bounds.push(line_off);
        }
    }
    bounds.push(text.len());
    bounds.sort_unstable();
    bounds.dedup();
    bounds
}

fn is_trimmable_end(c: char) -> bool {
    c.is_whitespace() || c.is_ascii_punctuation()
}

/// Advances past consecutive end-trimmable clusters in a single linear byte
/// scan so runs of spaces or ASCII punctuation never allocate intermediate
/// candidates before reaching the first cluster that changes [`keep`]'s output.
fn next_distinct_kept_clusters(
    text: &str,
    bounds: &[usize],
    hint_ix: usize,
    truncate_from: TruncateFrom,
) -> Option<usize> {
    let total = bounds.len().saturating_sub(1);
    if hint_ix >= total {
        return None;
    }
    if !matches!(truncate_from, TruncateFrom::End) {
        return Some(hint_ix + 1);
    }
    let mut ix = hint_ix + 1;
    while ix <= total
        && text[bounds[ix - 1]..bounds[ix]]
            .chars()
            .all(is_trimmable_end)
    {
        ix += 1;
    }
    (ix <= total).then_some(ix)
}

/// Truncates `text` with `affix` to `kept` glyph clusters using `bounds`:
/// - `End`: keeps the first `kept` clusters, trimming trailing whitespace and
///   ASCII punctuation before appending `affix`.
/// - `Start`: prepends `affix` to the last `kept` clusters.
/// - `Middle`: keeps `ceil(2 * kept / 3)` clusters at the front and the
///   remaining `kept - front` clusters at the back around `affix`.
fn keep(
    text: &str,
    runs: &[TextRun],
    bounds: &[usize],
    kept: usize,
    affix: &str,
    truncate_from: TruncateFrom,
) -> (SharedString, Vec<TextRun>) {
    let total = bounds.len().saturating_sub(1);
    let kept = kept.min(total);
    let mut runs = runs.to_vec();
    match truncate_from {
        TruncateFrom::End => {
            let prefix = text[..bounds[kept]].trim_end_matches(is_trimmable_end);
            let result = SharedString::from(format!("{prefix}{affix}"));
            update_runs_after_truncation(&result, affix, &mut runs, TruncateFrom::End);
            (result, runs)
        }
        TruncateFrom::Start => {
            let result = SharedString::from(format!("{affix}{}", &text[bounds[total - kept]..]));
            update_runs_after_truncation(&result, affix, &mut runs, TruncateFrom::Start);
            (result, runs)
        }
        TruncateFrom::Middle => {
            let front = (kept * 2).div_ceil(3);
            let front_end = bounds[front];
            let back_start = bounds[total - (kept - front)].max(front_end);
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

/// Returns `true` when `text` shaped with `runs` and `base_direction` fits
/// within `room`. Unshapeable text is treated as fitting so it is left intact.
pub(crate) fn fits(
    text: &SharedString,
    runs: &[TextRun],
    room: Room,
    font_size: Pixels,
    base_direction: BaseDirection,
    window: &Window,
) -> bool {
    match room {
        Room::Line(width) => window
            .text_system()
            .shape_text_with_direction(text.clone(), font_size, runs, None, None, base_direction)
            .log_err()
            .is_none_or(|lines| {
                lines
                    .iter()
                    .all(|line| line.unwrapped_layout.width <= width)
            }),
        Room::Lines {
            wrap_width,
            max_lines,
        } => window
            .text_system()
            .shape_text_with_direction(
                text.clone(),
                font_size,
                runs,
                Some(wrap_width),
                Some(max_lines),
                base_direction,
            )
            .log_err()
            .is_none_or(|lines| {
                let count: usize = lines
                    .iter()
                    .map(|line| {
                        if !line.visual_rows.is_empty() {
                            line.visual_rows.len()
                        } else {
                            line.wrap_boundaries.len() + 1
                        }
                    })
                    .sum();
                count <= max_lines
                    && lines
                        .last()
                        .is_none_or(|line| last_line_width(line) <= wrap_width)
            }),
    }
}

/// Returns the shaped width of the last visual row in `line`.
fn last_line_width(line: &WrappedLine) -> Pixels {
    if let Some(last_row) = line.visual_rows.last() {
        return last_row.layout.width;
    }
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
