use super::*;

#[derive(Debug, Clone)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) enum Parent {
  #[cfg_attr(test, proptest(skip))]
  Type(YTypeRef),
  #[cfg_attr(test, proptest(value = "Parent::String(SmolStr::default())"))]
  String(SmolStr),
  Id(Id),
}

#[derive(Clone)]
#[cfg_attr(all(test, not(loom)), derive(proptest_derive::Arbitrary))]
pub(crate) struct Item {
  pub id: Id,
  pub origin_left_id: Option<Id>,
  pub origin_right_id: Option<Id>,
  #[cfg_attr(all(test, not(loom)), proptest(value = "Somr::none()"))]
  pub left: ItemRef,
  #[cfg_attr(all(test, not(loom)), proptest(value = "Somr::none()"))]
  pub right: ItemRef,
  pub parent: Option<Parent>,
  #[cfg_attr(all(test, not(loom)), proptest(value = "Option::<SmolStr>::None"))]
  pub parent_sub: Option<SmolStr>,
  pub content: Content,
  #[cfg_attr(all(test, not(loom)), proptest(value = "ItemFlag::default()"))]
  pub flags: ItemFlag,
}

// make all Item readonly
pub(crate) type ItemRef = Somr<Item>;

impl PartialEq for Item {
  fn eq(&self, other: &Self) -> bool {
    self.id == other.id
  }
}

impl std::fmt::Debug for Item {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let mut dbg = f.debug_struct("Item");
    dbg
      .field("id", &self.id)
      .field("origin_left_id", &self.origin_left_id)
      .field("origin_right_id", &self.origin_right_id);

    if let Some(left) = self.left.get() {
      dbg.field("left", &left.id);
    }

    if let Some(right) = self.right.get() {
      dbg.field("right", &right.id);
    }

    dbg
      .field(
        "parent",
        &self.parent.as_ref().map(|p| match p {
          Parent::Type(_) => "[Type]".to_string(),
          Parent::String(name) => format!("Parent({name})"),
          Parent::Id(id) => format!("({}, {})", id.client, id.clock),
        }),
      )
      .field("parent_sub", &self.parent_sub)
      .field("content", &self.content)
      .field("flags", &self.flags)
      .finish()
  }
}

impl std::fmt::Display for Item {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "Item{}: [{:?}]", self.id, self.content)
  }
}

impl Default for Item {
  fn default() -> Self {
    Self {
      id: Id::default(),
      origin_left_id: None,
      origin_right_id: None,
      left: Somr::none(),
      right: Somr::none(),
      parent: None,
      parent_sub: None,
      content: Content::Deleted(0),
      flags: ItemFlag::from(0),
    }
  }
}

impl Item {
  pub fn new(
    id: Id,
    content: Content,
    left: Somr<Item>,
    right: Somr<Item>,
    parent: Option<Parent>,
    parent_sub: Option<SmolStr>,
  ) -> Self {
    let flags = ItemFlag::from(if content.countable() {
      item_flags::ITEM_COUNTABLE
    } else {
      0
    });

    Self {
      id,
      origin_left_id: left.get().map(|left| left.last_id()),
      left,
      origin_right_id: right.get().map(|right| right.id),
      right,
      parent,
      parent_sub,
      content,
      flags,
    }
  }

  // find a note that has parent info
  // in crdt tree, not all node has parent info
  // so we need to check left and right node if they have parent info
  pub fn find_node_with_parent_info(&self) -> Option<Item> {
    if self.parent.is_some() {
      return Some(self.clone());
    } else if let Some(item) = self.left.get() {
      if item.parent.is_none() {
        if let Some(item) = item.right.get() {
          return Some(item.clone());
        }
      } else {
        return Some(item.clone());
      }
    } else if let Some(item) = self.right.get() {
      return Some(item.clone());
    }
    None
  }

  pub fn len(&self) -> u64 {
    self.content.clock_len()
  }

  pub fn deleted(&self) -> bool {
    self.flags.deleted()
  }

