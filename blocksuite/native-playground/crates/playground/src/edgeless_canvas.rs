//! Spatial Edgeless canvas rendering: procedural dot-grid, `affine:frame`, `affine:note`,
//! `affine:edgeless-text`, cached per-note `BlockFlow` (zero relayout on pan/zoom), and
//! screen-space zoom controls (`chrome.edgeless_zoom`).

use std::{
    collections::{BTreeMap, HashMap},
    rc::Rc,
};

use blocksuite_playground_doc::read::{BlockContent, BlockNode, NoteDisplayMode, PageSnapshot};
use serde_json::Value as JsonValue;
use ui::{
    AnyElement, Background, BorderStyle, Bounds, ContentMask, Corners, Edges, Hsla, MouseButton,
    Pixels, Point, ScaledPixels, SharedString, Size, TransformationMatrix, Window, canvas, div,
    point, prelude::*, px, size,
};

use crate::{
    block_flow::{
        BlockFlow, BlockPaint, FlowInput, FlowLayout, ImageSlot, InlineAlign, InlineBaseline,
        InlineStyle, layout_inline,
    },
    edgeless_camera::{EdgelessCamera, WorldRect, bg_grid_gap, parse_xywh},
    theme::{FONT_SANS, Palette, PlaygroundTheme},
};

/// Snapshot id of the Edgeless spatial viewport under `root.canvas`.
pub const EDGELESS_VIEWPORT_ID: &str = "edgeless.viewport";
/// Inner padding of an `affine:note` card on the Edgeless canvas (world px).
pub const NOTE_CARD_PADDING: f32 = 24.0;
/// Default corner radius of an `affine:note` card (world px).
const CARD_RADIUS: f32 = 8.0;
/// Corner radius of an `affine:frame` container (world px, matching BlockSuite).
const FRAME_RADIUS: f32 = 2.0;
/// Frame title pill height and vertical gap above the frame top edge (world px).
const FRAME_TITLE_HEIGHT: f32 = 22.0;
const FRAME_TITLE_GAP: f32 = 6.0;
/// Screen-space zoom bar constants (concentric radii: outer 8 - pad 4 == inner 4).
const ZOOM_BAR_MARGIN: f32 = 12.0;
const ZOOM_BAR_PAD: f32 = 4.0;
const ZOOM_BAR_RADIUS: f32 = 8.0;
const ZOOM_BTN_RADIUS: f32 = 4.0;
const ZOOM_BTN_HEIGHT: f32 = 28.0;

type NoteLayoutKey = (u64, u32, u32, PlaygroundTheme, u64);

struct CachedNoteFlow {
    flow: BlockFlow,
    key: NoteLayoutKey,
    layout: Rc<FlowLayout>,
}

/// Persistent Edgeless camera, interaction state, and cached per-Note/EdgelessText layouts.
#[derive(Default)]
pub struct EdgelessCanvasState {
    pub camera: EdgelessCamera,
    pub camera_initialized: bool,
    pub drag_pan_anchor: Option<Point<Pixels>>,
    note_flows: HashMap<String, CachedNoteFlow>,
    text_flows: HashMap<String, CachedNoteFlow>,
    /// Number of block bodies laid out during the most recent Edgeless frame.
    pub last_frame_relayouts: u64,
}

