//! CRDT `SessionValue` / `Any` conversion and cross-ID remapping helpers for
//! Edgeless canvas clipboard paste (`edgeless/paste.rs`).

use std::collections::HashMap;

use blocksuite_playground_doc::{schema::map_array_any, session::PageDocSession};
use serde_json::{Map, Value};
use y_octo::{Any, SessionValue, TextDeltaOp, TextInsert};

pub(super) const PASTE_OFFSET: f64 = 24.0;

pub(super) fn offset_xywh_by(raw: &str, dx: f64, dy: f64) -> String {
    match super::parse_xywh(raw) {
        Some(r) => PageDocSession::format_xywh([
            f64::from(r.x) + dx,
            f64::from(r.y) + dy,
            f64::from(r.w),
            f64::from(r.h),
        ]),
        None => raw.to_string(),
    }
}

pub(super) fn remap_database_cells(val: &Value, id_map: &HashMap<String, String>) -> SessionValue {
    let inner = val
        .as_object()
        .and_then(|o| o.get("value").and_then(Value::as_object).or(Some(o)));
    let Some(rows) = inner else {
        return SessionValue::Map(Vec::new());
    };
    let mut remapped = Vec::with_capacity(rows.len());
    for (old_row_id, row_cells) in rows {
        let new_row_id = id_map
            .get(old_row_id)
            .cloned()
            .unwrap_or_else(|| old_row_id.clone());
        remapped.push((new_row_id, block_json_to_session_value(row_cells, id_map)));
    }
    SessionValue::Map(remapped)
}

pub(super) fn remap_surface_element(
    elem: &Map<String, Value>,
    new_id: &str,
    new_index: &str,
    id_map: &HashMap<String, String>,
) -> Vec<(String, SessionValue)> {
    remap_surface_element_with_offset(elem, new_id, new_index, PASTE_OFFSET, PASTE_OFFSET, id_map)
}

pub(super) fn remap_surface_element_with_offset(
    elem: &Map<String, Value>,
    new_id: &str,
    new_index: &str,
    dx: f64,
    dy: f64,
    id_map: &HashMap<String, String>,
) -> Vec<(String, SessionValue)> {
    let elem_type = elem.get("type").and_then(Value::as_str).unwrap_or("");
    let mut entries = Vec::new();
    for (k, v) in elem {
        match k.as_str() {
            "id" => entries.push((
                "id".to_string(),
                SessionValue::Any(Any::String(new_id.to_string())),
            )),
            "index" => entries.push((
                "index".to_string(),
                SessionValue::Any(Any::String(new_index.to_string())),
            )),
            "xywh" => {
                let shifted = v
                    .as_str()
                    .map(|s| offset_xywh_by(s, dx, dy))
                    .unwrap_or_default();
                entries.push(("xywh".to_string(), SessionValue::Any(Any::String(shifted))));
            }
            "children" if elem_type == "mindmap" => {
                entries.push(("children".to_string(), remap_mindmap_children(v, id_map)));
            }
            "children" if elem_type == "group" => {
                entries.push(("children".to_string(), remap_group_children(v, id_map)));
            }
            "source" | "target" if elem_type == "connector" => {
                entries.push((k.clone(), remap_connector_endpoint(v, dx, dy, id_map)));
            }
            "childElementIds" if elem_type == "frame" => {
                entries.push((
                    "childElementIds".to_string(),
                    remap_group_children(v, id_map),
                ));
            }
            _ => {
                entries.push((k.clone(), surface_json_to_session_value(v)));
            }
        }
    }
    if !elem.contains_key("id") {
        entries.push((
            "id".to_string(),
            SessionValue::Any(Any::String(new_id.to_string())),
        ));
    }
    if !elem.contains_key("index") {
        entries.push((
            "index".to_string(),
            SessionValue::Any(Any::String(new_index.to_string())),
        ));
    }
    entries
}

