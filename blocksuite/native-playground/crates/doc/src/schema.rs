use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use y_octo::{AHashMap, Any, SessionValue, TextDeltaOp, TextInsert};

/// BlockSuite internal marker for `Boxed` values inside a `Y.Map`.
pub const NATIVE_UNIQ_IDENTIFIER: &str = "$blocksuite:internal:native$";

/// Default Note dimensions (`450 + 24 * 2`, `92`).
pub const DEFAULT_NOTE_WIDTH: f64 = 498.0;
pub const DEFAULT_NOTE_HEIGHT: f64 = 92.0;

/// Default roughness for surface shapes and connectors.
pub const DEFAULT_ROUGHNESS: f64 = 1.4;

/// Default highlighter stroke width.
pub const DEFAULT_HIGHLIGHTER_LINE_WIDTH: f64 = 22.0;

/// Default connector label max width.
pub const CONNECTOR_LABEL_MAX_WIDTH: f64 = 280.0;

/// Exact schema versions for all built-in `AffineSchemas` blocks.
pub fn affine_block_versions() -> BTreeMap<&'static str, i32> {
    BTreeMap::from([
        ("affine:attachment", 1),
        ("affine:bookmark", 1),
        ("affine:callout", 1),
        ("affine:code", 1),
        ("affine:data-view", 1),
        ("affine:database", 3),
        ("affine:divider", 1),
        ("affine:edgeless-text", 1),
        ("affine:embed-figma", 1),
        ("affine:embed-github", 1),
        ("affine:embed-html", 1),
        ("affine:embed-linked-doc", 1),
        ("affine:embed-loom", 1),
        ("affine:embed-synced-doc", 1),
        ("affine:embed-youtube", 1),
        ("affine:frame", 1),
        ("affine:image", 1),
        ("affine:latex", 1),
        ("affine:list", 1),
        ("affine:note", 1),
        ("affine:page", 2),
        ("affine:paragraph", 1),
        ("affine:surface", 5),
        ("affine:surface-ref", 1),
        ("affine:table", 1),
    ])
}

/// Supported block flavours authored natively with full default properties.
#[derive(Debug, Clone, PartialEq)]
pub enum BlockSpec {
    Page {
        title: String,
    },
    Surface,
    Note {
        xywh: Option<String>,
    },
    Paragraph {
        paragraph_type: ParagraphType,
        text: String,
    },
    List {
        list_type: ListType,
        text: String,
        checked: bool,
        order: Option<i32>,
    },
    Divider,
    Code {
        text: String,
        language: Option<String>,
        caption: String,
    },
    Image {
        source_id: String,
        caption: String,
        width: f64,
        height: f64,
        xywh: Option<String>,
    },
    Bookmark {
        url: String,
        title: Option<String>,
        description: Option<String>,
    },
    Frame {
        title: String,
        xywh: Option<String>,
        presentation_index: Option<String>,
    },
    EdgelessText {
        xywh: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ParagraphType {
    Text,
    H1,
    H2,
    H3,
    H4,
    H5,
    H6,
    Quote,
}

impl ParagraphType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::H1 => "h1",
            Self::H2 => "h2",
            Self::H3 => "h3",
            Self::H4 => "h4",
            Self::H5 => "h5",
            Self::H6 => "h6",
            Self::Quote => "quote",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ListType {
    Bulleted,
    Numbered,
    Todo,
    Toggle,
}

impl ListType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Bulleted => "bulleted",
            Self::Numbered => "numbered",
            Self::Todo => "todo",
            Self::Toggle => "toggle",
        }
    }
}

/// Read-only descriptor for unknown/complex blocks preserved losslessly during edits & sync.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnknownBlock {
    pub id: String,
    pub flavour: String,
    pub version: Option<i64>,
    pub children: Vec<String>,
    pub prop_keys: Vec<String>,
}

