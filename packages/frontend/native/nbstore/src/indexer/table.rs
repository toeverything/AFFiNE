use std::collections::HashMap;

use memory_indexer::{
  FieldId, FieldOptions, FieldType, Highlight, MemoryIndex, PositionEncoding, Query, Schema, SearchMode, SearchOptions,
  TextOptions, Value,
};
use tokio::sync::RwLock;

use super::{
  NativeIndexField, NativeIndexHighlight, NativeIndexHighlightValue, NativeIndexHit, NativeIndexQuery,
  NativeIndexSearchOptions, NativeIndexSpan,
  error::{Error, Result},
};

pub(crate) struct TableIndex {
  pub(super) schema: Schema,
  fields: HashMap<String, FieldId>,
  pub(super) index: RwLock<MemoryIndex>,
}

impl TableIndex {
  pub(super) fn doc() -> Self {
    let mut schema = Schema::builder().position_encoding(PositionEncoding::Utf16);
    let fields = HashMap::from([
      ("docId".into(), schema.keyword("docId", FieldOptions::indexed_stored())),
      (
        "title".into(),
        schema.text("title", text_options(), FieldOptions::indexed_stored()),
      ),
      (
        "summary".into(),
        schema.keyword("summary", FieldOptions::new().stored()),
      ),
    ]);
    Self::from_schema(schema, fields)
  }

  pub(super) fn block() -> Self {
    let mut schema = Schema::builder().position_encoding(PositionEncoding::Utf16);
    let fields = HashMap::from([
      ("docId".into(), schema.keyword("docId", keyword_options())),
      ("blockId".into(), schema.keyword("blockId", keyword_options())),
      (
        "content".into(),
        schema.text("content", text_options(), FieldOptions::indexed_stored().multi_value()),
      ),
      ("flavour".into(), schema.keyword("flavour", keyword_options())),
      ("blob".into(), schema.keyword("blob", keyword_options())),
      ("refDocId".into(), schema.keyword("refDocId", keyword_options())),
      (
        "ref".into(),
        schema.keyword("ref", FieldOptions::new().stored().multi_value()),
      ),
      (
        "parentFlavour".into(),
        schema.keyword("parentFlavour", keyword_options()),
      ),
      (
        "parentBlockId".into(),
        schema.keyword("parentBlockId", keyword_options()),
      ),
      (
        "additional".into(),
        schema.keyword("additional", FieldOptions::new().stored().multi_value()),
      ),
      (
        "markdownPreview".into(),
        schema.keyword("markdownPreview", FieldOptions::new().stored().multi_value()),
      ),
    ]);
    Self::from_schema(schema, fields)
  }

  fn from_schema(builder: memory_indexer::SchemaBuilder, fields: HashMap<String, FieldId>) -> Self {
    let schema = builder.build().expect("static nbstore index schema must be valid");
    Self {
      index: RwLock::new(MemoryIndex::new(schema.clone())),
      schema,
      fields,
    }
  }

  pub(super) fn field(&self, name: &str) -> Result<FieldId> {
    self
      .fields
      .get(name)
      .copied()
      .ok_or_else(|| Error::Serialization(format!("unknown index field {name}")))
  }

  pub(super) fn compile_query(&self, query: NativeIndexQuery) -> Result<Query> {
    match query.kind.as_str() {
      "match" => {
        let field = self.field(query.field.as_deref().unwrap_or_default())?;
        let value = query.value.unwrap_or_default();
        match self.schema.field(field).map(|field| &field.field_type) {
          Some(FieldType::Text(_)) => Ok(Query::text(field, value, SearchMode::Auto)),
          Some(FieldType::Keyword) => Ok(Query::term(field, value)),
          _ => Err(Error::Serialization("match requires Text or Keyword field".into())),
        }
      }
      "exists" => Ok(Query::Exists(self.field(query.field.as_deref().unwrap_or_default())?)),
      "all" => Ok(Query::All),
      "boost" => {
        let clause = query
          .clauses
          .unwrap_or_default()
          .pop()
          .ok_or_else(|| Error::Serialization("boost requires one clause".into()))?;
        Ok(Query::Boost {
          query: Box::new(self.compile_query(clause)?),
          factor: query.boost.unwrap_or(1.0) as f32,
        })
      }
      "boolean" => {
        let clauses = query
          .clauses
          .unwrap_or_default()
          .into_iter()
          .map(|query| self.compile_query(query))
          .collect::<Result<Vec<_>>>()?;
        let (must, should, must_not) = match query.occur.as_deref() {
          Some("must") => (clauses, vec![], vec![]),
          Some("should") => (vec![], clauses, vec![]),
          Some("must_not") => (vec![], vec![], clauses),
          _ => return Err(Error::Serialization("invalid boolean occurrence".into())),
        };
        Ok(Query::boolean(must, should, must_not))
      }
      kind => Err(Error::Serialization(format!("unknown query kind {kind}"))),
    }
  }

  pub(super) fn compile_options(&self, options: NativeIndexSearchOptions) -> Result<SearchOptions> {
    Ok(SearchOptions {
      limit: options.limit as usize,
      offset: options.offset as usize,
      after: None,
      sort: vec![],
      stored_fields: options
        .fields
        .iter()
        .map(|field| self.field(field))
        .collect::<Result<Vec<_>>>()?,
      highlight_fields: options
        .highlights
        .iter()
        .map(|field| self.field(field))
        .collect::<Result<Vec<_>>>()?,
    })
  }

  pub(super) fn hit(&self, hit: memory_indexer::SearchHit) -> NativeIndexHit {
    NativeIndexHit {
      id: hit.id,
      score: hit.score as f64,
      fields: hit
        .fields
        .into_iter()
        .map(|(field, values)| NativeIndexField {
          field: self.field_name(field),
          values: string_values(values),
        })
        .collect(),
      highlights: group_highlights(self, hit.highlights),
    }
  }

  fn field_name(&self, field: FieldId) -> String {
    self
      .schema
      .field(field)
      .expect("result field belongs to schema")
      .name
      .clone()
  }
}

pub(crate) fn string_values(values: Vec<Value>) -> Vec<String> {
  values
    .into_iter()
    .filter_map(|value| match value {
      Value::String(value) => Some(value),
      Value::I64(_) | Value::Bool(_) => None,
    })
    .collect()
}

fn keyword_options() -> FieldOptions {
  FieldOptions::indexed_stored().multi_value()
}

fn text_options() -> TextOptions {
  TextOptions::multilingual()
    .with_pinyin()
    .with_prefix()
    .with_fuzzy()
    .with_positions()
}

fn group_highlights(table: &TableIndex, highlights: Vec<Highlight>) -> Vec<NativeIndexHighlight> {
  let mut grouped: Vec<NativeIndexHighlight> = Vec::new();
  for highlight in highlights {
    let field = table.field_name(highlight.field);
    let values = NativeIndexHighlightValue {
      value_index: highlight.value_index as u32,
      spans: highlight
        .spans
        .into_iter()
        .map(|(start, end)| NativeIndexSpan { start, end })
        .collect(),
    };
    if let Some(existing) = grouped.iter_mut().find(|item| item.field == field) {
      existing.values.push(values);
    } else {
      grouped.push(NativeIndexHighlight {
        field,
        values: vec![values],
      });
    }
  }
  grouped
}
