use std::{
  fs::{self, OpenOptions},
  io::Write,
  path::{Path, PathBuf},
};

use chrono::{DateTime, NaiveDateTime, Utc};
use sha3::{Digest, Sha3_256};
use uuid::Uuid;
use y_octo::{Doc, DocOptions, merge_updates_v1};

use super::{frontmatter::normalize_tags, types::FrontmatterMeta};

pub(crate) fn collect_markdown_files(root: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
  let entries = fs::read_dir(root).map_err(|err| format!("failed to read directory {}: {}", root.display(), err))?;

  for entry in entries {
    let entry = entry.map_err(|err| format!("failed to read directory entry: {}", err))?;
    let path = entry.path();
    let file_type = entry
      .file_type()
      .map_err(|err| format!("failed to read file type {}: {}", path.display(), err))?;

    if file_type.is_symlink() {
      continue;
    }

    if path
      .file_name()
      .and_then(|name| name.to_str())
      .is_some_and(|name| name == ".affine-sync")
    {
      continue;
    }

    if file_type.is_dir() {
      collect_markdown_files(&path, output)?;
      continue;
    }

    if file_type.is_file()
      && path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
    {
      output.push(path);
    }
  }

  Ok(())
}

pub(crate) fn generate_missing_doc_id(file_path: &Path) -> String {
  let stem = file_path
    .file_stem()
    .and_then(|value| value.to_str())
    .map(sanitize_file_stem)
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| "doc".to_string());

  format!("{}-{}", stem, Utc::now().timestamp_millis())
}

pub(crate) fn derive_title_from_markdown(markdown: &str) -> Option<String> {
  for line in markdown.lines() {
    let trimmed = line.trim();
    if let Some(title) = trimmed.strip_prefix("# ") {
      let title = title.trim();
      if !title.is_empty() {
        return Some(title.to_string());
      }
    }
  }
  None
}

pub(crate) fn derive_title_from_path(file_path: &Path) -> String {
  file_path
    .file_stem()
    .and_then(|value| value.to_str())
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| "Untitled".to_string())
}

pub(crate) fn sanitize_file_stem(input: &str) -> String {
  let mut out = String::with_capacity(input.len());

  for ch in input.chars() {
    if ch.is_ascii_alphanumeric() {
      out.push(ch.to_ascii_lowercase());
    } else if (ch == '-' || ch == '_' || ch == ' ') && !out.ends_with('-') {
      out.push('-');
    }
  }

  let out = out.trim_matches('-').to_string();
  if out.is_empty() { "doc".to_string() } else { out }
}

pub(crate) fn write_new_file(path: &Path, content: &str) -> Result<(), String> {
  let parent = path
    .parent()
    .ok_or_else(|| format!("path {} has no parent directory", path.display()))?;
  fs::create_dir_all(parent)
    .map_err(|err| format!("failed to create parent directory {}: {}", parent.display(), err))?;
  let temp_path = parent.join(format!(".affine-sync-tmp-{}.md", Uuid::new_v4()));
  if let Err(err) = fs::write(&temp_path, content) {
    let _ = fs::remove_file(&temp_path);
    return Err(format!("failed to write temp file {}: {}", temp_path.display(), err));
  }
  let result = match fs::hard_link(&temp_path, path) {
    Ok(()) => Ok(()),
    Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => Err(err),
    Err(_) => write_new_without_hard_link(path, content),
  };
  let _ = fs::remove_file(&temp_path);
  result.map_err(|err| format!("failed to create new markdown file {}: {}", path.display(), err))
}

fn write_new_without_hard_link(path: &Path, content: &str) -> std::io::Result<()> {
  let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
  let result = file.write_all(content.as_bytes());
  drop(file);
  if result.is_err() {
    let _ = fs::remove_file(path);
  }
  result
}

pub(crate) fn hash_string(value: &str) -> String {
  let mut hasher = Sha3_256::new();
  hasher.update(value.as_bytes());
  let digest = hasher.finalize();

  let mut out = String::with_capacity(digest.len() * 2);
  for byte in digest {
    out.push(hex_char(byte >> 4));
    out.push(hex_char(byte & 0x0f));
  }
  out
}

pub(crate) fn hash_meta(meta: &FrontmatterMeta) -> String {
  let mut canonical = String::new();
  canonical.push_str("id=");
  canonical.push_str(meta.id.as_deref().unwrap_or_default());

  canonical.push_str("|title=");
  canonical.push_str(meta.title.as_deref().unwrap_or_default());

  canonical.push_str("|tags=");
  if let Some(tags) = normalize_tags(meta.tags.clone()) {
    canonical.push_str(&tags.join("\u{1f}"));
  }

  canonical.push_str("|favorite=");
  canonical.push_str(if meta.favorite.unwrap_or(false) {
    "true"
  } else {
    "false"
  });

  canonical.push_str("|trash=");
  canonical.push_str(if meta.trash.unwrap_or(false) { "true" } else { "false" });

  hash_string(&canonical)
}

