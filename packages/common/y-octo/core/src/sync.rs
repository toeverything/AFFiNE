#[allow(unused)]
#[cfg(not(loom))]
pub(crate) use std::sync::{
  atomic::{AtomicBool, AtomicU16, AtomicU32, AtomicU8, Ordering},
  Mutex, RwLock, RwLockReadGuard, RwLockWriteGuard,
};
pub use std::sync::{Arc, Weak};
#[cfg(all(test, not(loom)))]
pub(crate) use std::{
  sync::{atomic::AtomicUsize, MutexGuard},
  thread,
};

#[cfg(loom)]
pub(crate) use loom::{
  sync::{
    atomic::{AtomicBool, AtomicU16, AtomicU8, AtomicUsize, Ordering},
    Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard,
  },
  thread,
};

#[macro_export(local_inner_macros)]
macro_rules! loom_model {
  ($test:block) => {
    #[cfg(loom)]
    loom::model(move || $test);

    #[cfg(not(loom))]
    $test
  };
}
