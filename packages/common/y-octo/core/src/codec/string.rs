use std::io::{Error, Write};

use nom::{Parser, combinator::map_res};

use super::*;

pub fn read_var_string(input: &[u8]) -> IResult<&[u8], String> {
  map_res(read_var_buffer, |s| String::from_utf8(s.to_vec())).parse(input)
}

pub fn write_var_string<W: Write, S: AsRef<str>>(buffer: &mut W, input: S) -> Result<(), Error> {
  let bytes = input.as_ref().as_bytes();
  write_var_buffer(buffer, bytes)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use nom::{
    AsBytes, Err,
    error::{Error, ErrorKind},
  };

  use super::*;

  #[test]
  fn test_read_var_string() {
    // Test case 1: valid input, string length = 5
    let input = [0x05, 0x68, 0x65, 0x6C, 0x6C, 0x6F];
    let expected_output = "hello".to_string();
    let result = read_var_string(&input);
    assert_eq!(result, Ok((&[][..], expected_output)));

    // Test case 2: missing string length
    let input = [0x68, 0x65, 0x6C, 0x6C, 0x6F];
    let result = read_var_string(&input);
    assert_eq!(result, Err(Err::Error(Error::new(&input[1..], ErrorKind::Eof))));

    // Test case 3: truncated input
    let input = [0x05, 0x68, 0x65, 0x6C, 0x6C];
    let result = read_var_string(&input);
    assert_eq!(result, Err(Err::Error(Error::new(&input[1..], ErrorKind::Eof))));

    // Test case 4: invalid input
    let input = [0xFF, 0x01, 0x02, 0x03, 0x04];
    let result = read_var_string(&input);
    assert_eq!(result, Err(Err::Error(Error::new(&input[2..], ErrorKind::Eof))));

    // Test case 5: invalid var int encoding
    let input = [0xFF, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01];
    let result = read_var_string(&input);
    assert_eq!(result, Err(Err::Error(Error::new(&input[7..], ErrorKind::Eof))));

    // Test case 6: invalid input, invalid UTF-8 encoding
    let input = [0x05, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
    let result = read_var_string(&input);
    assert_eq!(result, Err(Err::Error(Error::new(&input[..], ErrorKind::MapRes))));
  }

  #[test]
  fn test_var_str_codec() {
    test_var_str_enc_dec("".to_string());
    test_var_str_enc_dec(" ".to_string());
    test_var_str_enc_dec("abcde".to_string());
    test_var_str_enc_dec("🃒🃓🃟☗🀥🀫∺∼≂≇⓵➎⓷➏‍".to_string());
  }

  fn test_var_str_enc_dec(input: String) {
    let mut buf = Vec::<u8>::new();
    write_var_string(&mut buf, input.clone()).unwrap();
    let (rest, decoded_str) = read_var_string(buf.as_bytes()).unwrap();
    assert_eq!(decoded_str, input);
    assert_eq!(rest.len(), 0);
  }
}
