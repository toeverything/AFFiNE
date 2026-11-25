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
    /// Creates a new empty document and inserts an inline `LinkedPage` reference chip at the caret.
    NewDoc,
    /// Replaces `/query` with `@` and opens the `@` linked-document picker at the caret.
    LinkedDoc,
}

impl SlashCommand {
    pub fn block_spec(self) -> BlockSpec {
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
            Self::NewDoc | Self::LinkedDoc => BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
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
    pub description: &'static str,
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
    description: &'static str,
    group: &'static str,
    icon: &'static str,
    keywords: &'static [&'static str],
    command: SlashCommand,
) -> SlashItem {
    SlashItem {
        id,
        title,
        description,
        group,
        icon,
        keywords,
        command,
    }
}

/// Every slash menu item, in menu order; items of one group are adjacent. The order is
/// BlockSuite's (text, headings, code, quote, divider, then lists), with all six headings
/// in the list itself so each is one filter away.
pub const SLASH_ITEMS: [SlashItem; 16] = [
    slash_item(
        "text",
        "Text",
        "Start typing with plain text.",
        "Basic",
        "TextIcon",
        &["plain"],
        SlashCommand::Paragraph(ParagraphType::Text),
    ),
    slash_item(
        "h1",
        "Heading 1",
        "Headings in the largest font.",
        "Basic",
        "Heading1Icon",
        &["h1", "heading1", "title"],
        SlashCommand::Paragraph(ParagraphType::H1),
    ),
    slash_item(
        "h2",
        "Heading 2",
        "Headings in the 2nd font size.",
        "Basic",
        "Heading2Icon",
        &["h2", "heading2"],
        SlashCommand::Paragraph(ParagraphType::H2),
    ),
    slash_item(
        "h3",
        "Heading 3",
        "Headings in the 3rd font size.",
        "Basic",
        "Heading3Icon",
        &["h3", "heading3"],
        SlashCommand::Paragraph(ParagraphType::H3),
    ),
    slash_item(
        "h4",
        "Heading 4",
        "Headings in the 4th font size.",
        "Basic",
        "Heading4Icon",
        &["h4", "heading4"],
        SlashCommand::Paragraph(ParagraphType::H4),
    ),
    slash_item(
        "h5",
        "Heading 5",
        "Headings in the 5th font size.",
        "Basic",
        "Heading5Icon",
        &["h5", "heading5"],
        SlashCommand::Paragraph(ParagraphType::H5),
    ),
    slash_item(
        "h6",
        "Heading 6",
        "Headings in the 6th font size.",
        "Basic",
        "Heading6Icon",
        &["h6", "heading6"],
        SlashCommand::Paragraph(ParagraphType::H6),
    ),
    slash_item(
        "code",
        "Code Block",
        "Code snippet with formatting.",
        "Basic",
        "CodeBlockIcon",
        &["snippet", "pre"],
        SlashCommand::Code,
    ),
    slash_item(
        "quote",
        "Quote",
        "Add a blockquote for emphasis.",
        "Basic",
        "QuoteIcon",
        &["blockquote"],
        SlashCommand::Paragraph(ParagraphType::Quote),
    ),
    slash_item(
        "divider",
        "Divider",
        "Visually separate content.",
        "Basic",
        "DividerIcon",
        &["hr", "line", "separator"],
        SlashCommand::Divider,
    ),
    slash_item(
        "new_doc",
        "New Doc",
        "Start a new document.",
        "Basic",
        "PlusIcon",
        &["subpage", "newdoc", "page"],
        SlashCommand::NewDoc,
    ),
    slash_item(
        "linked_doc",
        "Linked Doc",
        "Link to another document.",
        "Basic",
        "LinkedPageIcon",
        &["linkedpage", "at", "mention", "doc", "duallink"],
        SlashCommand::LinkedDoc,
    ),
    slash_item(
        "bulleted",
        "Bulleted List",
        "Create a bulleted list.",
        "List",
        "BulletedListIcon",
        &["ul", "unordered"],
        SlashCommand::List(ListType::Bulleted),
    ),
    slash_item(
        "numbered",
        "Numbered List",
        "Create a numbered list.",
        "List",
        "NumberedListIcon",
        &["ol", "ordered"],
        SlashCommand::List(ListType::Numbered),
    ),
    slash_item(
        "todo",
        "To-do List",
        "Add tasks to a to-do list.",
        "List",
        "CheckBoxCheckLinearIcon",
        &["todo", "task", "checkbox"],
        SlashCommand::List(ListType::Todo),
    ),
    slash_item(
        "toggle",
        "Toggle List",
        "Create a collapsible list.",
        "List",
        "ToggleRightIcon",
        &["collapse", "fold"],
        SlashCommand::List(ListType::Toggle),
    ),
];

