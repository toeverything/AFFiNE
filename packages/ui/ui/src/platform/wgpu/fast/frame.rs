//! A frame recorded with one instance upload, reused bind groups and the
//! paths of batches that don't overlap rasterized in one pass.
//!
//! Upstream records a frame like this:
//!
//! - six `Queue::write_buffer` calls, one per primitive kind, each with a bind
//!   group created for it;
//! - per sprite batch, a new texture bind group for its atlas texture;
//! - per batch, `set_pipeline` and every bind group again;
//! - per path batch, the main render pass ends, a pass rasterizes the batch's
//!   paths into the intermediate texture, a new main pass begins, and the
//!   batch's vertices and sprites get a `write_buffer` and a bind group each.
//!
//! On native backends every `write_buffer` allocates a staging buffer, and
//! wgpu-core encodes every render pass into a command buffer of its own, which
//! the driver has to begin, submit and later reset: those, not the draws, are
//! most of the renderer's CPU time. A frame with six path batches (six
//! sparklines) had thirteen render passes.
//!
//! With storage buffers all of the frame's instance data, path vertices and
//! path sprites included, goes through one staging buffer; bind groups are kept by
//! [`BindGroupCache`]; pass state is set only when it changes; and path
//! batches are rasterized in groups: consecutive batches that don't come near
//! each other share one rasterization pass, the first group's before the main
//! pass begins. Each batch's pixels in the intermediate texture are then the
//! same as if it had been rasterized alone into the cleared texture, so the
//! image is the same. A frame whose path batches don't overlap is drawn in two
//! passes; one whose batches all overlap still saves a pass, and every
//! `write_buffer` and bind group of its paths.
//!
//! The recording borrows the GPU objects it draws with through
//! [`FrameHost`], so the pixel tests' surfaceless harness records frames
//! through this same code as the on-screen renderer.

use std::ops::Range;

use crate::{AtlasTextureId, Bounds, PrimitiveBatch, ScaledPixels, Scene};
use anyhow::{Context as _, Result};

use crate::platform::wgpu::WgpuAtlas;
use crate::platform::wgpu::fast::bind_groups::BindGroupCache;
use crate::platform::wgpu::fast::globals::UploadedGlobals;
use crate::platform::wgpu::fast::pass_state::PassState;
use crate::platform::wgpu::wgpu_renderer::{
    InstanceData, PathRasterizationVertex, PathSprite, WgpuBindGroupLayouts, WgpuPipelines,
    WgpuRendererCore,
};

/// How far apart, in device pixels, path batches must be to share the
/// intermediate texture. Rasterization is clipped to each path's bounds, and
/// the intermediate texture is sampled with linear filtering at texel
/// centers, so a pixel is plenty; two leave room for rounding.
const PATH_BATCH_MARGIN: f32 = 2.;

/// Past this many path batches in a group, checking that a batch overlaps
/// none of them costs more than the render passes it would save.
const MAX_GROUP_PATH_BATCHES: usize = 64;

/// The renderer's state that outlives a frame.
#[derive(Default)]
pub(crate) struct FrameState {
    pub(crate) bind_groups: BindGroupCache,
    pub(crate) globals: UploadedGlobals,
    vertices: Vec<PathRasterizationVertex>,
    sprites: Vec<PathSprite>,
    path_batches: Vec<PathBatch>,
}

/// The GPU objects a frame is recorded with, borrowed from whoever owns them:
/// the on-screen renderer, or the pixel tests' surfaceless harness.
pub(crate) struct FrameTarget<'a> {
    pub(crate) device: &'a wgpu::Device,
    pub(crate) queue: &'a wgpu::Queue,
    pub(crate) pipelines: &'a WgpuPipelines,
    pub(crate) bind_group_layouts: &'a WgpuBindGroupLayouts,
    pub(crate) atlas: &'a WgpuAtlas,
    pub(crate) atlas_sampler: &'a wgpu::Sampler,
    pub(crate) globals_bind_group: &'a wgpu::BindGroup,
    pub(crate) path_globals_bind_group: &'a wgpu::BindGroup,
    pub(crate) path_intermediate_view: Option<&'a wgpu::TextureView>,
    pub(crate) path_msaa_view: Option<&'a wgpu::TextureView>,
    pub(crate) instance_data: InstanceSource<'a>,
    /// The buffer behind the globals bind groups, and where in it the gamma
    /// parameters are, for tile globals to share them.
    pub(crate) globals_buffer: &'a wgpu::Buffer,
    pub(crate) gamma_offset: u64,
    pub(crate) gamma_size: u64,
    /// The format of the frame's texture, which tiles share.
    pub(crate) format: wgpu::TextureFormat,
    pub(crate) path_sample_count: u32,
    pub(crate) premultiplied_alpha: bool,
}

