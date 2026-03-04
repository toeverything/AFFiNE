use std::{
  fmt::{self, Display},
  ops::RangeInclusive,
};

use ordered_float::OrderedFloat;

use super::*;

const MAX_JS_INT: i64 = 0x001F_FFFF_FFFF_FFFF;
// The smallest int in js number.
const MIN_JS_INT: i64 = -MAX_JS_INT;
pub const JS_INT_RANGE: RangeInclusive<i64> = MIN_JS_INT..=MAX_JS_INT;

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(fuzzing, derive(arbitrary::Arbitrary))]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub enum Any {
  Undefined,
  Null,
  Integer(i32),
  Float32(OrderedFloat<f32>),
  Float64(OrderedFloat<f64>),
  BigInt64(i64),
  False,
  True,
  String(String),
  // FIXME: due to macro's overflow evaluating, we can't use proptest here
  #[cfg_attr(test, proptest(skip))]
  Object(HashMap<String, Any>),
  #[cfg_attr(test, proptest(skip))]
  Array(Vec<Any>),
  Binary(Vec<u8>),
}

impl<R: CrdtReader> CrdtRead<R> for Any {
  fn read(reader: &mut R) -> JwstCodecResult<Self> {
    let index = reader.read_u8()?;
    match 127u8.overflowing_sub(index).0 {
      0 => Ok(Any::Undefined),
      1 => Ok(Any::Null),
      // in yjs implementation, flag 2 only save 32bit integer
      2 => Ok(Any::Integer(reader.read_var_i32()?)),       // Integer
      3 => Ok(Any::Float32(reader.read_f32_be()?.into())), // Float32
      4 => Ok(Any::Float64(reader.read_f64_be()?.into())), // Float64
      5 => Ok(Any::BigInt64(reader.read_i64_be()?)),       // BigInt64
      6 => Ok(Any::False),
      7 => Ok(Any::True),
      8 => Ok(Any::String(reader.read_var_string()?)), // String
      9 => {
        let len = reader.read_var_u64()?;
        let object = (0..len)
          .map(|_| Self::read_key_value(reader))
          .collect::<Result<Vec<_>, _>>()?;

        Ok(Any::Object(object.into_iter().collect()))
      } // Object
      10 => {
        let len = reader.read_var_u64()?;
        let any = (0..len).map(|_| Self::read(reader)).collect::<Result<Vec<_>, _>>()?;

        Ok(Any::Array(any))
      } // Array
      11 => {
        let binary = reader.read_var_buffer()?;
        Ok(Any::Binary(binary.to_vec()))
      } // Binary
      _ => Ok(Any::Undefined),
    }
  }
}

impl<W: CrdtWriter> CrdtWrite<W> for Any {
  fn write(&self, writer: &mut W) -> JwstCodecResult {
    match self {
      Any::Undefined => writer.write_u8(127)?,
      Any::Null => writer.write_u8(127 - 1)?,
      Any::Integer(value) => {
        writer.write_u8(127 - 2)?;
        writer.write_var_i32(*value)?;
      }
      Any::Float32(value) => {
        writer.write_u8(127 - 3)?;
        writer.write_f32_be(value.into_inner())?;
      }
      Any::Float64(value) => {
        writer.write_u8(127 - 4)?;
        writer.write_f64_be(value.into_inner())?;
      }
      Any::BigInt64(value) => {
        writer.write_u8(127 - 5)?;
        writer.write_i64_be(*value)?;
      }
      Any::False => writer.write_u8(127 - 6)?,
      Any::True => writer.write_u8(127 - 7)?,
      Any::String(value) => {
        writer.write_u8(127 - 8)?;
        writer.write_var_string(value)?;
      }
      Any::Object(value) => {
        writer.write_u8(127 - 9)?;
        writer.write_var_u64(value.len() as u64)?;
        for (key, value) in value {
          Self::write_key_value(writer, key, value)?;
        }
      }
      Any::Array(values) => {
        writer.write_u8(127 - 10)?;
        writer.write_var_u64(values.len() as u64)?;
        for value in values {
          value.write(writer)?;
        }
      }
      Any::Binary(value) => {
        writer.write_u8(127 - 11)?;
        writer.write_var_buffer(value)?;
      }
    }

    Ok(())
  }
}

