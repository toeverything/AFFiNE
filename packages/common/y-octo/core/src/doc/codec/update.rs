use std::{collections::VecDeque, ops::Range};

use super::*;
use crate::doc::StateVector;

#[derive(Debug, Default, Clone)]
pub struct Update {
  pub(crate) structs: ClientMap<VecDeque<Node>>,
  pub(crate) delete_set: DeleteSet,

  /// all unapplicable items that we can't integrate into doc
  /// any item with inconsistent id clock or missing dependency will be put
  /// here
  pub(crate) pending_structs: ClientMap<VecDeque<Node>>,
  /// missing state vector after applying updates
  pub(crate) missing_state: StateVector,
  /// all unapplicable delete set
  pub(crate) pending_delete_set: DeleteSet,
}

impl<R: CrdtReader> CrdtRead<R> for Update {
  fn read(decoder: &mut R) -> JwstCodecResult<Self> {
    let num_of_clients = decoder.read_var_u64()? as usize;

    // See: [HASHMAP_SAFE_CAPACITY]
    let mut map = ClientMap::with_capacity(num_of_clients.min(HASHMAP_SAFE_CAPACITY));
    for _ in 0..num_of_clients {
      let num_of_structs = decoder.read_var_u64()? as usize;
      let client = decoder.read_var_u64()?;
      let mut clock = decoder.read_var_u64()?;

      // same reason as above
      let mut structs = VecDeque::with_capacity(num_of_structs.min(HASHMAP_SAFE_CAPACITY));

      for _ in 0..num_of_structs {
        let struct_info = Node::read(decoder, Id::new(client, clock))?;
        clock += struct_info.len();
        structs.push_back(struct_info);
      }

      structs.shrink_to_fit();
      map.insert(client, structs);
    }

    map.shrink_to_fit();

    let delete_set = DeleteSet::read(decoder)?;

    if !decoder.is_empty() {
      return Err(JwstCodecError::UpdateNotFullyConsumed(decoder.len() as usize));
    }

    Ok(Update {
      structs: map,
      delete_set,
      ..Update::default()
    })
  }
}

impl<W: CrdtWriter> CrdtWrite<W> for Update {
  fn write(&self, encoder: &mut W) -> JwstCodecResult {
    encoder.write_var_u64(self.structs.len() as u64)?;

    let mut clients = self.structs.keys().copied().collect::<Vec<_>>();

    // Descending
    clients.sort_by(|a, b| b.cmp(a));

    for client in clients {
      let structs = self.structs.get(&client).unwrap();

      encoder.write_var_u64(structs.len() as u64)?;
      encoder.write_var_u64(client)?;
      encoder.write_var_u64(structs.front().map(|s| s.clock()).unwrap_or(0))?;

      for struct_info in structs {
        struct_info.write(encoder)?;
      }
    }

    self.delete_set.write(encoder)?;

    Ok(())
  }
}

impl Update {
  // decode from ydoc v1
  pub fn decode_v1<T: AsRef<[u8]>>(buffer: T) -> JwstCodecResult<Update> {
    Update::read(&mut RawDecoder::new(buffer.as_ref()))
  }

  pub fn encode_v1(&self) -> JwstCodecResult<Vec<u8>> {
    let mut encoder = RawEncoder::default();
    self.write(&mut encoder)?;
    Ok(encoder.into_inner())
  }

