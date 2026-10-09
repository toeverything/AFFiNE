use std::collections::BTreeMap;

use super::{Any, MergeError, TextIdentityRun, TypeIdentity, Value, WorkBudget};

#[derive(Debug, Clone, PartialEq)]
pub enum ObservedValue {
  Map(TypeIdentity, BTreeMap<String, ObservedValue>),
  Array(TypeIdentity, Vec<ObservedValue>),
  Text(TypeIdentity, Vec<TextIdentityRun>),
  Any(Any),
}

/// Captures value and shared-type identity for retention and deletion checks.
pub fn observe(value: Value, budget: &mut WorkBudget) -> Result<ObservedValue, MergeError> {
  fn visit(value: Value, depth: usize, budget: &mut WorkBudget) -> Result<ObservedValue, MergeError> {
    budget.spend(1)?;
    if depth > 128 {
      return Err(MergeError::BudgetExceeded);
    }
    Ok(match value {
      Value::Map(map) => ObservedValue::Map(
        map.identity()?,
        map
          .iter()
          .map(|(key, value)| Ok((key.to_owned(), visit(value, depth + 1, budget)?)))
          .collect::<Result<_, MergeError>>()?,
      ),
      Value::Array(array) => ObservedValue::Array(
        array.identity()?,
        array
          .iter()
          .map(|v| visit(v, depth + 1, budget))
          .collect::<Result<_, _>>()?,
      ),
      Value::Text(text) => ObservedValue::Text(text.identity()?, text.identity_runs()?),
      Value::Any(value) => ObservedValue::Any(value),
      _ => return Err(MergeError::UnsupportedMetadataEffect("shared_type".into())),
    })
  }
  visit(value, 0, budget)
}
