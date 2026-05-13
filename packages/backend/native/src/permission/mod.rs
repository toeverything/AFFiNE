mod actions;
mod candidates;
mod evaluator;
mod types;

use actions::role_matrix_json;
pub use evaluator::evaluate_permission;
use napi::{Error as NapiError, Result, Status};
use napi_derive::napi;
use serde_json::Value;
pub use types::*;

#[napi]
pub fn evaluate_permission_v1(input: Value) -> Result<Value> {
  let input = serde_json::from_value::<PermissionEvaluationInputV1>(input)
    .map_err(|err| NapiError::new(Status::InvalidArg, err.to_string()))?;
  evaluate_permission(input)
    .and_then(|output| serde_json::to_value(output).map_err(Into::into))
    .map_err(|err| NapiError::new(Status::GenericFailure, err.to_string()))
}

#[napi]
pub fn permission_action_role_matrix_v1() -> Value {
  role_matrix_json()
}

#[napi]
pub fn permission_action_role_matrix_v1_json() -> String {
  serde_json::to_string_pretty(&role_matrix_json()).unwrap_or_else(|_| "{}".to_string())
}
