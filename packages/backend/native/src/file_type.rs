use napi_derive::napi;

#[napi]
pub fn get_mime(input: &[u8]) -> String {
  file_format::FileFormat::from_bytes(input)
    .media_type()
    .to_string()
}
