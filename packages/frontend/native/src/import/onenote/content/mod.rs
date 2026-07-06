use std::{collections::HashSet, io::Read};

mod rich_text;

use affine_importer::{ImportWarning, ImportedAsset};
use onenote_parser::{
  contents::{Content, EmbeddedFile, Image, Outline, OutlineElement, OutlineGroup, OutlineItem, Table},
  page::Page,
};
use rich_text::rich_text_markdown;
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};

pub(super) fn page_markdown(
  page: &Page,
  assets: &mut Vec<ImportedAsset>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
) -> String {
  let mut lines = Vec::new();
  for content in page.contents() {
    if let Some(outline) = content.outline() {
      lines.push(outline_markdown(outline, assets, warnings, source_path));
    } else if let Some(image) = content.image() {
      lines.push(image_markdown(image, assets, warnings, source_path));
    } else if let Some(file) = content.embedded_file() {
      lines.push(embedded_file_markdown(file, assets, warnings, source_path));
    } else if content.ink().is_some() {
      push_warning(warnings, source_path, "onenote-ink", "Skipped OneNote ink content");
    }
  }
  let markdown = lines
    .into_iter()
    .filter(|line| !line.trim().is_empty())
    .collect::<Vec<_>>()
    .join("\n\n");
  if markdown.trim().is_empty() {
    " ".to_string()
  } else {
    markdown
  }
}

pub(super) fn rewrite_non_image_assets_to_attachments(value: &mut JsonValue, assets: &[ImportedAsset]) {
  match value {
    JsonValue::Object(map) => {
      let attachment = map
        .get("flavour")
        .and_then(JsonValue::as_str)
        .filter(|flavour| *flavour == "affine:image")
        .and_then(|_| map.get("props"))
        .and_then(JsonValue::as_object)
        .and_then(|props| props.get("sourceId"))
        .and_then(JsonValue::as_str)
        .and_then(|source_id| assets.iter().find(|asset| asset.blob_id == source_id))
        .filter(|asset| !asset.mime.starts_with("image/"));

      if let Some(asset) = attachment {
        map.insert(
          "flavour".to_string(),
          JsonValue::String("affine:attachment".to_string()),
        );
        if let Some(props) = map.get_mut("props").and_then(JsonValue::as_object_mut) {
          props.insert("name".to_string(), JsonValue::String(asset.file_name.clone()));
          props.insert("size".to_string(), JsonValue::Number(asset.bytes.len().into()));
          props.insert("type".to_string(), JsonValue::String(asset.mime.clone()));
          props.insert("embed".to_string(), JsonValue::Bool(false));
          props.insert("style".to_string(), JsonValue::String("horizontalThin".to_string()));
          props.insert("footnoteIdentifier".to_string(), JsonValue::Null);
        }
      }
      for value in map.values_mut() {
        rewrite_non_image_assets_to_attachments(value, assets);
      }
    }
    JsonValue::Array(values) => {
      for value in values {
        rewrite_non_image_assets_to_attachments(value, assets);
      }
    }
    _ => {}
  }
}

pub(super) fn remove_blocks_with_source_ids(value: &mut JsonValue, source_ids: &HashSet<String>) {
  if source_ids.is_empty() {
    return;
  }

  match value {
    JsonValue::Object(map) => {
      for value in map.values_mut() {
        remove_blocks_with_source_ids(value, source_ids);
      }
    }
    JsonValue::Array(values) => {
      for value in values.iter_mut() {
        remove_blocks_with_source_ids(value, source_ids);
      }
      values.retain(|value| {
        block_source_id(value)
          .map(|source_id| !source_ids.contains(source_id))
          .unwrap_or(true)
      });
    }
    _ => {}
  }
}

fn block_source_id(value: &JsonValue) -> Option<&str> {
  value
    .as_object()
    .and_then(|map| map.get("props"))
    .and_then(JsonValue::as_object)
    .and_then(|props| props.get("sourceId"))
    .and_then(JsonValue::as_str)
}

