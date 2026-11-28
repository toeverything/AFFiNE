//! Pointer-hit dispatcher for `affine:database` authoring interactions.

use blocksuite_playground_doc::{
    DocResult,
    read::{DatabaseCellValue, DatabaseData},
    schema::DatabaseCellSpec,
    session::PageDocSession,
};

use super::{
    DatabaseFlowState,
    authoring::{
        ActiveCellEditor, ActiveToolbarPanel, AuthoringActionResult, CalendarDragState,
        ColumnMenuState, DatabaseAuthoringHit, DatabaseAuthoringHitKind, resolve_active_view,
    },
    calendar_edit::{create_calendar_row_on_day, reschedule_calendar_row_to_day},
    cell_editor::{initial_cell_draft, is_editable_column_type, progress_from_bar_x},
    column_ops::{insert_column_relative, make_new_column_spec},
    filter_sort_bar::{
        FILTER_OPERATORS, FilterRuleItem, SortRuleItem, build_filter_json,
        build_group_by_for_column, build_sort_json, parse_filter_rules, parse_sort_rules,
    },
};

/// Generate a collision-free identifier scoped to `page.client_id()` and verified against all
/// existing column, option, view, and row identifiers in `data` (plus page blocks for `"row"`).
fn fresh_database_id(page: &PageDocSession, data: &DatabaseData, prefix: &str) -> String {
    let mut used: std::collections::HashSet<String> = std::collections::HashSet::new();
    for col in &data.columns {
        used.insert(col.id.clone());
        if let Some(opts) = col.data.get("options").and_then(|v| v.as_array()) {
            for opt in opts {
                if let Some(id) = opt.get("id").and_then(|v| v.as_str()) {
                    used.insert(id.to_string());
                }
            }
        }
    }
    for view in &data.views {
        used.insert(view.id.clone());
    }
    for row in &data.rows {
        used.insert(row.row_id.clone());
    }
    let snap = if prefix == "row" {
        page.read_page_snapshot().ok()
    } else {
        None
    };
    let client_id = page.client_id();
    let mut seq = page.revision().saturating_add(1);
    loop {
        let candidate = format!("{prefix}-{client_id:x}-{seq:x}");
        let exists_in_page = snap.as_ref().is_some_and(|s| s.block(&candidate).is_some());
        if !used.contains(&candidate) && !exists_in_page {
            return candidate;
        }
        seq = seq.wrapping_add(1);
    }
}

