//! Desktop editor overlay context menu (right-click) and clipboard fallback toast.
//!
//! Renders a compact GPU-drawn context menu in both Page and Edgeless editing contexts
//! without modifying `packages/ui/ui`. Includes Copy, Cut, Paste (with a scheduler-timed
//! shortcut toast when platform clipboard read is unavailable), and Open Link / Copy Link
//! when right-clicking an inline link or Bookmark block.

use ui::{
    AnyElement, ClickEvent, Context, FontWeight, MouseButton, MouseDownEvent, SharedString, div,
    prelude::*, px,
};

use crate::{
    block_flow::FlowRect,
    theme::{Palette, TYPOGRAPHY},
};

use super::{
    OverlayEvent, OverlayHost, POPOVER_BORDER, POPOVER_EDGE_MARGIN, Presence, emit, icon, place,
};

/// Width of the desktop editor context menu in logical pixels.
pub const CONTEXT_MENU_WIDTH: f32 = 196.0;
/// Padding around context menu rows (concentric with `CONTEXT_MENU_RADIUS`).
pub const CONTEXT_MENU_PADDING: f32 = 4.0;
/// Outer corner radius of the context menu.
pub const CONTEXT_MENU_RADIUS: f32 = 8.0;
/// Height of one context menu row.
pub const CONTEXT_MENU_ROW_HEIGHT: f32 = 30.0;
/// Vertical space occupied by a separator between clipboard and link sections.
const CONTEXT_MENU_SEPARATOR_HEIGHT: f32 = 9.0;
/// Duration of the clipboard fallback toast in milliseconds on the scheduler clock.
pub const CONTEXT_TOAST_MS: u64 = 2_200;

/// Command executed when clicking a desktop context menu item.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ContextMenuAction {
    Copy,
    Cut,
    Paste,
    OpenLink(String),
    CopyLink(String),
}

/// Open desktop right-click context menu state.
#[derive(Clone, Debug, PartialEq)]
pub struct ContextMenuState {
    /// Window-space cursor position where the menu was requested.
    pub anchor: (f32, f32),
    pub can_copy: bool,
    pub can_cut: bool,
    pub can_paste: bool,
    /// Optional URL hit at the right-click position (inline link mark or Bookmark block).
    pub link_url: Option<String>,
    /// Currently highlighted menu row index for keyboard navigation (`Up`/`Down`/`Enter`).
    pub selected: Option<usize>,
    pub presence: Presence,
    pub rect: Option<FlowRect>,
}

impl ContextMenuState {
    pub fn entries(&self) -> Vec<(bool, ContextMenuAction)> {
        let mut items = vec![
            (self.can_copy, ContextMenuAction::Copy),
            (self.can_cut, ContextMenuAction::Cut),
            (self.can_paste, ContextMenuAction::Paste),
        ];
        if let Some(url) = &self.link_url {
            items.push((true, ContextMenuAction::OpenLink(url.clone())));
            items.push((true, ContextMenuAction::CopyLink(url.clone())));
        }
        items
    }

    /// Move keyboard focus to the next (`forward = true`) or previous enabled row, wrapping around.
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

    /// Action of the currently keyboard-selected enabled row, if any.
    pub fn selected_action(&self) -> Option<ContextMenuAction> {
        let idx = self.selected?;
        let entries = self.entries();
        let (enabled, action) = entries.get(idx)?;
        enabled.then(|| action.clone())
    }

    /// Handle `Escape`/`Up`/`Down`/`Enter` for an open context menu.
    /// Returns `Some((close_menu, action))` when consumed.
    pub fn handle_key(&mut self, key: &str) -> Option<(bool, Option<ContextMenuAction>)> {
        if self.presence.closing {
            return None;
        }
        match key {
            "escape" => Some((true, None)),
            "down" | "up" => {
                self.step_selection(key == "down");
                Some((false, None))
            }
            "enter" => Some((true, self.selected_action())),
            _ => None,
        }
    }
}

