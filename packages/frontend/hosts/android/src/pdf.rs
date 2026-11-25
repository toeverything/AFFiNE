//! Native Android `PdfRenderer` page validation, memory ceiling enforcement,
//! deterministic cache key generation, and `ARGB_8888 -> RGBA8` pixel conversion.

/// Maximum single-axis dimension (pixels) allowed for an in-place PDF page render.
pub const MAX_PDF_RENDER_DIM_PX: u32 = 4096;

/// Maximum total pixel count per rendered PDF page (4096 * 4096 = 64 MiB RGBA8).
pub const MAX_PDF_RENDER_PIXELS: u64 = 16_777_216;

/// Validation or conversion error for an Android `PdfRenderer` page request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PdfRenderError {
    OutOfBoundsPage { page_index: u32, page_count: u32 },
    InvalidDimensions { width_px: u32, height_px: u32 },
    ExceedsMemoryCap { width_px: u32, height_px: u32 },
    PixelBufferMismatch { expected: usize, actual: usize },
}

/// Validates page bounds and OOM dimension limits before invoking `PdfRenderer`.
pub const fn validate_pdf_page_request(
    page_index: u32,
    page_count: u32,
    width_px: u32,
    height_px: u32,
) -> Result<(), PdfRenderError> {
    if page_count == 0 || page_index >= page_count {
        return Err(PdfRenderError::OutOfBoundsPage {
            page_index,
            page_count,
        });
    }
    if width_px == 0 || height_px == 0 {
        return Err(PdfRenderError::InvalidDimensions {
            width_px,
            height_px,
        });
    }
    if width_px > MAX_PDF_RENDER_DIM_PX || height_px > MAX_PDF_RENDER_DIM_PX {
        return Err(PdfRenderError::ExceedsMemoryCap {
            width_px,
            height_px,
        });
    }
    let pixels = (width_px as u64) * (height_px as u64);
    if pixels > MAX_PDF_RENDER_PIXELS {
        return Err(PdfRenderError::ExceedsMemoryCap {
            width_px,
            height_px,
        });
    }
    Ok(())
}

/// Computes a deterministic cache key for a rendered PDF page tile.
pub fn pdf_page_cache_key(
    doc_id: &str,
    page_index: u32,
    width_px: u32,
    height_px: u32,
    dpi_bucket: u32,
) -> String {
    let safe_dpi = dpi_bucket.max(72);
    format!("pdf:{doc_id}:p{page_index}:{width_px}x{height_px}@{safe_dpi}dpi")
}

/// Validates rendered PDF bitmap dimensions against the OOM cap and returns
/// the exact expected pixel count.
pub const fn validate_pdf_dimensions(
    width_px: u32,
    height_px: u32,
) -> Result<usize, PdfRenderError> {
    if width_px == 0 || height_px == 0 {
        return Err(PdfRenderError::InvalidDimensions {
            width_px,
            height_px,
        });
    }
    if width_px > MAX_PDF_RENDER_DIM_PX || height_px > MAX_PDF_RENDER_DIM_PX {
        return Err(PdfRenderError::ExceedsMemoryCap {
            width_px,
            height_px,
        });
    }
    let expected_u64 = (width_px as u64) * (height_px as u64);
    if expected_u64 > MAX_PDF_RENDER_PIXELS {
        return Err(PdfRenderError::ExceedsMemoryCap {
            width_px,
            height_px,
        });
    }
    Ok(expected_u64 as usize)
}

/// Converts Android `Bitmap.Config.ARGB_8888` pixels (`0xAARRGGBB`) into tightly
/// packed `RGBA8` bytes (`[R, G, B, A]`), enforcing the OOM pixel cap.
pub fn argb8888_to_rgba8(
    argb_pixels: &[u32],
    width_px: u32,
    height_px: u32,
) -> Result<Vec<u8>, PdfRenderError> {
    let expected = validate_pdf_dimensions(width_px, height_px)?;
    if argb_pixels.len() != expected {
        return Err(PdfRenderError::PixelBufferMismatch {
            expected,
            actual: argb_pixels.len(),
        });
    }

    let mut rgba = Vec::with_capacity(expected * 4);
    for &argb in argb_pixels {
        let a = ((argb >> 24) & 0xFF) as u8;
        let r = ((argb >> 16) & 0xFF) as u8;
        let g = ((argb >> 8) & 0xFF) as u8;
        let b = (argb & 0xFF) as u8;
        rgba.extend_from_slice(&[r, g, b, a]);
    }
    Ok(rgba)
}

