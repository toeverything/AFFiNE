#[cfg(feature = "events")]
use publisher::DocPublisher;

use super::{
  history::StoreHistory,
  store::{ChangedTypeRefs, StoreRef},
  *,
};
use crate::sync::{Arc, RwLock};

#[cfg(feature = "debug")]
#[derive(Debug, Clone)]
pub struct DocStoreStatus {
  pub nodes: usize,
  pub delete_sets: usize,
  pub types: usize,
  pub dangling_types: usize,
  pub pending_nodes: usize,
}

/// [DocOptions] used to create a new [Doc]
///
/// ```
/// use y_octo::DocOptions;
///
/// let doc = DocOptions::new()
///     .with_client_id(1)
///     .with_guid("guid".into())
///     .auto_gc(true)
///     .build();
///
/// assert_eq!(doc.guid(), "guid")
/// ```
#[derive(Clone, Debug)]
pub struct DocOptions {
  pub guid: String,
  pub client_id: u64,
  pub gc: bool,
}

impl Default for DocOptions {
  fn default() -> Self {
    if cfg!(any(test, feature = "bench")) {
      Self {
        client_id: 1,
        guid: "test".into(),
        gc: true,
      }
    } else {
      Self {
        client_id: prefer_small_random(),
        guid: nanoid::nanoid!(),
        gc: true,
      }
    }
  }
}

impl DocOptions {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn with_client_id(mut self, client_id: u64) -> Self {
    self.client_id = client_id;
    self
  }

  pub fn with_guid(mut self, guid: String) -> Self {
    self.guid = guid;
    self
  }

  pub fn auto_gc(mut self, gc: bool) -> Self {
    self.gc = gc;
    self
  }

  pub fn build(self) -> Doc {
    Doc::with_options(self)
  }
}

impl From<DocOptions> for Any {
  fn from(value: DocOptions) -> Self {
    Any::Object(HashMap::from_iter([
      ("gc".into(), value.gc.into()),
      ("guid".into(), value.guid.into()),
    ]))
  }
}

impl TryFrom<Any> for DocOptions {
  type Error = JwstCodecError;

  fn try_from(value: Any) -> Result<Self, Self::Error> {
    match value {
      Any::Object(map) => {
        let mut options = DocOptions::default();
        for (key, value) in map {
          match key.as_str() {
            "gc" => {
              options.gc = bool::try_from(value)?;
            }
            "guid" => {
              options.guid = String::try_from(value)?;
            }
            _ => {}
          }
        }

        Ok(options)
      }
      _ => Err(JwstCodecError::UnexpectedType("Object")),
    }
  }
}

#[derive(Debug, Clone)]
pub struct Doc {
  client_id: u64,
  opts: DocOptions,

  pub(crate) store: StoreRef,
  #[cfg(feature = "events")]
  pub publisher: Arc<DocPublisher>,
  pub(crate) batch: Somr<Batch>,
}

unsafe impl Send for Doc {}
unsafe impl Sync for Doc {}

impl Default for Doc {
  fn default() -> Self {
    Doc::new()
  }
}

impl PartialEq for Doc {
  fn eq(&self, other: &Self) -> bool {
    self.client_id == other.client_id
  }
}

impl Doc {
  pub fn new() -> Self {
    Self::with_options(DocOptions::default())
  }

  pub fn with_options(options: DocOptions) -> Self {
    let store = Arc::new(RwLock::new(DocStore::with_client(options.client_id)));
    #[cfg(feature = "events")]
    let publisher = Arc::new(DocPublisher::new(store.clone()));

    Self {
      client_id: options.client_id,
      opts: options,
      store,
      #[cfg(feature = "events")]
      publisher,
      batch: Somr::none(),
    }
  }

  pub fn with_client(client_id: u64) -> Self {
    DocOptions::new().with_client_id(client_id).build()
  }

  pub fn client(&self) -> Client {
    self.client_id
  }

  pub fn set_client(&mut self, client_id: u64) {
    self.client_id = client_id;
  }

  pub fn renew_client(&mut self) {
    self.client_id = prefer_small_random();
  }

  pub fn clients(&self) -> Vec<u64> {
    self.store.read().unwrap().clients()
  }

  pub fn history(&self) -> StoreHistory {
    let history = StoreHistory::new(&self.store);
    history.resolve();
    history
  }

  #[cfg(feature = "debug")]
  pub fn store_status(&self) -> DocStoreStatus {
    let store = self.store.read().unwrap();

    DocStoreStatus {
      nodes: store.total_nodes(),
      delete_sets: store.total_delete_sets(),
      types: store.total_types(),
      dangling_types: store.total_dangling_types(),
      pending_nodes: store.total_pending_nodes(),
    }
  }

