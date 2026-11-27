//! Spatial Edgeless canvas state, layout caching, and world-space item preparation.

use std::{
    collections::{BTreeMap, HashMap},
    rc::Rc,
};

use blocksuite_playground_doc::read::{BlockContent, BlockNode, NoteDisplayMode, PageSnapshot};
use serde_json::Value as JsonValue;
use ui::{BorderStyle, Bounds, Hsla, Pixels, Point, Size, point, px};

use crate::{
    block_flow::{BlockFlow, FlowLayout, ImageSlot, InlineLayout},
    editor_session::{DocPoint, DocumentSelection},
    surface::{SurfaceLayout, WorldBounds},
    theme::{Palette, PlaygroundTheme},
};

use super::{
    EdgelessAuthoringState, EdgelessCamera, PaintItem, SpatialItemInfo, WorldRect, parse_xywh,
};

pub const EDGELESS_VIEWPORT_ID: &str = "edgeless.viewport";
/// Inner padding of an `affine:note` card on the Edgeless canvas (world px).
pub const NOTE_CARD_PADDING: f32 = 24.0;
/// Default corner radius of an `affine:note` card (world px).
pub(super) const CARD_RADIUS: f32 = 8.0;
/// Corner radius of an `affine:frame` container (world px, matching BlockSuite).
pub(super) const FRAME_RADIUS: f32 = 2.0;
/// Frame title pill height and vertical gap above the frame top edge (world px).
pub(super) const FRAME_TITLE_HEIGHT: f32 = 22.0;
pub(super) const FRAME_TITLE_GAP: f32 = 6.0;
/// Screen-space zoom bar constants (concentric radii: outer 8 - pad 4 == inner 4).
pub(super) const ZOOM_BAR_MARGIN: f32 = 12.0;
pub(super) const ZOOM_BAR_PAD: f32 = 4.0;
pub(super) const ZOOM_BAR_RADIUS: f32 = 8.0;
pub(super) const ZOOM_BTN_RADIUS: f32 = 4.0;
pub(super) const ZOOM_BTN_HEIGHT: f32 = 28.0;

type NoteLayoutKey = (u64, u32, u32, PlaygroundTheme, u64, u64, u64, bool, i32);

pub(super) struct CachedNoteFlow {
    pub(super) flow: BlockFlow,
    pub(super) key: NoteLayoutKey,
    pub(super) layout: Rc<FlowLayout>,
}

pub(super) struct CachedSurfaces {
    pub(super) key: (u64, PlaygroundTheme, u64),
    pub(super) layouts: Rc<[SurfaceLayout]>,
    pub(super) order: Rc<[PaintItem]>,
    pub(super) painted_items: Rc<[SpatialItemInfo]>,
}

pub fn world_rect(b: Bounds<Pixels>) -> WorldRect {
    WorldRect::new(
        b.origin.x.into(),
        b.origin.y.into(),
        b.size.width.into(),
        b.size.height.into(),
    )
}
pub fn world_bounds(r: WorldRect, rotate: f32) -> WorldBounds {
    WorldBounds {
        xywh: [r.x.into(), r.y.into(), r.w.into(), r.h.into()],
        rotate: rotate.into(),
    }
}
pub fn rotated_bounds(r: WorldRect, degrees: f32) -> WorldRect {
    world_rect(world_bounds(r, degrees).aabb().ui())
}

/// Persistent Edgeless camera, interaction state, and cached per-Note/EdgelessText layouts.
#[derive(Default)]
pub struct EdgelessCanvasState {
    pub camera: EdgelessCamera,
    pub camera_initialized: bool,
    pub drag_pan_anchor: Option<Point<Pixels>>,
    pub authoring: EdgelessAuthoringState,
    pub(super) surfaces: Option<CachedSurfaces>,
    pub(super) note_flows: HashMap<String, CachedNoteFlow>,
    pub(super) text_flows: HashMap<String, CachedNoteFlow>,
    /// Number of block bodies laid out during the most recent Edgeless frame.
    pub last_frame_relayouts: u64,
}

