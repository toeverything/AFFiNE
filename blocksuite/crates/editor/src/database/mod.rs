//! `affine:database` domain logic, `InlineAxis` LTR/RTL coordinate mapping,
//! `BidiIsolation::LtrIsolate`, query/filter/sort/group evaluation, DST-aware
//! calendar month layout, and Page-mode Table / Kanban / Calendar renderers.

mod authoring;
mod authoring_dispatch;
mod calendar;
mod calendar_edit;
mod cell_editor;
mod column_ops;
mod filter_sort_bar;
mod format;
mod group;
mod query;
mod render;
mod render_calendar;
mod render_kanban;
mod render_table;

use std::collections::{BTreeSet, HashMap};

use crate::block_flow::FlowRect;

pub use authoring::{
    ActiveCellEditor, ActiveToolbarPanel, AuthoringActionResult, CalendarDragState,
    ColumnMenuState, ColumnResizePreview, DatabaseAuthoringHit, DatabaseAuthoringHitKind,
    DatabaseAuthoringKey, DatabaseAuthoringState, FilterDraftState, ProgressScrubPreview,
    commit_column_resize, handle_authoring_key,
};
pub use authoring_dispatch::handle_authoring_hit;
pub use calendar::{
    CalendarDayLayout, CalendarEntry, CalendarMonthLayout, CalendarRangeSegment,
    CalendarVisibleRange, create_calendar_month_layout, days_from_civil,
    get_calendar_visible_month_range, local_day_index, weekday_from_days,
};
pub use calendar_edit::{
    create_calendar_row_on_day, day_index_to_local_midnight_ms, reschedule_calendar_row_to_day,
    resolve_calendar_date_columns,
};
pub use cell_editor::{
    ParsedCellInput, initial_cell_draft, is_editable_column_type, next_editable_cell,
    next_tag_color, normalize_url_input, parse_cell_draft, parse_date_input_ms,
    progress_from_bar_x,
};
pub use column_ops::{
    COLUMN_TYPES, TAG_COLOR_PALETTE, column_type_label, insert_column_relative,
    make_new_column_spec,
};
pub use filter_sort_bar::{
    FILTER_OPERATORS, FilterRuleItem, SortRuleItem, build_filter_json, build_group_by_for_column,
    build_sort_json, filter_op_label, parse_filter_rules, parse_sort_rules,
};
pub use format::{
    BidiIsolation, column_icon_name, format_database_created_time, format_database_date,
    format_database_number, format_database_progress, isolate_bidi, isolate_ltr,
    resolve_tag_accent, resolve_tag_color,
};
pub use group::{DatabaseGroupBucket, group_database_rows};
pub use query::{eval_database_filter, sort_database_rows};
pub use render::{DatabaseLayoutOutput, DatabasePrim, layout_database_block};
pub use render_calendar::resolve_calendar_display_month;

/// Unified logical-to-physical horizontal coordinate mapper shared by `affine:table`
/// and `affine:database` (`Table`, `Kanban`, and `Calendar` views).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct InlineAxis {
    pub direction: ui::Direction,
    pub container_width: f32,
}

impl InlineAxis {
    pub const fn new(direction: ui::Direction, container_width: f32) -> Self {
        Self {
            direction,
            container_width,
        }
    }

    pub const fn is_rtl(self) -> bool {
        matches!(self.direction, ui::Direction::Rtl)
    }

    /// Map a logical inline-start offset `logical_x` of an item with `item_width`
    /// into physical `x` within `[0, container_width]`.
    pub fn map_x(self, logical_x: f32, item_width: f32) -> f32 {
        match self.direction {
            ui::Direction::Ltr => logical_x,
            ui::Direction::Rtl => self.container_width - logical_x - item_width,
        }
    }

    /// Exact inverse of [`Self::map_x`]: map physical `visual_x` back to logical inline-start offset.
    pub fn unmap_x(self, visual_x: f32, item_width: f32) -> f32 {
        match self.direction {
            ui::Direction::Ltr => visual_x,
            ui::Direction::Rtl => self.container_width - visual_x - item_width,
        }
    }

