//! Deterministic pure-Rust fallback text layout (soft line-wrapping,
//! surrogate-safe caret/hit-testing, per-line selection rects, and software
//! loupe rasterization) used when no native CoreText `AffineTextProvider` is
//! attached (for example, headless Linux `cargo test`).

use crate::{
    AffineUtf16Range, AffineWindowInsets,
    selection::{AffinePoint, AffineRect, AffineWritingDirection},
};

pub const CONTENT_INSET_PT: f32 = 16.0;
pub const LINE_HEIGHT_PT: f32 = 22.0;
const GLYPH_ADVANCE_ASCII_PT: f32 = 9.0;
const GLYPH_ADVANCE_SPACE_PT: f32 = 5.0;
const GLYPH_ADVANCE_WIDE_PT: f32 = 11.0;
const GLYPH_ADVANCE_NARROW_PT: f32 = 4.5;

#[derive(Debug, Clone, Copy)]
struct VisualLine {
    start: usize,
    end: usize,
    is_soft_wrapped: bool,
    y: f32,
}

/// One per-line selection rectangle matching `UITextSelectionRect`.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AffineSelectionRect {
    pub rect: AffineRect,
    pub contains_start: bool,
    pub contains_end: bool,
}

/// Detect document base writing direction from the first strong directional UTF-16 unit.
pub fn detect_writing_direction(utf16: &[u16]) -> AffineWritingDirection {
    for &unit in utf16 {
        if (0x0590..=0x08FF).contains(&unit)
            || (0xFB1D..=0xFDFF).contains(&unit)
            || (0xFE70..=0xFEFC).contains(&unit)
        {
            return AffineWritingDirection::Rtl;
        }
        if (0x0041..=0x005A).contains(&unit)
            || (0x0061..=0x007A).contains(&unit)
            || (0x00C0..=0x024F).contains(&unit)
            || (0x0370..=0x052F).contains(&unit)
            || (0x4E00..=0x9FFF).contains(&unit)
        {
            return AffineWritingDirection::Ltr;
        }
    }
    AffineWritingDirection::Ltr
}

/// Detect paragraph base writing direction for the `\n`-delimited paragraph containing `utf16_offset`.
pub fn detect_paragraph_writing_direction(
    utf16: &[u16],
    utf16_offset: usize,
) -> AffineWritingDirection {
    if utf16.is_empty() {
        return AffineWritingDirection::Ltr;
    }
    let idx = utf16_offset.min(utf16.len());
    let mut para_start = idx;
    while para_start > 0 && utf16[para_start - 1] != 0x000A {
        para_start -= 1;
    }
    let mut para_end = idx;
    while para_end < utf16.len() && utf16[para_end] != 0x000A {
        para_end += 1;
    }
    detect_writing_direction(&utf16[para_start..para_end])
}

/// Snap a UTF-16 offset so it never splits a surrogate pair.
pub fn snap_utf16_boundary(utf16: &[u16], offset: usize) -> usize {
    let clamped = offset.min(utf16.len());
    if clamped > 0 && clamped < utf16.len() {
        let cur = utf16[clamped];
        let prev = utf16[clamped - 1];
        if (0xDC00..=0xDFFF).contains(&cur) && (0xD800..=0xDBFF).contains(&prev) {
            return clamped - 1;
        }
    }
    clamped
}

fn next_cluster_end(utf16: &[u16], idx: usize) -> usize {
    if idx >= utf16.len() {
        return utf16.len();
    }
    let cur = utf16[idx];
    if (0xD800..=0xDBFF).contains(&cur)
        && idx + 1 < utf16.len()
        && (0xDC00..=0xDFFF).contains(&utf16[idx + 1])
    {
        return idx + 2;
    }
    idx + 1
}

fn default_cluster_advance_pt(cluster: &[u16]) -> f32 {
    let Some(&u) = cluster.first() else {
        return 0.0;
    };
    if let Ok(ascii) = u8::try_from(u) {
        return match ascii {
            b'\n' | b'\r' => 0.0,
            b' ' => GLYPH_ADVANCE_SPACE_PT,
            b'.' | b',' | b'i' | b'l' | b'!' | b'|' => GLYPH_ADVANCE_NARROW_PT,
            b'W' | b'M' => GLYPH_ADVANCE_WIDE_PT,
            _ => GLYPH_ADVANCE_ASCII_PT,
        };
    }
    match u {
        0x0590..=0x08FF => GLYPH_ADVANCE_ASCII_PT,
        0xD800..=0xDBFF => 14.0,
        _ => GLYPH_ADVANCE_ASCII_PT,
    }
}

