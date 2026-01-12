mod array;
mod list;
mod map;
mod text;
mod value;
mod xml;

use std::{
  collections::hash_map::Entry,
  hash::{Hash, Hasher},
  sync::Weak,
};

pub use array::*;
use list::*;
pub use map::*;
pub use text::*;
pub use value::*;
pub use xml::*;

use super::{
  store::{StoreRef, WeakStoreRef},
  *,
};
use crate::{
  Item, JwstCodecError, JwstCodecResult,
  sync::{Arc, RwLock, RwLockReadGuard, RwLockWriteGuard},
};

#[derive(Debug, Default)]
pub(crate) struct YType {
  pub start: Somr<Item>,
  pub item: Somr<Item>,
  pub map: HashMap<SmolStr, Somr<Item>>,
  pub len: u64,
  /// The tag name of XMLElement and XMLHook type
  pub name: Option<String>,
  /// The name of the type that directly belongs the store.
  pub root_name: Option<String>,
  kind: YTypeKind,
  pub markers: Option<MarkerList>,
}

#[derive(Debug, Default, Clone)]
pub(crate) struct YTypeRef {
  pub store: WeakStoreRef,
  pub inner: Somr<RwLock<YType>>,
}

impl PartialEq for YType {
  fn eq(&self, other: &Self) -> bool {
    self.root_name == other.root_name || (self.start.is_some() && self.start == other.start) || self.map == other.map
  }
}

impl PartialEq for YTypeRef {
  fn eq(&self, other: &Self) -> bool {
    // only check pointer equality
    // currently no scenarios that involve cross document ytype comparisons
    self.inner.ptr_eq(&other.inner)
  }
}

impl Eq for YTypeRef {}

impl Hash for YTypeRef {
  fn hash<H: Hasher>(&self, state: &mut H) {
    self.inner.ptr().hash(state);
  }
}

impl YType {
  pub fn new(kind: YTypeKind, tag_name: Option<String>) -> Self {
    YType {
      kind,
      name: tag_name,
      ..YType::default()
    }
  }

  pub fn kind(&self) -> YTypeKind {
    self.kind
  }

  pub fn set_kind(&mut self, kind: YTypeKind) -> JwstCodecResult {
    std::debug_assert!(kind != YTypeKind::Unknown);

    if self.kind() != kind {
      if self.kind == YTypeKind::Unknown {
        self.kind = kind;
      } else {
        return Err(JwstCodecError::TypeCastError(kind.as_str()));
      }
    }

    Ok(())
  }
}

impl YTypeRef {
  pub fn new(kind: YTypeKind, tag_name: Option<String>) -> Self {
    Self {
      inner: Somr::new(RwLock::new(YType::new(kind, tag_name))),
      store: Weak::new(),
    }
  }

  pub fn ty(&self) -> Option<RwLockReadGuard<'_, YType>> {
    self.inner.get().and_then(|ty| ty.read().ok())
  }

  pub fn ty_mut(&self) -> Option<RwLockWriteGuard<'_, YType>> {
    self.inner.get().and_then(|ty| ty.write().ok())
  }

  #[allow(dead_code)]
  pub fn store<'a>(&self) -> Option<RwLockReadGuard<'a, DocStore>> {
    if let Some(store) = self.store.upgrade() {
      let ptr = unsafe { &*Arc::as_ptr(&store) };

      Some(ptr.read().unwrap())
    } else {
      None
    }
  }

  pub fn store_mut<'a>(&self) -> Option<RwLockWriteGuard<'a, DocStore>> {
    if let Some(store) = self.store.upgrade() {
      let ptr = unsafe { &*Arc::as_ptr(&store) };

      Some(ptr.write().unwrap())
    } else {
      None
    }
  }

  #[allow(dead_code)]
  pub fn read(&self) -> Option<(RwLockReadGuard<'_, DocStore>, RwLockReadGuard<'_, YType>)> {
    self.store().and_then(|store| self.ty().map(|ty| (store, ty)))
  }

  pub fn write(&self) -> Option<(RwLockWriteGuard<'_, DocStore>, RwLockWriteGuard<'_, YType>)> {
    self.store_mut().and_then(|store| self.ty_mut().map(|ty| (store, ty)))
  }
}

pub(crate) struct YTypeBuilder {
  store: StoreRef,
  /// The tag name of XMLElement and XMLHook type
  name: Option<String>,
  /// The name of the type that directly belongs the store.
  root_name: Option<String>,
  kind: YTypeKind,
}

impl YTypeBuilder {
  pub fn new(store: StoreRef) -> Self {
    Self {
      store,
      name: None,
      root_name: None,
      kind: YTypeKind::Unknown,
    }
  }

  pub fn with_kind(mut self, kind: YTypeKind) -> Self {
    self.kind = kind;

    self
  }

  pub fn set_name(mut self, name: String) -> Self {
    self.root_name = Some(name);

    self
  }

  #[allow(dead_code)]
  pub fn set_tag_name(mut self, tag_name: String) -> Self {
    self.name = Some(tag_name);

    self
  }

