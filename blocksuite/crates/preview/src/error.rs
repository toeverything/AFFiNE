use thiserror::Error;

/// Error returned by preview rendering and rasterization operations.
#[derive(Debug, Error)]
pub enum PreviewError {
    /// Input source is empty or contains only whitespace.
    #[error("input source is empty")]
    EmptyInput,

    /// Font bytes are invalid or contain no readable font faces.
    #[error("invalid font data: {0}")]
    InvalidFont(String),

    /// SVG parsing failed.
    #[error("svg parse failed: {0}")]
    SvgParse(String),

    /// Raster target dimensions are zero, non-finite, or exceed limits.
    #[error("invalid raster size: {0}")]
    InvalidSize(String),

    /// Mermaid diagram parsing or layout failed.
    #[error("mermaid render failed: {0}")]
    Mermaid(String),

    /// Typst compilation or export failed.
    #[error("typst compile failed: {0}")]
    Typst(String),

    /// LaTeX math parsing or layout failed.
    #[error("math render failed: {0}")]
    Math(String),

    /// PDF parsing or page rendering failed.
    #[error("pdf render failed: {0}")]
    Pdf(String),

    /// Requested page index is outside the document page count.
    #[error("page index {index} is out of range for {page_count} pages")]
    PageOutOfRange { index: usize, page_count: usize },

    /// Required glyph is missing from all registered fonts in [`crate::FontPool`].
    #[error("missing glyph font: {0}")]
    MissingGlyphFont(String),

    /// Caller supplied an invalid or unsafe CSS color string.
    #[error("invalid CSS color: {0}")]
    InvalidColor(String),
}
