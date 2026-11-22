//! What a retained subtree read while it was built — entities, globals and versioned state — and how the app records it.

use std::{
    any::TypeId,
    cell::{Cell, RefCell},
    ops::Range,
    rc::Rc,
};

use crate::collections::{FxHashMap, FxHashSet, TypeIdHashMap};
use smallvec::SmallVec;

use crate::{App, Context, Entity, EntityId, EntityMap};

/// The app's side of recording what retained subtrees read: when each global
/// last changed, and what was read while a recording is open.
#[derive(Default)]
pub(crate) struct AppDependencies {
    /// Counts the changes to globals, each of which is stamped into
    /// `global_changed_at`, so a retained subtree can tell whether a global
    /// it read has changed since it was built.
    global_generation: u64,
    global_changed_at: TypeIdHashMap<u64>,
    /// Every global read while a recording is open. See
    /// [`App::begin_recording_dependencies`].
    global_read_log: Rc<RefCell<Vec<TypeId>>>,
    /// Every [`StateVersion`] read while a recording is open, with the
    /// version it was at.
    state_read_log: Rc<RefCell<Vec<(StateVersion, u64)>>>,
    /// For each open recording, innermost last, the stretches of the logs that
    /// recordings nested in it, or dependencies replayed into it, took up:
    /// what it read through a nested subtree rather than itself.
    nested: Vec<Vec<LogRanges>>,
    /// Room to sort what a recording read in before it is interned, kept from
    /// one recording to the next.
    scratch_entities: Vec<EntityId>,
    scratch_globals: Vec<TypeId>,
    /// The lists of entities and globals retained subtrees read. See
    /// [`Interned`].
    interned_entities: Interned<EntityId>,
    interned_globals: Interned<TypeId>,
    /// The list of no versioned state, which most subtrees read.
    no_states: Option<Rc<[(StateVersion, u64)]>>,
}

/// Lists of what retained subtrees read, each kept once and shared by every
/// subtree that read the same: a view built again reads what it read last
/// frame, a recording's own reads are often all of its reads, and many rows
/// read the same few entities. A recording finished with a list already held
/// takes it without allocating.
///
/// Lists nothing else holds any more are dropped once the set has doubled
/// since it was last swept, so it stays about as large as what is in use.
struct Interned<T> {
    lists: FxHashSet<Rc<[T]>>,
    sweep_at: usize,
    empty: Rc<[T]>,
}

impl<T> Default for Interned<T> {
    fn default() -> Self {
        Self {
            lists: FxHashSet::default(),
            sweep_at: 1024,
            empty: Rc::from(Vec::new()),
        }
    }
}

impl<T: Eq + std::hash::Hash + Copy> Interned<T> {
    /// The shared list holding `items`, which are sorted without repeats.
    fn get(&mut self, items: &[T]) -> Rc<[T]> {
        if items.is_empty() {
            return self.empty.clone();
        }
        if let Some(list) = self.lists.get(items) {
            return list.clone();
        }
        if self.lists.len() >= self.sweep_at {
            self.lists.retain(|list| Rc::strong_count(list) > 1);
            self.sweep_at = (self.lists.len() * 2).max(1024);
        }
        let list: Rc<[T]> = Rc::from(items);
        self.lists.insert(list.clone());
        list
    }
}

/// Sorts `items` and removes repeats.
fn sort_unique<T: Ord>(items: &mut Vec<T>) {
    items.sort_unstable();
    items.dedup();
}

/// Records, for any recording that is open, that whether a global of type `G`
/// is set was read, as [`App::has_global`] does. Only setting it where it was
/// not, or removing it, changes that; writing to it does not.
#[inline]
pub(crate) fn note_global_presence_read<G: 'static>(cx: &App) {
    note_global_read(cx, TypeId::of::<GlobalPresence<G>>());
}

/// Stamps a change to whether a global of type `G` is set, if it is about to
/// be set where it was not.
pub(crate) fn note_global_inserted<G: 'static>(cx: &mut App) {
    if !cx.globals_by_type.contains_key(&TypeId::of::<G>()) {
        cx.dependencies
            .global_changed(TypeId::of::<GlobalPresence<G>>());
    }
}

/// Stamps a change to whether a global of type `G` is set, as it is about to
/// be removed.
pub(crate) fn note_global_removed<G: 'static>(cx: &mut App) {
    cx.dependencies
        .global_changed(TypeId::of::<GlobalPresence<G>>());
}

/// Stamps a change to the global of type `global_type`, as its observers are
/// about to be notified.
#[inline(always)]
pub(crate) fn global_changed(cx: &mut App, global_type: TypeId) {
    cx.dependencies.global_changed(global_type);
}

