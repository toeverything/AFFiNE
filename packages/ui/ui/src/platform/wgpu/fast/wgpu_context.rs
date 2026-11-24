//! The context that draws this thread's windows on platforms that draw with
//! wgpu (Linux: Wayland and X11), for applications that render with wgpu
//! themselves.
//!
//! A `WgpuDynamicTexture` has to be allocated from the context drawing the
//! window that shows it. There, that context lives in the shared slot every
//! window's renderer is created with, which the platform keeps private. A
//! producer that renders on GPUI's device (a map engine, a 3D viewport) draws
//! during `paint` into a dynamic texture from that context and paints it as a
//! sprite, so its content and GPUI's elements reach the screen in one frame,
//! with GPUI's clipping, opacity and painter order.

use std::{cell::RefCell, rc::Rc};

use crate::platform::wgpu::{GpuContext, WgpuContext};

thread_local! {
    /// The shared context slot of this thread's windows, noted by
    /// [`note_gpu_context`] when a window's renderer is created.
    static GPU_CONTEXT: RefCell<Option<GpuContext>> = const { RefCell::new(None) };
}

/// Notes the slot a window's renderer was created with, as `WgpuRenderer::new`
/// does for every window. Every window of a platform shares one slot, and
/// device recovery replaces the context inside it, so keeping the slot keeps
/// the current context.
pub(crate) fn note_gpu_context(gpu_context: &GpuContext) {
    GPU_CONTEXT.with_borrow_mut(|noted| match noted {
        Some(existing) if Rc::ptr_eq(existing, gpu_context) => {}
        _ => *noted = Some(Rc::clone(gpu_context)),
    });
}

/// The context drawing this thread's windows, once the first window's renderer
/// exists. An application that renders with wgpu allocates its dynamic
/// textures from here, so GPUI can sample what it drew.
///
/// `None` before the first window, while a lost device is being replaced, and
/// on platforms that don't draw with wgpu (macOS, Windows). After a device
/// loss, drop the textures from the old context and allocate new ones from the
/// context this returns then.
pub fn wgpu_context() -> Option<WgpuContext> {
    GPU_CONTEXT.with_borrow(|noted| noted.as_ref()?.borrow().clone())
}