fn outline_markdown(
  outline: &Outline,
  assets: &mut Vec<ImportedAsset>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
) -> String {
  outline
    .items()
    .iter()
    .map(|item| outline_item_markdown(item, 0, assets, warnings, source_path))
    .filter(|item| !item.trim().is_empty())
    .collect::<Vec<_>>()
    .join("\n\n")
}

fn outline_item_markdown(
  item: &OutlineItem,
  depth: usize,
  assets: &mut Vec<ImportedAsset>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
) -> String {
  match item {
    OutlineItem::Element(element) => outline_element_markdown(element, depth, assets, warnings, source_path),
    OutlineItem::Group(group) => outline_group_markdown(group, depth, assets, warnings, source_path),
  }
}

fn outline_group_markdown(
  group: &OutlineGroup,
  depth: usize,
  assets: &mut Vec<ImportedAsset>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
) -> String {
  let depth = depth + group.child_level() as usize;
  group
    .outlines()
    .iter()
    .map(|item| outline_item_markdown(item, depth, assets, warnings, source_path))
    .filter(|item| !item.trim().is_empty())
    .collect::<Vec<_>>()
    .join("\n")
}

fn outline_element_markdown(
  element: &OutlineElement,
  depth: usize,
  assets: &mut Vec<ImportedAsset>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
) -> String {
  let mut content = element
    .contents()
    .iter()
    .map(|content| content_markdown(content, assets, warnings, source_path))
    .filter(|content| !content.trim().is_empty())
    .collect::<Vec<_>>()
    .join("\n\n");

  if !content.trim().is_empty() && element_is_list(element) {
    content = list_item_markdown(element, depth, &content);
  }

  let mut lines = Vec::new();
  if !content.trim().is_empty() {
    lines.push(content);
  }
  for child in element.children() {
    let child = outline_item_markdown(child, depth + 1, assets, warnings, source_path);
    if !child.trim().is_empty() {
      lines.push(child);
    }
  }
  lines.join("\n")
}

fn content_markdown(
  content: &Content,
  assets: &mut Vec<ImportedAsset>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
) -> String {
  if let Some(text) = content.rich_text() {
    return rich_text_markdown(text);
  }
  if let Some(table) = content.table() {
    return table_markdown(table, assets, warnings, source_path);
  }
  if let Some(image) = content.image() {
    return image_markdown(image, assets, warnings, source_path);
  } else if let Some(file) = content.embedded_file() {
    return embedded_file_markdown(file, assets, warnings, source_path);
  } else if content.ink().is_some() {
    push_warning(warnings, source_path, "onenote-ink", "Skipped OneNote ink content");
  }
  String::new()
}

fn table_markdown(
  table: &Table,
  assets: &mut Vec<ImportedAsset>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
) -> String {
  let rows = table
    .contents()
    .iter()
    .map(|row| {
      row
        .contents()
        .iter()
        .map(|cell| {
          let markdown = cell
            .contents()
            .iter()
            .map(|element| outline_element_markdown(element, 0, assets, warnings, source_path))
            .collect::<Vec<_>>()
            .join("\n");
          markdown_table_cell(&markdown)
        })
        .collect::<Vec<_>>()
    })
    .collect::<Vec<_>>();
  if rows.is_empty() {
    return String::new();
  }
  let cols = rows.iter().map(Vec::len).max().unwrap_or(0).max(1);
  let mut markdown = String::new();
  let header = rows.first().cloned().unwrap_or_default();
  markdown.push_str(&markdown_row(&header, cols));
  markdown.push('\n');
  markdown.push_str(&markdown_row(&vec!["---".to_string(); cols], cols));
  for row in rows.iter().skip(1) {
    markdown.push('\n');
    markdown.push_str(&markdown_row(row, cols));
  }
  markdown
}

