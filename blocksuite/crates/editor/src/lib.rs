//! Reusable BlockSuite editor kernel: Page block flow, rich paragraph engine,
//! spatial Edgeless canvas, clipboard slice codec, overlays, theme bindings,
//! and the narrow [`directory::WorkspaceDocDirectory`] host port.

pub mod block_flow;
pub mod capabilities;
pub mod clipboard;
pub mod database;
pub mod directory;
pub mod edgeless;
pub mod editor_session;
pub mod fuse;
pub mod highlight;
pub mod inline_input;
pub mod overlays;
pub mod rich_text;
pub mod surface;
pub mod theme;

pub use capabilities::{EditorCapabilities, FormFactor, PointerKind};
pub use directory::{
    DirectoryError, DocQueryCancelToken, DocQueryPage, DocQueryRequest, EditorDocId, EditorDocMode,
    EditorDocPreview, EditorDocSummary, InMemoryDocDirectory, MatchedDocSummary,
    Utf16HighlightSpan, WorkspaceDocDirectory, match_exact_substring_utf16,
};
pub use fuse::{FuseHighlightMode, FuseMatch, fuse_search_utf16};
pub use theme::{PlaygroundTheme, register_bundled_fonts};

/// Height of the default top bar, including its bottom border.
pub const TOPBAR_HEIGHT: f32 = 53.0;

/// Cross-platform CJK and emoji fallback families attached to bundled fonts so
/// iOS CoreText (`MemSource` `CTFont`) and Android `CosmicTextSystem` render
/// Chinese/Japanese/Korean and emoji glyphs without missing-glyph boxes.
pub fn default_font_fallbacks() -> ui::FontFallbacks {
    static FALLBACKS: std::sync::OnceLock<ui::FontFallbacks> = std::sync::OnceLock::new();
    FALLBACKS
        .get_or_init(|| {
            ui::FontFallbacks(std::sync::Arc::new(vec![
                "PingFang SC".to_string(),
                "PingFang TC".to_string(),
                "Hiragino Sans".to_string(),
                "Apple SD Gothic Neo".to_string(),
                "Noto Sans CJK SC".to_string(),
                "Noto Sans CJK TC".to_string(),
                "Noto Sans CJK JP".to_string(),
                "Droid Sans Fallback".to_string(),
                "Apple Color Emoji".to_string(),
                "Noto Color Emoji".to_string(),
            ]))
        })
        .clone()
}
