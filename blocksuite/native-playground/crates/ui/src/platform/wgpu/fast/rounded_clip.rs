//! The private rounded-clip layer protocol is shared with the Metal renderer:
//! reserved sprite ids identify drawable groups, each carrying padding-edge geometry.
//! Every colour pipeline evaluates its stack of padding edges. A disabled
//! binding keeps ordinary frames on the same pipelines without mask passes.

use crate::{AtlasTextureId, LayerFrame, Scene};
/// Three RGBA32Float texels per padding edge: bounds, horizontal radii and
/// vertical radii. Texture transport also works on WebGL without storage buffers.
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub(crate) struct Clip {
    bounds: [f32; 4],
    horizontal: [f32; 4],
    vertical: [f32; 4],
}

impl Clip {
    pub(crate) fn new(sprite: &crate::PolychromeSprite, child: &Scene) -> Self {
        let b = sprite.bounds;
        let r = sprite.corner_radii;
        let v = child
            .layers
            .frames
            .iter()
            .find(|frame| frame.key.0 == u32::MAX)
            .expect("rounded clip geometry")
            .background;
        Self {
            bounds: [b.origin.x.0, b.origin.y.0, b.right().0, b.bottom().0],
            horizontal: [
                r.top_left.0,
                r.top_right.0,
                r.bottom_right.0,
                r.bottom_left.0,
            ],
            vertical: [v.r, v.g, v.b, v.a],
        }
    }
}

#[cfg(all(not(target_family = "wasm"), any(test, feature = "harness")))]
pub(crate) fn headless_instance() -> wgpu::Instance {
    if cfg!(target_os = "macos") {
        wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::METAL,
            flags: wgpu::InstanceFlags::default(),
            backend_options: wgpu::BackendOptions::default(),
            memory_budget_thresholds: wgpu::MemoryBudgetThresholds::default(),
            display: None,
        })
    } else {
        crate::platform::wgpu::WgpuContext::instance(None)
    }
}

pub(crate) struct Bindings {
    pub(crate) layout: wgpu::BindGroupLayout,
    pub(crate) unmasked: wgpu::BindGroup,
}

impl Bindings {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("rounded_clip_layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: true,
                        min_binding_size: wgpu::BufferSize::new(16),
                    },
                    count: None,
                },
            ],
        });
        let dummy = texture(device, wgpu::TextureFormat::Rgba8Unorm, 1, 1);
        let unmasked = bind(
            device,
            &layout,
            &dummy.create_view(&Default::default()),
            &[0; 4],
        );
        Self { layout, unmasked }
    }

    pub(crate) fn clip_sets(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        sets: &[Vec<Clip>],
    ) -> (wgpu::BindGroup, u32) {
        let alignment = device.limits().min_uniform_buffer_offset_alignment.max(16);
        let mut all = Vec::new();
        let mut flags = vec![0u32; (alignment / 4) as usize];
        for clips in sets {
            let start = all.len() as u32;
            all.extend_from_slice(clips);
            let mut row = vec![0u32; (alignment / 4) as usize];
            row[0] = clips.len() as u32;
            row[1] = start;
            flags.extend(row);
        }
        let texels = all.len() as u32 * 3;
        let width = texels.min(device.limits().max_texture_dimension_2d).max(1);
        let height = texels.div_ceil(width).max(1);
        let data_texture = texture(device, wgpu::TextureFormat::Rgba32Float, width, height);
        let mut data = bytemuck::cast_slice::<Clip, u8>(&all).to_vec();
        data.resize((width * height * 16) as usize, 0);
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &data_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &data,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * 16),
                rows_per_image: None,
            },
            data_texture.size(),
        );
        (
            bind(
                device,
                &self.layout,
                &data_texture.create_view(&Default::default()),
                &flags,
            ),
            alignment,
        )
    }
}

fn bind(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    view: &wgpu::TextureView,
    values: &[u32],
) -> wgpu::BindGroup {
    let flags = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("rounded_clip_flags"),
        size: std::mem::size_of_val(values) as u64,
        usage: wgpu::BufferUsages::UNIFORM,
        mapped_at_creation: true,
    });
    flags
        .slice(..)
        .get_mapped_range_mut()
        .expect("mapped at creation")
        .copy_from_slice(bytemuck::cast_slice(values));
    flags.unmap();
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("rounded_clip_bind_group"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                    buffer: &flags,
                    offset: 0,
                    size: wgpu::BufferSize::new(16),
                }),
            },
        ],
    })
}

pub(crate) fn texture(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    width: u32,
    height: u32,
) -> wgpu::Texture {
    device.create_texture(&wgpu::TextureDescriptor {
        label: Some("rounded_clip_mask"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    })
}

pub(crate) fn pipeline_layouts<'a>(
    layouts: &mut Vec<Option<&'a wgpu::BindGroupLayout>>,
    all: &'a crate::platform::wgpu::wgpu_renderer::WgpuBindGroupLayouts,
) {
    layouts.resize(3, None);
    layouts.push(Some(&all.fast_rounded_clip.layout));
}

pub(crate) fn bind_unmasked(
    pass: &mut wgpu::RenderPass<'_>,
    resources: &crate::platform::wgpu::wgpu_renderer::WgpuResources,
) {
    pass.set_bind_group(
        3,
        &resources.bind_group_layouts.fast_rounded_clip.unmasked,
        &[0],
    );
}

