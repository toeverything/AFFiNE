use std::{cmp::max, collections::hash_map::Entry};

use super::*;
use crate::sync::Arc;

pub type AwarenessCallback = Arc<dyn Fn(&Awareness, AwarenessEvent) + Send + Sync + 'static>;

pub struct Awareness {
  awareness: AwarenessStates,
  callback: Option<AwarenessCallback>,
  local_id: u64,
}

impl Awareness {
  pub fn new(local_id: u64) -> Self {
    Self {
      awareness: AwarenessStates::new(),
      callback: None,
      local_id,
    }
  }

  pub fn local_id(&self) -> u64 {
    self.local_id
  }

  pub fn on_update(&mut self, f: impl Fn(&Awareness, AwarenessEvent) + Send + Sync + 'static) {
    self.callback = Some(Arc::new(f));
  }

  pub fn get_states(&self) -> &AwarenessStates {
    &self.awareness
  }

  pub fn get_local_state(&self) -> Option<String> {
    self.awareness.get(&self.local_id).map(|state| state.content.clone())
  }

  fn mut_local_state(&mut self) -> &mut AwarenessState {
    self.awareness.entry(self.local_id).or_default()
  }

  pub fn set_local_state(&mut self, content: String) {
    self.mut_local_state().set_content(content);
    if let Some(cb) = self.callback.as_ref() {
      cb(self, AwarenessEventBuilder::new().update(self.local_id).build());
    }
  }

  pub fn clear_local_state(&mut self) {
    self.mut_local_state().delete();
    if let Some(cb) = self.callback.as_ref() {
      cb(self, AwarenessEventBuilder::new().remove(self.local_id).build());
    }
  }

  pub fn apply_update(&mut self, update: AwarenessStates) {
    let mut event = AwarenessEventBuilder::new();

    for (client_id, state) in update {
      match self.awareness.entry(client_id) {
        Entry::Occupied(mut entry) => {
          let prev_state = entry.get_mut();
          if client_id == self.local_id {
            // ignore remote update about local client and
            // add clock to overwrite remote data
            prev_state.set_clock(max(prev_state.clock, state.clock) + 1);
            event.update(client_id);
            continue;
          }

          if prev_state.clock < state.clock {
            if state.is_deleted() {
              prev_state.delete();
              event.remove(client_id);
            } else {
              *prev_state = state;
              event.update(client_id);
            }
          }
        }
        Entry::Vacant(entry) => {
          entry.insert(state);
          event.add(client_id);
        }
      }
    }

    if let Some(cb) = self.callback.as_ref() {
      cb(self, event.build());
    }
  }
}

pub struct AwarenessEvent {
  added: Vec<u64>,
  updated: Vec<u64>,
  removed: Vec<u64>,
}

impl AwarenessEvent {
  pub fn get_updated(&self, states: &AwarenessStates) -> AwarenessStates {
    states
      .iter()
      .filter(|(id, _)| self.added.contains(id) || self.updated.contains(id) || self.removed.contains(id))
      .map(|(id, state)| (*id, state.clone()))
      .collect()
  }
}

struct AwarenessEventBuilder {
  added: Vec<u64>,
  updated: Vec<u64>,
  removed: Vec<u64>,
}

impl AwarenessEventBuilder {
  fn new() -> Self {
    Self {
      added: Vec::new(),
      updated: Vec::new(),
      removed: Vec::new(),
    }
  }

  fn add(&mut self, client_id: u64) -> &mut Self {
    self.added.push(client_id);
    self
  }

  fn update(&mut self, client_id: u64) -> &mut Self {
    self.updated.push(client_id);
    self
  }

  fn remove(&mut self, client_id: u64) -> &mut Self {
    self.removed.push(client_id);
    self
  }

  fn build(&mut self) -> AwarenessEvent {
    AwarenessEvent {
      added: self.added.clone(),
      updated: self.updated.clone(),
      removed: self.removed.clone(),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::sync::{Mutex, MutexGuard};

  #[test]
  fn test_awareness() {
    loom_model!({
      let mut awareness = Awareness::new(0);

      {
        // init state
        assert_eq!(awareness.local_id, 0);
        assert_eq!(awareness.awareness.len(), 0);
      }

      {
        // local state
        awareness.set_local_state("test".to_string());
        assert_eq!(awareness.get_local_state(), Some("test".to_string()));
        awareness.clear_local_state();
        assert_eq!(awareness.get_local_state(), Some("null".to_string()));
      }

      {
        // apply remote update
        let mut states = AwarenessStates::new();
        states.insert(0, AwarenessState::new(2, "test0".to_string()));
        states.insert(1, AwarenessState::new(2, "test1".to_string()));
        awareness.apply_update(states);
        assert!(awareness.get_states().contains_key(&1));

        // local state will not apply
        assert_eq!(awareness.get_states().get(&0).unwrap().content, "null".to_string());
        assert_eq!(awareness.get_states().get(&1).unwrap().content, "test1".to_string());
      }

      {
        // callback
        let values: Arc<Mutex<Vec<AwarenessEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let callback_values = Arc::clone(&values);
        awareness.on_update(move |_, event| {
          let mut values = callback_values.lock().unwrap();
          values.push(event);
        });

        let mut new_states = AwarenessStates::new();
        // exists in local awareness: update
        new_states.insert(1, AwarenessState::new(3, "test update".to_string()));
        // not exists in local awareness: add
        new_states.insert(2, AwarenessState::new(1, "test update".to_string()));
        // not exists in local awareness: add
        new_states.insert(3, AwarenessState::new(1, "null".to_string()));
        // not exists in local awareness: add
        new_states.insert(4, AwarenessState::new(1, "test update".to_string()));
        awareness.apply_update(new_states);

        let mut new_states = AwarenessStates::new();
        // exists in local awareness: delete
        new_states.insert(4, AwarenessState::new(2, "null".to_string()));
        awareness.apply_update(new_states);

        awareness.set_local_state("test".to_string());
        awareness.clear_local_state();

        let values: MutexGuard<Vec<AwarenessEvent>> = values.lock().unwrap();
        assert_eq!(values.len(), 4);
        let event = values.first().unwrap();

        let mut added = event.added.clone();
        added.sort();
        assert_eq!(added, [2, 3, 4]);
        assert_eq!(event.updated, [1]);

        assert_eq!(
          event.get_updated(awareness.get_states()).get(&1).unwrap(),
          &AwarenessState::new(3, "test update".to_string())
        );

        let event = values.get(1).unwrap();
        assert_eq!(event.removed, [4]);

        let event = values.get(2).unwrap();
        assert_eq!(event.updated, [0]);

        let event = values.get(3).unwrap();
        assert_eq!(event.removed, [0]);
      }
    });
  }
}
