//! Declarative `0.27.5` `defaultKeyboardToolbarConfig` tables.
//!
//! Mirrors `blocksuite/affine/widgets/keyboard-toolbar/src/config.ts` verbatim:
//! top-level items, `moreToolPanel` 8-group layout, `textSubToolbarConfig`,
//! `textToolPanel` (`Turn into`), and `showWhen` schema gating.

use blocksuite_playground_doc::schema::{ListType, ParagraphType};

use super::{KeyboardToolbarAction, KeyboardToolbarDateKind, KeyboardToolbarPanel, SlashCommand};

/// Whether the current native Page editor registers and supports creating `flavour`.
/// Mirrors `std.store.schema.flavourSchemaMap.has(flavour)` in `0.27.5` `config.ts`.
pub const fn is_flavour_supported(flavour: &str) -> bool {
    matches!(
        flavour.as_bytes(),
        b"affine:paragraph"
            | b"affine:list"
            | b"affine:code"
            | b"affine:divider"
            | b"affine:latex"
            | b"affine:table"
            | b"affine:callout"
            | b"affine:embed-linked-doc"
            | b"affine:image"
            | b"affine:bookmark"
    )
}

/// One action entry in the toolbar strip or a docked tool panel.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ToolbarActionSpec {
    pub id: &'static str,
    pub name: &'static str,
    /// Icon name in `ui-tokens` (empty string falls back to typographic glyph).
    pub icon: &'static str,
    pub action: KeyboardToolbarAction,
    /// Required BlockSuite flavour for `showWhen` gating (`None` = always supported).
    pub required_flavour: Option<&'static str>,
    /// Explicit `showWhen: () => false` in `0.27.5` (e.g. `Attachment` at `config.ts:482,1104`).
    pub always_hidden: bool,
}

impl ToolbarActionSpec {
    pub const fn is_visible(&self) -> bool {
        if self.always_hidden {
            return false;
        }
        match self.required_flavour {
            Some(flavour) => is_flavour_supported(flavour),
            None => true,
        }
    }

    pub const fn is_visible_for(&self, can_pick_images: bool) -> bool {
        if !self.is_visible() {
            return false;
        }
        if matches!(self.action, KeyboardToolbarAction::Image) {
            return can_pick_images;
        }
        true
    }
}

/// One entry of a toolbar strip (action button, sub-toolbar trigger, or panel trigger).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToolbarItemSpec {
    Action(ToolbarActionSpec),
    SubToolbar {
        id: &'static str,
        name: &'static str,
        icon: &'static str,
        action: KeyboardToolbarAction,
    },
    ToolPanel {
        id: &'static str,
        name: &'static str,
        icon: &'static str,
        panel: KeyboardToolbarPanel,
        action: KeyboardToolbarAction,
    },
}

impl ToolbarItemSpec {
    pub const fn id(&self) -> &'static str {
        match self {
            Self::Action(spec) => spec.id,
            Self::SubToolbar { id, .. } | Self::ToolPanel { id, .. } => id,
        }
    }

    pub const fn name(&self) -> &'static str {
        match self {
            Self::Action(spec) => spec.name,
            Self::SubToolbar { name, .. } | Self::ToolPanel { name, .. } => name,
        }
    }

    pub const fn icon(&self) -> &'static str {
        match self {
            Self::Action(spec) => spec.icon,
            Self::SubToolbar { icon, .. } | Self::ToolPanel { icon, .. } => icon,
        }
    }

    pub const fn action(&self) -> KeyboardToolbarAction {
        match self {
            Self::Action(spec) => spec.action,
            Self::SubToolbar { action, .. } | Self::ToolPanel { action, .. } => *action,
        }
    }

    pub const fn is_visible(&self) -> bool {
        match self {
            Self::Action(spec) => spec.is_visible(),
            Self::SubToolbar { .. } | Self::ToolPanel { .. } => true,
        }
    }

    pub const fn is_visible_for(&self, can_pick_images: bool) -> bool {
        match self {
            Self::Action(spec) => spec.is_visible_for(can_pick_images),
            Self::SubToolbar { .. } | Self::ToolPanel { .. } => true,
        }
    }
}

/// One named group inside a docked tool panel (`moreToolPanel` / `textToolPanel`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ToolPanelGroupSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub items: &'static [ToolbarActionSpec],
}

const fn act(
    id: &'static str,
    name: &'static str,
    icon: &'static str,
    action: KeyboardToolbarAction,
    required_flavour: Option<&'static str>,
) -> ToolbarActionSpec {
    ToolbarActionSpec {
        id,
        name,
        icon,
        action,
        required_flavour,
        always_hidden: false,
    }
}

