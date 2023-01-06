use ipc_types::document::{GetDocumentParameter, GetDocumentResponse, YDocumentUpdate};
use jwst::DocStorage;
use yrs::StateVector;

use crate::state::AppState;

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
    .get(parameters.id)
    .await
    .ok()
  {
    Ok(GetDocumentResponse {
      update: doc.encode_state_as_update_v1(&StateVector::default()),
    })
  } else {
    Err(format!(
      "Failed to get yDoc from {}",
      parameters.id.to_string()
    ))
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
    .write_update(parameters.id, &parameters.update)
    .await
    .ok()
  {
    Ok(true)
  } else {
    Err(format!(
      "Failed to update yDoc to {}",
      parameters.id.to_string()
    ))
  }
}
