//! Pure-Rust PDFKit bridge validation, render-budget planning, and C-ABI data types.
//!
//! Enforces strict document size, header, page-index, and pixel-budget limits before
//! delegating page rasterization to Apple's system `PDFKit` framework in Swift.

/// Maximum accepted PDF payload size in bytes (128 MiB).
pub const MAX_PDF_DOCUMENT_BYTES: usize = 128 * 1024 * 1024;
/// Maximum single rasterized page edge length in pixels (4096 px).
pub const MAX_PDF_PAGE_DIMENSION_PX: u32 = 4096;
/// Maximum total pixels per rasterized page (4096 * 4096 = 16M pixels = 64 MiB RGBA8).
pub const MAX_PDF_PAGE_PIXELS: u64 = 16_777_216;
/// Number of leading bytes scanned for the `%PDF-` signature per ISO 32000-1.
const PDF_HEADER_SCAN_LIMIT: usize = 1024;

/// C-ABI error codes shared between Rust validation and Swift `PdfRendererBridge`.
#[repr(u32)]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum AffinePdfErrorCode {
    #[default]
    Ok = 0,
    InvalidArgument = 1,
    EmptyDocument = 2,
    DocumentTooLarge = 3,
    InvalidOrEncryptedPdf = 4,
    PageOutOfRange = 5,
    InvalidDimensions = 6,
    PixelLimitExceeded = 7,
    RenderFailed = 8,
}

/// Original page box size in PDF points (`72 pt = 1 inch`).
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AffinePdfPageSize {
    pub width_pt: f32,
    pub height_pt: f32,
}

/// Validated RGBA8 rasterization plan returned to Swift `PdfRendererBridge`.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AffinePdfRenderPlan {
    pub target_width_px: u32,
    pub target_height_px: u32,
    pub byte_len: usize,
    pub error: u32,
}

/// Validate a raw PDF payload before passing it to `PDFKit`.
pub fn validate_pdf_bytes(bytes: &[u8]) -> Result<(), AffinePdfErrorCode> {
    if bytes.is_empty() {
        return Err(AffinePdfErrorCode::EmptyDocument);
    }
    if bytes.len() > MAX_PDF_DOCUMENT_BYTES {
        return Err(AffinePdfErrorCode::DocumentTooLarge);
    }
    let scan_end = bytes.len().min(PDF_HEADER_SCAN_LIMIT);
    let prefix = &bytes[..scan_end];
    if !prefix.windows(5).any(|w| w == b"%PDF-") {
        return Err(AffinePdfErrorCode::InvalidOrEncryptedPdf);
    }
    Ok(())
}

/// Validate page bounds and pixel dimensions and compute the exact RGBA8 buffer length.
pub fn plan_pdf_page_render(
    page_index: u32,
    page_count: u32,
    target_width_px: u32,
    target_height_px: u32,
) -> AffinePdfRenderPlan {
    if page_count == 0 || page_index >= page_count {
        return AffinePdfRenderPlan {
            target_width_px: 0,
            target_height_px: 0,
            byte_len: 0,
            error: AffinePdfErrorCode::PageOutOfRange as u32,
        };
    }
    if target_width_px == 0 || target_height_px == 0 {
        return AffinePdfRenderPlan {
            target_width_px: 0,
            target_height_px: 0,
            byte_len: 0,
            error: AffinePdfErrorCode::InvalidDimensions as u32,
        };
    }
    if target_width_px > MAX_PDF_PAGE_DIMENSION_PX || target_height_px > MAX_PDF_PAGE_DIMENSION_PX {
        return AffinePdfRenderPlan {
            target_width_px: 0,
            target_height_px: 0,
            byte_len: 0,
            error: AffinePdfErrorCode::PixelLimitExceeded as u32,
        };
    }
    let pixels = u64::from(target_width_px) * u64::from(target_height_px);
    if pixels > MAX_PDF_PAGE_PIXELS {
        return AffinePdfRenderPlan {
            target_width_px: 0,
            target_height_px: 0,
            byte_len: 0,
            error: AffinePdfErrorCode::PixelLimitExceeded as u32,
        };
    }
    let Some(byte_len) = (pixels as usize).checked_mul(4) else {
        return AffinePdfRenderPlan {
            target_width_px: 0,
            target_height_px: 0,
            byte_len: 0,
            error: AffinePdfErrorCode::PixelLimitExceeded as u32,
        };
    };
    AffinePdfRenderPlan {
        target_width_px,
        target_height_px,
        byte_len,
        error: AffinePdfErrorCode::Ok as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_header_validation_table() {
        let cases: [(&str, &[u8], Result<(), AffinePdfErrorCode>); 4] = [
            ("empty", b"", Err(AffinePdfErrorCode::EmptyDocument)),
            (
                "not_pdf",
                b"<html>not a pdf</html>",
                Err(AffinePdfErrorCode::InvalidOrEncryptedPdf),
            ),
            ("valid_pdf_1_4", b"%PDF-1.4\n%%EOF\n", Ok(())),
            (
                "valid_pdf_with_leading_junk",
                b"   \n%PDF-1.7\n%%EOF\n",
                Ok(()),
            ),
        ];
        for (name, bytes, expected) in cases {
            assert_eq!(validate_pdf_bytes(bytes), expected, "{name}");
        }
    }

    #[test]
    fn pdf_render_plan_table_enforces_page_bounds_and_oom_limits() {
        struct Case {
            name: &'static str,
            page: u32,
            count: u32,
            w: u32,
            h: u32,
            expect_err: AffinePdfErrorCode,
            expect_bytes: usize,
        }

        let cases = [
            Case {
                name: "valid_page_0",
                page: 0,
                count: 2,
                w: 300,
                h: 400,
                expect_err: AffinePdfErrorCode::Ok,
                expect_bytes: 300 * 400 * 4,
            },
            Case {
                name: "valid_max_4096_square",
                page: 1,
                count: 2,
                w: 4096,
                h: 4096,
                expect_err: AffinePdfErrorCode::Ok,
                expect_bytes: 4096 * 4096 * 4,
            },
            Case {
                name: "out_of_range_page",
                page: 2,
                count: 2,
                w: 200,
                h: 200,
                expect_err: AffinePdfErrorCode::PageOutOfRange,
                expect_bytes: 0,
            },
            Case {
                name: "zero_page_count",
                page: 0,
                count: 0,
                w: 200,
                h: 200,
                expect_err: AffinePdfErrorCode::PageOutOfRange,
                expect_bytes: 0,
            },
            Case {
                name: "zero_dimension",
                page: 0,
                count: 1,
                w: 0,
                h: 200,
                expect_err: AffinePdfErrorCode::InvalidDimensions,
                expect_bytes: 0,
            },
            Case {
                name: "exceeds_edge_cap",
                page: 0,
                count: 1,
                w: 4097,
                h: 100,
                expect_err: AffinePdfErrorCode::PixelLimitExceeded,
                expect_bytes: 0,
            },
        ];

        for c in cases {
            let plan = plan_pdf_page_render(c.page, c.count, c.w, c.h);
            assert_eq!(plan.error, c.expect_err as u32, "{}", c.name);
            assert_eq!(plan.byte_len, c.expect_bytes, "{}", c.name);
        }
    }
}
