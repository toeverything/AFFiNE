//! Live incremental `Y.Text` splicing and relative-position tracking for `affine:table` cells.

use std::collections::BTreeMap;

use y_octo::{
    Any, RelativePosition, SessionReadValue, SessionValue, TextDeltaOp, TextInsert, TypeIdentity,
    TypePath, TypeTarget,
};

use crate::DocResult;

use super::{PageCommit, PageDocSession};

/// Live state of a verified `affine:table` cell (table block, row, and column all exist).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LiveTableCell {
    /// The cell holds a shared `Y.Text` identity.
    LiveText,
    /// The cell holds a legacy scalar string or has no cell entry yet.
    Unupgraded,
}

enum ResolvedCellValue {
    LiveText(TypeIdentity),
    PlainString(String),
    Empty,
}

enum CellWriteTarget {
    Flat {
        block_target: TypeTarget,
        flat_key: String,
    },
    LegacyNestedCellMap {
        cell_target: TypeTarget,
    },
    LegacyNestedCellsMap {
        cells_target: TypeTarget,
        cell_key: String,
    },
}

impl PageDocSession {
    /// Check whether `block_id` is a live `affine:table` whose row and column sets still contain
    /// `row_id` and `column_id` (using `read_table` flat-overrides-nested precedence).
    ///
    /// Returns `Ok(None)` when the table, row, or column was deleted.
    pub fn resolve_live_table_cell(
        &self,
        block_id: &str,
        row_id: &str,
        column_id: &str,
    ) -> DocResult<Option<LiveTableCell>> {
        let Some((_, value)) = self.resolve_live_table_cell_inner(block_id, row_id, column_id)?
        else {
            return Ok(None);
        };
        Ok(Some(match value {
            ResolvedCellValue::LiveText(_) => LiveTableCell::LiveText,
            ResolvedCellValue::PlainString(_) | ResolvedCellValue::Empty => {
                LiveTableCell::Unupgraded
            }
        }))
    }

    /// Splice a UTF-16 range directly on a live `affine:table` cell's `Y.Text`.
    ///
    /// Returns `Ok(None)` with zero writeback when the table, row, or column was deleted, or
    /// when the clamped splice is a no-op (`del == 0 && insert.is_empty()`).
    ///
    /// When the cell does not yet hold a `Y.Text` (a missing key or legacy `Any::String` scalar),
    /// it upgrades lazily on the first real mutation by applying `(utf16_start, utf16_delete_len,
    /// insert)` to the existing string and writing `SessionValue::Text`. Concurrent offline
    /// first-time upgrades of a missing or `Any::String` scalar cell follow native Yjs V1
    /// `Y.Map` LWW convergence semantics.
    #[allow(clippy::too_many_arguments)]
    pub fn splice_table_cell_text(
        &mut self,
        block_id: &str,
        row_id: &str,
        column_id: &str,
        utf16_start: u64,
        utf16_delete_len: u64,
        insert: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let Some((write_target, resolved)) =
            self.resolve_live_table_cell_inner(block_id, row_id, column_id)?
        else {
            return Ok(None);
        };

        if let ResolvedCellValue::LiveText(identity) = resolved {
            let target = TypeTarget::Identity(identity);
            return self.splice_live_text(&target, utf16_start, utf16_delete_len, insert, now_ms);
        }

        let old = match resolved {
            ResolvedCellValue::PlainString(s) => s,
            ResolvedCellValue::Empty => String::new(),
            ResolvedCellValue::LiveText(_) => unreachable!(),
        };
        let mut u16_buf: Vec<u16> = old.encode_utf16().collect();
        let start = (utf16_start as usize).min(u16_buf.len());
        let del = (utf16_delete_len as usize).min(u16_buf.len() - start);
        if del == 0 && insert.is_empty() {
            return Ok(None);
        }
        u16_buf.splice(start..start + del, insert.encode_utf16());
        let upgraded = String::from_utf16_lossy(&u16_buf);
        let delta = if upgraded.is_empty() {
            Vec::new()
        } else {
            vec![TextDeltaOp::Insert {
                insert: TextInsert::Text(upgraded),
                format: None,
            }]
        };

        self.advance_time(now_ms);
        let commit = match write_target {
            CellWriteTarget::Flat {
                block_target,
                flat_key,
            } => self
                .session
                .map_set(&block_target, flat_key, SessionValue::Text(delta))?,
            CellWriteTarget::LegacyNestedCellMap { cell_target } => {
                self.session
                    .map_set(&cell_target, "text".to_string(), SessionValue::Text(delta))?
            }
            CellWriteTarget::LegacyNestedCellsMap {
                cells_target,
                cell_key,
            } => {
                let cell_val = SessionValue::Map(vec![("text".into(), SessionValue::Text(delta))]);
                self.session.map_set(&cells_target, cell_key, cell_val)?
            }
        };
        Ok(self.record_commit(commit))
    }