fn content_box(viewport_w: f32, insets: AffineWindowInsets) -> (f32, f32, f32) {
    let origin_x = insets.safe_left.max(0.0) + CONTENT_INSET_PT;
    let origin_y = insets.safe_top.max(0.0) + CONTENT_INSET_PT;
    let right_margin = insets.safe_right.max(0.0) + CONTENT_INSET_PT;
    let width = (viewport_w.max(0.0) - origin_x - right_margin).max(40.0);
    (origin_x, origin_y, width)
}

fn layout_visual_lines(
    utf16: &[u16],
    viewport_w: f32,
    insets: AffineWindowInsets,
) -> Vec<VisualLine> {
    let (_origin_x, origin_y, max_w) = content_box(viewport_w, insets);
    let mut lines = Vec::new();
    let mut line_start = 0usize;
    let mut cursor = 0usize;
    let mut line_w = 0.0f32;
    let mut last_space_end: Option<usize> = None;
    let mut line_idx = 0usize;

    while cursor < utf16.len() {
        if utf16[cursor] == 0x000A {
            lines.push(VisualLine {
                start: line_start,
                end: cursor,
                is_soft_wrapped: false,
                y: origin_y + (line_idx as f32) * LINE_HEIGHT_PT,
            });
            line_idx += 1;
            cursor += 1;
            line_start = cursor;
            line_w = 0.0;
            last_space_end = None;
            continue;
        }
        let next = next_cluster_end(utf16, cursor);
        let adv = default_cluster_advance_pt(&utf16[cursor..next]);
        if line_w + adv > max_w && cursor > line_start {
            let wrap_end = match last_space_end {
                Some(sp) if sp > line_start => sp,
                _ => cursor,
            };
            lines.push(VisualLine {
                start: line_start,
                end: wrap_end,
                is_soft_wrapped: true,
                y: origin_y + (line_idx as f32) * LINE_HEIGHT_PT,
            });
            line_idx += 1;
            line_start = wrap_end;
            cursor = wrap_end;
            line_w = 0.0;
            last_space_end = None;
            continue;
        }
        line_w += adv;
        if utf16[cursor] == 0x0020 {
            last_space_end = Some(next);
        }
        cursor = next;
    }

    lines.push(VisualLine {
        start: line_start,
        end: utf16.len(),
        is_soft_wrapped: false,
        y: origin_y + (line_idx as f32) * LINE_HEIGHT_PT,
    });
    lines
}

fn measure_range_width(utf16: &[u16], start: usize, end: usize) -> f32 {
    let mut w = 0.0f32;
    let mut i = start.min(utf16.len());
    let limit = end.min(utf16.len());
    while i < limit {
        let next = next_cluster_end(utf16, i);
        w += default_cluster_advance_pt(&utf16[i..next]);
        i = next;
    }
    w
}

/// Compute the fallback visual caret rect for `utf16_offset`.
/// Soft-wrap boundary offsets belong to the start of the wrapped next line;
/// hard `\n` boundary offsets stay at the end of the preceding line.
pub fn caret_rect_for_offset(
    utf16: &[u16],
    utf16_offset: u32,
    viewport_w: f32,
    insets: AffineWindowInsets,
) -> AffineRect {
    let (origin_x, _origin_y, max_w) = content_box(viewport_w, insets);
    let dir = detect_writing_direction(utf16);
    let offset = snap_utf16_boundary(utf16, utf16_offset as usize);
    let lines = layout_visual_lines(utf16, viewport_w, insets);

    let line = lines
        .iter()
        .find(|l| {
            if l.is_soft_wrapped {
                offset >= l.start && offset < l.end
            } else {
                offset >= l.start && offset <= l.end
            }
        })
        .or_else(|| lines.last())
        .expect("layout_visual_lines always emits at least one line");

    let prefix_w = measure_range_width(utf16, line.start, offset);
    let x = match dir {
        AffineWritingDirection::Ltr => origin_x + prefix_w,
        AffineWritingDirection::Rtl => origin_x + max_w - prefix_w,
    };

    AffineRect {
        x,
        y: line.y,
        width: 2.0,
        height: LINE_HEIGHT_PT,
    }
}

