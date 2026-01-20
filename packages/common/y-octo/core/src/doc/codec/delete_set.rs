use std::{
  collections::{VecDeque, hash_map::Entry},
  ops::{Deref, DerefMut, Range},
};

use super::*;
use crate::doc::OrderRange;

impl<R: CrdtReader> CrdtRead<R> for Range<u64> {
  fn read(decoder: &mut R) -> JwstCodecResult<Self> {
    let clock = decoder.read_var_u64()?;
    let len = decoder.read_var_u64()?;
    Ok(clock..clock + len)
  }
}

impl<W: CrdtWriter> CrdtWrite<W> for Range<u64> {
  fn write(&self, encoder: &mut W) -> JwstCodecResult {
    encoder.write_var_u64(self.start)?;
    encoder.write_var_u64(self.end - self.start)?;
    Ok(())
  }
}

impl<R: CrdtReader> CrdtRead<R> for OrderRange {
  fn read(decoder: &mut R) -> JwstCodecResult<Self> {
    let num_of_deletes = decoder.read_var_u64()? as usize;
    if num_of_deletes == 1 {
      Ok(OrderRange::Range(Range::<u64>::read(decoder)?))
    } else {
      let mut deletes = VecDeque::with_capacity(num_of_deletes);

      for _ in 0..num_of_deletes {
        deletes.push_back(Range::<u64>::read(decoder)?);
      }

      Ok(OrderRange::Fragment(deletes))
    }
  }
}

impl<W: CrdtWriter> CrdtWrite<W> for OrderRange {
  fn write(&self, encoder: &mut W) -> JwstCodecResult {
    match self {
      OrderRange::Range(range) => {
        encoder.write_var_u64(1)?;
        range.write(encoder)?;
      }
      OrderRange::Fragment(ranges) => {
        encoder.write_var_u64(ranges.len() as u64)?;
        for range in ranges {
          range.write(encoder)?;
        }
      }
    }

    Ok(())
  }
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct DeleteSet(pub ClientMap<OrderRange>);

impl Deref for DeleteSet {
  type Target = ClientMap<OrderRange>;

  fn deref(&self) -> &Self::Target {
    &self.0
  }
}

impl<const N: usize> From<[(Client, Vec<Range<u64>>); N]> for DeleteSet {
  fn from(value: [(Client, Vec<Range<u64>>); N]) -> Self {
    let mut map = ClientMap::with_capacity(N);
    for (client, ranges) in value {
      map.insert(client, ranges.into());
    }
    Self(map)
  }
}

impl DerefMut for DeleteSet {
  fn deref_mut(&mut self) -> &mut Self::Target {
    &mut self.0
  }
}

impl DeleteSet {
  pub fn add(&mut self, client: Client, from: Clock, len: Clock) {
    self.add_range(client, from..from + len);
  }

  pub fn add_range(&mut self, client: Client, range: Range<u64>) {
    match self.0.entry(client) {
      Entry::Occupied(e) => {
        let r = e.into_mut();
        if r.is_empty() {
          *r = range.into();
        } else {
          r.push(range);
        }
      }
      Entry::Vacant(e) => {
        e.insert(range.into());
      }
    }
  }

  pub fn batch_add_ranges(&mut self, client: Client, ranges: Vec<Range<u64>>) {
    match self.0.entry(client) {
      Entry::Occupied(e) => {
        e.into_mut().extend(ranges);
      }
      Entry::Vacant(e) => {
        e.insert(ranges.into());
      }
    }
  }

  pub fn merge(&mut self, other: &Self) {
    for (client, range) in &other.0 {
      match self.0.entry(*client) {
        Entry::Occupied(e) => {
          e.into_mut().merge(range.clone());
        }
        Entry::Vacant(e) => {
          e.insert(range.clone());
        }
      }
    }
  }
}

impl<R: CrdtReader> CrdtRead<R> for DeleteSet {
  fn read(decoder: &mut R) -> JwstCodecResult<Self> {
    let num_of_clients = decoder.read_var_u64()? as usize;
    // See: [HASHMAP_SAFE_CAPACITY]
    let mut map = ClientMap::with_capacity(num_of_clients.min(HASHMAP_SAFE_CAPACITY));

    for _ in 0..num_of_clients {
      let client = decoder.read_var_u64()?;
      let deletes = OrderRange::read(decoder)?;
      map.insert(client, deletes);
    }

    map.shrink_to_fit();
    Ok(DeleteSet(map))
  }
}

impl<W: CrdtWriter> CrdtWrite<W> for DeleteSet {
  fn write(&self, encoder: &mut W) -> JwstCodecResult {
    encoder.write_var_u64(self.len() as u64)?;
    let mut clients = self.keys().copied().collect::<Vec<_>>();

    // Descending
    clients.sort_by(|a, b| b.cmp(a));

    for client in clients {
      encoder.write_var_u64(client)?;
      self.get(&client).unwrap().write(encoder)?;
    }

    Ok(())
  }
}

#[cfg(test)]
#[allow(clippy::single_range_in_vec_init)]
mod tests {
  use super::*;

  #[test]
  fn test_delete_set_add() {
    let delete_set = DeleteSet::from([
      (1, vec![0..10, 20..30]),
      (2, vec![0..5, 10..20]),
      (3, vec![15..20, 30..35]),
      (4, vec![0..10]),
    ]);

    {
      let mut delete_set = delete_set.clone();
      delete_set.add(1, 5, 25);
      assert_eq!(delete_set.get(&1), Some(&OrderRange::Range(0..30)));
    }

    {
      let mut delete_set = delete_set;
      delete_set.add(1, 5, 10);
      assert_eq!(delete_set.get(&1), Some(&OrderRange::from(vec![0..15, 20..30])));
    }
  }

  #[test]
  fn test_delete_set_batch_push() {
    let delete_set = DeleteSet::from([
      (1, vec![0..10, 20..30]),
      (2, vec![0..5, 10..20]),
      (3, vec![15..20, 30..35]),
      (4, vec![0..10]),
    ]);

    {
      let mut delete_set = delete_set.clone();
      delete_set.batch_add_ranges(1, vec![0..5, 10..20]);
      assert_eq!(delete_set.get(&1), Some(&OrderRange::Range(0..30)));
    }

    {
      let mut delete_set = delete_set;
      delete_set.batch_add_ranges(1, vec![40..50, 10..20]);
      assert_eq!(delete_set.get(&1), Some(&OrderRange::from(vec![0..30, 40..50])));
    }
  }

  #[test]
  fn test_encode_decode() {
    let delete_set = DeleteSet::from([(1, vec![0..10, 20..30]), (2, vec![0..5, 10..20])]);
    let mut encoder = RawEncoder::default();
    delete_set.write(&mut encoder).unwrap();
    let update = encoder.into_inner();
    let mut decoder = RawDecoder::new(&update);
    let decoded = DeleteSet::read(&mut decoder).unwrap();
    assert_eq!(delete_set, decoded);
  }
}
