use std::collections::BTreeSet;

use super::{Character, MergeError, WorkBudget, values};

struct Edit<'a> {
  start: usize,
  end: usize,
  content: &'a [Character],
  external: bool,
}

fn edits<'a>(mapping: &[Option<usize>], target: &'a [Character], external: bool) -> Vec<Edit<'a>> {
  let mut output = Vec::new();
  let (mut old, mut new) = (0, 0);
  for (i, j) in mapping
    .iter()
    .enumerate()
    .filter_map(|(i, j)| j.map(|j| (i, j)))
    .chain(std::iter::once((mapping.len(), target.len())))
  {
    if old != i || new != j {
      output.push(Edit {
        start: old,
        end: i,
        content: &target[new..j],
        external,
      });
    }
    old = i + 1;
    new = j + 1;
  }
  output
}

fn touches(a: &Edit<'_>, b: &Edit<'_>) -> bool {
  if a.start == a.end || b.start == b.end {
    a.start <= b.end && b.start <= a.end
  } else {
    a.start < b.end && b.start < a.end
  }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn reconcile(
  baseline: &[Character],
  current: &[Character],
  before: &[Character],
  after: &[Character],
  current_map: &[Option<usize>],
  external_map: &[Option<usize>],
  marks: &[&str],
  budget: &mut WorkBudget,
) -> Result<Vec<Character>, MergeError> {
  let current_edits = edits(current_map, current, false);
  let external_edits = edits(external_map, after, true);
  budget.spend(current_edits.len().saturating_mul(external_edits.len()))?;
  let mut combined: Vec<&Edit<'_>> = current_edits.iter().collect();
  for external in &external_edits {
    let mut satisfied = false;
    for client in &current_edits {
      if touches(external, client) {
        if external.start == client.start
          && external.end == client.end
          && values(external.content) == values(client.content)
          && external
            .content
            .iter()
            .zip(client.content)
            .all(|(a, b)| marks.iter().all(|key| a.attributes.get(*key) == b.attributes.get(*key)))
        {
          satisfied = true;
        } else {
          return Err(MergeError::ConcurrentEdit);
        }
      }
    }
    // Unknown spans have no defined deletion/expansion semantics.
    for character in &baseline[external.start..external.end] {
      protect(character, marks)?;
    }
    if external.start == external.end {
      for index in [
        external.start.checked_sub(1),
        (external.start < baseline.len()).then_some(external.start),
      ]
      .into_iter()
      .flatten()
      {
        protect(&baseline[index], marks)?;
        if let Some(j) = current_map[index] {
          protect(&current[j], marks)?;
        }
      }
    }
    for index in external.start..external.end {
      if let Some(j) = current_map[index] {
        protect(&current[j], marks)?;
        if baseline[index].attributes != current[j].attributes {
          return Err(MergeError::ConcurrentEdit);
        }
      }
    }
    if !satisfied {
      combined.push(external);
    }
  }
  for (i, j) in external_map.iter().enumerate() {
    if let Some(j) = j
      && before[i].attributes != after[*j].attributes
      && current_map[i].is_none()
    {
      return Err(MergeError::ConcurrentEdit);
    }
  }
  combined.sort_by_key(|e| (e.start, e.end));
  let mut result = Vec::new();
  let mut cursor = 0;
  for edit in combined {
    retained(
      &mut result,
      cursor,
      edit.start,
      baseline,
      current,
      before,
      after,
      current_map,
      external_map,
      marks,
    )?;
    result.extend(edit.content.iter().cloned().map(|mut character| {
      if edit.external {
        character.current = None;
        character.id = None;
      }
      character
    }));
    cursor = edit.end;
  }
  retained(
    &mut result,
    cursor,
    baseline.len(),
    baseline,
    current,
    before,
    after,
    current_map,
    external_map,
    marks,
  )?;
  Ok(result)
}

fn protect(character: &Character, marks: &[&str]) -> Result<(), MergeError> {
  if let Some(key) = character.attributes.keys().find(|key| !marks.contains(&key.as_str())) {
    return Err(MergeError::UnsupportedMetadataEffect(key.clone()));
  }
  Ok(())
}

#[allow(clippy::too_many_arguments)]
fn retained(
  output: &mut Vec<Character>,
  start: usize,
  end: usize,
  baseline: &[Character],
  current: &[Character],
  before: &[Character],
  after: &[Character],
  current_map: &[Option<usize>],
  external_map: &[Option<usize>],
  marks: &[&str],
) -> Result<(), MergeError> {
  for i in start..end {
    let Some(j) = current_map[i] else {
      return Err(MergeError::InsufficientEvidence);
    };
    let mut character = current[j].clone();
    if let Some(k) = external_map[i] {
      let keys: BTreeSet<_> = before[i].attributes.keys().chain(after[k].attributes.keys()).collect();
      for key in keys {
        let old = before[i].attributes.get(key);
        let new = after[k].attributes.get(key);
        if old == new {
          continue;
        }
        if !marks.contains(&key.as_str()) {
          return Err(MergeError::UnsupportedMetadataEffect(key.clone()));
        }
        let now = character.attributes.get(key);
        if now != baseline[i].attributes.get(key) && now != new {
          return Err(MergeError::ConcurrentEdit);
        }
        if let Some(value) = new {
          character.attributes.insert(key.clone(), value.clone());
        } else {
          character.attributes.remove(key);
        }
      }
    }
    output.push(character);
  }
  Ok(())
}
