use crate::collections::{FxHashMap, FxHashSet};
use crate::{
    Bounds, Direction, FontId, GlyphId, Pixels, PlatformTextSystem, Point, SharedString, Size,
    point, px, size,
};
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use std::{
    borrow::Borrow,
    cell::RefCell,
    hash::{Hash, Hasher},
    ops::Range,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use super::LineWrapper;

/// Paragraph base direction for UAX #9 bidirectional layout.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BaseDirection {
    /// Explicit left-to-right base direction.
    #[default]
    Ltr,
    /// Explicit right-to-left base direction.
    Rtl,
    /// Resolve from the first strong directional character in the paragraph (fallback LTR).
    AutoFirstStrong,
}

impl BaseDirection {
    /// Converts to the optional `unicode_bidi::Level` passed to `BidiInfo::new`.
    #[inline]
    pub fn to_bidi_level(self) -> Option<unicode_bidi::Level> {
        match self {
            Self::Ltr => Some(unicode_bidi::Level::ltr()),
            Self::Rtl => Some(unicode_bidi::Level::rtl()),
            Self::AutoFirstStrong => None,
        }
    }
}

/// Caret affinity at a directional or soft-wrap boundary.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CaretAffinity {
    /// Leading edge of the character starting at `offset`.
    #[default]
    Downstream,
    /// Trailing edge of the character ending at `offset`.
    Upstream,
}

/// A visually ordered directional run produced by UAX #9 reordering.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BidiVisualRun {
    /// Byte range within the original paragraph text.
    pub byte_range: Range<usize>,
    /// UAX #9 embedding level (even = LTR, odd = RTL).
    pub bidi_level: u8,
}

/// Returns a leading directional mark (`\u{200E}` LRM or `\u{200F}` RLM) when
/// an explicit `base_direction` disagrees with the first strong directional
/// character of `text`. Returns `None` for `AutoFirstStrong` or when the text
/// already resolves to the requested base direction.
pub(crate) fn bidi_direction_override_mark(
    text: &str,
    base_direction: BaseDirection,
) -> Option<char> {
    let want_rtl = match base_direction {
        BaseDirection::AutoFirstStrong => return None,
        BaseDirection::Ltr => false,
        BaseDirection::Rtl => true,
    };
    let (auto_dir, _) = resolve_paragraph_bidi_levels(text, BaseDirection::AutoFirstStrong);
    if auto_dir.is_rtl() == want_rtl {
        None
    } else if want_rtl {
        Some('\u{200F}')
    } else {
        Some('\u{200E}')
    }
}

/// Removes any glyph produced for a prepended directional mark (`index < mark_len`)
/// and rebases remaining glyph indices and x positions back onto the original text.
pub(crate) fn strip_leading_direction_mark(
    layout: &mut LineLayout,
    mark_len: usize,
    original_len: usize,
) {
    for run in &mut layout.runs {
        run.glyphs.retain_mut(|glyph| {
            if glyph.index < mark_len {
                false
            } else {
                glyph.index -= mark_len;
                true
            }
        });
    }
    layout.runs.retain(|run| !run.glyphs.is_empty());
    let min_x = layout
        .runs
        .iter()
        .flat_map(|run| run.glyphs.iter().map(|g| g.position.x))
        .fold(Pixels::MAX, Pixels::min);
    if min_x != Pixels::MAX && min_x > Pixels::ZERO {
        for glyph in layout.runs.iter_mut().flat_map(|run| &mut run.glyphs) {
            glyph.position.x -= min_x;
        }
        layout.width = (layout.width - min_x).max(Pixels::ZERO);
    }
    layout.len = original_len;
}

/// Computes UAX #9 embedding levels across the entire paragraph `text`.
///
/// Always run this on the whole paragraph before splitting into styled or
/// soft-wrapped visual runs so style boundaries never reset the base direction.
pub fn resolve_paragraph_bidi_levels(
    text: &str,
    base_direction: BaseDirection,
) -> (Direction, Vec<u8>) {
    let bidi = unicode_bidi::BidiInfo::new(text, base_direction.to_bidi_level());
    let resolved_dir = bidi
        .paragraphs
        .first()
        .map(|p| {
            if p.level.is_rtl() {
                Direction::Rtl
            } else {
                Direction::Ltr
            }
        })
        .unwrap_or(match base_direction {
            BaseDirection::Rtl => Direction::Rtl,
            BaseDirection::Ltr | BaseDirection::AutoFirstStrong => Direction::Ltr,
        });
    let levels = bidi.levels.iter().map(|level| level.number()).collect();
    (resolved_dir, levels)
}

/// Reorders `line_range` of a paragraph into visual left-to-right runs using
/// whole-paragraph UAX #9 levels.
pub fn reorder_line_visual_runs(
    text: &str,
    base_direction: BaseDirection,
    line_range: Range<usize>,
) -> Vec<BidiVisualRun> {
    if line_range.is_empty() || text.is_empty() {
        return Vec::new();
    }
    let bidi = unicode_bidi::BidiInfo::new(text, base_direction.to_bidi_level());
    let Some(para) = bidi.paragraphs.first() else {
        return Vec::new();
    };
    let clamped_start = line_range.start.min(text.len());
    let clamped_end = line_range.end.min(text.len());
    if clamped_start >= clamped_end {
        return Vec::new();
    }
    let (levels, runs) = bidi.visual_runs(para, clamped_start..clamped_end);
    runs.into_iter()
        .filter(|range| !range.is_empty())
        .map(|range| {
            let level = levels.get(range.start).map_or(0, |lvl| lvl.number());
            BidiVisualRun {
                byte_range: range,
                bidi_level: level,
            }
        })
        .collect()
}

/// A laid out and styled line of text
#[derive(Clone, Default, Debug)]
pub struct LineLayout {
    /// The font size for this line
    pub font_size: Pixels,
    /// The width of the line
    pub width: Pixels,
    /// The ascent of the line
    pub ascent: Pixels,
    /// The descent of the line
    pub descent: Pixels,
    /// The shaped runs that make up this line
    pub runs: Vec<ShapedRun>,
    /// The length of the line in utf-8 bytes
    pub len: usize,
    /// Resolved paragraph base direction for this line.
    pub base_direction: BaseDirection,
}

/// A run of text that has been shaped.
#[derive(Debug, Clone)]
pub struct ShapedRun {
    /// The font id for this run
    pub font_id: FontId,
    /// The glyphs that make up this run
    pub glyphs: Vec<ShapedGlyph>,
    /// UAX #9 bidi embedding level (even = LTR, odd = RTL).
    pub bidi_level: u8,
}

impl ShapedRun {
    /// Returns true when this run has an odd (RTL) bidi embedding level.
    #[inline]
    pub const fn is_rtl(&self) -> bool {
        self.bidi_level % 2 == 1
    }
}

/// A single glyph, ready to paint.
#[derive(Clone, Debug)]
pub struct ShapedGlyph {
    /// The ID for this glyph, as determined by the text system.
    pub id: GlyphId,

    /// The position of this glyph in its containing line.
    pub position: Point<Pixels>,

    /// The index of this glyph in the original text.
    pub index: usize,

    /// Whether this glyph is an emoji
    pub is_emoji: bool,
}

#[derive(Clone, Copy, Debug)]
struct VisualCluster {
    byte_start: usize,
    byte_end: usize,
    x_start: Pixels,
    x_end: Pixels,
    bidi_level: u8,
}

impl VisualCluster {
    #[inline]
    fn is_rtl(self) -> bool {
        self.bidi_level % 2 == 1
    }

    #[inline]
    fn leading_x(self) -> Pixels {
        if self.is_rtl() {
            self.x_end
        } else {
            self.x_start
        }
    }

    #[inline]
    fn trailing_x(self) -> Pixels {
        if self.is_rtl() {
            self.x_start
        } else {
            self.x_end
        }
    }
}

