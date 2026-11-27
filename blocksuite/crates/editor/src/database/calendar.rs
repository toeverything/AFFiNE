//! Pure Calendar month grid & multi-day range layout (`0.27.5` `calendar/layout.ts` 1:1 port).
//!
//! Zero system wall-clock calls: every UTC millisecond timestamp is mapped to its local
//! civil day `(year, month, day)` through the injected `offset_at_ms: &dyn Fn(i64) -> i32`
//! resolver, ensuring exact parity across DST transitions (e.g. `America/New_York`) and
//! local midnight boundaries.

use crate::block_flow::civil_from_days;

/// One database row projected onto the calendar view.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CalendarEntry {
    pub id: String,
    pub row_id: String,
    pub title: String,
    pub color: Option<String>,
    pub start_at_ms: i64,
    pub end_at_ms: Option<i64>,
    pub badges: Vec<(String, Option<String>)>,
}

/// Visible civil day span of a rendered calendar month grid.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CalendarVisibleRange {
    pub from_day: i64,
    pub to_day: i64,
    pub month_start_day: i64,
    pub month_end_day: i64,
}

/// One multi-day range bar segment clipped to a single week row (`0..7`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CalendarRangeSegment {
    pub entry: CalendarEntry,
    pub week_index: usize,
    pub start_index: usize,
    pub span: usize,
    pub slot: usize,
    pub starts_before_week: bool,
    pub ends_after_week: bool,
}

/// One day cell inside a calendar month grid.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CalendarDayLayout {
    pub day_index: i64,
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub in_month: bool,
    pub entries: Vec<CalendarEntry>,
    pub segment_slots: usize,
}

/// Complete laid-out calendar month (`weeks` of 7 days + `segments` with assigned slots).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CalendarMonthLayout {
    pub year: i32,
    pub month: u32,
    pub range: CalendarVisibleRange,
    pub weeks: Vec<Vec<CalendarDayLayout>>,
    pub segments: Vec<CalendarRangeSegment>,
}

/// Howard Hinnant's `days_from_civil`: inverse of [`civil_from_days`].
pub fn days_from_civil(year: i32, month: u32, day: u32) -> i64 {
    let y = i64::from(year) - i64::from(month <= 2);
    let era = y.div_euclid(400);
    let yoe = (y - era * 400) as u64;
    let m = u64::from(month);
    let d = u64::from(day);
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

/// Convert a UTC millisecond timestamp to local civil day index (days since 1970-01-01)
/// using the injected per-timestamp timezone offset resolver (minutes east of UTC).
pub fn local_day_index(utc_ms: i64, offset_at_ms: &dyn Fn(i64) -> i32) -> i64 {
    let offset_min = offset_at_ms(utc_ms);
    let local_ms = utc_ms.saturating_add(i64::from(offset_min) * 60_000);
    local_ms.div_euclid(86_400_000)
}

/// Day of week for a civil day index (`0 = Sunday .. 6 = Saturday`).
pub fn weekday_from_days(days: i64) -> u32 {
    (days + 4).rem_euclid(7) as u32
}

/// Number of days in `(year, month)` (1-based month `1..=12`).
pub fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_y, next_m) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    (days_from_civil(next_y, next_m, 1) - days_from_civil(year, month, 1)) as u32
}

/// 1:1 port of `getCalendarVisibleMonthRange` from `0.27.5` `calendar/layout.ts:53-85`.
pub fn get_calendar_visible_month_range(
    year: i32,
    month: u32,
    week_starts_on: u32,
) -> CalendarVisibleRange {
    let week_starts_on = week_starts_on % 7;
    let month_start_day = days_from_civil(year, month, 1);
    let month_end_day = days_from_civil(year, month, days_in_month(year, month));
    let start_wd = weekday_from_days(month_start_day);
    let end_wd = weekday_from_days(month_end_day);
    let start_offset = i64::from((start_wd + 7 - week_starts_on) % 7);
    let end_offset = i64::from((week_starts_on + 6 + 7 - end_wd) % 7);
    CalendarVisibleRange {
        from_day: month_start_day - start_offset,
        to_day: month_end_day + end_offset,
        month_start_day,
        month_end_day,
    }
}

