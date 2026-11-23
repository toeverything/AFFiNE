use std::{collections::HashMap, fmt};

use affine_doc_loader::{
  ParseError, RootPageMetaPatch, build_root_meta_update as loader_build_root_meta_update,
  extract_all_root_meta as loader_extract_all_root_meta,
};
use chrono::Utc;

use super::{frontmatter::normalize_tags, types::FrontmatterMeta};

#[derive(Debug)]
pub(crate) enum RootMetaUpdateError {
  InvalidRootShape(String),
  Other(String),
}

impl fmt::Display for RootMetaUpdateError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::InvalidRootShape(msg) => write!(f, "invalid root shape: {msg}"),
      Self::Other(msg) => f.write_str(msg),
    }
  }
}

pub(crate) fn build_root_meta_update(
  existing_root: &[u8],
  _workspace_id: &str,
  doc_id: &str,
  meta: &FrontmatterMeta,
) -> Result<Vec<u8>, RootMetaUpdateError> {
  let patch = RootPageMetaPatch {
    title: meta.title.clone(),
    create_date: None,
    trash: meta.trash,
    trash_date: None,
    favorite: meta.favorite,
    tags: normalize_tags(meta.tags.clone()),
    updated_date: Some(Utc::now().timestamp_millis()),
  };
  match loader_build_root_meta_update(existing_root, doc_id, &patch) {
    Ok(Some(delta)) => Ok(delta),
    Ok(None) => Ok(vec![0, 0]),
    Err(ParseError::InvalidRootShape(msg)) => Err(RootMetaUpdateError::InvalidRootShape(msg)),
    Err(err) => Err(RootMetaUpdateError::Other(format!(
      "failed to build root meta update: {err}"
    ))),
  }
}

pub(crate) fn extract_root_meta_for_doc(root_bin: &[u8], doc_id: &str) -> Result<Option<FrontmatterMeta>, String> {
  let metas = extract_all_root_meta(root_bin)?;
  Ok(metas.get(doc_id).cloned())
}

pub(crate) fn extract_all_root_meta(root_bin: &[u8]) -> Result<HashMap<String, FrontmatterMeta>, String> {
  let pages = loader_extract_all_root_meta(root_bin).map_err(|err| format!("failed to extract root meta: {err}"))?;
  let mut result = HashMap::with_capacity(pages.len());
  for page in pages {
    result.insert(
      page.id.clone(),
      FrontmatterMeta {
        id: Some(page.id),
        title: page.title,
        tags: page.tags,
        favorite: page.favorite,
        trash: page.trash,
        extra: Vec::new(),
      },
    );
  }
  Ok(result)
}
