use crate::gpui_util::{TryFutureExt, TryFutureExtBacktrace};
use crate::scheduler::Instant;
use crate::scheduler::Scheduler;
use crate::{ActivityGuard, App, PlatformDispatcher, PlatformScheduler};
#[cfg(not(target_family = "wasm"))]
use futures::channel::mpsc;
use futures::prelude::*;
use std::{future::Future, marker::PhantomData, rc::Rc, sync::Arc, time::Duration};
#[cfg(not(target_family = "wasm"))]
use std::{mem, pin::Pin};

pub use crate::scheduler::{
    DedicatedExecutor, FallibleTask, LocalExecutor as SchedulerLocalExecutor, Priority, Task,
};

/// A pointer to the executor that is currently running,
/// for spawning background tasks.
#[derive(Clone)]
pub struct BackgroundExecutor {
    inner: crate::scheduler::BackgroundExecutor,
    dispatcher: Arc<dyn PlatformDispatcher>,
}

/// A pointer to the executor that is currently running,
/// for spawning tasks on the main thread.
#[derive(Clone)]
pub struct ForegroundExecutor {
    inner: crate::scheduler::LocalExecutor,
    dispatcher: Arc<dyn PlatformDispatcher>,
    not_send: PhantomData<Rc<()>>,
}

/// A thread-safe handle for spawning `Send` futures on the main thread.
#[derive(Clone)]
pub struct SendForegroundExecutor {
    inner: crate::scheduler::SendLocalExecutor,
}

impl SendForegroundExecutor {
    /// Enqueues a future to run on the main thread, even when submitted from another thread.
    #[track_caller]
    pub fn spawn<R>(&self, future: impl Future<Output = R> + Send + 'static) -> Task<R>
    where
        R: Send + 'static,
    {
        self.inner.spawn(future)
    }
}

/// Extension trait for `Task<Result<T, E>>` that adds `detach_and_log_err` with an `&App` context.
///
/// This trait is automatically implemented for all `Task<Result<T, E>>` types.
pub trait TaskExt<T, E> {
    /// Run the task to completion in the background and log any errors that occur.
    fn detach_and_log_err(self, cx: &App);
    /// Like [`Self::detach_and_log_err`], but uses `{:?}` formatting on failure so `anyhow::Error`
    /// values emit their full backtrace. Prefer `detach_and_log_err` unless a backtrace is wanted.
    fn detach_and_log_err_with_backtrace(self, cx: &App);
}

impl<T, E> TaskExt<T, E> for Task<Result<T, E>>
where
    T: 'static,
    E: 'static + std::fmt::Display + std::fmt::Debug,
{
    #[track_caller]
    fn detach_and_log_err(self, cx: &App) {
        let location = core::panic::Location::caller();
        cx.foreground_executor()
            .spawn(self.log_tracked_err(*location))
            .detach();
    }

    #[track_caller]
    fn detach_and_log_err_with_backtrace(self, cx: &App) {
        let location = *core::panic::Location::caller();
        cx.foreground_executor()
            .spawn(self.log_tracked_err_with_backtrace(location))
            .detach();
    }
}

impl BackgroundExecutor {
    /// Creates a new BackgroundExecutor from the given PlatformDispatcher.
    pub fn new(dispatcher: Arc<dyn PlatformDispatcher>) -> Self {
        let scheduler: Arc<dyn Scheduler> = Arc::new(PlatformScheduler::new(dispatcher.clone()));

        Self {
            inner: crate::scheduler::BackgroundExecutor::new(scheduler),
            dispatcher,
        }
    }

    /// Creates a BackgroundExecutor backed directly by an explicit [`Scheduler`] (e.g. `TestScheduler`).
    #[cfg(any(test, feature = "harness"))]
    pub fn from_scheduler(
        scheduler: Arc<dyn Scheduler>,
        dispatcher: Arc<dyn PlatformDispatcher>,
    ) -> Self {
        Self {
            inner: crate::scheduler::BackgroundExecutor::new(scheduler),
            dispatcher,
        }
    }

