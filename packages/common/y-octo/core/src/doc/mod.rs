mod awareness;
mod batch;
mod codec;
mod common;
mod document;
mod hasher;
mod history;
#[cfg(feature = "events")]
mod publisher;
mod store;
mod types;
mod utils;

pub use ahash::{HashMap, HashMapExt, HashSet, HashSetExt};
pub use awareness::{Awareness, AwarenessEvent};
pub use batch::{Batch, batch_commit};
pub use codec::*;
pub use common::*;
pub use document::{Doc, DocOptions};
pub use hasher::ClientMap;
pub use history::{History, HistoryOptions, StoreHistory};
use smol_str::SmolStr;
pub(crate) use store::DocStore;
pub use types::*;
pub use utils::*;

use super::*;

/// NOTE:
///   - We do not use [HashMap::with_capacity(num_of_clients)] directly here
///     because we don't trust the input data.
///   - For instance, what if the first u64 was somehow set a very big value?
///     - A pre-allocated HashMap with a big capacity may cause OOM.
///     - A kinda safer approach is give it a max capacity of 1024 at first
///       allocation, and then let std makes the growth as need.
pub const HASHMAP_SAFE_CAPACITY: usize = 1 << 10;
