use std::collections::BTreeMap;

use serde_json::Value as JsonValue;
use y_octo::{Any, SessionReadValue, TypeTarget};

use crate::DocResult;

use super::{BlockContent, BlockNode, RawBlock, RichText, SnapshotReader, any_as_f64};

/// One option entry inside a `select` or `multi-select` database column's `data.options`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DatabaseSelectOption {
    pub id: String,
    pub value: String,
    pub color: String,
}

/// One column schema entry from `prop:columns` of an `affine:database` block.
#[derive(Debug, Clone, PartialEq)]
pub struct DatabaseColumn {
    pub id: String,
    pub column_type: String,
    pub name: String,
    pub data: JsonValue,
}

impl DatabaseColumn {
    /// Parse `data.options` for `select` / `multi-select` columns.
    pub fn select_options(&self) -> Vec<DatabaseSelectOption> {
        let Some(items) = self.data.get("options").and_then(JsonValue::as_array) else {
            return Vec::new();
        };
        items
            .iter()
            .filter_map(|item| {
                let obj = item.as_object()?;
                let id = obj.get("id")?.as_str()?.to_string();
                let value = obj
                    .get("value")
                    .and_then(JsonValue::as_str)
                    .unwrap_or_default()
                    .to_string();
                let color = obj
                    .get("color")
                    .and_then(JsonValue::as_str)
                    .unwrap_or("var(--affine-tag-gray)")
                    .to_string();
                Some(DatabaseSelectOption { id, value, color })
            })
            .collect()
    }
}

/// One typed cell value inside `prop:cells[rowId][columnId].value`.
#[derive(Debug, Clone, PartialEq)]
pub enum DatabaseCellValue {
    RichText(RichText),
    Text(String),
    MultiSelect(Vec<String>),
    Number(f64),
    Integer(i64),
    Bool(bool),
    Null,
    Json(JsonValue),
}

impl DatabaseCellValue {
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Self::Number(n) if n.is_finite() => Some(*n),
            Self::Integer(n) => Some(*n as f64),
            Self::Json(v) => v.as_f64().filter(|n| n.is_finite()),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Self::Integer(n) => Some(*n),
            Self::Number(n) if n.is_finite() => Some(*n as i64),
            Self::Json(v) => v
                .as_i64()
                .or_else(|| v.as_f64().filter(|n| n.is_finite()).map(|n| n as i64)),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Bool(b) => Some(*b),
            Self::Json(v) => v.as_bool(),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Text(s) => Some(s.as_str()),
            Self::RichText(rt) => Some(rt.plain.as_str()),
            Self::Json(v) => v.as_str(),
            _ => None,
        }
    }

    pub fn as_string_list(&self) -> Vec<String> {
        match self {
            Self::MultiSelect(items) => items.clone(),
            Self::Text(s) if !s.is_empty() => vec![s.clone()],
            Self::Json(JsonValue::Array(items)) => items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        match self {
            Self::Null => true,
            Self::Text(s) => s.is_empty(),
            Self::RichText(rt) => rt.is_empty(),
            Self::MultiSelect(items) => items.is_empty(),
            Self::Json(JsonValue::Null) => true,
            Self::Json(JsonValue::String(s)) => s.is_empty(),
            Self::Json(JsonValue::Array(items)) => items.is_empty(),
            _ => false,
        }
    }
}

/// View mode of a database view (`"table" | "kanban" | "calendar"` or unknown).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum DatabaseViewMode {
    Table,
    Kanban,
    Calendar,
    Unknown(String),
}

impl DatabaseViewMode {
    pub fn parse(raw: &str) -> Self {
        match raw {
            "table" => Self::Table,
            "kanban" => Self::Kanban,
            "calendar" => Self::Calendar,
            other => Self::Unknown(other.to_string()),
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::Table => "table",
            Self::Kanban => "kanban",
            Self::Calendar => "calendar",
            Self::Unknown(other) => other.as_str(),
        }
    }
}

/// Per-column layout settings inside a Table or Kanban view.
#[derive(Debug, Clone, PartialEq)]
pub struct DatabaseViewColumn {
    pub id: String,
    pub width: Option<f64>,
    pub hide: Option<bool>,
    pub stat_calc_type: Option<String>,
}

