#![no_main]

use libfuzzer_sys::fuzz_target;
use rand::{distr::Alphanumeric, Rng};
use y_octo::{Any, CrdtRead, CrdtWrite, RawDecoder, RawEncoder};

fn get_random_string() -> String {
  rand::rng()
    .sample_iter(&Alphanumeric)
    .take(7)
    .map(char::from)
    .collect()
}

fuzz_target!(|data: Vec<Any>| {
  {
    let any = Any::Object(
      data
        .iter()
        .map(|a| (get_random_string(), a.clone()))
        .collect(),
    );

    let mut buffer = RawEncoder::default();
    if let Err(e) = any.write(&mut buffer) {
      panic!("Failed to write message: {:?}, {:?}", any, e);
    }
    if let Ok(any2) = Any::read(&mut RawDecoder::new(&buffer.into_inner())) {
      assert_eq!(any, any2);
    }
  }

  {
    let any = Any::Array(data);
    let mut buffer = RawEncoder::default();
    if let Err(e) = any.write(&mut buffer) {
      panic!("Failed to write message: {:?}, {:?}", any, e);
    }
    if let Ok(any2) = Any::read(&mut RawDecoder::new(&buffer.into_inner())) {
      assert_eq!(any, any2);
    }
  }
});
