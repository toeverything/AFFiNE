//! Everything gpui-fast adds to the scheduler lives under this module.
//!
//! The rest of this crate is kept as close to upstream (Zed's
//! `crates/scheduler`) as possible, so that pulling in upstream changes stays
//! a matter of merging rather than of rewriting. Upstream files only *call
//! into* this module. The logic itself is written here, one file per topic.
//! See `docs/upstream-sync.md` for the rules and how they are checked.

pub(crate) mod clock;