/// Collect spatial blocks (`Frame`, Edgeless-visible `Note`, `EdgelessText`) from `root.children`
/// and any `BlockContent::Surface`'s children in document order.
pub fn spatial_blocks(root: &BlockNode) -> Vec<&BlockNode> {
    let mut out = Vec::new();
    for child in &root.children {
        match &child.content {
            BlockContent::Surface { .. } => {
                for sub in &child.children {
                    if is_spatial_block(sub) {
                        out.push(sub);
                    }
                }
            }
            _ if is_spatial_block(child) => out.push(child),
            _ => {}
        }
    }
    out
}

fn is_spatial_block(node: &BlockNode) -> bool {
    match &node.content {
        BlockContent::Frame { .. } | BlockContent::EdgelessText { .. } => true,
        BlockContent::Note {
            display_mode,
            hidden: false,
            ..
        } => *display_mode != NoteDisplayMode::DocOnly,
        _ => false,
    }
}

fn edgeless_prop<'a>(
    node: &'a BlockNode,
    flat_key: &str,
    nested: &[&str],
) -> Option<&'a JsonValue> {
    if let Some(v) = node.props.get(flat_key) {
        return Some(v);
    }
    let mut cur = node.props.get("prop:edgeless")?;
    for seg in nested {
        cur = cur.get(*seg)?;
    }
    Some(cur)
}

pub fn note_scale(node: &BlockNode) -> f32 {
    edgeless_prop(node, "prop:edgeless.scale", &["scale"])
        .and_then(JsonValue::as_f64)
        .map(|v| v as f32)
        .filter(|v| v.is_finite())
        .unwrap_or(1.0)
        .clamp(0.1, 10.0)
}

pub fn note_collapse(node: &BlockNode) -> bool {
    edgeless_prop(node, "prop:edgeless.collapse", &["collapse"])
        .and_then(JsonValue::as_bool)
        .unwrap_or(false)
}

pub fn note_border_style(node: &BlockNode) -> Option<(BorderStyle, f32)> {
    let style = edgeless_prop(
        node,
        "prop:edgeless.style.borderStyle",
        &["style", "borderStyle"],
    )
    .and_then(JsonValue::as_str)
    .unwrap_or("none");
    let border_style = match style {
        "solid" => BorderStyle::Solid,
        "dash" | "dashed" => BorderStyle::Dashed,
        _ => return None,
    };
    let size = edgeless_prop(
        node,
        "prop:edgeless.style.borderSize",
        &["style", "borderSize"],
    )
    .and_then(JsonValue::as_f64)
    .map(|v| v as f32)
    .filter(|v| v.is_finite() && *v >= 0.0)
    .unwrap_or(4.0);
    if size <= 0.0 {
        None
    } else {
        Some((border_style, size))
    }
}

pub fn note_border_radius(node: &BlockNode) -> f32 {
    edgeless_prop(
        node,
        "prop:edgeless.style.borderRadius",
        &["style", "borderRadius"],
    )
    .and_then(JsonValue::as_f64)
    .map(|v| v as f32)
    .filter(|v| v.is_finite() && *v >= 0.0)
    .unwrap_or(CARD_RADIUS)
}

pub fn note_shadow_type(node: &BlockNode) -> &str {
    edgeless_prop(
        node,
        "prop:edgeless.style.shadowType",
        &["style", "shadowType"],
    )
    .and_then(JsonValue::as_str)
    .unwrap_or("--affine-note-shadow-box")
}

