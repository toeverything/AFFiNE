//! Screen-space Edgeless authoring toolbar, shape picker popover, and zoom controls.

use ui::{
    AnyElement, Context, MouseButton, PathBuilder, Window, canvas, div, point, prelude::*, px,
};

use crate::theme::{IconPaint, Palette, PlaygroundTheme};

use super::{
    EDGELESS_VIEWPORT_ID, ZOOM_BAR_MARGIN, ZOOM_BAR_PAD, ZOOM_BAR_RADIUS, ZOOM_BTN_HEIGHT,
    ZOOM_BTN_RADIUS,
};

/// Shape variant selectable in the Edgeless Shape tool subpanel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum ShapePreset {
    #[default]
    Rect,
    Ellipse,
    Diamond,
    Triangle,
    RoundedRect,
}

impl ShapePreset {
    pub const ALL: [Self; 5] = [
        Self::Rect,
        Self::Ellipse,
        Self::Diamond,
        Self::Triangle,
        Self::RoundedRect,
    ];

    pub fn next(self) -> Self {
        let i = Self::ALL.iter().position(|&p| p == self).unwrap_or(0);
        Self::ALL[(i + 1) % Self::ALL.len()]
    }

    pub fn prev(self) -> Self {
        let i = Self::ALL.iter().position(|&p| p == self).unwrap_or(0);
        Self::ALL[(i + Self::ALL.len() - 1) % Self::ALL.len()]
    }

    pub fn as_spec_str(self) -> &'static str {
        match self {
            Self::Rect => "rect",
            Self::Ellipse => "ellipse",
            Self::Diamond => "diamond",
            Self::Triangle => "triangle",
            Self::RoundedRect => "rounded",
        }
    }
}

/// Host callbacks required by the Edgeless creation toolbar.
pub trait EdgelessToolbarHost: 'static + Sized {
    fn edgeless_active_tool(&self) -> EdgelessTool;
    fn edgeless_active_shape_type(&self) -> ShapePreset;
    fn edgeless_toggle_shape_picker(&mut self, window: &mut Window, cx: &mut Context<Self>);
    fn edgeless_select_tool(
        &mut self,
        tool: EdgelessTool,
        window: &mut Window,
        cx: &mut Context<Self>,
    );
}

/// Active tool selected in `chrome.edgeless_toolbar`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum EdgelessTool {
    #[default]
    Select,
    Hand,
    Note,
    Shape(ShapePreset),
    Connector,
    Brush,
    Highlighter,
    Text,
    Frame,
}

impl EdgelessTool {
    pub fn is_shape(self) -> bool {
        matches!(self, Self::Shape(_))
    }
}

/// Animated visual state of the Edgeless Shape tool subpanel (`chrome.edgeless_toolbar.shape_picker`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShapePickerVisualState {
    pub active_shape: ShapePreset,
    /// Closed-form ease-out progress (`0.0` hidden ..= `1.0` fully open).
    pub progress: f32,
    /// `true` while opening or open (interactive from Frame 1); `false` while closing.
    pub interactive: bool,
}

