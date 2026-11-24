mod binding;
mod context;

pub use binding::*;
pub use context::*;

use crate::collections::{HashSet, TypeIdHashMap};
use crate::{Action, AsKeystroke, Keystroke, Unbind, is_no_action, is_unbind};
use smallvec::SmallVec;

/// An opaque identifier of which version of the keymap is currently active.
/// The keymap's version is changed whenever bindings are added or removed.
#[derive(Copy, Clone, Eq, PartialEq, Default)]
pub struct KeymapVersion(usize);

/// A collection of key bindings for the user's application.
#[derive(Default)]
pub struct Keymap {
    bindings: Vec<KeyBinding>,
    binding_indices_by_action_id: TypeIdHashMap<SmallVec<[usize; 3]>>,
    disabled_binding_indices: Vec<usize>,
    version: KeymapVersion,
}

/// Index of a binding within a keymap.
#[derive(Copy, Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub struct BindingIndex(usize);

fn disabled_binding_matches_context(disabled_binding: &KeyBinding, binding: &KeyBinding) -> bool {
    match (
        &disabled_binding.context_predicate,
        &binding.context_predicate,
    ) {
        (None, _) => true,
        (Some(_), None) => false,
        (Some(disabled_predicate), Some(predicate)) => disabled_predicate.is_superset(predicate),
    }
}

fn binding_is_unbound(disabled_binding: &KeyBinding, binding: &KeyBinding) -> bool {
    disabled_binding.keystrokes == binding.keystrokes
        && disabled_binding
            .action()
            .as_any()
            .downcast_ref::<Unbind>()
            .is_some_and(|unbind| unbind.0.as_ref() == binding.action.name())
}

impl Keymap {
    /// Create a new keymap with the given bindings.
    pub fn new(bindings: Vec<KeyBinding>) -> Self {
        let mut this = Self::default();
        this.add_bindings(bindings);
        this
    }

    /// Get the current version of the keymap.
    pub fn version(&self) -> KeymapVersion {
        self.version
    }

    /// Add more bindings to the keymap.
    pub fn add_bindings<T: IntoIterator<Item = KeyBinding>>(&mut self, bindings: T) {
        for binding in bindings {
            let action_id = binding.action().as_any().type_id();
            if is_no_action(&*binding.action) || is_unbind(&*binding.action) {
                self.disabled_binding_indices.push(self.bindings.len());
            } else {
                self.binding_indices_by_action_id
                    .entry(action_id)
                    .or_default()
                    .push(self.bindings.len());
            }
            self.bindings.push(binding);
        }

        self.version.0 += 1;
    }

    /// Reset this keymap to its initial state.
    pub fn clear(&mut self) {
        self.bindings.clear();
        self.binding_indices_by_action_id.clear();
        self.disabled_binding_indices.clear();
        self.version.0 += 1;
    }

    /// Iterate over all bindings, in the order they were added.
    pub fn bindings(&self) -> impl DoubleEndedIterator<Item = &KeyBinding> + ExactSizeIterator {
        self.bindings.iter()
    }

