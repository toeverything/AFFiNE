use y_octo::{Text, TextDeltaOp, TextInsert};

use super::{
  super::schema::{
    PROP_CAPTION, PROP_CELLS_PREFIX, PROP_CHECKED, PROP_COLUMNS_PREFIX, PROP_HEIGHT, PROP_LANGUAGE, PROP_ORDER,
    PROP_ROWS_PREFIX, PROP_SOURCE_ID, PROP_TEXT, PROP_TYPE, PROP_WIDTH, SYS_CHILDREN, SYS_FLAVOUR, SYS_ID, SYS_VERSION,
    table_cell_text_key, table_column_id_key, table_column_order_key, table_row_id_key, table_row_order_key,
  },
  *,
};

pub(super) const BOXED_NATIVE_TYPE: &str = "$blocksuite:internal:native$";
const NOTE_BG_LIGHT: &str = "#ffffff";
const NOTE_BG_DARK: &str = "#252525";
const TABLE_ORDER_WIDTH: usize = 6;

pub(super) fn block_version(flavour: &str) -> i32 {
  match flavour {
    "affine:page" => 2,
    "affine:surface" => 5,
    "affine:note" => 1,
    "affine:paragraph" => 1,
    "affine:list" => 1,
    "affine:code" => 1,
    "affine:divider" => 1,
    "affine:image" => 1,
    "affine:table" => 1,
    _ => 1,
  }
}

pub(super) struct TextBlockProps<'a> {
  pub block_type: Option<&'a str>,
  pub checked: Option<bool>,
  pub language: Option<&'a str>,
  pub order: Option<i64>,
  pub text: &'a [TextDeltaOp],
}

pub(super) struct ImageBlockProps<'a> {
  pub source_id: &'a str,
  pub caption: Option<&'a str>,
  pub width: Option<f64>,
  pub height: Option<f64>,
}

pub(super) fn insert_text(doc: &Doc, block: &mut Map, key: &str, ops: &[TextDeltaOp]) -> Result<(), ParseError> {
  let text = build_text(doc, ops)?;
  block.insert(key.to_string(), Value::Text(text))?;
  Ok(())
}

pub(super) fn build_text(doc: &Doc, ops: &[TextDeltaOp]) -> Result<Text, ParseError> {
  let mut text = doc.create_text()?;
  if !ops.is_empty() {
    text.apply_delta(ops)?;
  }
  Ok(text)
}

pub(crate) fn text_ops_from_plain(text: &str) -> Vec<TextDeltaOp> {
  if text.is_empty() {
    Vec::new()
  } else {
    vec![TextDeltaOp::Insert {
      insert: TextInsert::Text(text.to_string()),
      format: None,
    }]
  }
}

pub(super) fn insert_children(doc: &Doc, block: &mut Map, children: &[String]) -> Result<(), ParseError> {
  let mut array = doc.create_array()?;
  for child_id in children {
    array.push(child_id.to_string())?;
  }
  block.insert(SYS_CHILDREN.to_string(), Value::Array(array))?;
  Ok(())
}

pub(super) fn insert_block_map(doc: &Doc, blocks_map: &mut Map, block_id: &str) -> Result<Map, ParseError> {
  let empty_map = doc.create_map()?;
  blocks_map.insert(block_id.to_string(), Value::Map(empty_map))?;

  blocks_map
    .get(block_id)
    .and_then(|value| value.to_map())
    .ok_or_else(|| ParseError::ParserError("Failed to retrieve inserted block map".into()))
}

pub(super) fn insert_sys_fields(block: &mut Map, block_id: &str, flavour: &str) -> Result<(), ParseError> {
  block.insert(SYS_ID.to_string(), Any::String(block_id.to_string()))?;
  block.insert(SYS_FLAVOUR.to_string(), Any::String(flavour.to_string()))?;
  block.insert(SYS_VERSION.to_string(), Any::Integer(block_version(flavour)))?;
  Ok(())
}