#[derive(Clone, Copy)]
pub(crate) enum InstanceSource<'a> {
    Storage(&'a wgpu::Buffer),
    Texture(&'a wgpu::TextureView),
}

/// The owner of the GPU objects a frame is recorded with.
pub(crate) trait FrameHost {
    fn frame_state(&mut self) -> &mut FrameState;
    /// The alignment of each array in the instance buffer.
    fn instance_data_alignment(&self) -> u64;
    /// Makes the instance buffer hold at least `size` bytes.
    fn reserve_instance_data(&mut self, size: u64) -> Result<()>;
    fn target(&self) -> Result<FrameTarget<'_>>;
    fn write_instance_texture(&self, _offset: u64, _data: &[u8]) {
        unreachable!("the storage-buffer host does not write an instance texture")
    }
}

impl FrameHost for WgpuRendererCore {
    fn write_instance_texture(&self, offset: u64, data: &[u8]) {
        WgpuRendererCore::write_instance_texture(self.resources(), offset, data);
    }

    fn frame_state(&mut self) -> &mut FrameState {
        &mut self.fast_frame
    }

    fn instance_data_alignment(&self) -> u64 {
        self.instance_data_alignment.max(1)
    }

    fn reserve_instance_data(&mut self, size: u64) -> Result<()> {
        if size > self.instance_data_capacity {
            self.grow_instance_data(size)?;
        }
        Ok(())
    }

    fn target(&self) -> Result<FrameTarget<'_>> {
        let resources = self.resources();
        let instance_data = match &resources.instance_data {
            InstanceData::Storage(buffer) => InstanceSource::Storage(buffer),
            InstanceData::Texture { view, .. } => InstanceSource::Texture(view),
        };
        Ok(FrameTarget {
            device: &resources.device,
            queue: &resources.queue,
            pipelines: &resources.pipelines,
            bind_group_layouts: &resources.bind_group_layouts,
            atlas: &self.atlas,
            atlas_sampler: &resources.atlas_sampler,
            globals_bind_group: &resources.globals_bind_group,
            path_globals_bind_group: &resources.path_globals_bind_group,
            path_intermediate_view: resources.path_intermediate_view.as_ref(),
            path_msaa_view: resources.path_msaa_view.as_ref(),
            instance_data,
            globals_buffer: &resources.globals_buffer,
            gamma_offset: self.gamma_offset,
            gamma_size: size_of::<crate::platform::wgpu::wgpu_renderer::GammaParams>() as u64,
            format: self.target_format,
            path_sample_count: self.rendering_params.path_sample_count,
            premultiplied_alpha: self.fast_frame.globals.premultiplied_alpha(),
        })
    }
}

/// A non-empty `PrimitiveBatch::Paths`: its vertices and sprites in the
/// frame's path uploads, and the bounds everything it draws stays within.
pub(crate) struct PathBatch {
    vertices: Range<u32>,
    sprites: Range<u32>,
    bounds: Bounds<ScaledPixels>,
    /// For the first batch of a group, the vertices of the whole group,
    /// rasterized together before the batch is drawn.
    group: Option<Range<u32>>,
}

/// Where one scene's primitives landed in the instance buffer.
pub(crate) struct SceneUpload {
    quads: InstanceBinding,
    shadows: InstanceBinding,
    underlines: InstanceBinding,
    monochrome_sprites: InstanceBinding,
    subpixel_sprites: InstanceBinding,
    polychrome_sprites: InstanceBinding,
}

struct InstanceBinding {
    group: wgpu::BindGroup,
    first: u32,
}

/// Where the frame's path vertices and sprites, those of every scene it
/// draws, landed in the instance buffer.
pub(crate) struct PathUpload {
    vertices: InstanceBinding,
    sprites: InstanceBinding,
}

/// A scene the frame draws, with its paths planned.
struct PlannedScene<'a> {
    scene: &'a Scene,
    path_batches: Vec<PathBatch>,
    groups: Vec<GroupPlan>,
}

struct GroupPlan {
    texture: u32,
    content: usize,
}

pub(crate) struct DrawGraph<'a> {
    scenes: &'a [PlannedScene<'a>],
    uploads: &'a [SceneUpload],
}