fn markdown_row(row: &[String], cols: usize) -> String {
  let mut cells = row.to_vec();
  cells.resize(cols, String::new());
  format!("| {} |", cells.join(" | "))
}

fn markdown_table_cell(value: &str) -> String {
  value
    .lines()
    .map(str::trim)
    .filter(|line| !line.is_empty())
    .collect::<Vec<_>>()
    .join("<br />")
    .replace('|', "\\|")
}

fn escape_markdown_label(value: &str) -> String {
  let mut output = String::with_capacity(value.len());
  for ch in value.chars() {
    match ch {
      '\\' | '[' | ']' | '*' | '_' | '`' => {
        output.push('\\');
        output.push(ch);
      }
      '\n' | '\r' => output.push(' '),
      _ => output.push(ch),
    }
  }
  output
}

fn image_markdown(
  image: &Image,
  assets: &mut Vec<ImportedAsset>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
) -> String {
  let Some(bytes) = read_optional_blob(image.read(), warnings, source_path, "onenote-image") else {
    return image
      .alt_text()
      .or_else(|| image.text())
      .unwrap_or_default()
      .to_string();
  };
  let detected = infer::get(&bytes);
  let file_name = image_file_name(image, assets.len() + 1, detected.map(|kind| kind.extension()));
  let blob_id = blob_id(&bytes);
  let mime = image_mime(image, &file_name, detected.map(|kind| kind.mime_type()));
  assets.push(ImportedAsset {
    blob_id: blob_id.clone(),
    source_path: format!("{source_path}/{file_name}"),
    file_name,
    mime,
    bytes,
  });
  let caption = image.alt_text().or_else(|| image.text()).unwrap_or("");
  format!("![{}](blob://{})", escape_markdown_label(caption), blob_id)
}

fn element_is_list(element: &OutlineElement) -> bool {
  !element.list_contents().is_empty()
}

fn list_item_markdown(element: &OutlineElement, depth: usize, content: &str) -> String {
  let marker = list_marker(element);
  let indent = "  ".repeat(depth);
  content
    .lines()
    .enumerate()
    .map(|(index, line)| {
      if index == 0 {
        format!("{indent}{marker} {line}")
      } else if line.trim().is_empty() {
        String::new()
      } else {
        format!("{indent}  {line}")
      }
    })
    .collect::<Vec<_>>()
    .join("\n")
}

fn list_marker(element: &OutlineElement) -> &'static str {
  let ordered = element.list_contents().iter().any(|list| {
    list.list_restart().is_some()
      || list
        .list_format()
        .iter()
        .any(|ch| ch.is_ascii_digit() || matches!(ch, '%' | '#'))
  });
  if ordered { "1." } else { "-" }
}

fn image_file_name(image: &Image, index: usize, detected_ext: Option<&'static str>) -> String {
  let raw_name = image
    .image_filename()
    .filter(|name| !name.trim().is_empty())
    .map(|name| sanitize_file_name(name, "image"))
    .unwrap_or_else(|| {
      let ext = image.extension().or(detected_ext).unwrap_or("png");
      format!("image-{index}.{ext}")
    });

  if mime_from_path(&raw_name).starts_with("image/") {
    return raw_name;
  }

  image
    .extension()
    .or(detected_ext)
    .map(|ext| format!("{raw_name}.{ext}"))
    .unwrap_or(raw_name)
}

fn embedded_file_markdown(
  file: &EmbeddedFile,
  assets: &mut Vec<ImportedAsset>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
) -> String {
  let mut reader = file.read();
  let mut bytes = Vec::new();
  if let Err(error) = reader.read_to_end(&mut bytes) {
    push_warning(
      warnings,
      source_path,
      "onenote-attachment",
      &format!("Skipped OneNote embedded file content: {error}"),
    );
    return file.filename().to_string();
  }
  let file_name = sanitize_file_name(file.filename(), "attachment");
  let blob_id = blob_id(&bytes);
  assets.push(ImportedAsset {
    blob_id: blob_id.clone(),
    source_path: format!("{source_path}/{file_name}"),
    file_name: file_name.clone(),
    mime: mime_from_path(&file_name).to_string(),
    bytes,
  });
  format!("![{}](blob://{})", escape_markdown_label(&file_name), blob_id)
}

