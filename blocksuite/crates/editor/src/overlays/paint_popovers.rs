use blocksuite_playground_doc::read::TextAlign as BlockAlign;
use ui::{
    AnyElement, ClickEvent, Context, FontWeight, Hsla, MouseDownEvent, MouseMoveEvent, ScrollEvent,
    SharedString, TextRun, Window, div, prelude::*, px,
};

use crate::{
    block_flow::FlowRect,
    theme::{FONT_SANS, Palette, TYPOGRAPHY},
};

use super::*;

/// Side and alignment a popover prefers relative to its anchor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Placement {
    /// Above the anchor, centered on it.
    Above,
    /// Below the anchor, starting at its left edge.
    BelowStart,
}

/// Side of the anchor a popover ended up on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PopoverSide {
    Above,
    Below,
}

/// Result of [`place_popover`], on the pixel grid.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlacedPopover {
    pub rect: FlowRect,
    pub side: PopoverSide,
    /// Whether the popover left its preferred side.
    pub flipped: bool,
}

/// Place a popover of `popover_size` next to `anchor` inside `viewport`, all in screen
/// space.
pub fn place_popover(
    anchor: FlowRect,
    popover_size: (f32, f32),
    viewport: FlowRect,
    preferred: Placement,
    gap: f32,
    edge_margin: f32,
) -> PlacedPopover {
    let (width, height) = popover_size;
    let top_limit = viewport.y + edge_margin;
    let bottom_limit = viewport.bottom() - edge_margin;
    let above_y = anchor.y - gap - height;
    let below_y = anchor.bottom() + gap;
    let fits_above = above_y >= top_limit;
    let fits_below = below_y + height <= bottom_limit;

    let preferred_side = match preferred {
        Placement::Above => PopoverSide::Above,
        Placement::BelowStart => PopoverSide::Below,
    };
    let side = match (preferred_side, fits_above, fits_below) {
        (PopoverSide::Above, true, _) | (PopoverSide::Below, true, false) => PopoverSide::Above,
        (PopoverSide::Below, _, true) | (PopoverSide::Above, false, true) => PopoverSide::Below,
        (preferred_side, false, false) => {
            let room_above = anchor.y - viewport.y;
            let room_below = viewport.bottom() - anchor.bottom();
            if room_above > room_below {
                PopoverSide::Above
            } else if room_below > room_above {
                PopoverSide::Below
            } else {
                preferred_side
            }
        }
    };
    let y = match side {
        PopoverSide::Above => above_y,
        PopoverSide::Below => below_y,
    };
    let y = y.min(bottom_limit - height).max(top_limit);

    let x = match preferred {
        Placement::Above => anchor.x + (anchor.w - width) / 2.0,
        Placement::BelowStart => anchor.x,
    };
    let left_limit = viewport.x + edge_margin;
    let x = x
        .min(viewport.right() - edge_margin - width)
        .max(left_limit);

    PlacedPopover {
        rect: FlowRect::new(x.round(), y.round(), width, height),
        side,
        flipped: side != preferred_side,
    }
}

impl Overlays {
    /// Render the desktop right-click context menu and transient clipboard toast for any mode.
    pub fn context_overlays<V: OverlayHost>(
        &mut self,
        window_size: (f32, f32),
        palette: &Palette,
        now_ms: f64,
        window: &mut Window,
        cx: &mut Context<V>,
    ) -> Vec<AnyElement> {
        if self
            .context_menu
            .as_ref()
            .is_some_and(|menu| menu.presence.gone(now_ms))
        {
            self.context_menu = None;
        }
        if self
            .context_menu
            .as_ref()
            .is_some_and(|menu| menu.presence.in_flight(now_ms) || menu.presence.closing)
        {
            window.request_animation_frame();
        }
        let viewport = FlowRect::new(
            0.0,
            TOPBAR_HEIGHT,
            window_size.0,
            (window_size.1 - TOPBAR_HEIGHT).max(0.0),
        );
        let mut elements = Vec::new();
        if let Some(menu) = self.context_menu.as_mut() {
            elements.extend(context_menu::render_context_menu(
                menu, viewport, palette, now_ms, cx,
            ));
        }
        if let Some(toast) = self.context_toast.as_ref() {
            elements.push(context_menu::render_context_toast(toast, viewport, palette));
        }
        elements
    }