impl LineLayout {
    /// Builds visual left-to-right grapheme clusters with exact byte ranges and x spans.
    fn visual_clusters(&self) -> Vec<VisualCluster> {
        let mut unique_indices: Vec<usize> = self
            .runs
            .iter()
            .flat_map(|run| run.glyphs.iter().map(|g| g.index))
            .collect();
        if unique_indices.is_empty() {
            return Vec::new();
        }
        unique_indices.sort_unstable();
        unique_indices.dedup();

        let byte_end_for = |start: usize| -> usize {
            match unique_indices.binary_search(&start) {
                Ok(pos) => unique_indices.get(pos + 1).copied().unwrap_or(self.len),
                Err(pos) => unique_indices.get(pos).copied().unwrap_or(self.len),
            }
            .max(start)
        };

        let mut clusters: Vec<VisualCluster> = Vec::with_capacity(unique_indices.len());
        for run in &self.runs {
            for glyph in &run.glyphs {
                if let Some(last) = clusters.last_mut()
                    && last.byte_start == glyph.index
                    && last.bidi_level == run.bidi_level
                {
                    // Combining mark or multi-glyph cluster: keep the leftmost x_start.
                    if glyph.position.x < last.x_start {
                        last.x_start = glyph.position.x;
                    }
                    continue;
                }
                let byte_end = byte_end_for(glyph.index);
                clusters.push(VisualCluster {
                    byte_start: glyph.index,
                    byte_end,
                    x_start: glyph.position.x,
                    x_end: glyph.position.x,
                    bidi_level: run.bidi_level,
                });
            }
        }

        // Platform shapers (such as cosmic-text on RTL paragraphs) may emit runs in
        // logical or right-to-left order rather than ascending visual x order. Sort by
        // visual x_start so x_end computation and hit-testing are always left-to-right.
        clusters.sort_by(|a, b| {
            a.x_start
                .partial_cmp(&b.x_start)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Assign each visual cluster's x_end from the next visual cluster's x_start.
        let count = clusters.len();
        for i in 0..count {
            let next_x = if i + 1 < count {
                clusters[i + 1].x_start
            } else {
                self.width
            };
            clusters[i].x_end = next_x.max(clusters[i].x_start);
        }
        clusters
    }

    /// Stamps UAX #9 `bidi_level` onto every shaped run, splitting runs where the
    /// embedding level changes so each `ShapedRun` has a single uniform level.
    pub fn apply_bidi_levels(&mut self, text: &str, base_direction: BaseDirection) {
        self.base_direction = base_direction;
        if text.is_empty() || self.runs.is_empty() {
            return;
        }
        let (_, levels) = resolve_paragraph_bidi_levels(text, base_direction);
        let mut split_runs = Vec::with_capacity(self.runs.len());
        for run in self.runs.drain(..) {
            for glyph in run.glyphs {
                let level = levels.get(glyph.index).copied().unwrap_or(0);
                if let Some(last) = split_runs.last_mut().filter(|last: &&mut ShapedRun| {
                    last.font_id == run.font_id && last.bidi_level == level
                }) {
                    last.glyphs.push(glyph);
                } else {
                    split_runs.push(ShapedRun {
                        font_id: run.font_id,
                        glyphs: vec![glyph],
                        bidi_level: level,
                    });
                }
            }
        }
        self.runs = split_runs;
    }

    /// Add tracking once per shaped cluster, keeping mark glyphs with their base.
    pub(crate) fn apply_letter_spacing(&mut self, spacing: Pixels) {
        let mut last_index = None;
        let mut shift = Pixels::ZERO;
        for glyph in self.runs.iter_mut().flat_map(|run| &mut run.glyphs) {
            if let Some(previous) = last_index
                && previous != glyph.index
            {
                shift += spacing;
            }
            glyph.position.x += shift;
            last_index = Some(glyph.index);
        }
        if last_index.is_some() {
            self.width = (self.width + shift + spacing).max(Pixels::ZERO);
        }
    }

    /// Returns the caret x coordinate for `offset` using the requested [`CaretAffinity`].
    ///
    /// Safe for mixed LTR/RTL runs and multi-byte grapheme clusters.
    pub fn caret_x_for_index(&self, offset: usize, affinity: CaretAffinity) -> Pixels {
        let clusters = self.visual_clusters();
        if clusters.is_empty() {
            return Pixels::ZERO;
        }
        let clamped = offset.min(self.len);

        if affinity == CaretAffinity::Upstream && clamped > 0 {
            if let Some(cluster) = clusters.iter().find(|c| c.byte_end == clamped) {
                return cluster.trailing_x();
            }
            if let Some(cluster) = clusters
                .iter()
                .find(|c| clamped > c.byte_start && clamped <= c.byte_end)
            {
                return cluster.trailing_x();
            }
        }

        // Downstream (or fallback): leading edge of the cluster covering `clamped`.
        if let Some(cluster) = clusters
            .iter()
            .find(|c| clamped >= c.byte_start && clamped < c.byte_end)
        {
            return cluster.leading_x();
        }

        // At or past end of line: trailing edge of the cluster ending at `self.len`.
        if let Some(cluster) = clusters.iter().find(|c| c.byte_end == self.len) {
            return cluster.trailing_x();
        }

        match self.base_direction {
            BaseDirection::Rtl => Pixels::ZERO,
            BaseDirection::Ltr | BaseDirection::AutoFirstStrong => self.width,
        }
    }

    /// Hit-tests `x` to the nearest grapheme cluster boundary and [`CaretAffinity`].
    ///
    /// Correctly maps odd-level RTL runs in reverse logical order.
    pub fn index_for_x(&self, x: Pixels) -> (usize, CaretAffinity) {
        let clusters = self.visual_clusters();
        if clusters.is_empty() {
            return (0, CaretAffinity::Downstream);
        }

        if x <= clusters[0].x_start {
            let first = clusters[0];
            return if first.is_rtl() {
                (first.byte_end, CaretAffinity::Upstream)
            } else {
                (first.byte_start, CaretAffinity::Downstream)
            };
        }

        if x >= self.width {
            let last = *clusters.last().unwrap();
            return if last.is_rtl() {
                (last.byte_start, CaretAffinity::Downstream)
            } else {
                (last.byte_end, CaretAffinity::Upstream)
            };
        }

        for cluster in &clusters {
            if x >= cluster.x_start && x <= cluster.x_end {
                let mid = (cluster.x_start + cluster.x_end) / 2.0;
                return if x < mid {
                    if cluster.is_rtl() {
                        (cluster.byte_end, CaretAffinity::Upstream)
                    } else {
                        (cluster.byte_start, CaretAffinity::Downstream)
                    }
                } else if cluster.is_rtl() {
                    (cluster.byte_start, CaretAffinity::Downstream)
                } else {
                    (cluster.byte_end, CaretAffinity::Upstream)
                };
            }
        }

        // Fallback to nearest cluster center if gaps exist between clusters.
        let nearest = clusters
            .iter()
            .min_by(|a, b| {
                let da = ((a.x_start + a.x_end) / 2.0 - x).abs();
                let db = ((b.x_start + b.x_end) / 2.0 - x).abs();
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            })
            .copied()
            .unwrap();
        let mid = (nearest.x_start + nearest.x_end) / 2.0;
        if x < mid {
            if nearest.is_rtl() {
                (nearest.byte_end, CaretAffinity::Upstream)
            } else {
                (nearest.byte_start, CaretAffinity::Downstream)
            }
        } else if nearest.is_rtl() {
            (nearest.byte_start, CaretAffinity::Downstream)
        } else {
            (nearest.byte_end, CaretAffinity::Upstream)
        }
    }

    /// Compatibility wrapper returning the cluster start byte index at `x`, or `None` past `width`.
    pub fn legacy_index_for_x(&self, x: Pixels) -> Option<usize> {
        if x >= self.width {
            return None;
        }
        let clusters = self.visual_clusters();
        for cluster in clusters.iter().rev() {
            if cluster.x_start <= x {
                return Some(cluster.byte_start);
            }
        }
        Some(0)
    }

    /// Returns the grapheme boundary closest to `x`.
    pub fn closest_index_for_x(&self, x: Pixels) -> usize {
        self.index_for_x(x).0
    }

    /// Returns the x position of the character at `index` (downstream affinity).
    pub fn x_for_index(&self, index: usize) -> Pixels {
        self.caret_x_for_index(index, CaretAffinity::Downstream)
    }

    /// Returns visual selection rectangles for `range`.
    ///
    /// Selections that cross LTR and RTL runs return multiple disjoint rectangles,
    /// while contiguous clusters in the same direction merge into a single rectangle.
    pub fn selection_rects_for_range(&self, range: Range<usize>) -> SmallVec<[Bounds<Pixels>; 4]> {
        if range.start >= range.end {
            return SmallVec::new();
        }
        let clusters = self.visual_clusters();
        self.selection_rects_from_clusters(&clusters, range)
    }

    fn selection_rects_from_clusters(
        &self,
        clusters: &[VisualCluster],
        range: Range<usize>,
    ) -> SmallVec<[Bounds<Pixels>; 4]> {
        let mut rects: SmallVec<[Bounds<Pixels>; 4]> = SmallVec::new();
        if range.start >= range.end || clusters.is_empty() {
            return rects;
        }
        let height = (self.ascent + self.descent).max(self.font_size);
        let mut last_rtl: Option<bool> = None;

        for &cluster in clusters {
            if cluster.byte_start < range.end && cluster.byte_end > range.start {
                let width = (cluster.x_end - cluster.x_start).max(Pixels::ZERO);
                if let Some(prev) = rects.last_mut()
                    && last_rtl == Some(cluster.is_rtl())
                    && (prev.origin.x + prev.size.width - cluster.x_start).abs() <= px(0.5)
                {
                    prev.size.width = (cluster.x_end - prev.origin.x).max(Pixels::ZERO);
                } else {
                    rects.push(Bounds::new(
                        point(cluster.x_start, Pixels::ZERO),
                        size(width, height),
                    ));
                    last_rtl = Some(cluster.is_rtl());
                }
            } else {
                last_rtl = None;
            }
        }
        rects
    }

    /// Split this layout at a byte index, returning `(prefix, suffix)`.
    ///
    /// Preserves `bidi_level` on every run and handles non-monotonic RTL glyph indices.
    pub fn split_at(&self, byte_index: usize) -> (LineLayout, LineLayout) {
        let byte_index = byte_index.min(self.len);
        let is_monotonic_ltr = self.runs.iter().all(|r| !r.is_rtl())
            && self
                .runs
                .iter()
                .flat_map(|r| r.glyphs.iter().map(|g| g.index))
                .is_sorted();

        if is_monotonic_ltr {
            let x_offset = self.x_for_index(byte_index);
            let mut left_runs = Vec::new();
            let mut right_runs = Vec::new();
            for run in &self.runs {
                let split_pos = run.glyphs.partition_point(|g| g.index < byte_index);
                if split_pos > 0 {
                    left_runs.push(ShapedRun {
                        font_id: run.font_id,
                        glyphs: run.glyphs[..split_pos].to_vec(),
                        bidi_level: run.bidi_level,
                    });
                }
                if split_pos < run.glyphs.len() {
                    let right_glyphs = run.glyphs[split_pos..]
                        .iter()
                        .map(|g| ShapedGlyph {
                            id: g.id,
                            position: point(g.position.x - x_offset, g.position.y),
                            index: g.index - byte_index,
                            is_emoji: g.is_emoji,
                        })
                        .collect();
                    right_runs.push(ShapedRun {
                        font_id: run.font_id,
                        glyphs: right_glyphs,
                        bidi_level: run.bidi_level,
                    });
                }
            }
            return (
                LineLayout {
                    font_size: self.font_size,
                    width: x_offset,
                    ascent: self.ascent,
                    descent: self.descent,
                    runs: left_runs,
                    len: byte_index,
                    base_direction: self.base_direction,
                },
                LineLayout {
                    font_size: self.font_size,
                    width: (self.width - x_offset).max(Pixels::ZERO),
                    ascent: self.ascent,
                    descent: self.descent,
                    runs: right_runs,
                    len: self.len - byte_index,
                    base_direction: self.base_direction,
                },
            );
        }

        // Bidi-safe partitioning preserving visual order and compacting x coordinates.
        let clusters = self.visual_clusters();
        let cluster_width = |index: usize, level: u8| -> Pixels {
            clusters
                .iter()
                .find(|c| c.byte_start == index && c.bidi_level == level)
                .map_or(Pixels::ZERO, |c| c.x_end - c.x_start)
        };

        let mut left_runs = Vec::new();
        let mut right_runs = Vec::new();
        let mut left_x = Pixels::ZERO;
        let mut right_x = Pixels::ZERO;

        for run in &self.runs {
            let mut left_glyphs = Vec::new();
            let mut right_glyphs = Vec::new();
            let mut prev_left_ix = None;
            let mut prev_right_ix = None;
            for glyph in &run.glyphs {
                let advance = cluster_width(glyph.index, run.bidi_level);
                if glyph.index < byte_index {
                    let x = if prev_left_ix == Some(glyph.index) {
                        left_glyphs
                            .last()
                            .map_or(left_x, |g: &ShapedGlyph| g.position.x)
                    } else {
                        let start = left_x;
                        left_x += advance;
                        prev_left_ix = Some(glyph.index);
                        start
                    };
                    left_glyphs.push(ShapedGlyph {
                        id: glyph.id,
                        position: point(x, glyph.position.y),
                        index: glyph.index,
                        is_emoji: glyph.is_emoji,
                    });
                } else {
                    let x = if prev_right_ix == Some(glyph.index) {
                        right_glyphs
                            .last()
                            .map_or(right_x, |g: &ShapedGlyph| g.position.x)
                    } else {
                        let start = right_x;
                        right_x += advance;
                        prev_right_ix = Some(glyph.index);
                        start
                    };
                    right_glyphs.push(ShapedGlyph {
                        id: glyph.id,
                        position: point(x, glyph.position.y),
                        index: glyph.index - byte_index,
                        is_emoji: glyph.is_emoji,
                    });
                }
            }
            if !left_glyphs.is_empty() {
                left_runs.push(ShapedRun {
                    font_id: run.font_id,
                    glyphs: left_glyphs,
                    bidi_level: run.bidi_level,
                });
            }
            if !right_glyphs.is_empty() {
                right_runs.push(ShapedRun {
                    font_id: run.font_id,
                    glyphs: right_glyphs,
                    bidi_level: run.bidi_level,
                });
            }
        }

        (
            LineLayout {
                font_size: self.font_size,
                width: left_x,
                ascent: self.ascent,
                descent: self.descent,
                runs: left_runs,
                len: byte_index,
                base_direction: self.base_direction,
            },
            LineLayout {
                font_size: self.font_size,
                width: right_x,
                ascent: self.ascent,
                descent: self.descent,
                runs: right_runs,
                len: self.len - byte_index,
                base_direction: self.base_direction,
            },
        )
    }

    /// Computes logical soft-wrap boundaries for a bidirectional line and
    /// reorders each resulting row independently with UAX #9 L1/L2 using
    /// whole-paragraph embedding levels.
    pub fn compute_bidi_wrapped_rows(
        &self,
        text: &str,
        wrap_width: Pixels,
        max_lines: Option<usize>,
    ) -> SmallVec<[BidiWrappedRow; 1]> {
        let mut rows: SmallVec<[BidiWrappedRow; 1]> = SmallVec::new();
        let clusters = self.visual_clusters();
        if clusters.is_empty() || text.is_empty() {
            return rows;
        }

        // Order clusters logically by byte_start to compute logical line breaks.
        let mut logical_clusters = clusters.clone();
        logical_clusters.sort_unstable_by_key(|c| c.byte_start);

        let break_set: FxHashSet<usize> = LineWrapper::break_indices(text).collect();

        let mut logical_ranges: SmallVec<[Range<usize>; 2]> = SmallVec::new();
        let mut row_start_ix = 0_usize;
        let mut row_width = Pixels::ZERO;
        let mut last_break_ix: Option<usize> = None;
        let mut i = 0_usize;

        while i < logical_clusters.len() {
            let c = logical_clusters[i];
            let advance = (c.x_end - c.x_start).max(Pixels::ZERO);
            if i > row_start_ix && break_set.contains(&c.byte_start) {
                last_break_ix = Some(i);
            }
            if row_width + advance > wrap_width && i > row_start_ix {
                if let Some(limit) = max_lines
                    && logical_ranges.len() + 1 >= limit
                {
                    break;
                }
                let split_ix = last_break_ix.take().unwrap_or(i);
                let byte_start = logical_clusters[row_start_ix].byte_start;
                let byte_end = logical_clusters[split_ix - 1].byte_end;
                logical_ranges.push(byte_start..byte_end);
                row_start_ix = split_ix;
                row_width = Pixels::ZERO;
                i = split_ix;
                continue;
            }
            row_width += advance;
            i += 1;
        }
        if row_start_ix < logical_clusters.len() {
            let byte_start = logical_clusters[row_start_ix].byte_start;
            let byte_end = logical_clusters.last().map_or(self.len, |c| c.byte_end);
            logical_ranges.push(byte_start..byte_end);
        }

        // Map cluster byte_start -> (font_id, glyphs, advance) in O(N) using a
        // prebuilt advance table instead of scanning `clusters` per glyph.
        let advance_by_byte: FxHashMap<usize, Pixels> = clusters
            .iter()
            .map(|c| (c.byte_start, (c.x_end - c.x_start).max(Pixels::ZERO)))
            .collect();
        let mut glyphs_by_cluster: FxHashMap<usize, (FontId, SmallVec<[ShapedGlyph; 2]>, Pixels)> =
            FxHashMap::default();
        for run in &self.runs {
            for glyph in &run.glyphs {
                let entry = glyphs_by_cluster.entry(glyph.index).or_insert_with(|| {
                    let adv = advance_by_byte
                        .get(&glyph.index)
                        .copied()
                        .unwrap_or(Pixels::ZERO);
                    (run.font_id, SmallVec::new(), adv)
                });
                entry.1.push(glyph.clone());
            }
        }

        // Parse whole-paragraph UAX #9 once and reorder each wrapped row in O(row.len())
        // without cloning the full paragraph `levels` vector per row.
        let bidi = unicode_bidi::BidiInfo::new(text, self.base_direction.to_bidi_level());
        let para_level = bidi
            .paragraphs
            .first()
            .map_or(unicode_bidi::Level::ltr(), |p| p.level);

        for range in logical_ranges {
            let visual_runs = visual_runs_from_levels(
                text,
                &bidi.original_classes,
                &bidi.levels,
                para_level,
                range.clone(),
            );
            let mut row_runs: Vec<ShapedRun> = Vec::with_capacity(visual_runs.len());
            let mut x = Pixels::ZERO;

            for (byte_range, bidi_level) in visual_runs {
                let start_ix =
                    logical_clusters.partition_point(|c| c.byte_start < byte_range.start);
                let mut run_clusters: SmallVec<[usize; 8]> = logical_clusters[start_ix..]
                    .iter()
                    .take_while(|c| c.byte_start < byte_range.end)
                    .map(|c| c.byte_start)
                    .collect();
                if bidi_level % 2 == 1 {
                    run_clusters.reverse();
                }
                for byte_start in run_clusters {
                    let Some((font_id, c_glyphs, advance)) = glyphs_by_cluster.get(&byte_start)
                    else {
                        continue;
                    };
                    let base_x = c_glyphs
                        .iter()
                        .map(|g| g.position.x)
                        .reduce(Pixels::min)
                        .unwrap_or(Pixels::ZERO);
                    for g in c_glyphs {
                        let rel_x = g.position.x - base_x;
                        let positioned = ShapedGlyph {
                            id: g.id,
                            position: point(x + rel_x, g.position.y),
                            index: g.index,
                            is_emoji: g.is_emoji,
                        };
                        if let Some(last) = row_runs
                            .last_mut()
                            .filter(|r| r.font_id == *font_id && r.bidi_level == bidi_level)
                        {
                            last.glyphs.push(positioned);
                        } else {
                            row_runs.push(ShapedRun {
                                font_id: *font_id,
                                glyphs: vec![positioned],
                                bidi_level,
                            });
                        }
                    }
                    x += *advance;
                }
            }

            rows.push(BidiWrappedRow {
                byte_range: range.clone(),
                layout: LineLayout {
                    font_size: self.font_size,
                    width: x,
                    ascent: self.ascent,
                    descent: self.descent,
                    runs: row_runs,
                    len: range.end,
                    base_direction: self.base_direction,
                },
            });
        }
        rows
    }

    pub(crate) fn compute_wrap_boundaries(
        &self,
        text: &str,
        wrap_width: Pixels,
        max_lines: Option<usize>,
        scratch: &mut WrapScratch,
    ) -> SmallVec<[WrapBoundary; 1]> {
        let mut boundaries = SmallVec::new();
        let mut current_segment: Option<Range<usize>> = None;
        let mut last_candidate_ix = None;
        let mut last_candidate_x = px(0.);
        let mut last_boundary = WrapBoundary {
            run_ix: 0,
            glyph_ix: 0,
        };
        let mut last_boundary_x = px(0.);
        // Shaping can combine characters across a line break opportunity, so we ignore those
        // break opportunities that would separate them.
        let WrapScratch {
            glyph_indices,
            break_indices,
        } = scratch;
        glyph_indices.clear();
        glyph_indices.extend(
            self.runs
                .iter()
                .flat_map(|run| run.glyphs.iter().map(|glyph| glyph.index)),
        );
        break_indices.clear();
        break_indices
            .extend(LineWrapper::break_indices(text).filter(|index| glyph_indices.contains(index)));
        let mut glyphs = self
            .runs
            .iter()
            .enumerate()
            .flat_map(move |(run_ix, run)| {
                run.glyphs.iter().enumerate().map(move |(glyph_ix, glyph)| {
                    (
                        WrapBoundary { run_ix, glyph_ix },
                        glyph.index,
                        glyph.position.x,
                    )
                })
            })
            .dedup_by(|(_, previous_index, ..), (_, index, ..)| previous_index == index)
            .peekable();

        while let Some((boundary, index, x)) = glyphs.next() {
            let byte = text.as_bytes()[index];
            if byte == b'\n' {
                continue;
            }

            if byte != b' '
                && current_segment
                    .as_ref()
                    .is_none_or(|segment| !segment.contains(&index))
            {
                // Detect transitions between line-break segments rather than matching glyph
                // indices directly, to accommodate RTL text. Workaround for the lack of complete
                // UAX #9 support.
                let segment = break_indices.partition_point(|break_index| *break_index <= index);
                if current_segment.is_some() {
                    last_candidate_ix = Some(boundary);
                    last_candidate_x = x;
                }
                let start = segment
                    .checked_sub(1)
                    .and_then(|previous| break_indices.get(previous))
                    .copied()
                    .unwrap_or(0);
                let end = break_indices.get(segment).copied().unwrap_or(text.len());
                current_segment = Some(start..end);
            }

            let next_x = glyphs.peek().map_or(self.width, |(_, _, x)| *x);
            let width = next_x - last_boundary_x;

            if width > wrap_width && boundary > last_boundary {
                // When used line_clamp, we should limit the number of lines.
                if let Some(max_lines) = max_lines
                    && boundaries.len() >= max_lines.saturating_sub(1)
                {
                    break;
                }

                if let Some(last_candidate_ix) = last_candidate_ix.take() {
                    last_boundary = last_candidate_ix;
                    last_boundary_x = last_candidate_x;
                } else {
                    last_boundary = boundary;
                    last_boundary_x = x;
                }
                boundaries.push(last_boundary);
            }
        }

        boundaries
    }
}

/// One soft-wrapped row of a bidirectional paragraph, visually reordered per
/// UAX #9 L1/L2 using whole-paragraph embedding levels.
#[derive(Clone, Debug)]
pub struct BidiWrappedRow {
    /// Logical byte range in the unwrapped paragraph covered by this row.
    pub byte_range: Range<usize>,
    /// Visually reordered row layout with x coordinates starting at `0.0`.
    pub layout: LineLayout,
}

/// A line of text that has been wrapped to fit a given width
#[derive(Default, Debug)]
pub struct WrappedLineLayout {
    /// The line layout, pre-wrapping.
    pub unwrapped_layout: Arc<LineLayout>,

    /// The boundaries at which the line was wrapped
    pub wrap_boundaries: SmallVec<[WrapBoundary; 1]>,

    /// The width of the line, if it was wrapped
    pub wrap_width: Option<Pixels>,

    /// Per-row UAX #9 visually reordered layouts for bidirectional wrapped text.
    /// Empty for pure LTR lines.
    pub visual_rows: SmallVec<[BidiWrappedRow; 1]>,
}

/// A boundary at which a line was wrapped
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct WrapBoundary {
    /// The index in the run just before the line was wrapped
    pub run_ix: usize,
    /// The index of the glyph just before the line was wrapped
    pub glyph_ix: usize,
}

impl WrappedLineLayout {
    /// The length of the underlying text, in utf8 bytes.
    #[allow(clippy::len_without_is_empty)]
    pub fn len(&self) -> usize {
        self.unwrapped_layout.len
    }

    /// The width of this line, in pixels, whether or not it was wrapped.
    pub fn width(&self) -> Pixels {
        self.wrap_width
            .unwrap_or(Pixels::MAX)
            .min(self.unwrapped_layout.width)
    }

    /// The size of the whole wrapped text, for the given line_height.
    /// can span multiple lines if there are multiple wrap boundaries.
    pub fn size(&self, line_height: Pixels) -> Size<Pixels> {
        let row_count = if !self.visual_rows.is_empty() {
            self.visual_rows.len()
        } else {
            self.wrap_boundaries.len() + 1
        };
        Size {
            width: self.width(),
            height: line_height * row_count,
        }
    }

    /// The ascent of a line in this layout
    pub fn ascent(&self) -> Pixels {
        self.unwrapped_layout.ascent
    }

    /// The descent of a line in this layout
    pub fn descent(&self) -> Pixels {
        self.unwrapped_layout.descent
    }

    /// The wrap boundaries in this layout
    pub fn wrap_boundaries(&self) -> &[WrapBoundary] {
        &self.wrap_boundaries
    }

    /// The font size of this layout
    pub fn font_size(&self) -> Pixels {
        self.unwrapped_layout.font_size
    }

    /// The runs in this layout, sans wrapping
    pub fn runs(&self) -> &[ShapedRun] {
        &self.unwrapped_layout.runs
    }

    /// The index corresponding to a given position in this layout for the given line height.
    ///
    /// See also [`Self::closest_index_for_position`].
    pub fn index_for_position(
        &self,
        position: Point<Pixels>,
        line_height: Pixels,
    ) -> Result<usize, usize> {
        self._index_for_position(position, line_height, false)
    }

    /// The closest index to a given position in this layout for the given line height.
    ///
    /// Closest means the character boundary closest to the given position.
    ///
    /// See also [`LineLayout::closest_index_for_x`].
    pub fn closest_index_for_position(
        &self,
        position: Point<Pixels>,
        line_height: Pixels,
    ) -> Result<usize, usize> {
        self._index_for_position(position, line_height, true)
    }

    fn _index_for_position(
        &self,
        position: Point<Pixels>,
        line_height: Pixels,
        closest: bool,
    ) -> Result<usize, usize> {
        if !self.visual_rows.is_empty() {
            let row_ix = if position.y < Pixels::ZERO {
                0
            } else {
                (position.y / line_height) as usize
            };
            let Some(row) = self.visual_rows.get(row_ix) else {
                return Err(self.len());
            };
            if position.x < Pixels::ZERO {
                return Err(row.layout.index_for_x(Pixels::ZERO).0);
            }
            if position.x >= row.layout.width {
                return Err(row.layout.index_for_x(row.layout.width).0);
            }
            return if closest {
                Ok(row.layout.closest_index_for_x(position.x))
            } else {
                row.layout
                    .legacy_index_for_x(position.x)
                    .ok_or(row.byte_range.end)
            };
        }

        let wrapped_line_ix = (position.y / line_height) as usize;

        let wrapped_line_start_index;
        let wrapped_line_start_x;
        if wrapped_line_ix > 0 {
            let Some(line_start_boundary) = self.wrap_boundaries.get(wrapped_line_ix - 1) else {
                return Err(0);
            };
            let run = &self.unwrapped_layout.runs[line_start_boundary.run_ix];
            let glyph = &run.glyphs[line_start_boundary.glyph_ix];
            wrapped_line_start_index = glyph.index;
            wrapped_line_start_x = glyph.position.x;
        } else {
            wrapped_line_start_index = 0;
            wrapped_line_start_x = Pixels::ZERO;
        };

        let wrapped_line_end_index;
        let wrapped_line_end_x;
        if wrapped_line_ix < self.wrap_boundaries.len() {
            let next_wrap_boundary_ix = wrapped_line_ix;
            let next_wrap_boundary = self.wrap_boundaries[next_wrap_boundary_ix];
            let run = &self.unwrapped_layout.runs[next_wrap_boundary.run_ix];
            let glyph = &run.glyphs[next_wrap_boundary.glyph_ix];
            wrapped_line_end_index = glyph.index;
            wrapped_line_end_x = glyph.position.x;
        } else {
            wrapped_line_end_index = self.unwrapped_layout.len;
            wrapped_line_end_x = self.unwrapped_layout.width;
        };

        let mut position_in_unwrapped_line = position;
        position_in_unwrapped_line.x += wrapped_line_start_x;
        if position_in_unwrapped_line.x < wrapped_line_start_x {
            Err(wrapped_line_start_index)
        } else if position_in_unwrapped_line.x >= wrapped_line_end_x {
            Err(wrapped_line_end_index)
        } else if closest {
            Ok(self
                .unwrapped_layout
                .closest_index_for_x(position_in_unwrapped_line.x))
        } else {
            // The shaper can place a trailing zero-width wrap boundary glyph slightly past
            // the line's width, so the row can extend past where `legacy_index_for_x` has glyphs.
            self.unwrapped_layout
                .legacy_index_for_x(position_in_unwrapped_line.x)
                .ok_or(wrapped_line_end_index)
        }
    }

    /// Returns the pixel position for the given byte index (bidi-safe across soft wraps).
    pub fn position_for_index(&self, index: usize, line_height: Pixels) -> Option<Point<Pixels>> {
        self.position_for_index_with_affinity(index, CaretAffinity::Downstream, line_height)
    }

    /// Returns the pixel position for `index` and `affinity` across soft-wrapped rows.
    pub fn position_for_index_with_affinity(
        &self,
        index: usize,
        affinity: CaretAffinity,
        line_height: Pixels,
    ) -> Option<Point<Pixels>> {
        if index > self.len() {
            return None;
        }
        if !self.visual_rows.is_empty() {
            let row_ix = if affinity == CaretAffinity::Upstream && index > 0 {
                self.visual_rows
                    .iter()
                    .position(|r| index > r.byte_range.start && index <= r.byte_range.end)
                    .or_else(|| {
                        self.visual_rows
                            .iter()
                            .position(|r| index >= r.byte_range.start && index <= r.byte_range.end)
                    })
                    .unwrap_or(self.visual_rows.len() - 1)
            } else {
                self.visual_rows
                    .iter()
                    .position(|r| index >= r.byte_range.start && index < r.byte_range.end)
                    .or_else(|| {
                        self.visual_rows
                            .iter()
                            .rposition(|r| index <= r.byte_range.end)
                    })
                    .unwrap_or(self.visual_rows.len() - 1)
            };
            let row = &self.visual_rows[row_ix];
            let x = row.layout.caret_x_for_index(index, affinity);
            return Some(point(x, row_ix as f32 * line_height));
        }
        let caret_x = self.unwrapped_layout.caret_x_for_index(index, affinity);
        let row_count = self.wrap_boundaries.len() + 1;
        for row_ix in 0..row_count {
            let row_start_x = if row_ix == 0 {
                Pixels::ZERO
            } else {
                let boundary = self.wrap_boundaries[row_ix - 1];
                self.unwrapped_layout.runs[boundary.run_ix].glyphs[boundary.glyph_ix]
                    .position
                    .x
            };
            let row_end_x = if row_ix < self.wrap_boundaries.len() {
                let boundary = self.wrap_boundaries[row_ix];
                self.unwrapped_layout.runs[boundary.run_ix].glyphs[boundary.glyph_ix]
                    .position
                    .x
            } else {
                self.unwrapped_layout.width
            };
            let is_last_row = row_ix + 1 == row_count;
            let in_row = if is_last_row {
                caret_x >= row_start_x && caret_x <= row_end_x
            } else if affinity == CaretAffinity::Upstream {
                if row_ix == 0 {
                    caret_x >= row_start_x && caret_x <= row_end_x
                } else {
                    caret_x > row_start_x && caret_x <= row_end_x
                }
            } else {
                caret_x >= row_start_x && caret_x < row_end_x
            };
            if in_row {
                let line_y = row_ix as f32 * line_height;
                return Some(point((caret_x - row_start_x).max(Pixels::ZERO), line_y));
            }
        }
        Some(point(
            Pixels::ZERO,
            (row_count.saturating_sub(1)) as f32 * line_height,
        ))
    }

    /// Returns visual selection rectangles across all wrapped rows for `range`.
    pub fn selection_rects_for_range(
        &self,
        range: Range<usize>,
        line_height: Pixels,
    ) -> SmallVec<[Bounds<Pixels>; 4]> {
        self.selection_rects_for_ranges(&[range], line_height)
    }

    /// Batch variant of [`Self::selection_rects_for_range`] that builds each row's
    /// visual cluster table once across all `ranges`.
    pub(crate) fn selection_rects_for_ranges(
        &self,
        ranges: &[Range<usize>],
        line_height: Pixels,
    ) -> SmallVec<[Bounds<Pixels>; 4]> {
        let mut out: SmallVec<[Bounds<Pixels>; 4]> = SmallVec::new();
        if ranges.is_empty() {
            return out;
        }
        if !self.visual_rows.is_empty() {
            for (row_ix, row) in self.visual_rows.iter().enumerate() {
                let clusters = row.layout.visual_clusters();
                let y = row_ix as f32 * line_height;
                for range in ranges {
                    for mut rect in row
                        .layout
                        .selection_rects_from_clusters(&clusters, range.clone())
                    {
                        rect.origin.y += y;
                        out.push(rect);
                    }
                }
            }
            return out;
        }
        let clusters = self.unwrapped_layout.visual_clusters();
        let mut unwrapped_rects: SmallVec<[Bounds<Pixels>; 4]> = SmallVec::new();
        for range in ranges {
            unwrapped_rects.extend(
                self.unwrapped_layout
                    .selection_rects_from_clusters(&clusters, range.clone()),
            );
        }
        if self.wrap_boundaries.is_empty() {
            return unwrapped_rects;
        }
        let row_count = self.wrap_boundaries.len() + 1;
        for row_ix in 0..row_count {
            let row_start_x = if row_ix == 0 {
                Pixels::ZERO
            } else {
                let boundary = self.wrap_boundaries[row_ix - 1];
                self.unwrapped_layout.runs[boundary.run_ix].glyphs[boundary.glyph_ix]
                    .position
                    .x
            };
            let row_end_x = if row_ix < self.wrap_boundaries.len() {
                let boundary = self.wrap_boundaries[row_ix];
                self.unwrapped_layout.runs[boundary.run_ix].glyphs[boundary.glyph_ix]
                    .position
                    .x
            } else {
                self.unwrapped_layout.width
            };
            let row_y = row_ix as f32 * line_height;
            for rect in &unwrapped_rects {
                let left = rect.origin.x.max(row_start_x);
                let right = (rect.origin.x + rect.size.width).min(row_end_x);
                if right > left {
                    out.push(Bounds {
                        origin: point(left - row_start_x, rect.origin.y + row_y),
                        size: size(right - left, rect.size.height),
                    });
                }
            }
        }
        out
    }

    /// Returns the visual width of wrapped row `row_ix`.
    pub(crate) fn row_width(&self, row_ix: usize) -> Pixels {
        if !self.visual_rows.is_empty() {
            return self
                .visual_rows
                .get(row_ix)
                .map_or(Pixels::ZERO, |r| r.layout.width);
        }
        let start_x = if row_ix == 0 {
            Pixels::ZERO
        } else if let Some(b) = self.wrap_boundaries.get(row_ix - 1) {
            self.unwrapped_layout.runs[b.run_ix].glyphs[b.glyph_ix]
                .position
                .x
        } else {
            return Pixels::ZERO;
        };
        let end_x = if let Some(b) = self.wrap_boundaries.get(row_ix) {
            self.unwrapped_layout.runs[b.run_ix].glyphs[b.glyph_ix]
                .position
                .x
        } else {
            self.unwrapped_layout.width
        };
        (end_x - start_x).max(Pixels::ZERO)
    }

    /// Returns the horizontal alignment offset for wrapped row `row_ix`.
    #[inline]
    pub(crate) fn row_align_offset(
        &self,
        row_ix: usize,
        align: crate::TextAlign,
        container_width: Pixels,
    ) -> Pixels {
        row_align_x(align, container_width, self.row_width(row_ix))
    }
}

/// Horizontal offset of a row of width `row_width` inside `container_width` under `align`.
#[inline]
pub(crate) fn row_align_x(
    align: crate::TextAlign,
    container_width: Pixels,
    row_width: Pixels,
) -> Pixels {
    match align {
        crate::TextAlign::Left => Pixels::ZERO,
        crate::TextAlign::Center => (container_width - row_width) / 2.0,
        crate::TextAlign::Right => container_width - row_width,
    }
}

/// Applies UAX #9 rules L1 (including retained explicit formatting controls and `BN`)
/// and L2 directly to the row slice `line` in `O(line.len())` without cloning the
/// full paragraph `levels` vector.
fn visual_runs_from_levels(
    text: &str,
    original_classes: &[unicode_bidi::BidiClass],
    base_levels: &[unicode_bidi::Level],
    para_level: unicode_bidi::Level,
    line: Range<usize>,
) -> SmallVec<[(Range<usize>, u8); 4]> {
    use unicode_bidi::BidiClass;
    if line.is_empty() {
        return SmallVec::new();
    }
    let mut row_levels: SmallVec<[u8; 64]> = base_levels[line.clone()]
        .iter()
        .map(|l| l.number())
        .collect();
    let para_num = para_level.number();
    // Match `unicode-bidi 0.3.18` `reorder_levels` (UAX #9 Rule L1 + X9 retained formatting):
    let mut reset_from: Option<usize> = Some(0);
    let mut reset_to: Option<usize> = None;
    let mut prev_level = para_num;
    for (rel, ch) in text[line.clone()].char_indices() {
        let len = ch.len_utf8();
        match original_classes[line.start + rel] {
            BidiClass::B | BidiClass::S => {
                reset_to = Some(rel + len);
                if reset_from.is_none() {
                    reset_from = Some(rel);
                }
            }
            BidiClass::WS | BidiClass::FSI | BidiClass::LRI | BidiClass::RLI | BidiClass::PDI => {
                if reset_from.is_none() {
                    reset_from = Some(rel);
                }
            }
            BidiClass::RLE
            | BidiClass::LRE
            | BidiClass::RLO
            | BidiClass::LRO
            | BidiClass::PDF
            | BidiClass::BN => {
                if reset_from.is_none() {
                    reset_from = Some(rel);
                }
                row_levels[rel..rel + len].fill(prev_level);
            }
            _ => {
                reset_from = None;
            }
        }
        if let (Some(from), Some(to)) = (reset_from, reset_to) {
            row_levels[from..to].fill(para_num);
            reset_from = None;
            reset_to = None;
        }
        prev_level = row_levels[rel];
    }
    if let Some(from) = reset_from {
        row_levels[from..].fill(para_num);
    }
    // Coalesce contiguous bytes with equal level into runs.
    let mut runs: SmallVec<[(Range<usize>, u8); 4]> = SmallVec::new();
    let mut run_start = 0usize;
    let mut cur_level = row_levels[0];
    let mut max_level = cur_level;
    let mut min_odd = u8::MAX;
    for (rel, &lvl) in row_levels.iter().enumerate() {
        if lvl != cur_level {
            if cur_level % 2 == 1 {
                min_odd = min_odd.min(cur_level);
            }
            max_level = max_level.max(cur_level);
            runs.push(((line.start + run_start)..(line.start + rel), cur_level));
            run_start = rel;
            cur_level = lvl;
        }
    }
    if cur_level % 2 == 1 {
        min_odd = min_odd.min(cur_level);
    }
    max_level = max_level.max(cur_level);
    runs.push(((line.start + run_start)..line.end, cur_level));
    // L2: reverse contiguous subsequences of runs with level >= lvl from max_level down to min_odd.
    if min_odd <= max_level {
        for lvl in (min_odd..=max_level).rev() {
            let mut i = 0;
            while i < runs.len() {
                if runs[i].1 >= lvl {
                    let start = i;
                    while i < runs.len() && runs[i].1 >= lvl {
                        i += 1;
                    }
                    runs[start..i].reverse();
                } else {
                    i += 1;
                }
            }
        }
    }
    runs
}

pub(crate) struct LineLayoutCache {
    state: RefCell<LineLayoutCacheState>,
    wrap_scratch: RefCell<WrapScratch>,
    pub(crate) platform_text_system: Arc<dyn PlatformTextSystem>,
    /// Advances when [`TextSystem::add_fonts`] successfully changes the font database.
    font_generation: Arc<AtomicUsize>,
    /// Records the generation represented by both frame caches.
    cached_font_generation: AtomicUsize,
    pub(crate) shaping: crate::fast::text::LineShaping,
}

#[derive(Default)]
pub(crate) struct WrapScratch {
    glyph_indices: FxHashSet<usize>,
    break_indices: Vec<usize>,
}

#[derive(Default)]
struct LineLayoutCacheState {
    previous_frame: FrameCache,
    current_frame: FrameCache,
}

#[derive(Default)]
pub(crate) struct FrameCache {
    pub(crate) lines: FxHashMap<Arc<CacheKey>, Arc<LineLayout>>,
    pub(crate) wrapped_lines: FxHashMap<Arc<CacheKey>, Arc<WrappedLineLayout>>,
    pub(crate) used_lines: Vec<Arc<CacheKey>>,
    pub(crate) used_wrapped_lines: Vec<Arc<CacheKey>>,
}

#[derive(Clone, Default)]
pub(crate) struct LineLayoutIndex {
    pub(crate) font_generation: usize,
    pub(crate) lines_index: usize,
    pub(crate) wrapped_lines_index: usize,
}

impl LineLayoutCache {
    pub fn new(
        platform_text_system: Arc<dyn PlatformTextSystem>,
        font_generation: Arc<AtomicUsize>,
    ) -> Self {
        let cached_font_generation = font_generation.load(Ordering::Acquire);
        Self {
            state: RefCell::default(),
            wrap_scratch: RefCell::default(),
            platform_text_system,
            font_generation,
            cached_font_generation: AtomicUsize::new(cached_font_generation),
            shaping: crate::fast::text::LineShaping::default(),
        }
    }

    pub fn layout_index(&self) -> LineLayoutIndex {
        let font_generation = self.clear_if_font_generation_changed();
        let state = self.state.borrow();
        let frame = &state.current_frame;
        LineLayoutIndex {
            font_generation,
            lines_index: frame.used_lines.len(),
            wrapped_lines_index: frame.used_wrapped_lines.len(),
        }
    }

    pub fn reuse_layouts(&self, range: Range<LineLayoutIndex>) {
        let font_generation = self.clear_if_font_generation_changed();
        if range.start.font_generation != font_generation
            || range.end.font_generation != font_generation
        {
            return;
        }
        let mut state = self.state.borrow_mut();
        let LineLayoutCacheState {
            previous_frame,
            current_frame,
        } = &mut *state;

        for key in &previous_frame.used_lines[range.start.lines_index..range.end.lines_index] {
            if let Some((key, line)) = previous_frame.lines.remove_entry(key) {
                current_frame.lines.insert(key, line);
            }
            current_frame.used_lines.push(key.clone());
        }

        for key in &previous_frame.used_wrapped_lines
            [range.start.wrapped_lines_index..range.end.wrapped_lines_index]
        {
            if let Some((key, line)) = previous_frame.wrapped_lines.remove_entry(key) {
                current_frame.wrapped_lines.insert(key, line);
            }
            current_frame.used_wrapped_lines.push(key.clone());
        }
    }

    pub fn truncate_layouts(&self, index: LineLayoutIndex) {
        let font_generation = self.clear_if_font_generation_changed();
        if index.font_generation != font_generation {
            return;
        }
        let mut state = self.state.borrow_mut();
        let current_frame = &mut state.current_frame;
        current_frame.used_lines.truncate(index.lines_index);
        current_frame
            .used_wrapped_lines
            .truncate(index.wrapped_lines_index);
    }

    pub fn finish_frame(&self) {
        let _font_generation = self.clear_if_font_generation_changed();
        let LineLayoutCacheState {
            previous_frame,
            current_frame,
        } = &mut *self.state.borrow_mut();
        crate::fast::text::carry_over_line_layouts(previous_frame, current_frame);
    }

    pub fn layout_wrapped_line<Text>(
        &self,
        text: Text,
        font_size: Pixels,
        runs: &[FontRun],
        wrap_width: Option<Pixels>,
        max_lines: Option<usize>,
    ) -> Arc<WrappedLineLayout>
    where
        Text: AsRef<str>,
        SharedString: From<Text>,
    {
        self.layout_wrapped_line_with_direction(
            text,
            font_size,
            runs,
            wrap_width,
            max_lines,
            BaseDirection::Ltr,
        )
    }

    pub fn layout_wrapped_line_with_direction<Text>(
        &self,
        text: Text,
        font_size: Pixels,
        runs: &[FontRun],
        wrap_width: Option<Pixels>,
        max_lines: Option<usize>,
        base_direction: BaseDirection,
    ) -> Arc<WrappedLineLayout>
    where
        Text: AsRef<str>,
        SharedString: From<Text>,
    {
        let _font_generation = self.clear_if_font_generation_changed();
        let key = &CacheKeyRef {
            text: text.as_ref(),
            font_size,
            runs,
            wrap_width,
            max_lines,
            force_width: None,
            base_direction,
        } as &dyn AsCacheKeyRef;

        let state = self.state.borrow();
        if let Some(layout) = state.current_frame.wrapped_lines.get(key) {
            return layout.clone();
        }
        drop(state);

        let mut state = self.state.borrow_mut();
        let previous_frame_entry = state.previous_frame.wrapped_lines.remove_entry(key);
        if let Some((key, layout)) = previous_frame_entry {
            state
                .current_frame
                .wrapped_lines
                .insert(key.clone(), layout.clone());
            state.current_frame.used_wrapped_lines.push(key);
            layout
        } else {
            drop(state);
            let text = SharedString::from(text);
            let unwrapped_layout = self.layout_line_with_direction::<&SharedString>(
                &text,
                font_size,
                runs,
                None,
                base_direction,
            );
            let has_bidi = unwrapped_layout.base_direction == BaseDirection::Rtl
                || unwrapped_layout.runs.iter().any(|r| r.is_rtl());
            let visual_rows = if let Some(wrap_width) = wrap_width
                && has_bidi
            {
                unwrapped_layout.compute_bidi_wrapped_rows(text.as_ref(), wrap_width, max_lines)
            } else {
                SmallVec::new()
            };
            let wrap_boundaries = if let Some(wrap_width) = wrap_width {
                unwrapped_layout.compute_wrap_boundaries(
                    text.as_ref(),
                    wrap_width,
                    max_lines,
                    &mut self.wrap_scratch.borrow_mut(),
                )
            } else {
                SmallVec::new()
            };
            let layout = Arc::new(WrappedLineLayout {
                unwrapped_layout,
                wrap_boundaries,
                wrap_width,
                visual_rows,
            });
            let key = Arc::new(CacheKey {
                text,
                font_size,
                runs: SmallVec::from(runs),
                wrap_width,
                max_lines,
                force_width: None,
                base_direction,
            });

            let mut state = self.state.borrow_mut();
            state
                .current_frame
                .wrapped_lines
                .insert(key.clone(), layout.clone());
            state.current_frame.used_wrapped_lines.push(key);

            layout
        }
    }

    pub fn layout_line<Text>(
        &self,
        text: Text,
        font_size: Pixels,
        runs: &[FontRun],
        force_width: Option<Pixels>,
    ) -> Arc<LineLayout>
    where
        Text: AsRef<str>,
        SharedString: From<Text>,
    {
        self.layout_line_with_direction(text, font_size, runs, force_width, BaseDirection::Ltr)
    }

    pub fn layout_line_with_direction<Text>(
        &self,
        text: Text,
        font_size: Pixels,
        runs: &[FontRun],
        force_width: Option<Pixels>,
        base_direction: BaseDirection,
    ) -> Arc<LineLayout>
    where
        Text: AsRef<str>,
        SharedString: From<Text>,
    {
        let _font_generation = self.clear_if_font_generation_changed();
        let key = &CacheKeyRef {
            text: text.as_ref(),
            font_size,
            runs,
            wrap_width: None,
            max_lines: None,
            force_width,
            base_direction,
        } as &dyn AsCacheKeyRef;

        let state = self.state.borrow();
        if let Some(layout) = state.current_frame.lines.get(key) {
            return layout.clone();
        }
        drop(state);

        let mut state = self.state.borrow_mut();
        let LineLayoutCacheState {
            previous_frame,
            current_frame,
        } = &mut *state;
        if let Some((key, layout)) = previous_frame.lines.remove_entry(key) {
            current_frame.lines.insert(key.clone(), layout.clone());
            current_frame.used_lines.push(key);
            layout
        } else {
            let text = SharedString::from(text);
            let mut layout =
                crate::fast::text::shape_line(self, &text, font_size, runs, base_direction);

            if let Some(force_width) = force_width {
                apply_force_width_to_layout(&mut layout, force_width);
            }

            let key = Arc::new(CacheKey {
                text,
                font_size,
                runs: SmallVec::from(runs),
                wrap_width: None,
                max_lines: None,
                force_width,
                base_direction,
            });
            let layout = Arc::new(layout);
            current_frame.lines.insert(key.clone(), layout.clone());
            current_frame.used_lines.push(key);
            layout
        }
    }

    fn clear_if_font_generation_changed(&self) -> usize {
        let font_generation = self.font_generation.load(Ordering::Acquire);
        if self.cached_font_generation.load(Ordering::Acquire) == font_generation {
            return font_generation;
        }

        let mut state = self.state.borrow_mut();
        if self.cached_font_generation.load(Ordering::Acquire) == font_generation {
            return font_generation;
        }

        *state = LineLayoutCacheState::default();
        self.cached_font_generation
            .store(font_generation, Ordering::Release);
        font_generation
    }
}

// Combining marks (e.g. Thai vowel signs, Arabic diacritics) are shaped by
// HarfBuzz at the same x position as their base character. The force-width
// loop must not advance the cell counter for these zero-advance glyphs,
// otherwise they get displaced into the next cell. We detect them by checking
// whether shaped x has advanced by at least half a cell beyond the last base.
fn apply_force_width_to_layout(layout: &mut LineLayout, force_width: Pixels) {
    let mut glyph_pos: usize = 0;
    // NEG_INFINITY ensures the first glyph is always classified as a base.
    let mut last_base_shaped_x = px(f32::NEG_INFINITY);
    let mut last_base_actual_x = px(0.);

    for run in layout.runs.iter_mut() {
        for glyph in run.glyphs.iter_mut() {
            let shaped_x = glyph.position.x;

            if shaped_x > last_base_shaped_x + force_width * 0.5 {
                let forced_x = glyph_pos * force_width;
                if (shaped_x - forced_x).abs() > px(1.) {
                    glyph.position.x = forced_x;
                }
                last_base_shaped_x = shaped_x;
                last_base_actual_x = glyph.position.x;
                glyph_pos += 1;
            } else {
                glyph.position.x = last_base_actual_x + (shaped_x - last_base_shaped_x);
            }
        }
    }
}

/// A run of text with a single font.
#[derive(Copy, Clone, Debug, Eq, PartialEq, Hash)]
#[expect(missing_docs)]
pub struct FontRun {
    pub len: usize,
    pub font_id: FontId,
}

trait AsCacheKeyRef {
    fn as_cache_key_ref(&self) -> CacheKeyRef<'_>;
}

#[derive(Clone, Debug, Eq)]
pub(crate) struct CacheKey {
    text: SharedString,
    font_size: Pixels,
    runs: SmallVec<[FontRun; 1]>,
    wrap_width: Option<Pixels>,
    max_lines: Option<usize>,
    force_width: Option<Pixels>,
    base_direction: BaseDirection,
}

#[derive(Copy, Clone, PartialEq, Eq, Hash)]
struct CacheKeyRef<'a> {
    text: &'a str,
    font_size: Pixels,
    runs: &'a [FontRun],
    wrap_width: Option<Pixels>,
    max_lines: Option<usize>,
    force_width: Option<Pixels>,
    base_direction: BaseDirection,
}

impl PartialEq for dyn AsCacheKeyRef + '_ {
    fn eq(&self, other: &dyn AsCacheKeyRef) -> bool {
        self.as_cache_key_ref() == other.as_cache_key_ref()
    }
}

