use byteorder::WriteBytesExt;

use super::*;

#[derive(Debug, Clone, PartialEq)]
enum MessageType {
  Auth,
  Awareness,
  AwarenessQuery,
  Doc,
}

fn read_sync_tag(input: &[u8]) -> IResult<&[u8], MessageType> {
  let (tail, tag) = read_var_u64(input)?;
  let tag = match tag {
    0 => MessageType::Doc,
    1 => MessageType::Awareness,
    2 => MessageType::Auth,
    3 => MessageType::AwarenessQuery,
    _ => return Err(nom::Err::Error(Error::new(input, ErrorKind::Tag))),
  };

  Ok((tail, tag))
}

fn write_sync_tag<W: Write>(buffer: &mut W, tag: MessageType) -> Result<(), IoError> {
  let tag: u64 = match tag {
    MessageType::Doc => 0,
    MessageType::Awareness => 1,
    MessageType::Auth => 2,
    MessageType::AwarenessQuery => 3,
  };

  write_var_u64(buffer, tag)?;

  Ok(())
}

// sync message
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub enum SyncMessage {
  Auth(Option<String>),
  Awareness(AwarenessStates),
  AwarenessQuery,
  Doc(DocMessage),
}

pub fn read_sync_message(input: &[u8]) -> IResult<&[u8], SyncMessage> {
  let (tail, tag) = read_sync_tag(input)?;

  let (tail, message) = match tag {
    MessageType::Doc => {
      let (tail, doc) = read_doc_message(tail)?;
      (tail, SyncMessage::Doc(doc))
    }
    MessageType::Awareness => {
      let (tail, update) = read_var_buffer(tail)?;
      (
        tail,
        SyncMessage::Awareness({
          let (awareness_tail, awareness) = read_awareness(update)?;
          let tail_len = awareness_tail.len();
          if tail_len > 0 {
            debug!("awareness update has trailing bytes: {tail_len}");
            debug_assert!(tail_len > 0, "awareness update has trailing bytes");
          }
          awareness
        }),
      )
    }
    MessageType::Auth => {
      let (tail, success) = read_var_u64(tail)?;

      if success == 1 {
        (tail, SyncMessage::Auth(None))
      } else {
        let (tail, reason) = read_var_string(tail)?;
        (tail, SyncMessage::Auth(Some(reason)))
      }
    }
    MessageType::AwarenessQuery => (tail, SyncMessage::AwarenessQuery),
  };

  Ok((tail, message))
}

pub fn write_sync_message<W: Write>(buffer: &mut W, msg: &SyncMessage) -> Result<(), IoError> {
  match msg {
    SyncMessage::Auth(reason) => {
      const PERMISSION_DENIED: u8 = 0;
      const PERMISSION_GRANTED: u8 = 1;

      write_sync_tag(buffer, MessageType::Auth)?;
      if let Some(reason) = reason {
        buffer.write_u8(PERMISSION_DENIED)?;
        write_var_string(buffer, reason)?;
      } else {
        buffer.write_u8(PERMISSION_GRANTED)?;
      }
    }
    SyncMessage::AwarenessQuery => {
      write_sync_tag(buffer, MessageType::AwarenessQuery)?;
    }
    SyncMessage::Awareness(awareness) => {
      write_sync_tag(buffer, MessageType::Awareness)?;
      write_var_buffer(buffer, &{
        let mut update = Vec::new();
        write_awareness(&mut update, awareness)?;
        update
      })?;
    }
    SyncMessage::Doc(doc) => {
      write_sync_tag(buffer, MessageType::Doc)?;
      write_doc_message(buffer, doc)?;
    }
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::{awareness::AwarenessState, *};

  #[test]
  fn test_sync_tag() {
    let messages = [
      MessageType::Auth,
      MessageType::Awareness,
      MessageType::AwarenessQuery,
      MessageType::Doc,
    ];

    for msg in messages {
      let mut buffer = Vec::new();

      write_sync_tag(&mut buffer, msg.clone()).unwrap();
      let (tail, decoded) = read_sync_tag(&buffer).unwrap();

      assert_eq!(tail.len(), 0);
      assert_eq!(decoded, msg);
    }
  }

  #[test]
  fn test_sync_message() {
    let messages = [
      SyncMessage::Auth(Some("reason".to_string())),
      SyncMessage::Awareness(HashMap::from([(1, AwarenessState::new(1, "test".into()))])),
      SyncMessage::AwarenessQuery,
      SyncMessage::Doc(DocMessage::Step1(vec![4, 5, 6])),
      SyncMessage::Doc(DocMessage::Step2(vec![7, 8, 9])),
      SyncMessage::Doc(DocMessage::Update(vec![10, 11, 12])),
    ];

    for msg in messages {
      let mut buffer = Vec::new();
      write_sync_message(&mut buffer, &msg).unwrap();
      let (tail, decoded) = read_sync_message(&buffer).unwrap();
      assert_eq!(tail.len(), 0);
      assert_eq!(decoded, msg);
    }
  }
}
