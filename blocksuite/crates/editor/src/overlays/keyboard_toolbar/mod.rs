//! Mobile soft-keyboard accessory toolbar (`KeyboardToolbar`), 1:1 with BlockSuite
//! `0.27.5` `defaultKeyboardToolbarConfig`.
//!
//! Docked above the soft keyboard on mobile / narrow viewports with `>= 44x44 pt`
//! touch targets, top-level bar (`+`, `Aa`, `Image`, `Undo`, `Redo`, `RightTab`,
//! lists, `Divider`, `CollapseTab`, `Copy`, `Duplicate`, `Delete`, fixed `Dismiss`),
//! `Aa` text-style sub-toolbar (with `autoShow` on non-collapsed selection),
//! 8-group `+` insert panel, `Turn into` panel, and 9-color `Highlight` panel.

mod config;
mod render;

pub use config::{
    DEFAULT_KEYBOARD_TOOLBAR_ITEMS, MORE_TOOL_PANEL_GROUPS, TEXT_SUB_TOOLBAR_ITEMS,
    TURN_INTO_PANEL_ITEMS, ToolPanelGroupSpec, ToolbarActionSpec, ToolbarItemSpec,
    is_flavour_supported,
};

use super::{Overlays, SlashCommand};

/// Minimum touch target dimension for every mobile keyboard toolbar button (44x44 pt).
pub const KEYBOARD_TOOLBAR_BUTTON: f32 = 44.0;
/// Total height of the docked mobile keyboard toolbar strip.
pub const KEYBOARD_TOOLBAR_HEIGHT: f32 = 52.0;
/// Preferred height of the docked mobile keyboard tool panel below the toolbar strip
/// (aligned with BlockSuite `0.27.5` `keyboard-toolbar.ts` `330px` panel budget).
pub const KEYBOARD_TOOL_PANEL_HEIGHT: f32 = 316.0;

/// Highlight palette matching `0.27.5` `highlightToolPanel` (Default + 8 semantic colors).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum HighlightColor {
    Default,
    Red,
    Orange,
    Yellow,
    Green,
    Teal,
    Blue,
    Purple,
    Grey,
}

impl HighlightColor {
    pub const ALL: [Self; 9] = [
        Self::Default,
        Self::Red,
        Self::Orange,
        Self::Yellow,
        Self::Green,
        Self::Teal,
        Self::Blue,
        Self::Purple,
        Self::Grey,
    ];

    pub const fn id(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Red => "red",
            Self::Orange => "orange",
            Self::Yellow => "yellow",
            Self::Green => "green",
            Self::Teal => "teal",
            Self::Blue => "blue",
            Self::Purple => "purple",
            Self::Grey => "grey",
        }
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::Default => "Default",
            Self::Red => "Red",
            Self::Orange => "Orange",
            Self::Yellow => "Yellow",
            Self::Green => "Green",
            Self::Teal => "Teal",
            Self::Blue => "Blue",
            Self::Purple => "Purple",
            Self::Grey => "Grey",
        }
    }

    /// Foreground text highlight CSS variable (`var(--affine-v2-text-highlight-fg-*)`),
    /// or `None` for Default (clears the `color` mark).
    pub const fn fg_css_var(self) -> Option<&'static str> {
        match self {
            Self::Default => None,
            Self::Red => Some("var(--affine-v2-text-highlight-fg-red)"),
            Self::Orange => Some("var(--affine-v2-text-highlight-fg-orange)"),
            Self::Yellow => Some("var(--affine-v2-text-highlight-fg-yellow)"),
            Self::Green => Some("var(--affine-v2-text-highlight-fg-green)"),
            Self::Teal => Some("var(--affine-v2-text-highlight-fg-teal)"),
            Self::Blue => Some("var(--affine-v2-text-highlight-fg-blue)"),
            Self::Purple => Some("var(--affine-v2-text-highlight-fg-purple)"),
            Self::Grey => Some("var(--affine-v2-text-highlight-fg-grey)"),
        }
    }

    /// Background highlight CSS variable (`var(--affine-v2-text-highlight-bg-*)`),
    /// or `None` for Default (clears the `background` mark).
    pub const fn bg_css_var(self) -> Option<&'static str> {
        match self {
            Self::Default => None,
            Self::Red => Some("var(--affine-v2-text-highlight-bg-red)"),
            Self::Orange => Some("var(--affine-v2-text-highlight-bg-orange)"),
            Self::Yellow => Some("var(--affine-v2-text-highlight-bg-yellow)"),
            Self::Green => Some("var(--affine-v2-text-highlight-bg-green)"),
            Self::Teal => Some("var(--affine-v2-text-highlight-bg-teal)"),
            Self::Blue => Some("var(--affine-v2-text-highlight-bg-blue)"),
            Self::Purple => Some("var(--affine-v2-text-highlight-bg-purple)"),
            Self::Grey => Some("var(--affine-v2-text-highlight-bg-grey)"),
        }
    }
}

