use std::fmt::Display;

use super::list::ListType;
use crate::{impl_type, Content, JwstCodecResult};

impl_type!(Text);

impl ListType for Text {}

impl Text {
  #[inline]
  pub fn len(&self) -> u64 {
    self.content_len()
  }

  #[inline]
  pub fn is_empty(&self) -> bool {
    self.len() == 0
  }

  #[inline]
  pub fn insert<T: ToString>(&mut self, char_index: u64, str: T) -> JwstCodecResult {
    self.insert_at(char_index, Content::String(str.to_string()))
  }

  #[inline]
  pub fn remove(&mut self, char_index: u64, len: u64) -> JwstCodecResult {
    self.remove_at(char_index, len)
  }
}

impl Display for Text {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    self.iter_item().try_for_each(|item| {
      if let Content::String(str) = &item.get().unwrap().content {
        write!(f, "{}", str)
      } else {
        Ok(())
      }
    })
  }
}

impl serde::Serialize for Text {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    serializer.serialize_str(&self.to_string())
  }
}

#[cfg(test)]
mod tests {
  use rand::{Rng, SeedableRng};
  use rand_chacha::ChaCha20Rng;
  use yrs::{Options, Text, Transact};

  #[cfg(not(loom))]
  use crate::sync::{Arc, AtomicUsize, Ordering};
  use crate::{loom_model, sync::thread, Doc};

  #[test]
  fn test_manipulate_text() {
    loom_model!({
      let doc = Doc::new();
      let mut text = doc.create_text().unwrap();

      text.insert(0, "llo").unwrap();
      text.insert(0, "he").unwrap();
      text.insert(5, " world").unwrap();
      text.insert(6, "great ").unwrap();
      text.insert(17, '!').unwrap();

      assert_eq!(text.to_string(), "hello great world!");
      assert_eq!(text.len(), 18);

      text.remove(4, 4).unwrap();
      assert_eq!(text.to_string(), "helleat world!");
      assert_eq!(text.len(), 14);
    });
  }

  #[test]
  #[cfg(not(loom))]
  fn test_parallel_insert_text() {
    let seed = rand::rng().random();
    let rand = ChaCha20Rng::seed_from_u64(seed);
    let mut handles = Vec::new();

    let doc = Doc::with_client(1);
    let mut text = doc.get_or_create_text("test").unwrap();
    text.insert(0, "This is a string with length 32.").unwrap();

    let added_len = Arc::new(AtomicUsize::new(32));

    // parallel editing text
    {
      for i in 0..2 {
        let mut text = text.clone();
        let mut rand = rand.clone();
        let len = added_len.clone();

        handles.push(thread::spawn(move || {
          for j in 0..10 {
            let pos = rand.random_range(0..text.len());
            let string = format!("hello {}", i * j);

            text.insert(pos, &string).unwrap();

            len.fetch_add(string.len(), Ordering::SeqCst);
          }
        }));
      }
    }

    // parallel editing doc
    {
      for i in 0..2 {
        let doc = doc.clone();
        let mut rand = rand.clone();
        let len = added_len.clone();

        handles.push(thread::spawn(move || {
          let mut text = doc.get_or_create_text("test").unwrap();
          for j in 0..10 {
            let pos = rand.random_range(0..text.len());
            let string = format!("hello doc{}", i * j);

            text.insert(pos, &string).unwrap();

            len.fetch_add(string.len(), Ordering::SeqCst);
          }
        }));
      }
    }

    for handle in handles {
      handle.join().unwrap();
    }

    assert_eq!(text.to_string().len(), added_len.load(Ordering::SeqCst));
    assert_eq!(text.len(), added_len.load(Ordering::SeqCst) as u64);
  }

