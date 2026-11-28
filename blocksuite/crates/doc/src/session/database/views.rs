//! View configuration CRDT operations for `affine:database`:
//! column width resize, column reorder, filter, sort, and group-by persistence.

use serde_json::{Map as JsonMap, Value as JsonValue, json};
use y_octo::{Any, SessionReadValue, SessionValue, TypePath, TypeTarget};

use crate::{
    DocError, DocResult,
    read::{BlockContent, DatabaseGroupBy, DatabaseViewColumn},
    schema::json_to_session_value,
};

use super::{PageCommit, PageDocSession, any_to_session_value, ensure_database_block_exists};

const MIN_VIEW_COLUMN_WIDTH: f64 = 65.0;

fn find_view_target_in_tx(
    page: &mut PageDocSession,
    block_id: &str,
    view_id: &str,
) -> DocResult<Option<TypeTarget>> {
    let views_target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key("prop:views"));
    let views = page.inner().read_array(&views_target)?;
    for (idx, item) in views.into_iter().enumerate() {
        match item {
            SessionReadValue::Map(map_id) => {
                let target = TypeTarget::Identity(map_id);
                if matches!(
                    page.inner().get_map_value(&target, "id")?,
                    Some(SessionReadValue::Any(Any::String(ref id))) if id == view_id
                ) {
                    return Ok(Some(target));
                }
            }
            SessionReadValue::Any(Any::Object(obj)) => {
                if matches!(obj.get("id"), Some(Any::String(id)) if id == view_id) {
                    // Upgrade legacy atomic Any::Object view to a shared Y.Map.
                    let upgraded = SessionValue::Map(
                        obj.into_iter()
                            .map(|(k, v)| (k, any_to_session_value(v)))
                            .collect(),
                    );
                    page.inner_mut()
                        .array_remove(&views_target, idx as u64, 1)?;
                    page.inner_mut()
                        .array_insert(&views_target, idx as u64, vec![upgraded])?;
                    let refreshed = page.inner().read_array(&views_target)?;
                    if let Some(SessionReadValue::Map(new_id)) = refreshed.into_iter().nth(idx) {
                        return Ok(Some(TypeTarget::Identity(new_id)));
                    }
                }
            }
            _ => {}
        }
    }
    Ok(None)
}

fn view_column_to_session_value(col: &DatabaseViewColumn) -> SessionValue {
    let mut entries = vec![(
        "id".to_string(),
        SessionValue::Any(Any::String(col.id.clone())),
    )];
    if let Some(w) = col.width {
        entries.push((
            "width".to_string(),
            SessionValue::Any(Any::Float64(w.into())),
        ));
    }
    if let Some(hide) = col.hide {
        entries.push((
            "hide".to_string(),
            SessionValue::Any(if hide { Any::True } else { Any::False }),
        ));
    }
    if let Some(calc) = &col.stat_calc_type {
        entries.push((
            "statCalcType".to_string(),
            SessionValue::Any(Any::String(calc.clone())),
        ));
    }
    SessionValue::Map(entries)
}

fn group_by_to_json(group_by: &DatabaseGroupBy) -> JsonValue {
    let mut obj = JsonMap::new();
    obj.insert(
        "type".to_string(),
        JsonValue::String(if group_by.kind.is_empty() {
            "groupBy".to_string()
        } else {
            group_by.kind.clone()
        }),
    );
    obj.insert(
        "columnId".to_string(),
        JsonValue::String(group_by.column_id.clone()),
    );
    obj.insert("name".to_string(), JsonValue::String(group_by.name.clone()));
    if let Some(sort) = &group_by.sort {
        obj.insert("sort".to_string(), JsonValue::String(sort.clone()));
    }
    if let Some(hide_empty) = group_by.hide_empty {
        obj.insert("hideEmpty".to_string(), JsonValue::Bool(hide_empty));
    }
    JsonValue::Object(obj)
}