/// Compute fallback per-line selection rectangles across soft-wrapped visual lines.
pub fn selection_rects_for_range(
    utf16: &[u16],
    range: AffineUtf16Range,
    viewport_w: f32,
    insets: AffineWindowInsets,
) -> Vec<AffineSelectionRect> {
    if range.length == 0 || utf16.is_empty() {
        return Vec::new();
    }
    let sel_start = snap_utf16_boundary(utf16, range.location as usize);
    let sel_end = snap_utf16_boundary(
        utf16,
        (range.location as usize).saturating_add(range.length as usize),
    );
    if sel_end <= sel_start {
        return Vec::new();
    }
    let (origin_x, _origin_y, max_w) = content_box(viewport_w, insets);
    let dir = detect_writing_direction(utf16);
    let lines = layout_visual_lines(utf16, viewport_w, insets);
    let mut rects = Vec::new();

    for line in &lines {
        if sel_end < line.start || sel_start > line.end {
            continue;
        }
        let seg_start = line.start.max(sel_start);
        let seg_end = line.end.min(sel_end);
        let empty_hard_line_inside = line.start == line.end
            && !line.is_soft_wrapped
            && sel_start < line.start
            && sel_end > line.end;
        if seg_end <= seg_start && !empty_hard_line_inside {
            continue;
        }

        let contains_start = if line.is_soft_wrapped {
            sel_start >= line.start && sel_start < line.end
        } else {
            sel_start >= line.start && sel_start <= line.end
        };
        let contains_end = sel_end > line.start && sel_end <= line.end;

        let prefix_start = measure_range_width(utf16, line.start, seg_start);
        let prefix_end = measure_range_width(utf16, line.start, seg_end);
        let (x0, x1) = match dir {
            AffineWritingDirection::Ltr => (origin_x + prefix_start, origin_x + prefix_end),
            AffineWritingDirection::Rtl => (
                origin_x + max_w - prefix_end,
                origin_x + max_w - prefix_start,
            ),
        };
        rects.push(AffineSelectionRect {
            rect: AffineRect {
                x: x0.min(x1),
                y: line.y,
                width: (x1 - x0).abs().max(2.0),
                height: LINE_HEIGHT_PT,
            },
            contains_start,
            contains_end,
        });
    }
    rects
}

/// Hit-test the closest surrogate-safe UTF-16 offset for a point in host view coordinates.
pub fn closest_offset_for_point(
    utf16: &[u16],
    point: AffinePoint,
    viewport_w: f32,
    insets: AffineWindowInsets,
) -> u32 {
    if utf16.is_empty() {
        return 0;
    }
    let (origin_x, _origin_y, max_w) = content_box(viewport_w, insets);
    let dir = detect_writing_direction(utf16);
    let lines = layout_visual_lines(utf16, viewport_w, insets);
    let px = if point.x.is_finite() { point.x } else { 0.0 };
    let py = if point.y.is_finite() { point.y } else { 0.0 };

    let mut target_line = &lines[0];
    let mut best_dy = f32::INFINITY;
    for line in &lines {
        let mid_y = line.y + LINE_HEIGHT_PT * 0.5;
        let dy = (py - mid_y).abs();
        if dy < best_dy {
            best_dy = dy;
            target_line = line;
        }
    }

    let boundary_x = |prefix_w: f32| match dir {
        AffineWritingDirection::Ltr => origin_x + prefix_w,
        AffineWritingDirection::Rtl => origin_x + max_w - prefix_w,
    };

    let mut best_offset = target_line.start;
    let mut best_dx = (px - boundary_x(0.0)).abs();
    let mut acc_w = 0.0f32;
    let mut idx = target_line.start;
    while idx < target_line.end {
        let next = next_cluster_end(utf16, idx);
        acc_w += default_cluster_advance_pt(&utf16[idx..next]);
        let dx = (px - boundary_x(acc_w)).abs();
        if dx < best_dx {
            best_dx = dx;
            best_offset = next;
        }
        idx = next;
    }

    snap_utf16_boundary(utf16, best_offset).min(u32::MAX as usize) as u32
}

