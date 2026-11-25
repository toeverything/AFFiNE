//! Viewport windowing and scroll-anchor preservation for fixed-height and variable-height lists.

use std::ops::Range;

/// Backing storage for item heights in a [`VirtualList`].
#[derive(Clone, Debug, PartialEq)]
pub enum VirtualListMetrics {
    Fixed {
        count: usize,
        item_height: f32,
    },
    Variable {
        heights: Vec<f32>,
        /// Prefix sums of item heights: `prefix_sums.len() == heights.len() + 1`, `prefix_sums[0] == 0.0`.
        prefix_sums: Vec<f32>,
    },
}

/// Computed viewport slice for one frame of a [`VirtualList`].
#[derive(Clone, Debug, PartialEq)]
pub struct VirtualWindow {
    /// Half-open index range of items to mount (`start..end`).
    pub visible_range: Range<usize>,
    /// Spacer height before `visible_range.start`.
    pub leading_spacer: f32,
    /// Spacer height after `visible_range.end`.
    pub trailing_spacer: f32,
    /// Total scrollable content height.
    pub total_height: f32,
}

/// Reading anchor pinned to an item index and pixel offset within that item.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScrollAnchor {
    pub index: usize,
    pub offset_in_item: f32,
}

/// Deterministic virtualized list model supporting fixed and variable heights with anchor stability.
#[derive(Clone, Debug, PartialEq)]
pub struct VirtualList {
    metrics: VirtualListMetrics,
}