/// Converts one chunk of signed JNI `jint` `ARGB_8888` pixels directly into a
/// pre-allocated stack/slice `RGBA8` buffer (`out_rgba.len() == argb_chunk.len() * 4`)
/// with zero heap allocation.
pub fn convert_argb8888_i32_chunk_to_rgba8_slice(argb_chunk: &[i32], out_rgba: &mut [u8]) {
    debug_assert_eq!(out_rgba.len(), argb_chunk.len() * 4);
    for (&px, dst) in argb_chunk.iter().zip(out_rgba.chunks_exact_mut(4)) {
        let argb = px as u32;
        dst[0] = ((argb >> 16) & 0xFF) as u8;
        dst[1] = ((argb >> 8) & 0xFF) as u8;
        dst[2] = (argb & 0xFF) as u8;
        dst[3] = ((argb >> 24) & 0xFF) as u8;
    }
}

/// Appends one chunk of signed JNI `jint` `ARGB_8888` pixels directly into an
/// `RGBA8` byte buffer without intermediate allocations.
pub fn append_argb8888_i32_chunk_to_rgba8(argb_chunk: &[i32], out_rgba: &mut Vec<u8>) {
    let start = out_rgba.len();
    out_rgba.resize(start + argb_chunk.len() * 4, 0);
    convert_argb8888_i32_chunk_to_rgba8_slice(argb_chunk, &mut out_rgba[start..]);
}

/// Converts signed JNI `jint` `ARGB_8888` pixels directly into tightly packed
/// `RGBA8` bytes with zero intermediate `Vec<u32>` copy.
pub fn argb8888_i32_to_rgba8(
    argb_pixels: &[i32],
    width_px: u32,
    height_px: u32,
) -> Result<Vec<u8>, PdfRenderError> {
    let expected = validate_pdf_dimensions(width_px, height_px)?;
    if argb_pixels.len() != expected {
        return Err(PdfRenderError::PixelBufferMismatch {
            expected,
            actual: argb_pixels.len(),
        });
    }
    let mut rgba = Vec::with_capacity(expected * 4);
    append_argb8888_i32_chunk_to_rgba8(argb_pixels, &mut rgba);
    Ok(rgba)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_request_validation_enforces_bounds_and_oom_cap() {
        let cases = [
            ((0, 3, 1080, 1920), Ok(())),
            ((2, 3, 4096, 4096), Ok(())),
            (
                (0, 0, 100, 100),
                Err(PdfRenderError::OutOfBoundsPage {
                    page_index: 0,
                    page_count: 0,
                }),
            ),
            (
                (3, 3, 100, 100),
                Err(PdfRenderError::OutOfBoundsPage {
                    page_index: 3,
                    page_count: 3,
                }),
            ),
            (
                (0, 2, 0, 100),
                Err(PdfRenderError::InvalidDimensions {
                    width_px: 0,
                    height_px: 100,
                }),
            ),
            (
                (0, 2, 4097, 100),
                Err(PdfRenderError::ExceedsMemoryCap {
                    width_px: 4097,
                    height_px: 100,
                }),
            ),
        ];

        for ((page_index, page_count, width_px, height_px), expected) in cases {
            assert_eq!(
                validate_pdf_page_request(page_index, page_count, width_px, height_px),
                expected
            );
        }
    }

    #[test]
    fn pdf_cache_key_and_argb8888_to_rgba8_conversion_are_deterministic() {
        assert_eq!(
            pdf_page_cache_key("doc-42", 2, 1080, 1440, 320),
            "pdf:doc-42:p2:1080x1440@320dpi"
        );
        assert_eq!(
            pdf_page_cache_key("doc-42", 0, 100, 100, 0),
            "pdf:doc-42:p0:100x100@72dpi"
        );

        let argb = [
            0xFF_11_22_33_u32, // opaque
            0x80_AA_BB_CC_u32, // semi-transparent
            0xFF_FF_FF_FF_u32, // white background
            0x00_01_02_03_u32, // zero alpha
        ];
        let rgba = argb8888_to_rgba8(&argb, 2, 2).expect("valid 2x2 conversion");
        assert_eq!(
            rgba,
            vec![
                0x11, 0x22, 0x33, 0xFF, // pixel 0
                0xAA, 0xBB, 0xCC, 0x80, // pixel 1
                0xFF, 0xFF, 0xFF, 0xFF, // pixel 2
                0x01, 0x02, 0x03, 0x00, // pixel 3
            ]
        );
        assert_eq!(
            argb8888_to_rgba8(&argb[..3], 2, 2),
            Err(PdfRenderError::PixelBufferMismatch {
                expected: 4,
                actual: 3,
            })
        );
    }
}
