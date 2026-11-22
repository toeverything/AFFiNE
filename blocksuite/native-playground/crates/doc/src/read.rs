//! Typed, deterministic read snapshot of a page document's `blocks` tree.
//!
//! [`PageDocSession::read_page_snapshot`] walks the `blocks` root `Y.Map` from the
//! `affine:page` root through every `sys:children` array and returns ordered
//! [`BlockNode`]s. Each node carries a typed [`BlockContent`] for rendering plus the
//! normalized JSON of every `prop:*` entry, so no property is dropped on the way.

use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value as JsonValue;
use y_octo::{Any, SessionReadValue, TextDeltaOp, TextInsert, TypeTarget};

use crate::{
    DocResult,
    schema::{ListType, ParagraphType, UnknownBlock},
    session::PageDocSession,
};

/// Maximum nesting depth followed through `sys:children` before a subtree is cut off.
pub const MAX_BLOCK_DEPTH: usize = 256;

/// A `Y.Text` property: its plain string and its coalesced insert-only delta.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct RichText {
    pub plain: String,
    pub delta: Vec<TextDeltaOp>,
}

impl RichText {
    pub fn is_empty(&self) -> bool {
        self.plain.is_empty() && self.delta.is_empty()
    }
}

/// `prop:displayMode` of an `affine:note`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoteDisplayMode {
    /// Shown in both Page and Edgeless modes (`"both"`).
    Both,
    /// Shown only in Page mode (`"doc"`).
    DocOnly,
    /// Shown only in Edgeless mode (`"edgeless"`).
    EdgelessOnly,
}

impl NoteDisplayMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Both => "both",
            Self::DocOnly => "doc",
            Self::EdgelessOnly => "edgeless",
        }
    }

    fn parse(value: Option<&str>) -> Self {
        match value {
            // BlockSuite writes `"doc"`; `"page"` is read as the same mode.
            Some("doc" | "page") => Self::DocOnly,
            Some("edgeless") => Self::EdgelessOnly,
            _ => Self::Both,
        }
    }
}

/// `prop:textAlign` of a paragraph or list item. Children without a value of their own
/// inherit the alignment of the nearest ancestor that has one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

impl TextAlign {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Center => "center",
            Self::Right => "right",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "left" => Some(Self::Left),
            "center" => Some(Self::Center),
            "right" => Some(Self::Right),
            _ => None,
        }
    }
}

/// Typed content of a block, by `sys:flavour`.
#[derive(Debug, Clone, PartialEq)]
pub enum BlockContent {
    Page {
        title: RichText,
    },
    Surface {
        element_count: usize,
    },
    Note {
        display_mode: NoteDisplayMode,
        xywh: String,
        background: JsonValue,
        hidden: bool,
    },
    Paragraph {
        kind: ParagraphType,
        text: RichText,
        collapsed: bool,
        /// `prop:textAlign`, when the block sets one.
        text_align: Option<TextAlign>,
    },
    List {
        kind: ListType,
        checked: bool,
        collapsed: bool,
        text: RichText,
        /// Raw `prop:order` as stored by BlockSuite.
        order: Option<i64>,
        /// 1-based position inside its run of consecutive numbered siblings
        /// (`None` unless `kind` is [`ListType::Numbered`]).
        numbered_index: Option<u32>,
        /// `prop:textAlign`, when the block sets one.
        text_align: Option<TextAlign>,
    },
    Divider,
    Code {
        language: String,
        wrap: bool,
        text: String,
        caption: String,
    },
    Image {
        source_id: String,
        width: Option<f64>,
        height: Option<f64>,
        caption: String,
    },
    Bookmark {
        url: String,
        title: Option<String>,
        description: Option<String>,
        caption: String,
    },
    Frame {
        title: RichText,
        xywh: String,
    },
    EdgelessText {
        xywh: String,
    },
    /// Any flavour without a typed reader, kept with its identity and property keys.
    Unknown(UnknownBlock),
}

/// One block of the document tree with its ordered children.
#[derive(Debug, Clone, PartialEq)]
pub struct BlockNode {
    pub id: String,
    pub flavour: String,
    pub version: Option<i64>,
    pub content: BlockContent,
    /// Normalized JSON of every `prop:*` entry (`Y.Text` as its delta, nested `Y.Map` /
    /// `Y.Array` as objects / arrays), keyed by the full property name.
    pub props: BTreeMap<String, JsonValue>,
    pub children: Vec<BlockNode>,
}

