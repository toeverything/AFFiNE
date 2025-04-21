#![no_main]

use libfuzzer_sys::fuzz_target;
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha20Rng;
use y_octo::*;

fuzz_target!(|seed: u64| {
  // println!("seed: {}", seed);
  let doc = Doc::with_client(1);
  let mut rand = ChaCha20Rng::seed_from_u64(seed);
  let mut text = doc.get_or_create_text("test").unwrap();
  text.insert(0, "This is a string with length 32.").unwrap();

  let iteration = 20;
  let mut len = 32;

  for i in 0..iteration {
    let mut text = text.clone();
    let ins = i % 2 == 0;
    let pos = rand.random_range(0..if ins { text.len() } else { len / 2 });
    if ins {
      let str = format!("hello {i}");
      text.insert(pos, &str).unwrap();
      len += str.len() as u64;
    } else {
      text.remove(pos, 6).unwrap();
      len -= 6;
    }
  }

  assert_eq!(text.to_string().len(), len as usize);
  assert_eq!(text.len(), len);
});
