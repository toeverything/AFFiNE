//! Typed whiteboard surface elements decoded from `affine:surface` `prop:elements`.

use std::collections::BTreeMap;

use serde_json::Value as JsonValue;

use super::{RichText, TextAlign};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShapeType {
    Rect,
    Triangle,
    Ellipse,
    Diamond,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StrokeStyle {
    Solid,
    Dash,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShapeStyle {
    General,
    Scribbled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerticalAlign {
    Top,
    Center,
    Bottom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndpointStyle {
    None,
    Arrow,
    Triangle,
    Circle,
    Diamond,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectorMode {
    Straight,
    Orthogonal,
    Curve,
}
#[derive(Debug, Clone, PartialEq)]
pub struct SurfaceElement {
    pub id: String,
    pub index: String,
    pub hidden: bool,
    pub locked_by_self: bool,
    pub seed: i32,
    pub rotate: f64,
    pub props: BTreeMap<String, JsonValue>,
    pub kind: SurfaceElementKind,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SurfaceShape {
    pub shape_type: ShapeType,
    pub radius: f64,
    pub xywh: [f64; 4],
    pub filled: bool,
    pub fill_color: ColorValue,
    pub stroke_color: ColorValue,
    pub stroke_width: f64,
    pub stroke_style: StrokeStyle,
    pub shape_style: ShapeStyle,
    pub roughness: f64,
    pub text: RichText,
    pub text_display: bool,
    pub color: ColorValue,
    pub font_family: String,
    pub font_size: f64,
    pub font_weight: String,
    pub font_style: String,
    pub text_align: TextAlign,
    pub text_vertical_align: VerticalAlign,
    pub padding: [f64; 2],
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConnectorEndpoint {
    pub id: Option<String>,
    pub position: Option<[f64; 2]>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConnectorLabelOffset {
    pub distance: f64,
    pub anchor: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConnectorLabelConstraints {
    pub has_max_width: bool,
    pub max_width: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConnectorLabelStyle {
    pub color: ColorValue,
    pub font_family: String,
    pub font_size: f64,
    pub font_weight: String,
    pub font_style: String,
    pub text_align: TextAlign,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SurfaceConnector {
    pub rough: bool,
    pub mode: ConnectorMode,
    pub source: ConnectorEndpoint,
    pub target: ConnectorEndpoint,
    pub stroke: ColorValue,
    pub stroke_width: f64,
    pub stroke_style: StrokeStyle,
    pub roughness: f64,
    pub front_endpoint_style: EndpointStyle,
    pub rear_endpoint_style: EndpointStyle,
    pub text: RichText,
    pub label_display: bool,
    pub label_xywh: Option<[f64; 4]>,
    pub label_offset: ConnectorLabelOffset,
    pub label_constraints: ConnectorLabelConstraints,
    pub label_style: ConnectorLabelStyle,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SurfaceStroke {
    pub simulated_pressure: bool,
    pub points: Vec<[f64; 3]>,
    pub xywh: [f64; 4],
    pub color: ColorValue,
    pub line_width: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SurfaceText {
    pub xywh: [f64; 4],
    pub text: RichText,
    pub color: ColorValue,
    pub font_family: String,
    pub font_size: f64,
    pub font_weight: String,
    pub font_style: String,
    pub text_align: TextAlign,
    pub has_max_width: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ColorValue {
    Single(String),
    Themed { light: String, dark: String },
}

#[derive(Debug, Clone, PartialEq)]
pub enum SurfaceElementKind {
    Shape(SurfaceShape),
    Connector(SurfaceConnector),
    Brush(SurfaceStroke),
    Highlighter(SurfaceStroke),
    Text(SurfaceText),
    Group {
        title: RichText,
        children: Vec<String>,
    },
    Unknown {
        element_type: String,
    },
}

fn coordinates<const N: usize>(value: &JsonValue) -> Option<[f64; N]> {
    if let Some(s) = value.as_str() {
        return serde_json::from_str::<Vec<f64>>(s).ok()?.try_into().ok();
    }
    serde_json::from_value::<Vec<f64>>(value.clone())
        .ok()?
        .try_into()
        .ok()
}

fn field_string(v: &JsonValue, key: &str, default: &str) -> String {
    v[key].as_str().unwrap_or(default).into()
}
fn field_number(v: &JsonValue, key: &str, default: f64) -> f64 {
    v[key].as_f64().unwrap_or(default)
}
fn color(value: &JsonValue, default: &str) -> ColorValue {
    if let (Some(light), Some(dark)) = (value["light"].as_str(), value["dark"].as_str()) {
        ColorValue::Themed {
            light: light.into(),
            dark: dark.into(),
        }
    } else {
        ColorValue::Single(
            value
                .as_str()
                .or_else(|| value["normal"].as_str())
                .unwrap_or(default)
                .into(),
        )
    }
}
fn endpoint(v: &JsonValue) -> ConnectorEndpoint {
    ConnectorEndpoint {
        id: v["id"].as_str().map(String::from),
        position: coordinates(&v["position"]),
    }
}
fn endpoint_style(v: &JsonValue, default: EndpointStyle) -> EndpointStyle {
    match v.as_str() {
        Some("None") => EndpointStyle::None,
        Some("Arrow") => EndpointStyle::Arrow,
        Some("Circle") => EndpointStyle::Circle,
        Some("Diamond") => EndpointStyle::Diamond,
        Some("Triangle") => EndpointStyle::Triangle,
        _ => default,
    }
}

impl ConnectorLabelStyle {
    fn parse(v: &JsonValue, size: f64) -> Self {
        Self {
            color: color(&v["color"], "--affine-text-primary-color"),
            font_family: field_string(v, "fontFamily", "blocksuite:surface:Inter"),
            font_weight: v["fontWeight"]
                .as_i64()
                .map(|w| w.to_string())
                .unwrap_or_else(|| field_string(v, "fontWeight", "400")),
            font_style: field_string(v, "fontStyle", "normal"),
            font_size: field_number(v, "fontSize", size),
            text_align: v["textAlign"]
                .as_str()
                .and_then(TextAlign::parse)
                .unwrap_or(TextAlign::Center),
        }
    }
}

impl SurfaceElement {
    /// Decode normalized properties and the original shared text delta without accessing a document.
    pub fn from_properties(id: String, v: JsonValue, text: RichText) -> Self {
        let xywh = coordinates(&v["xywh"]).unwrap_or_default();
        let roughness = field_number(&v, "roughness", crate::schema::DEFAULT_ROUGHNESS);
        let stroke_width = field_number(&v, "strokeWidth", 4.);
        let stroke_style = match v["strokeStyle"].as_str() {
            Some("dash") => StrokeStyle::Dash,
            Some("none") => StrokeStyle::None,
            _ => StrokeStyle::Solid,
        };
        let kind = match v["type"].as_str().unwrap_or("") {
            "shape" => {
                let font = ConnectorLabelStyle::parse(&v, 20.);
                SurfaceElementKind::Shape(SurfaceShape {
                    shape_type: match v["shapeType"].as_str() {
                        Some("triangle") => ShapeType::Triangle,
                        Some("diamond") => ShapeType::Diamond,
                        Some("ellipse") => ShapeType::Ellipse,
                        _ => ShapeType::Rect,
                    },
                    xywh,
                    radius: match field_number(&v, "radius", 0.) {
                        0.0 if v["shapeType"] == "rounded" => 0.1,
                        r => r,
                    },
                    filled: v["filled"].as_bool().unwrap_or(false),
                    fill_color: color(&v["fillColor"], "#f5c211"),
                    stroke_color: color(&v["strokeColor"], "#f5c211"),
                    stroke_width,
                    stroke_style,
                    roughness,
                    shape_style: if v["shapeStyle"] == "Scribbled" {
                        ShapeStyle::Scribbled
                    } else {
                        ShapeStyle::General
                    },
                    text,
                    text_display: true,
                    color: font.color,
                    font_family: font.font_family,
                    font_size: font.font_size,
                    font_weight: font.font_weight,
                    font_style: font.font_style,
                    text_align: font.text_align,
                    text_vertical_align: match v["textVerticalAlign"].as_str() {
                        Some("top") => VerticalAlign::Top,
                        Some("bottom") => VerticalAlign::Bottom,
                        _ => VerticalAlign::Center,
                    },
                    padding: coordinates(&v["padding"]).unwrap_or([10., 20.]),
                })
            }
            "connector" => {
                let c = &v["labelConstraints"];
                let offset = &v["labelOffset"];
                SurfaceElementKind::Connector(SurfaceConnector {
                    rough: v["rough"].as_bool().unwrap_or(false),
                    mode: match v["mode"].as_f64() {
                        Some(0.0) => ConnectorMode::Straight,
                        Some(1.0) => ConnectorMode::Orthogonal,
                        _ => ConnectorMode::Curve,
                    },
                    source: endpoint(&v["source"]),
                    target: endpoint(&v["target"]),
                    stroke: color(&v["stroke"], "#929292"),
                    stroke_width,
                    stroke_style,
                    roughness,
                    front_endpoint_style: endpoint_style(
                        &v["frontEndpointStyle"],
                        EndpointStyle::None,
                    ),
                    rear_endpoint_style: endpoint_style(
                        &v["rearEndpointStyle"],
                        EndpointStyle::Arrow,
                    ),
                    text,
                    label_display: v["labelDisplay"].as_bool().unwrap_or(true),
                    label_xywh: coordinates(&v["labelXYWH"]),
                    label_offset: ConnectorLabelOffset {
                        distance: field_number(offset, "distance", 0.5),
                        anchor: field_string(offset, "anchor", "center"),
                    },
                    label_constraints: ConnectorLabelConstraints {
                        has_max_width: c["hasMaxWidth"].as_bool().unwrap_or(true),
                        max_width: field_number(
                            c,
                            "maxWidth",
                            crate::schema::CONNECTOR_LABEL_MAX_WIDTH,
                        ),
                    },
                    label_style: ConnectorLabelStyle::parse(&v["labelStyle"], 16.),
                })
            }
            ty @ ("brush" | "highlighter") => {
                let highlighter = ty == "highlighter";
                let points = v["points"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|p| {
                        Some([
                            p.get(0)?.as_f64()?,
                            p.get(1)?.as_f64()?,
                            p.get(2).and_then(JsonValue::as_f64).unwrap_or(0.5),
                        ])
                    })
                    .collect();
                let stroke = SurfaceStroke {
                    simulated_pressure: v["points"]
                        .get(0)
                        .and_then(JsonValue::as_array)
                        .is_some_and(|p| p.len() == 2),
                    xywh,
                    points,
                    color: color(
                        &v["color"],
                        if highlighter {
                            "#84cfff4d"
                        } else {
                            "--affine-text-primary-color"
                        },
                    ),
                    line_width: field_number(
                        &v,
                        "lineWidth",
                        if highlighter {
                            crate::schema::DEFAULT_HIGHLIGHTER_LINE_WIDTH
                        } else {
                            4.
                        },
                    ),
                };
                if highlighter {
                    SurfaceElementKind::Highlighter(stroke)
                } else {
                    SurfaceElementKind::Brush(stroke)
                }
            }
            "text" => {
                let font = ConnectorLabelStyle::parse(&v, 16.);
                SurfaceElementKind::Text(SurfaceText {
                    xywh,
                    text,
                    color: font.color,
                    font_family: font.font_family,
                    font_size: font.font_size,
                    font_weight: font.font_weight,
                    font_style: font.font_style,
                    text_align: font.text_align,
                    has_max_width: v["hasMaxWidth"].as_bool().unwrap_or(false),
                })
            }
            "group" => {
                let mut children: Vec<_> = v["children"]
                    .as_object()
                    .into_iter()
                    .flatten()
                    .map(|(k, _)| k.clone())
                    .collect();
                children.sort();
                SurfaceElementKind::Group {
                    title: text,
                    children,
                }
            }
            ty => SurfaceElementKind::Unknown {
                element_type: ty.into(),
            },
        };
        Self {
            id,
            index: field_string(&v, "index", ""),
            hidden: v["hidden"].as_bool().unwrap_or(false),
            locked_by_self: v["lockedBySelf"].as_bool().unwrap_or(false),
            seed: field_number(&v, "seed", 1.) as i32,
            rotate: field_number(&v, "rotate", 0.),
            kind,
            props: match v {
                JsonValue::Object(map) => map.into_iter().collect(),
                _ => BTreeMap::new(),
            },
        }
    }
}