impl EdgelessCanvasState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_camera(&mut self, pan_x: f32, pan_y: f32, zoom: f32) {
        self.camera = EdgelessCamera::new(pan_x, pan_y, zoom);
        self.camera_initialized = true;
    }

    pub fn ensure_camera_initialized(
        &mut self,
        snapshot: &PageSnapshot,
        viewport_size: Size<Pixels>,
    ) {
        if !self.camera_initialized
            && f32::from(viewport_size.width) > 0.0
            && f32::from(viewport_size.height) > 0.0
        {
            let bounds = self.scene_world_bounds(snapshot);
            self.camera.fit_to_bounds(bounds, viewport_size, 48.0);
            self.camera_initialized = true;
        }
    }

    pub fn cached_block_layout(&self, block_id: &str, is_note: bool) -> Option<Rc<FlowLayout>> {
        if is_note {
            self.note_flows.get(block_id).map(|c| c.layout.clone())
        } else {
            self.text_flows.get(block_id).map(|c| c.layout.clone())
        }
    }

    pub fn set_zoom_centered(
        &mut self,
        zoom: f32,
        viewport_origin: Point<Pixels>,
        viewport_size: Size<Pixels>,
    ) {
        let center = point(
            px(f32::from(viewport_origin.x) + f32::from(viewport_size.width) * 0.5),
            px(f32::from(viewport_origin.y) + f32::from(viewport_size.height) * 0.5),
        );
        self.camera.zoom_at(zoom, center, viewport_origin);
        self.camera_initialized = true;
    }

    pub fn set_pan(&mut self, pan_x: f32, pan_y: f32) {
        self.camera.pan_x = pan_x;
        self.camera.pan_y = pan_y;
        self.camera_initialized = true;
    }

    pub fn cached_note_layout(&self, id: &str) -> Option<Rc<FlowLayout>> {
        self.note_flows.get(id).map(|entry| entry.layout.clone())
    }

    pub fn cached_surface_layouts(&self) -> Option<Rc<[SurfaceLayout]>> {
        self.surfaces.as_ref().map(|s| s.layouts.clone())
    }

    pub fn cached_text_layout(&self, id: &str) -> Option<Rc<FlowLayout>> {
        self.text_flows.get(id).map(|entry| entry.layout.clone())
    }

    /// Compute the bounding box of all Edgeless-visible Frames, Notes, EdgelessTexts, and
    /// Surface elements (including auto-laid-out Mindmaps, even before the first paint pass).
    pub fn scene_world_bounds(&self, snapshot: &PageSnapshot) -> WorldRect {
        let mut union = WorldRect::default();
        let Some(root) = &snapshot.root else {
            return union;
        };
        let mut external = BTreeMap::new();
        for child in spatial_blocks(root) {
            match &child.content {
                BlockContent::Frame { xywh, .. } => {
                    if let Some(rect) = parse_xywh(xywh) {
                        external.insert(child.id.clone(), world_bounds(rect, 0.0));
                        let with_title = WorldRect::new(
                            rect.x,
                            rect.y - FRAME_TITLE_HEIGHT - FRAME_TITLE_GAP,
                            rect.w,
                            rect.h + FRAME_TITLE_HEIGHT + FRAME_TITLE_GAP,
                        );
                        union = union.union(with_title);
                    }
                }
                BlockContent::Note {
                    display_mode,
                    xywh,
                    hidden,
                    ..
                } if !hidden && *display_mode != NoteDisplayMode::DocOnly => {
                    let mut rect =
                        parse_xywh(xywh).unwrap_or(WorldRect::new(0.0, 0.0, 800.0, 95.0));
                    if !note_collapse(child)
                        && let Some(cached) = self.note_flows.get(&child.id)
                    {
                        let scale = note_scale(child);
                        rect.h = rect
                            .h
                            .max((cached.layout.height + 2.0 * NOTE_CARD_PADDING) * scale);
                    }
                    external.insert(child.id.clone(), world_bounds(rect, 0.0));
                    union = union.union(rect);
                }
                BlockContent::EdgelessText { xywh } => {
                    if let Some(mut rect) = parse_xywh(xywh) {
                        let scale = prop_f32(child, "prop:scale", 1.0).clamp(0.1, 10.0);
                        let rot = prop_f32(child, "prop:rotate", 0.0);
                        if let Some(cached) = self.text_flows.get(&child.id) {
                            rect.h = (cached.layout.height * scale).max(rect.h);
                        }
                        external.insert(child.id.clone(), world_bounds(rect, rot));
                        union = union.union(rotated_bounds(rect, rot));
                    }
                }
                _ => {}
            }
        }
        if let Some(surfaces) = &self.surfaces {
            for layout in surfaces.layouts.iter() {
                for (_, bounds) in layout.bounds() {
                    union = union.union(world_rect(bounds));
                }
            }
        } else {
            for node in &root.children {
                if let BlockContent::Surface { elements, .. } = &node.content {
                    let (bounds, collapsed_hidden) =
                        crate::surface::resolve_surface_scene_bounds(elements, &external);
                    for el in elements
                        .iter()
                        .filter(|el| !el.hidden && !collapsed_hidden.contains(&el.id))
                    {
                        if let Some(b) = bounds.get(&el.id) {
                            union = union.union(world_rect(b.aabb().ui()));
                        }
                    }
                }
            }
        }
        union
    }
}