/// Collect spatial blocks (`Frame`, Edgeless-visible `Note`, `EdgelessText`) from `root.children`
/// and any `BlockContent::Surface`'s children in document order.
fn spatial_blocks(root: &BlockNode) -> Vec<&BlockNode> {
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

fn note_scale(node: &BlockNode) -> f32 {
    edgeless_prop(node, "prop:edgeless.scale", &["scale"])
        .and_then(JsonValue::as_f64)
        .map(|v| v as f32)
        .filter(|v| v.is_finite())
        .unwrap_or(1.0)
        .clamp(0.1, 10.0)
}

fn note_collapse(node: &BlockNode) -> bool {
    edgeless_prop(node, "prop:edgeless.collapse", &["collapse"])
        .and_then(JsonValue::as_bool)
        .unwrap_or(false)
}

fn note_collapsed_height(node: &BlockNode) -> Option<f32> {
    edgeless_prop(node, "prop:edgeless.collapsedHeight", &["collapsedHeight"])
        .and_then(JsonValue::as_f64)
        .map(|v| v as f32)
        .filter(|v| v.is_finite() && *v > 0.0)
}

fn note_border_style(node: &BlockNode) -> Option<(BorderStyle, f32)> {
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

fn note_border_radius(node: &BlockNode) -> f32 {
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

fn note_shadow_type(node: &BlockNode) -> &str {
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

    #[cfg(test)]
    pub fn cached_note_layout(&self, id: &str) -> Option<Rc<FlowLayout>> {
        self.note_flows.get(id).map(|entry| entry.layout.clone())
    }

    #[cfg(test)]
    pub fn cached_text_layout(&self, id: &str) -> Option<Rc<FlowLayout>> {
        self.text_flows.get(id).map(|entry| entry.layout.clone())
    }

    /// Compute the bounding box of all Edgeless-visible Frames, Notes, and EdgelessTexts.
    pub fn scene_world_bounds(&self, snapshot: &PageSnapshot) -> WorldRect {
        let mut union = WorldRect::default();
        let Some(root) = &snapshot.root else {
            return union;
        };
        for child in spatial_blocks(root) {
            match &child.content {
                BlockContent::Frame { xywh, .. } => {
                    if let Some(rect) = parse_xywh(xywh) {
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
                    if note_collapse(child) {
                        rect.h = note_collapsed_height(child).unwrap_or(rect.h);
                    } else if let Some(cached) = self.note_flows.get(&child.id) {
                        let scale = note_scale(child);
                        rect.h = rect
                            .h
                            .max((cached.layout.height + 2.0 * NOTE_CARD_PADDING) * scale);
                    }
                    union = union.union(rect);
                }
                BlockContent::EdgelessText { xywh } => {
                    if let Some(mut rect) = parse_xywh(xywh) {
                        let scale = prop_f32(child, "prop:scale", 1.0).clamp(0.1, 10.0);
                        if let Some(cached) = self.text_flows.get(&child.id) {
                            rect.h = (cached.layout.height * scale).max(rect.h);
                        }
                        union = union.union(rect);
                    }
                }
                _ => {}
            }
        }
        union
    }
}

/// Resolved frame card ready to paint on the GPU canvas.
struct PaintFrame {
    id: String,
    rect: WorldRect,
    title: String,
    fill: Option<Hsla>,
}

/// Resolved note card with its cached `FlowLayout`.
struct PaintNote {
    id: String,
    rect: WorldRect,
    scale: f32,
    border: Option<(BorderStyle, f32)>,
    border_radius: f32,
    shadows: Vec<ui::BoxShadow>,
    fill: Hsla,
    layout: Rc<FlowLayout>,
}

/// Resolved edgeless-text block with its cached `FlowLayout` and rotation/scale.
struct PaintEdgelessText {
    id: String,
    rect: WorldRect,
    scale: f32,
    rotate_deg: f32,
    layout: Rc<FlowLayout>,
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

fn prop_f32(node: &BlockNode, key: &str, default: f32) -> f32 {
    node.props
        .get(key)
        .and_then(JsonValue::as_f64)
        .map(|v| v as f32)
        .filter(|v| v.is_finite())
        .unwrap_or(default)
}

fn prop_bool(node: &BlockNode, key: &str, default: bool) -> bool {
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
    pub theme: PlaygroundTheme,
    pub palette: &'a Palette,
    pub page_titles: &'a BTreeMap<String, String>,
    pub images: &'a HashMap<String, ImageSlot>,
    pub viewport_width: f32,
    pub viewport_height: f32,
}

/// Prepare cached Note & EdgelessText layouts (zero relayout when camera moves), fit camera
/// on first render, and return the spatial canvas element plus screen-space snapshot markers.
pub fn build_edgeless_layer(
    state: &mut EdgelessCanvasState,
    input: &EdgelessRenderInput<'_>,
    window: &Window,
    zoom_controls: AnyElement,
) -> AnyElement {
    state.last_frame_relayouts = 0;

    let mut frames = Vec::new();
    let mut notes = Vec::new();
    let mut texts = Vec::new();

    if let Some(root) = &input.snapshot.root {
        let mut active_notes = Vec::new();
        let mut active_texts = Vec::new();

        for child in spatial_blocks(root) {
            match &child.content {
                BlockContent::Frame { title, xywh } => {
                    if let Some(rect) = parse_xywh(xywh) {
                        let fill = child
                            .props
                            .get("prop:background")
                            .and_then(|v| resolve_edgeless_color(v, input.theme))
                            .filter(|c| !c.is_transparent());
                        frames.push(PaintFrame {
                            id: child.id.clone(),
                            rect,
                            title: if title.plain.is_empty() {
                                "Frame".to_string()
                            } else {
                                title.plain.clone()
                            },
                            fill,
                        });
                    }
                }
                BlockContent::Note {
                    display_mode,
                    xywh,
                    background,
                    hidden,
                } if !hidden && *display_mode != NoteDisplayMode::DocOnly => {
                    let mut rect =
                        parse_xywh(xywh).unwrap_or(WorldRect::new(0.0, 0.0, 800.0, 95.0));
                    let scale = note_scale(child);
                    let collapse = note_collapse(child);
                    let collapsed_height = note_collapsed_height(child);
                    let border = note_border_style(child);
                    let border_radius = note_border_radius(child);
                    let shadows = input.theme.shadows(note_shadow_type(child));
                    let inner_width = (rect.w / scale - 2.0 * NOTE_CARD_PADDING).max(120.0);
                    let key = (
                        input.doc_rev,
                        inner_width.to_bits(),
                        scale.to_bits(),
                        input.theme,
                        input.env_rev,
                    );
                    let layout = match state.note_flows.get_mut(&child.id) {
                        Some(cached) if cached.key == key => cached.layout.clone(),
                        _ => {
                            let flow_input = FlowInput {
                                snapshot: input.snapshot,
                                width: inner_width,
                                theme: input.theme,
                                page_titles: input.page_titles,
                                images: input.images,
                                env_rev: input.env_rev,
                            };
                            let entry =
                                state.note_flows.entry(child.id.clone()).or_insert_with(|| {
                                    CachedNoteFlow {
                                        flow: BlockFlow::new(),
                                        key: (u64::MAX, 0, 0, input.theme, 0),
                                        layout: Rc::new(FlowLayout {
                                            blocks: Vec::new(),
                                            width: inner_width,
                                            height: 0.0,
                                            stats: Default::default(),
                                        }),
                                    }
                                });
                            let laid_out =
                                entry
                                    .flow
                                    .layout_nodes(&child.children, &flow_input, window);
                            state.last_frame_relayouts += laid_out.stats.laid_out as u64;
                            let rc = Rc::new(laid_out);
                            entry.key = key;
                            entry.layout = rc.clone();
                            rc
                        }
                    };
                    if collapse {
                        rect.h = collapsed_height.unwrap_or(rect.h);
                    } else {
                        rect.h = rect
                            .h
                            .max((layout.height + 2.0 * NOTE_CARD_PADDING) * scale);
                    }
                    let fill = resolve_edgeless_color(background, input.theme)
                        .filter(|c| !c.is_transparent())
                        .unwrap_or(input.palette.background);
                    active_notes.push(child.id.clone());
                    notes.push(PaintNote {
                        id: child.id.clone(),
                        rect,
                        scale,
                        border,
                        border_radius,
                        shadows,
                        fill,
                        layout,
                    });
                }
                BlockContent::EdgelessText { xywh } => {
                    if let Some(mut rect) = parse_xywh(xywh) {
                        let scale = prop_f32(child, "prop:scale", 1.0).clamp(0.1, 10.0);
                        let rotate_deg = prop_f32(child, "prop:rotate", 0.0);
                        let has_max_width = prop_bool(child, "prop:hasMaxWidth", true);
                        let text_width = if has_max_width {
                            (rect.w / scale).max(60.0)
                        } else {
                            (rect.w / scale).max(320.0)
                        };
                        let key = (
                            input.doc_rev,
                            text_width.to_bits(),
                            scale.to_bits(),
                            input.theme,
                            input.env_rev,
                        );
                        let layout = match state.text_flows.get_mut(&child.id) {
                            Some(cached) if cached.key == key => cached.layout.clone(),
                            _ => {
                                let flow_input = FlowInput {
                                    snapshot: input.snapshot,
                                    width: text_width,
                                    theme: input.theme,
                                    page_titles: input.page_titles,
                                    images: input.images,
                                    env_rev: input.env_rev,
                                };
                                let entry = state
                                    .text_flows
                                    .entry(child.id.clone())
                                    .or_insert_with(|| CachedNoteFlow {
                                        flow: BlockFlow::new(),
                                        key: (u64::MAX, 0, 0, input.theme, 0),
                                        layout: Rc::new(FlowLayout {
                                            blocks: Vec::new(),
                                            width: text_width,
                                            height: 0.0,
                                            stats: Default::default(),
                                        }),
                                    });
                                let laid_out =
                                    entry
                                        .flow
                                        .layout_nodes(&child.children, &flow_input, window);
                                state.last_frame_relayouts += laid_out.stats.laid_out as u64;
                                let rc = Rc::new(laid_out);
                                entry.key = key;
                                entry.layout = rc.clone();
                                rc
                            }
                        };
                        rect.h = (layout.height * scale).max(rect.h);
                        active_texts.push(child.id.clone());
                        texts.push(PaintEdgelessText {
                            id: child.id.clone(),
                            rect,
                            scale,
                            rotate_deg,
                            layout,
                        });
                    }
                }
                _ => {}
            }
        }

        if state.note_flows.len() > active_notes.len() {
            state.note_flows.retain(|id, _| active_notes.contains(id));
        }
        if state.text_flows.len() > active_texts.len() {
            state.text_flows.retain(|id, _| active_texts.contains(id));
        }
    }

    if !state.camera_initialized && input.viewport_width > 0.0 && input.viewport_height > 0.0 {
        let bounds = state.scene_world_bounds(input.snapshot);
        state.camera.fit_to_bounds(
            bounds,
            size(px(input.viewport_width), px(input.viewport_height)),
            48.0,
        );
        state.camera_initialized = true;
    }

    let camera = state.camera;
    let palette = *input.palette;
    let theme = input.theme;
    let visible_world =
        camera.visible_world_bounds(size(px(input.viewport_width), px(input.viewport_height)));

    // Record screen-space snapshot markers for fully-visible spatial items so `bs-harness audit`
    // and tests can inspect their screen bounds without triggering false clipping violations.
    let mut snapshot_markers: Vec<AnyElement> = Vec::new();
    let vp_origin = point(px(0.0), px(0.0));
    let push_marker =
        |markers: &mut Vec<AnyElement>, id: String, rect: WorldRect, text: Option<String>| {
            let tl = camera.world_to_screen(point(px(rect.x), px(rect.y)), vp_origin);
            let br = camera.world_to_screen(point(px(rect.right()), px(rect.bottom())), vp_origin);
            let x = f32::from(tl.x);
            let y = f32::from(tl.y);
            let w = f32::from(br.x) - x;
            let h = f32::from(br.y) - y;
            if x >= 0.0
                && y >= 0.0
                && x + w <= input.viewport_width
                && y + h <= input.viewport_height
                && w >= 1.0
                && h >= 1.0
            {
                let mut el = div()
                    .absolute()
                    .left(px(x))
                    .top(px(y))
                    .w(px(w))
                    .h(px(h))
                    .snapshot(SharedString::from(id), Some(EDGELESS_VIEWPORT_ID));
                if let Some(t) = text {
                    el = el.snapshot_text(t);
                }
                markers.push(el.into_any_element());
            }
        };

    for frame in &frames {
        push_marker(
            &mut snapshot_markers,
            format!("edgeless.frame.{}", frame.id),
            frame.rect,
            Some(frame.title.clone()),
        );
    }
    for note in &notes {
        push_marker(
            &mut snapshot_markers,
            format!("edgeless.note.{}", note.id),
            note.rect,
            None,
        );
    }
    for et in &texts {
        push_marker(
            &mut snapshot_markers,
            format!("edgeless.text.{}", et.id),
            et.rect,
            None,
        );
    }

    let frame_border = theme
        .css_var("--affine-v2-edgeless-frame-border")
        .unwrap_or(palette.border);
    let frame_pill_bg = palette.panel;

    let paint_canvas = canvas(
        |_, _, _| (),
        move |bounds, _, window, cx| {
            // 1. Single-draw-call procedural dot-grid background.
            let gap = bg_grid_gap(camera.zoom);
            let (phase_x, phase_y) = camera.dot_grid_phase(gap);
            window.paint_quad(ui::fill(
                bounds,
                Background::dot_grid(
                    palette.background,
                    palette.edgeless_grid,
                    gap,
                    1.0,
                    phase_x,
                    phase_y,
                ),
            ));

            let cam_matrix = camera.to_transformation_matrix(bounds.origin);
            let cull_world = visible_world.dilate(120.0);

            window.with_content_mask(Some(ContentMask { bounds }), |window| {
                window.with_paint_transformation(cam_matrix, |window| {
                    // 2. Frames (back layer).
                    for frame in &frames {
                        if !frame.rect.intersects(cull_world) {
                            continue;
                        }
                        let fb = Bounds::new(
                            point(px(frame.rect.x), px(frame.rect.y)),
                            size(px(frame.rect.w), px(frame.rect.h)),
                        );
                        window.paint_quad(ui::quad(
                            fb,
                            Corners::all(px(FRAME_RADIUS)),
                            frame.fill.unwrap_or_else(Hsla::transparent_black),
                            Edges::all(px(1.0)),
                            frame_border,
                            BorderStyle::Solid,
                        ));

                        // Frame title pill above top-left corner.
                        let title_style =
                            InlineStyle::new(FONT_SANS, 12.0, 500.0, palette.text_secondary);
                        let title_inline = layout_inline(
                            &frame.title,
                            &title_style,
                            frame.rect.w.max(80.0),
                            FRAME_TITLE_HEIGHT,
                            InlineBaseline::Of(&title_style),
                            InlineAlign::Left,
                            window,
                        );
                        let pill_w =
                            (title_inline.content_width() + 16.0).min(frame.rect.w.max(80.0));
                        let pill_x = frame.rect.x;
                        let pill_y = frame.rect.y - FRAME_TITLE_HEIGHT - FRAME_TITLE_GAP;
                        window.paint_quad(ui::quad(
                            Bounds::new(
                                point(px(pill_x), px(pill_y)),
                                size(px(pill_w), px(FRAME_TITLE_HEIGHT)),
                            ),
                            Corners::all(px(4.0)),
                            frame_pill_bg,
                            Edges::all(px(1.0)),
                            palette.border,
                            BorderStyle::Solid,
                        ));
                        title_inline.paint(point(px(pill_x + 8.0), px(pill_y)), window, cx);
                    }

                    // 3. Notes (middle layer): shadow + card + scaled locally masked cached BlockFlow.
                    for note in &notes {
                        if !note.rect.intersects(cull_world) {
                            continue;
                        }
                        let nb = Bounds::new(
                            point(px(note.rect.x), px(note.rect.y)),
                            size(px(note.rect.w), px(note.rect.h)),
                        );
                        if !note.shadows.is_empty() {
                            window.paint_drop_shadows(
                                nb,
                                Corners::all(px(note.border_radius)),
                                &note.shadows,
                            );
                        }
                        let (border_widths, border_color, border_style) = match note.border {
                            Some((style, width)) => (Edges::all(px(width)), palette.border, style),
                            None => (
                                Edges::default(),
                                Hsla::transparent_black(),
                                BorderStyle::Solid,
                            ),
                        };
                        window.paint_quad(ui::quad(
                            nb,
                            Corners::all(px(note.border_radius)),
                            note.fill,
                            border_widths,
                            border_color,
                            border_style,
                        ));

                        let scale_transform = TransformationMatrix::unit()
                            .translate(point(ScaledPixels(note.rect.x), ScaledPixels(note.rect.y)))
                            .scale(size(note.scale, note.scale))
                            .translate(point(
                                ScaledPixels(-note.rect.x),
                                ScaledPixels(-note.rect.y),
                            ));
                        let inner_bounds = Bounds::new(
                            point(
                                px(note.rect.x + NOTE_CARD_PADDING),
                                px(note.rect.y + NOTE_CARD_PADDING),
                            ),
                            size(
                                px((note.rect.w / note.scale - 2.0 * NOTE_CARD_PADDING).max(0.0)),
                                px((note.rect.h / note.scale - 2.0 * NOTE_CARD_PADDING).max(0.0)),
                            ),
                        );
                        window.with_paint_transformation(scale_transform, |window| {
                            window.with_local_paint_mask(
                                ContentMask {
                                    bounds: inner_bounds,
                                },
                                |window| {
                                    for block in &note.layout.blocks {
                                        let origin = point(
                                            px(note.rect.x + NOTE_CARD_PADDING + block.x),
                                            px(note.rect.y + NOTE_CARD_PADDING + block.y),
                                        );
                                        block.body.paint(origin, BlockPaint::default(), window, cx);
                                    }
                                },
                            );
                        });
                    }

                    // 4. EdgelessText (front layer): scale from top-left, then rotate around visual center.
                    for et in &texts {
                        if !et.rect.intersects(cull_world) {
                            continue;
                        }
                        let (cx_w, cy_w) = et.rect.center();
                        let scale_from_tl = TransformationMatrix::unit()
                            .translate(point(ScaledPixels(et.rect.x), ScaledPixels(et.rect.y)))
                            .scale(size(et.scale, et.scale))
                            .translate(point(ScaledPixels(-et.rect.x), ScaledPixels(-et.rect.y)));
                        let rotate_around_center = TransformationMatrix::unit()
                            .translate(point(ScaledPixels(cx_w), ScaledPixels(cy_w)))
                            .rotate(ui::radians(et.rotate_deg.to_radians()))
                            .translate(point(ScaledPixels(-cx_w), ScaledPixels(-cy_w)));
                        let local_transform = rotate_around_center.compose(scale_from_tl);
                        window.with_paint_transformation(local_transform, |window| {
                            for block in &et.layout.blocks {
                                let origin =
                                    point(px(et.rect.x + block.x), px(et.rect.y + block.y));
                                block.body.paint(origin, BlockPaint::default(), window, cx);
                            }
                        });
                    }
                });
            });
        },
    )
    .size_full();

    div()
        .relative()
        .flex_1()
        .w_full()
        .min_h_0()
        .overflow_hidden()
        .snapshot(EDGELESS_VIEWPORT_ID, Some("root.canvas"))
        .child(paint_canvas)
        .children(snapshot_markers)
        .child(zoom_controls)
        .into_any_element()
}

/// Build the bottom-right screen-space zoom control bar (`chrome.edgeless_zoom`).
pub fn build_zoom_controls<V: 'static>(
    zoom: f32,
    palette: &Palette,
    theme: PlaygroundTheme,
    on_out: impl Fn(&mut V, &ui::MouseDownEvent, &mut Window, &mut ui::Context<V>) + 'static,
    on_reset: impl Fn(&mut V, &ui::MouseDownEvent, &mut Window, &mut ui::Context<V>) + 'static,
    on_in: impl Fn(&mut V, &ui::MouseDownEvent, &mut Window, &mut ui::Context<V>) + 'static,
    on_fit: impl Fn(&mut V, &ui::MouseDownEvent, &mut Window, &mut ui::Context<V>) + 'static,
    cx: &mut ui::Context<V>,
) -> AnyElement {
    let pct_label = format!("{}%", (zoom * 100.0).round() as i32);
    let shadows = theme.shadows("--affine-toolbar-shadow");

    let button = |id: &'static str, snap_id: &'static str, label: String, width: f32| {
        div()
            .id(id)
            .w(px(width))
            .h(px(ZOOM_BTN_HEIGHT))
            .rounded(px(ZOOM_BTN_RADIUS))
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(12.0))
            .font_weight(ui::FontWeight::MEDIUM)
            .text_color(palette.text_primary)
            .cursor_pointer()
            .hover(|s| s.bg(palette.hover))
            .snapshot(snap_id, Some("chrome.edgeless_zoom"))
            .snapshot_text(label.clone())
            .child(label)
    };

    let mut bar = div()
        .absolute()
        .right(px(ZOOM_BAR_MARGIN))
        .bottom(px(ZOOM_BAR_MARGIN))
        .p(px(ZOOM_BAR_PAD))
        .rounded(px(ZOOM_BAR_RADIUS))
        .bg(palette.panel)
        .border_1()
        .border_color(palette.border)
        .flex()
        .items_center()
        .gap(px(4.0))
        .snapshot("chrome.edgeless_zoom", Some(EDGELESS_VIEWPORT_ID))
        .child(
            button(
                "edgeless-zoom-out",
                "chrome.edgeless_zoom.out",
                "-".into(),
                28.0,
            )
            .on_mouse_down(MouseButton::Left, cx.listener(on_out)),
        )
        .child(
            button(
                "edgeless-zoom-reset",
                "chrome.edgeless_zoom.reset",
                pct_label,
                48.0,
            )
            .on_mouse_down(MouseButton::Left, cx.listener(on_reset)),
        )
        .child(
            button(
                "edgeless-zoom-in",
                "chrome.edgeless_zoom.in",
                "+".into(),
                28.0,
            )
            .on_mouse_down(MouseButton::Left, cx.listener(on_in)),
        )
        .child(
            button(
                "edgeless-zoom-fit",
                "chrome.edgeless_zoom.fit",
                "Fit".into(),
                36.0,
            )
            .on_mouse_down(MouseButton::Left, cx.listener(on_fit)),
        );

    if !shadows.is_empty() {
        bar = bar.shadow(shadows.into());
    }

    bar.into_any_element()
}
