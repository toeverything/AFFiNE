//! Which windows each entity's notifications invalidate, kept up to date
//! after every draw by touching only the entities a window started or
//! stopped drawing.

use crate::collections::FxHashSet;

use crate::{AnyWindowHandle, App, EntityId, WindowInvalidator};

/// Records that the window drew `entities` and nothing else, as
/// [`App::record_entities_accessed`] does.
///
/// Upstream removed the window's invalidator from every entity it tracked
/// before, then inserted it again for every entity it drew: four map
/// operations and a reference count round trip per entity, every frame,
/// though most frames draw the entities the last one did. A window's
/// invalidator never changes and an entity's entry for the window exists
/// exactly while the window tracks it (only this function, the release of
/// the entity and the window's removal change either), so only entities that
/// left the set lose it, and only those that entered gain it. Each entity
/// drawn still makes the window its current window, as upstream's loop did.
pub(crate) fn record_entities_accessed(
    cx: &mut App,
    window_handle: AnyWindowHandle,
    invalidator: WindowInvalidator,
    entities: &FxHashSet<EntityId>,
) {
    let window_id = window_handle.id;
    let mut tracked_entities = std::mem::take(cx.tracked_entities.entry(window_id).or_default());
    for entity in tracked_entities.iter() {
        if !entities.contains(entity)
            && let Some(windows) = cx.window_invalidators_by_entity.get_mut(entity)
        {
            windows.remove(&window_id);
        }
    }
    for entity in entities.iter() {
        if !tracked_entities.contains(entity) {
            cx.window_invalidators_by_entity
                .entry(*entity)
                .or_default()
                .insert(window_id, invalidator.clone());
        }
        cx.current_window_by_entity.insert(*entity, window_id);
    }
    tracked_entities.clear();
    tracked_entities.extend(entities.iter().copied());
    cx.tracked_entities.insert(window_id, tracked_entities);
}
