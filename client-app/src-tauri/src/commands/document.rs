use ipc_types::document::{
  CreateDocumentParameter, GetDocumentParameter, GetDocumentResponse, YDocumentUpdate,
};
use jwst::DocStorage;
use jwst::Workspace as OctoBaseWorkspace;
use lib0::any::Any;
use yrs::StateVector;

use crate::state::AppState;

#[tauri::command]
/// get yDoc created by create_workspace, using same id
pub async fn create_doc<'s>(
  state: tauri::State<'s, AppState>,
  parameters: CreateDocumentParameter,
) -> Result<(), String> {
  let workspace_doc = OctoBaseWorkspace::new(parameters.workspace_id.clone());

  workspace_doc.with_trx(|mut workspace_doc_transaction| {
    workspace_doc_transaction.set_metadata(
      "name",
      Any::String(parameters.workspace_name.clone().into_boxed_str()),
    );
  });
  if let Err(error_message) = &state
    .0
    .lock()
    .await
    .doc_storage
    .write_doc(parameters.workspace_id.clone(), workspace_doc.doc())
    .await
  {
    Err(format!(
      "Failed to write_doc during create_workspace with error {}",
      error_message.to_string()
    ))
  } else {
    Ok(())
  }
}

#[tauri::command]
/// get yDoc created by create_workspace, using same id
pub async fn get_doc<'s>(
  state: tauri::State<'s, AppState>,
  parameters: GetDocumentParameter,
) -> Result<GetDocumentResponse, String> {
  // TODO: check user permission

  if let Some(doc) = &state
    .0
    .lock()
    .await
    .doc_storage
    .get(parameters.id.clone())
    .await
    .ok()
  {
    Ok(GetDocumentResponse {
      update: doc.encode_state_as_update_v1(&StateVector::default()),
    })
  } else {
    Err(format!("Failed to get yDoc from {}", parameters.id))
  }
}

#[tauri::command]
pub async fn update_y_document<'s>(
  state: tauri::State<'s, AppState>,
  parameters: YDocumentUpdate,
) -> Result<bool, String> {
  if let Some(doc) = &state
    .0
    .lock()
    .await
    .doc_storage
    .write_update(parameters.id.clone(), &parameters.update)
    .await
    .ok()
  {
    Ok(true)
  } else {
    Err(format!("Failed to update yDoc to {}", parameters.id))
  }
}
