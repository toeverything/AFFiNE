use super::{MergeError, WorkBudget};

/// Returns the unique retained-character correspondence. Different operation
/// orders with the same retained characters are equivalent.
pub(super) fn align<T: PartialEq>(
  old: &[T],
  new: &[T],
  budget: &mut WorkBudget,
) -> Result<Vec<Option<usize>>, MergeError> {
  if old == new {
    return Ok((0..old.len()).map(Some).collect());
  }
  if old.is_empty() || new.is_empty() {
    return Ok(vec![None; old.len()]);
  }
  let mut band = old.len().abs_diff(new.len()).max(1);
  loop {
    let width = band
      .checked_mul(2)
      .and_then(|n| n.checked_add(1))
      .ok_or(MergeError::BudgetExceeded)?;
    let cells = (old.len() + 1).checked_mul(width).ok_or(MergeError::BudgetExceeded)?;
    if cells > 2_000_000 {
      return Err(MergeError::BudgetExceeded);
    }
    budget.spend(cells.saturating_mul(2))?;
    let mut scores = vec![usize::MAX / 4; cells];
    let index = |i: usize, j: usize| -> Option<usize> {
      if i > old.len() || j > new.len() || i.abs_diff(j) > band {
        return None;
      }
      Some(i * width + (j + band - i))
    };
    let get = |scores: &[usize], i, j| index(i, j).map(|k| scores[k]).unwrap_or(usize::MAX / 4);
    for i in (0..=old.len()).rev() {
      let start = i.saturating_sub(band);
      let end = (i + band).min(new.len());
      for j in (start..=end).rev() {
        let Some(k) = index(i, j) else { continue };
        scores[k] = if i == old.len() && j == new.len() {
          0
        } else {
          let mut best = (get(&scores, i + 1, j) + 1).min(get(&scores, i, j + 1) + 1);
          if i < old.len() && j < new.len() && old[i] == new[j] {
            best = best.min(get(&scores, i + 1, j + 1));
          }
          best
        };
      }
    }
    if get(&scores, 0, 0) > band {
      band = band.checked_mul(2).ok_or(MergeError::BudgetExceeded)?;
      continue;
    }
    let mut reachable = vec![false; cells];
    reachable[index(0, 0).unwrap()] = true;
    let mut matches = vec![None; old.len()];
    let mut deleted = vec![false; old.len()];
    for i in 0..=old.len() {
      for j in i.saturating_sub(band)..=(i + band).min(new.len()) {
        let k = index(i, j).unwrap();
        if !reachable[k] {
          continue;
        }
        let score = scores[k];
        if i < old.len() && score == get(&scores, i + 1, j) + 1 {
          deleted[i] = true;
          if matches[i].is_some() {
            return Err(MergeError::AmbiguousIdentity);
          }
          if let Some(next) = index(i + 1, j) {
            reachable[next] = true;
          }
        }
        if j < new.len()
          && score == get(&scores, i, j + 1) + 1
          && let Some(next) = index(i, j + 1)
        {
          reachable[next] = true;
        }
        if i < old.len() && j < new.len() && old[i] == new[j] && score == get(&scores, i + 1, j + 1) {
          if deleted[i] || matches[i].is_some_and(|previous| previous != j) {
            return Err(MergeError::AmbiguousIdentity);
          }
          matches[i] = Some(j);
          reachable[index(i + 1, j + 1).unwrap()] = true;
        }
      }
    }
    return Ok(matches);
  }
}
