pub mod blob;
pub mod workspace;
pub mod document;

use blob::*;
use workspace::*;
use document::*;

pub fn invoke_handler() -> impl Fn(tauri::Invoke) + Send + Sync + 'static {
  tauri::generate_handler![
    update_y_document,
    create_workspace,
    update_workspace,
    get_workspaces,
    get_workspace,
    get_doc,
    put_blob,
    get_blob
  ]
}
