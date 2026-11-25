//! Native iOS Haptics pattern definitions and deterministic dispatch accounting.

/// Number of valid `AffineHapticPattern` variants.
pub const HAPTIC_PATTERN_COUNT: usize = 7;

/// C-ABI haptic pattern enum matching `include/affine_mobile_host.h`.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AffineHapticPattern {
    LightImpact = 0,
    MediumImpact = 1,
    HeavyImpact = 2,
    SelectionChanged = 3,
    Success = 4,
    Warning = 5,
    Error = 6,
}

impl AffineHapticPattern {
    pub fn from_u8(raw: u8) -> Option<Self> {
        match raw {
            0 => Some(Self::LightImpact),
            1 => Some(Self::MediumImpact),
            2 => Some(Self::HeavyImpact),
            3 => Some(Self::SelectionChanged),
            4 => Some(Self::Success),
            5 => Some(Self::Warning),
            6 => Some(Self::Error),
            _ => None,
        }
    }
}

/// Deterministic counter state for triggered haptic events.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HapticsState {
    counts: [u64; HAPTIC_PATTERN_COUNT],
    total: u64,
    last_pattern: Option<AffineHapticPattern>,
}

impl HapticsState {
    pub fn record(&mut self, pattern: AffineHapticPattern) {
        let idx = pattern as usize;
        self.counts[idx] = self.counts[idx].saturating_add(1);
        self.total = self.total.saturating_add(1);
        self.last_pattern = Some(pattern);
    }

    pub fn count_for(&self, pattern: AffineHapticPattern) -> u64 {
        self.counts[pattern as usize]
    }

    pub fn total_count(&self) -> u64 {
        self.total
    }

    pub fn last_pattern(&self) -> Option<AffineHapticPattern> {
        self.last_pattern
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn haptics_pattern_mapping_and_counters_cover_all_seven_variants() {
        let all = [
            (0, AffineHapticPattern::LightImpact),
            (1, AffineHapticPattern::MediumImpact),
            (2, AffineHapticPattern::HeavyImpact),
            (3, AffineHapticPattern::SelectionChanged),
            (4, AffineHapticPattern::Success),
            (5, AffineHapticPattern::Warning),
            (6, AffineHapticPattern::Error),
        ];

        let mut state = HapticsState::default();
        for (raw, expected) in all {
            assert_eq!(AffineHapticPattern::from_u8(raw), Some(expected));
            state.record(expected);
            assert_eq!(state.count_for(expected), 1);
            assert_eq!(state.last_pattern(), Some(expected));
        }
        assert_eq!(state.total_count(), 7);
        assert_eq!(AffineHapticPattern::from_u8(7), None);
        assert_eq!(AffineHapticPattern::from_u8(255), None);
    }
}