impl Any {
  fn read_key_value<R: CrdtReader>(reader: &mut R) -> JwstCodecResult<(String, Any)> {
    let key = reader.read_var_string()?;
    let value = Self::read(reader)?;

    Ok((key, value))
  }

  fn write_key_value<W: CrdtWriter>(writer: &mut W, key: &str, value: &Any) -> JwstCodecResult {
    writer.write_var_string(key)?;
    value.write(writer)?;

    Ok(())
  }

  pub(crate) fn read_multiple<R: CrdtReader>(reader: &mut R) -> JwstCodecResult<Vec<Any>> {
    let len = reader.read_var_u64()? as usize;
    let mut vec = Vec::with_capacity(len);
    for _ in 0..len {
      vec.push(Any::read(reader)?);
    }

    Ok(vec)
  }

  pub(crate) fn write_multiple<W: CrdtWriter>(writer: &mut W, any: &[Any]) -> JwstCodecResult {
    writer.write_var_u64(any.len() as u64)?;
    for value in any {
      value.write(writer)?;
    }

    Ok(())
  }
}

macro_rules! impl_primitive_from {
    (unsigned, $($ty: ty),*) => {
        $(
            impl From<$ty> for Any {
                fn from(value: $ty) -> Self {
                    // INFO: i64::MAX > value > u64::MAX will cut down
                    // yjs binary does not consider the case that the int size exceeds i64
                    let int: i64 = value as i64;
                    // handle the behavior same as yjs
                    if JS_INT_RANGE.contains(&int) {
                        if int <= i32::MAX as i64 {
                            Self::Integer(int as i32)
                        } else if int as f32 as i64 == int {
                            Self::Float32((int as f32).into())
                        } else {
                            Self::Float64((int as f64).into())
                        }
                    } else {
                        Self::BigInt64(int)
                    }
                }
            }
        )*
    };
    (signed, $($ty: ty),*) => {
        $(
            impl From<$ty> for Any {
                fn from(value: $ty) -> Self {
                    let int: i64 = value.into();
                    // handle the behavior same as yjs
                    if JS_INT_RANGE.contains(&int) {
                        if int <= i32::MAX as i64 {
                            Self::Integer(int as i32)
                        } else if int as f32 as i64 == int {
                            Self::Float32((int as f32).into())
                        } else {
                            Self::Float64((int as f64).into())
                        }
                    } else {
                        Self::BigInt64(int)
                    }
                }
            }
        )*
    };
    (string, $($ty: ty),*) => {
        $(
            impl From<$ty> for Any {
                fn from(value: $ty) -> Self {
                    Self::String(value.into())
                }
            }
        )*
    };
}

impl_primitive_from!(unsigned, u8, u16, u32, u64);
impl_primitive_from!(signed, i8, i16, i32, i64);
impl_primitive_from!(string, String, &str);

impl From<usize> for Any {
  fn from(value: usize) -> Self {
    (value as u64).into()
  }
}

impl From<isize> for Any {
  fn from(value: isize) -> Self {
    (value as i64).into()
  }
}

impl From<f32> for Any {
  fn from(value: f32) -> Self {
    Self::Float32(value.into())
  }
}

impl From<f64> for Any {
  fn from(value: f64) -> Self {
    if value.trunc() == value {
      (value as i64).into()
    } else if value as f32 as f64 == value {
      Self::Float32((value as f32).into())
    } else {
      Self::Float64(value.into())
    }
  }
}

impl From<bool> for Any {
  fn from(value: bool) -> Self {
    if value { Self::True } else { Self::False }
  }
}

impl TryFrom<Any> for String {
  type Error = JwstCodecError;

  fn try_from(value: Any) -> Result<Self, Self::Error> {
    match value {
      Any::String(s) => Ok(s),
      _ => Err(JwstCodecError::UnexpectedType("String")),
    }
  }
}

