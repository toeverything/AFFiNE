//! Floating property toolbar (`Element Toolbar` MVP-1) above selected Edgeless elements
//! (`Shape`, `Note`, `Connector`, `Text`, `Frame`).

use blocksuite_playground_doc::read::{
    BlockContent, PageSnapshot, ShapeStyle, StrokeStyle, SurfaceElementKind,
};
use ui::{
    AnyElement, BorderStyle, Bounds, Context, Corners, Edges, FontWeight, Hsla, MouseButton,
    SharedString, Window, canvas, div, point, prelude::*, px, size,
};

use crate::{
    block_flow::FlowRect,
    overlays::{Placement, place_popover},
    theme::{IconPaint, Palette, PlaygroundTheme, TYPOGRAPHY},
};

use super::{
    EDGELESS_VIEWPORT_ID, EdgelessAuthoringState, EdgelessCamera, SpatialItemKind,
    resolve_edgeless_color,
};

/// BlockSuite standard shape/note/frame fill palette tokens.
pub const FILL_PALETTE: [(&str, &str); 6] = [
    ("yellow", "--affine-palette-shape-yellow"),
    ("blue", "--affine-palette-shape-blue"),
    ("green", "--affine-palette-shape-green"),
    ("red", "--affine-palette-shape-red"),
    ("purple", "--affine-palette-shape-purple"),
    ("white", "--affine-palette-shape-white"),
];

/// BlockSuite standard line/stroke/text palette tokens.
pub const STROKE_PALETTE: [(&str, &str); 6] = [
    ("black", "--affine-palette-line-black"),
    ("blue", "--affine-palette-line-blue"),
    ("green", "--affine-palette-line-green"),
    ("red", "--affine-palette-line-red"),
    ("purple", "--affine-palette-line-purple"),
    ("orange", "--affine-palette-line-orange"),
];

/// Supported stroke width tiers in world pixels.
pub const STROKE_WIDTH_TIERS: [f64; 4] = [2.0, 4.0, 6.0, 8.0];
/// Supported font size tiers in world pixels.
pub const FONT_SIZE_TIERS: [f64; 4] = [16.0, 20.0, 24.0, 32.0];

/// Which color swatch picker sub-pill is currently open on the element toolbar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ElementColorSlot {
    Fill,
    Stroke,
}

/// Property mutation or sub-picker toggle dispatched from `chrome.edgeless_element_toolbar`.
#[derive(Clone, Debug, PartialEq)]
pub enum EdgelessElementAction {
    ToggleColorPicker(ElementColorSlot),
    SetFillColor(String),
    SetStrokeColor(String),
    SetStrokeStyle(StrokeStyle),
    SetStrokeWidth(f64),
    ToggleRoughStyle,
    SetFontSize(f64),
}

/// Host callback for executing Edgeless element toolbar actions.
pub trait EdgelessElementToolbarHost: 'static + Sized {
    fn edgeless_element_action(
        &mut self,
        action: EdgelessElementAction,
        window: &mut Window,
        cx: &mut Context<Self>,
    );
}

/// Summarized capabilities and representative active values of the current Edgeless selection.
#[derive(Clone, Debug)]
pub struct ElementToolbarSummary {
    pub has_fill: bool,
    pub has_stroke: bool,
    pub has_stroke_style: bool,
    pub has_rough_style: bool,
    pub has_font_size: bool,
    pub fill_color: Hsla,
    pub stroke_color: Hsla,
    pub stroke_style: StrokeStyle,
    pub stroke_width: f64,
    pub scribbled: bool,
    pub font_size: f64,
}

fn resolve_color_value(
    value: &blocksuite_playground_doc::read::ColorValue,
    theme: PlaygroundTheme,
) -> Option<Hsla> {
    let raw = match value {
        blocksuite_playground_doc::read::ColorValue::Single(s) => s.as_str(),
        blocksuite_playground_doc::read::ColorValue::Themed { light, dark } => match theme {
            PlaygroundTheme::Light => light.as_str(),
            PlaygroundTheme::Dark => dark.as_str(),
        },
    };
    if raw.eq_ignore_ascii_case("transparent") || raw.is_empty() {
        return Some(Hsla::transparent_black());
    }
    theme.css_color(raw)
}

