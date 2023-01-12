use std::io::ErrorKind;

use ipc_types::document::{
  CreateDocumentParameter, GetDocumentParameter, GetDocumentResponse, YDocumentUpdate,
};
use jwst::DocStorage;
use jwst::Workspace as OctoBaseWorkspace;
use lib0::any::Any;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
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

  let doc_file_path = &state
    .0
    .lock()
    .await
    .doc_storage
    .get_path(parameters.id.clone());
  let mut file = File::open(doc_file_path).await.unwrap();
  let mut updates_vector: Vec<Vec<u8>> = Vec::new();
  loop {
    let len = file.read_u64_le().await;

    let len = match len {
      Ok(len) => len,
      Err(e) if e.kind() == ErrorKind::UnexpectedEof => break,
      Err(e) => return Err(format!("Failed to get yDoc from {}", parameters.id)),
    };

    let mut update = vec![0; len as usize];
    file.read_exact(&mut update).await.unwrap();

    updates_vector.push(update);

    file.read_u64_le().await.unwrap();
  }
  Ok(GetDocumentResponse {
    updates: updates_vector,
  })
}

#[tauri::command]
pub async fn update_y_document<'s>(
  state: tauri::State<'s, AppState>,
  parameters: YDocumentUpdate,
) -> Result<bool, String> {
  if let Some(success) = &state
    .0
    .lock()
    .await
    .doc_storage
    .write_update(parameters.id.clone(), &parameters.update)
    .await
    .ok()
  {
    Ok(*success)
  } else {
    Err(format!("Failed to update yDoc to {}", parameters.id))
  }
}
