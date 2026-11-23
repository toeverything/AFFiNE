use crate::{Result, UniffiError};

pub(crate) fn decode_base64_data(data: &str) -> Result<Vec<u8>> {
  base64_simd::STANDARD
    .decode_to_vec(data)
    .map_err(|err| UniffiError::Base64DecodingError(err.to_string()))
}

pub(crate) fn encode_base64_data(data: &[u8]) -> String {
  base64_simd::STANDARD.encode_to_string(data)
}