    /// Iterate over all bindings for the given action, in the order they were added. For display,
    /// the last binding should take precedence.
    pub fn bindings_for_action<'a>(
        &'a self,
        action: &'a dyn Action,
    ) -> impl 'a + DoubleEndedIterator<Item = &'a KeyBinding> {
        let action_id = action.type_id();
        let binding_indices = self
            .binding_indices_by_action_id
            .get(&action_id)
            .map_or(&[] as _, SmallVec::as_slice)
            .iter();

        binding_indices.filter_map(|ix| {
            let binding = &self.bindings[*ix];
            if !binding.action().partial_eq(action) {
                return None;
            }

            for disabled_ix in &self.disabled_binding_indices {
                if disabled_ix > ix {
                    let disabled_binding = &self.bindings[*disabled_ix];
                    if disabled_binding.keystrokes != binding.keystrokes {
                        continue;
                    }

                    if is_no_action(&*disabled_binding.action) {
                        if disabled_binding_matches_context(disabled_binding, binding) {
                            return None;
                        }
                    } else if is_unbind(&*disabled_binding.action)
                        && disabled_binding_matches_context(disabled_binding, binding)
                        && binding_is_unbound(disabled_binding, binding)
                    {
                        return None;
                    }
                }
            }

            Some(binding)
        })
    }

    /// Returns all bindings that might match the input without checking context. The bindings
    /// returned in precedence order (reverse of the order they were added to the keymap).
    pub fn all_bindings_for_input(&self, input: &[Keystroke]) -> Vec<KeyBinding> {
        self.bindings()
            .rev()
            .filter(|binding| {
                binding
                    .match_keystrokes(input)
                    .is_some_and(|pending| !pending)
            })
            .cloned()
            .collect()
    }

    /// Returns a list of bindings that match the given input, and a boolean indicating whether or
    /// not more bindings might match if the input was longer. Bindings are returned in precedence
    /// order (higher precedence first, reverse of the order they were added to the keymap).
    ///
    /// Precedence is defined by the depth in the tree (matches on the Editor take precedence over
    /// matches on the Pane, then the Workspace, etc.). Bindings with no context are treated as the
    /// same as the deepest context.
    ///
    /// In the case of multiple bindings at the same depth, the ones added to the keymap later take
    /// precedence. User bindings are added after built-in bindings so that they take precedence.
    ///
    /// If a binding has been disabled with `"x": null` it will not be returned. Disabled bindings
    /// are evaluated with the same precedence rules so you can disable a rule in a given context
    /// only. A disabled binding only suppresses bindings from sources with equal or weaker
    /// precedence: a base keymap null hides default bindings, but user bindings still apply.
    pub fn bindings_for_input(
        &self,
        input: &[impl AsKeystroke],
        context_stack: &[KeyContext],
    ) -> (SmallVec<[KeyBinding; 1]>, bool) {
        let (bindings, pending) = self.resolve_bindings_for_input(
            input,
            context_stack,
            self.bindings().enumerate().rev(),
        );
        (
            bindings
                .into_iter()
                .map(|(_, binding)| binding.clone())
                .collect(),
            pending,
        )
    }

    /// Same as `bindings_for_input`, but only looks at `keymap_bindings` instead of the whole
    /// keymap, and returns each binding with its keymap index.
    ///
    /// `keymap_bindings` must be in reverse keymap order and include every binding that could
    /// match `input`. For example, leaving out a `null` binding would make the binding it disables
    /// look like it wins. `bindings_for_input` passes the whole keymap, which always meets this but
    /// goes through every binding on every call. Passing a pre-filtered list is cheaper when
    /// resolving many inputs against it.
    fn resolve_bindings_for_input<'a>(
        &self,
        input: &[impl AsKeystroke],
        context_stack: &[KeyContext],
        keymap_bindings: impl IntoIterator<Item = (usize, &'a KeyBinding)>,
    ) -> (SmallVec<[(BindingIndex, &'a KeyBinding); 1]>, bool) {
        let mut matched_bindings = SmallVec::<[(usize, BindingIndex, &KeyBinding); 1]>::new();
        let mut pending_bindings = SmallVec::<[(BindingIndex, &KeyBinding); 1]>::new();

        for (ix, binding) in keymap_bindings {
            let Some(depth) = self.binding_enabled(binding, context_stack) else {
                continue;
            };
            let Some(pending) = binding.match_keystrokes(input) else {
                continue;
            };

            if !pending {
                matched_bindings.push((depth, BindingIndex(ix), binding));
            } else {
                pending_bindings.push((BindingIndex(ix), binding));
            }
        }

        matched_bindings.sort_by(|(depth_a, ix_a, _), (depth_b, ix_b, _)| {
            depth_b.cmp(depth_a).then(ix_b.cmp(ix_a))
        });

        let mut bindings: SmallVec<[_; 1]> = SmallVec::new();
        let mut first_binding_index = None;
        let mut unbound_bindings: Vec<&KeyBinding> = Vec::new();
        // A `NoAction` binding suppresses out-ranked bindings from sources with
        // equal or weaker precedence, while bindings from stronger sources (a
        // smaller meta, e.g. a user binding vs a base keymap null) still apply.
        // Bindings without a meta are treated as user bindings.
        let mut no_action_meta: Option<u32> = None;

        for (_, ix, binding) in matched_bindings {
            let meta = binding.meta.map_or(0, |meta| meta.0);
            if is_no_action(&*binding.action) {
                no_action_meta = Some(no_action_meta.map_or(meta, |existing| existing.min(meta)));
                continue;
            }

            if no_action_meta.is_some_and(|no_action_meta| meta >= no_action_meta) {
                continue;
            }

            if is_unbind(&*binding.action) {
                unbound_bindings.push(binding);
                continue;
            }

            if unbound_bindings
                .iter()
                .any(|disabled_binding| binding_is_unbound(disabled_binding, binding))
            {
                continue;
            }

            bindings.push((ix, binding));
            first_binding_index.get_or_insert(ix);
        }

        let mut pending = HashSet::default();
        for (ix, binding) in pending_bindings.into_iter().rev() {
            if let Some(binding_ix) = first_binding_index
                && binding_ix > ix
            {
                continue;
            }
            if is_no_action(&*binding.action) || is_unbind(&*binding.action) {
                pending.remove(&&binding.keystrokes);
                continue;
            }
            pending.insert(&binding.keystrokes);
        }

        (bindings, !pending.is_empty())
    }
    /// Check if the given binding is enabled, given a certain key context.
    /// Returns the deepest depth at which the binding matches, or None if it doesn't match.
    fn binding_enabled(&self, binding: &KeyBinding, contexts: &[KeyContext]) -> Option<usize> {
        if let Some(predicate) = &binding.context_predicate {
            predicate.depth_of(contexts)
        } else {
            Some(contexts.len())
        }
    }

    /// Find the bindings that can follow the current input sequence, in precedence order. Only
    /// includes bindings that dispatch would run for their full keystrokes, so bindings disabled
    /// with `null` or `Unbind` are left out.
    pub fn possible_next_bindings_for_input(
        &self,
        input: &[Keystroke],
        context_stack: &[KeyContext],
    ) -> Vec<KeyBinding> {
        // Keeps `null` and `Unbind` bindings, which can disable candidates.
        let bindings_extending_input = self
            .bindings()
            .enumerate()
            .rev()
            .filter(|(_, binding)| {
                binding
                    .match_keystrokes(input)
                    .is_some_and(|pending| pending)
            })
            .collect::<Vec<_>>();

        let mut full_input = SmallVec::<[&Keystroke; 4]>::new();
        let mut candidates = bindings_extending_input
            .iter()
            .filter(|(_, binding)| !is_no_action(&*binding.action) && !is_unbind(&*binding.action))
            .filter_map(|&(ix, binding)| {
                let depth = self.binding_enabled(binding, context_stack)?;
                // Use the typed input rather than the binding's own keystrokes. A typed keystroke
                // can match through its physical key, like `alt-s`, or the character it produced,
                // like `ß`.
                full_input.clear();
                full_input.extend(input.iter());
                full_input.extend(
                    binding.keystrokes[input.len()..]
                        .iter()
                        .map(AsKeystroke::as_keystroke),
                );
                let (dispatched, _) = self.resolve_bindings_for_input(
                    &full_input,
                    context_stack,
                    bindings_extending_input.iter().copied(),
                );
                dispatched
                    .iter()
                    .any(|(dispatched_ix, _)| *dispatched_ix == BindingIndex(ix))
                    .then_some((depth, ix, binding))
            })
            .collect::<Vec<_>>();
        candidates.sort_unstable_by(|(depth_a, ix_a, _), (depth_b, ix_b, _)| {
            depth_b.cmp(depth_a).then(ix_b.cmp(ix_a))
        });

        candidates
            .into_iter()
            .map(|(_, _, binding)| binding.clone())
            .collect()
    }
}
