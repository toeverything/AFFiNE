#![no_main]

use libfuzzer_sys::fuzz_target;
use y_octo::{Any, CrdtRead, CrdtWrite, RawDecoder, RawEncoder};

fuzz_target!(|data: &[u8]| {
  if let Ok(any) = Any::read(&mut RawDecoder::new(data)) {
    // ensure decoding and re-encoding results has same result
    let mut buffer = RawEncoder::default();
    if let Err(e) = any.write(&mut buffer) {
      panic!("Failed to write message: {:?}, {:?}", any, e);
    }
    if let Ok(any2) = Any::read(&mut RawDecoder::new(&buffer.into_inner())) {
      assert_eq!(any, any2);
    }
  }
});
