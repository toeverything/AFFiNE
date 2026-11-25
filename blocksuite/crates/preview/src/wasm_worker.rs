use wasm_bindgen::prelude::*;

use crate::cache::CacheLimits;
use crate::engine::PreviewEngine;

#[cfg(feature = "typst")]
use crate::PreviewDate;
#[cfg(feature = "math")]
use crate::math::MathRenderOptions;
#[cfg(feature = "mermaid")]
use crate::mermaid::{MermaidOptions, MermaidTheme};
#[cfg(feature = "pdf")]
use crate::pdf::PdfRenderRequest;

std::thread_local! {
    static WORKER_STATE: std::cell::RefCell<RawWorkerState> =
        std::cell::RefCell::new(RawWorkerState::new());
}

struct RawWorkerState {
    engine: PreviewEngine,
    input: Vec<u8>,
    output: Vec<u8>,
}

impl RawWorkerState {
    fn new() -> Self {
        Self {
            engine: PreviewEngine::new(CacheLimits::MOBILE_DEFAULT),
            input: Vec::new(),
            output: Vec::new(),
        }
    }

    /// Dispatches `[opcode, ...payload]` and returns a binary response frame:
    /// - `0x01` + binary payload on success
    /// - `0x00` + UTF-8 error text on failure
    fn dispatch(&mut self) -> Result<Vec<u8>, String> {
        let (&opcode, payload) = self
            .input
            .split_first()
            .ok_or_else(|| "empty worker request".to_string())?;
        match opcode {
            1 => {
                let faces = self
                    .engine
                    .register_font(payload.to_vec())
                    .map_err(|e| e.to_string())?;
                let mut frame = Vec::with_capacity(5);
                frame.push(1);
                frame.extend_from_slice(&(faces as u32).to_le_bytes());
                Ok(frame)
            }
            2 => {
                #[cfg(feature = "mermaid")]
                {
                    let (&theme_tag, src_bytes) = payload
                        .split_first()
                        .ok_or_else(|| "missing mermaid theme header".to_string())?;
                    let theme = match theme_tag {
                        0 => None,
                        1 => Some(MermaidTheme::Light),
                        2 => Some(MermaidTheme::Dark),
                        other => return Err(format!("invalid mermaid theme tag {other}")),
                    };
                    let source =
                        std::str::from_utf8(src_bytes).map_err(|e| format!("invalid utf8: {e}"))?;
                    let opts = MermaidOptions {
                        theme,
                        ..MermaidOptions::default()
                    };
                    let svg = self
                        .engine
                        .render_mermaid_svg(source, &opts)
                        .map_err(|e| e.to_string())?;
                    let mut frame = Vec::with_capacity(1 + svg.len());
                    frame.push(1);
                    frame.extend_from_slice(svg.as_bytes());
                    Ok(frame)
                }
                #[cfg(not(feature = "mermaid"))]
                {
                    Err("mermaid feature disabled in this worker".to_string())
                }
            }
            3 => {
                #[cfg(feature = "math")]
                {
                    let latex =
                        std::str::from_utf8(payload).map_err(|e| format!("invalid utf8: {e}"))?;
                    let out = self
                        .engine
                        .render_latex_svg(latex, &MathRenderOptions::default())
                        .map_err(|e| e.to_string())?;
                    let mut frame = Vec::with_capacity(1 + out.svg.len());
                    frame.push(1);
                    frame.extend_from_slice(out.svg.as_bytes());
                    Ok(frame)
                }
                #[cfg(not(feature = "math"))]
                {
                    Err("math feature disabled in this worker".to_string())
                }
            }
            4 => {
                #[cfg(feature = "typst")]
                {
                    if payload.len() < 4 {
                        return Err("missing typst page_index header".to_string());
                    }
                    let page_index =
                        u32::from_le_bytes([payload[0], payload[1], payload[2], payload[3]])
                            as usize;
                    let source = std::str::from_utf8(&payload[4..])
                        .map_err(|e| format!("invalid utf8: {e}"))?;
                    let pages = self
                        .engine
                        .compile_typst_pages(source, PreviewDate::DEFAULT)
                        .map_err(|e| e.to_string())?;
                    let page = pages.get(page_index).ok_or_else(|| {
                        format!(
                            "typst page_index {page_index} out of range ({})",
                            pages.len()
                        )
                    })?;
                    let mut frame = Vec::with_capacity(5 + page.svg.len());
                    frame.push(1);
                    frame.extend_from_slice(&(pages.len() as u32).to_le_bytes());
                    frame.extend_from_slice(page.svg.as_bytes());
                    Ok(frame)
                }
                #[cfg(not(feature = "typst"))]
                {
                    Err("typst feature disabled in this worker".to_string())
                }
            }
            5 => {
                #[cfg(feature = "pdf")]
                {
                    if payload.len() < 4 {
                        return Err("missing pdf page_index header".to_string());
                    }
                    let page_index =
                        u32::from_le_bytes([payload[0], payload[1], payload[2], payload[3]])
                            as usize;
                    let handle = self
                        .engine
                        .load_pdf(payload[4..].to_vec())
                        .map_err(|e| e.to_string())?;
                    let render = self
                        .engine
                        .render_pdf_page(handle, PdfRenderRequest::for_page(page_index, 2.0));
                    let _ = self.engine.unload_pdf(handle);
                    let (page_count, buf) = render.map_err(|e| e.to_string())?;
                    // `buf.pixels` holds tightly packed premultiplied RGBA8 pixels (`width * height * 4`).
                    let mut frame = Vec::with_capacity(13 + buf.pixels.len());
                    frame.push(1);
                    frame.extend_from_slice(&(page_count as u32).to_le_bytes());
                    frame.extend_from_slice(&buf.width_px.to_le_bytes());
                    frame.extend_from_slice(&buf.height_px.to_le_bytes());
                    frame.extend_from_slice(&buf.pixels);
                    Ok(frame)
                }
                #[cfg(not(feature = "pdf"))]
                {
                    Err("pdf feature disabled in this worker".to_string())
                }
            }
            other => Err(format!("unknown worker opcode {other}")),
        }
    }
}