    /// Encode a `RelativePosition` at UTF-16 `offset` on a live table cell's `Y.Text`.
    ///
    /// Returns `Ok(None)` when the cell is deleted or does not yet hold a `Y.Text`.
    pub fn encode_table_cell_relative_position(
        &self,
        block_id: &str,
        row_id: &str,
        column_id: &str,
        offset: u64,
    ) -> DocResult<Option<RelativePosition>> {
        let Some((_, ResolvedCellValue::LiveText(identity))) =
            self.resolve_live_table_cell_inner(block_id, row_id, column_id)?
        else {
            return Ok(None);
        };
        let target = TypeTarget::Identity(identity);
        let clamped = offset.min(self.session.read_text_len(&target)?);
        Ok(Some(
            self.session
                .create_relative_position(&target, clamped, -1)?,
        ))
    }

    /// Resolve a `RelativePosition` back to a UTF-16 offset on a live table cell's `Y.Text`.
    ///
    /// Returns `Ok(None)` when the cell is deleted, has no `Y.Text`, or `pos` points elsewhere.
    pub fn resolve_table_cell_relative_position(
        &self,
        block_id: &str,
        row_id: &str,
        column_id: &str,
        pos: &RelativePosition,
    ) -> DocResult<Option<u64>> {
        let Some((_, ResolvedCellValue::LiveText(identity))) =
            self.resolve_live_table_cell_inner(block_id, row_id, column_id)?
        else {
            return Ok(None);
        };
        let Some(abs) = self.session.resolve_relative_position(pos, true) else {
            return Ok(None);
        };
        Ok((abs.r#type == identity).then_some(abs.index))
    }

    fn resolve_live_table_cell_inner(
        &self,
        block_id: &str,
        row_id: &str,
        column_id: &str,
    ) -> DocResult<Option<(CellWriteTarget, ResolvedCellValue)>> {
        let block_target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let Ok(raw_entries) = self.session.read_map(&block_target) else {
            return Ok(None);
        };
        let block_entries: BTreeMap<String, SessionReadValue> = raw_entries.into_iter().collect();
        let is_table = matches!(
            block_entries.get("sys:flavour"),
            Some(SessionReadValue::Any(Any::String(flavour))) if flavour == "affine:table"
        );
        if !is_table {
            return Ok(None);
        }

        if !self.live_table_axis_contains(
            &block_entries,
            "prop:rows.",
            "prop:rows",
            "rowId",
            row_id,
        )? || !self.live_table_axis_contains(
            &block_entries,
            "prop:columns.",
            "prop:columns",
            "columnId",
            column_id,
        )? {
            return Ok(None);
        }

        let any_flat_cell = block_entries.keys().any(|k| {
            k.strip_prefix("prop:cells.")
                .and_then(|r| r.strip_suffix(".text"))
                .is_some_and(|ck| ck.contains(':'))
        });
        let flat_key = format!("prop:cells.{row_id}:{column_id}.text");

        if any_flat_cell {
            let value = match block_entries.get(&flat_key) {
                Some(SessionReadValue::Text(text_id)) => {
                    ResolvedCellValue::LiveText(text_id.clone())
                }
                Some(SessionReadValue::Any(Any::String(s))) => {
                    ResolvedCellValue::PlainString(s.clone())
                }
                _ => ResolvedCellValue::Empty,
            };
            return Ok(Some((
                CellWriteTarget::Flat {
                    block_target,
                    flat_key,
                },
                value,
            )));
        }

        if let Some(SessionReadValue::Map(cells_id)) = block_entries.get("prop:cells") {
            let cells_target = TypeTarget::Identity(cells_id.clone());
            let cell_key = format!("{row_id}:{column_id}");
            match self.session.get_map_value(&cells_target, &cell_key)? {
                Some(SessionReadValue::Map(cell_id)) => {
                    let cell_target = TypeTarget::Identity(cell_id);
                    let value = match self.session.get_map_value(&cell_target, "text")? {
                        Some(SessionReadValue::Text(text_id)) => {
                            ResolvedCellValue::LiveText(text_id)
                        }
                        Some(SessionReadValue::Any(Any::String(s))) => {
                            ResolvedCellValue::PlainString(s)
                        }
                        _ => ResolvedCellValue::Empty,
                    };
                    return Ok(Some((
                        CellWriteTarget::LegacyNestedCellMap { cell_target },
                        value,
                    )));
                }
                Some(SessionReadValue::Any(Any::String(s))) => {
                    return Ok(Some((
                        CellWriteTarget::LegacyNestedCellsMap {
                            cells_target,
                            cell_key,
                        },
                        ResolvedCellValue::PlainString(s),
                    )));
                }
                _ => {
                    return Ok(Some((
                        CellWriteTarget::LegacyNestedCellsMap {
                            cells_target,
                            cell_key,
                        },
                        ResolvedCellValue::Empty,
                    )));
                }
            }
        }

        Ok(Some((
            CellWriteTarget::Flat {
                block_target,
                flat_key,
            },
            ResolvedCellValue::Empty,
        )))
    }

    /// Check whether a table row/column axis contains `target_id` using the exact same flat-first
    /// precedence and effective-ID resolution as `read_table`: if any flat `prop:<axis>.<k>.<field>`
    /// key exists, the legacy nested `prop:<axis>` map is ignored completely.
    fn live_table_axis_contains(
        &self,
        block_entries: &BTreeMap<String, SessionReadValue>,
        flat_prefix: &str,
        nested_key: &str,
        id_field: &str,
        target_id: &str,
    ) -> DocResult<bool> {
        let mut flat_ids: BTreeMap<&str, String> = BTreeMap::new();
        for (key, value) in block_entries {
            if let Some(rest) = key.strip_prefix(flat_prefix)
                && let Some((axis_key, field)) = rest.rsplit_once('.')
            {
                let entry = flat_ids
                    .entry(axis_key)
                    .or_insert_with(|| axis_key.to_string());
                if field == id_field
                    && let SessionReadValue::Any(Any::String(s)) = value
                    && !s.is_empty()
                {
                    *entry = s.clone();
                }
            }
        }
        if !flat_ids.is_empty() {
            return Ok(flat_ids.values().any(|id| id == target_id));
        }
        if let Some(SessionReadValue::Map(map_id)) = block_entries.get(nested_key) {
            for (key, value) in self
                .session
                .read_map(&TypeTarget::Identity(map_id.clone()))?
            {
                let SessionReadValue::Map(item_map) = value else {
                    continue;
                };
                let effective_id = match self
                    .session
                    .get_map_value(&TypeTarget::Identity(item_map), id_field)?
                {
                    Some(SessionReadValue::Any(Any::String(s))) if !s.is_empty() => s,
                    _ => key,
                };
                if effective_id == target_id {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    /// Insert a new row after `after_row_id` (or at the end when `None`) in one atomic undo step,
    /// preserving the table block's existing storage format (nested `Y.Map` vs flat dotted keys).
    pub fn insert_table_row(
        &mut self,
        block_id: &str,
        after_row_id: Option<&str>,
        new_row_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let Some(table) = self.read_table_block(block_id)? else {
            return Ok(None);
        };
        let (prev_order, next_order) =
            match after_row_id.and_then(|id| table.rows.iter().position(|r| r.row_id == id)) {
                Some(idx) => (
                    Some(table.rows[idx].order.as_str()),
                    table.rows.get(idx + 1).map(|r| r.order.as_str()),
                ),
                None => (table.rows.last().map(|r| r.order.as_str()), None),
            };
        let order = crate::fractional_index::generate_key_between(prev_order, next_order)
            .unwrap_or_else(|_| format!("z{new_row_id}"));
        let col_ids: Vec<String> = table.columns.iter().map(|c| c.column_id.clone()).collect();
        let (rows_nested, _, cells_nested) = self.table_nested_map_targets(block_id)?;
        let bid = block_id.to_string();
        let rid = new_row_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let block_target = TypeTarget::Path(TypePath::root("blocks").key(&bid));
            if let Some(rows_target) = &rows_nested {
                page.session.map_set(
                    rows_target,
                    rid.clone(),
                    SessionValue::Map(vec![
                        (
                            "rowId".to_string(),
                            SessionValue::Any(Any::String(rid.clone())),
                        ),
                        ("order".to_string(), SessionValue::Any(Any::String(order))),
                    ]),
                )?;
            } else {
                page.session.map_set(
                    &block_target,
                    format!("prop:rows.{rid}.rowId"),
                    SessionValue::Any(Any::String(rid.clone())),
                )?;
                page.session.map_set(
                    &block_target,
                    format!("prop:rows.{rid}.order"),
                    SessionValue::Any(Any::String(order)),
                )?;
            }
            for cid in &col_ids {
                if let Some(cells_target) = &cells_nested {
                    page.session.map_set(
                        cells_target,
                        format!("{rid}:{cid}"),
                        SessionValue::Map(vec![(
                            "text".to_string(),
                            SessionValue::Text(Vec::new()),
                        )]),
                    )?;
                } else {
                    page.session.map_set(
                        &block_target,
                        format!("prop:cells.{rid}:{cid}.text"),
                        SessionValue::Text(Vec::new()),
                    )?;
                }
            }
            Ok(())
        })
    }

    /// Delete `row_id` and its cells in one atomic undo step. No-op if the table has `<= 1` row.
    pub fn delete_table_row(
        &mut self,
        block_id: &str,
        row_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let Some(table) = self.read_table_block(block_id)? else {
            return Ok(None);
        };
        if table.rows.len() <= 1 || !table.rows.iter().any(|r| r.row_id == row_id) {
            return Ok(None);
        }
        let (rows_nested, _, cells_nested) = self.table_nested_map_targets(block_id)?;
        let block_target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let flat_keys: Vec<String> = self
            .session
            .read_map(&block_target)?
            .into_iter()
            .map(|(k, _)| k)
            .filter(|k| {
                k.starts_with(&format!("prop:rows.{row_id}."))
                    || k.starts_with(&format!("prop:cells.{row_id}:"))
            })
            .collect();
        let nested_cell_keys: Vec<String> = match &cells_nested {
            Some(cells_target) => self
                .session
                .read_map(cells_target)?
                .into_iter()
                .map(|(k, _)| k)
                .filter(|k| k.starts_with(&format!("{row_id}:")))
                .collect(),
            None => Vec::new(),
        };
        let bid = block_id.to_string();
        let rid = row_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let target = TypeTarget::Path(TypePath::root("blocks").key(&bid));
            for key in &flat_keys {
                page.session.map_remove(&target, key)?;
            }
            if let Some(rows_target) = &rows_nested {
                page.session.map_remove(rows_target, &rid)?;
            }
            if let Some(cells_target) = &cells_nested {
                for key in &nested_cell_keys {
                    page.session.map_remove(cells_target, key)?;
                }
            }
            Ok(())
        })
    }

    /// Insert a new column after `after_col_id` (or at the end when `None`) in one atomic undo
    /// step, preserving the table block's existing storage format (nested `Y.Map` vs flat keys).
    pub fn insert_table_column(
        &mut self,
        block_id: &str,
        after_col_id: Option<&str>,
        new_col_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let Some(table) = self.read_table_block(block_id)? else {
            return Ok(None);
        };
        let (prev_order, next_order) = match after_col_id
            .and_then(|id| table.columns.iter().position(|c| c.column_id == id))
        {
            Some(idx) => (
                Some(table.columns[idx].order.as_str()),
                table.columns.get(idx + 1).map(|c| c.order.as_str()),
            ),
            None => (table.columns.last().map(|c| c.order.as_str()), None),
        };
        let order = crate::fractional_index::generate_key_between(prev_order, next_order)
            .unwrap_or_else(|_| format!("z{new_col_id}"));
        let row_ids: Vec<String> = table.rows.iter().map(|r| r.row_id.clone()).collect();
        let (_, cols_nested, cells_nested) = self.table_nested_map_targets(block_id)?;
        let bid = block_id.to_string();
        let cid = new_col_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let block_target = TypeTarget::Path(TypePath::root("blocks").key(&bid));
            if let Some(cols_target) = &cols_nested {
                page.session.map_set(
                    cols_target,
                    cid.clone(),
                    SessionValue::Map(vec![
                        (
                            "columnId".to_string(),
                            SessionValue::Any(Any::String(cid.clone())),
                        ),
                        ("order".to_string(), SessionValue::Any(Any::String(order))),
                    ]),
                )?;
            } else {
                page.session.map_set(
                    &block_target,
                    format!("prop:columns.{cid}.columnId"),
                    SessionValue::Any(Any::String(cid.clone())),
                )?;
                page.session.map_set(
                    &block_target,
                    format!("prop:columns.{cid}.order"),
                    SessionValue::Any(Any::String(order)),
                )?;
            }
            for rid in &row_ids {
                if let Some(cells_target) = &cells_nested {
                    page.session.map_set(
                        cells_target,
                        format!("{rid}:{cid}"),
                        SessionValue::Map(vec![(
                            "text".to_string(),
                            SessionValue::Text(Vec::new()),
                        )]),
                    )?;
                } else {
                    page.session.map_set(
                        &block_target,
                        format!("prop:cells.{rid}:{cid}.text"),
                        SessionValue::Text(Vec::new()),
                    )?;
                }
            }
            Ok(())
        })
    }