/// Dispatch a click on one [`DatabaseAuthoringHit`] and commit any resulting CRDT mutation.
#[allow(clippy::too_many_arguments)]
pub fn handle_authoring_hit(
    page: &mut PageDocSession,
    flow_state: &mut DatabaseFlowState,
    block_id: &str,
    data: &DatabaseData,
    hit: &DatabaseAuthoringHit,
    click_x: f32,
    offset_at_ms: &dyn Fn(i64) -> i32,
    now_ms: u64,
) -> DocResult<AuthoringActionResult> {
    if flow_state.mobile_readonly {
        return Ok(AuthoringActionResult {
            handled: false,
            doc_mutated: false,
        });
    }
    let Some(view) = resolve_active_view(data, flow_state, block_id).cloned() else {
        return Ok(AuthoringActionResult {
            handled: false,
            doc_mutated: false,
        });
    };

    match &hit.kind {
        DatabaseAuthoringHitKind::AddColumn => {
            let col_id = fresh_database_id(page, data, "col");
            let name = format!("Column {}", data.columns.len() + 1);
            let spec = make_new_column_spec(col_id, name, "rich-text");
            let commit = page.add_database_column(block_id, Some(&view.id), spec, None, now_ms)?;
            flow_state.authoring_mut(block_id).dismiss_popovers();
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::OpenColumnMenu { column_id } => {
            let col_name = data
                .columns
                .iter()
                .find(|c| c.id == *column_id)
                .map(|c| c.name.clone())
                .unwrap_or_else(|| "Title".to_string());
            let auth = flow_state.authoring_mut(block_id);
            if auth
                .column_menu
                .as_ref()
                .is_some_and(|m| m.column_id == *column_id)
            {
                auth.column_menu = None;
            } else {
                auth.dismiss_popovers();
                auth.column_menu = Some(ColumnMenuState {
                    column_id: column_id.clone(),
                    rename_draft: col_name,
                    type_submenu_open: false,
                });
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::ColumnMenuToggleTypeSubmenu => {
            if let Some(menu) = flow_state.authoring_mut(block_id).column_menu.as_mut() {
                menu.type_submenu_open = !menu.type_submenu_open;
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::ColumnMenuSelectType {
            column_id,
            target_type,
        } => {
            let commit =
                page.change_database_column_type(block_id, column_id, target_type, now_ms)?;
            flow_state.authoring_mut(block_id).column_menu = None;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::ColumnMenuInsertLeft { column_id } => {
            let new_id = fresh_database_id(page, data, "col");
            let name = format!("Column {}", data.columns.len() + 1);
            let mutated = insert_column_relative(
                page,
                block_id,
                &view.id,
                &data.columns,
                column_id,
                false,
                new_id,
                name,
                "rich-text",
                now_ms,
            )?;
            flow_state.authoring_mut(block_id).column_menu = None;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: mutated,
            })
        }
        DatabaseAuthoringHitKind::ColumnMenuInsertRight { column_id } => {
            let new_id = fresh_database_id(page, data, "col");
            let name = format!("Column {}", data.columns.len() + 1);
            let mutated = insert_column_relative(
                page,
                block_id,
                &view.id,
                &data.columns,
                column_id,
                true,
                new_id,
                name,
                "rich-text",
                now_ms,
            )?;
            flow_state.authoring_mut(block_id).column_menu = None;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: mutated,
            })
        }
        DatabaseAuthoringHitKind::ColumnMenuDelete { column_id } => {
            let commit = page.delete_database_column(block_id, column_id, now_ms)?;
            flow_state.authoring_mut(block_id).column_menu = None;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::EditCell {
            row_id,
            column_id,
            col_type,
        } => {
            if !is_editable_column_type(col_type) {
                return Ok(AuthoringActionResult {
                    handled: false,
                    doc_mutated: false,
                });
            }
            if col_type == "checkbox" {
                let current = data
                    .cells
                    .get(&(row_id.clone(), column_id.clone()))
                    .and_then(DatabaseCellValue::as_bool)
                    .unwrap_or(false);
                let commit =
                    page.set_database_cell_bool(block_id, row_id, column_id, !current, now_ms)?;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: commit.is_some(),
                });
            }
            let draft = data
                .rows
                .iter()
                .find(|r| r.row_id == *row_id)
                .and_then(|row| {
                    data.columns
                        .iter()
                        .find(|c| c.id == *column_id)
                        .map(|col| initial_cell_draft(data, row, col, offset_at_ms))
                })
                .unwrap_or_default();
            let auth = flow_state.authoring_mut(block_id);
            auth.dismiss_popovers();
            auth.active_cell = Some(ActiveCellEditor {
                row_id: row_id.clone(),
                column_id: column_id.clone(),
                col_type: col_type.clone(),
                draft,
                error: None,
                select_filter: String::new(),
            });
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::SetProgress { row_id, column_id } => {
            let value = progress_from_bar_x(click_x, hit.rect.x, hit.rect.w);
            let commit = page.set_database_cell_value(
                block_id,
                row_id,
                column_id,
                DatabaseCellSpec::Integer(value),
                now_ms,
            )?;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::SelectToggleOption {
            row_id,
            column_id,
            option_id,
        } => {
            let is_multi = data
                .columns
                .iter()
                .find(|c| c.id == *column_id)
                .is_some_and(|c| c.column_type == "multi-select");
            let current = data
                .cells
                .get(&(row_id.clone(), column_id.clone()))
                .map(DatabaseCellValue::as_string_list)
                .unwrap_or_default();
            let next_spec = if is_multi {
                let mut list = current;
                if let Some(pos) = list.iter().position(|id| id == option_id) {
                    list.remove(pos);
                } else {
                    list.push(option_id.clone());
                }
                DatabaseCellSpec::MultiSelect(list)
            } else if current.first().is_some_and(|id| id == option_id) {
                DatabaseCellSpec::Null
            } else {
                DatabaseCellSpec::Text(option_id.clone())
            };
            let commit =
                page.set_database_cell_value(block_id, row_id, column_id, next_spec, now_ms)?;
            if !is_multi {
                flow_state.authoring_mut(block_id).active_cell = None;
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::SelectCreateOption {
            row_id,
            column_id,
            label,
            color,
        } => {
            let opt_id = fresh_database_id(page, data, "opt");
            let is_multi = data
                .columns
                .iter()
                .find(|c| c.id == *column_id)
                .is_some_and(|c| c.column_type == "multi-select");
            let next_spec = if is_multi {
                let mut list = data
                    .cells
                    .get(&(row_id.clone(), column_id.clone()))
                    .map(DatabaseCellValue::as_string_list)
                    .unwrap_or_default();
                list.push(opt_id.clone());
                DatabaseCellSpec::MultiSelect(list)
            } else {
                DatabaseCellSpec::Text(opt_id.clone())
            };
            let commit = page.upsert_database_select_option_and_set_cell(
                block_id, column_id, &opt_id, label, color, row_id, next_spec, now_ms,
            )?;
            let auth = flow_state.authoring_mut(block_id);
            if is_multi {
                if let Some(ed) = auth.active_cell.as_mut() {
                    ed.select_filter.clear();
                }
            } else {
                auth.active_cell = None;
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::SelectDeleteOption {
            column_id,
            option_id,
        } => {
            let commit =
                page.delete_database_select_option(block_id, column_id, option_id, now_ms)?;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::ToolbarToggleFilter => {
            let first_col = data
                .columns
                .first()
                .map(|c| c.id.clone())
                .unwrap_or_else(|| "title".to_string());
            let auth = flow_state.authoring_mut(block_id);
            if auth.toolbar_panel == Some(ActiveToolbarPanel::Filter) {
                auth.toolbar_panel = None;
            } else {
                auth.dismiss_popovers();
                auth.toolbar_panel = Some(ActiveToolbarPanel::Filter);
                if auth.filter_draft.column_id.is_empty() {
                    auth.filter_draft.column_id = first_col;
                }
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::ToolbarToggleSort => {
            let auth = flow_state.authoring_mut(block_id);
            if auth.toolbar_panel == Some(ActiveToolbarPanel::Sort) {
                auth.toolbar_panel = None;
            } else {
                auth.dismiss_popovers();
                auth.toolbar_panel = Some(ActiveToolbarPanel::Sort);
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::ToolbarToggleGroupBy => {
            let auth = flow_state.authoring_mut(block_id);
            if auth.toolbar_panel == Some(ActiveToolbarPanel::GroupBy) {
                auth.toolbar_panel = None;
            } else {
                auth.dismiss_popovers();
                auth.toolbar_panel = Some(ActiveToolbarPanel::GroupBy);
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::FilterDraftCycleColumn => {
            if !data.columns.is_empty() {
                let auth = flow_state.authoring_mut(block_id);
                let cur = data
                    .columns
                    .iter()
                    .position(|c| c.id == auth.filter_draft.column_id)
                    .unwrap_or(0);
                let next = (cur + 1) % data.columns.len();
                auth.filter_draft.column_id = data.columns[next].id.clone();
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::FilterDraftCycleOp => {
            let auth = flow_state.authoring_mut(block_id);
            let cur = FILTER_OPERATORS
                .iter()
                .position(|(id, _)| *id == auth.filter_draft.function)
                .unwrap_or(0);
            let next = (cur + 1) % FILTER_OPERATORS.len();
            auth.filter_draft.function = FILTER_OPERATORS[next].0.to_string();
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::FilterDraftApply => {
            let draft = flow_state.authoring_mut(block_id).filter_draft.clone();
            let col_id = if draft.column_id.is_empty() {
                data.columns
                    .first()
                    .map(|c| c.id.clone())
                    .unwrap_or_else(|| "title".to_string())
            } else {
                draft.column_id
            };
            let mut rules = parse_filter_rules(view.filter.as_ref());
            rules.push(FilterRuleItem {
                column_id: col_id,
                function: draft.function,
                value: draft.value,
            });
            let json = build_filter_json(&rules, &data.columns);
            let commit = page.set_database_view_filter(block_id, &view.id, Some(json), now_ms)?;
            let auth = flow_state.authoring_mut(block_id);
            auth.filter_draft.value.clear();
            auth.toolbar_panel = None;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::ToolbarRemoveFilter { index } => {
            let mut rules = parse_filter_rules(view.filter.as_ref());
            if *index < rules.len() {
                rules.remove(*index);
                let json = build_filter_json(&rules, &data.columns);
                let commit =
                    page.set_database_view_filter(block_id, &view.id, Some(json), now_ms)?;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: commit.is_some(),
                });
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::ToolbarAddOrFlipSort { column_id } => {
            let mut rules = parse_sort_rules(view.sort.as_ref());
            if let Some(existing) = rules.iter_mut().find(|r| r.column_id == *column_id) {
                existing.desc = !existing.desc;
            } else {
                rules.push(SortRuleItem {
                    column_id: column_id.clone(),
                    desc: false,
                });
            }
            let json = build_sort_json(&rules);
            let commit = page.set_database_view_sort(block_id, &view.id, Some(json), now_ms)?;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::ToolbarToggleSortDir { index } => {
            let mut rules = parse_sort_rules(view.sort.as_ref());
            if let Some(rule) = rules.get_mut(*index) {
                rule.desc = !rule.desc;
                let json = build_sort_json(&rules);
                let commit = page.set_database_view_sort(block_id, &view.id, Some(json), now_ms)?;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: commit.is_some(),
                });
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::ToolbarRemoveSort { index } => {
            let mut rules = parse_sort_rules(view.sort.as_ref());
            if *index < rules.len() {
                rules.remove(*index);
                let json = build_sort_json(&rules);
                let commit = page.set_database_view_sort(block_id, &view.id, Some(json), now_ms)?;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: commit.is_some(),
                });
            }
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::ToolbarSetGroupBy { column_id } => {
            let group_by = column_id.as_deref().and_then(|cid| {
                data.columns
                    .iter()
                    .find(|c| c.id == cid)
                    .map(build_group_by_for_column)
            });
            let commit = page.set_database_view_group_by(block_id, &view.id, group_by, now_ms)?;
            flow_state.authoring_mut(block_id).toolbar_panel = None;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::KanbanAddRowInGroup {
            column_id,
            option_value,
        } => {
            let row_id = fresh_database_id(page, data, "row");
            let mut initial = Vec::new();
            if let Some(opt_val) = option_value {
                let col_type = data
                    .columns
                    .iter()
                    .find(|c| c.id == *column_id)
                    .map_or("select", |c| c.column_type.as_str());
                let spec = if col_type == "multi-select" {
                    DatabaseCellSpec::MultiSelect(vec![opt_val.clone()])
                } else {
                    DatabaseCellSpec::Text(opt_val.clone())
                };
                initial.push((column_id.clone(), spec));
            }
            let commit =
                page.add_database_row_with_cells(block_id, &row_id, "New Task", initial, now_ms)?;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: commit.is_some(),
            })
        }
        DatabaseAuthoringHitKind::CalendarAddRowOnDay { day_index } => {
            let row_id = fresh_database_id(page, data, "row");
            let mutated = create_calendar_row_on_day(
                page,
                block_id,
                &view,
                data,
                &row_id,
                "New Event",
                *day_index,
                offset_at_ms,
                now_ms,
            )?;
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: mutated,
            })
        }
        DatabaseAuthoringHitKind::CalendarDragEventStart { row_id, day_index } => {
            flow_state.authoring_mut(block_id).calendar_drag = Some(CalendarDragState {
                row_id: row_id.clone(),
                origin_day: *day_index,
                target_day: *day_index,
            });
            Ok(AuthoringActionResult {
                handled: true,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::CalendarDayDropTarget { day_index } => {
            let drag = flow_state.authoring_mut(block_id).calendar_drag.take();
            if let Some(drag) = drag {
                let mutated = reschedule_calendar_row_to_day(
                    page,
                    block_id,
                    &view,
                    data,
                    &drag.row_id,
                    *day_index,
                    offset_at_ms,
                    now_ms,
                )?;
                return Ok(AuthoringActionResult {
                    handled: true,
                    doc_mutated: mutated,
                });
            }
            Ok(AuthoringActionResult {
                handled: false,
                doc_mutated: false,
            })
        }
        DatabaseAuthoringHitKind::ColumnMenuRenameInput
        | DatabaseAuthoringHitKind::ResizeColumnHandle { .. } => Ok(AuthoringActionResult {
            handled: true,
            doc_mutated: false,
        }),
    }
}
