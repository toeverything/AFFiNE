//! CRDT authoring primitives for `affine:database` (`sys:version = 3`), aligned with
//! BlockSuite `0.27.5` `native2Y` schema and Yjs V1 encoding.

mod columns;
mod views;

use y_octo::{AHashMap, Any, SessionReadValue, SessionValue, TypePath, TypeTarget};

use crate::{
    DocError, DocResult,
    schema::{BlockSpec, DatabaseCellSpec, ParagraphType},
};

use super::{PageCommit, PageDocSession};

pub(super) fn any_to_session_value(any: Any) -> SessionValue {
    match any {
        Any::Object(obj) => SessionValue::Map(
            obj.into_iter()
                .map(|(k, v)| (k, any_to_session_value(v)))
                .collect(),
        ),
        Any::Array(items) => {
            SessionValue::Array(items.into_iter().map(any_to_session_value).collect())
        }
        scalar => SessionValue::Any(scalar),
    }
}

fn upgrade_cell_object_to_map(
    mut cell_obj: AHashMap<String, Any>,
    column_id: &str,
    value: SessionValue,
) -> SessionValue {
    cell_obj.remove("value");
    let has_col_id = cell_obj.contains_key("columnId");
    let mut entries: Vec<(String, SessionValue)> = cell_obj
        .into_iter()
        .map(|(k, v)| (k, any_to_session_value(v)))
        .collect();
    if !has_col_id {
        entries.push((
            "columnId".to_string(),
            SessionValue::Any(Any::String(column_id.to_string())),
        ));
    }
    entries.push(("value".to_string(), value));
    SessionValue::Map(entries)
}

pub(super) fn write_cell_in_tx(
    page: &mut PageDocSession,
    block_id: &str,
    row_id: &str,
    column_id: &str,
    value: SessionValue,
) -> DocResult<()> {
    let db_path = TypePath::root("blocks").key(block_id);
    let db_target = TypeTarget::Path(db_path.clone());
    let cells_path = db_path.key("prop:cells");
    let cells_target = TypeTarget::Path(cells_path.clone());

    match page.inner().get_map_value(&db_target, "prop:cells")? {
        Some(SessionReadValue::Map(_)) => {}
        Some(SessionReadValue::Any(Any::Object(cells_obj))) => {
            let upgraded: Vec<(String, SessionValue)> = cells_obj
                .into_iter()
                .map(|(k, v)| (k, any_to_session_value(v)))
                .collect();
            page.inner_mut().map_set(
                &db_target,
                "prop:cells".to_string(),
                SessionValue::Map(upgraded),
            )?;
        }
        None => {
            page.inner_mut().map_set(
                &db_target,
                "prop:cells".to_string(),
                SessionValue::Map(Vec::new()),
            )?;
        }
        Some(_) => {
            return Err(DocError::InvalidState(
                "database prop:cells has unsupported scalar representation".into(),
            ));
        }
    }

    let existing_row = page.inner().get_map_value(&cells_target, row_id)?;
    match existing_row {
        Some(SessionReadValue::Map(_)) => {
            let row_path = cells_path.key(row_id);
            let row_target = TypeTarget::Path(row_path.clone());
            let existing_cell = page.inner().get_map_value(&row_target, column_id)?;
            match existing_cell {
                Some(SessionReadValue::Map(_)) => {
                    let cell_target = TypeTarget::Path(row_path.key(column_id));
                    if page
                        .inner()
                        .get_map_value(&cell_target, "columnId")?
                        .is_none()
                    {
                        page.inner_mut().map_set(
                            &cell_target,
                            "columnId".to_string(),
                            SessionValue::Any(Any::String(column_id.to_string())),
                        )?;
                    }
                    page.inner_mut()
                        .map_set(&cell_target, "value".to_string(), value)?;
                }
                Some(SessionReadValue::Any(Any::Object(cell_obj))) => {
                    let upgraded = upgrade_cell_object_to_map(*cell_obj, column_id, value);
                    page.inner_mut()
                        .map_set(&row_target, column_id.to_string(), upgraded)?;
                }
                _ => {
                    let cell_val = SessionValue::Map(vec![
                        (
                            "columnId".to_string(),
                            SessionValue::Any(Any::String(column_id.to_string())),
                        ),
                        ("value".to_string(), value),
                    ]);
                    page.inner_mut()
                        .map_set(&row_target, column_id.to_string(), cell_val)?;
                }
            }
        }
        Some(SessionReadValue::Any(Any::Object(mut row_obj))) => {
            let updated_cell = match row_obj.remove(column_id) {
                Some(Any::Object(cell_obj)) => {
                    upgrade_cell_object_to_map(*cell_obj, column_id, value)
                }
                _ => SessionValue::Map(vec![
                    (
                        "columnId".to_string(),
                        SessionValue::Any(Any::String(column_id.to_string())),
                    ),
                    ("value".to_string(), value),
                ]),
            };
            let mut upgraded_row: Vec<(String, SessionValue)> = row_obj
                .into_iter()
                .map(|(k, v)| (k, any_to_session_value(v)))
                .collect();
            upgraded_row.push((column_id.to_string(), updated_cell));
            page.inner_mut().map_set(
                &cells_target,
                row_id.to_string(),
                SessionValue::Map(upgraded_row),
            )?;
        }
        _ => {
            let cell_val = SessionValue::Map(vec![
                (
                    "columnId".to_string(),
                    SessionValue::Any(Any::String(column_id.to_string())),
                ),
                ("value".to_string(), value),
            ]);
            page.inner_mut().map_set(
                &cells_target,
                row_id.to_string(),
                SessionValue::Map(vec![(column_id.to_string(), cell_val)]),
            )?;
        }
    }
    Ok(())
}