fn plan_scene<'a>(
    scene: &'a Scene,
    scenes: &mut Vec<PlannedScene<'a>>,
    vertices: &mut Vec<PathRasterizationVertex>,
    sprites: &mut Vec<PathSprite>,
    mut path_batches: Vec<PathBatch>,
) -> usize {
    let mut groups = Vec::new();
    for sprite in &scene.polychrome_sprites {
        let Some(frame) =
            crate::platform::wgpu::fast::rounded_clip::group(scene, sprite.tile.texture_id)
        else {
            continue;
        };
        let child = frame.content.scene().expect("rounded clip content");
        let content = plan_scene(child, scenes, vertices, sprites, Vec::new());
        groups.push(GroupPlan {
            texture: sprite.tile.texture_id.index,
            content,
        });
    }
    plan_paths(scene, vertices, sprites, &mut path_batches);
    let index = scenes.len();
    scenes.push(PlannedScene {
        scene,
        path_batches,
        groups,
    });
    index
}

/// Forwarded to by `WgpuRendererCore::record_frame`, which draws both the
/// windows' frames and the headless renderer's. Records and submits the
/// frame. The storage-buffer and WebGL instance-texture transports share the
/// scene graph and path planning, including rounded clip scopes.
pub(crate) fn record_frame(
    renderer: &mut WgpuRendererCore,
    scene: &Scene,
    frame_view: &wgpu::TextureView,
    clear_color: wgpu::Color,
) -> Result<Option<wgpu::SubmissionIndex>> {
    record_into(renderer, scene, frame_view, clear_color).map(Some)
}

/// Records `scene` into `frame_view`, cleared to `clear` first, and submits it.
pub(crate) fn record_into(
    host: &mut impl FrameHost,
    scene: &Scene,
    frame_view: &wgpu::TextureView,
    clear: wgpu::Color,
) -> Result<wgpu::SubmissionIndex> {
    // The state is taken for the frame so that it can change while the host
    // lends out the GPU objects. The uploaded globals stay with the host,
    // which tells the frame's alpha mode by them.
    let mut state = std::mem::take(host.frame_state());
    std::mem::swap(&mut state.globals, &mut host.frame_state().globals);
    let result = record_with(host, &mut state, scene, frame_view, clear);
    std::mem::swap(&mut state.globals, &mut host.frame_state().globals);
    *host.frame_state() = state;
    result
}

fn record_with(
    host: &mut impl FrameHost,
    state: &mut FrameState,
    scene: &Scene,
    frame_view: &wgpu::TextureView,
    clear: wgpu::Color,
) -> Result<wgpu::SubmissionIndex> {
    state.bind_groups.begin_frame();

    let mut vertices = std::mem::take(&mut state.vertices);
    let mut sprites = std::mem::take(&mut state.sprites);
    let mut scenes = Vec::with_capacity(1);
    let path_batches = std::mem::take(&mut state.path_batches);
    plan_scene(
        scene,
        &mut scenes,
        &mut vertices,
        &mut sprites,
        path_batches,
    );

    let result = upload(host, &state.bind_groups, &scenes, &vertices, &sprites)
        .with_context(|| {
            format!(
                "scene too large: {} paths, {} shadows, {} quads, {} underlines, {} monochrome sprites, {} subpixel sprites, {} polychrome sprites, {} layer tiles to rasterize",
                scene.paths.len(),
                scene.shadows.len(),
                scene.quads.len(),
                scene.underlines.len(),
                scene.monochrome_sprites.len(),
                scene.subpixel_sprites.len(),
                scene.polychrome_sprites.len(),
                0usize,
            )
        })
        .and_then(|(uploads, paths)| {
            let target = host.target()?;
                        Ok(record(
                &target, state, scene, frame_view, clear, &scenes, &uploads, &paths,
            ))
        });

    let mut path_batches = scenes
        .pop()
        .map(|main| main.path_batches)
        .unwrap_or_default();
    vertices.clear();
    sprites.clear();
    path_batches.clear();
    state.vertices = vertices;
    state.sprites = sprites;
    state.path_batches = path_batches;
    result
}

