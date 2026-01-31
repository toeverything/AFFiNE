use super::*;

#[derive(Clone)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) enum Content {
  Deleted(u64),
  Json(Vec<Option<String>>),
  Binary(Vec<u8>),
  String(String),
  #[cfg_attr(test, proptest(skip))]
  Embed(Any),
  #[cfg_attr(test, proptest(skip))]
  Format {
    key: String,
    value: Any,
  },
  #[cfg_attr(test, proptest(skip))]
  Type(YTypeRef),
  Any(Vec<Any>),
  Doc {
    guid: String,
    opts: Any,
  },
}

unsafe impl Send for Content {}
unsafe impl Sync for Content {}

impl From<Any> for Content {
  fn from(value: Any) -> Self {
    match value {
      Any::Undefined
      | Any::Null
      | Any::Integer(_)
      | Any::Float32(_)
      | Any::Float64(_)
      | Any::BigInt64(_)
      | Any::False
      | Any::True
      | Any::String(_)
      | Any::Object(_) => Content::Any(vec![value; 1]),
      Any::Array(v) => Content::Any(v),
      Any::Binary(b) => Content::Binary(b),
    }
  }
}

impl PartialEq for Content {
  fn eq(&self, other: &Self) -> bool {
    match (self, other) {
      (Self::Deleted(len1), Self::Deleted(len2)) => len1 == len2,
      (Self::Json(vec1), Self::Json(vec2)) => vec1 == vec2,
      (Self::Binary(vec1), Self::Binary(vec2)) => vec1 == vec2,
      (Self::String(str1), Self::String(str2)) => str1 == str2,
      (Self::Embed(json1), Self::Embed(json2)) => json1 == json2,
      (
        Self::Format {
          key: key1,
          value: value1,
        },
        Self::Format {
          key: key2,
          value: value2,
        },
      ) => key1 == key2 && value1 == value2,
      (Self::Any(any1), Self::Any(any2)) => any1 == any2,
      (Self::Doc { guid: guid1, .. }, Self::Doc { guid: guid2, .. }) => guid1 == guid2,
      (Self::Type(ty1), Self::Type(ty2)) => ty1 == ty2,
      _ => false,
    }
  }
}

impl std::fmt::Debug for Content {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::Deleted(arg0) => f.debug_tuple("Deleted").field(arg0).finish(),
      Self::Json(arg0) => f
        .debug_tuple("JSON")
        .field(&format!("Vec [len: {}]", arg0.len()))
        .finish(),
      Self::Binary(arg0) => f
        .debug_tuple("Binary")
        .field(&format!("Binary [len: {}]", arg0.len()))
        .finish(),
      Self::String(arg0) => f.debug_tuple("String").field(arg0).finish(),
      Self::Embed(arg0) => f.debug_tuple("Embed").field(arg0).finish(),
      Self::Format { key, value } => f
        .debug_struct("Format")
        .field("key", key)
        .field("value", value)
        .finish(),
      Self::Type(arg0) => f.debug_tuple("Type").field(&arg0.ty().unwrap().kind()).finish(),
      Self::Any(arg0) => f.debug_tuple("Any").field(arg0).finish(),
      Self::Doc { guid, opts } => f.debug_struct("Doc").field("guid", guid).field("opts", opts).finish(),
    }
  }
}

impl Content {
  pub(crate) fn read<R: CrdtReader>(decoder: &mut R, tag_type: u8) -> JwstCodecResult<Self> {
    match tag_type {
      1 => Ok(Self::Deleted(decoder.read_var_u64()?)), // Deleted
      2 => {
        let len = decoder.read_var_u64()?;
        let strings = (0..len)
          .map(|_| decoder.read_var_string().map(|s| (s != "undefined").then_some(s)))
          .collect::<Result<Vec<_>, _>>()?;

        Ok(Self::Json(strings))
      } // JSON
      3 => Ok(Self::Binary(decoder.read_var_buffer()?.to_vec())), // Binary
      4 => Ok(Self::String(decoder.read_var_string()?)), // String
      5 => {
        let string = decoder.read_var_string()?;
        let json = serde_json::from_str(&string).map_err(|_| JwstCodecError::DamagedDocumentJson)?;

        Ok(Self::Embed(json))
      } // Embed
      6 => {
        let key = decoder.read_var_string()?;
        let value = decoder.read_var_string()?;
        let value = serde_json::from_str(&value).map_err(|_| JwstCodecError::DamagedDocumentJson)?;

        Ok(Self::Format { key, value })
      } // Format
      7 => {
        let type_ref = decoder.read_var_u64()?;
        let kind = YTypeKind::from(type_ref);
        let tag_name = match kind {
          YTypeKind::XMLElement | YTypeKind::XMLHook => Some(decoder.read_var_string()?),
          YTypeKind::Unknown => {
            return Err(JwstCodecError::IncompleteDocument(format!(
              "Unknown y type: {type_ref}"
            )));
          }
          _ => None,
        };

        Ok(Self::Type(YTypeRef::new(kind, tag_name)))
      } // YType
      8 => Ok(Self::Any(Any::read_multiple(decoder)?)), // Any
      9 => {
        let guid = decoder.read_var_string()?;
        let opts = Any::read(decoder)?;
        Ok(Self::Doc { guid, opts })
      } // Doc
      tag_type => Err(JwstCodecError::IncompleteDocument(format!(
        "Unknown content type: {tag_type}"
      ))),
    }
  }

