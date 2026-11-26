//! Pure-safe-Rust scalar `u32` Wasm ABI for Web thin-host CRDT operations.
//!
//! Exports four `#[wasm_bindgen]` scalar functions (`affine_crdt_reset_input`,
//! `affine_crdt_push_input_u32`, `affine_crdt_invoke`, `affine_crdt_output_u32`)
//! so browsers instantiate `crdt-codec.wasm` directly with `WebAssembly.instantiate`
//! without `wasm-bindgen-cli` or third-party JS glue.

use wasm_bindgen::prelude::*;

use crate::id_converter::{IdConverter, merge_crdt_updates_v1};

const OPCODE_MERGE_UPDATES_V1: u8 = 1;
const OPCODE_EXTRACT_SUBDOC_IDS: u8 = 2;

std::thread_local! {
    static CODEC_STATE: std::cell::RefCell<RawCodecState> =
        std::cell::RefCell::new(RawCodecState::new());
}

struct RawCodecState {
    input: Vec<u8>,
    output: Vec<u8>,
}

impl RawCodecState {
    fn new() -> Self {
        Self {
            input: Vec::new(),
            output: Vec::new(),
        }
    }

    /// Dispatches `[opcode: u8, frame_count: u32_le, (len_i: u32_le, bytes_i)...]`
    /// and returns a binary response frame:
    /// - `0x01` + payload on success
    /// - `0x00` + UTF-8 error text on failure
    fn dispatch(&self) -> Result<Vec<u8>, String> {
        let (&opcode, payload) = self
            .input
            .split_first()
            .ok_or_else(|| "empty crdt codec request".to_string())?;
        let frames = decode_frames(payload)?;
        match opcode {
            OPCODE_MERGE_UPDATES_V1 => {
                let merged = merge_crdt_updates_v1(&frames).map_err(|err| err.to_string())?;
                let mut frame = Vec::with_capacity(1 + merged.len());
                frame.push(1);
                frame.extend_from_slice(&merged);
                Ok(frame)
            }
            OPCODE_EXTRACT_SUBDOC_IDS => {
                let mut guids = IdConverter::extract_subdoc_guids_from_root_updates("", &frames)
                    .map_err(|err| err.to_string())?;
                guids.sort();
                guids.dedup();
                let json = serde_json::to_vec(&guids)
                    .map_err(|err| format!("failed to serialize subdoc guids: {err}"))?;
                let mut frame = Vec::with_capacity(1 + json.len());
                frame.push(1);
                frame.extend_from_slice(&json);
                Ok(frame)
            }
            other => Err(format!("unknown crdt codec opcode {other}")),
        }
    }
}

fn decode_frames(payload: &[u8]) -> Result<Vec<&[u8]>, String> {
    if payload.len() < 4 {
        return Err("truncated frame_count header".to_string());
    }
    let frame_count = u32::from_le_bytes([payload[0], payload[1], payload[2], payload[3]]) as usize;
    let mut cursor = 4usize;
    let remaining = payload.len().saturating_sub(cursor);
    if frame_count > remaining / 4 {
        return Err(format!(
            "frame_count {frame_count} exceeds payload capacity ({remaining} bytes)"
        ));
    }
    let mut frames = Vec::with_capacity(frame_count);
    for idx in 0..frame_count {
        let len_end = cursor
            .checked_add(4)
            .ok_or_else(|| format!("frame {idx} length header overflow"))?;
        if len_end > payload.len() {
            return Err(format!("truncated length header at frame {idx}"));
        }
        let frame_len = u32::from_le_bytes([
            payload[cursor],
            payload[cursor + 1],
            payload[cursor + 2],
            payload[cursor + 3],
        ]) as usize;
        cursor = len_end;
        let body_end = cursor
            .checked_add(frame_len)
            .ok_or_else(|| format!("frame {idx} body length overflow"))?;
        if body_end > payload.len() {
            return Err(format!(
                "truncated frame {idx} body: expected {frame_len} bytes, {} remaining",
                payload.len() - cursor
            ));
        }
        frames.push(&payload[cursor..body_end]);
        cursor = body_end;
    }
    if cursor != payload.len() {
        return Err(format!(
            "unexpected trailing bytes in request: {} extra bytes",
            payload.len() - cursor
        ));
    }
    Ok(frames)
}

/// Clears the codec's raw request and response buffers ahead of streaming a request.
#[wasm_bindgen]
pub fn affine_crdt_reset_input() {
    CODEC_STATE.with(|cell| {
        let mut st = cell.borrow_mut();
        st.input.clear();
        st.output.clear();
    });
}

