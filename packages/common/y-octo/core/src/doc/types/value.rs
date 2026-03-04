use std::fmt::Display;

use super::*;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
  Any(Any),
  Doc(Doc),
  Array(Array),
  Map(Map),
  Text(Text),
  XMLElement(XMLElement),
  XMLFragment(XMLFragment),
  XMLHook(XMLHook),
  XMLText(XMLText),
}

impl Value {
  pub fn to_any(&self) -> Option<Any> {
    match self {
      Value::Any(any) => Some(any.clone()),
      _ => None,
    }
  }

  pub fn to_array(&self) -> Option<Array> {
    match self {
      Value::Array(array) => Some(array.clone()),
      _ => None,
    }
  }

  pub fn to_map(&self) -> Option<Map> {
    match self {
      Value::Map(map) => Some(map.clone()),
      _ => None,
    }
  }

  pub fn to_text(&self) -> Option<Text> {
    match self {
      Value::Text(text) => Some(text.clone()),
      _ => None,
    }
  }

  pub fn from_vec<T: Into<Any>>(el: Vec<T>) -> Self {
    Value::Any(Any::Array(el.into_iter().map(|item| item.into()).collect::<Vec<_>>()))
  }
}

impl From<&Content> for Value {
  fn from(value: &Content) -> Value {
    match value {
      Content::Any(any) => Value::Any(if any.len() == 1 {
        any[0].clone()
      } else {
        Any::Array(any.clone())
      }),
      Content::String(s) => Value::Any(Any::String(s.clone())),
      Content::Json(json) => Value::Any(Any::Array(
        json
          .iter()
          .map(|item| {
            if let Some(s) = item {
              Any::String(s.clone())
            } else {
              Any::Undefined
            }
          })
          .collect::<Vec<_>>(),
      )),
      Content::Binary(buf) => Value::Any(Any::Binary(buf.clone())),
      Content::Embed(v) => Value::Any(v.clone()),
      Content::Type(ty) => match ty.ty().unwrap().kind {
        YTypeKind::Array => Value::Array(Array::from_unchecked(ty.clone())),
        YTypeKind::Map => Value::Map(Map::from_unchecked(ty.clone())),
        YTypeKind::Text => Value::Text(Text::from_unchecked(ty.clone())),
        YTypeKind::XMLElement => Value::XMLElement(XMLElement::from_unchecked(ty.clone())),
        YTypeKind::XMLFragment => Value::XMLFragment(XMLFragment::from_unchecked(ty.clone())),
        YTypeKind::XMLHook => Value::XMLHook(XMLHook::from_unchecked(ty.clone())),
        YTypeKind::XMLText => Value::XMLText(XMLText::from_unchecked(ty.clone())),
        // actually unreachable
        YTypeKind::Unknown => Value::Any(Any::Undefined),
      },
      Content::Doc { guid: _, opts } => Value::Doc(
        DocOptions::try_from(opts.clone())
          .expect("Failed to parse doc options")
          .build(),
      ),
      Content::Format { .. } => unimplemented!(),
      // actually unreachable
      Content::Deleted(_) => Value::Any(Any::Undefined),
    }
  }
}

impl From<Value> for Content {
  fn from(value: Value) -> Self {
    match value {
      Value::Any(any) => Content::from(any),
      Value::Doc(doc) => Content::Doc {
        guid: doc.guid().to_owned(),
        opts: Any::from(doc.options().clone()),
      },
      Value::Array(v) => Content::Type(v.0),
      Value::Map(v) => Content::Type(v.0),
      Value::Text(v) => Content::Type(v.0),
      Value::XMLElement(v) => Content::Type(v.0),
      Value::XMLFragment(v) => Content::Type(v.0),
      Value::XMLHook(v) => Content::Type(v.0),
      Value::XMLText(v) => Content::Type(v.0),
    }
  }
}

impl<T: Into<Any>> From<T> for Value {
  fn from(value: T) -> Self {
    Value::Any(value.into())
  }
}

impl From<Doc> for Value {
  fn from(value: Doc) -> Self {
    Value::Doc(value)
  }
}

impl Display for Value {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Value::Any(any) => write!(f, "{any}"),
      Value::Text(text) => write!(f, "{text}"),
      _ => write!(f, ""),
    }
  }
}

impl serde::Serialize for Value {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    match self {
      Self::Any(any) => any.serialize(serializer),
      Self::Array(array) => array.serialize(serializer),
      Self::Map(map) => map.serialize(serializer),
      Self::Text(text) => text.serialize(serializer),
      // Self::XMLElement(xml_element) => xml_element.serialize(serializer),
      // Self::XMLFragment(xml_fragment) => xml_fragment.serialize(serializer),
      // Self::XMLHook(xml_hook) => xml_hook.serialize(serializer),
      // Self::XMLText(xml_text) => xml_text.serialize(serializer),
      // Self::Doc(doc) => doc.serialize(serializer),
      _ => serializer.serialize_none(),
    }
  }
}
