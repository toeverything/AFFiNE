//! Fonts whose glyphs are color bitmaps, found by their `sbix` table rather
//! than by name.
//!
//! A glyph GPUI shapes is drawn as a color sprite only if the text system
//! says its font is an emoji font. Upstream says so for Apple Color Emoji by
//! its PostScript name, so any other font with `sbix` bitmaps (an
//! application's own emoji font, a user-installed one) had its glyphs drawn
//! into an alpha-only mask and tinted with the text color: a flat silhouette
//! instead of the picture.

use crate::FontId;
use crate::collections::HashSet;
use font_kit::font::Font as FontKitFont;

/// The ids of loaded fonts that have an `sbix` table.
#[derive(Default)]
pub(crate) struct ColorBitmapFonts(HashSet<FontId>);

impl ColorBitmapFonts {
    /// Notes whether `font`, just given `font_id`, draws color bitmaps. The
    /// font's table directory is read once here, so that the per-glyph
    /// question, [`ColorBitmapFonts::contains`], is a set lookup.
    pub(crate) fn note(&mut self, font_id: FontId, font: &FontKitFont) {
        if has_sbix_table(font) {
            self.0.insert(font_id);
        }
    }

    /// Whether the font `font_id` has an `sbix` table.
    pub(crate) fn contains(&self, font_id: FontId) -> bool {
        self.0.contains(&font_id)
    }
}

fn has_sbix_table(font: &FontKitFont) -> bool {
    const SBIX: u32 = u32::from_be_bytes(*b"sbix");
    font.native_font()
        .get_available_font_tables()
        .is_some_and(|tables| tables.iter().any(|tag| *tag == SBIX))
}
