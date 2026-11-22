use std::{collections::HashMap, rc::Rc};

use ui::{
    AnyElement, Hsla, ShapedLine, SharedString, TextAlign, Window, canvas, div, point, prelude::*,
    px,
};

use crate::theme::{FONT_SANS, Palette, TYPOGRAPHY};

use super::*;

/// One end of a remote text selection: a UTF-16 range inside a block's text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemotePoint {
    pub block_id: String,
    pub index: usize,
    pub length: usize,
}

/// A remote collaborator's text selection (BlockSuite `TextSelection`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteSelection {
    pub from: RemotePoint,
    pub to: Option<RemotePoint>,
    pub reverse: bool,
}

/// A remote collaborator from room awareness.
#[derive(Clone, Debug, PartialEq)]
pub struct RemotePresence {
    pub client_id: u64,
    pub name: String,
    pub color: Hsla,
    pub selection: Option<RemoteSelection>,
}

/// World-space geometry of a remote collaborator's selection, caret and name tag.
pub struct PresenceMark {
    pub client_id: u64,
    pub name: SharedString,
    pub color: Hsla,
    /// `(block_id, rect)` for each selection highlight span; code-block spans are
    /// translated by `-scroll_x` before clamping in `page_elements`.
    pub highlights: Vec<(String, FlowRect)>,
    pub caret_block_id: String,
    pub caret: FlowRect,
    pub label: FlowRect,
    label_text: ShapedLine,
}

impl FlowLayout {
    /// Resolve remote selections against this layout. Collaborators whose selection points
    /// at a block that is not laid out (or has no text) produce no mark.
    pub fn presence_marks(
        &self,
        presences: &[RemotePresence],
        palette: &Palette,
        window: &Window,
    ) -> Vec<PresenceMark> {
        let text_blocks: Vec<(usize, &FlowBlock, &FlowText)> = self
            .blocks
            .iter()
            .enumerate()
            .filter_map(|(index, block)| block.body.text.as_ref().map(|text| (index, block, text)))
            .collect();
        let find = |block_id: &str| {
            text_blocks
                .iter()
                .position(|(_, block, _)| block.block_id == block_id)
        };

        let mut marks = Vec::new();
        for presence in presences {
            let Some(selection) = &presence.selection else {
                continue;
            };
            let Some(from_index) = find(&selection.from.block_id) else {
                continue;
            };
            let to_index = selection
                .to
                .as_ref()
                .and_then(|to| find(&to.block_id))
                .filter(|to_index| *to_index > from_index);

            let mut highlights = Vec::new();
            let mut cover = |position: usize, start: usize, end: usize| {
                let (_, block, text) = text_blocks[position];
                let scrollable_code = block.body.code_scroll.is_some();
                for (line, x0, x1) in text.layout.selection_spans(start, end) {
                    let left = (block.x + text.x + x0).floor();
                    let raw_right = (block.x + text.x + x1).ceil();
                    let right = if scrollable_code {
                        raw_right
                    } else {
                        raw_right.min(self.width)
                    };
                    highlights.push((
                        block.block_id.clone(),
                        FlowRect::new(
                            left,
                            block.y + text.y + line as f32 * text.layout.line_height(),
                            (right - left).max(0.0),
                            text.layout.line_height(),
                        ),
                    ));
                }
            };
            let from_end = selection.from.index.saturating_add(selection.from.length);
            cover(from_index, selection.from.index, from_end);
            if let (Some(to_index), Some(to)) = (to_index, &selection.to) {
                for between in from_index + 1..to_index {
                    cover(between, 0, usize::MAX);
                }
                cover(to_index, to.index, to.index.saturating_add(to.length));
            }

            // The caret sits at the focus end of the selection.
            let (caret_position, caret_offset) = if selection.reverse {
                (from_index, selection.from.index)
            } else {
                match (to_index, &selection.to) {
                    (Some(to_index), Some(to)) => (to_index, to.index.saturating_add(to.length)),
                    _ => (from_index, from_end),
                }
            };
            let (_, block, text) = text_blocks[caret_position];
            let (caret_x, caret_line) = text.layout.caret(caret_offset);
            let line_height = text.layout.line_height();
            let raw_caret_x = (block.x + text.x + caret_x - 1.0).round();
            let caret = FlowRect::new(
                if block.body.code_scroll.is_some() {
                    raw_caret_x
                } else {
                    raw_caret_x.clamp(0.0, (self.width - 2.0).max(0.0))
                },
                block.y + text.y + caret_line as f32 * line_height,
                2.0,
                line_height,
            );

            let label_style =
                InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 500.0, palette.on_accent);
            let max_label = (self.width - 8.0).max(1.0);
            let label_text = truncate_to_width(window, &presence.name, &label_style, max_label);
            let label_width = (f32::from(label_text.width()).ceil() + 8.0).min(self.width);
            // The tag hangs above the caret, shifted left at the column edge and flipped
            // below the caret when there is no room above.
            let label_x = caret.x.clamp(0.0, (self.width - label_width).max(0.0));
            let label_y = if caret.y >= PRESENCE_LABEL_HEIGHT {
                caret.y - PRESENCE_LABEL_HEIGHT
            } else {
                caret.bottom()
            };
            marks.push(PresenceMark {
                client_id: presence.client_id,
                name: SharedString::from(presence.name.clone()),
                color: presence.color,
                highlights,
                caret_block_id: block.block_id.clone(),
                caret,
                label: FlowRect::new(label_x, label_y, label_width, PRESENCE_LABEL_HEIGHT),
                label_text,
            });
        }
        marks
    }
}