  pub fn delete(&self) -> bool {
    if self.deleted() {
      return false;
    }

    self.flags.set_deleted();

    true
  }

  pub fn countable(&self) -> bool {
    self.flags.countable()
  }

  pub fn keep(&self) -> bool {
    self.flags.keep()
  }

  pub fn indexable(&self) -> bool {
    self.countable() && !self.deleted()
  }

  pub fn last_id(&self) -> Id {
    let Id { client, clock } = self.id;

    Id::new(client, clock + self.len() - 1)
  }

  pub fn split_at(&self, offset: u64) -> JwstCodecResult<(Self, Self)> {
    debug_assert!(offset > 0 && self.len() > 1 && offset < self.len());
    let id = self.id;
    let right_id = Id::new(id.client, id.clock + offset);
    let (left_content, right_content) = self.content.split(offset)?;

    let left_item = Item::new(
      id,
      left_content,
      // let caller connect left <-> node <-> right
      Somr::none(),
      Somr::none(),
      self.parent.clone(),
      self.parent_sub.clone(),
    );

    let right_item = Item::new(
      right_id,
      right_content,
      // let caller connect left <-> node <-> right
      Somr::none(),
      Somr::none(),
      self.parent.clone(),
      self.parent_sub.clone(),
    );

    if left_item.deleted() {
      left_item.flags.set_deleted();
    }
    if left_item.keep() {
      left_item.flags.set_keep();
    }

    Ok((left_item, right_item))
  }

  fn get_info(&self) -> u8 {
    let mut info = self.content.get_info();

    if self.origin_left_id.is_some() {
      info |= item_flags::ITEM_HAS_LEFT_ID;
    }
    if self.origin_right_id.is_some() {
      info |= item_flags::ITEM_HAS_RIGHT_ID;
    }
    if self.parent_sub.is_some() {
      info |= item_flags::ITEM_HAS_PARENT_SUB;
    }

    info
  }

  pub fn is_valid(&self) -> bool {
    let has_id = self.origin_left_id.is_some() || self.origin_right_id.is_some();
    !has_id && self.parent.is_some() || has_id && self.parent.is_none() && self.parent_sub.is_none()
  }

  pub fn read<R: CrdtReader>(decoder: &mut R, id: Id, info: u8, first_5_bit: u8) -> JwstCodecResult<Self> {
    let flags: ItemFlag = info.into();
    let has_left_id = flags.check(item_flags::ITEM_HAS_LEFT_ID);
    let has_right_id = flags.check(item_flags::ITEM_HAS_RIGHT_ID);
    let has_parent_sub = flags.check(item_flags::ITEM_HAS_PARENT_SUB);
    let has_not_sibling = flags.not(item_flags::ITEM_HAS_SIBLING);

    // NOTE: read order must keep the same as the order in yjs
    // TODO: this data structure design will break the cpu OOE, need to be optimized
    let item = Self {
      id,
      origin_left_id: if has_left_id {
        Some(decoder.read_item_id()?)
      } else {
        None
      },
      origin_right_id: if has_right_id {
        Some(decoder.read_item_id()?)
      } else {
        None
      },
      parent: {
        if has_not_sibling {
          let has_parent = decoder.read_var_u64()? == 1;
          Some(if has_parent {
            Parent::String(SmolStr::new(decoder.read_var_string()?))
          } else {
            Parent::Id(decoder.read_item_id()?)
          })
        } else {
          None
        }
      },
      parent_sub: if has_not_sibling && has_parent_sub {
        Some(SmolStr::new(decoder.read_var_string()?))
      } else {
        None
      },
      content: {
        // tag must not GC or Skip, this must process in parse_struct
        debug_assert_ne!(first_5_bit, 0);
        debug_assert_ne!(first_5_bit, 10);
        Content::read(decoder, first_5_bit)?
      },
      left: Somr::none(),
      right: Somr::none(),
      flags: ItemFlag::from(0),
    };

    if item.content.countable() {
      item.flags.set_countable();
    }

    if matches!(item.content, Content::Deleted(_)) {
      item.flags.set_deleted();
    }

    debug_assert!(item.is_valid());

    Ok(item)
  }