impl BlockNode {
    /// Whether this block exists only on the Edgeless canvas and is left out of Page mode.
    pub fn is_edgeless_only(&self) -> bool {
        match &self.content {
            BlockContent::Surface { .. }
            | BlockContent::Frame { .. }
            | BlockContent::EdgelessText { .. } => true,
            BlockContent::Note { display_mode, .. } => {
                *display_mode == NoteDisplayMode::EdgelessOnly
            }
            _ => false,
        }
    }

    /// Depth-first pre-order iterator over this node and all of its descendants.
    pub fn walk(&self) -> impl Iterator<Item = &BlockNode> {
        let mut stack = vec![self];
        std::iter::from_fn(move || {
            let node = stack.pop()?;
            stack.extend(node.children.iter().rev());
            Some(node)
        })
    }
}

/// Read snapshot of one page document.
#[derive(Debug, Clone, PartialEq)]
pub struct PageSnapshot {
    pub doc_id: String,
    /// The `affine:page` root block, if the document has been seeded.
    pub root: Option<BlockNode>,
    /// Blocks present in `blocks` but not reachable from `root`, as subtrees ordered by id.
    pub detached: Vec<BlockNode>,
}

impl PageSnapshot {
    /// Number of blocks in the snapshot, reachable or detached.
    pub fn block_count(&self) -> usize {
        self.root
            .iter()
            .chain(self.detached.iter())
            .map(|node| node.walk().count())
            .sum()
    }

    /// Find a block by id anywhere in the snapshot.
    pub fn block(&self, id: &str) -> Option<&BlockNode> {
        self.root
            .iter()
            .chain(self.detached.iter())
            .flat_map(BlockNode::walk)
            .find(|node| node.id == id)
    }

    /// Plain title of the `affine:page` root (empty when missing).
    pub fn title(&self) -> &str {
        match self.root.as_ref().map(|root| &root.content) {
            Some(BlockContent::Page { title }) => &title.plain,
            _ => "",
        }
    }
}

struct RawBlock {
    flavour: String,
    version: Option<i64>,
    children: Vec<String>,
    entries: BTreeMap<String, SessionReadValue>,
}

struct SnapshotReader<'a> {
    page: &'a PageDocSession,
    raw: BTreeMap<String, RawBlock>,
    visited: BTreeSet<String>,
}

impl PageDocSession {
    /// Read the whole `blocks` tree into a typed, ordered [`PageSnapshot`].
    pub fn read_page_snapshot(&self) -> DocResult<PageSnapshot> {
        let mut reader = SnapshotReader {
            page: self,
            raw: BTreeMap::new(),
            visited: BTreeSet::new(),
        };
        reader.load()?;

        let root_id = reader
            .raw
            .iter()
            .find(|(_, block)| block.flavour == "affine:page")
            .map(|(id, _)| id.clone());
        let root = match root_id {
            Some(id) => reader.build(&id, 0)?,
            None => None,
        };

        // Detached subtrees start at unvisited blocks nobody else references; whatever is
        // still unvisited afterwards sits on a reference cycle and is cut at its lowest id.
        let referenced: BTreeSet<String> = reader
            .raw
            .values()
            .flat_map(|block| block.children.iter().cloned())
            .collect();
        let ids: Vec<String> = reader.raw.keys().cloned().collect();
        let mut detached = Vec::new();
        for id in ids.iter().filter(|id| !referenced.contains(*id)) {
            if let Some(node) = reader.build(id, 0)? {
                detached.push(node);
            }
        }
        for id in &ids {
            if let Some(node) = reader.build(id, 0)? {
                detached.push(node);
            }
        }

        Ok(PageSnapshot {
            doc_id: self.guid().to_string(),
            root,
            detached,
        })
    }
}

