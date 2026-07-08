use std::{
  collections::{HashSet, hash_map::DefaultHasher},
  fs,
  hash::{Hash, Hasher},
  path::{Path, PathBuf},
};

mod content;

use affine_importer::{
  FolderHierarchyDelta, ImportBatch, ImportBatchLimits, ImportCursor, ImportError, ImportOptions, ImportProgress,
  ImportProvider, ImportResult, ImportSource, ImportWarning, ImportedAsset, ImportedDocMeta, ImportedDocSnapshot,
};
use content::{page_markdown, remove_blocks_with_source_ids, rewrite_non_image_assets_to_attachments};
use onenote_parser::{
  Parser,
  notebook::Notebook,
  page::Page,
  section::{Section, SectionEntry, SectionGroup},
};
use typed_path::TypedPath;

pub struct OneNoteImportProvider;

impl OneNoteImportProvider {
  pub fn new() -> Self {
    Self
  }
}

impl ImportProvider for OneNoteImportProvider {
  fn format(&self) -> &'static str {
    "oneNote"
  }

  fn create_cursor(
    &self,
    source: ImportSource,
    _options: ImportOptions,
    limits: ImportBatchLimits,
  ) -> ImportResult<Box<dyn ImportCursor>> {
    let mut planner = OneNotePlanner {
      docs: Vec::new(),
      folders: Vec::new(),
      warnings: Vec::new(),
    };
    planner.read_source(source)?;
    Ok(Box::new(OneNoteImportCursor {
      docs: planner.docs,
      folders: planner.folders,
      warnings: planner.warnings,
      next_asset_doc: 0,
      next_asset_index: 0,
      next_doc: 0,
      emitted_final: false,
      skipped_blob_ids: HashSet::new(),
      limits,
    }))
  }
}

struct OneNoteDoc {
  id: String,
  title: String,
  markdown: String,
  assets: Vec<ImportedAsset>,
}

struct OneNotePlanner {
  docs: Vec<OneNoteDoc>,
  folders: Vec<FolderHierarchyDelta>,
  warnings: Vec<ImportWarning>,
}

impl OneNotePlanner {
  fn read_source(&mut self, source: ImportSource) -> ImportResult<()> {
    match source {
      ImportSource::FilePath(path) => self.read_file(&path),
      ImportSource::DirectoryPath(path) => self.read_directory(&path),
    }
  }

  fn read_file(&mut self, path: &Path) -> ImportResult<()> {
    let parser = Parser::new();
    match extension(path).as_deref() {
      Some("one") => {
        let source_path = path.to_string_lossy();
        let section = parser
          .parse_section(TypedPath::derive(source_path.as_ref()))
          .map_err(import_error)?;
        self.add_section(&section, None);
        Ok(())
      }
      Some("onetoc2") => {
        let source_path = path.to_string_lossy();
        let notebook = parser
          .parse_notebook(TypedPath::derive(source_path.as_ref()))
          .map_err(import_error)?;
        self.add_notebook(&notebook, notebook_name(path));
        Ok(())
      }
      Some("onepkg") => {
        let source_path = path.to_string_lossy();
        let notebook = parser
          .parse_package(TypedPath::derive(source_path.as_ref()))
          .map_err(import_error)?;
        self.add_notebook(&notebook, notebook_name(path));
        Ok(())
      }
      _ => Err(ImportError::InvalidSource(format!(
        "unsupported OneNote source: {}",
        path.to_string_lossy()
      ))),
    }
  }

  fn read_directory(&mut self, path: &Path) -> ImportResult<()> {
    let toc = find_first_onetoc2(path)?.ok_or_else(|| {
      ImportError::InvalidSource(format!(
        "directory contains no .onetoc2 file: {}",
        path.to_string_lossy()
      ))
    })?;
    let parser = Parser::new();
    let toc_path = toc.to_string_lossy();
    let notebook = parser
      .parse_notebook(TypedPath::derive(toc_path.as_ref()))
      .map_err(import_error)?;
    self.add_notebook(&notebook, notebook_name(path));
    Ok(())
  }

  fn add_notebook(&mut self, notebook: &Notebook, name: String) {
    let root = sanitize_path_part(&name);
    self.folders.push(FolderHierarchyDelta {
      path: root.clone(),
      name,
      parent_path: None,
      page_id: None,
      icon: None,
    });
    for entry in notebook.entries() {
      self.add_section_entry(entry, Some(root.clone()));
    }
  }

  fn add_section_entry(&mut self, entry: &SectionEntry, parent_path: Option<String>) {
    match entry {
      SectionEntry::Section(section) => self.add_section(section, parent_path),
      SectionEntry::SectionGroup(group) => self.add_section_group(group, parent_path),
    }
  }

