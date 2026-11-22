use crate::gpui_util::Deferred;
use crate::{
    AnyView, AnyWindowHandle, AppContext, AsyncApp, DispatchPhase, Effect, EntityId, EventEmitter,
    FocusHandle, FocusOutEvent, Focusable, Global, Priority, Reservation, Subscription, Task,
    WeakEntity, WeakFocusHandle, Window, WindowHandle, WindowVisibility,
};
use anyhow::Result;
use futures::FutureExt;
use std::{
    any::{Any, TypeId},
    borrow::{Borrow, BorrowMut},
    future::Future,
    ops,
    sync::Arc,
};

use super::{App, AsyncWindowContext, Entity, KeystrokeEvent};

/// The app context, with specialized behavior for the given entity.
pub struct Context<'a, T> {
    app: &'a mut App,
    entity_state: WeakEntity<T>,
}

impl<'a, T> ops::Deref for Context<'a, T> {
    type Target = App;

    fn deref(&self) -> &Self::Target {
        self.app
    }
}

impl<'a, T> ops::DerefMut for Context<'a, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.app
    }
}

impl<'a, T: 'static> Context<'a, T> {
    pub(crate) fn new_context(app: &'a mut App, entity_state: WeakEntity<T>) -> Self {
        Self { app, entity_state }
    }

    /// The entity id of the entity backing this context.
    pub fn entity_id(&self) -> EntityId {
        self.entity_state.entity_id
    }

    /// Returns a handle to the entity belonging to this context.
    pub fn entity(&self) -> Entity<T> {
        self.weak_entity()
            .upgrade()
            .expect("The entity must be alive if we have a entity context")
    }

    /// Returns a weak handle to the entity belonging to this context.
    pub fn weak_entity(&self) -> WeakEntity<T> {
        self.entity_state.clone()
    }

    /// Arranges for the given function to be called whenever [`Context::notify`] is
    /// called with the given entity.
    pub fn observe<W>(
        &mut self,
        entity: &Entity<W>,
        mut on_notify: impl FnMut(&mut T, Entity<W>, &mut Context<T>) + 'static,
    ) -> Subscription
    where
        T: 'static,
        W: 'static,
    {
        let observer = self.weak_entity();
        self.app.observe_internal(entity, move |entity, cx| {
            invoke_observer(&observer, entity, cx, &mut on_notify)
        })
    }

    /// Subscribe to an event type from another entity
    pub fn subscribe<T2, Evt>(
        &mut self,
        entity: &Entity<T2>,
        mut on_event: impl FnMut(&mut T, Entity<T2>, &Evt, &mut Context<T>) + 'static,
    ) -> Subscription
    where
        T: 'static,
        T2: 'static + EventEmitter<Evt>,
        Evt: 'static,
    {
        let subscriber = self.weak_entity();
        self.app
            .subscribe_internal(entity, move |entity, event, cx| {
                invoke_subscriber(&subscriber, entity, event, cx, &mut on_event)
            })
    }

    /// Register a callback to be invoked when GPUI releases this entity.
    pub fn on_release(&self, on_release: impl FnOnce(&mut T, &mut App) + 'static) -> Subscription
    where
        T: 'static,
    {
        self.app.release_listeners.insert(
            self.entity_state.entity_id,
            Box::new(move |this, cx| {
                let this = this.downcast_mut().expect("invalid entity type");
                on_release(this, cx);
            }),
        )
    }

    /// Register a callback to be run on the release of another entity
    pub fn observe_release<T2>(
        &self,
        entity: &Entity<T2>,
        on_release: impl FnOnce(&mut T, &mut T2, &mut Context<T>) + 'static,
    ) -> Subscription
    where
        T: Any,
        T2: 'static,
    {
        let entity_id = entity.entity_id();
        let this = self.weak_entity();
        self.app.release_listeners.insert(
            entity_id,
            Box::new(move |entity, cx| {
                let entity = entity.downcast_mut().expect("invalid entity type");
                if let Some(this) = this.upgrade() {
                    this.update(cx, |this, cx| on_release(this, entity, cx));
                }
            }),
        )
    }

    /// Register a callback to for updates to the given global
    pub fn observe_global<G: 'static>(
        &mut self,
        mut f: impl FnMut(&mut T, &mut Context<T>) + 'static,
    ) -> Subscription
    where
        T: 'static,
    {
        let handle = self.weak_entity();
        let subscription = crate::fast::observers::observe_global(
            self,
            TypeId::of::<G>(),
            Box::new(move |cx| handle.update(cx, |view, cx| f(view, cx)).is_ok()),
        );
        subscription
    }

    /// Register a callback to be invoked when the application is about to restart.
    pub fn on_app_restart(
        &self,
        mut on_restart: impl FnMut(&mut T, &mut App) + 'static,
    ) -> Subscription
    where
        T: 'static,
    {
        let handle = self.weak_entity();
        self.app.on_app_restart(move |cx| {
            handle.update(cx, |entity, cx| on_restart(entity, cx)).ok();
        })
    }

    /// Arrange for the given function to be invoked whenever the application is quit.
    /// The future returned from this callback will be polled for up to [crate::SHUTDOWN_TIMEOUT] until the app fully quits.
    pub fn on_app_quit<Fut>(
        &self,
        mut on_quit: impl FnMut(&mut T, &mut Context<T>) -> Fut + 'static,
    ) -> Subscription
    where
        Fut: 'static + Future<Output = ()>,
        T: 'static,
    {
        let handle = self.weak_entity();
        self.app.on_app_quit(move |cx| {
            let future = handle.update(cx, |entity, cx| on_quit(entity, cx)).ok();
            async move {
                if let Some(future) = future {
                    future.await;
                }
            }
            .boxed_local()
        })
    }

    /// Tell GPUI that this entity has changed and observers of it should be notified.
    pub fn notify(&mut self) {
        self.app.notify(self.entity_state.entity_id);
    }

    /// Spawn the future returned by the given function.
    /// The function is provided a weak handle to the entity owned by this context and a context that can be held across await points.
    /// The returned task must be held or detached.
    #[track_caller]
    #[inline(always)]
    pub fn spawn<AsyncFn, R>(&self, f: AsyncFn) -> Task<R>
    where
        T: 'static,
        AsyncFn: AsyncFnOnce(WeakEntity<T>, &mut AsyncApp) -> R + 'static,
        R: 'static,
    {
        let this = self.weak_entity();
        self.app.spawn(async move |cx| f(this, cx).await)
    }

    /// Convenience method for accessing view state in an event callback.
    ///
    /// Many GPUI callbacks take the form of `Fn(&E, &mut Window, &mut App)`,
    /// but it's often useful to be able to access view state in these
    /// callbacks. This method provides a convenient way to do so.
    #[inline(always)]
    pub fn listener<E: ?Sized>(
        &self,
        listener: impl Fn(&mut T, &E, &mut Window, &mut Context<T>) + 'static,
    ) -> impl Fn(&E, &mut Window, &mut App) + 'static {
        let view = self.entity().downgrade();
        move |event: &E, window: &mut Window, cx: &mut App| {
            invoke_listener(&view, window, cx, &|view, window, cx| {
                listener(view, event, window, cx);
            });
        }
    }

    /// Run something using this entity and cx, when the returned struct is dropped
    pub fn on_drop(
        &self,
        f: impl FnOnce(&mut T, &mut Context<T>) + 'static,
    ) -> Deferred<impl FnOnce()> {
        let this = self.weak_entity();
        let mut cx = self.to_async();
        crate::gpui_util::defer(move || {
            this.update(&mut cx, f).ok();
        })
    }

    /// Focus the given view in the given window. View type is required to implement Focusable.
    pub fn focus_view<W: Focusable>(&mut self, view: &Entity<W>, window: &mut Window) {
        window.focus(&view.focus_handle(self), self);
    }

    /// Sets a given callback to be run on the next frame.
    pub fn on_next_frame(
        &self,
        window: &mut Window,
        f: impl FnOnce(&mut T, &mut Window, &mut Context<T>) + 'static,
    ) where
        T: 'static,
    {
        let view = self.entity();
        window.on_next_frame(move |window, cx| view.update(cx, |view, cx| f(view, window, cx)));
    }

    /// Register a callback to be invoked when the given Entity is released.
    pub fn observe_release_in<T2>(
        &self,
        observed: &Entity<T2>,
        window: &Window,
        mut on_release: impl FnMut(&mut T, &mut T2, &mut Window, &mut Context<T>) + 'static,
    ) -> Subscription
    where
        T: 'static,
        T2: 'static,
    {
        let observer = self.weak_entity();
        self.app
            .observe_release_in(observed, window, move |observed, window, cx| {
                observer
                    .update(cx, |observer, cx| {
                        on_release(observer, observed, window, cx)
                    })
                    .ok();
            })
    }

    /// Registers a callback to be invoked when the window's visibility changes
    /// (see [`WindowVisibility`]).
    pub fn observe_window_visibility(
        &self,
        window: &mut Window,
        mut callback: impl FnMut(&mut T, WindowVisibility, &mut Window, &mut Context<T>) + 'static,
    ) -> Subscription {
        let view = self.weak_entity();
        window
            .visibility_observers
            .insert(Box::new(move |visibility, window, cx| {
                view.update(cx, |view, cx| callback(view, visibility, window, cx))
                    .is_ok()
            }))
    }

    /// Registers a callback to be invoked when the window appearance changes.
    pub fn observe_window_appearance(
        &self,
        window: &mut Window,
        mut callback: impl FnMut(&mut T, &mut Window, &mut Context<T>) + 'static,
    ) -> Subscription {
        let view = self.weak_entity();
        window
            .appearance_observers
            .insert(Box::new(move |window, cx| {
                view.update(cx, |view, cx| callback(view, window, cx))
                    .is_ok()
            }))
    }

    /// Registers a callback invoked when the window moves to another display
    /// or its display's refresh interval changes. See
    /// [`Window::observe_window_display`].
    pub fn observe_window_display(
        &self,
        window: &mut Window,
        mut callback: impl FnMut(&mut T, &mut Window, &mut Context<T>) + 'static,
    ) -> Subscription {
        let view = self.weak_entity();
        window.display_observers.insert(Box::new(move |window, cx| {
            view.update(cx, |view, cx| callback(view, window, cx))
                .is_ok()
        }))
    }

    /// Registers a callback to be invoked when the window button layout changes.
    pub fn observe_button_layout_changed(
        &self,
        window: &mut Window,
        mut callback: impl FnMut(&mut T, &mut Window, &mut Context<T>) + 'static,
    ) -> Subscription {
        let view = self.weak_entity();
        window
            .button_layout_observers
            .insert(Box::new(move |window, cx| {
                view.update(cx, |view, cx| callback(view, window, cx))
                    .is_ok()
            }))
    }

    /// Registers a callback for [`App::observe_keystrokes`] that updates this entity.
    pub fn observe_keystrokes(
        &mut self,
        mut f: impl FnMut(&mut T, &KeystrokeEvent, &mut Window, &mut Context<T>) + 'static,
    ) -> Subscription {
        let view = self.weak_entity();
        self.keystroke_observers
            .insert(Box::new(move |event, window, cx| {
                if let Some(view) = view.upgrade() {
                    view.update(cx, |view, cx| f(view, event, window, cx));
                    true
                } else {
                    false
                }
            }))
    }

    /// Register a listener to be called when the given focus handle or one of its descendants receives focus.
    /// This does not fire if the given focus handle - or one of its descendants - was previously focused.
    /// Returns a subscription and persists until the subscription is dropped.
    pub fn on_focus_in(
        &mut self,
        handle: &FocusHandle,
        window: &mut Window,
        mut listener: impl FnMut(&mut T, &mut Window, &mut Context<T>) + 'static,
    ) -> Subscription {
        let view = self.weak_entity();
        let focus_id = handle.id;
        let (subscription, activate) =
            window.new_focus_listener(Box::new(move |event, window, cx| {
                view.update(cx, |view, cx| {
                    if event.is_focus_in(focus_id) {
                        listener(view, window, cx)
                    }
                })
                .is_ok()
            }));
        self.defer(|_| activate());
        subscription
    }

    /// Register a listener to be called when the given focus handle or one of its descendants loses focus.
    /// Returns a subscription and persists until the subscription is dropped.
    pub fn on_focus_out(
        &mut self,
        handle: &FocusHandle,
        window: &mut Window,
        mut listener: impl FnMut(&mut T, FocusOutEvent, &mut Window, &mut Context<T>) + 'static,
    ) -> Subscription {
        let view = self.weak_entity();
        let focus_id = handle.id;
        let (subscription, activate) =
            window.new_focus_listener(Box::new(move |event, window, cx| {
                view.update(cx, |view, cx| {
                    if let Some(blurred_id) = event.previous_focus_path.last().copied()
                        && event.is_focus_out(focus_id)
                    {
                        let event = FocusOutEvent {
                            blurred: WeakFocusHandle {
                                id: blurred_id,
                                handles: Arc::downgrade(&cx.focus_handles),
                            },
                        };
                        listener(view, event, window, cx)
                    }
                })
                .is_ok()
            }));
        self.defer(|_| activate());
        subscription
    }

    /// Register a callback to be invoked when the given Action type is dispatched to the window.
    pub fn on_action(
        &mut self,
        action_type: TypeId,
        window: &mut Window,
        listener: impl Fn(&mut T, &dyn Any, DispatchPhase, &mut Window, &mut Context<T>) + 'static,
    ) {
        let handle = self.weak_entity();
        window.on_action(action_type, move |action, phase, window, cx| {
            handle
                .update(cx, |view, cx| {
                    listener(view, action, phase, window, cx);
                })
                .ok();
        });
    }
}