/// Bottom screen-space creation toolbar (`chrome.edgeless_toolbar`).
/// Concentric radii: outer `8px`, padding `4px`, buttons `4px` (`28×28`, `2px` gap).
pub fn build_edgeless_toolbar<V: EdgelessToolbarHost>(
    tool: EdgelessTool,
    shape_picker_state: Option<ShapePickerVisualState>,
    viewport_width: f32,
    palette: &Palette,
    theme: PlaygroundTheme,
    cx: &mut Context<V>,
) -> AnyElement {
    const BAR_MARGIN: f32 = 12.0;
    const BAR_PAD: f32 = 4.0;
    const BAR_RADIUS: f32 = 8.0;
    const BTN_SIZE: f32 = 28.0;
    const BTN_RADIUS: f32 = 4.0;
    const BTN_GAP: f32 = 2.0;

    let shadows = theme.shadows("--affine-toolbar-shadow");
    let tools: [(&'static str, &'static str, &'static str, EdgelessTool); 9] = [
        (
            "edgeless-tool-select",
            "chrome.edgeless_toolbar.select",
            "SelectIcon",
            EdgelessTool::Select,
        ),
        (
            "edgeless-tool-hand",
            "chrome.edgeless_toolbar.hand",
            "HandIcon",
            EdgelessTool::Hand,
        ),
        (
            "edgeless-tool-note",
            "chrome.edgeless_toolbar.note",
            "NoteShadowDuotoneIcon",
            EdgelessTool::Note,
        ),
        (
            "edgeless-tool-shape",
            "chrome.edgeless_toolbar.shape",
            "ShapeIcon",
            EdgelessTool::Shape(ShapePreset::Rect),
        ),
        (
            "edgeless-tool-connector",
            "chrome.edgeless_toolbar.connector",
            "ConnectorEIcon",
            EdgelessTool::Connector,
        ),
        (
            "edgeless-tool-brush",
            "chrome.edgeless_toolbar.brush",
            "PenIcon",
            EdgelessTool::Brush,
        ),
        (
            "edgeless-tool-highlighter",
            "chrome.edgeless_toolbar.highlighter",
            "BrushIcon",
            EdgelessTool::Highlighter,
        ),
        (
            "edgeless-tool-text",
            "chrome.edgeless_toolbar.text",
            "AddTextIcon",
            EdgelessTool::Text,
        ),
        (
            "edgeless-tool-frame",
            "chrome.edgeless_toolbar.frame",
            "FrameIcon",
            EdgelessTool::Frame,
        ),
    ];

    let bar_w = tools.len() as f32 * BTN_SIZE + (tools.len() - 1) as f32 * BTN_GAP + 2.0 * BAR_PAD;
    let bar_left = ((viewport_width - bar_w) * 0.5).max(8.0).round();

    let mut bar = div()
        .absolute()
        .left(px(bar_left))
        .bottom(px(BAR_MARGIN))
        .p(px(BAR_PAD))
        .rounded(px(BAR_RADIUS))
        .bg(palette.panel)
        .border_1()
        .border_color(palette.border)
        .flex()
        .items_center()
        .gap(px(BTN_GAP))
        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
        .snapshot("chrome.edgeless_toolbar", Some(EDGELESS_VIEWPORT_ID));

    for (el_id, snap_id, icon_name, target_tool) in tools {
        let active = match (tool, target_tool) {
            (EdgelessTool::Shape(_), EdgelessTool::Shape(_)) => true,
            (a, b) => a == b,
        };
        let icon_color = if active { palette.brand } else { palette.icon };
        let mut btn = div()
            .id(el_id)
            .w(px(BTN_SIZE))
            .h(px(BTN_SIZE))
            .rounded(px(BTN_RADIUS))
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer()
            .hover(|s| s.bg(palette.hover))
            .snapshot(snap_id, Some("chrome.edgeless_toolbar"))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, _, window, cx| {
                    cx.stop_propagation();
                    let chosen = match target_tool {
                        EdgelessTool::Shape(_) => {
                            if this.edgeless_active_tool().is_shape() {
                                this.edgeless_toggle_shape_picker(window, cx);
                                return;
                            }
                            EdgelessTool::Shape(this.edgeless_active_shape_type())
                        }
                        other => other,
                    };
                    this.edgeless_select_tool(chosen, window, cx);
                }),
            )
            .child(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, cx| {
                        IconPaint::named(icon_name).paint(bounds, icon_color, window, cx);
                    },
                )
                .w(px(18.0))
                .h(px(18.0)),
            );
        if active {
            btn = btn.bg(palette.brand.opacity(0.14));
        }
        bar = bar.child(btn);
    }

    if !shadows.is_empty() {
        bar = bar.shadow(shadows.clone().into());
    }

    // When the Shape subpanel is open or animating in/out, mount the 5-shape sub-pill above the bar.
    if let Some(picker) = shape_picker_state {
        const SLIDE_OFFSET_PX: f32 = 12.0;
        let clamped = picker.progress.clamp(0.0, 1.0);
        let opacity = if picker.interactive {
            clamped.max(0.01)
        } else {
            clamped
        };
        let target_bottom = BAR_MARGIN + BTN_SIZE + 2.0 * BAR_PAD + 8.0;
        let bottom = (target_bottom - (1.0 - clamped) * SLIDE_OFFSET_PX).round();

        let variants: [(
            &'static str,
            &'static str,
            Option<&'static str>,
            ShapePreset,
        ); 5] = [
            (
                "shape-rect",
                "chrome.edgeless_toolbar.shape.rect",
                Some("SquareIcon"),
                ShapePreset::Rect,
            ),
            (
                "shape-ellipse",
                "chrome.edgeless_toolbar.shape.ellipse",
                None,
                ShapePreset::Ellipse,
            ),
            (
                "shape-diamond",
                "chrome.edgeless_toolbar.shape.diamond",
                Some("DiamondIcon"),
                ShapePreset::Diamond,
            ),
            (
                "shape-triangle",
                "chrome.edgeless_toolbar.shape.triangle",
                Some("TriangleIcon"),
                ShapePreset::Triangle,
            ),
            (
                "shape-rounded-rect",
                "chrome.edgeless_toolbar.shape.rounded_rect",
                Some("RoundedRectangleIcon"),
                ShapePreset::RoundedRect,
            ),
        ];
        let sub_w = variants.len() as f32 * BTN_SIZE
            + (variants.len() - 1) as f32 * BTN_GAP
            + 2.0 * BAR_PAD;
        let sub_left = ((viewport_width - sub_w) * 0.5).max(8.0).round();
        let mut sub = div()
            .absolute()
            .left(px(sub_left))
            .bottom(px(bottom))
            .p(px(BAR_PAD))
            .rounded(px(BAR_RADIUS))
            .bg(palette.panel)
            .border_1()
            .border_color(palette.border)
            .flex()
            .items_center()
            .gap(px(BTN_GAP))
            .opacity(opacity)
            .snapshot(
                "chrome.edgeless_toolbar.shape_picker",
                Some(EDGELESS_VIEWPORT_ID),
            );
        if picker.interactive {
            sub = sub.on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation());
        }
        if !shadows.is_empty() {
            sub = sub.shadow(shadows.into());
        }
        for (el_id, snap_id, icon_name, shape_kind) in variants {
            let active = picker.active_shape == shape_kind;
            let icon_color = if active { palette.brand } else { palette.icon };
            let mut btn = div()
                .id(el_id)
                .w(px(BTN_SIZE))
                .h(px(BTN_SIZE))
                .rounded(px(BTN_RADIUS))
                .flex()
                .items_center()
                .justify_center()
                .snapshot(snap_id, Some("chrome.edgeless_toolbar.shape_picker"))
                .child(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, window, cx| {
                            if let Some(name) = icon_name {
                                IconPaint::named(name).paint(bounds, icon_color, window, cx);
                            } else {
                                paint_ellipse_icon(bounds, icon_color, window);
                            }
                        },
                    )
                    .w(px(16.0))
                    .h(px(16.0)),
                );
            if picker.interactive {
                btn = btn
                    .cursor_pointer()
                    .hover(|s| s.bg(palette.hover))
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, _, window, cx| {
                            cx.stop_propagation();
                            this.edgeless_select_tool(EdgelessTool::Shape(shape_kind), window, cx);
                        }),
                    );
            }
            if active {
                btn = btn.bg(palette.brand.opacity(0.14));
            }
            sub = sub.child(btn);
        }
        return div()
            .absolute()
            .inset_0()
            .child(sub)
            .child(bar)
            .into_any_element();
    }

    bar.into_any_element()
}

