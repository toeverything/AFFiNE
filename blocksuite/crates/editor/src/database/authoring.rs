//! Unified authoring state types, floating popover dispatcher, keyboard handler, and drag
//! commit helpers for `affine:database`.

use blocksuite_playground_doc::{
    DocResult,
    read::{DatabaseData, DatabaseView},
    session::PageDocSession,
};

use crate::block_flow::FlowRect;

use super::{
    DatabaseFlowState,
    authoring_dispatch::handle_authoring_hit,
    cell_editor::{
        self, ParsedCellInput, initial_cell_draft, next_editable_cell, next_tag_color,
        parse_cell_draft,
    },
    column_ops, eval_database_filter,
    render::{DatabasePrim, DbRenderCtx},
    sort_database_rows,
};

/// Active column header menu popover state.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ColumnMenuState {
    pub column_id: String,
    pub rename_draft: String,
    pub type_submenu_open: bool,
}

/// Live column resize drag preview (whole px, zero CRDT writeback until pointer release).
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ColumnResizePreview {
    pub column_id: String,
    pub preview_width_px: i32,
}

/// Live progress scrub drag preview (0..=100, zero CRDT writeback until pointer release).
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ProgressScrubPreview {
    pub row_id: String,
    pub column_id: String,
    pub value: i64,
}

/// Active in-place cell editor (Table or Kanban).
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ActiveCellEditor {
    pub row_id: String,
    pub column_id: String,
    pub col_type: String,
    pub draft: String,
    pub error: Option<String>,
    pub select_filter: String,
}

/// Currently open top toolbar dropdown panel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ActiveToolbarPanel {
    Filter,
    Sort,
    GroupBy,
}

/// Transient draft rule inside the Filter panel before clicking Apply.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct FilterDraftState {
    pub column_id: String,
    pub function: String,
    pub value: String,
}

impl Default for FilterDraftState {
    fn default() -> Self {
        Self {
            column_id: String::new(),
            function: "is".to_string(),
            value: String::new(),
        }
    }
}

/// Active Calendar cross-day event reschedule drag preview.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct CalendarDragState {
    pub row_id: String,
    pub origin_day: i64,
    pub target_day: i64,
}

/// All transient authoring UI state for one `affine:database` block.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct DatabaseAuthoringState {
    pub column_menu: Option<ColumnMenuState>,
    pub column_resize: Option<ColumnResizePreview>,
    pub progress_preview: Option<ProgressScrubPreview>,
    pub active_cell: Option<ActiveCellEditor>,
    pub toolbar_panel: Option<ActiveToolbarPanel>,
    pub filter_draft: FilterDraftState,
    pub calendar_drag: Option<CalendarDragState>,
}

impl DatabaseAuthoringState {
    pub fn dismiss_popovers(&mut self) {
        self.column_menu = None;
        self.active_cell = None;
        self.toolbar_panel = None;
    }
}

/// Interactive authoring hit target emitted by Table / Kanban / Calendar renderers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DatabaseAuthoringHitKind {
    AddColumn,
    OpenColumnMenu {
        column_id: String,
    },
    ResizeColumnHandle {
        column_id: String,
        current_width_px: i32,
    },
    ColumnMenuRenameInput,
    ColumnMenuToggleTypeSubmenu,
    ColumnMenuSelectType {
        column_id: String,
        target_type: String,
    },
    ColumnMenuInsertLeft {
        column_id: String,
    },
    ColumnMenuInsertRight {
        column_id: String,
    },
    ColumnMenuDelete {
        column_id: String,
    },
    EditCell {
        row_id: String,
        column_id: String,
        col_type: String,
    },
    SetProgress {
        row_id: String,
        column_id: String,
    },
    SelectToggleOption {
        row_id: String,
        column_id: String,
        option_id: String,
    },
    SelectCreateOption {
        row_id: String,
        column_id: String,
        label: String,
        color: String,
    },
    SelectDeleteOption {
        column_id: String,
        option_id: String,
    },
    ToolbarToggleFilter,
    ToolbarToggleSort,
    ToolbarToggleGroupBy,
    ToolbarRemoveFilter {
        index: usize,
    },
    ToolbarToggleSortDir {
        index: usize,
    },
    ToolbarRemoveSort {
        index: usize,
    },
    ToolbarAddOrFlipSort {
        column_id: String,
    },
    ToolbarSetGroupBy {
        column_id: Option<String>,
    },
    FilterDraftCycleColumn,
    FilterDraftCycleOp,
    FilterDraftApply,
    KanbanAddRowInGroup {
        column_id: String,
        option_value: Option<String>,
    },
    CalendarAddRowOnDay {
        day_index: i64,
    },
    CalendarDragEventStart {
        row_id: String,
        day_index: i64,
    },
    CalendarDayDropTarget {
        day_index: i64,
    },
}