impl<T> Context<'_, T> {
    /// Emit an event of the specified type, which can be handled by other entities that have subscribed via `subscribe` methods on their respective contexts.
    pub fn emit<Evt>(&mut self, event: Evt)
    where
        T: EventEmitter<Evt>,
        Evt: 'static,
    {
        let event = self
            .event_arena
            .alloc(|| event)
            .map(|it| it as &mut dyn Any);
        self.app.pending_effects.push_back(Effect::Emit {
            emitter: self.entity_state.entity_id,
            event_type: TypeId::of::<Evt>(),
            event,
        });
    }
}

impl<T> AppContext for Context<'_, T> {
    #[inline]
    fn new<U: 'static>(&mut self, build_entity: impl FnOnce(&mut Context<U>) -> U) -> Entity<U> {
        self.app.new(build_entity)
    }

    #[inline]
    fn reserve_entity<U: 'static>(&mut self) -> Reservation<U> {
        self.app.reserve_entity()
    }

    #[inline]
    fn insert_entity<U: 'static>(
        &mut self,
        reservation: Reservation<U>,
        build_entity: impl FnOnce(&mut Context<U>) -> U,
    ) -> Entity<U> {
        self.app.insert_entity(reservation, build_entity)
    }

    #[inline]
    fn update_entity<U: 'static, R>(
        &mut self,
        handle: &Entity<U>,
        update: impl FnOnce(&mut U, &mut Context<U>) -> R,
    ) -> R {
        self.app.update_entity(handle, update)
    }

    #[inline]
    fn as_mut<'a, E>(&'a mut self, handle: &Entity<E>) -> super::GpuiBorrow<'a, E>
    where
        E: 'static,
    {
        self.app.as_mut(handle)
    }

    #[inline]
    fn read_entity<U, R>(&self, handle: &Entity<U>, read: impl FnOnce(&U, &App) -> R) -> R
    where
        U: 'static,
    {
        self.app.read_entity(handle, read)
    }

    #[inline]
    fn update_window<R, F>(&mut self, window: AnyWindowHandle, update: F) -> Result<R>
    where
        F: FnOnce(AnyView, &mut Window, &mut App) -> R,
    {
        self.app.update_window(window, update)
    }

    #[inline]
    fn with_window<R>(
        &mut self,
        entity_id: EntityId,
        f: impl FnOnce(&mut Window, &mut App) -> R,
    ) -> Option<R> {
        self.app.with_window(entity_id, f)
    }

    #[inline]
    fn read_window<U, R>(
        &self,
        window: &WindowHandle<U>,
        read: impl FnOnce(Entity<U>, &App) -> R,
    ) -> Result<R>
    where
        U: 'static,
    {
        self.app.read_window(window, read)
    }

    #[inline]
    fn background_spawn<R>(&self, future: impl Future<Output = R> + Send + 'static) -> Task<R>
    where
        R: Send + 'static,
    {
        self.app.background_executor.spawn(future)
    }

    #[inline]
    fn read_global<G, R>(&self, callback: impl FnOnce(&G, &App) -> R) -> R
    where
        G: Global,
    {
        self.app.read_global(callback)
    }
}

