use std::{collections::hash_map::Iter, rc::Rc};

use super::*;
use crate::{
  JwstCodecResult,
  doc::{AsInner, Node, Parent, YTypeRef},
  impl_type,
};

impl_type!(Map);

pub(crate) trait MapType: AsInner<Inner = YTypeRef> {
  fn _id(&self) -> Option<Id> {
    self.as_inner().ty().and_then(|ty| ty.item.get().map(|item| item.id))
  }

  fn _insert<V: Into<Value>>(&mut self, key: String, value: V) -> JwstCodecResult {
    if let Some((mut store, mut ty)) = self.as_inner().write() {
      let left = ty.map.get(&SmolStr::new(&key)).cloned();

      let item = store.create_item(
        value.into().into(),
        left.unwrap_or(Somr::none()),
        Somr::none(),
        Some(Parent::Type(self.as_inner().clone())),
        Some(SmolStr::new(key)),
      );
      store.integrate(Node::Item(item), 0, Some(&mut ty))?;
    }

    Ok(())
  }

  fn _get(&self, key: &str) -> Option<Value> {
    self.as_inner().ty().and_then(|ty| {
      ty.map.get(key).and_then(|item| {
        if let Some(item) = item.get() {
          if item.deleted() {
            return None;
          }

          Some(Value::from(&item.content))
        } else {
          None
        }
      })
    })
  }

  fn _contains_key(&self, key: &str) -> bool {
    if let Some(ty) = self.as_inner().ty() {
      ty.map
        .get(key)
        .and_then(|item| item.get())
        .is_some_and(|item| !item.deleted())
    } else {
      false
    }
  }

  fn _remove(&mut self, key: &str) {
    if let Some((mut store, mut ty)) = self.as_inner().write()
      && let Some(item) = ty.map.get(key).cloned()
      && let Some(item) = item.get()
    {
      store.delete_item(item, Some(&mut ty));
    }
  }

  fn _len(&self) -> u64 {
    self._keys().count() as u64
  }

  fn _iter(&self) -> EntriesInnerIterator<'_> {
    let ty = self.as_inner().ty();

    if let Some(ty) = ty {
      let ty = Rc::new(ty);

      EntriesInnerIterator {
        iter: Some(unsafe { &*Rc::as_ptr(&ty) }.map.iter()),
        _lock: Some(ty),
      }
    } else {
      EntriesInnerIterator {
        _lock: None,
        iter: None,
      }
    }
  }

  fn _keys(&self) -> KeysIterator<'_> {
    KeysIterator(self._iter())
  }

  fn _values(&self) -> ValuesIterator<'_> {
    ValuesIterator(self._iter())
  }

  fn _entries(&self) -> EntriesIterator<'_> {
    EntriesIterator(self._iter())
  }
}

pub(crate) struct EntriesInnerIterator<'a> {
  _lock: Option<Rc<RwLockReadGuard<'a, YType>>>,
  iter: Option<Iter<'a, SmolStr, ItemRef>>,
}

pub struct KeysIterator<'a>(EntriesInnerIterator<'a>);
pub struct ValuesIterator<'a>(EntriesInnerIterator<'a>);
pub struct EntriesIterator<'a>(EntriesInnerIterator<'a>);

impl<'a> Iterator for EntriesInnerIterator<'a> {
  type Item = (&'a str, &'a Item);

  fn next(&mut self) -> Option<Self::Item> {
    if let Some(iter) = &mut self.iter {
      for (k, v) in iter {
        if let Some(item) = v.get()
          && !item.deleted()
        {
          return Some((k.as_str(), item));
        }
      }

      None
    } else {
      None
    }
  }
}

impl<'a> Iterator for KeysIterator<'a> {
  type Item = &'a str;

  fn next(&mut self) -> Option<Self::Item> {
    self.0.next().map(|(k, _)| k)
  }
}

impl Iterator for ValuesIterator<'_> {
  type Item = Value;

  fn next(&mut self) -> Option<Self::Item> {
    self.0.next().map(|(_, v)| Value::from(&v.content))
  }
}

impl<'a> Iterator for EntriesIterator<'a> {
  type Item = (&'a str, Value);

  fn next(&mut self) -> Option<Self::Item> {
    self.0.next().map(|(k, v)| (k, Value::from(&v.content)))
  }
}

impl MapType for Map {}

impl Map {
  #[inline(always)]
  pub fn id(&self) -> Option<Id> {
    self._id()
  }

