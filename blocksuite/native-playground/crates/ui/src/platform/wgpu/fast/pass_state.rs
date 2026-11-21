//! Render pass state set only when it changes.
//!
//! Upstream sets the pipeline and every bind group before each batch's draw.
//! wgpu-core doesn't skip a repeated `set_pipeline`: it records it, validates
//! it, re-derives the bind group state and emits it to the driver again, and
//! the same for each `set_bind_group`. Consecutive batches share the globals
//! bind group always, and often the pipeline, the instance bind group and the
//! atlas texture, so most of those calls were no-ops that still cost CPU.
//!
//! Bind groups stay bound across `set_pipeline` in WebGPU, so skipping a call
//! whose bind group is already bound draws the same image.

/// What the current render pass has bound.
#[derive(Default)]
pub(crate) struct PassState {
    pipeline: Option<wgpu::RenderPipeline>,
    bind_groups: [Option<wgpu::BindGroup>; 4],
}

impl PassState {
    /// Forgets what is bound, for a pass that starts with nothing bound.
    pub(crate) fn forget(&mut self) {
        *self = Self::default();
    }

    pub(crate) fn set_pipeline(
        &mut self,
        pass: &mut wgpu::RenderPass<'_>,
        pipeline: &wgpu::RenderPipeline,
    ) {
        if self.pipeline.as_ref() != Some(pipeline) {
            pass.set_pipeline(pipeline);
            self.pipeline = Some(pipeline.clone());
        }
    }

    pub(crate) fn set_bind_group(
        &mut self,
        pass: &mut wgpu::RenderPass<'_>,
        index: u32,
        bind_group: &wgpu::BindGroup,
    ) {
        let slot = &mut self.bind_groups[index as usize];
        if slot.as_ref() != Some(bind_group) {
            pass.set_bind_group(index, bind_group, &[]);
            *slot = Some(bind_group.clone());
        }
    }
}