  pub(crate) fn iter(&mut self, state: StateVector) -> UpdateIterator<'_> {
    UpdateIterator::new(self, state)
  }

  pub fn delete_set_iter(&mut self, state: StateVector) -> DeleteSetIterator<'_> {
    DeleteSetIterator::new(self, state)
  }

  // take all pending structs and delete set to [self] update struct
  pub fn drain_pending_state(&mut self) {
    debug_assert!(self.is_empty());

    std::mem::swap(&mut self.pending_structs, &mut self.structs);
    std::mem::swap(&mut self.pending_delete_set, &mut self.delete_set);
  }

  pub fn merge<I: IntoIterator<Item = Update>>(updates: I) -> Update {
    let mut merged = Update::default();

    Self::merge_into(&mut merged, updates);

    merged
  }

  pub fn merge_into<I: IntoIterator<Item = Update>>(target: &mut Update, updates: I) {
    for update in updates {
      target.delete_set.merge(&update.delete_set);

      for (client, structs) in update.structs {
        let iter = structs.into_iter().filter(|p| !p.is_skip());
        if let Some(merged_structs) = target.structs.get_mut(&client) {
          merged_structs.extend(iter);
        } else {
          target.structs.insert(client, iter.collect());
        }
      }
    }

    for structs in target.structs.values_mut() {
      structs.make_contiguous().sort_by_key(|s| s.id().clock);

      // insert [Node::Skip] if structs[index].id().clock + structs[index].len() <
      // structs[index + 1].id().clock
      let mut index = 0;
      let mut merged_index = vec![];
      while index < structs.len() - 1 {
        let cur = &structs[index];
        let next = &structs[index + 1];

        let clock_end = cur.id().clock + cur.len();
        let next_clock = next.id().clock;

        if next_clock > clock_end {
          structs.insert(
            index + 1,
            Node::new_skip((cur.id().client, clock_end).into(), next_clock - clock_end),
          );
          index += 1;
        } else if cur.id().clock == next_clock {
          if cur.deleted() == next.deleted()
            && cur.last_id() == next.last_id()
            && cur.left() == next.left()
            && cur.right() == next.right()
          {
            // merge two nodes, mark the index
            merged_index.push(index + 1);
          } else {
            debug!("merge failed: {cur:?} {next:?}")
          }
        }

        index += 1;
      }

      {
        // prune the merged nodes
        let mut new_structs = VecDeque::with_capacity(structs.len() - merged_index.len());
        let mut next_remove_idx = 0;
        for (idx, val) in structs.drain(..).enumerate() {
          if next_remove_idx < merged_index.len() && idx == merged_index[next_remove_idx] {
            next_remove_idx += 1;
          } else {
            new_structs.push_back(val);
          }
        }
        structs.extend(new_structs);
      }
    }
  }

  pub fn is_content_empty(&self) -> bool {
    self.structs.is_empty()
  }

  pub fn is_empty(&self) -> bool {
    self.structs.is_empty() && self.delete_set.is_empty()
  }

  pub fn is_pending_empty(&self) -> bool {
    self.pending_structs.is_empty() && self.pending_delete_set.is_empty()
  }
}

pub(crate) struct UpdateIterator<'a> {
  update: &'a mut Update,

  // --- local iterator state ---
  /// current state vector from store
  state: StateVector,
  /// all client ids sorted ascending
  client_ids: Vec<Client>,
  /// current id of client of the updates we're processing
  cur_client_id: Option<Client>,
  /// stack of previous iterating item with higher priority than updates in
  /// next iteration
  stack: Vec<Node>,
}

impl<'a> UpdateIterator<'a> {
  pub fn new(update: &'a mut Update, state: StateVector) -> Self {
    let mut client_ids = update.structs.keys().cloned().collect::<Vec<_>>();
    client_ids.sort();
    let cur_client_id = client_ids.pop();

    UpdateIterator {
      update,
      state,
      client_ids,
      cur_client_id,
      stack: Vec::new(),
    }
  }

  /// iterate the client ids until we find the next client with left updates
  /// that can be consumed
  ///
  /// note:
  /// firstly we will check current client id as well to ensure current
  /// updates queue is not empty yet
  fn next_client(&mut self) -> Option<Client> {
    while let Some(client_id) = self.cur_client_id {
      match self.update.structs.get(&client_id) {
        Some(refs) if !refs.is_empty() => {
          self.cur_client_id.replace(client_id);
          return self.cur_client_id;
        }
        _ => {
          self.update.structs.remove(&client_id);
          self.cur_client_id = self.client_ids.pop();
        }
      }
    }

    None
  }

  /// update the missing state vector
  /// tell it the smallest clock that missed.
  fn update_missing_state(&mut self, client: Client, clock: Clock) {
    self.update.missing_state.set_min(client, clock);
  }