fn sanitize_non_negative(value: f32) -> f32 {
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

fn sanitize_finite(value: f32) -> f32 {
    if value.is_finite() { value } else { 0.0 }
}

impl VirtualList {
    pub fn fixed(count: usize, item_height: f32) -> Self {
        Self {
            metrics: VirtualListMetrics::Fixed {
                count,
                item_height: sanitize_non_negative(item_height),
            },
        }
    }

    pub fn variable(heights: Vec<f32>) -> Self {
        let sanitized: Vec<f32> = heights.into_iter().map(sanitize_non_negative).collect();
        let prefix_sums = build_prefix_sums(&sanitized);
        Self {
            metrics: VirtualListMetrics::Variable {
                heights: sanitized,
                prefix_sums,
            },
        }
    }

    pub fn metrics(&self) -> &VirtualListMetrics {
        &self.metrics
    }

    pub fn len(&self) -> usize {
        match &self.metrics {
            VirtualListMetrics::Fixed { count, .. } => *count,
            VirtualListMetrics::Variable { heights, .. } => heights.len(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn total_height(&self) -> f32 {
        match &self.metrics {
            VirtualListMetrics::Fixed { count, item_height } => *count as f32 * *item_height,
            VirtualListMetrics::Variable { prefix_sums, .. } => {
                prefix_sums.last().copied().unwrap_or(0.0)
            }
        }
    }

    pub fn item_offset(&self, index: usize) -> Option<f32> {
        if index >= self.len() {
            return None;
        }
        match &self.metrics {
            VirtualListMetrics::Fixed { item_height, .. } => Some(index as f32 * *item_height),
            VirtualListMetrics::Variable { prefix_sums, .. } => Some(prefix_sums[index]),
        }
    }

    pub fn item_height(&self, index: usize) -> Option<f32> {
        match &self.metrics {
            VirtualListMetrics::Fixed { count, item_height } => {
                (index < *count).then_some(*item_height)
            }
            VirtualListMetrics::Variable { heights, .. } => heights.get(index).copied(),
        }
    }

    /// Computes the visible index range, leading spacer, trailing spacer, and total height.
    pub fn window(&self, viewport_height: f32, scroll_y: f32, overscan_px: f32) -> VirtualWindow {
        let viewport_height = sanitize_non_negative(viewport_height);
        let scroll_y = sanitize_finite(scroll_y);
        let overscan = sanitize_non_negative(overscan_px);
        let total_height = self.total_height();
        let count = self.len();
        if count == 0 || viewport_height <= 0.0 || total_height <= 0.0 {
            return VirtualWindow {
                visible_range: 0..0,
                leading_spacer: 0.0,
                trailing_spacer: total_height,
                total_height,
            };
        }

        let max_scroll = (total_height - viewport_height).max(0.0);
        let scroll = scroll_y.clamp(0.0, max_scroll);
        let window_start = (scroll - overscan).max(0.0);
        let window_end = (scroll + viewport_height + overscan).min(total_height);

        let (start, end) = match &self.metrics {
            VirtualListMetrics::Fixed { item_height, .. } => {
                if *item_height <= 0.0 {
                    (0, 0)
                } else {
                    let start = ((window_start / *item_height).floor() as usize).min(count);
                    let end = ((window_end / *item_height).ceil() as usize).min(count);
                    (start.min(end), end)
                }
            }
            VirtualListMetrics::Variable { prefix_sums, .. } => {
                let start = first_item_ending_after(prefix_sums, window_start);
                let end = first_item_starting_at_or_after(prefix_sums, window_end);
                (start.min(end), end)
            }
        };

        let leading_spacer = if start < count {
            self.item_offset(start).unwrap_or(total_height)
        } else {
            total_height
        };
        let end_offset = if end < count {
            self.item_offset(end).unwrap_or(total_height)
        } else {
            total_height
        };
        let trailing_spacer = (total_height - end_offset).max(0.0);

        VirtualWindow {
            visible_range: start..end,
            leading_spacer,
            trailing_spacer,
            total_height,
        }
    }

    /// Captures the item and intra-item offset currently aligned with `scroll_y`.
    pub fn capture_anchor(&self, scroll_y: f32) -> Option<ScrollAnchor> {
        let count = self.len();
        if count == 0 {
            return None;
        }
        let clamped_y = sanitize_finite(scroll_y).clamp(0.0, self.total_height());
        let index = match &self.metrics {
            VirtualListMetrics::Fixed { item_height, .. } => {
                if *item_height <= 0.0 {
                    0
                } else {
                    ((clamped_y / *item_height).floor() as usize).min(count - 1)
                }
            }
            VirtualListMetrics::Variable { prefix_sums, .. } => {
                first_item_ending_after(prefix_sums, clamped_y).min(count - 1)
            }
        };
        let start = self.item_offset(index).unwrap_or(0.0);
        Some(ScrollAnchor {
            index,
            offset_in_item: (clamped_y - start).max(0.0),
        })
    }

    /// Resolves `anchor` to a scroll offset that stays inside `index` even after it shrinks.
    fn resolve_anchor_scroll(&self, index: usize, offset_in_item: f32) -> f32 {
        let base = self.item_offset(index).unwrap_or(0.0);
        let item_h = self.item_height(index).unwrap_or(0.0);
        if item_h <= 0.0 {
            return base;
        }
        let offset = sanitize_non_negative(offset_in_item);
        let end = base + item_h;
        if offset >= item_h || base + offset >= end {
            end.next_down().max(base)
        } else {
            base + offset
        }
    }

    /// Inserts items at `at` and returns the adjusted `scroll_y` that preserves `anchor`.
    pub fn insert_items(
        &mut self,
        at: usize,
        new_heights: &[f32],
        anchor: Option<ScrollAnchor>,
    ) -> Option<f32> {
        let insert_at = at.min(self.len());
        match &mut self.metrics {
            VirtualListMetrics::Fixed { count, item_height } => {
                let uniform = new_heights
                    .iter()
                    .all(|&h| (sanitize_non_negative(h) - *item_height).abs() <= f32::EPSILON);
                if uniform {
                    *count += new_heights.len();
                } else {
                    let mut heights = vec![*item_height; *count];
                    heights.splice(
                        insert_at..insert_at,
                        new_heights.iter().copied().map(sanitize_non_negative),
                    );
                    let prefix_sums = build_prefix_sums(&heights);
                    self.metrics = VirtualListMetrics::Variable {
                        heights,
                        prefix_sums,
                    };
                }
            }
            VirtualListMetrics::Variable {
                heights,
                prefix_sums,
            } => {
                heights.splice(
                    insert_at..insert_at,
                    new_heights.iter().copied().map(sanitize_non_negative),
                );
                *prefix_sums = build_prefix_sums(heights);
            }
        }

        let anchor = anchor?;
        if self.is_empty() {
            return Some(0.0);
        }
        let adjusted_index = if insert_at <= anchor.index {
            anchor.index + new_heights.len()
        } else {
            anchor.index
        }
        .min(self.len() - 1);
        Some(self.resolve_anchor_scroll(adjusted_index, anchor.offset_in_item))
    }

    /// Removes `range` of items and returns the adjusted `scroll_y` that preserves `anchor`.
    pub fn remove_items(
        &mut self,
        range: Range<usize>,
        anchor: Option<ScrollAnchor>,
    ) -> Option<f32> {
        let len = self.len();
        let start = range.start.min(len);
        let end = range.end.min(len).max(start);
        let removed = end - start;

        match &mut self.metrics {
            VirtualListMetrics::Fixed { count, .. } => {
                *count -= removed;
            }
            VirtualListMetrics::Variable {
                heights,
                prefix_sums,
            } => {
                heights.drain(start..end);
                *prefix_sums = build_prefix_sums(heights);
            }
        }

        let anchor = anchor?;
        if self.is_empty() {
            return Some(0.0);
        }
        let (adjusted_index, offset) = if anchor.index < start {
            (anchor.index, anchor.offset_in_item)
        } else if anchor.index >= end {
            (anchor.index - removed, anchor.offset_in_item)
        } else {
            (start.min(self.len() - 1), 0.0)
        };
        Some(self.resolve_anchor_scroll(adjusted_index, offset))
    }

    /// Updates a single item's height and returns the adjusted `scroll_y` for `anchor`.
    pub fn set_item_height(
        &mut self,
        index: usize,
        height: f32,
        anchor: Option<ScrollAnchor>,
    ) -> Option<f32> {
        if index >= self.len() {
            return anchor.map(|a| self.resolve_anchor_scroll(a.index, a.offset_in_item));
        }
        let height = sanitize_non_negative(height);
        match &mut self.metrics {
            VirtualListMetrics::Fixed { count, item_height } => {
                if (height - *item_height).abs() > f32::EPSILON {
                    let mut heights = vec![*item_height; *count];
                    heights[index] = height;
                    let prefix_sums = build_prefix_sums(&heights);
                    self.metrics = VirtualListMetrics::Variable {
                        heights,
                        prefix_sums,
                    };
                }
            }
            VirtualListMetrics::Variable {
                heights,
                prefix_sums,
            } => {
                heights[index] = height;
                *prefix_sums = build_prefix_sums(heights);
            }
        }
        let anchor = anchor?;
        Some(self.resolve_anchor_scroll(anchor.index, anchor.offset_in_item))
    }
}

fn build_prefix_sums(heights: &[f32]) -> Vec<f32> {
    let mut sums = Vec::with_capacity(heights.len() + 1);
    let mut acc = 0.0_f32;
    sums.push(0.0);
    for &h in heights {
        acc += h;
        sums.push(acc);
    }
    sums
}

/// First index `i` whose item bottom (`prefix_sums[i + 1]`) is strictly greater than `y`.
fn first_item_ending_after(prefix_sums: &[f32], y: f32) -> usize {
    let count = prefix_sums.len().saturating_sub(1);
    let mut lo = 0;
    let mut hi = count;
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if prefix_sums[mid + 1] <= y {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    lo
}

/// First index `i` whose item top (`prefix_sums[i]`) is at or past `y`.
fn first_item_starting_at_or_after(prefix_sums: &[f32], y: f32) -> usize {
    let count = prefix_sums.len().saturating_sub(1);
    let mut lo = 0;
    let mut hi = count;
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if prefix_sums[mid] < y {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    lo
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_height_window_computes_range_and_spacers() {
        let list = VirtualList::fixed(100, 40.0);
        let cases = [
            (200.0, 0.0, 0.0, 0..5, 0.0, 3800.0),
            (200.0, 400.0, 40.0, 9..16, 360.0, 3360.0),
            (200.0, 9999.0, 80.0, 93..100, 3720.0, 0.0),
        ];

        for (vh, scroll, overscan, expected_range, expected_lead, expected_trail) in cases {
            let win = list.window(vh, scroll, overscan);
            assert_eq!(win.visible_range, expected_range);
            assert_eq!(win.leading_spacer, expected_lead);
            assert_eq!(win.trailing_spacer, expected_trail);
            assert_eq!(win.total_height, 4000.0);
        }
    }

    #[test]
    fn variable_height_window_and_anchor_preservation_across_mutations() {
        let mut list = VirtualList::variable(vec![30.0, 50.0, 40.0, 80.0, 60.0]);
        // Offsets: 0, 30, 80, 120, 200, total = 260
        let win = list.window(100.0, 85.0, 10.0);
        // window_start = 75 -> item 1 ends at 80 > 75 -> start = 1
        // window_end = 195 -> item 4 starts at 200 >= 195 -> end = 4
        assert_eq!(win.visible_range, 1..4);
        assert_eq!(win.leading_spacer, 30.0);
        assert_eq!(win.trailing_spacer, 60.0);
        assert_eq!(win.total_height, 260.0);

        let anchor = list.capture_anchor(92.0).expect("anchor");
        assert_eq!(
            anchor,
            ScrollAnchor {
                index: 2,
                offset_in_item: 12.0
            }
        );

        // Insert 2 items before the anchor (heights 25 and 35 -> +60px).
        let new_scroll = list
            .insert_items(1, &[25.0, 35.0], Some(anchor))
            .expect("adjusted scroll");
        assert_eq!(new_scroll, 152.0);
        assert_eq!(list.item_offset(4), Some(140.0));

        // Remove the two inserted items -> returns to original scroll_y = 92.0.
        let anchor_after = list.capture_anchor(new_scroll).expect("anchor");
        assert_eq!(
            anchor_after,
            ScrollAnchor {
                index: 4,
                offset_in_item: 12.0
            }
        );
        let restored = list
            .remove_items(1..3, Some(anchor_after))
            .expect("restored scroll");
        assert_eq!(restored, 92.0);

        // Removing the anchored item itself snaps cleanly to the replacement item's top.
        let snapped = list.remove_items(2..3, Some(anchor)).expect("snapped");
        assert_eq!(snapped, 80.0);
    }

    #[test]
    fn empty_list_returns_empty_window_and_no_anchor() {
        let list = VirtualList::fixed(0, 44.0);
        assert!(list.is_empty());
        assert_eq!(
            list.window(400.0, 0.0, 40.0),
            VirtualWindow {
                visible_range: 0..0,
                leading_spacer: 0.0,
                trailing_spacer: 0.0,
                total_height: 0.0,
            }
        );
        assert_eq!(list.capture_anchor(0.0), None);
    }

    #[test]
    fn shrinking_anchored_item_keeps_scroll_inside_same_item() {
        let mut list = VirtualList::variable(vec![100.0, 100.0, 100.0]);
        let anchor = list.capture_anchor(80.0).expect("anchor");
        assert_eq!(
            anchor,
            ScrollAnchor {
                index: 0,
                offset_in_item: 80.0,
            }
        );

        let new_scroll = list
            .set_item_height(0, 10.0, Some(anchor))
            .expect("adjusted scroll");
        let after = list.capture_anchor(new_scroll).expect("recaptured anchor");
        assert_eq!(after.index, 0);
        assert!(
            after.offset_in_item >= 0.0 && after.offset_in_item < 10.0,
            "offset_in_item must stay strictly inside shrunk item: {after:?}"
        );
    }

    #[test]
    fn non_finite_inputs_never_produce_nan() {
        let mut list = VirtualList::variable(vec![f32::NAN, 40.0, f32::INFINITY]);
        let win = list.window(f32::NAN, f32::NAN, f32::NAN);
        assert!(!win.leading_spacer.is_nan());
        assert!(!win.trailing_spacer.is_nan());
        assert!(!win.total_height.is_nan());

        let win2 = list.window(100.0, f32::NAN, f32::NAN);
        assert!(!win2.leading_spacer.is_nan());
        assert!(!win2.trailing_spacer.is_nan());

        let anchor = list.capture_anchor(f32::NAN).expect("anchor");
        assert!(!anchor.offset_in_item.is_nan());
        let adjusted = list
            .set_item_height(1, f32::NAN, Some(anchor))
            .expect("adjusted");
        assert!(!adjusted.is_nan());
    }
}
