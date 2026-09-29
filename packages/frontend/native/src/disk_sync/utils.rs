use std::{
  collections::HashMap,
  fs::{self, OpenOptions},
  io::Write,
  path::{Path, PathBuf},
};

use chrono::{DateTime, NaiveDateTime, Utc};
use pulldown_cmark::{Event, Options, Parser, Tag};
use sha3::{Digest, Sha3_256};
use uuid::Uuid;
use y_octo::{Any, Doc, DocOptions, merge_updates_v1};

use super::{frontmatter::normalize_tags, types::FrontmatterMeta};

pub(crate) fn annotate_markdown_blocks(
  markdown: &str,
  previous_markdown: &str,
  checkpoint_source: &str,
) -> Result<String, String> {
  fn block_ranges(markdown: &str) -> Vec<std::ops::Range<usize>> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    let mut block_ranges = Vec::new();
    let mut depth = 0;
    for (event, range) in Parser::new_ext(markdown, options).into_offset_iter() {
      match event {
        Event::Start(tag) => {
          let is_marker = markdown.get(range.clone()).is_some_and(|source| {
            let source = source.trim();
            source.starts_with("<!--")
              && source.ends_with("-->")
              && source.contains("block_id=")
              && source.contains("flavour=")
          });
          if !is_marker && ((depth == 0 && !matches!(tag, Tag::List(_))) || (depth == 1 && matches!(tag, Tag::Item))) {
            block_ranges.push(range);
          }
          depth += 1;
        }
        Event::End(_) => depth -= 1,
        Event::Rule if depth == 0 => block_ranges.push(range),
        _ => {}
      }
    }
    block_ranges
  }

  struct BlockMarker {
    id: String,
    flavour: String,
    opaque: bool,
    marker_start: usize,
    content_start: usize,
  }

  let mut block_markers = Vec::new();
  let mut line_start = 0;
  for line in checkpoint_source.split_inclusive('\n') {
    let Some(marker) = line
      .trim()
      .strip_prefix("<!--")
      .and_then(|marker| marker.strip_suffix("-->"))
      .map(str::trim)
    else {
      line_start += line.len();
      continue;
    };
    if marker.split_whitespace().any(|token| token == "end") {
      line_start += line.len();
      continue;
    }
    let Some(id) = marker
      .split_whitespace()
      .find_map(|token| token.strip_prefix("block_id="))
    else {
      line_start += line.len();
      continue;
    };
    let Some(flavour) = marker
      .split_whitespace()
      .find_map(|token| token.strip_prefix("flavour="))
    else {
      line_start += line.len();
      continue;
    };
    block_markers.push(BlockMarker {
      id: id.to_string(),
      flavour: flavour.to_string(),
      opaque: marker.split_whitespace().any(|token| token == "opaque=true"),
      marker_start: line_start,
      content_start: line_start + line.len(),
    });
    line_start += line.len();
  }
  if block_markers.is_empty() {
    return Ok(markdown.to_string());
  }
  if markdown.lines().any(|line| {
    let marker = line.trim();
    marker.starts_with("<!--") && marker.ends_with("-->") && marker.contains("block_id=") && marker.contains("flavour=")
  }) {
    return Ok(markdown.to_string());
  }

  let current_ranges = block_ranges(markdown);
  let previous_ranges = block_ranges(previous_markdown);
  let previous_blocks = previous_ranges
    .iter()
    .map(|range| &previous_markdown[range.clone()])
    .collect::<Vec<_>>();
  let current_blocks = current_ranges
    .iter()
    .map(|range| &markdown[range.clone()])
    .collect::<Vec<_>>();

  let mut marker_previous = vec![None; block_markers.len()];
  let mut previous_cursor = 0;
  for (marker_index, marker) in block_markers.iter().enumerate() {
    if marker.opaque {
      continue;
    }
    let content_end = block_markers
      .get(marker_index + 1)
      .map(|next| next.marker_start)
      .unwrap_or(checkpoint_source.len());
    let content = &checkpoint_source[marker.content_start..content_end];
    let Some(source_range) = block_ranges(content).into_iter().next() else {
      return Err(format!("markdown block {} is missing from its checkpoint", marker.id));
    };
    let source_block = &content[source_range];
    let Some(previous_index) = previous_blocks
      .iter()
      .enumerate()
      .skip(previous_cursor)
      .find_map(|(index, block)| (block.trim_end() == source_block.trim_end()).then_some(index))
    else {
      return Err(format!("markdown block {} no longer matches its checkpoint", marker.id));
    };
    marker_previous[marker_index] = Some(previous_index);
    previous_cursor = previous_index + 1;
  }

  let matches_opaque_flavour = |block: &str, flavour: &str| {
    let block = block.trim_start();
    match flavour.strip_prefix("affine:").unwrap_or(flavour) {
      "table" => block.starts_with('|'),
      "list" => {
        block.starts_with("* ")
          || block.starts_with("- ")
          || block.starts_with("+ ")
          || block
            .split_once('.')
            .is_some_and(|(number, rest)| number.parse::<u64>().is_ok() && rest.starts_with(' '))
      }
      "code" => block.starts_with("```") || block.starts_with("~~~"),
      "divider" => matches!(block.lines().next(), Some("***" | "---" | "___")),
      _ => true,
    }
  };
  for marker_index in 0..block_markers.len() {
    if !block_markers[marker_index].opaque {
      continue;
    }
    let lower_bound = marker_previous[..marker_index]
      .iter()
      .rev()
      .flatten()
      .next()
      .map_or(0, |index| index + 1);
    let upper_bound = marker_previous[marker_index + 1..]
      .iter()
      .flatten()
      .next()
      .copied()
      .unwrap_or(previous_blocks.len());
    let previous_index = (lower_bound..upper_bound)
      .filter(|index| !marker_previous.contains(&Some(*index)))
      .find(|index| matches_opaque_flavour(previous_blocks[*index], &block_markers[marker_index].flavour))
      .or_else(|| (lower_bound..upper_bound).find(|index| !marker_previous.contains(&Some(*index))))
      .ok_or_else(|| {
        format!(
          "opaque markdown block {} is missing from its checkpoint",
          block_markers[marker_index].id
        )
      })?;
    marker_previous[marker_index] = Some(previous_index);
  }

  let mut previous_markers = vec![None; previous_blocks.len()];
  for (marker_index, previous_index) in marker_previous.iter().enumerate() {
    if let Some(previous_index) = previous_index {
      previous_markers[*previous_index] = Some(marker_index);
    }
  }

  let mut previous_occurrences: HashMap<&str, Vec<usize>> = HashMap::new();
  let mut current_occurrences: HashMap<&str, Vec<usize>> = HashMap::new();
  for (index, block) in previous_blocks.iter().enumerate() {
    previous_occurrences.entry(block).or_default().push(index);
  }
  for (index, block) in current_blocks.iter().enumerate() {
    current_occurrences.entry(block).or_default().push(index);
  }

  let mut exact_pairs = previous_occurrences
    .iter()
    .filter_map(|(block, previous)| {
      let current = current_occurrences.get(block)?;
      (previous.len() == 1 && current.len() == 1).then_some((previous[0], current[0]))
    })
    .collect::<Vec<_>>();
  exact_pairs.sort_unstable();
  let mut last_current = None;
  exact_pairs.retain(|(_, current)| {
    if last_current.is_some_and(|last| last >= *current) {
      return false;
    }
    last_current = Some(*current);
    true
  });

  let mut assignments = vec![None; current_ranges.len()];
  let mut previous_start = 0;
  let mut current_start = 0;
  for (previous_anchor, current_anchor) in exact_pairs
    .iter()
    .copied()
    .chain(std::iter::once((previous_ranges.len(), current_ranges.len())))
  {
    let previous_count = previous_anchor.saturating_sub(previous_start);
    let current_count = current_anchor.saturating_sub(current_start);
    if previous_count == current_count {
      for offset in 0..current_count {
        assignments[current_start + offset] = Some(previous_start + offset);
      }
    }
    if previous_anchor < previous_ranges.len() {
      assignments[current_anchor] = Some(previous_anchor);
    }
    previous_start = previous_anchor.saturating_add(1);
    current_start = current_anchor.saturating_add(1);
  }

  for (index, marker) in block_markers.iter().enumerate() {
    let previous_index = marker_previous[index];
    if marker.opaque
      && !assignments.iter().enumerate().any(|(current, previous)| {
        *previous == previous_index
          && previous_index.is_some_and(|previous| current_blocks[current] == previous_blocks[previous])
      })
    {
      return Err(format!(
        "external edits to opaque markdown block {} are not supported",
        marker.id
      ));
    }
  }

  let mut annotated = String::with_capacity(markdown.len() + block_markers.len() * 128);
  let mut cursor = 0;
  for (index, range) in current_ranges.into_iter().enumerate() {
    if range.start < cursor || range.end > markdown.len() {
      return Ok(markdown.to_string());
    }
    annotated.push_str(&markdown[cursor..range.start]);
    let Some(previous_index) = assignments[index] else {
      annotated.push_str(&markdown[range.clone()]);
      cursor = range.end;
      continue;
    };
    let Some(marker_index) = previous_markers[previous_index] else {
      annotated.push_str(&markdown[range.clone()]);
      cursor = range.end;
      continue;
    };
    let marker = &block_markers[marker_index];
    annotated.push_str(&format!(
      "<!-- block_id={} flavour={}{} -->\n",
      marker.id,
      marker.flavour,
      if marker.opaque { " opaque=true" } else { "" }
    ));
    if marker.opaque {
      annotated.push_str(&format!(
        "<!-- block_id={} flavour={} end -->\n",
        marker.id, marker.flavour
      ));
    } else {
      annotated.push_str(&markdown[range.clone()]);
    }
    cursor = range.end;
  }
  annotated.push_str(&markdown[cursor..]);
  Ok(annotated)
}