/// Resolved frame card ready to paint on the GPU canvas.
pub(super) struct PaintFrame {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) index: String,
    pub(super) frame_children: Vec<String>,
    pub(super) rect: WorldRect,
    pub(super) title_inline: Rc<InlineLayout>,
    pub(super) title_pill_rect: WorldRect,
    pub(super) fill: Option<Hsla>,
}

/// Resolved note card with its cached `FlowLayout`.
pub(super) struct PaintNote {
    pub(super) id: String,
    pub(super) index: String,
    pub(super) rect: WorldRect,
    pub(super) scale: f32,
    pub(super) border: Option<(BorderStyle, f32)>,
    pub(super) border_radius: f32,
    pub(super) shadows: Vec<ui::BoxShadow>,
    pub(super) fill: Hsla,
    pub(super) layout: Rc<FlowLayout>,
}

/// Resolved edgeless-text block with its cached `FlowLayout` and rotation/scale.
pub(super) struct PaintEdgelessText {
    pub(super) world_aabb: WorldRect,
    pub(super) id: String,
    pub(super) index: String,
    pub(super) rect: WorldRect,
    pub(super) scale: f32,
    pub(super) rotate_deg: f32,
    pub(super) layout: Rc<FlowLayout>,
}

/// Resolve a BlockSuite `{ light, dark }` color map or string color token against `theme`.
pub fn resolve_edgeless_color(value: &JsonValue, theme: PlaygroundTheme) -> Option<Hsla> {
    let raw = match value {
        JsonValue::String(s) => s.as_str(),
        JsonValue::Object(map) => {
            let key = match theme {
                PlaygroundTheme::Light => "light",
                PlaygroundTheme::Dark => "dark",
            };
            map.get(key)
                .and_then(JsonValue::as_str)
                .or_else(|| map.get("normal").and_then(JsonValue::as_str))?
        }
        _ => return None,
    };
    if raw.eq_ignore_ascii_case("transparent") || raw.is_empty() {
        return Some(Hsla::transparent_black());
    }
    theme.css_color(raw)
}

pub fn prop_f32(node: &BlockNode, key: &str, default: f32) -> f32 {
    node.props
        .get(key)
        .and_then(JsonValue::as_f64)
        .map(|v| v as f32)
        .filter(|v| v.is_finite())
        .unwrap_or(default)
}

pub fn prop_bool(node: &BlockNode, key: &str, default: bool) -> bool {
    node.props
        .get(key)
        .and_then(JsonValue::as_bool)
        .unwrap_or(default)
}

/// Inputs needed to prepare and build one Edgeless canvas frame.
pub struct EdgelessRenderInput<'a> {
    pub snapshot: &'a PageSnapshot,
    pub doc_rev: u64,
    pub env_rev: u64,
    pub preview_rev: u64,
    pub preedit_nonce: u64,
    pub theme: PlaygroundTheme,
    pub palette: &'a Palette,
    pub page_titles: &'a BTreeMap<String, String>,
    pub images: &'a HashMap<String, ImageSlot>,
    pub pdf_previews: Option<&'a HashMap<String, crate::block_flow::PdfPreviewPage>>,
    pub doc_directory: Option<&'a dyn crate::directory::WorkspaceDocDirectory>,
    pub viewport_width: f32,
    pub viewport_height: f32,
    pub direction: ui::Direction,
    pub utc_offset_minutes: i32,
    pub utc_offset_at: Option<&'a dyn Fn(i64) -> i32>,
    pub editing_selection: Option<(String, bool, DocumentSelection, DocPoint)>,
}