/// One positioned authoring hit target in block-local coordinates.
#[derive(Clone, Debug, PartialEq)]
pub struct DatabaseAuthoringHit {
    pub rect: FlowRect,
    pub kind: DatabaseAuthoringHitKind,
    pub scrolls_x: bool,
}

/// Keyboard input routed to an active database authoring target.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DatabaseAuthoringKey {
    Enter,
    Escape,
    Tab,
    ShiftTab,
    Backspace,
    Text(String),
}

/// Outcome of handling one database authoring event.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AuthoringActionResult {
    pub handled: bool,
    pub doc_mutated: bool,
}

pub(super) fn resolve_active_view<'a>(
    data: &'a DatabaseData,
    flow_state: &DatabaseFlowState,
    block_id: &str,
) -> Option<&'a DatabaseView> {
    let ui_state = flow_state.state_for(block_id);
    ui_state
        .active_view_id
        .as_deref()
        .and_then(|id| data.views.iter().find(|v| v.id == id))
        .or_else(|| data.views.first())
}

/// Paint whichever authoring popover is currently open above all view primitives and return the
/// resulting bottom `y` coordinate so the outer card never clips an open popover.
#[allow(clippy::too_many_arguments)]
pub(super) fn render_active_popover(
    ctx: &DbRenderCtx<'_>,
    content_top: f32,
    content_h: f32,
    popover_anchor: Option<(f32, f32)>,
    prims: &mut Vec<DatabasePrim>,
    authoring_hits: &mut Vec<DatabaseAuthoringHit>,
) -> f32 {
    let mut bottom = content_top + content_h;
    if ctx.mobile_readonly {
        return bottom;
    }
    if let Some(menu) = &ctx.ui_state.authoring.column_menu {
        let (ax, ay) = popover_anchor.unwrap_or((16.0, content_top + 36.0));
        bottom = bottom.max(column_ops::render_column_menu_popover(
            ctx,
            menu,
            ax,
            ay,
            prims,
            authoring_hits,
        ));
    } else if let Some(ed) = &ctx.ui_state.authoring.active_cell
        && matches!(ed.col_type.as_str(), "select" | "multi-select")
    {
        let (ax, ay) = popover_anchor.unwrap_or((16.0, content_top + 70.0));
        bottom = bottom.max(cell_editor::render_select_popover(
            ctx,
            ed,
            ax,
            ay,
            prims,
            authoring_hits,
        ));
    }
    bottom
}

