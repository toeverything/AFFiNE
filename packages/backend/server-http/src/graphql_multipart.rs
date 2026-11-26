//! Parses multipart `/graphql` uploads with the `v0.27.5`
//! `graphqlUploadExpress({ maxFileSize: 100 MiB, maxFiles: 32 })` limits.
//! Each limit fails with `ParseRequestError::PayloadTooLarge`, which the
//! transport returns as HTTP 413 without a GraphQL envelope.

use std::collections::HashMap;
use std::io::{Seek, Write};

use async_graphql::{ParseRequestError, Request, UploadValue};
use multer::{Constraints, Multipart, SizeLimit};

/// Largest non-file field, such as `operations` or `map`. Matches the
/// `graphql-upload` default `maxFieldSize`.
pub(crate) const MAX_GRAPHQL_MULTIPART_FIELD_BYTES: usize = 1_000_000;
/// Largest number of file fields and of `map` entries.
pub(crate) const MAX_GRAPHQL_MULTIPART_FILES: usize = 32;
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
  let mut map = None;
  let mut files = Vec::new();
  while let Some(mut field) = multipart.next_field().await? {
    let name = field.name().map(str::to_owned);
    if let Some(filename) = field.file_name().map(str::to_owned) {
      if files.len() == MAX_GRAPHQL_MULTIPART_FILES {
        return Err(ParseRequestError::PayloadTooLarge);
      }
      let content_type = field.content_type().map(ToString::to_string);
      let mut file = tempfile::tempfile()?;
      let mut written = 0usize;
      while let Some(chunk) = field.chunk().await? {
        written += chunk.len();
        if written > MAX_GRAPHQL_MULTIPART_FILE_BYTES {
          return Err(ParseRequestError::PayloadTooLarge);
        }
        file.write_all(&chunk)?;
      }
      file.rewind()?;
      files.push((name, filename, content_type, file));
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
        let parsed: HashMap<String, Vec<String>> =
          serde_json::from_slice(&bytes).map_err(|e| ParseRequestError::InvalidFilesMap(Box::new(e)))?;
        if parsed.len() > MAX_GRAPHQL_MULTIPART_FILES {
          return Err(ParseRequestError::PayloadTooLarge);
        }
        map = Some(parsed);
      }
      _ => {}
    }
  }

  let mut request = request.ok_or(ParseRequestError::MissingOperatorsPart)?;
  let mut map = map.ok_or(ParseRequestError::MissingMapPart)?;
  for (name, filename, content_type, content) in files {
    let Some(paths) = name.and_then(|name| map.remove(&name)) else {
      continue;
    };
    let upload = UploadValue {
      filename,
      content_type,
      content,
    };
    for path in paths {
      request.set_upload(&path, upload.try_clone()?);
    }
  }
  if !map.is_empty() {
    return Err(ParseRequestError::MissingFiles);
  }
  Ok(request)
}