/// Mapping of world space onto the screen for one frame.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PageViewport {
    /// X of the page column's left edge inside the viewport element.
    pub column_x: f32,
    /// Height of the viewport element.
    pub height: f32,
    /// World y shown at the top of the viewport.
    pub scroll_y: f32,
}

impl PageViewport {
    /// Whether a world-space rectangle lies completely inside the viewport, vertically.
    pub fn fully_visible(&self, rect: &FlowRect) -> bool {
        rect.y >= self.scroll_y && rect.bottom() <= self.scroll_y + self.height
    }

    /// Whether a world-space rectangle shows in the viewport at all, vertically.
    pub fn intersects(&self, rect: &FlowRect) -> bool {
        rect.bottom() > self.scroll_y && rect.y < self.scroll_y + self.height
    }

    /// A world-space rectangle in the coordinates of the viewport element.
    pub fn to_local(&self, rect: &FlowRect) -> FlowRect {
        FlowRect::new(
            self.column_x + rect.x,
            rect.y - self.scroll_y,
            rect.w,
            rect.h,
        )
    }
}

/// Snapshot parent id of every page block element.
pub const PAGE_SURFACE_ID: &str = "page.editor_surface";

/// Build the elements of the blocks and presence marks intersecting `viewport`, positioned
/// absolutely inside the viewport element. `paint` carries the per-frame state of blocks
/// that is not part of their layout (a chevron in flight, a code block's scroll).
///
/// Only blocks lying completely inside the viewport record an element snapshot: a block
/// cut by the fold is clipped on purpose and would read as a clipping fault otherwise.
pub fn page_elements(
    layout: &Rc<FlowLayout>,
    marks: Vec<PresenceMark>,
    viewport: PageViewport,
    paint: &PagePaint,
) -> Vec<AnyElement> {
    let mut elements = Vec::new();
    for block in &layout.blocks {
        let rect = block.rect();
        if !viewport.intersects(&rect) {
            continue;
        }
        let body = block.body.clone();
        let state = paint
            .blocks
            .get(&block.block_id)
            .copied()
            .unwrap_or_default();
        let mut element = div()
            .absolute()
            .left(px(viewport.column_x + rect.x))
            .top(px(rect.y - viewport.scroll_y))
            .w(px(rect.w))
            .h(px(rect.h));
        if viewport.fully_visible(&rect) {
            element = element
                .snapshot(block.snapshot_id.clone(), Some(PAGE_SURFACE_ID))
                .snapshot_text(block.body.plain.clone());
        }
        elements.push(
            element
                .child(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, window, cx| body.paint(bounds.origin, state, window, cx),
                    )
                    .size_full(),
                )
                .into_any_element(),
        );
    }

    // Presence paints after every block so name tags stay above neighbouring text. Marks
    // in a sideways-scrolled code block follow its lines and stay inside its code area;
    // each highlight span uses its own block's horizontal scroll before clamping.
    let code_blocks: HashMap<&str, ScrolledCode> = layout
        .blocks
        .iter()
        .filter_map(|block| {
            let code = block.body.code_scroll?;
            let scroll_x = paint
                .blocks
                .get(&block.block_id)
                .map_or(0.0, |state| state.code_scroll_x)
                .clamp(0.0, code.max_x);
            Some((
                block.block_id.as_str(),
                ScrolledCode {
                    block: block.rect(),
                    area: code.area.translated(block.x, block.y),
                    scroll_x,
                },
            ))
        })
        .collect();
    for mut mark in marks {
        let mut resolved_highlights = Vec::with_capacity(mark.highlights.len());
        for (block_id, rect) in &mark.highlights {
            let clamped = if let Some(code) = code_blocks.get(block_id.as_str()) {
                code.span(*rect).and_then(|r| {
                    let left = r.x.max(0.0);
                    let right = r.right().min(layout.width);
                    (right > left).then(|| FlowRect::new(left, r.y, right - left, r.h))
                })
            } else {
                let left = rect.x.max(0.0);
                let right = rect.right().min(layout.width);
                (right > left).then(|| FlowRect::new(left, rect.y, right - left, rect.h))
            };
            if let Some(rect) = clamped {
                resolved_highlights.push(rect);
            }
        }
        if let Some(code) = code_blocks.get(mark.caret_block_id.as_str()) {
            match code.caret(mark.caret) {
                Some(mut caret) => {
                    caret.x = caret.x.clamp(0.0, (layout.width - 2.0).max(0.0));
                    mark.caret = caret;
                    mark.label.x = caret.x.clamp(0.0, (layout.width - mark.label.w).max(0.0));
                }
                None => {
                    // The caret scrolled out; its name tag goes with it.
                    mark.caret.w = 0.0;
                    mark.label.w = 0.0;
                }
            }
        }
        let screen = |rect: &FlowRect| {
            FlowRect::new(
                viewport.column_x + rect.x,
                rect.y - viewport.scroll_y,
                rect.w,
                rect.h,
            )
        };
        // Same wash and corner radius as BlockSuite's remote selection rects.
        let highlight = mark.color.opacity(0.2);
        for rect in &resolved_highlights {
            if !viewport.intersects(rect) {
                continue;
            }
            let rect = screen(rect);
            elements.push(
                div()
                    .absolute()
                    .left(px(rect.x))
                    .top(px(rect.y))
                    .w(px(rect.w))
                    .h(px(rect.h))
                    .rounded(px(3.0))
                    .bg(highlight)
                    .into_any_element(),
            );
        }
        if mark.caret.w > 0.0 && viewport.intersects(&mark.caret) {
            let rect = screen(&mark.caret);
            let mut caret = div()
                .absolute()
                .left(px(rect.x))
                .top(px(rect.y))
                .w(px(rect.w))
                .h(px(rect.h))
                .bg(mark.color);
            if viewport.fully_visible(&mark.caret) {
                caret = caret.snapshot(
                    SharedString::from(format!("page.presence.{}.caret", mark.client_id)),
                    Some(PAGE_SURFACE_ID),
                );
            }
            elements.push(caret.into_any_element());
        }
        if mark.label.w > 0.0 && viewport.intersects(&mark.label) {
            let rect = screen(&mark.label);
            let text = mark.label_text.clone();
            let mut label = div()
                .absolute()
                .left(px(rect.x))
                .top(px(rect.y))
                .w(px(rect.w))
                .h(px(rect.h))
                .rounded(px(4.0))
                .bg(mark.color);
            if viewport.fully_visible(&mark.label) {
                label = label
                    .snapshot(
                        SharedString::from(format!("page.presence.{}.label", mark.client_id)),
                        Some(PAGE_SURFACE_ID),
                    )
                    .snapshot_text(mark.name.clone());
            }
            elements.push(
                label
                    .child(
                        canvas(
                            |_, _, _| (),
                            move |bounds, _, window, cx| {
                                let origin = point(bounds.origin.x + px(4.0), bounds.origin.y);
                                let _ = text.paint(
                                    origin,
                                    px(PRESENCE_LABEL_HEIGHT),
                                    TextAlign::Left,
                                    None,
                                    window,
                                    cx,
                                );
                            },
                        )
                        .size_full(),
                    )
                    .into_any_element(),
            );
        }
    }
    elements
}
