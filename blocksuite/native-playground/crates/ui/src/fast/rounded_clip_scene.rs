//! Transport rounded clip groups through the existing renderer layer graph.
//! No public primitive or ContentMask layout changes. Texture ids in
//! 0xF1000000.. identify clip groups, not atlas sprites or scroll tiles. Such a
//! group's LayerFrame has tile_size=0 and contains its drawable scene plus
//! a geometry LayerFrame (key u32::MAX). Horizontal radii are on the group
//! sprite and vertical radii occupy that frame's background RGBA, in
//! TL/TR/BR/BL order. This frame is metadata and is never composited.
//! Renderers evaluate the independent padding edges in colour fragments;
//! rounded groups do not allocate intermediate render targets.

use std::mem;

use crate::fast::rounded_clip::{ClipOperation, Shape};
use crate::{
    AtlasTextureId, AtlasTextureKind, AtlasTile, ContentMask, LayerContent, LayerFrame, LayerKey,
    PolychromeSprite, Rgba, Scene, TileId, scene::PaintOperation,
};

const CLIP_TEXTURE_BASE: u32 = 0xF100_0000;
const GEOMETRY_KEY: LayerKey = LayerKey(u32::MAX);

/// Materialize private paint scopes as existing, renderer-readable layer
/// objects. Preserve the original operation stream for retained paint ranges.
pub(crate) fn compile(scene: &mut Scene) {
    if scene.fast_rounded_clip.scopes.is_empty() || scene.fast_rounded_clip.compiled {
        return;
    }
    let operations = mem::take(&mut scene.paint_operations);
    let layers: Vec<LayerFrame> = scene
        .layers
        .frames
        .iter()
        .filter(|frame| frame.tile_size != 0)
        .cloned()
        .collect();
    let new_scene = || {
        let mut scene = Scene::default();
        scene.layers.frames = layers.clone();
        scene
    };
    let mut stack = vec![new_scene()];
    let mut shapes = Vec::new();
    let mut redundant = Vec::new();
    for operation in &operations {
        match operation {
            PaintOperation::FastRoundedClip(ClipOperation::Begin(shape)) => {
                let already_active = shapes.contains(shape);
                redundant.push(already_active);
                shapes.push(*shape);
                if !already_active {
                    stack.push(new_scene());
                }
            }
            PaintOperation::FastRoundedClip(ClipOperation::End) => {
                let shape = shapes.pop().expect("balanced rounded clips");
                if redundant.pop().expect("rounded clip ownership") {
                    continue;
                }
                let mut child = stack.pop().expect("rounded clip scene");
                if child.is_empty() {
                    continue;
                }
                child.layers.frames.push(geometry(shape));
                child.finish();
                let parent = stack.last_mut().expect("parent rounded clip scene");
                let key = LayerKey(0x0100_0000 + parent.layers.frames.len() as u32);
                parent.layers.frames.push(LayerFrame {
                    key,
                    generation: 0,
                    background: Rgba::default(),
                    tile_size: 0,
                    content: LayerContent::from(child),
                    dirty_tiles: Vec::new(),
                });
                parent.insert_primitive(PolychromeSprite {
                    order: 0,
                    pad: 0,
                    grayscale: false.into(),
                    opacity: 1.,
                    bounds: shape.bounds,
                    content_mask: ContentMask {
                        bounds: shape.bounds,
                    },
                    corner_radii: shape.radii.map(|radius| radius.width),
                    tile: AtlasTile {
                        texture_id: AtlasTextureId {
                            index: CLIP_TEXTURE_BASE + key.0 - 0x0100_0000,
                            kind: AtlasTextureKind::Polychrome,
                        },
                        tile_id: TileId(0),
                        padding: 0,
                        bounds: Default::default(),
                    },
                });
            }
            PaintOperation::Primitive(primitive) => stack
                .last_mut()
                .unwrap()
                .insert_primitive(primitive.clone()),
            PaintOperation::StartLayer(bounds) => stack.last_mut().unwrap().push_layer(*bounds),
            PaintOperation::EndLayer => stack.last_mut().unwrap().pop_layer(),
        }
    }
    assert!(
        shapes.is_empty() && stack.len() == 1,
        "balanced rounded clips"
    );
    let mut compiled = stack.pop().unwrap();
    compiled.paint_operations = operations;
    compiled.fast_rounded_clip = mem::take(&mut scene.fast_rounded_clip);
    compiled.fast_rounded_clip.compiled = true;
    compiled.sort_scratch = mem::take(&mut scene.sort_scratch);
    *scene = compiled;
}

fn geometry(shape: Shape) -> LayerFrame {
    let r = shape.radii;
    LayerFrame {
        key: GEOMETRY_KEY,
        generation: 0,
        // Private analytic geometry: horizontal radii are on the group sprite;
        // this non-composited frame carries the corresponding vertical radii.
        background: Rgba {
            r: r.top_left.height.0,
            g: r.top_right.height.0,
            b: r.bottom_right.height.0,
            a: r.bottom_left.height.0,
        },
        tile_size: 0,
        content: Scene::default().into(),
        dirty_tiles: Vec::new(),
    }
}
