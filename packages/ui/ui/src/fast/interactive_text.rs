//! Where an interactive text shows the hand: over hitboxes laid over its
//! clickable ranges, rather than where the pointer was as it painted.
//!
//! Upstream's `InteractiveText::paint` reads where the pointer is whenever the
//! text has a click listener, and sets the hand for the text's hitbox when the
//! index under the pointer is in a clickable range. Its mouse-move listener
//! notifies the view whenever that index changes, for the paint to set the
//! hand again. Reading the pointer makes the view painting the text depend on
//! it ([`crate::fast::dependencies::read_pointer`]), so that view is rendered
//! again in every frame drawn after the pointer moved anywhere in the window;
//! the notifications render it again for every character the pointer crosses,
//! over any interactive text; and a frame composited from a scroll layer
//! paints no text again, so a row the wheel brings under a still pointer keeps
//! the hand decided for where the pointer was when the layer was painted.
//!
//! Here the text, as it prepaints, inserts a hitbox over each stretch of a row
//! where [`TextLayout::index_for_position`] finds an index in a clickable
//! range, and sets the hand for those hitboxes as it paints, as an element's
//! cursor style is set. The window picks the cursor by its hit test, so the
//! hand follows the pointer without a frame, stays after keyboard input, and
//! follows what the wheel scrolls under a still pointer, in a frame composited
//! from a scroll layer too. The paint no longer depends on the index under the
//! pointer, so the view is notified of it only for a hover listener.
//!
//! The clicks still go through upstream's code, which finds the index under
//! the pointer as `TextLayout::index_for_position` does: from line to line
//! there, from row to row in `WrappedLineLayout::_index_for_position`, and
//! along a row in `LineLayout::index_for_x`. The stretches follow those steps;
//! when upstream changes them, they are ported here (`docs/upstream-sync.md`).
//!
//! Where one line ends and the next begins, `index_for_position` takes the y
//! for the line above, below its last row, and finds no index there, so
//! upstream shows no hand. A hitbox holds the y it begins at, so the line
//! below's takes it, and the hand shows. Elsewhere the two differ only by
//! rounding: a hitbox's edges are sums in the window, where upstream compares
//! within the line.

use crate::{
    App, Bounds, CursorStyle, EntityId, Hitbox, HitboxBehavior, Pixels, TextLayout, Window,
    WrapBoundary, WrappedLineLayout, point, size,
};
use std::ops::Range;

/// The hitboxes an interactive text inserted over its clickable ranges as it
/// prepainted, which it sets the hand for as it paints.
#[derive(Default)]
pub(crate) struct ClickableHitboxes(Vec<Hitbox>);

/// Inserts a hitbox over each stretch of a row of `layout`, prepainted, where
/// the index under the pointer is in one of `ranges`, within the text's
/// bounds: where upstream sets the hand. The ranges of a text with no click
/// listener are empty.
pub(crate) fn insert_clickable_hitboxes(
    hitboxes: &mut ClickableHitboxes,
    layout: &TextLayout,
    ranges: &[Range<usize>],
    window: &mut Window,
) {
    hitboxes.0.clear();
    let ranges = in_order(ranges);
    if ranges.is_empty() {
        return;
    }
    let inner = layout.0.borrow();
    let Some(inner) = inner.as_ref() else {
        return;
    };
    let Some(bounds) = inner.bounds else {
        return;
    };
    let line_height = inner.line_height;
    let mut line_origin = bounds.origin;
    let mut line_start_ix = 0;
    for line in &inner.lines {
        let line_end_ix = line_start_ix + line.len();
        if touches(&ranges, line_start_ix..line_end_ix) {
            clickable_stretches(
                line,
                line_height,
                |ix| contains(&ranges, line_start_ix + ix),
                |stretch| {
                    let stretch =
                        Bounds::new(line_origin + stretch.origin, stretch.size).intersect(&bounds);
                    if !stretch.is_empty() {
                        hitboxes
                            .0
                            .push(window.insert_hitbox(stretch, HitboxBehavior::Normal));
                    }
                },
            );
        }
        line_origin.y += line.size(line_height).height;
        line_start_ix = line_end_ix + 1;
    }
}

/// Sets the hand for the hitboxes [`insert_clickable_hitboxes`] inserted, as
/// the text paints.
pub(crate) fn set_clickable_cursor(hitboxes: &ClickableHitboxes, window: &mut Window) {
    for hitbox in &hitboxes.0 {
        window.set_cursor_style(CursorStyle::PointingHand, hitbox);
    }
}

/// Notifies `view`, which an interactive text is painted in, that the index
/// under the pointer changed, when the text has a hover listener: what the
/// listener did with it may change what the view renders. Upstream notifies
/// it for every interactive text, for its paint to set the hand again; the
/// hand is set by hitboxes here, and the paint does not depend on the index.
pub(crate) fn notify_hovered_index(has_hover_listener: bool, view: EntityId, cx: &mut App) {
    if has_hover_listener {
        cx.notify(view);
    }
}