/// Date insertion presets matching `0.27.5` `dateToolGroup`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum KeyboardToolbarDateKind {
    Today,
    Tomorrow,
    Yesterday,
    Now,
}

impl KeyboardToolbarDateKind {
    pub const fn id(self) -> &'static str {
        match self {
            Self::Today => "date_today",
            Self::Tomorrow => "date_tomorrow",
            Self::Yesterday => "date_yesterday",
            Self::Now => "date_now",
        }
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::Today => "Today",
            Self::Tomorrow => "Tomorrow",
            Self::Yesterday => "Yesterday",
            Self::Now => "Now",
        }
    }

    pub const fn badge(self) -> &'static str {
        match self {
            Self::Today => "0d",
            Self::Tomorrow => "+1",
            Self::Yesterday => "-1",
            Self::Now => "Now",
        }
    }
}

/// Active docked bottom panel of `KeyboardToolbar`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum KeyboardToolbarPanel {
    /// `+` (`moreToolPanel`): 8-group block insert panel.
    More,
    /// `Turn into` (`textToolPanel`): block conversion panel inside `Aa`.
    TurnInto,
    /// `Highlight` (`highlightToolPanel`): 9-color fg + 9-color bg panel inside `Aa`.
    Highlight,
}

/// Active navigation level of `KeyboardToolbar`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum KeyboardToolbarLevel {
    #[default]
    Main,
    /// `Aa` (`textSubToolbarConfig`).
    TextStyle,
}

/// Actions exposed by the mobile `KeyboardToolbar` and its panels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyboardToolbarAction {
    /// Toggle `+` (`moreToolPanel`).
    ToggleMorePanel,
    /// Enter `Aa` (`textSubToolbarConfig`).
    OpenTextSubToolbar,
    /// Return from `Aa` sub-toolbar to top-level toolbar.
    BackToMainToolbar,
    /// Toggle `Turn into` panel inside `Aa`.
    ToggleTurnIntoPanel,
    /// Toggle `Highlight` panel inside `Aa`.
    ToggleHighlightPanel,
    /// Reuse `SlashCommand` for block conversions & inserts (`Text`, `H1..H6`, `Code`,
    /// `Quote`, `Divider`, `Bulleted`, `Numbered`, `Todo`, `Toggle`, `NewDoc`, `LinkedDoc`).
    Slash(SlashCommand),
    /// Insert a block LaTeX equation and open the equation editor.
    EquationBlock,
    /// Insert a 2x2 table block.
    Table,
    /// Insert a callout block with a child paragraph.
    Callout,
    /// Insert an image block.
    Image,
    /// Insert a bookmark card block.
    Bookmark,
    /// Declared for `0.27.5` parity (`showWhen: () => false`).
    Attachment,
    /// Schema-gated embeds (`showWhen` hidden when flavour unsupported).
    EmbedIframe,
    EmbedYoutube,
    EmbedGithub,
    EmbedFigma,
    EmbedLoom,
    /// Schema-gated database views (`showWhen` hidden before S4 `affine:database`).
    DatabaseTableView,
    DatabaseKanbanView,
    /// Insert formatted date/time text using the deterministic scheduler clock.
    Date(KeyboardToolbarDateKind),
    Undo,
    Redo,
    Indent,
    Outdent,
    Copy,
    Duplicate,
    Delete,
    Bold,
    Italic,
    Underline,
    Strike,
    InlineCode,
    Link,
    InlineMath,
    SetTextColor(HighlightColor),
    SetBgColor(HighlightColor),
    Dismiss,
}

impl KeyboardToolbarAction {
    /// Whether this action requires an active body `EditorSession` selection.
    /// When a table cell is focused without a body selection, these buttons render disabled.
    pub fn requires_body_selection(self) -> bool {
        !matches!(self, Self::Undo | Self::Redo | Self::Dismiss)
    }

