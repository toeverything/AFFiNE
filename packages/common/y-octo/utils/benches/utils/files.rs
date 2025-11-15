use std::{
  fs::{read, read_dir},
  path::{Path, PathBuf},
};

use path_ext::PathExt;

pub struct File {
  pub path: PathBuf,
  pub content: Vec<u8>,
}

const BASE: &str = "../y-octo/src/fixtures/";

impl File {
  fn new(path: &Path) -> Self {
    let content = read(path).unwrap();
    Self {
      path: path.into(),
      content,
    }
  }
}

pub struct Files {
  pub files: Vec<File>,
}

impl Files {
  pub fn load() -> Self {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(BASE);

    let files = read_dir(path).unwrap();
    let files = files
      .flatten()
      .filter(|f| f.path().is_file() && f.path().ext_str() == "bin")
      .map(|f| File::new(&f.path()))
      .collect::<Vec<_>>();

    Self { files }
  }
}
