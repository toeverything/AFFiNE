use std::io::Error;

use super::*;

#[inline]
pub fn map_write_error(e: Error) -> JwstCodecError {
  JwstCodecError::InvalidWriteBuffer(e.to_string())
}

pub trait CrdtWriter {
  fn write_var_u64(&mut self, num: u64) -> JwstCodecResult;
  fn write_var_i32(&mut self, num: i32) -> JwstCodecResult;
  fn write_var_string<S: AsRef<str>>(&mut self, s: S) -> JwstCodecResult;
  fn write_var_buffer(&mut self, buf: &[u8]) -> JwstCodecResult;
  fn write_u8(&mut self, num: u8) -> JwstCodecResult;
  fn write_f32_be(&mut self, num: f32) -> JwstCodecResult;
  fn write_f64_be(&mut self, num: f64) -> JwstCodecResult;
  fn write_i64_be(&mut self, num: i64) -> JwstCodecResult;

  fn write_info(&mut self, num: u8) -> JwstCodecResult;
  fn write_item_id(&mut self, id: &Id) -> JwstCodecResult;
}

pub trait CrdtWrite<W: CrdtWriter> {
  fn write(&self, writer: &mut W) -> JwstCodecResult
  where
    Self: Sized;
}