  pub fn write<W: CrdtWriter>(&self, encoder: &mut W) -> JwstCodecResult {
    let info = self.get_info();
    let has_not_sibling = info & item_flags::ITEM_HAS_SIBLING == 0;

    encoder.write_info(info)?;

    if let Some(left_id) = self.origin_left_id {
      encoder.write_item_id(&left_id)?;
    }
    if let Some(right_id) = self.origin_right_id {
      encoder.write_item_id(&right_id)?;
    }

    if has_not_sibling {
      if let Some(parent) = &self.parent {
        match parent {
          Parent::String(s) => {
            encoder.write_var_u64(1)?;
            encoder.write_var_string(s)?;
          }
          Parent::Id(id) => {
            encoder.write_var_u64(0)?;
            encoder.write_item_id(id)?;
          }
          Parent::Type(ty) => {
            if let Some(ty) = ty.ty() {
              if let Some(item) = ty.item.get() {
                encoder.write_var_u64(0)?;
                encoder.write_item_id(&item.id)?;
              } else if let Some(name) = &ty.root_name {
                encoder.write_var_u64(1)?;
                encoder.write_var_string(name)?;
              }
            }
          }
        }
      } else {
        // if item delete, it must not exists in crdt state tree
        debug_assert!(!self.deleted());
        return Err(JwstCodecError::ParentNotFound);
      }

      if let Some(parent_sub) = &self.parent_sub {
        encoder.write_var_string(parent_sub)?;
      }
    }

    self.content.write(encoder)?;

    Ok(())
  }

  pub fn deep_compare(&self, other: &Self) -> bool {
    if self.id != other.id
      || self.deleted() != other.deleted()
      || self.len() != other.len()
      || self.left.get().map(|l| l.last_id()) != other.left.get().map(|l| l.last_id())
      || self.right.get().map(|r| r.id) != other.right.get().map(|r| r.id)
      || self.origin_left_id != other.origin_left_id
      || self.origin_right_id != other.origin_right_id
      || self.parent_sub != other.parent_sub
    {
      return false;
    }

    true
  }
}

#[allow(dead_code)]
#[cfg(any(debug, test))]
impl Item {
  pub fn print_left(&self) {
    let mut ret = vec![format!("Self{}: [{:?}]", self.id, self.content)];
    let mut left: Somr<Item> = self.left.clone();

    while let Some(item) = left.get() {
      ret.push(format!("{item}"));
      left = item.left.clone();
    }
    ret.reverse();

    println!("{}", ret.join(" <- "));
  }

  pub fn print_right(&self) {
    let mut ret = vec![format!("Self{}: [{:?}]", self.id, self.content)];
    let mut right = self.right.clone();

    while let Some(item) = right.get() {
      ret.push(format!("{item}"));
      right = item.right.clone();
    }

    println!("{}", ret.join(" -> "));
  }
}

#[cfg(test)]
mod tests {
  #[cfg(not(loom))]
  use proptest::{collection::vec, prelude::*};

  #[cfg(not(loom))]
  use super::*;

  #[cfg(not(loom))]
  fn item_round_trip(item: &mut Item) -> JwstCodecResult {
    if !item.is_valid() {
      return Ok(());
    }

    if item.content.countable() {
      item.flags.set_countable();
    }

    let mut encoder = RawEncoder::default();
    item.write(&mut encoder)?;

    let update = encoder.into_inner();
    let mut decoder = RawDecoder::new(&update);

    let info = decoder.read_info()?;
    let first_5_bit = info & 0b11111;
    let decoded_item = Item::read(&mut decoder, item.id, info, first_5_bit)?;

    assert_eq!(item, &decoded_item);

    Ok(())
  }

  #[cfg(not(loom))]
  proptest! {
      #[test]
      #[cfg_attr(miri, ignore)]
      fn test_random_content(mut items in vec(any::<Item>(), 0..10)) {
          for item in &mut items {
              item_round_trip(item).unwrap();
          }
      }
  }
}
