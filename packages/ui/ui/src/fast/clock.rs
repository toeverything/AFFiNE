//! The platform clock's wall-clock time, a `SystemTime` instead of chrono's
//! `DateTime<Utc>`; see the scheduler's `fast::clock`. Upstream makes the same
//! change in zed-industries/zed#67089.

/// `PlatformClock::utc_now`.
pub(crate) fn utc_now() -> crate::scheduler::SystemTime {
    crate::platform::clock::system_now()
}