/// Appends `valid_bytes` (1..=4) little-endian bytes of `word` to the raw request buffer.
#[wasm_bindgen]
pub fn affine_crdt_push_input_u32(word: u32, valid_bytes: u32) {
    let count = (valid_bytes as usize).min(4);
    let bytes = word.to_le_bytes();
    CODEC_STATE.with(|cell| {
        cell.borrow_mut().input.extend_from_slice(&bytes[..count]);
    });
}

/// Executes the buffered CRDT request and returns the binary response frame length.
#[wasm_bindgen]
pub fn affine_crdt_invoke() -> usize {
    CODEC_STATE.with(|cell| {
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
pub fn affine_crdt_output_u32(word_index: usize) -> u32 {
    CODEC_STATE.with(|cell| {
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

#[cfg(test)]
mod tests {
    use y_octo::{Doc, DocOptions};

    use super::*;

    fn encode_request(opcode: u8, frames: &[&[u8]]) -> Vec<u8> {
        let mut out = Vec::new();
        out.push(opcode);
        out.extend_from_slice(&(frames.len() as u32).to_le_bytes());
        for frame in frames {
            out.extend_from_slice(&(frame.len() as u32).to_le_bytes());
            out.extend_from_slice(frame);
        }
        out
    }

    fn invoke_raw(req: &[u8]) -> Vec<u8> {
        affine_crdt_reset_input();
        for chunk in req.chunks(4) {
            let mut word = [0_u8; 4];
            word[..chunk.len()].copy_from_slice(chunk);
            affine_crdt_push_input_u32(u32::from_le_bytes(word), chunk.len() as u32);
        }
        let out_len = affine_crdt_invoke();
        let mut out = Vec::with_capacity(out_len);
        let word_count = out_len.div_ceil(4);
        for w in 0..word_count {
            let word = affine_crdt_output_u32(w).to_le_bytes();
            let remain = out_len - out.len();
            out.extend_from_slice(&word[..remain.min(4)]);
        }
        out
    }

    #[test]
    fn merge_updates_opcode_handles_empty_single_and_multi_frame() {
        // 0 frames -> [0x01, 0x00, 0x00] (canonical 2-byte empty Yjs v1 update, identical to native).
        let empty_resp = invoke_raw(&encode_request(OPCODE_MERGE_UPDATES_V1, &[]));
        assert_eq!(empty_resp, vec![1, 0, 0]);
        assert_eq!(&empty_resp[1..], merge_crdt_updates_v1(&[]).unwrap());

        // Two concurrent client updates merge losslessly.
        let doc_a = Doc::with_options(DocOptions::from_identity(101, String::new()));
        let mut text_a = doc_a.get_or_create_text("content").unwrap();
        text_a.insert(0, "hello ").unwrap();
        let upd_a = doc_a.encode_update_v1().unwrap();

        let doc_b = Doc::with_options(DocOptions::from_identity(202, String::new()));
        let mut text_b = doc_b.get_or_create_text("content").unwrap();
        text_b.insert(0, "world").unwrap();
        let upd_b = doc_b.encode_update_v1().unwrap();

        // Native merge_crdt_updates_v1 vs Wasm ABI must be byte-identical across all shapes.
        let empty_u8: &[u8] = &[0, 0];
        let parity_cases: [&[&[u8]]; 4] = [
            &[],
            &[&upd_a],
            &[&upd_a, &upd_b],
            &[empty_u8, &upd_a, &[], &upd_b],
        ];
        for frames in parity_cases {
            let native = merge_crdt_updates_v1(frames).unwrap();
            let wasm_resp = invoke_raw(&encode_request(OPCODE_MERGE_UPDATES_V1, frames));
            assert_eq!(wasm_resp[0], 1);
            assert_eq!(
                &wasm_resp[1..],
                native.as_slice(),
                "wasm_codec must be byte-identical to native merge_crdt_updates_v1"
            );
        }

        // Single frame still validates and encodes.
        let single_resp = invoke_raw(&encode_request(OPCODE_MERGE_UPDATES_V1, &[&upd_a]));
        assert_eq!(single_resp[0], 1);
        let mut check_single = Doc::with_options(DocOptions::from_identity(303, String::new()));
        check_single
            .apply_update_from_binary_v1(&single_resp[1..])
            .unwrap();
        assert_eq!(
            check_single
                .get_or_create_text("content")
                .unwrap()
                .to_string(),
            "hello "
        );

        // Multi-frame merge preserves both clients' insertions.
        let merged_resp = invoke_raw(&encode_request(OPCODE_MERGE_UPDATES_V1, &[&upd_a, &upd_b]));
        assert_eq!(merged_resp[0], 1);
        let mut merged_doc = Doc::with_options(DocOptions::from_identity(404, String::new()));
        merged_doc
            .apply_update_from_binary_v1(&merged_resp[1..])
            .unwrap();
        let text = merged_doc
            .get_or_create_text("content")
            .unwrap()
            .to_string();
        assert!(text.contains("hello "));
        assert!(text.contains("world"));
    }

    #[test]
    fn extract_subdoc_ids_opcode_handles_real_yjs_v1_updates_and_overwrites() {
        // Real Yjs v1 binary updates (same fixture as verify-idb-real-browser.mjs):
        // update 1 inserts old-guid, update 2 overwrites same key with live-guid + DeleteSet.
        let real_yjs_v1: [&[u8]; 2] = [
            &[
                1, 6, 105, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7, 0, 105,
                0, 1, 40, 0, 105, 1, 2, 105, 100, 1, 119, 2, 112, 49, 40, 0, 105, 1, 5, 116, 105,
                116, 108, 101, 1, 119, 9, 76, 105, 118, 101, 32, 80, 97, 103, 101, 41, 1, 6, 115,
                112, 97, 99, 101, 115, 2, 112, 49, 8, 111, 108, 100, 45, 103, 117, 105, 100, 118,
                0, 41, 1, 8, 111, 116, 104, 101, 114, 77, 97, 112, 7, 102, 111, 114, 101, 105, 103,
                110, 12, 102, 111, 114, 101, 105, 103, 110, 45, 103, 117, 105, 100, 118, 0, 0,
            ],
            &[
                1, 1, 105, 6, 169, 105, 4, 9, 108, 105, 118, 101, 45, 103, 117, 105, 100, 118, 0,
                1, 105, 1, 4, 1,
            ],
        ];
        let resp = invoke_raw(&encode_request(OPCODE_EXTRACT_SUBDOC_IDS, &real_yjs_v1));
        assert_eq!(
            resp[0],
            1,
            "unexpected error: {:?}",
            String::from_utf8_lossy(&resp[1..])
        );
        let guids: Vec<String> = serde_json::from_slice(&resp[1..]).unwrap();
        assert_eq!(guids, vec!["live-guid".to_string()]);

        // Merging first and then extracting produces the exact same live GUID.
        let merged_resp = invoke_raw(&encode_request(OPCODE_MERGE_UPDATES_V1, &real_yjs_v1));
        assert_eq!(merged_resp[0], 1);
        let after_merge = invoke_raw(&encode_request(
            OPCODE_EXTRACT_SUBDOC_IDS,
            &[&merged_resp[1..]],
        ));
        assert_eq!(after_merge[0], 1);
        let guids_after_merge: Vec<String> = serde_json::from_slice(&after_merge[1..]).unwrap();
        assert_eq!(guids_after_merge, vec!["live-guid".to_string()]);
    }

    #[test]
    fn malformed_frames_and_corrupt_updates_return_error_frame_without_panicking() {
        let invalid_inputs: [(&str, Vec<u8>); 7] = [
            ("empty input", vec![]),
            ("truncated frame_count", vec![OPCODE_MERGE_UPDATES_V1, 0, 0]),
            (
                "impossible frame_count",
                vec![OPCODE_MERGE_UPDATES_V1, 0xff, 0xff, 0xff, 0x7f],
            ),
            (
                "truncated frame length",
                vec![OPCODE_MERGE_UPDATES_V1, 1, 0, 0, 0, 1, 0],
            ),
            (
                "truncated frame body",
                vec![OPCODE_MERGE_UPDATES_V1, 1, 0, 0, 0, 10, 0, 0, 0, 1, 2],
            ),
            (
                "trailing garbage",
                vec![OPCODE_MERGE_UPDATES_V1, 0, 0, 0, 0, 0xaa],
            ),
            ("unknown opcode", vec![99, 0, 0, 0, 0]),
        ];
        for (label, req) in invalid_inputs {
            let resp = invoke_raw(&req);
            assert_eq!(
                resp.first().copied(),
                Some(0),
                "case {label} must return 0x00"
            );
            assert!(
                resp.len() > 1,
                "case {label} must include non-empty error text"
            );
        }

        // Corrupt Yjs binary must return 0x00 error frame for both opcodes.
        let corrupt = [0xff_u8, 0xff, 0xff, 0xff, 0x80];
        for opcode in [OPCODE_MERGE_UPDATES_V1, OPCODE_EXTRACT_SUBDOC_IDS] {
            let resp = invoke_raw(&encode_request(opcode, &[&corrupt]));
            assert_eq!(
                resp.first().copied(),
                Some(0),
                "corrupt binary must fail for opcode {opcode}"
            );
        }
    }
}