impl TryFrom<Any> for HashMap<String, Any> {
  type Error = JwstCodecError;

  fn try_from(value: Any) -> Result<Self, Self::Error> {
    match value {
      Any::Object(map) => Ok(map),
      _ => Err(JwstCodecError::UnexpectedType("Object")),
    }
  }
}

impl TryFrom<Any> for Vec<Any> {
  type Error = JwstCodecError;

  fn try_from(value: Any) -> Result<Self, Self::Error> {
    match value {
      Any::Array(vec) => Ok(vec),
      _ => Err(JwstCodecError::UnexpectedType("Array")),
    }
  }
}

impl TryFrom<Any> for bool {
  type Error = JwstCodecError;

  fn try_from(value: Any) -> Result<Self, Self::Error> {
    match value {
      Any::True => Ok(true),
      Any::False => Ok(false),
      _ => Err(JwstCodecError::UnexpectedType("Boolean")),
    }
  }
}

impl FromIterator<Any> for Any {
  fn from_iter<I: IntoIterator<Item = Any>>(iter: I) -> Self {
    Self::Array(iter.into_iter().collect())
  }
}

impl<'a> FromIterator<&'a Any> for Any {
  fn from_iter<I: IntoIterator<Item = &'a Any>>(iter: I) -> Self {
    Self::Array(iter.into_iter().cloned().collect())
  }
}

impl FromIterator<(String, Any)> for Any {
  fn from_iter<I: IntoIterator<Item = (String, Any)>>(iter: I) -> Self {
    let mut map = HashMap::new();
    map.extend(iter);
    Self::Object(map)
  }
}

impl From<HashMap<String, Any>> for Any {
  fn from(value: HashMap<String, Any>) -> Self {
    Self::Object(value)
  }
}

impl From<Vec<u8>> for Any {
  fn from(value: Vec<u8>) -> Self {
    Self::Binary(value)
  }
}

impl From<&[u8]> for Any {
  fn from(value: &[u8]) -> Self {
    Self::Binary(value.into())
  }
}

// TODO: impl for Any::Undefined
impl<T: Into<Any>> From<Option<T>> for Any {
  fn from(value: Option<T>) -> Self {
    if let Some(val) = value { val.into() } else { Any::Null }
  }
}

#[cfg(feature = "serde_json")]
impl From<serde_json::Value> for Any {
  fn from(value: serde_json::Value) -> Self {
    match value {
      serde_json::Value::Null => Self::Null,
      serde_json::Value::Bool(b) => {
        if b {
          Self::True
        } else {
          Self::False
        }
      }
      serde_json::Value::Number(n) => {
        if n.is_f64() {
          Self::Float64(n.as_f64().unwrap().into())
        } else if n.is_i64() {
          Self::Integer(n.as_i64().unwrap() as i32)
        } else {
          Self::Integer(n.as_u64().unwrap() as i32)
        }
      }
      serde_json::Value::String(s) => Self::String(s),
      serde_json::Value::Array(vec) => Self::Array(vec.into_iter().map(|v| v.into()).collect::<Vec<_>>()),
      serde_json::Value::Object(obj) => Self::Object(obj.into_iter().map(|(k, v)| (k, v.into())).collect()),
    }
  }
}

