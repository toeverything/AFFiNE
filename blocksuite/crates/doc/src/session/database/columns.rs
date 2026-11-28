//! Column schema lifecycle CRDT operations for `affine:database`:
//! add / insert left / insert right, rename, type conversion with safe cell value coercion,
//! delete, and select/multi-select option CRUD.

use std::collections::BTreeMap;

use serde_json::{Map as JsonMap, Value as JsonValue, json};
use y_octo::{Any, SessionReadValue, SessionValue, TypePath, TypeTarget};

use crate::{
    DocError, DocResult,
    read::{BlockContent, DatabaseCellValue, DatabaseColumn},
    schema::{DatabaseCellSpec, DatabaseColumnSpec, json_to_session_value},
};

use super::{
    PageCommit, PageDocSession, any_to_session_value, ensure_database_block_exists,
    write_cell_in_tx,
};

const DEFAULT_TAG_COLORS: [&str; 9] = [
    "var(--affine-tag-blue)",
    "var(--affine-tag-green)",
    "var(--affine-tag-purple)",
    "var(--affine-tag-orange)",
    "var(--affine-tag-teal)",
    "var(--affine-tag-pink)",
    "var(--affine-tag-yellow)",
    "var(--affine-tag-red)",
    "var(--affine-tag-gray)",
];

fn column_spec_to_session_value(col: &DatabaseColumnSpec) -> SessionValue {
    SessionValue::Map(vec![
        (
            "id".to_string(),
            SessionValue::Any(Any::String(col.id.clone())),
        ),
        (
            "type".to_string(),
            SessionValue::Any(Any::String(col.column_type.clone())),
        ),
        (
            "name".to_string(),
            SessionValue::Any(Any::String(col.name.clone())),
        ),
        ("data".to_string(), json_to_session_value(&col.data)),
    ])
}

fn find_column_index_in_tx(
    page: &PageDocSession,
    block_id: &str,
    column_id: &str,
) -> DocResult<Option<(usize, TypeTarget)>> {
    let cols_target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key("prop:columns"));
    let items = page.inner().read_array(&cols_target)?;
    for (idx, item) in items.into_iter().enumerate() {
        match item {
            SessionReadValue::Map(map_id) => {
                let target = TypeTarget::Identity(map_id);
                if matches!(
                    page.inner().get_map_value(&target, "id")?,
                    Some(SessionReadValue::Any(Any::String(ref id))) if id == column_id
                ) {
                    return Ok(Some((idx, target)));
                }
            }
            SessionReadValue::Any(Any::Object(obj)) => {
                if matches!(obj.get("id"), Some(Any::String(id)) if id == column_id) {
                    return Ok(Some((idx, cols_target)));
                }
            }
            _ => {}
        }
    }
    Ok(None)
}

fn parse_numeric_str(raw: &str) -> Option<f64> {
    let cleaned: String = raw
        .trim()
        .chars()
        .filter(|c| !matches!(c, ',' | '$' | '€' | '£' | '¥' | '₹' | ' '))
        .collect();
    if let Some(pct) = cleaned.strip_suffix('%') {
        pct.trim().parse::<f64>().ok().map(|v| v / 100.0)
    } else {
        cleaned.parse::<f64>().ok().filter(|v| v.is_finite())
    }
}

fn parse_civil_date_ms(raw: &str) -> Option<i64> {
    let trimmed = raw.trim();
    if let Ok(ms) = trimmed.parse::<i64>() {
        return Some(ms);
    }
    let sep = if trimmed.contains('-') {
        '-'
    } else if trimmed.contains('/') {
        '/'
    } else {
        return None;
    };
    let mut parts = trimmed.split(sep);
    let y: i32 = parts.next()?.trim().parse().ok()?;
    let m: u32 = parts.next()?.trim().parse().ok()?;
    let d: u32 = parts.next()?.trim().parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let y_adj = i64::from(y) - i64::from(m <= 2);
    let era = y_adj.div_euclid(400);
    let yoe = (y_adj - era * 400) as u64;
    let m64 = u64::from(m);
    let d64 = u64::from(d);
    let doy = (153 * (if m64 > 2 { m64 - 3 } else { m64 + 9 }) + 2) / 5 + d64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe as i64 - 719_468;
    Some(days * 86_400_000)
}

