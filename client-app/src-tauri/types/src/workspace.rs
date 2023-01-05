use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct CreateWorkspace {
  // TODO: make all id string, on Octobase side, and rewrite all related tests
  pub user_id: i32,
  /**
   * only set name, avatar is update in datacenter to yDoc directly
   */
  pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct CreateWorkspaceResult {
  pub id: String,
  pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct UpdateWorkspace {
  pub id: i64,
  pub public: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub enum IWorkspaceParameters {
  CreateWorkspace(CreateWorkspace),
  UpdateWorkspace(UpdateWorkspace),
  CreateWorkspaceResult(CreateWorkspaceResult),
}
