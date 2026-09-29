mod align;
mod order;

use std::collections::{BTreeMap, BTreeSet, HashMap};

use align::resolve;
use order::merge_order;

use super::{Any, MergeError, TextDeltaOp, WorkBudget};

/// A format projection, not a replacement for the source document schema.
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectedNode {
  pub id: Option<String>,
  pub kind: String,
  pub properties: BTreeMap<String, Any>,
  pub text: Vec<TextDeltaOp>,
  pub opaque: Option<String>,
  pub children: Vec<ProjectedNode>,
}

impl ProjectedNode {
  fn same_content(&self, other: &Self) -> bool {
    self.kind == other.kind
      && self.properties == other.properties
      && self.text == other.text
      && self.opaque == other.opaque
      && self.children.len() == other.children.len()
      && self
        .children
        .iter()
        .zip(&other.children)
        .all(|(a, b)| a.same_content(b))
  }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum NodeId {
  Existing(String),
  New(usize),
}

#[derive(Debug)]
pub struct TreePlan {
  source_ids: Vec<NodeId>,
  children: BTreeMap<Option<NodeId>, Vec<NodeId>>,
  removed: Vec<String>,
}
impl TreePlan {
  pub fn source_ids(&self) -> &[NodeId] {
    &self.source_ids
  }
  pub fn children(&self) -> &BTreeMap<Option<NodeId>, Vec<NodeId>> {
    &self.children
  }
  pub fn removed(&self) -> &[String] {
    &self.removed
  }
}

struct Graph {
  parents: BTreeMap<NodeId, Option<NodeId>>,
  children: BTreeMap<Option<NodeId>, Vec<NodeId>>,
}

fn graph(nodes: &[ProjectedNode], ids: Option<&[NodeId]>) -> Result<Graph, MergeError> {
  fn visit(
    nodes: &[ProjectedNode],
    parent: Option<NodeId>,
    ids: Option<&[NodeId]>,
    next: &mut usize,
    g: &mut Graph,
    depth: usize,
  ) -> Result<(), MergeError> {
    if depth > 128 {
      return Err(MergeError::BudgetExceeded);
    }
    let mut children = Vec::new();
    for node in nodes {
      if *next >= 20_000 {
        return Err(MergeError::BudgetExceeded);
      }
      let id = if let Some(ids) = ids {
        ids.get(*next).cloned().ok_or(MergeError::InvalidProjection)?
      } else {
        NodeId::Existing(node.id.clone().ok_or(MergeError::InvalidProjection)?)
      };
      *next += 1;
      if g.parents.insert(id.clone(), parent.clone()).is_some() {
        return Err(MergeError::AmbiguousIdentity);
      }
      children.push(id.clone());
      visit(&node.children, Some(id), ids, next, g, depth + 1)?;
    }
    g.children.insert(parent, children);
    Ok(())
  }
  let mut g = Graph {
    parents: BTreeMap::new(),
    children: BTreeMap::new(),
  };
  visit(nodes, None, ids, &mut 0, &mut g, 0)?;
  Ok(g)
}

pub fn merge_tree(
  baseline: &[ProjectedNode],
  current: &[ProjectedNode],
  incoming: &[ProjectedNode],
  budget: &mut WorkBudget,
) -> Result<TreePlan, MergeError> {
  let b = graph(baseline, None)?;
  let c = graph(current, None)?;
  let source_ids = resolve(baseline, incoming, budget)?;
  let e = graph(incoming, Some(&source_ids))?;
  budget.spend(b.parents.len() + c.parents.len() + e.parents.len())?;
  let mut parents = BTreeMap::new();
  let all: BTreeSet<_> = b
    .parents
    .keys()
    .chain(c.parents.keys())
    .chain(e.parents.keys())
    .cloned()
    .collect();
  let mut removed = Vec::new();
  for id in all {
    let old = b.parents.get(&id);
    let now = c.parents.get(&id);
    let external = e.parents.get(&id);
    let target = if old.is_none() {
      now.or(external)
    } else if external == old {
      now
    } else if now == old || now == external {
      external
    } else {
      return Err(MergeError::ConcurrentEdit);
    };
    if let Some(parent) = target {
      parents.insert(id, parent.clone());
    } else if let NodeId::Existing(id) = id {
      removed.push(id);
    }
  }
  for id in parents.keys() {
    let mut visited = BTreeSet::new();
    let mut cursor = Some(id);
    while let Some(node) = cursor {
      if !visited.insert(node) {
        return Err(MergeError::ConcurrentEdit);
      }
      cursor = parents.get(node).ok_or(MergeError::ConcurrentEdit)?.as_ref();
    }
  }
  let mut children = BTreeMap::new();
  for parent in std::iter::once(None).chain(parents.keys().cloned().map(Some)) {
    let filter = |g: &Graph| {
      g.children
        .get(&parent)
        .into_iter()
        .flatten()
        .filter(|id| parents.get(*id) == Some(&parent))
        .cloned()
        .collect::<Vec<_>>()
    };
    let target = merge_order(&filter(&b), &filter(&c), &filter(&e), budget)?;
    children.insert(parent, target);
  }
  Ok(TreePlan {
    source_ids,
    children,
    removed,
  })
}

/// Only keys explicitly changed in the external view are writable.
pub fn merge_properties(
  baseline: &BTreeMap<String, Any>,
  current: &BTreeMap<String, Any>,
  before: &BTreeMap<String, Any>,
  after: &BTreeMap<String, Any>,
) -> Result<BTreeMap<String, Option<Any>>, MergeError> {
  let mut changes = BTreeMap::new();
  for key in before.keys().chain(after.keys()).collect::<BTreeSet<_>>() {
    if before.get(key) == after.get(key) {
      continue;
    }
    let desired = after.get(key);
    if current.get(key) != baseline.get(key) && current.get(key) != desired {
      return Err(MergeError::ConcurrentEdit);
    }
    if current.get(key) != desired {
      changes.insert(key.clone(), desired.cloned());
    }
  }
  Ok(changes)
}
