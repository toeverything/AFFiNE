use std::{
  cell::UnsafeCell,
  fmt::{self, Write},
  hash::{Hash, Hasher},
  marker::PhantomData,
  mem,
  ops::{Deref, DerefMut},
  ptr::NonNull,
};

use crate::sync::Ordering;
const DANGLING_PTR: usize = usize::MAX;
#[inline]
fn is_dangling<T>(ptr: NonNull<T>) -> bool {
  ptr.as_ptr() as usize == DANGLING_PTR
}

/// Heap data with single owner but multiple refs with dangling checking at
/// runtime.
pub(crate) enum Somr<T> {
  Owned(Owned<T>),
  Ref(Ref<T>),
}

#[repr(transparent)]
pub(crate) struct Owned<T>(NonNull<SomrInner<T>>);
#[repr(transparent)]
pub(crate) struct Ref<T>(NonNull<SomrInner<T>>);

#[cfg(feature = "large_refs")]
type RefAtomicType = crate::sync::AtomicU32;
#[cfg(feature = "large_refs")]
type RefPrimitiveType = u32;

#[cfg(not(feature = "large_refs"))]
type RefAtomicType = crate::sync::AtomicU16;
#[cfg(not(feature = "large_refs"))]
type RefPrimitiveType = u16;

pub(crate) struct SomrInner<T> {
  data: Option<UnsafeCell<T>>,
  /// increase the size when we really meet the the scenario with refs more
  /// then u16::MAX(65535) times
  refs: RefAtomicType,
  _marker: PhantomData<Option<T>>,
}

pub(crate) struct InnerRefMut<'a, T> {
  inner: NonNull<T>,
  _marker: PhantomData<&'a mut T>,
}

impl<T> Deref for InnerRefMut<'_, T> {
  type Target = T;

  fn deref(&self) -> &Self::Target {
    unsafe { &*self.inner.as_ptr() }
  }
}

impl<T> DerefMut for InnerRefMut<'_, T> {
  fn deref_mut(&mut self) -> &mut Self::Target {
    unsafe { &mut *self.inner.as_ptr() }
  }
}

unsafe impl<T: Send> Send for Somr<T> {}
unsafe impl<T: Sync> Sync for Somr<T> {}

impl<T> Default for Somr<T> {
  fn default() -> Self {
    Self::none()
  }
}

impl<T> Somr<T> {
  pub fn new(data: T) -> Self {
    let inner = Box::new(SomrInner {
      data: Some(UnsafeCell::new(data)),
      refs: RefAtomicType::new(1),
      _marker: PhantomData,
    });

    Self::Owned(Owned(Box::leak(inner).into()))
  }

  pub fn none() -> Self {
    Self::Ref(Ref(NonNull::new(DANGLING_PTR as *mut _).unwrap()))
  }
}

impl<T> SomrInner<T> {
  fn data_ref(&self) -> Option<&T> {
    self.data.as_ref().map(|x| unsafe { &*x.get() })
  }

  fn data_mut(&self) -> Option<InnerRefMut<'_, T>> {
    self.data.as_ref().map(|x| InnerRefMut {
      inner: unsafe { NonNull::new_unchecked(x.get()) },
      _marker: PhantomData,
    })
  }
}

impl<T> Somr<T> {
  #[inline]
  pub fn is_none(&self) -> bool {
    self.dangling() || self.inner().data_ref().is_none()
  }

  #[inline]
  pub fn is_some(&self) -> bool {
    !self.dangling() && self.inner().data_ref().is_some()
  }

  pub fn get(&self) -> Option<&T> {
    if self.dangling() {
      return None;
    }

    self.inner().data_ref()
  }

  pub unsafe fn get_unchecked(&self) -> &T {
    if self.dangling() {
      panic!("Try to visit Somr data that has already been dropped.")
    }

    match &self.inner().data_ref() {
      Some(data) => data,
      None => {
        panic!("Try to unwrap on None")
      }
    }
  }

  #[allow(unused)]
  pub fn get_mut(&mut self) -> Option<&mut T> {
    if !self.is_owned() || self.dangling() {
      return None;
    }

    let inner = self.inner_mut();
    inner.data.as_mut().map(|x| x.get_mut())
  }

  #[allow(unused)]
  pub unsafe fn get_mut_from_ref(&self) -> Option<InnerRefMut<'_, T>> {
    if !self.is_owned() || self.dangling() {
      return None;
    }

