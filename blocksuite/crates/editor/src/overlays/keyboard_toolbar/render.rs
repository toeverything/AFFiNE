//! Painting for `KeyboardToolbar` strip and its docked bottom tool panels
//! (`+` 8-group insert panel, `Turn into` panel, and 9-color `Highlight` panel).

use ui::{AnyElement, ClickEvent, Context, FontWeight, Hsla, SharedString, div, prelude::*, px};

use crate::{
    TOPBAR_HEIGHT,
    block_flow::FlowRect,
    overlays::{
        MarkState, OverlayEvent, OverlayHost, OverlayScene, Overlays,
        paint_page::{emit, icon, place},
    },
    theme::{Palette, TYPOGRAPHY},
};

use super::{
    DEFAULT_KEYBOARD_TOOLBAR_ITEMS, HighlightColor, KEYBOARD_TOOL_PANEL_HEIGHT,
    KEYBOARD_TOOLBAR_BUTTON, KEYBOARD_TOOLBAR_HEIGHT, KeyboardToolbarAction, KeyboardToolbarLevel,
    KeyboardToolbarPanel, MORE_TOOL_PANEL_GROUPS, TEXT_SUB_TOOLBAR_ITEMS, TURN_INTO_PANEL_ITEMS,
    ToolbarActionSpec, ToolbarItemSpec,
};

fn image_icon_glyph(color: Hsla) -> AnyElement {
    ui::canvas(
        |_, _, _| (),
        move |bounds, (), window, _| {
            let x = f32::from(bounds.origin.x);
            let y = f32::from(bounds.origin.y);
            let w = f32::from(bounds.size.width);
            let h = f32::from(bounds.size.height);

            // Outer rounded-ish frame + mountain ridge + sun dot (20x20).
            let mut frame = ui::PathBuilder::stroke(px(1.5));
            frame.move_to(ui::point(px(x + w * 0.16), px(y + h * 0.20)));
            frame.line_to(ui::point(px(x + w * 0.84), px(y + h * 0.20)));
            frame.line_to(ui::point(px(x + w * 0.84), px(y + h * 0.80)));
            frame.line_to(ui::point(px(x + w * 0.16), px(y + h * 0.80)));
            frame.close();
            if let Ok(path) = frame.build() {
                window.paint_path(path, color);
            }

            let mut ridge = ui::PathBuilder::stroke(px(1.5));
            ridge.move_to(ui::point(px(x + w * 0.20), px(y + h * 0.72)));
            ridge.line_to(ui::point(px(x + w * 0.44), px(y + h * 0.48)));
            ridge.line_to(ui::point(px(x + w * 0.60), px(y + h * 0.64)));
            ridge.line_to(ui::point(px(x + w * 0.72), px(y + h * 0.52)));
            ridge.line_to(ui::point(px(x + w * 0.82), px(y + h * 0.68)));
            if let Ok(path) = ridge.build() {
                window.paint_path(path, color);
            }

            let mut sun = ui::PathBuilder::fill();
            let cx_pt = x + w * 0.66;
            let cy_pt = y + h * 0.36;
            let r = w * 0.075;
            sun.move_to(ui::point(px(cx_pt - r), px(cy_pt)));
            sun.line_to(ui::point(px(cx_pt), px(cy_pt - r)));
            sun.line_to(ui::point(px(cx_pt + r), px(cy_pt)));
            sun.line_to(ui::point(px(cx_pt), px(cy_pt + r)));
            sun.close();
            if let Ok(path) = sun.build() {
                window.paint_path(path, color);
            }
        },
    )
    .w(px(20.0))
    .h(px(20.0))
    .into_any_element()
}