fn hex_char(value: u8) -> char {
  match value {
    0..=9 => (b'0' + value) as char,
    10..=15 => (b'a' + (value - 10)) as char,
    _ => '0',
  }
}

pub(crate) fn now_naive() -> NaiveDateTime {
  DateTime::from_timestamp_millis(Utc::now().timestamp_millis())
    .unwrap_or_else(Utc::now)
    .naive_utc()
}

pub(crate) fn is_empty_update(value: &[u8]) -> bool {
  value.is_empty() || value == [0, 0]
}

pub(crate) fn merge_update_binary(existing: Option<&[u8]>, update: &[u8]) -> Result<Vec<u8>, String> {
  let mut doc = build_doc(None);
  if let Some(existing) = existing.filter(|value| !is_empty_update(value)) {
    doc
      .apply_update_from_binary_v1(existing)
      .map_err(|err| format!("failed to apply existing update: {err}"))?;
  }
  if !is_empty_update(update) {
    doc
      .apply_update_from_binary_v1(update)
      .map_err(|err| format!("failed to merge update: {err}"))?;
  }
  doc
    .encode_state_as_update_v1(&y_octo::StateVector::default())
    .map_err(|err| format!("failed to encode merged update: {err}"))
}

pub(crate) fn merge_frontend_update_binary(existing: Option<&[u8]>, update: &[u8]) -> Result<Vec<u8>, String> {
  // Re-encoding through Doc folds consecutive Y.Text items and changes their
  // replay structure.
  let updates = existing
    .into_iter()
    .chain(std::iter::once(update))
    .filter(|value| !is_empty_update(value))
    .collect::<Vec<_>>();
  if updates.is_empty() {
    return Ok(vec![0, 0]);
  }
  if updates.len() == 1 {
    let update = updates[0];
    let mut doc = build_doc(None);
    doc
      .apply_update_from_binary_v1(update)
      .map_err(|err| format!("failed to apply frontend update: {err}"))?;
    return Ok(update.to_vec());
  }
  merge_updates_v1(updates)
    .and_then(|merged| merged.encode_v1())
    .map_err(|err| format!("failed to merge frontend update: {err}"))
}

pub(crate) fn same_update_state(left: &[u8], right: &[u8]) -> Result<bool, String> {
  let mut left_doc = build_doc(None);
  left_doc
    .apply_update_from_binary_v1(left)
    .map_err(|err| format!("failed to decode checkpoint update: {err}"))?;
  let mut right_doc = build_doc(None);
  right_doc
    .apply_update_from_binary_v1(right)
    .map_err(|err| format!("failed to decode local update: {err}"))?;
  Ok(
    left_doc.get_state_vector() == right_doc.get_state_vector()
      && left_doc.get_delete_sets() == right_doc.get_delete_sets(),
  )
}

pub(crate) fn merge_root_update_binary(existing: &[u8], update: &[u8]) -> Result<Vec<u8>, String> {
  if is_empty_update(existing) {
    return Ok(update.to_vec());
  }
  if is_empty_update(update) {
    return Ok(existing.to_vec());
  }
  merge_updates_v1([existing, update])
    .and_then(|merged| merged.encode_v1())
    .map_err(|err| format!("failed to merge root update: {err}"))
}

pub(crate) fn build_doc(doc_id: Option<&str>) -> Doc {
  let options = DocOptions::new();
  match doc_id {
    Some(doc_id) => options.with_guid(doc_id.to_string()).build(),
    None => options.build(),
  }
}

pub(crate) fn load_doc_or_new(binary: &[u8], doc_id: Option<&str>) -> Result<Doc, String> {
  if is_empty_update(binary) {
    return Ok(build_doc(doc_id));
  }

  let mut doc = build_doc(doc_id);
  doc
    .apply_update_from_binary_v1(binary)
    .map_err(|err| format!("failed to decode doc binary: {}", err))?;
  Ok(doc)
}

pub(crate) fn paths_equal(lhs: &Path, rhs: &Path) -> bool {
  if lhs == rhs {
    return true;
  }

  match (lhs.canonicalize(), rhs.canonicalize()) {
    (Ok(lhs), Ok(rhs)) => lhs == rhs,
    _ => false,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn new_file_fallback_keeps_existing_content() {
    let dir = std::env::temp_dir().join(format!("affine-disk-fallback-{}", Uuid::new_v4()));
    fs::create_dir(&dir).expect("create directory");
    let path = dir.join("note.md");
    write_new_without_hard_link(&path, "new content").expect("create file");
    assert!(write_new_without_hard_link(&path, "replacement").is_err());
    assert_eq!(fs::read_to_string(&path).expect("read file"), "new content");
    fs::remove_dir_all(dir).expect("remove directory");
  }
}