  #[inline(always)]
  pub fn insert<V: Into<Value>>(&mut self, key: String, value: V) -> JwstCodecResult {
    self._insert(key, value)
  }

  #[inline(always)]
  pub fn get(&self, key: &str) -> Option<Value> {
    self._get(key)
  }

  #[inline(always)]
  pub fn contains_key(&self, key: &str) -> bool {
    self._contains_key(key)
  }

  #[inline(always)]
  pub fn remove(&mut self, key: &str) {
    self._remove(key)
  }

  #[inline(always)]
  pub fn len(&self) -> u64 {
    self._len()
  }

  #[inline(always)]
  pub fn is_empty(&self) -> bool {
    self.len() == 0
  }

  #[inline(always)]
  pub fn iter(&self) -> EntriesIterator<'_> {
    self._entries()
  }

  #[inline(always)]
  pub fn entries(&self) -> EntriesIterator<'_> {
    self._entries()
  }

  #[inline(always)]
  pub fn keys(&self) -> KeysIterator<'_> {
    self._keys()
  }

  #[inline(always)]
  pub fn values(&self) -> ValuesIterator<'_> {
    self._values()
  }
}

impl serde::Serialize for Map {
  fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
    use serde::ser::SerializeMap;

    let mut map = serializer.serialize_map(Some(self.len() as usize))?;
    for (key, value) in self.iter() {
      map.serialize_entry(&key, &value)?;
    }
    map.end()
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{Any, Doc, loom_model};

  #[test]
  fn test_map_basic() {
    loom_model!({
      let doc = Doc::new();
      let mut map = doc.get_or_create_map("map").unwrap();
      map.insert("1".to_string(), "value").unwrap();
      assert_eq!(map.get("1").unwrap(), Value::Any(Any::String("value".to_string())));
      assert!(!map.contains_key("nonexistent_key"));
      assert_eq!(map.len(), 1);
      assert!(map.contains_key("1"));
      map.remove("1");
      assert!(!map.contains_key("1"));
      assert_eq!(map.len(), 0);
    });
  }

  #[test]
  fn test_map_equal() {
    loom_model!({
      let doc = Doc::new();
      let mut map = doc.get_or_create_map("map").unwrap();
      map.insert("1".to_string(), "value").unwrap();
      map.insert("2".to_string(), false).unwrap();

      let binary = doc.encode_update_v1().unwrap();
      let new_doc = Doc::try_from_binary_v1(binary).unwrap();
      let map = new_doc.get_or_create_map("map").unwrap();
      assert_eq!(map.get("1").unwrap(), Value::Any(Any::String("value".to_string())));
      assert_eq!(map.get("2").unwrap(), Value::Any(Any::False));
      assert_eq!(map.len(), 2);
    });
  }

  #[test]
  fn test_map_renew_value() {
    loom_model!({
      let doc = Doc::new();
      let mut map = doc.get_or_create_map("map").unwrap();
      map.insert("1".to_string(), "value").unwrap();
      map.insert("1".to_string(), "value2").unwrap();
      assert_eq!(map.get("1").unwrap(), Value::Any(Any::String("value2".to_string())));
      assert_eq!(map.len(), 1);
    });
  }

  #[test]
  fn test_map_re_encode() {
    loom_model!({
      let binary = {
        let doc = Doc::new();
        let mut map = doc.get_or_create_map("map").unwrap();
        map.insert("1".to_string(), "value1").unwrap();
        map.insert("2".to_string(), "value2").unwrap();
        doc.encode_update_v1().unwrap()
      };

      {
        let doc = Doc::try_from_binary_v1(binary).unwrap();
        let map = doc.get_or_create_map("map").unwrap();
        assert_eq!(map.get("1").unwrap(), Value::Any(Any::String("value1".to_string())));
        assert_eq!(map.get("2").unwrap(), Value::Any(Any::String("value2".to_string())));
      }
    });
  }

  #[test]
  fn test_map_iter() {
    loom_model!({
      let doc = Doc::new();
      let mut map = doc.get_or_create_map("map").unwrap();
      map.insert("1".to_string(), "value1").unwrap();
      map.insert("2".to_string(), "value2").unwrap();
      let mut vec = map.entries().collect::<Vec<_>>();

      // hashmap iteration is in random order instead of insert order
      vec.sort_by(|a, b| a.0.cmp(b.0));

      assert_eq!(
        vec,
        vec![
          ("1", Value::Any(Any::String("value1".to_string()))),
          ("2", Value::Any(Any::String("value2".to_string())))
        ]
      )
    });
  }
}
