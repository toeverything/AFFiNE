#![no_main]

use libfuzzer_sys::fuzz_target;
use y_octo::write_var_i32;

fuzz_target!(|data: Vec<i32>| {
  use lib0::encoding::Write;

  for i in data {
    let mut buf1 = Vec::new();
    write_var_i32(&mut buf1, i).unwrap();
    let mut buf2 = Vec::new();
    buf2.write_var(i);

    assert_eq!(buf1, buf2);
  }
});
