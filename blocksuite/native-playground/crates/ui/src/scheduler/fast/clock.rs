//! `Clock`'s wall-clock time is a `SystemTime`, not chrono's `DateTime<Utc>`.
//!
//! RUSTSEC-2026-0543 marks chrono as unmaintained, and the scheduler used it
//! only for this. `SystemTime` comes from `web_time`, as `Instant` does, so
//! it reads the browser's clock on wasm, which is what chrono's `wasmbind`
//! feature did. Upstream makes the same change in zed-industries/zed#67089;
//! the sync that brings it replaces the hooks naming this module, and this
//! file goes.

use std::time::Duration;

use web_time::SystemTime;

/// What `Clock::utc_now` returns.
pub(crate) type UtcTime = SystemTime;

/// Where a `TestClock`'s wall clock starts: 2025-07-01T23:59:58Z, as upstream.
pub(crate) fn test_clock_start() -> UtcTime {
    const START_TIME_UNIX_SECS: u64 = 1_751_414_398;
    SystemTime::UNIX_EPOCH + Duration::from_secs(START_TIME_UNIX_SECS)
}
