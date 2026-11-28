//! `PlaygroundView` controllers for `affine:database` view switching, calendar month
//! stepping, mobile read-only notice gating, and desktop checkbox/row interactions.

use std::collections::BTreeMap;

use blocksuite_playground_doc::schema::{
    DatabaseCellSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec,
};
use serde_json::json;
use ui::Context;

use crate::{PlaygroundView, block_flow, database};

impl PlaygroundView {
    /// Build the rich 3-view (`Table`, `Kanban`, `Calendar`) showcase database specification.
    pub(crate) fn showcase_database_spec() -> DatabaseSpec {
        let mut db_cells = BTreeMap::new();
        db_cells.insert(
            "showcase-db-row-1".to_string(),
            BTreeMap::from([
                (
                    "col-status".to_string(),
                    DatabaseCellSpec::Text("opt-doing".into()),
                ),
                (
                    "col-tags".to_string(),
                    DatabaseCellSpec::MultiSelect(vec!["tag-mobile".into(), "tag-ui".into()]),
                ),
                (
                    "col-start".to_string(),
                    DatabaseCellSpec::Integer(1_772_960_400_000),
                ),
                (
                    "col-end".to_string(),
                    DatabaseCellSpec::Integer(1_773_133_200_000),
                ),
                ("col-progress".to_string(), DatabaseCellSpec::Integer(80)),
                ("col-done".to_string(), DatabaseCellSpec::Bool(false)),
                ("col-budget".to_string(), DatabaseCellSpec::Number(12500.0)),
            ]),
        );
        db_cells.insert(
            "showcase-db-row-2".to_string(),
            BTreeMap::from([
                (
                    "col-status".to_string(),
                    DatabaseCellSpec::Text("opt-done".into()),
                ),
                (
                    "col-tags".to_string(),
                    DatabaseCellSpec::MultiSelect(vec!["tag-core".into()]),
                ),
                (
                    "col-start".to_string(),
                    DatabaseCellSpec::Integer(1_772_625_600_000),
                ),
                ("col-progress".to_string(), DatabaseCellSpec::Integer(100)),
                ("col-done".to_string(), DatabaseCellSpec::Bool(true)),
                ("col-budget".to_string(), DatabaseCellSpec::Number(18000.0)),
            ]),
        );
        db_cells.insert(
            "showcase-db-row-3".to_string(),
            BTreeMap::from([
                (
                    "col-status".to_string(),
                    DatabaseCellSpec::Text("opt-doing".into()),
                ),
                (
                    "col-tags".to_string(),
                    DatabaseCellSpec::MultiSelect(vec!["tag-ui".into()]),
                ),
                (
                    "col-start".to_string(),
                    DatabaseCellSpec::Integer(1_773_316_800_000),
                ),
                (
                    "col-end".to_string(),
                    DatabaseCellSpec::Integer(1_773_576_000_000),
                ),
                ("col-progress".to_string(), DatabaseCellSpec::Integer(60)),
                ("col-done".to_string(), DatabaseCellSpec::Bool(false)),
                ("col-budget".to_string(), DatabaseCellSpec::Number(6400.0)),
            ]),
        );
        db_cells.insert(
            "showcase-db-row-4".to_string(),
            BTreeMap::from([
                (
                    "col-status".to_string(),
                    DatabaseCellSpec::Text("opt-todo".into()),
                ),
                (
                    "col-tags".to_string(),
                    DatabaseCellSpec::MultiSelect(vec!["tag-mobile".into(), "tag-core".into()]),
                ),
                (
                    "col-start".to_string(),
                    DatabaseCellSpec::Integer(1_773_921_600_000),
                ),
                ("col-progress".to_string(), DatabaseCellSpec::Integer(15)),
                ("col-done".to_string(), DatabaseCellSpec::Bool(false)),
                ("col-budget".to_string(), DatabaseCellSpec::Number(4200.0)),
            ]),
        );
        DatabaseSpec {
            title: "Tasks".to_string(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "col-status".into(),
                    column_type: "select".into(),
                    name: "Status".into(),
                    data: json!({
                        "options": [
                            {"id": "opt-todo", "value": "Todo", "color": "var(--affine-tag-gray)"},
                            {"id": "opt-doing", "value": "In Progress", "color": "var(--affine-tag-blue)"},
                            {"id": "opt-done", "value": "Done", "color": "var(--affine-tag-green)"}
                        ]
                    }),
                },
                DatabaseColumnSpec {
                    id: "col-tags".into(),
                    column_type: "multi-select".into(),
                    name: "Tags".into(),
                    data: json!({
                        "options": [
                            {"id": "tag-mobile", "value": "Mobile", "color": "var(--affine-tag-purple)"},
                            {"id": "tag-core", "value": "Core", "color": "var(--affine-tag-orange)"},
                            {"id": "tag-ui", "value": "UI", "color": "var(--affine-tag-teal)"}
                        ]
                    }),
                },
                DatabaseColumnSpec {
                    id: "col-start".into(),
                    column_type: "date".into(),
                    name: "Due".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-end".into(),
                    column_type: "date".into(),
                    name: "End".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-progress".into(),
                    column_type: "progress".into(),
                    name: "Progress".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-done".into(),
                    column_type: "checkbox".into(),
                    name: "Done".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-budget".into(),
                    column_type: "number".into(),
                    name: "Budget".into(),
                    data: json!({"format": "currencyUSD", "decimal": 0}),
                },
            ],
            views: vec![
                DatabaseViewSpec {
                    id: "view-table".into(),
                    name: "Table View".into(),
                    mode: "table".into(),
                    raw: json!({
                        "columns": [
                            {"id": "title", "width": 190},
                            {"id": "col-status", "width": 115},
                            {"id": "col-tags", "width": 130},
                            {"id": "col-start", "width": 100},
                            {"id": "col-end", "width": 100, "hide": true},
                            {"id": "col-progress", "width": 120},
                            {"id": "col-done", "width": 65},
                            {"id": "col-budget", "width": 100}
                        ],
                        "filter": {"type": "group", "op": "and", "conditions": []},
                        "header": {"titleColumn": "title", "iconColumn": "type"}
                    }),
                },
                DatabaseViewSpec {
                    id: "view-kanban".into(),
                    name: "Kanban View".into(),
                    mode: "kanban".into(),
                    raw: json!({
                        "columns": [
                            {"id": "title"},
                            {"id": "col-tags"},
                            {"id": "col-progress"},
                            {"id": "col-budget"},
                            {"id": "col-start", "hide": true},
                            {"id": "col-end", "hide": true},
                            {"id": "col-done", "hide": true}
                        ],
                        "filter": {"type": "group", "op": "and", "conditions": []},
                        "groupBy": {
                            "type": "groupBy",
                            "columnId": "col-status",
                            "name": "select",
                            "hideEmpty": false
                        },
                        "groupProperties": [
                            {"key": "opt-todo", "hide": false, "manuallyCardSort": []},
                            {"key": "opt-doing", "hide": false, "manuallyCardSort": []},
                            {"key": "opt-done", "hide": false, "manuallyCardSort": []}
                        ],
                        "header": {"titleColumn": "title", "iconColumn": "type"}
                    }),
                },
                DatabaseViewSpec {
                    id: "view-calendar".into(),
                    name: "Calendar View".into(),
                    mode: "calendar".into(),
                    raw: json!({
                        "filter": {"type": "group", "op": "and", "conditions": []},
                        "date": {"startColumnId": "col-start", "endColumnId": "col-end"},
                        "card": {"titleColumnId": "title", "visiblePropertyIds": ["col-status"]}
                    }),
                },
            ],
            cells: db_cells,
        }
    }

    /// Switch the active view of an `affine:database` block (zero CRDT writeback).
    pub fn set_database_active_view(
        &mut self,
        block_id: &str,
        view_id: &str,
        cx: &mut Context<Self>,
    ) {
        self.flow.database_state.set_active_view(block_id, view_id);
        self.env_rev += 1;
        cx.notify();
    }

    /// Step the displayed Calendar month of an `affine:database` block by `delta_months`
    /// (zero CRDT writeback).
    pub fn step_database_calendar_month(
        &mut self,
        block_id: &str,
        delta_months: i32,
        cx: &mut Context<Self>,
    ) {
        let current = self.resolve_database_calendar_month(block_id, cx);
        self.flow
            .database_state
            .step_calendar_month(block_id, current, delta_months);
        self.env_rev += 1;
        cx.notify();
    }

    /// Jump the displayed Calendar month of an `affine:database` block to the host clock's
    /// local month (zero CRDT writeback).
    pub fn set_database_calendar_today(&mut self, block_id: &str, cx: &mut Context<Self>) {
        let (now_ms, _) = self.local_calendar_now(cx);
        let offset_at = self.utc_offset_resolver();
        let day = database::local_day_index(now_ms, &offset_at);
        let (y, m, _) = block_flow::civil_from_days(day);
        self.flow.database_state.clock_ms = now_ms;
        self.flow
            .database_state
            .set_calendar_month(block_id, Some((y as i32, m)));
        self.env_rev += 1;
        cx.notify();
    }

    /// Enable or disable the mobile database read-only editing gate
    /// (`enable_mobile_database_editing == false`).
    pub fn set_database_mobile_readonly(&mut self, readonly: bool, cx: &mut Context<Self>) {
        self.database_readonly = readonly;
        if self.flow.database_state.mobile_readonly != readonly {
            self.flow.database_state.mobile_readonly = readonly;
            if !readonly {
                for state in self.flow.database_state.ui_states.values_mut() {
                    state.mobile_readonly_notice = false;
                }
            }
            self.env_rev += 1;
            cx.notify();
        }
    }

    /// Whether the mobile read-only notice banner is currently visible on `block_id`.
    pub fn database_mobile_readonly_notice(&self, block_id: &str) -> bool {
        self.flow
            .database_state
            .state_for(block_id)
            .mobile_readonly_notice
    }

    /// Show the one-time read-only mobile database toast (once per session, auto-dismisses).
    pub(crate) fn show_database_readonly_toast_once(&mut self, cx: &mut Context<Self>) {
        if !self.database_readonly || self.database_readonly_toast_shown {
            return;
        }
        self.database_readonly_toast_shown = true;
        let generation = self
            .overlays
            .show_context_toast("Read-only on mobile. Tap a record to view.");
        self.context_toast_timer = Some(cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(super::CONTEXT_TOAST_MS))
                .await;
            let _ = this.update(cx, |this, cx| {
                if this.overlays.context_toast_expired(generation) {
                    cx.notify();
                }
            });
        }));
        cx.notify();
    }

    /// Clickable regions of a laid-out `affine:database` block from the latest layout pass.
    pub fn database_hits(&self, block_id: &str) -> &[database::DatabaseHitTarget] {
        self.flow.database_hits(block_id)
    }

    fn apply_database_commit(
        &mut self,
        commit: Option<
            y_octo::SessionCommit<blocksuite_playground_doc::session::SelectionSnapshot>,
        >,
        window: Option<&mut ui::Window>,
        cx: &mut Context<Self>,
    ) {
        if let Some(window) = window {
            self.did_edit(commit, None, window, cx);
        } else {
            if let (Some(commit), Some(id)) = (commit, self.page_id.clone()) {
                self.send_page_update(&id, commit.update);
            }
            self.refresh_document();
            cx.notify();
        }
    }

    /// Dispatch a block-local click `(local_x, local_y)` against a laid-out `affine:database` block.
    pub fn click_database_point(
        &mut self,
        block_id: &str,
        local_x: f32,
        local_y: f32,
        window: Option<&mut ui::Window>,
        cx: &mut Context<Self>,
    ) -> bool {
        let hits = self.flow.database_hits(block_id);
        if hits.is_empty() {
            return false;
        }
        let code_scroll = self
            .flow_layout()
            .and_then(|l| l.block(block_id).and_then(|b| b.body.code_scroll));
        let scroll_x = code_scroll.map_or(0.0, |cs| self.overlays.code_scroll_x_for(block_id, cs));
        let target = hits
            .iter()
            .rev()
            .find(|h| {
                if h.scrolls_x
                    && let Some(cs) = code_scroll
                    && !cs.area.contains(local_x, local_y)
                {
                    return false;
                }
                let test_x = if h.scrolls_x {
                    local_x + scroll_x
                } else {
                    local_x
                };
                h.rect.contains(test_x, local_y)
            })
            .cloned();
        let Some(target) = target else {
            return false;
        };
        match &target.kind {
            database::DatabaseHitKind::SwitchView { view_id } => {
                self.set_database_active_view(block_id, view_id, cx);
                true
            }
            database::DatabaseHitKind::ToggleMoreViews => {
                self.flow.database_state.toggle_more_views(block_id);
                self.env_rev += 1;
                cx.notify();
                true
            }
            database::DatabaseHitKind::CalendarPrevMonth => {
                self.step_database_calendar_month(block_id, -1, cx);
                true
            }
            database::DatabaseHitKind::CalendarToday => {
                self.set_database_calendar_today(block_id, cx);
                true
            }
            database::DatabaseHitKind::CalendarNextMonth => {
                self.step_database_calendar_month(block_id, 1, cx);
                true
            }
            database::DatabaseHitKind::CalendarSelectDay { day_index } => {
                self.flow
                    .database_state
                    .set_calendar_selected_day(block_id, Some(*day_index));
                self.env_rev += 1;
                cx.notify();
                true
            }
            database::DatabaseHitKind::OpenRecord { row_id } => {
                self.show_database_readonly_toast_once(cx);
                self.open_database_record_sheet(block_id, row_id, cx);
                true
            }
            database::DatabaseHitKind::ToggleGroup { group_key } => {
                self.flow.database_state.toggle_group(block_id, group_key);
                self.env_rev += 1;
                cx.notify();
                true
            }
            database::DatabaseHitKind::CellReadOnly => {
                self.show_database_readonly_toast_once(cx);
                self.flow
                    .database_state
                    .set_mobile_readonly_notice(block_id, true);
                self.env_rev += 1;
                cx.notify();
                true
            }
            database::DatabaseHitKind::ToggleCheckbox {
                row_id,
                column_id,
                current,
            } => {
                if self.database_readonly || self.flow.database_state.mobile_readonly {
                    self.flow
                        .database_state
                        .set_mobile_readonly_notice(block_id, true);
                    self.env_rev += 1;
                    cx.notify();
                    return true;
                }
                let now_ms = self.now_ms(cx) as u64;
                if let Ok(page) = self.page_mut()
                    && let Ok(commit) =
                        page.set_database_cell_bool(block_id, row_id, column_id, !*current, now_ms)
                {
                    self.apply_database_commit(commit, window, cx);
                }
                true
            }
            database::DatabaseHitKind::AddRow => {
                if self.database_readonly || self.flow.database_state.mobile_readonly {
                    self.flow
                        .database_state
                        .set_mobile_readonly_notice(block_id, true);
                    self.env_rev += 1;
                    cx.notify();
                    return true;
                }
                let before = self.selection_snapshot();
                let now_ms = self.now_ms(cx) as u64;
                let row_id = self.fresh_block_id();
                if let Ok(page) = self.page_mut() {
                    let _ = page.stop_capturing();
                    if let Ok(commit) = page.add_database_row(block_id, &row_id, now_ms) {
                        if commit.is_some()
                            && let Some(before) = before
                        {
                            let _ = page.set_undo_selection_snapshot(before);
                        }
                        let _ = page.stop_capturing();
                        let mut window = window;
                        self.apply_database_commit(commit, window.as_deref_mut(), cx);
                        if let Some(window) = window {
                            self.select_document_range(
                                crate::editor_session::DocumentSelection::caret(
                                    crate::editor_session::DocPoint::new(&row_id, 0),
                                ),
                                window,
                                cx,
                            );
                        }
                    }
                }
                true
            }
        }
    }

    fn resolve_database_calendar_month(&self, block_id: &str, cx: &Context<Self>) -> (i32, u32) {
        let ui_state = self.flow.database_state.state_for(block_id);
        let offset_at = self.utc_offset_resolver();
        let (now_ms, _) = self.local_calendar_now(cx);
        if let Some(blocksuite_playground_doc::read::BlockContent::Database(db)) = self
            .snapshot
            .as_ref()
            .and_then(|s| s.block(block_id))
            .map(|n| &n.content)
            && let Some(active_view) = ui_state
                .active_view_id
                .as_deref()
                .and_then(|id| db.views.iter().find(|v| v.id == id))
                .or_else(|| db.views.first())
        {
            let filtered: Vec<_> = db
                .rows
                .iter()
                .filter(|row| {
                    active_view
                        .filter
                        .as_ref()
                        .is_none_or(|f| database::eval_database_filter(f, db, row))
                })
                .cloned()
                .collect();
            let ordered = database::sort_database_rows(&filtered, active_view.sort.as_ref(), db);
            return database::resolve_calendar_display_month(
                active_view,
                db,
                &ordered,
                &ui_state,
                self.form_factor,
                now_ms,
                &offset_at,
            );
        }
        if let Some(month) = ui_state.calendar_month {
            return month;
        }
        let day = database::local_day_index(now_ms, &offset_at);
        let (y, m, _) = block_flow::civil_from_days(day);
        (y as i32, m)
    }
}
