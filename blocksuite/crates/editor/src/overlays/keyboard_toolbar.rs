//! Mobile soft-keyboard accessory toolbar (`KeyboardToolbar`).
//!
//! Docked above the soft keyboard on mobile / narrow viewports with `>= 44x44 pt`
//! touch targets driving single-step undoable `PageDocSession` edits.

use ui::{AnyElement, ClickEvent, Context, FontWeight, SharedString, div, prelude::*, px};

use crate::{
    block_flow::FlowRect,
    theme::{Palette, TYPOGRAPHY},
};

use super::*;

/// Minimum touch target dimension for every mobile keyboard toolbar button (44x44 pt).
pub const KEYBOARD_TOOLBAR_BUTTON: f32 = 44.0;
/// Total height of the docked mobile keyboard toolbar strip.
pub const KEYBOARD_TOOLBAR_HEIGHT: f32 = 52.0;

/// Actions exposed by the mobile `KeyboardToolbar`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum KeyboardToolbarAction {
    Undo,
    Redo,
    H1,
    H2,
    H3,
    Todo,
    Bullet,
    Numbered,
    Quote,
    CodeBlock,
    Bold,
    Italic,
    Underline,
    InlineCode,
    InlineMath,
    Indent,
    Outdent,
    Mention,
    Dismiss,
}

impl KeyboardToolbarAction {
    pub const ALL: [Self; 19] = [
        Self::Undo,
        Self::Redo,
        Self::Bold,
        Self::Italic,
        Self::Underline,
        Self::InlineCode,
        Self::InlineMath,
        Self::H1,
        Self::H2,
        Self::H3,
        Self::Todo,
        Self::Bullet,
        Self::Numbered,
        Self::Quote,
        Self::CodeBlock,
        Self::Indent,
        Self::Outdent,
        Self::Mention,
        Self::Dismiss,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Self::Undo => "undo",
            Self::Redo => "redo",
            Self::H1 => "h1",
            Self::H2 => "h2",
            Self::H3 => "h3",
            Self::Todo => "todo",
            Self::Bullet => "bullet",
            Self::Numbered => "numbered",
            Self::Quote => "quote",
            Self::CodeBlock => "code_block",
            Self::Bold => "bold",
            Self::Italic => "italic",
            Self::Underline => "underline",
            Self::InlineCode => "inline_code",
            Self::InlineMath => "inline_math",
            Self::Indent => "indent",
            Self::Outdent => "outdent",
            Self::Mention => "mention",
            Self::Dismiss => "dismiss",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Undo => "Undo",
            Self::Redo => "Redo",
            Self::H1 => "H1",
            Self::H2 => "H2",
            Self::H3 => "H3",
            Self::Todo => "Todo",
            Self::Bullet => "List",
            Self::Numbered => "1.",
            Self::Quote => "Quote",
            Self::CodeBlock => "Code",
            Self::Bold => "B",
            Self::Italic => "I",
            Self::Underline => "U",
            Self::InlineCode => "</>",
            Self::InlineMath => "fx",
            Self::Indent => "->",
            Self::Outdent => "<-",
            Self::Mention => "@",
            Self::Dismiss => "Dismiss",
        }
    }

    /// Whether this action requires an active body `EditorSession` selection.
    /// When a table cell is focused without a body selection, these buttons render disabled.
    pub fn requires_body_selection(self) -> bool {
        !matches!(self, Self::Undo | Self::Redo | Self::Dismiss)
    }

    pub fn icon(self) -> Option<&'static str> {
        match self {
            Self::Undo => Some("UndoIcon"),
            Self::Redo => Some("RedoIcon"),
            Self::Bold => Some("BoldIcon"),
            Self::Italic => Some("ItalicIcon"),
            Self::Underline => Some("UnderLineIcon"),
            Self::InlineCode => Some("CodeIcon"),
            Self::InlineMath => Some("TeXIcon"),
            Self::H1 => Some("Heading1Icon"),
            Self::H2 => Some("Heading2Icon"),
            Self::H3 => Some("Heading3Icon"),
            Self::Todo => Some("CheckBoxCheckLinearIcon"),
            Self::Bullet => Some("BulletedListIcon"),
            Self::Numbered => Some("NumberedListIcon"),
            Self::Quote => Some("QuoteIcon"),
            Self::CodeBlock => Some("CodeBlockIcon"),
            Self::Indent => Some("RightTabIcon"),
            Self::Outdent => Some("CollapseTabIcon"),
            Self::Dismiss => Some("KeyboardIcon"),
            _ => None,
        }
    }
}

