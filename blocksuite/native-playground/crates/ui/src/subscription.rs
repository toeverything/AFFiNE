use crate::collections::BTreeMap;
use crate::gpui_util::post_inc;
use std::{
    cell::{Cell, RefCell},
    fmt::Debug,
    mem,
    rc::Rc,
};

/// Stores subscriptions for a single emitter.
pub(crate) struct SingleSubscriberSet<Callback>(Rc<RefCell<SingleSubscriberSetState<Callback>>>);

/// Stores subscriptions for emitters.
pub(crate) struct SubscriberSet<EmitterKey, Callback>(
    Rc<RefCell<SubscriberSetState<EmitterKey, Callback>>>,
);

impl<EmitterKey, Callback> Clone for SubscriberSet<EmitterKey, Callback> {
    fn clone(&self) -> Self {
        SubscriberSet(self.0.clone())
    }
}

struct SubscriberSetState<EmitterKey, Callback> {
    subscribers: BTreeMap<EmitterKey, BTreeMap<usize, Subscriber<Callback>>>,
    next_subscriber_id: usize,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SubscriberState {
    Pending,
    Active,
    Dropped,
}

struct Subscriber<Callback> {
    state: Rc<Cell<SubscriberState>>,
    callback: Callback,
}

impl<EmitterKey, Callback> SubscriberSet<EmitterKey, Callback>
where
    EmitterKey: 'static + Ord + Clone + Debug,
    Callback: 'static,
{
    pub fn new() -> Self {
        Self(Rc::new(RefCell::new(SubscriberSetState {
            subscribers: Default::default(),
            next_subscriber_id: 0,
        })))
    }

    /// Inserts an immediately active subscription for the given emitter.
    pub fn insert(&self, emitter_key: EmitterKey, callback: Callback) -> Subscription {
        let (subscription, activate) = self.insert_pending(emitter_key, callback);
        activate();
        subscription
    }

    /// Inserts a pending subscription and returns its handle and activation function.
    ///
    /// Pending callbacks are skipped by `retain` and excluded from `remove` until activated.
    pub fn insert_pending(
        &self,
        emitter_key: EmitterKey,
        callback: Callback,
    ) -> (Subscription, impl FnOnce() + use<EmitterKey, Callback>) {
        let state = Rc::new(Cell::new(SubscriberState::Pending));
        let mut lock = self.0.borrow_mut();
        let subscriber_id = post_inc(&mut lock.next_subscriber_id);
        lock.subscribers
            .entry(emitter_key.clone())
            .or_default()
            .insert(
                subscriber_id,
                Subscriber {
                    state: state.clone(),
                    callback,
                },
            );
        let this = self.0.clone();

        let subscription = Subscription {
            unsubscribe: Some(Box::new({
                let state = state.clone();
                move || {
                    state.set(SubscriberState::Dropped);

                    let mut lock = this.borrow_mut();
                    let Some(subscribers) = lock.subscribers.get_mut(&emitter_key) else {
                        return;
                    };

                    subscribers.remove(&subscriber_id);
                    if subscribers.is_empty() {
                        lock.subscribers.remove(&emitter_key);
                    }
                }
            })),
        };
        (subscription, move || {
            if state.get() == SubscriberState::Pending {
                state.set(SubscriberState::Active);
            }
        })
    }

    pub fn remove(
        &self,
        emitter: &EmitterKey,
    ) -> impl IntoIterator<Item = Callback> + use<EmitterKey, Callback> {
        let subscribers = self.0.borrow_mut().subscribers.remove(emitter);
        subscribers
            .map(|s| s.into_values())
            .into_iter()
            .flatten()
            .filter_map(|subscriber| {
                if subscriber.state.get() == SubscriberState::Active {
                    Some(subscriber.callback)
                } else {
                    None
                }
            })
    }

    /// Call the given callback for each subscriber to the given emitter.
    /// If the callback returns false, the subscriber is removed.
    pub fn retain<F>(&self, emitter: &EmitterKey, mut f: F)
    where
        F: FnMut(&mut Callback) -> bool,
    {
        // We do not remove here upfront to reduce BTreeMap shuffling churn
        let Some(mut subscribers) = self
            .0
            .borrow_mut()
            .subscribers
            .get_mut(emitter)
            .map(mem::take)
        else {
            return;
        };

        subscribers.retain(|_, subscriber| subscriber.retain(&mut f));
        let mut lock = self.0.borrow_mut();

        if subscribers.is_empty() {
            if lock
                .subscribers
                .get(emitter)
                .is_some_and(|subscribers| subscribers.is_empty())
            {
                lock.subscribers.remove(emitter);
            }
            return;
        }

        // Add any new subscribers that were added while invoking the callback.
        lock.subscribers
            .entry(emitter.clone())
            .or_default()
            .append(&mut subscribers);
    }
}

struct SingleSubscriberSetState<Callback> {
    subscribers: BTreeMap<usize, Subscriber<Callback>>,
    next_subscriber_id: usize,
}

impl<Callback> Clone for SingleSubscriberSet<Callback> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<Callback: 'static> SingleSubscriberSet<Callback> {
    pub fn new() -> Self {
        Self(Rc::new(RefCell::new(SingleSubscriberSetState {
            subscribers: BTreeMap::new(),
            next_subscriber_id: 0,
        })))
    }