/// Software fallback RGBA8 loupe rasterizer used only when no native CoreText provider
/// is registered (e.g. headless Linux `cargo test`).
#[allow(clippy::too_many_arguments)]
pub fn render_loupe_rgba8(
    utf16: &[u16],
    selected_range: AffineUtf16Range,
    viewport_w: f32,
    insets: AffineWindowInsets,
    focus_x: f32,
    focus_y: f32,
    diameter_px: u32,
    zoom_scale: f32,
) -> Vec<u8> {
    let dim = diameter_px.clamp(16, 512) as usize;
    let zoom = if zoom_scale.is_finite() && zoom_scale > 0.25 {
        zoom_scale.min(12.0)
    } else {
        1.75
    };
    let mut rgba = vec![255u8; dim * dim * 4];
    let (origin_x, _origin_y, max_w) = content_box(viewport_w, insets);
    let dir = detect_writing_direction(utf16);
    let lines = layout_visual_lines(utf16, viewport_w, insets);

    let sel_start = selected_range.location as usize;
    let sel_end = sel_start.saturating_add(selected_range.length as usize);
    let half_dim = (dim as f32) * 0.5;

    let to_px = |wx: f32, wy: f32| -> (f32, f32) {
        (
            (wx - focus_x) * zoom + half_dim,
            (wy - focus_y) * zoom + half_dim,
        )
    };

    for line in &lines {
        let mut acc_w = 0.0f32;
        let mut idx = line.start;
        while idx < line.end {
            let next = next_cluster_end(utf16, idx);
            let adv = default_cluster_advance_pt(&utf16[idx..next]);
            let glyph_x = match dir {
                AffineWritingDirection::Ltr => origin_x + acc_w,
                AffineWritingDirection::Rtl => origin_x + max_w - acc_w - adv,
            };

            if idx >= sel_start && idx < sel_end {
                let (px0, py0) = to_px(glyph_x, line.y);
                let (px1, py1) = to_px(glyph_x + adv, line.y + LINE_HEIGHT_PT);
                fill_rect(&mut rgba, dim, px0, py0, px1, py1, [206, 232, 255, 255]);
            }

            if !matches!(utf16[idx], 0x0020 | 0x000A | 0x000D) {
                let (gx0, gy0) = to_px(glyph_x + 1.0, line.y + 4.0);
                let (gx1, gy1) = to_px(
                    glyph_x + (adv - 1.0).max(2.0),
                    line.y + LINE_HEIGHT_PT - 4.0,
                );
                fill_rect(&mut rgba, dim, gx0, gy0, gx1, gy1, [24, 24, 28, 255]);
            }

            acc_w += adv;
            idx = next;
        }
    }

    let cx = half_dim;
    fill_rect(
        &mut rgba,
        dim,
        cx - 1.0,
        half_dim - (LINE_HEIGHT_PT * 0.5) * zoom,
        cx + 1.0,
        half_dim + (LINE_HEIGHT_PT * 0.5) * zoom,
        [30, 150, 235, 255],
    );

    rgba
}