  pub(crate) fn get_info(&self) -> u8 {
    match self {
      Self::Deleted(_) => 1,
      Self::Json(_) => 2,
      Self::Binary(_) => 3,
      Self::String(_) => 4,
      Self::Embed(_) => 5,
      Self::Format { .. } => 6,
      Self::Type(_) => 7,
      Self::Any(_) => 8,
      Self::Doc { .. } => 9,
    }
  }

  pub(crate) fn write<W: CrdtWriter>(&self, encoder: &mut W) -> JwstCodecResult {
    match self {
      Self::Deleted(len) => {
        encoder.write_var_u64(*len)?;
      }
      Self::Json(strings) => {
        encoder.write_var_u64(strings.len() as u64)?;
        for string in strings {
          match string {
            Some(string) => encoder.write_var_string(string)?,
            None => encoder.write_var_string("undefined")?,
          }
        }
      }
      Self::Binary(buffer) => {
        encoder.write_var_buffer(buffer)?;
      }
      Self::String(string) => {
        encoder.write_var_string(string)?;
      }
      Self::Embed(val) => {
        encoder.write_var_string(serde_json::to_string(val).map_err(|_| JwstCodecError::DamagedDocumentJson)?)?;
      }
      Self::Format { key, value } => {
        encoder.write_var_string(key)?;
        encoder.write_var_string(serde_json::to_string(value).map_err(|_| JwstCodecError::DamagedDocumentJson)?)?;
      }
      Self::Type(ty) => {
        if let Some(ty) = ty.ty() {
          let type_ref = u64::from(ty.kind());
          encoder.write_var_u64(type_ref)?;

          if matches!(ty.kind(), YTypeKind::XMLElement | YTypeKind::XMLHook) {
            encoder.write_var_string(ty.name.as_ref().unwrap())?;
          }
        }
      }
      Self::Any(any) => {
        Any::write_multiple(encoder, any)?;
      }
      Self::Doc { guid, opts } => {
        encoder.write_var_string(guid)?;
        opts.write(encoder)?;
      }
    }
    Ok(())
  }

  pub fn clock_len(&self) -> u64 {
    match self {
      Self::Deleted(len) => *len,
      Self::Json(strings) => strings.len() as u64,
      // TODO: need a custom wrapper with length cached, this cost too much
      Self::String(string) => string.chars().map(|c| c.len_utf16()).sum::<usize>() as u64,
      Self::Any(any) => any.len() as u64,
      Self::Binary(_) | Self::Embed(_) | Self::Format { .. } | Self::Type(_) | Self::Doc { .. } => 1,
    }
  }

  pub fn countable(&self) -> bool {
    !matches!(self, Content::Format { .. } | Content::Deleted(_))
  }

  #[allow(dead_code)]
  pub fn splittable(&self) -> bool {
    matches!(self, Self::String { .. } | Self::Any { .. } | Self::Json { .. })
  }

  pub fn split(&self, diff: u64) -> JwstCodecResult<(Self, Self)> {
    match self {
      Self::String(str) => {
        let (left, right) = Self::split_as_utf16_str(str.as_str(), diff);
        Ok((Self::String(left.to_string()), Self::String(right.to_string())))
      }
      Self::Json(vec) => {
        let (left, right) = vec.split_at(diff as usize);
        Ok((Self::Json(left.to_owned()), Self::Json(right.to_owned())))
      }
      Self::Any(vec) => {
        let (left, right) = vec.split_at(diff as usize);
        Ok((Self::Any(left.to_owned()), Self::Any(right.to_owned())))
      }
      Self::Deleted(len) => {
        let (left, right) = (diff, *len - diff);

        Ok((Self::Deleted(left), Self::Deleted(right)))
      }
      _ => Err(JwstCodecError::ContentSplitNotSupport(diff)),
    }
  }