const fn hidden_act(
    id: &'static str,
    name: &'static str,
    icon: &'static str,
    action: KeyboardToolbarAction,
    required_flavour: Option<&'static str>,
) -> ToolbarActionSpec {
    ToolbarActionSpec {
        id,
        name,
        icon,
        action,
        required_flavour,
        always_hidden: true,
    }
}

/// `textToolActionItems` (`config.ts:190-330`), reusing `SlashCommand` for block conversions.
pub const TURN_INTO_PANEL_ITEMS: [ToolbarActionSpec; 14] = [
    act(
        "text",
        "Text",
        "TextIcon",
        KeyboardToolbarAction::Slash(SlashCommand::Paragraph(ParagraphType::Text)),
        Some("affine:paragraph"),
    ),
    act(
        "h1",
        "Heading 1",
        "Heading1Icon",
        KeyboardToolbarAction::Slash(SlashCommand::Paragraph(ParagraphType::H1)),
        Some("affine:paragraph"),
    ),
    act(
        "h2",
        "Heading 2",
        "Heading2Icon",
        KeyboardToolbarAction::Slash(SlashCommand::Paragraph(ParagraphType::H2)),
        Some("affine:paragraph"),
    ),
    act(
        "h3",
        "Heading 3",
        "Heading3Icon",
        KeyboardToolbarAction::Slash(SlashCommand::Paragraph(ParagraphType::H3)),
        Some("affine:paragraph"),
    ),
    act(
        "h4",
        "Heading 4",
        "Heading4Icon",
        KeyboardToolbarAction::Slash(SlashCommand::Paragraph(ParagraphType::H4)),
        Some("affine:paragraph"),
    ),
    act(
        "h5",
        "Heading 5",
        "Heading5Icon",
        KeyboardToolbarAction::Slash(SlashCommand::Paragraph(ParagraphType::H5)),
        Some("affine:paragraph"),
    ),
    act(
        "h6",
        "Heading 6",
        "Heading6Icon",
        KeyboardToolbarAction::Slash(SlashCommand::Paragraph(ParagraphType::H6)),
        Some("affine:paragraph"),
    ),
    act(
        "code_block",
        "Code Block",
        "CodeBlockIcon",
        KeyboardToolbarAction::Slash(SlashCommand::Code),
        Some("affine:code"),
    ),
    act(
        "equation_block",
        "Equation",
        "TeXIcon",
        KeyboardToolbarAction::EquationBlock,
        Some("affine:latex"),
    ),
    act(
        "quote",
        "Quote",
        "QuoteIcon",
        KeyboardToolbarAction::Slash(SlashCommand::Paragraph(ParagraphType::Quote)),
        Some("affine:paragraph"),
    ),
    act(
        "divider",
        "Divider",
        "DividerIcon",
        KeyboardToolbarAction::Slash(SlashCommand::Divider),
        Some("affine:divider"),
    ),
    act(
        "inline_math",
        "Inline Eq",
        "TeXIcon",
        KeyboardToolbarAction::InlineMath,
        Some("affine:paragraph"),
    ),
    act(
        "table",
        "Table",
        "SquareIcon",
        KeyboardToolbarAction::Table,
        Some("affine:table"),
    ),
    act(
        "callout",
        "Callout",
        "InformationIcon",
        KeyboardToolbarAction::Callout,
        Some("affine:callout"),
    ),
];

/// `listToolActionItems` (`config.ts:332-372`, extended with `Toggle List` from `SLASH_ITEMS`).
pub const LIST_TOOL_ACTION_ITEMS: [ToolbarActionSpec; 4] = [
    act(
        "bullet",
        "Bulleted",
        "BulletedListIcon",
        KeyboardToolbarAction::Slash(SlashCommand::List(ListType::Bulleted)),
        Some("affine:list"),
    ),
    act(
        "numbered",
        "Numbered",
        "NumberedListIcon",
        KeyboardToolbarAction::Slash(SlashCommand::List(ListType::Numbered)),
        Some("affine:list"),
    ),
    act(
        "todo",
        "To-do",
        "CheckBoxCheckLinearIcon",
        KeyboardToolbarAction::Slash(SlashCommand::List(ListType::Todo)),
        Some("affine:list"),
    ),
    act(
        "toggle",
        "Toggle",
        "ToggleRightIcon",
        KeyboardToolbarAction::Slash(SlashCommand::List(ListType::Toggle)),
        Some("affine:list"),
    ),
];

