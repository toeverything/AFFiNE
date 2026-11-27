use y_octo::{AHashMap, Any, SessionValue};

use super::{
    CONNECTOR_LABEL_MAX_WIDTH, DEFAULT_HIGHLIGHTER_LINE_WIDTH, DEFAULT_ROUGHNESS, text_value,
};

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
    Mindmap {
        seed: i32,
        style: i32,
        layout_type: i32,
        children: Vec<(String, MindmapNodeSpec)>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MindmapNodeSpec {
    pub index: String,
    pub parent: Option<String>,
    pub collapsed: bool,
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

fn color_any(dark: &str, light: &str) -> Any {
    let mut map = AHashMap::default();
    map.insert("dark".to_string(), Any::String(dark.to_string()));
    map.insert("light".to_string(), Any::String(light.to_string()));
    Any::Object(Box::new(map))
}

fn nonzero_seed(seed: i32) -> i32 {
    if seed == 0 { 1 } else { seed }
}

/// Wrap a plain JSON array for insertion as a single `Y.Map` entry.
///
/// `y-octo`'s `From<Any> for Content` converts a top-level `Any::Array(v)` into
/// multi-element `Content::Any(v)`. Wrapping once produces `Content::Any(vec![Any::Array(v)])`,
/// matching Yjs `yMap.set(key, array)`.
pub fn map_array_any(items: Vec<Any>) -> Any {
    Any::Array(vec![Any::Array(items)])
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
            Self::Mindmap { .. } => "mindmap",
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
                let (shape_type, radius) = if shape_type == "rounded" {
                    ("rect".to_owned(), 0.1)
                } else {
                    (shape_type, 0.0)
                };
                let yellow = color_any("#fcd34d", "#fcd34d");
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
                    (
                        "radius".to_string(),
                        SessionValue::Any(Any::Float64(radius.into())),
                    ),
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
                        SessionValue::Any(Any::Integer(2)),
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
                        SessionValue::Any(Any::Integer(2)),
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
            Self::Mindmap {
                seed,
                style,
                layout_type,
                children,
            } => {
                let child_entries = children
                    .into_iter()
                    .map(|(cid, detail)| {
                        let mut dmap = AHashMap::default();
                        dmap.insert("index".to_string(), Any::String(detail.index));
                        if let Some(parent) = detail.parent {
                            dmap.insert("parent".to_string(), Any::String(parent));
                        }
                        if detail.collapsed {
                            dmap.insert("collapsed".to_string(), Any::True);
                        }
                        (cid, SessionValue::Any(Any::Object(Box::new(dmap))))
                    })
                    .collect();
                entries.extend([
                    (
                        "seed".to_string(),
                        SessionValue::Any(Any::Integer(nonzero_seed(seed))),
                    ),
                    ("style".to_string(), SessionValue::Any(Any::Integer(style))),
                    (
                        "layoutType".to_string(),
                        SessionValue::Any(Any::Integer(layout_type)),
                    ),
                    ("children".to_string(), SessionValue::Map(child_entries)),
                ]);
            }
        }

        entries
    }
}
