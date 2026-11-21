//! The width and advance of an `em` in fonts that have no `m`.
//!
//! [`TextSystem::em_width`] and [`TextSystem::em_advance`] measure the font's
//! own `m` glyph, and upstream fails when there is none. Fonts without Latin
//! letters — Hebrew, Arabic, CJK, symbol and emoji fonts — are valid and
//! common as an element's font, so `em` and `ch`-style measurements of their
//! text failed. For those fonts the `m` is measured where text in them would
//! get it: in the font platform shaping falls back to. Fonts that have an `m`
//! are measured exactly as upstream measures them.

use anyhow::Result;

use crate::{FontId, FontRun, GlyphId, Pixels, TextSystem};

/// [`TextSystem::em_width`]: the width of the font's `m`, or of the `m`
/// platform shaping falls back to when the font has none.
pub(crate) fn em_width(
    text_system: &TextSystem,
    font_id: FontId,
    font_size: Pixels,
) -> Result<Pixels> {
    if let Some((fallback_id, glyph_id)) = fallback_m(text_system, font_id, font_size) {
        let bounds = text_system
            .platform_text_system
            .typographic_bounds(fallback_id, glyph_id)?;
        return Ok(font_size * bounds.size.width / text_system.units_per_em(fallback_id) as f32);
    }
    Ok(text_system
        .typographic_bounds(font_id, font_size, 'm')?
        .size
        .width)
}

/// [`TextSystem::em_advance`]: the advance of the font's `m`, or of the `m`
/// platform shaping falls back to when the font has none.
pub(crate) fn em_advance(
    text_system: &TextSystem,
    font_id: FontId,
    font_size: Pixels,
) -> Result<Pixels> {
    if let Some((fallback_id, glyph_id)) = fallback_m(text_system, font_id, font_size) {
        let advance = text_system
            .platform_text_system
            .advance(fallback_id, glyph_id)?;
        return Ok(font_size * advance.width / text_system.units_per_em(fallback_id) as f32);
    }
    Ok(text_system.advance(font_id, font_size, 'm')?.width)
}

/// When `font_id` has no `m`, the font and glyph platform shaping draws an
/// `m` in that font with. `None` when the font has an `m`, or when shaping
/// finds no other font for it either, leaving upstream's error to report.
fn fallback_m(
    text_system: &TextSystem,
    font_id: FontId,
    font_size: Pixels,
) -> Option<(FontId, GlyphId)> {
    let platform = &text_system.platform_text_system;
    if platform.glyph_for_char(font_id, 'm').is_some() {
        return None;
    }
    let layout = platform.layout_line("m", font_size, &[FontRun { len: 1, font_id }]);
    layout
        .runs
        .iter()
        .filter(|run| run.font_id != font_id)
        .find_map(|run| Some((run.font_id, run.glyphs.first()?.id)))
}