pub(super) fn apply_text_block_props(
  doc: &Doc,
  block: &mut Map,
  props: &TextBlockProps<'_>,
  preserve_text: bool,
  clear_missing: bool,
) -> Result<(), ParseError> {
  match props.block_type {
    Some(block_type) => {
      block.insert(PROP_TYPE.to_string(), Any::String(block_type.to_string()))?;
    }
    None => {
      if clear_missing && block.get(PROP_TYPE).is_some() {
        block.remove(PROP_TYPE);
      }
    }
  }

  if !preserve_text && !props.text.is_empty() {
    insert_text(doc, block, PROP_TEXT, props.text)?;
  } else if !preserve_text && clear_missing && block.get(PROP_TEXT).is_some() {
    block.remove(PROP_TEXT);
  }

  match props.checked {
    Some(checked) => {
      block.insert(PROP_CHECKED.to_string(), if checked { Any::True } else { Any::False })?;
    }
    None => {
      if clear_missing && block.get(PROP_CHECKED).is_some() {
        block.remove(PROP_CHECKED);
      }
    }
  }

  match props.language {
    Some(language) => {
      block.insert(PROP_LANGUAGE.to_string(), Any::String(language.to_string()))?;
    }
    None => {
      if clear_missing && block.get(PROP_LANGUAGE).is_some() {
        block.remove(PROP_LANGUAGE);
      }
    }
  }

  match props.order {
    Some(order) => {
      block.insert(PROP_ORDER.to_string(), Any::Float64((order as f64).into()))?;
    }
    None => {
      if clear_missing && block.get(PROP_ORDER).is_some() {
        block.remove(PROP_ORDER);
      }
    }
  }

  Ok(())
}

pub(super) fn apply_image_block_props(
  block: &mut Map,
  props: &ImageBlockProps<'_>,
  clear_missing: bool,
) -> Result<(), ParseError> {
  block.insert(PROP_SOURCE_ID.to_string(), Any::String(props.source_id.to_string()))?;

  match props.caption {
    Some(caption) => {
      block.insert(PROP_CAPTION.to_string(), Any::String(caption.to_string()))?;
    }
    None => {
      if clear_missing && block.get(PROP_CAPTION).is_some() {
        block.remove(PROP_CAPTION);
      }
    }
  }

  match props.width {
    Some(width) => {
      block.insert(PROP_WIDTH.to_string(), Any::Float64(width.into()))?;
    }
    None => {
      if clear_missing && block.get(PROP_WIDTH).is_some() {
        block.remove(PROP_WIDTH);
      }
    }
  }

  match props.height {
    Some(height) => {
      block.insert(PROP_HEIGHT.to_string(), Any::Float64(height.into()))?;
    }
    None => {
      if clear_missing && block.get(PROP_HEIGHT).is_some() {
        block.remove(PROP_HEIGHT);
      }
    }
  }

  Ok(())
}

pub(super) fn apply_table_block_props(block: &mut Map, rows: &[Vec<String>]) -> Result<(), ParseError> {
  clear_table_props(block);

  if rows.is_empty() {
    return Ok(());
  }

  let column_count = rows.iter().map(|row| row.len()).max().unwrap_or(0);
  let column_ids: Vec<String> = (0..column_count).map(|_| nanoid::nanoid!()).collect();

  for (col_idx, column_id) in column_ids.iter().enumerate() {
    let order = format_table_order(col_idx);
    block.insert(table_column_id_key(column_id), Any::String(column_id.to_string()))?;
    block.insert(table_column_order_key(column_id), Any::String(order))?;
  }

  for (row_idx, row) in rows.iter().enumerate() {
    let row_id = nanoid::nanoid!();
    let order = format_table_order(row_idx);
    block.insert(table_row_id_key(&row_id), Any::String(row_id.to_string()))?;
    block.insert(table_row_order_key(&row_id), Any::String(order))?;

    for (col_idx, column_id) in column_ids.iter().enumerate() {
      let cell_text = row.get(col_idx).cloned().unwrap_or_default();
      block.insert(table_cell_text_key(&row_id, column_id), Any::String(cell_text))?;
    }
  }

  Ok(())
}