    /// Returns the underlying crate::scheduler::BackgroundExecutor.
    ///
    /// This is used by Ex to pass the executor to thread/worktree code.
    pub fn scheduler_executor(&self) -> crate::scheduler::BackgroundExecutor {
        self.inner.clone()
    }

    /// Prevents App Nap-style throttling while the returned guard is held.
    ///
    /// This does not prevent the system from entering idle sleep.
    pub fn prevent_app_nap(&self, reason: &str) -> ActivityGuard {
        self.dispatcher.prevent_app_nap(reason)
    }

    /// Enqueues the given future to be run to completion on a background thread.
    #[track_caller]
    pub fn spawn<R>(&self, future: impl Future<Output = R> + Send + 'static) -> Task<R>
    where
        R: Send + 'static,
    {
        self.spawn_with_priority(Priority::default(), future.boxed())
    }

    /// Enqueues the given future to be run to completion on a background thread with the given priority.
    ///
    /// When `Priority::RealtimeAudio` is used, the task runs on a dedicated thread with
    /// realtime scheduling priority, suitable for audio processing.
    #[track_caller]
    pub fn spawn_with_priority<R>(
        &self,
        priority: Priority,
        future: impl Future<Output = R> + Send + 'static,
    ) -> Task<R>
    where
        R: Send + 'static,
    {
        if priority == Priority::RealtimeAudio {
            self.inner.spawn_realtime(future)
        } else {
            self.inner.spawn_with_priority(priority, future)
        }
    }

    /// Runs background tasks that may borrow from their environment and waits for all of them to complete.
    ///
    /// Dropping the returned future cancels its tasks and synchronously waits for their futures to
    /// be destroyed before returning.
    #[cfg(not(target_family = "wasm"))]
    pub async fn scoped<'scope, F>(&self, scheduler: F)
    where
        F: FnOnce(&mut Scope<'scope>),
    {
        let mut scope = Scope::new(self.clone(), Priority::default());
        (scheduler)(&mut scope);
        let spawned = mem::take(&mut scope.futures)
            .into_iter()
            .map(|f| self.spawn_with_priority(scope.priority, f))
            .collect::<Vec<_>>();
        for task in spawned {
            task.await;
        }
    }

    /// Runs prioritized background tasks that may borrow from their environment and waits for all
    /// of them to complete.
    ///
    /// Dropping the returned future cancels its tasks and synchronously waits for their futures to
    /// be destroyed before returning.
    #[cfg(not(target_family = "wasm"))]
    pub async fn scoped_priority<'scope, F>(&self, priority: Priority, scheduler: F)
    where
        F: FnOnce(&mut Scope<'scope>),
    {
        let mut scope = Scope::new(self.clone(), priority);
        (scheduler)(&mut scope);
        let spawned = mem::take(&mut scope.futures)
            .into_iter()
            .map(|f| self.spawn_with_priority(scope.priority, f))
            .collect::<Vec<_>>();
        for task in spawned {
            task.await;
        }
    }

    /// Get the current time.
    ///
    /// Calling this instead of `std::time::Instant::now` allows the use
    /// of fake timers in tests.
    pub fn now(&self) -> Instant {
        self.inner.scheduler().clock().now()
    }

    /// Returns a task that will complete after the given duration.
    /// Depending on other concurrent tasks the elapsed duration may be longer
    /// than requested.
    #[track_caller]
    pub fn timer(&self, duration: Duration) -> Task<()> {
        if duration.is_zero() {
            return Task::ready(());
        }
        self.spawn(self.inner.scheduler().timer(duration))
    }

    /// In tests, run tasks until the scheduler would park.
    ///
    /// Under the scheduler-backed test dispatcher, `tick()` will not advance the clock, so a pending
    /// timer can keep `has_pending_tasks()` true even after all currently-runnable tasks have been
    /// drained. To preserve the historical semantics that tests relied on (drain all work that can

    /// How many CPUs are available to the dispatcher.
    pub fn num_cpus(&self) -> usize {
        num_cpus::get()
    }

    /// Override the number of CPUs reported by this executor in tests.

    /// Whether we're on the main thread.
    pub fn is_main_thread(&self) -> bool {
        self.dispatcher.is_main_thread()
    }

    /// Whether this executor runs on the deterministic test scheduler.
    ///
    /// Available in every build. Use it, rather than `cfg(feature =
    /// "test-support")`, for behavior that must differ under tests, so that
    /// compiling `test-support` into an application doesn't change it.
    pub fn is_test(&self) -> bool {
        self.inner.is_test()
    }

    #[doc(hidden)]
    pub fn dispatcher(&self) -> &Arc<dyn PlatformDispatcher> {
        &self.dispatcher
    }
}

impl ForegroundExecutor {
    /// Creates a thread-safe handle that submits `Send` futures to this foreground executor.
    pub fn to_send(&self) -> SendForegroundExecutor {
        SendForegroundExecutor {
            inner: self.inner.to_send(),
        }
    }

    /// Creates a new ForegroundExecutor from the given PlatformDispatcher.
    pub fn new(dispatcher: Arc<dyn PlatformDispatcher>) -> Self {
        let platform_scheduler = Arc::new(PlatformScheduler::new(dispatcher.clone()));
        let inner = platform_scheduler.foreground_executor();
        Self {
            inner,
            dispatcher,
            not_send: PhantomData,
        }
    }

    /// Creates a ForegroundExecutor backed directly by an explicit [`Scheduler`] (e.g. `TestScheduler`).
    #[cfg(any(test, feature = "harness"))]
    pub fn from_scheduler(
        session_id: crate::scheduler::SessionId,
        scheduler: Arc<dyn Scheduler>,
        dispatcher: Arc<dyn PlatformDispatcher>,
    ) -> Self {
        let sched_weak = Arc::downgrade(&scheduler);
        let inner = crate::scheduler::LocalExecutor::new(session_id, scheduler, move |runnable| {
            if let Some(sched) = sched_weak.upgrade() {
                sched.schedule_local(session_id, runnable);
            }
        });
        Self {
            inner,
            dispatcher,
            not_send: PhantomData,
        }
    }

    /// Enqueues the given Task to run on the main thread.
    #[track_caller]
    pub fn spawn<R>(&self, future: impl Future<Output = R> + 'static) -> Task<R>
    where
        R: 'static,
    {
        self.inner.spawn(future.boxed_local())
    }

    /// Enqueues the given Task to run on the main thread with the given priority.
    #[track_caller]
    pub fn spawn_with_priority<R>(
        &self,
        _priority: Priority,
        future: impl Future<Output = R> + 'static,
    ) -> Task<R>
    where
        R: 'static,
    {
        // Priority is ignored for foreground tasks - they run in order on the main thread
        self.inner.spawn(future)
    }

    /// On platforms with dedicated support, enqueues the given future to run
    /// on the main thread during platform idle time. Without a `timeout`,
    /// polls may be deferred indefinitely while the platform stays busy;
    /// with one, a poll still waiting after that long runs as ordinary main-thread work.
    /// Each poll occupies part of one idle slice, so long synchronous stretches
    /// should bound themselves against [`Self::idle_time_remaining`] and yield.
    ///
    /// On platforms without dedicated support, schedules the given future to run
    /// with a low priority, ignoring `timeout`.
    #[track_caller]
    pub fn spawn_when_idle<R>(
        &self,
        timeout: Option<Duration>,
        future: impl Future<Output = R> + 'static,
    ) -> Task<R>
    where
        R: 'static,
    {
        let dispatcher = self.dispatcher.clone();
        self.inner
            .spawn_with_dispatch(future.boxed_local(), move |runnable| {
                dispatcher.dispatch_on_main_thread_when_idle(runnable, timeout);
            })
    }

    /// The time remaining in the current idle slice, when called from a task
    /// spawned via [`Self::spawn_when_idle`] on a platform that meters idle
    /// time. `None` when idle time is unmetered (or the caller is not inside
    /// an idle slice); work that must bound itself should then fall back to a
    /// budget of its own.
    pub fn idle_time_remaining(&self) -> Option<Duration> {
        self.dispatcher.idle_time_remaining()
    }

    /// Used by the test harness to run an async test in a synchronous fashion.
    #[cfg(all(not(target_family = "wasm"), any(test, feature = "harness")))]
    #[track_caller]
    pub fn block_test<R>(&self, future: impl Future<Output = R>) -> R {
        use std::cell::Cell;

        let scheduler = self.inner.scheduler();

        let output = Cell::new(None);
        let future = async {
            output.set(Some(future.await));
        };
        let mut future = std::pin::pin!(future);

        // In async GPUI tests, we must allow foreground tasks scheduled by the test itself
        // (which are associated with the test session) to make progress while we block.
        // Otherwise, awaiting futures that depend on same-session foreground work can deadlock.
        scheduler.block(None, future.as_mut(), None);

        output.take().expect("block_test future did not complete")
    }

    /// Block the current thread until the given future resolves.
    /// Consider using `block_with_timeout` instead.
    #[cfg(not(target_family = "wasm"))]
    pub fn block_on<R>(&self, future: impl Future<Output = R>) -> R {
        self.inner.block_on(future)
    }

    /// Block the current thread until the given future resolves or the timeout elapses.
    #[cfg(not(target_family = "wasm"))]
    pub fn block_with_timeout<R, Fut: Future<Output = R>>(
        &self,
        duration: Duration,
        future: Fut,
    ) -> Result<R, impl Future<Output = R> + use<R, Fut>> {
        self.inner.block_with_timeout(duration, future)
    }

    #[doc(hidden)]
    pub fn dispatcher(&self) -> &Arc<dyn PlatformDispatcher> {
        &self.dispatcher
    }

    #[doc(hidden)]
    pub fn scheduler_executor(&self) -> SchedulerLocalExecutor {
        self.inner.clone()
    }
}

/// Scope manages a set of tasks that are enqueued and waited on together. See [`BackgroundExecutor::scoped`].
#[cfg(not(target_family = "wasm"))]
pub struct Scope<'a> {
    executor: BackgroundExecutor,
    priority: Priority,
    futures: Vec<Pin<Box<dyn Future<Output = ()> + Send + 'static>>>,
    tx: Option<mpsc::Sender<()>>,
    rx: mpsc::Receiver<()>,
    lifetime: PhantomData<&'a ()>,
}

#[cfg(not(target_family = "wasm"))]
impl<'a> Scope<'a> {
    fn new(executor: BackgroundExecutor, priority: Priority) -> Self {
        let (tx, rx) = mpsc::channel(1);
        Self {
            executor,
            priority,
            tx: Some(tx),
            rx,
            futures: Default::default(),
            lifetime: PhantomData,
        }
    }

    /// How many CPUs are available to the dispatcher.
    pub fn num_cpus(&self) -> usize {
        self.executor.num_cpus()
    }

    /// Spawn a future into this scope.
    #[track_caller]
    pub fn spawn<F>(&mut self, f: F)
    where
        F: Future<Output = ()> + Send + 'a,
    {
        let tx = self.tx.clone().unwrap();

        // SAFETY: The 'a lifetime is guaranteed to outlive any of these futures because
        // dropping this `Scope` blocks until all of the futures have resolved.
        let f = unsafe {
            mem::transmute::<
                Pin<Box<dyn Future<Output = ()> + Send + 'a>>,
                Pin<Box<dyn Future<Output = ()> + Send + 'static>>,
            >(Box::pin(async move {
                f.await;
                drop(tx);
            }))
        };
        self.futures.push(f);
    }
}

#[cfg(not(target_family = "wasm"))]
impl Drop for Scope<'_> {
    fn drop(&mut self) {
        self.tx.take().unwrap();

        // Wait until the channel is closed, which means that all of the spawned
        // futures have resolved.
        let future = async {
            self.rx.next().await;
        };
        let mut future = std::pin::pin!(future);
        self.executor
            .inner
            .scheduler()
            .block(None, future.as_mut(), None);
    }
}