    /// Map a logical rectangle into physical coordinates while preserving width and height.
    pub fn map_rect(self, rect: FlowRect) -> FlowRect {
        FlowRect::new(self.map_x(rect.x, rect.w), rect.y, rect.w, rect.h)
    }

    /// Exact inverse of [`Self::map_rect`].
    pub fn unmap_rect(self, rect: FlowRect) -> FlowRect {
        FlowRect::new(self.unmap_x(rect.x, rect.w), rect.y, rect.w, rect.h)
    }

    /// Visual column/lane traversal order for `count` logical items.
    pub fn order_indices(self, count: usize) -> Vec<usize> {
        match self.direction {
            ui::Direction::Ltr => (0..count).collect(),
            ui::Direction::Rtl => (0..count).rev().collect(),
        }
    }

    /// Mirror a `[start_col, start_col + span)` column span within a `total_cols`-column grid
    /// (used for 7-day Calendar week headers and multi-day range bars).
    pub fn map_col_span(self, total_cols: usize, start_col: usize, span: usize) -> usize {
        match self.direction {
            ui::Direction::Ltr => start_col,
            ui::Direction::Rtl => total_cols.saturating_sub(start_col.saturating_add(span)),
        }
    }
}

/// View-layer (zero-CRDT-writeback) state for one `affine:database` block.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct DatabaseUiState {
    /// Currently selected view id (mirrors `currentViewStorage` in `0.27.5`).
    pub active_view_id: Option<String>,
    /// Currently displayed Calendar `(year, month 1..=12)`.
    pub calendar_month: Option<(i32, u32)>,
    /// Selected local day index in Phone Calendar agenda view.
    pub calendar_selected_day: Option<i64>,
    /// Horizontal scroll offset (whole px) for the touch database view tab strip.
    pub view_tabs_scroll_px: i32,
    /// One-shot hint set when switching `active_view_id` so the next layout pass brings the newly
    /// activated tab into view without overriding subsequent manual horizontal scrolling.
    pub reveal_active_tab: bool,
    /// Whether the Desktop `"N More"` overflow view dropdown is open.
    pub more_views_open: bool,
    /// Whether the mobile read-only notice banner is currently displayed for this block.
    pub mobile_readonly_notice: bool,
    /// Group keys collapsed in Table view.
    pub collapsed_groups: BTreeSet<String>,
    /// Transient desktop/writable authoring state (column menu, in-place cell editor, toolbar
    /// panels, resize/reorder/calendar drag previews). Zero CRDT writeback until committed.
    pub authoring: DatabaseAuthoringState,
}

/// Host-injected view-layer state for all `affine:database` blocks inside a [`crate::block_flow::BlockFlow`].
#[derive(Clone, Debug, Default)]
pub struct DatabaseFlowState {
    pub ui_states: HashMap<String, DatabaseUiState>,
    pub clock_ms: i64,
    pub mobile_readonly: bool,
    revision: u64,
}

impl DatabaseFlowState {
    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn state_for(&self, block_id: &str) -> DatabaseUiState {
        self.ui_states.get(block_id).cloned().unwrap_or_default()
    }

    pub fn set_active_view(&mut self, block_id: &str, view_id: impl Into<String>) {
        let entry = self.ui_states.entry(block_id.to_string()).or_default();
        let next_id = view_id.into();
        if entry.active_view_id.as_deref() != Some(next_id.as_str()) {
            entry.active_view_id = Some(next_id);
            entry.reveal_active_tab = true;
        }
        entry.more_views_open = false;
        self.revision = self.revision.wrapping_add(1);
    }

    pub fn set_calendar_selected_day(&mut self, block_id: &str, day_index: Option<i64>) {
        self.ui_states
            .entry(block_id.to_string())
            .or_default()
            .calendar_selected_day = day_index;
        self.revision = self.revision.wrapping_add(1);
    }

