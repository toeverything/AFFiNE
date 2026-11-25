use std::sync::Arc;

use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_syntax::Pdf;
use hayro::vello_cpu::color::{AlphaColor, Srgb};
use hayro::{PixmapSettings, RenderCache, RenderSettings};

use crate::error::PreviewError;
use crate::svg_raster::{DEFAULT_MAX_EDGE_PX, RgbaImageBuffer};

/// Intrinsic PDF page dimensions in PDF points (1/72 inch).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PdfPageSize {
    /// Page width in points.
    pub width_pt: f32,
    /// Page height in points.
    pub height_pt: f32,
}

/// Parameters controlling a single PDF page rasterization pass.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PdfRenderRequest {
    /// Zero-based page index.
    pub page_index: usize,
    /// Device pixel scale factor relative to PDF points.
    pub scale: f32,
    /// Maximum allowed physical width or height in pixels.
    pub max_edge_px: u32,
    /// Background clear color as `[r, g, b, a]` bytes.
    pub background_rgba: [u8; 4],
}

impl Default for PdfRenderRequest {
    fn default() -> Self {
        Self {
            page_index: 0,
            scale: 2.0,
            max_edge_px: DEFAULT_MAX_EDGE_PX,
            background_rgba: [255, 255, 255, 255],
        }
    }
}

impl PdfRenderRequest {
    /// Creates a render request for `page_index` at the given scale factor.
    pub fn for_page(page_index: usize, scale: f32) -> Self {
        Self {
            page_index,
            scale,
            ..Self::default()
        }
    }
}

/// Cross-platform PDF page rendering contract.
///
/// Native iOS and Android hosts can back this trait with `PDFKit` and
/// `PdfRenderer`, while Web and cross-platform callers use [`HayroPdfRenderer`].
pub trait PdfPageRenderer {
    /// Returns the total number of pages in the PDF document.
    fn page_count(&self) -> usize;

    /// Returns the intrinsic point dimensions of `page_index`.
    fn page_size(&self, page_index: usize) -> Result<PdfPageSize, PreviewError>;

    /// Renders `request.page_index` into a compact RGBA8 pixel buffer.
    fn render_page(&self, request: PdfRenderRequest) -> Result<RgbaImageBuffer, PreviewError>;
}

/// Pure safe Rust PDF page renderer powered by `hayro`.
pub struct HayroPdfRenderer {
    pdf: Pdf,
}

impl HayroPdfRenderer {
    /// Parses a PDF byte buffer into a reusable renderer.
    pub fn from_bytes(bytes: impl Into<Vec<u8>>) -> Result<Self, PreviewError> {
        let data = bytes.into();
        if data.is_empty() {
            return Err(PreviewError::EmptyInput);
        }
        let pdf = Pdf::new(Arc::new(data)).map_err(|err| PreviewError::Pdf(format!("{err:?}")))?;
        Ok(Self { pdf })
    }
}

impl PdfPageRenderer for HayroPdfRenderer {
    fn page_count(&self) -> usize {
        self.pdf.pages().len()
    }

    fn page_size(&self, page_index: usize) -> Result<PdfPageSize, PreviewError> {
        let pages = self.pdf.pages();
        let page = pages.get(page_index).ok_or(PreviewError::PageOutOfRange {
            index: page_index,
            page_count: pages.len(),
        })?;
        let (width_pt, height_pt) = page.render_dimensions();
        Ok(PdfPageSize {
            width_pt,
            height_pt,
        })
    }