  /// consider `offset` as a utf-16 encoded string offset
  fn split_as_utf16_str(s: &str, offset: u64) -> (&str, &str) {
    let mut utf_16_offset = 0;
    let mut utf_8_offset = 0;
    for ch in s.chars() {
      utf_16_offset += ch.len_utf16();
      utf_8_offset += ch.len_utf8();
      if utf_16_offset as u64 >= offset {
        break;
      }
    }

    s.split_at(utf_8_offset)
  }
}

#[cfg(test)]
mod tests {
  use proptest::{collection::vec, prelude::*};

  use super::*;

  fn content_round_trip(content: &Content) -> JwstCodecResult {
    let mut writer = RawEncoder::default();
    writer.write_u8(content.get_info())?;
    content.write(&mut writer)?;
    let update = writer.into_inner();

    let mut reader = RawDecoder::new(&update);
    let tag_type = reader.read_u8()?;
    let decoded = Content::read(&mut reader, tag_type)?;
    match (&decoded, content) {
      (Content::Type(decoded_ty), Content::Type(original_ty)) => {
        let decoded_ty = decoded_ty.ty().expect("decoded ytype must exist");
        let original_ty = original_ty.ty().expect("original ytype must exist");
        assert_eq!(decoded_ty.kind(), original_ty.kind());
        assert_eq!(decoded_ty.name.as_deref(), original_ty.name.as_deref());
      }
      _ => assert_eq!(decoded, *content),
    }

    Ok(())
  }

  #[test]
  fn test_content() {
    loom_model!({
      let contents = [
        Content::Deleted(42),
        Content::Json(vec![None, Some("test_1".to_string()), Some("test_2".to_string())]),
        Content::Binary(vec![1, 2, 3]),
        Content::String("hello".to_string()),
        Content::Embed(Any::True),
        Content::Format {
          key: "key".to_string(),
          value: Any::Integer(42),
        },
        Content::Type(YTypeRef::new(YTypeKind::Array, None)),
        Content::Type(YTypeRef::new(YTypeKind::Map, None)),
        Content::Type(YTypeRef::new(YTypeKind::Text, None)),
        Content::Type(YTypeRef::new(YTypeKind::XMLElement, Some("test".to_string()))),
        Content::Type(YTypeRef::new(YTypeKind::XMLFragment, None)),
        Content::Type(YTypeRef::new(YTypeKind::XMLHook, Some("test".to_string()))),
        Content::Type(YTypeRef::new(YTypeKind::XMLText, None)),
        Content::Any(vec![Any::BigInt64(42), Any::String("Test Any".to_string())]),
        Content::Doc {
          guid: "my_guid".to_string(),
          opts: Any::BigInt64(42),
        },
      ];

      for content in &contents {
        content_round_trip(content).unwrap();
      }
    });
  }

  #[test]
  fn test_content_split() {
    let contents = [
      Content::String("hello".to_string()),
      Content::Json(vec![None, Some("test_1".to_string()), Some("test_2".to_string())]),
      Content::Any(vec![Any::BigInt64(42), Any::String("Test Any".to_string())]),
      Content::Binary(vec![]),
    ];

    {
      let (left, right) = contents[0].split(1).unwrap();
      assert!(contents[0].splittable());
      assert_eq!(left, Content::String("h".to_string()));
      assert_eq!(right, Content::String("ello".to_string()));
    }

    {
      let (left, right) = contents[1].split(1).unwrap();
      assert!(contents[1].splittable());
      assert_eq!(left, Content::Json(vec![None]));
      assert_eq!(
        right,
        Content::Json(vec![Some("test_1".to_string()), Some("test_2".to_string())])
      );
    }

    {
      let (left, right) = contents[2].split(1).unwrap();
      assert!(contents[2].splittable());
      assert_eq!(left, Content::Any(vec![Any::BigInt64(42)]));
      assert_eq!(right, Content::Any(vec![Any::String("Test Any".to_string())]));
    }

    {
      assert!(!contents[3].splittable());
      assert_eq!(contents[3].split(2), Err(JwstCodecError::ContentSplitNotSupport(2)));
    }
  }

  proptest! {
      #[test]
      #[cfg_attr(miri, ignore)]
      fn test_random_content(contents in vec(any::<Content>(), 0..10)) {
          for content in &contents {
              content_round_trip(content).unwrap();
          }
      }
  }
}