/// Collects every path batch's rasterization vertices and sprites, as
/// upstream's `draw_paths_to_intermediate` and `draw_paths_from_intermediate`
/// build them, and groups the batches.
fn plan_paths(
    scene: &Scene,
    vertices: &mut Vec<PathRasterizationVertex>,
    sprites: &mut Vec<PathSprite>,
    path_batches: &mut Vec<PathBatch>,
) {
    if scene.paths.is_empty() {
        return;
    }
    let mut group_start = path_batches.len();
    for batch in scene.batches() {
        let PrimitiveBatch::Paths(range) = batch else {
            continue;
        };
        let paths = &scene.paths[range];
        let Some(first_path) = paths.first() else {
            continue;
        };

        let first_vertex = vertices.len() as u32;
        let mut union = first_path.clipped_bounds();
        for path in paths {
            let bounds = path.clipped_bounds();
            let local_content_mask = path.local_content_mask;
            union = union.union(&bounds);
            vertices.extend(path.vertices.iter().map(|v| PathRasterizationVertex {
                xy_position: v.xy_position,
                st_position: v.st_position,
                color: path.color,
                bounds,
                local_position: v.local_position,
                local_content_mask,
            }));
        }

        let first_sprite = sprites.len() as u32;
        if paths.last().map(|p| &p.order) == Some(&first_path.order) {
            sprites.extend(paths.iter().map(|p| PathSprite {
                bounds: p.clipped_bounds(),
            }));
        } else {
            sprites.push(PathSprite { bounds: union });
        }

        let near = union.dilate(ScaledPixels(PATH_BATCH_MARGIN));
        let group = &path_batches[group_start..];
        if group.is_empty()
            || group.len() >= MAX_GROUP_PATH_BATCHES
            || group.iter().any(|batch| near.intersects(&batch.bounds))
        {
            close_group(&mut path_batches[group_start..]);
            group_start = path_batches.len();
        }
        path_batches.push(PathBatch {
            vertices: first_vertex..vertices.len() as u32,
            sprites: first_sprite..sprites.len() as u32,
            bounds: union,
            group: None,
        });
    }
    close_group(&mut path_batches[group_start..]);
}

/// Gives the first batch of `group` the vertices of all of it.
fn close_group(group: &mut [PathBatch]) {
    if let Some(end) = group.last().map(|last| last.vertices.end)
        && let Some(first) = group.first_mut()
    {
        first.group = Some(first.vertices.start..end);
    }
}