/// Inspect the current Edgeless selection and summarize which toolbar controls apply.
pub fn summarize_element_toolbar(
    snapshot: &PageSnapshot,
    authoring: &EdgelessAuthoringState,
    theme: PlaygroundTheme,
    palette: &Palette,
) -> Option<ElementToolbarSummary> {
    if authoring.selection.is_empty() {
        return None;
    }
    let mut has_fill = false;
    let mut has_stroke = false;
    let mut has_stroke_style = false;
    let mut has_rough_style = false;
    let mut has_font_size = false;
    let mut fill_color = theme
        .css_var("--affine-palette-shape-yellow")
        .unwrap_or(palette.brand);
    let mut stroke_color = theme
        .css_var("--affine-palette-line-black")
        .unwrap_or(palette.text_primary);
    let mut stroke_style = StrokeStyle::Solid;
    let mut stroke_width = 2.0;
    let mut scribbled = false;
    let mut font_size = 20.0;
    let mut got_fill = false;
    let mut got_stroke = false;
    let mut got_style = false;
    let mut got_rough = false;
    let mut got_font = false;

    for item in authoring
        .painted_items
        .iter()
        .filter(|i| authoring.selection.contains(&i.id))
    {
        match item.kind {
            SpatialItemKind::Shape => {
                has_fill = true;
                has_stroke = true;
                has_stroke_style = true;
                has_rough_style = true;
                has_font_size = true;
            }
            SpatialItemKind::Connector => {
                has_stroke = true;
                has_stroke_style = true;
                has_rough_style = true;
                has_font_size = true;
            }
            SpatialItemKind::SurfaceText | SpatialItemKind::EdgelessText => {
                has_stroke = true;
                has_font_size = true;
            }
            SpatialItemKind::Note | SpatialItemKind::Frame => {
                has_fill = true;
            }
            _ => continue,
        }
        if let Some(root) = snapshot.root.as_ref() {
            if item.kind.is_block() {
                if let Some(node) = snapshot.block(&item.id) {
                    if matches!(item.kind, SpatialItemKind::Note | SpatialItemKind::Frame)
                        && !got_fill
                        && let Some(bg) = node.props.get("prop:background")
                        && let Some(c) = resolve_edgeless_color(bg, theme)
                    {
                        fill_color = c;
                        got_fill = true;
                    }
                    if item.kind == SpatialItemKind::EdgelessText {
                        if !got_stroke
                            && let Some(col) = node.props.get("prop:color")
                            && let Some(c) = resolve_edgeless_color(col, theme)
                        {
                            stroke_color = c;
                            got_stroke = true;
                        }
                        if !got_font
                            && let Some(fs) =
                                node.props.get("prop:fontSize").and_then(|v| v.as_f64())
                        {
                            font_size = fs;
                            got_font = true;
                        }
                    }
                }
            } else {
                for node in root.walk() {
                    let BlockContent::Surface { elements, .. } = &node.content else {
                        continue;
                    };
                    if let Some(el) = elements.iter().find(|e| e.id == item.id) {
                        match &el.kind {
                            SurfaceElementKind::Shape(s) => {
                                if !got_fill {
                                    if let Some(c) = resolve_color_value(&s.fill_color, theme) {
                                        fill_color = c;
                                    }
                                    got_fill = true;
                                }
                                if !got_stroke {
                                    if let Some(c) = resolve_color_value(&s.stroke_color, theme) {
                                        stroke_color = c;
                                    }
                                    got_stroke = true;
                                }
                                if !got_style {
                                    stroke_style = s.stroke_style;
                                    stroke_width = s.stroke_width;
                                    got_style = true;
                                }
                                if !got_rough {
                                    scribbled = s.shape_style == ShapeStyle::Scribbled;
                                    got_rough = true;
                                }
                                if !got_font {
                                    font_size = s.font_size;
                                    got_font = true;
                                }
                            }
                            SurfaceElementKind::Connector(c) => {
                                if !got_stroke {
                                    if let Some(col) = resolve_color_value(&c.stroke, theme) {
                                        stroke_color = col;
                                    }
                                    got_stroke = true;
                                }
                                if !got_style {
                                    stroke_style = c.stroke_style;
                                    stroke_width = c.stroke_width;
                                    got_style = true;
                                }
                                if !got_rough {
                                    scribbled = c.rough;
                                    got_rough = true;
                                }
                                if !got_font {
                                    font_size = c.label_style.font_size;
                                    got_font = true;
                                }
                            }
                            SurfaceElementKind::Text(t) => {
                                if !got_stroke {
                                    if let Some(col) = resolve_color_value(&t.color, theme) {
                                        stroke_color = col;
                                    }
                                    got_stroke = true;
                                }
                                if !got_font {
                                    font_size = t.font_size;
                                    got_font = true;
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    if !(has_fill || has_stroke || has_stroke_style || has_rough_style || has_font_size) {
        return None;
    }
    Some(ElementToolbarSummary {
        has_fill,
        has_stroke,
        has_stroke_style,
        has_rough_style,
        has_font_size,
        fill_color,
        stroke_color,
        stroke_style,
        stroke_width,
        scribbled,
        font_size,
    })
}

fn next_stroke_style(current: StrokeStyle) -> StrokeStyle {
    match current {
        StrokeStyle::Solid => StrokeStyle::Dash,
        StrokeStyle::Dash => StrokeStyle::None,
        StrokeStyle::None => StrokeStyle::Solid,
    }
}

fn next_tier(current: f64, tiers: &[f64]) -> f64 {
    tiers
        .iter()
        .copied()
        .find(|&t| t > current + 0.5)
        .unwrap_or(tiers[0])
}

/// Build the floating Edgeless `Element Toolbar` anchored above the selected bounding box
/// (flipping below when near the top edge of the viewport).
#[allow(clippy::too_many_arguments)]
pub fn build_edgeless_element_toolbar<V: EdgelessElementToolbarHost>(
    snapshot: &PageSnapshot,
    authoring: &EdgelessAuthoringState,
    camera: EdgelessCamera,
    viewport_width: f32,
    viewport_height: f32,
    open_color_picker: Option<ElementColorSlot>,
    palette: &Palette,
    theme: PlaygroundTheme,
    cx: &mut Context<V>,
) -> Option<AnyElement> {
    if authoring.inline_edit.is_some() || authoring.gesture.is_some() {
        return None;
    }
    let summary = summarize_element_toolbar(snapshot, authoring, theme, palette)?;
    let sel_box = authoring.selection_world_box()?;
    let vp_origin = point(px(0.0), px(0.0));
    let tl = camera.world_to_screen(point(px(sel_box.x), px(sel_box.y)), vp_origin);
    let br = camera.world_to_screen(point(px(sel_box.right()), px(sel_box.bottom())), vp_origin);
    let has_rotate = authoring
        .single_selected()
        .is_some_and(|s| s.kind.is_rotatable());
    let top_pad = if has_rotate { 28.0 } else { 0.0 };
    let anchor = FlowRect::new(
        f32::from(tl.x),
        f32::from(tl.y) - top_pad,
        (f32::from(br.x) - f32::from(tl.x)).max(2.0),
        (f32::from(br.y) - f32::from(tl.y)).max(2.0) + top_pad,
    );

    const PAD: f32 = 4.0;
    const BTN: f32 = 28.0;
    const WIDE_BTN: f32 = 34.0;
    const GAP: f32 = 2.0;
    const RADIUS: f32 = 8.0;
    const BTN_RADIUS: f32 = 4.0;

    let mut content_w = 2.0 * PAD + 2.0;
    let mut item_count = 0usize;
    let mut add_w = |w: f32| {
        if item_count > 0 {
            content_w += GAP;
        }
        content_w += w;
        item_count += 1;
    };
    if summary.has_fill {
        add_w(BTN);
    }
    if summary.has_stroke {
        add_w(BTN);
    }
    if summary.has_stroke_style {
        add_w(BTN);
        add_w(WIDE_BTN);
    }
    if summary.has_rough_style {
        add_w(BTN);
    }
    if summary.has_font_size {
        add_w(WIDE_BTN);
    }
    let bar_w = content_w.ceil();
    let bar_h = BTN + 2.0 * PAD + 2.0;
    let viewport = FlowRect::new(0.0, 0.0, viewport_width, viewport_height);
    let placed = place_popover(
        anchor,
        (bar_w, bar_h),
        viewport,
        Placement::Above,
        12.0,
        8.0,
    );
    let shadows = theme.shadows("--affine-toolbar-shadow");
    let hover_bg = palette.hover;

    let mut bar = div()
        .id("edgeless-element-toolbar")
        .absolute()
        .left(px(placed.rect.x))
        .top(px(placed.rect.y))
        .p(px(PAD))
        .rounded(px(RADIUS))
        .bg(palette.panel)
        .border_1()
        .border_color(palette.border)
        .flex()
        .items_center()
        .gap(px(GAP))
        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
        .snapshot(
            "chrome.edgeless_element_toolbar",
            Some(EDGELESS_VIEWPORT_ID),
        );
    if !shadows.is_empty() {
        bar = bar.shadow(shadows.clone().into());
    }

    if summary.has_fill {
        let active = open_color_picker == Some(ElementColorSlot::Fill);
        let swatch_color = summary.fill_color;
        let border_c = palette.border;
        bar = bar.child(
            div()
                .id("el-tb-fill")
                .w(px(BTN))
                .h(px(BTN))
                .rounded(px(BTN_RADIUS))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(move |s| s.bg(hover_bg))
                .when(active, |el| el.bg(palette.brand.opacity(0.14)))
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _, window, cx| {
                        cx.stop_propagation();
                        this.edgeless_element_action(
                            EdgelessElementAction::ToggleColorPicker(ElementColorSlot::Fill),
                            window,
                            cx,
                        );
                    }),
                )
                .snapshot(
                    "chrome.edgeless_element_toolbar.fill",
                    Some("chrome.edgeless_element_toolbar"),
                )
                .snapshot_text("Fill")
                .child(
                    div()
                        .w(px(14.0))
                        .h(px(14.0))
                        .rounded(px(7.0))
                        .bg(swatch_color)
                        .border_1()
                        .border_color(border_c),
                ),
        );
    }

    if summary.has_stroke {
        let active = open_color_picker == Some(ElementColorSlot::Stroke);
        let ring_color = summary.stroke_color;
        bar = bar.child(
            div()
                .id("el-tb-stroke")
                .w(px(BTN))
                .h(px(BTN))
                .rounded(px(BTN_RADIUS))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(move |s| s.bg(hover_bg))
                .when(active, |el| el.bg(palette.brand.opacity(0.14)))
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _, window, cx| {
                        cx.stop_propagation();
                        this.edgeless_element_action(
                            EdgelessElementAction::ToggleColorPicker(ElementColorSlot::Stroke),
                            window,
                            cx,
                        );
                    }),
                )
                .snapshot(
                    "chrome.edgeless_element_toolbar.stroke",
                    Some("chrome.edgeless_element_toolbar"),
                )
                .snapshot_text("Stroke")
                .child(
                    div()
                        .w(px(14.0))
                        .h(px(14.0))
                        .rounded(px(7.0))
                        .border_2()
                        .border_color(ring_color),
                ),
        );
    }

    if summary.has_stroke_style {
        let style_now = summary.stroke_style;
        let next_style = next_stroke_style(style_now);
        let style_label = match style_now {
            StrokeStyle::Solid => "Solid",
            StrokeStyle::Dash => "Dash",
            StrokeStyle::None => "None",
        };
        let icon_color = palette.icon;
        bar = bar.child(
            div()
                .id("el-tb-stroke-style")
                .w(px(BTN))
                .h(px(BTN))
                .rounded(px(BTN_RADIUS))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(move |s| s.bg(hover_bg))
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(move |this, _, window, cx| {
                        cx.stop_propagation();
                        this.edgeless_element_action(
                            EdgelessElementAction::SetStrokeStyle(next_style),
                            window,
                            cx,
                        );
                    }),
                )
                .snapshot(
                    "chrome.edgeless_element_toolbar.stroke_style",
                    Some("chrome.edgeless_element_toolbar"),
                )
                .snapshot_text(style_label)
                .child(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, window, _| {
                            let x0 = f32::from(bounds.origin.x) + 2.0;
                            let w = (f32::from(bounds.size.width) - 4.0).max(4.0);
                            let cy =
                                f32::from(bounds.origin.y) + f32::from(bounds.size.height) * 0.5;
                            match style_now {
                                StrokeStyle::Solid => {
                                    window.paint_quad(ui::fill(
                                        Bounds::new(
                                            point(px(x0), px(cy - 1.0)),
                                            size(px(w), px(2.0)),
                                        ),
                                        icon_color,
                                    ));
                                }
                                StrokeStyle::Dash => {
                                    for i in 0..3 {
                                        let seg_w = 3.0;
                                        let sx = x0 + i as f32 * 5.0;
                                        window.paint_quad(ui::fill(
                                            Bounds::new(
                                                point(px(sx), px(cy - 1.0)),
                                                size(px(seg_w), px(2.0)),
                                            ),
                                            icon_color,
                                        ));
                                    }
                                }
                                StrokeStyle::None => {
                                    window.paint_quad(ui::quad(
                                        Bounds::new(
                                            point(px(x0 + 2.0), px(cy - 5.0)),
                                            size(px(10.0), px(10.0)),
                                        ),
                                        Corners::all(px(5.0)),
                                        ui::transparent_black(),
                                        Edges::all(px(1.25)),
                                        icon_color.opacity(0.5),
                                        BorderStyle::Dashed,
                                    ));
                                }
                            }
                        },
                    )
                    .w(px(18.0))
                    .h(px(16.0)),
                ),
        );

        let next_w = next_tier(summary.stroke_width, &STROKE_WIDTH_TIERS);
        let width_label = format!("{}px", summary.stroke_width.round() as i32);
        bar = bar.child(
            div()
                .id("el-tb-stroke-width")
                .w(px(WIDE_BTN))
                .h(px(BTN))
                .rounded(px(BTN_RADIUS))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(TYPOGRAPHY.font_xs_px))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_primary)
                .cursor_pointer()
                .hover(move |s| s.bg(hover_bg))
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(move |this, _, window, cx| {
                        cx.stop_propagation();
                        this.edgeless_element_action(
                            EdgelessElementAction::SetStrokeWidth(next_w),
                            window,
                            cx,
                        );
                    }),
                )
                .snapshot(
                    "chrome.edgeless_element_toolbar.stroke_width",
                    Some("chrome.edgeless_element_toolbar"),
                )
                .snapshot_text(width_label.clone())
                .child(width_label),
        );
    }

    if summary.has_rough_style {
        let scribbled = summary.scribbled;
        let icon_name = if scribbled { "PenIcon" } else { "SquareIcon" };
        let icon_color = if scribbled {
            palette.brand
        } else {
            palette.icon
        };
        let label = if scribbled { "Scribbled" } else { "General" };
        bar = bar.child(
            div()
                .id("el-tb-rough")
                .w(px(BTN))
                .h(px(BTN))
                .rounded(px(BTN_RADIUS))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(move |s| s.bg(hover_bg))
                .when(scribbled, |el| el.bg(palette.brand.opacity(0.14)))
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _, window, cx| {
                        cx.stop_propagation();
                        this.edgeless_element_action(
                            EdgelessElementAction::ToggleRoughStyle,
                            window,
                            cx,
                        );
                    }),
                )
                .snapshot(
                    "chrome.edgeless_element_toolbar.rough_style",
                    Some("chrome.edgeless_element_toolbar"),
                )
                .snapshot_text(label)
                .child(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, window, cx| {
                            IconPaint::named(icon_name).paint(bounds, icon_color, window, cx);
                        },
                    )
                    .w(px(16.0))
                    .h(px(16.0)),
                ),
        );
    }

    if summary.has_font_size {
        let next_fs = next_tier(summary.font_size, &FONT_SIZE_TIERS);
        let fs_label = format!("{}px", summary.font_size.round() as i32);
        bar = bar.child(
            div()
                .id("el-tb-font-size")
                .w(px(WIDE_BTN))
                .h(px(BTN))
                .rounded(px(BTN_RADIUS))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(TYPOGRAPHY.font_xs_px))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_primary)
                .cursor_pointer()
                .hover(move |s| s.bg(hover_bg))
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(move |this, _, window, cx| {
                        cx.stop_propagation();
                        this.edgeless_element_action(
                            EdgelessElementAction::SetFontSize(next_fs),
                            window,
                            cx,
                        );
                    }),
                )
                .snapshot(
                    "chrome.edgeless_element_toolbar.font_size",
                    Some("chrome.edgeless_element_toolbar"),
                )
                .snapshot_text(fs_label.clone())
                .child(fs_label),
        );
    }

    if let Some(slot) = open_color_picker {
        let swatches = match slot {
            ElementColorSlot::Fill => &FILL_PALETTE,
            ElementColorSlot::Stroke => &STROKE_PALETTE,
        };
        let sw_w =
            swatches.len() as f32 * BTN + (swatches.len() - 1) as f32 * GAP + 2.0 * PAD + 2.0;
        let sw_h = BTN + 2.0 * PAD + 2.0;
        let sw_placed = place_popover(
            placed.rect,
            (sw_w, sw_h),
            viewport,
            Placement::Above,
            6.0,
            8.0,
        );
        let mut picker = div()
            .id("edgeless-element-color-picker")
            .absolute()
            .left(px(sw_placed.rect.x))
            .top(px(sw_placed.rect.y))
            .p(px(PAD))
            .rounded(px(RADIUS))
            .bg(palette.panel)
            .border_1()
            .border_color(palette.border)
            .flex()
            .items_center()
            .gap(px(GAP))
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .snapshot(
                "chrome.edgeless_element_toolbar.color_picker",
                Some(EDGELESS_VIEWPORT_ID),
            );
        if !shadows.is_empty() {
            picker = picker.shadow(shadows.into());
        }
        let border_c = palette.border;
        for (name, token) in swatches {
            let color = theme.css_var(token).unwrap_or(palette.brand);
            let token_str = (*token).to_string();
            let snap_id =
                SharedString::from(format!("chrome.edgeless_element_toolbar.swatch.{name}"));
            picker = picker.child(
                div()
                    .id(SharedString::from(format!("el-swatch-{name}")))
                    .w(px(BTN))
                    .h(px(BTN))
                    .rounded(px(BTN_RADIUS))
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .hover(move |s| s.bg(hover_bg))
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, _, window, cx| {
                            cx.stop_propagation();
                            let action = match slot {
                                ElementColorSlot::Fill => {
                                    EdgelessElementAction::SetFillColor(token_str.clone())
                                }
                                ElementColorSlot::Stroke => {
                                    EdgelessElementAction::SetStrokeColor(token_str.clone())
                                }
                            };
                            this.edgeless_element_action(action, window, cx);
                        }),
                    )
                    .snapshot(
                        snap_id,
                        Some("chrome.edgeless_element_toolbar.color_picker"),
                    )
                    .snapshot_text(*name)
                    .child(
                        div()
                            .w(px(16.0))
                            .h(px(16.0))
                            .rounded(px(8.0))
                            .bg(color)
                            .border_1()
                            .border_color(border_c),
                    ),
            );
        }
        return Some(
            div()
                .absolute()
                .inset_0()
                .child(picker)
                .child(bar)
                .into_any_element(),
        );
    }

    Some(bar.into_any_element())
}
