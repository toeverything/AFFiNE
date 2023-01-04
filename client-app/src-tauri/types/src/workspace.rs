use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct CreateWorkspace {
  pub id: i64,
  pub name: String,
  pub avatar: String,
}
