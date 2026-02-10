use super::*;

// doc sync message
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub enum DocMessage {
  // state vector
  // TODO: temporarily skipped in the test, because yrs decoding needs to ensure that the update in step1 is the
  // correct state vector binary       and any data can be included in our implementation (we will ensure the
  // correctness of encoding and decoding in the subsequent decoding process)
  #[cfg_attr(test, proptest(skip))]
  Step1(Vec<u8>),
  // update
  Step2(Vec<u8>),
  // update
  Update(Vec<u8>),
}

const DOC_MESSAGE_STEP1: u64 = 0;
const DOC_MESSAGE_STEP2: u64 = 1;
const DOC_MESSAGE_UPDATE: u64 = 2;

pub fn read_doc_message(input: &[u8]) -> IResult<&[u8], DocMessage> {
  let (tail, step) = read_var_u64(input)?;

  match step {
    DOC_MESSAGE_STEP1 => {
      let (tail, sv) = read_var_buffer(tail)?;
      // TODO: decode state vector
      Ok((tail, DocMessage::Step1(sv.into())))
    }
    DOC_MESSAGE_STEP2 => {
      let (tail, update) = read_var_buffer(tail)?;
      // TODO: decode update
      Ok((tail, DocMessage::Step2(update.into())))
    }
    DOC_MESSAGE_UPDATE => {
      let (tail, update) = read_var_buffer(tail)?;
      // TODO: decode update
      Ok((tail, DocMessage::Update(update.into())))
    }
    _ => Err(nom::Err::Error(Error::new(input, ErrorKind::Tag))),
  }
}

pub fn write_doc_message<W: Write>(buffer: &mut W, msg: &DocMessage) -> Result<(), IoError> {
  match msg {
    DocMessage::Step1(sv) => {
      write_var_u64(buffer, DOC_MESSAGE_STEP1)?;
      write_var_buffer(buffer, sv)?;
    }
    DocMessage::Step2(update) => {
      write_var_u64(buffer, DOC_MESSAGE_STEP2)?;
      write_var_buffer(buffer, update)?;
    }
    DocMessage::Update(update) => {
      write_var_u64(buffer, DOC_MESSAGE_UPDATE)?;
      write_var_buffer(buffer, update)?;
    }
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_doc_message() {
    let messages = [
      DocMessage::Step1(vec![0x01, 0x02, 0x03]),
      DocMessage::Step2(vec![0x04, 0x05, 0x06]),
      DocMessage::Update(vec![0x07, 0x08, 0x09]),
    ];

    for msg in messages {
      let mut buffer = Vec::new();

      write_doc_message(&mut buffer, &msg).unwrap();
      let (tail, decoded) = read_doc_message(&buffer).unwrap();

      assert_eq!(tail.len(), 0);
      assert_eq!(decoded, msg);
    }

    // test invalid msg
    {
      let mut buffer = Vec::new();
      let msg = DocMessage::Step1(vec![0x01, 0x02, 0x03]);

      write_doc_message(&mut buffer, &msg).unwrap();
      buffer[0] = 0xff; // Inject error in message tag
      let res = read_doc_message(&buffer);

      match res.as_ref().unwrap_err() {
        nom::Err::Error(error) => assert_eq!(error.code, ErrorKind::Tag),
        _ => panic!("Expected error ErrorKind::Tag, but got {:?}", res),
      }
    }
  }
}