  fn add_section_group(&mut self, group: &SectionGroup, parent_path: Option<String>) {
    let path = join_import_path(parent_path.as_deref(), group.display_name());
    self.folders.push(FolderHierarchyDelta {
      path: path.clone(),
      name: group.display_name().to_string(),
      parent_path,
      page_id: None,
      icon: None,
    });
    for entry in group.entries() {
      self.add_section_entry(entry, Some(path.clone()));
    }
  }

  fn add_section(&mut self, section: &Section, parent_path: Option<String>) {
    let path = join_import_path(parent_path.as_deref(), section.display_name());
    self.folders.push(FolderHierarchyDelta {
      path: path.clone(),
      name: section.display_name().to_string(),
      parent_path,
      page_id: None,
      icon: None,
    });
    let mut page_index = 0;
    for series in section.page_series() {
      for page in series.pages() {
        self.add_page(page, &path, page_index);
        page_index += 1;
      }
    }
  }

  fn add_page(&mut self, page: &Page, parent_path: &str, page_index: usize) {
    let title = page
      .title_text()
      .map(str::trim)
      .filter(|title| !title.is_empty())
      .unwrap_or("Untitled")
      .to_string();
    let source_path = join_import_path(Some(parent_path), &title);
    let id = doc_id(page.link_target_id(), &title, parent_path, page_index);
    let mut assets = Vec::new();
    let markdown = page_markdown(page, &mut assets, &mut self.warnings, &source_path);
    self.folders.push(FolderHierarchyDelta {
      path: source_path.clone(),
      name: title.clone(),
      parent_path: Some(parent_path.to_string()),
      page_id: Some(id.clone()),
      icon: None,
    });
    self.docs.push(OneNoteDoc {
      id,
      title,
      markdown,
      assets,
    });
  }
}

struct OneNoteImportCursor {
  docs: Vec<OneNoteDoc>,
  folders: Vec<FolderHierarchyDelta>,
  warnings: Vec<ImportWarning>,
  next_asset_doc: usize,
  next_asset_index: usize,
  next_doc: usize,
  emitted_final: bool,
  skipped_blob_ids: HashSet<String>,
  limits: ImportBatchLimits,
}

impl ImportCursor for OneNoteImportCursor {
  fn total(&self) -> usize {
    self.docs.len()
  }

  fn next_batch(&mut self) -> ImportResult<Option<ImportBatch>> {
    if self.next_doc >= self.docs.len() && self.emitted_final {
      return Ok(None);
    }

    if let Some(batch) = self.next_asset_batch() {
      return Ok(Some(batch));
    }

    let end = (self.next_doc + self.limits.max_docs.max(1)).min(self.docs.len());
    let mut batch = empty_batch(self.docs.len());
    for doc in &self.docs[self.next_doc..end] {
      let mut snapshot = affine_doc_loader::build_doc_snapshot(&doc.title, &doc.markdown, &doc.id)?;
      rewrite_non_image_assets_to_attachments(&mut snapshot, &doc.assets);
      remove_blocks_with_source_ids(&mut snapshot, &self.skipped_blob_ids);
      batch.docs.push(ImportedDocSnapshot {
        id: doc.id.clone(),
        snapshot,
        meta: Some(ImportedDocMeta {
          title: Some(doc.title.clone()),
          create_date: None,
          updated_date: None,
          tags: None,
          favorite: None,
          trash: None,
        }),
      });
    }
    self.next_doc = end;
    if self.next_doc >= self.docs.len() {
      batch.folders = std::mem::take(&mut self.folders);
      batch.warnings = std::mem::take(&mut self.warnings);
      self.emitted_final = true;
    }
    batch.progress = ImportProgress {
      completed: self.next_doc,
      total: self.docs.len(),
    };
    batch.done = self.emitted_final;
    Ok(Some(batch))
  }
}

