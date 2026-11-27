//! Formatting helpers for `affine:database` property values (`number`, `date`, `progress`,
//! `created-time`, `select`/`multi-select` tag colors) with `BidiIsolation::LtrIsolate`.

use ui::Hsla;

use crate::{block_flow::civil_from_days, theme::PlaygroundTheme};

/// Unicode bidi isolation mode for formatted inline tokens.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BidiIsolation {
    None,
    /// Wraps strong LTR tokens (numbers, currency, percentages, dates, URLs, emails, formulas)
    /// in `\u{2066}...\u{2069}` (LRI..PDI) so they never reorder inside Arabic/Hebrew RTL contexts.
    LtrIsolate,
}

/// Wrap `text` according to `mode`.
pub fn isolate_bidi(text: &str, mode: BidiIsolation) -> String {
    match mode {
        BidiIsolation::None => text.to_string(),
        BidiIsolation::LtrIsolate => isolate_ltr(text),
    }
}

/// Wrap a strong-LTR formatted value in `\u{2066}...\u{2069}` (LRI..PDI).
pub fn isolate_ltr(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    format!("\u{2066}{text}\u{2069}")
}

/// Format a numeric database cell matching `0.27.5` `property-presets/number/utils/formatter.ts`,
/// wrapped in `BidiIsolation::LtrIsolate`.
pub fn format_database_number(value: f64, format: &str, decimals: Option<usize>) -> String {
    if !value.is_finite() {
        return String::new();
    }
    let negative = value.is_sign_negative() && value != 0.0;
    let abs = value.abs();
    let (prefix, suffix, scaled, use_commas, default_decimals) = match format {
        "numberWithCommas" => ("", "", abs, true, None),
        "percent" => ("", "%", abs * 100.0, false, Some(0)),
        "currencyUSD" => ("$", "", abs, true, Some(2)),
        "currencyEUR" => ("\u{20AC}", "", abs, true, Some(2)),
        "currencyGBP" => ("\u{00A3}", "", abs, true, Some(2)),
        "currencyCNY" => ("\u{00A5}", "", abs, true, Some(2)),
        "currencyYen" => ("\u{00A5}", "", abs, true, Some(0)),
        "currencyINR" => ("\u{20B9}", "", abs, true, Some(2)),
        _ => ("", "", abs, false, None),
    };
    let formatted_num = match decimals.or(default_decimals) {
        Some(d) => {
            let s = format!("{scaled:.d$}");
            if use_commas { insert_commas(&s) } else { s }
        }
        None => {
            let s = if (scaled.fract()).abs() < 1e-9 {
                format!("{scaled:.0}")
            } else {
                let raw = format!("{scaled:.4}");
                raw.trim_end_matches('0').trim_end_matches('.').to_string()
            };
            if use_commas { insert_commas(&s) } else { s }
        }
    };
    let sign = if negative { "-" } else { "" };
    isolate_ltr(&format!("{sign}{prefix}{formatted_num}{suffix}"))
}

fn insert_commas(num: &str) -> String {
    let (int_part, frac_part) = match num.split_once('.') {
        Some((i, f)) => (i, Some(f)),
        None => (num, None),
    };
    let mut out = String::with_capacity(int_part.len() + int_part.len() / 3 + 4);
    let len = int_part.len();
    for (idx, ch) in int_part.chars().enumerate() {
        if idx > 0 && (len - idx).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    if let Some(frac) = frac_part {
        out.push('.');
        out.push_str(frac);
    }
    out
}

/// Format a database `date` timestamp (UTC ms) in `yyyy/MM/dd` at `offset_minutes` east of UTC,
/// matching `0.27.5` `date/cell-renderer.ts:133`, wrapped in `BidiIsolation::LtrIsolate`.
pub fn format_database_date(utc_ms: i64, offset_minutes: i32) -> String {
    let local_ms = utc_ms.saturating_add(i64::from(offset_minutes) * 60_000);
    let days = local_ms.div_euclid(86_400_000);
    let (y, m, d) = civil_from_days(days);
    isolate_ltr(&format!("{y:04}/{m:02}/{d:02}"))
}

/// Format a database `created-time` timestamp (UTC ms) in `yyyy/MM/dd HH:mm` at `offset_minutes`.
pub fn format_database_created_time(utc_ms: i64, offset_minutes: i32) -> String {
    let local_ms = utc_ms.saturating_add(i64::from(offset_minutes) * 60_000);
    let days = local_ms.div_euclid(86_400_000);
    let rem_ms = local_ms.rem_euclid(86_400_000);
    let (y, m, d) = civil_from_days(days);
    let hh = rem_ms / 3_600_000;
    let mm = (rem_ms % 3_600_000) / 60_000;
    isolate_ltr(&format!("{y:04}/{m:02}/{d:02} {hh:02}:{mm:02}"))
}

/// Clamp progress to `0..=100` and return `(ratio, isolated_label)`.
pub fn format_database_progress(raw: i64) -> (f32, String) {
    let clamped = raw.clamp(0, 100);
    (clamped as f32 / 100.0, isolate_ltr(&format!("{clamped}%")))
}

/// Resolve a `select`/`multi-select` option color (`var(--affine-tag-*)`,
/// `var(--affine-v2-chip-label-*)`, or `#hex`) into `(pill_bg, pill_text)` with
/// readable contrast in both Light and Dark themes.
pub fn resolve_tag_color(raw: &str, theme: PlaygroundTheme) -> (Hsla, Hsla) {
    let palette = theme.palette();
    let trimmed = raw.trim();
    let bg = theme
        .css_color(trimmed)
        .or_else(|| theme.css_var(trimmed))
        .or_else(|| {
            // Map legacy `--affine-tag-*` names to v2 chip label tokens when needed.
            let lower = trimmed.to_ascii_lowercase();
            let v2_name = if lower.contains("red") {
                Some("--affine-v2-chip-label-red")
            } else if lower.contains("pink") || lower.contains("magenta") {
                Some("--affine-v2-chip-label-magenta")
            } else if lower.contains("orange") {
                Some("--affine-v2-chip-label-orange")
            } else if lower.contains("yellow") {
                Some("--affine-v2-chip-label-yellow")
            } else if lower.contains("green") {
                Some("--affine-v2-chip-label-green")
            } else if lower.contains("teal") {
                Some("--affine-v2-chip-label-teal")
            } else if lower.contains("blue") {
                Some("--affine-v2-chip-label-blue")
            } else if lower.contains("purple") {
                Some("--affine-v2-chip-label-purple")
            } else if lower.contains("gray") || lower.contains("grey") {
                Some("--affine-v2-chip-label-grey")
            } else {
                None
            };
            v2_name.and_then(|name| theme.css_var(name))
        })
        .unwrap_or(palette.background_secondary);
    (bg, palette.text_primary)
}

/// Map a database column type to an `ui-tokens` icon name.
pub fn column_icon_name(col_type: &str) -> &'static str {
    match col_type {
        "title" | "rich-text" => "TextIcon",
        "select" => "BulletedListIcon",
        "multi-select" => "RoundedRectangleIcon",
        "number" => "NumberedListIcon",
        "date" | "created-time" => "PageIcon",
        "checkbox" => "CheckBoxCheckLinearIcon",
        "progress" => "InformationIcon",
        "link" => "LinkIcon",
        "image" => "ShapeIcon",
        _ => "SquareIcon",
    }
}
