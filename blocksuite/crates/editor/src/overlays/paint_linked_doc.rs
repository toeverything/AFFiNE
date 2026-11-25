use ui::{
    AnyElement, ClickEvent, Context, FontWeight, MouseDownEvent, MouseMoveEvent, SharedString, div,
    prelude::*, px,
};

use crate::theme::{Palette, TYPOGRAPHY};

use super::*;

impl Overlays {
    pub(super) fn render_linked_doc<V: OverlayHost>(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        cx: &mut Context<V>,
    ) -> Option<AnyElement> {
        let menu = self.linked_doc.as_mut()?;
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
        let anchor_world = caret_world_rect(scene.layout, &menu.block_id, menu.utf16_offset)?;
        if !scene.page_viewport().intersects(&anchor_world) {
            return None;
        }
        let anchor = scene.world_to_screen(&anchor_world);
        let viewport = scene.popover_viewport();

        let visible_items = menu.results.items.len().min(6);
        let row_count = visible_items + 1;
        menu.selected = menu.selected.min(row_count.saturating_sub(1));
        let selected = menu.selected;

        let width = SLASH_MENU_WIDTH
            .min(viewport.w - 2.0 * POPOVER_EDGE_MARGIN)
            .max(0.0)
            .floor();
        let list_width = (width - 2.0 * SLASH_MENU_PADDING).max(0.0);
        let header_h = SLASH_HEADER_HEIGHT;
        let height = 2.0 * SLASH_MENU_PADDING + header_h + row_count as f32 * SLASH_ITEM_HEIGHT;
        let placed = place_popover(
            anchor,
            (width, height),
            viewport,
            Placement::BelowStart,
            POPOVER_GAP,
            POPOVER_EDGE_MARGIN,
        );
        menu.rect = Some(placed.rect);

        let mut panel = place(placed.rect)
            .id("linked-doc-menu")
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
            .snapshot("overlay.linked_doc_menu", Some("root.canvas"))
            .snapshot_focused(interactive)
            .snapshot_text(menu.query.clone());
        if interactive {
            panel = panel
                .occlude()
                .on_mouse_down_out(emit(cx, |_: &MouseDownEvent| {
                    OverlayEvent::CloseLinkedDocMenu
                }));
        }

        panel = panel.child(
            div()
                .flex_none()
                .w(px(list_width))
                .h(px(header_h))
                .px(px(8.0))
                .flex()
                .items_center()
                .text_size(px(TYPOGRAPHY.font_xs_px))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_secondary)
                .child("Link to doc"),
        );

        let title_width = (list_width - 16.0 - 20.0 - 8.0).max(0.0);
        for (idx, matched) in menu.results.items.iter().take(visible_items).enumerate() {
            let is_selected = idx == selected;
            let icon_name = match matched.doc.mode {
                crate::directory::EditorDocMode::Page => "PageIcon",
                crate::directory::EditorDocMode::Edgeless => "EdgelessIcon",
            };
            let label = if matched.doc.title.is_empty() {
                "Untitled".to_string()
            } else {
                matched.doc.title.clone()
            };
            let mut row = div()
                .id(SharedString::from(format!("linked-doc-item-{idx}")))
                .flex_none()
                .w(px(list_width))
                .h(px(SLASH_ITEM_HEIGHT))
                .px(px(8.0))
                .rounded(px(4.0))
                .flex()
                .items_center()
                .gap(px(8.0))
                .text_size(px(TYPOGRAPHY.font_sm_px))
                .text_color(palette.text_primary)
                .snapshot(
                    SharedString::from(format!("overlay.linked_doc_menu.item.{idx}")),
                    Some("overlay.linked_doc_menu"),
                )
                .snapshot_focused(is_selected)
                .snapshot_text(label.clone());
            if is_selected {
                row = row.bg(palette.hover);
            }
            if interactive {
                row = row
                    .cursor_pointer()
                    .on_mouse_move(emit(cx, move |_: &MouseMoveEvent| {
                        OverlayEvent::LinkedDocHover(idx)
                    }))
                    .on_click(emit(cx, move |_: &ClickEvent| {
                        OverlayEvent::LinkedDocSelect(idx)
                    }));
            }
            panel = panel.child(
                row.child(icon(icon_name, 16.0, palette.icon)).child(
                    div()
                        .w(px(title_width))
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .child(label),
                ),
            );
        }

        let create_idx = visible_items;
        let create_selected = selected == create_idx;
        let trimmed = menu.query.trim();
        let create_label = if trimmed.is_empty() {
            "Create new page".to_string()
        } else {
            format!("Create \"{trimmed}\"")
        };
        let mut create_row = div()
            .id("linked-doc-create")
            .flex_none()
            .w(px(list_width))
            .h(px(SLASH_ITEM_HEIGHT))
            .px(px(8.0))
            .rounded(px(4.0))
            .flex()
            .items_center()
            .gap(px(8.0))
            .text_size(px(TYPOGRAPHY.font_sm_px))
            .text_color(palette.text_primary)
            .snapshot(
                "overlay.linked_doc_menu.create",
                Some("overlay.linked_doc_menu"),
            )
            .snapshot_focused(create_selected)
            .snapshot_text(create_label.clone());
        if create_selected {
            create_row = create_row.bg(palette.hover);
        }
        if interactive {
            create_row = create_row
                .cursor_pointer()
                .on_mouse_move(emit(cx, move |_: &MouseMoveEvent| {
                    OverlayEvent::LinkedDocHover(create_idx)
                }))
                .on_click(emit(cx, move |_: &ClickEvent| {
                    OverlayEvent::LinkedDocSelect(create_idx)
                }));
        }
        panel = panel.child(
            create_row
                .child(icon("LinkedPageIcon", 16.0, palette.icon))
                .child(
                    div()
                        .w(px(title_width))
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .child(create_label),
                ),
        );

        Some(panel.into_any_element())
    }
}