fn cell_to_plain_text(val: &DatabaseCellValue, old_col: &DatabaseColumn) -> String {
    match val {
        DatabaseCellValue::Null => String::new(),
        DatabaseCellValue::RichText(rt) => rt.plain.clone(),
        DatabaseCellValue::Text(s) => {
            if matches!(old_col.column_type.as_str(), "select" | "multi-select") {
                old_col
                    .select_options()
                    .into_iter()
                    .find(|o| o.id == *s || o.value == *s)
                    .map_or_else(|| s.clone(), |o| o.value)
            } else {
                s.clone()
            }
        }
        DatabaseCellValue::MultiSelect(ids) => {
            let opts = old_col.select_options();
            ids.iter()
                .map(|id| {
                    opts.iter()
                        .find(|o| o.id == *id || o.value == *id)
                        .map_or_else(|| id.clone(), |o| o.value.clone())
                })
                .collect::<Vec<_>>()
                .join(", ")
        }
        DatabaseCellValue::Integer(n) => n.to_string(),
        DatabaseCellValue::Number(n) => {
            if n.fract().abs() < 1e-9 {
                format!("{n:.0}")
            } else {
                n.to_string()
            }
        }
        DatabaseCellValue::Bool(b) => b.to_string(),
        DatabaseCellValue::Json(v) if !v.is_null() => v.to_string(),
        DatabaseCellValue::Json(_) => String::new(),
    }
}

fn default_data_for_type(col_type: &str) -> JsonValue {
    match col_type {
        "select" | "multi-select" => json!({ "options": [] }),
        "number" => json!({ "format": "number" }),
        _ => json!({}),
    }
}

impl PageDocSession {
    /// Add a new column to `prop:columns` (at `insert_index` if provided, else appended) and
    /// append/insert its entry in `view.columns` of the target view (or all Table views when
    /// `view_id` is `None`), in one tracked undo step.
    pub fn add_database_column(
        &mut self,
        block_id: &str,
        view_id: Option<&str>,
        spec: DatabaseColumnSpec,
        insert_index: Option<usize>,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let block_id = block_id.to_string();
        let view_id = view_id.map(str::to_string);
        self.structural_edit(now_ms, move |page| {
            let db_path = TypePath::root("blocks").key(&block_id);
            let cols_target = TypeTarget::Path(db_path.clone().key("prop:columns"));
            let existing = page.inner().read_array(&cols_target).unwrap_or_default();
            let col_val = column_spec_to_session_value(&spec);
            if let Some(idx) = insert_index {
                let clamped = idx.min(existing.len()) as u64;
                page.inner_mut()
                    .array_insert(&cols_target, clamped, vec![col_val])?;
            } else {
                page.inner_mut().array_push(&cols_target, vec![col_val])?;
            }

            // Mirror into view.columns so explicit view column order stays consistent.
            let views_target = TypeTarget::Path(db_path.key("prop:views"));
            if let Ok(views) = page.inner().read_array(&views_target) {
                for view_item in views {
                    let SessionReadValue::Map(view_map_id) = view_item else {
                        continue;
                    };
                    let view_target = TypeTarget::Identity(view_map_id);
                    let vid = match page.inner().get_map_value(&view_target, "id")? {
                        Some(SessionReadValue::Any(Any::String(s))) => s,
                        _ => continue,
                    };
                    let mode = match page.inner().get_map_value(&view_target, "mode")? {
                        Some(SessionReadValue::Any(Any::String(s))) => s,
                        _ => String::new(),
                    };
                    let matches_target = view_id
                        .as_deref()
                        .map_or(mode == "table", |target| target == vid);
                    if !matches_target {
                        continue;
                    }
                    let view_col_entry = SessionValue::Map(vec![
                        (
                            "id".to_string(),
                            SessionValue::Any(Any::String(spec.id.clone())),
                        ),
                        ("width".to_string(), SessionValue::Any(Any::Integer(180))),
                    ]);
                    match page.inner().get_map_value(&view_target, "columns")? {
                        Some(SessionReadValue::Array(arr_id)) => {
                            let arr_target = TypeTarget::Identity(arr_id);
                            let cur = page.inner().read_array(&arr_target).unwrap_or_default();
                            if let Some(idx) = insert_index {
                                let clamped = idx.min(cur.len()) as u64;
                                page.inner_mut().array_insert(
                                    &arr_target,
                                    clamped,
                                    vec![view_col_entry],
                                )?;
                            } else {
                                page.inner_mut()
                                    .array_push(&arr_target, vec![view_col_entry])?;
                            }
                        }
                        None => {
                            page.inner_mut().map_set(
                                &view_target,
                                "columns".to_string(),
                                SessionValue::Array(vec![view_col_entry]),
                            )?;
                        }
                        _ => {}
                    }
                }
            }
            Ok(())
        })
    }