impl Eq for dyn AsCacheKeyRef + '_ {}

impl Hash for dyn AsCacheKeyRef + '_ {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.as_cache_key_ref().hash(state)
    }
}

impl AsCacheKeyRef for CacheKey {
    fn as_cache_key_ref(&self) -> CacheKeyRef<'_> {
        CacheKeyRef {
            text: &self.text,
            font_size: self.font_size,
            runs: self.runs.as_slice(),
            wrap_width: self.wrap_width,
            max_lines: self.max_lines,
            force_width: self.force_width,
            base_direction: self.base_direction,
        }
    }
}

impl PartialEq for CacheKey {
    fn eq(&self, other: &Self) -> bool {
        self.as_cache_key_ref().eq(&other.as_cache_key_ref())
    }
}

impl Hash for CacheKey {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.as_cache_key_ref().hash(state);
    }
}

impl<'a> Borrow<dyn AsCacheKeyRef + 'a> for Arc<CacheKey> {
    fn borrow(&self) -> &(dyn AsCacheKeyRef + 'a) {
        self.as_ref() as &dyn AsCacheKeyRef
    }
}

impl AsCacheKeyRef for CacheKeyRef<'_> {
    fn as_cache_key_ref(&self) -> CacheKeyRef<'_> {
        *self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use unicode_segmentation::UnicodeSegmentation;

    /// Builds a synthetic `LineLayout` with whole-paragraph UAX #9 reordering and
    /// fixed per-grapheme width so bidi geometry tests are deterministic across platforms.
    fn build_bidi_layout(text: &str, base: BaseDirection, glyph_w: f32) -> LineLayout {
        let visual_runs = reorder_line_visual_runs(text, base, 0..text.len());
        let mut runs = Vec::new();
        let mut x = 0.0_f32;
        for vrun in visual_runs {
            let slice = &text[vrun.byte_range.clone()];
            let mut graphemes: Vec<usize> = slice
                .grapheme_indices(true)
                .map(|(rel, _)| vrun.byte_range.start + rel)
                .collect();
            if vrun.bidi_level % 2 == 1 {
                graphemes.reverse();
            }
            let mut glyphs = Vec::with_capacity(graphemes.len());
            for byte_ix in graphemes {
                glyphs.push(ShapedGlyph {
                    id: GlyphId(1),
                    position: point(px(x), px(0.0)),
                    index: byte_ix,
                    is_emoji: false,
                });
                x += glyph_w;
            }
            runs.push(ShapedRun {
                font_id: FontId(0),
                glyphs,
                bidi_level: vrun.bidi_level,
            });
        }
        LineLayout {
            font_size: px(16.0),
            width: px(x),
            ascent: px(12.0),
            descent: px(4.0),
            runs,
            len: text.len(),
            base_direction: base,
        }
    }

    #[test]
    fn bidi_line_layout_caret_hit_test_and_selection_rects() {
        let glyph_w = 10.0_f32;
        let cases: &[(&str, BaseDirection, bool)] = &[
            ("Hello world", BaseDirection::Ltr, false),
            ("مرحبا بالعالم", BaseDirection::Rtl, true),
            ("שלום עולם", BaseDirection::AutoFirstStrong, true),
            ("Hello سلام 123 world", BaseDirection::Ltr, false),
            ("A 👨‍👩‍👧‍👦 B", BaseDirection::Ltr, false),
        ];

        for &(text, base, expect_rtl_base) in cases {
            let (resolved_dir, levels) = resolve_paragraph_bidi_levels(text, base);
            assert_eq!(resolved_dir.is_rtl(), expect_rtl_base, "case={text:?}");
            assert_eq!(levels.len(), text.len(), "case={text:?}");

            let layout = build_bidi_layout(text, base, glyph_w);
            let grapheme_starts: Vec<usize> =
                text.grapheme_indices(true).map(|(ix, _)| ix).collect();

            // Round-trip caret_x_for_index <-> index_for_x on every grapheme cluster.
            for (g_ix, &byte_start) in grapheme_starts.iter().enumerate() {
                let byte_end = grapheme_starts.get(g_ix + 1).copied().unwrap_or(text.len());
                let lead_x = layout.caret_x_for_index(byte_start, CaretAffinity::Downstream);
                let trail_x = layout.caret_x_for_index(byte_end, CaretAffinity::Upstream);
                let is_rtl_cluster = (levels[byte_start] % 2) == 1;
                if is_rtl_cluster {
                    assert!(
                        lead_x > trail_x,
                        "RTL cluster must place leading edge to the right of trailing edge: {text:?} @ {byte_start}"
                    );
                } else {
                    assert!(
                        trail_x > lead_x,
                        "LTR cluster must place trailing edge to the right of leading edge: {text:?} @ {byte_start}"
                    );
                }
                let probe_lead = if is_rtl_cluster {
                    lead_x - px(1.0)
                } else {
                    lead_x + px(1.0)
                };
                assert_eq!(
                    layout.index_for_x(probe_lead),
                    (byte_start, CaretAffinity::Downstream),
                    "lead hit-test mismatch for {text:?} @ {byte_start}"
                );
                let probe_trail = if is_rtl_cluster {
                    trail_x + px(1.0)
                } else {
                    trail_x - px(1.0)
                };
                assert_eq!(
                    layout.index_for_x(probe_trail),
                    (byte_end, CaretAffinity::Upstream),
                    "trail hit-test mismatch for {text:?} @ {byte_end}"
                );
            }
        }

        // Cross-direction selection in "Hello سلام 123 world" produces disjoint visual rects.
        let mixed = "Hello سلام 123 world";
        let mixed_layout = build_bidi_layout(mixed, BaseDirection::Ltr, glyph_w);
        // Select "lo " (3..6) + first two Arabic letters "سل" (6..10):
        // Visual order is "Hello " | "123" | " " | "مالس" | " world", so "lo " and "سل" are disjoint.
        let rects = mixed_layout.selection_rects_for_range(3..10);
        assert_eq!(
            rects.len(),
            2,
            "mixed LTR/RTL selection should return 2 disjoint rectangles, got {rects:?}"
        );
        assert!((f32::from(rects[0].size.width) - 30.0).abs() < 1e-3);
        assert!((f32::from(rects[1].size.width) - 20.0).abs() < 1e-3);

        // Same-direction contiguous selection merges into a single rectangle.
        let ltr_rects = mixed_layout.selection_rects_for_range(0..5);
        assert_eq!(ltr_rects.len(), 1);
        assert!((f32::from(ltr_rects[0].size.width) - 50.0).abs() < 1e-3);

        // Emoji ZWJ interior byte offset snaps to the grapheme cluster boundary.
        let emoji = "A 👨‍👩‍👧‍👦 B";
        let emoji_layout = build_bidi_layout(emoji, BaseDirection::Ltr, glyph_w);
        let emoji_start = emoji.find('👨').unwrap();
        let x_start = emoji_layout.caret_x_for_index(emoji_start, CaretAffinity::Downstream);
        let x_interior = emoji_layout.caret_x_for_index(emoji_start + 4, CaretAffinity::Downstream);
        assert_eq!(x_start, x_interior);

        // Soft-wrap boundary round-trip on WrappedLineLayout (including Row 0 x==0 Upstream).
        let wrapped = WrappedLineLayout {
            unwrapped_layout: Arc::new(mixed_layout),
            wrap_boundaries: smallvec::smallvec![WrapBoundary {
                run_ix: 1,
                glyph_ix: 0,
            }],
            wrap_width: Some(px(100.0)),
            visual_rows: SmallVec::new(),
        };
        let pos_row0 = wrapped
            .position_for_index_with_affinity(0, CaretAffinity::Downstream, px(20.0))
            .expect("row 0 pos");
        assert_eq!(pos_row0.y, px(0.0));
        let pos_row0_up = wrapped
            .position_for_index_with_affinity(0, CaretAffinity::Upstream, px(20.0))
            .expect("row 0 upstream pos");
        assert_eq!(
            pos_row0_up.y,
            px(0.0),
            "row 0 x==0 with Upstream affinity must stay on row 0"
        );
        let pos_row1 = wrapped
            .position_for_index_with_affinity(mixed.len(), CaretAffinity::Upstream, px(20.0))
            .expect("row 1 pos");
        assert_eq!(pos_row1.y, px(20.0));

        // Multi-line bidi soft-wrap: logical line breaking + per-row UAX #9 L1/L2 reordering.
        let ar_para = "مرحبا بالعالم";
        let ar_unwrapped = build_bidi_layout(ar_para, BaseDirection::Rtl, glyph_w);
        let ar_rows = ar_unwrapped.compute_bidi_wrapped_rows(ar_para, px(70.0), None);
        assert_eq!(ar_rows.len(), 2, "expected 2 wrapped Arabic rows");
        assert!(
            ar_para[ar_rows[0].byte_range.clone()].starts_with("مرحبا"),
            "row 0 must hold logical first word"
        );
        assert!(
            ar_para[ar_rows[1].byte_range.clone()].starts_with("بالعالم"),
            "row 1 must hold logical continuation word"
        );
        let ar_wrapped = WrappedLineLayout {
            unwrapped_layout: Arc::new(ar_unwrapped),
            wrap_boundaries: SmallVec::new(),
            wrap_width: Some(px(70.0)),
            visual_rows: ar_rows,
        };
        assert_eq!(ar_wrapped.size(px(20.0)).height, px(40.0));
        let row0_lead = ar_wrapped
            .position_for_index_with_affinity(0, CaretAffinity::Downstream, px(20.0))
            .expect("row 0 lead");
        assert_eq!(row0_lead.y, px(0.0));
        assert!(row0_lead.x > px(0.0), "RTL row 0 start sits on right edge");
        let split_byte = ar_wrapped.visual_rows[1].byte_range.start;
        let row0_end = ar_wrapped
            .position_for_index_with_affinity(split_byte, CaretAffinity::Upstream, px(20.0))
            .expect("row 0 end");
        assert_eq!(row0_end.y, px(0.0));
        let row1_start = ar_wrapped
            .position_for_index_with_affinity(split_byte, CaretAffinity::Downstream, px(20.0))
            .expect("row 1 start");
        assert_eq!(row1_start.y, px(20.0));
        assert_eq!(
            ar_wrapped.closest_index_for_position(point(px(1.0), px(25.0)), px(20.0)),
            Ok(ar_para.len())
        );

        // 7. Pure-LTR multi-row soft-wrap selection_rects_for_range splits across rows.
        let ltr_wrapped = WrappedLineLayout {
            unwrapped_layout: Arc::new(build_bidi_layout("abcdefgh", BaseDirection::Ltr, 10.0)),
            wrap_boundaries: smallvec::smallvec![WrapBoundary {
                run_ix: 0,
                glyph_ix: 4,
            }],
            wrap_width: Some(px(40.0)),
            visual_rows: SmallVec::new(),
        };
        let ltr_sel = ltr_wrapped.selection_rects_for_range(2..6, px(20.0));
        assert_eq!(ltr_sel.len(), 2);
        assert_eq!(ltr_sel[0].origin, point(px(20.0), px(0.0)));
        assert_eq!(ltr_sel[0].size.width, px(20.0));
        assert_eq!(ltr_sel[1].origin, point(px(0.0), px(20.0)));
        assert_eq!(ltr_sel[1].size.width, px(20.0));
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn platform_shaper_respects_explicit_base_direction_and_arabic_joining() {
        #[cfg(target_os = "macos")]
        let platform_ts: Arc<dyn PlatformTextSystem> = Arc::new(crate::AppleTextSystem::new());
        #[cfg(target_os = "linux")]
        let platform_ts: Arc<dyn PlatformTextSystem> =
            Arc::new(crate::CosmicTextSystem::new("sans-serif"));

        let text_system = Arc::new(crate::TextSystem::new(platform_ts.clone()));
        let font_id = text_system.resolve_font(&crate::font("sans-serif"));
        let cache = LineLayoutCache::new(platform_ts, Arc::new(AtomicUsize::new(0)));

        // 1. Cross-direction cases: Latin-leading and RTL-leading with trailing period.
        for &(sample, check_rtl_leading) in &[
            ("Brand مرحبا", false),
            ("مرحبا Brand.", true),
            ("שלום hello.", true),
        ] {
            let runs = [FontRun {
                len: sample.len(),
                font_id,
            }];
            let ltr =
                cache.layout_line_with_direction(sample, px(16.0), &runs, None, BaseDirection::Ltr);
            let rtl =
                cache.layout_line_with_direction(sample, px(16.0), &runs, None, BaseDirection::Rtl);
            let auto = cache.layout_line_with_direction(
                sample,
                px(16.0),
                &runs,
                None,
                BaseDirection::AutoFirstStrong,
            );
            assert_eq!(ltr.base_direction, BaseDirection::Ltr);
            assert_eq!(rtl.base_direction, BaseDirection::Rtl);
            assert_ne!(
                Arc::as_ptr(&ltr),
                Arc::as_ptr(&rtl),
                "LineLayoutCache must key by BaseDirection"
            );
            if check_rtl_leading {
                // Under explicit LTR base, trailing '.' stays on the far right;
                // under explicit RTL base, trailing '.' moves to the far left.
                let dot_ix = sample.rfind('.').unwrap();
                let dot_ltr_x = ltr.caret_x_for_index(dot_ix, CaretAffinity::Downstream);
                let dot_rtl_x = rtl.caret_x_for_index(dot_ix, CaretAffinity::Downstream);
                assert!(
                    dot_ltr_x > dot_rtl_x,
                    "sample={sample:?}: period under LTR ({dot_ltr_x:?}) must sit right of RTL ({dot_rtl_x:?})"
                );
                // AutoFirstStrong on RTL-leading text matches RTL base.
                let dot_auto_x = auto.caret_x_for_index(dot_ix, CaretAffinity::Downstream);
                assert!((f32::from(dot_auto_x) - f32::from(dot_rtl_x)).abs() < 1.0);
            } else {
                let ltr_start_x = ltr.caret_x_for_index(0, CaretAffinity::Downstream);
                let rtl_start_x = rtl.caret_x_for_index(0, CaretAffinity::Downstream);
                assert!(
                    rtl_start_x > ltr_start_x,
                    "in explicit RTL base direction, leading Latin word should sit to the right of Arabic ({rtl_start_x:?} vs {ltr_start_x:?})"
                );
            }
        }

        // 2. Splitting an Arabic word ("سلام") across same-font runs (even after a preceding
        // Latin run that nudged font size) must preserve contextual joining glyphs.
        let arabic = "سلام";
        let split_at = "سل".len();
        let single_run = [FontRun {
            len: arabic.len(),
            font_id,
        }];
        let dual_runs = [
            FontRun {
                len: split_at,
                font_id,
            },
            FontRun {
                len: arabic.len() - split_at,
                font_id,
            },
        ];
        let single_layout = cache.layout_line_with_direction(
            arabic,
            px(16.0),
            &single_run,
            None,
            BaseDirection::Rtl,
        );
        let dual_layout = cache.layout_line_with_direction(
            arabic,
            px(16.0),
            &dual_runs,
            None,
            BaseDirection::Rtl,
        );
        let single_glyphs: Vec<GlyphId> = single_layout
            .runs
            .iter()
            .flat_map(|r| r.glyphs.iter().map(|g| g.id))
            .collect();
        let dual_glyphs: Vec<GlyphId> = dual_layout
            .runs
            .iter()
            .flat_map(|r| r.glyphs.iter().map(|g| g.id))
            .collect();
        assert_eq!(
            single_glyphs, dual_glyphs,
            "same-font style split across Arabic word must preserve contextual joining"
        );

        // 3. Same-font Arabic split after a preceding nudged Latin pair (`[Latin, Latin, C1, C2]`)
        // must still preserve identical contextual glyphs for the Arabic word.
        let prefixed = "ab سلام";
        let prefix_a = "a".len();
        let prefix_b = "b ".len();
        let ar_c1 = "سل".len();
        let ar_c2 = prefixed.len() - prefix_a - prefix_b - ar_c1;
        let single_prefixed = cache.layout_line_with_direction(
            prefixed,
            px(16.0),
            &[
                FontRun {
                    len: prefix_a,
                    font_id,
                },
                FontRun {
                    len: prefix_b,
                    font_id,
                },
                FontRun {
                    len: ar_c1 + ar_c2,
                    font_id,
                },
            ],
            None,
            BaseDirection::Rtl,
        );
        let split_prefixed = cache.layout_line_with_direction(
            prefixed,
            px(16.0),
            &[
                FontRun {
                    len: prefix_a,
                    font_id,
                },
                FontRun {
                    len: prefix_b,
                    font_id,
                },
                FontRun {
                    len: ar_c1,
                    font_id,
                },
                FontRun {
                    len: ar_c2,
                    font_id,
                },
            ],
            None,
            BaseDirection::Rtl,
        );
        let single_prefixed_glyphs: Vec<GlyphId> = single_prefixed
            .runs
            .iter()
            .flat_map(|r| r.glyphs.iter().map(|g| g.id))
            .collect();
        let split_prefixed_glyphs: Vec<GlyphId> = split_prefixed
            .runs
            .iter()
            .flat_map(|r| r.glyphs.iter().map(|g| g.id))
            .collect();
        assert_eq!(
            single_prefixed_glyphs, split_prefixed_glyphs,
            "preceding Latin run nudge must not break same-font Arabic contextual joining"
        );

        // 4. Emoji variation selector U+FE0F does not trigger Arabic joining suppression.
        let emoji_split = "a\u{FE0F}b";
        let emoji_layout = cache.layout_line_with_direction(
            emoji_split,
            px(16.0),
            &[
                FontRun {
                    len: "a\u{FE0F}".len(),
                    font_id,
                },
                FontRun {
                    len: "b".len(),
                    font_id,
                },
            ],
            None,
            BaseDirection::Ltr,
        );
        assert!(emoji_layout.width > px(0.0));
    }
}