    /// Stable snapshot id suffix for `overlay.keyboard_toolbar.<id>`.
    pub fn id(self) -> &'static str {
        match self {
            Self::ToggleMorePanel => "more_panel",
            Self::OpenTextSubToolbar => "text_style",
            Self::BackToMainToolbar => "back",
            Self::ToggleTurnIntoPanel => "turn_into",
            Self::ToggleHighlightPanel => "highlight",
            Self::Slash(cmd) => match cmd {
                SlashCommand::Paragraph(p) => match p {
                    blocksuite_playground_doc::schema::ParagraphType::Text => "text",
                    blocksuite_playground_doc::schema::ParagraphType::H1 => "h1",
                    blocksuite_playground_doc::schema::ParagraphType::H2 => "h2",
                    blocksuite_playground_doc::schema::ParagraphType::H3 => "h3",
                    blocksuite_playground_doc::schema::ParagraphType::H4 => "h4",
                    blocksuite_playground_doc::schema::ParagraphType::H5 => "h5",
                    blocksuite_playground_doc::schema::ParagraphType::H6 => "h6",
                    blocksuite_playground_doc::schema::ParagraphType::Quote => "quote",
                },
                SlashCommand::List(l) => match l {
                    blocksuite_playground_doc::schema::ListType::Bulleted => "bullet",
                    blocksuite_playground_doc::schema::ListType::Numbered => "numbered",
                    blocksuite_playground_doc::schema::ListType::Todo => "todo",
                    blocksuite_playground_doc::schema::ListType::Toggle => "toggle",
                },
                SlashCommand::Divider => "divider",
                SlashCommand::Code => "code_block",
                SlashCommand::NewDoc => "new_page",
                SlashCommand::LinkedDoc => "linked_page",
                SlashCommand::Table => "table",
                SlashCommand::Equation => "equation",
                SlashCommand::Database => "database",
            },
            Self::EquationBlock => "equation_block",
            Self::Table => "table",
            Self::Callout => "callout",
            Self::Image => "image",
            Self::Bookmark => "bookmark",
            Self::Attachment => "attachment",
            Self::EmbedIframe => "embed_iframe",
            Self::EmbedYoutube => "embed_youtube",
            Self::EmbedGithub => "embed_github",
            Self::EmbedFigma => "embed_figma",
            Self::EmbedLoom => "embed_loom",
            Self::DatabaseTableView => "database_table",
            Self::DatabaseKanbanView => "database_kanban",
            Self::Date(kind) => kind.id(),
            Self::Undo => "undo",
            Self::Redo => "redo",
            Self::Indent => "indent",
            Self::Outdent => "outdent",
            Self::Copy => "copy",
            Self::Duplicate => "duplicate",
            Self::Delete => "delete",
            Self::Bold => "bold",
            Self::Italic => "italic",
            Self::Underline => "underline",
            Self::Strike => "strike",
            Self::InlineCode => "inline_code",
            Self::Link => "link",
            Self::InlineMath => "inline_math",
            Self::SetTextColor(c) => match c {
                HighlightColor::Default => "fg_default",
                HighlightColor::Red => "fg_red",
                HighlightColor::Orange => "fg_orange",
                HighlightColor::Yellow => "fg_yellow",
                HighlightColor::Green => "fg_green",
                HighlightColor::Teal => "fg_teal",
                HighlightColor::Blue => "fg_blue",
                HighlightColor::Purple => "fg_purple",
                HighlightColor::Grey => "fg_grey",
            },
            Self::SetBgColor(c) => match c {
                HighlightColor::Default => "bg_default",
                HighlightColor::Red => "bg_red",
                HighlightColor::Orange => "bg_orange",
                HighlightColor::Yellow => "bg_yellow",
                HighlightColor::Green => "bg_green",
                HighlightColor::Teal => "bg_teal",
                HighlightColor::Blue => "bg_blue",
                HighlightColor::Purple => "bg_purple",
                HighlightColor::Grey => "bg_grey",
            },
            Self::Dismiss => "dismiss",
        }
    }
}

/// Per-frame dynamic editor capabilities fed to `KeyboardToolbar`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct KeyboardToolbarCapabilities {
    pub can_undo: bool,
    pub can_redo: bool,
    pub can_indent: bool,
    pub can_dedent: bool,
    pub can_pick_images: bool,
    pub has_body_selection: bool,
    pub has_non_collapsed_selection: bool,
}