/// Transient non-blocking toast shown when Paste cannot read the platform clipboard directly.
#[derive(Clone, Debug, PartialEq)]
pub struct ContextToast {
    pub message: String,
    pub generation: u64,
}

/// Place a context menu anchored at `(anchor_x, anchor_y)` inside `viewport`, flipping
/// horizontally or vertically when it would overflow the viewport edge margins.
pub fn place_context_menu(
    anchor: (f32, f32),
    menu_size: (f32, f32),
    viewport: FlowRect,
    edge_margin: f32,
) -> FlowRect {
    let (w, h) = menu_size;
    let min_x = viewport.x + edge_margin;
    let max_x = (viewport.right() - edge_margin - w).max(min_x);
    let min_y = viewport.y + edge_margin;
    let max_y = (viewport.bottom() - edge_margin - h).max(min_y);

    let x = if anchor.0 + w <= viewport.right() - edge_margin {
        anchor.0
    } else {
        anchor.0 - w
    }
    .clamp(min_x, max_x)
    .round();

    let y = if anchor.1 + h <= viewport.bottom() - edge_margin {
        anchor.1
    } else {
        anchor.1 - h
    }
    .clamp(min_y, max_y)
    .round();

    FlowRect::new(x, y, w, h)
}

/// Render the desktop right-click context menu when open or fading out.
pub(super) fn render_context_menu<V: OverlayHost>(
    menu: &mut ContextMenuState,
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

    let has_link = menu.link_url.is_some();
    let row_count = 3 + if has_link { 2 } else { 0 };
    let sep_h = if has_link {
        CONTEXT_MENU_SEPARATOR_HEIGHT
    } else {
        0.0
    };
    let width = CONTEXT_MENU_WIDTH
        .min((viewport.w - 2.0 * POPOVER_EDGE_MARGIN).max(120.0))
        .floor();
    let height = (2.0 * (CONTEXT_MENU_PADDING + POPOVER_BORDER)
        + row_count as f32 * CONTEXT_MENU_ROW_HEIGHT
        + sep_h)
        .round();
    let rect = place_context_menu(menu.anchor, (width, height), viewport, POPOVER_EDGE_MARGIN);
    menu.rect = Some(rect);

    let row_radius = CONTEXT_MENU_RADIUS - CONTEXT_MENU_PADDING;
    let hover_bg = palette.hover;
    let selected_idx = menu.selected;
    let make_row = |idx: usize,
                    id: &'static str,
                    snap_id: &'static str,
                    label: &'static str,
                    shortcut: Option<&'static str>,
                    icon_name: Option<&'static str>,
                    enabled: bool,
                    action: ContextMenuAction,
                    cx: &mut Context<V>| {
        let is_selected = interactive && enabled && selected_idx == Some(idx);
        let fg = if enabled {
            palette.text_primary
        } else {
            palette.placeholder
        };
        let icon_fg = if enabled {
            palette.icon
        } else {
            palette.placeholder
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
            .snapshot(snap_id, Some("overlay.context_menu"))
            .snapshot_focused(is_selected)
            .snapshot_text(label);
        if interactive && enabled {
            row = row
                .cursor_pointer()
                .hover(move |s| s.bg(hover_bg))
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_click(emit(cx, move |_: &ClickEvent| {
                    OverlayEvent::ContextMenuAction(action.clone())
                }));
        }
        let mut left = div()
            .flex_1()
            .min_w(px(0.0))
            .flex()
            .items_center()
            .gap(px(8.0));
        if let Some(name) = icon_name {
            left = left.child(icon(name, 16.0, icon_fg));
        } else {
            left = left.child(div().flex_none().w(px(16.0)).h(px(16.0)));
        }
        left = left.child(label);
        row = row.child(left);
        if let Some(hint) = shortcut {
            row = row.child(
                div()
                    .text_size(px(TYPOGRAPHY.font_xs_px))
                    .text_color(palette.text_secondary)
                    .child(hint),
            );
        }
        row
    };

    let mut root = place(rect)
        .id("editor-context-menu")
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
        .snapshot("overlay.context_menu", Some("root.canvas"))
        .snapshot_focused(interactive);
    if interactive {
        root = root
            .occlude()
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_mouse_down(MouseButton::Right, |_, _, cx| cx.stop_propagation())
            .on_mouse_down_out(emit(cx, |_: &MouseDownEvent| {
                OverlayEvent::CloseContextMenu
            }));
    }

    root = root
        .child(make_row(
            0,
            "ctx-copy",
            "overlay.context_menu.copy",
            "Copy",
            Some("Ctrl/Cmd+C"),
            Some("CopyIcon"),
            menu.can_copy,
            ContextMenuAction::Copy,
            cx,
        ))
        .child(make_row(
            1,
            "ctx-cut",
            "overlay.context_menu.cut",
            "Cut",
            Some("Ctrl/Cmd+X"),
            None,
            menu.can_cut,
            ContextMenuAction::Cut,
            cx,
        ))
        .child(make_row(
            2,
            "ctx-paste",
            "overlay.context_menu.paste",
            "Paste",
            Some("Ctrl/Cmd+V"),
            None,
            menu.can_paste,
            ContextMenuAction::Paste,
            cx,
        ));

    if let Some(url) = &menu.link_url {
        root = root
            .child(div().w_full().h(px(1.0)).my(px(4.0)).bg(palette.border))
            .child(make_row(
                3,
                "ctx-open-link",
                "overlay.context_menu.open_link",
                "Open Link",
                None,
                Some("LinkIcon"),
                true,
                ContextMenuAction::OpenLink(url.clone()),
                cx,
            ))
            .child(make_row(
                4,
                "ctx-copy-link",
                "overlay.context_menu.copy_link",
                "Copy Link",
                None,
                Some("CopyIcon"),
                true,
                ContextMenuAction::CopyLink(url.clone()),
                cx,
            ));
    }

    Some(root.into_any_element())
}

/// Render the transient clipboard shortcut hint toast centered near the bottom of the viewport.
pub(super) fn render_context_toast(
    toast: &ContextToast,
    viewport: FlowRect,
    palette: &Palette,
) -> AnyElement {
    let est_w = (toast.message.chars().count() as f32 * 7.2 + 32.0).max(228.0);
    let width = est_w.min((viewport.w - 2.0 * POPOVER_EDGE_MARGIN).max(120.0));
    let height = 34.0;
    let x = (viewport.x + (viewport.w - width) * 0.5)
        .clamp(
            viewport.x + POPOVER_EDGE_MARGIN,
            (viewport.right() - POPOVER_EDGE_MARGIN - width).max(viewport.x + POPOVER_EDGE_MARGIN),
        )
        .round();
    let y = (viewport.bottom() - height - 64.0)
        .clamp(
            viewport.y + POPOVER_EDGE_MARGIN,
            (viewport.bottom() - POPOVER_EDGE_MARGIN - height)
                .max(viewport.y + POPOVER_EDGE_MARGIN),
        )
        .round();
    place(FlowRect::new(x, y, width, height))
        .px(px(12.0))
        .rounded(px(8.0))
        .bg(palette.panel)
        .border_1()
        .border_color(palette.border)
        .shadow(palette.theme.shadows("--affine-toolbar-shadow").into())
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(TYPOGRAPHY.font_xs_px))
        .font_weight(FontWeight::MEDIUM)
        .text_color(palette.text_primary)
        .snapshot("overlay.context_menu.toast", Some("root.canvas"))
        .snapshot_text(SharedString::from(toast.message.clone()))
        .child(toast.message.clone())
        .into_any_element()
}