/// Group-by configuration inside a Table or Kanban view.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DatabaseGroupBy {
    pub kind: String,
    pub column_id: String,
    pub name: String,
    pub sort: Option<String>,
    pub hide_empty: Option<bool>,
}

/// Persisted group order, visibility, and manual card order inside a view.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DatabaseGroupProperty {
    pub key: String,
    pub hide: bool,
    pub manually_card_sort: Vec<String>,
}

/// Header property mapping of a Table or Kanban view.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DatabaseViewHeader {
    pub title_column: Option<String>,
    pub icon_column: Option<String>,
    pub image_column: Option<String>,
    pub cover_column: Option<String>,
}

/// Date column mapping of a Calendar view (`startColumnId` / `endColumnId`).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DatabaseCalendarDate {
    pub start_column_id: Option<String>,
    pub end_column_id: Option<String>,
}

/// Card display configuration of a Calendar view.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DatabaseCalendarCard {
    pub title_column_id: Option<String>,
    pub visible_property_ids: Vec<String>,
}

/// One view entry from `prop:views` of an `affine:database` block.
#[derive(Debug, Clone, PartialEq)]
pub struct DatabaseView {
    pub id: String,
    pub name: String,
    pub mode: DatabaseViewMode,
    pub columns: Vec<DatabaseViewColumn>,
    pub filter: Option<JsonValue>,
    pub sort: Option<JsonValue>,
    pub group_by: Option<DatabaseGroupBy>,
    pub group_properties: Vec<DatabaseGroupProperty>,
    pub header: Option<DatabaseViewHeader>,
    pub date: Option<DatabaseCalendarDate>,
    pub card: Option<DatabaseCalendarCard>,
    pub ui: Option<JsonValue>,
    /// Any additional unknown fields preserved losslessly.
    pub extra: BTreeMap<String, JsonValue>,
}

/// One row entry of an `affine:database` block, derived from its child block (`affine:paragraph` / `affine:list`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct DatabaseRow {
    pub row_id: String,
    pub title: RichText,
    pub created_at: Option<i64>,
}

/// Typed `affine:database` content read from `prop:title`, `prop:columns`, `prop:cells`, `prop:views`,
/// and child row blocks (`sys:children`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct DatabaseData {
    pub title: RichText,
    pub columns: Vec<DatabaseColumn>,
    pub rows: Vec<DatabaseRow>,
    pub cells: BTreeMap<(String, String), DatabaseCellValue>,
    pub views: Vec<DatabaseView>,
}

