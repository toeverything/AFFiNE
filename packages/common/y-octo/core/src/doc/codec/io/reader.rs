use std::io::Error;

use super::*;

#[inline]
pub fn map_read_error(e: Error) -> JwstCodecError {
  JwstCodecError::IncompleteDocument(e.to_string())
}

pub trait CrdtReader {
  fn is_empty(&self) -> bool;
  fn len(&self) -> u64;
  fn read_var_u64(&mut self) -> JwstCodecResult<u64>;
  fn read_var_i32(&mut self) -> JwstCodecResult<i32>;
  fn read_var_string(&mut self) -> JwstCodecResult<String>;
  fn read_var_buffer(&mut self) -> JwstCodecResult<Vec<u8>>;
  fn read_u8(&mut self) -> JwstCodecResult<u8>;
  fn read_f32_be(&mut self) -> JwstCodecResult<f32>;
  fn read_f64_be(&mut self) -> JwstCodecResult<f64>;
  fn read_i64_be(&mut self) -> JwstCodecResult<i64>;

  fn read_info(&mut self) -> JwstCodecResult<u8>;
  fn read_item_id(&mut self) -> JwstCodecResult<Id>;
}

pub trait CrdtRead<R: CrdtReader> {
  fn read(reader: &mut R) -> JwstCodecResult<Self>
  where
    Self: Sized;
}