/// Writes every scene's instance data. Storage arrays share one staging
/// buffer; WebGL arrays start on both a texel boundary and a whole record,
/// so its shaders can index them absolutely through the instance texture.
fn upload(
    host: &mut impl FrameHost,
    bind_groups: &BindGroupCache,
    scenes: &[PlannedScene],
    vertices: &[PathRasterizationVertex],
    sprites: &[PathSprite],
) -> Result<(Vec<SceneUpload>, PathUpload)> {
    const SCENE_ARRAYS: usize = 6;
    let mut arrays: Vec<&[u8]> = Vec::with_capacity(scenes.len() * SCENE_ARRAYS + 2);
    // SAFETY: the primitives and path records are `#[repr(C)]` plain data, as
    // upstream's `write_instance_binding` relies on too.
    unsafe {
        for planned in scenes {
            let scene = planned.scene;
            arrays.extend([
                bytes_of(&scene.quads),
                bytes_of(&scene.shadows),
                bytes_of(&scene.underlines),
                bytes_of(&scene.monochrome_sprites),
                bytes_of(&scene.subpixel_sprites),
                bytes_of(&scene.polychrome_sprites),
            ]);
        }
        arrays.extend([bytes_of(vertices), bytes_of(sprites)]);
    }

    let alignment = host.instance_data_alignment();
    let texture_transport = matches!(host.target()?.instance_data, InstanceSource::Texture(_));
    let mut strides = [
        size_of::<crate::Quad>(),
        size_of::<crate::Shadow>(),
        size_of::<crate::Underline>(),
        size_of::<crate::MonochromeSprite>(),
        size_of::<crate::SubpixelSprite>(),
        size_of::<crate::PolychromeSprite>(),
    ]
    .repeat(scenes.len());
    strides.extend([
        size_of::<PathRasterizationVertex>(),
        size_of::<PathSprite>(),
    ]);
    let mut offsets = Vec::with_capacity(arrays.len());
    let mut end = 0u64;
    for (data, &stride) in arrays.iter().zip(&strides) {
        let alignment = if texture_transport {
            common_multiple(alignment, stride as u64)
        } else {
            alignment
        };
        let offset = end.next_multiple_of(alignment);
        offsets.push(offset);
        // wgpu rejects zero-sized bindings, so empty arrays still reserve the
        // 16-byte minimum.
        end = offset + binding_size(data);
        if texture_transport {
            end = end.next_multiple_of(16);
        }
    }
    let end = end.next_multiple_of(wgpu::COPY_BUFFER_ALIGNMENT);
    host.reserve_instance_data(end)?;

    let target = host.target()?;
    if let InstanceSource::Storage(buffer) = target.instance_data
        && arrays.iter().any(|data| !data.is_empty())
    {
        let size = wgpu::BufferSize::new(end).context("empty instance upload")?;
        let mut view = target
            .queue
            .write_buffer_with(buffer, 0, size)
            .context("instance upload rejected")?;
        for (&offset, data) in offsets.iter().zip(&arrays) {
            if !data.is_empty() {
                let offset = offset as usize;
                view.slice(offset..offset + data.len())
                    .copy_from_slice(data);
            }
        }
    }

    let texture_binding = if let InstanceSource::Texture(view) = target.instance_data {
        for (&offset, data) in offsets.iter().zip(&arrays) {
            if !data.is_empty() {
                host.write_instance_texture(offset, data);
            }
        }
        Some(target.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("frame_instance_texture"),
            layout: &target.bind_group_layouts.instances,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(view),
            }],
        }))
    } else {
        None
    };

    let bind = |index: usize, label: &str| {
        if let Some(group) = &texture_binding {
            return InstanceBinding {
                group: group.clone(),
                first: (offsets[index] / strides[index] as u64) as u32,
            };
        }
        let InstanceSource::Storage(buffer) = target.instance_data else {
            unreachable!()
        };
        InstanceBinding {
            group: bind_groups.storage(
                target.device,
                &target.bind_group_layouts.instances,
                label,
                buffer,
                offsets[index],
                binding_size(arrays[index]),
            ),
            first: 0,
        }
    };
    let uploads = (0..scenes.len())
        .map(|scene| {
            let first = scene * SCENE_ARRAYS;
            SceneUpload {
                quads: bind(first, "quads_bind_group"),
                shadows: bind(first + 1, "shadows_bind_group"),
                underlines: bind(first + 2, "underlines_bind_group"),
                monochrome_sprites: bind(first + 3, "monochrome_sprites_bind_group"),
                subpixel_sprites: bind(first + 4, "subpixel_sprites_bind_group"),
                polychrome_sprites: bind(first + 5, "polychrome_sprites_bind_group"),
            }
        })
        .collect();
    let paths = scenes.len() * SCENE_ARRAYS;
    let paths = PathUpload {
        vertices: bind(paths, "path_rasterization_bind_group"),
        sprites: bind(paths + 1, "path_sprites_bind_group"),
    };
    Ok((uploads, paths))
}

fn binding_size(data: &[u8]) -> u64 {
    (data.len() as u64).max(16)
}

fn common_multiple(left: u64, right: u64) -> u64 {
    let (mut a, mut b) = (left, right);
    while b != 0 {
        (a, b) = (b, a % b);
    }
    left / a * right
}

unsafe fn bytes_of<T>(instances: &[T]) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(
            instances.as_ptr() as *const u8,
            std::mem::size_of_val(instances),
        )
    }
}

#[allow(clippy::too_many_arguments)]
fn record(
    target: &FrameTarget,
    state: &FrameState,
    scene: &Scene,
    frame_view: &wgpu::TextureView,
    clear: wgpu::Color,
    scenes: &[PlannedScene],
    uploads: &[SceneUpload],
    paths: &PathUpload,
) -> wgpu::SubmissionIndex {
    let graph = DrawGraph { scenes, uploads };
    let mut encoder = target
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("main_encoder"),
        });
    let main = scenes.len() - 1;
    draw_scene(
        target,
        state,
        &mut encoder,
        &SceneDraw {
            scene,
            upload: &uploads[main],
            paths,
            path_batches: &scenes[main].path_batches,
            view: frame_view,
            clear: Some(clear),
            label: "main_pass",
            globals: target.globals_bind_group,
            path_targets: PathTargets {
                globals: target.path_globals_bind_group,
                intermediate: target.path_intermediate_view,
                msaa: target.path_msaa_view,
            },
            graph: &graph,
        },
    );
    target.queue.submit(std::iter::once(encoder.finish()))
}

/// A scene to draw, where, and with what.
pub(crate) struct SceneDraw<'a> {
    pub(crate) scene: &'a Scene,
    pub(crate) upload: &'a SceneUpload,
    pub(crate) paths: &'a PathUpload,
    pub(crate) path_batches: &'a [PathBatch],
    pub(crate) view: &'a wgpu::TextureView,
    pub(crate) clear: Option<wgpu::Color>,
    pub(crate) label: &'a str,
    /// The globals the scene's primitives are drawn with.
    pub(crate) globals: &'a wgpu::BindGroup,
    pub(crate) path_targets: PathTargets<'a>,
    pub(crate) graph: &'a DrawGraph<'a>,
}