impl Overlays {
    /// Whether the mobile bottom `KeyboardToolbar` is currently visible.
    pub fn keyboard_toolbar_visible(&self) -> bool {
        self.keyboard_toolbar_visible
    }

    /// Show or hide the mobile bottom `KeyboardToolbar`.
    pub fn set_keyboard_toolbar_visible(&mut self, visible: bool) {
        self.keyboard_toolbar_visible = visible;
        if !visible {
            self.keyboard_toolbar_page = 0;
        }
    }

    /// Whether body-selection-dependent mark/block buttons are disabled (e.g. table cell focus).
    pub fn set_keyboard_toolbar_marks_disabled(&mut self, disabled: bool) {
        self.keyboard_toolbar_marks_disabled = disabled;
    }

    /// Current page index of the paginated mobile `KeyboardToolbar`.
    pub fn keyboard_toolbar_page(&self) -> usize {
        self.keyboard_toolbar_page
    }

    /// Advance the mobile `KeyboardToolbar` to the next action page.
    pub fn next_keyboard_toolbar_page(&mut self) {
        self.keyboard_toolbar_page = self.keyboard_toolbar_page.wrapping_add(1);
    }

    pub(super) fn render_keyboard_toolbar<V: OverlayHost>(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        cx: &mut Context<V>,
    ) -> Option<AnyElement> {
        if !self.keyboard_toolbar_visible {
            return None;
        }
        let width = scene.window.0.max(0.0).floor();
        let height = KEYBOARD_TOOLBAR_HEIGHT;
        let top = (scene.window.1 - height).max(TOPBAR_HEIGHT).floor();
        let rect = FlowRect::new(0.0, top, width, height);

        let pad_x = 4.0;
        let gap = 2.0;
        let btn = KEYBOARD_TOOLBAR_BUTTON;
        let all_actions: Vec<KeyboardToolbarAction> = KeyboardToolbarAction::ALL
            .into_iter()
            .filter(|a| *a != KeyboardToolbarAction::Dismiss)
            .collect();

        // Check whether all 18 editing actions plus Dismiss fit on one row; otherwise
        // reserve two rightmost 44x44pt slots for `More` (page toggle) + `Dismiss`.
        let total_slots = ((width - pad_x * 2.0 + gap) / (btn + gap)).floor().max(1.0) as usize;
        let needs_paging = total_slots < all_actions.len() + 1;
        let left_slots = if needs_paging {
            total_slots.saturating_sub(2).max(1)
        } else {
            all_actions.len()
        };
        let page_count = all_actions.len().div_ceil(left_slots).max(1);
        let page = self.keyboard_toolbar_page % page_count;
        let start = page * left_slots;
        let end = (start + left_slots).min(all_actions.len());
        let actions = &all_actions[start..end];

        let hover = palette.hover;
        let marks_disabled = self.keyboard_toolbar_marks_disabled;
        let make_button = |action: KeyboardToolbarAction, cx: &mut Context<V>| {
            let disabled = marks_disabled && action.requires_body_selection();
            let mut button = div()
                .id(SharedString::from(format!("kb-tool-{}", action.id())))
                .flex_none()
                .w(px(btn))
                .h(px(btn))
                .rounded(px(8.0))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(TYPOGRAPHY.font_xs_px))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(palette.text_primary)
                .snapshot(
                    SharedString::from(format!("overlay.keyboard_toolbar.{}", action.id())),
                    Some("overlay.keyboard_toolbar"),
                )
                .snapshot_text(action.label());
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
            button = match action.icon() {
                Some(name) => button.child(icon(name, 20.0, palette.icon)),
                None => button.child(action.label()),
            };
            button
        };

        let mut left_strip = div()
            .flex_1()
            .min_w(px(0.0))
            .h(px(btn))
            .flex()
            .items_center()
            .gap(px(gap))
            .overflow_hidden();
        for &action in actions {
            left_strip = left_strip.child(make_button(action, cx));
        }

        let dismiss = make_button(KeyboardToolbarAction::Dismiss, cx);
        let mut bar = place(rect)
            .id("keyboard-toolbar")
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

        bar = bar.child(dismiss);
        Some(bar.into_any_element())
    }
}