    fn render_page(&self, request: PdfRenderRequest) -> Result<RgbaImageBuffer, PreviewError> {
        if !request.scale.is_finite() || request.scale <= 0.0 {
            return Err(PreviewError::InvalidSize(format!(
                "pdf scale must be positive and finite, got {}",
                request.scale
            )));
        }
        if request.max_edge_px == 0 {
            return Err(PreviewError::InvalidSize(
                "max_edge_px must be greater than zero".to_string(),
            ));
        }

        let pages = self.pdf.pages();
        let page = pages
            .get(request.page_index)
            .ok_or(PreviewError::PageOutOfRange {
                index: request.page_index,
                page_count: pages.len(),
            })?;

        let (logical_width, logical_height) = page.render_dimensions();
        if !logical_width.is_finite()
            || !logical_height.is_finite()
            || logical_width <= 0.0
            || logical_height <= 0.0
        {
            return Err(PreviewError::InvalidSize(format!(
                "pdf page dimensions are invalid: {logical_width}x{logical_height}"
            )));
        }

        let max_edge = (request.max_edge_px.min(u16::MAX as u32)) as f32;
        let raw_w = (logical_width * request.scale).max(1.0);
        let raw_h = (logical_height * request.scale).max(1.0);
        let clamp = (max_edge / raw_w).min(max_edge / raw_h).min(1.0);
        let effective_scale = request.scale * clamp;

        let [r, g, b, a] = request.background_rgba;
        let bg_color = AlphaColor::<Srgb>::from_rgba8(r, g, b, a);

        let cache = RenderCache::new();
        let interpreter_settings = InterpreterSettings::default();
        let render_settings = RenderSettings::default();
        let pixmap_settings = PixmapSettings {
            x_scale: effective_scale,
            y_scale: effective_scale,
            bg_color,
        };

        let pixmap = hayro::render(
            page,
            &cache,
            &interpreter_settings,
            &render_settings,
            &pixmap_settings,
        );

        let width_px = u32::from(pixmap.width());
        let height_px = u32::from(pixmap.height());
        let pixels = pixmap.data_as_u8_slice().to_vec();

        Ok(RgbaImageBuffer {
            width_px,
            height_px,
            logical_width,
            logical_height,
            pixels,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds a valid multi-page PDF 1.4 fixture with text, vector paths, and transparency.
    fn build_multipage_pdf_fixture() -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

        let mut offsets = vec![0usize];
        let mut push_obj = |body: &str| {
            offsets.push(out.len());
            let id = offsets.len() - 1;
            out.extend_from_slice(format!("{id} 0 obj\n{body}\nendobj\n").as_bytes());
        };

        // 1: Catalog
        push_obj("<< /Type /Catalog /Pages 2 0 R >>");
        // 2: Pages (3 pages)
        push_obj("<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>");
        // 3: Page 1 (text + filled vector shapes)
        push_obj(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 120] \
             /Resources << /Font << /F1 6 0 R >> >> /Contents 7 0 R >>",
        );
        // 4: Page 2 (transparency + overlapping shapes)
        push_obj(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] \
             /Resources << /Font << /F1 6 0 R >> /ExtGState << /GS1 9 0 R >> >> /Contents 8 0 R >>",
        );
        // 5: Page 3 (Type3 embedded glyph font + Bezier curve)
        push_obj(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 180 100] \
             /Resources << /Font << /F3 10 0 R >> >> /Contents 12 0 R >>",
        );
        // 6: Standard Type1 Helvetica font
        push_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
        // 7: Page 1 content stream
        let p1_stream = "0.1 0.4 0.9 rg 12 12 60 36 re f \
                         0.8 0.1 0.2 RG 2 w 80 12 40 36 re S \
                         0 0 0 rg BT /F1 18 Tf 16 80 Td (Hello PDF) Tj ET";
        push_obj(&format!(
            "<< /Length {} >>\nstream\n{p1_stream}\nendstream",
            p1_stream.len()
        ));
        // 8: Page 2 content stream (alpha transparency)
        let p2_stream = "0.9 0.2 0.2 rg 20 20 90 90 re f \
                         /GS1 gs 0.1 0.3 0.9 rg 60 40 90 90 re f \
                         0 0 0 rg BT /F1 14 Tf 24 132 Td (Alpha Layer) Tj ET";
        push_obj(&format!(
            "<< /Length {} >>\nstream\n{p2_stream}\nendstream",
            p2_stream.len()
        ));
        // 9: ExtGState with 50% fill and stroke opacity
        push_obj("<< /Type /ExtGState /ca 0.5 /CA 0.5 >>");
        // 10: Embedded Type3 font with custom glyph 'A'
        push_obj(
            "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] \
             /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /A 11 0 R >> \
             /Encoding << /Type /Encoding /Differences [65 /A] >> \
             /FirstChar 65 /LastChar 65 /Widths [700] >>",
        );
        // 11: Type3 glyph 'A' outline stream
        let glyph_a = "700 0 0 0 650 700 d1 100 0 m 350 700 l 600 0 l 500 0 l 350 450 l 200 0 l f";
        push_obj(&format!(
            "<< /Length {} >>\nstream\n{glyph_a}\nendstream",
            glyph_a.len()
        ));
        // 12: Page 3 content stream
        let p3_stream = "0.1 0.6 0.3 RG 3 w 10 20 m 60 90 120 10 170 80 c S \
                         0 0 0 rg BT /F3 24 Tf 30 40 Td (AA) Tj ET";
        push_obj(&format!(
            "<< /Length {} >>\nstream\n{p3_stream}\nendstream",
            p3_stream.len()
        ));