impl Overlays {
    pub(crate) fn render_keyboard_toolbar<V: OverlayHost>(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        cx: &mut Context<V>,
    ) -> Option<AnyElement> {
        if !self.keyboard_toolbar.visible {
            return None;
        }
        let width = scene.window.0.max(0.0).floor();
        let win_h = scene.window.1.max(0.0).floor();
        let active_panel = if self.keyboard_toolbar.marks_disabled {
            None
        } else {
            self.keyboard_toolbar.active_panel
        };
        let panel_height = if active_panel.is_some() {
            let max_panel = (win_h - TOPBAR_HEIGHT - KEYBOARD_TOOLBAR_HEIGHT - 16.0).max(120.0);
            KEYBOARD_TOOL_PANEL_HEIGHT.min(max_panel).floor()
        } else {
            0.0
        };
        let total_height = KEYBOARD_TOOLBAR_HEIGHT + panel_height;
        let top = (win_h - total_height).max(TOPBAR_HEIGHT).floor();

        let marks = self
            .open_toolbar()
            .map(|t| t.selection.marks.clone())
            .unwrap_or_default();

        let bar_rect = FlowRect::new(0.0, top, width, KEYBOARD_TOOLBAR_HEIGHT);
        let bar = self.render_toolbar_strip(bar_rect, &marks, palette, cx);

        if let Some(panel_kind) = active_panel {
            let panel_rect = FlowRect::new(0.0, top + KEYBOARD_TOOLBAR_HEIGHT, width, panel_height);
            let panel = self.render_tool_panel(panel_kind, panel_rect, palette, cx);
            let container = place(FlowRect::new(0.0, top, width, total_height))
                .id("keyboard-toolbar-shell")
                .flex()
                .flex_col()
                .child(bar)
                .child(panel);
            Some(container.into_any_element())
        } else {
            Some(place(bar_rect).child(bar).into_any_element())
        }
    }

    fn is_action_disabled(&self, action: KeyboardToolbarAction) -> bool {
        let state = &self.keyboard_toolbar;
        if state.marks_disabled && action.requires_body_selection() {
            return true;
        }
        match action {
            KeyboardToolbarAction::Undo => !state.capabilities.can_undo,
            KeyboardToolbarAction::Redo => !state.capabilities.can_redo,
            KeyboardToolbarAction::Indent => !state.capabilities.can_indent,
            KeyboardToolbarAction::Outdent => !state.capabilities.can_dedent,
            _ => false,
        }
    }

    fn is_item_active(&self, item: &ToolbarItemSpec, marks: &MarkState) -> bool {
        match item {
            ToolbarItemSpec::ToolPanel { panel, .. } => {
                !self.keyboard_toolbar.marks_disabled
                    && self.keyboard_toolbar.active_panel == Some(*panel)
            }
            ToolbarItemSpec::SubToolbar { .. } => {
                !self.keyboard_toolbar.marks_disabled
                    && self.keyboard_toolbar.level == KeyboardToolbarLevel::TextStyle
            }
            ToolbarItemSpec::Action(spec) => match spec.action {
                KeyboardToolbarAction::Bold => marks.bold,
                KeyboardToolbarAction::Italic => marks.italic,
                KeyboardToolbarAction::Underline => marks.underline,
                KeyboardToolbarAction::Strike => marks.strike,
                KeyboardToolbarAction::InlineCode => marks.code,
                KeyboardToolbarAction::Link => marks.link.is_some() || self.link_field().is_some(),
                _ => false,
            },
        }
    }