/// Stands for whether a global of type `G` is set, which a subtree that
/// only asked [`App::has_global`] depends on rather than on the global.
struct GlobalPresence<G>(std::marker::PhantomData<G>);

/// Stretches of the three read logs.
#[derive(Clone)]
struct LogRanges {
    entities: Range<usize>,
    globals: Range<usize>,
    states: Range<usize>,
}

impl AppDependencies {
    /// Stamps a change to the global of type `global_type`.
    pub(crate) fn global_changed(&mut self, global_type: TypeId) {
        // Stamped on every change, not only the first one an effect is queued
        // for: a subtree built in between has seen only the first.
        self.global_generation += 1;
        self.global_changed_at
            .insert(global_type, self.global_generation);
    }
}

/// Parts of a window's state a view can read while it is drawn without
/// reading an entity or a global: each is recorded as a global of its own
/// type, and marked changed when the window's input changes it. See
/// [`AmbientReads`].
pub(crate) mod ambient {
    /// Where the pointer is: [`crate::Window::mouse_position`].
    pub(crate) struct Pointer;
    /// The modifier keys and caps lock: [`crate::Window::modifiers`] and
    /// [`crate::Window::capslock`].
    pub(crate) struct Keys;
}

/// A window's handle on the app's dependency recording, so that reading the
/// window's own state while a view is drawn is recorded as a dependency of
/// the view, as reading a global is.
#[derive(Clone)]
pub(crate) struct AmbientReads {
    globals: Rc<RefCell<Vec<TypeId>>>,
    recordings: Rc<Cell<usize>>,
}

impl AmbientReads {
    /// Records, for any recording that is open, that the ambient state `T`
    /// was read.
    #[inline]
    pub(crate) fn note<T: 'static>(&self) {
        if self.recordings.get() > 0 {
            self.globals.borrow_mut().push(TypeId::of::<T>());
        }
    }
}

/// Notes, for any recording that is open, that `window`'s pointer position
/// was read.
#[inline(always)]
pub(crate) fn read_pointer(window: &crate::Window) {
    window
        .retained_state
        .ambient_reads
        .note::<ambient::Pointer>();
}

/// Notes, for any recording that is open, that `window`'s modifier keys or
/// caps lock were read.
#[inline(always)]
pub(crate) fn read_keys(window: &crate::Window) {
    window.retained_state.ambient_reads.note::<ambient::Keys>();
}

/// The pointer and modifier keys before a window handled an input event, to
/// tell afterwards which of them the event changed.
pub(crate) struct AmbientInput {
    position: crate::Point<crate::Pixels>,
    modifiers: crate::Modifiers,
    capslock: crate::Capslock,
}

impl AmbientInput {
    pub(crate) fn of(window: &crate::Window) -> Self {
        AmbientInput {
            position: window.mouse_position(),
            modifiers: window.modifiers(),
            capslock: window.capslock(),
        }
    }

    /// Marks what the event changed as changed, for the views that read it
    /// while they were drawn.
    pub(crate) fn stamp_changes(self, window: &crate::Window, cx: &mut App) {
        if window.mouse_position() != self.position {
            cx.ambient_changed::<ambient::Pointer>();
        }
        if window.modifiers() != self.modifiers || window.capslock() != self.capslock {
            cx.ambient_changed::<ambient::Keys>();
        }
    }
}

impl App {
    /// A handle for a window to record reads of its own state with.
    pub(crate) fn ambient_reads(&self) -> AmbientReads {
        AmbientReads {
            globals: self.dependencies.global_read_log.clone(),
            recordings: self.entities.access_log.recordings.clone(),
        }
    }