impl<'de> serde::Deserialize<'de> for Any {
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: serde::Deserializer<'de>,
  {
    use serde::de::{Error, MapAccess, SeqAccess, Visitor};
    struct ValueVisitor;

    impl<'de> Visitor<'de> for ValueVisitor {
      type Value = Any;

      fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("any valid JSON value")
      }

      #[inline]
      fn visit_bool<E>(self, value: bool) -> Result<Any, E> {
        Ok(if value { Any::True } else { Any::False })
      }

      #[inline]
      fn visit_i64<E>(self, value: i64) -> Result<Any, E> {
        Ok(Any::BigInt64(value))
      }

      #[inline]
      fn visit_u64<E>(self, value: u64) -> Result<Any, E> {
        Ok((value as i64).into())
      }

      #[inline]
      fn visit_f64<E>(self, value: f64) -> Result<Any, E> {
        Ok(Any::Float64(OrderedFloat(value)))
      }

      #[inline]
      fn visit_str<E>(self, value: &str) -> Result<Any, E>
      where
        E: Error,
      {
        self.visit_string(String::from(value))
      }

      #[inline]
      fn visit_string<E>(self, value: String) -> Result<Any, E> {
        Ok(Any::String(value))
      }

      #[inline]
      fn visit_none<E>(self) -> Result<Any, E> {
        Ok(Any::Null)
      }

      #[inline]
      fn visit_some<D>(self, deserializer: D) -> Result<Any, D::Error>
      where
        D: serde::Deserializer<'de>,
      {
        serde::Deserialize::deserialize(deserializer)
      }

      #[inline]
      fn visit_unit<E>(self) -> Result<Any, E> {
        Ok(Any::Null)
      }

      #[inline]
      fn visit_seq<V>(self, mut visitor: V) -> Result<Any, V::Error>
      where
        V: SeqAccess<'de>,
      {
        let mut vec = Vec::new();

        while let Some(elem) = visitor.next_element()? {
          vec.push(elem);
        }

        Ok(Any::Array(vec))
      }

      fn visit_map<V>(self, mut visitor: V) -> Result<Any, V::Error>
      where
        V: MapAccess<'de>,
      {
        match visitor.next_key::<String>()? {
          Some(k) => {
            let mut values = HashMap::new();

            values.insert(k, visitor.next_value()?);
            while let Some((key, value)) = visitor.next_entry()? {
              values.insert(key, value);
            }

            Ok(Any::Object(values))
          }
          None => Ok(Any::Object(HashMap::new())),
        }
      }
    }

    deserializer.deserialize_any(ValueVisitor)
  }
}

impl serde::Serialize for Any {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    use serde::ser::{SerializeMap, SerializeSeq};

    match self {
      Any::Null => serializer.serialize_none(),
      Any::Undefined => serializer.serialize_none(),
      Any::True => serializer.serialize_bool(true),
      Any::False => serializer.serialize_bool(false),
      Any::Float32(value) => serializer.serialize_f32(value.0),
      Any::Float64(value) => serializer.serialize_f64(value.0),
      Any::Integer(value) => serializer.serialize_i32(*value),
      Any::BigInt64(value) => serializer.serialize_i64(*value),
      Any::String(value) => serializer.serialize_str(value.as_ref()),
      Any::Array(values) => {
        let mut seq = serializer.serialize_seq(Some(values.len()))?;
        for value in values.iter() {
          seq.serialize_element(value)?;
        }
        seq.end()
      }
      Any::Object(entries) => {
        let mut map = serializer.serialize_map(Some(entries.len()))?;
        for (key, value) in entries.iter() {
          map.serialize_entry(key, value)?;
        }
        map.end()
      }
      Any::Binary(buf) => serializer.serialize_bytes(buf),
    }
  }
}

impl Display for Any {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::True => write!(f, "true"),
      Self::False => write!(f, "false"),
      Self::String(s) => write!(f, "\"{s}\""),
      Self::Integer(i) => write!(f, "{i}"),
      Self::Float32(v) => write!(f, "{v}"),
      Self::Float64(v) => write!(f, "{v}"),
      Self::BigInt64(v) => write!(f, "{v}"),
      Self::Object(map) => {
        write!(f, "{{")?;
        for (i, (key, value)) in map.iter().enumerate() {
          if i > 0 {
            write!(f, ", ")?;
          }
          write!(f, "{key}: {value}")?;
        }
        write!(f, "}}")
      }
      Self::Array(vec) => {
        write!(f, "[")?;
        for (i, value) in vec.iter().enumerate() {
          if i > 0 {
            write!(f, ", ")?;
          }
          write!(f, "{value}")?;
        }
        write!(f, "]")
      }
      Self::Binary(buf) => write!(f, "{buf:?}"),
      Self::Undefined => write!(f, "undefined"),
      Self::Null => write!(f, "null"),
    }
  }
}