const PAGE_TOOL_ITEMS: [ToolbarActionSpec; 2] = [
    act(
        "new_page",
        "New Page",
        "PageIcon",
        KeyboardToolbarAction::Slash(SlashCommand::NewDoc),
        Some("affine:embed-linked-doc"),
    ),
    act(
        "linked_page",
        "Linked Page",
        "LinkedPageIcon",
        KeyboardToolbarAction::Slash(SlashCommand::LinkedDoc),
        Some("affine:embed-linked-doc"),
    ),
];

const CONTENT_MEDIA_ITEMS: [ToolbarActionSpec; 4] = [
    act(
        "image",
        "Image",
        "",
        KeyboardToolbarAction::Image,
        Some("affine:image"),
    ),
    act(
        "bookmark",
        "Link",
        "LinkIcon",
        KeyboardToolbarAction::Bookmark,
        Some("affine:bookmark"),
    ),
    hidden_act(
        "attachment",
        "Attachment",
        "",
        KeyboardToolbarAction::Attachment,
        Some("affine:attachment"),
    ),
    act(
        "equation_block",
        "Equation",
        "TeXIcon",
        KeyboardToolbarAction::EquationBlock,
        Some("affine:latex"),
    ),
];

const EMBED_TOOL_ITEMS: [ToolbarActionSpec; 6] = [
    act(
        "embed_iframe",
        "Embed",
        "LinkIcon",
        KeyboardToolbarAction::EmbedIframe,
        Some("affine:embed-iframe"),
    ),
    act(
        "embed_youtube",
        "Youtube",
        "LinkIcon",
        KeyboardToolbarAction::EmbedYoutube,
        Some("affine:embed-youtube"),
    ),
    act(
        "embed_github",
        "Github",
        "LinkIcon",
        KeyboardToolbarAction::EmbedGithub,
        Some("affine:embed-github"),
    ),
    act(
        "embed_figma",
        "Figma",
        "LinkIcon",
        KeyboardToolbarAction::EmbedFigma,
        Some("affine:embed-figma"),
    ),
    act(
        "embed_loom",
        "Loom",
        "LinkIcon",
        KeyboardToolbarAction::EmbedLoom,
        Some("affine:embed-loom"),
    ),
    act(
        "equation_block",
        "Equation",
        "TeXIcon",
        KeyboardToolbarAction::EquationBlock,
        Some("affine:latex"),
    ),
];

const DOC_GROUP_FRAME_ITEMS: [ToolbarActionSpec; 0] = [];

const DATE_TOOL_ITEMS: [ToolbarActionSpec; 4] = [
    act(
        "date_today",
        "Today",
        "",
        KeyboardToolbarAction::Date(KeyboardToolbarDateKind::Today),
        None,
    ),
    act(
        "date_tomorrow",
        "Tomorrow",
        "",
        KeyboardToolbarAction::Date(KeyboardToolbarDateKind::Tomorrow),
        None,
    ),
    act(
        "date_yesterday",
        "Yesterday",
        "",
        KeyboardToolbarAction::Date(KeyboardToolbarDateKind::Yesterday),
        None,
    ),
    act(
        "date_now",
        "Now",
        "",
        KeyboardToolbarAction::Date(KeyboardToolbarDateKind::Now),
        None,
    ),
];

const DATABASE_TOOL_ITEMS: [ToolbarActionSpec; 2] = [
    act(
        "database_table",
        "Table view",
        "SquareIcon",
        KeyboardToolbarAction::DatabaseTableView,
        Some("affine:database"),
    ),
    act(
        "database_kanban",
        "Kanban view",
        "SquareIcon",
        KeyboardToolbarAction::DatabaseKanbanView,
        Some("affine:database"),
    ),
];

/// All 8 groups of `moreToolPanel` in exact `config.ts:862-871` order.
pub const MORE_TOOL_PANEL_GROUPS: [ToolPanelGroupSpec; 8] = [
    ToolPanelGroupSpec {
        id: "basic",
        name: "Basic",
        items: &TURN_INTO_PANEL_ITEMS,
    },
    ToolPanelGroupSpec {
        id: "list",
        name: "List",
        items: &LIST_TOOL_ACTION_ITEMS,
    },
    ToolPanelGroupSpec {
        id: "page",
        name: "Page",
        items: &PAGE_TOOL_ITEMS,
    },
    ToolPanelGroupSpec {
        id: "content_media",
        name: "Content & Media",
        items: &CONTENT_MEDIA_ITEMS,
    },
    ToolPanelGroupSpec {
        id: "embeds",
        name: "Embeds",
        items: &EMBED_TOOL_ITEMS,
    },
    ToolPanelGroupSpec {
        id: "doc_group_frame",
        name: "Document Group&Frame",
        items: &DOC_GROUP_FRAME_ITEMS,
    },
    ToolPanelGroupSpec {
        id: "date",
        name: "Date",
        items: &DATE_TOOL_ITEMS,
    },
    ToolPanelGroupSpec {
        id: "database",
        name: "Database",
        items: &DATABASE_TOOL_ITEMS,
    },
];

