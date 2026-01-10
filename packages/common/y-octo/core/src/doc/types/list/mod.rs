mod iterator;
mod search_marker;

pub(crate) use iterator::ListIterator;
pub(crate) use search_marker::MarkerList;

use super::*;

#[derive(Debug)]
pub(crate) struct ItemPosition {
  pub parent: YTypeRef,
  pub left: ItemRef,
  pub right: ItemRef,
  pub index: u64,
  pub offset: u64,
}

impl ItemPosition {
  pub fn forward(&mut self) {
    if let Some(right) = self.right.get() {
      if right.indexable() {
        self.index += right.len();
      }

      self.left = self.right.clone();
      self.right = right.right.clone();
    } else {
      // FAIL
    }
  }

  /// we found a position cursor point in between a splitable item,
  /// we need to split the item by the offset.
  ///
  /// before:
  /// ---------------------------------
  ///    ^left                ^right
  ///            ^offset
  /// after:
  /// ---------------------------------
  ///    ^left   ^right
  pub fn normalize(&mut self, store: &mut DocStore) -> JwstCodecResult {
    if self.offset > 0 {
      debug_assert!(self.left.is_some());
      if let Some(left) = self.left.get() {
        let (left, right) = store.split_node(left.id, self.offset)?;
        self.left = left.as_item();
        self.right = right.as_item();
        self.index += self.offset;
        self.offset = 0;
      }
    }

    Ok(())
  }
}

pub(crate) trait ListType: AsInner<Inner = YTypeRef> {
  #[inline(always)]
  fn _id(&self) -> Option<Id> {
    self.as_inner().ty().and_then(|ty| ty.item.get().map(|item| item.id))
  }

  #[inline(always)]
  fn content_len(&self) -> u64 {
    self.as_inner().ty().unwrap().len
  }

  fn iter_item(&self) -> ListIterator<'_> {
    let inner = self.as_inner().ty().unwrap();
    ListIterator {
      cur: inner.start.clone(),
      _lock: inner,
    }
  }

  fn find_pos(&self, inner: &YType, index: u64) -> Option<ItemPosition> {
    let mut remaining = index;
    let start = inner.start.clone();

    let mut pos = ItemPosition {
      parent: self.as_inner().clone(),
      left: Somr::none(),
      right: start,
      index: 0,
      offset: 0,
    };

    if pos.right.is_none() {
      return Some(pos);
    }

    if let Some(markers) = &inner.markers
      && let Some(marker) = markers.find_marker(inner, index)
    {
      if marker.index > remaining {
        remaining = 0
      } else {
        remaining -= marker.index;
      }
      pos.index = marker.index;
      pos.left = marker.ptr.get().map(|ptr| ptr.left.clone()).unwrap_or_default();
      pos.right = marker.ptr;
    };

    // avoid the first item of the list being deleted
    while let Some(item) = pos.right.get() {
      if item.deleted() {
        pos.right = item.right.clone();
        continue;
      } else {
        break;
      }
    }

    while remaining > 0 {
      if let Some(item) = pos.right.get() {
        if item.indexable() {
          let content_len = item.len();
          if remaining < content_len {
            pos.offset = remaining;
            remaining = 0;
          } else {
            pos.index += content_len;
            remaining -= content_len;
          }
        }

        pos.left = pos.right.clone();
        pos.right = item.right.clone();
      } else {
        return None;
      }
    }

    Some(pos)
  }

  fn insert_at(&mut self, index: u64, content: Content) -> JwstCodecResult {
    if index > self.content_len() {
      return Err(JwstCodecError::IndexOutOfBound(index));
    }

    if let Some((mut store, mut ty)) = self.as_inner().write() {
      if let Some(mut pos) = self.find_pos(&ty, index) {
        pos.normalize(&mut store)?;
        Self::insert_after(&mut ty, &mut store, pos, content)?;
      }
    } else {
      return Err(JwstCodecError::DocReleased);
    }

    Ok(())
  }

  fn insert_after(ty: &mut YType, store: &mut DocStore, pos: ItemPosition, content: Content) -> JwstCodecResult {
    if let Some(markers) = &ty.markers
      && content.countable()
    {
      markers.update_marker_changes(pos.index, content.clock_len() as i64);
    }

    let item = store.create_item(
      content,
      pos.left.clone(),
      pos.right.clone(),
      Some(Parent::Type(pos.parent)),
      None,
    );

    store.integrate(Node::Item(item), 0, Some(ty))?;

    Ok(())
  }

  fn get_item_at(&self, index: u64) -> Option<(Somr<Item>, u64)> {
    if index >= self.content_len() {
      return None;
    }

    let ty = self.as_inner().ty().unwrap();

    if let Some(pos) = self.find_pos(&ty, index) {
      if pos.offset == 0 {
        return Some((pos.right, 0));
      } else {
        return Some((pos.left, pos.offset));
      }
    }

    None
  }

  fn remove_at(&mut self, idx: u64, len: u64) -> JwstCodecResult {
    if len == 0 {
      return Ok(());
    }

    let content_len = self.content_len();
    if content_len == 0 {
      return Ok(());
    }

    if idx >= content_len {
      return Err(JwstCodecError::IndexOutOfBound(idx));
    }

    if let Some((mut store, mut ty)) = self.as_inner().write() {
      if let Some(pos) = self.find_pos(&ty, idx) {
        Self::remove_after(&mut ty, &mut store, pos, len)?;
      }
    } else {
      return Err(JwstCodecError::DocReleased);
    }

    Ok(())
  }

  fn remove_after(ty: &mut YType, store: &mut DocStore, mut pos: ItemPosition, len: u64) -> JwstCodecResult {
    pos.normalize(store)?;

    let mut remaining = len;

    while remaining > 0 {
      let item_ref = pos.right.clone();
      let Some((indexable, content_len, item_id)) = item_ref.get().map(|item| (item.indexable(), item.len(), item.id))
      else {
        break;
      };

      if indexable {
        if remaining < content_len {
          store.split_node(item_id, remaining)?;
          remaining = 0;
        } else {
          remaining -= content_len;
        }

        if let Some(item) = item_ref.get() {
          store.delete_item(item, Some(ty));
        }
      }

      pos.forward();
    }

    if let Some(markers) = &ty.markers {
      markers.update_marker_changes(pos.index, -((len - remaining) as i64));
    }

    Ok(())
  }
}
