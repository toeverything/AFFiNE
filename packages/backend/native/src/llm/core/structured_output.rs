use napi::{Error, Result, Status};
use serde_json::Value;

fn invalid_arg(message: impl Into<String>) -> Error {
  Error::new(Status::InvalidArg, message.into())
}

#[napi(catch_unwind)]
pub fn llm_validate_json_schema(schema: Value, value: Value) -> Result<Value> {
  llm_adapter::schema::validate_json_schema(&schema, &value).map_err(|error| invalid_arg(error.to_string()))?;

  Ok(value)
}

#[napi(catch_unwind)]
pub fn llm_canonical_json_schema_hash(schema: Value) -> Result<String> {
  Ok(llm_adapter::schema::canonical_json_sha256(&schema))
}