impl OneNoteImportCursor {
  fn next_asset_batch(&mut self) -> Option<ImportBatch> {
    let max_blobs = self.limits.max_blobs.max(1);
    let max_blob_bytes = self.limits.max_blob_bytes;
    let mut batch = empty_batch(self.docs.len());
    let mut bytes_in_batch = 0u64;

    while self.next_asset_doc < self.docs.len() && batch.blobs.len() < max_blobs {
      let doc = &self.docs[self.next_asset_doc];
      if self.next_asset_index >= doc.assets.len() {
        self.next_asset_doc += 1;
        self.next_asset_index = 0;
        continue;
      }

      let asset = &doc.assets[self.next_asset_index];
      self.next_asset_index += 1;
      let asset_size = asset.bytes.len() as u64;
      if asset_size > max_blob_bytes {
        self.skipped_blob_ids.insert(asset.blob_id.clone());
        batch.warnings.push(ImportWarning {
          code: "blob_too_large".to_string(),
          source_path: Some(asset.source_path.clone()),
          message: format!("Skipped {}: blob is larger than batch limit", asset.source_path),
        });
        continue;
      }
      if !batch.blobs.is_empty() && bytes_in_batch + asset_size > max_blob_bytes {
        self.next_asset_index -= 1;
        break;
      }
      bytes_in_batch += asset_size;
      batch.blobs.push(asset.clone());
    }

    if batch.blobs.is_empty() && batch.warnings.is_empty() {
      return None;
    }
    batch.progress = ImportProgress {
      completed: self.next_doc,
      total: self.docs.len(),
    };
    Some(batch)
  }
}

fn empty_batch(total: usize) -> ImportBatch {
  ImportBatch {
    docs: Vec::new(),
    blobs: Vec::new(),
    folders: Vec::new(),
    tags: Vec::new(),
    icons: Vec::new(),
    warnings: Vec::new(),
    progress: ImportProgress { completed: 0, total },
    entry_id: None,
    is_workspace_file: false,
    done: false,
  }
}

fn find_first_onetoc2(root: &Path) -> ImportResult<Option<PathBuf>> {
  for entry in fs::read_dir(root)? {
    let entry = entry?;
    let path = entry.path();
    if path.is_dir() {
      if let Some(found) = find_first_onetoc2(&path)? {
        return Ok(Some(found));
      }
    } else if extension(&path).as_deref() == Some("onetoc2") {
      return Ok(Some(path));
    }
  }
  Ok(None)
}

fn import_error(error: onenote_parser::errors::Error) -> ImportError {
  ImportError::InvalidSource(error.to_string())
}

fn notebook_name(path: &Path) -> String {
  path
    .file_stem()
    .or_else(|| path.file_name())
    .map(|name| name.to_string_lossy().to_string())
    .filter(|name| !name.is_empty())
    .unwrap_or_else(|| "OneNote".to_string())
}

fn extension(path: &Path) -> Option<String> {
  path.extension().map(|ext| ext.to_string_lossy().to_lowercase())
}

fn join_import_path(parent: Option<&str>, name: &str) -> String {
  let name = sanitize_path_part(name);
  parent
    .filter(|parent| !parent.is_empty())
    .map(|parent| format!("{parent}/{name}"))
    .unwrap_or(name)
}

fn sanitize_path_part(value: &str) -> String {
  let name = value
    .split(['/', '\\'])
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" ")
    .trim()
    .to_string();
  if name.is_empty() { "Untitled".to_string() } else { name }
}

fn doc_id(raw_id: &str, title: &str, parent_path: &str, page_index: usize) -> String {
  let mut id = raw_id
    .chars()
    .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
    .collect::<String>();
  if id.is_empty() {
    let slug = title
      .chars()
      .filter(|ch| ch.is_ascii_alphanumeric())
      .take(32)
      .collect::<String>();
    let mut hasher = DefaultHasher::new();
    title.hash(&mut hasher);
    parent_path.hash(&mut hasher);
    page_index.hash(&mut hasher);
    let hash = format!("{:x}", hasher.finish());
    id = if slug.is_empty() {
      hash
    } else {
      format!("{slug}-{hash}")
    };
  }
  format!("onenote-{id}")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sanitize_path_part_removes_path_separators() {
    assert_eq!(sanitize_path_part("Group/Section\\Page"), "Group Section Page");
    assert_eq!(sanitize_path_part("///"), "Untitled");
  }

  #[test]
  fn join_import_path_sanitizes_path_parts() {
    assert_eq!(
      join_import_path(Some("Notebook/Section"), "Page/Subpage\\Draft"),
      "Notebook/Section/Page Subpage Draft"
    );
  }

  #[test]
  fn doc_id_keeps_ascii_ids_and_hashes_non_ascii_titles() {
    assert_eq!(doc_id("{abc-123}", "Ignored", "Notebook/Section", 0), "onenote-abc-123");

    let id = doc_id("", "中文标题", "Notebook/Section", 0);
    assert!(id.starts_with("onenote-"));
    assert!(id.len() > "onenote-".len());
  }

  #[test]
  fn doc_id_fallback_distinguishes_duplicate_titles() {
    let first = doc_id("", "Untitled", "Notebook/Section", 0);
    let second = doc_id("", "Untitled", "Notebook/Section", 1);

    assert_ne!(first, second);
  }
}
