use ipc_types::{
  document::YDocumentUpdate,
  workspace::{CreateWorkspace, CreateWorkspaceResult, UpdateWorkspace},
};
use jwst::{DocStorage, Workspace as OctoBaseWorkspace};
use lib0::any::Any;

use crate::state::AppState;

#[tauri::command]
pub async fn create_workspace<'s>(
  state: tauri::State<'s, AppState>,
  parameters: CreateWorkspace,
) -> Result<CreateWorkspaceResult, String> {
  match &state
    .0
    .lock()
    .await
    .metadata_db
    .create_normal_workspace(parameters.user_id)
    .await
  {
    Ok(new_workspace) => {
      let workspace_doc = OctoBaseWorkspace::new(new_workspace.id.to_string());

      workspace_doc.with_trx(|mut workspace_doc_transaction| {
        workspace_doc_transaction
          .set_metadata("name", Any::String(parameters.name.clone().into_boxed_str()));
      });
      if let Err(error_message) = &state
        .0
        .lock()
        .await
        .doc_storage
        .write_doc(new_workspace.id, workspace_doc.doc())
        .await
      {
        Err(error_message.to_string())
      } else {
        Ok(CreateWorkspaceResult {
          id: new_workspace.id.to_string(),
          name: parameters.name,
        })
      }
    }
    Err(error_message) => Err(error_message.to_string()),
  }
}

#[tauri::command]
pub async fn update_workspace<'s>(
  state: tauri::State<'s, AppState>,
  parameters: UpdateWorkspace,
) -> Result<bool, String> {
  // No thing to update now. The avatar is update in YDoc using websocket or yrs.update
  Ok(true)
}

#[tauri::command]
pub fn update_y_document(parameters: YDocumentUpdate) -> Result<bool, String> {
  Ok(true)
}
