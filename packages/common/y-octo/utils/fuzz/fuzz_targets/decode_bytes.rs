#![no_main]

use libfuzzer_sys::fuzz_target;
use y_octo::{read_var_buffer, read_var_i32, read_var_string, read_var_u64};

fuzz_target!(|data: Vec<u8>| {
  let _ = read_var_i32(&data);
  let _ = read_var_u64(&data);
  let _ = read_var_buffer(&data);
  let _ = read_var_string(&data);
});
