//! Pure-Rust fallback text layout (per-paragraph UAX #9 first-strong BiDi,
//! soft-wrapping, and proportional/measured glyph advances) used when Android
//! `StaticLayout` is unavailable (headless Rust tests and JVM-only parity checks).
//! On Android devices, `ShapedTextLayout` (`android.text.StaticLayout`) is the
//! single authoritative layout engine for handles, hit-testing, and the loupe.

use crate::selection::TextDirection;

/// Layout parameters in viewport pixel space.
#[derive(Debug, Clone, PartialEq)]
pub struct TextLayoutMetrics {
    pub origin_x: f32,
    pub origin_y: f32,
    pub max_width: f32,
    pub char_advance: f32,
    pub line_height: f32,
    /// Optional per-UTF-16-unit advance widths measured by Android `TextPaint.getTextWidths`.
    pub measured_advances: Vec<f32>,
}

impl Default for TextLayoutMetrics {
    fn default() -> Self {
        Self::for_viewport(1080.0, 3.0)
    }
}

impl TextLayoutMetrics {
    /// Builds default viewport-scaled text metrics for a given width and density.
    pub fn for_viewport(viewport_width: f32, density: f32) -> Self {
        let d = if density.is_finite() && density > 0.0 {
            density
        } else {
            1.0
        };
        let pad = 24.0 * d;
        let max_w = if viewport_width.is_finite() && viewport_width > pad * 2.0 {
            viewport_width - pad * 2.0
        } else {
            320.0 * d
        };
        Self {
            origin_x: pad,
            origin_y: 80.0 * d,
            max_width: max_w,
            char_advance: 12.0 * d,
            line_height: 28.0 * d,
            measured_advances: Vec::new(),
        }
    }

    /// Updates viewport-derived layout metrics while preserving any explicit `measured_advances`.
    pub fn update_viewport(&mut self, viewport_width: f32, density: f32) {
        let next = Self::for_viewport(viewport_width, density);
        self.origin_x = next.origin_x;
        self.origin_y = next.origin_y;
        self.max_width = next.max_width;
        self.char_advance = next.char_advance;
        self.line_height = next.line_height;
    }

    /// Replaces the optional measured advance table (sanitizing non-finite values).
    pub fn set_measured_advances(&mut self, advances: Vec<f32>) {
        self.measured_advances = advances
            .into_iter()
            .map(|w| if w.is_finite() && w >= 0.0 { w } else { 0.0 })
            .collect();
    }
}

#[derive(Debug, Clone)]
struct VisualLine {
    start_utf16: usize,
    end_utf16: usize,
    direction: TextDirection,
    /// `(utf16_offset, step, x_offset_from_line_start, advance)` for each cluster on the line.
    clusters: Vec<(usize, usize, f32, f32)>,
    total_width: f32,
}

/// Detects paragraph writing direction from the first strong directional scalar (UAX #9).
pub fn detect_writing_direction(utf16: &[u16]) -> TextDirection {
    for ch in char::decode_utf16(utf16.iter().copied()).flatten() {
        let cp = ch as u32;
        if is_rtl_codepoint(cp) {
            return TextDirection::Rtl;
        }
        if ch.is_alphabetic() {
            return TextDirection::Ltr;
        }
    }
    TextDirection::Ltr
}

const fn is_rtl_codepoint(cp: u32) -> bool {
    matches!(
        cp,
        0x0590..=0x05FF
            | 0x0600..=0x06FF
            | 0x0750..=0x077F
            | 0x08A0..=0x08FF
            | 0x200F
            | 0xFB50..=0xFDFF
            | 0xFE70..=0xFEFF
    )
}

/// Returns a proportional fallback glyph advance when `TextPaint` widths are not supplied.
pub fn proportional_char_advance(ch: char, base_advance: f32) -> f32 {
    let base = base_advance.max(1.0);
    let cp = ch as u32;
    if matches!(
        ch,
        'i' | 'l' | 'I' | '.' | ',' | ':' | ';' | '!' | '|' | '\'' | '`'
    ) {
        return base * 0.42;
    }
    if matches!(
        ch,
        ' ' | 'j' | 't' | 'f' | 'r' | '1' | '(' | ')' | '[' | ']'
    ) {
        return base * 0.58;
    }
    if matches!(ch, 'W' | 'M' | '@' | '%' | 'm' | 'w') {
        return base * 1.38;
    }
    if cp >= 0x2E80 {
        return base * 1.55;
    }
    base
}

