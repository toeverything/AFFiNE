mod geometry;

pub(super) use geometry::{
    align_glyph, caret_world_rect, drag_handle_rect, drop_slot, emit, hover_block, icon, place,
    text_len,
};
pub use geometry::{block_text, bounding_rect, find_parent, shared_alignment};

use blocksuite_playground_doc::{read::BlockContent, schema::ListType};
use ui::{
    AnyElement, ClickEvent, Context, FontWeight, MouseButton, MouseDownEvent, SharedString, Window,
    canvas, div, point, prelude::*, px, size,
};

use crate::{
    block_flow::{
        CODE_RADIUS, FlowKind, FlowRect, PAGE_SURFACE_ID, PagePaint,
        heading_marker_rect_for_direction, paint_chevron, paragraph_spec,
    },
    rich_text::DecorationKind,
    theme::{Palette, TYPOGRAPHY},
};

use super::*;

impl Overlays {
    /// Build what the overlays draw inside the page viewport, in the viewport element's
    /// coordinates and above every block: block controls, the drag handle and the drop
    /// indicator. Also returns the per-block paint state of the frame.
    pub fn page_layer<V: OverlayHost>(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        window: &mut Window,
        cx: &mut Context<V>,
    ) -> (PagePaint, Vec<AnyElement>) {
        self.reconcile(scene, now_ms);
        if self.in_flight(now_ms) {
            window.request_animation_frame();
        }

        let mut paint = PagePaint::default();
        for (block_id, motion) in &self.chevrons {
            paint.blocks.entry(block_id.clone()).or_default().chevron =
                Some(motion.value_at(now_ms) as f32);
        }
        for block in &scene.layout.blocks {
            if let Some(code) = block.body.code_scroll
                && code.initial_x > 0.0
                && !self.code_scroll.contains_key(&block.block_id)
            {
                paint
                    .blocks
                    .entry(block.block_id.clone())
                    .or_default()
                    .code_scroll_x = code.initial_x;
            }
        }
        for (block_id, scroll) in &self.code_scroll {
            paint
                .blocks
                .entry(block_id.clone())
                .or_default()
                .code_scroll_x = *scroll;
        }

        let direction = scene.direction;
        let viewport = scene.page_viewport();
        let layout = scene.layout;
        let mut elements = Vec::new();

        // The block being dragged is tinted where it still sits.
        if let Some(block) = self
            .drag
            .as_ref()
            .and_then(|drag| layout.block(&drag.block_id))
        {
            let rect = block.rect();
            if viewport.intersects(&rect) {
                elements.push(
                    place(viewport.to_local(&rect))
                        .rounded(px(4.0))
                        .bg(palette.hover)
                        .into_any_element(),
                );
            }
        }

        let hover_filled = palette
            .theme
            .css_var("--affine-hover-color-filled")
            .unwrap_or(palette.background_secondary);
        for block in &layout.blocks {
            let rect = block.rect();
            if !viewport.intersects(&rect) {
                continue;
            }
            let hovered = self.hovered.as_deref() == Some(block.block_id.as_str());
            if block.has_gutter_chevron {
                let own_marker = block.body.chevron();
                let turning = paint
                    .blocks
                    .get(&block.block_id)
                    .and_then(|state| state.chevron);
                if own_marker.is_some() || hovered || turning.is_some() {
                    let line_height = match block.body.kind {
                        FlowKind::Paragraph(paragraph) => paragraph_spec(paragraph).line_height,
                        _ => {
                            paragraph_spec(blocksuite_playground_doc::schema::ParagraphType::Text)
                                .line_height
                        }
                    };
                    let marker = heading_marker_rect_for_direction(line_height, rect.w, direction);
                    let target = FlowRect::new(
                        rect.x + marker.x + (marker.w - CONTROL_HIT_SIZE) / 2.0,
                        rect.y + marker.y + (marker.h - CONTROL_HIT_SIZE) / 2.0,
                        CONTROL_HIT_SIZE,
                        CONTROL_HIT_SIZE,
                    );
                    let event = OverlayEvent::ToggleCollapsed(block.block_id.clone());
                    let mut element = place(viewport.to_local(&target))
                        .id(SharedString::from(format!("collapse-{}", block.block_id)))
                        .cursor_pointer()
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                    if viewport.fully_visible(&target) {
                        element = element.snapshot(
                            SharedString::from(format!("{}.collapse", block.snapshot_id)),
                            Some(PAGE_SURFACE_ID),
                        );
                    }
                    if own_marker.is_none() {
                        let progress = turning.unwrap_or(1.0);
                        let color = palette.icon;
                        let inset = (CONTROL_HIT_SIZE - marker.w) / 2.0;
                        element = element.child(
                            canvas(
                                |_, _, _| (),
                                move |bounds, _, window, cx| {
                                    let glyph = ui::Bounds::new(
                                        point(
                                            bounds.origin.x + px(inset),
                                            bounds.origin.y + px(inset),
                                        ),
                                        size(px(marker.w), px(marker.h)),
                                    );
                                    paint_chevron(glyph, progress, color, window, cx);
                                },
                            )
                            .size_full(),
                        );
                    }
                    elements.push(element.into_any_element());
                }
            }
            match block.body.kind {
                FlowKind::List(kind @ (ListType::Todo | ListType::Toggle)) => {
                    let Some(prefix) = block.body.prefix else {
                        continue;
                    };
                    let target_x = match direction {
                        ui::Direction::Ltr => rect.x,
                        ui::Direction::Rtl => rect.right() - CONTROL_HIT_SIZE,
                    };
                    let target = FlowRect::new(
                        target_x,
                        rect.y + prefix.y + (prefix.h - CONTROL_HIT_SIZE) / 2.0,
                        CONTROL_HIT_SIZE,
                        CONTROL_HIT_SIZE,
                    );
                    let (suffix, event) = match kind {
                        ListType::Todo => (
                            "checkbox",
                            OverlayEvent::ToggleChecked(block.block_id.clone()),
                        ),
                        _ => (
                            "toggle",
                            OverlayEvent::ToggleCollapsed(block.block_id.clone()),
                        ),
                    };
                    let mut element = place(viewport.to_local(&target))
                        .id(SharedString::from(format!("{suffix}-{}", block.block_id)))
                        .cursor_pointer()
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                    if viewport.fully_visible(&target) {
                        element = element.snapshot(
                            SharedString::from(format!("{}.{suffix}", block.snapshot_id)),
                            Some(PAGE_SURFACE_ID),
                        );
                    }
                    elements.push(element.into_any_element());
                }
                FlowKind::Code => {
                    let copied = self.copied_block() == Some(block.block_id.as_str());
                    if !hovered && !copied {
                        continue;
                    }
                    let width = if copied {
                        COPIED_LABEL_WIDTH
                    } else {
                        COPY_BUTTON_SIZE
                    };
                    let target = FlowRect::new(
                        rect.right() - COPY_BUTTON_INSET - width,
                        rect.y + COPY_BUTTON_INSET,
                        width,
                        COPY_BUTTON_SIZE,
                    );
                    let event = OverlayEvent::CopyCode(block.block_id.clone());
                    let mut element = place(viewport.to_local(&target))
                        .id(SharedString::from(format!("copy-{}", block.block_id)))
                        .rounded(px(CODE_RADIUS - COPY_BUTTON_INSET))
                        .bg(palette.background)
                        .border_1()
                        .border_color(palette.border)
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .hover(move |style| style.bg(hover_filled))
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                    if viewport.fully_visible(&target) {
                        element = element
                            .snapshot(
                                SharedString::from(format!("{}.copy", block.snapshot_id)),
                                Some(PAGE_SURFACE_ID),
                            )
                            .snapshot_focused(copied)
                            .snapshot_text(if copied { "Copied" } else { "Copy" });
                    }
                    let element = if copied {
                        element
                            .text_size(px(TYPOGRAPHY.font_xs_px))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(palette.text_secondary)
                            .child("Copied")
                    } else {
                        element.child(icon("CopyIcon", 16.0, palette.icon))
                    };
                    elements.push(element.into_any_element());
                }
                FlowKind::Latex => {
                    let initial = scene
                        .snapshot
                        .root
                        .as_ref()
                        .and_then(|root| find_parent(root, &block.block_id))
                        .and_then(|(parent, idx)| parent.children.get(idx))
                        .and_then(|node| match &node.content {
                            BlockContent::Latex { latex } => Some(latex.clone()),
                            _ => None,
                        })
                        .unwrap_or_default();
                    let event = OverlayEvent::OpenEquationEditor {
                        target: EquationTarget::Block {
                            block_id: block.block_id.clone(),
                        },
                        initial,
                    };
                    let hover_bg = palette.hover;
                    let mut element = place(viewport.to_local(&rect))
                        .id(SharedString::from(format!("latex-{}", block.block_id)))
                        .rounded(px(4.0))
                        .cursor_pointer()
                        .hover(move |style| style.bg(hover_bg))
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                    if hovered {
                        element = element.bg(hover_bg);
                    }
                    elements.push(element.into_any_element());
                }
                FlowKind::Table => {
                    let table_cells = scene.snapshot.block(&block.block_id).and_then(|n| match &n
                        .content
                    {
                        BlockContent::Table(t) => Some(&t.cells),
                        _ => None,
                    });
                    let table_scroll_x = self.code_scroll_x(&block.block_id);
                    let vis_left = rect.x;
                    let vis_right = rect.right();
                    for cell in &block.body.table_cells {
                        let raw_target = cell.rect.translated(rect.x - table_scroll_x, rect.y);
                        let left = raw_target.x.max(vis_left);
                        let right = raw_target.right().min(vis_right);
                        if right <= left {
                            continue;
                        }
                        let target = FlowRect::new(left, raw_target.y, right - left, raw_target.h);
                        if !viewport.intersects(&target) {
                            continue;
                        }
                        let initial = table_cells
                            .and_then(|cells| {
                                cells
                                    .get(&(cell.row_id.clone(), cell.column_id.clone()))
                                    .map(|c| c.text.plain.clone())
                            })
                            .unwrap_or_default();
                        let (bid, rid, cid) = (
                            block.block_id.clone(),
                            cell.row_id.clone(),
                            cell.column_id.clone(),
                        );
                        let mut element = place(viewport.to_local(&target))
                            .id(SharedString::from(format!("table-cell-{bid}-{rid}-{cid}")))
                            .cursor(ui::CursorStyle::IBeam)
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |view: &mut V, ev: &MouseDownEvent, w, cx| {
                                    cx.stop_propagation();
                                    let pos = (f32::from(ev.position.x), f32::from(ev.position.y));
                                    view.dispatch_overlay(
                                        OverlayEvent::FocusTableCell {
                                            block_id: bid.clone(),
                                            row_id: rid.clone(),
                                            column_id: cid.clone(),
                                            screen_pos: Some(pos),
                                        },
                                        w,
                                        cx,
                                    );
                                }),
                            );
                        if viewport.fully_visible(&target) {
                            let id = format!(
                                "{}.cell.{}.{}",
                                block.snapshot_id, cell.row_id, cell.column_id
                            );
                            element = element
                                .snapshot(SharedString::from(id), Some(PAGE_SURFACE_ID))
                                .snapshot_text(initial);
                        }
                        elements.push(element.into_any_element());
                    }
                }
                FlowKind::Attachment => {
                    if let Some(pdf) = block.body.pdf_controls {
                        for (suffix, local_rect, delta, label) in [
                            ("pdf_prev", pdf.prev, -1, "Prev"),
                            ("pdf_next", pdf.next, 1, "Next"),
                        ] {
                            let target = local_rect.translated(rect.x, rect.y);
                            if !viewport.intersects(&target) {
                                continue;
                            }
                            let event = OverlayEvent::AttachmentPdfPage {
                                block_id: block.block_id.clone(),
                                delta,
                            };
                            let mut element = place(viewport.to_local(&target))
                                .id(SharedString::from(format!("{suffix}-{}", block.block_id)))
                                .cursor_pointer()
                                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                                .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                            if viewport.fully_visible(&target) {
                                element = element
                                    .snapshot(
                                        SharedString::from(format!(
                                            "{}.{suffix}",
                                            block.snapshot_id
                                        )),
                                        Some(PAGE_SURFACE_ID),
                                    )
                                    .snapshot_text(label);
                            }
                            elements.push(element.into_any_element());
                        }
                    }
                }
                FlowKind::EmbedLinkedDoc | FlowKind::EmbedSyncedDoc => {
                    if let Some(page_id) =
                        scene
                            .snapshot
                            .block(&block.block_id)
                            .and_then(|n| match &n.content {
                                BlockContent::EmbedLinkedDoc { page_id, .. }
                                | BlockContent::EmbedSyncedDoc { page_id, .. } => {
                                    Some(page_id.clone())
                                }
                                _ => None,
                            })
                    {
                        let event = OverlayEvent::OpenEmbedDoc { page_id };
                        let hovered_synced = matches!(block.body.kind, FlowKind::EmbedSyncedDoc)
                            && self.hovered.as_deref() == Some(block.block_id.as_str());
                        let mut element = place(viewport.to_local(&rect))
                            .id(SharedString::from(format!("embed-doc-{}", block.block_id)))
                            .cursor_pointer()
                            .when(hovered_synced, |el| {
                                el.rounded(px(8.0)).border_1().border_color(palette.border)
                            })
                            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                            .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                        if matches!(block.body.kind, FlowKind::EmbedSyncedDoc) {
                            let border = palette.border;
                            element = element
                                .hover(move |s| s.rounded(px(8.0)).border_1().border_color(border));
                        }
                        elements.push(element.into_any_element());
                    }
                }
                _ => {}
            }
            if let Some(body_text) = &block.body.text {
                for deco in body_text.layout.decorations() {
                    if let DecorationKind::LatexChip(latex) = &deco.kind {
                        let chip_rect = FlowRect::new(
                            rect.x + body_text.x + f32::from(deco.bounds.origin.x),
                            rect.y + body_text.y + f32::from(deco.bounds.origin.y),
                            f32::from(deco.bounds.size.width),
                            f32::from(deco.bounds.size.height),
                        );
                        if !viewport.intersects(&chip_rect) {
                            continue;
                        }
                        let event = OverlayEvent::OpenEquationEditor {
                            target: EquationTarget::Inline {
                                block_id: block.block_id.clone(),
                                utf16_offset: deco.source_utf16.start,
                            },
                            initial: latex.clone(),
                        };
                        let element = place(viewport.to_local(&chip_rect))
                            .id(SharedString::from(format!(
                                "inline-latex-{}-{}",
                                block.block_id, deco.source_utf16.start
                            )))
                            .cursor_pointer()
                            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                            .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                        elements.push(element.into_any_element());
                    }
                }
            }
        }

        // Gutter handle of the hovered block, or of the block being dragged.
        let dragging = self.drag.is_some();
        let handle_block = self
            .drag
            .as_ref()
            .map(|drag| drag.block_id.as_str())
            .or(self.hovered.as_deref())
            .and_then(|block_id| layout.block(block_id));
        if let Some(block) = handle_block
            && let Some(target) = drag_handle_rect(
                block,
                scene.geometry.column_x,
                scene.window.0,
                direction,
                block.has_gutter_chevron,
            )
            && viewport.intersects(&target)
        {
            let block_id = block.block_id.clone();
            let mut element = place(viewport.to_local(&target))
                .id("drag-handle")
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(move |view, _: &MouseDownEvent, window, cx| {
                        view.dispatch_overlay(
                            OverlayEvent::DragStart(block_id.clone()),
                            window,
                            cx,
                        );
                        cx.stop_propagation();
                    }),
                );
            element = if dragging {
                element.cursor_grabbing()
            } else {
                element.cursor_grab()
            };
            if viewport.fully_visible(&target) {
                element = element
                    .snapshot("overlay.drag_handle", Some(PAGE_SURFACE_ID))
                    .snapshot_focused(dragging)
                    .snapshot_text(block.block_id.clone());
            }
            // BlockSuite's Page-mode grabber: a 4 × 12 px bar while the pointer is on the
            // block's row, narrowing to a 2 × 12 px vertical bar when hovered or dragged.
            let theme = palette.theme;
            let grip = if dragging || self.handle_hot {
                let color = theme
                    .css_var("--affine-v2-icon-secondary")
                    .unwrap_or(palette.icon);
                div()
                    .flex_none()
                    .w(px(DRAG_GRABBER_HOT_WIDTH))
                    .h(px(DRAG_GRABBER_HEIGHT))
                    .rounded(px(1.0))
                    .bg(color)
            } else {
                div()
                    .flex_none()
                    .w(px(DRAG_GRABBER_WIDTH))
                    .h(px(DRAG_GRABBER_HEIGHT))
                    .rounded(px(1.0))
                    .bg(palette.placeholder)
            };
            elements.push(element.child(grip).into_any_element());
        }

        if let Some(slot) = self.drop_slot() {
            let (line_x, line_w) = match direction {
                ui::Direction::Ltr => (
                    slot.indicator_world_x,
                    (layout.width - slot.indicator_world_x).max(0.0),
                ),
                ui::Direction::Rtl => (0.0, slot.indicator_world_width.max(0.0)),
            };
            let line = FlowRect::new(
                line_x,
                slot.indicator_world_y - DROP_INDICATOR_THICKNESS / 2.0,
                line_w,
                DROP_INDICATOR_THICKNESS,
            );
            if viewport.intersects(&line) {
                let mut element = place(viewport.to_local(&line))
                    .rounded(px(DROP_INDICATOR_THICKNESS / 2.0))
                    .bg(palette.brand);
                if viewport.fully_visible(&line) {
                    element = element.snapshot("overlay.drop_indicator", Some(PAGE_SURFACE_ID));
                }
                elements.push(element.into_any_element());
            }
        }

        (paint, elements)
    }
}