/// Complete state of the mobile `KeyboardToolbar` owned by [`Overlays`].
#[derive(Clone, Debug, Default, PartialEq)]
pub struct KeyboardToolbarState {
    pub visible: bool,
    pub level: KeyboardToolbarLevel,
    pub manual_text_subtoolbar: bool,
    pub active_panel: Option<KeyboardToolbarPanel>,
    pub strip_scroll: f32,
    pub panel_scroll: f32,
    pub marks_disabled: bool,
    pub capabilities: KeyboardToolbarCapabilities,
}

impl KeyboardToolbarState {
    pub fn close_transient(&mut self) {
        self.active_panel = None;
        self.panel_scroll = 0.0;
        self.strip_scroll = 0.0;
        if !self.capabilities.has_non_collapsed_selection {
            self.level = KeyboardToolbarLevel::Main;
            self.manual_text_subtoolbar = false;
        }
    }
}

impl Overlays {
    /// Whether the mobile bottom `KeyboardToolbar` is currently visible.
    pub fn keyboard_toolbar_visible(&self) -> bool {
        self.keyboard_toolbar.visible
    }

    /// Show or hide the mobile bottom `KeyboardToolbar`.
    pub fn set_keyboard_toolbar_visible(&mut self, visible: bool) {
        self.keyboard_toolbar.visible = visible;
        if visible {
            if self.link_field().is_none() {
                self.toolbar = None;
            }
        } else {
            self.keyboard_toolbar.strip_scroll = 0.0;
            self.keyboard_toolbar.active_panel = None;
            self.keyboard_toolbar.panel_scroll = 0.0;
            self.keyboard_toolbar.level = KeyboardToolbarLevel::Main;
            self.keyboard_toolbar.manual_text_subtoolbar = false;
        }
    }

    /// Whether body-selection-dependent mark/block buttons are disabled (e.g. table cell focus).
    /// Also auto-collapses any open `+` / `Aa` sub-panel per table-cell gating rules.
    pub fn set_keyboard_toolbar_marks_disabled(&mut self, disabled: bool) {
        self.keyboard_toolbar.marks_disabled = disabled;
        if disabled {
            self.keyboard_toolbar.active_panel = None;
            self.keyboard_toolbar.panel_scroll = 0.0;
            self.keyboard_toolbar.level = KeyboardToolbarLevel::Main;
            self.keyboard_toolbar.manual_text_subtoolbar = false;
        }
    }

    /// Sync per-frame undo/redo/indent/dedent and `autoShow` selection capabilities.
    pub fn set_keyboard_toolbar_capabilities(&mut self, caps: KeyboardToolbarCapabilities) {
        let prev_non_collapsed = self
            .keyboard_toolbar
            .capabilities
            .has_non_collapsed_selection;
        self.keyboard_toolbar.capabilities = caps;
        if self.keyboard_toolbar.marks_disabled {
            self.keyboard_toolbar.active_panel = None;
            self.keyboard_toolbar.level = KeyboardToolbarLevel::Main;
            self.keyboard_toolbar.manual_text_subtoolbar = false;
            return;
        }
        // `textSubToolbarConfig.autoShow`: switch to `Aa` when a non-collapsed text selection
        // opens, and return to top-level bar when collapsed unless opened manually.
        if caps.has_non_collapsed_selection && !prev_non_collapsed {
            self.keyboard_toolbar.level = KeyboardToolbarLevel::TextStyle;
            self.keyboard_toolbar.strip_scroll = 0.0;
        } else if !caps.has_non_collapsed_selection
            && prev_non_collapsed
            && !self.keyboard_toolbar.manual_text_subtoolbar
        {
            self.keyboard_toolbar.level = KeyboardToolbarLevel::Main;
            if matches!(
                self.keyboard_toolbar.active_panel,
                Some(KeyboardToolbarPanel::TurnInto | KeyboardToolbarPanel::Highlight)
            ) {
                self.keyboard_toolbar.active_panel = None;
                self.keyboard_toolbar.panel_scroll = 0.0;
            }
            self.keyboard_toolbar.strip_scroll = 0.0;
        }
    }

    /// Current navigation level (`Main` or `TextStyle`).
    pub fn keyboard_toolbar_level(&self) -> KeyboardToolbarLevel {
        self.keyboard_toolbar.level
    }