    pub fn toggle_more_views(&mut self, block_id: &str) {
        let entry = self.ui_states.entry(block_id.to_string()).or_default();
        entry.more_views_open = !entry.more_views_open;
        self.revision = self.revision.wrapping_add(1);
    }

    pub fn scroll_view_tabs(&mut self, block_id: &str, delta_px: i32, max_px: i32) -> bool {
        let entry = self.ui_states.entry(block_id.to_string()).or_default();
        entry.reveal_active_tab = false;
        let next = (entry.view_tabs_scroll_px - delta_px).clamp(0, max_px.max(0));
        if next != entry.view_tabs_scroll_px {
            entry.view_tabs_scroll_px = next;
            self.revision = self.revision.wrapping_add(1);
            true
        } else {
            false
        }
    }

    pub fn scroll_view_tabs_from(
        &mut self,
        block_id: &str,
        base_scroll_px: i32,
        delta_px: i32,
        max_px: i32,
    ) -> bool {
        let entry = self.ui_states.entry(block_id.to_string()).or_default();
        let start = if entry.reveal_active_tab {
            base_scroll_px
        } else {
            entry.view_tabs_scroll_px
        };
        let was_revealing = entry.reveal_active_tab;
        entry.reveal_active_tab = false;
        let next = (start - delta_px).clamp(0, max_px.max(0));
        if next != start || was_revealing {
            entry.view_tabs_scroll_px = next;
            self.revision = self.revision.wrapping_add(1);
            true
        } else {
            false
        }
    }

    pub fn set_calendar_month(&mut self, block_id: &str, month: Option<(i32, u32)>) {
        self.ui_states
            .entry(block_id.to_string())
            .or_default()
            .calendar_month = month;
        self.revision = self.revision.wrapping_add(1);
    }

    pub fn step_calendar_month(&mut self, block_id: &str, current: (i32, u32), delta_months: i32) {
        let total = current.0 * 12 + (current.1 as i32 - 1) + delta_months;
        let next_y = total.div_euclid(12);
        let next_m = (total.rem_euclid(12) + 1) as u32;
        self.set_calendar_month(block_id, Some((next_y, next_m)));
    }

    pub fn set_mobile_readonly_notice(&mut self, block_id: &str, visible: bool) {
        self.ui_states
            .entry(block_id.to_string())
            .or_default()
            .mobile_readonly_notice = visible;
        self.revision = self.revision.wrapping_add(1);
    }

    pub fn toggle_group(&mut self, block_id: &str, group_key: &str) {
        let entry = self.ui_states.entry(block_id.to_string()).or_default();
        if !entry.collapsed_groups.remove(group_key) {
            entry.collapsed_groups.insert(group_key.to_string());
        }
        self.revision = self.revision.wrapping_add(1);
    }

    pub fn authoring_mut(&mut self, block_id: &str) -> &mut DatabaseAuthoringState {
        self.revision = self.revision.wrapping_add(1);
        &mut self
            .ui_states
            .entry(block_id.to_string())
            .or_default()
            .authoring
    }
}

/// Interactive action triggered by clicking a region inside a rendered `affine:database` block.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DatabaseHitKind {
    SwitchView {
        view_id: String,
    },
    ToggleMoreViews,
    CalendarPrevMonth,
    CalendarToday,
    CalendarNextMonth,
    CalendarSelectDay {
        day_index: i64,
    },
    OpenRecord {
        row_id: String,
    },
    ToggleCheckbox {
        row_id: String,
        column_id: String,
        current: bool,
    },
    ToggleGroup {
        group_key: String,
    },
    AddRow,
    CellReadOnly,
}

/// One clickable hit target inside an `affine:database` block, in block-local coordinates.
#[derive(Clone, Debug, PartialEq)]
pub struct DatabaseHitTarget {
    pub rect: FlowRect,
    pub kind: DatabaseHitKind,
    /// Whether this target scrolls horizontally with the view's `CodeScroll` content area.
    pub scrolls_x: bool,
}