/// Supported surface element specs written into `affine:surface` `prop:elements` (`Boxed(Y.Map)`).
#[derive(Debug, Clone, PartialEq)]
pub enum SurfaceElementSpec {
    Shape {
        shape_type: String,
        xywh: String,
        seed: i32,
        filled: bool,
        text: Option<String>,
    },
    Connector {
        mode: i32,
        seed: i32,
        source: ConnectorEndpointSpec,
        target: ConnectorEndpointSpec,
        text: Option<String>,
        /// Only persisted when explicitly moved locally; `None` by default.
        label_xywh: Option<[f64; 4]>,
    },
    Brush {
        seed: i32,
        points: Vec<Vec<f64>>,
        xywh: String,
    },
    Highlighter {
        seed: i32,
        points: Vec<Vec<f64>>,
        xywh: String,
    },
    Text {
        seed: i32,
        text: String,
        xywh: String,
    },
    Group {
        seed: i32,
        title: String,
        children: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConnectorEndpointSpec {
    pub id: Option<String>,
    pub position: Option<[f64; 2]>,
}

impl ConnectorEndpointSpec {
    pub fn point(x: f64, y: f64) -> Self {
        Self {
            id: None,
            position: Some([x, y]),
        }
    }

    pub fn element(id: impl Into<String>, position: Option<[f64; 2]>) -> Self {
        Self {
            id: Some(id.into()),
            position,
        }
    }

    pub fn to_any(&self) -> Any {
        let mut map = AHashMap::default();
        if let Some(id) = &self.id {
            map.insert("id".to_string(), Any::String(id.clone()));
        }
        if let Some([x, y]) = self.position {
            map.insert(
                "position".to_string(),
                Any::Array(vec![Any::Float64(x.into()), Any::Float64(y.into())]),
            );
        }
        Any::Object(Box::new(map))
    }
}

fn text_value(s: &str) -> SessionValue {
    if s.is_empty() {
        SessionValue::Text(Vec::new())
    } else {
        SessionValue::Text(vec![TextDeltaOp::Insert {
            insert: TextInsert::Text(s.to_string()),
            format: None,
        }])
    }
}

fn color_map(dark: &str, light: &str) -> SessionValue {
    SessionValue::Map(vec![
        (
            "dark".to_string(),
            SessionValue::Any(Any::String(dark.to_string())),
        ),
        (
            "light".to_string(),
            SessionValue::Any(Any::String(light.to_string())),
        ),
    ])
}

fn color_any(dark: &str, light: &str) -> Any {
    let mut map = AHashMap::default();
    map.insert("dark".to_string(), Any::String(dark.to_string()));
    map.insert("light".to_string(), Any::String(light.to_string()));
    Any::Object(Box::new(map))
}

fn nonzero_seed(seed: i32) -> i32 {
    if seed == 0 { 1 } else { seed.saturating_abs() }
}

/// Wrap a plain JSON array for insertion as a single `Y.Map` entry.
///
/// `y-octo`'s `From<Any> for Content` converts a top-level `Any::Array(v)` into
/// multi-element `Content::Any(v)`. Wrapping once produces `Content::Any(vec![Any::Array(v)])`,
/// matching Yjs `yMap.set(key, array)`.
fn map_array_any(items: Vec<Any>) -> Any {
    Any::Array(vec![Any::Array(items)])
}

pub fn is_leaf_flavour(flavour: &str) -> bool {
    matches!(
        flavour,
        "affine:code" | "affine:divider" | "affine:image" | "affine:bookmark"
    )
}

impl BlockSpec {
    pub fn flavour(&self) -> &'static str {
        match self {
            Self::Page { .. } => "affine:page",
            Self::Surface => "affine:surface",
            Self::Note { .. } => "affine:note",
            Self::Paragraph { .. } => "affine:paragraph",
            Self::List { .. } => "affine:list",
            Self::Divider => "affine:divider",
            Self::Code { .. } => "affine:code",
            Self::Image { .. } => "affine:image",
            Self::Bookmark { .. } => "affine:bookmark",
            Self::Frame { .. } => "affine:frame",
            Self::EdgelessText { .. } => "affine:edgeless-text",
        }
    }

    pub fn version(&self) -> i32 {
        match self {
            Self::Page { .. } => 2,
            Self::Surface => 5,
            _ => 1,
        }
    }

    /// Build the complete `Y.Map` entries (`sys:*` + all default `prop:*`) for this block.
    pub fn into_yblock_entries(self, id: &str) -> Vec<(String, SessionValue)> {
        let flavour = self.flavour();
        let version = self.version();
        let mut entries = vec![
            (
                "sys:id".to_string(),
                SessionValue::Any(Any::String(id.to_string())),
            ),
            (
                "sys:flavour".to_string(),
                SessionValue::Any(Any::String(flavour.to_string())),
            ),
            (
                "sys:version".to_string(),
                SessionValue::Any(Any::Integer(version)),
            ),
            ("sys:children".to_string(), SessionValue::Array(Vec::new())),
        ];

        match self {
            Self::Page { title } => {
                entries.push(("prop:title".to_string(), text_value(&title)));
            }
            Self::Surface => {
                entries.push((
                    "prop:elements".to_string(),
                    SessionValue::Map(vec![
                        (
                            "type".to_string(),
                            SessionValue::Any(Any::String(NATIVE_UNIQ_IDENTIFIER.to_string())),
                        ),
                        ("value".to_string(), SessionValue::Map(Vec::new())),
                    ]),
                ));
            }
            Self::Note { xywh } => {
                let xywh = xywh
                    .unwrap_or_else(|| format!("[0,0,{DEFAULT_NOTE_WIDTH},{DEFAULT_NOTE_HEIGHT}]"));
                entries.extend([
                    (
                        "prop:xywh".to_string(),
                        SessionValue::Any(Any::String(xywh)),
                    ),
                    (
                        "prop:background".to_string(),
                        color_map("#252525", "#ffffff"),
                    ),
                    (
                        "prop:index".to_string(),
                        SessionValue::Any(Any::String("a0".to_string())),
                    ),
                    (
                        "prop:lockedBySelf".to_string(),
                        SessionValue::Any(Any::False),
                    ),
                    ("prop:hidden".to_string(), SessionValue::Any(Any::False)),
                    (
                        "prop:displayMode".to_string(),
                        SessionValue::Any(Any::String("both".to_string())),
                    ),
                    (
                        "prop:edgeless".to_string(),
                        SessionValue::Map(vec![(
                            "style".to_string(),
                            SessionValue::Map(vec![
                                (
                                    "borderRadius".to_string(),
                                    SessionValue::Any(Any::Integer(8)),
                                ),
                                ("borderSize".to_string(), SessionValue::Any(Any::Integer(4))),
                                (
                                    "borderStyle".to_string(),
                                    SessionValue::Any(Any::String("none".to_string())),
                                ),
                                (
                                    "shadowType".to_string(),
                                    SessionValue::Any(Any::String(
                                        "--affine-note-shadow-box".to_string(),
                                    )),
                                ),
                            ]),
                        )]),
                    ),
                ]);
            }
            Self::Paragraph {
                paragraph_type,
                text,
            } => {
                entries.extend([
                    (
                        "prop:type".to_string(),
                        SessionValue::Any(Any::String(paragraph_type.as_str().to_string())),
                    ),
                    ("prop:text".to_string(), text_value(&text)),
                    ("prop:collapsed".to_string(), SessionValue::Any(Any::False)),
                ]);
            }
            Self::List {
                list_type,
                text,
                checked,
                order,
            } => {
                entries.extend([
                    (
                        "prop:type".to_string(),
                        SessionValue::Any(Any::String(list_type.as_str().to_string())),
                    ),
                    ("prop:text".to_string(), text_value(&text)),
                    (
                        "prop:checked".to_string(),
                        SessionValue::Any(if checked { Any::True } else { Any::False }),
                    ),
                    ("prop:collapsed".to_string(), SessionValue::Any(Any::False)),
                    (
                        "prop:order".to_string(),
                        SessionValue::Any(order.map_or(Any::Null, Any::Integer)),
                    ),
                ]);
            }
            Self::Divider => {}
            Self::Code {
                text,
                language,
                caption,
            } => {
                entries.extend([
                    ("prop:text".to_string(), text_value(&text)),
                    (
                        "prop:language".to_string(),
                        SessionValue::Any(language.map_or(Any::Null, Any::String)),
                    ),
                    ("prop:wrap".to_string(), SessionValue::Any(Any::False)),
                    (
                        "prop:caption".to_string(),
                        SessionValue::Any(Any::String(caption)),
                    ),
                ]);
            }
            Self::Image {
                source_id,
                caption,
                width,
                height,
                xywh,
            } => {
                entries.extend([
                    (
                        "prop:caption".to_string(),
                        SessionValue::Any(Any::String(caption)),
                    ),
                    (
                        "prop:sourceId".to_string(),
                        SessionValue::Any(Any::String(source_id)),
                    ),
                    (
                        "prop:width".to_string(),
                        SessionValue::Any(Any::Float64(width.into())),
                    ),
                    (
                        "prop:height".to_string(),
                        SessionValue::Any(Any::Float64(height.into())),
                    ),
                    (
                        "prop:index".to_string(),
                        SessionValue::Any(Any::String("a0".to_string())),
                    ),
                    (
                        "prop:xywh".to_string(),
                        SessionValue::Any(Any::String(
                            xywh.unwrap_or_else(|| "[0,0,0,0]".to_string()),
                        )),
                    ),
                    (
                        "prop:lockedBySelf".to_string(),
                        SessionValue::Any(Any::False),
                    ),
                    (
                        "prop:rotate".to_string(),
                        SessionValue::Any(Any::Integer(0)),
                    ),
                    ("prop:size".to_string(), SessionValue::Any(Any::Integer(-1))),
                ]);
            }
            Self::Bookmark {
                url,
                title,
                description,
            } => {
                entries.extend([
                    (
                        "prop:style".to_string(),
                        SessionValue::Any(Any::String("horizontal".to_string())),
                    ),
                    ("prop:url".to_string(), SessionValue::Any(Any::String(url))),
                    ("prop:caption".to_string(), SessionValue::Any(Any::Null)),
                    (
                        "prop:description".to_string(),
                        SessionValue::Any(description.map_or(Any::Null, Any::String)),
                    ),
                    ("prop:icon".to_string(), SessionValue::Any(Any::Null)),
                    ("prop:image".to_string(), SessionValue::Any(Any::Null)),
                    (
                        "prop:title".to_string(),
                        SessionValue::Any(title.map_or(Any::Null, Any::String)),
                    ),
                    (
                        "prop:index".to_string(),
                        SessionValue::Any(Any::String("a0".to_string())),
                    ),
                    (
                        "prop:xywh".to_string(),
                        SessionValue::Any(Any::String("[0,0,0,0]".to_string())),
                    ),
                    (
                        "prop:lockedBySelf".to_string(),
                        SessionValue::Any(Any::False),
                    ),
                    (
                        "prop:rotate".to_string(),
                        SessionValue::Any(Any::Integer(0)),
                    ),
                    (
                        "prop:footnoteIdentifier".to_string(),
                        SessionValue::Any(Any::Null),
                    ),
                ]);
            }
            Self::Frame {
                title,
                xywh,
                presentation_index,
            } => {
                entries.extend([
                    ("prop:title".to_string(), text_value(&title)),
                    (
                        "prop:background".to_string(),
                        SessionValue::Any(Any::String("transparent".to_string())),
                    ),
                    (
                        "prop:xywh".to_string(),
                        SessionValue::Any(Any::String(
                            xywh.unwrap_or_else(|| "[0,0,100,100]".to_string()),
                        )),
                    ),
                    (
                        "prop:index".to_string(),
                        SessionValue::Any(Any::String("a0".to_string())),
                    ),
                    (
                        "prop:childElementIds".to_string(),
                        SessionValue::Map(Vec::new()),
                    ),
                    (
                        "prop:presentationIndex".to_string(),
                        SessionValue::Any(Any::String(
                            presentation_index.unwrap_or_else(|| "a0".to_string()),
                        )),
                    ),
                    (
                        "prop:lockedBySelf".to_string(),
                        SessionValue::Any(Any::False),
                    ),
                ]);
            }
            Self::EdgelessText { xywh } => {
                entries.extend([
                    (
                        "prop:xywh".to_string(),
                        SessionValue::Any(Any::String(
                            xywh.unwrap_or_else(|| "[0,0,16,16]".to_string()),
                        )),
                    ),
                    (
                        "prop:index".to_string(),
                        SessionValue::Any(Any::String("a0".to_string())),
                    ),
                    (
                        "prop:lockedBySelf".to_string(),
                        SessionValue::Any(Any::False),
                    ),
                    ("prop:scale".to_string(), SessionValue::Any(Any::Integer(1))),
                    (
                        "prop:rotate".to_string(),
                        SessionValue::Any(Any::Integer(0)),
                    ),
                    (
                        "prop:hasMaxWidth".to_string(),
                        SessionValue::Any(Any::False),
                    ),
                    ("prop:color".to_string(), color_map("#ffffff", "#000000")),
                    (
                        "prop:fontFamily".to_string(),
                        SessionValue::Any(Any::String("blocksuite:surface:Inter".to_string())),
                    ),
                    (
                        "prop:fontStyle".to_string(),
                        SessionValue::Any(Any::String("normal".to_string())),
                    ),
                    (
                        "prop:fontWeight".to_string(),
                        SessionValue::Any(Any::String("400".to_string())),
                    ),
                    (
                        "prop:textAlign".to_string(),
                        SessionValue::Any(Any::String("left".to_string())),
                    ),
                ]);
            }
        }

        entries
    }
}

impl SurfaceElementSpec {
    pub fn element_type(&self) -> &'static str {
        match self {
            Self::Shape { .. } => "shape",
            Self::Connector { .. } => "connector",
            Self::Brush { .. } => "brush",
            Self::Highlighter { .. } => "highlighter",
            Self::Text { .. } => "text",
            Self::Group { .. } => "group",
        }
    }