    fn render_toolbar_strip<V: OverlayHost>(
        &self,
        rect: FlowRect,
        marks: &MarkState,
        palette: &Palette,
        cx: &mut Context<V>,
    ) -> ui::Stateful<ui::Div> {
        let pad_x = 4.0;
        let gap = 2.0;
        let btn = KEYBOARD_TOOLBAR_BUTTON;
        let in_sub = !self.keyboard_toolbar.marks_disabled
            && self.keyboard_toolbar.level == KeyboardToolbarLevel::TextStyle;

        let can_pick_images = self.keyboard_toolbar.capabilities.can_pick_images;
        let visible_items: Vec<ToolbarItemSpec> = if in_sub {
            TEXT_SUB_TOOLBAR_ITEMS
                .into_iter()
                .filter(|item| item.is_visible_for(can_pick_images))
                .collect()
        } else {
            DEFAULT_KEYBOARD_TOOLBAR_ITEMS
                .into_iter()
                .filter(|item| item.is_visible_for(can_pick_images))
                .collect()
        };

        // Reserve fixed slots: Back (when in Aa sub-toolbar) + right divider (9px) + Dismiss (44px)
        // plus optional More (44px) when remaining items overflow.
        let fixed_right = btn + gap + 9.0;
        let fixed_left = if in_sub { btn + gap } else { 0.0 };
        let avail_no_more = (rect.w - pad_x * 2.0 - fixed_right - fixed_left).max(btn);
        let slots_no_more = ((avail_no_more + gap) / (btn + gap)).floor().max(1.0) as usize;
        let needs_paging = slots_no_more < visible_items.len();
        let left_slots = if needs_paging {
            let avail_with_more = (avail_no_more - btn - gap).max(btn);
            ((avail_with_more + gap) / (btn + gap)).floor().max(1.0) as usize
        } else {
            visible_items.len().max(1)
        };
        let page_count = visible_items.len().div_ceil(left_slots).max(1);
        let page = self.keyboard_toolbar.page % page_count;
        let start = page * left_slots;
        let end = (start + left_slots).min(visible_items.len());
        let slice = &visible_items[start..end];

        let hover = palette.hover;
        let active_bg = palette.brand.opacity(0.14);

        let mut left_strip = div()
            .flex_1()
            .min_w(px(0.0))
            .h(px(btn))
            .flex()
            .items_center()
            .gap(px(gap))
            .overflow_hidden();

        if in_sub {
            left_strip = left_strip.child(self.render_strip_button(
                "back",
                "Back",
                "",
                KeyboardToolbarAction::BackToMainToolbar,
                false,
                false,
                palette,
                hover,
                active_bg,
                cx,
            ));
        }

        for item in slice {
            let action = item.action();
            let disabled = self.is_action_disabled(action);
            let active = self.is_item_active(item, marks);
            left_strip = left_strip.child(self.render_strip_button(
                item.id(),
                item.name(),
                item.icon(),
                action,
                disabled,
                active,
                palette,
                hover,
                active_bg,
                cx,
            ));
        }

        let divider = div()
            .flex_none()
            .w(px(1.0))
            .h(px(24.0))
            .mx(px(3.0))
            .bg(palette.border);

        let dismiss = self.render_strip_button(
            "dismiss",
            "Dismiss",
            "KeyboardIcon",
            KeyboardToolbarAction::Dismiss,
            false,
            false,
            palette,
            hover,
            active_bg,
            cx,
        );

        let mut bar = div()
            .id("keyboard-toolbar")
            .flex_none()
            .w(px(rect.w))
            .h(px(KEYBOARD_TOOLBAR_HEIGHT))
            .px(px(pad_x))
            .flex()
            .items_center()
            .gap(px(gap))
            .bg(palette.panel)
            .border_1()
            .border_color(palette.border)
            .shadow(palette.theme.shadows("--affine-toolbar-shadow").into())
            .occlude()
            .snapshot("overlay.keyboard_toolbar", Some("root.canvas"))
            .child(left_strip);

        if needs_paging {
            let more = div()
                .id("kb-tool-more")
                .flex_none()
                .w(px(btn))
                .h(px(btn))
                .rounded(px(8.0))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(move |style| style.bg(hover))
                .on_click(emit(cx, |_: &ClickEvent| {
                    OverlayEvent::KeyboardToolbarNextPage
                }))
                .snapshot(
                    "overlay.keyboard_toolbar.more",
                    Some("overlay.keyboard_toolbar"),
                )
                .snapshot_text("More")
                .child(icon("MoreHorizontalIcon", 20.0, palette.icon));
            bar = bar.child(more);
        }

        bar.child(divider).child(dismiss)
    }

    #[allow(clippy::too_many_arguments)]
    fn render_strip_button<V: OverlayHost>(
        &self,
        id: &'static str,
        label: &'static str,
        icon_name: &'static str,
        action: KeyboardToolbarAction,
        disabled: bool,
        active: bool,
        palette: &Palette,
        hover: Hsla,
        active_bg: Hsla,
        cx: &mut Context<V>,
    ) -> ui::Stateful<ui::Div> {
        let btn = KEYBOARD_TOOLBAR_BUTTON;
        let ink = if active { palette.brand } else { palette.icon };
        let mut button = div()
            .id(SharedString::from(format!("kb-tool-{id}")))
            .flex_none()
            .w(px(btn))
            .h(px(btn))
            .rounded(px(8.0))
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(TYPOGRAPHY.font_sm_px))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(ink)
            .when(active, |el| el.bg(active_bg))
            .snapshot(
                SharedString::from(format!("overlay.keyboard_toolbar.{id}")),
                Some("overlay.keyboard_toolbar"),
            )
            .snapshot_focused(active)
            .snapshot_text(label);

