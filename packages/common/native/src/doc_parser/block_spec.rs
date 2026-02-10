use y_octo::{Any, Map, TextAttributes, TextDeltaOp, TextInsert};

use super::{
  ParseError,
  blocksuite::get_string,
  schema::{
    PROP_CAPTION, PROP_CHECKED, PROP_COLUMN_ID_SUFFIX, PROP_COLUMNS_PREFIX, PROP_HEIGHT, PROP_LANGUAGE, PROP_ORDER,
    PROP_ORDER_SUFFIX, PROP_ROW_ID_SUFFIX, PROP_ROWS_PREFIX, PROP_SOURCE_ID, PROP_TEXT, PROP_TYPE, PROP_URL,
    PROP_VIDEO_ID, PROP_WIDTH, SYS_FLAVOUR, table_cell_text_key,
  },
  table::{MarkdownTableOptions, render_markdown_table},
  value::{value_to_f64, value_to_string},
};

/// Block flavours used in AFFiNE documents.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockFlavour {
  Paragraph,
  List,
  Code,
  Divider,
  Image,
  Table,
  Bookmark,
  EmbedYoutube,
  EmbedIframe,
  Callout,
}

impl BlockFlavour {
  pub fn as_str(&self) -> &'static str {
    match self {
      BlockFlavour::Paragraph => "affine:paragraph",
      BlockFlavour::List => "affine:list",
      BlockFlavour::Code => "affine:code",
      BlockFlavour::Divider => "affine:divider",
      BlockFlavour::Image => "affine:image",
      BlockFlavour::Table => "affine:table",
      BlockFlavour::Bookmark => "affine:bookmark",
      BlockFlavour::EmbedYoutube => "affine:embed-youtube",
      BlockFlavour::EmbedIframe => "affine:embed-iframe",
      BlockFlavour::Callout => "affine:callout",
    }
  }

  pub fn from_str(value: &str) -> Option<Self> {
    match value {
      "affine:paragraph" => Some(BlockFlavour::Paragraph),
      "affine:list" => Some(BlockFlavour::List),
      "affine:code" => Some(BlockFlavour::Code),
      "affine:divider" => Some(BlockFlavour::Divider),
      "affine:image" => Some(BlockFlavour::Image),
      "affine:table" => Some(BlockFlavour::Table),
      "affine:bookmark" => Some(BlockFlavour::Bookmark),
      "affine:embed-youtube" => Some(BlockFlavour::EmbedYoutube),
      "affine:embed-iframe" => Some(BlockFlavour::EmbedIframe),
      "affine:callout" => Some(BlockFlavour::Callout),
      _ => None,
    }
  }
}

/// Block types for paragraphs and lists.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlockType {
  // Paragraph types
  Text,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  Quote,
  // List types
  Bulleted,
  Numbered,
  Todo,
  // Preserve unknown types when loading from ydoc.
  Unknown(String),
}

impl BlockType {
  pub fn as_str(&self) -> &str {
    match self {
      BlockType::Text => "text",
      BlockType::H1 => "h1",
      BlockType::H2 => "h2",
      BlockType::H3 => "h3",
      BlockType::H4 => "h4",
      BlockType::H5 => "h5",
      BlockType::H6 => "h6",
      BlockType::Quote => "quote",
      BlockType::Bulleted => "bulleted",
      BlockType::Numbered => "numbered",
      BlockType::Todo => "todo",
      BlockType::Unknown(value) => value.as_str(),
    }
  }

  pub fn from_str(value: &str) -> Option<Self> {
    match value {
      "text" => Some(BlockType::Text),
      "h1" => Some(BlockType::H1),
      "h2" => Some(BlockType::H2),
      "h3" => Some(BlockType::H3),
      "h4" => Some(BlockType::H4),
      "h5" => Some(BlockType::H5),
      "h6" => Some(BlockType::H6),
      "quote" => Some(BlockType::Quote),
      "bulleted" => Some(BlockType::Bulleted),
      "numbered" => Some(BlockType::Numbered),
      "todo" => Some(BlockType::Todo),
      _ => None,
    }
  }

  pub fn from_str_lossy(value: String) -> Self {
    Self::from_str(&value).unwrap_or(BlockType::Unknown(value))
  }
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct ImageSpec {
  pub(super) source_id: String,
  pub(super) caption: Option<String>,
  pub(super) width: Option<f64>,
  pub(super) height: Option<f64>,
}

impl ImageSpec {
  pub(super) fn render_markdown(&self) -> String {
    let blob_url = format!("blob://{}", self.source_id);
    let caption = self.caption.as_deref().unwrap_or("");

    if self.width.is_some() || self.height.is_some() || !caption.is_empty() {
      let width_text = self
        .width
        .map(|value| value.to_string())
        .unwrap_or_else(|| "auto".into());
      let height_text = self
        .height
        .map(|value| value.to_string())
        .unwrap_or_else(|| "auto".into());
      return format!(
        "<img\n  src=\"{blob_url}\"\n  alt=\"{caption}\"\n  width=\"{width_text}\"\n  height=\"{height_text}\"\n/>\n\n"
      );
    }

    let alt = if caption.is_empty() {
      self.source_id.as_str()
    } else {
      caption
    };
    format!("\n![{alt}]({blob_url})\n\n")
  }