  pub fn build_exists<T: TryFrom<YTypeRef, Error = JwstCodecError>>(self) -> JwstCodecResult<T> {
    let store = self.store.read().unwrap();
    let ty = if let Some(root_name) = self.root_name {
      match store.types.get(&root_name) {
        Some(ty) => ty.clone(),
        None => {
          return Err(JwstCodecError::RootStructNotFound(root_name));
        }
      }
    } else {
      return Err(JwstCodecError::TypeCastError("root_name is not set"));
    };

    drop(store);

    T::try_from(ty)
  }

  pub fn build<T: TryFrom<YTypeRef, Error = JwstCodecError>>(self) -> JwstCodecResult<T> {
    let mut store = self.store.write().unwrap();
    let ty = if let Some(root_name) = self.root_name {
      match store.types.entry(root_name.clone()) {
        Entry::Occupied(e) => e.get().clone(),
        Entry::Vacant(e) => {
          let inner = Somr::new(RwLock::new(YType {
            kind: self.kind,
            name: self.name,
            root_name: Some(root_name),
            markers: Self::markers(self.kind),
            ..Default::default()
          }));

          let ty = YTypeRef {
            store: Arc::downgrade(&self.store),
            inner,
          };

          let ty_ref = ty.clone();
          e.insert(ty);

          ty_ref
        }
      }
    } else {
      let inner = Somr::new(RwLock::new(YType {
        kind: self.kind,
        name: self.name,
        root_name: self.root_name.clone(),
        markers: Self::markers(self.kind),
        ..Default::default()
      }));

      let ty = YTypeRef {
        store: Arc::downgrade(&self.store),
        inner,
      };

      let ty_ref = ty.clone();

      store.dangling_types.insert(ty.inner.ptr().as_ptr() as usize, ty);

      ty_ref
    };

    drop(store);

    T::try_from(ty)
  }

  fn markers(kind: YTypeKind) -> Option<MarkerList> {
    match kind {
      YTypeKind::Map => None,
      _ => Some(MarkerList::new()),
    }
  }
}

#[macro_export(local_inner_macros)]
macro_rules! impl_variants {
    ({$($name: ident: $codec_ref: literal),*}) => {
        #[derive(Debug, Clone, Copy, PartialEq, Default)]
        pub enum YTypeKind {
            $($name,)*
            #[default]
            Unknown,
        }

        impl YTypeKind {
            pub fn as_str(&self) -> &'static str {
                match self {
                    $(YTypeKind::$name => std::stringify!($name),)*
                    YTypeKind::Unknown => "Unknown",
                }
            }
        }

        impl From<u64> for YTypeKind {
            fn from(value: u64) -> Self {
                match value {
                    $($codec_ref => YTypeKind::$name,)*
                    _ => YTypeKind::Unknown,
                }
            }
        }


        impl From<YTypeKind> for u64 {
            fn from(value: YTypeKind) -> Self {
                std::debug_assert!(value != YTypeKind::Unknown);
                match value {
                    $(YTypeKind::$name => $codec_ref,)*
                    _ => std::unreachable!(),
                }
            }
        }
    };
}

pub(crate) trait AsInner {
  type Inner;
  fn as_inner(&self) -> &Self::Inner;
}

#[macro_export(local_inner_macros)]
macro_rules! impl_type {
  ($name: ident) => {
    #[derive(Debug, Clone, PartialEq)]
    pub struct $name(pub(crate) super::YTypeRef);
    unsafe impl Sync for $name {}
    unsafe impl Send for $name {}

    impl $name {
      pub(crate) fn new(inner: super::YTypeRef) -> Self {
        Self(inner)
      }
    }

    impl super::AsInner for $name {
      type Inner = super::YTypeRef;

      #[inline(always)]
      fn as_inner(&self) -> &Self::Inner {
        &self.0
      }
    }

    impl TryFrom<super::YTypeRef> for $name {
      type Error = $crate::JwstCodecError;

      fn try_from(value: super::YTypeRef) -> Result<Self, Self::Error> {
        if let Some((_, mut inner)) = value.write() {
          match inner.kind {
            super::YTypeKind::$name => Ok($name::new(value.clone())),
            super::YTypeKind::Unknown => {
              inner.set_kind(super::YTypeKind::$name)?;
              Ok($name::new(value.clone()))
            }
            _ => Err($crate::JwstCodecError::TypeCastError(std::stringify!($name))),
          }
        } else {
          Err($crate::JwstCodecError::TypeCastError(std::stringify!($name)))
        }
      }
    }

    impl $name {
      pub(crate) fn from_unchecked(value: super::YTypeRef) -> Self {
        $name::new(value.clone())
      }
    }

    impl From<$name> for super::Value {
      fn from(value: $name) -> Self {
        Self::$name(value)
      }
    }
  };
}

impl_variants!({
    Array: 0,
    Map: 1,
    Text: 2,
    XMLElement: 3,
    XMLFragment: 4,
    XMLHook: 5,
    XMLText: 6
    // Doc: 9?
});
