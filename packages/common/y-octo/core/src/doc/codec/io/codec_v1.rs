use std::io::Cursor;

use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};

use super::*;

#[inline]
pub fn read_with_cursor<T, F>(buffer: &mut Cursor<&[u8]>, f: F) -> JwstCodecResult<T>
where
  F: FnOnce(&[u8]) -> IResult<&[u8], T>,
{
  // TODO: use remaining_slice() instead after it is stabilized
  let input = buffer.get_ref();
  let rest_pos = buffer.position().min(input.len() as u64) as usize;
  let input = &input[rest_pos..];

  let (tail, result) = f(input).map_err(|e| e.map_input(|u| u.len()))?;

  buffer.set_position((rest_pos + input.len() - tail.len()) as u64);
  Ok(result)
}

// compatible with ydoc v1
#[derive(Clone)]
pub struct RawDecoder<'b> {
  pub(super) buffer: Cursor<&'b [u8]>,
}

impl<'b> RawDecoder<'b> {
  pub fn new(buffer: &'b [u8]) -> Self {
    Self {
      buffer: Cursor::new(buffer),
    }
  }

  pub fn rest_ref(&self) -> &[u8] {
    let pos = self.buffer.position();
    let buf = self.buffer.get_ref();

    if pos == 0 {
      buf
    } else {
      &buf[(pos as usize).min(buf.len())..]
    }
  }

  pub fn drain(self) -> &'b [u8] {
    let pos = self.buffer.position() as usize;
    let buf = self.buffer.into_inner();

    if pos == 0 { buf } else { &buf[pos..] }
  }
}

impl CrdtReader for RawDecoder<'_> {
  fn is_empty(&self) -> bool {
    self.buffer.position() >= self.buffer.get_ref().len() as u64
  }

  fn len(&self) -> u64 {
    self.buffer.get_ref().len() as u64 - self.buffer.position()
  }

  fn read_var_u64(&mut self) -> JwstCodecResult<u64> {
    read_with_cursor(&mut self.buffer, read_var_u64)
  }

  fn read_var_i32(&mut self) -> JwstCodecResult<i32> {
    read_with_cursor(&mut self.buffer, read_var_i32)
  }

  fn read_var_string(&mut self) -> JwstCodecResult<String> {
    read_with_cursor(&mut self.buffer, read_var_string)
  }

  fn read_var_buffer(&mut self) -> JwstCodecResult<Vec<u8>> {
    read_with_cursor(&mut self.buffer, |i| {
      read_var_buffer(i).map(|(tail, val)| (tail, val.to_vec()))
    })
  }

  fn read_u8(&mut self) -> JwstCodecResult<u8> {
    self.buffer.read_u8().map_err(reader::map_read_error)
  }

  fn read_f32_be(&mut self) -> JwstCodecResult<f32> {
    self.buffer.read_f32::<BigEndian>().map_err(reader::map_read_error)
  }

  fn read_f64_be(&mut self) -> JwstCodecResult<f64> {
    self.buffer.read_f64::<BigEndian>().map_err(reader::map_read_error)
  }

  fn read_i64_be(&mut self) -> JwstCodecResult<i64> {
    self.buffer.read_i64::<BigEndian>().map_err(reader::map_read_error)
  }

  #[inline(always)]
  fn read_info(&mut self) -> JwstCodecResult<u8> {
    self.read_u8()
  }

  #[inline(always)]
  fn read_item_id(&mut self) -> JwstCodecResult<Id> {
    let client = self.read_var_u64()?;
    let clock = self.read_var_u64()?;
    Ok(Id::new(client, clock))
  }
}

// compatible with ydoc v1
#[derive(Default)]
pub struct RawEncoder {
  buffer: Cursor<Vec<u8>>,
}

impl RawEncoder {
  pub fn into_inner(self) -> Vec<u8> {
    self.buffer.into_inner()
  }
}

impl CrdtWriter for RawEncoder {
  fn write_var_u64(&mut self, num: u64) -> JwstCodecResult {
    write_var_u64(&mut self.buffer, num).map_err(writer::map_write_error)
  }
  fn write_var_i32(&mut self, num: i32) -> JwstCodecResult {
    write_var_i32(&mut self.buffer, num).map_err(writer::map_write_error)
  }
  fn write_var_string<S: AsRef<str>>(&mut self, s: S) -> JwstCodecResult {
    write_var_string(&mut self.buffer, s).map_err(writer::map_write_error)
  }
  fn write_var_buffer(&mut self, buf: &[u8]) -> JwstCodecResult {
    write_var_buffer(&mut self.buffer, buf).map_err(writer::map_write_error)
  }
  fn write_u8(&mut self, num: u8) -> JwstCodecResult {
    self.buffer.write_u8(num).map_err(writer::map_write_error)?;
    Ok(())
  }
  fn write_f32_be(&mut self, num: f32) -> JwstCodecResult {
    self.buffer.write_f32::<BigEndian>(num).map_err(writer::map_write_error)
  }
  fn write_f64_be(&mut self, num: f64) -> JwstCodecResult {
    self.buffer.write_f64::<BigEndian>(num).map_err(writer::map_write_error)
  }
  fn write_i64_be(&mut self, num: i64) -> JwstCodecResult {
    self.buffer.write_i64::<BigEndian>(num).map_err(writer::map_write_error)
  }

