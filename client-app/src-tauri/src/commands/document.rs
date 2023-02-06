use ipc_types::document::{
  CreateDocumentParameter, GetDocumentParameter, GetDocumentResponse, YDocumentUpdate,
};
use jwst::encode_update;
use jwst::DocStorage;
use jwst::Workspace as OctoBaseWorkspace;
use lib0::any::Any;
use std::sync::{Arc, RwLock};
use y_sync::sync::Message;
use y_sync::sync::MessageReader;
use y_sync::sync::SyncMessage;
use yrs::updates::decoder::DecoderV1;
use yrs::{updates::decoder::Decode, Doc, StateVector, Update};

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
    .doc_db
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
  let state = &state.0.lock().await;
  let doc_store = &state.doc_store;
  let doc_db = &state.doc_db;

  if let Ok(all_updates_of_workspace) = doc_db.all(&parameters.id).await {
    let all_updates = all_updates_of_workspace
      .iter()
      .map(|model| model.blob.clone())
      .collect::<Vec<Vec<u8>>>();
    all_updates
      .iter()
      .for_each(|update_blob| {
        let mut tx = doc_store.doc().transact();
        let update = Update::decode_v1(&update_blob).unwrap();
        tx.apply_update(update);
        tx.commit();
      });
      let merged_update = doc_store.doc().transact().encode_update_v1();
      // TODO: store merged update here
    Ok(GetDocumentResponse {
      updates: vec![merged_update],
    })
  } else {
    Err(format!(
      "Failed to get yDoc from workspace {}",
      parameters.id
    ))
  }
}

#[tauri::command]
pub async fn update_y_document<'s>(
  state: tauri::State<'s, AppState>,
  parameters: YDocumentUpdate,
) -> Result<bool, String> {
  let state = &state.0.lock().await;
  let doc_store = &state.doc_store;
  let mut tx = doc_store.doc().transact();
  let update = Update::decode_v1(&parameters.update).unwrap();
  tx.apply_update(update);
  let merged_update = tx.encode_update_v1();
  tx.commit();
  let doc_db = &state.doc_db;

  doc_db
    .replace_with(&parameters.id.clone(), merged_update)
    .await
    .ok();

  Ok(true)
}
