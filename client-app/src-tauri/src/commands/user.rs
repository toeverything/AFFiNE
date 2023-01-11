use jwst_storage::{CreateUser, User};

use crate::state::AppState;

#[tauri::command]
/// create yDoc for a workspace
pub async fn create_user<'s>(
  state: tauri::State<'s, AppState>,
  parameters: CreateUser,
) -> Result<User, String> {
  match &state
    .0
    .lock()
    .await
    .metadata_db
    .create_user(parameters.clone())
    .await
  {
    Ok(new_user_option) => match new_user_option {
      Some(new_user) => Ok(new_user.clone()),
      None => Err("User creation failed".to_string()),
    },
    Err(error_message) => Err(error_message.to_string()),
  }
}
