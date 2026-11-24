//! Native fonts made once per size and kept, so CoreText's shaping caches survive from line to line.

use crate::collections::HashMap;
use crate::{FontId, Pixels};
use core_text::font::CTFont;
use font_kit::font::Font as FontKitFont;

/// Each font at each size a line has been laid out at. CoreText keeps the
/// caches it builds for shaping — the advances and glyphs of ASCII among
/// them — on the font object, so a font made afresh for every line built
/// them again for every line.
#[derive(Default)]
pub(crate) struct SizedFonts(HashMap<(FontId, u32), CTFont>);

impl SizedFonts {
    /// The native font for `font`, whose id is `font_id`, at `font_size`, made
    /// once and kept.
    pub(crate) fn get(&mut self, font_id: FontId, font: &FontKitFont, font_size: Pixels) -> CTFont {
        // Sizes can animate, and every size a font is drawn at would otherwise
        // be kept for good.
        const MAX_SIZED_FONTS: usize = 1024;
        let key = (font_id, f32::from(font_size).to_bits());
        if let Some(font) = self.0.get(&key) {
            return font.clone();
        }
        if self.0.len() >= MAX_SIZED_FONTS {
            self.0.clear();
        }
        let font = font
            .native_font()
            .clone_with_font_size(f32::from(font_size).into());
        self.0.insert(key, font.clone());
        font
    }
}

/// A glyph drawn at dilation 0 is smoothed only when the user allows smoothing.
///
/// `glyph_dilation_for_color` gives 0 both for dark text and when
/// `AppleFontSmoothing` is 0, but CoreGraphics' own smoothing flag defaults to
/// on and CoreGraphics reads only the persistent value of the preference: an
/// app that turns smoothing off for itself (a launch argument, the argument
/// domain) still got every dark glyph dilated, 10–22 % more ink than the same
/// glyph with smoothing off. With smoothing allowed this keeps CoreGraphics'
/// default, so the usual look does not change.
#[cfg(target_os = "macos")]
pub(crate) fn smooth_undilated(cx: &core_graphics::context::CGContext, allowed: bool) {
    if !allowed {
        cx.set_should_smooth_fonts(false);
    }
}