    /// Inserts an immediately active subscription.
    pub fn insert(&self, callback: Callback) -> Subscription {
        let (subscription, activate) = self.insert_pending(callback);
        activate();
        subscription
    }

    /// Inserts a pending subscription and returns its handle and activation function.
    ///
    /// Pending callbacks are skipped by `retain` and excluded from `remove` until activated.
    pub fn insert_pending(
        &self,
        callback: Callback,
    ) -> (Subscription, impl FnOnce() + use<Callback>) {
        let state = Rc::new(Cell::new(SubscriberState::Pending));
        let mut lock = self.0.borrow_mut();
        let subscriber_id = post_inc(&mut lock.next_subscriber_id);
        lock.subscribers.insert(
            subscriber_id,
            Subscriber {
                state: state.clone(),
                callback,
            },
        );
        let this = self.0.clone();

        let subscription = Subscription {
            unsubscribe: Some(Box::new({
                let state = state.clone();
                move || {
                    state.set(SubscriberState::Dropped);
                    this.borrow_mut().subscribers.remove(&subscriber_id);
                }
            })),
        };
        (subscription, move || {
            if state.get() == SubscriberState::Pending {
                state.set(SubscriberState::Active);
            }
        })
    }

    /// Removes all subscriptions and returns the active callbacks in registration order.
    pub fn remove(&self) -> impl IntoIterator<Item = Callback> + use<Callback> {
        let subscribers = mem::take(&mut self.0.borrow_mut().subscribers);
        subscribers.into_values().filter_map(|subscriber| {
            if subscriber.state.get() == SubscriberState::Active {
                Some(subscriber.callback)
            } else {
                None
            }
        })
    }

    /// Invokes each active callback, removing subscriptions for which `f` returns false.
    pub fn retain(&self, mut f: impl FnMut(&mut Callback) -> bool) {
        let mut subscribers = mem::take(&mut self.0.borrow_mut().subscribers);
        subscribers.retain(|_, subscriber| subscriber.retain(&mut f));
        self.0.borrow_mut().subscribers.append(&mut subscribers);
    }
}

impl<Callback> Subscriber<Callback> {
    fn retain(&mut self, f: &mut impl FnMut(&mut Callback) -> bool) -> bool {
        match self.state.get() {
            SubscriberState::Pending => true,
            SubscriberState::Dropped => false,
            SubscriberState::Active => {
                let keep = f(&mut self.callback);
                keep && self.state.get() != SubscriberState::Dropped
            }
        }
    }
}

/// A handle to a subscription created by GPUI. When dropped, the subscription
/// is cancelled and the callback will no longer be invoked.
#[must_use]
pub struct Subscription {
    unsubscribe: Option<Box<dyn FnOnce() + 'static>>,
}

impl Subscription {
    /// Creates a new subscription with a callback that gets invoked when
    /// this subscription is dropped.
    pub fn new(unsubscribe: impl 'static + FnOnce()) -> Self {
        Self {
            unsubscribe: Some(Box::new(unsubscribe)),
        }
    }

    /// Detaches the subscription from this handle. The callback will
    /// continue to be invoked until the entities it has been
    /// subscribed to are dropped
    pub fn detach(mut self) {
        self.unsubscribe.take();
    }

    /// Joins two subscriptions into a single subscription. Detach will
    /// detach both interior subscriptions.
    pub fn join(mut subscription_a: Self, mut subscription_b: Self) -> Self {
        let a_unsubscribe = subscription_a.unsubscribe.take();
        let b_unsubscribe = subscription_b.unsubscribe.take();
        Self {
            unsubscribe: Some(Box::new(move || {
                if let Some(self_unsubscribe) = a_unsubscribe {
                    self_unsubscribe();
                }
                if let Some(other_unsubscribe) = b_unsubscribe {
                    other_unsubscribe();
                }
            })),
        }
    }
}

impl Drop for Subscription {
    fn drop(&mut self) {
        if let Some(unsubscribe) = self.unsubscribe.take() {
            unsubscribe();
        }
    }
}

impl std::fmt::Debug for Subscription {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Subscription").finish()
    }
}