  /// any time we can't apply an update during the iteration,
  /// we should put all items in pending stack to rest structs
  fn add_stack_to_rest(&mut self) {
    for s in self.stack.drain(..) {
      let client = s.id().client;
      let unapplicable_items = self.update.structs.remove(&client);
      if let Some(mut items) = unapplicable_items {
        items.push_front(s);
        self.update.pending_structs.insert(client, items);
      } else {
        self.update.pending_structs.insert(client, [s].into());
      }
      self.client_ids.retain(|&c| c != client);
    }
  }

  /// tell if current update's dependencies(left, right, parent) has already
  /// been consumed and recorded and return the client of them if not.
  fn get_missing_dep(&self, struct_info: &Node) -> Option<Client> {
    if let Some(item) = struct_info.as_item().get() {
      let id = item.id;
      if let Some(left) = &item.origin_left_id
        && left.client != id.client
        && left.clock >= self.state.get(&left.client)
      {
        return Some(left.client);
      }

      if let Some(right) = &item.origin_right_id
        && right.client != id.client
        && right.clock >= self.state.get(&right.client)
      {
        return Some(right.client);
      }

      if let Some(parent) = &item.parent {
        match parent {
          Parent::Id(parent_id)
            if parent_id.client != id.client && parent_id.clock >= self.state.get(&parent_id.client) =>
          {
            return Some(parent_id.client);
          }
          _ => {}
        }
      }
    }

    None
  }

  fn next_candidate(&mut self) -> Option<Node> {
    let mut cur = None;

    if !self.stack.is_empty() {
      cur.replace(self.stack.pop().unwrap());
    } else if let Some(client) = self.next_client() {
      // Safety:
      // client index of updates and update length are both checked in next_client
      // safe to use unwrap
      cur.replace(self.update.structs.get_mut(&client).unwrap().pop_front().unwrap());
    }

    cur
  }
}

impl Iterator for UpdateIterator<'_> {
  type Item = (Node, u64);

  fn next(&mut self) -> Option<Self::Item> {
    // fetch the first candidate from stack or updates
    let mut cur = self.next_candidate();

    while let Some(cur_update) = cur.take() {
      let id = cur_update.id();
      if cur_update.is_skip() {
        cur = self.next_candidate();
        continue;
      } else if !self.state.contains(&id) {
        // missing local state of same client
        // can't apply the continuous updates from same client
        // push into the stack and put tell all the items in stack are unapplicable
        self.stack.push(cur_update);
        self.update_missing_state(id.client, id.clock - 1);
        self.add_stack_to_rest();
      } else {
        let id = cur_update.id();
        let dep = self.get_missing_dep(&cur_update);
        // some dependency is missing, we need to turn to iterate the dependency first.
        if let Some(dep) = dep {
          self.stack.push(cur_update);

          match self.update.structs.get_mut(&dep) {
            Some(updates) if !updates.is_empty() => {
              // iterate the dependency client first
              cur.replace(updates.pop_front().unwrap());
              continue;
            }
            // but the dependency update is drained
            // need to move all stack item to unapplicable store
            _ => {
              self.update_missing_state(dep, self.state.get(&dep));
              self.add_stack_to_rest();
            }
          }
        } else {
          // we finally find the first applicable update
          let local_state = self.state.get(&id.client);
          // we've already check the local state is greater or equal to current update's
          // clock so offset here will never be negative
          let offset = local_state - id.clock;
          if offset == 0 || offset < cur_update.len() {
            self.state.set_max(id.client, id.clock + cur_update.len());
            return Some((cur_update, offset));
          }
        }
      }

      cur = self.next_candidate();
    }

    // we all done
    None
  }
}

pub struct DeleteSetIterator<'a> {
  update: &'a mut Update,
  /// current state vector from store
  state: StateVector,
}

impl<'a> DeleteSetIterator<'a> {
  pub fn new(update: &'a mut Update, state: StateVector) -> Self {
    DeleteSetIterator { update, state }
  }
}

