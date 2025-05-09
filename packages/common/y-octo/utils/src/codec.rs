use super::*;

#[cfg(test)]
mod tests {

  use super::*;

  use lib0::encoding::Write;

  fn test_var_uint_enc_dec(num: u64) {
    let mut buf1 = Vec::new();
    write_var_u64(&mut buf1, num).unwrap();

    let mut buf2 = Vec::new();
    buf2.write_var(num);

    {
      let (rest, decoded_num) = read_var_u64(&buf1).unwrap();
      assert_eq!(num, decoded_num);
      assert_eq!(rest.len(), 0);
    }

    {
      let (rest, decoded_num) = read_var_u64(&buf2).unwrap();
      assert_eq!(num, decoded_num);
      assert_eq!(rest.len(), 0);
    }
  }

  fn test_var_int_enc_dec(num: i32) {
    {
      let mut buf1: Vec<u8> = Vec::new();
      write_var_i32(&mut buf1, num).unwrap();

      let (rest, decoded_num) = read_var_i32(&buf1).unwrap();
      assert_eq!(num, decoded_num);
      assert_eq!(rest.len(), 0);
    }

    {
      let mut buf2 = Vec::new();
      buf2.write_var(num);

      let (rest, decoded_num) = read_var_i32(&buf2).unwrap();
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
    test_var_uint_enc_dec(u64::max_value());
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