        let xref_pos = out.len();
        out.extend_from_slice(format!("xref\n0 {}\n", offsets.len()).as_bytes());
        out.extend_from_slice(b"0000000000 65535 f \n");
        for offset in offsets.iter().skip(1) {
            out.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
        }
        out.extend_from_slice(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n",
                offsets.len()
            )
            .as_bytes(),
        );
        out
    }

    #[test]
    fn renders_multipage_pdf_fixture_deterministically() {
        let bytes = build_multipage_pdf_fixture();
        let renderer = HayroPdfRenderer::from_bytes(bytes).unwrap();
        assert_eq!(renderer.page_count(), 3);

        let cases = [
            (0usize, 200.0_f32, 120.0_f32, 1.5_f32),
            (1usize, 240.0_f32, 160.0_f32, 2.0_f32),
            (2usize, 180.0_f32, 100.0_f32, 2.0_f32),
        ];

        for (page_index, expected_w, expected_h, scale) in cases {
            let size = renderer.page_size(page_index).unwrap();
            assert_eq!(size.width_pt, expected_w);
            assert_eq!(size.height_pt, expected_h);

            let req = PdfRenderRequest::for_page(page_index, scale);
            let first = renderer.render_page(req).unwrap();
            let second = renderer.render_page(req).unwrap();
            assert_eq!(first.width_px, (expected_w * scale) as u32);
            assert_eq!(first.height_px, (expected_h * scale) as u32);
            assert_eq!(
                first.byte_len(),
                (first.width_px * first.height_px * 4) as usize
            );
            assert!(
                first.count_ink_pixels([255, 255, 255, 255], 4) > 50,
                "page {page_index} must contain visible rendered ink"
            );
            assert_eq!(first.sha256(), second.sha256());
        }

        assert!(matches!(
            renderer.page_size(3),
            Err(PreviewError::PageOutOfRange {
                index: 3,
                page_count: 3
            })
        ));
    }

    #[test]
    fn clamps_pdf_render_to_max_edge_and_rejects_empty_input() {
        assert!(matches!(
            HayroPdfRenderer::from_bytes(Vec::new()),
            Err(PreviewError::EmptyInput)
        ));

        let renderer = HayroPdfRenderer::from_bytes(build_multipage_pdf_fixture()).unwrap();
        let buf = renderer
            .render_page(PdfRenderRequest {
                page_index: 1,
                scale: 4.0,
                max_edge_px: 120,
                background_rgba: [255, 255, 255, 255],
            })
            .unwrap();
        assert!(buf.width_px <= 120 && buf.height_px <= 120);
    }
}