fn decode_cluster(utf16: &[u16], i: usize) -> (char, usize) {
    let u = utf16[i];
    if (0xD800..=0xDBFF).contains(&u)
        && i + 1 < utf16.len()
        && (0xDC00..=0xDFFF).contains(&utf16[i + 1])
    {
        let ch = char::decode_utf16([u, utf16[i + 1]])
            .next()
            .and_then(Result::ok)
            .unwrap_or('\u{FFFD}');
        (ch, 2)
    } else {
        let ch = char::from_u32(u32::from(u)).unwrap_or('\u{FFFD}');
        (ch, 1)
    }
}

fn cluster_advance(
    utf16: &[u16],
    i: usize,
    step: usize,
    ch: char,
    metrics: &TextLayoutMetrics,
) -> f32 {
    if metrics.measured_advances.len() == utf16.len() {
        let sum: f32 = metrics.measured_advances[i..i + step].iter().copied().sum();
        if sum.is_finite() && sum >= 0.0 {
            return sum;
        }
    }
    proportional_char_advance(ch, metrics.char_advance)
}

fn layout_lines(utf16: &[u16], metrics: &TextLayoutMetrics) -> Vec<VisualLine> {
    let max_w = metrics.max_width.max(metrics.char_advance.max(1.0));
    let mut lines = Vec::new();
    let mut para_start = 0usize;

    loop {
        let mut para_end = para_start;
        while para_end < utf16.len() && utf16[para_end] != b'\n' as u16 {
            para_end += 1;
        }
        let para_dir = detect_writing_direction(&utf16[para_start..para_end]);

        let mut line_start = para_start;
        let mut clusters = Vec::new();
        let mut line_w = 0.0_f32;
        let mut i = para_start;

        while i < para_end {
            let (ch, step) = decode_cluster(utf16, i);
            let adv = cluster_advance(utf16, i, step, ch, metrics);
            if !clusters.is_empty() && line_w + adv > max_w {
                lines.push(VisualLine {
                    start_utf16: line_start,
                    end_utf16: i,
                    direction: para_dir,
                    clusters,
                    total_width: line_w,
                });
                line_start = i;
                clusters = Vec::new();
                line_w = 0.0;
            }
            clusters.push((i, step, line_w, adv));
            line_w += adv;
            i += step;
        }

        lines.push(VisualLine {
            start_utf16: line_start,
            end_utf16: para_end,
            direction: para_dir,
            clusters,
            total_width: line_w,
        });

        if para_end >= utf16.len() {
            break;
        }
        para_start = para_end + 1;
    }

    lines
}

fn find_line_for_offset(lines: &[VisualLine], clamped_offset: usize) -> usize {
    for (idx, line) in lines.iter().enumerate() {
        if clamped_offset < line.end_utf16 {
            return idx;
        }
        if clamped_offset == line.end_utf16 {
            // Soft-wrap boundary offsets belong to the start of the next visual line.
            if let Some(next) = lines.get(idx + 1)
                && next.start_utf16 == clamped_offset
            {
                return idx + 1;
            }
            return idx;
        }
    }
    lines.len().saturating_sub(1)
}

/// Returns the paragraph writing direction at UTF-16 `offset`.
pub fn detect_direction_at_offset(
    utf16: &[u16],
    offset: usize,
    metrics: &TextLayoutMetrics,
) -> TextDirection {
    let lines = layout_lines(utf16, metrics);
    let idx = find_line_for_offset(&lines, offset.min(utf16.len()));
    lines[idx].direction
}

/// Computes the caret baseline `(x, y)` in viewport pixels for UTF-16 `offset`.
pub fn caret_position_for_offset(
    utf16: &[u16],
    offset: usize,
    metrics: &TextLayoutMetrics,
) -> (f32, f32) {
    let lines = layout_lines(utf16, metrics);
    let clamped = offset.min(utf16.len());
    let line_idx = find_line_for_offset(&lines, clamped);
    let line = &lines[line_idx];

    let mut advance_x = line.total_width;
    if clamped <= line.start_utf16 {
        advance_x = 0.0;
    } else {
        for &(c_off, _step, c_x, _c_adv) in &line.clusters {
            if c_off >= clamped {
                advance_x = c_x;
                break;
            }
        }
    }

    let x = match line.direction {
        TextDirection::Ltr => metrics.origin_x + advance_x,
        TextDirection::Rtl => metrics.origin_x + metrics.max_width - advance_x,
    };
    let y = metrics.origin_y + (line_idx as f32 + 1.0) * metrics.line_height;
    (x, y)
}