  pub(crate) fn get_changed(&self) -> ChangedTypeRefs {
    self.store.write().unwrap().get_changed()
  }

  pub fn store_compare(&self, other: &Doc) -> bool {
    let store = self.store.read().unwrap();
    let other_store = other.store.read().unwrap();

    store.deep_compare(&other_store)
  }

  pub fn options(&self) -> &DocOptions {
    &self.opts
  }

  pub fn guid(&self) -> &str {
    self.opts.guid.as_str()
  }

  // TODO:
  //   provide a better way instead of `_v1` methods
  //   when implementing `v2` binary format
  pub fn try_from_binary_v1<T: AsRef<[u8]>>(binary: T) -> JwstCodecResult<Self> {
    Self::try_from_binary_v1_with_options(binary, DocOptions::default())
  }

  pub fn try_from_binary_v1_with_options<T: AsRef<[u8]>>(binary: T, options: DocOptions) -> JwstCodecResult<Self> {
    let mut doc = Doc::with_options(options);
    doc.apply_update_from_binary_v1(binary)?;
    Ok(doc)
  }

  pub fn apply_update_from_binary_v1<T: AsRef<[u8]>>(&mut self, binary: T) -> JwstCodecResult {
    let mut decoder = RawDecoder::new(binary.as_ref());
    let update = Update::read(&mut decoder)?;
    self.apply_update(update)
  }

  pub fn apply_update(&mut self, mut update: Update) -> JwstCodecResult {
    let mut store = self.store.write().unwrap();
    let mut retry = false;

    loop {
      // clone every time to avoid ref count issue
      let pending_types = update
        .structs
        .values()
        .flatten()
        .filter_map(|n| {
          if let Node::Item(item_ref) = n
            && let Some(item) = item_ref.get()
            && let Content::Type(ty) = &item.content
          {
            Some((item.id, ty.clone()))
          } else {
            None
          }
        })
        .collect();
      for (mut s, offset) in update.iter(store.get_state_vector()) {
        if let Node::Item(item) = &mut s {
          debug_assert!(item.is_owned());
          let mut item = unsafe { item.get_mut_unchecked() };
          store.repair(&mut item, self.store.clone(), &pending_types)?;
        }
        store.integrate(s, offset, None)?;
      }

      for (client, range) in update.delete_set_iter(store.get_state_vector()) {
        store.delete_range(client, range)?;
      }

      if let Some(mut pending_update) = store.pending.take() {
        if pending_update
          .missing_state
          .iter()
          .any(|(client, clock)| *clock < store.get_state(*client))
        {
          // new update has been applied to the doc, need to re-integrate
          retry = true;
        }

        for (client, range) in pending_update.delete_set_iter(store.get_state_vector()) {
          store.delete_range(client, range)?;
        }

        if update.is_pending_empty() {
          update = pending_update;
        } else {
          // drain all pending state to pending update for later iteration
          update.drain_pending_state();
          Update::merge_into(&mut update, [pending_update]);
        }
      } else {
        // no pending update at store

        // no pending update in current iteration
        // thank god, all clean
        if update.is_pending_empty() {
          break;
        } else {
          // need to turn all pending state into update for later iteration
          update.drain_pending_state();
          retry = false;
        };
      }

      // can't integrate any more, save the pending update
      if !retry {
        if !update.is_empty() {
          store.pending.replace(update);
        }
        break;
      }
    }

    if self.opts.gc {
      store.optimize()?;
    }

    Ok(())
  }

  pub fn keys(&self) -> Vec<String> {
    let store = self.store.read().unwrap();
    store.types.keys().cloned().collect()
  }

  pub fn get_or_create_text<S: AsRef<str>>(&self, name: S) -> JwstCodecResult<Text> {
    YTypeBuilder::new(self.store.clone())
      .with_kind(YTypeKind::Text)
      .set_name(name.as_ref().to_string())
      .build()
  }

  pub fn create_text(&self) -> JwstCodecResult<Text> {
    YTypeBuilder::new(self.store.clone()).with_kind(YTypeKind::Text).build()
  }

  pub fn get_or_create_array<S: AsRef<str>>(&self, str: S) -> JwstCodecResult<Array> {
    YTypeBuilder::new(self.store.clone())
      .with_kind(YTypeKind::Array)
      .set_name(str.as_ref().to_string())
      .build()
  }