/// What a scene's paths are rasterized with: the globals and the
/// intermediate texture, both sized like the texture the scene is drawn into.
#[derive(Clone, Copy)]
pub(crate) struct PathTargets<'a> {
    pub(crate) globals: &'a wgpu::BindGroup,
    pub(crate) intermediate: Option<&'a wgpu::TextureView>,
    pub(crate) msaa: Option<&'a wgpu::TextureView>,
}

struct DrawStep<'a> {
    scene: &'a Scene,
    upload: &'a SceneUpload,
    batch: PrimitiveBatch,
    clip: Option<usize>,
    path: Option<&'a PathBatch>,
    path_group: Option<Range<u32>>,
}

impl DrawStep<'_> {
    fn path_key(&self) -> (usize, Option<Range<u32>>) {
        (self.scene as *const Scene as usize, self.path_group.clone())
    }
}

#[allow(clippy::too_many_arguments)]
fn collect_steps<'a>(
    scene: &'a Scene,
    upload: &'a SceneUpload,
    paths: &'a [PathBatch],
    graph: &'a DrawGraph<'a>,
    clips: &mut Vec<crate::platform::wgpu::fast::rounded_clip::Clip>,
    binding: Option<usize>,
    steps: &mut Vec<DrawStep<'a>>,
    clip_sets: &mut Vec<Vec<crate::platform::wgpu::fast::rounded_clip::Clip>>,
) {
    let mut path_index = 0;
    let mut path_group = None;
    for batch in scene.batches() {
        if let PrimitiveBatch::PolychromeSprites {
            texture_id,
            ref range,
        } = batch
            && crate::platform::wgpu::fast::rounded_clip::group(scene, texture_id).is_some()
        {
            let plan = graph
                .scenes
                .iter()
                .find(|plan| std::ptr::eq(plan.scene, scene))
                .expect("planned clip scene");
            let group = plan
                .groups
                .iter()
                .find(|group| group.texture == texture_id.index)
                .expect("planned clip group");
            let child = &graph.scenes[group.content];
            for index in range.clone() {
                clips.push(crate::platform::wgpu::fast::rounded_clip::Clip::new(
                    &scene.polychrome_sprites[index],
                    child.scene,
                ));
                let child_binding = clip_sets.len();
                clip_sets.push(clips.clone());
                collect_steps(
                    child.scene,
                    &graph.uploads[group.content],
                    &child.path_batches,
                    graph,
                    clips,
                    Some(child_binding),
                    steps,
                    clip_sets,
                );
                clips.pop();
            }
            continue;
        }
        let path = if matches!(&batch, PrimitiveBatch::Paths(range) if !range.is_empty()) {
            let path = paths.get(path_index);
            path_index += 1;
            if let Some(group) = path.and_then(|path| path.group.clone()) {
                path_group = Some(group);
            }
            path
        } else {
            None
        };
        steps.push(DrawStep {
            scene,
            upload,
            batch,
            clip: binding,
            path,
            path_group: path_group.clone(),
        });
    }
}