/// 1:1 port of `createCalendarMonthLayout` + `assignSegmentSlots` from `0.27.5` `calendar/layout.ts:114-250`.
pub fn create_calendar_month_layout(
    year: i32,
    month: u32,
    entries: &[CalendarEntry],
    week_starts_on: u32,
    offset_at_ms: &dyn Fn(i64) -> i32,
) -> CalendarMonthLayout {
    let range = get_calendar_visible_month_range(year, month, week_starts_on);
    let total_days = (range.to_day - range.from_day + 1).max(0) as usize;
    let mut days = Vec::with_capacity(total_days);
    for idx in 0..total_days {
        let day_index = range.from_day + idx as i64;
        let (dy, dm, dd) = civil_from_days(day_index);
        days.push(CalendarDayLayout {
            day_index,
            year: dy as i32,
            month: dm,
            day: dd,
            in_month: dy as i32 == year && dm == month,
            entries: Vec::new(),
            segment_slots: 0,
        });
    }

    let mut segments = Vec::new();
    for entry in entries {
        let start_day = local_day_index(entry.start_at_ms, offset_at_ms);
        let end_day = entry
            .end_at_ms
            .filter(|&end| end >= entry.start_at_ms)
            .map_or(start_day, |end| local_day_index(end, offset_at_ms));

        if end_day > start_day {
            // Multi-day range entry -> clipped weekly segments.
            if end_day < range.from_day || start_day > range.to_day {
                continue;
            }
            let clamped_start = start_day.clamp(range.from_day, range.to_day);
            let clamped_end = end_day.clamp(range.from_day, range.to_day);
            let start_offset = (clamped_start - range.from_day) as usize;
            let end_offset = (clamped_end - range.from_day) as usize;

            let mut offset = start_offset;
            while offset <= end_offset {
                let week_index = offset / 7;
                let start_index = offset % 7;
                let week_end_offset = week_index * 7 + 6;
                let span = end_offset.min(week_end_offset) - offset + 1;
                segments.push(CalendarRangeSegment {
                    entry: entry.clone(),
                    week_index,
                    start_index,
                    span,
                    slot: 0,
                    starts_before_week: start_day < range.from_day + (week_index * 7) as i64,
                    ends_after_week: end_day > range.from_day + week_end_offset as i64,
                });
                offset += span;
            }
        } else if start_day >= range.from_day && start_day <= range.to_day {
            let offset = (start_day - range.from_day) as usize;
            if let Some(day) = days.get_mut(offset) {
                day.entries.push(entry.clone());
            }
        }
    }

    let week_count = days.len() / 7;
    assign_segment_slots(week_count, &mut segments);
    for seg in &segments {
        let base = seg.week_index * 7 + seg.start_index;
        for i in 0..seg.span {
            if let Some(day) = days.get_mut(base + i) {
                day.segment_slots = day.segment_slots.max(seg.slot + 1);
            }
        }
    }

    let weeks: Vec<Vec<CalendarDayLayout>> =
        days.chunks(7).map(<[CalendarDayLayout]>::to_vec).collect();
    CalendarMonthLayout {
        year,
        month,
        range,
        weeks,
        segments,
    }
}

