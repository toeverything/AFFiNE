//! Multi-MIME `UIPasteboard.general` bridge for `IosEditorPlatform`.

use std::{cell::RefCell, ffi::c_void};

use ui::ClipboardItem;

/// Combined in-process fallback and `UIPasteboard.general` provider store for `IosEditorPlatform`.
#[derive(Default)]
pub(crate) struct IosClipboardStore {
    item: RefCell<Option<ClipboardItem>>,
    provider: RefCell<Option<AffineClipboardProvider>>,
}

impl IosClipboardStore {
    pub(crate) fn set_provider(&self, provider: Option<AffineClipboardProvider>) {
        *self.provider.borrow_mut() = provider;
    }

    pub(crate) fn write(&self, item: ClipboardItem) {
        write_via_provider(*self.provider.borrow(), &item);
        *self.item.borrow_mut() = Some(item);
    }

    pub(crate) fn read(&self) -> Option<ClipboardItem> {
        let provider = *self.provider.borrow();
        if provider.is_some() {
            read_via_provider(provider)
        } else {
            self.item.borrow().clone()
        }
    }
}

/// Callback invoked by Rust to write a multi-MIME clipboard JSON payload to `UIPasteboard.general`.
pub type IosClipboardWriteFn = extern "C" fn(*const u8, usize, *mut c_void);

/// Sink passed into `IosClipboardReadFn` so Swift can synchronously hand back UTF-8 JSON bytes
/// without requiring cross-FFI heap allocation.
pub type IosClipboardReadSinkFn = extern "C" fn(*const u8, usize, *mut c_void);

/// Callback invoked by Rust to read a multi-MIME clipboard JSON payload from `UIPasteboard.general`.
pub type IosClipboardReadFn = extern "C" fn(IosClipboardReadSinkFn, *mut c_void, *mut c_void);

/// C-ABI clipboard provider table registered by Swift `MetalHostViewController`.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct AffineClipboardProvider {
    pub write_json: Option<IosClipboardWriteFn>,
    pub read_json: Option<IosClipboardReadFn>,
    pub user_data: *mut c_void,
}

pub(crate) fn clipboard_item_to_json(item: &ClipboardItem) -> String {
    let mut map = serde_json::Map::new();
    if let Some(text) = item.text() {
        map.insert("text/plain".to_string(), serde_json::Value::String(text));
    }
    if let Some(meta_str) = item.metadata()
        && let Ok(serde_json::Value::Object(meta)) =
            serde_json::from_str::<serde_json::Value>(meta_str)
    {
        for (k, v) in meta {
            if k == "application/x-blocksuite-snapshot" {
                let serialized = match v {
                    serde_json::Value::String(s) => s,
                    other => other.to_string(),
                };
                map.insert(k, serde_json::Value::String(serialized));
            } else if let serde_json::Value::String(s) = v {
                map.insert(k, serde_json::Value::String(s));
            }
        }
    }
    serde_json::Value::Object(map).to_string()
}

pub(crate) fn clipboard_item_from_json(raw: &str) -> Option<ClipboardItem> {
    let serde_json::Value::Object(map) = serde_json::from_str::<serde_json::Value>(raw).ok()?
    else {
        return None;
    };
    let plain = map
        .get("text/plain")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
        .to_string();
    let mut meta = serde_json::Map::new();
    for key in [
        "application/x-blocksuite-snapshot",
        "text/html",
        "text/markdown",
    ] {
        if let Some(val) = map.get(key)
            && !val.is_null()
        {
            if let Some(s) = val.as_str() {
                if !s.is_empty() {
                    meta.insert(key.to_string(), serde_json::Value::String(s.to_string()));
                }
            } else {
                meta.insert(key.to_string(), val.clone());
            }
        }
    }
    if !meta.is_empty() {
        Some(ClipboardItem::new_string_with_json_metadata(
            plain,
            serde_json::Value::Object(meta),
        ))
    } else if !plain.is_empty() {
        Some(ClipboardItem::new_string(plain))
    } else {
        None
    }
}

pub(crate) fn write_via_provider(provider: Option<AffineClipboardProvider>, item: &ClipboardItem) {
    if let Some(p) = provider
        && let Some(write_fn) = p.write_json
    {
        let json = clipboard_item_to_json(item);
        write_fn(json.as_ptr(), json.len(), p.user_data);
    }
}

pub(crate) fn read_via_provider(
    provider: Option<AffineClipboardProvider>,
) -> Option<ClipboardItem> {
    let p = provider?;
    let read_fn = p.read_json?;
    #[allow(unsafe_code)]
    extern "C" fn capture_sink(ptr: *const u8, len: usize, ctx: *mut c_void) {
        if ptr.is_null() || len == 0 || ctx.is_null() {
            return;
        }
        // SAFETY: `ctx` points to our local `String`, and `ptr..ptr+len` is valid for this call.
        let out = unsafe { &mut *(ctx as *mut String) };
        let bytes = unsafe { core::slice::from_raw_parts(ptr, len) };
        if let Ok(s) = core::str::from_utf8(bytes) {
            out.clear();
            out.push_str(s);
        }
    }
    let mut captured = String::new();
    read_fn(
        capture_sink,
        (&mut captured as *mut String).cast::<c_void>(),
        p.user_data,
    );
    (!captured.is_empty())
        .then(|| clipboard_item_from_json(&captured))
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleared_system_provider_does_not_resurrect_stale_in_process_item() {
        extern "C" fn empty_read(
            _sink: IosClipboardReadSinkFn,
            _ctx: *mut c_void,
            _ud: *mut c_void,
        ) {
        }

        let store = IosClipboardStore::default();
        store.write(ClipboardItem::new_string("PREVIOUS".to_string()));
        assert_eq!(store.read().and_then(|c| c.text()), Some("PREVIOUS".into()));

        store.set_provider(Some(AffineClipboardProvider {
            write_json: None,
            read_json: Some(empty_read),
            user_data: core::ptr::null_mut(),
        }));
        assert!(
            store.read().is_none(),
            "registered system provider returning empty must never resurrect stale PREVIOUS text"
        );
    }
}