impl Iterator for DeleteSetIterator<'_> {
  type Item = (Client, Range<u64>);

  fn next(&mut self) -> Option<Self::Item> {
    while let Some(client) = self.update.delete_set.keys().next().cloned() {
      let deletes = self.update.delete_set.get_mut(&client).unwrap();
      let local_state = self.state.get(&client);

      while let Some(range) = deletes.pop() {
        let start = range.start;
        let end = range.end;

        if start < local_state {
          if local_state < end {
            // partially state missing
            // [start..end)
            //        ^ local_state in between
            // // split
            // [start..local_state) [local_state..end)
            //                      ^^^^^ unapplicable
            self
              .update
              .pending_delete_set
              .add(client, local_state, end - local_state);

            return Some((client, start..local_state));
          }

          return Some((client, range));
        } else {
          // all state missing
          self.update.pending_delete_set.add(client, start, end - start);
        }
      }

      self.update.delete_set.remove(&client);
    }

    None
  }
}

#[cfg(test)]
mod tests {
  use std::{num::ParseIntError, path::PathBuf};

  use serde::Deserialize;

  use super::*;
  use crate::doc::common::OrderRange;

  fn struct_item(id: (Client, Clock), len: usize) -> Node {
    Node::Item(Somr::new(
      ItemBuilder::new()
        .id(id.into())
        .content(Content::String("c".repeat(len)))
        .build(),
    ))
  }

  fn parse_doc_update(input: Vec<u8>) -> JwstCodecResult<Update> {
    Update::decode_v1(input)
  }

  #[test]
  #[cfg_attr(any(miri, loom), ignore)]
  fn test_parse_doc() {
    let docs = [
      (include_bytes!("../../fixtures/basic.bin").to_vec(), 1, 188),
      (include_bytes!("../../fixtures/database.bin").to_vec(), 1, 149),
      (include_bytes!("../../fixtures/large.bin").to_vec(), 1, 9036),
      (include_bytes!("../../fixtures/with-subdoc.bin").to_vec(), 2, 30),
      (
        include_bytes!("../../fixtures/edge-case-left-right-same-node.bin").to_vec(),
        2,
        243,
      ),
    ];

    for (doc, clients, structs) in docs {
      let update = parse_doc_update(doc).unwrap();

      assert_eq!(update.structs.len(), clients);
      assert_eq!(update.structs.iter().map(|s| s.1.len()).sum::<usize>(), structs);
    }
  }

  fn decode_hex(s: &str) -> Result<Vec<u8>, ParseIntError> {
    (0..s.len())
      .step_by(2)
      .map(|i| u8::from_str_radix(&s[i..i + 2], 16))
      .collect()
  }

  #[allow(dead_code)]
  #[derive(Deserialize, Debug)]
  struct Data {
    id: u64,
    workspace: String,
    timestamp: String,
    blob: String,
  }

  #[ignore = "just for local data test"]
  #[test]
  fn test_parse_local_doc() {
    let json = serde_json::from_slice::<Vec<Data>>(include_bytes!("../../fixtures/local_docs.json")).unwrap();

    for ws in json {
      let data = &ws.blob[5..=(ws.blob.len() - 2)];
      if let Ok(data) = decode_hex(data) {
        match parse_doc_update(data.clone()) {
          Ok(update) => {
            println!(
              "workspace: {}, global structs: {}, total structs: {}",
              ws.workspace,
              update.structs.len(),
              update.structs.iter().map(|s| s.1.len()).sum::<usize>()
            );
          }
          Err(_e) => {
            std::fs::write(
              PathBuf::from("./src/fixtures/invalid").join(format!("{}.ydoc", ws.workspace)),
              data,
            )
            .unwrap();
            println!("doc error: {}", ws.workspace);
          }
        }
      } else {
        println!("error origin data: {}", ws.workspace);
      }
    }
  }

  #[test]
  fn test_update_iterator() {
    loom_model!({
      let mut update = Update {
        structs: ClientMap::from_iter([
          (
            0,
            VecDeque::from([
              struct_item((0, 0), 1),
              struct_item((0, 1), 1),
              Node::new_skip((0, 2).into(), 1),
            ]),
          ),
          (
            1,
            VecDeque::from([
              struct_item((1, 0), 1),
              Node::Item(Somr::new(
                ItemBuilder::new()
                  .id((1, 1).into())
                  .left_id(Some((0, 1).into()))
                  .content(Content::String("c".repeat(2)))
                  .build(),
              )),
            ]),
          ),
        ]),
        ..Update::default()
      };

      let mut iter = update.iter(StateVector::default());
      assert_eq!(iter.next().unwrap().0.id(), (1, 0).into());
      assert_eq!(iter.next().unwrap().0.id(), (0, 0).into());
      assert_eq!(iter.next().unwrap().0.id(), (0, 1).into());
      assert_eq!(iter.next().unwrap().0.id(), (1, 1).into());
      assert_eq!(iter.next(), None);
    });
  }

