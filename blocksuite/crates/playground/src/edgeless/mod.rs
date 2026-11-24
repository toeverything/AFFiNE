//! Edgeless spatial whiteboard subsystem: camera, paint ordering, canvas rendering,
//! interactive authoring toolbar, hit-testing, overlays, inline IME editing, and gestures.

mod camera;
mod canvas;
mod canvas_paint;
mod commands;
mod commit;
mod gestures;
mod hit_test;
mod inline_edit;
mod label_editor;
mod order;
mod overlay;
mod scene;
mod toolbar;

pub use camera::{EdgelessCamera, WorldRect, bg_grid_gap, parse_xywh};
pub use canvas::{
    EDGELESS_VIEWPORT_ID, EdgelessCanvasState, EdgelessRenderInput, NOTE_CARD_PADDING,
    resolve_edgeless_color,
};
pub use canvas_paint::build_edgeless_layer;
pub use hit_test::EdgelessAuthoringState;
pub use label_editor::{EdgelessInlineEdit, EdgelessLabelEditor};
pub use toolbar::{EdgelessTool, build_edgeless_toolbar, build_zoom_controls};

use canvas::{
    CachedNoteFlow, CachedSurfaces, FRAME_RADIUS, FRAME_TITLE_GAP, FRAME_TITLE_HEIGHT,
    PaintEdgelessText, PaintFrame, PaintNote, ZOOM_BAR_MARGIN, ZOOM_BAR_PAD, ZOOM_BAR_RADIUS,
    ZOOM_BTN_HEIGHT, ZOOM_BTN_RADIUS, note_border_radius, note_border_style, note_collapse,
    note_scale, note_shadow_type, prop_bool, prop_f32, rotated_bounds, spatial_blocks,
    world_bounds, world_rect,
};
use commands::{collect_frame_children, find_block, find_surface_element, max_spatial_index};
use hit_test::{
    DragItemInitial, EdgelessGesture, HandleKind, SpatialItemInfo, SpatialItemKind,
    normalized_rect, point_in_rotated_rect, resized_rect, rotate_point_around,
};
use label_editor::{LabelSplice, LabelTarget, utf16_len, utf16_to_byte};
use order::{Layers, PaintItem};
use overlay::{build_edgeless_authoring_overlay, layout_label_editor_paragraph};
use scene::{PreparedEdgelessScene, prepare_edgeless_scene};