    /// Stamps a change to the ambient state `T`, as a write to a global.
    pub(crate) fn ambient_changed<T: 'static>(&mut self) {
        self.dependencies.global_changed(TypeId::of::<T>());
    }

    /// Starts recording what is read from here on — the entities accessed and
    /// the globals read — for a subtree that is drawn again from what it drew
    /// while none of it changes. Recordings nest; each sees everything read
    /// while it is open, including what nested ones saw.
    pub(crate) fn begin_recording_dependencies(&mut self) -> DependencyRecording {
        self.dependencies.nested.push(Vec::new());
        ReadLogs::share(&self.entities.access_log, &self.dependencies);
        DependencyRecording {
            entities: self.entities.begin_recording(),
            globals: self.dependencies.global_read_log.borrow_mut().len(),
            states: self.dependencies.state_read_log.borrow_mut().len(),
            generation: self.dependencies.global_generation,
            updates: self.entities.access_log.update_generation,
            writes: self.entities.access_log.write_generation.get(),
        }
    }

    /// Ends `recording`, returning what was read while it was open: all of
    /// it, and what was read outside the recordings nested in it.
    pub(crate) fn finish_recording_dependencies(
        &mut self,
        recording: DependencyRecording,
    ) -> RecordedDependencies {
        let log = &mut self.dependencies;
        let nested = log.nested.pop().unwrap_or_default();
        let ranges = LogRanges {
            entities: recording.entities..self.entities.access_log.len(),
            globals: recording.globals..log.global_read_log.borrow().len(),
            states: recording.states..log.state_read_log.borrow_mut().len(),
        };

        let (entities, own_entities) = {
            let access_log = self.entities.access_log.access_log.borrow();
            let scratch = &mut log.scratch_entities;
            scratch.clear();
            scratch.extend_from_slice(&access_log[ranges.entities.clone()]);
            sort_unique(scratch);
            let entities = log.interned_entities.get(scratch);
            scratch.clear();
            outside(
                &access_log,
                &ranges.entities,
                nested.iter().map(|n| &n.entities),
                scratch,
            );
            sort_unique(scratch);
            (entities, log.interned_entities.get(scratch))
        };
        let (globals, own_globals) = {
            let globals_log = log.global_read_log.borrow();
            let scratch = &mut log.scratch_globals;
            scratch.clear();
            scratch.extend_from_slice(&globals_log[ranges.globals.clone()]);
            sort_unique(scratch);
            let globals = log.interned_globals.get(scratch);
            scratch.clear();
            outside(
                &globals_log,
                &ranges.globals,
                nested.iter().map(|n| &n.globals),
                scratch,
            );
            sort_unique(scratch);
            (globals, log.interned_globals.get(scratch))
        };
        let no_states = log
            .no_states
            .get_or_insert_with(|| Rc::from(Vec::new()))
            .clone();
        let (states, own_states) = {
            let states_log = log.state_read_log.borrow();
            let states = dedup_states(&states_log[ranges.states.clone()], &no_states);
            let own_states = if ranges.states.is_empty() {
                no_states
            } else {
                let mut own = Vec::new();
                outside(
                    &states_log,
                    &ranges.states,
                    nested.iter().map(|n| &n.states),
                    &mut own,
                );
                dedup_states(&own, &no_states)
            };
            (states, own_states)
        };
        self.entities.close_recording(recording.entities);
        if let Some(parent) = self.dependencies.nested.last_mut() {
            parent.push(ranges);
        }
        if !self.entities.is_recording() {
            self.dependencies.global_read_log.borrow_mut().clear();
            self.dependencies.state_read_log.borrow_mut().clear();
        }
        let writes = writes_while_open(&recording, &self.entities.access_log);
        RecordedDependencies {
            render: None,
            all: RenderDependencies {
                entities,
                globals,
                states,
                // As of when the recording began, so that a global written
                // while it was open, after being read, counts as changed.
                generation: recording.generation,
                updates: recording.updates,
                writes: writes.clone(),
            },
            own: RenderDependencies {
                entities: own_entities,
                globals: own_globals,
                states: own_states,
                generation: recording.generation,
                updates: recording.updates,
                writes,
            },
        }
    }

    /// What `recording`, the innermost recording open, saw read so far
    /// outside the recordings nested in it: what a view read itself while its
    /// `render` ran, when taken as `render` returns, before the elements it
    /// built are laid out and the views nested in them render. When it built a
    /// list, only what it read before it built the last one counts (see
    /// [`crate::fast::layers::invalidate::list_built`]).
    pub(crate) fn dependencies_so_far(
        &mut self,
        recording: &DependencyRecording,
    ) -> RenderDependencies {
        let log = &mut self.dependencies;
        let empty = Vec::new();
        let nested = log.nested.last().unwrap_or(&empty);
        let mut entities_range = recording.entities..self.entities.access_log.len();
        let mut globals_range = recording.globals..log.global_read_log.borrow().len();
        let mut states_range = recording.states..log.state_read_log.borrow().len();

        let entities = {
            let access_log = self.entities.access_log.access_log.borrow();
            let scratch = &mut log.scratch_entities;
            scratch.clear();
            outside(
                &access_log,
                &entities_range,
                nested.iter().map(|n| &n.entities),
                scratch,
            );
            sort_unique(scratch);
            log.interned_entities.get(scratch)
        };
        let globals = {
            let globals_log = log.global_read_log.borrow();
            let scratch = &mut log.scratch_globals;
            scratch.clear();
            outside(
                &globals_log,
                &globals_range,
                nested.iter().map(|n| &n.globals),
                scratch,
            );
            sort_unique(scratch);
            log.interned_globals.get(scratch)
        };
        let no_states = log
            .no_states
            .get_or_insert_with(|| Rc::from(Vec::new()))
            .clone();
        let mut own_states = Vec::new();
        outside(
            &log.state_read_log.borrow(),
            &states_range,
            nested.iter().map(|n| &n.states),
            &mut own_states,
        );
        let states = dedup_states(&own_states, &no_states);
        RenderDependencies {
            entities,
            globals,
            states,
            generation: recording.generation,
            updates: recording.updates,
            writes: writes_while_open(recording, &self.entities.access_log),
        }
    }

    /// Tells the window, and any recording that is open, that `dependencies`
    /// were read again, as they are when a subtree built from them is reused.
    pub(crate) fn replay_dependencies(&mut self, dependencies: &RenderDependencies) {
        let start = LogRanges {
            entities: self.entities.access_log.len()..0,
            globals: self.dependencies.global_read_log.borrow_mut().len()..0,
            states: self.dependencies.state_read_log.borrow_mut().len()..0,
        };
        self.entities.mark_access_boundary();
        self.entities
            .extend_accessed_recorded(dependencies.entities.iter());
        self.entities.mark_access_boundary();
        if self.entities.is_recording() {
            self.dependencies
                .global_read_log
                .borrow_mut()
                .extend(dependencies.globals.iter().copied());
            self.dependencies
                .state_read_log
                .borrow_mut()
                .extend(dependencies.states.iter().cloned());
            // Read through the subtree being reused, not by the recording
            // it is reused in.
            let ranges = LogRanges {
                entities: start.entities.start..self.entities.access_log.len(),
                globals: start.globals.start..self.dependencies.global_read_log.borrow_mut().len(),
                states: start.states.start..self.dependencies.state_read_log.borrow_mut().len(),
            };
            if let Some(open) = self.dependencies.nested.last_mut() {
                open.push(ranges);
            }
        }
    }

    /// Whether anything in `dependencies` may have changed since they were
    /// recorded: one of the entities was changed since — updated and
    /// notified, or notified while drawing — or one of the globals has been
    /// written.
    ///
    /// An entity notified without being updated — as a scroll wheel, a
    /// dragged scrollbar or an animation notifies the view to draw again —
    /// holds what it held: the view notified is built again, but a view that
    /// read it is not. What scrolled is tracked by the scroll state's own
    /// version.
    ///
    /// An entity updated without being notified — as every subscriber of an
    /// entity is updated for each event it emits, whether it cares or not —
    /// counts as changed only `inside_notified`: for a view drawn inside a
    /// view notified since the last frame, which upstream builds again with
    /// everything under it, and which often changes a model it renders and
    /// notifies only itself.
    pub(crate) fn dependencies_changed(
        &self,
        dependencies: &RenderDependencies,
        inside_notified: bool,
    ) -> bool {
        self.entities.access_log.changed_since(
            &dependencies.entities,
            dependencies.updates,
            inside_notified,
        ) || self
            .entities
            .access_log
            .written_since(&dependencies.entities, &dependencies.writes)
            || self.globals_or_states_changed(dependencies)
    }

    /// Whether anything in `dependencies`, read by a cached view
    /// ([`crate::Entity::cached`]) or a view drawn inside one, changed in a
    /// way that draws the cached view again: one of the entities was
    /// notified, or a global or a versioned state changed.
    ///
    /// An entity updated without being notified does not count, whether it
    /// was updated outside drawing or written while the window drew (see
    /// [`note_update`]). Upstream builds a cached view again only when it,
    /// or a view drawn in it, is notified, or it is drawn somewhere else: a
    /// view around it rendering again, and writing to what it reads as it
    /// does, as a view handing its child what to show does on every render,
    /// does not. Such a write is counted for a view that is not cached
    /// because upstream renders that view again with the view around it, and
    /// shows what was written; it never shows it in a cached view that was
    /// not notified. Drawing a cached view again for less than that never
    /// draws it from older reads than upstream would.
    pub(crate) fn notified_dependencies_changed(&self, dependencies: &RenderDependencies) -> bool {
        self.entities
            .access_log
            .changed_since(&dependencies.entities, dependencies.updates, false)
            || self.globals_or_states_changed(dependencies)
    }

    fn globals_or_states_changed(&self, dependencies: &RenderDependencies) -> bool {
        dependencies.globals.iter().any(|global| {
            self.dependencies
                .global_changed_at
                .get(global)
                .is_some_and(|changed_at| *changed_at > dependencies.generation)
        }) || dependencies
            .states
            .iter()
            .any(|(version, read_at)| version.get() != *read_at)
    }
}

