//! WebAssembly `#[wasm_bindgen]` CRDT exports served directly from the main `playground`
//! bundle, eliminating any redundant standalone `crdt-codec.wasm`.

use blocksuite_playground_doc::crdt_v1;
use wasm_bindgen::{JsCast, prelude::*};

fn collect_byte_frames(frames: &js_sys::Array) -> Result<Vec<Vec<u8>>, JsValue> {
    let len = frames.length();
    let mut out = Vec::with_capacity(len as usize);
    for idx in 0..len {
        let item = frames.get(idx);
        let view = item.dyn_into::<js_sys::Uint8Array>().map_err(|_| {
            JsValue::from_str(&format!("CRDT frame at index {idx} must be a Uint8Array"))
        })?;
        out.push(view.to_vec());
    }
    Ok(out)
}

/// Merge an array of Yjs v1 binary `Uint8Array` updates into a single `Uint8Array`.
#[wasm_bindgen]
pub fn merge_updates_v1(frames: js_sys::Array) -> Result<js_sys::Uint8Array, JsValue> {
    let owned = collect_byte_frames(&frames)?;
    let slices: Vec<&[u8]> = owned.iter().map(Vec::as_slice).collect();
    let merged = crdt_v1::merge_crdt_updates_v1(&slices)
        .map_err(|err| JsValue::from_str(&err.to_string()))?;
    Ok(js_sys::Uint8Array::from(merged.as_slice()))
}

/// Extract sorted, deduplicated live `meta.pages -> spaces` subdoc GUIDs from an array of
/// Yjs v1 root document `Uint8Array` updates.
#[wasm_bindgen]
pub fn extract_subdoc_ids(frames: js_sys::Array) -> Result<js_sys::Array, JsValue> {
    let owned = collect_byte_frames(&frames)?;
    let slices: Vec<&[u8]> = owned.iter().map(Vec::as_slice).collect();
    let guids = crdt_v1::extract_subdoc_guids_from_root_updates(&slices)
        .map_err(|err| JsValue::from_str(&err.to_string()))?;
    let out = js_sys::Array::new_with_length(guids.len() as u32);
    for (idx, guid) in guids.into_iter().enumerate() {
        out.set(idx as u32, JsValue::from_str(&guid));
    }
    Ok(out)
}