fn is_fuzzy_match(haystack: &str, needle: &str) -> bool {
    let mut chars = needle.chars();
    let Some(mut target) = chars.next() else {
        return true;
    };
    for ch in haystack
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .flat_map(char::to_lowercase)
    {
        if ch == target {
            match chars.next() {
                Some(next) => target = next,
                None => return true,
            }
        }
    }
    false
}

/// Subsequence score matching BlockSuite's `substringMatchScore` (`string.ts:44-75`):
/// `[0.5, 1.0]` when `query` is a contiguous substring of `name`, `(0.0, 0.5)` for the
/// longest common contiguous substring, and `0.0` when empty or longer than `name`.
pub fn substring_match_score(name: &str, query: &str) -> f64 {
    let query_units: Vec<u16> = query.to_lowercase().encode_utf16().collect();
    let name_units: Vec<u16> = name.to_lowercase().encode_utf16().collect();
    if query_units.is_empty() || name_units.is_empty() || query_units.len() > name_units.len() {
        return 0.0;
    }
    let score = if name_units
        .windows(query_units.len())
        .any(|window| window == query_units.as_slice())
    {
        1.0 + query_units.len() as f64 / name_units.len() as f64
    } else {
        let mut max_match = 0usize;
        for i in 0..query_units.len() {
            for j in 0..name_units.len() {
                let mut len = 0usize;
                while i + len < query_units.len()
                    && j + len < name_units.len()
                    && query_units[i + len] == name_units[j + len]
                {
                    len += 1;
                }
                if len > max_match {
                    max_match = len;
                }
            }
        }
        max_match as f64 / name_units.len() as f64
    };
    0.5 * score
}

/// Items matching `query`: case- and whitespace-insensitive subsequence match
/// (`isFuzzyMatch`) against the item's title or any keyword, stably sorted by
/// descending [`substring_match_score`] against the title when `query` is non-empty.
/// An empty query returns every item in menu order.
pub fn filter_slash_items(query: &str) -> Vec<&'static SlashItem> {
    let needle: String = query
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect();
    let mut matched: Vec<&'static SlashItem> = SLASH_ITEMS
        .iter()
        .filter(|item| {
            needle.is_empty()
                || is_fuzzy_match(item.title, &needle)
                || item
                    .keywords
                    .iter()
                    .any(|keyword| is_fuzzy_match(keyword, &needle))
        })
        .collect();
    if !needle.is_empty() {
        let search_str = query.trim_start();
        matched.sort_by(|a, b| {
            substring_match_score(b.title, search_str)
                .total_cmp(&substring_match_score(a.title, search_str))
        });
    }
    matched
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SlashRow {
    Header(&'static str),
    Item(usize),
    Empty,
}

/// Rows of the slash menu list as `(row, y, height)`, and the list's total height.
pub fn slash_rows(items: &[&'static SlashItem]) -> (Vec<(SlashRow, f32, f32)>, f32) {
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

/// Rows of the slash menu list for `query`: hides group headers while filtering.
pub fn slash_rows_for_query(
    items: &[&'static SlashItem],
    query: &str,
) -> (Vec<(SlashRow, f32, f32)>, f32) {
    if query.trim().is_empty() {
        return slash_rows(items);
    }
    if items.is_empty() {
        return (
            vec![(SlashRow::Empty, 0.0, SLASH_ITEM_HEIGHT)],
            SLASH_ITEM_HEIGHT,
        );
    }
    let mut rows = Vec::with_capacity(items.len());
    let mut y = 0.0;
    for index in 0..items.len() {
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
