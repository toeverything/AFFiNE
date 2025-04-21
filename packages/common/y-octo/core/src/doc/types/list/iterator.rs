use super::*;

pub(crate) struct ListIterator<'a> {
  pub(super) _lock: RwLockReadGuard<'a, YType>,
  pub(super) cur: Somr<Item>,
}

impl Iterator for ListIterator<'_> {
  type Item = Somr<Item>;

  fn next(&mut self) -> Option<Self::Item> {
    while let Some(item) = self.cur.clone().get() {
      let cur = std::mem::replace(&mut self.cur, item.right.clone());
      if item.deleted() {
        continue;
      }

      return Some(cur);
    }

    None
  }
}