impl SnapshotReader<'_> {
    fn load(&mut self) -> DocResult {
        let session = self.page.inner();
        for (block_id, value) in session.read_map(self.page.blocks_target())? {
            let SessionReadValue::Map(identity) = value else {
                continue;
            };
            let mut flavour = String::new();
            let mut version = None;
            let mut children = Vec::new();
            let mut entries = BTreeMap::new();
            for (key, value) in session.read_map(&TypeTarget::Identity(identity))? {
                match (key.as_str(), value) {
                    ("sys:flavour", SessionReadValue::Any(Any::String(s))) => flavour = s,
                    ("sys:version", SessionReadValue::Any(any)) => {
                        version = any_as_f64(&any).map(|v| v as i64);
                    }
                    ("sys:children", SessionReadValue::Array(array)) => {
                        for item in session.read_array(&TypeTarget::Identity(array))? {
                            if let SessionReadValue::Any(Any::String(child)) = item {
                                children.push(child);
                            }
                        }
                    }
                    (_, value) => {
                        entries.insert(key, value);
                    }
                }
            }
            self.raw.insert(
                block_id,
                RawBlock {
                    flavour,
                    version,
                    children,
                    entries,
                },
            );
        }
        Ok(())
    }

    fn build(&mut self, id: &str, depth: usize) -> DocResult<Option<BlockNode>> {
        if depth > MAX_BLOCK_DEPTH || !self.raw.contains_key(id) || !self.visited.insert(id.into())
        {
            return Ok(None);
        }
        let child_ids = self.raw[id].children.clone();
        let mut children = Vec::with_capacity(child_ids.len());
        for child_id in &child_ids {
            if let Some(child) = self.build(child_id, depth + 1)? {
                children.push(child);
            }
        }
        assign_numbered_indices(&mut children);

        let block = &self.raw[id];
        let mut props = BTreeMap::new();
        for (key, value) in &block.entries {
            if key.starts_with("prop:") {
                props.insert(key.clone(), self.page.export_y_value(value)?);
            }
        }
        let content = self.read_content(id, block)?;
        Ok(Some(BlockNode {
            id: id.to_string(),
            flavour: block.flavour.clone(),
            version: block.version,
            content,
            props,
            children,
        }))
    }

    fn read_content(&self, id: &str, block: &RawBlock) -> DocResult<BlockContent> {
        let entries = &block.entries;
        Ok(match block.flavour.as_str() {
            "affine:page" => BlockContent::Page {
                title: self.rich_text(entries.get("prop:title"))?,
            },
            "affine:surface" => BlockContent::Surface {
                element_count: self.surface_element_count(entries.get("prop:elements"))?,
            },
            "affine:note" => BlockContent::Note {
                display_mode: NoteDisplayMode::parse(
                    string(entries.get("prop:displayMode")).as_deref(),
                ),
                xywh: string(entries.get("prop:xywh")).unwrap_or_default(),
                background: match entries.get("prop:background") {
                    Some(value) => self.page.export_y_value(value)?,
                    None => JsonValue::Null,
                },
                hidden: boolean(entries.get("prop:hidden")),
            },
            "affine:paragraph" => BlockContent::Paragraph {
                kind: parse_paragraph_type(string(entries.get("prop:type")).as_deref()),
                text: self.rich_text(entries.get("prop:text"))?,
                collapsed: boolean(entries.get("prop:collapsed")),
                text_align: text_align(entries.get("prop:textAlign")),
            },
            "affine:list" => BlockContent::List {
                kind: parse_list_type(string(entries.get("prop:type")).as_deref()),
                checked: boolean(entries.get("prop:checked")),
                collapsed: boolean(entries.get("prop:collapsed")),
                text: self.rich_text(entries.get("prop:text"))?,
                order: number(entries.get("prop:order")).map(|v| v as i64),
                numbered_index: None,
                text_align: text_align(entries.get("prop:textAlign")),
            },
            "affine:divider" => BlockContent::Divider,
            "affine:code" => BlockContent::Code {
                language: string(entries.get("prop:language")).unwrap_or_default(),
                wrap: boolean(entries.get("prop:wrap")),
                text: self.rich_text(entries.get("prop:text"))?.plain,
                caption: string(entries.get("prop:caption")).unwrap_or_default(),
            },
            "affine:image" => BlockContent::Image {
                source_id: string(entries.get("prop:sourceId")).unwrap_or_default(),
                width: number(entries.get("prop:width")).filter(|v| *v > 0.0),
                height: number(entries.get("prop:height")).filter(|v| *v > 0.0),
                caption: string(entries.get("prop:caption")).unwrap_or_default(),
            },
            "affine:bookmark" => BlockContent::Bookmark {
                url: string(entries.get("prop:url")).unwrap_or_default(),
                title: string(entries.get("prop:title")),
                description: string(entries.get("prop:description")),
                caption: string(entries.get("prop:caption")).unwrap_or_default(),
            },
            "affine:frame" => BlockContent::Frame {
                title: self.rich_text(entries.get("prop:title"))?,
                xywh: string(entries.get("prop:xywh")).unwrap_or_default(),
            },
            "affine:edgeless-text" => BlockContent::EdgelessText {
                xywh: string(entries.get("prop:xywh")).unwrap_or_default(),
            },
            _ => BlockContent::Unknown(UnknownBlock {
                id: id.to_string(),
                flavour: block.flavour.clone(),
                version: block.version,
                children: block.children.clone(),
                prop_keys: entries
                    .keys()
                    .filter(|key| key.starts_with("prop:"))
                    .cloned()
                    .collect(),
            }),
        })
    }

    fn rich_text(&self, value: Option<&SessionReadValue>) -> DocResult<RichText> {
        match value {
            Some(SessionReadValue::Text(identity)) => {
                let raw = self
                    .page
                    .inner()
                    .read_text_delta(&TypeTarget::Identity(identity.clone()))?;
                Ok(coalesce_delta(raw))
            }
            Some(SessionReadValue::Any(Any::String(s))) if !s.is_empty() => Ok(RichText {
                plain: s.clone(),
                delta: vec![TextDeltaOp::Insert {
                    insert: TextInsert::Text(s.clone()),
                    format: None,
                }],
            }),
            _ => Ok(RichText::default()),
        }
    }

    fn surface_element_count(&self, value: Option<&SessionReadValue>) -> DocResult<usize> {
        let Some(SessionReadValue::Map(elements)) = value else {
            return Ok(0);
        };
        let session = self.page.inner();
        let elements = TypeTarget::Identity(elements.clone());
        match session.get_map_value(&elements, "value")? {
            Some(SessionReadValue::Map(value)) => {
                Ok(session.read_map(&TypeTarget::Identity(value))?.len())
            }
            _ => Ok(0),
        }
    }
}