pub(super) fn remap_mindmap_children(
    val: &Value,
    id_map: &HashMap<String, String>,
) -> SessionValue {
    let inner = val
        .as_object()
        .and_then(|o| o.get("value").and_then(Value::as_object).or(Some(o)));
    let Some(map) = inner else {
        return surface_json_to_session_value(val);
    };
    // Yjs 13.6.21 `Y.Map` instances carry an inherited `.parent` getter pointing to their parent
    // YType container, so Web `mindmap.ts` stores each child's detail as a plain JSON object
    // (`Any::Object({ index, parent?, collapsed? })`) inside `Y.Map<nodeId, Any::Object>`, NOT a
    // nested `Y.Map`.
    let mut remapped: Vec<(String, SessionValue)> = Vec::new();
    for (old_child_id, entry_val) in map {
        let new_child_id = id_map
            .get(old_child_id)
            .cloned()
            .unwrap_or_else(|| old_child_id.clone());
        let entry_session = if let Some(entry_obj) = entry_val.as_object() {
            let mut fields = HashMap::new();
            for (fk, fv) in entry_obj {
                if fk == "parent" {
                    if let Some(old_parent) = fv.as_str().filter(|s| !s.is_empty()) {
                        let remapped_parent = id_map
                            .get(old_parent)
                            .cloned()
                            .unwrap_or_else(|| old_parent.to_string());
                        fields.insert("parent".to_string(), Any::String(remapped_parent));
                    }
                } else {
                    fields.insert(fk.clone(), json_to_any(fv));
                }
            }
            SessionValue::Any(Any::Object(Box::new(fields.into_iter().collect())))
        } else {
            SessionValue::Any(json_to_any(entry_val))
        };
        remapped.push((new_child_id, entry_session));
    }
    SessionValue::Map(remapped)
}

pub(crate) fn remap_group_children(val: &Value, id_map: &HashMap<String, String>) -> SessionValue {
    let inner = val
        .as_object()
        .and_then(|o| o.get("value").and_then(Value::as_object).or(Some(o)));
    let Some(map) = inner else {
        return surface_json_to_session_value(val);
    };
    let mut remapped: Vec<(String, SessionValue)> = Vec::new();
    for (old_id, v) in map {
        let is_active = match v {
            Value::Bool(b) => *b,
            Value::Null => false,
            Value::Object(o) => o.get("value").and_then(Value::as_bool).unwrap_or(true),
            _ => true,
        };
        if !is_active {
            continue;
        }
        let Some(new_id) = id_map.get(old_id) else {
            continue;
        };
        remapped.push((new_id.clone(), SessionValue::Any(Any::True)));
    }
    SessionValue::Map(remapped)
}

pub(super) fn remap_connector_endpoint(
    val: &Value,
    dx: f64,
    dy: f64,
    id_map: &HashMap<String, String>,
) -> SessionValue {
    let Some(obj) = val.as_object() else {
        return surface_json_to_session_value(val);
    };
    let has_id = obj
        .get("id")
        .and_then(Value::as_str)
        .is_some_and(|s| !s.is_empty());
    let mut out = HashMap::new();
    for (k, v) in obj {
        if k == "id"
            && let Some(old_id) = v.as_str()
            && let Some(new_id) = id_map.get(old_id)
        {
            out.insert(k.clone(), Any::String(new_id.clone()));
            continue;
        }
        if k == "position"
            && !has_id
            && let Some(arr) = v.as_array()
            && arr.len() == 2
            && let (Some(x), Some(y)) = (arr[0].as_f64(), arr[1].as_f64())
        {
            out.insert(
                k.clone(),
                Any::Array(vec![
                    Any::Float64((x + dx).into()),
                    Any::Float64((y + dy).into()),
                ]),
            );
            continue;
        }
        out.insert(k.clone(), json_to_any(v));
    }
    SessionValue::Any(Any::Object(Box::new(out.into_iter().collect())))
}