fn fill_rect(rgba: &mut [u8], dim: usize, x0: f32, y0: f32, x1: f32, y1: f32, color: [u8; 4]) {
    let ix0 = (x0.floor() as isize).clamp(0, dim as isize) as usize;
    let iy0 = (y0.floor() as isize).clamp(0, dim as isize) as usize;
    let ix1 = (x1.ceil() as isize).clamp(0, dim as isize) as usize;
    let iy1 = (y1.ceil() as isize).clamp(0, dim as isize) as usize;
    for y in iy0..iy1 {
        for x in ix0..ix1 {
            let base = (y * dim + x) * 4;
            rgba[base..base + 4].copy_from_slice(&color);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_text_layout_handles_soft_wrap_boundary_selection_rects_and_surrogate() {
        let insets = AffineWindowInsets::default();

        // 1. Soft-wrap boundary offset belongs to the start of the wrapped next line,
        // and selecting from that offset emits no trailing 2pt sliver on the prior line.
        let narrow: Vec<u16> = "ABCDZ".encode_utf16().collect();
        let c0 = caret_rect_for_offset(&narrow, 0, 72.0, insets);
        let c4 = caret_rect_for_offset(&narrow, 4, 72.0, insets);
        assert!(
            c4.y > c0.y + 10.0 && (c4.x - c0.x).abs() < 0.01,
            "soft-wrap boundary offset 4 must start line 2 (c0={c0:?}, c4={c4:?})"
        );
        let wrapped_tail = selection_rects_for_range(
            &narrow,
            AffineUtf16Range {
                location: 4,
                length: 1,
            },
            72.0,
            insets,
        );
        assert_eq!(wrapped_tail.len(), 1, "no 2pt sliver on line 1");
        assert!(wrapped_tail[0].rect.y > c0.y + 10.0);
        assert!(wrapped_tail[0].contains_start && wrapped_tail[0].contains_end);

        // Hard newline boundary offset stays on line 1; offset after `\n` starts line 2.
        let hard: Vec<u16> = "AB\nCD".encode_utf16().collect();
        let ch2 = caret_rect_for_offset(&hard, 2, 390.0, insets);
        let ch3 = caret_rect_for_offset(&hard, 3, 390.0, insets);
        assert!((ch2.y - c0.y).abs() < 0.01);
        assert!(ch3.y > ch2.y + 10.0);

        // 2. Multi-line soft-wrap selection emits per-line rects with start/end flags.
        let long: Vec<u16> =
            "AFFiNE native iOS soft line wrapping verification across multiple visual lines"
                .encode_utf16()
                .collect();
        let cl0 = caret_rect_for_offset(&long, 0, 390.0, insets);
        let cl60 = caret_rect_for_offset(&long, 60, 390.0, insets);
        assert!(cl60.y > cl0.y + 10.0);
        assert_eq!(
            closest_offset_for_point(
                &long,
                AffinePoint {
                    x: cl60.x,
                    y: cl60.y + 10.0,
                },
                390.0,
                insets,
            ),
            60
        );
        let rects = selection_rects_for_range(
            &long,
            AffineUtf16Range {
                location: 5,
                length: 60,
            },
            390.0,
            insets,
        );
        assert!(rects.len() >= 2);
        assert!(rects.first().unwrap().contains_start);
        assert!(!rects.first().unwrap().contains_end);
        assert!(!rects.last().unwrap().contains_start);
        assert!(rects.last().unwrap().contains_end);

        // 3. Base & per-paragraph direction detection and surrogate pair boundary snap.
        let hebrew: Vec<u16> = "שלום".encode_utf16().collect();
        assert_eq!(
            detect_writing_direction(&hebrew),
            AffineWritingDirection::Rtl
        );
        let multi_para: Vec<u16> = "A\nשלום".encode_utf16().collect();
        assert_eq!(
            detect_paragraph_writing_direction(&multi_para, 0),
            AffineWritingDirection::Ltr
        );
        assert_eq!(
            detect_paragraph_writing_direction(&multi_para, 2),
            AffineWritingDirection::Rtl
        );
        let emoji: Vec<u16> = "A😀B".encode_utf16().collect();
        assert_eq!(snap_utf16_boundary(&emoji, 2), 1);

        // 4. Fallback loupe RGBA8 produces strictly more dark pixels over 'W' than spaces.
        let sample: Vec<u16> = "WWWW        ....".encode_utf16().collect();
        let cw = caret_rect_for_offset(&sample, 2, 390.0, insets);
        let cs = caret_rect_for_offset(&sample, 9, 390.0, insets);
        let count_dark = |buf: &[u8]| -> usize {
            buf.chunks_exact(4)
                .filter(|px| px[3] == 255 && px[0] < 80 && px[1] < 80 && px[2] < 80)
                .count()
        };
        let dark_w = count_dark(&render_loupe_rgba8(
            &sample,
            AffineUtf16Range {
                location: 0,
                length: 16,
            },
            390.0,
            insets,
            cw.x,
            cw.y + 11.0,
            88,
            1.75,
        ));
        let dark_s = count_dark(&render_loupe_rgba8(
            &sample,
            AffineUtf16Range {
                location: 0,
                length: 16,
            },
            390.0,
            insets,
            cs.x,
            cs.y + 11.0,
            88,
            1.75,
        ));
        assert!(
            dark_w > 0 && dark_w > dark_s,
            "dark_w={dark_w} dark_s={dark_s}"
        );
    }
}
