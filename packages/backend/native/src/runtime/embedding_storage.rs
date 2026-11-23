//! Embedding-space storage contract: pgvector types and dimension-bound DDL.
//!
//! pgvector can only index `vector` up to 2000 dimensions with HNSW, so wider
//! spaces are stored as `halfvec` instead; the storage type follows the
//! dimensions and is part of the index fingerprint, keeping every (dims, type)
//! generation distinct by construction.

/// pgvector HNSW supports `vector` up to 2000 dimensions; wider spaces need
/// `halfvec`.
pub(crate) const VECTOR_HNSW_MAX_DIMENSIONS: u32 = 2000;
/// pgvector HNSW supports `halfvec` up to 4000 dimensions.
pub(crate) const MAX_EMBEDDING_DIMENSIONS: u32 = 4000;
/// Contract generation: 1 = fixed 1024/`vector`, 3 = configurable dimensions
/// with the storage type following the dimensions. Generation 2 existed only
/// on a downstream branch and never landed upstream.
pub(crate) const EMBEDDING_CONTRACT_VERSION: i32 = 3;

/// pgvector storage type for the given dimensions: plain `vector` where HNSW
/// supports it, `halfvec` beyond that.
pub(crate) fn storage_vector_type(dimensions: u32) -> &'static str {
  if dimensions > VECTOR_HNSW_MAX_DIMENSIONS {
    "halfvec"
  } else {
    "vector"
  }
}

/// HNSW operator class matching [`storage_vector_type`].
pub(crate) fn storage_ops_class(dimensions: u32) -> &'static str {
  if dimensions > VECTOR_HNSW_MAX_DIMENSIONS {
    "halfvec_cosine_ops"
  } else {
    "vector_cosine_ops"
  }
}

/// Render the storage rebuild statements for the given dimensions (sources are
/// dimension-independent and kept). The caller runs these atomically, then
/// records the configuration with [`render_record_statement`].
pub(crate) fn render_rebuild_statements(dimensions: u32) -> Vec<String> {
  let storage = storage_vector_type(dimensions);
  let ops = storage_ops_class(dimensions);
  vec![
    "DELETE FROM embedding_chunks;".to_string(),
    "UPDATE embedding_workspace_states SET active_index_id = NULL;".to_string(),
    "DELETE FROM embedding_indexes;".to_string(),
    "DROP INDEX embedding_chunks_hnsw;".to_string(),
    format!("ALTER TABLE embedding_chunks ALTER COLUMN embedding TYPE {storage}({dimensions});"),
    format!(
      "CREATE INDEX embedding_chunks_hnsw ON embedding_chunks USING hnsw (embedding {ops}) WITH (m = 32, \
       ef_construction = 200);"
    ),
    format!("ALTER TABLE embedding_indexes ALTER COLUMN dimensions SET DEFAULT {dimensions};"),
    "ALTER TABLE embedding_indexes DROP CONSTRAINT embedding_indexes_dimensions_check;".to_string(),
    format!(
      "ALTER TABLE embedding_indexes ADD CONSTRAINT embedding_indexes_dimensions_check CHECK (dimensions = \
       {dimensions});"
    ),
  ]
}

/// Render the statement recording the applied storage configuration.
pub(crate) fn render_record_statement(dimensions: u32) -> String {
  let storage = storage_vector_type(dimensions);
  format!(
    "INSERT INTO embedding_schema_config(id, configured_dims, vector_type) VALUES (1, {dimensions}, '{storage}');"
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn storage_type_follows_hnsw_limit() {
    assert_eq!(storage_vector_type(1024), "vector");
    assert_eq!(storage_vector_type(2000), "vector");
    assert_eq!(storage_vector_type(2001), "halfvec");
    assert_eq!(storage_vector_type(2560), "halfvec");
    assert_eq!(storage_ops_class(1024), "vector_cosine_ops");
    assert_eq!(storage_ops_class(2560), "halfvec_cosine_ops");
  }

  #[test]
  fn storage_statements_render_per_dimensions() {
    let narrow = render_rebuild_statements(1024).join("\n");
    assert!(narrow.contains("embedding TYPE vector(1024)"));
    assert!(narrow.contains("embedding vector_cosine_ops"));
    assert!(narrow.contains("CHECK (dimensions = 1024)"));
    assert_eq!(
      render_record_statement(1024),
      "INSERT INTO embedding_schema_config(id, configured_dims, vector_type) VALUES (1, 1024, 'vector');"
    );
    let wide = render_rebuild_statements(2560).join("\n");
    assert!(wide.contains("embedding TYPE halfvec(2560)"));
    assert!(wide.contains("embedding halfvec_cosine_ops"));
    assert!(wide.contains("CHECK (dimensions = 2560)"));
    assert_eq!(
      render_record_statement(2560),
      "INSERT INTO embedding_schema_config(id, configured_dims, vector_type) VALUES (1, 2560, 'halfvec');"
    );
    // Dimension-bound rows are wiped; dimension-independent sources are kept.
    assert!(wide.contains("DELETE FROM embedding_chunks;"));
    assert!(wide.contains("DELETE FROM embedding_indexes;"));
    assert!(!wide.contains("DELETE FROM embedding_sources"));
  }
}
