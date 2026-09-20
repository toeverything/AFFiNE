use std::collections::HashMap;

use memory_indexer::{FieldId, FieldOptions, FieldType, PositionEncoding, Schema, TextOptions};

use super::{IndexError, Result};

pub(super) struct TableSchema {
  pub schema: Schema,
  fields: HashMap<String, FieldId>,
  id_fields: &'static [&'static str],
}

impl TableSchema {
  pub fn doc() -> Self {
    let mut builder = Schema::builder().position_encoding(PositionEncoding::Utf16);
    let mut fields = HashMap::new();
    keyword(&mut builder, &mut fields, "workspace_id", true, false);
    keyword(&mut builder, &mut fields, "workspace_token", true, false);
    keyword(&mut builder, &mut fields, "generation_id", true, false);
    integer(&mut builder, &mut fields, "source_version", true, true);
    integer(&mut builder, &mut fields, "permission_version", true, false);
    keyword(&mut builder, &mut fields, "doc_id", true, true);
    keyword(&mut builder, &mut fields, "doc_token", true, false);
    fields.insert(
      "title".into(),
      builder.text("title", text_options(), FieldOptions::indexed_stored()),
    );
    keyword(&mut builder, &mut fields, "summary", false, false);
    keyword(&mut builder, &mut fields, "journal", false, false);
    keyword(&mut builder, &mut fields, "created_by_user_id", true, false);
    keyword(&mut builder, &mut fields, "updated_by_user_id", true, false);
    keyword(&mut builder, &mut fields, "acl_read_tokens", true, false);
    boolean(&mut builder, &mut fields, "acl_public_readable");
    boolean(&mut builder, &mut fields, "acl_member_default_readable");
    integer(&mut builder, &mut fields, "created_at", true, true);
    integer(&mut builder, &mut fields, "updated_at", true, true);
    Self::finish(
      builder,
      fields,
      &[
        "generation_id",
        "workspace_id",
        "doc_id",
        "source_version",
        "permission_version",
      ],
    )
  }

  pub fn block() -> Self {
    let mut builder = Schema::builder().position_encoding(PositionEncoding::Utf16);
    let mut fields = HashMap::new();
    for field in [
      "workspace_id",
      "unit_id",
      "source_hash",
      "visibility",
      "element_id",
      "frame_id",
      "source_block_id",
      "flavour",
      "blob",
      "ref_doc_id",
      "parent_flavour",
      "parent_block_id",
      "created_by_user_id",
      "updated_by_user_id",
    ] {
      keyword(&mut builder, &mut fields, field, true, false);
    }
    keyword(&mut builder, &mut fields, "doc_id", true, true);
    keyword(&mut builder, &mut fields, "workspace_token", true, false);
    keyword(&mut builder, &mut fields, "generation_id", true, false);
    integer(&mut builder, &mut fields, "source_version", true, true);
    integer(&mut builder, &mut fields, "permission_version", true, false);
    keyword(&mut builder, &mut fields, "doc_token", true, false);
    keyword(&mut builder, &mut fields, "block_id", true, true);
    keyword(&mut builder, &mut fields, "block_token", true, false);
    fields.insert(
      "content".into(),
      builder.text("content", text_options(), FieldOptions::indexed_stored().multi_value()),
    );
    for field in ["ref", "additional", "markdown_preview"] {
      keyword(&mut builder, &mut fields, field, false, false);
    }
    integer(&mut builder, &mut fields, "projection_version", true, false);
    integer(&mut builder, &mut fields, "created_at", true, true);
    integer(&mut builder, &mut fields, "updated_at", true, true);
    keyword(&mut builder, &mut fields, "acl_read_tokens", true, false);
    boolean(&mut builder, &mut fields, "acl_public_readable");
    boolean(&mut builder, &mut fields, "acl_member_default_readable");
    Self::finish(
      builder,
      fields,
      &[
        "generation_id",
        "workspace_id",
        "doc_id",
        "source_version",
        "permission_version",
        "block_id",
      ],
    )
  }

  fn finish(
    builder: memory_indexer::SchemaBuilder,
    fields: HashMap<String, FieldId>,
    id_fields: &'static [&'static str],
  ) -> Self {
    Self {
      schema: builder.build().expect("static server index schema must be valid"),
      fields,
      id_fields,
    }
  }

  pub fn document_id(&self, document: &serde_json::Map<String, serde_json::Value>) -> Result<String> {
    self
      .id_fields
      .iter()
      .map(|field| {
        let value = document
          .get(*field)
          .ok_or_else(|| IndexError::InvalidInput(format!("index document {field} is required")))?;
        value
          .as_str()
          .map(str::to_string)
          .or_else(|| value.as_i64().map(|value| value.to_string()))
          .ok_or_else(|| IndexError::InvalidInput(format!("index document {field} has invalid identity type")))
      })
      .collect::<Result<Vec<_>>>()
      .map(|parts| parts.join("/"))
  }

  pub fn field(&self, name: &str) -> Result<FieldId> {
    self
      .fields
      .get(name)
      .copied()
      .ok_or_else(|| IndexError::InvalidInput(format!("unknown index field {name}")))
  }

  pub fn field_name(&self, field: FieldId) -> &str {
    &self.schema.field(field).expect("field belongs to table schema").name
  }

  pub fn field_type(&self, field: FieldId) -> &FieldType {
    &self
      .schema
      .field(field)
      .expect("field belongs to table schema")
      .field_type
  }
}

fn keyword(
  builder: &mut memory_indexer::SchemaBuilder,
  fields: &mut HashMap<String, FieldId>,
  name: &str,
  indexed: bool,
  sortable: bool,
) {
  let mut options = FieldOptions::new().stored();
  if !sortable {
    options = options.multi_value();
  }
  if indexed {
    options = options.indexed();
  }
  if sortable {
    options = options.sortable();
  }
  fields.insert(name.into(), builder.keyword(name, options));
}

fn integer(
  builder: &mut memory_indexer::SchemaBuilder,
  fields: &mut HashMap<String, FieldId>,
  name: &str,
  indexed: bool,
  sortable: bool,
) {
  let mut options = FieldOptions::new().stored();
  if indexed {
    options = options.indexed();
  }
  if sortable {
    options = options.sortable();
  }
  fields.insert(name.into(), builder.i64(name, options));
}

fn boolean(builder: &mut memory_indexer::SchemaBuilder, fields: &mut HashMap<String, FieldId>, name: &str) {
  fields.insert(name.into(), builder.bool(name, FieldOptions::indexed_stored()));
}

fn text_options() -> TextOptions {
  TextOptions::multilingual()
    .with_pinyin()
    .with_prefix()
    .with_fuzzy()
    .with_positions()
}
