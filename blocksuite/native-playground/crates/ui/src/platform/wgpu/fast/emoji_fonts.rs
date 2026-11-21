//! Color emoji fonts as user font fallbacks.
//!
//! `load_family` skips any face without an 'm' glyph, so that it never
//! becomes a primary font whose em metrics are measured. Emoji fonts have no
//! 'm', so a family like "Noto Color Emoji" could not be loaded, and an app
//! couldn't name it in `FontFallbacks`. cosmic-text's own fallback then often
//! picks a monochrome symbols font first ("Noto Sans Symbols2"), and emoji
//! such as 📚 and 🎮 render in black and white. Known emoji fonts are let
//! through, the way the macOS text system loads Apple Color Emoji.

/// Whether a face without an 'm' glyph may still be loaded by family name.
pub(crate) fn may_load_without_m(postscript_name: &str) -> bool {
    crate::platform::wgpu::cosmic_text_system::check_is_known_emoji_font(postscript_name)
}
