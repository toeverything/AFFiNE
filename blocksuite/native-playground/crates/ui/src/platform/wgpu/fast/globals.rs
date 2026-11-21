//! The global uniforms written only when they change.
//!
//! Upstream writes the globals, the path globals and the gamma parameters with
//! a `Queue::write_buffer` each, every frame. Each write allocates a staging
//! buffer and records a copy that the next submit has to run, yet the values
//! only change with the window's size, transparency or text settings.

use crate::platform::wgpu::wgpu_renderer::{GammaParams, GlobalParams, WgpuRendererCore};

const GLOBALS: usize = size_of::<GlobalParams>();
const GAMMA: usize = size_of::<GammaParams>();

/// The bytes last written to the globals buffer: globals, path globals, gamma.
#[derive(Default)]
pub(crate) struct UploadedGlobals(Option<[u8; 2 * GLOBALS + GAMMA]>);

impl UploadedGlobals {
    /// Whether the frame being drawn blends with premultiplied alpha, as the
    /// globals written for it say. Layer tiles are drawn to match.
    pub(crate) fn premultiplied_alpha(&self) -> bool {
        self.0.is_some_and(|bytes| {
            bytemuck::pod_read_unaligned::<GlobalParams>(&bytes[..GLOBALS]).premultiplied_alpha != 0
        })
    }
}

/// Forwarded to by `WgpuRendererCore::render_frame` in place of its three
/// globals writes.
pub(crate) fn write_globals(
    renderer: &mut WgpuRendererCore,
    globals: &GlobalParams,
    path_globals: &GlobalParams,
    gamma_params: &GammaParams,
) {
    let mut bytes = [0; 2 * GLOBALS + GAMMA];
    bytes[..GLOBALS].copy_from_slice(bytemuck::bytes_of(globals));
    bytes[GLOBALS..2 * GLOBALS].copy_from_slice(bytemuck::bytes_of(path_globals));
    bytes[2 * GLOBALS..].copy_from_slice(bytemuck::bytes_of(gamma_params));
    if renderer.fast_frame.globals.0 == Some(bytes) {
        return;
    }
    renderer.fast_frame.globals.0 = Some(bytes);

    let resources = renderer.resources();
    let (queue, buffer) = (&resources.queue, &resources.globals_buffer);
    queue.write_buffer(buffer, 0, &bytes[..GLOBALS]);
    queue.write_buffer(
        buffer,
        renderer.path_globals_offset,
        &bytes[GLOBALS..2 * GLOBALS],
    );
    queue.write_buffer(buffer, renderer.gamma_offset, &bytes[2 * GLOBALS..]);
}