/// Records, for any recording that is open, that the state `version`
/// belongs to was read as it is now.
#[inline(always)]
pub(crate) fn note_state_read(cx: &App, version: &StateVersion) {
    if cx.entities.is_recording() {
        cx.dependencies
            .state_read_log
            .borrow_mut()
            .push((version.clone(), version.get()));
    }
}

/// Records, for any recording that is open, that the global of type
/// `global` was read.
#[inline(always)]
pub(crate) fn note_global_read(cx: &App, global: TypeId) {
    if cx.entities.is_recording() {
        cx.dependencies.global_read_log.borrow_mut().push(global);
    }
}

/// The entity map's side of recording what retained subtrees read.
#[derive(Default)]
pub(crate) struct EntityAccessLog {
    /// Every entity accessed while a recording is open, in order and with
    /// repeats, for a retained subtree to learn what it was built from. See
    /// [`App::begin_recording_dependencies`].
    access_log: Rc<RefCell<Vec<EntityId>>>,
    /// Where in `access_log` the last recording, or replay, began or ended.
    /// An access repeating the one just before it is left out, but only
    /// after this: the stretches recordings take up must each keep theirs.
    boundary: Cell<usize>,
    /// How many recordings are open.
    recordings: Rc<Cell<usize>>,
    /// Counts the entities updated or changed while no recording is open,
    /// each of which is stamped into `updated_at` or `changed_at`.
    update_generation: u64,
    /// When each entity was last updated while no recording was open. See
    /// [`note_update`].
    updated_at: FxHashMap<EntityId, u64>,
    /// Counts the entities updated while a recording is open — written while
    /// the window draws — each of which is stamped into `written_at`. Shared
    /// with the thread, as the log of entities read is (see
    /// [`write_generation_now`]).
    write_generation: Rc<Cell<u64>>,
    /// When each entity was last written while the window drew. See
    /// [`note_update`].
    written_at: FxHashMap<EntityId, u64>,
    /// The entity the framework is about to lease to render it, which is
    /// drawing it rather than writing to it. See [`render_next`].
    rendering: Option<EntityId>,
    /// The entities updated and not notified since.
    updated_unnotified: FxHashSet<EntityId>,
    /// When each entity was last changed: notified after being updated, or
    /// notified while drawing. See [`note_notify`].
    changed_at: FxHashMap<EntityId, u64>,
    /// The entity being asked something through [`Entity::query`], whose
    /// update is not counted as a change unless it notifies.
    queried: Option<EntityId>,
}