    let inner = self.inner_mut();
    inner.data_mut()
  }

  pub unsafe fn get_mut_unchecked(&self) -> InnerRefMut<'_, T> {
    if self.dangling() {
      panic!("Try to visit Somr data that has already been dropped.")
    }

    match self.inner_mut().data_mut() {
      Some(data) => data,
      None => {
        panic!("Try to unwrap on None")
      }
    }
  }

  #[inline]
  pub fn is_owned(&self) -> bool {
    matches!(self, Self::Owned(_))
  }

  pub fn swap_take(&mut self) -> Self {
    debug_assert!(self.is_owned());

    let mut r = self.clone();

    mem::swap(self, &mut r);

    r
  }

  #[inline]
  fn inner(&self) -> &SomrInner<T> {
    debug_assert!(!self.dangling());
    unsafe { self.ptr().as_ref() }
  }

  #[inline]
  #[allow(clippy::mut_from_ref)]
  fn inner_mut(&self) -> &mut SomrInner<T> {
    debug_assert!(!self.dangling());
    unsafe { self.ptr().as_mut() }
  }

  #[inline]
  pub fn ptr(&self) -> NonNull<SomrInner<T>> {
    match self {
      Somr::Owned(ptr) => ptr.0,
      Somr::Ref(ptr) => ptr.0,
    }
  }

  #[inline]
  pub fn ptr_eq(&self, other: &Self) -> bool {
    std::ptr::eq(self.ptr().as_ptr(), other.ptr().as_ptr())
  }

  #[inline]
  fn dangling(&self) -> bool {
    is_dangling(self.ptr())
  }
}

impl<T> Clone for Somr<T> {
  fn clone(&self) -> Self {
    if self.dangling() {
      return Self::none();
    }

    let inner = unsafe { &*self.ptr().as_ptr() };

    let old_size = inner.refs.fetch_add(1, Ordering::Relaxed);

    if old_size == RefPrimitiveType::MAX {
      panic!("Too many refs on Somr, maybe we need to increase the limitation now.")
    }

    Self::Ref(Ref(self.ptr()))
  }
}

impl<T> Drop for Owned<T> {
  fn drop(&mut self) {
    let inner = unsafe { &mut *self.0.as_ptr() };

    // ensure all reads are finished
    // See [Arc::Drop]
    inner.refs.load(Ordering::Acquire);

    inner.data.take();
    drop(Ref(self.0));
  }
}

impl<T> Drop for Ref<T> {
  fn drop(&mut self) {
    if is_dangling(self.0) {
      return;
    }

    let rc = unsafe { &(*self.0.as_ptr()).refs };

    // no other refs
    if rc.fetch_sub(1, Ordering::Release) == 1 {
      // ensure all reads are finished
      // See [Arc::Drop]
      rc.load(Ordering::Acquire);

      drop(unsafe { Box::from_raw(self.0.as_ptr()) });
    }
  }
}

impl<T> From<T> for Somr<T> {
  fn from(value: T) -> Self {
    Somr::new(value)
  }
}

impl<T> From<Option<Somr<T>>> for Somr<T> {
  fn from(value: Option<Somr<T>>) -> Self {
    value.unwrap_or_default()
  }
}

pub trait FlattenGet<T> {
  #[allow(dead_code)]
  fn flatten_get(&self) -> Option<&T>;
}

impl<T> FlattenGet<T> for Option<Somr<T>> {
  fn flatten_get(&self) -> Option<&T> {
    self.as_ref().and_then(|data| data.get())
  }
}

impl<T: PartialEq> PartialEq for Somr<T> {
  fn eq(&self, other: &Self) -> bool {
    self.ptr() == other.ptr() || !self.dangling() && !other.dangling() && self.inner() == other.inner()
  }
}

impl<T: PartialEq> PartialEq for SomrInner<T> {
  fn eq(&self, other: &Self) -> bool {
    self.data_ref() == other.data_ref()
  }
}

impl<T: PartialEq> Eq for Somr<T> {
  fn assert_receiver_is_total_eq(&self) {}
}

impl<T: PartialOrd> PartialOrd for Somr<T> {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    match (self.get(), other.get()) {
      (Some(a), Some(b)) => a.partial_cmp(b),
      _ => None,
    }
  }
}

impl<T> Hash for Somr<T> {
  fn hash<H: Hasher>(&self, state: &mut H) {
    self.ptr().hash(state)
  }
}

impl<T: fmt::Debug> fmt::Debug for Somr<T> {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    if self.is_owned() {
      f.write_str("Owned(")?;
    } else {
      f.write_str("Ref(")?;
    }

    if let Some(value) = self.get() {
      fmt::Debug::fmt(value, f)?;
    } else {
      f.write_str("None")?;
    }

    f.write_char(')')
  }
}

impl<T: fmt::Display> fmt::Display for Somr<T> {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    if self.is_owned() {
      f.write_str("Owned(")?;
    } else {
      f.write_str("Ref(")?;
    }

