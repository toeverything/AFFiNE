use y_octo::{AHashMap, Any, SessionReadValue, SessionValue, TypePath, TypeTarget};

use crate::{
    DocError, DocResult,
    schema::{BlockSpec, ParagraphType},
};

use super::{PageCommit, PageDocSession};

fn any_to_session_value(any: Any) -> SessionValue {
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
    bool_any: Any,
) -> SessionValue {
    cell_obj
        .entry("columnId".to_string())
        .or_insert_with(|| Any::String(column_id.to_string()));
    cell_obj.insert("value".to_string(), bool_any);
    SessionValue::Map(
        cell_obj
            .into_iter()
            .map(|(k, v)| (k, any_to_session_value(v)))
            .collect(),
    )
}

impl PageDocSession {
    /// Toggle or set a boolean (`checkbox`) cell inside an `affine:database` block as one
    /// tracked undo step, preserving sibling columns and any unknown extension keys.
    ///
    /// Canonical `0.27.5` `native2Y` database rows and cells are shared `Y.Map`s, so concurrent
    /// edits to distinct columns of the same row converge losslessly. When a legacy document
    /// stores a row or cell as an atomic `Any::Object` scalar, the first write lazily upgrades
    /// it to a shared `Y.Map` (`SessionValue::Map`) while preserving all sibling columns and
    /// unknown keys; once synced, subsequent cross-column edits merge per-column in `Y.Map`,
    /// while concurrent offline first-time upgrades of an unupgraded atomic `Any::Object` follow
    /// native Yjs V1 `Y.Map` LWW semantics.
    pub fn set_database_cell_bool(
        &mut self,
        block_id: &str,
        row_id: &str,
        column_id: &str,
        checked: bool,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let children_target =
            TypeTarget::Path(TypePath::root("blocks").key(block_id).key("sys:children"));
        let row_exists = self
            .inner()
            .read_array(&children_target)
            .ok()
            .is_some_and(|items| {
                items.iter().any(
                    |item| matches!(item, SessionReadValue::Any(Any::String(id)) if id == row_id),
                )
            });
        if !row_exists {
            return Ok(None);
        }
        let block_id = block_id.to_string();
        let row_id = row_id.to_string();
        let column_id = column_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let cells_path = TypePath::root("blocks").key(&block_id).key("prop:cells");
            let cells_target = TypeTarget::Path(cells_path.clone());
            let bool_any = if checked { Any::True } else { Any::False };
            let existing_row = page.inner().get_map_value(&cells_target, &row_id)?;
            match existing_row {
                Some(SessionReadValue::Map(_)) => {
                    let row_path = cells_path.key(&row_id);
                    let row_target = TypeTarget::Path(row_path.clone());
                    let existing_cell = page.inner().get_map_value(&row_target, &column_id)?;
                    match existing_cell {
                        Some(SessionReadValue::Map(_)) => {
                            let cell_target = TypeTarget::Path(row_path.key(&column_id));
                            if page
                                .inner()
                                .get_map_value(&cell_target, "columnId")?
                                .is_none()
                            {
                                page.inner_mut().map_set(
                                    &cell_target,
                                    "columnId".to_string(),
                                    SessionValue::Any(Any::String(column_id.clone())),
                                )?;
                            }
                            page.inner_mut().map_set(
                                &cell_target,
                                "value".to_string(),
                                SessionValue::Any(bool_any),
                            )?;
                        }
                        Some(SessionReadValue::Any(Any::Object(cell_obj))) => {
                            let upgraded =
                                upgrade_cell_object_to_map(*cell_obj, &column_id, bool_any);
                            page.inner_mut()
                                .map_set(&row_target, column_id.clone(), upgraded)?;
                        }
                        _ => {
                            let cell_val = SessionValue::Map(vec![
                                (
                                    "columnId".to_string(),
                                    SessionValue::Any(Any::String(column_id.clone())),
                                ),
                                ("value".to_string(), SessionValue::Any(bool_any)),
                            ]);
                            page.inner_mut()
                                .map_set(&row_target, column_id.clone(), cell_val)?;
                        }
                    }
                }
                Some(SessionReadValue::Any(Any::Object(mut row_obj))) => {
                    let updated_cell = match row_obj.remove(&column_id) {
                        Some(Any::Object(cell_obj)) => {
                            upgrade_cell_object_to_map(*cell_obj, &column_id, bool_any)
                        }
                        _ => SessionValue::Map(vec![
                            (
                                "columnId".to_string(),
                                SessionValue::Any(Any::String(column_id.clone())),
                            ),
                            ("value".to_string(), SessionValue::Any(bool_any)),
                        ]),
                    };
                    let mut upgraded_row: Vec<(String, SessionValue)> = row_obj
                        .into_iter()
                        .map(|(k, v)| (k, any_to_session_value(v)))
                        .collect();
                    upgraded_row.push((column_id.clone(), updated_cell));
                    page.inner_mut().map_set(
                        &cells_target,
                        row_id.clone(),
                        SessionValue::Map(upgraded_row),
                    )?;
                }
                _ => {
                    let cell_val = SessionValue::Map(vec![
                        (
                            "columnId".to_string(),
                            SessionValue::Any(Any::String(column_id.clone())),
                        ),
                        ("value".to_string(), SessionValue::Any(bool_any)),
                    ]);
                    page.inner_mut().map_set(
                        &cells_target,
                        row_id.clone(),
                        SessionValue::Map(vec![(column_id.clone(), cell_val)]),
                    )?;
                }
            }
            Ok(())
        })
    }

    /// Append a new empty `affine:paragraph` row block under an `affine:database` block AND
    /// pre-initialize its empty shared `Y.Map` entry in `prop:cells[row_id]` within the same
    /// tracked commit, so concurrent peers toggling distinct columns on the newly added row
    /// mutate keys on the same shared `Y.Map` identity and converge losslessly.
    pub fn add_database_row(
        &mut self,
        block_id: &str,
        row_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let db_target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let children_val = self
            .inner()
            .get_map_value(&db_target, "sys:children")
            .map_err(|_| DocError::BlockNotFound(block_id.to_string()))?;
        if !matches!(children_val, Some(SessionReadValue::Array(_))) {
            return Err(DocError::BlockNotFound(block_id.to_string()));
        }
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
        self.structural_edit(now_ms, move |page| {
            let db_path = TypePath::root("blocks").key(&block_id);
            let db_map_target = TypeTarget::Path(db_path.clone());
            let cells_target = TypeTarget::Path(db_path.clone().key("prop:cells"));
            let current_cells = page.inner().get_map_value(&db_map_target, "prop:cells")?;
            match current_cells {
                Some(SessionReadValue::Map(_)) => {
                    page.inner_mut().map_set(
                        &cells_target,
                        row_id.clone(),
                        SessionValue::Map(Vec::new()),
                    )?;
                }
                Some(SessionReadValue::Any(Any::Object(cells_obj))) => {
                    let mut upgraded: Vec<(String, SessionValue)> = cells_obj
                        .into_iter()
                        .filter(|(r_id, _)| r_id != &row_id)
                        .map(|(r_id, r_val)| (r_id, any_to_session_value(r_val)))
                        .collect();
                    upgraded.push((row_id.clone(), SessionValue::Map(Vec::new())));
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
                        SessionValue::Map(vec![(row_id.clone(), SessionValue::Map(Vec::new()))]),
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
                text: String::new(),
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
}
