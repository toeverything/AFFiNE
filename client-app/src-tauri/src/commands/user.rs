use ipc_types::document::CreateDocumentParameter;
use jwst_storage::{CreateUser, User};

use crate::state::AppState;

use super::document::create_doc;

#[tauri::command]
/// create new user and a private workspace
pub async fn create_user<'s>(
  state: tauri::State<'s, AppState>,
  parameters: CreateUser,
) -> Result<User, String> {
  let new_user_result = &state
    .0
    .lock()
    .await
    .metadata_db
    .create_user(parameters.clone())
    .await;
  match new_user_result{
    Ok(new_user_option) => match new_user_option {
      Some((new_user, new_workspace)) => {
        // a new private workspace is created, we have to create a yDoc for it
        create_doc(
          state,
          CreateDocumentParameter {
            workspace_id: new_workspace.id.clone(),
            workspace_name: parameters.name.clone(),
          },
        )
        .await
        .ok();
        Ok(new_user.clone())
      }
      None => Err("User creation failed".to_string()),
    },
    Err(error_message) => Err(error_message.to_string()),
  }
}
