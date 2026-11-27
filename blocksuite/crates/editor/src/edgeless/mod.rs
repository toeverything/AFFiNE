//! Edgeless spatial whiteboard subsystem: camera, paint ordering, canvas rendering,
//! interactive authoring toolbar, hit-testing, overlays, and inline label editor.

mod camera;
mod canvas;
mod canvas_paint;
mod hit_test;
mod label_editor;
mod order;
mod overlay;
mod scene;
mod toolbar;

pub use camera::{EdgelessCamera, WorldRect, bg_grid_gap, parse_xywh};
pub use canvas::{
    EDGELESS_VIEWPORT_ID, EdgelessCanvasState, EdgelessRenderInput, NOTE_CARD_PADDING,
    note_border_radius, note_border_style, note_collapse, note_scale, note_shadow_type, prop_bool,
    prop_f32, resolve_edgeless_color, rotated_bounds, spatial_blocks, world_bounds, world_rect,
};
pub use canvas_paint::build_edgeless_layer;
pub use hit_test::{
    DragItemInitial, EdgelessAuthoringState, EdgelessGesture, HandleKind, SpatialItemInfo,
    SpatialItemKind, normalized_rect, point_in_rotated_rect, resized_rect, rotate_point_around,
};
pub use label_editor::{
    EdgelessInlineEdit, EdgelessLabelEditor, LabelSplice, LabelTarget, ShapeTextStyle, utf16_len,
    utf16_to_byte,
};
pub use order::{Layers, PaintItem};
pub use overlay::{
    build_edgeless_authoring_overlay, label_editor_text_origin, layout_label_editor_paragraph,
};
pub use scene::{PreparedEdgelessScene, collect_frame_children, prepare_edgeless_scene};
pub use toolbar::{
    EdgelessTool, EdgelessToolbarHost, ShapePreset, build_edgeless_toolbar, build_zoom_controls,
};

use canvas::{
    CachedNoteFlow, CachedSurfaces, FRAME_RADIUS, FRAME_TITLE_GAP, FRAME_TITLE_HEIGHT,
    PaintEdgelessText, PaintFrame, PaintNote, ZOOM_BAR_MARGIN, ZOOM_BAR_PAD, ZOOM_BAR_RADIUS,
    ZOOM_BTN_HEIGHT, ZOOM_BTN_RADIUS,
};
