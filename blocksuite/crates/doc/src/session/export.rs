use serde_json::{Map as JsonMap, Value as JsonValue};
use y_octo::{
    Any, RelativePosition, SessionCommit, SessionReadValue, TextDeltaOp, TextInsert, TypePath,
    TypeTarget,
};

use crate::{DocError, DocResult, schema::UnknownBlock};

use super::{PageDocSession, ResolvedSelection, SelectionSnapshot, block_target};

impl PageDocSession {
    /// Capture a relative-position selection snapshot on a text property and attach
    /// it to the top undo item of this page's `blocks` undo stack.
    pub fn capture_selection_snapshot(
        &self,
        anchor_block_id: &str,
        anchor_offset: u64,
        focus_block_id: &str,
        focus_offset: u64,
    ) -> DocResult<SelectionSnapshot> {
        let anchor_target = self.editable_text_target(anchor_block_id)?;
        let focus_target = self.editable_text_target(focus_block_id)?;
        let anchor = self
            .session
            .create_relative_position(&anchor_target, anchor_offset, 0)?;
        let focus = self
            .session
            .create_relative_position(&focus_target, focus_offset, 0)?;
        Ok(SelectionSnapshot {
            anchor_block_id: anchor_block_id.to_string(),
            anchor,
            focus_block_id: focus_block_id.to_string(),
            focus,
        })
    }

    /// Read only the edited Y.Text for incremental layout, together with its snapshot property.
    pub fn read_editable_text(&self, id: &str) -> DocResult<(crate::read::RichText, JsonValue)> {
        let target = self.editable_text_target(id)?;
        let TypeTarget::Identity(identity) = &target else {
            unreachable!()
        };
        let value = self.export_y_value(&SessionReadValue::Text(identity.clone()))?;
        Ok((
            crate::read::RichText {
                plain: self.session.read_text_string(&target)?,
                delta: self.session.read_text_delta(&target)?,
            },
            value,
        ))
    }

    pub(super) fn editable_text_target(&self, block_id: &str) -> DocResult<TypeTarget> {
        let block = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let title = matches!(self.session.get_map_value(&block, "sys:flavour")?,
            Some(SessionReadValue::Any(Any::String(name))) if name == "affine:page");
        let key = if title { "prop:title" } else { "prop:text" };
        match self.session.get_map_value(&block, key)? {
            Some(SessionReadValue::Text(identity)) => Ok(TypeTarget::Identity(identity)),
            _ => Err(DocError::InvalidState(format!("missing {block_id}.{key}"))),
        }
    }

    pub fn resolve_selection_snapshot(
        &self,
        snapshot: &SelectionSnapshot,
    ) -> DocResult<Option<ResolvedSelection>> {
        let resolve = |id: &str, position: &RelativePosition| {
            let absolute = self.session.resolve_relative_position(position, true)?;
            let target = self.editable_text_target(id).ok()?;
            (target == TypeTarget::Identity(absolute.r#type))
                .then(|| (id.to_owned(), absolute.index))
        };
        Ok(resolve(&snapshot.anchor_block_id, &snapshot.anchor)
            .zip(resolve(&snapshot.focus_block_id, &snapshot.focus))
            .map(|(anchor, focus)| ResolvedSelection { anchor, focus }))
    }

    pub fn set_undo_selection_snapshot(&self, snapshot: SelectionSnapshot) -> DocResult<bool> {
        Ok(self.session.set_stack_selection_meta(
            self.undo_stack_id,
            y_octo::UndoStack::Undo,
            snapshot,
        )?)
    }

    pub fn undo(&mut self) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        let res = self.session.undo_stack(self.undo_stack_id)?;
        self.refresh_all_surface_orders();
        Ok(self.record_commit(res))
    }

    pub fn redo(&mut self) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        let res = self.session.redo_stack(self.undo_stack_id)?;
        self.refresh_all_surface_orders();
        Ok(self.record_commit(res))
    }

    pub fn can_undo(&self) -> bool {
        self.session.can_undo_stack(self.undo_stack_id)
    }

    pub fn can_redo(&self) -> bool {
        self.session.can_redo_stack(self.undo_stack_id)
    }

    pub fn stop_capturing(&mut self) -> DocResult {
        Ok(self.session.stop_capturing_stack(self.undo_stack_id)?)
    }