fn assign_segment_slots(week_count: usize, segments: &mut [CalendarRangeSegment]) {
    for week_index in 0..week_count {
        let mut slots: Vec<[bool; 7]> = Vec::new();
        for seg in segments.iter_mut().filter(|s| s.week_index == week_index) {
            let mut slot = 0usize;
            while slots.get(slot).is_some_and(|occ| {
                (seg.start_index..seg.start_index + seg.span).any(|idx| occ[idx])
            }) {
                slot += 1;
            }
            if slot == slots.len() {
                slots.push([false; 7]);
            }
            for idx in seg.start_index..seg.start_index + seg.span {
                slots[slot][idx] = true;
            }
            seg.slot = slot;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exact `America/New_York` 2026 DST rule:
    /// - Spring forward: 2026-03-08 02:00 EST (`07:00 UTC`) -> EDT (`-240` min)
    /// - Fall back:      2026-11-01 02:00 EDT (`06:00 UTC`) -> EST (`-300` min)
    fn ny_offset_2026(utc_ms: i64) -> i32 {
        const SPRING_FORWARD_UTC_MS: i64 = 1_772_953_200_000; // 2026-03-08T07:00:00Z
        const FALL_BACK_UTC_MS: i64 = 1_793_512_800_000; // 2026-11-01T06:00:00Z
        if (SPRING_FORWARD_UTC_MS..FALL_BACK_UTC_MS).contains(&utc_ms) {
            -240
        } else {
            -300
        }
    }

    fn utc_ms(year: i32, month: u32, day: u32, hour: i64, min: i64) -> i64 {
        days_from_civil(year, month, day) * 86_400_000 + hour * 3_600_000 + min * 60_000
    }

    #[test]
    fn ny_dst_transitions_and_local_midnight_group_dates_identically_to_0275() {
        // Table-driven single-day grouping across spring forward, fall back, and UTC midnight.
        let cases = [
            // 2026-03-07 23:30 EST == 2026-03-08 04:30 UTC -> still March 7 in NY!
            (
                "pre-spring-23:30-EST",
                utc_ms(2026, 3, 8, 4, 30),
                (2026, 3, 7),
            ),
            // 2026-03-08 00:30 EST == 2026-03-08 05:30 UTC -> March 8 in NY.
            ("spring-00:30-EST", utc_ms(2026, 3, 8, 5, 30), (2026, 3, 8)),
            // 2026-03-08 03:30 EDT == 2026-03-08 07:30 UTC -> March 8 in NY (post spring forward).
            (
                "post-spring-03:30-EDT",
                utc_ms(2026, 3, 8, 7, 30),
                (2026, 3, 8),
            ),
            // 2026-03-08 23:30 EDT == 2026-03-09 03:30 UTC -> still March 8 in NY!
            (
                "spring-night-23:30-EDT",
                utc_ms(2026, 3, 9, 3, 30),
                (2026, 3, 8),
            ),
            // 2026-03-09 00:30 EDT == 2026-03-09 04:30 UTC -> March 9 in NY.
            (
                "post-spring-00:30-EDT",
                utc_ms(2026, 3, 9, 4, 30),
                (2026, 3, 9),
            ),
            // 2026-10-31 23:30 EDT == 2026-11-01 03:30 UTC -> still Oct 31 in NY!
            (
                "pre-fall-23:30-EDT",
                utc_ms(2026, 11, 1, 3, 30),
                (2026, 10, 31),
            ),
            // 2026-11-01 01:30 EDT == 2026-11-01 05:30 UTC -> Nov 1 in NY.
            ("fall-01:30-EDT", utc_ms(2026, 11, 1, 5, 30), (2026, 11, 1)),
            // 2026-11-01 01:30 EST == 2026-11-01 06:30 UTC -> Nov 1 in NY (post fall back).
            (
                "post-fall-01:30-EST",
                utc_ms(2026, 11, 1, 6, 30),
                (2026, 11, 1),
            ),
            // 2026-11-01 23:30 EST == 2026-11-02 04:30 UTC -> still Nov 1 in NY!
            (
                "fall-night-23:30-EST",
                utc_ms(2026, 11, 2, 4, 30),
                (2026, 11, 1),
            ),
            // 2026-11-02 00:30 EST == 2026-11-02 05:30 UTC -> Nov 2 in NY.
            (
                "post-fall-00:30-EST",
                utc_ms(2026, 11, 2, 5, 30),
                (2026, 11, 2),
            ),
        ];

        for (label, ts, expected_ymd) in cases {
            let day_idx = local_day_index(ts, &ny_offset_2026);
            let (y, m, d) = civil_from_days(day_idx);
            assert_eq!(
                (y as i32, m, d),
                expected_ymd,
                "NY DST case {label} mapped to wrong civil day"
            );
        }

        // Multi-day range spanning spring-forward DST & week boundary:
        // Sat 2026-03-07 23:30 EST -> Tue 2026-03-10 23:30 EDT (4 local days: Sat, Sun, Mon, Tue).
        // With weekStartsOn=0 (Sunday):
        // - Week 0 (Mar 1..Mar 7): Sat Mar 7 => start_index=6, span=1, ends_after_week=true
        // - Week 1 (Mar 8..Mar 14): Sun Mar 8..Tue Mar 10 => start_index=0, span=3, starts_before_week=true
        let spring_entry = CalendarEntry {
            id: "db:spring".into(),
            row_id: "r-spring".into(),
            title: "DST Spring Release".into(),
            color: None,
            start_at_ms: utc_ms(2026, 3, 8, 4, 30), // Sat Mar 7 23:30 EST
            end_at_ms: Some(utc_ms(2026, 3, 11, 3, 30)), // Tue Mar 10 23:30 EDT
            badges: Vec::new(),
        };
        let march = create_calendar_month_layout(2026, 3, &[spring_entry], 0, &ny_offset_2026);
        assert_eq!(march.segments.len(), 2);
        assert_eq!(
            (
                march.segments[0].week_index,
                march.segments[0].start_index,
                march.segments[0].span,
                march.segments[0].starts_before_week,
                march.segments[0].ends_after_week,
                march.segments[0].slot,
            ),
            (0, 6, 1, false, true, 0)
        );
        assert_eq!(
            (
                march.segments[1].week_index,
                march.segments[1].start_index,
                march.segments[1].span,
                march.segments[1].starts_before_week,
                march.segments[1].ends_after_week,
                march.segments[1].slot,
            ),
            (1, 0, 3, true, false, 0)
        );

        // Multi-day range spanning fall-back DST:
        // Sat 2026-10-31 23:30 EDT -> Mon 2026-11-02 23:30 EST (3 local days: Oct 31, Nov 1, Nov 2).
        // In November 2026 (Nov 1 is Sunday, week 0 starts Sun Nov 1):
        // Oct 31 is before visible range, so Nov 1..Nov 2 is start_index=0, span=2, starts_before_week=true!
        let fall_entry = CalendarEntry {
            id: "db:fall".into(),
            row_id: "r-fall".into(),
            title: "DST Fall Audit".into(),
            color: None,
            start_at_ms: utc_ms(2026, 11, 1, 3, 30), // Sat Oct 31 23:30 EDT
            end_at_ms: Some(utc_ms(2026, 11, 3, 4, 30)), // Mon Nov 2 23:30 EST
            badges: Vec::new(),
        };
        let nov = create_calendar_month_layout(2026, 11, &[fall_entry], 0, &ny_offset_2026);
        assert_eq!(nov.segments.len(), 1);
        assert_eq!(
            (
                nov.segments[0].week_index,
                nov.segments[0].start_index,
                nov.segments[0].span,
                nov.segments[0].starts_before_week,
                nov.segments[0].ends_after_week,
            ),
            (0, 0, 2, true, false)
        );
    }
}
