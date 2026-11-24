//! Bind groups kept from frame to frame instead of created for every batch.
//!
//! Upstream creates a texture bind group for every sprite batch and an
//! instance bind group for every primitive kind, every frame. Creating a bind
//! group goes through wgpu-core's validation and the driver's descriptor
//! allocator, and a frame of text-heavy UI has one sprite batch per run of
//! glyphs between two quads. The same atlas texture is bound again and again,
//! and the instance ranges repeat whenever a frame's primitive counts do.

use std::cell::{Cell, RefCell};
use std::num::NonZeroU64;

use crate::collections::HashMap;

/// Frames an unused bind group is kept for before it is dropped. A bind group
/// keeps its texture view or buffer alive, so entries must not linger.
const KEEP_FRAMES: u64 = 2;

#[derive(Default)]
pub(crate) struct BindGroupCache {
    frame: Cell<u64>,
    textures: RefCell<HashMap<wgpu::TextureView, (wgpu::BindGroup, u64)>>,
    instances: RefCell<HashMap<(wgpu::Buffer, u64, u64), (wgpu::BindGroup, u64)>>,
}

impl BindGroupCache {
    /// Starts a frame: drops the bind groups no frame has used lately.
    pub(crate) fn begin_frame(&mut self) {
        let frame = self.frame.get() + 1;
        self.frame.set(frame);
        let keep = |(_, used): &mut (wgpu::BindGroup, u64)| *used + KEEP_FRAMES >= frame;
        self.textures.get_mut().retain(|_, entry| keep(entry));
        self.instances.get_mut().retain(|_, entry| keep(entry));
    }

    /// The bind group of `view` with `sampler`, in the `layout` that every
    /// texture bind group of the renderer shares.
    pub(crate) fn texture(
        &self,
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        sampler: &wgpu::Sampler,
        label: &str,
        view: &wgpu::TextureView,
    ) -> wgpu::BindGroup {
        let frame = self.frame.get();
        let mut textures = self.textures.borrow_mut();
        if let Some((bind_group, used)) = textures.get_mut(view) {
            *used = frame;
            return bind_group.clone();
        }
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(label),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
            ],
        });
        textures.insert(view.clone(), (bind_group.clone(), frame));
        bind_group
    }

    /// The bind group of `size` bytes of the storage `buffer` at `offset`.
    pub(crate) fn storage(
        &self,
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        label: &str,
        buffer: &wgpu::Buffer,
        offset: u64,
        size: u64,
    ) -> wgpu::BindGroup {
        let frame = self.frame.get();
        let mut instances = self.instances.borrow_mut();
        let key = (buffer.clone(), offset, size);
        if let Some((bind_group, used)) = instances.get_mut(&key) {
            *used = frame;
            return bind_group.clone();
        }
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(label),
            layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                    buffer,
                    offset,
                    size: NonZeroU64::new(size),
                }),
            }],
        });
        instances.insert(key, (bind_group.clone(), frame));
        bind_group
    }
}