/// Resolves viewport pixel `(x, y)` to the closest UTF-16 scalar boundary offset.
pub fn closest_offset_for_position(
    utf16: &[u16],
    x: f32,
    y: f32,
    metrics: &TextLayoutMetrics,
) -> usize {
    let lines = layout_lines(utf16, metrics);
    let lh = metrics.line_height.max(1.0);
    let rel_line = ((y - metrics.origin_y) / lh - 0.5).floor();
    let line_idx = if rel_line <= 0.0 {
        0
    } else {
        (rel_line as usize).min(lines.len().saturating_sub(1))
    };
    let line = &lines[line_idx];
    let target_x = match line.direction {
        TextDirection::Ltr => (x - metrics.origin_x).max(0.0),
        TextDirection::Rtl => (metrics.origin_x + metrics.max_width - x).max(0.0),
    };

    let mut best_off = line.start_utf16;
    let mut best_dist = target_x.abs();
    for &(c_off, step, c_x, c_adv) in &line.clusters {
        let end_off = c_off + step;
        let end_x = c_x + c_adv;
        let dist = (target_x - end_x).abs();
        if dist < best_dist {
            best_dist = dist;
            best_off = end_off;
        }
    }
    best_off
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_layout_handles_per_paragraph_bidi_and_proportional_widths() {
        let metrics = TextLayoutMetrics::for_viewport(1080.0, 3.0);

        // 1. Per-paragraph BiDi ("A\nשלום"): line 0 is LTR (x increases), line 1 is RTL (x decreases).
        let mixed: Vec<u16> = "A\nשלום".encode_utf16().collect();
        let (x0, y0) = caret_position_for_offset(&mixed, 0, &metrics);
        let (x1, y1) = caret_position_for_offset(&mixed, 1, &metrics);
        assert!(x1 > x0, "paragraph 0 ('A') must advance LTR");
        assert_eq!(y0, y1);
        let (x2, y2) = caret_position_for_offset(&mixed, 2, &metrics);
        let (x3, y3) = caret_position_for_offset(&mixed, 3, &metrics);
        assert!(y2 > y0, "paragraph 1 must sit on second line");
        assert_eq!(y2, y3);
        assert!(x3 < x2, "paragraph 1 ('שלום') must advance RTL");
        assert_eq!(
            detect_direction_at_offset(&mixed, 0, &metrics),
            TextDirection::Ltr
        );
        assert_eq!(
            detect_direction_at_offset(&mixed, 2, &metrics),
            TextDirection::Rtl
        );
        assert_eq!(closest_offset_for_position(&mixed, x3, y3, &metrics), 3);

        // 2. Proportional glyph widths: "WWWW" is strictly wider than "iiii".
        let narrow: Vec<u16> = "iiii".encode_utf16().collect();
        let wide: Vec<u16> = "WWWW".encode_utf16().collect();
        let (nx_end, _) = caret_position_for_offset(&narrow, 4, &metrics);
        let (wx_end, _) = caret_position_for_offset(&wide, 4, &metrics);
        assert!(
            wx_end > nx_end * 1.5,
            "WWWW ({wx_end}) must be much wider than iiii ({nx_end})"
        );

        // 3. Explicit measured_advances preserve zero-advance combining marks (e\u{0301})
        //    and survive update_viewport calls.
        let combining: Vec<u16> = "e\u{0301}".encode_utf16().collect();
        let mut custom = metrics.clone();
        custom.set_measured_advances(vec![10.0, 0.0]);
        let (c0, _) = caret_position_for_offset(&combining, 0, &custom);
        let (c1, _) = caret_position_for_offset(&combining, 1, &custom);
        let (c2, _) = caret_position_for_offset(&combining, 2, &custom);
        assert!((c1 - c0 - 10.0).abs() < 1e-3);
        assert!(
            (c2 - c1).abs() < 1e-3,
            "combining mark must keep 0.0 advance (got {})",
            c2 - c1
        );
        custom.update_viewport(720.0, 2.0);
        assert_eq!(
            custom.measured_advances,
            vec![10.0, 0.0],
            "update_viewport must preserve measured_advances"
        );

        // 4. Soft-wrap boundary offset belongs to the start of the next visual line.
        let mut wrap = TextLayoutMetrics {
            origin_x: 0.0,
            origin_y: 0.0,
            max_width: 40.0,
            char_advance: 10.0,
            line_height: 20.0,
            measured_advances: vec![10.0, 10.0, 10.0, 10.0, 10.0],
        };
        let abcdz: Vec<u16> = "ABCDZ".encode_utf16().collect();
        let (wx4, wy4) = caret_position_for_offset(&abcdz, 4, &wrap);
        assert!(
            wx4.abs() < 1e-3 && (wy4 - 40.0).abs() < 1e-3,
            "offset 4 in soft-wrapped 'ABCDZ' must land at line 1 start (got ({wx4}, {wy4}))"
        );
        wrap.measured_advances.clear();
        assert_eq!(
            detect_direction_at_offset(&abcdz, 4, &wrap),
            TextDirection::Ltr
        );
    }
}
