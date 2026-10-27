use memory_indexer::{Document, FieldType, Value};
use serde_json::Value as JsonValue;

use super::{IndexError, Result, schema::TableSchema};

pub(super) fn compile_document(table: &TableSchema, value: JsonValue) -> Result<Document> {
  let mut object = value
    .as_object()
    .cloned()
    .ok_or_else(|| IndexError::InvalidInput("index document must be an object".into()))?;
  let explicit_id = object
    .remove("_id")
    .map(|value| {
      value
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| IndexError::InvalidInput("index document _id must be a string".into()))
    })
    .transpose()?;
  let id = match explicit_id {
    Some(id) => id,
    None => table.document_id(&object)?,
  };
  let mut document = Document::new(id);
  for (name, value) in object {
    if value.is_null() {
      continue;
    }
    let field = table.field(&name)?;
    let values = match value {
      JsonValue::Array(values) => values.into_iter().filter(|value| !value.is_null()).collect(),
      value => vec![value],
    };
    if values.is_empty() {
      continue;
    }
    document.add_values(
      field,
      values
        .into_iter()
        .map(|value| compile_value(table.field_type(field), value))
        .collect::<Result<Vec<_>>>()?,
    );
  }
  Ok(document)
}

fn compile_value(field_type: &FieldType, value: JsonValue) -> Result<Value> {
  match field_type {
    FieldType::Text(_) | FieldType::Keyword => value
      .as_str()
      .map(|value| Value::String(value.into()))
      .ok_or_else(|| IndexError::InvalidInput("string index value required".into())),
    FieldType::I64 => value
      .as_i64()
      .map(Value::I64)
      .ok_or_else(|| IndexError::InvalidInput("integer index value required".into())),
    FieldType::Bool => value
      .as_bool()
      .map(Value::Bool)
      .ok_or_else(|| IndexError::InvalidInput("boolean index value required".into())),
  }
}
