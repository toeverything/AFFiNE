pub use std::sync::{Arc, Weak};
#[allow(unused)]
#[cfg(not(loom))]
pub(crate) use std::sync::{
  Mutex, RwLock, RwLockReadGuard, RwLockWriteGuard,
  atomic::{AtomicBool, AtomicU8, AtomicU16, AtomicU32, Ordering},
};
#[cfg(all(test, not(loom)))]
pub(crate) use std::{
  sync::{MutexGuard, atomic::AtomicUsize},
  thread,
};

#[cfg(loom)]
pub(crate) use loom::{
  sync::{
    Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard,
    atomic::{AtomicBool, AtomicU8, AtomicU16, AtomicU32, AtomicUsize, Ordering},
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
