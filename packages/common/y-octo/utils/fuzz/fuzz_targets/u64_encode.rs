#![no_main]

use lib0::encoding::Write;
use libfuzzer_sys::fuzz_target;
use y_octo::write_var_u64;

fuzz_target!(|data: Vec<u64>| {
  for i in data {
    let mut buf1 = Vec::new();
    buf1.write_var(i);

    let mut buf2 = Vec::new();
    write_var_u64(&mut buf2, i).unwrap();

    assert_eq!(buf1, buf2);
  }
});
