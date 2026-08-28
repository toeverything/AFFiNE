use std::{
  ffi::OsString,
  fs::{self, File},
  io::{Error, Read},
  path::{Path, PathBuf},
  sync::Arc,
};

use bytes::Bytes;
use onenote_parser::{
  FileSystem,
  fs::{FileSource, file_source::CachedFileSource},
};
use typed_path::{TypedPath, TypedPathBuf};

#[derive(Clone, Copy)]
pub(super) struct WindowsFs;

impl FileSystem for WindowsFs {
  fn is_directory(&self, path: TypedPath) -> Result<bool, Error> {
    match fs::metadata(resolve_path(path)?) {
      Ok(meta) => Ok(meta.is_dir()),
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
      Err(error) => Err(error),
    }
  }

  fn read_dir(&self, path: TypedPath) -> Result<Vec<TypedPathBuf>, Error> {
    fs::read_dir(resolve_path(path)?)?
      .map(|entry| entry.and_then(|entry| as_typed_path(&entry.path())))
      .collect()
  }

  fn read_file(&self, path: TypedPath) -> Result<Vec<u8>, Error> {
    fs::read(resolve_path(path)?)
  }

  fn write_file(&self, path: TypedPath, data: &[u8]) -> Result<(), Error> {
    fs::write(resolve_path(path)?, data)
  }

  fn stream_to_file(&self, path: TypedPath, reader: &mut dyn Read) -> Result<(), Error> {
    let mut file = File::create(resolve_path(path)?)?;
    std::io::copy(reader, &mut file)?;
    Ok(())
  }

  fn make_dir(&self, path: TypedPath) -> Result<(), Error> {
    fs::create_dir_all(resolve_path(path)?)
  }

  fn canonicalize(&self, path: TypedPath) -> Result<TypedPathBuf, Error> {
    as_typed_path(&fs::canonicalize(resolve_path(path)?)?)
  }

  fn exists(&self, path: TypedPath) -> Result<bool, Error> {
    fs::exists(resolve_path(path)?)
  }

  fn open_file(&self, path: TypedPath) -> Result<Arc<dyn FileSource>, Error> {
    let file = File::open(resolve_path(path)?)?;
    let byte_length = file.metadata()?.len();
    Ok(Arc::new(CachedFileSource::new(WindowsFileSource { file, byte_length })))
  }
}

fn resolve_path(path: TypedPath) -> Result<PathBuf, Error> {
  let path = if path.is_windows() {
    path.to_path_buf()
  } else {
    path
      .with_windows_encoding_checked()
      .map_err(|error| Error::new(std::io::ErrorKind::InvalidInput, error))?
  };
  let path = path
    .to_str()
    .ok_or_else(|| Error::new(std::io::ErrorKind::InvalidData, "path bytes are not valid UTF-8"))?;
  to_verbatim(PathBuf::from(path))
}

fn as_typed_path(path: &Path) -> Result<TypedPathBuf, Error> {
  let path = path
    .to_str()
    .ok_or_else(|| Error::new(std::io::ErrorKind::InvalidData, "path is not valid UTF-8"))?;
  Ok(TypedPath::windows(path.as_bytes()).to_path_buf())
}

fn to_verbatim(path: PathBuf) -> Result<PathBuf, Error> {
  let path = std::path::absolute(path)?.to_string_lossy().replace('/', "\\");
  if path.starts_with(r"\\?\") {
    return Ok(PathBuf::from(path));
  }
  let mut verbatim = OsString::new();
  if let Some(path) = path.strip_prefix(r"\\") {
    verbatim.push(r"\\?\UNC\");
    verbatim.push(path);
  } else {
    verbatim.push(r"\\?\");
    verbatim.push(path);
  }
  Ok(PathBuf::from(verbatim))
}

struct WindowsFileSource {
  file: File,
  byte_length: u64,
}

impl FileSource for WindowsFileSource {
  fn byte_length(&self) -> u64 {
    self.byte_length
  }

  fn read_at(&self, offset: u64, len: usize) -> Result<Bytes, Error> {
    use std::os::windows::fs::FileExt;

    let mut bytes = vec![0; len];
    let mut read = 0;
    while read < len {
      let count = self.file.seek_read(&mut bytes[read..], offset + read as u64)?;
      if count == 0 {
        return Err(Error::new(
          std::io::ErrorKind::UnexpectedEof,
          "unexpected end of OneNote file",
        ));
      }
      read += count;
    }
    Ok(Bytes::from(bytes))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn preserves_windows_absolute_path_prefixes() {
    assert_eq!(
      resolve_path(TypedPath::derive(r"C:\Users\Alice\Notebook.one")).unwrap(),
      PathBuf::from(r"\\?\C:\Users\Alice\Notebook.one")
    );
    assert_eq!(
      resolve_path(TypedPath::derive(r"\\server\share\Notebook.one")).unwrap(),
      PathBuf::from(r"\\?\UNC\server\share\Notebook.one")
    );
    assert_eq!(
      resolve_path(TypedPath::derive(r"\\?\D:\Notebook.one")).unwrap(),
      PathBuf::from(r"\\?\D:\Notebook.one")
    );
  }
}
