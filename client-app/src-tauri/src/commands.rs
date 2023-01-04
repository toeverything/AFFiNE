pub mod blob;
pub mod workspace;

use workspace::{__cmd__create_workspace, __cmd__update_y_document};
use blob::__cmd__put_blob;
use blob::__cmd__get_blob;

use crate::{commands::{workspace::{create_workspace, update_y_document}, blob::{put_blob, get_blob}}};

pub fn invoke_handler() -> impl Fn(tauri::Invoke) + Send + Sync + 'static {
  tauri::generate_handler![update_y_document, create_workspace, put_blob, get_blob]
}
