#![no_main]

use libfuzzer_sys::fuzz_target;
use y_octo::{read_sync_message, write_sync_message};

fuzz_target!(|data: &[u8]| {
  let result = read_sync_message(data);

  if let Ok((_, msg)) = result {
    // ensure decoding and re-encoding results has same result
    let mut buffer = Vec::new();
    if let Err(e) = write_sync_message(&mut buffer, &msg) {
      panic!("Failed to write message: {:?}, {:?}", msg, e);
    }
    let result = read_sync_message(&buffer);
    if let Ok((_, msg2)) = result {
      assert_eq!(msg, msg2);
    }
  }
});
