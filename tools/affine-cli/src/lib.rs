//! affine-cli library target.
//!
//! The binary (`src/main.rs`) is a thin clap dispatcher over these modules. The library target
//! exists so `examples/` and integration harnesses can drive the SAME engine code the CLI ships
//! — most importantly `examples/emit_yjs_fixtures.rs`, which feeds the real-yjs decode check in
//! CI (`yjs-compat/check.mjs`). Without a lib target, examples could only link external crates
//! and the cross-library encoding seam (y-octo writer ↔ real yjs reader) would go unverified.

pub mod cli;
pub mod commands;
/// Vendored AFFiNE doc parser (Y.Doc ↔ blocks ↔ markdown). This was
/// `affine_common::doc_parser` until upstream PR #15197 removed the Rust doc_parser from
/// `packages/common/native` in favour of the published `affine_doc_loader` crate, whose source
/// is not developed in this repo. The vendored copy carries the latex/math port and the
/// round-trip fixes this CLI depends on; the latex work is offered upstream for
/// `affine_doc_loader` adoption.
pub mod doc_parser;
pub mod engine;
pub mod error;
pub mod fractional_index;
pub mod layout;
pub mod output;
pub mod paths;
pub mod store;