  pub fn create_array(&self) -> JwstCodecResult<Array> {
    YTypeBuilder::new(self.store.clone())
      .with_kind(YTypeKind::Array)
      .build()
  }

  pub fn get_or_create_map<S: AsRef<str>>(&self, str: S) -> JwstCodecResult<Map> {
    YTypeBuilder::new(self.store.clone())
      .with_kind(YTypeKind::Map)
      .set_name(str.as_ref().to_string())
      .build()
  }

  pub fn create_map(&self) -> JwstCodecResult<Map> {
    YTypeBuilder::new(self.store.clone()).with_kind(YTypeKind::Map).build()
  }

  pub fn get_map(&self, str: &str) -> JwstCodecResult<Map> {
    YTypeBuilder::new(self.store.clone())
      .with_kind(YTypeKind::Map)
      .set_name(str.to_string())
      .build_exists()
  }

  pub fn encode_update_v1(&self) -> JwstCodecResult<Vec<u8>> {
    self.encode_state_as_update_v1(&StateVector::default())
  }

  pub fn encode_state_as_update_v1(&self, sv: &StateVector) -> JwstCodecResult<Vec<u8>> {
    let update = self.encode_state_as_update(sv)?;

    let mut encoder = RawEncoder::default();
    update.write(&mut encoder)?;
    Ok(encoder.into_inner())
  }

  pub fn encode_update(&self) -> JwstCodecResult<Update> {
    self.encode_state_as_update(&StateVector::default())
  }

  pub fn encode_state_as_update(&self, sv: &StateVector) -> JwstCodecResult<Update> {
    self.store.read().unwrap().diff_state_vector(sv, true)
  }

  pub fn get_state_vector(&self) -> StateVector {
    self.store.read().unwrap().get_state_vector()
  }

  pub fn get_delete_sets(&self) -> DeleteSet {
    self.store.read().unwrap().get_delete_sets()
  }

  #[cfg(feature = "events")]
  pub fn subscribe(&self, cb: impl Fn(&[u8], &[History]) + Sync + Send + 'static) {
    self.publisher.subscribe(cb);
  }

  #[cfg(feature = "events")]
  pub fn unsubscribe_all(&self) {
    self.publisher.unsubscribe_all();
  }

  #[cfg(feature = "events")]
  pub fn subscribe_count(&self) -> usize {
    self.publisher.count()
  }

  #[cfg(feature = "events")]
  pub fn subscriber_count(&self) -> usize {
    Arc::<DocPublisher>::strong_count(&self.publisher)
  }

  pub fn gc(&self) -> JwstCodecResult<()> {
    self.store.write().unwrap().optimize()
  }
}

#[cfg(test)]
mod tests {
  use yrs::{Array, Map, Options, Transact, types::ToJson, updates::decoder::Decode};

  use super::*;

  #[test]
  fn test_encode_state_as_update() {
    let yrs_options_left = Options::default();
    let yrs_options_right = Options::default();

    loom_model!({
      let (binary, binary_new) = if cfg!(miri) {
        let doc = Doc::new();

        let mut map = doc.get_or_create_map("abc").unwrap();
        map.insert("a".to_string(), 1).unwrap();
        let binary = doc.encode_update_v1().unwrap();

        let doc_new = Doc::new();
        let mut array = doc_new.get_or_create_array("array").unwrap();
        array.insert(0, "array_value").unwrap();
        let binary_new = doc.encode_update_v1().unwrap();

        (binary, binary_new)
      } else {
        let yrs_doc = yrs::Doc::with_options(yrs_options_left.clone());

        let map = yrs_doc.get_or_insert_map("abc");
        let mut trx = yrs_doc.transact_mut();
        map.insert(&mut trx, "a", 1);
        let binary = trx.encode_update_v1();

        let yrs_doc_new = yrs::Doc::with_options(yrs_options_right.clone());
        let array = yrs_doc_new.get_or_insert_array("array");
        let mut trx = yrs_doc_new.transact_mut();
        array.insert(&mut trx, 0, "array_value");
        let binary_new = trx.encode_update_v1();

        (binary, binary_new)
      };

      let mut doc = Doc::try_from_binary_v1(binary).unwrap();
      let mut doc_new = Doc::try_from_binary_v1(binary_new).unwrap();

      let diff_update = doc_new.encode_state_as_update_v1(&doc.get_state_vector()).unwrap();

      let diff_update_reverse = doc.encode_state_as_update_v1(&doc_new.get_state_vector()).unwrap();

      doc.apply_update_from_binary_v1(diff_update).unwrap();
      doc_new.apply_update_from_binary_v1(diff_update_reverse).unwrap();

      assert_eq!(doc.encode_update_v1().unwrap(), doc_new.encode_update_v1().unwrap());
    });
  }

