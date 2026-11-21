//! Evaluate independent rounded padding edges directly in colour fragments.
//! Nested scopes append geometry and siblings restore the enclosing stack.
//! Only actual path batches restart the colour pass; rounded containers do
//! not allocate textures or encode mask render passes.

use std::{mem, ptr::NonNull};

use crate::{AtlasTextureId, DevicePixels, LayerFrame, PrimitiveBatch, Scene, Size};
use anyhow::{Context as _, Result};
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_core_foundation::CFRetained;
use objc2_core_video::CVMetalTexture;
use objc2_metal::{
    MTLClearColor, MTLCommandBuffer, MTLCommandEncoder, MTLCommandQueue, MTLDevice,
    MTLRenderCommandEncoder, MTLResourceOptions, MTLTexture,
};

use crate::platform::apple::metal_renderer::{
    InstanceBindings, InstanceBufferWriter, MetalRenderer, new_command_encoder_for_texture,
    write_instances,
};

const CLIP_TEXTURE_BASE: u32 = 0xF100_0000;

/// Geometry is copied into Metal's command stream, never retained in a shared
/// mutable texture. A stack remains valid when sibling scopes overlap.
#[repr(C)]
#[derive(Clone, Copy)]
struct Clip {
    bounds: [f32; 4],
    horizontal: [f32; 4],
    vertical: [f32; 4],
}

fn group(scene: &Scene, texture: AtlasTextureId) -> Option<&LayerFrame> {
    let key = texture.index.checked_sub(0xF000_0000)?;
    if texture.index < CLIP_TEXTURE_BASE {
        return None;
    }
    scene
        .layers
        .frames
        .iter()
        .find(|frame| frame.key.0 == key && frame.tile_size == 0)
}

pub(crate) fn has_groups(scene: &Scene) -> bool {
    scene
        .polychrome_sprites
        .iter()
        .any(|sprite| group(scene, sprite.tile.texture_id).is_some())
}

pub(crate) fn default_mask(encoder: &ProtocolObject<dyn MTLRenderCommandEncoder>) {
    let count = 0u32;
    let empty = [0f32; 12];
    // SAFETY: Both values are live for the call, which copies their bytes into
    // the fragment slots the injected clip parameters read.
    unsafe {
        encoder.setFragmentBytes_length_atIndex(NonNull::from(&count).cast(), 4, 29);
        encoder.setFragmentBytes_length_atIndex(NonNull::from(&empty).cast(), 48, 28);
    }
}

fn bind(
    encoder: &ProtocolObject<dyn MTLRenderCommandEncoder>,
    clips: &[Clip],
    device: &ProtocolObject<dyn MTLDevice>,
) {
    let count = clips.len() as u32;
    // SAFETY: `count` is live for the call, which copies its bytes.
    unsafe {
        encoder.setFragmentBytes_length_atIndex(NonNull::from(&count).cast(), 4, 29);
    }
    if !clips.is_empty() {
        let length = mem::size_of_val(clips);
        if length <= 4096 {
            // SAFETY: `clips` is live for the call, which copies its `length` bytes.
            unsafe {
                encoder.setFragmentBytes_length_atIndex(NonNull::from(clips).cast(), length, 28);
            }
        } else {
            // SAFETY: Metal copies `length` bytes of the live `clips` slice.
            let buffer = unsafe {
                device.newBufferWithBytes_length_options(
                    NonNull::from(clips).cast(),
                    length,
                    MTLResourceOptions::StorageModeShared,
                )
            };
            let Some(buffer) = buffer else {
                log::error!("failed to allocate a {length}-byte rounded clip buffer");
                return;
            };
            // SAFETY: The buffer holds `clips.len()` clips from offset zero, and
            // the encoder retains it until the command buffer completes.
            unsafe {
                encoder.setFragmentBuffer_offset_atIndex(Some(&buffer), 0, 28);
            }
        }
    }
}

pub(crate) fn raster_nested_tiles(renderer: &mut MetalRenderer, scene: &Scene) {
    for sprite in &scene.polychrome_sprites {
        if let Some(frame) = group(scene, sprite.tile.texture_id)
            && let Some(child) = frame.content.scene()
        {}
    }
}

