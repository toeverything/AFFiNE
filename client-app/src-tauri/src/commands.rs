pub mod blob;
pub mod workspace;
pub mod document;
pub mod user;

use blob::*;
use workspace::*;
use document::*;
use user::*;

pub fn invoke_handler() -> impl Fn(tauri::Invoke) + Send + Sync + 'static {
  tauri::generate_handler![
    update_y_document,
    create_workspace,
    update_workspace,
    get_workspaces,
    get_workspace,
    create_user,
    create_doc,
    get_doc,
    put_blob,
    get_blob
  ]
}