  #[test]
  fn test_update_iterator_with_missing_state() {
    loom_model!({
      let mut update = Update {
        // an item with higher sequence id than local state
        structs: ClientMap::from_iter([(0, VecDeque::from([struct_item((0, 4), 1)]))]),
        ..Update::default()
      };

      let mut iter = update.iter(StateVector::from([(0, 3)]));
      assert_eq!(iter.next(), None);
      assert!(!update.pending_structs.is_empty());
      assert_eq!(
        update.pending_structs.get_mut(&0).unwrap().pop_front().unwrap().id(),
        (0, 4).into()
      );
      assert!(!update.missing_state.is_empty());
      assert_eq!(update.missing_state.get(&0), 3);
    });
  }

  #[test]
  fn test_delete_set_iterator() {
    let mut update = Update {
      delete_set: DeleteSet::from([(0, vec![(0..2), (3..5)])]),
      ..Update::default()
    };

    let mut iter = update.delete_set_iter(StateVector::from([(0, 10)]));
    assert_eq!(iter.next().unwrap(), (0, 0..2));
    assert_eq!(iter.next().unwrap(), (0, 3..5));
    assert_eq!(iter.next(), None);
  }

  #[test]
  fn test_delete_set_with_missing_state() {
    let mut update = Update {
      delete_set: DeleteSet::from([(0, vec![(3..5), (7..12), (13..15)])]),
      ..Update::default()
    };

    let mut iter = update.delete_set_iter(StateVector::from([(0, 10)]));
    assert_eq!(iter.next().unwrap(), (0, 3..5));
    assert_eq!(iter.next().unwrap(), (0, 7..10));
    assert_eq!(iter.next(), None);

    assert!(!update.pending_delete_set.is_empty());
    assert_eq!(
      update.pending_delete_set.get(&0).unwrap(),
      &OrderRange::from(vec![(10..12), (13..15)])
    );
  }

  #[test]
  fn should_add_skip_when_clock_not_continuous() {
    loom_model!({
      let update = Update {
        structs: ClientMap::from_iter([(
          0,
          VecDeque::from([
            struct_item((0, 0), 1),
            struct_item((0, 1), 1),
            struct_item((0, 10), 1),
            Node::new_gc((0, 20).into(), 10),
          ]),
        )]),
        ..Default::default()
      };

      let merged = Update::merge([update]);

      assert_eq!(
        merged.structs.get(&0).unwrap(),
        &VecDeque::from([
          struct_item((0, 0), 1),
          struct_item((0, 1), 1),
          Node::new_skip((0, 2).into(), 8),
          struct_item((0, 10), 1),
          Node::new_skip((0, 11).into(), 9),
          Node::new_gc((0, 20).into(), 10),
        ])
      );
    });
  }

  #[test]
  fn merged_update_should_not_be_released_in_next_turn() {
    loom_model!({
      let update = Update {
        structs: ClientMap::from_iter([(
          0,
          VecDeque::from([
            struct_item((0, 0), 1),
            struct_item((0, 1), 1),
            struct_item((0, 10), 1),
            Node::new_gc((0, 20).into(), 10),
          ]),
        )]),
        ..Default::default()
      };

      let merged = Update::merge([update]);

      let update2 = Update {
        structs: ClientMap::from_iter([(
          0,
          VecDeque::from([struct_item((0, 30), 1), Node::new_gc((0, 32).into(), 1)]),
        )]),
        ..Default::default()
      };

      let merged2 = Update::merge([update2, merged]);

      assert_eq!(merged2.structs.get(&0).unwrap().len(), 9);
    });
  }
}