    /// Currently expanded docked tool panel, if any.
    pub fn keyboard_toolbar_active_panel(&self) -> Option<KeyboardToolbarPanel> {
        self.keyboard_toolbar.active_panel
    }

    /// Current horizontal scroll offset (logical px) of the `KeyboardToolbar` item strip.
    pub fn keyboard_toolbar_strip_scroll(&self) -> f32 {
        self.keyboard_toolbar.strip_scroll
    }

    pub(super) fn keyboard_toolbar_max_strip_scroll(&self, bar_width: f32) -> f32 {
        let pad_x = 4.0;
        let gap = 2.0;
        let btn = KEYBOARD_TOOLBAR_BUTTON;
        let in_sub = !self.keyboard_toolbar.marks_disabled
            && self.keyboard_toolbar.level == KeyboardToolbarLevel::TextStyle;
        let can_pick_images = self.keyboard_toolbar.capabilities.can_pick_images;
        let item_count = if in_sub {
            TEXT_SUB_TOOLBAR_ITEMS
                .iter()
                .filter(|item| item.is_visible_for(can_pick_images))
                .count()
        } else {
            DEFAULT_KEYBOARD_TOOLBAR_ITEMS
                .iter()
                .filter(|item| item.is_visible_for(can_pick_images))
                .count()
        };
        let fixed_right = btn + gap + 9.0;
        let fixed_left = if in_sub { btn + gap } else { 0.0 };
        let avail_w = (bar_width - pad_x * 2.0 - fixed_right - fixed_left).max(btn);
        let content_w = if item_count == 0 {
            0.0
        } else {
            item_count as f32 * btn + (item_count - 1) as f32 * gap
        };
        (content_w - avail_w).max(0.0).ceil()
    }

    /// Scroll the horizontal `KeyboardToolbar` item strip by `delta_x` px (`delta_x < 0` scrolls right).
    pub(super) fn scroll_keyboard_toolbar_strip(
        &mut self,
        scene: &crate::overlays::OverlayScene<'_>,
        delta_x: f32,
    ) -> bool {
        if !self.keyboard_toolbar.visible {
            return false;
        }
        let max_scroll = self.keyboard_toolbar_max_strip_scroll(scene.window.0.max(0.0).floor());
        if max_scroll <= 0.0 {
            self.keyboard_toolbar.strip_scroll = 0.0;
            return true;
        }
        self.keyboard_toolbar.strip_scroll = (self.keyboard_toolbar.strip_scroll - delta_x)
            .clamp(0.0, max_scroll)
            .round();
        true
    }

    /// Scroll the horizontal `KeyboardToolbar` strip when `(x, y)` lies inside the toolbar bar rect.
    pub(super) fn scroll_keyboard_toolbar_at(
        &mut self,
        scene: &crate::overlays::OverlayScene<'_>,
        x: f32,
        y: f32,
        delta_x: f32,
        delta_y: f32,
    ) -> bool {
        if !self.keyboard_toolbar.visible {
            return false;
        }
        let width = scene.window.0.max(0.0).floor();
        let win_h = (scene.window.1 - scene.bottom_inset.max(0.0))
            .max(crate::TOPBAR_HEIGHT)
            .floor();
        let panel_height = if !self.keyboard_toolbar.marks_disabled
            && self.keyboard_toolbar.active_panel.is_some()
        {
            let max_panel =
                (win_h - crate::TOPBAR_HEIGHT - KEYBOARD_TOOLBAR_HEIGHT - 16.0).max(120.0);
            KEYBOARD_TOOL_PANEL_HEIGHT.min(max_panel).floor()
        } else {
            0.0
        };
        let top = (win_h - (KEYBOARD_TOOLBAR_HEIGHT + panel_height))
            .max(crate::TOPBAR_HEIGHT)
            .floor();
        let bar_rect = crate::block_flow::FlowRect::new(0.0, top, width, KEYBOARD_TOOLBAR_HEIGHT);
        if !bar_rect.contains(x, y) {
            return false;
        }
        let step = if delta_x != 0.0 { delta_x } else { delta_y };
        self.scroll_keyboard_toolbar_strip(scene, step)
    }