pub(super) struct ApplyBlockOptions {
  pub preserve_text: bool,
  pub clear_missing: bool,
}

pub(super) fn apply_block_spec(
  doc: &Doc,
  block: &mut Map,
  spec: &BlockSpec,
  options: ApplyBlockOptions,
) -> Result<(), ParseError> {
  match spec.flavour {
    BlockFlavour::Image => {
      if options.preserve_text {
        return Ok(());
      }
      let image = spec
        .image
        .as_ref()
        .ok_or_else(|| ParseError::ParserError("image spec missing".into()))?;
      let props = ImageBlockProps {
        source_id: &image.source_id,
        caption: image.caption.as_deref(),
        width: image.width,
        height: image.height,
      };
      apply_image_block_props(block, &props, options.clear_missing)?;
    }
    BlockFlavour::Table => {
      if options.preserve_text {
        return Ok(());
      }
      let table = spec
        .table
        .as_ref()
        .ok_or_else(|| ParseError::ParserError("table spec missing".into()))?;
      apply_table_block_props(block, &table.rows)?;
    }
    _ => {
      let props = TextBlockProps {
        block_type: spec.block_type_str(),
        checked: spec.checked,
        language: spec.language.as_deref(),
        order: spec.order,
        text: &spec.text,
      };
      apply_text_block_props(doc, block, &props, options.preserve_text, options.clear_missing)?;
    }
  }

  Ok(())
}

pub(super) fn insert_block_tree(doc: &Doc, blocks_map: &mut Map, node: &BlockNode) -> Result<String, ParseError> {
  let block_id = nanoid::nanoid!();
  let mut block_map = insert_block_map(doc, blocks_map, &block_id)?;

  insert_sys_fields(&mut block_map, &block_id, node.spec.flavour.as_str())?;
  apply_block_spec(
    doc,
    &mut block_map,
    &node.spec,
    ApplyBlockOptions {
      preserve_text: false,
      clear_missing: false,
    },
  )?;

  let child_ids = node
    .children
    .iter()
    .map(|child| insert_block_tree(doc, blocks_map, child))
    .collect::<Result<Vec<_>, _>>()?;
  insert_children(doc, &mut block_map, &child_ids)?;

  Ok(block_id)
}

fn clear_table_props(block: &mut Map) {
  let keys = block
    .keys()
    .filter(|key| {
      key.starts_with(PROP_ROWS_PREFIX) || key.starts_with(PROP_COLUMNS_PREFIX) || key.starts_with(PROP_CELLS_PREFIX)
    })
    .map(|s| s.to_string())
    .collect::<Vec<_>>();
  for key in keys {
    block.remove(&key);
  }
}

fn format_table_order(index: usize) -> String {
  format!("{index:0width$}", width = TABLE_ORDER_WIDTH)
}

pub(super) fn boxed_empty_map(doc: &Doc) -> Result<Map, ParseError> {
  let mut boxed = doc.create_map()?;
  let value = doc.create_map()?;
  boxed.insert("type".to_string(), Any::String(BOXED_NATIVE_TYPE.to_string()))?;
  boxed.insert("value".to_string(), Value::Map(value))?;
  Ok(boxed)
}

pub(super) fn note_background_map(doc: &Doc) -> Result<Map, ParseError> {
  let mut map = doc.create_map()?;
  map.insert("light".to_string(), Any::String(NOTE_BG_LIGHT.to_string()))?;
  map.insert("dark".to_string(), Any::String(NOTE_BG_DARK.to_string()))?;
  Ok(map)
}