    /// Build the screen-space popovers, positioned in window coordinates: the slash menu
    /// and the formatting toolbar. Call after [`Overlays::page_layer`] in the same frame.
    pub fn popovers<V: OverlayHost>(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        window: &mut Window,
        cx: &mut Context<V>,
    ) -> Vec<AnyElement> {
        let mut elements = Vec::new();
        elements.extend(self.render_toolbar(scene, palette, now_ms, window, cx));
        elements.extend(self.render_slash(scene, palette, now_ms, cx));
        elements.extend(self.render_linked_doc(scene, palette, now_ms, cx));
        elements.extend(self.render_equation(scene, palette, now_ms, window, cx));
        elements.extend(self.render_bookmark(scene, palette, now_ms, window, cx));
        elements.extend(self.render_keyboard_toolbar(scene, palette, cx));
        elements
    }

    fn render_slash<V: OverlayHost>(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        cx: &mut Context<V>,
    ) -> Option<AnyElement> {
        let menu = self.slash.as_mut()?;
        menu.rect = None;
        let progress = menu.presence.progress(now_ms);
        if menu.presence.closing && progress <= 0.0 {
            return None;
        }
        let interactive = !menu.presence.closing;
        let progress = if interactive {
            progress.max(0.01)
        } else {
            progress
        };
        let anchor_world = menu
            .anchor_world
            .or_else(|| caret_world_rect(scene.layout, &menu.block_id, menu.utf16_offset))?;
        if !scene.anchor_visible(&anchor_world) {
            return None;
        }
        let anchor = scene.world_to_screen(&anchor_world);
        let viewport = scene.popover_viewport();

        let items = filter_slash_items_for(&menu.query, !self.database_readonly);
        if items.is_empty() {
            return None;
        }
        menu.selected = menu.selected.min(items.len().saturating_sub(1));
        let (rows, content_height) = slash_rows_for_query(&items, &menu.query);
        let show_query = !menu.query_in_document;
        let chrome = 2.0 * SLASH_MENU_PADDING + if show_query { SLASH_QUERY_HEIGHT } else { 0.0 };

        // As tall as the content up to the cap; shorter when neither side has the room.
        let desired = chrome + content_height.min(SLASH_LIST_MAX_HEIGHT);
        let room = |edge: f32| (edge - POPOVER_GAP - POPOVER_EDGE_MARGIN).floor();
        let room_below = room(viewport.bottom() - anchor.bottom());
        let room_above = room(anchor.y - viewport.y);
        let height = if desired <= room_below || desired <= room_above {
            desired
        } else {
            desired
                .min(room_below.max(room_above))
                .max(chrome + SLASH_ITEM_HEIGHT)
        };
        let width = SLASH_MENU_WIDTH
            .min(viewport.w - 2.0 * POPOVER_EDGE_MARGIN)
            .max(0.0)
            .floor();
        let placed = place_popover(
            anchor,
            (width, height),
            viewport,
            Placement::BelowStart,
            POPOVER_GAP,
            POPOVER_EDGE_MARGIN,
        );

        menu.rect = Some(placed.rect);

        let list_width = width - 2.0 * SLASH_MENU_PADDING;
        let list_height = height - chrome;
        let max_scroll = (content_height - list_height).max(0.0);
        if std::mem::take(&mut menu.reveal_selected)
            && let Some((_, y, row_height)) = rows
                .iter()
                .find(|(row, _, _)| *row == SlashRow::Item(menu.selected))
        {
            if menu.selected == 0 {
                // The first item comes with its group header.
                menu.scroll = 0.0;
            } else if *y < menu.scroll {
                menu.scroll = *y;
            } else if y + row_height > menu.scroll + list_height {
                menu.scroll = y + row_height - list_height;
            }
        }
        menu.scroll = menu.scroll.clamp(0.0, max_scroll).round();
        let scroll = menu.scroll;
        let selected = menu.selected;

        // A scrolling list keeps a gutter at its right edge for the scroll thumb.
        let row_width = if max_scroll > 0.0 {
            list_width - SLASH_SCROLL_GUTTER
        } else {
            list_width
        };
        let mut list = div()
            .relative()
            .flex_none()
            .w(px(list_width))
            .h(px(list_height))
            .overflow_hidden();
        for (row, y, row_height) in rows {
            let top = y - scroll;
            if top + row_height <= 0.0 || top >= list_height {
                continue;
            }
            let fully_visible = top >= 0.0 && top + row_height <= list_height;
            let base = div()
                .absolute()
                .left(px(0.0))
                .top(px(top))
                .w(px(row_width))
                .h(px(row_height))
                .px(px(8.0))
                .flex()
                .items_center();
            match row {
                SlashRow::Header(group) => {
                    let mut header = base
                        .text_size(px(TYPOGRAPHY.font_xs_px))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(palette.text_secondary);
                    if fully_visible {
                        header = header
                            .snapshot(
                                SharedString::from(format!(
                                    "overlay.slash_menu.group.{}",
                                    group.to_lowercase()
                                )),
                                Some("overlay.slash_menu"),
                            )
                            .snapshot_text(group);
                    }
                    list = list.child(header.child(group));
                }
                SlashRow::Item(index) => {
                    let item = items[index];
                    let active = index == selected;
                    let mut element = base
                        .id(SharedString::from(format!("slash-item-{}", item.id)))
                        .rounded(px(SLASH_MENU_RADIUS - SLASH_MENU_PADDING))
                        .gap(px(SLASH_ICON_GAP))
                        .text_size(px(TYPOGRAPHY.font_sm_px))
                        .text_color(palette.text_primary)
                        .when(active, |row| row.bg(palette.hover));
                    if interactive {
                        element = element
                            .cursor_pointer()
                            .on_mouse_move(emit(cx, move |_: &MouseMoveEvent| {
                                OverlayEvent::SlashHover(index)
                            }))
                            .on_click(emit(cx, move |_: &ClickEvent| {
                                OverlayEvent::SlashExecute(index)
                            }));
                    }
                    if fully_visible {
                        element = element
                            .snapshot(
                                SharedString::from(format!("overlay.slash_menu.item.{}", item.id)),
                                Some("overlay.slash_menu"),
                            )
                            .snapshot_focused(active)
                            .snapshot_text(item.title);
                    }
                    list = list.child(
                        element
                            .child(
                                div()
                                    .flex_none()
                                    .w(px(SLASH_ICON_BOX))
                                    .h(px(SLASH_ICON_BOX))
                                    .rounded(px(4.0))
                                    .bg(palette.panel)
                                    .border_1()
                                    .border_color(palette.border)
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .child(icon(item.icon, 20.0, palette.icon)),
                            )
                            .child(
                                div()
                                    .flex_1()
                                    .min_w(px(0.0))
                                    .flex()
                                    .flex_col()
                                    .justify_center()
                                    .overflow_hidden()
                                    .child(
                                        div()
                                            .whitespace_nowrap()
                                            .overflow_hidden()
                                            .text_size(px(TYPOGRAPHY.font_sm_px))
                                            .line_height(px(18.0))
                                            .text_color(palette.text_primary)
                                            .child(item.title),
                                    )
                                    .child(
                                        div()
                                            .whitespace_nowrap()
                                            .overflow_hidden()
                                            .text_size(px(TYPOGRAPHY.font_xs_px))
                                            .line_height(px(15.0))
                                            .text_color(palette.text_secondary)
                                            .child(item.description),
                                    ),
                            ),
                    );
                }
            }
        }

        if max_scroll > 0.0 {
            // Scroll thumb: where the visible rows sit in the whole list.
            let thumb_height = (list_height * list_height / content_height)
                .max(24.0)
                .round();
            let thumb_top = ((list_height - thumb_height) * scroll / max_scroll).round();
            list = list.child(
                div()
                    .absolute()
                    .left(px(list_width - 4.0))
                    .top(px(thumb_top))
                    .w(px(3.0))
                    .h(px(thumb_height))
                    .rounded(px(1.5))
                    .bg(palette.text_secondary.opacity(0.35)),
            );
        }

        let mut root = place(placed.rect)
            .id("slash-menu")
            .flex()
            .flex_col()
            .p(px(SLASH_MENU_PADDING))
            .rounded(px(SLASH_MENU_RADIUS))
            .bg(palette.panel)
            .shadow(
                palette
                    .theme
                    .shadows("--affine-overlay-panel-shadow")
                    .into(),
            )
            .opacity(progress)
            .snapshot("overlay.slash_menu", Some("root.canvas"))
            .snapshot_focused(interactive)
            .snapshot_text(menu.query.clone());
        if interactive {
            root = root
                .occlude()
                .on_scroll(emit(cx, |event: &ScrollEvent| {
                    OverlayEvent::SlashScroll(f32::from(event.delta.pixel_delta(px(20.0)).y))
                }))
                .on_mouse_down_out(emit(cx, |_: &MouseDownEvent| OverlayEvent::CloseSlashMenu));
        }
        if show_query {
            let (text, color) = if menu.query.is_empty() {
                ("Type to filter".to_string(), palette.placeholder)
            } else {
                (format!("/{}", menu.query), palette.text_primary)
            };
            root = root.child(
                div()
                    .flex_none()
                    .w(px(list_width))
                    .h(px(SLASH_QUERY_HEIGHT))
                    .px(px(8.0))
                    .flex()
                    .items_center()
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .text_size(px(TYPOGRAPHY.font_xs_px))
                    .text_color(color)
                    .snapshot("overlay.slash_menu.query", Some("overlay.slash_menu"))
                    .snapshot_text(menu.query.clone())
                    .child(text),
            );
        }
        Some(root.child(list).into_any_element())
    }

