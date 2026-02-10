use y_octo::{Doc, DocOptions};

use super::ParseError;

pub(super) fn is_empty_doc(binary: &[u8]) -> bool {
  binary.is_empty() || binary == [0, 0]
}

pub(super) fn load_doc(binary: &[u8], doc_id: Option<&str>) -> Result<Doc, ParseError> {
  if is_empty_doc(binary) {
    return Err(ParseError::InvalidBinary);
  }

  let mut doc = build_doc(doc_id);
  doc
    .apply_update_from_binary_v1(binary)
    .map_err(|_| ParseError::InvalidBinary)?;
  Ok(doc)
}

pub(super) fn load_doc_or_new(binary: &[u8]) -> Result<Doc, ParseError> {
  if is_empty_doc(binary) {
    return Ok(DocOptions::new().build());
  }

  let mut doc = DocOptions::new().build();
  doc
    .apply_update_from_binary_v1(binary)
    .map_err(|_| ParseError::InvalidBinary)?;
  Ok(doc)
}

fn build_doc(doc_id: Option<&str>) -> Doc {
  let options = DocOptions::new();
  match doc_id {
    Some(doc_id) => options.with_guid(doc_id.to_string()).build(),
    None => options.build(),
  }
}