impl SnapshotReader<'_> {
    pub(super) fn read_database(
        &self,
        block: &RawBlock,
        props: &BTreeMap<String, JsonValue>,
        children: &[BlockNode],
    ) -> DocResult<DatabaseData> {
        let entries = &block.entries;
        let title = self.rich_text(entries.get("prop:title"))?;

        let columns = parse_columns(props.get("prop:columns"));
        let views = parse_views(props.get("prop:views"));
        let cells = self.read_database_cells(entries.get("prop:cells"), props.get("prop:cells"))?;

        let rows = children
            .iter()
            .map(|child| {
                let title = match &child.content {
                    BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => {
                        text.clone()
                    }
                    _ => RichText::default(),
                };
                let created_at = child
                    .props
                    .get("prop:meta:createdAt")
                    .and_then(json_as_i64)
                    .or_else(|| {
                        self.raw
                            .get(&child.id)
                            .and_then(|raw| raw.entries.get("sys:createdAt"))
                            .and_then(|v| match v {
                                SessionReadValue::Any(any) => any_as_f64(any).map(|n| n as i64),
                                _ => None,
                            })
                    });
                DatabaseRow {
                    row_id: child.id.clone(),
                    title,
                    created_at,
                }
            })
            .collect();

        Ok(DatabaseData {
            title,
            columns,
            rows,
            cells,
            views,
        })
    }

    fn read_database_cells(
        &self,
        raw_value: Option<&SessionReadValue>,
        normalized: Option<&JsonValue>,
    ) -> DocResult<BTreeMap<(String, String), DatabaseCellValue>> {
        let mut cells = BTreeMap::new();
        let session = self.page.inner();

        if let Some(SessionReadValue::Map(cells_map_id)) = raw_value {
            for (row_id, row_val) in
                session.read_map(&TypeTarget::Identity(cells_map_id.clone()))?
            {
                match row_val {
                    SessionReadValue::Map(row_map_id) => {
                        for (col_key, cell_val) in
                            session.read_map(&TypeTarget::Identity(row_map_id))?
                        {
                            let (col_id, value) =
                                self.decode_database_cell_entry(col_key, cell_val)?;
                            cells.insert((row_id.clone(), col_id), value);
                        }
                    }
                    SessionReadValue::Any(Any::Object(row_obj)) => {
                        for (col_key, cell_any) in *row_obj {
                            let (col_id, value) = self.decode_database_cell_entry(
                                col_key,
                                SessionReadValue::Any(cell_any),
                            )?;
                            cells.insert((row_id.clone(), col_id), value);
                        }
                    }
                    _ => {}
                }
            }
            return Ok(cells);
        }

        if let Some(JsonValue::Object(rows)) = normalized {
            for (row_id, row_val) in rows {
                let Some(cols) = row_val.as_object() else {
                    continue;
                };
                for (col_key, cell_val) in cols {
                    let col_id = cell_val
                        .get("columnId")
                        .and_then(JsonValue::as_str)
                        .filter(|s| !s.is_empty())
                        .unwrap_or(col_key.as_str())
                        .to_string();
                    let val = cell_val
                        .get("value")
                        .map(decode_json_cell_value)
                        .unwrap_or(DatabaseCellValue::Null);
                    cells.insert((row_id.clone(), col_id), val);
                }
            }
        }
        Ok(cells)
    }

    fn decode_database_cell_entry(
        &self,
        col_key: String,
        cell_val: SessionReadValue,
    ) -> DocResult<(String, DatabaseCellValue)> {
        let session = self.page.inner();
        match cell_val {
            SessionReadValue::Map(cell_map_id) => {
                let target = TypeTarget::Identity(cell_map_id);
                let col_id = session
                    .get_map_value(&target, "columnId")?
                    .and_then(|v| match v {
                        SessionReadValue::Any(Any::String(s)) if !s.is_empty() => Some(s),
                        _ => None,
                    })
                    .unwrap_or(col_key);
                let value = match session.get_map_value(&target, "value")? {
                    Some(v) => self.decode_cell_value(&v)?,
                    None => DatabaseCellValue::Null,
                };
                Ok((col_id, value))
            }
            SessionReadValue::Any(Any::Object(cell_obj)) => {
                let col_id = cell_obj
                    .get("columnId")
                    .and_then(|v| match v {
                        Any::String(s) if !s.is_empty() => Some(s.clone()),
                        _ => None,
                    })
                    .unwrap_or(col_key);
                let value = cell_obj
                    .get("value")
                    .map(decode_any_cell_value)
                    .unwrap_or(DatabaseCellValue::Null);
                Ok((col_id, value))
            }
            other => Ok((col_key, self.decode_cell_value(&other)?)),
        }
    }

    fn decode_cell_value(&self, value: &SessionReadValue) -> DocResult<DatabaseCellValue> {
        match value {
            SessionReadValue::Text(_) => {
                Ok(DatabaseCellValue::RichText(self.rich_text(Some(value))?))
            }
            SessionReadValue::Any(any) => Ok(decode_any_cell_value(any)),
            SessionReadValue::Array(arr_id) => {
                let items = self
                    .page
                    .inner()
                    .read_array(&TypeTarget::Identity(arr_id.clone()))?;
                let mut strings = Vec::with_capacity(items.len());
                let mut all_strings = true;
                for item in &items {
                    if let SessionReadValue::Any(Any::String(s)) = item {
                        strings.push(s.clone());
                    } else {
                        all_strings = false;
                        break;
                    }
                }
                if all_strings {
                    Ok(DatabaseCellValue::MultiSelect(strings))
                } else {
                    Ok(DatabaseCellValue::Json(self.page.export_y_value(value)?))
                }
            }
            _ => {
                let exported = self.page.export_y_value(value)?;
                Ok(decode_json_cell_value(&exported))
            }
        }
    }
}