        if disabled {
            button = button.opacity(0.35);
        } else {
            button = button
                .cursor_pointer()
                .hover(move |style| style.bg(hover))
                .on_click(emit(cx, move |_: &ClickEvent| {
                    OverlayEvent::KeyboardToolbar(action)
                }));
        }

        match action {
            KeyboardToolbarAction::ToggleMorePanel if active => button.child(
                div()
                    .text_size(px(20.0))
                    .text_color(palette.brand)
                    .child("\u{00D7}"),
            ),
            KeyboardToolbarAction::OpenTextSubToolbar => button.child("Aa"),
            KeyboardToolbarAction::BackToMainToolbar => {
                button.child(div().text_size(px(18.0)).child("\u{2190}"))
            }
            KeyboardToolbarAction::Image => button.child(image_icon_glyph(ink)),
            KeyboardToolbarAction::ToggleHighlightPanel => button.child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .child(div().text_size(px(14.0)).line_height(px(15.0)).child("A"))
                    .child(
                        div()
                            .w(px(14.0))
                            .h(px(3.0))
                            .rounded(px(1.5))
                            .bg(palette.brand),
                    ),
            ),
            _ if !icon_name.is_empty() => button.child(icon(icon_name, 20.0, ink)),
            _ => button.child(label),
        }
    }

    fn render_tool_panel<V: OverlayHost>(
        &self,
        panel: KeyboardToolbarPanel,
        rect: FlowRect,
        palette: &Palette,
        cx: &mut Context<V>,
    ) -> ui::Stateful<ui::Div> {
        let pad_x = if rect.w <= 340.0 { 8.0 } else { 12.0 };
        let pad_y = 8.0;
        let col_gap = 6.0;
        let inner_w = (rect.w - pad_x * 2.0 - 2.0).max(120.0);
        let list_h = (rect.h - pad_y * 2.0 - 2.0).max(80.0);
        let cols: usize = ((inner_w + col_gap) / (KEYBOARD_TOOLBAR_BUTTON + col_gap))
            .floor()
            .clamp(3.0, 5.0) as usize;
        let tile_w = ((inner_w - col_gap * (cols as f32 - 1.0)) / cols as f32)
            .floor()
            .max(KEYBOARD_TOOLBAR_BUTTON);

        let header_h = 18.0;
        let tile_row_h = KEYBOARD_TOOLBAR_BUTTON + 14.0;
        let row_gap = 4.0;
        let group_gap = 8.0;

        let mut list = div()
            .relative()
            .flex_none()
            .w(px(inner_w))
            .h(px(list_h))
            .overflow_hidden();
        let scroll = self.keyboard_toolbar.panel_scroll.max(0.0);
        let mut cursor_y = 0.0_f32;

        let push_header = |list: ui::Div, group_id: &'static str, title: &'static str, y: f32| {
            let top = y - scroll;
            if top + header_h <= 0.0 || top >= list_h {
                return list;
            }
            list.child(
                div()
                    .absolute()
                    .left(px(0.0))
                    .top(px(top))
                    .w(px(inner_w))
                    .h(px(header_h))
                    .flex()
                    .items_center()
                    .text_size(px(TYPOGRAPHY.font_xs_px))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(palette.text_secondary)
                    .snapshot(
                        SharedString::from(format!("overlay.keyboard_toolbar.group.{group_id}")),
                        Some("overlay.keyboard_toolbar.panel"),
                    )
                    .snapshot_text(title)
                    .child(title),
            )
        };

        let can_pick_images = self.keyboard_toolbar.capabilities.can_pick_images;
        match panel {
            KeyboardToolbarPanel::More => {
                let mut first = true;
                for group in MORE_TOOL_PANEL_GROUPS {
                    let visible: Vec<&ToolbarActionSpec> = group
                        .items
                        .iter()
                        .filter(|i| i.is_visible_for(can_pick_images))
                        .collect();
                    if visible.is_empty() {
                        continue;
                    }
                    if !first {
                        cursor_y += group_gap;
                    }
                    first = false;
                    list = push_header(list, group.id, group.name, cursor_y);
                    cursor_y += header_h + row_gap;
                    for chunk in visible.chunks(cols) {
                        let top = cursor_y - scroll;
                        if top + tile_row_h > 0.0 && top < list_h {
                            list = list.child(self.render_action_row(
                                group.id, chunk, top, inner_w, tile_w, tile_row_h, col_gap,
                                palette, cx,
                            ));
                        }
                        cursor_y += tile_row_h + row_gap;
                    }
                }
            }
            KeyboardToolbarPanel::TurnInto => {
                let visible: Vec<&ToolbarActionSpec> = TURN_INTO_PANEL_ITEMS
                    .iter()
                    .filter(|i| i.is_visible_for(can_pick_images))
                    .collect();
                list = push_header(list, "turn_into", "Turn into", cursor_y);
                cursor_y += header_h + row_gap;
                for chunk in visible.chunks(cols) {
                    let top = cursor_y - scroll;
                    if top + tile_row_h > 0.0 && top < list_h {
                        list = list.child(self.render_action_row(
                            "turn_into",
                            chunk,
                            top,
                            inner_w,
                            tile_w,
                            tile_row_h,
                            col_gap,
                            palette,
                            cx,
                        ));
                    }
                    cursor_y += tile_row_h + row_gap;
                }
            }
            KeyboardToolbarPanel::Highlight => {
                for (idx, (group_id, title, is_bg)) in [
                    ("color", "Color", false),
                    ("background", "Background", true),
                ]
                .into_iter()
                .enumerate()
                {
                    if idx > 0 {
                        cursor_y += group_gap;
                    }
                    list = push_header(list, group_id, title, cursor_y);
                    cursor_y += header_h + row_gap;
                    for chunk in HighlightColor::ALL.chunks(cols) {
                        let top = cursor_y - scroll;
                        if top + tile_row_h > 0.0 && top < list_h {
                            list = list.child(self.render_highlight_row(
                                group_id, is_bg, chunk, top, inner_w, tile_w, tile_row_h, col_gap,
                                palette, cx,
                            ));
                        }
                        cursor_y += tile_row_h + row_gap;
                    }
                }
            }
        }

        if cursor_y > list_h {
            let thumb_h = (list_h * list_h / cursor_y).max(24.0).round();
            let max_scroll = (cursor_y - list_h).max(1.0);
            let thumb_top = ((list_h - thumb_h) * (scroll / max_scroll).clamp(0.0, 1.0)).round();
            list = list.child(
                div()
                    .absolute()
                    .left(px(inner_w - 3.0))
                    .top(px(thumb_top))
                    .w(px(3.0))
                    .h(px(thumb_h))
                    .rounded(px(1.5))
                    .bg(palette.text_secondary.opacity(0.35)),
            );
        }

        div()
            .id("keyboard-tool-panel")
            .flex_none()
            .w(px(rect.w))
            .h(px(rect.h))
            .px(px(pad_x))
            .py(px(pad_y))
            .bg(palette.background)
            .border_1()
            .border_color(palette.border)
            .overflow_hidden()
            .occlude()
            .on_scroll(emit(cx, |ev: &ui::ScrollEvent| {
                OverlayEvent::KeyboardToolbarPanelScroll(f32::from(
                    ev.delta.pixel_delta(px(20.0)).y,
                ))
            }))
            .snapshot("overlay.keyboard_toolbar.panel", Some("root.canvas"))
            .child(list)
    }

    #[allow(clippy::too_many_arguments)]
    fn render_action_row<V: OverlayHost>(
        &self,
        group_id: &'static str,
        chunk: &[&ToolbarActionSpec],
        top: f32,
        inner_w: f32,
        tile_w: f32,
        row_h: f32,
        col_gap: f32,
        palette: &Palette,
        cx: &mut Context<V>,
    ) -> ui::Div {
        let hover = palette.hover;
        let mut row = div()
            .absolute()
            .left(px(0.0))
            .top(px(top))
            .w(px(inner_w))
            .h(px(row_h))
            .flex()
            .gap(px(col_gap));
        for spec in chunk {
            let action = spec.action;
            let tile_id = format!("kb-panel-{group_id}-{}", spec.id);
            let snap_id = format!("overlay.keyboard_toolbar.panel.{group_id}.{}", spec.id);
            let glyph: AnyElement = match action {
                KeyboardToolbarAction::Date(kind) => div()
                    .text_size(px(13.0))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(palette.icon)
                    .child(kind.badge())
                    .into_any_element(),
                KeyboardToolbarAction::Image => image_icon_glyph(palette.icon),
                _ if !spec.icon.is_empty() => {
                    icon(spec.icon, 20.0, palette.icon).into_any_element()
                }
                _ => div()
                    .text_size(px(12.0))
                    .text_color(palette.icon)
                    .child(spec.name)
                    .into_any_element(),
            };
            let tile = div()
                .id(SharedString::from(tile_id))
                .flex_none()
                .w(px(tile_w))
                .h(px(row_h))
                .flex()
                .flex_col()
                .items_center()
                .gap(px(2.0))
                .cursor_pointer()
                .on_click(emit(cx, move |_: &ClickEvent| {
                    OverlayEvent::KeyboardToolbar(action)
                }))
                .snapshot(
                    SharedString::from(snap_id),
                    Some("overlay.keyboard_toolbar.panel"),
                )
                .snapshot_text(spec.name)
                .child(
                    div()
                        .w(px(tile_w))
                        .h(px(KEYBOARD_TOOLBAR_BUTTON))
                        .rounded(px(6.0))
                        .bg(palette.background_secondary)
                        .hover(move |style| style.bg(hover))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(glyph),
                )
                .child(
                    div()
                        .w(px(tile_w))
                        .h(px(12.0))
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .text_size(px(10.0))
                        .line_height(px(12.0))
                        .text_color(palette.text_secondary)
                        .flex()
                        .justify_center()
                        .child(spec.name),
                );
            row = row.child(tile);
        }
        row
    }

    #[allow(clippy::too_many_arguments)]
    fn render_highlight_row<V: OverlayHost>(
        &self,
        group_id: &'static str,
        is_bg: bool,
        chunk: &[HighlightColor],
        top: f32,
        inner_w: f32,
        tile_w: f32,
        row_h: f32,
        col_gap: f32,
        palette: &Palette,
        cx: &mut Context<V>,
    ) -> ui::Div {
        let hover = palette.hover;
        let mut row = div()
            .absolute()
            .left(px(0.0))
            .top(px(top))
            .w(px(inner_w))
            .h(px(row_h))
            .flex()
            .gap(px(col_gap));
        for &color in chunk {
            let action = if is_bg {
                KeyboardToolbarAction::SetBgColor(color)
            } else {
                KeyboardToolbarAction::SetTextColor(color)
            };
            let swatch_bg = if is_bg {
                color
                    .bg_css_var()
                    .and_then(|v| palette.theme.css_color(v))
                    .unwrap_or(palette.background_secondary)
            } else {
                palette.background_secondary
            };
            let swatch_fg = if is_bg {
                palette.text_primary
            } else {
                color
                    .fg_css_var()
                    .and_then(|v| palette.theme.css_color(v))
                    .unwrap_or(palette.text_primary)
            };
            let tile_id = format!("kb-hl-{group_id}-{}", color.id());
            let snap_id = format!("overlay.keyboard_toolbar.panel.{group_id}.{}", color.id());
            let tile = div()
                .id(SharedString::from(tile_id))
                .flex_none()
                .w(px(tile_w))
                .h(px(row_h))
                .flex()
                .flex_col()
                .items_center()
                .gap(px(2.0))
                .cursor_pointer()
                .on_click(emit(cx, move |_: &ClickEvent| {
                    OverlayEvent::KeyboardToolbar(action)
                }))
                .snapshot(
                    SharedString::from(snap_id),
                    Some("overlay.keyboard_toolbar.panel"),
                )
                .snapshot_text(color.label())
                .child(
                    div()
                        .w(px(tile_w))
                        .h(px(KEYBOARD_TOOLBAR_BUTTON))
                        .rounded(px(6.0))
                        .bg(swatch_bg)
                        .border_1()
                        .border_color(palette.border)
                        .hover(move |style| style.bg(hover))
                        .flex()
                        .items_center()
                        .justify_center()
                        .text_size(px(16.0))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(swatch_fg)
                        .child("A"),
                )
                .child(
                    div()
                        .w(px(tile_w))
                        .h(px(12.0))
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .text_size(px(10.0))
                        .line_height(px(12.0))
                        .text_color(palette.text_secondary)
                        .flex()
                        .justify_center()
                        .child(color.label()),
                );
            row = row.child(tile);
        }
        row
    }
}
