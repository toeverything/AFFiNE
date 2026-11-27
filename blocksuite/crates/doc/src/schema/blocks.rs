use serde::{Deserialize, Serialize};
use y_octo::{Any, SessionValue};

use super::{
    DEFAULT_NOTE_HEIGHT, DEFAULT_NOTE_WIDTH, DatabaseSpec, NATIVE_UNIQ_IDENTIFIER, text_value,
};

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
    Latex {
        latex: String,
    },
    Callout {
        icon: String,
        background_color: Option<String>,
    },
    Table {
        rows: Vec<Vec<String>>,
    },
    Attachment {
        name: String,
        size: i64,
        mime_type: String,
        source_id: String,
        caption: String,
        embed: bool,
    },
    EmbedLinkedDoc {
        page_id: String,
        style: String,
        caption: String,
    },
    EmbedSyncedDoc {
        page_id: String,
        caption: String,
    },
    SurfaceRef {
        reference: String,
        ref_flavour: String,
        caption: String,
    },
    Database(DatabaseSpec),
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

pub fn is_leaf_flavour(flavour: &str) -> bool {
    matches!(
        flavour,
        "affine:code"
            | "affine:divider"
            | "affine:image"
            | "affine:bookmark"
            | "affine:latex"
            | "affine:table"
            | "affine:attachment"
            | "affine:embed-linked-doc"
            | "affine:embed-synced-doc"
            | "affine:surface-ref"
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
            Self::Latex { .. } => "affine:latex",
            Self::Callout { .. } => "affine:callout",
            Self::Table { .. } => "affine:table",
            Self::Attachment { .. } => "affine:attachment",
            Self::EmbedLinkedDoc { .. } => "affine:embed-linked-doc",
            Self::EmbedSyncedDoc { .. } => "affine:embed-synced-doc",
            Self::SurfaceRef { .. } => "affine:surface-ref",
            Self::Database(_) => "affine:database",
        }
    }

    pub fn version(&self) -> i32 {
        match self {
            Self::Page { .. } => 2,
            Self::Database(_) => 3,
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
            Self::Latex { latex } => {
                entries.extend([
                    (
                        "prop:xywh".to_string(),
                        SessionValue::Any(Any::String("[0,0,16,16]".to_string())),
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
                        "prop:latex".to_string(),
                        SessionValue::Any(Any::String(latex)),
                    ),
                ]);
            }
            Self::Callout {
                icon,
                background_color,
            } => {
                let bg = background_color
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| "grey".to_string());
                let unicode = if icon.trim().is_empty() {
                    "\u{1F4A1}".to_string()
                } else {
                    icon
                };
                entries.extend([
                    (
                        "prop:icon".to_string(),
                        SessionValue::Map(vec![
                            (
                                "type".to_string(),
                                SessionValue::Any(Any::String("emoji".to_string())),
                            ),
                            (
                                "unicode".to_string(),
                                SessionValue::Any(Any::String(unicode)),
                            ),
                        ]),
                    ),
                    ("prop:text".to_string(), text_value("")),
                    (
                        "prop:backgroundColorName".to_string(),
                        SessionValue::Any(Any::String(bg)),
                    ),
                ]);
            }
            Self::Table { rows } => {
                let col_count = rows.iter().map(Vec::len).max().unwrap_or(0);
                let mut prev_col_order: Option<String> = None;
                for col_idx in 0..col_count {
                    let col_id = format!("col-{col_idx}");
                    let order = crate::fractional_index::generate_key_between(
                        prev_col_order.as_deref(),
                        None,
                    )
                    .unwrap_or_else(|_| format!("a{col_idx}"));
                    prev_col_order = Some(order.clone());
                    entries.push((
                        format!("prop:columns.{col_id}.columnId"),
                        SessionValue::Any(Any::String(col_id.clone())),
                    ));
                    entries.push((
                        format!("prop:columns.{col_id}.order"),
                        SessionValue::Any(Any::String(order)),
                    ));
                }
                let mut prev_row_order: Option<String> = None;
                for (row_idx, row) in rows.iter().enumerate() {
                    let row_id = format!("row-{row_idx}");
                    let order = crate::fractional_index::generate_key_between(
                        prev_row_order.as_deref(),
                        None,
                    )
                    .unwrap_or_else(|_| format!("a{row_idx}"));
                    prev_row_order = Some(order.clone());
                    entries.push((
                        format!("prop:rows.{row_id}.rowId"),
                        SessionValue::Any(Any::String(row_id.clone())),
                    ));
                    entries.push((
                        format!("prop:rows.{row_id}.order"),
                        SessionValue::Any(Any::String(order)),
                    ));
                    for col_idx in 0..col_count {
                        let cell_text = row.get(col_idx).map(String::as_str).unwrap_or("");
                        entries.push((
                            format!("prop:cells.{row_id}:col-{col_idx}.text"),
                            text_value(cell_text),
                        ));
                    }
                }
            }
            Self::Attachment {
                name,
                size,
                mime_type,
                source_id,
                caption,
                embed,
            } => {
                entries.extend([
                    (
                        "prop:name".to_string(),
                        SessionValue::Any(Any::String(name)),
                    ),
                    (
                        "prop:size".to_string(),
                        SessionValue::Any(Any::BigInt64(size)),
                    ),
                    (
                        "prop:type".to_string(),
                        SessionValue::Any(Any::String(mime_type)),
                    ),
                    (
                        "prop:sourceId".to_string(),
                        SessionValue::Any(Any::String(source_id)),
                    ),
                    (
                        "prop:caption".to_string(),
                        SessionValue::Any(if caption.is_empty() {
                            Any::Null
                        } else {
                            Any::String(caption)
                        }),
                    ),
                    (
                        "prop:embed".to_string(),
                        SessionValue::Any(if embed { Any::True } else { Any::False }),
                    ),
                    (
                        "prop:style".to_string(),
                        SessionValue::Any(Any::String("horizontalThin".to_string())),
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
            Self::EmbedLinkedDoc {
                page_id,
                style,
                caption,
            } => {
                entries.extend([
                    (
                        "prop:pageId".to_string(),
                        SessionValue::Any(Any::String(page_id)),
                    ),
                    (
                        "prop:style".to_string(),
                        SessionValue::Any(Any::String(style)),
                    ),
                    (
                        "prop:caption".to_string(),
                        SessionValue::Any(if caption.is_empty() {
                            Any::Null
                        } else {
                            Any::String(caption)
                        }),
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
                ]);
            }
            Self::EmbedSyncedDoc { page_id, caption } => {
                entries.extend([
                    (
                        "prop:pageId".to_string(),
                        SessionValue::Any(Any::String(page_id)),
                    ),
                    (
                        "prop:style".to_string(),
                        SessionValue::Any(Any::String("syncedDoc".to_string())),
                    ),
                    (
                        "prop:caption".to_string(),
                        SessionValue::Any(if caption.is_empty() {
                            Any::Null
                        } else {
                            Any::String(caption)
                        }),
                    ),
                    ("prop:scale".to_string(), SessionValue::Any(Any::Integer(1))),
                ]);
                push_edgeless_props(&mut entries);
            }
            Self::SurfaceRef {
                reference,
                ref_flavour,
                caption,
            } => {
                entries.extend([
                    (
                        "prop:reference".to_string(),
                        SessionValue::Any(Any::String(reference)),
                    ),
                    (
                        "prop:refFlavour".to_string(),
                        SessionValue::Any(Any::String(ref_flavour)),
                    ),
                    (
                        "prop:caption".to_string(),
                        SessionValue::Any(if caption.is_empty() {
                            Any::Null
                        } else {
                            Any::String(caption)
                        }),
                    ),
                ]);
                push_edgeless_props(&mut entries);
            }
            Self::Database(spec) => {
                entries.extend(spec.into_prop_entries());
            }
        }

        entries
    }
}

fn push_edgeless_props(entries: &mut Vec<(String, SessionValue)>) {
    for (k, v) in [
        ("prop:index", Any::String("a0".to_string())),
        ("prop:xywh", Any::String("[0,0,0,0]".to_string())),
        ("prop:lockedBySelf", Any::False),
        ("prop:rotate", Any::Integer(0)),
    ] {
        entries.push((k.to_string(), SessionValue::Any(v)));
    }
}
