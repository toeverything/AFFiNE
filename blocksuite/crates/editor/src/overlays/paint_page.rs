use std::collections::HashMap;

use blocksuite_playground_doc::{
    read::{BlockContent, BlockNode, RichText, TextAlign as BlockAlign},
    schema::{ListType, ParagraphType},
};
use ui::{
    AnyElement, App, ClickEvent, Context, Div, FontWeight, Hsla, MouseButton, MouseDownEvent,
    SharedString, Window, canvas, div, point, prelude::*, px, size,
};

use crate::{
    TOPBAR_HEIGHT,
    block_flow::{
        CODE_RADIUS, FlowBlock, FlowKind, FlowLayout, FlowRect, PAGE_SURFACE_ID, PagePaint,
        heading_marker_rect_for_direction, paint_chevron, paragraph_spec,
    },
    rich_text::DecorationKind,
    theme::{IconPaint, Palette, TYPOGRAPHY},
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
                kind if is_heading(kind) => {
                    // A collapsed heading paints its own marker; an expanded one shows a
                    // chevron only while the pointer is on its row or while it turns.
                    let own_marker = block.body.chevron();
                    let turning = paint
                        .blocks
                        .get(&block.block_id)
                        .and_then(|state| state.chevron);
                    if own_marker.is_none() && !hovered && turning.is_none() {
                        continue;
                    }
                    let FlowKind::Paragraph(paragraph) = kind else {
                        continue;
                    };
                    let marker = heading_marker_rect_for_direction(
                        paragraph_spec(paragraph).line_height,
                        rect.w,
                        direction,
                    );
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
                    let element = place(viewport.to_local(&rect))
                        .id(SharedString::from(format!("latex-{}", block.block_id)))
                        .cursor_pointer()
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                    elements.push(element.into_any_element());
                }
                FlowKind::Table => {
                    let table_cells = scene.snapshot.block(&block.block_id).and_then(|n| match &n
                        .content
                    {
                        BlockContent::Table(t) => Some(&t.cells),
                        _ => None,
                    });
                    for cell in &block.body.table_cells {
                        let target = cell.rect.translated(rect.x, rect.y);
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
                        let element = place(viewport.to_local(&rect))
                            .id(SharedString::from(format!("embed-doc-{}", block.block_id)))
                            .cursor_pointer()
                            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                            .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
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
            && let Some(target) =
                drag_handle_rect(block, scene.geometry.column_x, scene.window.0, direction)
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

/// Hit target of a block's gutter handle in world space, `None` where the gutter has no
/// room for it. The handle hangs left of the block on its first line; a heading keeps the
/// place next to its text for its collapse chevron, so its handle sits one step further
/// out and is left away where the gutter is too narrow for both.
pub(super) fn drag_handle_rect(
    block: &FlowBlock,
    column_x: f32,
    window_width: f32,
    direction: ui::Direction,
) -> Option<FlowRect> {
    let body = &block.body;
    if body.kind == FlowKind::Title {
        return None;
    }
    let center_y = match &body.text {
        Some(text) if body.kind != FlowKind::Code => text.y + text.layout.line_height() / 2.0,
        _ => (body.height / 2.0).min(18.0),
    };
    let heading = is_heading(body.kind);
    let handle_x = match direction {
        ui::Direction::Ltr => {
            let wanted = block.x - DRAG_HANDLE_SIZE - if heading { CONTROL_HIT_SIZE } else { 0.0 };
            // `DRAG_HANDLE_MIN_X` is a screen coordinate; the world starts at `column_x`.
            let min_x = DRAG_HANDLE_MIN_X - column_x;
            if heading && wanted < min_x {
                return None;
            }
            wanted.max(min_x)
        }
        ui::Direction::Rtl => {
            let wanted = block.rect().right() + if heading { CONTROL_HIT_SIZE } else { 0.0 };
            let max_x = window_width - DRAG_HANDLE_MIN_X - column_x - DRAG_HANDLE_SIZE;
            if heading && wanted > max_x {
                return None;
            }
            wanted.min(max_x)
        }
    };
    Some(FlowRect::new(
        handle_x,
        (block.y + center_y - DRAG_HANDLE_SIZE / 2.0).round(),
        DRAG_HANDLE_SIZE,
        DRAG_HANDLE_SIZE,
    ))
}

/// An absolutely positioned box at `rect`.
pub(super) fn place(rect: FlowRect) -> Div {
    div()
        .absolute()
        .left(px(rect.x))
        .top(px(rect.y))
        .w(px(rect.w))
        .h(px(rect.h))
}

/// A generated icon as a fixed-size element.
pub(super) fn icon(name: &'static str, side: f32, color: Hsla) -> impl IntoElement {
    let icon = IconPaint::named(name);
    canvas(
        |_, _, _| (),
        move |bounds, _, window, cx| icon.paint(bounds, color, window, cx),
    )
    .flex_none()
    .w(px(side))
    .h(px(side))
}

/// Text alignment glyph: four bars, the short ones on the side the text aligns to.
pub(super) fn align_glyph(align: BlockAlign, color: Hsla) -> impl IntoElement {
    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            const LONG: f32 = 14.0;
            const SHORT: f32 = 8.0;
            for (index, width) in [LONG, SHORT, LONG, SHORT].into_iter().enumerate() {
                let x = 3.0
                    + match align {
                        BlockAlign::Left => 0.0,
                        BlockAlign::Center => (LONG - width) / 2.0,
                        BlockAlign::Right => LONG - width,
                    };
                let bar = ui::Bounds::new(
                    point(
                        bounds.origin.x + px(x),
                        bounds.origin.y + px(3.5 + index as f32 * 4.0),
                    ),
                    size(px(width), px(1.5)),
                );
                window.paint_quad(ui::fill(bar, color).corner_radii(px(0.75)));
            }
        },
    )
    .flex_none()
    .w(px(20.0))
    .h(px(20.0))
}

/// A listener that turns an input event into an [`OverlayEvent`] for the view.
pub(super) fn emit<V: OverlayHost, E: 'static>(
    cx: &Context<V>,
    event: impl Fn(&E) -> OverlayEvent + 'static,
) -> impl Fn(&E, &mut Window, &mut App) + 'static {
    cx.listener(move |view: &mut V, input: &E, window, cx| {
        view.dispatch_overlay(event(input), window, cx);
    })
}

