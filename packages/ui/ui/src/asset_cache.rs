use crate::collections::FxHashSet;
use crate::{App, EntityId, SharedString, SharedUri, Task};
use futures::{Future, TryFutureExt};

use std::cell::RefCell;
use std::fmt::Debug;
use std::hash::{BuildHasher, Hash};
use std::marker::PhantomData;
use std::mem;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::Arc;

pub(crate) struct CachedLoad<T> {
    state: Rc<RefCell<CachedLoadState<T>>>,
    // Keep the owner outside the state so publishing a result cannot cancel its own task.
    _task: Task<()>,
}

enum CachedLoadState<T> {
    Loading(FxHashSet<EntityId>),
    Loaded(T),
}

impl<T: Clone + Send + 'static> CachedLoad<T> {
    pub(crate) fn new(future: impl Future<Output = T> + Send + 'static, cx: &App) -> Self {
        let state = Rc::new(RefCell::new(CachedLoadState::Loading(FxHashSet::default())));
        let task = cx.background_executor().spawn(future);
        let task = cx.spawn({
            let state = Rc::downgrade(&state);
            async move |cx| {
                let result = task.await;
                let Some(state) = state.upgrade() else {
                    return;
                };
                let previous =
                    mem::replace(&mut *state.borrow_mut(), CachedLoadState::Loaded(result));
                let CachedLoadState::Loading(views) = previous else {
                    unreachable!("a cached load completes only once");
                };
                cx.update(|cx| {
                    for view in views {
                        cx.notify(view);
                    }
                });
            }
        });
        Self { state, _task: task }
    }

    pub(crate) fn get(&self) -> Option<T> {
        match &*self.state.borrow() {
            CachedLoadState::Loading(_) => None,
            CachedLoadState::Loaded(result) => Some(result.clone()),
        }
    }

    pub(crate) fn use_by(&self, view: EntityId) -> Option<T> {
        match &mut *self.state.borrow_mut() {
            CachedLoadState::Loading(views) => {
                views.insert(view);
                None
            }
            CachedLoadState::Loaded(result) => Some(result.clone()),
        }
    }
}

/// An enum representing
#[derive(Debug, PartialEq, Eq, Hash, Clone)]
pub enum Resource {
    /// This resource is at a given URI
    Uri(SharedUri),
    /// This resource is at a given path in the file system
    Path(Arc<Path>),
    /// This resource is embedded in the application binary
    Embedded(SharedString),
}

impl From<SharedUri> for Resource {
    fn from(value: SharedUri) -> Self {
        Self::Uri(value)
    }
}

impl From<PathBuf> for Resource {
    fn from(value: PathBuf) -> Self {
        Self::Path(value.into())
    }
}

impl From<Arc<Path>> for Resource {
    fn from(value: Arc<Path>) -> Self {
        Self::Path(value)
    }
}

/// A trait for asynchronous asset loading.
pub trait Asset: 'static {
    /// The source of the asset.
    type Source: Clone + Hash + Send;

    /// The loaded asset
    type Output: Clone + Send;

    /// Load the asset asynchronously
    fn load(
        source: Self::Source,
        cx: &mut App,
    ) -> impl Future<Output = Self::Output> + Send + 'static;
}

/// An asset Loader which logs the [`Err`] variant of a [`Result`] during loading
pub enum AssetLogger<T> {
    #[doc(hidden)]
    _Phantom(PhantomData<T>, &'static dyn crate::seal::Sealed),
}

impl<T, R, E> Asset for AssetLogger<T>
where
    T: Asset<Output = Result<R, E>>,
    R: Clone + Send,
    E: Clone + Send + Debug,
{
    type Source = T::Source;

    type Output = T::Output;

    fn load(
        source: Self::Source,
        cx: &mut App,
    ) -> impl Future<Output = Self::Output> + Send + 'static {
        let load = T::load(source, cx);
        load.inspect_err(|e| log::error!("Failed to load asset: {:?}", e))
    }
}

/// Use a quick, non-cryptographically secure hash function to get an identifier from data
pub fn hash<T: Hash>(data: &T) -> u64 {
    crate::collections::FxBuildHasher.hash_one(data)
}