impl<T> Borrow<App> for Context<'_, T> {
    fn borrow(&self) -> &App {
        self.app
    }
}

impl<T> BorrowMut<App> for Context<'_, T> {
    fn borrow_mut(&mut self) -> &mut App {
        self.app
    }
}

#[inline(never)]
fn invoke_observer<T: 'static, W: 'static>(
    observer: &WeakEntity<T>,
    observed: Entity<W>,
    cx: &mut App,
    on_notify: &mut dyn FnMut(&mut T, Entity<W>, &mut Context<T>),
) -> bool {
    if let Some(observer) = observer.upgrade() {
        observer.update(cx, |observer, cx| on_notify(observer, observed, cx));
        true
    } else {
        false
    }
}

#[inline(never)]
fn invoke_subscriber<T: 'static, Emitter: 'static, Event: 'static>(
    subscriber: &WeakEntity<T>,
    emitter: Entity<Emitter>,
    event: &Event,
    cx: &mut App,
    on_event: &mut dyn FnMut(&mut T, Entity<Emitter>, &Event, &mut Context<T>),
) -> bool {
    if let Some(subscriber) = subscriber.upgrade() {
        subscriber.update(cx, |subscriber, cx| {
            on_event(subscriber, emitter, event, cx)
        });
        true
    } else {
        false
    }
}

#[inline(never)]
fn invoke_listener<T: 'static>(
    view: &WeakEntity<T>,
    window: &mut Window,
    cx: &mut App,
    listener: &dyn Fn(&mut T, &mut Window, &mut Context<T>),
) {
    view.update(cx, |view, cx| listener(view, window, cx)).ok();
}