/// `textSubToolbarConfig.items` (`config.ts:1056-1071`).
pub const TEXT_SUB_TOOLBAR_ITEMS: [ToolbarItemSpec; 9] = [
    ToolbarItemSpec::ToolPanel {
        id: "turn_into",
        name: "Turn into",
        icon: "TextIcon",
        panel: KeyboardToolbarPanel::TurnInto,
        action: KeyboardToolbarAction::ToggleTurnIntoPanel,
    },
    ToolbarItemSpec::Action(act(
        "bold",
        "Bold",
        "BoldIcon",
        KeyboardToolbarAction::Bold,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "italic",
        "Italic",
        "ItalicIcon",
        KeyboardToolbarAction::Italic,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "underline",
        "Underline",
        "UnderLineIcon",
        KeyboardToolbarAction::Underline,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "strike",
        "Strike",
        "StrikeThroughIcon",
        KeyboardToolbarAction::Strike,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "inline_code",
        "Code",
        "CodeIcon",
        KeyboardToolbarAction::InlineCode,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "link",
        "Link",
        "LinkIcon",
        KeyboardToolbarAction::Link,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "inline_math",
        "InlineTex",
        "TeXIcon",
        KeyboardToolbarAction::InlineMath,
        None,
    )),
    ToolbarItemSpec::ToolPanel {
        id: "highlight",
        name: "Highlight",
        icon: "",
        panel: KeyboardToolbarPanel::Highlight,
        action: KeyboardToolbarAction::ToggleHighlightPanel,
    },
];

/// `defaultKeyboardToolbarConfig.items` (`config.ts:1082-1225`).
pub const DEFAULT_KEYBOARD_TOOLBAR_ITEMS: [ToolbarItemSpec; 16] = [
    ToolbarItemSpec::ToolPanel {
        id: "more_panel",
        name: "More",
        icon: "PlusIcon",
        panel: KeyboardToolbarPanel::More,
        action: KeyboardToolbarAction::ToggleMorePanel,
    },
    ToolbarItemSpec::SubToolbar {
        id: "text_style",
        name: "Aa",
        icon: "",
        action: KeyboardToolbarAction::OpenTextSubToolbar,
    },
    ToolbarItemSpec::Action(act(
        "image",
        "Image",
        "",
        KeyboardToolbarAction::Image,
        Some("affine:image"),
    )),
    ToolbarItemSpec::Action(hidden_act(
        "attachment",
        "Attachment",
        "",
        KeyboardToolbarAction::Attachment,
        Some("affine:attachment"),
    )),
    ToolbarItemSpec::Action(act(
        "undo",
        "Undo",
        "UndoIcon",
        KeyboardToolbarAction::Undo,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "redo",
        "Redo",
        "RedoIcon",
        KeyboardToolbarAction::Redo,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "indent",
        "Indent",
        "RightTabIcon",
        KeyboardToolbarAction::Indent,
        None,
    )),
    ToolbarItemSpec::Action(LIST_TOOL_ACTION_ITEMS[0]),
    ToolbarItemSpec::Action(LIST_TOOL_ACTION_ITEMS[1]),
    ToolbarItemSpec::Action(LIST_TOOL_ACTION_ITEMS[2]),
    ToolbarItemSpec::Action(LIST_TOOL_ACTION_ITEMS[3]),
    ToolbarItemSpec::Action(act(
        "divider",
        "Divider",
        "DividerIcon",
        KeyboardToolbarAction::Slash(SlashCommand::Divider),
        Some("affine:divider"),
    )),
    ToolbarItemSpec::Action(act(
        "outdent",
        "Outdent",
        "CollapseTabIcon",
        KeyboardToolbarAction::Outdent,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "copy",
        "Copy",
        "CopyIcon",
        KeyboardToolbarAction::Copy,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "duplicate",
        "Duplicate",
        "NoteShadowDuotoneIcon",
        KeyboardToolbarAction::Duplicate,
        None,
    )),
    ToolbarItemSpec::Action(act(
        "delete",
        "Delete",
        "DeleteIcon",
        KeyboardToolbarAction::Delete,
        None,
    )),
];