  pub(super) fn from_block_map(block: &Map) -> Self {
    let source_id = get_string(block, PROP_SOURCE_ID).unwrap_or_default();
    let caption = get_string(block, PROP_CAPTION);
    let width = block.get(PROP_WIDTH).and_then(value_to_f64);
    let height = block.get(PROP_HEIGHT).and_then(value_to_f64);
    ImageSpec {
      source_id,
      caption,
      width,
      height,
    }
  }

  pub(super) fn normalize_source(src: &str) -> Result<String, ParseError> {
    let trimmed = src.trim();
    if trimmed.is_empty() {
      return Err(ParseError::ParserError("invalid_image_source".into()));
    }
    if let Some(rest) = trimmed.strip_prefix("blob://") {
      if rest.is_empty() {
        return Err(ParseError::ParserError("invalid_image_source".into()));
      }
      return Ok(rest.to_string());
    }
    if !trimmed.contains('/') && !trimmed.contains(':') {
      return Ok(trimmed.to_string());
    }
    if let Some(pos) = trimmed.rfind("/blobs/") {
      let id = &trimmed[pos + "/blobs/".len()..];
      let id = id.split(['?', '#']).next().unwrap_or("");
      if !id.is_empty() {
        return Ok(id.to_string());
      }
    }
    Err(ParseError::ParserError("unsupported_image_source".into()))
  }
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct TableSpec {
  pub(super) rows: Vec<Vec<String>>,
}

impl TableSpec {
  pub(super) fn from_block_map(block: &Map) -> Self {
    let mut row_entries: Vec<(String, String)> = Vec::new();
    let mut column_entries: Vec<(String, String)> = Vec::new();

    for key in block.keys() {
      if key.starts_with(PROP_ROWS_PREFIX)
        && key.ends_with(PROP_ROW_ID_SUFFIX)
        && let Some(row_id) = block.get(key).and_then(|value| value_to_string(&value))
      {
        let base = key.trim_end_matches(PROP_ROW_ID_SUFFIX);
        let order_key = format!("{base}{PROP_ORDER_SUFFIX}");
        let order = block
          .get(&order_key)
          .and_then(|value| value_to_string(&value))
          .unwrap_or_default();
        row_entries.push((order, row_id));
      }
      if key.starts_with(PROP_COLUMNS_PREFIX)
        && key.ends_with(PROP_COLUMN_ID_SUFFIX)
        && let Some(column_id) = block.get(key).and_then(|value| value_to_string(&value))
      {
        let base = key.trim_end_matches(PROP_COLUMN_ID_SUFFIX);
        let order_key = format!("{base}{PROP_ORDER_SUFFIX}");
        let order = block
          .get(&order_key)
          .and_then(|value| value_to_string(&value))
          .unwrap_or_default();
        column_entries.push((order, column_id));
      }
    }

    row_entries.sort_by(|a, b| a.0.cmp(&b.0));
    column_entries.sort_by(|a, b| a.0.cmp(&b.0));

    let mut rows = Vec::new();
    for (_, row_id) in row_entries {
      let mut row = Vec::new();
      for (_, column_id) in &column_entries {
        let cell_key = table_cell_text_key(&row_id, column_id);
        let cell_text = block
          .get(&cell_key)
          .and_then(|value| value_to_string(&value))
          .unwrap_or_default();
        row.push(cell_text);
      }
      rows.push(row);
    }

    Self { rows }
  }

