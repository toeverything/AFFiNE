pub mod blob;
pub mod workspace;

use blob::*;
use workspace::*;

pub fn invoke_handler() -> impl Fn(tauri::Invoke) + Send + Sync + 'static {
  tauri::generate_handler![
    update_y_document,
    create_workspace,
    update_workspace,
    put_blob,
    get_blob
  ]
}
