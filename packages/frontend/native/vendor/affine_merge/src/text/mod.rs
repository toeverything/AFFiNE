mod diff;
mod reconcile;

use std::collections::{BTreeSet, HashMap};

use diff::align;
use reconcile::reconcile;

use super::{Any, Id, MergeError, Text, TextAttributes, TextDeltaOp, TextInsert, TypeIdentity, WorkBudget};

pub struct TextMerge<'a> {
  pub baseline: &'a Text,
  pub current: &'a Text,
  pub source_before: &'a [TextDeltaOp],
  pub source_after: &'a [TextDeltaOp],
  pub editable_marks: &'a [&'a str],
}

#[derive(Debug, Clone, PartialEq)]
struct Character {
  value: char,
  attributes: TextAttributes,
  id: Option<Id>,
  current: Option<usize>,
}

#[derive(Debug)]
pub struct TextPlan {
  identity: TypeIdentity,
  before: Vec<Character>,
  after: Vec<Character>,
}

impl TextPlan {
  pub fn is_empty(&self) -> bool {
    self.before.len() == self.after.len()
      && self
        .before
        .iter()
        .zip(&self.after)
        .enumerate()
        .all(|(i, (a, b))| b.current == Some(i) && a.value == b.value && a.attributes == b.attributes)
  }

  pub fn apply(&self, text: &mut Text) -> Result<(), MergeError> {
    if text.identity()? != self.identity || characters(text)? != self.before {
      return Err(MergeError::ConcurrentEdit);
    }
    if !self.is_empty() {
      text.apply_delta(&self.delta())?;
    }
    let actual = characters(text)?;
    if actual.len() != self.after.len()
      || actual.iter().zip(&self.after).any(|(a, b)| {
        a.value != b.value || a.attributes != b.attributes || b.current.is_some_and(|i| a.id != self.before[i].id)
      })
    {
      return Err(MergeError::InvalidProjection);
    }
    Ok(())
  }

  pub fn delta(&self) -> Vec<TextDeltaOp> {
    let mut delta = Vec::new();
    let mut cursor = 0;
    for character in &self.after {
      if let Some(index) = character.current {
        if cursor < index {
          delta.push(TextDeltaOp::Delete {
            delete: utf16(&self.before[cursor..index]),
          });
        }
        let before = &self.before[index].attributes;
        let mut format = TextAttributes::new();
        for key in before
          .keys()
          .chain(character.attributes.keys())
          .collect::<BTreeSet<_>>()
        {
          if before.get(key) != character.attributes.get(key) {
            format.insert(key.clone(), character.attributes.get(key).cloned().unwrap_or(Any::Null));
          }
        }
        delta.push(TextDeltaOp::Retain {
          retain: character.value.len_utf16() as u64,
          format: (!format.is_empty()).then_some(format),
        });
        cursor = index + 1;
      } else {
        delta.push(TextDeltaOp::Insert {
          insert: TextInsert::Text(character.value.to_string()),
          format: (!character.attributes.is_empty()).then(|| character.attributes.clone()),
        });
      }
    }
    if cursor < self.before.len() {
      delta.push(TextDeltaOp::Delete {
        delete: utf16(&self.before[cursor..]),
      });
    }
    // Compact adjacent operations without changing retained item identities.
    let mut compact: Vec<TextDeltaOp> = Vec::new();
    for op in delta {
      match (compact.last_mut(), &op) {
        (Some(TextDeltaOp::Retain { retain: a, format: af }), TextDeltaOp::Retain { retain: b, format: bf })
          if af == bf =>
        {
          *a += b
        }
        (Some(TextDeltaOp::Delete { delete: a }), TextDeltaOp::Delete { delete: b }) => *a += b,
        (
          Some(TextDeltaOp::Insert {
            insert: TextInsert::Text(a),
            format: af,
          }),
          TextDeltaOp::Insert {
            insert: TextInsert::Text(b),
            format: bf,
          },
        ) if af == bf => a.push_str(b),
        _ => compact.push(op),
      }
    }
    compact
  }
}

pub fn merge_text(input: TextMerge<'_>, budget: &mut WorkBudget) -> Result<TextPlan, MergeError> {
  let baseline = characters(input.baseline)?;
  let current = characters(input.current)?;
  let before = source_characters(input.source_before)?;
  let after = source_characters(input.source_after)?;
  if values(&baseline) != values(&before) {
    return Err(MergeError::InvalidProjection);
  }
  if current.len() == after.len()
    && current.iter().zip(&after).all(|(a, b)| {
      a.value == b.value
        && input
          .editable_marks
          .iter()
          .all(|key| a.attributes.get(*key) == b.attributes.get(*key))
    })
  {
    return Ok(TextPlan {
      identity: input.current.identity()?,
      before: current.clone(),
      after: current,
    });
  }
  budget.spend(baseline.len() + current.len() + before.len() + after.len())?;
  let external_map = match align(&values(&before), &values(&after), budget) {
    Ok(mapping) => mapping,
    Err(MergeError::AmbiguousIdentity) if baseline == current => vec![None; before.len()],
    Err(error) => return Err(error),
  };
  let current_map = if values(&baseline) == values(&current) {
    (0..baseline.len()).map(Some).collect()
  } else if input.baseline.identity()? == input.current.identity()? {
    let positions: HashMap<_, _> = current
      .iter()
      .enumerate()
      .filter_map(|(i, c)| c.id.map(|id| (id, i)))
      .collect();
    let mapping: Vec<_> = baseline
      .iter()
      .map(|c| c.id.and_then(|id| positions.get(&id).copied()))
      .collect();
    let mut previous = None;
    for index in mapping.iter().flatten() {
      if previous.is_some_and(|p| p >= *index) {
        return Err(MergeError::InsufficientEvidence);
      }
      previous = Some(*index);
    }
    mapping
  } else {
    align(&values(&baseline), &values(&current), budget)?
  };
  let merged = reconcile(
    &baseline,
    &current,
    &before,
    &after,
    &current_map,
    &external_map,
    input.editable_marks,
    budget,
  )?;
  Ok(TextPlan {
    identity: input.current.identity()?,
    before: current,
    after: merged,
  })
}

fn characters(text: &Text) -> Result<Vec<Character>, MergeError> {
  let mut result = Vec::new();
  for run in text.identity_runs()? {
    let TextInsert::Text(value) = run.insert else {
      return Err(MergeError::UnsupportedMetadataEffect("embedded_text".into()));
    };
    let mut offset = 0;
    for value in value.chars() {
      result.push(Character {
        value,
        attributes: run.attributes.clone(),
        id: Some(run.id + offset),
        current: Some(result.len()),
      });
      offset += value.len_utf16() as u64;
    }
  }
  Ok(result)
}

fn source_characters(delta: &[TextDeltaOp]) -> Result<Vec<Character>, MergeError> {
  let mut output = Vec::new();
  for op in delta {
    let TextDeltaOp::Insert {
      insert: TextInsert::Text(text),
      format,
    } = op
    else {
      return Err(MergeError::InvalidProjection);
    };
    output.extend(text.chars().map(|value| Character {
      value,
      attributes: format.clone().unwrap_or_default(),
      id: None,
      current: None,
    }));
  }
  Ok(output)
}
fn values(chars: &[Character]) -> Vec<char> {
  chars.iter().map(|c| c.value).collect()
}
fn utf16(chars: &[Character]) -> u64 {
  chars.iter().map(|c| c.value.len_utf16() as u64).sum()
}