#[cfg(test)]
mod tests {
  use proptest::{collection::vec, prelude::*};

  use super::*;

  #[test]
  fn test_any_codec() {
    let any = Any::Object(
      vec![
        ("name".to_string(), Any::String("Alice".to_string())),
        ("age".to_string(), Any::Integer(25)),
        (
          "contacts".to_string(),
          Any::Array(vec![
            Any::Object(
              vec![
                ("type".to_string(), Any::String("Mobile".to_string())),
                ("number".to_string(), Any::String("1234567890".to_string())),
              ]
              .into_iter()
              .collect(),
            ),
            Any::Object(
              vec![
                ("type".to_string(), Any::String("Email".to_string())),
                ("address".to_string(), Any::String("alice@example.com".to_string())),
              ]
              .into_iter()
              .collect(),
            ),
            Any::Undefined,
          ]),
        ),
        (
          "standard_data".to_string(),
          Any::Array(vec![
            Any::Undefined,
            Any::Null,
            Any::Integer(114514),
            Any::Float32(114.514.into()),
            Any::Float64(115.514.into()),
            Any::BigInt64(-1145141919810),
            Any::False,
            Any::True,
            Any::Object(
              vec![
                ("name".to_string(), Any::String("tadokoro".to_string())),
                ("age".to_string(), Any::String("24".to_string())),
                ("profession".to_string(), Any::String("student".to_string())),
              ]
              .into_iter()
              .collect(),
            ),
            Any::Binary(vec![1, 2, 3, 4, 5]),
          ]),
        ),
      ]
      .into_iter()
      .collect(),
    );

    let mut encoder = RawEncoder::default();
    any.write(&mut encoder).unwrap();
    let encoded = encoder.into_inner();

    let mut decoder = RawDecoder::new(&encoded);
    let decoded = Any::read(&mut decoder).unwrap();

    assert_eq!(any, decoded);
  }

  proptest! {
      #[test]
      #[cfg_attr(miri, ignore)]
      fn test_random_any(any in vec(any::<Any>(), 0..100)) {
          for any in &any {
              let mut encoder = RawEncoder::default();
              any.write(&mut encoder).unwrap();
              let encoded = encoder.into_inner();

              let mut decoder = RawDecoder::new(&encoded);
              let decoded = Any::read(&mut decoder).unwrap();

              assert_eq!(any, &decoded);
          }
      }
  }

  #[test]
  fn test_convert_to_any() {
    let any: Vec<Any> = vec![
      42u8.into(),
      42u16.into(),
      42u32.into(),
      42u64.into(),
      114.514f32.into(),
      1919.810f64.into(),
      (-42i8).into(),
      (-42i16).into(),
      (-42i32).into(),
      (-42i64).into(),
      false.into(),
      true.into(),
      "JWST".to_string().into(),
      "OctoBase".into(),
      vec![1u8, 9, 1, 9].into(),
      (&[8u8, 1, 0][..]).into(),
      [Any::True, 42u8.into()].iter().collect(),
    ];
    assert_eq!(
      any,
      vec![
        Any::Integer(42),
        Any::Integer(42),
        Any::Integer(42),
        Any::Integer(42),
        Any::Float32(114.514.into()),
        Any::Float64(1919.810.into()),
        Any::Integer(-42),
        Any::Integer(-42),
        Any::Integer(-42),
        Any::Integer(-42),
        Any::False,
        Any::True,
        Any::String("JWST".to_string()),
        Any::String("OctoBase".to_string()),
        Any::Binary(vec![1, 9, 1, 9]),
        Any::Binary(vec![8, 1, 0]),
        Any::Array(vec![Any::True, Any::Integer(42)])
      ]
    );

    assert_eq!(
      vec![("key".to_string(), 10u64.into())].into_iter().collect::<Any>(),
      Any::Object(HashMap::from_iter(vec![("key".to_string(), Any::Integer(10))]))
    );

    let any: Any = 10u64.into();
    assert_eq!([any].iter().collect::<Any>(), Any::Array(vec![Any::Integer(10)]));
  }
}
