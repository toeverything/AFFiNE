use wasm_bindgen::prelude::*;

use crate::cache::CacheLimits;
use crate::engine::PreviewEngine;

#[cfg(any(feature = "mermaid", feature = "typst"))]
use crate::PreviewDate;
#[cfg(feature = "math")]
use crate::math::{MathDisplayMode, MathRenderOptions};
#[cfg(feature = "mermaid")]
use crate::mermaid::{MermaidOptions, MermaidTheme};
#[cfg(feature = "pdf")]
use crate::pdf::PdfRenderRequest;

/// Structured SVG output with intrinsic logical pixel dimensions.
#[cfg(feature = "mermaid")]
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct WasmSvgOutput {
    /// Standalone SVG string.
    pub svg: String,
    /// Intrinsic logical width in pixels (parsed from SVG root attributes).
    pub width_px: f32,
    /// Intrinsic logical height in pixels (parsed from SVG root attributes).
    pub height_px: f32,
}

/// Structured RGBA8 pixel buffer with physical and logical dimensions.
#[cfg(any(feature = "mermaid", feature = "typst"))]
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct WasmRgbaOutput {
    /// Physical pixel width.
    pub width_px: u32,
    /// Physical pixel height.
    pub height_px: u32,
    /// Logical width in CSS pixels or points.
    pub logical_width: f32,
    /// Logical height in CSS pixels or points.
    pub logical_height: f32,
    pixels: Vec<u8>,
}

#[cfg(any(feature = "mermaid", feature = "typst"))]
#[wasm_bindgen]
impl WasmRgbaOutput {
    /// Moves the tightly packed RGBA8 pixel buffer (`width_px * height_px * 4`) to JS.
    ///
    /// Note: Mermaid and Typst copy the buffer once from the engine's cached
    /// `Arc<RgbaImageBuffer>` (or take it without copying when unshared), while
    /// `take_pixels` eliminates a second clone on repeated JS property reads.
    /// Subsequent calls return an empty buffer.
    pub fn take_pixels(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.pixels)
    }
}

/// Math SVG output and baseline metrics returned across the Wasm Worker boundary.
#[cfg(feature = "math")]
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct WasmMathOutput {
    /// Total box width in points.
    pub width_pt: f64,
    /// Distance from the top edge to the baseline in points.
    pub ascent_pt: f64,
    /// Distance from the baseline to the bottom edge in points.
    pub descent_pt: f64,
    /// Standalone pure-`<path>` SVG string.
    pub svg: String,
}

/// Rasterized math RGBA8 output and baseline metrics.
#[cfg(feature = "math")]
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct WasmMathRgbaOutput {
    /// Total box width in points.
    pub width_pt: f64,
    /// Distance from the top edge to the baseline in points.
    pub ascent_pt: f64,
    /// Distance from the baseline to the bottom edge in points.
    pub descent_pt: f64,
    /// Physical pixel width.
    pub width_px: u32,
    /// Physical pixel height.
    pub height_px: u32,
    pixels: Vec<u8>,
}

#[cfg(feature = "math")]
#[wasm_bindgen]
impl WasmMathRgbaOutput {
    /// Moves the tightly packed RGBA8 pixel buffer (`width_px * height_px * 4`) to JS
    /// without cloning. Subsequent calls return an empty buffer.
    pub fn take_pixels(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.pixels)
    }
}

/// Multi-page Typst SVG output and first-page metrics returned across the Wasm Worker boundary.
#[cfg(feature = "typst")]
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct WasmTypstOutput {
    /// First-page width in Typst points.
    pub width_pt: f64,
    /// First-page height in Typst points.
    pub height_pt: f64,
    /// First-page ascent in points.
    pub ascent_pt: f64,
    /// First-page descent in points.
    pub descent_pt: f64,
    /// Total compiled page count.
    pub page_count: usize,
    /// First-page SVG string (convenience alias for `pages_svg[0]`).
    pub svg: String,
    /// SVG string for every compiled page in order.
    pub pages_svg: Vec<String>,
}

/// PDF page RGBA buffer and dimensions returned across the Wasm Worker boundary.
#[cfg(feature = "pdf")]
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct WasmPdfPageOutput {
    /// Physical pixel width.
    pub width_px: u32,
    /// Physical pixel height.
    pub height_px: u32,
    /// Logical page width in PDF points.
    pub logical_width: f32,
    /// Logical page height in PDF points.
    pub logical_height: f32,
    /// Total number of pages in the PDF document.
    pub page_count: usize,
    pixels: Vec<u8>,
}

#[cfg(feature = "pdf")]
#[wasm_bindgen]
impl WasmPdfPageOutput {
    /// Moves the tightly packed RGBA8 pixel buffer (`width_px * height_px * 4`) to JS
    /// without cloning. Subsequent calls return an empty buffer.
    pub fn take_pixels(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.pixels)
    }
}