fn decode_any_cell_value(any: &Any) -> DatabaseCellValue {
    match any {
        Any::Null | Any::Undefined => DatabaseCellValue::Null,
        Any::True => DatabaseCellValue::Bool(true),
        Any::False => DatabaseCellValue::Bool(false),
        Any::Integer(v) => DatabaseCellValue::Integer(i64::from(*v)),
        Any::BigInt64(v) => DatabaseCellValue::Integer(*v),
        Any::Float32(v) => DatabaseCellValue::Number(f64::from(v.0)),
        Any::Float64(v) => DatabaseCellValue::Number(v.0),
        Any::String(s) => DatabaseCellValue::Text(s.clone()),
        Any::Array(items) => {
            if items.iter().all(|v| matches!(v, Any::String(_))) {
                DatabaseCellValue::MultiSelect(
                    items
                        .iter()
                        .filter_map(|v| match v {
                            Any::String(s) => Some(s.clone()),
                            _ => None,
                        })
                        .collect(),
                )
            } else {
                DatabaseCellValue::Json(serde_json::to_value(any).unwrap_or(JsonValue::Null))
            }
        }
        other => DatabaseCellValue::Json(serde_json::to_value(other).unwrap_or(JsonValue::Null)),
    }
}

fn decode_json_cell_value(value: &JsonValue) -> DatabaseCellValue {
    match value {
        JsonValue::Null => DatabaseCellValue::Null,
        JsonValue::Bool(b) => DatabaseCellValue::Bool(*b),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                DatabaseCellValue::Integer(i)
            } else {
                DatabaseCellValue::Number(n.as_f64().unwrap_or(0.0))
            }
        }
        JsonValue::String(s) => DatabaseCellValue::Text(s.clone()),
        JsonValue::Array(items) => {
            if items.iter().all(JsonValue::is_string) {
                DatabaseCellValue::MultiSelect(
                    items
                        .iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect(),
                )
            } else {
                DatabaseCellValue::Json(value.clone())
            }
        }
        JsonValue::Object(_) => DatabaseCellValue::Json(value.clone()),
    }
}

fn parse_columns(value: Option<&JsonValue>) -> Vec<DatabaseColumn> {
    let Some(items) = value.and_then(JsonValue::as_array) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let obj = item.as_object()?;
            let id = obj.get("id")?.as_str()?.to_string();
            let column_type = obj
                .get("type")
                .and_then(JsonValue::as_str)
                .unwrap_or("rich-text")
                .to_string();
            let name = obj
                .get("name")
                .and_then(JsonValue::as_str)
                .unwrap_or_default()
                .to_string();
            let data = obj
                .get("data")
                .cloned()
                .unwrap_or_else(|| JsonValue::Object(serde_json::Map::new()));
            Some(DatabaseColumn {
                id,
                column_type,
                name,
                data,
            })
        })
        .collect()
}

