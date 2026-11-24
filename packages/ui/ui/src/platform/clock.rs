//! Centralized host monotonic and wall-clock access.
//!
//! All `Instant::now()` and `SystemTime::now()` calls in the workspace live
//! inside `crates/ui/src/platform/`. Thread parking deadlines (`PlatformScheduler`)
//! always read real monotonic time here; deterministic animation and replay time
//! is provided by the scheduler clock (`TestScheduler` in headless/test sessions).

pub use web_time::{Instant, SystemTime};

/// Returns the current host monotonic instant.
#[inline]
pub fn now() -> Instant {
    Instant::now()
}

/// Returns the current host system wall time.
#[inline]
pub fn system_now() -> SystemTime {
    SystemTime::now()
}