  #[test]
  #[cfg_attr(any(miri, loom), ignore)]
  fn test_array_create() {
    let yrs_options = yrs::Options::default();

    let json = serde_json::json!([42.0, -42.0, true, false, "hello", "world", [1.0]]);

    {
      let doc = yrs::Doc::with_options(yrs_options.clone());
      let array = doc.get_or_insert_array("abc");
      let mut trx = doc.transact_mut();
      array.insert(&mut trx, 0, 42);
      array.insert(&mut trx, 1, -42);
      array.insert(&mut trx, 2, true);
      array.insert(&mut trx, 3, false);
      array.insert(&mut trx, 4, "hello");
      array.insert(&mut trx, 5, "world");

      let sub_array = yrs::ArrayPrelim::default();
      let sub_array = array.insert(&mut trx, 6, sub_array);
      sub_array.insert(&mut trx, 0, 1);

      drop(trx);
      let config = assert_json_diff::Config::new(assert_json_diff::CompareMode::Strict)
        .numeric_mode(assert_json_diff::NumericMode::AssumeFloat);
      assert_json_diff::assert_json_matches!(array.to_json(&doc.transact()), json, config);
    };

    {
      let binary = {
        let doc = Doc::new();
        let mut array = doc.get_or_create_array("abc").unwrap();
        array.insert(0, 42).unwrap();
        array.insert(1, -42).unwrap();
        array.insert(2, true).unwrap();
        array.insert(3, false).unwrap();
        array.insert(4, "hello").unwrap();
        array.insert(5, "world").unwrap();

        let mut sub_array = doc.create_array().unwrap();
        array.insert(6, sub_array.clone()).unwrap();
        // FIXME: array need insert first to compatible with yrs
        sub_array.insert(0, 1).unwrap();

        doc.encode_update_v1().unwrap()
      };

      let ydoc = yrs::Doc::with_options(yrs_options);
      let array = ydoc.get_or_insert_array("abc");
      let mut trx = ydoc.transact_mut();
      trx.apply_update(yrs::Update::decode_v1(&binary).unwrap()).unwrap();

      let config = assert_json_diff::Config::new(assert_json_diff::CompareMode::Strict)
        .numeric_mode(assert_json_diff::NumericMode::AssumeFloat);
      assert_json_diff::assert_json_matches!(array.to_json(&trx), json, config);

      let mut doc = Doc::new();
      let array = doc.get_or_create_array("abc").unwrap();
      doc.apply_update_from_binary_v1(binary).unwrap();

      let list = array.iter().collect::<Vec<_>>();

      assert!(list.len() == 7);
      assert!(matches!(list[6], Value::Array(_)));
    }

    {
      let binary_detached = {
        let doc = Doc::new();
        let mut array = doc.get_or_create_array("abc").unwrap();
        array.insert(0, 42).unwrap();
        array.insert(1, -42).unwrap();
        array.insert(2, true).unwrap();
        array.insert(3, false).unwrap();
        array.insert(4, "hello").unwrap();
        array.insert(5, "world").unwrap();

        let mut sub_array = doc.create_array().unwrap();
        sub_array.insert(0, 1).unwrap();
        array.insert(6, sub_array.clone()).unwrap();

        doc.encode_update_v1().unwrap()
      };

      let detached_doc = Doc::try_from_binary_v1(binary_detached).unwrap();
      let detached_array = detached_doc.get_or_create_array("abc").unwrap();
      let detached_sub_array = match detached_array.get(6).unwrap() {
        Value::Array(arr) => arr,
        _ => panic!("expected array at index 6"),
      };
      assert_eq!(detached_sub_array.get(0).unwrap(), Value::Any(1.0.into()));
    }
  }

  #[test]
  #[cfg(feature = "events")]
  #[ignore = "inaccurate timing on ci, need for more accurate timing testing"]
  fn test_subscribe() {
    use crate::sync::{AtomicU8, Ordering};

    loom_model!({
      let doc = Doc::default();
      let doc_clone = doc.clone();

      let count = Arc::new(AtomicU8::new(0));
      let count_clone1 = count.clone();
      let count_clone2 = count.clone();
      doc.subscribe(move |_, _| {
        count_clone1.fetch_add(1, Ordering::SeqCst);
      });

      doc_clone.subscribe(move |_, _| {
        count_clone2.fetch_add(1, Ordering::SeqCst);
      });

      doc_clone.get_or_create_array("abc").unwrap().insert(0, 42).unwrap();

      // wait observer, cycle once every 100mm
      std::thread::sleep(std::time::Duration::from_millis(200));

      assert_eq!(count.load(Ordering::SeqCst), 2);
    });
  }