fn parse_views(value: Option<&JsonValue>) -> Vec<DatabaseView> {
    let Some(items) = value.and_then(JsonValue::as_array) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let obj = item.as_object()?;
            let id = obj.get("id")?.as_str()?.to_string();
            let name = obj
                .get("name")
                .and_then(JsonValue::as_str)
                .unwrap_or_default()
                .to_string();
            let mode = DatabaseViewMode::parse(
                obj.get("mode")
                    .and_then(JsonValue::as_str)
                    .unwrap_or("table"),
            );
            let columns = obj
                .get("columns")
                .and_then(JsonValue::as_array)
                .map(|cols| {
                    cols.iter()
                        .filter_map(|c| {
                            let cobj = c.as_object()?;
                            let cid = cobj.get("id")?.as_str()?.to_string();
                            Some(DatabaseViewColumn {
                                id: cid,
                                width: cobj
                                    .get("width")
                                    .and_then(JsonValue::as_f64)
                                    .filter(|w| w.is_finite() && *w > 0.0),
                                hide: cobj.get("hide").and_then(JsonValue::as_bool),
                                stat_calc_type: cobj
                                    .get("statCalcType")
                                    .and_then(JsonValue::as_str)
                                    .map(str::to_string),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            let filter = obj.get("filter").cloned();
            let sort = obj.get("sort").cloned();
            let group_by = obj
                .get("groupBy")
                .and_then(JsonValue::as_object)
                .and_then(|g| {
                    let column_id = g.get("columnId")?.as_str()?.to_string();
                    let name = g
                        .get("name")
                        .and_then(JsonValue::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let kind = g
                        .get("type")
                        .and_then(JsonValue::as_str)
                        .unwrap_or("groupBy")
                        .to_string();
                    let sort = g
                        .get("sort")
                        .and_then(|s| {
                            s.as_str().or_else(|| {
                                s.get("desc")
                                    .and_then(JsonValue::as_bool)
                                    .map(|d| if d { "desc" } else { "asc" })
                            })
                        })
                        .map(str::to_string);
                    let hide_empty = g.get("hideEmpty").and_then(JsonValue::as_bool);
                    Some(DatabaseGroupBy {
                        kind,
                        column_id,
                        name,
                        sort,
                        hide_empty,
                    })
                });
            let group_properties = obj
                .get("groupProperties")
                .and_then(JsonValue::as_array)
                .map(|props| {
                    props
                        .iter()
                        .filter_map(|p| {
                            let pobj = p.as_object()?;
                            let key = pobj.get("key")?.as_str()?.to_string();
                            let hide = pobj
                                .get("hide")
                                .and_then(JsonValue::as_bool)
                                .unwrap_or(false);
                            let manually_card_sort = pobj
                                .get("manuallyCardSort")
                                .and_then(JsonValue::as_array)
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|v| v.as_str().map(str::to_string))
                                        .collect()
                                })
                                .unwrap_or_default();
                            Some(DatabaseGroupProperty {
                                key,
                                hide,
                                manually_card_sort,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            let header =
                obj.get("header")
                    .and_then(JsonValue::as_object)
                    .map(|h| DatabaseViewHeader {
                        title_column: h
                            .get("titleColumn")
                            .and_then(JsonValue::as_str)
                            .map(str::to_string),
                        icon_column: h
                            .get("iconColumn")
                            .and_then(JsonValue::as_str)
                            .map(str::to_string),
                        image_column: h
                            .get("imageColumn")
                            .and_then(JsonValue::as_str)
                            .map(str::to_string),
                        cover_column: h
                            .get("coverColumn")
                            .and_then(JsonValue::as_str)
                            .map(str::to_string),
                    });
            let date =
                obj.get("date")
                    .and_then(JsonValue::as_object)
                    .map(|d| DatabaseCalendarDate {
                        start_column_id: d
                            .get("startColumnId")
                            .and_then(JsonValue::as_str)
                            .map(str::to_string),
                        end_column_id: d
                            .get("endColumnId")
                            .and_then(JsonValue::as_str)
                            .map(str::to_string),
                    });
            let card =
                obj.get("card")
                    .and_then(JsonValue::as_object)
                    .map(|c| DatabaseCalendarCard {
                        title_column_id: c
                            .get("titleColumnId")
                            .and_then(JsonValue::as_str)
                            .map(str::to_string),
                        visible_property_ids: c
                            .get("visiblePropertyIds")
                            .and_then(JsonValue::as_array)
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str().map(str::to_string))
                                    .collect()
                            })
                            .unwrap_or_default(),
                    });
            let ui = obj.get("ui").cloned();

            let mut extra = BTreeMap::new();
            for (k, v) in obj {
                if !matches!(
                    k.as_str(),
                    "id" | "name"
                        | "mode"
                        | "columns"
                        | "filter"
                        | "sort"
                        | "groupBy"
                        | "groupProperties"
                        | "header"
                        | "date"
                        | "card"
                        | "ui"
                ) {
                    extra.insert(k.clone(), v.clone());
                }
            }

            Some(DatabaseView {
                id,
                name,
                mode,
                columns,
                filter,
                sort,
                group_by,
                group_properties,
                header,
                date,
                card,
                ui,
                extra,
            })
        })
        .collect()
}

fn json_as_i64(value: &JsonValue) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_f64().filter(|n| n.is_finite()).map(|n| n as i64))
}
