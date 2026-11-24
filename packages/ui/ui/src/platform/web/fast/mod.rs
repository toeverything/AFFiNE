//! Everything gpui-fast adds to the web platform lives under this module.
//!
//! The rest of this crate is kept as close to upstream GPUI (Zed's
//! `crates/gpui_web`) as possible, so that pulling in upstream changes stays
//! a matter of merging rather than of rewriting. Upstream files only *call
//! into* this module: a field this module reads, a line forwarding a call to
//! it. The logic itself is written here, one file per topic.

pub(crate) mod canvas_size;
pub(crate) mod ime_edit;
#[cfg(target_family = "wasm")]
pub(crate) mod ime_keys;
#[cfg(target_family = "wasm")]
pub(crate) mod ime_position;
pub(crate) mod wgpu_context;
