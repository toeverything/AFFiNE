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

use crate::{App, Bounds, CursorStyle, EntityId, Hitbox, HitboxBehavior, TextLayout, Window, size};
use std::ops::Range;

/// The hitboxes an interactive text inserted over its clickable ranges as it
/// prepainted, which it sets the hand for as it paints.
#[derive(Default)]
pub(crate) struct ClickableHitboxes(Vec<Hitbox>);

/// Inserts a hitbox over each visual stretch of `layout`, prepainted, covering
/// `ranges`, aligned with both Bidi `visual_rows` and LTR `wrap_boundaries`.
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
    let mut local_ranges: Vec<Range<usize>> = Vec::new();
    for line in &inner.lines {
        let line_end_ix = line_start_ix + line.len();
        local_ranges.clear();
        for range in &ranges {
            if range.end <= line_start_ix {
                continue;
            }
            if range.start >= line_end_ix {
                break;
            }
            local_ranges.push(
                range.start.saturating_sub(line_start_ix)
                    ..(range.end.min(line_end_ix) - line_start_ix),
            );
        }
        if !local_ranges.is_empty() {
            for rect in line.selection_rects_for_ranges(&local_ranges, line_height) {
                let row_ix = (rect.origin.y / line_height).round() as usize;
                let align_x = line.row_align_offset(row_ix, inner.text_align, bounds.size.width);
                let stretch = Bounds::new(
                    crate::point(
                        line_origin.x + rect.origin.x + align_x,
                        line_origin.y + rect.origin.y,
                    ),
                    size(rect.size.width, line_height),
                )
                .intersect(&bounds);
                if !stretch.is_empty() {
                    hitboxes
                        .0
                        .push(window.insert_hitbox(stretch, HitboxBehavior::Normal));
                }
            }
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

/// `ranges` put in order, empty ones dropped, and merged where they meet.
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