/// Clears the worker's raw request buffer ahead of streaming a new request.
#[wasm_bindgen]
pub fn affine_worker_reset_input() {
    WORKER_STATE.with(|cell| {
        let mut st = cell.borrow_mut();
        st.input.clear();
        st.output.clear();
    });
}

/// Appends `valid_bytes` (1..=4) little-endian bytes of `word` to the raw request buffer.
#[wasm_bindgen]
pub fn affine_worker_push_input_u32(word: u32, valid_bytes: u32) {
    let count = (valid_bytes as usize).min(4);
    let bytes = word.to_le_bytes();
    WORKER_STATE.with(|cell| {
        cell.borrow_mut().input.extend_from_slice(&bytes[..count]);
    });
}

/// Executes the buffered worker request and returns the binary response frame length.
#[wasm_bindgen]
pub fn affine_worker_invoke() -> usize {
    WORKER_STATE.with(|cell| {
        let mut st = cell.borrow_mut();
        let response = match st.dispatch() {
            Ok(ok) => ok,
            Err(err) => {
                let mut frame = Vec::with_capacity(1 + err.len());
                frame.push(0);
                frame.extend_from_slice(err.as_bytes());
                frame
            }
        };
        st.output = response;
        st.output.len()
    })
}

/// Reads 4 little-endian bytes from the response frame at `word_index * 4`.
#[wasm_bindgen]
pub fn affine_worker_output_u32(word_index: usize) -> u32 {
    WORKER_STATE.with(|cell| {
        let st = cell.borrow();
        let base = word_index.saturating_mul(4);
        let mut chunk = [0_u8; 4];
        for (offset, slot) in chunk.iter_mut().enumerate() {
            if let Some(&b) = st.output.get(base + offset) {
                *slot = b;
            }
        }
        u32::from_le_bytes(chunk)
    })
}