impl EntityAccessLog {
    pub(crate) fn update_generation(&self) -> u64 {
        self.update_generation
    }

    /// How many accesses the log holds.
    fn len(&self) -> usize {
        self.access_log.borrow().len()
    }

    /// Whether any of `entities` was changed after `generation`, or, with
    /// `updates`, updated.
    fn changed_since(&self, entities: &[EntityId], generation: u64, updates: bool) -> bool {
        let after = |stamps: &FxHashMap<EntityId, u64>, entity| {
            stamps.get(entity).is_some_and(|at| *at > generation)
        };
        generation != self.update_generation
            && entities.iter().any(|entity| {
                after(&self.changed_at, entity) || (updates && after(&self.updated_at, entity))
            })
    }

    /// Whether any of `entities` was written while the window drew, after
    /// `writes` began and other than by the subtree `writes` belongs to.
    fn written_since(&self, entities: &[EntityId], writes: &Writes) -> bool {
        self.write_generation.get() != writes.to
            && entities.iter().any(|entity| {
                self.written_at
                    .get(entity)
                    .is_some_and(|written_at| writes.is_foreign(*written_at))
            })
    }

    /// Stamps `entity_id` as changed.
    fn stamp_changed(&mut self, entity_id: EntityId) {
        self.update_generation += 1;
        self.changed_at.insert(entity_id, self.update_generation);
    }

    /// Forgets when a released entity was updated.
    pub(crate) fn forget(&mut self, entity_id: EntityId) {
        self.updated_at.remove(&entity_id);
        self.written_at.remove(&entity_id);
        self.updated_unnotified.remove(&entity_id);
        self.changed_at.remove(&entity_id);
    }
}

impl EntityMap {
    /// Whether `entity_id` has not been released. A leased entity is alive,
    /// though its slot is empty while it is leased.
    pub(crate) fn is_alive(&self, entity_id: EntityId) -> bool {
        self.ref_counts.read().counts.contains_key(entity_id)
    }

    /// Marks where the access log stands as a boundary between stretches.
    pub(crate) fn mark_access_boundary(&mut self) {
        let log = &mut self.access_log;
        log.boundary.set(log.access_log.borrow().len());
    }