pub(super) fn database_row_exists(page: &PageDocSession, block_id: &str, row_id: &str) -> bool {
    let children_target =
        TypeTarget::Path(TypePath::root("blocks").key(block_id).key("sys:children"));
    page.inner()
        .read_array(&children_target)
        .ok()
        .is_some_and(|items| {
            items
                .iter()
                .any(|item| matches!(item, SessionReadValue::Any(Any::String(id)) if id == row_id))
        })
}

pub(super) fn ensure_database_block_exists(page: &PageDocSession, block_id: &str) -> DocResult<()> {
    let db_target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
    let children_val = page
        .inner()
        .get_map_value(&db_target, "sys:children")
        .map_err(|_| DocError::BlockNotFound(block_id.to_string()))?;
    if !matches!(children_val, Some(SessionReadValue::Array(_))) {
        return Err(DocError::BlockNotFound(block_id.to_string()));
    }
    Ok(())
}

impl PageDocSession {
    /// Toggle or set a boolean (`checkbox`) cell inside an `affine:database` block as one
    /// tracked undo step, preserving sibling columns and any unknown extension keys.
    pub fn set_database_cell_bool(
        &mut self,
        block_id: &str,
        row_id: &str,
        column_id: &str,
        checked: bool,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.set_database_cell_value(
            block_id,
            row_id,
            column_id,
            DatabaseCellSpec::Bool(checked),
            now_ms,
        )
    }

    /// Set any typed cell value (`rich-text`, `select`, `multi-select`, `number`, `progress`,
    /// `date`, `checkbox`, `link`, or `Null`) inside an `affine:database` block as one tracked
    /// undo step, preserving sibling columns and unknown extension keys.
    pub fn set_database_cell_value(
        &mut self,
        block_id: &str,
        row_id: &str,
        column_id: &str,
        value: DatabaseCellSpec,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        if !database_row_exists(self, block_id, row_id) {
            return Ok(None);
        }
        let block_id = block_id.to_string();
        let row_id = row_id.to_string();
        let column_id = column_id.to_string();
        self.structural_edit(now_ms, move |page| {
            write_cell_in_tx(
                page,
                &block_id,
                &row_id,
                &column_id,
                value.into_session_value(),
            )
        })
    }

    /// Replace the plain title text of one `affine:database` row block as one tracked undo step.
    pub fn set_database_row_title(
        &mut self,
        block_id: &str,
        row_id: &str,
        title: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        if !database_row_exists(self, block_id, row_id) {
            return Ok(None);
        }
        let row_id = row_id.to_string();
        let title = title.to_string();
        self.structural_edit(now_ms, move |page| {
            let text_target =
                TypeTarget::Path(TypePath::root("blocks").key(&row_id).key("prop:text"));
            let existing = page
                .inner()
                .read_text_string(&text_target)
                .unwrap_or_default();
            if existing == title {
                return Ok(());
            }
            let existing_u16 = existing.encode_utf16().count() as u64;
            if existing_u16 > 0 {
                page.inner_mut()
                    .text_remove(&text_target, 0, existing_u16)?;
            }
            if !title.is_empty() {
                page.inner_mut().text_insert(&text_target, 0, &title)?;
            }
            Ok(())
        })
    }

    /// Append a new empty `affine:paragraph` row block under an `affine:database` block AND
    /// pre-initialize its empty shared `Y.Map` entry in `prop:cells[row_id]` within the same
    /// tracked commit.
    pub fn add_database_row(
        &mut self,
        block_id: &str,
        row_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.add_database_row_with_cells(block_id, row_id, "", Vec::new(), now_ms)
    }

