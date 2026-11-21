//! Compact storage for an element's rarely used interactivity: lazily allocated listener lists and accessibility properties.

use crate::AriaProperties;
use std::{
    mem,
    ops::{Deref, DerefMut},
};

/// An element's accessibility properties, allocated once one of them is set.
///
/// Most elements set none, and an [`Interactivity`] moves with its element
/// through every call of its builder, so the properties' 300-odd bytes are
/// kept out of it until they are needed.
///
/// [`Interactivity`]: crate::Interactivity
#[derive(Default)]
pub(crate) struct Aria(Option<Box<AriaProperties>>);

static NO_ARIA: AriaProperties = AriaProperties {
    author_id: None,
    label: None,
    description: None,
    keyshortcuts: None,
    selected: None,
    expanded: None,
    toggled: None,
    numeric_value: None,
    min_numeric_value: None,
    max_numeric_value: None,
    numeric_value_step: None,
    value: None,
    placeholder: None,
    orientation: None,
    level: None,
    position_in_set: None,
    size_of_set: None,
    row_index: None,
    column_index: None,
    row_count: None,
    column_count: None,
};

impl Deref for Aria {
    type Target = AriaProperties;

    fn deref(&self) -> &AriaProperties {
        self.0.as_deref().unwrap_or(&NO_ARIA)
    }
}

impl DerefMut for Aria {
    fn deref_mut(&mut self) -> &mut AriaProperties {
        self.0.get_or_insert_with(Default::default)
    }
}

/// A part of an element's interactivity that few elements set, such as a drag
/// listener, a tooltip or a group's hover style, boxed to one pointer.
///
/// An [`Interactivity`] is built for every div of every frame, and moves with
/// its element through every call of its builder. Held inline, these parts
/// were 130-odd of its bytes, written and copied for every element though
/// almost always empty. Boxed, the few elements that set one pay for an
/// allocation instead.
///
/// [`Interactivity`]: crate::Interactivity
pub(crate) type Rare<T> = Option<Box<T>>;

/// A [`Rare`] part holding `value`.
#[inline]
pub(crate) fn rare<T>(value: T) -> Rare<T> {
    Some(Box::new(value))
}

/// A [`Rare`] part holding `value`, if there is one.
#[inline]
pub(crate) fn rare_option<T>(value: Option<T>) -> Rare<T> {
    value.map(Box::new)
}

/// A list one pointer wide that allocates nothing while it is empty.
///
/// An [`Interactivity`] holds a score of listener lists, nearly all of them
/// empty on any one element, and moves with its element through every call
/// of its builder. As `Vec`s they were 500 of its bytes, copied every time.
///
/// [`Interactivity`]: crate::Interactivity
// A boxed `Vec` is one pointer where a `Vec` is three, which is the point;
// the second allocation is paid only by a list that has something in it.
#[allow(clippy::box_collection)]
pub(crate) struct LazyVec<T>(Option<Box<Vec<T>>>);

impl<T> Default for LazyVec<T> {
    fn default() -> Self {
        LazyVec(None)
    }
}

impl<T: Clone> Clone for LazyVec<T> {
    fn clone(&self) -> Self {
        LazyVec(self.0.clone())
    }
}

impl<T> LazyVec<T> {
    pub(crate) fn push(&mut self, item: T) {
        self.0.get_or_insert_with(Default::default).push(item);
    }

    /// Takes every item out, leaving the list empty.
    pub(crate) fn drain(&mut self, _: std::ops::RangeFull) -> std::vec::IntoIter<T> {
        mem::take(self).into_iter()
    }
}

impl<T> Deref for LazyVec<T> {
    type Target = [T];

    fn deref(&self) -> &[T] {
        self.0.as_deref().map_or(&[], Vec::as_slice)
    }
}

impl<T> IntoIterator for LazyVec<T> {
    type Item = T;
    type IntoIter = std::vec::IntoIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.map(|items| *items).unwrap_or_default().into_iter()
    }
}

impl<'a, T> IntoIterator for &'a LazyVec<T> {
    type Item = &'a T;
    type IntoIter = std::slice::Iter<'a, T>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}
