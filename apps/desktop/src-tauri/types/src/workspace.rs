use cloud_database::{WorkspaceWithPermission, WorkspaceDetail};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateWorkspace {
  pub user_id: String,
  /**
   * only set name, avatar is update in datacenter to yDoc directly
   */
  pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetWorkspaces {
  pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetWorkspace {
  pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateWorkspaceResult {
  pub id: String,
  pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetWorkspacesResult {
  pub workspaces: Vec<WorkspaceWithPermission>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetWorkspaceResult {
  pub workspace: WorkspaceDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateWorkspace {
  pub id: i64,
  pub public: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum IWorkspaceParameters {
  CreateWorkspace(CreateWorkspace),
  GetWorkspace(GetWorkspace),
  GetWorkspaces(GetWorkspaces),
  GetWorkspaceResult(GetWorkspaceResult),
  GetWorkspacesResult(GetWorkspacesResult),
  UpdateWorkspace(UpdateWorkspace),
  CreateWorkspaceResult(CreateWorkspaceResult),
}