    /// How many writes were made while the window drew so far.
    pub(crate) fn write_generation(&self) -> u64 {
        self.access_log.write_generation.get()
    }

    /// Records entities accessed by a reused draw, as upstream's
    /// [`EntityMap::extend_accessed`] does, and adds them to the access log
    /// when a recording is open.
    pub(crate) fn extend_accessed_recorded<'a>(
        &mut self,
        entities: impl IntoIterator<Item = &'a EntityId>,
    ) {
        let entities = entities.into_iter().copied();
        if !self.is_recording() {
            self.extend_accessed(entities);
            return;
        }
        let entities: SmallVec<[EntityId; 16]> = entities.collect();
        self.extend_accessed(entities.iter().copied());
        self.access_log.access_log.borrow_mut().extend(entities);
    }

    /// Whether any recording is open.
    #[inline]
    pub(crate) fn is_recording(&self) -> bool {
        self.access_log.recordings.get() > 0
    }

    /// Opens a recording, returning where in the access log it starts.
    pub(crate) fn begin_recording(&mut self) -> usize {
        self.mark_access_boundary();
        let log = &mut self.access_log;
        log.recordings.set(log.recordings.get() + 1);
        log.access_log.borrow().len()
    }

    /// Closes the recording that started at `_start`, whose accesses have
    /// been read out of the log.
    pub(crate) fn close_recording(&mut self, _start: usize) {
        let EntityAccessLog {
            access_log,
            recordings,
            ..
        } = &mut self.access_log;
        let open = recordings.get() - 1;
        recordings.set(open);
        if open == 0 {
            access_log.borrow_mut().clear();
        }
        self.mark_access_boundary();
    }
}

/// Records, for any recording that is open, that `entity_id` was
/// accessed.
#[inline(always)]
pub(crate) fn note_access(entities: &EntityMap, entity_id: EntityId) {
    if entities.access_log.recordings.get() > 0 {
        let mut log = entities.access_log.access_log.borrow_mut();
        // A view reads the same entity many times in a row as it renders;
        // one mention is all its dependencies need.
        if log.len() > entities.access_log.boundary.get() && log.last() == Some(&entity_id) {
            return;
        }
        log.push(entity_id);
    }
}

/// Records that `entity_id` is notified. A notification that follows an
/// update marks the entity changed. So does one while a subtree is being
/// drawn — a view changing a model it read as it renders — or while the
/// entity is asked something ([`Entity::query`]): nothing else tells
/// whether it changed what the entity holds. One alone, outside drawing,
/// changes nothing a view could have read.
#[inline(always)]
pub(crate) fn note_notify(entities: &mut EntityMap, entity_id: EntityId) {
    let log = &mut entities.access_log;
    if log.updated_unnotified.remove(&entity_id)
        || log.recordings.get() > 0
        || log.queried.is_some()
    {
        log.stamp_changed(entity_id);
    }
}

/// Records that `entity_id` is being updated, as [`note_access`]
/// does for an access.
///
/// An entity updated outside of drawing — by a task, a listener, an
/// action — may have changed without being notified, as when a view
/// changes a model it renders and notifies only itself. A retained subtree
/// inside a notified view that read it is built again, as upstream builds
/// every view under a notified one again; see
/// [`App::dependencies_changed`]. Updates while a subtree is being built,
/// a view rendering itself for one, are part of drawing it and are not
/// stamped.
///
/// An entity updated while the window draws — a component writing what
/// it was given into the state of a view it renders, as `Tree` writes
/// its item renderer — is written, and a retained subtree that read it is
/// built again, unless the subtree wrote it itself while it was being
/// built: what a subtree writes as it is built is part of building it.
/// The update that renders a view is neither.
#[inline]
pub(crate) fn note_update(entities: &mut EntityMap, entity_id: EntityId) {
    note_access(entities, entity_id);
    let log = &mut entities.access_log;
    if log.rendering == Some(entity_id) {
        log.rendering = None;
        if log.recordings.get() > 0 {
            return;
        }
    }
    if log.queried == Some(entity_id) {
        return;
    }
    if log.recordings.get() == 0 {
        log.update_generation += 1;
        log.updated_at.insert(entity_id, log.update_generation);
        log.updated_unnotified.insert(entity_id);
    } else {
        let written_at = log.write_generation.get() + 1;
        log.write_generation.set(written_at);
        log.written_at.insert(entity_id, written_at);
    }
}

/// Marks the next lease of `entity_id` as the framework rendering it, not
/// a write to it. See [`note_update`].
#[inline(always)]
pub(crate) fn render_next(entities: &mut EntityMap, entity_id: EntityId) {
    entities.access_log.rendering = Some(entity_id);
}

