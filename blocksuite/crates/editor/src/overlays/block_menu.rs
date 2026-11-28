//! Lightweight block action menu opened by clicking a block's gutter drag handle
//! without dragging (`Move Up`, `Move Down`, `Duplicate`, `Copy`, `Delete`).

use ui::{AnyElement, ClickEvent, Context, MouseButton, MouseDownEvent, div, prelude::*, px};

use crate::{
    block_flow::FlowRect,
    theme::{Palette, TYPOGRAPHY},
};

use super::{
    CONTEXT_MENU_PADDING, CONTEXT_MENU_RADIUS, CONTEXT_MENU_ROW_HEIGHT, OverlayEvent, OverlayHost,
    POPOVER_BORDER, POPOVER_EDGE_MARGIN, Presence, emit, icon, place, place_context_menu,
};

/// Width of the drag-handle block action menu in logical pixels.
pub const BLOCK_MENU_WIDTH: f32 = 176.0;
const BLOCK_MENU_SEPARATOR_HEIGHT: f32 = 9.0;

/// Command executed when clicking a drag-handle block menu item.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlockMenuAction {
    MoveUp,
    MoveDown,
    Duplicate,
    Copy,
    Delete,
}

/// Open drag-handle block action menu state.
#[derive(Clone, Debug, PartialEq)]
pub struct BlockMenuState {
    pub block_id: String,
    /// Window-space anchor point (top-left of the drag handle).
    pub anchor: (f32, f32),
    pub can_move_up: bool,
    pub can_move_down: bool,
    pub selected: Option<usize>,
    pub presence: Presence,
    pub rect: Option<FlowRect>,
}

impl BlockMenuState {
    pub fn entries(&self) -> [(bool, BlockMenuAction); 5] {
        [
            (self.can_move_up, BlockMenuAction::MoveUp),
            (self.can_move_down, BlockMenuAction::MoveDown),
            (true, BlockMenuAction::Duplicate),
            (true, BlockMenuAction::Copy),
            (true, BlockMenuAction::Delete),
        ]
    }

    pub fn step_selection(&mut self, forward: bool) -> bool {
        let entries = self.entries();
        let enabled: Vec<usize> = entries
            .iter()
            .enumerate()
            .filter_map(|(i, (ok, _))| ok.then_some(i))
            .collect();
        if enabled.is_empty() {
            self.selected = None;
            return false;
        }
        let next = match self
            .selected
            .and_then(|s| enabled.iter().position(|&i| i == s))
        {
            Some(pos) => {
                if forward {
                    enabled[(pos + 1) % enabled.len()]
                } else {
                    enabled[(pos + enabled.len() - 1) % enabled.len()]
                }
            }
            None => {
                if forward {
                    enabled[0]
                } else {
                    *enabled.last().unwrap()
                }
            }
        };
        self.selected = Some(next);
        true
    }

    pub fn selected_action(&self) -> Option<BlockMenuAction> {
        let idx = self.selected?;
        let entries = self.entries();
        let (enabled, action) = entries.get(idx)?;
        enabled.then_some(*action)
    }

    pub fn handle_key(&mut self, key: &str) -> Option<(bool, Option<(String, BlockMenuAction)>)> {
        if self.presence.closing {
            return None;
        }
        match key {
            "escape" => Some((true, None)),
            "down" | "up" => {
                self.step_selection(key == "down");
                Some((false, None))
            }
            "enter" => Some((
                true,
                self.selected_action()
                    .map(|action| (self.block_id.clone(), action)),
            )),
            _ => None,
        }
    }
}