    /// Total vertical height occluded at the bottom of the window by the docked keyboard toolbar
    /// (plus its expanded tool panel when open), or `0.0` when hidden.
    pub fn keyboard_toolbar_reserved_height(&self, win_h: f32) -> f32 {
        if !self.keyboard_toolbar.visible {
            return 0.0;
        }
        let panel_height = if !self.keyboard_toolbar.marks_disabled
            && self.keyboard_toolbar.active_panel.is_some()
        {
            let max_panel =
                (win_h - crate::TOPBAR_HEIGHT - KEYBOARD_TOOLBAR_HEIGHT - 16.0).max(120.0);
            KEYBOARD_TOOL_PANEL_HEIGHT.min(max_panel).floor()
        } else {
            0.0
        };
        KEYBOARD_TOOLBAR_HEIGHT + panel_height
    }

    /// Toggle one docked bottom tool panel (`More`, `TurnInto`, or `Highlight`).
    pub fn toggle_keyboard_toolbar_panel(&mut self, panel: KeyboardToolbarPanel) {
        if self.keyboard_toolbar.marks_disabled {
            return;
        }
        if self.keyboard_toolbar.active_panel == Some(panel) {
            self.keyboard_toolbar.active_panel = None;
        } else {
            self.keyboard_toolbar.active_panel = Some(panel);
        }
        self.keyboard_toolbar.panel_scroll = 0.0;
    }

    /// Close any open keyboard tool panel.
    pub fn close_keyboard_toolbar_panel(&mut self) {
        self.keyboard_toolbar.active_panel = None;
        self.keyboard_toolbar.panel_scroll = 0.0;
    }

    /// Enter the `Aa` text-style sub-toolbar manually.
    pub fn open_keyboard_text_subtoolbar(&mut self) {
        if self.keyboard_toolbar.marks_disabled {
            return;
        }
        self.keyboard_toolbar.active_panel = None;
        self.keyboard_toolbar.panel_scroll = 0.0;
        self.keyboard_toolbar.level = KeyboardToolbarLevel::TextStyle;
        self.keyboard_toolbar.manual_text_subtoolbar = true;
        self.keyboard_toolbar.strip_scroll = 0.0;
    }

    /// Return from the `Aa` text-style sub-toolbar to the top-level toolbar.
    pub fn close_keyboard_text_subtoolbar(&mut self) {
        self.keyboard_toolbar.active_panel = None;
        self.keyboard_toolbar.panel_scroll = 0.0;
        self.keyboard_toolbar.level = KeyboardToolbarLevel::Main;
        self.keyboard_toolbar.manual_text_subtoolbar = false;
        self.keyboard_toolbar.strip_scroll = 0.0;
    }

    /// Scroll an open keyboard tool panel (`+`, `Turn into`, or `Highlight`) by `delta_y` px.
    pub(super) fn scroll_active_keyboard_tool_panel(
        &mut self,
        scene: &crate::overlays::OverlayScene<'_>,
        delta_y: f32,
    ) -> bool {
        if !self.keyboard_toolbar.visible || self.keyboard_toolbar.marks_disabled {
            return false;
        }
        let Some(panel) = self.keyboard_toolbar.active_panel else {
            return false;
        };
        if delta_y == 0.0 {
            return true;
        }
        let width = scene.window.0.max(0.0).floor();
        let win_h = (scene.window.1 - scene.bottom_inset.max(0.0))
            .max(crate::TOPBAR_HEIGHT)
            .floor();
        let max_panel = (win_h - crate::TOPBAR_HEIGHT - KEYBOARD_TOOLBAR_HEIGHT - 16.0).max(120.0);
        let panel_height = KEYBOARD_TOOL_PANEL_HEIGHT.min(max_panel).floor();
        let pad_x = if width <= 340.0 { 8.0 } else { 12.0 };
        let inner_w = (width - pad_x * 2.0 - 2.0).max(120.0);
        let list_h = (panel_height - 16.0 - 2.0).max(80.0);
        let cols: usize = ((inner_w + 6.0) / (KEYBOARD_TOOLBAR_BUTTON + 6.0))
            .floor()
            .clamp(3.0, 5.0) as usize;
        let header_h = 18.0;
        let tile_row_h = KEYBOARD_TOOLBAR_BUTTON + 14.0;
        let row_gap = 4.0;
        let group_gap = 8.0;
        let can_pick_images = self.keyboard_toolbar.capabilities.can_pick_images;
        let mut cursor_y = 0.0_f32;
        match panel {
            KeyboardToolbarPanel::More => {
                let mut first = true;
                for group in MORE_TOOL_PANEL_GROUPS {
                    let count = group
                        .items
                        .iter()
                        .filter(|i| i.is_visible_for(can_pick_images))
                        .count();
                    if count == 0 {
                        continue;
                    }
                    if !first {
                        cursor_y += group_gap;
                    }
                    first = false;
                    cursor_y += header_h + row_gap;
                    cursor_y += (count.div_ceil(cols) as f32) * (tile_row_h + row_gap);
                }
            }
            KeyboardToolbarPanel::TurnInto => {
                let count = TURN_INTO_PANEL_ITEMS
                    .iter()
                    .filter(|i| i.is_visible_for(can_pick_images))
                    .count();
                cursor_y += header_h + row_gap;
                cursor_y += (count.div_ceil(cols) as f32) * (tile_row_h + row_gap);
            }
            KeyboardToolbarPanel::Highlight => {
                for idx in 0..2 {
                    if idx > 0 {
                        cursor_y += group_gap;
                    }
                    cursor_y += header_h + row_gap;
                    cursor_y +=
                        (HighlightColor::ALL.len().div_ceil(cols) as f32) * (tile_row_h + row_gap);
                }
            }
        }
        let max_scroll = (cursor_y - list_h).max(0.0);
        self.keyboard_toolbar.panel_scroll = (self.keyboard_toolbar.panel_scroll - delta_y)
            .clamp(0.0, max_scroll)
            .round();
        true
    }

