use std::{collections::BTreeMap, path::Path, sync::Arc};

use napi::{
  bindgen_prelude::{FromNapiValue, ToNapiValue},
  threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use once_cell::sync::Lazy;
use parking_lot::Mutex;

static GLOBAL_WATCHER: Lazy<napi::Result<GlobalWatcher>> = Lazy::new(|| {
  let event_emitter = Arc::new(Mutex::new(EventEmitter {
    listeners: Default::default(),
    error_callbacks: Default::default(),
  }));
  let event_emitter_in_handler = event_emitter.clone();
  let watcher: RecommendedWatcher =
    notify::recommended_watcher(move |res: notify::Result<Event>| {
      event_emitter_in_handler.lock().on(res);
    })
    .map_err(anyhow::Error::from)?;
  Ok(GlobalWatcher {
    inner: Mutex::new(watcher),
    event_emitter,
  })
});

struct GlobalWatcher {
  inner: Mutex<RecommendedWatcher>,
  event_emitter: Arc<Mutex<EventEmitter>>,
}

#[napi(object)]
#[derive(Default)]
pub struct WatchOptions {
  pub recursive: Option<bool>,
}

#[napi(string_enum)]
/// Watcher kind enumeration
pub enum WatcherKind {
  /// inotify backend (linux)
  Inotify,
  /// FS-Event backend (mac)
  Fsevent,
  /// KQueue backend (bsd,optionally mac)
  Kqueue,
  /// Polling based backend (fallback)
  PollWatcher,
  /// Windows backend
  ReadDirectoryChangesWatcher,
  /// Fake watcher for testing
  NullWatcher,
  Unknown,
}

impl From<notify::WatcherKind> for WatcherKind {
  fn from(value: notify::WatcherKind) -> Self {
    match value {
      notify::WatcherKind::Inotify => WatcherKind::Inotify,
      notify::WatcherKind::Fsevent => WatcherKind::Fsevent,
      notify::WatcherKind::Kqueue => WatcherKind::Kqueue,
      notify::WatcherKind::PollWatcher => WatcherKind::PollWatcher,
      notify::WatcherKind::ReadDirectoryChangesWatcher => WatcherKind::ReadDirectoryChangesWatcher,
      notify::WatcherKind::NullWatcher => WatcherKind::NullWatcher,
      _ => WatcherKind::Unknown,
    }
  }
}

#[napi]
pub struct Subscription {
  id: uuid::Uuid,
  error_uuid: Option<uuid::Uuid>,
}

#[napi]
impl Subscription {
  #[napi]
  #[allow(clippy::inherent_to_string)]
  pub fn to_string(&self) -> String {
    self.id.to_string()
  }

  #[napi]
  pub fn unsubscribe(&mut self) -> napi::Result<()> {
    let mut event_emitter = GLOBAL_WATCHER
      .as_ref()
      .map_err(|err| err.clone())?
      .event_emitter
      .lock();
    event_emitter.listeners.remove(&self.id);
    if let Some(error_uuid) = &self.error_uuid {
      event_emitter.error_callbacks.remove(error_uuid);
    };
    Ok(())
  }
}

#[napi]
pub struct FSWatcher {
  path: String,
  recursive: RecursiveMode,
}

#[napi]
impl FSWatcher {
  #[napi(factory)]
  pub fn watch(p: String, options: Option<WatchOptions>) -> Self {
    let options = options.unwrap_or_default();
    FSWatcher {
      path: p,
      recursive: if options.recursive == Some(false) {
        RecursiveMode::NonRecursive
      } else {
        RecursiveMode::Recursive
      },
    }
  }

  #[napi]
  pub fn kind() -> WatcherKind {
    RecommendedWatcher::kind().into()
  }

  #[napi]
  pub fn to_string(&self) -> napi::Result<String> {
    Ok(format!(
      "{:?}",
      GLOBAL_WATCHER.as_ref().map_err(|err| err.clone())?.inner
    ))
  }

  #[napi]
  pub fn subscribe(
    &mut self,
    #[napi(ts_arg_type = "(event: import('./event').NotifyEvent) => void")]
    callback: ThreadsafeFunction<serde_json::Value, ErrorStrategy::Fatal>,
    #[napi(ts_arg_type = "(err: Error) => void")] error_callback: Option<ThreadsafeFunction<()>>,
  ) -> napi::Result<Subscription> {
    GLOBAL_WATCHER
      .as_ref()
      .map_err(|err| err.clone())?
      .inner
      .lock()
      .watch(Path::new(&self.path), self.recursive)
      .map_err(anyhow::Error::from)?;
    let uuid = uuid::Uuid::new_v4();
    let mut event_emitter = GLOBAL_WATCHER
      .as_ref()
      .map_err(|err| err.clone())?
      .event_emitter
      .lock();
    event_emitter
      .listeners
      .insert(uuid, (self.path.clone(), callback));
    let mut error_uuid = None;
    if let Some(error_callback) = error_callback {
      let uuid = uuid::Uuid::new_v4();
      event_emitter.error_callbacks.insert(uuid, error_callback);
      error_uuid = Some(uuid);
    }
    drop(event_emitter);
    Ok(Subscription {
      id: uuid,
      error_uuid,
    })
  }

  #[napi]
  pub fn unwatch(p: String) -> napi::Result<()> {
    let mut watcher = GLOBAL_WATCHER
      .as_ref()
      .map_err(|err| err.clone())?
      .inner
      .lock();
    watcher
      .unwatch(Path::new(&p))
      .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub fn close() -> napi::Result<()> {
    let global_watcher = GLOBAL_WATCHER.as_ref().map_err(|err| err.clone())?;
    global_watcher.event_emitter.lock().stop();
    let mut inner = global_watcher.inner.lock();
    *inner = notify::recommended_watcher(|_| {}).map_err(anyhow::Error::from)?;
    Ok(())
  }
}

#[derive(Clone)]
struct EventEmitter {
  listeners: BTreeMap<
    uuid::Uuid,
    (
      String,
      ThreadsafeFunction<serde_json::Value, ErrorStrategy::Fatal>,
    ),
  >,
  error_callbacks: BTreeMap<uuid::Uuid, ThreadsafeFunction<()>>,
}

impl EventEmitter {
  fn on(&self, event: notify::Result<Event>) {
    match event {
      Ok(e) => match serde_json::value::to_value(&e) {
        Err(err) => {
          let err: napi::Error = anyhow::Error::from(err).into();
          for on_error in self.error_callbacks.values() {
            on_error.call(Err(err.clone()), ThreadsafeFunctionCallMode::NonBlocking);
          }
        }
        Ok(v) => {
          for (path, on_event) in self.listeners.values() {
            if e.paths.iter().any(|p| p.to_str() == Some(path)) {
              on_event.call(v.clone(), ThreadsafeFunctionCallMode::NonBlocking);
            }
          }
        }
      },
      Err(err) => {
        let err: napi::Error = anyhow::Error::from(err).into();
        for on_error in self.error_callbacks.values() {
          on_error.call(Err(err.clone()), ThreadsafeFunctionCallMode::NonBlocking);
        }
      }
    }
  }

  fn stop(&mut self) {
    self.listeners.clear();
    self.error_callbacks.clear();
  }
}

#[napi]
pub async fn move_file(src: String, dst: String) -> napi::Result<()> {
  tokio::fs::rename(src, dst).await?;
  Ok(())
}