  pub(super) fn render_markdown(&self) -> Option<String> {
    let options = MarkdownTableOptions::new(false, "<br />", true);
    render_markdown_table(&self.rows, options)
  }
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct BookmarkSpec {
  pub(super) url: String,
  pub(super) caption: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct EmbedYoutubeSpec {
  pub(super) video_id: String,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct EmbedIframeSpec {
  pub(super) url: String,
}

#[derive(Debug, Clone)]
pub(super) struct BlockSpec {
  pub(super) flavour: BlockFlavour,
  pub(super) block_type: Option<BlockType>,
  pub(super) text: Vec<TextDeltaOp>,
  pub(super) checked: Option<bool>,
  pub(super) language: Option<String>,
  pub(super) order: Option<i64>,
  pub(super) image: Option<ImageSpec>,
  pub(super) table: Option<TableSpec>,
  pub(super) bookmark: Option<BookmarkSpec>,
  pub(super) embed_youtube: Option<EmbedYoutubeSpec>,
  pub(super) embed_iframe: Option<EmbedIframeSpec>,
}

impl BlockSpec {
  pub(super) fn is_exact(&self, other: &BlockSpec) -> bool {
    self.flavour == other.flavour
      && self.block_type == other.block_type
      && self.checked == other.checked
      && self.language == other.language
      && self.image == other.image
      && self.table == other.table
      && self.bookmark == other.bookmark
      && self.embed_youtube == other.embed_youtube
      && self.embed_iframe == other.embed_iframe
      && text_delta_eq(&self.text, &other.text)
  }

  pub(super) fn is_similar(&self, other: &BlockSpec) -> bool {
    self.flavour == other.flavour && self.block_type == other.block_type
  }

  pub(super) fn block_type_str(&self) -> Option<&str> {
    self.block_type.as_ref().map(BlockType::as_str)
  }

  pub(super) fn from_block_map(block: &Map) -> Result<Self, ParseError> {
    let flavour_value = get_string(block, SYS_FLAVOUR).unwrap_or_default();
    let Some(flavour) = BlockFlavour::from_str(&flavour_value) else {
      return Err(ParseError::ParserError(format!(
        "unsupported block flavour: {flavour_value}"
      )));
    };
    Ok(Self::from_block_map_with_flavour(block, flavour))
  }

  pub(super) fn from_block_map_with_flavour(block: &Map, flavour: BlockFlavour) -> Self {
    if flavour == BlockFlavour::Image {
      return BlockSpec {
        flavour,
        block_type: None,
        text: Vec::new(),
        checked: None,
        language: None,
        order: None,
        image: Some(ImageSpec::from_block_map(block)),
        table: None,
        bookmark: None,
        embed_youtube: None,
        embed_iframe: None,
      };
    }

    if flavour == BlockFlavour::Table {
      return BlockSpec {
        flavour,
        block_type: None,
        text: Vec::new(),
        checked: None,
        language: None,
        order: None,
        image: None,
        table: Some(TableSpec::from_block_map(block)),
        bookmark: None,
        embed_youtube: None,
        embed_iframe: None,
      };
    }

    if flavour == BlockFlavour::Bookmark {
      return BlockSpec {
        flavour,
        block_type: None,
        text: Vec::new(),
        checked: None,
        language: None,
        order: None,
        image: None,
        table: None,
        bookmark: Some(BookmarkSpec {
          url: get_string(block, PROP_URL).unwrap_or_default(),
          caption: get_string(block, PROP_CAPTION),
        }),
        embed_youtube: None,
        embed_iframe: None,
      };
    }

    if flavour == BlockFlavour::EmbedYoutube {
      return BlockSpec {
        flavour,
        block_type: None,
        text: Vec::new(),
        checked: None,
        language: None,
        order: None,
        image: None,
        table: None,
        bookmark: None,
        embed_youtube: Some(EmbedYoutubeSpec {
          video_id: get_string(block, PROP_VIDEO_ID).unwrap_or_default(),
        }),
        embed_iframe: None,
      };
    }

    if flavour == BlockFlavour::EmbedIframe {
      return BlockSpec {
        flavour,
        block_type: None,
        text: Vec::new(),
        checked: None,
        language: None,
        order: None,
        image: None,
        table: None,
        bookmark: None,
        embed_youtube: None,
        embed_iframe: Some(EmbedIframeSpec {
          url: get_string(block, PROP_URL).unwrap_or_default(),
        }),
      };
    }

    let block_type = match get_string(block, PROP_TYPE) {
      Some(value) => Some(BlockType::from_str_lossy(value)),
      None => match flavour {
        BlockFlavour::Paragraph => Some(BlockType::Text),
        BlockFlavour::List => Some(BlockType::Bulleted),
        _ => None,
      },
    };

    let text = block
      .get(PROP_TEXT)
      .and_then(|v| v.to_text())
      .map(|text| text.to_delta())
      .unwrap_or_default();

    let checked = block.get(PROP_CHECKED).and_then(|v| v.to_any()).and_then(|a| match a {
      Any::True => Some(true),
      Any::False => Some(false),
      _ => None,
    });
    let language = get_string(block, PROP_LANGUAGE);
    let order = block.get(PROP_ORDER).and_then(|v| v.to_any()).and_then(|a| match a {
      Any::Integer(value) => Some(value as i64),
      Any::BigInt64(value) => Some(value),
      Any::Float32(value) => Some(value.0 as i64),
      Any::Float64(value) => Some(value.0 as i64),
      _ => None,
    });

    BlockSpec {
      flavour,
      block_type,
      text,
      checked,
      language,
      order,
      image: None,
      table: None,
      bookmark: None,
      embed_youtube: None,
      embed_iframe: None,
    }
  }
}

#[derive(Debug, Clone)]
pub(super) struct BlockNode {
  pub(super) spec: BlockSpec,
  pub(super) children: Vec<BlockNode>,
}

pub(super) trait TreeNode {
  fn children(&self) -> &[Self]
  where
    Self: Sized;
}

impl TreeNode for BlockNode {
  fn children(&self) -> &[BlockNode] {
    &self.children
  }
}

pub(super) fn count_tree_nodes<T: TreeNode>(nodes: &[T]) -> usize {
  nodes.iter().map(|node| 1 + count_tree_nodes(node.children())).sum()
}

pub(super) fn text_delta_eq(a: &[TextDeltaOp], b: &[TextDeltaOp]) -> bool {
  if a.len() != b.len() {
    return false;
  }

  for (left, right) in a.iter().zip(b.iter()) {
    match (left, right) {
      (
        TextDeltaOp::Insert {
          insert: TextInsert::Text(text_a),
          format: format_a,
        },
        TextDeltaOp::Insert {
          insert: TextInsert::Text(text_b),
          format: format_b,
        },
      ) => {
        if text_a != text_b {
          return false;
        }
        if !attrs_eq(format_a.as_ref(), format_b.as_ref()) {
          return false;
        }
      }
      _ => return false,
    }
  }

  true
}

fn attrs_eq(a: Option<&TextAttributes>, b: Option<&TextAttributes>) -> bool {
  match (a, b) {
    (None, None) => true,
    (Some(left), Some(right)) => {
      if left.len() != right.len() {
        return false;
      }
      left.iter().all(|(key, value)| right.get(key) == Some(value))
    }
    _ => false,
  }
}

#[cfg(test)]
mod tests {
  use y_octo::DocOptions;

  use super::{super::write::builder::text_ops_from_plain, *};
  use crate::doc_parser::build_full_doc;

  fn spec_from_markdown(markdown: &str, doc_id: &str, flavour: &str) -> BlockSpec {
    let bin = build_full_doc("Title", markdown, doc_id).expect("create doc");
    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&bin).expect("apply update");
    let blocks_map = doc.get_map("blocks").expect("blocks map");

    for (_, value) in blocks_map.iter() {
      if let Some(block_map) = value.to_map()
        && get_string(&block_map, SYS_FLAVOUR).as_deref() == Some(flavour)
      {
        return BlockSpec::from_block_map(&block_map).expect("spec");
      }
    }

    panic!("block not found: {flavour}");
  }

  #[test]
  fn test_from_block_map_paragraph() {
    let spec = spec_from_markdown("Plain paragraph.", "block-spec-paragraph", "affine:paragraph");
    assert_eq!(spec.flavour, BlockFlavour::Paragraph);
    assert_eq!(spec.block_type, Some(BlockType::Text));
    assert_eq!(spec.text, text_ops_from_plain("Plain paragraph."));
  }

  #[test]
  fn test_from_block_map_list_checked() {
    let spec = spec_from_markdown("- [x] Done", "block-spec-list", "affine:list");
    assert_eq!(spec.flavour, BlockFlavour::List);
    assert_eq!(spec.block_type, Some(BlockType::Todo));
    assert_eq!(spec.checked, Some(true));
    assert_eq!(spec.text, text_ops_from_plain("Done"));
  }

  #[test]
  fn test_from_block_map_image() {
    let spec = spec_from_markdown("![Alt](blob://image-id)", "block-spec-image", "affine:image");
    assert_eq!(spec.flavour, BlockFlavour::Image);
    let image = spec.image.expect("image spec");
    assert_eq!(image.source_id, "image-id");
    assert_eq!(image.caption.as_deref(), Some("Alt"));
    assert_eq!(image.width, None);
    assert_eq!(image.height, None);
  }

  #[test]
  fn test_from_block_map_table() {
    let spec = spec_from_markdown(
      "| A | B |\n| --- | --- |\n| 1 | 2 |",
      "block-spec-table",
      "affine:table",
    );
    assert_eq!(spec.flavour, BlockFlavour::Table);
    let table = spec.table.expect("table spec");
    assert_eq!(
      table.rows,
      vec![
        vec!["A".to_string(), "B".to_string()],
        vec!["1".to_string(), "2".to_string()]
      ]
    );
  }

  #[test]
  fn test_from_block_map_embed_iframe() {
    let spec = spec_from_markdown(
      r#"<iframe src="https://example.com/embed"></iframe>"#,
      "block-spec-embed-iframe",
      "affine:embed-iframe",
    );
    assert_eq!(spec.flavour, BlockFlavour::EmbedIframe);
    assert_eq!(spec.embed_iframe.as_ref().unwrap().url, "https://example.com/embed");
  }
}
