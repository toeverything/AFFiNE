use ipc_types::{
  document::CreateDocumentParameter,
  workspace::{
    CreateWorkspace, CreateWorkspaceResult, GetWorkspace, GetWorkspaceResult, GetWorkspaces,
    GetWorkspacesResult, UpdateWorkspace,
  },
};

use crate::state::AppState;

use super::document::create_doc;

#[tauri::command]
/// create yDoc for a workspace
pub async fn get_workspaces<'s>(
  state: tauri::State<'s, AppState>,
  parameters: GetWorkspaces,
) -> Result<GetWorkspacesResult, String> {
  match &state
    .0
    .lock()
    .await
    .metadata_db
    .get_user_workspaces(parameters.user_id.to_string())
    .await
  {
    Ok(user_workspaces) => Ok(GetWorkspacesResult {
      workspaces: user_workspaces.clone(),
    }),
    Err(error_message) => Err(error_message.to_string()),
  }
}

#[tauri::command]
/// create yDoc for a workspace
pub async fn get_workspace<'s>(
  state: tauri::State<'s, AppState>,
  parameters: GetWorkspace,
) -> Result<GetWorkspaceResult, String> {
  match &state
    .0
    .lock()
    .await
    .metadata_db
    .get_workspace_by_id(parameters.id)
    .await
  {
    Ok(user_workspace_option) => match user_workspace_option {
      Some(user_workspace) => Ok(GetWorkspaceResult {
        workspace: user_workspace.clone(),
      }),
      None => Err("Get workspace has no result".to_string()),
    },
    Err(error_message) => Err(error_message.to_string()),
  }
}

#[tauri::command]
/// create yDoc for a workspace
pub async fn create_workspace<'s>(
  state: tauri::State<'s, AppState>,
  parameters: CreateWorkspace,
) -> Result<CreateWorkspaceResult, String> {
  let new_workspace_result = &state
    .0
    .lock()
    .await
    .metadata_db
    .create_normal_workspace(parameters.user_id.to_string())
    .await;
  match new_workspace_result {
    Ok(new_workspace) => {
      create_doc(
        state,
        CreateDocumentParameter {
          workspace_id: new_workspace.id.clone(),
          workspace_name: parameters.name.clone(),
        },
      )
      .await
      .ok();
      Ok(CreateWorkspaceResult {
        id: new_workspace.id.clone(),
        name: parameters.name,
      })
    }
    Err(error_message) => Err(format!(
      "Failed to create_workspace with error {}",
      error_message.to_string()
    )),
  }
}

#[tauri::command]
pub async fn update_workspace<'s>(
  _state: tauri::State<'s, AppState>,
  _parameters: UpdateWorkspace,
) -> Result<bool, String> {
  // TODO: check user permission
  // No thing to update now. The avatar is update in YDoc using websocket or yrs.update
  Ok(true)
}