pub(crate) fn draw(
    renderer: &mut MetalRenderer,
    scene: &Scene,
    bindings: &InstanceBindings,
    writer: &mut InstanceBufferWriter,
    texture: &ProtocolObject<dyn MTLTexture>,
    viewport: Size<DevicePixels>,
    surface_textures: &mut Vec<CFRetained<CVMetalTexture>>,
) -> Result<Retained<ProtocolObject<dyn MTLCommandBuffer>>> {
    let queue = renderer.command_queue.clone();
    let command_buffer = queue.commandBuffer().context("creating command buffer")?;
    let alpha = if renderer.opaque { 1. } else { 0. };
    let encoder = new_command_encoder_for_texture(
        &command_buffer,
        texture,
        viewport,
        Some(MTLClearColor {
            red: 0.,
            green: 0.,
            blue: 0.,
            alpha,
        }),
    )?;
    encode(
        renderer,
        scene,
        bindings,
        writer,
        texture,
        viewport,
        &command_buffer,
        &mut Vec::new(),
        surface_textures,
        encoder,
    )?
    .endEncoding();
    Ok(command_buffer)
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn draw_tile(
    renderer: &mut MetalRenderer,
    scene: &Scene,
    writer: &mut InstanceBufferWriter,
    texture: &ProtocolObject<dyn MTLTexture>,
    viewport: Size<DevicePixels>,
    commands: &ProtocolObject<dyn MTLCommandBuffer>,
    background: MTLClearColor,
    surface_textures: &mut Vec<CFRetained<CVMetalTexture>>,
) -> Result<()> {
    let old_texture = renderer.path_intermediate_texture.take();
    let old_msaa = renderer.path_intermediate_msaa_texture.take();
    let result = (|| {
        renderer.update_path_intermediate_textures(viewport)?;
        let bindings = write_instances(scene, writer)?;
        let encoder =
            new_command_encoder_for_texture(commands, texture, viewport, Some(background))?;
        encode(
            renderer,
            scene,
            &bindings,
            writer,
            texture,
            viewport,
            commands,
            &mut Vec::new(),
            surface_textures,
            encoder,
        )?
        .endEncoding();
        Ok(())
    })();
    renderer.path_intermediate_texture = old_texture;
    renderer.path_intermediate_msaa_texture = old_msaa;
    result
}

#[allow(clippy::too_many_arguments)]
fn encode(
    renderer: &mut MetalRenderer,
    scene: &Scene,
    bindings: &InstanceBindings,
    writer: &mut InstanceBufferWriter,
    texture: &ProtocolObject<dyn MTLTexture>,
    viewport: Size<DevicePixels>,
    commands: &ProtocolObject<dyn MTLCommandBuffer>,
    clips: &mut Vec<Clip>,
    surface_textures: &mut Vec<CFRetained<CVMetalTexture>>,
    mut encoder: Retained<ProtocolObject<dyn MTLRenderCommandEncoder>>,
) -> Result<Retained<ProtocolObject<dyn MTLRenderCommandEncoder>>> {
    for batch in scene.batches() {
        bind(&encoder, clips, &renderer.device);
        match batch {
            PrimitiveBatch::Shadows(range) => {
                renderer.draw_shadows(range, bindings, viewport, &encoder)
            }
            PrimitiveBatch::Quads(range) => {
                renderer.draw_quads(range, bindings, viewport, &encoder)
            }
            PrimitiveBatch::Underlines(range) => {
                renderer.draw_underlines(range, bindings, viewport, &encoder)
            }
            PrimitiveBatch::MonochromeSprites { texture_id, range } => {
                renderer.draw_monochrome_sprites(texture_id, range, bindings, viewport, &encoder)
            }
            PrimitiveBatch::PolychromeSprites { texture_id, range } => {
                if let Some(frame) = group(scene, texture_id) {
                    let child = frame.content.scene().context("rounded clip content")?;
                    let radii = child
                        .layers
                        .frames
                        .iter()
                        .find(|frame| frame.key.0 == u32::MAX)
                        .context("rounded clip geometry")?
                        .background;
                    for index in range {
                        let sprite = &scene.polychrome_sprites[index];
                        let b = sprite.bounds;
                        let r = sprite.corner_radii;
                        clips.push(Clip {
                            bounds: [b.origin.x.0, b.origin.y.0, b.right().0, b.bottom().0],
                            horizontal: [
                                r.top_left.0,
                                r.top_right.0,
                                r.bottom_right.0,
                                r.bottom_left.0,
                            ],
                            vertical: [radii.r, radii.g, radii.b, radii.a],
                        });
                        let child_bindings = write_instances(child, writer)?;
                        encoder = encode(
                            renderer,
                            child,
                            &child_bindings,
                            writer,
                            texture,
                            viewport,
                            commands,
                            clips,
                            surface_textures,
                            encoder,
                        )?;
                        clips.pop();
                    }
                } else {
                    renderer
                        .draw_polychrome_sprites(texture_id, range, bindings, viewport, &encoder);
                }
            }
            PrimitiveBatch::Paths(range) => {
                encoder.endEncoding();
                let paths = &scene.paths[range];
                let drawn =
                    renderer.draw_paths_to_intermediate(paths, writer, viewport, commands)?;
                encoder = new_command_encoder_for_texture(commands, texture, viewport, None)?;
                bind(&encoder, clips, &renderer.device);
                if drawn {
                    renderer.draw_paths_from_intermediate(paths, writer, viewport, &encoder)?;
                }
            }
            PrimitiveBatch::Surfaces(range) => renderer.draw_surfaces(
                &scene.surfaces[range.clone()],
                range.start,
                bindings,
                viewport,
                &encoder,
                surface_textures,
            )?,
            PrimitiveBatch::SubpixelSprites { .. } => unreachable!("Metal uses grayscale glyphs"),
        }
    }
    Ok(encoder)
}
