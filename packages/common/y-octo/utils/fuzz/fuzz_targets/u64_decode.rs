#![no_main]

use lib0::encoding::Write;
use libfuzzer_sys::fuzz_target;
use y_octo::{read_var_u64, write_var_u64};

fuzz_target!(|data: Vec<u64>| {
  for i in data {
    let mut buf1 = Vec::new();
    write_var_u64(&mut buf1, i).unwrap();

    let mut buf2 = Vec::new();
    buf2.write_var(i);

    assert_eq!(read_var_u64(&buf1).unwrap().1, i);
    assert_eq!(read_var_u64(&buf2).unwrap().1, i);
  }
});
