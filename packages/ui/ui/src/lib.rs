//! Fused internal GPU UI library.
//!
//! Single crate with zero internal proc-macro crates and zero domain knowledge
//! of the host application. Supports:
//! - macOS: AppKit + Metal + CoreText (`MetalRenderer::new_headless`)
//! - Linux: headless `wgpu` + `cosmic-text` (`WgpuHeadlessRenderer`)
//! - Web: single-threaded `wasm32-unknown-unknown` + WebGPU/WebGL2 + `CanvasFontFallback`

#![allow(
    dead_code,
    unused_imports,
    unused_mut,
    unused_variables,
    clippy::clone_on_copy,
    clippy::empty_line_after_doc_comments,
    clippy::needless_ifs,
    clippy::type_complexity
)]

extern crate self as ui;

pub mod collections;
pub mod gestures;
pub mod gpui_util;
pub mod motion;
pub mod prelude;
pub mod refineable;
pub mod scheduler;
pub mod shared_string;

pub mod harness;

#[macro_use]
mod action;
mod app;
mod arena;
mod asset_cache;
mod assets;
mod color;
mod element;
mod elements;
mod executor;
mod fast;
mod geometry;
mod global;
mod input;
mod interactive;
mod key_dispatch;
mod keymap;
mod path_builder;
mod platform;
mod platform_scheduler;
mod scene;
mod shared_uri;
mod style;
mod styled;
mod subscription;
mod svg_renderer;
mod taffy;
mod text_system;
mod util;
mod view;
mod window;

pub(crate) use fast::bounds_tree;
pub(crate) use fast::tab_stop;

#[cfg(any(test, target_os = "linux", target_family = "wasm", feature = "harness",))]
pub mod queue;

#[cfg(any(target_os = "linux", target_family = "wasm"))]
pub use queue::{PriorityQueueReceiver, PriorityQueueSender};

pub use action::*;
pub use anyhow::Result;
pub use app::*;
pub use asset_cache::*;
pub use assets::*;
pub use color::*;
pub use element::*;
pub use elements::*;
pub use executor::*;
#[doc(hidden)]
pub use fast::app_borrow::app_is_borrowed;
#[cfg(any(test, feature = "harness"))]
pub use fast::stats::LayoutStats;
pub use geometry::*;
pub use gestures::{
    BackPhase, PanHandoff, ScrollAxis, TouchGesture, TouchGestureConfig, TouchGestureRecognizer,
};
pub use global::*;
pub use gpui_util::arc_cow::ArcCow;
pub use input::*;
pub use interactive::*;
pub use keymap::*;
pub use motion::{CriticallyDampedSpring, InertialDecay, Motion, MotionCurve, rubber_band};
pub use path_builder::*;
pub use platform::*;
pub use refineable::*;
pub use scene::*;
pub use shared_string::*;
pub use shared_uri::*;
pub use style::*;
pub use styled::*;
pub use subscription::*;
pub use svg_renderer::*;
pub use taffy::{AvailableSpace, LayoutId};
pub use text_system::*;
pub use util::{FutureExt, Timeout};
pub use view::*;
pub use window::*;

#[cfg(not(target_family = "wasm"))]
pub use pollster::block_on;

pub use harness::{
    AuditViolation, DebugElementSnapshot, FrameSnapshot, SnapshotRect, audit_frame_snapshot,
};
pub use platform::clock::{now as clock_now, system_now};
#[cfg(all(not(target_family = "wasm"), any(test, feature = "harness")))]
pub use platform::headless::{HeadlessDispatcher, HeadlessPlatform, HeadlessWindow};
#[cfg(any(test, feature = "harness"))]
pub use scheduler::{Clock, Scheduler, TestScheduler, TestSchedulerConfig};

#[cfg(any(target_os = "macos", target_os = "ios"))]
pub use platform::apple::AppleTextSystem;
#[cfg(all(
    any(target_os = "macos", target_os = "ios"),
    any(test, feature = "harness")
))]
pub use platform::apple::metal_renderer::MetalHeadlessRenderer;
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub use platform::apple::metal_renderer::MetalRenderer;
#[cfg(target_os = "ios")]
pub use platform::ios::{IosDisplay, IosPlatform, IosWindow};
#[cfg(target_os = "macos")]
pub use platform::macos::MacPlatform;

#[cfg(all(target_os = "linux", any(test, feature = "harness")))]
pub use platform::wgpu::WgpuHeadlessRenderer;
#[cfg(any(target_os = "linux", target_family = "wasm"))]
pub use platform::wgpu::{CosmicTextSystem, WgpuContext, WgpuRenderer, WgpuSurfaceConfig};

#[cfg(target_family = "wasm")]
pub use platform::web::{
    CanvasFontFallback, WebBackendPreference, WebPlatform, WebWindow, WebWindowError,
};

pub(crate) use arena::*;
pub(crate) use platform_scheduler::PlatformScheduler;
pub(crate) use tab_stop::*;

use std::{any::Any, future::Future};

use key_dispatch::*;

mod seal {
    pub trait Sealed {}
}

