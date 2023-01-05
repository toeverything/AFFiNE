use ipc_types::{blob::IBlobParameters, document::YDocumentUpdate, workspace::IWorkspaceParameters};
/**
 * convert serde to jsonschema: https://imfeld.dev/writing/generating_typescript_types_from_rust
 *  with way to optimize
 * convert jsonschema to ts: https://github.com/bcherny/json-schema-to-typescript
*/
use project_root::get_project_root;
use schemars::{schema_for, JsonSchema};
use std::{
  fs::write,
  path::{Path, PathBuf},
};

fn generate<T>(path: PathBuf)
where
  T: ?Sized + JsonSchema, // Sized or ?Sized are both ok, click https://zhuanlan.zhihu.com/p/21820917 to learn why
{
  let schema = schema_for!(T);
  let output = serde_json::to_string_pretty(&schema).unwrap();
  write(path, output).expect("can not write json-schema file")
}

fn main() {
  let project_root = &get_project_root().unwrap();
  let mono_repo_root = Path::join(project_root, "../..");
  let data_center_ipc_type_folder = Path::join(
    &mono_repo_root,
    "packages/data-center/src/provider/tauri-ipc/ipc/types",
  );
  generate::<YDocumentUpdate>(Path::join(&data_center_ipc_type_folder, "document.json"));
  generate::<IWorkspaceParameters>(Path::join(&data_center_ipc_type_folder, "workspace.json"));
  generate::<IBlobParameters>(Path::join(&data_center_ipc_type_folder, "blob.json"));
}
