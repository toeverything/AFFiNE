use napi_derive::napi;

#[napi]
pub fn get_mime(input: &[u8]) -> String {
  if let Some(kind) = infer::get(&input[..4096.min(input.len())]) {
    kind.mime_type().to_string()
  } else {
    file_format::FileFormat::from_bytes(input)
      .media_type()
      .to_string()
  }
}