  #[test]
  fn test_repeated_applied_pending_update() {
    // generate a pending update
    // update: [1, 1, 1, 0, 39, 1, 4, 116, 101, 115, 116, 3, 109, 97, 112, 1, 0]
    // update: [1, 1, 1, 1, 40, 0, 1, 0, 11, 115, 117, 98, 95, 109, 97, 112, 95,
    // 107, 101, 121, 1, 119, 13, 115, 117, 98, 95, 109, 97, 112, 95, 118, 97, 108,
    // 117, 101, 0]
    // {
    //     let doc1 = Doc::default();

    //     doc1.subscribe(|update| {
    //         println!("update: {:?}", update);
    //     });

    //     let mut map = doc1.get_or_create_map("test").unwrap();
    //     std::thread::sleep(std::time::Duration::from_millis(500));

    //     let mut sub_map = doc1.create_map().unwrap();
    //     map.insert("map", sub_map.clone()).unwrap();
    //     std::thread::sleep(std::time::Duration::from_millis(500));

    //     sub_map.insert("sub_map_key", "sub_map_value").unwrap();
    //     std::thread::sleep(std::time::Duration::from_millis(500));
    // }

    loom_model!({
      let mut doc = Doc::default();

      doc
        .apply_update_from_binary_v1(vec![
          1, 1, 1, 1, 40, 0, 1, 0, 11, 115, 117, 98, 95, 109, 97, 112, 95, 107, 101, 121, 1, 119, 13, 115, 117, 98, 95,
          109, 97, 112, 95, 118, 97, 108, 117, 101, 0,
        ])
        .unwrap();

      let pending_size = doc
        .store
        .read()
        .unwrap()
        .pending
        .as_ref()
        .unwrap()
        .structs
        .iter()
        .map(|s| s.1.len())
        .sum::<usize>();
      doc
        .apply_update_from_binary_v1(vec![
          1, 1, 1, 1, 40, 0, 1, 0, 11, 115, 117, 98, 95, 109, 97, 112, 95, 107, 101, 121, 1, 119, 13, 115, 117, 98, 95,
          109, 97, 112, 95, 118, 97, 108, 117, 101, 0,
        ])
        .unwrap();

      // pending nodes should not grow up after apply same pending update
      assert_eq!(
        pending_size,
        doc
          .store
          .read()
          .unwrap()
          .pending
          .as_ref()
          .unwrap()
          .structs
          .iter()
          .map(|s| s.1.len())
          .sum::<usize>()
      );
    });
  }

  #[test]
  fn test_update_from_vec_ref() {
    loom_model!({
      let doc = Doc::new();

      let mut text = doc.get_or_create_text("text").unwrap();
      text.insert(0, "hello world").unwrap();

      let mut root = doc.get_or_create_map("root").unwrap();
      let mut child = doc.create_map().unwrap();
      child.insert("k".to_string(), "v").unwrap();
      root.insert("child".to_string(), child.clone()).unwrap();

      let update = doc.encode_update_v1().unwrap();

      let doc = Doc::try_from_binary_v1(update).unwrap();
      let text = doc.get_or_create_text("text").unwrap();

      assert_eq!(&text.to_string(), "hello world");

      let root = doc.get_or_create_map("root").unwrap();
      if let Some(Value::Map(child)) = root.get("child") {
        assert!(
          matches!(child.get("k"), Some(Value::Any(Any::String(s))) if s == "v"),
          "expected nested map value to survive apply_update"
        );
      } else {
        panic!("expected nested map to survive apply_update");
      }
    });
  }

  #[test]
  #[cfg_attr(any(miri, loom), ignore)]
  fn test_apply_update() {
    let updates = [
      include_bytes!("../fixtures/basic.bin").to_vec(),
      include_bytes!("../fixtures/database.bin").to_vec(),
      include_bytes!("../fixtures/large.bin").to_vec(),
      include_bytes!("../fixtures/with-subdoc.bin").to_vec(),
      include_bytes!("../fixtures/edge-case-left-right-same-node.bin").to_vec(),
    ];

    for update in updates {
      let mut doc = Doc::new();
      doc.apply_update_from_binary_v1(&update).unwrap();
    }
  }
}
