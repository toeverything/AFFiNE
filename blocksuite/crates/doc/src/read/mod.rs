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

mod surface;
pub use surface::*;

/// Typed content of a block, by `sys:flavour`.
#[derive(Debug, Clone, PartialEq)]
pub enum BlockContent {
    Page {
        title: RichText,
    },
    Surface {
        element_count: usize,
        elements: Vec<SurfaceElement>,
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
    Latex {
        latex: String,
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
    pub fn is_page_visible_note(&self) -> bool {
        matches!(self.content, BlockContent::Note { hidden: false, .. }) && !self.is_edgeless_only()
    }

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
        let content = self.read_content(id, block, &props)?;
        Ok(Some(BlockNode {
            id: id.to_string(),
            flavour: block.flavour.clone(),
            version: block.version,
            content,
            props,
            children,
        }))
    }

    fn read_content(
        &self,
        id: &str,
        block: &RawBlock,
        props: &BTreeMap<String, JsonValue>,
    ) -> DocResult<BlockContent> {
        let entries = &block.entries;
        Ok(match block.flavour.as_str() {
            "affine:page" => BlockContent::Page {
                title: self.rich_text(entries.get("prop:title"))?,
            },
            "affine:surface" => {
                let elements = self.surface_elements(
                    id,
                    entries.get("prop:elements"),
                    props.get("prop:elements"),
                )?;
                BlockContent::Surface {
                    element_count: elements.len(),
                    elements,
                }
            }
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
            "affine:latex" => BlockContent::Latex {
                latex: string(entries.get("prop:latex")).unwrap_or_default(),
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

    fn surface_elements(
        &self,
        surface_id: &str,
        value: Option<&SessionReadValue>,
        normalized: Option<&JsonValue>,
    ) -> DocResult<Vec<SurfaceElement>> {
        let Some(SessionReadValue::Map(elements)) = value else {
            return Ok(vec![]);
        };
        let session = self.page.inner();
        let Some(SessionReadValue::Map(value)) =
            session.get_map_value(&TypeTarget::Identity(elements.clone()), "value")?
        else {
            return Ok(vec![]);
        };
        let Some(raw) = normalized
            .and_then(|v| v.get("value"))
            .and_then(JsonValue::as_object)
        else {
            return Ok(vec![]);
        };
        let map_entries = session.read_map(&TypeTarget::Identity(value))?;
        let ordered_ids = self
            .page
            .refresh_surface_element_order(surface_id, &map_entries);
        let mut by_id: BTreeMap<String, SessionReadValue> = map_entries.into_iter().collect();
        let mut elements = Vec::with_capacity(ordered_ids.len());
        for id in ordered_ids {
            let Some(value) = by_id.remove(&id) else {
                continue;
            };
            let properties = raw.get(&id).unwrap_or(&JsonValue::Null);
            let (props, text) = if let SessionReadValue::Map(identity) = value {
                let key = if properties["type"] == "group" {
                    "title"
                } else {
                    "text"
                };
                let field = session.get_map_value(&TypeTarget::Identity(identity), key)?;
                (properties.clone(), self.rich_text(field.as_ref())?)
            } else {
                (serde_json::json!({"value":properties}), RichText::default())
            };
            elements.push(SurfaceElement::from_properties(id, props, text));
        }
        elements.sort_by(|a, b| a.index.cmp(&b.index));
        Ok(elements)
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

#[cfg(test)]
mod surface_tests {
    use super::*;
    use crate::schema::{
        BlockSpec, ConnectorEndpointSpec, SurfaceElementSpec, SurfaceElementSpec as Spec,
    };
    use y_octo::{SessionValue, TypePath};

    #[test]
    fn partial_normalized_surface_map_keeps_missing_entry_as_unknown() -> DocResult {
        let mut page = PageDocSession::new("page", 1)?;
        page.add_block("surface", BlockSpec::Surface, None, None, 1)?;
        page.add_surface_element(
            "surface",
            "shape",
            "a0",
            Spec::Shape {
                shape_type: "rect".into(),
                xywh: "[0,0,10,10]".into(),
                seed: 1,
                filled: false,
                text: None,
            },
            2,
        )?;
        let mut reader = SnapshotReader {
            page: &page,
            raw: BTreeMap::new(),
            visited: BTreeSet::new(),
        };
        reader.load()?;
        let partial = serde_json::json!({"value":{}});
        let result = reader.surface_elements(
            "surface",
            reader.raw["surface"].entries.get("prop:elements"),
            Some(&partial),
        )?;
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "shape");
        assert!(matches!(result[0].kind, SurfaceElementKind::Unknown { .. }));
        Ok(())
    }
    #[test]
    fn boxed_surface_snapshot_reads_all_kinds_without_advancing_the_document() -> DocResult {
        let mut page = PageDocSession::new("page", 1)?;
        page.add_block("surface", BlockSpec::Surface, None, None, 1)?;
        let kinds = [
            (
                "shape",
                Spec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[1,2,80,40]".into(),
                    seed: 1,
                    filled: true,
                    text: Some("Label".into()),
                },
            ),
            (
                "connector",
                Spec::Connector {
                    source: ConnectorEndpointSpec::element("shape", None),
                    target: ConnectorEndpointSpec::point(99., 22.),
                    mode: 1,
                    seed: 1,
                    text: Some("Edge".into()),
                    label_xywh: None,
                },
            ),
            (
                "brush",
                Spec::Brush {
                    seed: 3,
                    xywh: "[100,20,40,10]".into(),
                    points: vec![vec![0., 2.], vec![5., 3., 0.75]],
                },
            ),
            (
                "highlighter",
                Spec::Highlighter {
                    seed: 1,
                    xywh: "[10,5,100,24]".into(),
                    points: vec![vec![3., 4.]],
                },
            ),
            (
                "text",
                Spec::Text {
                    seed: 2,
                    xywh: "[50,20,10,10]".into(),
                    text: "Canvas".into(),
                },
            ),
            (
                "group",
                Spec::Group {
                    seed: 2,
                    title: "Group".into(),
                    children: vec!["text".into(), "shape".into()],
                },
            ),
        ];
        for (i, (id, spec)) in kinds.into_iter().enumerate() {
            page.add_surface_element(
                "surface",
                id,
                if id == "text" { "b1" } else { "a1" },
                spec,
                i as u64 + 2,
            )?;
        }
        page.set_surface_element_field(
            "surface",
            "shape",
            "future",
            SessionValue::Any(Any::Integer(17)),
            10,
        )?;
        page.set_surface_element_field(
            "surface",
            "shape",
            "radius",
            SessionValue::Any(Any::Float64(0.1.into())),
            11,
        )?;
        let mut remote = PageDocSession::new("page", 2)?;
        remote.apply_remote_update_v1(&page.encode_update_v1()?)?;
        let before = remote.encode_update_v1()?;
        let snapshot = remote.read_page_snapshot()?;
        let BlockContent::Surface {
            elements,
            element_count,
        } = &snapshot.block("surface").unwrap().content
        else {
            panic!()
        };
        assert_eq!(*element_count, 6);
        assert_eq!(
            elements.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
            [
                "shape",
                "connector",
                "brush",
                "highlighter",
                "group",
                "text"
            ]
        );
        let SurfaceElementKind::Shape(s) = &elements[0].kind else {
            panic!()
        };
        assert_eq!(s.shape_type, ShapeType::Rect);
        assert_eq!(s.radius, 0.1);
        assert_eq!(s.padding, [10., 20.]);
        assert_eq!(s.text.plain, "Label");
        assert_eq!(elements[0].props["future"], 17);
        let SurfaceElementKind::Connector(c) = &elements[1].kind else {
            panic!()
        };
        assert!(!c.rough);
        assert_eq!(c.roughness, 1.4);
        assert_eq!(c.mode, ConnectorMode::Orthogonal);
        assert_eq!(c.label_xywh, None);
        assert_eq!(c.source.id.as_deref(), Some("shape"));
        assert_eq!(c.target.position, Some([99., 22.]));
        assert_eq!(c.text.plain, "Edge");
        let SurfaceElementKind::Brush(s) = &elements[2].kind else {
            panic!()
        };
        assert_eq!(s.points, [[0., 2., 0.5], [5., 3., 0.75]]);
        assert_eq!(s.xywh, [100., 20., 40., 10.]);
        let SurfaceElementKind::Highlighter(s) = &elements[3].kind else {
            panic!()
        };
        assert_eq!(s.points, [[3., 4., 0.5]]);
        assert_eq!(s.color, ColorValue::Single("#84cfff4d".into()));
        let SurfaceElementKind::Group { title, children } = &elements[4].kind else {
            panic!()
        };
        assert_eq!(title.plain, "Group");
        assert_eq!(children, &["shape", "text"]);
        let SurfaceElementKind::Text(t) = &elements[5].kind else {
            panic!()
        };
        assert_eq!(t.text.plain, "Canvas");
        assert_eq!(remote.encode_update_v1()?, before);
        Ok(())
    }

    #[test]
    fn unknown_elements_keep_their_properties_and_identity() {
        let e = SurfaceElement::from_properties(
            "future".into(),
            serde_json::json!({"type":"foreign","index":"b1","hidden":true,"lockedBySelf":true,"nested":{"extra":[1,2]}}),
            RichText::default(),
        );
        assert_eq!(
            e.kind,
            SurfaceElementKind::Unknown {
                element_type: "foreign".into()
            }
        );
        assert!(e.hidden && e.locked_by_self);
        assert_eq!(e.props["nested"]["extra"][1], 2);
    }

    #[test]
    fn equal_index_surface_elements_preserve_per_surface_insertion_order_despite_earlier_global_key()
    -> DocResult<()> {
        let mut author = PageDocSession::new("p-order", 1)?;
        author.add_block(
            "page-1",
            BlockSpec::Page {
                title: "Order".into(),
            },
            None,
            None,
            1,
        )?;
        author.add_block(
            "a",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "global key a".into(),
            },
            Some("page-1"),
            None,
            2,
        )?;
        let surf = author.ensure_surface_block(3)?;
        let u_base = author.encode_update_v1()?;
        let u_z = author
            .add_surface_element(
                &surf,
                "z",
                "a1",
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[0,0,100,80]".into(),
                    seed: 1,
                    filled: true,
                    text: Some("Z".into()),
                },
                4,
            )?
            .unwrap()
            .update;
        let u_a = author
            .add_surface_element(
                &surf,
                "a",
                "a1",
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[20,20,100,80]".into(),
                    seed: 2,
                    filled: true,
                    text: Some("A".into()),
                },
                5,
            )?
            .unwrap()
            .update;
        let u_full = author.encode_update_v1()?;

        let extract_ids = |doc: &PageDocSession| -> Vec<String> {
            let snap = doc.read_page_snapshot().unwrap();
            let surf_node = snap
                .root
                .unwrap()
                .children
                .into_iter()
                .find(|c| c.id == surf)
                .unwrap();
            let BlockContent::Surface { elements, .. } = surf_node.content else {
                unreachable!()
            };
            elements.into_iter().map(|e| e.id).collect()
        };

        assert_eq!(extract_ids(&author), vec!["z", "a"]);

        let mut peer_single = PageDocSession::new("p-order", 2)?;
        peer_single.apply_remote_update_v1(&u_full)?;
        assert_eq!(extract_ids(&peer_single), vec!["z", "a"]);

        let mut peer_inc = PageDocSession::new("p-order", 3)?;
        peer_inc.apply_remote_update_v1(&u_base)?;
        peer_inc.apply_remote_update_v1(&u_z)?;
        peer_inc.apply_remote_update_v1(&u_a)?;
        assert_eq!(extract_ids(&peer_inc), vec!["z", "a"]);
        Ok(())
    }

    #[test]
    fn concurrent_two_peer_shape_label_splice_and_undo_redo_preserve_marks() -> DocResult<()> {
        let mut peer_a = PageDocSession::new("p-collab", 11)?;
        peer_a.add_block(
            "page-1",
            BlockSpec::Page {
                title: "Collab".into(),
            },
            None,
            None,
            1,
        )?;
        let surf = peer_a.ensure_surface_block(2)?;
        peer_a.add_surface_element(
            &surf,
            "s1",
            "a0",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[0,0,160,80]".into(),
                seed: 7,
                filled: true,
                text: Some("Hello".into()),
            },
            3,
        )?;
        let target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(&surf)
                .key("prop:elements")
                .key("value")
                .key("s1")
                .key("text"),
        );
        let mut bold = y_octo::TextAttributes::new();
        bold.insert("bold".into(), Any::True);
        peer_a.inner_mut().text_format(&target, 0, 5, bold)?;
        peer_a.stop_capturing()?;

        let mut peer_b = PageDocSession::new("p-collab", 22)?;
        peer_b.apply_remote_update_v1(&peer_a.encode_update_v1()?)?;

        let upd_b = peer_b
            .splice_surface_element_text(&surf, "s1", "text", 0, 0, "X ", 100)?
            .unwrap()
            .update;
        let upd_a = peer_a
            .splice_surface_element_text(&surf, "s1", "text", 5, 0, "!", 100)?
            .unwrap()
            .update;
        peer_a.apply_remote_update_v1(&upd_b)?;
        peer_b.apply_remote_update_v1(&upd_a)?;

        let read_shape_text = |doc: &PageDocSession| -> RichText {
            let snap = doc.read_page_snapshot().unwrap();
            let snode = snap
                .root
                .unwrap()
                .children
                .into_iter()
                .find(|c| c.id == surf)
                .unwrap();
            let BlockContent::Surface { elements, .. } = snode.content else {
                unreachable!()
            };
            let SurfaceElementKind::Shape(sh) = &elements[0].kind else {
                unreachable!()
            };
            sh.text.clone()
        };

        let ta = read_shape_text(&peer_a);
        let tb = read_shape_text(&peer_b);
        assert_eq!(ta.plain, "X Hello!");
        assert_eq!(tb.plain, "X Hello!");
        assert!(
            ta.delta.iter().any(|op| matches!(
                op,
                TextDeltaOp::Insert { insert: TextInsert::Text(t), format: Some(f) }
                    if t.contains("Hello") && f.get("bold") == Some(&Any::True)
            )),
            "untouched bold mark on 'Hello' must survive concurrent splices: {:?}",
            ta.delta
        );

        let u_undo = peer_a.undo()?.unwrap().update;
        peer_b.apply_remote_update_v1(&u_undo)?;
        assert_eq!(read_shape_text(&peer_a).plain, "X Hello");
        assert_eq!(read_shape_text(&peer_b).plain, "X Hello");

        let u_redo = peer_a.redo()?.unwrap().update;
        peer_b.apply_remote_update_v1(&u_redo)?;
        assert_eq!(read_shape_text(&peer_a).plain, "X Hello!");
        assert_eq!(read_shape_text(&peer_b).plain, "X Hello!");
        Ok(())
    }
}
