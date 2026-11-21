use crate::platform::web::canvas_fallback::classify_canvas_fallback;
use crate::{FontId, FontRun, LineLayout, Pixels, Point, ShapedGlyph, ShapedRun};
use smallvec::SmallVec;
use std::ops::Range;
use unicode_segmentation::UnicodeSegmentation;

#[derive(Debug, PartialEq)]
pub(crate) struct Candidate {
    pub(crate) source: Range<usize>,
    pub(crate) font_id: FontId,
    pub(crate) is_emoji: bool,
    pub(crate) color: bool,
    pub(crate) glyphs: Option<GlyphSpan>,
}

#[derive(Debug, PartialEq)]
pub(crate) struct GlyphSpan {
    pub(crate) range: Range<usize>,
    pub(crate) position: Point<Pixels>,
    pub(crate) end_x: Pixels,
    pub(crate) contiguous: bool,
    pub(crate) missing: bool,
    pub(crate) native_color: bool,
}

pub(crate) fn collect_candidates(
    text: &str,
    font_runs: &[FontRun],
    layout: &LineLayout,
) -> Vec<Candidate> {
    let mut font_runs = font_runs.iter().peekable();
    let mut font_run = font_runs.next();
    let mut run_end = font_run.map_or(0, |run| run.len);
    let mut candidates = Vec::new();
    for (start, grapheme) in text.grapheme_indices(true) {
        while start >= run_end {
            font_run = font_runs.next();
            let Some(run) = font_run else { break };
            run_end += run.len;
        }
        let Some(run) = font_run else { break };
        // Paint-only run boundaries must not split a fallback grapheme.
        while let Some(next_run) = font_runs.next_if(|next| next.font_id == run.font_id) {
            run_end += next_run.len;
        }
        let end = start + grapheme.len();
        if end > run_end {
            continue;
        }
        let Some(fallback) = classify_canvas_fallback(grapheme) else {
            continue;
        };
        candidates.push(Candidate {
            source: start..end,
            font_id: run.font_id,
            is_emoji: fallback.is_emoji,
            color: fallback.emoji_presentation,
            glyphs: None,
        });
    }
    if candidates.is_empty() {
        return candidates;
    }

    let mut glyphs = layout
        .runs
        .iter()
        .flat_map(|run| run.glyphs.iter())
        .enumerate()
        .peekable();
    while let Some((index, glyph)) = glyphs.next() {
        let candidate_index =
            candidates.partition_point(|candidate| candidate.source.end <= glyph.index);
        let Some(candidate) = candidates
            .get_mut(candidate_index)
            .filter(|candidate| candidate.source.contains(&glyph.index))
        else {
            continue;
        };
        let span = candidate.glyphs.get_or_insert_with(|| GlyphSpan {
            range: index..index,
            position: glyph.position,
            end_x: glyph.position.x,
            contiguous: true,
            missing: false,
            native_color: true,
        });
        span.contiguous &= span.range.end == index;
        span.range.end = index + 1;
        span.end_x = glyphs
            .peek()
            .map_or(layout.width, |(_, next)| next.position.x);
        span.missing |= glyph.id.0 == 0;
        span.native_color &= glyph.is_emoji;
    }
    candidates
}

pub(crate) struct Replacement {
    pub(crate) glyph_range: Range<usize>,
    pub(crate) font_id: FontId,
    pub(crate) glyph: ShapedGlyph,
    pub(crate) width_delta: Pixels,
}

struct Segment {
    font_id: FontId,
    length: usize,
}

/// Ranges refer to the original flattened glyph stream and must be sorted,
/// non-overlapping, nonempty, and in bounds.
pub(crate) fn apply_replacements(layout: &mut LineLayout, replacements: Vec<Replacement>) {
    if replacements.is_empty() {
        return;
    }

    let mut replacements = replacements.into_iter().peekable();
    let mut original_index = 0;
    let mut consumed_end = 0;
    let mut shift = Pixels::ZERO;
    let mut segments_by_run: SmallVec<[SmallVec<[Segment; 4]>; 4]> = SmallVec::new();
    let mut spare_buffers: SmallVec<[Vec<ShapedGlyph>; 4]> = SmallVec::new();
    let mut final_run_count = 0;

    layout.runs.retain_mut(|run| {
        let mut segments: SmallVec<[Segment; 4]> = SmallVec::new();
        run.glyphs.retain_mut(|glyph| {
            let index = original_index;
            original_index += 1;
            if index < consumed_end {
                return false;
            }

            let font_id = if let Some(replacement) =
                replacements.next_if(|replacement| replacement.glyph_range.start == index)
            {
                consumed_end = replacement.glyph_range.end;
                *glyph = replacement.glyph;
                glyph.position.x += shift;
                shift += replacement.width_delta;
                replacement.font_id
            } else {
                glyph.position.x += shift;
                run.font_id
            };

            if let Some(segment) = segments.last_mut().filter(|last| last.font_id == font_id) {
                segment.length += 1;
            } else {
                segments.push(Segment { font_id, length: 1 });
            }
            true
        });

        if segments.is_empty() {
            spare_buffers.push(std::mem::take(&mut run.glyphs));
            false
        } else {
            final_run_count += segments.len();
            segments_by_run.push(segments);
            true
        }
    });
    layout.width += shift;

    let source_run_count = layout.runs.len();
    layout.runs.resize_with(final_run_count, || ShapedRun {
        font_id: FontId(0),
        glyphs: Vec::new(),
    });

    // Every destination is at or after its source. Expanding from the right
    // therefore cannot overwrite an original run that still needs processing.
    let mut destination_end = final_run_count;
    for (source_index, segments) in (0..source_run_count).zip(segments_by_run).rev() {
        let destination_start = destination_end - segments.len();
        let mut glyph_end = layout.runs[source_index].glyphs.len();
        for (segment_index, segment) in segments.into_iter().enumerate().rev() {
            let destination_index = destination_start + segment_index;
            if segment_index == 0 {
                layout.runs[source_index].font_id = segment.font_id;
                layout.runs.swap(source_index, destination_index);
            } else {
                let glyph_start = glyph_end - segment.length;
                let mut glyphs = spare_buffers.pop().unwrap_or_default();
                glyphs.extend(
                    layout.runs[source_index]
                        .glyphs
                        .drain(glyph_start..glyph_end),
                );
                layout.runs[destination_index] = ShapedRun {
                    font_id: segment.font_id,
                    glyphs,
                };
                glyph_end = glyph_start;
            }
        }
        destination_end = destination_start;
    }
}