    /// Scroll an open keyboard tool panel when `(x, y)` lies inside its docked rect.
    pub(super) fn scroll_keyboard_tool_panel(
        &mut self,
        scene: &crate::overlays::OverlayScene<'_>,
        x: f32,
        y: f32,
        delta_y: f32,
    ) -> bool {
        if !self.keyboard_toolbar.visible
            || self.keyboard_toolbar.marks_disabled
            || self.keyboard_toolbar.active_panel.is_none()
        {
            return false;
        }
        let width = scene.window.0.max(0.0).floor();
        let win_h = (scene.window.1 - scene.bottom_inset.max(0.0))
            .max(crate::TOPBAR_HEIGHT)
            .floor();
        let max_panel = (win_h - crate::TOPBAR_HEIGHT - KEYBOARD_TOOLBAR_HEIGHT - 16.0).max(120.0);
        let panel_height = KEYBOARD_TOOL_PANEL_HEIGHT.min(max_panel).floor();
        let top = (win_h - (KEYBOARD_TOOLBAR_HEIGHT + panel_height))
            .max(crate::TOPBAR_HEIGHT)
            .floor();
        let panel_rect = crate::block_flow::FlowRect::new(
            0.0,
            top + KEYBOARD_TOOLBAR_HEIGHT,
            width,
            panel_height,
        );
        panel_rect.contains(x, y) && self.scroll_active_keyboard_tool_panel(scene, delta_y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::overlays::slash_item_by_id;

    #[test]
    fn config_matches_0275_top_level_and_8_panel_groups_order() {
        let top_ids: Vec<&str> = DEFAULT_KEYBOARD_TOOLBAR_ITEMS
            .iter()
            .map(ToolbarItemSpec::id)
            .collect();
        assert_eq!(
            top_ids,
            vec![
                "more_panel",
                "text_style",
                "image",
                "attachment",
                "undo",
                "redo",
                "indent",
                "bullet",
                "numbered",
                "todo",
                "toggle",
                "divider",
                "outdent",
                "copy",
                "duplicate",
                "delete",
            ]
        );

        let group_names: Vec<&str> = MORE_TOOL_PANEL_GROUPS.iter().map(|g| g.name).collect();
        assert_eq!(
            group_names,
            vec![
                "Basic",
                "List",
                "Page",
                "Content & Media",
                "Embeds",
                "Document Group&Frame",
                "Date",
                "Database",
            ]
        );

        // Attachment is declared in both top-level and Content & Media with showWhen == false.
        let top_att = DEFAULT_KEYBOARD_TOOLBAR_ITEMS
            .iter()
            .find(|i| i.id() == "attachment")
            .expect("Attachment declared");
        assert!(!top_att.is_visible());

        // Database views stay schema-gated while mobile database editing is read-only.
        let db = MORE_TOOL_PANEL_GROUPS
            .iter()
            .find(|g| g.name == "Database")
            .expect("Database group declared");
        assert_eq!(db.items.len(), 2);
        assert!(db.items.iter().all(|item| !item.is_visible()));
        assert!(!is_flavour_supported("affine:database"));
    }

    #[test]
    fn slash_backed_toolbar_items_reuse_slash_items_definitions() {
        for (slash_id, expected_action) in [
            (
                "text",
                KeyboardToolbarAction::Slash(SlashCommand::Paragraph(
                    blocksuite_playground_doc::schema::ParagraphType::Text,
                )),
            ),
            (
                "h1",
                KeyboardToolbarAction::Slash(SlashCommand::Paragraph(
                    blocksuite_playground_doc::schema::ParagraphType::H1,
                )),
            ),
            (
                "h6",
                KeyboardToolbarAction::Slash(SlashCommand::Paragraph(
                    blocksuite_playground_doc::schema::ParagraphType::H6,
                )),
            ),
            ("code", KeyboardToolbarAction::Slash(SlashCommand::Code)),
            (
                "quote",
                KeyboardToolbarAction::Slash(SlashCommand::Paragraph(
                    blocksuite_playground_doc::schema::ParagraphType::Quote,
                )),
            ),
            (
                "divider",
                KeyboardToolbarAction::Slash(SlashCommand::Divider),
            ),
            (
                "bulleted",
                KeyboardToolbarAction::Slash(SlashCommand::List(
                    blocksuite_playground_doc::schema::ListType::Bulleted,
                )),
            ),
            (
                "numbered",
                KeyboardToolbarAction::Slash(SlashCommand::List(
                    blocksuite_playground_doc::schema::ListType::Numbered,
                )),
            ),
            (
                "todo",
                KeyboardToolbarAction::Slash(SlashCommand::List(
                    blocksuite_playground_doc::schema::ListType::Todo,
                )),
            ),
            (
                "toggle",
                KeyboardToolbarAction::Slash(SlashCommand::List(
                    blocksuite_playground_doc::schema::ListType::Toggle,
                )),
            ),
            (
                "new_doc",
                KeyboardToolbarAction::Slash(SlashCommand::NewDoc),
            ),
            (
                "linked_doc",
                KeyboardToolbarAction::Slash(SlashCommand::LinkedDoc),
            ),
        ] {
            let slash = slash_item_by_id(slash_id).expect("slash item exists");
            assert_eq!(KeyboardToolbarAction::Slash(slash.command), expected_action);
        }
    }

    #[test]
    fn autoshow_switches_to_text_subtoolbar_and_table_gate_collapses_panels() {
        let mut overlays = Overlays::new();
        overlays.set_keyboard_toolbar_visible(true);
        assert_eq!(
            overlays.keyboard_toolbar_level(),
            KeyboardToolbarLevel::Main
        );

        overlays.set_keyboard_toolbar_capabilities(KeyboardToolbarCapabilities {
            has_body_selection: true,
            has_non_collapsed_selection: true,
            ..Default::default()
        });
        assert_eq!(
            overlays.keyboard_toolbar_level(),
            KeyboardToolbarLevel::TextStyle
        );

        overlays.toggle_keyboard_toolbar_panel(KeyboardToolbarPanel::Highlight);
        assert_eq!(
            overlays.keyboard_toolbar_active_panel(),
            Some(KeyboardToolbarPanel::Highlight)
        );

        // Collapsing selection returns to Main and closes sub-panel.
        overlays.set_keyboard_toolbar_capabilities(KeyboardToolbarCapabilities {
            has_body_selection: true,
            has_non_collapsed_selection: false,
            ..Default::default()
        });
        assert_eq!(
            overlays.keyboard_toolbar_level(),
            KeyboardToolbarLevel::Main
        );
        assert_eq!(overlays.keyboard_toolbar_active_panel(), None);

        // Table cell focus gate collapses any open panel immediately.
        overlays.toggle_keyboard_toolbar_panel(KeyboardToolbarPanel::More);
        assert_eq!(
            overlays.keyboard_toolbar_active_panel(),
            Some(KeyboardToolbarPanel::More)
        );
        overlays.set_keyboard_toolbar_marks_disabled(true);
        assert_eq!(overlays.keyboard_toolbar_active_panel(), None);
        assert_eq!(
            overlays.keyboard_toolbar_level(),
            KeyboardToolbarLevel::Main
        );
    }
}