/// Records the passes that draw `draw.scene` into `draw.view`.
pub(crate) fn draw_scene(
    target: &FrameTarget,
    state: &FrameState,
    encoder: &mut wgpu::CommandEncoder,
    draw: &SceneDraw,
) {
    let pipelines = target.pipelines;
    let texture_bind_group = |label: &str, view: &wgpu::TextureView| {
        state.bind_groups.texture(
            target.device,
            &target.bind_group_layouts.texture,
            target.atlas_sampler,
            label,
            view,
        )
    };
    let intermediate = draw
        .path_targets
        .intermediate
        .map(|view| texture_bind_group("path_intermediate_texture_bind_group", view));

    let mut steps = Vec::new();
    let mut clip_sets = Vec::new();
    collect_steps(
        draw.scene,
        draw.upload,
        draw.path_batches,
        draw.graph,
        &mut Vec::new(),
        None,
        &mut steps,
        &mut clip_sets,
    );
    let clip_data = (!clip_sets.is_empty()).then(|| {
        target.bind_group_layouts.fast_rounded_clip.clip_sets(
            target.device,
            target.queue,
            &clip_sets,
        )
    });
    let clip_binding = clip_data
        .as_ref()
        .map(|data| &data.0)
        .unwrap_or(&target.bind_group_layouts.fast_rounded_clip.unmasked);
    let clip_alignment = clip_data.as_ref().map_or(0, |data| data.1);
    let first_path = steps.iter().find(|step| step.path.is_some());
    let mut rasterized_group = first_path.and_then(|step| {
        rasterize_group(
            target,
            encoder,
            draw.path_targets,
            draw.paths,
            step.path_group.clone(),
        )
        .then_some(step.path_key())
    });
    let mut pass = begin_main_pass(encoder, draw.view, draw.label, draw.clear);
    let mut bound = PassState::default();
    for step in steps {
        let path_key = step.path_key();
        let upload = step.upload;
        let scene = step.scene;
        let clip_offset = step
            .clip
            .map_or(0, |index| (index as u32 + 1) * clip_alignment);
        pass.set_bind_group(3, clip_binding, &[clip_offset]);
        let batch = step.batch;
        match batch {
            PrimitiveBatch::Quads(range) => draw_batch(
                &mut pass,
                &mut bound,
                draw.globals,
                &pipelines.quads,
                &upload.quads,
                None,
                range,
            ),
            PrimitiveBatch::Shadows(range) => draw_batch(
                &mut pass,
                &mut bound,
                draw.globals,
                &pipelines.shadows,
                &upload.shadows,
                None,
                range,
            ),
            PrimitiveBatch::Paths(range) => {
                if range.is_empty() {
                    continue;
                }
                let Some(batch) = step.path else {
                    continue;
                };
                if rasterized_group != Some(path_key.clone()) {
                    drop(pass);
                    rasterized_group = rasterize_group(
                        target,
                        encoder,
                        draw.path_targets,
                        draw.paths,
                        step.path_group.clone(),
                    )
                    .then_some(path_key);
                    pass = begin_main_pass(encoder, draw.view, "main_pass_continued", None);
                    bound.forget();
                    pass.set_bind_group(3, clip_binding, &[clip_offset]);
                }
                if rasterized_group.is_none() || batch.vertices.is_empty() {
                    continue;
                }
                let Some(intermediate) = &intermediate else {
                    continue;
                };
                bound.set_pipeline(&mut pass, &pipelines.paths);
                bound.set_bind_group(&mut pass, 0, draw.globals);
                bound.set_bind_group(&mut pass, 1, &draw.paths.sprites.group);
                bound.set_bind_group(&mut pass, 2, intermediate);
                pass.draw(
                    0..4,
                    (draw.paths.sprites.first + batch.sprites.start)
                        ..(draw.paths.sprites.first + batch.sprites.end),
                );
            }
            PrimitiveBatch::Underlines(range) => draw_batch(
                &mut pass,
                &mut bound,
                draw.globals,
                &pipelines.underlines,
                &upload.underlines,
                None,
                range,
            ),
            PrimitiveBatch::MonochromeSprites { texture_id, range } => {
                let Some(texture) = atlas_bind_group(target.atlas, &texture_bind_group, texture_id)
                else {
                    continue;
                };
                draw_batch(
                    &mut pass,
                    &mut bound,
                    draw.globals,
                    &pipelines.mono_sprites,
                    &upload.monochrome_sprites,
                    Some(&texture),
                    range,
                );
            }
            PrimitiveBatch::SubpixelSprites { texture_id, range } => {
                let Some(texture) = atlas_bind_group(target.atlas, &texture_bind_group, texture_id)
                else {
                    continue;
                };
                draw_batch(
                    &mut pass,
                    &mut bound,
                    draw.globals,
                    pipelines
                        .subpixel_sprites
                        .as_ref()
                        .unwrap_or(&pipelines.mono_sprites),
                    &upload.subpixel_sprites,
                    Some(&texture),
                    range,
                );
            }
            PrimitiveBatch::PolychromeSprites { texture_id, range } => {
                let Some(texture) = polychrome_bind_group(target, &texture_bind_group, texture_id)
                else {
                    continue;
                };
                draw_batch(
                    &mut pass,
                    &mut bound,
                    draw.globals,
                    &pipelines.poly_sprites,
                    &upload.polychrome_sprites,
                    Some(&texture),
                    range,
                );
            }
            // Surfaces are macOS-only for video playback and are not
            // implemented by the WGPU renderer.
            PrimitiveBatch::Surfaces(_surfaces) => {}
        }
    }
    drop(pass);
}