pub(crate) fn shader_source(source: &str) -> wgpu::ShaderSource<'static> {
    wgpu::ShaderSource::Wgsl(shader(source).into())
}

pub(crate) fn group(scene: &Scene, texture: AtlasTextureId) -> Option<&LayerFrame> {
    if texture.index < 0xF100_0000 {
        return None;
    }
    let key = texture.index - 0xF000_0000;
    scene
        .layers
        .frames
        .iter()
        .find(|frame| frame.key.0 == key && frame.tile_size == 0)
}

/// Extend the unchanged upstream WGSL entry points. Path rasterization is
/// unmasked; paths are masked once, when their premultiplied sprite is drawn.
pub(crate) fn shader(source: &str) -> String {
    let mut source = source.to_owned();
    for name in [
        "fs_quad",
        "fs_shadow",
        "fs_path",
        "fs_underline",
        "fs_mono_sprite",
        "fs_poly_sprite",
        "fs_surface",
        "fs_subpixel_sprite",
    ] {
        let Some(start) = source.find(&format!("fn {name}(")) else {
            continue;
        };
        let body_start = start + source[start..].find('{').expect("fragment body");
        let mut depth = 1;
        let mut body_end = body_start + 1;
        for (offset, ch) in source[body_start + 1..].char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => depth -= 1,
                _ => {}
            }
            if depth == 0 {
                body_end = body_start + 1 + offset;
                break;
            }
        }
        let helper = if name == "fs_subpixel_sprite" {
            "fast_clip_subpixel"
        } else {
            "fast_clip_color"
        };
        let premultiplied = if name == "fs_path" {
            "true"
        } else {
            "globals.premultiplied_alpha != 0u"
        };
        let mut remaining = &source[body_start + 1..body_end];
        let mut body = String::new();
        while let Some(start) = remaining.find("return ") {
            let end = start + remaining[start..].find(';').expect("fragment return");
            body.push_str(&remaining[..start]);
            let expression = &remaining[start + 7..end];
            if name == "fs_subpixel_sprite" {
                body.push_str(&format!(
                    "return {helper}({expression}, input.position.xy);"
                ));
            } else {
                body.push_str(&format!(
                    "return {helper}({expression}, input.position.xy, {premultiplied});"
                ));
            }
            remaining = &remaining[end + 1..];
        }
        body.push_str(remaining);
        source.replace_range(body_start + 1..body_end, &body);
    }
    source.push_str(
    r#"
@group(3) @binding(0) var fast_clip_texture: texture_2d<f32>;
@group(3) @binding(1) var<uniform> fast_clip_flags: vec4<u32>;

fn fast_clip_texel(index: u32) -> vec4<f32> {
    let width = textureDimensions(fast_clip_texture).x;
    return textureLoad(fast_clip_texture, vec2<i32>(i32(index % width), i32(index / width)), 0);
}
fn fast_clip_shape(position: vec2<f32>, index: u32) -> f32 {
    let bounds = fast_clip_texel(index * 3u);
    let horizontal = fast_clip_texel(index * 3u + 1u);
    let vertical = fast_clip_texel(index * 3u + 2u);
    let extent = bounds.zw - bounds.xy;
    if (extent.x <= 0.0 || extent.y <= 0.0) { return 0.0; }
    let local = position - bounds.xy;
    var distance = max(max(-local.x, -local.y), max(local.x - extent.x, local.y - extent.y));
    for (var corner = 0u; corner < 4u; corner++) {
        let radius = vec2<f32>(horizontal[corner], vertical[corner]);
        if (radius.x <= 0.0 || radius.y <= 0.0) { continue; }
        let right = corner == 1u || corner == 2u;
        let bottom = corner >= 2u;
        let inward = vec2<f32>(select(local.x, extent.x - local.x, right), select(local.y, extent.y - local.y, bottom));
        if (inward.x < radius.x && inward.y < radius.y) {
            let q = (inward - radius) / radius;
            let length_q = length(q);
            let gradient = length(q / radius) / max(length_q, 0.000001);
            distance = max(distance, (length_q - 1.0) / max(gradient, 0.000001));
        }
    }
    return clamp(0.5 - distance, 0.0, 1.0);
}
fn fast_clip_coverage(position: vec2<f32>) -> f32 {
    var coverage = 1.0;
    for (var index = 0u; index < fast_clip_flags.x; index++) {
        coverage = min(coverage, fast_clip_shape(position, index + fast_clip_flags.y));
    }
    return coverage;
}

fn fast_clip_color(color: vec4<f32>, position: vec2<f32>, premultiplied: bool) -> vec4<f32> {
    let coverage = fast_clip_coverage(position);
    return vec4<f32>(color.rgb * select(1.0, coverage, premultiplied), color.a * coverage);
}
"#,
  );
    if source.contains("fn fs_subpixel_sprite(") {
        source.push_str(
      r#"
fn fast_clip_subpixel(color: SubpixelSpriteFragmentOutput, position: vec2<f32>) -> SubpixelSpriteFragmentOutput {
    var out = color;
    out.alpha *= fast_clip_coverage(position);
    return out;
}
"#,
    );
    }
    source
}
