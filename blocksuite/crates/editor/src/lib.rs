//! Reusable BlockSuite editor kernel: Page block flow, rich paragraph engine,
//! spatial Edgeless canvas, clipboard slice codec, overlays, theme bindings,
//! and the narrow [`directory::WorkspaceDocDirectory`] host port.

pub mod block_flow;
pub mod clipboard;
pub mod directory;
pub mod edgeless;
pub mod editor_session;
pub mod fuse;
pub mod overlays;
pub mod rich_text;
pub mod surface;
pub mod theme;

pub use directory::{
    DirectoryError, DocQueryCancelToken, DocQueryPage, DocQueryRequest, EditorDocId, EditorDocMode,
    EditorDocSummary, InMemoryDocDirectory, MatchedDocSummary, Utf16HighlightSpan,
    WorkspaceDocDirectory, match_exact_substring_utf16,
};
pub use fuse::{FuseHighlightMode, FuseMatch, fuse_search_utf16};
pub use theme::{PlaygroundTheme, register_bundled_fonts};

/// Height of the default top bar, including its bottom border.
pub const TOPBAR_HEIGHT: f32 = 53.0;