/// The bind group of an atlas texture, or `None` once the atlas has released
/// it: the batch then belongs to a stale paint that will be replaced once its
/// view renders again, and is skipped, as upstream's `draw_sprites` does.
fn atlas_bind_group(
    atlas: &WgpuAtlas,
    texture_bind_group: &impl Fn(&str, &wgpu::TextureView) -> wgpu::BindGroup,
    texture_id: AtlasTextureId,
) -> Option<wgpu::BindGroup> {
    let texture_info = atlas.get_texture_info(texture_id)?;
    Some(texture_bind_group(
        "atlas_texture_bind_group",
        &texture_info.view,
    ))
}

/// The bind group of a polychrome batch's texture: a dynamic texture's own,
/// or the atlas texture's. A dynamic texture the frame's device does not hold
/// is skipped like a released atlas texture, never looked up in the atlas.
fn polychrome_bind_group(
    target: &FrameTarget,
    texture_bind_group: &impl Fn(&str, &wgpu::TextureView) -> wgpu::BindGroup,
    texture_id: AtlasTextureId,
) -> Option<wgpu::BindGroup> {
    atlas_bind_group(target.atlas, texture_bind_group, texture_id)
}

/// Begins a pass that draws into `view`, cleared to `clear` if one is given.
fn begin_main_pass<'a>(
    encoder: &'a mut wgpu::CommandEncoder,
    view: &'a wgpu::TextureView,
    label: &str,
    clear: Option<wgpu::Color>,
) -> wgpu::RenderPass<'a> {
    encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            ops: wgpu::Operations {
                load: match clear {
                    Some(color) => wgpu::LoadOp::Clear(color),
                    None => wgpu::LoadOp::Load,
                },
                store: wgpu::StoreOp::Store,
            },
            depth_slice: None,
        })],
        depth_stencil_attachment: None,
        ..Default::default()
    })
}

fn draw_batch(
    pass: &mut wgpu::RenderPass<'_>,
    state: &mut PassState,
    globals: &wgpu::BindGroup,
    pipeline: &wgpu::RenderPipeline,
    instances: &InstanceBinding,
    texture: Option<&wgpu::BindGroup>,
    range: Range<usize>,
) {
    if range.is_empty() {
        return;
    }
    state.set_pipeline(pass, pipeline);
    state.set_bind_group(pass, 0, globals);
    state.set_bind_group(pass, 1, &instances.group);
    if let Some(texture) = texture {
        state.set_bind_group(pass, 2, texture);
    }
    pass.draw(
        0..4,
        (instances.first + range.start as u32)..(instances.first + range.end as u32),
    );
}

/// What a path rasterization pass keeps of its target. Multisampled paths are
/// read only through their resolve, so storing the samples would write the
/// multisampled texture, several times the window's size, for nothing.
fn path_store_op(resolve_target: Option<&wgpu::TextureView>) -> wgpu::StoreOp {
    if resolve_target.is_some() {
        wgpu::StoreOp::Discard
    } else {
        wgpu::StoreOp::Store
    }
}

/// Rasterizes a group's range of the frame's path vertices into the cleared
/// intermediate texture, in a pass of its own, as upstream's
/// `draw_paths_to_intermediate` does for a batch. Returns false if there is
/// nothing to rasterize or no intermediate texture to rasterize into.
fn rasterize_group(
    target: &FrameTarget,
    encoder: &mut wgpu::CommandEncoder,
    targets: PathTargets,
    paths: &PathUpload,
    vertices: Option<Range<u32>>,
) -> bool {
    let Some(vertices) = vertices.filter(|vertices| !vertices.is_empty()) else {
        return false;
    };
    let Some(path_intermediate_view) = targets.intermediate else {
        return false;
    };
    let (target_view, resolve_target) = match targets.msaa {
        Some(msaa_view) => (msaa_view, Some(path_intermediate_view)),
        None => (path_intermediate_view, None),
    };
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("path_rasterization_pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: target_view,
            resolve_target,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                store: path_store_op(resolve_target),
            },
            depth_slice: None,
        })],
        depth_stencil_attachment: None,
        ..Default::default()
    });
    pass.set_pipeline(&target.pipelines.path_rasterization);
    pass.set_bind_group(0, targets.globals, &[]);
    pass.set_bind_group(1, &paths.vertices.group, &[]);
    pass.set_bind_group(
        3,
        &target.bind_group_layouts.fast_rounded_clip.unmasked,
        &[0],
    );
    pass.draw(
        (paths.vertices.first + vertices.start)..(paths.vertices.first + vertices.end),
        0..1,
    );
    true
}