    if let Some(value) = self.get() {
      fmt::Display::fmt(value, f)?;
    } else {
      f.write_str("None")?;
    }

    f.write_char(')')
  }
}

impl<T: Sized> fmt::Pointer for Somr<T> {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    fmt::Pointer::fmt(&(self.get().unwrap() as *const T), f)
  }
}

#[cfg(all(test, not(loom)))]
impl<T: proptest::arbitrary::Arbitrary> proptest::arbitrary::Arbitrary for Somr<T> {
  type Parameters = T::Parameters;
  type Strategy = proptest::strategy::MapInto<T::Strategy, Self>;

  fn arbitrary_with(args: Self::Parameters) -> Self::Strategy {
    proptest::strategy::Strategy::prop_map_into(proptest::arbitrary::any_with::<T>(args))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::loom_model;

  #[test]
  fn basic_example() {
    loom_model!({
      let five = Somr::new(5);
      assert_eq!(five.get(), Some(&5));

      let five_ref = five.clone();
      assert!(!five_ref.is_owned());
      assert_eq!(five_ref.get(), Some(&5));
      assert_eq!(five_ref.ptr().as_ptr() as usize, five.ptr().as_ptr() as usize);

      drop(five);
      // owner released
      assert_eq!(five_ref.get(), None);
    });
  }

  #[test]
  fn complex_struct() {
    loom_model!({
      struct T {
        a: usize,
        b: String,
      }

      let t1 = Somr::new(T {
        a: 1,
        b: "hello".to_owned(),
      });

      assert_eq!(t1.get().unwrap().a, 1);
      assert_eq!(t1.get().unwrap().b.as_str(), "hello");

      let t2 = t1.clone();
      assert!(!t2.is_owned());
      assert_eq!(t2.ptr().as_ptr() as usize, t1.ptr().as_ptr() as usize);
      assert_eq!(t2.get().unwrap().a, 1);
      assert_eq!(t2.get().unwrap().b.as_str(), "hello");

      drop(t1);

      assert!(t2.get().is_none());
    });
  }

  #[test]
  fn acquire_mut_ref() {
    loom_model!({
      let mut five = Somr::new(5);

      *five.get_mut().unwrap() += 1;
      assert_eq!(five.get(), Some(&6));

      let five_ref = five.clone();

      // only owner can mut ref
      assert!(five_ref.get().is_some());
      assert!(unsafe { five_ref.get_mut_from_ref() }.is_none());

      drop(five);
    });
  }

  #[test]
  fn comparison() {
    loom_model!({
      let five = Somr::new(5);
      let five_ref = five.clone();
      let another_five = Somr::new(5);
      let six = Somr::new(6);

      assert_eq!(five, five_ref);
      assert_eq!(five, another_five);
      assert_eq!(five.ptr().as_ptr(), five_ref.ptr().as_ptr());
      assert_ne!(five.ptr().as_ptr(), another_five.ptr().as_ptr());

      assert!(six > five);
      assert!(six > five_ref);

      assert_eq!(five_ref.partial_cmp(&six), Some(std::cmp::Ordering::Less));
      drop(five);
      assert_eq!(five_ref.partial_cmp(&six), None);
    });
  }

  #[test]
  fn represent_none() {
    loom_model!({
      let none = Somr::<u32>::none();

      assert!(!none.is_owned());
      assert!(none.is_none());
      assert!(none.get().is_none());
    });
  }

  #[test]
  fn drop_ref_without_affecting_owner() {
    loom_model!({
      let five = Somr::new(5);
      let five_ref = five.clone();

      assert_eq!(five.get().unwrap(), &5);
      assert_eq!(five_ref.get().unwrap(), &5);

      drop(five_ref);

      assert_eq!(five.get().unwrap(), &5);
    });
  }

  #[test]
  fn swap_take() {
    loom_model!({
      let mut five = Somr::new(5);
      let owned = five.swap_take();

      assert_eq!(owned.get().unwrap(), &5);
      assert_eq!(five.get().unwrap(), &5);

      assert!(owned.is_owned());
      assert!(!five.is_owned());
    });
  }

  // This is UB if we didn't use `UnsafeCell` in `Somr`
  #[test]
  fn test_inner_mut() {
    loom_model!({
      let five = Somr::new(5);
      fn add(a: &Somr<i32>, b: &Somr<i32>) {
        unsafe { a.get_mut_from_ref() }
          .map(|mut x| *x += *b.get().unwrap())
          .unwrap();
      }

      add(&five, &five);
      assert_eq!(five.get().copied().unwrap(), 10);
    });
  }
}