    /// Rename one column in `prop:columns` in one tracked undo step.
    pub fn rename_database_column(
        &mut self,
        block_id: &str,
        column_id: &str,
        new_name: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let block_id = block_id.to_string();
        let column_id = column_id.to_string();
        let new_name = new_name.to_string();
        self.structural_edit(now_ms, move |page| {
            let Some(target) = ensure_column_map_target_in_tx(page, &block_id, &column_id)? else {
                return Ok(());
            };
            page.inner_mut().map_set(
                &target,
                "name".to_string(),
                SessionValue::Any(Any::String(new_name)),
            )?;
            Ok(())
        })
    }

    /// Delete a non-title column from `prop:columns`, every view's `columns` array, and every
    /// row's `prop:cells[row_id]` map in one tracked undo step.
    pub fn delete_database_column(
        &mut self,
        block_id: &str,
        column_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        if column_id == "title" {
            return Err(DocError::InvalidState(
                "cannot delete the title column".into(),
            ));
        }
        let snap = self.read_page_snapshot()?;
        let is_title_col = snap
            .block(block_id)
            .and_then(|b| match &b.content {
                BlockContent::Database(db) => db
                    .columns
                    .iter()
                    .find(|c| c.id == column_id)
                    .map(|c| c.column_type == "title"),
                _ => None,
            })
            .unwrap_or(false);
        if is_title_col {
            return Err(DocError::InvalidState(
                "cannot delete the title column".into(),
            ));
        }
        let block_id = block_id.to_string();
        let column_id = column_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let db_path = TypePath::root("blocks").key(&block_id);
            let cols_target = TypeTarget::Path(db_path.clone().key("prop:columns"));
            if let Some((idx, _)) = find_column_index_in_tx(page, &block_id, &column_id)? {
                page.inner_mut()
                    .array_remove(&cols_target, idx as u64, 1)?;
            }

            // Remove from every view's `columns` list.
            let views_target = TypeTarget::Path(db_path.clone().key("prop:views"));
            if let Ok(views) = page.inner().read_array(&views_target) {
                for view_item in views {
                    let SessionReadValue::Map(view_map_id) = view_item else {
                        continue;
                    };
                    let view_target = TypeTarget::Identity(view_map_id);
                    if let Some(SessionReadValue::Array(arr_id)) =
                        page.inner().get_map_value(&view_target, "columns")?
                    {
                        let arr_target = TypeTarget::Identity(arr_id);
                        let items = page.inner().read_array(&arr_target).unwrap_or_default();
                        let mut remove_indices = Vec::new();
                        for (i, item) in items.into_iter().enumerate() {
                            let matches_col = match item {
                                SessionReadValue::Map(mid) => matches!(
                                    page.inner().get_map_value(&TypeTarget::Identity(mid), "id")?,
                                    Some(SessionReadValue::Any(Any::String(ref id))) if id == &column_id
                                ),
                                SessionReadValue::Any(Any::Object(obj)) => {
                                    matches!(obj.get("id"), Some(Any::String(id)) if id == &column_id)
                                }
                                _ => false,
                            };
                            if matches_col {
                                remove_indices.push(i as u64);
                            }
                        }
                        for idx in remove_indices.into_iter().rev() {
                            page.inner_mut().array_remove(&arr_target, idx, 1)?;
                        }
                    }
                }
            }

            // Remove cell entries for this column across all rows.
            let cells_target = TypeTarget::Path(db_path.key("prop:cells"));
            if let Ok(rows) = page.inner().read_map(&cells_target) {
                for (row_id, row_val) in rows {
                    match row_val {
                        SessionReadValue::Map(row_map_id) => {
                            let row_target = TypeTarget::Identity(row_map_id);
                            if page.inner().get_map_value(&row_target, &column_id)?.is_some() {
                                page.inner_mut().map_remove(&row_target, &column_id)?;
                            }
                        }
                        SessionReadValue::Any(Any::Object(mut row_obj)) => {
                            if row_obj.remove(&column_id).is_some() {
                                let upgraded = SessionValue::Map(
                                    row_obj
                                        .into_iter()
                                        .map(|(k, v)| (k, any_to_session_value(v)))
                                        .collect(),
                                );
                                page.inner_mut().map_set(&cells_target, row_id, upgraded)?;
                            }
                        }
                        _ => {}
                    }
                }
            }
            Ok(())
        })
    }

    /// Change a non-title column's type (`rich-text`, `select`, `multi-select`, `number`,
    /// `checkbox`, `date`, `progress`, `link`) and safely coerce all existing cell values
    /// (synthesizing select options when converting into `select`/`multi-select`), in one
    /// tracked undo step.
    pub fn change_database_column_type(
        &mut self,
        block_id: &str,
        column_id: &str,
        target_type: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        if target_type == "title" {
            return Err(DocError::InvalidState(
                "cannot convert a non-title column to title".into(),
            ));
        }
        let snap = self.read_page_snapshot()?;
        let Some(BlockContent::Database(db)) = snap.block(block_id).map(|b| &b.content) else {
            return Err(DocError::BlockNotFound(block_id.to_string()));
        };
        let Some(old_col) = db.columns.iter().find(|c| c.id == column_id).cloned() else {
            return Ok(None);
        };
        if old_col.column_type == "title" {
            return Err(DocError::InvalidState(
                "cannot change the type of the title column".into(),
            ));
        }
        if old_col.column_type == target_type {
            return Ok(None);
        }

        // Precompute new column `data` and coerced cell values per row.
        let mut next_options: Vec<JsonValue> = old_col
            .data
            .get("options")
            .and_then(JsonValue::as_array)
            .cloned()
            .unwrap_or_default();
        let mut option_id_by_label: BTreeMap<String, String> = BTreeMap::new();
        for opt in &next_options {
            if let (Some(id), Some(val)) = (
                opt.get("id").and_then(JsonValue::as_str),
                opt.get("value").and_then(JsonValue::as_str),
            ) {
                option_id_by_label.insert(val.to_string(), id.to_string());
            }
        }
        let mut ensure_option = |label: &str| -> String {
            let trimmed = label.trim();
            if let Some(existing_id) = option_id_by_label.get(trimmed) {
                return existing_id.clone();
            }
            let idx = next_options.len();
            let id = format!("opt-{column_id}-{idx}");
            let color = DEFAULT_TAG_COLORS[idx % DEFAULT_TAG_COLORS.len()];
            next_options.push(json!({
                "id": id,
                "value": trimmed,
                "color": color,
            }));
            option_id_by_label.insert(trimmed.to_string(), id.clone());
            id
        };

        let mut coerced_cells: Vec<(String, DatabaseCellSpec)> = Vec::new();
        for row in &db.rows {
            let Some(val) = db.cells.get(&(row.row_id.clone(), column_id.to_string())) else {
                continue;
            };
            if val.is_empty() && !matches!(val, DatabaseCellValue::Bool(_)) {
                continue;
            }
            let coerced = match target_type {
                "rich-text" => DatabaseCellSpec::RichText(cell_to_plain_text(val, &old_col)),
                "link" => DatabaseCellSpec::Text(cell_to_plain_text(val, &old_col)),
                "number" => {
                    let num = val
                        .as_f64()
                        .or_else(|| parse_numeric_str(&cell_to_plain_text(val, &old_col)));
                    num.map_or(DatabaseCellSpec::Null, DatabaseCellSpec::Number)
                }
                "progress" => {
                    let raw = val
                        .as_i64()
                        .or_else(|| {
                            parse_numeric_str(&cell_to_plain_text(val, &old_col))
                                .map(|n| n.round() as i64)
                        })
                        .unwrap_or(0)
                        .clamp(0, 100);
                    DatabaseCellSpec::Integer(raw)
                }
                "checkbox" => {
                    let b = match val {
                        DatabaseCellValue::Bool(b) => *b,
                        DatabaseCellValue::Integer(n) => *n != 0,
                        DatabaseCellValue::Number(n) => *n != 0.0,
                        _ => {
                            let s = cell_to_plain_text(val, &old_col)
                                .trim()
                                .to_ascii_lowercase();
                            matches!(s.as_str(), "true" | "1" | "yes" | "done" | "checked")
                        }
                    };
                    DatabaseCellSpec::Bool(b)
                }
                "date" => {
                    let ts = val
                        .as_i64()
                        .or_else(|| parse_civil_date_ms(&cell_to_plain_text(val, &old_col)));
                    ts.map_or(DatabaseCellSpec::Null, DatabaseCellSpec::Integer)
                }
                "select" => {
                    let label = match val {
                        DatabaseCellValue::MultiSelect(items) => items
                            .first()
                            .map(|id| {
                                old_col
                                    .select_options()
                                    .into_iter()
                                    .find(|o| o.id == *id || o.value == *id)
                                    .map_or_else(|| id.clone(), |o| o.value)
                            })
                            .unwrap_or_default(),
                        _ => cell_to_plain_text(val, &old_col),
                    };
                    let trimmed = label.trim();
                    if trimmed.is_empty() {
                        DatabaseCellSpec::Null
                    } else {
                        DatabaseCellSpec::Text(ensure_option(trimmed))
                    }
                }
                "multi-select" => {
                    let raw_labels: Vec<String> = match val {
                        DatabaseCellValue::MultiSelect(items) => items
                            .iter()
                            .map(|id| {
                                old_col
                                    .select_options()
                                    .into_iter()
                                    .find(|o| o.id == *id || o.value == *id)
                                    .map_or_else(|| id.clone(), |o| o.value)
                            })
                            .collect(),
                        _ => cell_to_plain_text(val, &old_col)
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect(),
                    };
                    let ids: Vec<String> = raw_labels.iter().map(|l| ensure_option(l)).collect();
                    DatabaseCellSpec::MultiSelect(ids)
                }
                _ => DatabaseCellSpec::Text(cell_to_plain_text(val, &old_col)),
            };
            coerced_cells.push((row.row_id.clone(), coerced));
        }

        let new_data = match target_type {
            "select" | "multi-select" => {
                let mut map = JsonMap::new();
                map.insert("options".to_string(), JsonValue::Array(next_options));
                JsonValue::Object(map)
            }
            other => default_data_for_type(other),
        };

        let block_id = block_id.to_string();
        let column_id = column_id.to_string();
        let target_type = target_type.to_string();
        self.structural_edit(now_ms, move |page| {
            let Some(target) = ensure_column_map_target_in_tx(page, &block_id, &column_id)? else {
                return Ok(());
            };
            page.inner_mut().map_set(
                &target,
                "type".to_string(),
                SessionValue::Any(Any::String(target_type)),
            )?;
            page.inner_mut().map_set(
                &target,
                "data".to_string(),
                json_to_session_value(&new_data),
            )?;
            for (row_id, coerced) in coerced_cells {
                write_cell_in_tx(
                    page,
                    &block_id,
                    &row_id,
                    &column_id,
                    coerced.into_session_value(),
                )?;
            }
            Ok(())
        })
    }

    /// Create or update (rename / recolor) a select/multi-select option in `column.data.options`
    /// in one tracked undo step.
    pub fn upsert_database_select_option(
        &mut self,
        block_id: &str,
        column_id: &str,
        option_id: &str,
        value: &str,
        color: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.upsert_database_select_option_inner(
            block_id, column_id, option_id, value, color, None, now_ms,
        )
    }

    /// Create or update a select/multi-select option and assign `cell_spec` on `row_id` in a
    /// single tracked `structural_edit` undo step.
    #[allow(clippy::too_many_arguments)]
    pub fn upsert_database_select_option_and_set_cell(
        &mut self,
        block_id: &str,
        column_id: &str,
        option_id: &str,
        value: &str,
        color: &str,
        row_id: &str,
        cell_spec: DatabaseCellSpec,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.upsert_database_select_option_inner(
            block_id,
            column_id,
            option_id,
            value,
            color,
            Some((row_id.to_string(), cell_spec)),
            now_ms,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn upsert_database_select_option_inner(
        &mut self,
        block_id: &str,
        column_id: &str,
        option_id: &str,
        value: &str,
        color: &str,
        cell_update: Option<(String, DatabaseCellSpec)>,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let snap = self.read_page_snapshot()?;
        let Some(BlockContent::Database(db)) = snap.block(block_id).map(|b| &b.content) else {
            return Err(DocError::BlockNotFound(block_id.to_string()));
        };
        let Some(col) = db.columns.iter().find(|c| c.id == column_id) else {
            return Ok(None);
        };
        let mut data_obj = col.data.as_object().cloned().unwrap_or_default();
        let mut options = data_obj
            .get("options")
            .and_then(JsonValue::as_array)
            .cloned()
            .unwrap_or_default();
        let entry = json!({
            "id": option_id,
            "value": value,
            "color": color,
        });
        if let Some(slot) = options
            .iter_mut()
            .find(|o| o.get("id").and_then(JsonValue::as_str) == Some(option_id))
        {
            *slot = entry;
        } else {
            options.push(entry);
        }
        data_obj.insert("options".to_string(), JsonValue::Array(options));
        let next_data = JsonValue::Object(data_obj);

        let block_id = block_id.to_string();
        let column_id = column_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let Some(target) = ensure_column_map_target_in_tx(page, &block_id, &column_id)? else {
                return Ok(());
            };
            page.inner_mut().map_set(
                &target,
                "data".to_string(),
                json_to_session_value(&next_data),
            )?;
            if let Some((row_id, spec)) = cell_update {
                write_cell_in_tx(
                    page,
                    &block_id,
                    &row_id,
                    &column_id,
                    spec.into_session_value(),
                )?;
            }
            Ok(())
        })
    }

    /// Delete an option from a `select` / `multi-select` column and strip references to it from
    /// all rows in one tracked undo step.
    pub fn delete_database_select_option(
        &mut self,
        block_id: &str,
        column_id: &str,
        option_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let snap = self.read_page_snapshot()?;
        let Some(BlockContent::Database(db)) = snap.block(block_id).map(|b| &b.content) else {
            return Err(DocError::BlockNotFound(block_id.to_string()));
        };
        let Some(col) = db.columns.iter().find(|c| c.id == column_id) else {
            return Ok(None);
        };
        let mut data_obj = col.data.as_object().cloned().unwrap_or_default();
        let mut options = data_obj
            .get("options")
            .and_then(JsonValue::as_array)
            .cloned()
            .unwrap_or_default();
        let before_len = options.len();
        options.retain(|o| o.get("id").and_then(JsonValue::as_str) != Some(option_id));
        if options.len() == before_len {
            return Ok(None);
        }
        data_obj.insert("options".to_string(), JsonValue::Array(options));
        let next_data = JsonValue::Object(data_obj);

        let mut cleaned_cells: Vec<(String, DatabaseCellSpec)> = Vec::new();
        for row in &db.rows {
            let Some(val) = db.cells.get(&(row.row_id.clone(), column_id.to_string())) else {
                continue;
            };
            match val {
                DatabaseCellValue::Text(s) if s == option_id => {
                    cleaned_cells.push((row.row_id.clone(), DatabaseCellSpec::Null));
                }
                DatabaseCellValue::MultiSelect(items) if items.iter().any(|i| i == option_id) => {
                    let remaining: Vec<String> =
                        items.iter().filter(|i| *i != option_id).cloned().collect();
                    cleaned_cells
                        .push((row.row_id.clone(), DatabaseCellSpec::MultiSelect(remaining)));
                }
                _ => {}
            }
        }

        let block_id = block_id.to_string();
        let column_id = column_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let Some(target) = ensure_column_map_target_in_tx(page, &block_id, &column_id)? else {
                return Ok(());
            };
            page.inner_mut().map_set(
                &target,
                "data".to_string(),
                json_to_session_value(&next_data),
            )?;
            for (row_id, spec) in cleaned_cells {
                write_cell_in_tx(
                    page,
                    &block_id,
                    &row_id,
                    &column_id,
                    spec.into_session_value(),
                )?;
            }
            Ok(())
        })
    }
}

/// Locate `column_id` inside `prop:columns` and, if stored as a legacy `Any::Object` scalar,
/// upgrade it in-place to a `Y.Map` so callers can safely `map_set` on the returned target.
fn ensure_column_map_target_in_tx(
    page: &mut PageDocSession,
    block_id: &str,
    column_id: &str,
) -> DocResult<Option<TypeTarget>> {
    let Some((idx, target)) = find_column_index_in_tx(page, block_id, column_id)? else {
        return Ok(None);
    };
    let cols_target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key("prop:columns"));
    if target != cols_target {
        return Ok(Some(target));
    }
    let items = page.inner().read_array(&cols_target)?;
    let Some(SessionReadValue::Any(Any::Object(obj))) = items.into_iter().nth(idx) else {
        return Ok(None);
    };
    let upgraded = SessionValue::Map(
        obj.into_iter()
            .map(|(k, v)| (k, any_to_session_value(v)))
            .collect(),
    );
    page.inner_mut().array_remove(&cols_target, idx as u64, 1)?;
    page.inner_mut()
        .array_insert(&cols_target, idx as u64, vec![upgraded])?;
    Ok(find_column_index_in_tx(page, block_id, column_id)?.map(|(_, t)| t))
}