  #[inline(always)]
  fn write_info(&mut self, num: u8) -> JwstCodecResult {
    self.write_u8(num)
  }

  #[inline(always)]
  fn write_item_id(&mut self, id: &Id) -> JwstCodecResult {
    self.write_var_u64(id.client)?;
    self.write_var_u64(id.clock)?;
    Ok(())
  }
}

#[cfg(test)]
#[allow(clippy::approx_constant)]
mod tests {
  use super::*;

  #[test]
  fn test_crdt_reader() {
    {
      let mut reader = RawDecoder::new(&[0xf2, 0x5]);
      assert_eq!(reader.read_var_u64().unwrap(), 754);
    }
    {
      let mut reader = RawDecoder::new(&[0x5, b'h', b'e', b'l', b'l', b'o']);

      assert_eq!(reader.clone().read_var_string().unwrap(), "hello");
      assert_eq!(reader.clone().read_var_buffer().unwrap().as_slice(), b"hello");

      assert_eq!(reader.read_u8().unwrap(), 5);
      assert_eq!(reader.read_u8().unwrap(), b'h');
      assert_eq!(reader.read_u8().unwrap(), b'e');
      assert_eq!(reader.read_u8().unwrap(), b'l');
      assert_eq!(reader.read_u8().unwrap(), b'l');
      assert_eq!(reader.read_u8().unwrap(), b'o');
    }
    {
      let mut reader = RawDecoder::new(&[0x40, 0x49, 0x0f, 0xdb]);
      assert_eq!(reader.read_f32_be().unwrap(), 3.1415927);
    }
    {
      let mut reader = RawDecoder::new(&[0x40, 0x09, 0x21, 0xfb, 0x54, 0x44, 0x2d, 0x18]);
      assert_eq!(reader.read_f64_be().unwrap(), 3.141592653589793);
    }
    {
      let mut reader = RawDecoder::new(&[0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
      assert_eq!(reader.read_i64_be().unwrap(), i64::MAX);
    }
    {
      let mut reader = RawDecoder::new(&[0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      assert_eq!(reader.read_i64_be().unwrap(), i64::MIN);
    }
  }

  #[test]
  fn test_crdt_writer() {
    {
      let mut writer = RawEncoder::default();
      writer.write_var_u64(754).unwrap();
      assert_eq!(writer.into_inner(), vec![0xf2, 0x5]);
    }
    {
      let ret = vec![0x5, b'h', b'e', b'l', b'l', b'o'];
      let mut writer = RawEncoder::default();
      writer.write_var_string("hello").unwrap();
      assert_eq!(writer.into_inner(), ret);

      let mut writer = RawEncoder::default();
      writer.write_var_buffer(b"hello").unwrap();
      assert_eq!(writer.into_inner(), ret);

      let mut writer = RawEncoder::default();
      writer.write_u8(5).unwrap();
      writer.write_u8(b'h').unwrap();
      writer.write_u8(b'e').unwrap();
      writer.write_u8(b'l').unwrap();
      writer.write_u8(b'l').unwrap();
      writer.write_u8(b'o').unwrap();
      assert_eq!(writer.into_inner(), ret);
    }
    {
      let mut writer = RawEncoder::default();
      writer.write_f32_be(3.1415927).unwrap();
      assert_eq!(writer.into_inner(), vec![0x40, 0x49, 0x0f, 0xdb]);
    }
    {
      let mut writer = RawEncoder::default();
      writer.write_f64_be(3.141592653589793).unwrap();
      assert_eq!(
        writer.into_inner(),
        vec![0x40, 0x09, 0x21, 0xfb, 0x54, 0x44, 0x2d, 0x18]
      );
    }
    {
      let mut writer = RawEncoder::default();
      writer.write_i64_be(i64::MAX).unwrap();
      assert_eq!(
        writer.into_inner(),
        vec![0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
      );
    }
    {
      let mut writer = RawEncoder::default();
      writer.write_i64_be(i64::MIN).unwrap();
      assert_eq!(
        writer.into_inner(),
        vec![0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
      );
    }
    {
      let mut writer = RawEncoder::default();
      writer.write_info(0x80).unwrap();
      assert_eq!(writer.into_inner(), vec![0x80]);
    }
    {
      let mut writer = RawEncoder::default();
      writer.write_item_id(&Id::new(1, 2)).unwrap();
      assert_eq!(writer.into_inner(), vec![0x1, 0x2]);
    }
  }
}