/// Updates `entity` to ask it something, as the platform asks a text input
/// whether it accepts text or where its selection is, every frame. Unlike
/// [`Entity::update`], this does not count as changing what the entity holds,
/// unless it notifies while it is asked.
#[inline(always)]
pub(crate) fn query<T: 'static, R>(
    entity: &Entity<T>,
    cx: &mut App,
    query: impl FnOnce(&mut T, &mut Context<T>) -> R,
) -> R {
    let outer = cx.entities.access_log.queried.replace(entity.entity_id());
    let result = entity.update(cx, query);
    cx.entities.access_log.queried = outer;
    result
}

/// Where a recording started by [`App::begin_recording_dependencies`] begins.
#[derive(Clone, Copy)]
pub(crate) struct DependencyRecording {
    entities: usize,
    globals: usize,
    states: usize,
    generation: u64,
    updates: u64,
    writes: u64,
}

/// The writes a recording made itself, from when it began to when it
/// finished: `(began, finished]` in the write generation.
fn writes_while_open(recording: &DependencyRecording, log: &EntityAccessLog) -> Writes {
    let now = log.write_generation.get();
    let mut own = SmallVec::new();
    if now > recording.writes {
        own.push((recording.writes, now));
    }
    Writes {
        from: recording.writes,
        to: now,
        own,
    }
}

/// Where in the write generation a retained subtree was built: writes after
/// `from` change what it read, except those made while it was being built,
/// within one of the `own` stretches.
#[derive(Clone, Default)]
pub(crate) struct Writes {
    from: u64,
    to: u64,
    own: SmallVec<[(u64, u64); 2]>,
}

impl Writes {
    /// Whether a write at `written_at` came from outside the subtree after
    /// it began.
    fn is_foreign(&self, written_at: u64) -> bool {
        written_at > self.from
            && !self
                .own
                .iter()
                .any(|(began, finished)| written_at > *began && written_at <= *finished)
    }

    fn union(&self, other: &Self) -> Self {
        let mut own = self.own.clone();
        own.extend_from_slice(&other.own);
        Writes {
            from: self.from.min(other.from),
            to: self.to.max(other.to),
            own,
        }
    }
}

/// The logs of what is read while a recording is open, and the count of
/// writes, shared with the thread, for where they stand to be known where no
/// app is at hand. See [`read_log_lengths`] and [`write_generation_now`].
struct ReadLogs {
    entities: Rc<RefCell<Vec<EntityId>>>,
    writes: Rc<Cell<u64>>,
    globals: Rc<RefCell<Vec<TypeId>>>,
    states: Rc<RefCell<Vec<(StateVersion, u64)>>>,
}

thread_local! {
    static READ_LOGS: RefCell<Option<ReadLogs>> = const { RefCell::new(None) };
}

impl ReadLogs {
    /// Shares the logs of the app that `access_log` and `dependencies` are
    /// part of with the thread, unless they already are.
    fn share(access_log: &EntityAccessLog, dependencies: &AppDependencies) {
        READ_LOGS.with_borrow_mut(|logs| {
            if !logs
                .as_ref()
                .is_some_and(|logs| Rc::ptr_eq(&logs.entities, &access_log.access_log))
            {
                *logs = Some(ReadLogs {
                    entities: access_log.access_log.clone(),
                    writes: access_log.write_generation.clone(),
                    globals: dependencies.global_read_log.clone(),
                    states: dependencies.state_read_log.clone(),
                });
            }
        });
    }
}

impl App {}

/// How far the logs of the entities, globals and states read while a
/// recording is open go, from where no app is at hand, as a `list` being
/// built asks.
pub(crate) fn read_log_lengths() -> Option<(usize, usize, usize)> {
    READ_LOGS.with_borrow(|logs| {
        logs.as_ref().map(|logs| {
            (
                logs.entities.borrow().len(),
                logs.globals.borrow().len(),
                logs.states.borrow().len(),
            )
        })
    })
}

/// How many writes were made while the window drew so far (see
/// [`EntityMap::write_generation`]), from where no app is at hand, as a
/// `list` drawing a row asks.
pub(crate) fn write_generation_now() -> u64 {
    READ_LOGS.with_borrow(|logs| logs.as_ref().map_or(0, |logs| logs.writes.get()))
}

/// What a recording saw: everything read while it was open, and what was read
/// outside the recordings nested in it, by the subtree itself.
pub(crate) struct RecordedDependencies {
    pub(crate) all: RenderDependencies,
    pub(crate) own: RenderDependencies,
    /// What a view read itself while its `render` ran, before its elements
    /// were laid out, if the recording was of a view rendering. See
    /// [`App::dependencies_so_far`].
    pub(crate) render: Option<RenderDependencies>,
}