/// Persistent WebAssembly Worker preview engine.
///
/// Retains registered fonts, pixel cache, in-memory Typst files/packages, and
/// parsed PDF handles across Worker RPC calls.
#[wasm_bindgen]
pub struct WasmPreviewEngine {
    inner: PreviewEngine,
}

#[wasm_bindgen]
impl WasmPreviewEngine {
    /// Creates a new persistent preview engine with the given cache limits.
    #[wasm_bindgen(constructor)]
    pub fn new(max_cache_entries: usize, max_cache_bytes: usize) -> Self {
        let limits = if max_cache_entries == 0 && max_cache_bytes == 0 {
            CacheLimits::MOBILE_DEFAULT
        } else {
            CacheLimits {
                max_entries: max_cache_entries,
                max_bytes: max_cache_bytes,
            }
        };
        Self {
            inner: PreviewEngine::new(limits),
        }
    }

    /// Registers a TrueType/OpenType font byte buffer into the engine's `FontPool`.
    pub fn register_font(&mut self, bytes: &[u8]) -> Result<usize, JsValue> {
        self.inner
            .register_font(bytes.to_vec())
            .map_err(|err| JsValue::from_str(&err.to_string()))
    }

    /// Returns the number of font faces registered in this engine.
    pub fn font_face_count(&self) -> usize {
        self.inner.font_face_count()
    }

    /// Registers an in-memory Typst virtual file.
    #[cfg(feature = "typst")]
    pub fn register_typst_file(&mut self, path: &str, bytes: &[u8]) -> Result<(), JsValue> {
        self.inner
            .register_typst_file(path, bytes.to_vec())
            .map_err(|err| JsValue::from_str(&err.to_string()))
    }

    /// Registers an in-memory Typst package file (such as `@preview/demo:0.1.0`).
    #[cfg(feature = "typst")]
    pub fn register_typst_package_file(
        &mut self,
        namespace: &str,
        name: &str,
        version: &str,
        path: &str,
        bytes: &[u8],
    ) -> Result<(), JsValue> {
        self.inner
            .register_typst_package_file(namespace, name, version, path, bytes.to_vec())
            .map_err(|err| JsValue::from_str(&err.to_string()))
    }

    /// Renders a Mermaid diagram to `resvg`-safe SVG with intrinsic dimensions.
    #[cfg(feature = "mermaid")]
    pub fn render_mermaid_svg(
        &self,
        source: &str,
        year: i32,
        month: u8,
        day: u8,
        tz_offset_minutes: i16,
        theme: Option<String>,
    ) -> Result<WasmSvgOutput, JsValue> {
        let parsed_theme =
            parse_mermaid_theme(theme.as_deref()).map_err(|err| JsValue::from_str(&err))?;
        let opts = MermaidOptions {
            today: PreviewDate::new(year, month, day),
            timezone_offset_minutes: tz_offset_minutes,
            theme: parsed_theme,
            ..MermaidOptions::default()
        };
        let svg = self
            .inner
            .render_mermaid_svg(source, &opts)
            .map_err(|err| JsValue::from_str(&err.to_string()))?;
        let (width_px, height_px) = parse_svg_dimensions(&svg);
        Ok(WasmSvgOutput {
            svg,
            width_px,
            height_px,
        })
    }

    /// Renders a Mermaid diagram to cached RGBA8 pixels at `scale`.
    #[cfg(feature = "mermaid")]
    pub fn render_mermaid_rgba(
        &mut self,
        source: &str,
        year: i32,
        month: u8,
        day: u8,
        tz_offset_minutes: i16,
        scale: f32,
        theme: Option<String>,
    ) -> Result<WasmRgbaOutput, JsValue> {
        self.render_mermaid_rgba_with_policy(
            source,
            year,
            month,
            day,
            tz_offset_minutes,
            scale,
            theme,
            false,
        )
    }

    /// Renders a Mermaid diagram to cached RGBA8 pixels in lenient mode, allowing
    /// missing glyphs to fall back when no additional script fonts are available.
    #[cfg(feature = "mermaid")]
    pub fn render_mermaid_rgba_lenient(
        &mut self,
        source: &str,
        year: i32,
        month: u8,
        day: u8,
        tz_offset_minutes: i16,
        scale: f32,
        theme: Option<String>,
    ) -> Result<WasmRgbaOutput, JsValue> {
        self.render_mermaid_rgba_with_policy(
            source,
            year,
            month,
            day,
            tz_offset_minutes,
            scale,
            theme,
            true,
        )
    }