    fn render_toolbar<V: OverlayHost>(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        window: &mut Window,
        cx: &mut Context<V>,
    ) -> Option<AnyElement> {
        let suppress_buttons =
            self.keyboard_toolbar.visible || scene.suppress_floating_format_buttons;
        let toolbar = self.toolbar.as_mut()?;
        toolbar.rect = None;
        if suppress_buttons && toolbar.link.is_none() {
            return None;
        }
        let link_only = suppress_buttons && toolbar.link.is_some();
        let progress = toolbar.presence.progress(now_ms);
        if toolbar.presence.closing && progress <= 0.0 {
            return None;
        }
        let interactive = !toolbar.presence.closing;
        let progress = if interactive {
            progress.max(0.01)
        } else {
            progress
        };
        if !scene.anchor_visible(&toolbar.selection.anchor_world) {
            return None;
        }
        let anchor = scene.world_to_screen(&toolbar.selection.anchor_world);
        let marks = toolbar.selection.marks.clone();
        let align = toolbar.selection.align;

        let buttons = FormatAction::ALL.len() as f32;
        let inner_width =
            buttons * TOOLBAR_BUTTON + buttons * TOOLBAR_GAP + 1.0 + 2.0 * TOOLBAR_SEPARATOR_MARGIN;
        let chrome = 2.0 * (TOOLBAR_PADDING + POPOVER_BORDER);
        let width = inner_width + chrome;
        let rows = if toolbar.link.is_some() && !link_only {
            2.0
        } else {
            1.0
        };
        let height = rows * TOOLBAR_BUTTON + (rows - 1.0) * TOOLBAR_ROW_GAP + chrome;
        let placed = place_popover(
            anchor,
            (width, height),
            scene.popover_viewport(),
            Placement::Above,
            POPOVER_GAP,
            POPOVER_EDGE_MARGIN,
        );
        toolbar.rect = Some(placed.rect);
        // The link field sits in the second row (or first row when `link_only`), inset like the pills.
        let field_width =
            inner_width - TOOLBAR_GAP - LINK_APPLY_WIDTH - LINK_REMOVE_WIDTH - 2.0 * LINK_GAP;
        if let Some(link) = toolbar.link.as_mut() {
            let inset = POPOVER_BORDER + TOOLBAR_PADDING;
            let row_offset = if link_only {
                0.0
            } else {
                TOOLBAR_BUTTON + TOOLBAR_ROW_GAP
            };
            link.bounds = Some(FlowRect::new(
                placed.rect.x + inset + TOOLBAR_GAP / 2.0,
                placed.rect.y + inset + row_offset,
                field_width,
                TOOLBAR_BUTTON,
            ));
        }

        let radius = TOOLBAR_RADIUS - TOOLBAR_PADDING;
        let hover = palette.hover;
        let active_wash = palette.brand.opacity(0.12);
        // Buttons sit edge to edge so the pointer never falls between two of them; each
        // shows a pill one gap narrower than its hit target.
        let mut row = div()
            .flex_none()
            .w(px(inner_width))
            .h(px(TOOLBAR_BUTTON))
            .flex()
            .items_center();
        for action in FormatAction::ALL {
            if action == FormatAction::AlignLeft {
                row = row.child(
                    div()
                        .flex_none()
                        .w(px(1.0))
                        .h(px(16.0))
                        .mx(px(TOOLBAR_SEPARATOR_MARGIN))
                        .bg(palette.border),
                );
            }
            let active = match action {
                FormatAction::Link => marks.link.is_some() || toolbar.link.is_some(),
                _ => match (action.mark_key(), action.align()) {
                    (Some(key), _) => marks.has(key),
                    (_, Some(wanted)) => Some(wanted) == align,
                    _ => false,
                },
            };
            let ink = if active { palette.brand } else { palette.icon };
            let group = SharedString::from(format!("format-{}", action.id()));
            let mut pill = div()
                .flex_none()
                .w(px(TOOLBAR_BUTTON))
                .h(px(TOOLBAR_BUTTON))
                .rounded(px(radius))
                .flex()
                .items_center()
                .justify_center()
                .when(active, |pill| pill.bg(active_wash));
            let mut button = div()
                .id(action.id())
                .group(group.clone())
                .flex_none()
                .w(px(TOOLBAR_BUTTON + TOOLBAR_GAP))
                .h(px(TOOLBAR_BUTTON))
                .rounded(px(radius))
                .flex()
                .items_center()
                .justify_center()
                .snapshot(
                    SharedString::from(format!("overlay.format_toolbar.{}", action.id())),
                    Some("overlay.format_toolbar"),
                )
                .snapshot_focused(active)
                .snapshot_text(action.label());
            if interactive {
                pill = pill.group_hover(group, move |style| style.bg(hover));
                button = button
                    .cursor_pointer()
                    .on_click(emit(cx, move |_: &ClickEvent| OverlayEvent::Format(action)));
            }
            row = row.child(button.child(match (action.icon(), action.align()) {
                (Some(name), _) => pill.child(icon(name, 20.0, ink)),
                (None, align) => pill.child(align_glyph(align.unwrap_or(BlockAlign::Left), ink)),
            }));
        }

        let mut root = place(placed.rect)
            .id("format-toolbar")
            .flex()
            .flex_col()
            .gap(px(TOOLBAR_ROW_GAP))
            .p(px(TOOLBAR_PADDING))
            .rounded(px(TOOLBAR_RADIUS))
            .bg(palette.panel)
            .border_1()
            .border_color(palette.border)
            .shadow(palette.theme.shadows("--affine-toolbar-shadow").into())
            .opacity(progress)
            .snapshot("overlay.format_toolbar", Some("root.canvas"))
            .snapshot_focused(interactive)
            .when(!link_only, |el| el.child(row));
        if interactive {
            root = root.occlude();
        }

        if let Some(link) = &toolbar.link {
            // The field's inner box: its text, the selection or composition under it and
            // the caret, scrolled sideways just far enough to keep the caret in sight.
            let text_room = field_width - 2.0 * (8.0 + POPOVER_BORDER);
            let inner_height = TOOLBAR_BUTTON - 2.0 * POPOVER_BORDER;
            let caret_height = 16.0;
            let caret_top = (inner_height - caret_height) / 2.0;
            let text = link.text();
            let (selection, reversed) = link.shown_selection();
            let marked = link.marked_range();
            let mut font = ui::font(FONT_SANS);
            font.weight = FontWeight::NORMAL;
            font.fallbacks = Some(crate::default_font_fallbacks());
            let shown = SharedString::from(text.clone());
            let line = window.text_system().shape_line(
                shown.clone(),
                px(TYPOGRAPHY.font_xs_px),
                &[TextRun {
                    len: shown.len(),
                    font,
                    color: palette.text_primary,
                    background_color: None,
                    underline: None,
                    strikethrough: None,
                }],
                None,
            );
            let x_at = |offset: usize| f32::from(line.x_for_index(utf16_to_byte(&text, offset)));
            let text_width = f32::from(line.width());
            let caret_x = x_at(if reversed {
                selection.start
            } else {
                selection.end
            });
            let scroll = if text_width + 1.0 <= text_room {
                0.0
            } else {
                (caret_x + 1.0 - text_room)
                    .clamp(0.0, text_width + 1.0 - text_room)
                    .round()
            };
            let mut inner = div()
                .relative()
                .flex_none()
                .w(px(text_room))
                .h(px(inner_height))
                .overflow_hidden();
            let strip = |from: usize, to: usize, top: f32, height: f32, color: Hsla| {
                div()
                    .absolute()
                    .left(px((x_at(from) - scroll).round()))
                    .top(px(top))
                    .w(px((x_at(to) - x_at(from)).round().max(1.0)))
                    .h(px(height))
                    .bg(color)
            };
            if marked.is_none() && !selection.is_empty() {
                inner = inner.child(strip(
                    selection.start,
                    selection.end,
                    caret_top,
                    caret_height,
                    palette.brand.opacity(0.22),
                ));
            }
            let caption = |left: f32, color: Hsla, text: SharedString| {
                div()
                    .absolute()
                    .left(px(left))
                    .top(px(0.0))
                    .h(px(inner_height))
                    .flex()
                    .items_center()
                    .whitespace_nowrap()
                    .text_color(color)
                    .child(text)
            };
            inner = inner.child(if text.is_empty() {
                caption(1.0, palette.placeholder, "Paste or type a link".into())
            } else {
                caption(-scroll, palette.text_primary, shown)
            });
            if let Some(m) = &marked {
                let (s, e) = (selection.start, selection.end);
                let ul = caret_top + caret_height;
                inner = inner.child(strip(m.start, m.end, ul - 1.0, 1.0, palette.text_secondary));
                if s < e {
                    inner = inner
                        .child(strip(
                            s,
                            e,
                            caret_top,
                            caret_height,
                            palette.brand.opacity(0.18),
                        ))
                        .child(strip(s, e, ul - 2.0, 2.0, palette.brand));
                }
            }
            inner = inner.child(
                div()
                    .absolute()
                    .left(px((caret_x - scroll).round()))
                    .top(px(caret_top))
                    .w(px(1.0))
                    .h(px(caret_height))
                    .bg(palette.text_primary),
            );
            let field = div()
                .flex_none()
                .w(px(field_width))
                .h(px(TOOLBAR_BUTTON))
                .px(px(8.0))
                .rounded(px(radius))
                .bg(palette.background)
                .border_1()
                .border_color(palette.brand)
                .flex()
                .items_center()
                .overflow_hidden()
                .text_size(px(TYPOGRAPHY.font_xs_px))
                .snapshot(
                    "overlay.format_toolbar.link_input",
                    Some("overlay.format_toolbar"),
                )
                .snapshot_focused(true)
                .snapshot_text(text.clone())
                .child(inner);
            // `Remove` starts right where `Apply` ends, with its pill one gap further in.
            let label = |width: f32| {
                div()
                    .flex_none()
                    .w(px(width))
                    .h(px(TOOLBAR_BUTTON))
                    .rounded(px(radius))
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(TYPOGRAPHY.font_xs_px))
                    .font_weight(FontWeight::MEDIUM)
            };
            let mut apply = label(LINK_APPLY_WIDTH)
                .id("link_apply")
                .bg(palette.brand)
                .text_color(palette.on_accent)
                .snapshot(
                    "overlay.format_toolbar.link_apply",
                    Some("overlay.format_toolbar"),
                )
                .snapshot_text("Apply")
                .child("Apply");
            let mut remove_pill = label(LINK_REMOVE_WIDTH)
                .text_color(palette.text_secondary)
                .child("Remove");
            let mut remove = div()
                .id("link_remove")
                .group("link-remove")
                .flex_none()
                .w(px(LINK_REMOVE_WIDTH + LINK_GAP))
                .h(px(TOOLBAR_BUTTON))
                .pl(px(LINK_GAP))
                .rounded(px(radius))
                .snapshot(
                    "overlay.format_toolbar.link_remove",
                    Some("overlay.format_toolbar"),
                )
                .snapshot_text("Remove");
            if interactive {
                apply = apply
                    .cursor_pointer()
                    .on_click(emit(cx, |_: &ClickEvent| OverlayEvent::LinkApply));
                remove_pill = remove_pill.group_hover("link-remove", move |style| style.bg(hover));
                remove = remove
                    .cursor_pointer()
                    .on_click(emit(cx, |_: &ClickEvent| OverlayEvent::LinkRemove));
            }
            root = root.child(
                div()
                    .flex_none()
                    .w(px(inner_width))
                    .h(px(TOOLBAR_BUTTON))
                    .px(px(TOOLBAR_GAP / 2.0))
                    .flex()
                    .items_center()
                    .child(field.mr(px(LINK_GAP)))
                    .child(apply)
                    .child(remove.child(remove_pill)),
            );
        }
        Some(root.into_any_element())
    }
}
