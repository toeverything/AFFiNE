//! Document selection, preedit, and text-input core shared across editor hosts.

use std::{collections::BTreeMap, ops::Range};

use blocksuite_playground_doc::{
    DocResult,
    read::{BlockContent, BlockNode, PageSnapshot},
    session::{PageDocSession, SelectionSnapshot},
};
use unicode_segmentation::UnicodeSegmentation;
use y_octo::{Any, SessionCommit};

use crate::{
    block_flow::FlowLayout,
    rich_text::{CaretPosition, TextBiIndex, WrapAffinity},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocPoint {
    pub block_id: String,
    pub caret: CaretPosition,
}

impl DocPoint {
    pub fn new(block_id: impl Into<String>, offset: u64) -> Self {
        Self {
            block_id: block_id.into(),
            caret: CaretPosition {
                utf16_offset: offset,
                affinity: WrapAffinity::Downstream,
            },
        }
    }

    pub fn offset(&self) -> u64 {
        self.caret.utf16_offset
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentSelection {
    pub anchor: DocPoint,
    pub focus: DocPoint,
}

impl DocumentSelection {
    pub fn caret(point: DocPoint) -> Self {
        Self {
            anchor: point.clone(),
            focus: point,
        }
    }

    pub fn empty(&self) -> bool {
        self.anchor.block_id == self.focus.block_id && self.anchor.offset() == self.focus.offset()
    }

    pub fn snapshot(&self, page: &PageDocSession) -> DocResult<SelectionSnapshot> {
        page.capture_selection_snapshot(
            &self.anchor.block_id,
            self.anchor.offset(),
            &self.focus.block_id,
            self.focus.offset(),
        )
    }

    pub fn ordered<'a>(
        &'a self,
        layout: &FlowLayout,
    ) -> Option<(&'a DocPoint, &'a DocPoint, usize, usize, bool)> {
        let index = |p: &DocPoint| layout.blocks.iter().position(|b| b.block_id == p.block_id);
        let a = index(&self.anchor)?;
        let f = index(&self.focus)?;
        Some(if (a, self.anchor.offset()) <= (f, self.focus.offset()) {
            (&self.anchor, &self.focus, a, f, false)
        } else {
            (&self.focus, &self.anchor, f, a, true)
        })
    }
}

#[derive(Default)]
pub struct RangeBlocks {
    pub intermediate: Vec<String>,
    pub survivors: Vec<String>,
}

/// Root content blocks of Page-mode notes, in document order.
pub fn page_content_roots(root: &BlockNode) -> impl DoubleEndedIterator<Item = &BlockNode> {
    root.children
        .iter()
        .filter(|note| note.is_page_visible_note())
        .flat_map(|note| &note.children)
}

impl RangeBlocks {
    pub fn between(snapshot: &PageSnapshot, start: &str, end: &str) -> Option<Self> {
        if start == end {
            return Some(Self::default());
        }
        let root = snapshot.root.as_ref()?;
        let mut pending: Vec<_> = page_content_roots(root)
            .rev()
            .map(|node| (node, false))
            .collect();
        let mut intermediate = Vec::new();
        let mut after_start = root.id == start;
        // Each pending subtree records whether its parent belongs to the deletion.
        // At the endpoint the stack holds its children, then later siblings up the ancestor chain.
        while let Some((node, _)) = pending.pop() {
            pending.extend(node.children.iter().rev().map(|child| (child, after_start)));
            if after_start {
                if node.id == end {
                    let survivors = pending
                        .into_iter()
                        .rev()
                        .filter(|(_, parent_removed)| *parent_removed)
                        .map(|(child, _)| child.id.clone())
                        .collect();
                    return Some(Self {
                        intermediate,
                        survivors,
                    });
                }
                intermediate.push(node.id.clone());
            } else if node.id == start {
                after_start = true;
            }
        }
        None
    }
}

pub struct Preedit {
    pub replacement: SelectionSnapshot,
    pub backward: bool,
    pub text: String,
    pub selected: Range<usize>,
}

#[derive(Default)]
pub struct EditorSession {
    pub selection: Option<DocumentSelection>,
    /// Selected whole-block IDs in document order (entered via `Escape` or second `Mod-a`).
    pub block_selection: Vec<String>,
    pub goal_x: Option<f32>,
    pub preedit: Option<Preedit>,
    pub relative_selection: Option<SelectionSnapshot>,
    pub pending_marks: BTreeMap<String, Option<Any>>,
    pub last_typing: Option<u64>,
    pub reveal: bool,
    /// The primary button is held and extends the selection.
    pub dragging: bool,
    /// The `/` that opened the slash menu from typed text: its block and a relative
    /// position naming that character.
    pub slash_trigger: Option<(String, SelectionSnapshot)>,
    /// The `@` that opened the linked-document menu from typed text: its block, a relative
    /// position naming that `@`, and a stable idempotency intent id for creating from it.
    pub linked_doc_trigger: Option<(String, SelectionSnapshot, String)>,
    pub next_id: u64,
}

impl EditorSession {
    /// Whether an input method composition is in progress.
    pub fn composing(&self) -> bool {
        self.preedit.is_some()
    }

    pub fn clear_preedit_state(&mut self) {
        self.preedit = None;
    }

    pub fn preedit_nonce(&self) -> u64 {
        self.preedit.as_ref().map_or(0u64, |pre| {
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            pre.text.hash(&mut hasher);
            pre.selected.hash(&mut hasher);
            pre.backward.hash(&mut hasher);
            hasher.finish().max(1)
        })
    }
}

pub fn word_range(text: &str, offset: u64) -> Range<u64> {
    let index = TextBiIndex::new(text);
    let byte = index.utf16_to_utf8_clamped(offset);
    text.split_word_bound_indices()
        .find(|(i, s)| i + s.len() > byte)
        .or_else(|| text.split_word_bound_indices().next_back())
        .map(|(i, s)| index.utf8_to_utf16(i)..index.utf8_to_utf16(i + s.len()))
        .unwrap_or(0..0)
}

pub fn text_content(node: &BlockNode) -> Option<&str> {
    match &node.content {
        BlockContent::Page { title } => Some(&title.plain),
        BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => Some(&text.plain),
        BlockContent::Code { text, .. } => Some(text),
        _ => None,
    }
}

pub fn node_mut<'a>(node: &'a mut BlockNode, id: &str) -> Option<&'a mut BlockNode> {
    if node.id == id {
        return Some(node);
    }
    node.children
        .iter_mut()
        .find_map(|child| node_mut(child, id))
}

pub fn parent_of<'a>(snapshot: &'a PageSnapshot, id: &str) -> Option<(&'a BlockNode, usize)> {
    snapshot.root.as_ref()?.walk().find_map(|node| {
        node.children
            .iter()
            .position(|c| c.id == id)
            .map(|pos| (node, pos))
    })
}

pub type Commit = SessionCommit<SelectionSnapshot>;