fn paint_ellipse_icon(bounds: ui::Bounds<ui::Pixels>, color: ui::Hsla, window: &mut Window) {
    const K: f32 = 0.552_284_75;
    let cx = f32::from(bounds.origin.x) + f32::from(bounds.size.width) * 0.5;
    let cy = f32::from(bounds.origin.y) + f32::from(bounds.size.height) * 0.5;
    let rx = f32::from(bounds.size.width) * 0.38;
    let ry = f32::from(bounds.size.height) * 0.38;
    let mut pb = PathBuilder::stroke(px(1.25));
    pb.move_to(point(px(cx), px(cy - ry)));
    pb.cubic_bezier_to(
        point(px(cx + rx), px(cy)),
        point(px(cx + rx * K), px(cy - ry)),
        point(px(cx + rx), px(cy - ry * K)),
    );
    pb.cubic_bezier_to(
        point(px(cx), px(cy + ry)),
        point(px(cx + rx), px(cy + ry * K)),
        point(px(cx + rx * K), px(cy + ry)),
    );
    pb.cubic_bezier_to(
        point(px(cx - rx), px(cy)),
        point(px(cx - rx * K), px(cy + ry)),
        point(px(cx - rx), px(cy + ry * K)),
    );
    pb.cubic_bezier_to(
        point(px(cx), px(cy - ry)),
        point(px(cx - rx), px(cy - ry * K)),
        point(px(cx - rx * K), px(cy - ry)),
    );
    pb.close();
    if let Ok(path) = pb.build() {
        window.paint_path(path, color);
    }
}