    /// Build the complete `Y.Map` entries for a surface element inside `prop:elements.value`.
    pub fn into_ymap_entries(self, id: &str, index: &str) -> Vec<(String, SessionValue)> {
        let el_type = self.element_type();
        let mut entries = vec![
            (
                "id".to_string(),
                SessionValue::Any(Any::String(id.to_string())),
            ),
            (
                "type".to_string(),
                SessionValue::Any(Any::String(el_type.to_string())),
            ),
            (
                "index".to_string(),
                SessionValue::Any(Any::String(index.to_string())),
            ),
            ("hidden".to_string(), SessionValue::Any(Any::False)),
            ("lockedBySelf".to_string(), SessionValue::Any(Any::False)),
        ];

        match self {
            Self::Shape {
                shape_type,
                xywh,
                seed,
                filled,
                text,
            } => {
                let yellow = color_any("#f5c211", "#f5c211");
                entries.extend([
                    (
                        "seed".to_string(),
                        SessionValue::Any(Any::Integer(nonzero_seed(seed))),
                    ),
                    (
                        "color".to_string(),
                        SessionValue::Any(Any::String("#000000".to_string())),
                    ),
                    ("fillColor".to_string(), SessionValue::Any(yellow.clone())),
                    (
                        "filled".to_string(),
                        SessionValue::Any(if filled { Any::True } else { Any::False }),
                    ),
                    (
                        "fontFamily".to_string(),
                        SessionValue::Any(Any::String("blocksuite:surface:Inter".to_string())),
                    ),
                    ("fontSize".to_string(), SessionValue::Any(Any::Integer(20))),
                    (
                        "fontStyle".to_string(),
                        SessionValue::Any(Any::String("normal".to_string())),
                    ),
                    (
                        "fontWeight".to_string(),
                        SessionValue::Any(Any::String("400".to_string())),
                    ),
                    ("maxWidth".to_string(), SessionValue::Any(Any::False)),
                    (
                        "padding".to_string(),
                        SessionValue::Any(map_array_any(vec![Any::Integer(10), Any::Integer(20)])),
                    ),
                    ("radius".to_string(), SessionValue::Any(Any::Integer(0))),
                    ("rotate".to_string(), SessionValue::Any(Any::Integer(0))),
                    (
                        "roughness".to_string(),
                        SessionValue::Any(Any::Float64(DEFAULT_ROUGHNESS.into())),
                    ),
                    ("shadow".to_string(), SessionValue::Any(Any::Null)),
                    (
                        "shapeStyle".to_string(),
                        SessionValue::Any(Any::String("General".to_string())),
                    ),
                    (
                        "shapeType".to_string(),
                        SessionValue::Any(Any::String(shape_type)),
                    ),
                    ("strokeColor".to_string(), SessionValue::Any(yellow)),
                    (
                        "strokeStyle".to_string(),
                        SessionValue::Any(Any::String("solid".to_string())),
                    ),
                    (
                        "strokeWidth".to_string(),
                        SessionValue::Any(Any::Integer(4)),
                    ),
                    (
                        "textAlign".to_string(),
                        SessionValue::Any(Any::String("center".to_string())),
                    ),
                    (
                        "textHorizontalAlign".to_string(),
                        SessionValue::Any(Any::String("center".to_string())),
                    ),
                    (
                        "textResizing".to_string(),
                        SessionValue::Any(Any::Integer(1)),
                    ),
                    (
                        "textVerticalAlign".to_string(),
                        SessionValue::Any(Any::String("center".to_string())),
                    ),
                    ("xywh".to_string(), SessionValue::Any(Any::String(xywh))),
                ]);
                if let Some(text_str) = text {
                    entries.push(("text".to_string(), text_value(&text_str)));
                }
            }
            Self::Connector {
                mode,
                seed,
                source,
                target,
                text,
                label_xywh,
            } => {
                let mut label_constraints = AHashMap::default();
                label_constraints.insert("hasMaxWidth".to_string(), Any::True);
                label_constraints.insert(
                    "maxWidth".to_string(),
                    Any::Float64(CONNECTOR_LABEL_MAX_WIDTH.into()),
                );

                let mut label_offset = AHashMap::default();
                label_offset.insert("distance".to_string(), Any::Float64(0.5.into()));
                label_offset.insert("anchor".to_string(), Any::String("center".to_string()));

                let mut label_style = AHashMap::default();
                label_style.insert("color".to_string(), color_any("#ffffff", "#000000"));
                label_style.insert(
                    "fontFamily".to_string(),
                    Any::String("blocksuite:surface:Inter".to_string()),
                );
                label_style.insert("fontSize".to_string(), Any::Integer(16));
                label_style.insert("fontStyle".to_string(), Any::String("normal".to_string()));
                label_style.insert("fontWeight".to_string(), Any::String("400".to_string()));
                label_style.insert("textAlign".to_string(), Any::String("center".to_string()));

                entries.extend([
                    (
                        "seed".to_string(),
                        SessionValue::Any(Any::Integer(nonzero_seed(seed))),
                    ),
                    ("mode".to_string(), SessionValue::Any(Any::Integer(mode))),
                    (
                        "stroke".to_string(),
                        SessionValue::Any(color_any("#929292", "#929292")),
                    ),
                    (
                        "strokeWidth".to_string(),
                        SessionValue::Any(Any::Integer(4)),
                    ),
                    (
                        "strokeStyle".to_string(),
                        SessionValue::Any(Any::String("solid".to_string())),
                    ),
                    (
                        "roughness".to_string(),
                        SessionValue::Any(Any::Float64(DEFAULT_ROUGHNESS.into())),
                    ),
                    (
                        "frontEndpointStyle".to_string(),
                        SessionValue::Any(Any::String("None".to_string())),
                    ),
                    (
                        "rearEndpointStyle".to_string(),
                        SessionValue::Any(Any::String("Arrow".to_string())),
                    ),
                    ("source".to_string(), SessionValue::Any(source.to_any())),
                    ("target".to_string(), SessionValue::Any(target.to_any())),
                    ("labelDisplay".to_string(), SessionValue::Any(Any::True)),
                    (
                        "labelConstraints".to_string(),
                        SessionValue::Any(Any::Object(Box::new(label_constraints))),
                    ),
                    (
                        "labelOffset".to_string(),
                        SessionValue::Any(Any::Object(Box::new(label_offset))),
                    ),
                    (
                        "labelStyle".to_string(),
                        SessionValue::Any(Any::Object(Box::new(label_style))),
                    ),
                ]);
                if let Some(text_str) = text {
                    entries.push(("text".to_string(), text_value(&text_str)));
                }
                if let Some([x, y, w, h]) = label_xywh {
                    entries.push((
                        "labelXYWH".to_string(),
                        SessionValue::Any(map_array_any(vec![
                            Any::Float64(x.into()),
                            Any::Float64(y.into()),
                            Any::Float64(w.into()),
                            Any::Float64(h.into()),
                        ])),
                    ));
                }
            }
            Self::Brush { seed, points, xywh } => {
                let any_points = map_array_any(
                    points
                        .into_iter()
                        .map(|pt| {
                            Any::Array(pt.into_iter().map(|v| Any::Float64(v.into())).collect())
                        })
                        .collect(),
                );
                entries.extend([
                    (
                        "seed".to_string(),
                        SessionValue::Any(Any::Integer(nonzero_seed(seed))),
                    ),
                    (
                        "color".to_string(),
                        SessionValue::Any(color_any("#ffffff", "#000000")),
                    ),
                    ("lineWidth".to_string(), SessionValue::Any(Any::Integer(4))),
                    ("points".to_string(), SessionValue::Any(any_points)),
                    ("rotate".to_string(), SessionValue::Any(Any::Integer(0))),
                    ("xywh".to_string(), SessionValue::Any(Any::String(xywh))),
                ]);
            }
            Self::Highlighter { seed, points, xywh } => {
                let any_points = map_array_any(
                    points
                        .into_iter()
                        .map(|pt| {
                            Any::Array(pt.into_iter().map(|v| Any::Float64(v.into())).collect())
                        })
                        .collect(),
                );
                entries.extend([
                    (
                        "seed".to_string(),
                        SessionValue::Any(Any::Integer(nonzero_seed(seed))),
                    ),
                    (
                        "color".to_string(),
                        SessionValue::Any(Any::String("#84cfff4d".to_string())),
                    ),
                    (
                        "lineWidth".to_string(),
                        SessionValue::Any(Any::Float64(DEFAULT_HIGHLIGHTER_LINE_WIDTH.into())),
                    ),
                    ("points".to_string(), SessionValue::Any(any_points)),
                    ("rotate".to_string(), SessionValue::Any(Any::Integer(0))),
                    ("xywh".to_string(), SessionValue::Any(Any::String(xywh))),
                ]);
            }
            Self::Text { seed, text, xywh } => {
                entries.extend([
                    (
                        "seed".to_string(),
                        SessionValue::Any(Any::Integer(nonzero_seed(seed))),
                    ),
                    (
                        "color".to_string(),
                        SessionValue::Any(color_any("#ffffff", "#000000")),
                    ),
                    (
                        "fontFamily".to_string(),
                        SessionValue::Any(Any::String("blocksuite:surface:Inter".to_string())),
                    ),
                    ("fontSize".to_string(), SessionValue::Any(Any::Integer(16))),
                    (
                        "fontStyle".to_string(),
                        SessionValue::Any(Any::String("normal".to_string())),
                    ),
                    (
                        "fontWeight".to_string(),
                        SessionValue::Any(Any::String("400".to_string())),
                    ),
                    ("hasMaxWidth".to_string(), SessionValue::Any(Any::False)),
                    ("rotate".to_string(), SessionValue::Any(Any::Integer(0))),
                    ("text".to_string(), text_value(&text)),
                    (
                        "textAlign".to_string(),
                        SessionValue::Any(Any::String("center".to_string())),
                    ),
                    ("xywh".to_string(), SessionValue::Any(Any::String(xywh))),
                ]);
            }
            Self::Group {
                seed,
                title,
                children,
            } => {
                let child_entries = children
                    .into_iter()
                    .map(|cid| (cid, SessionValue::Any(Any::True)))
                    .collect();
                entries.extend([
                    (
                        "seed".to_string(),
                        SessionValue::Any(Any::Integer(nonzero_seed(seed))),
                    ),
                    ("children".to_string(), SessionValue::Map(child_entries)),
                    ("title".to_string(), text_value(&title)),
                ]);
            }
        }

        entries
    }
}
