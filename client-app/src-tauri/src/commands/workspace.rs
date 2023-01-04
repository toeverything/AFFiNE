use ipc_types::{document::YDocumentUpdate, workspace::CreateWorkspace};
use jwst::{DocStorage, Workspace};
use lib0::any::Any;

use crate::state::AppState;

#[tauri::command]
pub async fn create_workspace<'s>(
  state: tauri::State<'s, AppState>,
  parameters: CreateWorkspace,
) -> Result<bool, String> {
  let workspace = Workspace::new(parameters.id.to_string());
  workspace.with_trx(|mut workspace_transaction| {
    // TODO: why this Any here?
    workspace_transaction.set_metadata("name", Any::String(parameters.name.into_boxed_str()));
    workspace_transaction.set_metadata(
      "avatar",
      Any::String(parameters.avatar.clone().into_boxed_str()),
    );
  });
  if let Err(error_message) = &state
    .0
    .lock()
    .await
    .doc_storage
    .write_doc(parameters.id, workspace.doc())
    .await
  {
    Err(error_message.to_string())
  } else {
    Ok(true)
  }
}

#[tauri::command]
pub fn update_y_document(parameters: YDocumentUpdate) -> Result<bool, String> {
  Ok(true)
}