pub(super) fn decode_delta_with_remapped_refs(
    delta: &[Value],
    id_map: Option<&HashMap<String, String>>,
) -> SessionValue {
    let mut ops = Vec::with_capacity(delta.len());
    for op in delta {
        if let Some(s) = op.get("insert").and_then(Value::as_str) {
            let format = op
                .get("attributes")
                .and_then(Value::as_object)
                .map(|attrs| {
                    attrs
                        .iter()
                        .map(|(ak, av)| {
                            if ak == "reference"
                                && let Some(map) = id_map
                                && let Some(ref_obj) = av.as_object()
                                && let Some(old_pid) = ref_obj.get("pageId").and_then(Value::as_str)
                                && let Some(new_pid) = map.get(old_pid)
                            {
                                let mut cloned = ref_obj.clone();
                                cloned.insert("pageId".to_string(), Value::String(new_pid.clone()));
                                return (ak.clone(), json_to_any(&Value::Object(cloned)));
                            }
                            (ak.clone(), json_to_any(av))
                        })
                        .collect()
                });
            ops.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(s.to_string()),
                format,
            });
        }
    }
    SessionValue::Text(ops)
}

/// BlockSuite `native2Y` conversion for `blocks` entries: JSON arrays become shared `Y.Array`s
/// (`SessionValue::Array`), JSON objects become shared `Y.Map`s (`SessionValue::Map`), and
/// `$blocksuite:internal:native$` wrappers are unwrapped.
pub(super) fn block_json_to_session_value(
    v: &Value,
    id_map: &HashMap<String, String>,
) -> SessionValue {
    match v {
        Value::Object(map) => {
            if let Some(delta) = map.get("delta").and_then(Value::as_array) {
                return decode_delta_with_remapped_refs(delta, Some(id_map));
            }
            if map.get("$blocksuite:internal:native$") == Some(&Value::Bool(true))
                && let Some(inner) = map.get("value")
            {
                return block_json_to_session_value(inner, id_map);
            }
            SessionValue::Map(
                map.iter()
                    .map(|(k, val)| (k.clone(), block_json_to_session_value(val, id_map)))
                    .collect(),
            )
        }
        Value::Array(items) => SessionValue::Array(
            items
                .iter()
                .map(|val| block_json_to_session_value(val, id_map))
                .collect(),
        ),
        _ => SessionValue::Any(json_to_any(v)),
    }
}

/// Surface element field conversion inside `prop:elements.value`: plain JSON arrays on a
/// surface element `Y.Map` (`padding`, `points`, `labelXYWH`) must be wrapped via `map_array_any`
/// so `y-octo`'s `From<Any> for Content` preserves empty and single-element JS arrays.
pub(super) fn surface_json_to_session_value(v: &Value) -> SessionValue {
    match v {
        Value::Object(map) => {
            if let Some(delta) = map.get("delta").and_then(Value::as_array) {
                return decode_delta_with_remapped_refs(delta, None);
            }
            if map.get("$blocksuite:internal:native$") == Some(&Value::Bool(true))
                && let Some(inner) = map.get("value")
            {
                return surface_json_to_session_value(inner);
            }
            SessionValue::Map(
                map.iter()
                    .map(|(k, val)| (k.clone(), surface_json_to_session_value(val)))
                    .collect(),
            )
        }
        Value::Array(arr) => {
            SessionValue::Any(map_array_any(arr.iter().map(json_to_any).collect()))
        }
        _ => SessionValue::Any(json_to_any(v)),
    }
}

pub(super) fn json_to_any(v: &Value) -> Any {
    match v {
        Value::Null => Any::Null,
        Value::Bool(b) => {
            if *b {
                Any::True
            } else {
                Any::False
            }
        }
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                if let Ok(i32_val) = i32::try_from(i) {
                    Any::Integer(i32_val)
                } else {
                    Any::Float64((i as f64).into())
                }
            } else {
                Any::Float64(n.as_f64().unwrap_or(0.0).into())
            }
        }
        Value::String(s) => Any::String(s.clone()),
        Value::Array(arr) => Any::Array(arr.iter().map(json_to_any).collect()),
        Value::Object(map) => Any::Object(Box::new(
            map.iter()
                .map(|(k, val)| (k.clone(), json_to_any(val)))
                .collect(),
        )),
    }
}