    /// Append a new `affine:paragraph` row block with initial title and cell values under an
    /// `affine:database` block in one tracked undo step (used by Calendar day `+` creation and
    /// Kanban lane creation).
    pub fn add_database_row_with_cells(
        &mut self,
        block_id: &str,
        row_id: &str,
        title: &str,
        initial_cells: Vec<(String, DatabaseCellSpec)>,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        ensure_database_block_exists(self, block_id)?;
        let db_target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let existing_cells = self.inner().get_map_value(&db_target, "prop:cells")?;
        if !matches!(
            existing_cells,
            None | Some(SessionReadValue::Map(_)) | Some(SessionReadValue::Any(Any::Object(_)))
        ) {
            return Err(DocError::InvalidState(
                "database prop:cells has unsupported scalar representation".into(),
            ));
        }
        let block_id = block_id.to_string();
        let row_id = row_id.to_string();
        let title = title.to_string();
        self.structural_edit(now_ms, move |page| {
            let db_path = TypePath::root("blocks").key(&block_id);
            let db_map_target = TypeTarget::Path(db_path.clone());
            let cells_target = TypeTarget::Path(db_path.clone().key("prop:cells"));
            let row_entries: Vec<(String, SessionValue)> = initial_cells
                .into_iter()
                .map(|(col_id, spec)| {
                    let cell_val = SessionValue::Map(vec![
                        (
                            "columnId".to_string(),
                            SessionValue::Any(Any::String(col_id.clone())),
                        ),
                        ("value".to_string(), spec.into_session_value()),
                    ]);
                    (col_id, cell_val)
                })
                .collect();
            let current_cells = page.inner().get_map_value(&db_map_target, "prop:cells")?;
            match current_cells {
                Some(SessionReadValue::Map(_)) => {
                    page.inner_mut().map_set(
                        &cells_target,
                        row_id.clone(),
                        SessionValue::Map(row_entries),
                    )?;
                }
                Some(SessionReadValue::Any(Any::Object(cells_obj))) => {
                    let mut upgraded: Vec<(String, SessionValue)> = cells_obj
                        .into_iter()
                        .filter(|(r_id, _)| r_id != &row_id)
                        .map(|(r_id, r_val)| (r_id, any_to_session_value(r_val)))
                        .collect();
                    upgraded.push((row_id.clone(), SessionValue::Map(row_entries)));
                    page.inner_mut().map_set(
                        &db_map_target,
                        "prop:cells".to_string(),
                        SessionValue::Map(upgraded),
                    )?;
                }
                None => {
                    page.inner_mut().map_set(
                        &db_map_target,
                        "prop:cells".to_string(),
                        SessionValue::Map(vec![(row_id.clone(), SessionValue::Map(row_entries))]),
                    )?;
                }
                Some(_) => {
                    return Err(DocError::InvalidState(
                        "database prop:cells has unsupported scalar representation".into(),
                    ));
                }
            }
            let entries = BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: title,
            }
            .into_yblock_entries(&row_id);
            let blocks_target = TypeTarget::Path(TypePath::root("blocks"));
            page.inner_mut()
                .map_set(&blocks_target, row_id.clone(), SessionValue::Map(entries))?;
            let children_target = TypeTarget::Path(db_path.key("sys:children"));
            page.inner_mut().array_push(
                &children_target,
                vec![SessionValue::Any(Any::String(row_id.clone()))],
            )?;
            Ok(())
        })
    }

    /// Reschedule a Calendar row by shifting its `start_column_id` (and preserving duration by
    /// shifting `end_column_id` when present) in one tracked undo step.
    #[allow(clippy::too_many_arguments)]
    pub fn reschedule_database_calendar_row(
        &mut self,
        block_id: &str,
        row_id: &str,
        start_col_id: &str,
        end_col_id: Option<&str>,
        new_start_ms: i64,
        new_end_ms: Option<i64>,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        if !database_row_exists(self, block_id, row_id) {
            return Ok(None);
        }
        let block_id = block_id.to_string();
        let row_id = row_id.to_string();
        let start_col_id = start_col_id.to_string();
        let end_col_id = end_col_id.map(str::to_string);
        self.structural_edit(now_ms, move |page| {
            write_cell_in_tx(
                page,
                &block_id,
                &row_id,
                &start_col_id,
                DatabaseCellSpec::Integer(new_start_ms).into_session_value(),
            )?;
            if let (Some(end_col), Some(end_ms)) = (end_col_id.as_deref(), new_end_ms) {
                write_cell_in_tx(
                    page,
                    &block_id,
                    &row_id,
                    end_col,
                    DatabaseCellSpec::Integer(end_ms).into_session_value(),
                )?;
            }
            Ok(())
        })
    }
}