impl PageDocSession {
    /// Persist one column's width (`>= 65.0`) into `prop:views[view_id].columns` in one tracked
    /// undo step.
    pub fn set_database_view_column_width(
        &mut self,
        block_id: &str,
        view_id: &str,
        column_id: &str,
        width: f64,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let clamped_w = if width.is_finite() {
            width.max(MIN_VIEW_COLUMN_WIDTH).round()
        } else {
            180.0
        };
        let block_id = block_id.to_string();
        let view_id = view_id.to_string();
        let column_id = column_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let Some(view_target) = find_view_target_in_tx(page, &block_id, &view_id)? else {
                return Ok(());
            };
            match page.inner().get_map_value(&view_target, "columns")? {
                Some(SessionReadValue::Array(arr_id)) => {
                    let arr_target = TypeTarget::Identity(arr_id);
                    let items = page.inner().read_array(&arr_target)?;
                    for (idx, item) in items.into_iter().enumerate() {
                        match item {
                            SessionReadValue::Map(col_map_id) => {
                                let col_target = TypeTarget::Identity(col_map_id);
                                if matches!(
                                    page.inner().get_map_value(&col_target, "id")?,
                                    Some(SessionReadValue::Any(Any::String(ref id))) if id == &column_id
                                ) {
                                    page.inner_mut().map_set(
                                        &col_target,
                                        "width".to_string(),
                                        SessionValue::Any(Any::Float64(clamped_w.into())),
                                    )?;
                                    return Ok(());
                                }
                            }
                            SessionReadValue::Any(Any::Object(mut obj)) => {
                                if matches!(obj.get("id"), Some(Any::String(id)) if id == &column_id)
                                {
                                    obj.insert("width".to_string(), Any::Float64(clamped_w.into()));
                                    let upgraded = SessionValue::Map(
                                        obj.into_iter()
                                            .map(|(k, v)| (k, any_to_session_value(v)))
                                            .collect(),
                                    );
                                    page.inner_mut()
                                        .array_remove(&arr_target, idx as u64, 1)?;
                                    page.inner_mut().array_insert(
                                        &arr_target,
                                        idx as u64,
                                        vec![upgraded],
                                    )?;
                                    return Ok(());
                                }
                            }
                            _ => {}
                        }
                    }
                    page.inner_mut().array_push(
                        &arr_target,
                        vec![SessionValue::Map(vec![
                            (
                                "id".to_string(),
                                SessionValue::Any(Any::String(column_id)),
                            ),
                            (
                                "width".to_string(),
                                SessionValue::Any(Any::Float64(clamped_w.into())),
                            ),
                        ])],
                    )?;
                }
                _ => {
                    page.inner_mut().map_set(
                        &view_target,
                        "columns".to_string(),
                        SessionValue::Array(vec![SessionValue::Map(vec![
                            (
                                "id".to_string(),
                                SessionValue::Any(Any::String(column_id)),
                            ),
                            (
                                "width".to_string(),
                                SessionValue::Any(Any::Float64(clamped_w.into())),
                            ),
                        ])]),
                    )?;
                }
            }
            Ok(())
        })
    }

    /// Reorder one column inside `prop:views[view_id].columns` to `to_index` in one tracked undo
    /// step. Any schema columns not yet listed in `view.columns` are materialized in their current
    /// display order first so reordering is deterministic.
    pub fn reorder_database_view_column(
        &mut self,
        block_id: &str,
        view_id: &str,
        column_id: &str,
        to_index: usize,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let snap = self.read_page_snapshot()?;
        let Some(BlockContent::Database(db)) = snap.block(block_id).map(|b| &b.content) else {
            return Err(DocError::BlockNotFound(block_id.to_string()));
        };
        let Some(view) = db.views.iter().find(|v| v.id == view_id) else {
            return Ok(None);
        };

        // Materialize complete column list in current display order.
        let mut ordered: Vec<DatabaseViewColumn> = view.columns.clone();
        for schema_col in &db.columns {
            if !ordered.iter().any(|c| c.id == schema_col.id) {
                ordered.push(DatabaseViewColumn {
                    id: schema_col.id.clone(),
                    width: Some(if schema_col.column_type == "title" {
                        220.0
                    } else {
                        180.0
                    }),
                    hide: None,
                    stat_calc_type: None,
                });
            }
        }
        let Some(from_idx) = ordered.iter().position(|c| c.id == column_id) else {
            return Ok(None);
        };
        let target_idx = to_index.min(ordered.len().saturating_sub(1));
        if from_idx == target_idx {
            return Ok(None);
        }
        let moved = ordered.remove(from_idx);
        ordered.insert(target_idx, moved);

        let serialized: Vec<SessionValue> =
            ordered.iter().map(view_column_to_session_value).collect();
        let block_id = block_id.to_string();
        let view_id = view_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let Some(view_target) = find_view_target_in_tx(page, &block_id, &view_id)? else {
                return Ok(());
            };
            page.inner_mut().map_set(
                &view_target,
                "columns".to_string(),
                SessionValue::Array(serialized),
            )?;
            Ok(())
        })
    }

    /// Persist `filter` (`FilterGroup` JSON, or `None` to clear) on `prop:views[view_id]` in one
    /// tracked undo step.
    pub fn set_database_view_filter(
        &mut self,
        block_id: &str,
        view_id: &str,
        filter: Option<JsonValue>,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let block_id = block_id.to_string();
        let view_id = view_id.to_string();
        let wire_filter = filter.unwrap_or_else(|| {
            json!({
                "type": "group",
                "op": "and",
                "conditions": []
            })
        });
        self.structural_edit(now_ms, move |page| {
            let Some(view_target) = find_view_target_in_tx(page, &block_id, &view_id)? else {
                return Ok(());
            };
            page.inner_mut().map_set(
                &view_target,
                "filter".to_string(),
                json_to_session_value(&wire_filter),
            )?;
            Ok(())
        })
    }

    /// Persist `sort` (`{ sortBy: [...] }` JSON, or `None` to clear) on `prop:views[view_id]` in
    /// one tracked undo step.
    pub fn set_database_view_sort(
        &mut self,
        block_id: &str,
        view_id: &str,
        sort: Option<JsonValue>,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let block_id = block_id.to_string();
        let view_id = view_id.to_string();
        let wire_sort = sort.unwrap_or_else(|| json!({ "sortBy": [] }));
        self.structural_edit(now_ms, move |page| {
            let Some(view_target) = find_view_target_in_tx(page, &block_id, &view_id)? else {
                return Ok(());
            };
            page.inner_mut().map_set(
                &view_target,
                "sort".to_string(),
                json_to_session_value(&wire_sort),
            )?;
            Ok(())
        })
    }

    /// Persist `groupBy` (`Some(DatabaseGroupBy)` or `None` to clear) on `prop:views[view_id]` in
    /// one tracked undo step.
    pub fn set_database_view_group_by(
        &mut self,
        block_id: &str,
        view_id: &str,
        group_by: Option<DatabaseGroupBy>,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let block_id = block_id.to_string();
        let view_id = view_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let Some(view_target) = find_view_target_in_tx(page, &block_id, &view_id)? else {
                return Ok(());
            };
            match group_by {
                Some(ref gb) => {
                    let val = json_to_session_value(&group_by_to_json(gb));
                    page.inner_mut()
                        .map_set(&view_target, "groupBy".to_string(), val)?;
                }
                None => {
                    if page
                        .inner()
                        .get_map_value(&view_target, "groupBy")?
                        .is_some()
                    {
                        page.inner_mut().map_remove(&view_target, "groupBy")?;
                    }
                }
            }
            Ok(())
        })
    }
}