/// The alignment the blocks `ids` under `node` share: `Some(None)` once two of them
/// differ. A block that sets none takes its nearest aligned ancestor's, like the renderer.
pub fn shared_alignment(
    node: &BlockNode,
    inherited: BlockAlign,
    ids: &[&str],
    shared: &mut Option<Option<BlockAlign>>,
) {
    let own = match &node.content {
        BlockContent::Paragraph { text_align, .. } | BlockContent::List { text_align, .. } => {
            text_align.unwrap_or(inherited)
        }
        _ => inherited,
    };
    if ids.contains(&node.id.as_str()) {
        *shared = Some(match *shared {
            None => Some(own),
            Some(all) => all.filter(|all| *all == own),
        });
    }
    for child in &node.children {
        shared_alignment(child, own, ids, shared);
    }
}

pub(super) fn is_heading(kind: FlowKind) -> bool {
    matches!(
        kind,
        FlowKind::Paragraph(
            ParagraphType::H1
                | ParagraphType::H2
                | ParagraphType::H3
                | ParagraphType::H4
                | ParagraphType::H5
                | ParagraphType::H6
        )
    )
}

/// Parent of block `id` and the block's index among the parent's children.
pub fn find_parent<'a>(node: &'a BlockNode, id: &str) -> Option<(&'a BlockNode, usize)> {
    if let Some(index) = node.children.iter().position(|child| child.id == id) {
        return Some((node, index));
    }
    node.children
        .iter()
        .find_map(|child| find_parent(child, id))
}

pub fn block_text(node: &BlockNode) -> Option<&RichText> {
    match &node.content {
        BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => Some(text),
        _ => None,
    }
}

pub(super) fn text_len(scene: &OverlayScene<'_>, block_id: &str) -> usize {
    scene
        .snapshot
        .block(block_id)
        .and_then(block_text)
        .map_or(0, |text| text.plain.encode_utf16().count())
}

