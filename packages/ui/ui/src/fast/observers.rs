//! When an observer of an entity or a global hears a change: every change
//! made after it was made, and none made before.
//!
//! Upstream inserts an observer pending and activates it at the end of the
//! effect cycle, so that it does not hear changes made before it existed.
//! Separately, a notify or a change of a global queues no second notice while
//! one for the same entity or global already waits in the effect queue. The
//! two together lose a change. Within one update a global changes (a notice
//! is queued), an observer of it is made (its activation is deferred behind
//! that notice), and the global changes again (the change joins the queued
//! notice). The notice then runs while the observer is still pending and
//! skips it, so the observer never hears the second change, though it was
//! made after the observer existed. The same holds for an entity's observers
//! and `notify`.
//!
//! Here each change of an entity or a global takes the next number of a
//! counter, and each waiting notice keeps the number of the last change that
//! joined it ([`Pending`]). An observer is active at once and keeps the number
//! of the last change made before it ([`Observer`]); a notice calls it only
//! when the notice's last change came after it. Every observer still hears
//! each notice once and in the same order, no notice is added, and an
//! observer still never hears a change made before it existed.

use std::{
    any::TypeId,
    collections::HashMap,
    hash::{BuildHasher, Hash},
};

use crate::collections::FxBuildHasher;
use crate::gpui_util::TypeIdHashBuilder;

use crate::{App, EntityId, Subscription};

/// The entities whose notice waits in the effect queue.
pub(crate) type EntityNotices = Pending<EntityId, FxBuildHasher>;

/// The globals whose notice waits in the effect queue.
pub(crate) type GlobalNotices = Pending<TypeId, TypeIdHashBuilder>;

/// The changes of one kind of thing (entities or globals) counted so far,
/// and the things whose notice waits in the effect queue, each with the last
/// change that notice tells.
pub(crate) struct Pending<K, S> {
    notices: HashMap<K, u64, S>,
    changes: u64,
}

impl<K, S: Default> Default for Pending<K, S> {
    fn default() -> Self {
        Self {
            notices: HashMap::default(),
            changes: 0,
        }
    }
}

impl<K: Hash + Eq, S: BuildHasher> Pending<K, S> {
    /// Counts a change of `key`. Returns whether it needs a notice of its
    /// own, which it does unless one for `key` already waits: the change then
    /// joins that notice.
    fn note_change(&mut self, key: K) -> bool {
        self.changes += 1;
        self.notices.insert(key, self.changes).is_none()
    }

    /// Takes `key`'s notice as it is delivered, and returns the last change it
    /// tells.
    fn take_notice(&mut self, key: &K) -> u64 {
        self.notices.remove(key).unwrap_or(self.changes)
    }
}

/// An observer of an entity or a global, with the last change made before
/// it was made.
pub(crate) struct Observer {
    began_after: u64,
    handler: Box<dyn FnMut(&mut App) -> bool + 'static>,
}

/// Counts a notify of `entity`. Returns whether it needs a notice of its own,
/// which it does unless one for `entity` already waits.
pub(crate) fn note_entity_change(cx: &mut App, entity: EntityId) -> bool {
    cx.pending_notifications.note_change(entity)
}

/// Counts a change of the global `global`. Returns whether it needs a notice
/// of its own, which it does unless one for `global` already waits.
pub(crate) fn note_global_change(cx: &mut App, global: TypeId) -> bool {
    cx.pending_global_notifications.note_change(global)
}

/// Takes `entity`'s notice as it is delivered, and returns the last change it
/// tells.
pub(crate) fn take_entity_notice(cx: &mut App, entity: EntityId) -> u64 {
    cx.pending_notifications.take_notice(&entity)
}

/// Takes the global `global`'s notice as it is delivered, and returns the last
/// change it tells.
pub(crate) fn take_global_notice(cx: &mut App, global: TypeId) -> u64 {
    cx.pending_global_notifications.take_notice(&global)
}

/// Calls `observer` for a notice whose last change is `told`, if that change
/// came after the observer was made. Returns whether the observer stays.
pub(crate) fn tell(observer: &mut Observer, told: u64, cx: &mut App) -> bool {
    observer.began_after >= told || (observer.handler)(cx)
}

/// Makes an observer of `entity`, active at once, which hears the changes
/// made from now on.
pub(crate) fn observe_entity(
    cx: &App,
    entity: EntityId,
    handler: Box<dyn FnMut(&mut App) -> bool + 'static>,
) -> Subscription {
    let observer = Observer {
        began_after: cx.pending_notifications.changes,
        handler,
    };
    cx.observers.insert(entity, observer)
}

/// Makes an observer of the global `global`, active at once, which hears the
/// changes made from now on.
pub(crate) fn observe_global(
    cx: &App,
    global: TypeId,
    handler: Box<dyn FnMut(&mut App) -> bool + 'static>,
) -> Subscription {
    let observer = Observer {
        began_after: cx.pending_global_notifications.changes,
        handler,
    };
    cx.global_observers.insert(global, observer)
}
