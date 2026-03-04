use super::*;

#[derive(Debug, PartialEq)]
pub struct Batch {
  doc: Doc,
  before_state: StateVector,
  after_state: StateVector,
  changed: HashMap<YTypeRef, Vec<SmolStr>>,
}

impl Batch {
  pub fn new(doc: Doc) -> Self {
    let current_state = doc.get_state_vector();

    Batch {
      doc,
      before_state: current_state.clone(),
      after_state: current_state,
      changed: HashMap::new(),
    }
  }

  pub fn with_batch<T, F>(&mut self, f: F) -> T
  where
    F: FnOnce(Doc) -> T,
  {
    let ret = f(self.doc.clone());
    for (k, v) in self.doc.get_changed() {
      self.changed.entry(k).or_default().extend(v.iter().cloned());
    }
    ret
  }
}

pub fn batch_commit<T, F>(mut doc: Doc, f: F) -> Option<T>
where
  F: FnOnce(Doc) -> T,
{
  // Initialize batch cleanups list
  let mut batch_cleanups = vec![];

  // Initial call and result initialization
  let mut initial_call = false;

  {
    if doc.batch.is_none() {
      initial_call = true;

      // Start a new batch
      let batch = Batch::new(doc.clone());
      doc.batch = Somr::new(batch);
      batch_cleanups.push(doc.batch.clone());
    }
  }

  let batch = doc.batch.get_mut()?;
  let result = Some(batch.with_batch(f));

  if initial_call
    && let Some(current_batch) = doc.batch.get()
    && Some(current_batch) == batch_cleanups[0].get()
  {
    // Process observer calls and perform cleanup if this is the initial call
    cleanup_batches(&mut batch_cleanups);
    doc.batch.swap_take();
  }

  result
}

fn cleanup_batches(batch_cleanups: &mut Vec<Somr<Batch>>) {
  for batch in batch_cleanups.drain(..) {
    if let Some(batch) = batch.get() {
      println!("changed: {:?}", batch.changed);
    } else {
      panic!("Batch not initialized");
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn should_get_changed_items() {
    loom_model!({
      let doc = DocOptions::new().with_client_id(1).build();

      batch_commit(doc.clone(), |d| {
        let mut arr = d.get_or_create_array("arr").unwrap();
        let mut text = d.create_text().unwrap();
        let mut map = d.create_map().unwrap();

        batch_commit(doc.clone(), |_| {
          arr.insert(0, Value::from(text.clone())).unwrap();
          arr.insert(1, Value::from(map.clone())).unwrap();
        });

        batch_commit(doc.clone(), |_| {
          text.insert(0, "hello world").unwrap();
          text.remove(5, 6).unwrap();
        });

        batch_commit(doc.clone(), |_| {
          map.insert("key".into(), 123).unwrap();
        });

        batch_commit(doc.clone(), |_| {
          map.remove("key");
        });

        batch_commit(doc.clone(), |_| {
          arr.remove(0, 1).unwrap();
        });
      });
    });
  }
}