/// The block whose row the pointer is on, if any. The title is not a block of the flow.
pub(super) fn hover_block(scene: &OverlayScene<'_>, x: f32, y: f32) -> Option<String> {
    if y < TOPBAR_HEIGHT || x < 0.0 || x >= scene.window.0 {
        return None;
    }
    let (_, world_y) = scene.screen_to_world(x, y);
    let mut best: Option<(f32, &FlowBlock)> = None;
    for block in &scene.layout.blocks {
        if block.body.kind == FlowKind::Title {
            continue;
        }
        let rect = block.rect();
        let distance = if world_y < rect.y {
            rect.y - world_y
        } else if world_y >= rect.bottom() {
            world_y - rect.bottom()
        } else {
            0.0
        };
        if distance <= HOVER_SLACK && best.is_none_or(|(nearest, _)| distance < nearest) {
            best = Some((distance, block));
        }
    }
    best.map(|(_, block)| block.block_id.clone())
}

/// World-space caret box of a UTF-16 offset in a block; the block's top-left corner for a
/// block without text.
pub(super) fn caret_world_rect(
    layout: &FlowLayout,
    block_id: &str,
    utf16_offset: usize,
) -> Option<FlowRect> {
    let block = layout.block(block_id)?;
    Some(match &block.body.text {
        Some(text) => {
            let (x, line) = text.layout.caret(utf16_offset);
            let line_height = text.layout.line_height();
            FlowRect::new(
                block.x + text.x + x,
                block.y + text.y + line as f32 * line_height,
                1.0,
                line_height,
            )
        }
        None => FlowRect::new(block.x, block.y, 1.0, block.body.height.min(24.0)),
    })
}

pub fn bounding_rect(rects: &[FlowRect]) -> Option<FlowRect> {
    let first = rects.first()?;
    let (mut left, mut top, mut right, mut bottom) =
        (first.x, first.y, first.right(), first.bottom());
    for rect in &rects[1..] {
        left = left.min(rect.x);
        top = top.min(rect.y);
        right = right.max(rect.right());
        bottom = bottom.max(rect.bottom());
    }
    Some(FlowRect::new(left, top, right - left, bottom - top))
}

/// The nearest slot among the dragged block's siblings for a pointer at `world_y`.
pub(super) fn drop_slot(
    scene: &OverlayScene<'_>,
    block_id: &str,
    world_y: f32,
) -> Option<DropSlot> {
    let root = scene.snapshot.root.as_ref()?;
    let (parent, old_index) = find_parent(root, block_id)?;
    let blocks = &scene.layout.blocks;
    // One pass over the layout, so a parent with thousands of children is no slower to
    // drag in than a short one.
    let laid_out: HashMap<&str, usize> = blocks
        .iter()
        .enumerate()
        .map(|(at, block)| (block.block_id.as_str(), at))
        .collect();
    // Siblings that are laid out, as (index among the parent's children, index in layout).
    let siblings: Vec<(usize, usize)> = parent
        .children
        .iter()
        .enumerate()
        .filter_map(|(raw, child)| laid_out.get(child.id.as_str()).map(|at| (raw, *at)))
        .collect();
    let &(_, first_at) = siblings.first()?;
    let &(last_raw, last_at) = siblings.last()?;
    let x = blocks[first_at].x;
    let sibling_width = blocks[first_at].body.width;

    let mut candidates: Vec<(usize, f32)> = siblings
        .iter()
        .map(|&(raw, at)| {
            let top = blocks[at].y;
            let above = match at.checked_sub(1) {
                Some(previous) => blocks[previous].rect().bottom(),
                None => top,
            };
            (raw, ((above + top) / 2.0).round())
        })
        .collect();
    // Below the last sibling and everything nested under it (compare logical indent edge).
    let mut end = last_at;
    while end + 1 < blocks.len()
        && match scene.direction {
            ui::Direction::Ltr => blocks[end + 1].x > blocks[last_at].x,
            ui::Direction::Rtl => blocks[end + 1].rect().right() < blocks[last_at].rect().right(),
        }
    {
        end += 1;
    }
    let bottom = blocks[end].rect().bottom();
    let below = blocks.get(end + 1).map_or(bottom + 10.0, |block| block.y);
    candidates.push((last_raw + 1, ((bottom + below) / 2.0).round()));

    let (insert_index, indicator_world_y) = candidates
        .into_iter()
        .min_by(|a, b| (a.1 - world_y).abs().total_cmp(&(b.1 - world_y).abs()))?;
    Some(DropSlot {
        parent_id: parent.id.clone(),
        insert_index,
        old_index,
        indicator_world_y,
        indicator_world_x: x,
        indicator_world_width: sibling_width,
    })
}
