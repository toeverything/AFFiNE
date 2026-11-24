use blocksuite_playground_doc::schema::{BlockSpec, ListType, ParagraphType};

use crate::block_flow::FlowRect;

use super::*;

/// What a slash menu item turns the anchor block into, or inserts below it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SlashCommand {
    Paragraph(ParagraphType),
    List(ListType),
    Divider,
    Code,
}

impl SlashCommand {
    pub(super) fn block_spec(self) -> BlockSpec {
        match self {
            Self::Paragraph(paragraph_type) => BlockSpec::Paragraph {
                paragraph_type,
                text: String::new(),
            },
            Self::List(list_type) => BlockSpec::List {
                list_type,
                text: String::new(),
                checked: false,
                order: None,
            },
            Self::Divider => BlockSpec::Divider,
            Self::Code => BlockSpec::Code {
                text: String::new(),
                language: None,
                caption: String::new(),
            },
        }
    }
}

/// One entry of the slash menu.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SlashItem {
    /// Stable id, the last segment of the row's snapshot id.
    pub id: &'static str,
    pub title: &'static str,
    pub group: &'static str,
    /// Name of the generated icon.
    pub icon: &'static str,
    /// Lowercase search words matched by prefix, besides the title.
    pub keywords: &'static [&'static str],
    pub command: SlashCommand,
}

const fn slash_item(
    id: &'static str,
    title: &'static str,
    group: &'static str,
    icon: &'static str,
    keywords: &'static [&'static str],
    command: SlashCommand,
) -> SlashItem {
    SlashItem {
        id,
        title,
        group,
        icon,
        keywords,
        command,
    }
}

/// Every slash menu item, in menu order; items of one group are adjacent. The order is
/// BlockSuite's (text, headings, code, quote, divider, then lists), with all six headings
/// in the list itself so each is one filter away.
pub const SLASH_ITEMS: [SlashItem; 14] = [
    slash_item(
        "text",
        "Text",
        "Basic",
        "TextIcon",
        &["paragraph", "plain"],
        SlashCommand::Paragraph(ParagraphType::Text),
    ),
    slash_item(
        "h1",
        "Heading 1",
        "Basic",
        "Heading1Icon",
        &["h1", "heading1", "title"],
        SlashCommand::Paragraph(ParagraphType::H1),
    ),
    slash_item(
        "h2",
        "Heading 2",
        "Basic",
        "Heading2Icon",
        &["h2", "heading2"],
        SlashCommand::Paragraph(ParagraphType::H2),
    ),
    slash_item(
        "h3",
        "Heading 3",
        "Basic",
        "Heading3Icon",
        &["h3", "heading3"],
        SlashCommand::Paragraph(ParagraphType::H3),
    ),
    slash_item(
        "h4",
        "Heading 4",
        "Basic",
        "Heading4Icon",
        &["h4", "heading4"],
        SlashCommand::Paragraph(ParagraphType::H4),
    ),
    slash_item(
        "h5",
        "Heading 5",
        "Basic",
        "Heading5Icon",
        &["h5", "heading5"],
        SlashCommand::Paragraph(ParagraphType::H5),
    ),
    slash_item(
        "h6",
        "Heading 6",
        "Basic",
        "Heading6Icon",
        &["h6", "heading6"],
        SlashCommand::Paragraph(ParagraphType::H6),
    ),
    slash_item(
        "code",
        "Code Block",
        "Basic",
        "CodeBlockIcon",
        &["snippet", "pre"],
        SlashCommand::Code,
    ),
    slash_item(
        "quote",
        "Quote",
        "Basic",
        "QuoteIcon",
        &["blockquote"],
        SlashCommand::Paragraph(ParagraphType::Quote),
    ),
    slash_item(
        "divider",
        "Divider",
        "Basic",
        "DividerIcon",
        &["hr", "line", "separator"],
        SlashCommand::Divider,
    ),
    slash_item(
        "bulleted",
        "Bulleted List",
        "List",
        "BulletedListIcon",
        &["ul", "unordered"],
        SlashCommand::List(ListType::Bulleted),
    ),
    slash_item(
        "numbered",
        "Numbered List",
        "List",
        "NumberedListIcon",
        &["ol", "ordered"],
        SlashCommand::List(ListType::Numbered),
    ),
    slash_item(
        "todo",
        "To-do List",
        "List",
        "CheckBoxCheckLinearIcon",
        &["todo", "task", "checkbox"],
        SlashCommand::List(ListType::Todo),
    ),
    slash_item(
        "toggle",
        "Toggle List",
        "List",
        "ToggleRightIcon",
        &["collapse", "fold"],
        SlashCommand::List(ListType::Toggle),
    ),
];

/// Items matching `query`, in menu order: the query is found anywhere in a title (case and
/// spaces ignored) or starts a keyword. An empty query matches every item.
pub fn filter_slash_items(query: &str) -> Vec<&'static SlashItem> {
    let needle: String = query
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect();
    SLASH_ITEMS
        .iter()
        .filter(|item| {
            if needle.is_empty() {
                return true;
            }
            let title: String = item
                .title
                .chars()
                .filter(|ch| !ch.is_whitespace())
                .flat_map(char::to_lowercase)
                .collect();
            title.contains(&needle)
                || item
                    .keywords
                    .iter()
                    .any(|keyword| keyword.starts_with(&needle))
        })
        .collect()
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum SlashRow {
    Header(&'static str),
    Item(usize),
    Empty,
}

/// Rows of the slash menu list as `(row, y, height)`, and the list's total height.
pub(super) fn slash_rows(items: &[&'static SlashItem]) -> (Vec<(SlashRow, f32, f32)>, f32) {
    if items.is_empty() {
        return (
            vec![(SlashRow::Empty, 0.0, SLASH_ITEM_HEIGHT)],
            SLASH_ITEM_HEIGHT,
        );
    }
    let mut rows = Vec::new();
    let mut y = 0.0;
    let mut group = "";
    for (index, item) in items.iter().enumerate() {
        if item.group != group {
            group = item.group;
            if index > 0 {
                y += SLASH_GROUP_GAP;
            }
            rows.push((SlashRow::Header(group), y, SLASH_HEADER_HEIGHT));
            y += SLASH_HEADER_HEIGHT;
        }
        rows.push((SlashRow::Item(index), y, SLASH_ITEM_HEIGHT));
        y += SLASH_ITEM_HEIGHT;
    }
    (rows, y)
}

/// The open slash menu.
#[derive(Clone, Debug, PartialEq)]
pub struct SlashMenu {
    /// Block the menu acts on.
    pub block_id: String,
    /// UTF-16 offset in the block's text the menu was opened at.
    pub utf16_offset: usize,
    /// Live filter.
    pub query: String,
    /// Index of the active row among the filtered items.
    pub selected: usize,
    /// Whether an editor typed the query into the document itself; the menu then shows no
    /// query row of its own.
    pub query_in_document: bool,
    /// Explicit world-space anchor; the caret of `utf16_offset` when absent.
    pub(super) anchor_world: Option<FlowRect>,
    pub(super) scroll: f32,
    pub(super) reveal_selected: bool,
    pub(super) presence: Presence,
    /// Screen-space box of the menu as last laid out.
    pub(super) rect: Option<FlowRect>,
}