/// Render the drag-handle block action menu when open or fading out.
pub(super) fn render_block_menu<V: OverlayHost>(
    menu: &mut BlockMenuState,
    viewport: FlowRect,
    palette: &Palette,
    now_ms: f64,
    cx: &mut Context<V>,
) -> Option<AnyElement> {
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

    let width = BLOCK_MENU_WIDTH
        .min((viewport.w - 2.0 * POPOVER_EDGE_MARGIN).max(120.0))
        .floor();
    let height = (2.0 * (CONTEXT_MENU_PADDING + POPOVER_BORDER)
        + 5.0 * CONTEXT_MENU_ROW_HEIGHT
        + BLOCK_MENU_SEPARATOR_HEIGHT)
        .round();
    let rect = place_context_menu(menu.anchor, (width, height), viewport, POPOVER_EDGE_MARGIN);
    menu.rect = Some(rect);

    let row_radius = CONTEXT_MENU_RADIUS - CONTEXT_MENU_PADDING;
    let hover_bg = palette.hover;
    let selected_idx = menu.selected;
    let block_id = menu.block_id.clone();

    let make_row = |idx: usize,
                    id: &'static str,
                    snap_id: &'static str,
                    label: &'static str,
                    icon_name: Option<&'static str>,
                    enabled: bool,
                    danger: bool,
                    action: BlockMenuAction,
                    cx: &mut Context<V>| {
        let is_selected = interactive && enabled && selected_idx == Some(idx);
        let danger_fg = palette
            .theme
            .css_var("--affine-error-color")
            .unwrap_or(palette.text_primary);
        let fg = if !enabled {
            palette.placeholder
        } else if danger {
            danger_fg
        } else {
            palette.text_primary
        };
        let icon_fg = if !enabled {
            palette.placeholder
        } else if danger {
            danger_fg
        } else {
            palette.icon
        };
        let mut row = div()
            .id(id)
            .w_full()
            .h(px(CONTEXT_MENU_ROW_HEIGHT))
            .px(px(8.0))
            .rounded(px(row_radius))
            .flex()
            .items_center()
            .gap(px(8.0))
            .text_size(px(TYPOGRAPHY.font_sm_px))
            .text_color(fg)
            .when(is_selected, |el| el.bg(hover_bg))
            .snapshot(snap_id, Some("overlay.block_menu"))
            .snapshot_focused(is_selected)
            .snapshot_text(label);
        if interactive && enabled {
            let bid = block_id.clone();
            row = row
                .cursor_pointer()
                .hover(move |s| s.bg(hover_bg))
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_click(emit(cx, move |_: &ClickEvent| {
                    OverlayEvent::BlockMenuAction {
                        block_id: bid.clone(),
                        action,
                    }
                }));
        }
        if let Some(name) = icon_name {
            row = row.child(icon(name, 16.0, icon_fg));
        } else {
            row = row.child(div().flex_none().w(px(16.0)).h(px(16.0)));
        }
        row.child(label)
    };

    let mut root = place(rect)
        .id("block-handle-menu")
        .flex()
        .flex_col()
        .p(px(CONTEXT_MENU_PADDING))
        .rounded(px(CONTEXT_MENU_RADIUS))
        .bg(palette.panel)
        .border_1()
        .border_color(palette.border)
        .shadow(
            palette
                .theme
                .shadows("--affine-overlay-panel-shadow")
                .into(),
        )
        .opacity(progress)
        .snapshot("overlay.block_menu", Some("root.canvas"))
        .snapshot_focused(interactive);
    if interactive {
        root = root
            .occlude()
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_mouse_down_out(emit(cx, |_: &MouseDownEvent| OverlayEvent::CloseBlockMenu));
    }

    root = root
        .child(make_row(
            0,
            "blk-move-up",
            "overlay.block_menu.move_up",
            "Move Up",
            None,
            menu.can_move_up,
            false,
            BlockMenuAction::MoveUp,
            cx,
        ))
        .child(make_row(
            1,
            "blk-move-down",
            "overlay.block_menu.move_down",
            "Move Down",
            None,
            menu.can_move_down,
            false,
            BlockMenuAction::MoveDown,
            cx,
        ))
        .child(make_row(
            2,
            "blk-duplicate",
            "overlay.block_menu.duplicate",
            "Duplicate",
            Some("CopyIcon"),
            true,
            false,
            BlockMenuAction::Duplicate,
            cx,
        ))
        .child(make_row(
            3,
            "blk-copy",
            "overlay.block_menu.copy",
            "Copy",
            Some("CopyIcon"),
            true,
            false,
            BlockMenuAction::Copy,
            cx,
        ))
        .child(div().w_full().h(px(1.0)).my(px(4.0)).bg(palette.border))
        .child(make_row(
            4,
            "blk-delete",
            "overlay.block_menu.delete",
            "Delete",
            Some("DeleteIcon"),
            true,
            true,
            BlockMenuAction::Delete,
            cx,
        ));

    Some(root.into_any_element())
}

impl super::Overlays {
    /// Open or reopen the drag-handle block action menu for `block_id` at window-space `anchor`.
    pub fn open_block_menu(
        &mut self,
        block_id: String,
        anchor: (f32, f32),
        can_move_up: bool,
        can_move_down: bool,
        now_ms: f64,
    ) {
        self.close_slash(now_ms);
        self.close_linked_doc(now_ms);
        self.close_context_menu(now_ms);
        let presence = match self.block_menu.take() {
            Some(menu) => menu.presence.reopened(now_ms),
            None => Presence::opening(now_ms),
        };
        self.block_menu = Some(BlockMenuState {
            block_id,
            anchor,
            can_move_up,
            can_move_down,
            selected: None,
            presence,
            rect: None,
        });
    }

    /// Dismiss the drag-handle block action menu with a fade-out transition.
    pub fn close_block_menu(&mut self, now_ms: f64) -> bool {
        match self
            .block_menu
            .as_mut()
            .filter(|menu| !menu.presence.closing)
        {
            Some(menu) => {
                menu.presence.close(now_ms);
                true
            }
            None => false,
        }
    }

    /// Active (non-closing) drag-handle block action menu.
    pub fn block_menu(&self) -> Option<&BlockMenuState> {
        self.block_menu
            .as_ref()
            .filter(|menu| !menu.presence.closing)
    }
}
