use std::{collections::HashMap, path::Path, sync::Arc};

use napi::{
  bindgen_prelude::{FromNapiValue, ToNapiValue},
  threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;

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
  event_emitter: Arc<Mutex<EventEmitter>>,
}

#[napi]
impl Subscription {
  #[napi]
  #[allow(clippy::inherent_to_string)]
  pub fn to_string(&self) -> String {
    self.id.to_string()
  }

  #[napi]
  pub fn unsubscribe(&mut self) {
    let mut event_emitter = self.event_emitter.lock();
    event_emitter.listeners.remove(&self.id);
    if let Some(error_uuid) = &self.error_uuid {
      event_emitter.error_callbacks.remove(error_uuid);
    }
  }
}

#[napi]
pub fn watch(p: String, options: Option<WatchOptions>) -> Result<FSWatcher, anyhow::Error> {
  let event_emitter = Arc::new(Mutex::new(EventEmitter {
    listeners: Default::default(),
    error_callbacks: Default::default(),
  }));
  let event_emitter_in_handler = event_emitter.clone();
  let mut watcher: RecommendedWatcher =
    notify::recommended_watcher(move |res: notify::Result<Event>| {
      event_emitter_in_handler.lock().on(res);
    })
    .map_err(anyhow::Error::from)?;

  let options = options.unwrap_or_default();
  watcher
    .watch(
      Path::new(&p),
      if options.recursive == Some(false) {
        RecursiveMode::NonRecursive
      } else {
        RecursiveMode::Recursive
      },
    )
    .map_err(anyhow::Error::from)?;
  Ok(FSWatcher {
    inner: watcher,
    event_emitter,
  })
}

#[napi]
pub struct FSWatcher {
  inner: RecommendedWatcher,
  event_emitter: Arc<Mutex<EventEmitter>>,
}

#[napi]
impl FSWatcher {
  #[napi(getter)]
  pub fn kind(&self) -> WatcherKind {
    RecommendedWatcher::kind().into()
  }

  #[napi]
  pub fn to_string(&self) -> napi::Result<String> {
    Ok(format!("{:?}", self.inner))
  }

  #[napi]
  pub fn subscribe(
    &mut self,
    #[napi(ts_arg_type = "(event: import('./event').NotifyEvent) => void")]
    callback: ThreadsafeFunction<serde_json::Value, ErrorStrategy::Fatal>,
    #[napi(ts_arg_type = "(err: Error) => void")] error_callback: Option<ThreadsafeFunction<()>>,
  ) -> Subscription {
    let uuid = uuid::Uuid::new_v4();
    let mut event_emitter = self.event_emitter.lock();
    event_emitter.listeners.insert(uuid, callback);
    let mut error_uuid = None;
    if let Some(error_callback) = error_callback {
      let uuid = uuid::Uuid::new_v4();
      event_emitter.error_callbacks.insert(uuid, error_callback);
      error_uuid = Some(uuid);
    }
    drop(event_emitter);
    Subscription {
      id: uuid,
      error_uuid,
      event_emitter: self.event_emitter.clone(),
    }
  }

  #[napi]
  pub fn close(&mut self) -> napi::Result<()> {
    // drop the previous watcher
    self.inner = notify::recommended_watcher(|_| {}).map_err(anyhow::Error::from)?;
    self.event_emitter.lock().stop();
    Ok(())
  }
}

#[derive(Clone)]
struct EventEmitter {
  listeners: HashMap<uuid::Uuid, ThreadsafeFunction<serde_json::Value, ErrorStrategy::Fatal>>,
  error_callbacks: HashMap<uuid::Uuid, ThreadsafeFunction<()>>,
}

impl EventEmitter {
  fn on(&self, event: notify::Result<Event>) {
    match event {
      Ok(e) => match serde_json::value::to_value(e) {
        Err(err) => {
          let err: napi::Error = anyhow::Error::from(err).into();
          for on_error in self.error_callbacks.values() {
            on_error.call(Err(err.clone()), ThreadsafeFunctionCallMode::NonBlocking);
          }
        }
        Ok(v) => {
          for on_event in self.listeners.values() {
            on_event.call(v.clone(), ThreadsafeFunctionCallMode::NonBlocking);
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
