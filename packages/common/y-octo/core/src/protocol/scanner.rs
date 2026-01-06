use super::*;

pub struct SyncMessageScanner<'a> {
  buffer: &'a [u8],
}

impl SyncMessageScanner<'_> {
  pub fn new(buffer: &[u8]) -> SyncMessageScanner<'_> {
    SyncMessageScanner { buffer }
  }
}

impl<'a> Iterator for SyncMessageScanner<'a> {
  type Item = Result<SyncMessage, nom::Err<nom::error::Error<&'a [u8]>>>;

  fn next(&mut self) -> Option<Self::Item> {
    if self.buffer.is_empty() {
      return None;
    }

    match read_sync_message(self.buffer) {
      Ok((tail, message)) => {
        self.buffer = tail;
        Some(Ok(message))
      }
      Err(nom::Err::Incomplete(_))
      | Err(nom::Err::Error(nom::error::Error {
        code: nom::error::ErrorKind::Eof,
        ..
      }))
      | Err(nom::Err::Failure(nom::error::Error {
        code: nom::error::ErrorKind::Eof,
        ..
      })) => {
        debug!("incomplete sync message");
        None
      }

      Err(e) => Some(Err(e)),
    }
  }
}

#[cfg(test)]
mod tests {
  use proptest::{collection::vec, prelude::*};

  use super::*;

  proptest! {
      #[test]
      #[cfg_attr(miri, ignore)]
      fn test_sync_message_scanner(messages in vec(any::<SyncMessage>(), 0..10)) {
          let mut buffer = Vec::new();

          for message in &messages {
              write_sync_message(&mut buffer, message).unwrap();
          }

          let result: Result<Vec<SyncMessage>, _> = SyncMessageScanner::new(&buffer).collect();
          assert_eq!(result.unwrap(), messages);
      }
  }
}
