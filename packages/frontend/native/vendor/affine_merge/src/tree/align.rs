use super::{BTreeSet, HashMap, MergeError, NodeId, ProjectedNode, WorkBudget};

pub(super) fn resolve(
  baseline: &[ProjectedNode],
  incoming: &[ProjectedNode],
  budget: &mut WorkBudget,
) -> Result<Vec<NodeId>, MergeError> {
  fn flatten<'a>(nodes: &'a [ProjectedNode], out: &mut Vec<&'a ProjectedNode>, depth: usize) -> Result<(), MergeError> {
    if depth > 128 {
      return Err(MergeError::BudgetExceeded);
    }
    for node in nodes {
      if out.len() >= 20_000 {
        return Err(MergeError::BudgetExceeded);
      }
      out.push(node);
      flatten(&node.children, out, depth + 1)?;
    }
    Ok(())
  }
  let mut old = Vec::new();
  let mut new = Vec::new();
  flatten(baseline, &mut old, 0)?;
  flatten(incoming, &mut new, 0)?;
  let pool: HashMap<_, _> = old.iter().map(|n| (n.id.as_deref().unwrap(), *n)).collect();
  let mut assigned = HashMap::new();
  let mut used = BTreeSet::new();
  for (index, node) in new.iter().enumerate() {
    if let Some(id) = &node.id {
      let previous = pool.get(id.as_str()).ok_or(MergeError::AmbiguousIdentity)?;
      if previous.kind != node.kind || !used.insert(id.clone()) {
        return Err(MergeError::AmbiguousIdentity);
      }
      assigned.insert(index, id.clone());
    }
  }
  let indices: HashMap<_, _> = new
    .iter()
    .enumerate()
    .map(|(i, n)| ((*n as *const ProjectedNode), i))
    .collect();
  fn siblings(
    old: &[ProjectedNode],
    new: &[ProjectedNode],
    indices: &HashMap<*const ProjectedNode, usize>,
    assigned: &mut HashMap<usize, String>,
    used: &mut BTreeSet<String>,
    budget: &mut WorkBudget,
    pool: &HashMap<&str, &ProjectedNode>,
  ) -> Result<(), MergeError> {
    // An unchanged ordered projection is a no-op, including repeated values.
    if old.len() == new.len()
      && old
        .iter()
        .zip(new)
        .all(|(a, b)| a.same_content(b) && b.id.as_ref().is_none_or(|id| a.id.as_ref() == Some(id)))
    {
      for (a, b) in old.iter().zip(new) {
        let index = indices[&(b as *const _)];
        let id = a.id.as_ref().unwrap();
        if !assigned.contains_key(&index) && !used.contains(id) {
          assigned.insert(index, id.clone());
          used.insert(id.clone());
        }
      }
    }
    let candidates: Vec<_> = old.iter().filter(|a| !used.contains(a.id.as_ref().unwrap())).collect();
    let unmatched: Vec<_> = new
      .iter()
      .filter(|n| !assigned.contains_key(&indices[&(*n as *const _)]))
      .collect();
    let mut exact = Vec::new();
    for node in &unmatched {
      let mut found = None;
      let mut ambiguous = false;
      for previous in &candidates {
        budget.spend(1)?;
        if previous.same_content(node) {
          if found.is_some() {
            ambiguous = true;
          } else {
            found = Some(*previous);
          }
        }
      }
      if !ambiguous && let Some(previous) = found {
        exact.push((*node, previous));
      }
    }
    for (node, previous) in &exact {
      if exact.iter().filter(|(_, other)| other.id == previous.id).count() == 1 {
        let id = previous.id.clone().unwrap();
        assigned.insert(indices[&(*node as *const _)], id.clone());
        used.insert(id);
      }
    }
    let old_remaining: Vec<_> = old.iter().filter(|a| !used.contains(a.id.as_ref().unwrap())).collect();
    let new_remaining: Vec<_> = new
      .iter()
      .filter(|n| !assigned.contains_key(&indices[&(*n as *const _)]))
      .collect();
    if !old_remaining.is_empty() && !new_remaining.is_empty() {
      if old_remaining.len() != 1 || new_remaining.len() != 1 || old_remaining[0].kind != new_remaining[0].kind {
        return Err(MergeError::AmbiguousIdentity);
      }
      let id = old_remaining[0].id.clone().unwrap();
      assigned.insert(indices[&(new_remaining[0] as *const _)], id.clone());
      used.insert(id);
    }
    for node in new {
      let index = indices[&(node as *const _)];
      if let Some(id) = assigned.get(&index) {
        if let Some(previous) = pool.get(id.as_str()) {
          siblings(
            &previous.children,
            &node.children,
            indices,
            assigned,
            used,
            budget,
            pool,
          )?;
        }
      } else {
        siblings(&[], &node.children, indices, assigned, used, budget, pool)?;
      }
    }
    Ok(())
  }
  siblings(baseline, incoming, &indices, &mut assigned, &mut used, budget, &pool)?;
  Ok(
    (0..new.len())
      .map(|i| assigned.remove(&i).map(NodeId::Existing).unwrap_or(NodeId::New(i)))
      .collect(),
  )
}