impl super::Overlays {
    /// Open or reopen the desktop right-click context menu at window-space `anchor`.
    pub fn open_context_menu(
        &mut self,
        anchor: (f32, f32),
        can_copy: bool,
        can_cut: bool,
        can_paste: bool,
        link_url: Option<String>,
        now_ms: f64,
    ) {
        let presence = match self.context_menu.take() {
            Some(menu) => menu.presence.reopened(now_ms),
            None => Presence::opening(now_ms),
        };
        self.context_menu = Some(ContextMenuState {
            anchor,
            can_copy,
            can_cut,
            can_paste,
            link_url,
            selected: None,
            presence,
            rect: None,
        });
    }

    /// Dismiss the desktop right-click context menu with a fade-out transition.
    pub fn close_context_menu(&mut self, now_ms: f64) -> bool {
        match self
            .context_menu
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

    /// Active (non-closing) desktop right-click context menu.
    pub fn context_menu(&self) -> Option<&ContextMenuState> {
        self.context_menu
            .as_ref()
            .filter(|menu| !menu.presence.closing)
    }

    /// Show a transient clipboard fallback toast and return its generation token.
    pub fn show_context_toast(&mut self, message: impl Into<String>) -> u64 {
        self.context_toast_generation += 1;
        let generation = self.context_toast_generation;
        self.context_toast = Some(ContextToast {
            message: message.into(),
            generation,
        });
        generation
    }

    /// Expire the context toast if its generation matches.
    pub fn context_toast_expired(&mut self, generation: u64) -> bool {
        if self
            .context_toast
            .as_ref()
            .is_some_and(|toast| toast.generation == generation)
        {
            self.context_toast = None;
            return true;
        }
        false
    }

    /// Active context toast message, if any.
    pub fn context_toast_message(&self) -> Option<&str> {
        self.context_toast
            .as_ref()
            .map(|toast| toast.message.as_str())
    }

    /// Render the desktop right-click context menu, drag-handle block menu, and clipboard toast.
    pub fn context_overlays<V: OverlayHost>(
        &mut self,
        window_size: (f32, f32),
        palette: &Palette,
        now_ms: f64,
        window: &mut ui::Window,
        cx: &mut Context<V>,
    ) -> Vec<AnyElement> {
        if self
            .context_menu
            .as_ref()
            .is_some_and(|m| m.presence.gone(now_ms))
        {
            self.context_menu = None;
        }
        if self
            .block_menu
            .as_ref()
            .is_some_and(|m| m.presence.gone(now_ms))
        {
            self.block_menu = None;
        }
        if self
            .context_menu
            .as_ref()
            .is_some_and(|m| m.presence.in_flight(now_ms) || m.presence.closing)
            || self
                .block_menu
                .as_ref()
                .is_some_and(|m| m.presence.in_flight(now_ms) || m.presence.closing)
        {
            window.request_animation_frame();
        }
        let viewport = FlowRect::new(
            0.0,
            crate::TOPBAR_HEIGHT,
            window_size.0,
            (window_size.1 - crate::TOPBAR_HEIGHT).max(0.0),
        );
        let mut elements = Vec::new();
        if let Some(menu) = self.context_menu.as_mut() {
            elements.extend(render_context_menu(menu, viewport, palette, now_ms, cx));
        }
        if let Some(menu) = self.block_menu.as_mut() {
            elements.extend(super::block_menu::render_block_menu(
                menu, viewport, palette, now_ms, cx,
            ));
        }
        if let Some(toast) = self.context_toast.as_ref() {
            elements.push(render_context_toast(toast, viewport, palette));
        }
        elements
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_menu_clamps_and_flips_near_edges() {
        let vp = FlowRect::new(0.0, 52.0, 1280.0, 748.0);
        let size = (196.0, 100.0);

        // Normal interior position stays anchored to cursor.
        let mid = place_context_menu((400.0, 300.0), size, vp, 8.0);
        assert_eq!(mid, FlowRect::new(400.0, 300.0, 196.0, 100.0));

        // Near bottom-right corner flips left and above cursor while staying inside margins.
        let corner = place_context_menu((1260.0, 780.0), size, vp, 8.0);
        assert!(corner.right() <= vp.right() - 8.0);
        assert!(corner.bottom() <= vp.bottom() - 8.0);
        assert!(corner.x >= vp.x + 8.0);
        assert!(corner.y >= vp.y + 8.0);

        // Above top bar clamps below top bar + margin.
        let top = place_context_menu((10.0, 20.0), size, vp, 8.0);
        assert_eq!(top.y, 60.0);
    }
}
