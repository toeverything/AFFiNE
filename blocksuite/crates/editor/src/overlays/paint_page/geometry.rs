//! Pure geometry, hit-testing, and block-tree helpers for Page-layer overlays.

use std::collections::HashMap;

use blocksuite_playground_doc::{
    read::{BlockContent, BlockNode, RichText, TextAlign as BlockAlign},
    schema::ParagraphType,
};
use ui::{App, Context, Div, Hsla, Window, canvas, div, point, prelude::*, px, size};

use crate::{
    TOPBAR_HEIGHT,
    block_flow::{FlowBlock, FlowKind, FlowLayout, FlowRect},
    theme::IconPaint,
};

use super::{
    CONTROL_HIT_SIZE, DRAG_HANDLE_MIN_X, DRAG_HANDLE_SIZE, DropSlot, HOVER_SLACK, OverlayEvent,
    OverlayHost, OverlayScene,
};

/// Hit target of a block's gutter handle in world space, `None` where the gutter has no
/// room for it. The handle hangs left of the block on its first line; a heading keeps the
/// place next to its text for its collapse chevron, so its handle sits one step further
/// out and is left away where the gutter is too narrow for both.
pub(crate) fn drag_handle_rect(
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
pub(crate) fn place(rect: FlowRect) -> Div {
    div()
        .absolute()
        .left(px(rect.x))
        .top(px(rect.y))
        .w(px(rect.w))
        .h(px(rect.h))
}

/// A generated icon as a fixed-size element.
pub(crate) fn icon(name: &'static str, side: f32, color: Hsla) -> impl IntoElement {
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
pub(crate) fn align_glyph(align: BlockAlign, color: Hsla) -> impl IntoElement {
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
pub(crate) fn emit<V: OverlayHost, E: 'static>(
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

pub(crate) fn is_heading(kind: FlowKind) -> bool {
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

pub(crate) fn text_len(scene: &OverlayScene<'_>, block_id: &str) -> usize {
    scene
        .snapshot
        .block(block_id)
        .and_then(block_text)
        .map_or(0, |text| text.plain.encode_utf16().count())
}

/// The block whose row the pointer is on, if any. The title is not a block of the flow.
pub(crate) fn hover_block(scene: &OverlayScene<'_>, x: f32, y: f32) -> Option<String> {
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
pub(crate) fn caret_world_rect(
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
pub(crate) fn drop_slot(
    scene: &OverlayScene<'_>,
    block_id: &str,
    world_y: f32,
) -> Option<DropSlot> {
    let root = scene.snapshot.root.as_ref()?;
    let (parent, old_index) = find_parent(root, block_id)?;
    let blocks = &scene.layout.blocks;
    let laid_out: HashMap<&str, usize> = blocks
        .iter()
        .enumerate()
        .map(|(at, block)| (block.block_id.as_str(), at))
        .collect();
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