/// Handle a keyboard event while a database column menu, in-place cell editor, or filter panel
/// is open. Supports `Enter` commit, `Escape` cancel, and `Tab` / `Shift+Tab` cell stepping.
#[allow(clippy::too_many_arguments)]
pub fn handle_authoring_key(
    page: &mut PageDocSession,
    flow_state: &mut DatabaseFlowState,
    block_id: &str,
    data: &DatabaseData,
    key: DatabaseAuthoringKey,
    offset_at_ms: &dyn Fn(i64) -> i32,
    now_ms: u64,
) -> DocResult<AuthoringActionResult> {
    if flow_state.mobile_readonly {
        return Ok(AuthoringActionResult {
            handled: false,
            doc_mutated: false,
        });
    }

    if let Some(menu) = flow_state.state_for(block_id).authoring.column_menu {
        match key {
            DatabaseAuthoringKey::Escape => {
                flow_state.authoring_mut(block_id).column_menu = None;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
            DatabaseAuthoringKey::Enter => {
                let trimmed = menu.rename_draft.trim();
                let mutated = if !trimmed.is_empty() {
                    page.rename_database_column(block_id, &menu.column_id, trimmed, now_ms)?
                        .is_some()
                } else {
                    false
                };
                flow_state.authoring_mut(block_id).column_menu = None;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: mutated,
                });
            }
            DatabaseAuthoringKey::Backspace => {
                if let Some(m) = flow_state.authoring_mut(block_id).column_menu.as_mut() {
                    m.rename_draft.pop();
                }
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
            DatabaseAuthoringKey::Text(s) => {
                if let Some(m) = flow_state.authoring_mut(block_id).column_menu.as_mut() {
                    m.rename_draft.push_str(&s);
                }
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
            DatabaseAuthoringKey::Tab | DatabaseAuthoringKey::ShiftTab => {
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
        }
    }

    if let Some(editor) = flow_state.state_for(block_id).authoring.active_cell {
        let is_select = matches!(editor.col_type.as_str(), "select" | "multi-select");
        match key {
            DatabaseAuthoringKey::Escape => {
                flow_state.authoring_mut(block_id).active_cell = None;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
            DatabaseAuthoringKey::Backspace => {
                if let Some(ed) = flow_state.authoring_mut(block_id).active_cell.as_mut() {
                    if is_select {
                        ed.select_filter.pop();
                    } else {
                        ed.draft.pop();
                        ed.error = None;
                    }
                }
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
            DatabaseAuthoringKey::Text(s) => {
                if let Some(ed) = flow_state.authoring_mut(block_id).active_cell.as_mut() {
                    if is_select {
                        ed.select_filter.push_str(&s);
                    } else {
                        ed.draft.push_str(&s);
                        ed.error = None;
                    }
                }
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
            DatabaseAuthoringKey::Enter
            | DatabaseAuthoringKey::Tab
            | DatabaseAuthoringKey::ShiftTab => {
                let forward = key != DatabaseAuthoringKey::ShiftTab;
                let step_after = matches!(
                    key,
                    DatabaseAuthoringKey::Tab | DatabaseAuthoringKey::ShiftTab
                );
                let mut mutated = false;
                if is_select {
                    let query = editor.select_filter.trim();
                    if !query.is_empty() && key == DatabaseAuthoringKey::Enter {
                        let existing_count = data
                            .columns
                            .iter()
                            .find(|c| c.id == editor.column_id)
                            .map_or(0, |c| c.select_options().len());
                        let color = next_tag_color(existing_count).to_string();
                        let hit = DatabaseAuthoringHit {
                            rect: FlowRect::new(0.0, 0.0, 1.0, 1.0),
                            kind: DatabaseAuthoringHitKind::SelectCreateOption {
                                row_id: editor.row_id.clone(),
                                column_id: editor.column_id.clone(),
                                label: query.to_string(),
                                color,
                            },
                            scrolls_x: false,
                        };
                        return handle_authoring_hit(
                            page,
                            flow_state,
                            block_id,
                            data,
                            &hit,
                            0.0,
                            offset_at_ms,
                            now_ms,
                        );
                    }
                } else {
                    match parse_cell_draft(&editor.col_type, &editor.draft, offset_at_ms) {
                        Ok(ParsedCellInput::RowTitle(title)) => {
                            mutated = page
                                .set_database_row_title(block_id, &editor.row_id, &title, now_ms)?
                                .is_some();
                        }
                        Ok(ParsedCellInput::Cell(spec)) => {
                            mutated = page
                                .set_database_cell_value(
                                    block_id,
                                    &editor.row_id,
                                    &editor.column_id,
                                    spec,
                                    now_ms,
                                )?
                                .is_some();
                        }
                        Err(err) => {
                            if let Some(ed) =
                                flow_state.authoring_mut(block_id).active_cell.as_mut()
                            {
                                ed.error = Some(err);
                            }
                            return Ok(AuthoringActionResult {
                                handled: true,
                                doc_mutated: false,
                            });
                        }
                    }
                }

                if step_after {
                    let view = resolve_active_view(data, flow_state, block_id);
                    let filtered_rows: Vec<_> = data
                        .rows
                        .iter()
                        .filter(|r| {
                            view.and_then(|v| v.filter.as_ref())
                                .is_none_or(|f| eval_database_filter(f, data, r))
                        })
                        .cloned()
                        .collect();
                    let ordered_rows = sort_database_rows(
                        &filtered_rows,
                        view.and_then(|v| v.sort.as_ref()),
                        data,
                    );
                    let cols: Vec<(String, String)> = data
                        .columns
                        .iter()
                        .map(|c| (c.id.clone(), c.column_type.clone()))
                        .collect();
                    if let Some((nr, nc, nty)) = next_editable_cell(
                        &ordered_rows,
                        &cols,
                        &editor.row_id,
                        &editor.column_id,
                        forward,
                    ) {
                        let next_draft = ordered_rows
                            .iter()
                            .find(|r| r.row_id == nr)
                            .and_then(|row| {
                                data.columns
                                    .iter()
                                    .find(|c| c.id == nc)
                                    .map(|col| initial_cell_draft(data, row, col, offset_at_ms))
                            })
                            .unwrap_or_default();
                        flow_state.authoring_mut(block_id).active_cell = Some(ActiveCellEditor {
                            row_id: nr,
                            column_id: nc,
                            col_type: nty,
                            draft: next_draft,
                            error: None,
                            select_filter: String::new(),
                        });
                        return Ok(AuthoringActionResult {
                            handled: true,
                            doc_mutated: mutated,
                        });
                    }
                }

                flow_state.authoring_mut(block_id).active_cell = None;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: mutated,
                });
            }
        }
    }

    if flow_state.state_for(block_id).authoring.toolbar_panel == Some(ActiveToolbarPanel::Filter) {
        match key {
            DatabaseAuthoringKey::Escape => {
                flow_state.authoring_mut(block_id).toolbar_panel = None;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
            DatabaseAuthoringKey::Backspace => {
                flow_state.authoring_mut(block_id).filter_draft.value.pop();
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
            DatabaseAuthoringKey::Text(s) => {
                flow_state
                    .authoring_mut(block_id)
                    .filter_draft
                    .value
                    .push_str(&s);
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
            DatabaseAuthoringKey::Enter => {
                let hit = DatabaseAuthoringHit {
                    rect: FlowRect::new(0.0, 0.0, 1.0, 1.0),
                    kind: DatabaseAuthoringHitKind::FilterDraftApply,
                    scrolls_x: false,
                };
                return handle_authoring_hit(
                    page,
                    flow_state,
                    block_id,
                    data,
                    &hit,
                    0.0,
                    offset_at_ms,
                    now_ms,
                );
            }
            DatabaseAuthoringKey::Tab | DatabaseAuthoringKey::ShiftTab => {
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: false,
                });
            }
        }
    }

    Ok(AuthoringActionResult {
        handled: false,
        doc_mutated: false,
    })
}

/// Commit a completed column width resize drag into `view.columns` in one undo step.
pub fn commit_column_resize(
    page: &mut PageDocSession,
    flow_state: &mut DatabaseFlowState,
    block_id: &str,
    data: &DatabaseData,
    column_id: &str,
    width_px: f32,
    now_ms: u64,
) -> DocResult<bool> {
    flow_state.authoring_mut(block_id).column_resize = None;
    let Some(view) = resolve_active_view(data, flow_state, block_id) else {
        return Ok(false);
    };
    let commit = page.set_database_view_column_width(
        block_id,
        &view.id,
        column_id,
        f64::from(width_px),
        now_ms,
    )?;
    Ok(commit.is_some())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use blocksuite_playground_doc::{
        read::BlockContent,
        schema::{
            BlockSpec, DatabaseCellSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec,
            ParagraphType,
        },
        session::PageDocSession,
    };
    use serde_json::json;

    use super::*;
    use crate::database::group_database_rows;

    fn seed_editor_db() -> (PageDocSession, String) {
        let mut page = PageDocSession::new("page-ed-auth", 7).expect("page");
        page.add_block(
            "p1",
            BlockSpec::Page {
                title: "Editor Auth".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("n1", BlockSpec::Note { xywh: None }, Some("p1"), None, 2)
            .unwrap();
        let db_id = "db-1".to_string();
        let mut cells = BTreeMap::new();
        cells.insert(
            "r1".into(),
            BTreeMap::from([
                ("c-status".into(), DatabaseCellSpec::Text("s-todo".into())),
                (
                    "c-tags".into(),
                    DatabaseCellSpec::MultiSelect(vec!["t-ui".into()]),
                ),
                ("c-num".into(), DatabaseCellSpec::Number(100.0)),
                ("c-prog".into(), DatabaseCellSpec::Integer(30)),
                ("c-chk".into(), DatabaseCellSpec::Bool(false)),
                (
                    "c-date".into(),
                    DatabaseCellSpec::Integer(1_773_014_400_000),
                ),
                (
                    "c-url".into(),
                    DatabaseCellSpec::Text("https://affine.pro".into()),
                ),
                ("c-txt".into(), DatabaseCellSpec::RichText("hello".into())),
            ]),
        );
        cells.insert(
            "r2".into(),
            BTreeMap::from([
                ("c-status".into(), DatabaseCellSpec::Text("s-done".into())),
                ("c-num".into(), DatabaseCellSpec::Number(250.0)),
                ("c-prog".into(), DatabaseCellSpec::Integer(90)),
                ("c-chk".into(), DatabaseCellSpec::Bool(true)),
                (
                    "c-date".into(),
                    DatabaseCellSpec::Integer(1_773_100_800_000),
                ),
            ]),
        );
        page.add_block(
            &db_id,
            BlockSpec::Database(DatabaseSpec {
                title: "Sprint".into(),
                columns: vec![
                    DatabaseColumnSpec {
                        id: "title".into(),
                        column_type: "title".into(),
                        name: "Title".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "c-status".into(),
                        column_type: "select".into(),
                        name: "Status".into(),
                        data: json!({
                            "options": [
                                { "id": "s-todo", "value": "Todo", "color": "var(--affine-tag-blue)" },
                                { "id": "s-done", "value": "Done", "color": "var(--affine-tag-green)" }
                            ]
                        }),
                    },
                    DatabaseColumnSpec {
                        id: "c-tags".into(),
                        column_type: "multi-select".into(),
                        name: "Tags".into(),
                        data: json!({
                            "options": [
                                { "id": "t-ui", "value": "UI", "color": "var(--affine-tag-purple)" }
                            ]
                        }),
                    },
                    DatabaseColumnSpec {
                        id: "c-num".into(),
                        column_type: "number".into(),
                        name: "Points".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "c-prog".into(),
                        column_type: "progress".into(),
                        name: "Progress".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "c-chk".into(),
                        column_type: "checkbox".into(),
                        name: "Done".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "c-date".into(),
                        column_type: "date".into(),
                        name: "Due".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "c-url".into(),
                        column_type: "link".into(),
                        name: "URL".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "c-txt".into(),
                        column_type: "rich-text".into(),
                        name: "Notes".into(),
                        data: json!({}),
                    },
                ],
                views: vec![
                    DatabaseViewSpec {
                        id: "v-table".into(),
                        name: "Table".into(),
                        mode: "table".into(),
                        raw: json!({ "columns": [] }),
                    },
                    DatabaseViewSpec {
                        id: "v-cal".into(),
                        name: "Calendar".into(),
                        mode: "calendar".into(),
                        raw: json!({ "date": { "startColumnId": "c-date" } }),
                    },
                ],
                cells,
            }),
            Some("n1"),
            None,
            3,
        )
        .unwrap();
        for (id, text) in [("r1", "Alpha"), ("r2", "Beta")] {
            page.add_block(
                id,
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: text.into(),
                },
                Some(&db_id),
                None,
                4,
            )
            .unwrap();
        }
        (page, db_id)
    }

    fn snap_db(page: &PageDocSession, db_id: &str) -> DatabaseData {
        let snap = page.read_page_snapshot().unwrap();
        let BlockContent::Database(db) = &snap.block(db_id).unwrap().content else {
            panic!("expected database");
        };
        db.clone()
    }

    #[test]
    fn cell_draft_validation_and_formatting_table_driven() {
        let utc = |_: i64| 0_i32;
        let cases: [(&str, &str, bool); 10] = [
            ("number", "$1,250.50", true),
            ("number", "not-a-num", false),
            ("progress", "120", true),
            ("progress", "abc", false),
            ("date", "2026-03-10", true),
            ("date", "2026-13-45", false),
            ("link", "affine.pro/docs", true),
            ("link", "bad url with space", false),
            ("rich-text", "Any text", true),
            ("title", "New Title", true),
        ];
        for (col_type, draft, expected_ok) in cases {
            let res = parse_cell_draft(col_type, draft, &utc);
            assert_eq!(
                res.is_ok(),
                expected_ok,
                "col_type={col_type} draft={draft:?} -> {res:?}"
            );
        }
    }

    #[test]
    fn authoring_controller_end_to_end_cells_tab_filter_sort_group_calendar() {
        let (mut page, db_id) = seed_editor_db();
        let mut flow_state = DatabaseFlowState::default();
        let utc = |_: i64| 0_i32;
        let dummy_rect = FlowRect::new(0.0, 0.0, 100.0, 20.0);

        // 1. In-place Number edit + Tab steps to next editable cell.
        let db = snap_db(&page, &db_id);
        handle_authoring_hit(
            &mut page,
            &mut flow_state,
            &db_id,
            &db,
            &DatabaseAuthoringHit {
                rect: dummy_rect,
                kind: DatabaseAuthoringHitKind::EditCell {
                    row_id: "r1".into(),
                    column_id: "c-num".into(),
                    col_type: "number".into(),
                },
                scrolls_x: true,
            },
            0.0,
            &utc,
            100,
        )
        .unwrap();
        flow_state
            .authoring_mut(&db_id)
            .active_cell
            .as_mut()
            .unwrap()
            .draft = "420".into();
        let tab_res = handle_authoring_key(
            &mut page,
            &mut flow_state,
            &db_id,
            &db,
            DatabaseAuthoringKey::Tab,
            &utc,
            101,
        )
        .unwrap();
        assert!(tab_res.doc_mutated);
        assert_eq!(
            flow_state
                .state_for(&db_id)
                .authoring
                .active_cell
                .as_ref()
                .unwrap()
                .column_id,
            "c-prog"
        );
        assert_eq!(
            snap_db(&page, &db_id).cells[&("r1".into(), "c-num".into())].as_f64(),
            Some(420.0)
        );

        // 2. Progress click sets value proportionally (75px of 100px = 75%).
        let db = snap_db(&page, &db_id);
        handle_authoring_hit(
            &mut page,
            &mut flow_state,
            &db_id,
            &db,
            &DatabaseAuthoringHit {
                rect: dummy_rect,
                kind: DatabaseAuthoringHitKind::SetProgress {
                    row_id: "r1".into(),
                    column_id: "c-prog".into(),
                },
                scrolls_x: true,
            },
            75.0,
            &utc,
            102,
        )
        .unwrap();
        assert_eq!(
            snap_db(&page, &db_id).cells[&("r1".into(), "c-prog".into())].as_i64(),
            Some(75)
        );

        // 3. Multi-select create new option + assign to row.
        let db = snap_db(&page, &db_id);
        handle_authoring_hit(
            &mut page,
            &mut flow_state,
            &db_id,
            &db,
            &DatabaseAuthoringHit {
                rect: dummy_rect,
                kind: DatabaseAuthoringHitKind::SelectCreateOption {
                    row_id: "r1".into(),
                    column_id: "c-tags".into(),
                    label: "Urgent".into(),
                    color: "var(--affine-tag-red)".into(),
                },
                scrolls_x: false,
            },
            0.0,
            &utc,
            103,
        )
        .unwrap();
        assert_eq!(
            snap_db(&page, &db_id).cells[&("r1".into(), "c-tags".into())]
                .as_string_list()
                .len(),
            2
        );

        // 4. Filter (> 300) + Sort (desc) + GroupBy (Status) live evaluation.
        flow_state.authoring_mut(&db_id).filter_draft = FilterDraftState {
            column_id: "c-num".into(),
            function: "greatThan".into(),
            value: "300".into(),
        };
        let db = snap_db(&page, &db_id);
        handle_authoring_hit(
            &mut page,
            &mut flow_state,
            &db_id,
            &db,
            &DatabaseAuthoringHit {
                rect: dummy_rect,
                kind: DatabaseAuthoringHitKind::FilterDraftApply,
                scrolls_x: false,
            },
            0.0,
            &utc,
            110,
        )
        .unwrap();
        let db = snap_db(&page, &db_id);
        handle_authoring_hit(
            &mut page,
            &mut flow_state,
            &db_id,
            &db,
            &DatabaseAuthoringHit {
                rect: dummy_rect,
                kind: DatabaseAuthoringHitKind::ToolbarSetGroupBy {
                    column_id: Some("c-status".into()),
                },
                scrolls_x: false,
            },
            0.0,
            &utc,
            111,
        )
        .unwrap();
        let db = snap_db(&page, &db_id);
        let filtered: Vec<_> = db
            .rows
            .iter()
            .filter(|r| {
                db.views[0]
                    .filter
                    .as_ref()
                    .is_none_or(|f| eval_database_filter(f, &db, r))
            })
            .cloned()
            .collect();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].row_id, "r1");
        let buckets = group_database_rows(
            &filtered,
            db.views[0].group_by.as_ref().unwrap(),
            &[],
            &db,
            0,
            &utc,
        );
        assert!(
            buckets
                .iter()
                .any(|b| b.key == "s-todo" && b.rows.len() == 1)
        );

        // 5. Calendar create row on day + reschedule drag.
        flow_state.set_active_view(&db_id, "v-cal");
        let db = snap_db(&page, &db_id);
        let target_day = 20525_i64; // 2026-03-13
        handle_authoring_hit(
            &mut page,
            &mut flow_state,
            &db_id,
            &db,
            &DatabaseAuthoringHit {
                rect: dummy_rect,
                kind: DatabaseAuthoringHitKind::CalendarAddRowOnDay {
                    day_index: target_day,
                },
                scrolls_x: false,
            },
            0.0,
            &utc,
            120,
        )
        .unwrap();
        let db_after_add = snap_db(&page, &db_id);
        assert_eq!(db_after_add.rows.len(), 3);
        let added_id = db_after_add.rows.last().unwrap().row_id.clone();
        assert_eq!(
            db_after_add.cells[&(added_id.clone(), "c-date".into())].as_i64(),
            Some(target_day * 86_400_000)
        );

        // Drag added event to target_day + 2.
        handle_authoring_hit(
            &mut page,
            &mut flow_state,
            &db_id,
            &db_after_add,
            &DatabaseAuthoringHit {
                rect: dummy_rect,
                kind: DatabaseAuthoringHitKind::CalendarDragEventStart {
                    row_id: added_id.clone(),
                    day_index: target_day,
                },
                scrolls_x: false,
            },
            0.0,
            &utc,
            121,
        )
        .unwrap();
        handle_authoring_hit(
            &mut page,
            &mut flow_state,
            &db_id,
            &db_after_add,
            &DatabaseAuthoringHit {
                rect: dummy_rect,
                kind: DatabaseAuthoringHitKind::CalendarDayDropTarget {
                    day_index: target_day + 2,
                },
                scrolls_x: false,
            },
            0.0,
            &utc,
            122,
        )
        .unwrap();
        assert_eq!(
            snap_db(&page, &db_id).cells[&(added_id, "c-date".into())].as_i64(),
            Some((target_day + 2) * 86_400_000)
        );
    }

    #[test]
    fn add_column_after_reload_never_collides_with_existing_ids() {
        let (mut page, db_id) = seed_editor_db();
        // Seed persisted columns "col-1" and "col-8-1" (matching client_id=8, seq=1) before reload.
        for (cid, cname) in [
            ("col-1", "Persisted Col 1"),
            ("col-8-1", "Persisted Col 8-1"),
        ] {
            page.add_database_column(
                &db_id,
                Some("v-table"),
                blocksuite_playground_doc::schema::DatabaseColumnSpec {
                    id: cid.into(),
                    column_type: "number".into(),
                    name: cname.into(),
                    data: serde_json::json!({}),
                },
                None,
                200,
            )
            .unwrap();
        }
        let saved = page.encode_update_v1().unwrap();

        let mut reloaded = PageDocSession::new("reloaded-db", 8).unwrap();
        reloaded.apply_remote_update_v1(&saved).unwrap();
        let mut fresh_ui = DatabaseFlowState::default();
        let utc = |_: i64| 0;
        let dummy = FlowRect::new(0.0, 0.0, 40.0, 24.0);

        let db_before = snap_db(&reloaded, &db_id);
        let col_count_before = db_before.columns.len();
        handle_authoring_hit(
            &mut reloaded,
            &mut fresh_ui,
            &db_id,
            &db_before,
            &DatabaseAuthoringHit {
                rect: dummy,
                kind: DatabaseAuthoringHitKind::AddColumn,
                scrolls_x: false,
            },
            0.0,
            &utc,
            201,
        )
        .unwrap();

        let db_after = snap_db(&reloaded, &db_id);
        assert_eq!(db_after.columns.len(), col_count_before + 1);
        for (cid, cname) in [
            ("col-1", "Persisted Col 1"),
            ("col-8-1", "Persisted Col 8-1"),
        ] {
            let persisted = db_after
                .columns
                .iter()
                .find(|c| c.id == cid)
                .expect("existing persisted column must remain intact");
            assert_eq!(persisted.name, cname);
            assert_eq!(persisted.column_type, "number");
        }
        let added = db_after.columns.last().unwrap();
        assert_ne!(added.id, "col-1");
        assert_ne!(added.id, "col-8-1");

        // Reload again into a fresh session and add another column.
        let saved2 = reloaded.encode_update_v1().unwrap();
        let mut reloaded2 = PageDocSession::new("reloaded-db-2", 9).unwrap();
        reloaded2.apply_remote_update_v1(&saved2).unwrap();
        let mut fresh_ui2 = DatabaseFlowState::default();
        let db2_before = snap_db(&reloaded2, &db_id);
        handle_authoring_hit(
            &mut reloaded2,
            &mut fresh_ui2,
            &db_id,
            &db2_before,
            &DatabaseAuthoringHit {
                rect: dummy,
                kind: DatabaseAuthoringHitKind::AddColumn,
                scrolls_x: false,
            },
            0.0,
            &utc,
            202,
        )
        .unwrap();
        let db2_after = snap_db(&reloaded2, &db_id);
        assert_eq!(db2_after.columns.len(), col_count_before + 2);
        let added2 = db2_after.columns.last().unwrap();
        assert_ne!(added2.id, "col-1");
        assert_ne!(added2.id, "col-8-1");
        assert_ne!(added2.id, added.id);
    }
}