/// Calls `stretch` with each stretch of `line`'s rows, in the line's own space
/// (its first row's top left at the origin), where
/// [`WrappedLineLayout::index_for_position`] finds an index that `clickable`
/// takes: each stretch is as tall as a row and holds the y it begins at, and
/// stretches that meet are merged.
pub(crate) fn clickable_stretches(
    line: &WrappedLineLayout,
    line_height: Pixels,
    clickable: impl Fn(usize) -> bool,
    mut stretch: impl FnMut(Bounds<Pixels>),
) {
    let layout = &line.unwrapped_layout;
    let steps = index_steps(line);
    let boundary_x = |boundary: &WrapBoundary| {
        layout.runs[boundary.run_ix].glyphs[boundary.glyph_ix]
            .position
            .x
    };
    for row in 0..=line.wrap_boundaries.len() {
        let start_x = match row {
            0 => Pixels::ZERO,
            row => boundary_x(&line.wrap_boundaries[row - 1]),
        };
        // A row ends at the next wrap boundary, or where `index_for_x` stops
        // finding glyphs, at the line's width, should the shaper place a
        // zero-width boundary past it.
        let end_x = line
            .wrap_boundaries
            .get(row)
            .map_or(layout.width, boundary_x)
            .min(layout.width);
        if start_x >= end_x {
            continue;
        }
        let top = line_height * row as f32;
        let mut emit = |from: Pixels, to: Pixels| {
            stretch(Bounds::new(
                point(from - start_x, top),
                size(to - from, line_height),
            ))
        };
        // The step in effect at the row's start, and the ones after it
        // within the row.
        let first = steps.partition_point(|&(x, _)| x <= start_x);
        let mut index = first.checked_sub(1).map_or(0, |step| steps[step].1);
        let mut from = start_x;
        let mut open = None;
        for &(x, next_index) in steps[first..].iter().take_while(|&&(x, _)| x < end_x) {
            note_piece(&clickable, index, from, &mut open, &mut emit);
            from = x;
            index = next_index;
        }
        note_piece(&clickable, index, from, &mut open, &mut emit);
        if let Some(open) = open {
            emit(open, end_x);
        }
    }
}

/// Opens a stretch at `from`, where a piece of a row with `index` begins, if
/// `clickable` takes it and none is open, or closes the open one there if it
/// does not.
fn note_piece(
    clickable: &impl Fn(usize) -> bool,
    index: usize,
    from: Pixels,
    open: &mut Option<Pixels>,
    emit: &mut impl FnMut(Pixels, Pixels),
) {
    if clickable(index) {
        open.get_or_insert(from);
    } else if let Some(open) = open.take() {
        emit(open, from);
    }
}

/// Where along `line`, unwrapped, the index `LineLayout::index_for_x` finds
/// changes, and the index from there on: the x of each glyph, in order, with
/// the index of the last glyph, in the order the runs hold them, at or before
/// it. Before the first, it finds 0. Taking the glyphs by x rather than in
/// the runs' order finds the same for text running right to left or in both
/// directions.
fn index_steps(line: &WrappedLineLayout) -> Vec<(Pixels, usize)> {
    let mut glyphs: Vec<_> = line
        .unwrapped_layout
        .runs
        .iter()
        .flat_map(|run| &run.glyphs)
        .enumerate()
        .map(|(order, glyph)| (glyph.position.x, order, glyph.index))
        .collect();
    // Stable, so glyphs at the same x stay in the runs' order.
    glyphs.sort_by(|a, b| a.0.0.total_cmp(&b.0.0));
    let mut steps: Vec<(Pixels, usize)> = Vec::with_capacity(glyphs.len());
    let mut latest: Option<usize> = None;
    let mut latest_index = 0;
    for (x, order, index) in glyphs {
        if latest.is_none_or(|latest| order > latest) {
            latest = Some(order);
            latest_index = index;
        }
        match steps.last_mut() {
            Some(step) if step.0 == x => step.1 = latest_index,
            _ => steps.push((x, latest_index)),
        }
    }
    steps
}

/// `ranges` put in order, empty ones dropped, and merged where they meet, so
/// an index is looked up in them by a binary search.
fn in_order(ranges: &[Range<usize>]) -> Vec<Range<usize>> {
    let mut sorted: Vec<_> = ranges
        .iter()
        .filter(|range| range.start < range.end)
        .cloned()
        .collect();
    sorted.sort_unstable_by_key(|range| range.start);
    let mut merged: Vec<Range<usize>> = Vec::with_capacity(sorted.len());
    for range in sorted {
        match merged.last_mut() {
            Some(last) if range.start <= last.end => last.end = last.end.max(range.end),
            _ => merged.push(range),
        }
    }
    merged
}

/// The first of `ranges`, in order, that ends after `ix`.
fn first_ending_after(ranges: &[Range<usize>], ix: usize) -> Option<&Range<usize>> {
    ranges.get(ranges.partition_point(|range| range.end <= ix))
}

/// Whether one of `ranges`, in order, holds `ix`.
fn contains(ranges: &[Range<usize>], ix: usize) -> bool {
    first_ending_after(ranges, ix).is_some_and(|range| range.start <= ix)
}

/// Whether one of `ranges`, in order, holds an index in `span`.
fn touches(ranges: &[Range<usize>], span: Range<usize>) -> bool {
    first_ending_after(ranges, span.start).is_some_and(|range| range.start < span.end)
}