    /// Read a block as a lossless [`UnknownBlock`] descriptor without mutating its Y.Map.
    pub fn read_unknown_block(&self, block_id: &str) -> DocResult<UnknownBlock> {
        let block_target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let entries = self
            .session
            .read_map(&block_target)
            .map_err(|_| DocError::BlockNotFound(block_id.to_string()))?;

        let mut id = block_id.to_string();
        let mut flavour = String::new();
        let mut version = None;
        let mut children = Vec::new();
        let mut prop_keys = Vec::new();

        for (k, v) in entries {
            match k.as_str() {
                "sys:id" => {
                    if let SessionReadValue::Any(Any::String(s)) = v {
                        id = s;
                    }
                }
                "sys:flavour" => {
                    if let SessionReadValue::Any(Any::String(s)) = v {
                        flavour = s;
                    }
                }
                "sys:version" => {
                    if let SessionReadValue::Any(Any::Integer(n)) = v {
                        version = Some(i64::from(n));
                    } else if let SessionReadValue::Any(Any::Float64(f)) = v {
                        version = Some(f.0 as i64);
                    }
                }
                "sys:children" => {
                    if let SessionReadValue::Array(arr_id) = v {
                        let arr = self.session.read_array(&TypeTarget::Identity(arr_id))?;
                        for item in arr {
                            if let SessionReadValue::Any(Any::String(s)) = item {
                                children.push(s);
                            }
                        }
                    }
                }
                key if key.starts_with("prop:") => {
                    prop_keys.push(key.to_string());
                }
                _ => {}
            }
        }
        prop_keys.sort();

        Ok(UnknownBlock {
            id,
            flavour,
            version,
            children,
            prop_keys,
        })
    }

    /// Export a normalized JSON representation matching BlockSuite's snapshot structure
    /// for L0 oracle convergence assertions.
    pub fn export_doc_json(&self) -> DocResult<JsonValue> {
        let blocks = self.session.read_map(&self.blocks_target)?;
        let mut out_blocks = JsonMap::new();
        for (block_id, val) in blocks {
            if let SessionReadValue::Map(map_id) = val {
                out_blocks.insert(
                    block_id,
                    self.export_y_value(&SessionReadValue::Map(map_id))?,
                );
            }
        }
        let mut root = JsonMap::new();
        root.insert(
            "guid".to_string(),
            JsonValue::String(self.guid().to_string()),
        );
        root.insert("blocks".to_string(), JsonValue::Object(out_blocks));
        Ok(JsonValue::Object(root))
    }

    pub fn export_slice_props(&self, id: &str) -> DocResult<JsonMap<String, JsonValue>> {
        self.session
            .read_map(&block_target(id))?
            .into_iter()
            .filter(|(key, _)| key.starts_with("prop:"))
            .map(|(key, value)| Ok((key, self.export_slice_value(&value)?)))
            .collect()
    }

    fn export_slice_value(&self, value: &SessionReadValue) -> DocResult<JsonValue> {
        match value {
            SessionReadValue::Map(id) => {
                let entries = self.session.read_map(&TypeTarget::Identity(id.clone()))?;
                Ok(JsonValue::Object(
                    entries
                        .into_iter()
                        .map(|(k, v)| Ok((k, self.export_slice_value(&v)?)))
                        .collect::<DocResult<_>>()?,
                ))
            }
            SessionReadValue::Array(id) => {
                let items = self.session.read_array(&TypeTarget::Identity(id.clone()))?;
                Ok(JsonValue::Array(
                    items
                        .iter()
                        .map(|v| self.export_slice_value(v))
                        .collect::<DocResult<_>>()?,
                ))
            }
            SessionReadValue::Text(_) => Ok(
                serde_json::json!({"$blocksuite:internal:text$":true, "delta":self.export_y_value(value)?}),
            ),
            _ => self.export_y_value(value),
        }
    }