    #[cfg(feature = "mermaid")]
    fn render_mermaid_rgba_with_policy(
        &mut self,
        source: &str,
        year: i32,
        month: u8,
        day: u8,
        tz_offset_minutes: i16,
        scale: f32,
        theme: Option<String>,
        lenient: bool,
    ) -> Result<WasmRgbaOutput, JsValue> {
        let parsed_theme =
            parse_mermaid_theme(theme.as_deref()).map_err(|err| JsValue::from_str(&err))?;
        let opts = MermaidOptions {
            today: PreviewDate::new(year, month, day),
            timezone_offset_minutes: tz_offset_minutes,
            theme: parsed_theme,
            ..MermaidOptions::default()
        };
        let buf = if lenient {
            self.inner.render_mermaid_rgba_lenient(source, &opts, scale)
        } else {
            self.inner.render_mermaid_rgba(source, &opts, scale)
        }
        .map_err(|err| JsValue::from_str(&err.to_string()))?;
        let width_px = buf.width_px;
        let height_px = buf.height_px;
        let logical_width = buf.logical_width;
        let logical_height = buf.logical_height;
        let pixels = std::sync::Arc::try_unwrap(buf)
            .map(|owned| owned.pixels)
            .unwrap_or_else(|shared| shared.pixels.clone());
        Ok(WasmRgbaOutput {
            width_px,
            height_px,
            logical_width,
            logical_height,
            pixels,
        })
    }

    /// Renders a LaTeX formula to pure-`<path>` SVG with exact baseline metrics.
    #[cfg(feature = "math")]
    pub fn render_latex_svg(
        &self,
        latex: &str,
        display_mode: bool,
        font_size_pt: f64,
        color_css: Option<String>,
    ) -> Result<WasmMathOutput, JsValue> {
        let opts = MathRenderOptions {
            mode: if display_mode {
                MathDisplayMode::Display
            } else {
                MathDisplayMode::Inline
            },
            font_size_pt,
            padding_pt: 0.0,
            color_css: color_css.unwrap_or_else(|| "#000000".to_string()),
        };
        let out = self
            .inner
            .render_latex_svg(latex, &opts)
            .map_err(|err| JsValue::from_str(&err.to_string()))?;
        Ok(WasmMathOutput {
            width_pt: out.width_pt,
            ascent_pt: out.ascent_pt,
            descent_pt: out.descent_pt,
            svg: out.svg,
        })
    }

    /// Renders a LaTeX formula to RGBA8 pixels with exact baseline metrics.
    #[cfg(feature = "math")]
    pub fn render_latex_rgba(
        &mut self,
        latex: &str,
        display_mode: bool,
        font_size_pt: f64,
        scale: f32,
        color_css: Option<String>,
    ) -> Result<WasmMathRgbaOutput, JsValue> {
        let opts = MathRenderOptions {
            mode: if display_mode {
                MathDisplayMode::Display
            } else {
                MathDisplayMode::Inline
            },
            font_size_pt,
            padding_pt: 0.0,
            color_css: color_css.unwrap_or_else(|| "#000000".to_string()),
        };
        let out = self
            .inner
            .render_latex_rgba(latex, &opts, scale)
            .map_err(|err| JsValue::from_str(&err.to_string()))?;
        Ok(WasmMathRgbaOutput {
            width_pt: out.width_pt,
            ascent_pt: out.ascent_pt,
            descent_pt: out.descent_pt,
            width_px: out.image.width_px,
            height_px: out.image.height_px,
            pixels: out.image.pixels,
        })
    }

    /// Compiles native Typst markup into all page SVGs using persistent fonts and packages.
    #[cfg(feature = "typst")]
    pub fn compile_typst_svg(
        &mut self,
        source: &str,
        year: i32,
        month: u8,
        day: u8,
    ) -> Result<WasmTypstOutput, JsValue> {
        let pages = self
            .inner
            .compile_typst_pages(source, PreviewDate::new(year, month, day))
            .map_err(|err| JsValue::from_str(&err.to_string()))?;
        let first = pages
            .first()
            .ok_or_else(|| JsValue::from_str("compiled typst document has zero pages"))?;
        let pages_svg: Vec<String> = pages.iter().map(|p| p.svg.clone()).collect();
        Ok(WasmTypstOutput {
            width_pt: first.width_pt,
            height_pt: first.height_pt,
            ascent_pt: first.ascent_pt,
            descent_pt: first.descent_pt,
            page_count: pages.len(),
            svg: first.svg.clone(),
            pages_svg,
        })
    }

    /// Compiles native Typst markup and rasterizes `page_index` to RGBA8.
    #[cfg(feature = "typst")]
    pub fn compile_typst_rgba(
        &mut self,
        source: &str,
        year: i32,
        month: u8,
        day: u8,
        page_index: usize,
        scale: f32,
    ) -> Result<WasmRgbaOutput, JsValue> {
        let buf = self
            .inner
            .compile_typst_page_rgba(
                source,
                PreviewDate::new(year, month, day),
                page_index,
                scale,
            )
            .map_err(|err| JsValue::from_str(&err.to_string()))?;
        let width_px = buf.width_px;
        let height_px = buf.height_px;
        let logical_width = buf.logical_width;
        let logical_height = buf.logical_height;
        let pixels = std::sync::Arc::try_unwrap(buf)
            .map(|owned| owned.pixels)
            .unwrap_or_else(|shared| shared.pixels.clone());
        Ok(WasmRgbaOutput {
            width_px,
            height_px,
            logical_width,
            logical_height,
            pixels,
        })
    }

