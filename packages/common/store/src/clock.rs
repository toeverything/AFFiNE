use std::sync::atomic::{AtomicI64, Ordering};

/// Deterministic millisecond clock for storage timestamps and sync timers.
pub trait Clock: Send + Sync {
    /// Return the current timestamp in Unix epoch milliseconds.
    fn now_ms(&self) -> i64;
}

/// Deterministic test and simulation clock controlled by explicit advances.
#[derive(Debug)]
pub struct ManualClock {
    now_ms: AtomicI64,
}

impl ManualClock {
    /// Create a clock initialized at `start_ms`.
    pub fn new(start_ms: i64) -> Self {
        Self {
            now_ms: AtomicI64::new(start_ms),
        }
    }

    /// Set the clock to `value_ms`.
    pub fn set(&self, value_ms: i64) {
        self.now_ms.store(value_ms, Ordering::Release);
    }

    /// Advance the clock by `delta_ms` and return the new time.
    pub fn advance(&self, delta_ms: i64) -> i64 {
        self.now_ms.fetch_add(delta_ms, Ordering::AcqRel) + delta_ms
    }
}

impl Clock for ManualClock {
    fn now_ms(&self) -> i64 {
        self.now_ms.load(Ordering::Acquire)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_clock_tracks_explicit_advances() {
        let clock = ManualClock::new(1_000);
        assert_eq!(clock.now_ms(), 1_000);
        assert_eq!(clock.advance(250), 1_250);
        assert_eq!(clock.now_ms(), 1_250);
        clock.set(9_000);
        assert_eq!(clock.now_ms(), 9_000);
    }
}