/// Build the bottom-right screen-space zoom control bar (`chrome.edgeless_zoom`).
/// On narrow viewports (`viewport_width < 660.0`) when `toolbar_visible` is `true`, stacks cleanly
/// above `chrome.edgeless_toolbar` so the two screen-space bars never overlap or clip.
#[allow(clippy::too_many_arguments)]
pub fn build_zoom_controls<V: 'static>(
    zoom: f32,
    viewport_width: f32,
    toolbar_visible: bool,
    touch_mode: bool,
    palette: &Palette,
    theme: PlaygroundTheme,
    on_out: impl Fn(&mut V, &ui::ClickEvent, &mut Window, &mut ui::Context<V>) + 'static,
    on_reset: impl Fn(&mut V, &ui::ClickEvent, &mut Window, &mut ui::Context<V>) + 'static,
    on_in: impl Fn(&mut V, &ui::ClickEvent, &mut Window, &mut ui::Context<V>) + 'static,
    on_fit: impl Fn(&mut V, &ui::ClickEvent, &mut Window, &mut ui::Context<V>) + 'static,
    cx: &mut ui::Context<V>,
) -> AnyElement {
    let pct_label = format!("{}%", (zoom * 100.0).round() as i32);
    let shadows = theme.shadows("--affine-toolbar-shadow");
    let btn_h = if touch_mode { 44.0 } else { ZOOM_BTN_HEIGHT };
    let (w_step, w_reset, w_fit) = if touch_mode {
        (44.0, 56.0, 44.0)
    } else {
        (28.0, 48.0, 36.0)
    };

    let button = |id: &'static str, snap_id: &'static str, label: String, width: f32| {
        div()
            .id(id)
            .w(px(width))
            .h(px(btn_h))
            .rounded(px(ZOOM_BTN_RADIUS))
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(if touch_mode { 14.0 } else { 12.0 }))
            .font_weight(ui::FontWeight::MEDIUM)
            .text_color(palette.text_primary)
            .cursor_pointer()
            .hover(|s| s.bg(palette.hover))
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .snapshot(snap_id, Some("chrome.edgeless_zoom"))
            .snapshot_text(label.clone())
            .child(label)
    };

    let zoom_bottom = if toolbar_visible && viewport_width < 660.0 {
        ZOOM_BAR_MARGIN + ZOOM_BTN_HEIGHT + 2.0 * ZOOM_BAR_PAD + 8.0
    } else {
        ZOOM_BAR_MARGIN
    };
    let mut bar = div()
        .absolute()
        .right(px(ZOOM_BAR_MARGIN))
        .bottom(px(zoom_bottom))
        .p(px(ZOOM_BAR_PAD))
        .rounded(px(ZOOM_BAR_RADIUS))
        .bg(palette.panel)
        .border_1()
        .border_color(palette.border)
        .flex()
        .items_center()
        .gap(px(4.0))
        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
        .snapshot("chrome.edgeless_zoom", Some(EDGELESS_VIEWPORT_ID))
        .child(
            button(
                "edgeless-zoom-out",
                "chrome.edgeless_zoom.out",
                "-".into(),
                w_step,
            )
            .on_click(cx.listener(on_out)),
        )
        .child(
            button(
                "edgeless-zoom-reset",
                "chrome.edgeless_zoom.reset",
                pct_label,
                w_reset,
            )
            .on_click(cx.listener(on_reset)),
        )
        .child(
            button(
                "edgeless-zoom-in",
                "chrome.edgeless_zoom.in",
                "+".into(),
                w_step,
            )
            .on_click(cx.listener(on_in)),
        )
        .child(
            button(
                "edgeless-zoom-fit",
                "chrome.edgeless_zoom.fit",
                "Fit".into(),
                w_fit,
            )
            .on_click(cx.listener(on_fit)),
        );

    if !shadows.is_empty() {
        bar = bar.shadow(shadows.into());
    }

    bar.into_any_element()
}
