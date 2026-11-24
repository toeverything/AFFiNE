mod dispatcher;
pub mod display_link;
mod fast;
mod metal_atlas;
pub mod metal_renderer;

#[cfg(feature = "font-kit")]
mod open_type;
#[cfg(feature = "font-kit")]
mod text_system;

use objc2::MainThreadMarker;

pub use dispatcher::{AppleActivity, AppleDispatcher};
#[cfg(feature = "font-kit")]
pub use text_system::AppleTextSystem;

#[inline]
pub fn main_thread_marker() -> Option<MainThreadMarker> {
    thread_local! {
        static MAIN_THREAD_MARKER: Option<MainThreadMarker> = MainThreadMarker::new();
    }
    MAIN_THREAD_MARKER.with(|marker| *marker)
}