pub(crate) fn normalize_source_merge_current(baseline: &[u8], current: &[u8], doc_id: &str) -> Result<Vec<u8>, String> {
  let mut baseline_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
  baseline_doc
    .apply_update_from_binary_v1(baseline)
    .map_err(|error| format!("failed to load source checkpoint for {}: {}", doc_id, error))?;
  let baseline_blocks = baseline_doc
    .get_map("blocks")
    .map_err(|error| format!("failed to read source checkpoint blocks for {}: {}", doc_id, error))?;

  let mut current_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
  current_doc
    .apply_update_from_binary_v1(current)
    .map_err(|error| format!("failed to load local source doc for {}: {}", doc_id, error))?;
  let current_blocks = current_doc
    .get_map("blocks")
    .map_err(|error| format!("failed to read local source blocks for {}: {}", doc_id, error))?;
  let block_ids = current_blocks.iter().map(|(id, _)| id).collect::<Vec<_>>();
  let mut changed = false;
  for block_id in block_ids {
    let baseline_block = baseline_blocks.get(block_id).and_then(|value| value.to_map());
    let Some(baseline_block) = baseline_block else {
      continue;
    };
    if baseline_block.get("prop:collapsed").is_some() {
      continue;
    }
    let Some(mut current_block) = current_blocks.get(block_id).and_then(|value| value.to_map()) else {
      continue;
    };
    if matches!(
      current_block.get("prop:collapsed").and_then(|value| value.to_any()),
      Some(Any::False)
    ) {
      current_block.remove("prop:collapsed");
      changed = true;
    }
  }
  if !changed {
    return Ok(current.to_vec());
  }
  current_doc
    .encode_update_v1()
    .map_err(|error| format!("failed to normalize local source doc for {}: {}", doc_id, error))
}

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
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
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

  format!("{}-{}", stem, Uuid::new_v4())
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
    if ch.is_alphanumeric() {
      out.extend(ch.to_lowercase());
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
  let temp_path = parent.join(format!(".affine-sync-tmp-{}.tmp", Uuid::new_v4()));
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

  canonical.push_str("|extra=");
  canonical.push_str(&meta.extra.join("\u{1e}"));

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

pub(crate) fn is_complete_update(value: &[u8]) -> Result<bool, String> {
  if is_empty_update(value) {
    return Ok(true);
  }
  let mut doc = build_doc(None);
  doc
    .apply_update_from_binary_v1(value)
    .map_err(|err| format!("failed to decode update: {err}"))?;
  Ok(!doc.has_pending_updates())
}

pub(crate) fn merge_complete_root_update(existing: &[u8], update: &[u8]) -> Result<Option<Vec<u8>>, String> {
  let existing_complete = is_complete_update(existing).unwrap_or(false);
  let update_complete = is_complete_update(update).unwrap_or(false);
  match (existing_complete, update_complete) {
    (true, true) => merge_root_update_binary(existing, update).map(Some),
    (true, false) => Ok(Some(existing.to_vec())),
    (false, true) => Ok(Some(update.to_vec())),
    (false, false) => Ok(None),
  }
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

  #[test]
  fn generated_ids_are_unique_for_the_same_stem() {
    let path = Path::new("README.md");
    assert_ne!(generate_missing_doc_id(path), generate_missing_doc_id(path));
  }

  #[test]
  fn file_stems_keep_unicode_letters() {
    assert_eq!(sanitize_file_stem("会议记录 Überblick"), "会议记录-überblick");
  }

  #[test]
  fn markdown_collection_accepts_md_and_markdown_extensions() {
    let dir = std::env::temp_dir().join(format!("affine-disk-extensions-{}", Uuid::new_v4()));
    fs::create_dir(&dir).expect("create directory");
    fs::write(dir.join("one.md"), "one").expect("write md");
    fs::write(dir.join("two.markdown"), "two").expect("write markdown");
    fs::write(dir.join("three.txt"), "three").expect("write txt");

    let mut files = Vec::new();
    collect_markdown_files(&dir, &mut files).expect("collect markdown files");
    files.sort();

    assert_eq!(files, vec![dir.join("one.md"), dir.join("two.markdown")]);
    fs::remove_dir_all(dir).expect("remove directory");
  }
}