    /// Parses and caches a PDF document, returning a handle for subsequent page renders.
    #[cfg(feature = "pdf")]
    pub fn load_pdf(&mut self, pdf_bytes: &[u8]) -> Result<u32, JsValue> {
        self.inner
            .load_pdf(pdf_bytes.to_vec())
            .map_err(|err| JsValue::from_str(&err.to_string()))
    }

    /// Releases a cached PDF document handle.
    #[cfg(feature = "pdf")]
    pub fn unload_pdf(&mut self, handle: u32) -> bool {
        self.inner.unload_pdf(handle)
    }

    /// Renders a page from a cached PDF document handle into RGBA8 pixels.
    #[cfg(feature = "pdf")]
    pub fn render_pdf_page_rgba(
        &self,
        handle: u32,
        page_index: usize,
        scale: f32,
        max_edge_px: u32,
    ) -> Result<WasmPdfPageOutput, JsValue> {
        let req = PdfRenderRequest {
            page_index,
            scale,
            max_edge_px,
            ..PdfRenderRequest::default()
        };
        let (page_count, buf) = self
            .inner
            .render_pdf_page(handle, req)
            .map_err(|err| JsValue::from_str(&err.to_string()))?;
        Ok(WasmPdfPageOutput {
            width_px: buf.width_px,
            height_px: buf.height_px,
            logical_width: buf.logical_width,
            logical_height: buf.logical_height,
            page_count,
            pixels: buf.pixels,
        })
    }
}

#[cfg(feature = "mermaid")]
fn parse_mermaid_theme(theme: Option<&str>) -> Result<Option<MermaidTheme>, String> {
    let Some(raw) = theme.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    if raw.eq_ignore_ascii_case("light") {
        Ok(Some(MermaidTheme::Light))
    } else if raw.eq_ignore_ascii_case("dark") {
        Ok(Some(MermaidTheme::Dark))
    } else {
        Err(format!(
            "unsupported Mermaid theme '{raw}' (expected 'light' or 'dark')"
        ))
    }
}

#[cfg(feature = "mermaid")]
fn parse_svg_dimensions(svg: &str) -> (f32, f32) {
    if let Some(vb_pos) = svg.find("viewBox=\"") {
        let after = &svg[vb_pos + 9..];
        if let Some(end) = after.find('"') {
            let nums: Vec<f32> = after[..end]
                .split(|c: char| c.is_whitespace() || c == ',')
                .filter_map(|part| part.parse::<f32>().ok())
                .collect();
            if nums.len() == 4 {
                return (nums[2], nums[3]);
            }
        }
    }
    (0.0, 0.0)
}

pub use crate::wasm_worker::{
    affine_worker_invoke, affine_worker_output_u32, affine_worker_push_input_u32,
    affine_worker_reset_input,
};

#[cfg(all(test, feature = "mermaid"))]
mod tests {
    use super::*;
    use crate::test_support::build_test_font_pool;

    #[test]
    fn wasm_mermaid_theme_parser_and_distinct_light_dark_pixels() {
        assert_eq!(parse_mermaid_theme(None), Ok(None));
        assert_eq!(parse_mermaid_theme(Some("  ")), Ok(None));
        assert_eq!(
            parse_mermaid_theme(Some("light")),
            Ok(Some(MermaidTheme::Light))
        );
        assert_eq!(
            parse_mermaid_theme(Some("DARK")),
            Ok(Some(MermaidTheme::Dark))
        );
        assert!(parse_mermaid_theme(Some("neon")).is_err());

        let mut engine = PreviewEngine::default();
        for blob in build_test_font_pool().font_blobs() {
            engine.register_font(blob.to_vec()).unwrap();
        }
        let src = "flowchart TD\n  A[Start] --> B[End]";
        let light = engine
            .render_mermaid_rgba(
                src,
                &MermaidOptions {
                    theme: parse_mermaid_theme(Some("light")).unwrap(),
                    ..MermaidOptions::default()
                },
                2.0,
            )
            .unwrap();
        let dark = engine
            .render_mermaid_rgba(
                src,
                &MermaidOptions {
                    theme: parse_mermaid_theme(Some("dark")).unwrap(),
                    ..MermaidOptions::default()
                },
                2.0,
            )
            .unwrap();
        assert_ne!(light.sha256(), dark.sha256());
    }
}
