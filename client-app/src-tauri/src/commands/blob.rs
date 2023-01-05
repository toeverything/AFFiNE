use bytes::Bytes;
use futures::{
  stream::{self},
  StreamExt,
};

use ipc_types::blob::{GetBlob, PutBlob};
use jwst::BlobStorage;

use crate::state::AppState;

#[tauri::command]
pub async fn put_blob<'s>(
  state: tauri::State<'s, AppState>,
  parameters: PutBlob,
) -> Result<String, String> {
  let blob_storage = &state.0.lock().await.blob_storage;
  if let Ok(path) = blob_storage
    .put_blob(
      // TODO: ask octobase to accept blob directly or wrap/await tauri command to create a real stream, so we don't need to construct stream manually
      Some(parameters.workspace_id),
      stream::iter::<Vec<Bytes>>(vec![Bytes::from(parameters.blob)]),
    )
    .await
  {
    Ok(path)
  } else {
    Err("Failed to create".to_string())
  }
}

#[tauri::command]
pub async fn get_blob<'s>(
  state: tauri::State<'s, AppState>,
  parameters: GetBlob,
) -> Result<Vec<u8>, String> {
  let GetBlob { workspace_id, id } = parameters;
  // TODO: check user permission? Or just assume there will only be one user
  let blob_storage = &state.0.lock().await.blob_storage;
  if let Ok(mut file_stream) = blob_storage.get_blob(Some(workspace_id.clone()), id.clone()).await {
    // Read all of the chunks into a vector.
    let mut stream_contents = Vec::new();
    let mut error_message = "".to_string();
    while let Some(chunk) = file_stream.next().await {
      match chunk {
        Ok(chunk_bytes) => stream_contents.extend_from_slice(&chunk_bytes),
        Err(err) => {
          error_message = format!(
            "Failed to read blob file {}/{} from stream, error: {}",
            workspace_id.to_string(),
            id,
            err
          );
        }
      }
    }
    if error_message.len() > 0 {
      return Err(error_message);
    }
    Ok(stream_contents)
  } else {
    Err(format!(
      "Failed to read blob file {}/{} ",
      workspace_id.to_string(),
      id
    ))
  }
}