fn read_optional_blob(
  reader: Option<Box<dyn Read>>,
  warnings: &mut Vec<ImportWarning>,
  source_path: &str,
  code: &str,
) -> Option<Vec<u8>> {
  let Some(mut reader) = reader else {
    push_warning(
      warnings,
      source_path,
      code,
      "Skipped OneNote blob content: missing data",
    );
    return None;
  };
  let mut bytes = Vec::new();
  if let Err(error) = reader.read_to_end(&mut bytes) {
    push_warning(
      warnings,
      source_path,
      code,
      &format!("Skipped OneNote blob content: {error}"),
    );
    return None;
  }
  Some(bytes)
}

fn image_mime(image: &Image, file_name: &str, detected_mime: Option<&'static str>) -> String {
  image
    .extension()
    .map(mime_from_extension)
    .or(detected_mime)
    .unwrap_or_else(|| mime_from_path(file_name))
    .to_string()
}

fn blob_id(bytes: &[u8]) -> String {
  let mut hasher = Sha256::new();
  hasher.update(bytes);
  hex::encode(hasher.finalize())
}

fn sanitize_file_name(value: &str, fallback: &str) -> String {
  let name = value
    .split(['/', '\\', '\0'])
    .filter(|part| !part.is_empty() && *part != "." && *part != "..")
    .collect::<Vec<_>>()
    .join(" ")
    .trim()
    .to_string();
  if name.is_empty() { fallback.to_string() } else { name }
}

fn mime_from_path(path: &str) -> &'static str {
  match path.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "gif" => "image/gif",
    "webp" => "image/webp",
    "bmp" => "image/bmp",
    "svg" => "image/svg+xml",
    "pdf" => "application/pdf",
    "txt" => "text/plain",
    "md" | "markdown" => "text/markdown",
    "csv" => "text/csv",
    "zip" => "application/zip",
    "doc" => "application/msword",
    "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls" => "application/vnd.ms-excel",
    "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt" => "application/vnd.ms-powerpoint",
    "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    _ => "application/octet-stream",
  }
}

fn mime_from_extension(extension: &str) -> &'static str {
  mime_from_path(extension)
}

fn push_warning(warnings: &mut Vec<ImportWarning>, source_path: &str, code: &str, message: &str) {
  warnings.push(ImportWarning {
    code: code.to_string(),
    source_path: Some(source_path.to_string()),
    message: message.to_string(),
  });
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::*;

  #[test]
  fn markdown_table_cell_collapses_multiline_content() {
    assert_eq!(
      markdown_table_cell("first line\nsecond | line\n\n third line "),
      "first line<br />second \\| line<br />third line"
    );
  }

  #[test]
  fn remove_blocks_with_source_ids_removes_matching_nested_blocks() {
    let mut snapshot = json!({
      "children": [
        {
          "flavour": "affine:paragraph",
          "props": {},
          "children": [
            {
              "flavour": "affine:image",
              "props": { "sourceId": "skipped" },
              "children": []
            },
            {
              "flavour": "affine:image",
              "props": { "sourceId": "kept" },
              "children": []
            }
          ]
        }
      ]
    });
    let source_ids = HashSet::from(["skipped".to_string()]);

    remove_blocks_with_source_ids(&mut snapshot, &source_ids);

    assert_eq!(snapshot["children"][0]["children"].as_array().unwrap().len(), 1);
    assert_eq!(snapshot["children"][0]["children"][0]["props"]["sourceId"], "kept");
  }
}
