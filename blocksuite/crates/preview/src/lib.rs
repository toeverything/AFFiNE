#![forbid(unsafe_code)]

//! Pure-Rust deterministic offline preview kernel for BlockSuite blocks.
//!
//! Covers four isolated capabilities:
//! - Deterministic in-memory font registry ([`FontPool`]), `resvg` SVG rasterizer
//!   ([`SvgRasterizer`]), and pin-protected dual-limit pixel cache ([`PinnedPixelCache`]).
//! - `resvg`-safe Mermaid diagram rendering ([`mermaid`]).
//! - Pure in-memory Typst compilation ([`typst_world`]) and LaTeX math typesetting ([`math`]).
//! - Pure safe Rust PDF page rendering ([`pdf`]).

pub mod cache;
pub mod engine;
pub mod error;
pub mod font_pool;
pub mod svg_raster;

#[cfg(feature = "mermaid")]
pub mod mermaid;

#[cfg(feature = "math")]
pub mod math;

#[cfg(feature = "typst")]
pub mod typst_world;

#[cfg(feature = "pdf")]
pub mod pdf;

#[cfg(feature = "wasm-worker")]
pub mod wasm;

#[cfg(test)]
pub(crate) mod test_support;

pub use cache::{CacheLimits, EvictionReport, PinnedPixelCache};
pub use engine::PreviewEngine;
pub use error::PreviewError;
pub use font_pool::FontPool;
pub use svg_raster::{DEFAULT_MAX_EDGE_PX, RasterOptions, RgbaImageBuffer, SvgRasterizer};

/// Deterministic calendar date injected into diagram and document renderers.
///
/// Using an explicit date avoids reading the host wall clock.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PreviewDate {
    /// Four-digit calendar year (for example `2026`).
    pub year: i32,
    /// One-based month (`1..=12`).
    pub month: u8,
    /// One-based day of month (`1..=31`).
    pub day: u8,
}

impl PreviewDate {
    /// Creates a deterministic calendar date.
    pub const fn new(year: i32, month: u8, day: u8) -> Self {
        Self { year, month, day }
    }

    /// Fixed fallback date used when callers do not supply a date (`2026-01-01`).
    pub const DEFAULT: Self = Self {
        year: 2026,
        month: 1,
        day: 1,
    };
}

impl Default for PreviewDate {
    fn default() -> Self {
        Self::DEFAULT
    }
}
