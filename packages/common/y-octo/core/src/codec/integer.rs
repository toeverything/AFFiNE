use std::io::{Error, Write};

use byteorder::WriteBytesExt;
use nom::Needed;

use super::*;

pub fn read_var_u64(input: &[u8]) -> IResult<&[u8], u64> {
  // parse the first byte
  if let Some(next_byte) = input.first() {
    let mut shift = 7;
    let mut curr_byte = *next_byte;
    let mut rest = &input[1..];

    // same logic in loop, but enable early exit when dealing with small numbers
    let mut num = (curr_byte & 0b0111_1111) as u64;

    // if the sign bit is set, we need more bits
    while (curr_byte >> 7) & 0b1 != 0 {
      if let Some(next_byte) = rest.first() {
        curr_byte = *next_byte;
        // add the remaining 7 bits to the number
        num |= ((curr_byte & 0b0111_1111) as u64).wrapping_shl(shift);
        shift += 7;
        rest = &rest[1..];
      } else {
        return Err(nom::Err::Incomplete(Needed::new(input.len() + 1)));
      }
    }

    Ok((rest, num))
  } else {
    Err(nom::Err::Incomplete(Needed::new(1)))
  }
}

pub fn write_var_u64<W: Write>(buffer: &mut W, mut num: u64) -> Result<(), Error> {
  // bit or 0b1000_0000 pre 7 bit if has more bits
  while num >= 0b10000000 {
    buffer.write_u8(num as u8 & 0b0111_1111 | 0b10000000)?;
    num >>= 7;
  }

  buffer.write_u8((num & 0b01111111) as u8)?;

  Ok(())
}

pub fn read_var_i32(input: &[u8]) -> IResult<&[u8], i32> {
  // parse the first byte
  if let Some(next_byte) = input.first() {
    let mut shift = 6;
    let mut curr_byte = *next_byte;
    let mut rest: &[u8] = &input[1..];

    // get the sign bit and the first 6 bits of the number
    let sign_bit = (curr_byte >> 6) & 0b1;
    let mut num = (curr_byte & 0b0011_1111) as i64;

    // if the sign bit is set, we need more bits
    while (curr_byte >> 7) & 0b1 != 0 {
      if let Some(next_byte) = rest.first() {
        curr_byte = *next_byte;
        // add the remaining 7 bits to the number
        num |= ((curr_byte & 0b0111_1111) as i64).wrapping_shl(shift);
        shift += 7;
        rest = &rest[1..];
      } else {
        return Err(nom::Err::Incomplete(Needed::new(input.len() + 1)));
      }
    }

    // negate the number if the sign bit is set
    if sign_bit == 1 {
      num = -num;
    }

    Ok((rest, num as i32))
  } else {
    Err(nom::Err::Incomplete(Needed::new(1)))
  }
}

pub fn write_var_i32<W: Write>(buffer: &mut W, num: i32) -> Result<(), Error> {
  let mut num = num as i64;
  let is_negative = num < 0;
  if is_negative {
    num = -num;
  }

  buffer.write_u8(
    // bit or 0b1000_0000 if has more bits
    if num > 0b00111111 { 0b10000000 } else { 0 }
            // bit or 0b0100_0000 if negative
            | if is_negative { 0b0100_0000 } else { 0 }
            // store last 6 bits
            | num as u8 & 0b0011_1111,
  )?;
  num >>= 6;
  while num > 0 {
    buffer.write_u8(
      // bit or 0b1000_0000 pre 7 bit if has more bits
      if num > 0b01111111 { 0b10000000 } else { 0 }
            // store last 7 bits
            | num as u8 & 0b0111_1111,
    )?;
    num >>= 7;
  }

  Ok(())
}

#[cfg(test)]
mod tests {

  use super::*;

  fn test_var_uint_enc_dec(num: u64) {
    let mut buf = Vec::new();
    write_var_u64(&mut buf, num).unwrap();

    let (rest, decoded_num) = read_var_u64(&buf).unwrap();
    assert_eq!(num, decoded_num);
    assert_eq!(rest.len(), 0);
  }

  fn test_var_int_enc_dec(num: i32) {
    {
      let mut buf = Vec::new();
      write_var_i32(&mut buf, num).unwrap();

      let (rest, decoded_num) = read_var_i32(&buf).unwrap();
      assert_eq!(num, decoded_num);
      assert_eq!(rest.len(), 0);
    }
  }

  #[test]
  fn test_var_uint_codec() {
    test_var_uint_enc_dec(0);
    test_var_uint_enc_dec(1);
    test_var_uint_enc_dec(127);
    test_var_uint_enc_dec(0b1000_0000);
    test_var_uint_enc_dec(0b1_0000_0000);
    test_var_uint_enc_dec(0b1_1111_1111);
    test_var_uint_enc_dec(0b10_0000_0000);
    test_var_uint_enc_dec(0b11_1111_1111);
    test_var_uint_enc_dec(0x7fff_ffff_ffff_ffff);
    test_var_uint_enc_dec(u64::MAX);
  }

  #[test]
  fn test_var_int() {
    test_var_int_enc_dec(0);
    test_var_int_enc_dec(1);
    test_var_int_enc_dec(-1);
    test_var_int_enc_dec(63);
    test_var_int_enc_dec(-63);
    test_var_int_enc_dec(64);
    test_var_int_enc_dec(-64);
    test_var_int_enc_dec(i32::MAX);
    test_var_int_enc_dec(i32::MIN);
    test_var_int_enc_dec(((1 << 20) - 1) * 8);
    test_var_int_enc_dec(-((1 << 20) - 1) * 8);
  }
}