/// The context trait, allowing different contexts to be used interchangeably for entity operations.
pub trait AppContext {
    #[expect(
        clippy::wrong_self_convention,
        reason = "`App::new` is an ubiquitous function for creating entities"
    )]
    fn new<T: 'static>(&mut self, build_entity: impl FnOnce(&mut Context<T>) -> T) -> Entity<T>;

    fn reserve_entity<T: 'static>(&mut self) -> Reservation<T>;

    fn insert_entity<T: 'static>(
        &mut self,
        reservation: Reservation<T>,
        build_entity: impl FnOnce(&mut Context<T>) -> T,
    ) -> Entity<T>;

    fn update_entity<T, R>(
        &mut self,
        handle: &Entity<T>,
        update: impl FnOnce(&mut T, &mut Context<T>) -> R,
    ) -> R
    where
        T: 'static;

    fn as_mut<'a, T>(&'a mut self, handle: &Entity<T>) -> GpuiBorrow<'a, T>
    where
        T: 'static;

    fn read_entity<T, R>(&self, handle: &Entity<T>, read: impl FnOnce(&T, &App) -> R) -> R
    where
        T: 'static;

    #[track_caller]
    fn update_window<T, F>(&mut self, window: AnyWindowHandle, f: F) -> Result<T>
    where
        F: FnOnce(AnyView, &mut Window, &mut App) -> T;

    fn with_window<R>(
        &mut self,
        entity_id: EntityId,
        f: impl FnOnce(&mut Window, &mut App) -> R,
    ) -> Option<R>;

    fn read_window<T, R>(
        &self,
        window: &WindowHandle<T>,
        read: impl FnOnce(Entity<T>, &App) -> R,
    ) -> Result<R>
    where
        T: 'static;

    fn background_spawn<R>(&self, future: impl Future<Output = R> + Send + 'static) -> Task<R>
    where
        R: Send + 'static;

    fn read_global<G, R>(&self, callback: impl FnOnce(&G, &App) -> R) -> R
    where
        G: Global;
}

/// Returned by [`Context::reserve_entity`] to later be passed to [`Context::insert_entity`].
pub struct Reservation<T>(pub(crate) Slot<T>);

impl<T: 'static> Reservation<T> {
    pub fn entity_id(&self) -> EntityId {
        self.0.entity_id()
    }
}

/// Context trait for contexts that also hold a mutable [`Window`].
pub trait VisualContext: AppContext {
    type Result<T>;

    fn window_handle(&self) -> AnyWindowHandle;

    fn update_window_entity<T: 'static, R>(
        &mut self,
        entity: &Entity<T>,
        update: impl FnOnce(&mut T, &mut Window, &mut Context<T>) -> R,
    ) -> Self::Result<R>;

    fn new_window_entity<T: 'static>(
        &mut self,
        build_entity: impl FnOnce(&mut Window, &mut Context<T>) -> T,
    ) -> Self::Result<Entity<T>>;

    fn replace_root_view<V>(
        &mut self,
        build_view: impl FnOnce(&mut Window, &mut Context<V>) -> V,
    ) -> Self::Result<Entity<V>>
    where
        V: 'static + Render;

    fn focus<V>(&mut self, entity: &Entity<V>) -> Self::Result<()>
    where
        V: Focusable;
}

/// Marker trait tying an entity to the event types it can emit.
pub trait EventEmitter<E: Any>: 'static {}

/// Helper trait for borrowing a mutable [`App`] for global access.
pub trait BorrowAppContext {
    fn set_global<T: Global>(&mut self, global: T);
    fn update_global<G, R>(&mut self, f: impl FnOnce(&mut G, &mut Self) -> R) -> R
    where
        G: Global;
    fn update_default_global<G, R>(&mut self, f: impl FnOnce(&mut G, &mut Self) -> R) -> R
    where
        G: Global + Default;
}

impl<C> BorrowAppContext for C
where
    C: std::borrow::BorrowMut<App>,
{
    fn set_global<G: Global>(&mut self, global: G) {
        self.borrow_mut().set_global(global)
    }

    #[track_caller]
    fn update_global<G, R>(&mut self, f: impl FnOnce(&mut G, &mut Self) -> R) -> R
    where
        G: Global,
    {
        let mut global = self.borrow_mut().lease_global::<G>();
        let result = f(&mut global, self);
        self.borrow_mut().end_global_lease(global);
        result
    }

    fn update_default_global<G, R>(&mut self, f: impl FnOnce(&mut G, &mut Self) -> R) -> R
    where
        G: Global + Default,
    {
        self.borrow_mut().default_global::<G>();
        self.update_global(f)
    }
}

/// Information about the GPU backend currently in use.
#[derive(Default, Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct GpuSpecs {
    pub is_software_emulated: bool,
    pub device_name: String,
    pub driver_name: String,
    pub driver_info: String,
}

/// Helper trait for borrowing a reference to an [`App`].
pub trait AsApp {
    fn as_app(&self) -> &App;
}

impl AsApp for App {
    fn as_app(&self) -> &App {
        self
    }
}

/// Extension trait for [`Any`] downcasting.
pub trait Flatten<T> {
    fn flatten(self) -> Result<T>;
}

impl<T> Flatten<T> for Result<Result<T>> {
    fn flatten(self) -> Result<T> {
        self?
    }
}

/// Hashes a value using `SeaHasher`.
pub fn hash<T: std::hash::Hash>(data: &T) -> u64 {
    use std::hash::Hasher as _;
    let mut hasher = seahash::SeaHasher::new();
    data.hash(&mut hasher);
    hasher.finish()
}

/// Marker trait for types that can be converted into [`Any`].
pub trait AnyExt {
    fn as_any(&self) -> &dyn Any;
}

impl<T: Any> AnyExt for T {
    fn as_any(&self) -> &dyn Any {
        self
    }
}
