use std::{
  fs,
  path::{Path, PathBuf},
};

use chrono::{DateTime, NaiveDateTime, Utc};
use sha3::{Digest, Sha3_256};
use y_octo::{Doc, DocOptions, StateVector};

use super::{frontmatter::normalize_tags, types::FrontmatterMeta};

pub(crate) fn collect_markdown_files(root: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
  let entries = fs::read_dir(root).map_err(|err| format!("failed to read directory {}: {}", root.display(), err))?;

  for entry in entries {
    let entry = entry.map_err(|err| format!("failed to read directory entry: {}", err))?;
    let path = entry.path();

    if path
      .file_name()
      .and_then(|name| name.to_str())
      .is_some_and(|name| name == ".affine-sync")
    {
      continue;
    }

    if path.is_dir() {
      collect_markdown_files(&path, output)?;
      continue;
    }

    if path
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

pub(crate) fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
  let parent = path
    .parent()
    .ok_or_else(|| format!("path {} has no parent directory", path.display()))?;

  fs::create_dir_all(parent)
    .map_err(|err| format!("failed to create parent directory {}: {}", parent.display(), err))?;

  let temp_name = format!(
    ".affine-sync-tmp-{}-{}.md",
    std::process::id(),
    Utc::now().timestamp_millis()
  );
  let temp_path = parent.join(temp_name);

  fs::write(&temp_path, content)
    .map_err(|err| format!("failed to write temp file {}: {}", temp_path.display(), err))?;

  // On Unix, `rename` replaces the destination atomically. Avoiding an explicit
  // delete reduces "delete + create" file events, which can confuse file
  // watchers/editors and cause apparent content flapping.
  //
  // On Windows, `rename` fails if destination exists, so we remove first.
  #[cfg(windows)]
  {
    if path.exists() {
      fs::remove_file(path).map_err(|err| format!("failed to replace file {}: {}", path.display(), err))?;
    }
  }

  fs::rename(&temp_path, path).map_err(|err| {
    format!(
      "failed to move temp file {} to {}: {}",
      temp_path.display(),
      path.display(),
      err
    )
  })?;

  Ok(())
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

pub(crate) fn merge_update_binary(
  existing: Option<&[u8]>,
  update: &[u8],
  doc_id: Option<&str>,
) -> Result<Vec<u8>, String> {
  let mut doc = if let Some(existing) = existing {
    if is_empty_update(existing) {
      build_doc(doc_id)
    } else {
      let mut doc = build_doc(doc_id);
      doc
        .apply_update_from_binary_v1(existing)
        .map_err(|err| format!("failed to apply existing update: {}", err))?;
      doc
    }
  } else {
    build_doc(doc_id)
  };

  if !is_empty_update(update) {
    doc
      .apply_update_from_binary_v1(update)
      .map_err(|err| format!("failed to merge update: {}", err))?;
  }

  doc
    .encode_state_as_update_v1(&StateVector::default())
    .map_err(|err| format!("failed to encode merged update: {}", err))
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
