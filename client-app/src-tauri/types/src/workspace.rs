use jwst_storage::model::WorkspaceWithPermission;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateWorkspace {
  // TODO: make all id string, on Octobase side, and rewrite all related tests
  pub user_id: i32,
  /**
   * only set name, avatar is update in datacenter to yDoc directly
   */
  pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetWorkspaces {
  // TODO: make all id string, on Octobase side, and rewrite all related tests
  pub user_id: i32,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CreateWorkspaceResult {
  pub id: String,
  pub name: String,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct GetWorkspacesResult {
  pub workspaces: Vec<WorkspaceWithPermission>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateWorkspace {
  pub id: i64,
  pub public: bool,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub enum IWorkspaceParameters {
  CreateWorkspace(CreateWorkspace),
  GetWorkspaces(GetWorkspaces),
  GetWorkspacesResult(GetWorkspacesResult),
  UpdateWorkspace(UpdateWorkspace),
  CreateWorkspaceResult(CreateWorkspaceResult),
}