/// Merge adjacent string inserts that share identical attributes (as Yjs `toDelta()` does)
/// and collect the plain string. Embeds stay separate ops and add nothing to `plain`.
fn coalesce_delta(raw: Vec<TextDeltaOp>) -> RichText {
    let mut plain = String::new();
    let mut delta: Vec<TextDeltaOp> = Vec::with_capacity(raw.len());
    for op in raw {
        let TextDeltaOp::Insert { insert, format } = op else {
            continue;
        };
        let format = format.filter(|attrs| !attrs.is_empty());
        match insert {
            TextInsert::Text(text) => {
                if text.is_empty() {
                    continue;
                }
                plain.push_str(&text);
                if let Some(TextDeltaOp::Insert {
                    insert: TextInsert::Text(previous),
                    format: previous_format,
                }) = delta.last_mut()
                    && *previous_format == format
                {
                    previous.push_str(&text);
                    continue;
                }
                delta.push(TextDeltaOp::Insert {
                    insert: TextInsert::Text(text),
                    format,
                });
            }
            embed @ TextInsert::Embed(_) => delta.push(TextDeltaOp::Insert {
                insert: embed,
                format,
            }),
        }
    }
    RichText { plain, delta }
}

/// Number each run of consecutive `numbered` list siblings. An explicit positive
/// `prop:order` restarts the run at that value, otherwise the run counts up from 1.
fn assign_numbered_indices(children: &mut [BlockNode]) {
    let mut previous: Option<u32> = None;
    for child in children {
        previous = match &mut child.content {
            BlockContent::List {
                kind: ListType::Numbered,
                order,
                numbered_index,
                ..
            } => {
                let index = order
                    .and_then(|value| u32::try_from(value).ok())
                    .filter(|value| *value > 0)
                    .unwrap_or_else(|| previous.map_or(1, |value| value.saturating_add(1)));
                *numbered_index = Some(index);
                Some(index)
            }
            _ => None,
        };
    }
}

fn parse_paragraph_type(value: Option<&str>) -> ParagraphType {
    match value {
        Some("h1") => ParagraphType::H1,
        Some("h2") => ParagraphType::H2,
        Some("h3") => ParagraphType::H3,
        Some("h4") => ParagraphType::H4,
        Some("h5") => ParagraphType::H5,
        Some("h6") => ParagraphType::H6,
        Some("quote") => ParagraphType::Quote,
        _ => ParagraphType::Text,
    }
}

fn parse_list_type(value: Option<&str>) -> ListType {
    match value {
        Some("numbered") => ListType::Numbered,
        Some("todo") => ListType::Todo,
        Some("toggle") => ListType::Toggle,
        _ => ListType::Bulleted,
    }
}

fn any_as_f64(any: &Any) -> Option<f64> {
    match any {
        Any::Integer(value) => Some(f64::from(*value)),
        Any::BigInt64(value) => Some(*value as f64),
        Any::Float32(value) => Some(f64::from(value.0)),
        Any::Float64(value) => Some(value.0),
        _ => None,
    }
}

fn string(value: Option<&SessionReadValue>) -> Option<String> {
    match value {
        Some(SessionReadValue::Any(Any::String(s))) => Some(s.clone()),
        _ => None,
    }
}

fn text_align(value: Option<&SessionReadValue>) -> Option<TextAlign> {
    string(value).as_deref().and_then(TextAlign::parse)
}

fn boolean(value: Option<&SessionReadValue>) -> bool {
    matches!(value, Some(SessionReadValue::Any(Any::True)))
}

fn number(value: Option<&SessionReadValue>) -> Option<f64> {
    match value {
        Some(SessionReadValue::Any(any)) => any_as_f64(any).filter(|v| v.is_finite()),
        _ => None,
    }
}