/// The entries of `log` in `range` that fall outside every range in `nested`,
/// which lie within `range`, in order.
fn outside<'a, T: Clone>(
    log: &[T],
    range: &Range<usize>,
    nested: impl Iterator<Item = &'a Range<usize>>,
    own: &mut Vec<T>,
) {
    let mut cursor = range.start;
    for nested in nested {
        if nested.start > cursor {
            own.extend_from_slice(&log[cursor..nested.start]);
        }
        cursor = cursor.max(nested.end);
    }
    if range.end > cursor {
        own.extend_from_slice(&log[cursor..range.end]);
    }
}

/// What a retained subtree read while it was built: the entities it accessed
/// and the globals it read, as of a global generation. While none of them has
/// changed, building the subtree again would build the same thing.
#[derive(Clone, Default)]
pub(crate) struct RenderDependencies {
    pub(crate) entities: Rc<[EntityId]>,
    pub(crate) globals: Rc<[TypeId]>,
    /// Element state kept outside of entities — scroll handles, list states
    /// — with the version each was read at.
    pub(crate) states: Rc<[(StateVersion, u64)]>,
    /// The scroll offsets read through the scroll getters. See
    /// [`crate::fast::layers::invalidate::note_offset_read`].
    pub(crate) generation: u64,
    /// The entity update generation the recording began at. See
    /// [`note_update`].
    pub(crate) updates: u64,
    /// Where in the write generation it was built. See [`Writes`].
    pub(crate) writes: Writes,
}

/// A counter that state shared outside of entities — a scroll handle, a list
/// state — increments whenever it changes, so that a retained subtree that
/// read it is built again, as it would be for an entity that was notified.
#[derive(Clone, Default, Debug)]
pub(crate) struct StateVersion(Rc<Cell<u64>>);

impl StateVersion {
    pub(crate) fn get(&self) -> u64 {
        self.0.get()
    }

    fn ptr(&self) -> *const Cell<u64> {
        Rc::as_ptr(&self.0)
    }

    /// What tells this state apart from any other while it lives.
    pub(crate) fn id(&self) -> usize {
        self.ptr() as usize
    }
}

fn dedup_states(
    states: &[(StateVersion, u64)],
    none: &Rc<[(StateVersion, u64)]>,
) -> Rc<[(StateVersion, u64)]> {
    if states.is_empty() {
        return none.clone();
    }
    unique_states(states)
}

fn unique_states(states: &[(StateVersion, u64)]) -> Rc<[(StateVersion, u64)]> {
    let mut seen = FxHashSet::with_capacity_and_hasher(states.len(), Default::default());
    states
        .iter()
        .filter(|(version, _)| seen.insert(version.id()))
        .cloned()
        .collect()
}

impl RenderDependencies {
    pub(crate) fn written_up_to(&self, writes: u64) -> Self {
        Self {
            writes: Writes {
                from: writes,
                to: writes,
                own: SmallVec::new(),
            },
            ..self.clone()
        }
    }

    pub(crate) fn without_released_entities(mut self, cx: &App) -> Self {
        if self
            .entities
            .iter()
            .all(|entity| cx.entities.is_alive(*entity))
        {
            return self;
        }
        self.entities = self
            .entities
            .iter()
            .copied()
            .filter(|entity| cx.entities.is_alive(*entity))
            .collect();
        self
    }

    pub(crate) fn shares_entities_with(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.entities, &other.entities)
    }

    pub(crate) fn union(&self, other: &Self) -> Self {
        if other.entities.is_empty() && other.globals.is_empty() && other.states.is_empty() {
            return self.clone();
        }
        let states = if other.states.is_empty() {
            self.states.clone()
        } else {
            let mut states = self.states.to_vec();
            states.extend_from_slice(&other.states);
            unique_states(&states)
        };
        Self {
            entities: merge_sorted(&self.entities, &other.entities),
            globals: merge_sorted(&self.globals, &other.globals),
            states,
            generation: self.generation.min(other.generation),
            updates: self.updates.min(other.updates),
            writes: self.writes.union(&other.writes),
        }
    }
}

fn merge_sorted<T: Ord + Copy>(a: &[T], b: &[T]) -> Rc<[T]> {
    if a.is_empty() {
        return Rc::from(b);
    }
    if b.is_empty() {
        return Rc::from(a);
    }
    let mut out = Vec::with_capacity(a.len() + b.len());
    out.extend_from_slice(a);
    out.extend_from_slice(b);
    out.sort_unstable();
    out.dedup();
    Rc::from(out)
}
