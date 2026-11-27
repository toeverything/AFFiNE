//! Parses multipart `/graphql` uploads with the `v0.27.5`
//! `graphqlUploadExpress({ maxFileSize: 100 MiB, maxFiles: 32 })` limits.
//! Each limit fails with `ParseRequestError::PayloadTooLarge`, which the
//! transport returns as HTTP 413 without a GraphQL envelope.

use std::collections::HashMap;
use std::io::Write;

use async_graphql::{ParseRequestError, Request, UploadValue};
use multer::{Constraints, Multipart, SizeLimit};

/// Largest non-file field, such as `operations` or `map`. Matches the
/// `graphql-upload` default `maxFieldSize`.
pub(crate) const MAX_GRAPHQL_MULTIPART_FIELD_BYTES: usize = 1_000_000;
/// Largest number of file fields and of `map` entries.
pub(crate) const MAX_GRAPHQL_MULTIPART_FILES: usize = 32;
/// Largest total number of variable paths across all `map` entries.
/// Allows `graphql-upload` v17 single-file reuse across >32 paths while capping FD fan-out.
pub(crate) const MAX_GRAPHQL_MULTIPART_PATHS: usize = 256;
/// Largest file field.
pub(crate) const MAX_GRAPHQL_MULTIPART_FILE_BYTES: usize = 100 * 1024 * 1024;
/// Largest multipart body: every file at its limit plus room for the other
/// fields and the multipart framing.
pub(crate) const MAX_GRAPHQL_MULTIPART_BODY_BYTES: usize =
  MAX_GRAPHQL_MULTIPART_FILES * MAX_GRAPHQL_MULTIPART_FILE_BYTES + 4 * 1024 * 1024;

/// Reads a multipart `/graphql` body into one request. Files stream to
/// temporary files, and each upload lands on its `map` paths.
pub(crate) async fn receive_graphql_multipart(
  content_type: &str,
  body: axum::body::Body,
) -> Result<Request, ParseRequestError> {
  let boundary = multer::parse_boundary(content_type).map_err(ParseRequestError::InvalidMultipart)?;
  let constraints =
    Constraints::new().size_limit(SizeLimit::new().whole_stream(MAX_GRAPHQL_MULTIPART_BODY_BYTES as u64));
  let mut multipart = Multipart::with_constraints(body.into_data_stream(), boundary, constraints);

  let mut request = None;
  let mut map: Option<HashMap<String, Vec<String>>> = None;
  let mut files = Vec::new();
  while let Some(mut field) = multipart.next_field().await? {
    let name = field.name().map(str::to_owned);
    let is_operations = name.as_deref() == Some("operations");
    let is_map = name.as_deref() == Some("map");
    let has_filename = field.file_name().is_some();
    let is_mapped_part = !is_operations
      && !is_map
      && map
        .as_ref()
        .is_some_and(|m| name.as_deref().is_some_and(|n| m.contains_key(n)));
    if has_filename || is_mapped_part {
      if request.is_none() || map.is_none() {
        return Err(ParseRequestError::InvalidRequest(Box::new(std::io::Error::new(
          std::io::ErrorKind::InvalidInput,
          "Misordered multipart fields; files should follow 'map'.",
        ))));
      }
      if files.len() == MAX_GRAPHQL_MULTIPART_FILES {
        return Err(ParseRequestError::PayloadTooLarge);
      }
      let filename = field.file_name().map(str::to_owned).unwrap_or_default();
      let content_type = field.content_type().map(ToString::to_string);
      let mut named_file = tempfile::NamedTempFile::new()?;
      let mut written = 0usize;
      while let Some(chunk) = field.chunk().await? {
        written += chunk.len();
        if written > MAX_GRAPHQL_MULTIPART_FILE_BYTES {
          return Err(ParseRequestError::PayloadTooLarge);
        }
        named_file.as_file_mut().write_all(&chunk)?;
      }
      named_file.as_file_mut().flush()?;
      files.push((name, filename, content_type, named_file));
      continue;
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = field.chunk().await? {
      if bytes.len() + chunk.len() > MAX_GRAPHQL_MULTIPART_FIELD_BYTES {
        return Err(ParseRequestError::PayloadTooLarge);
      }
      bytes.extend_from_slice(&chunk);
    }
    match name.as_deref() {
      Some("operations") => {
        let value: serde_json::Value =
          serde_json::from_slice(&bytes).map_err(|e| ParseRequestError::InvalidRequest(Box::new(e)))?;
        if value.is_array() {
          return Err(ParseRequestError::UnsupportedBatch);
        }
        request =
          Some(serde_json::from_value::<Request>(value).map_err(|e| ParseRequestError::InvalidRequest(Box::new(e)))?);
      }
      Some("map") => {
        if request.is_none() {
          return Err(ParseRequestError::InvalidRequest(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Misordered multipart fields; 'map' should follow 'operations'.",
          ))));
        }
        let parsed: HashMap<String, Vec<String>> =
          serde_json::from_slice(&bytes).map_err(|e| ParseRequestError::InvalidFilesMap(Box::new(e)))?;
        let total_paths: usize = parsed.values().map(Vec::len).sum();
        if parsed.len() > MAX_GRAPHQL_MULTIPART_FILES || total_paths > MAX_GRAPHQL_MULTIPART_PATHS {
          return Err(ParseRequestError::PayloadTooLarge);
        }
        map = Some(parsed);
      }
      _ => {}
    }
  }

  let mut request = request.ok_or(ParseRequestError::MissingOperatorsPart)?;
  let mut map = map.ok_or(ParseRequestError::MissingMapPart)?;
  for (name, filename, content_type, named_file) in files {
    let Some(paths) = name.and_then(|name| map.remove(&name)) else {
      continue;
    };
    for path in paths {
      let reopened = named_file.reopen()?;
      request.set_upload(
        &path,
        UploadValue {
          filename: filename.clone(),
          content_type: content_type.clone(),
          content: reopened,
        },
      );
    }
  }
  if !map.is_empty() {
    return Err(ParseRequestError::MissingFiles);
  }
  Ok(request)
}