    pub(crate) fn export_y_value(&self, value: &SessionReadValue) -> DocResult<JsonValue> {
        match value {
            SessionReadValue::Any(any) => Ok(any_to_normalized_json(any)),
            SessionReadValue::Map(id) => {
                let entries = self.session.read_map(&TypeTarget::Identity(id.clone()))?;
                let mut map = JsonMap::new();
                for (k, v) in entries {
                    map.insert(k, self.export_y_value(&v)?);
                }
                Ok(JsonValue::Object(map))
            }
            SessionReadValue::Array(id) => {
                let items = self.session.read_array(&TypeTarget::Identity(id.clone()))?;
                let mut arr = Vec::with_capacity(items.len());
                for item in items {
                    arr.push(self.export_y_value(&item)?);
                }
                Ok(JsonValue::Array(arr))
            }
            SessionReadValue::Text(id) => {
                let delta = self
                    .session
                    .read_text_delta(&TypeTarget::Identity(id.clone()))?;
                let mut ops: Vec<JsonValue> = Vec::with_capacity(delta.len());
                for op in delta {
                    if let TextDeltaOp::Insert { insert, format } = op {
                        let attrs_obj = format.filter(|a| !a.is_empty()).map(|attrs| {
                            let mut attr_map = JsonMap::new();
                            for (k, v) in attrs {
                                attr_map.insert(k, any_to_normalized_json(&v));
                            }
                            JsonValue::Object(attr_map)
                        });

                        if let TextInsert::Text(s) = insert {
                            // Coalesce adjacent string inserts with identical attributes (matching Yjs toDelta()).
                            if let Some(JsonValue::Object(prev)) = ops.last_mut()
                                && prev.get("attributes") == attrs_obj.as_ref()
                                && let Some(JsonValue::String(prev_s)) = prev.get_mut("insert")
                            {
                                prev_s.push_str(&s);
                                continue;
                            }
                            let mut obj = JsonMap::new();
                            obj.insert("insert".to_string(), JsonValue::String(s));
                            if let Some(a) = attrs_obj {
                                obj.insert("attributes".to_string(), a);
                            }
                            ops.push(JsonValue::Object(obj));
                        } else if let TextInsert::Embed(items) = insert {
                            let embed_val = if items.len() == 1 {
                                any_to_normalized_json(&items[0])
                            } else {
                                JsonValue::Array(items.iter().map(any_to_normalized_json).collect())
                            };
                            let mut obj = JsonMap::new();
                            obj.insert("insert".to_string(), embed_val);
                            if let Some(a) = attrs_obj {
                                obj.insert("attributes".to_string(), a);
                            }
                            ops.push(JsonValue::Object(obj));
                        }
                    }
                }
                Ok(JsonValue::Array(ops))
            }
            SessionReadValue::Doc { guid, .. } => Ok(JsonValue::String(guid.clone())),
            SessionReadValue::XmlElement { identity, .. }
            | SessionReadValue::XmlFragment(identity)
            | SessionReadValue::XmlText(identity) => {
                let s = self
                    .session
                    .xml_to_string(&TypeTarget::Identity(identity.clone()))?;
                Ok(JsonValue::String(s))
            }
            SessionReadValue::XmlHook { name, .. } => Ok(JsonValue::String(name.clone())),
        }
    }
}

/// Normalize `y_octo::Any` to canonical `serde_json::Value` (integral floats become integers,
/// map keys sorted).
pub fn any_to_normalized_json(any: &Any) -> JsonValue {
    match any {
        Any::Null | Any::Undefined => JsonValue::Null,
        Any::True => JsonValue::Bool(true),
        Any::False => JsonValue::Bool(false),
        Any::Integer(i) => JsonValue::Number((*i).into()),
        Any::BigInt64(i) => JsonValue::Number((*i).into()),
        Any::Float32(f) => float_to_json(f64::from(f.0)),
        Any::Float64(f) => float_to_json(f.0),
        Any::String(s) => JsonValue::String(s.clone()),
        Any::Binary(b) => {
            JsonValue::Array(b.iter().map(|&x| JsonValue::Number(x.into())).collect())
        }
        Any::Array(items) => JsonValue::Array(items.iter().map(any_to_normalized_json).collect()),
        Any::Object(map) => {
            let mut sorted: Vec<(&String, &Any)> = map.iter().collect();
            sorted.sort_by_key(|(a, _)| *a);
            let mut obj = JsonMap::new();
            for (k, v) in sorted {
                obj.insert(k.clone(), any_to_normalized_json(v));
            }
            JsonValue::Object(obj)
        }
    }
}

fn float_to_json(f: f64) -> JsonValue {
    if f.is_finite() && f.fract() == 0.0 && f >= (i64::MIN as f64) && f <= (i64::MAX as f64) {
        JsonValue::Number((f as i64).into())
    } else {
        serde_json::Number::from_f64(f).map_or(JsonValue::Null, JsonValue::Number)
    }
}
