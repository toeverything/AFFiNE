use super::{BTreeMap, BTreeSet, MergeError, NodeId, WorkBudget};

pub(super) fn merge_order(
  base: &[NodeId],
  current: &[NodeId],
  external: &[NodeId],
  budget: &mut WorkBudget,
) -> Result<Vec<NodeId>, MergeError> {
  if external == base {
    return Ok(current.to_vec());
  }
  if current == base || current == external {
    return Ok(external.to_vec());
  }
  let existing: BTreeSet<_> = base.iter().collect();
  let current_old: Vec<_> = current.iter().filter(|id| existing.contains(id)).cloned().collect();
  let external_old: Vec<_> = external.iter().filter(|id| existing.contains(id)).cloned().collect();
  let order = if current_old == base {
    external_old
  } else if external_old == base || current_old == external_old {
    current_old
  } else {
    merge_reorders(base, &current_old, &external_old, budget)?
  };
  let mut gaps: BTreeMap<usize, Vec<NodeId>> = BTreeMap::new();
  for sequence in [current, external] {
    let mut start = 0;
    while start < sequence.len() {
      if existing.contains(&sequence[start]) {
        start += 1;
        continue;
      }
      let mut end = start + 1;
      while end < sequence.len() && !existing.contains(&sequence[end]) {
        end += 1;
      }
      let left = start.checked_sub(1).map(|i| &sequence[i]);
      let right = sequence.get(end);
      let position = if let Some(left) = left {
        order
          .iter()
          .position(|id| id == left)
          .ok_or(MergeError::ConcurrentEdit)?
          + 1
      } else {
        0
      };
      if order.get(position) != right {
        return Err(MergeError::ConcurrentEdit);
      }
      let inserted = sequence[start..end].to_vec();
      if let Some(previous) = gaps.insert(position, inserted.clone())
        && previous != inserted
      {
        return Err(MergeError::ConcurrentEdit);
      }
      start = end;
    }
  }
  let mut result = Vec::new();
  for i in 0..=order.len() {
    if let Some(inserted) = gaps.remove(&i) {
      result.extend(inserted);
    }
    if let Some(id) = order.get(i) {
      result.push(id.clone());
    }
  }
  Ok(result)
}

fn merge_reorders(
  base: &[NodeId],
  current: &[NodeId],
  external: &[NodeId],
  budget: &mut WorkBudget,
) -> Result<Vec<NodeId>, MergeError> {
  if base.len() != current.len() || base.len() != external.len() {
    return Err(MergeError::ConcurrentEdit);
  }
  budget.spend(base.len().saturating_mul(base.len()))?;
  let c: BTreeMap<_, _> = current.iter().enumerate().map(|(i, id)| (id, i)).collect();
  let e: BTreeMap<_, _> = external.iter().enumerate().map(|(i, id)| (id, i)).collect();
  let mut edges = vec![Vec::new(); base.len()];
  let mut incoming = vec![0; base.len()];
  for i in 0..base.len() {
    for j in i + 1..base.len() {
      // Either endpoint can reverse a baseline relation. Incompatible moves
      // produce a cycle rather than an arbitrary user-visible ordering.
      let reverse = c[&base[i]] > c[&base[j]] || e[&base[i]] > e[&base[j]];
      let (from, to) = if reverse { (j, i) } else { (i, j) };
      edges[from].push(to);
      incoming[to] += 1;
    }
  }
  let mut ready: Vec<_> = incoming
    .iter()
    .enumerate()
    .filter_map(|(i, n)| (*n == 0).then_some(i))
    .collect();
  let mut output = Vec::new();
  while !ready.is_empty() {
    if ready.len() != 1 {
      return Err(MergeError::ConcurrentEdit);
    }
    let index = ready.pop().unwrap();
    output.push(base[index].clone());
    for next in &edges[index] {
      incoming[*next] -= 1;
      if incoming[*next] == 0 {
        ready.push(*next);
      }
    }
  }
  if output.len() != base.len() {
    return Err(MergeError::ConcurrentEdit);
  }
  Ok(output)
}