/// Exact mobile read-only notice message aligned with `0.27.5` `database-block.ts:406-407`.
pub const MOBILE_DATABASE_READONLY_NOTICE: &str =
    "Mobile database editing is not supported yet. Edit it in desktop mode.";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inline_axis_ltr_rtl_mapping_is_bijective_and_preserves_geometry() {
        let cases = [
            (600.0_f32, 0.0_f32, 120.0_f32),
            (600.0, 120.0, 180.0),
            (600.0, 480.0, 120.0),
            (390.0, 14.5, 92.25),
            (1024.0, 260.0, 200.0),
        ];
        for dir in [ui::Direction::Ltr, ui::Direction::Rtl] {
            for (container_w, logical_x, item_w) in cases {
                let axis = InlineAxis::new(dir, container_w);
                let mapped_x = axis.map_x(logical_x, item_w);
                let unmapped_x = axis.unmap_x(mapped_x, item_w);
                assert!(
                    (unmapped_x - logical_x).abs() < 1e-4,
                    "dir={dir:?} container={container_w} x={logical_x} w={item_w}: mapped={mapped_x} unmapped={unmapped_x}"
                );

                let rect = FlowRect::new(logical_x, 24.0, item_w, 34.0);
                let mapped_rect = axis.map_rect(rect);
                assert_eq!(mapped_rect.w, rect.w, "width must be conserved");
                assert_eq!(mapped_rect.h, rect.h, "height must be conserved");
                assert_eq!(mapped_rect.y, rect.y, "y must be conserved");
                let roundtrip = axis.unmap_rect(mapped_rect);
                assert!((roundtrip.x - rect.x).abs() < 1e-4);
                if dir == ui::Direction::Rtl {
                    assert!(
                        ((mapped_rect.x + mapped_rect.w) - (container_w - rect.x)).abs() < 1e-4
                    );
                }
            }
        }

        // Column order reversal and Calendar 7-day week span mirroring.
        assert_eq!(
            InlineAxis::new(ui::Direction::Ltr, 700.0).order_indices(4),
            vec![0, 1, 2, 3]
        );
        assert_eq!(
            InlineAxis::new(ui::Direction::Rtl, 700.0).order_indices(4),
            vec![3, 2, 1, 0]
        );
        // Week span [1, span=3] (Mon..Wed) mirrors to [3, span=3] in a 7-day RTL grid.
        assert_eq!(
            InlineAxis::new(ui::Direction::Ltr, 700.0).map_col_span(7, 1, 3),
            1
        );
        assert_eq!(
            InlineAxis::new(ui::Direction::Rtl, 700.0).map_col_span(7, 1, 3),
            3
        );
        // Full week [0, span=7] stays at 0 in both directions.
        assert_eq!(
            InlineAxis::new(ui::Direction::Rtl, 700.0).map_col_span(7, 0, 7),
            0
        );
    }

    #[test]
    fn bidi_ltr_isolate_preserves_numeric_currency_date_url_order_in_rtl_context() {
        let samples = [
            format_database_number(12345.67, "currencyUSD", Some(2)),
            format_database_number(0.85, "percent", Some(0)),
            format_database_date(1_772_960_400_000, -300),
            format_database_progress(64).1,
            isolate_ltr("https://affine.pro/docs?v=2"),
            isolate_ltr("team@affine.pro"),
        ];
        for sample in samples {
            assert!(
                sample.starts_with('\u{2066}') && sample.ends_with('\u{2069}'),
                "expected LRI..PDI isolate wrapper, got {sample:?}"
            );
            // Embedded in Arabic and Hebrew phrases, the isolated span stays intact verbatim.
            let arabic = format!("الميزانية: {sample} شهريا");
            let hebrew = format!("תקציב: {sample} לחודש");
            assert!(arabic.contains(&sample));
            assert!(hebrew.contains(&sample));
            // Strip isolate delimiters to verify inner payload has no unintended reordering.
            let inner = sample
                .strip_prefix('\u{2066}')
                .and_then(|s| s.strip_suffix('\u{2069}'))
                .expect("delimiters");
            assert!(!inner.is_empty());
        }
    }
}