    /// Delete `column_id` and its cells in one atomic undo step. No-op if the table has `<= 1` column.
    pub fn delete_table_column(
        &mut self,
        block_id: &str,
        column_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let Some(table) = self.read_table_block(block_id)? else {
            return Ok(None);
        };
        if table.columns.len() <= 1 || !table.columns.iter().any(|c| c.column_id == column_id) {
            return Ok(None);
        }
        let (_, cols_nested, cells_nested) = self.table_nested_map_targets(block_id)?;
        let block_target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let suffix = format!(":{column_id}.text");
        let flat_keys: Vec<String> = self
            .session
            .read_map(&block_target)?
            .into_iter()
            .map(|(k, _)| k)
            .filter(|k| {
                k.starts_with(&format!("prop:columns.{column_id}."))
                    || (k.starts_with("prop:cells.") && k.ends_with(&suffix))
            })
            .collect();
        let nested_suffix = format!(":{column_id}");
        let nested_cell_keys: Vec<String> = match &cells_nested {
            Some(cells_target) => self
                .session
                .read_map(cells_target)?
                .into_iter()
                .map(|(k, _)| k)
                .filter(|k| k.ends_with(&nested_suffix))
                .collect(),
            None => Vec::new(),
        };
        let bid = block_id.to_string();
        let cid = column_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let target = TypeTarget::Path(TypePath::root("blocks").key(&bid));
            for key in &flat_keys {
                page.session.map_remove(&target, key)?;
            }
            if let Some(cols_target) = &cols_nested {
                page.session.map_remove(cols_target, &cid)?;
            }
            if let Some(cells_target) = &cells_nested {
                for key in &nested_cell_keys {
                    page.session.map_remove(cells_target, key)?;
                }
            }
            Ok(())
        })
    }

    /// Detect whether `prop:rows`, `prop:columns`, and `prop:cells` on `block_id` use nested
    /// `Y.Map` storage (returns `Some(TypeTarget)` when no flat dotted keys exist and a nested
    /// `Y.Map` is present).
    fn table_nested_map_targets(
        &self,
        block_id: &str,
    ) -> DocResult<(Option<TypeTarget>, Option<TypeTarget>, Option<TypeTarget>)> {
        let block_target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let entries: BTreeMap<String, SessionReadValue> =
            self.session.read_map(&block_target)?.into_iter().collect();
        let mode = crate::read::detect_table_storage_mode(entries.keys().map(String::as_str));
        let rows_nested = (!mode.flat_rows)
            .then(|| match entries.get("prop:rows") {
                Some(SessionReadValue::Map(id)) => Some(TypeTarget::Identity(id.clone())),
                _ => None,
            })
            .flatten();
        let cols_nested = (!mode.flat_cols)
            .then(|| match entries.get("prop:columns") {
                Some(SessionReadValue::Map(id)) => Some(TypeTarget::Identity(id.clone())),
                _ => None,
            })
            .flatten();
        let cells_nested = (!mode.flat_cells)
            .then(|| match entries.get("prop:cells") {
                Some(SessionReadValue::Map(id)) => Some(TypeTarget::Identity(id.clone())),
                _ => None,
            })
            .flatten();
        Ok((rows_nested, cols_nested, cells_nested))
    }
}