  #[cfg(not(loom))]
  fn parallel_ins_del_text(seed: u64, thread: i32, iteration: i32) {
    let doc = Doc::with_client(1);
    let rand = ChaCha20Rng::seed_from_u64(seed);
    let mut text = doc.get_or_create_text("test").unwrap();
    text.insert(0, "This is a string with length 32.").unwrap();

    let mut handles = Vec::new();
    let len = Arc::new(AtomicUsize::new(32));

    for i in 0..thread {
      let len = len.clone();
      let mut rand = rand.clone();
      let text = text.clone();
      handles.push(thread::spawn(move || {
        for j in 0..iteration {
          let len = len.clone();
          let mut text = text.clone();
          let ins = i % 2 == 0;
          let pos = rand.random_range(0..16);

          if ins {
            let str = format!("hello {}", i * j);
            text.insert(pos, &str).unwrap();

            len.fetch_add(str.len(), Ordering::SeqCst);
          } else {
            text.remove(pos, 6).unwrap();

            len.fetch_sub(6, Ordering::SeqCst);
          }
        }
      }));
    }

    for handle in handles {
      handle.join().unwrap();
    }

    assert_eq!(text.to_string().len(), len.load(Ordering::SeqCst));
    assert_eq!(text.len(), len.load(Ordering::SeqCst) as u64);
  }

  #[test]
  #[cfg(not(loom))]
  fn test_parallel_ins_del_text() {
    // cases that ever broken
    // wrong left/right ref
    parallel_ins_del_text(973078538, 2, 2);
    parallel_ins_del_text(18414938500869652479, 2, 2);
  }

  #[test]
  fn loom_parallel_ins_del_text() {
    let seed = rand::rng().random();
    let mut rand = ChaCha20Rng::seed_from_u64(seed);
    let ranges = (0..20)
      .map(|_| rand.random_range(0..16))
      .collect::<Vec<_>>();

    loom_model!({
      let doc = Doc::new();
      let mut text = doc.get_or_create_text("test").unwrap();
      text.insert(0, "This is a string with length 32.").unwrap();

      // enough for loom
      let handles = (0..2)
        .map(|i| {
          let text = text.clone();
          let ranges = ranges.clone();
          thread::spawn(move || {
            let mut text = text.clone();
            let ins = i % 2 == 0;
            let pos = ranges[i];

            if ins {
              let str = format!("hello {}", i);
              text.insert(pos, &str).unwrap();
            } else {
              text.remove(pos, 6).unwrap();
            }
          })
        })
        .collect::<Vec<_>>();

      for handle in handles {
        handle.join().unwrap();
      }
    });
  }

  #[test]
  #[cfg_attr(miri, ignore)]
  fn test_recover_from_yjs_encoder() {
    let yrs_options = Options {
      client_id: rand::random(),
      guid: nanoid::nanoid!().into(),
      ..Default::default()
    };

    loom_model!({
      let binary = {
        let doc = yrs::Doc::with_options(yrs_options.clone());
        let text = doc.get_or_insert_text("greating");
        let mut trx = doc.transact_mut();
        text.insert(&mut trx, 0, "hello");
        text.insert(&mut trx, 5, " world!");
        text.remove_range(&mut trx, 11, 1);

        trx.encode_update_v1()
      };
      // in loom loop
      #[allow(clippy::needless_borrow)]
      let doc = Doc::try_from_binary_v1(&binary).unwrap();
      let mut text = doc.get_or_create_text("greating").unwrap();

      assert_eq!(text.to_string(), "hello world");

      text.insert(6, "great ").unwrap();
      text.insert(17, '!').unwrap();
      assert_eq!(text.to_string(), "hello great world!");
    });
  }

  #[test]
  fn test_recover_from_octobase_encoder() {
    loom_model!({
      let binary = {
        let doc = Doc::new();
        let mut text = doc.get_or_create_text("greating").unwrap();
        text.insert(0, "hello").unwrap();
        text.insert(5, " world!").unwrap();
        text.remove(11, 1).unwrap();

        doc.encode_update_v1().unwrap()
      };

      let doc = Doc::try_from_binary_v1(binary).unwrap();
      let mut text = doc.get_or_create_text("greating").unwrap();

      assert_eq!(text.to_string(), "hello world");

      text.insert(6, "great ").unwrap();
      text.insert(17, '!').unwrap();
      assert_eq!(text.to_string(), "hello great world!");
    });
  }
}
