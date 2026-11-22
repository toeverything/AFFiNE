use super::{Contour, P, WorldBounds, connector, rough, shapes, strokes};
use crate::{
    PlaygroundTheme,
    rich_text::{LaidOutRichParagraph, RichParagraph, RichParagraphStyle},
};
use blocksuite_playground_doc::read::*;
use std::{collections::BTreeMap, rc::Rc};
use ui::{
    App, Bounds, Hsla, Path, PathBuilder, Pixels, Point, ScaledPixels, TransformationMatrix,
    Window, canvas, div, prelude::*, px,
};
use y_octo::{Any, TextDeltaOp};

fn themed_value(theme: PlaygroundTheme, color: &ColorValue) -> &str {
    match color {
        ColorValue::Single(v) => v,
        ColorValue::Themed { light, dark } => {
            if theme == PlaygroundTheme::Light {
                light
            } else {
                dark
            }
        }
    }
}
fn resolve(theme: PlaygroundTheme, color: &ColorValue) -> Hsla {
    let value = themed_value(theme, color);
    theme
        .css_color(value)
        .or_else(|| theme.css_var(value))
        .unwrap_or_else(|| theme.palette().text_primary)
}
struct Label {
    layout: LaidOutRichParagraph,
    origin: P,
    pill: Option<(WorldBounds, Hsla)>,
}
struct Item {
    id: String,
    group: bool,
    bounds: Bounds<Pixels>,
    transform: TransformationMatrix,
    paths: Vec<(Path<Pixels>, Hsla)>,
    label: Option<Label>,
    label_clip: Option<Bounds<Pixels>>,
    path_cutout: Option<WorldBounds>,
}
impl Item {
    fn path(
        &mut self,
        c: &Contour,
        color: Hsla,
        width: Option<f64>,
        style: StrokeStyle,
        roughness: f64,
        seed: i32,
    ) {
        if style == StrokeStyle::None || width.is_some_and(|w| w <= 0.) {
            return;
        }
        let mut b = width.map_or_else(
            || PathBuilder::fill().with_style(ui::PathStyle::Fill(ui::FillOptions::non_zero())),
            |w| PathBuilder::stroke(px(w as f32)),
        );
        if style == StrokeStyle::Dash && width.is_some() {
            b = b.dash_array(&[px(12.), px(12.)]);
        }
        if roughness > 0. {
            rough::emit(c, &mut b, seed, roughness)
        } else {
            c.emit(&mut b)
        }
        self.finish_path(b, color);
    }
    fn finish_path(&mut self, builder: PathBuilder, color: Hsla) {
        if let Ok(path) = builder.build()
            && !path.vertices.is_empty()
        {
            self.bounds = self.bounds.union(&path.bounds);
            self.paths.push((path, color));
        }
    }
    fn fill(&mut self, c: &Contour, color: Hsla) {
        self.path(c, color, None, StrokeStyle::Solid, 0., 1)
    }
    fn label(&mut self, label: Label) {
        let mut b = Bounds::new(label.origin.ui(), label.layout.size());
        if let Some(clip) = self.label_clip {
            b = b.intersect(&clip);
        }
        self.bounds = self.bounds.union(&b);
        if let Some((pill, _)) = &label.pill {
            self.bounds = self.bounds.union(&pill.ui());
        }
        self.label = Some(label)
    }
}

/// Laid-out geometry, text and hit-test bounds in document coordinates.
pub struct SurfaceLayout {
    items: Vec<Item>,
    pub show_group_frames: bool,
}
impl SurfaceLayout {
    pub fn bounds(&self) -> impl Iterator<Item = (&str, Bounds<Pixels>)> + '_ {
        self.visible_items().map(|e| (e.id.as_str(), e.bounds))
    }
    pub(crate) fn item_ids(&self) -> impl Iterator<Item = &str> {
        self.items.iter().map(|e| e.id.as_str())
    }

    pub(crate) fn paint_item(
        &self,
        index: usize,
        viewport: Bounds<Pixels>,
        window: &mut Window,
        cx: &mut App,
    ) {
        let item = &self.items[index];
        if (!item.group || self.show_group_frames) && item.bounds.intersects(&viewport) {
            item.paint(TransformationMatrix::unit(), window, cx);
        }
    }
    fn visible_items(&self) -> impl Iterator<Item = &Item> {
        self.items
            .iter()
            .filter(|e| self.show_group_frames || !e.group)
    }
}
struct TextStyle<'a> {
    color: &'a ColorValue,
    font: &'a str,
    size: f64,
    weight: &'a str,
    slant: &'a str,
    align: TextAlign,
}
impl TextStyle<'_> {
    fn layout(
        &self,
        text: &RichText,
        width: f64,
        theme: PlaygroundTheme,
        ts: &ui::WindowTextSystem,
    ) -> Option<(LaidOutRichParagraph, f64)> {
        if text.is_empty() {
            return None;
        }
        let mut delta = text.delta.clone();
        if matches!(self.slant, "italic" | "oblique") {
            for op in &mut delta {
                if let TextDeltaOp::Insert { format, .. } = op {
                    format
                        .get_or_insert_with(Default::default)
                        .entry("italic".into())
                        .or_insert(Any::True);
                }
            }
        }
        let mut style = RichParagraphStyle {
            font_family: self
                .font
                .trim_start_matches("blocksuite:surface:")
                .to_string()
                .into(),
            font_size: self.size as f32,
            base_weight: ui::FontWeight(self.weight.parse().unwrap_or(if self.weight == "bold" {
                700.
            } else {
                400.
            })),
            align: match self.align {
                TextAlign::Left => ui::TextAlign::Left,
                TextAlign::Center => ui::TextAlign::Center,
                TextAlign::Right => ui::TextAlign::Right,
            },
            text_color: resolve(theme, self.color),
            ..RichParagraphStyle::from_theme(theme.mode())
        };
        let mut face = ui::font(style.font_family.clone());
        face.weight = style.base_weight;
        let id = ts.resolve_font(&face);
        let size = px(style.font_size);
        let ascent = f32::from(ts.ascent(id, size));
        let descent = f32::from(ts.descent(id, size)).abs();
        let gap = f32::from(ts.line_gap(id, size));
        style.line_height = ascent + descent;
        style.baseline_offset = Some(ascent);
        Some((
            RichParagraph::from_delta(delta)
                .ok()?
                .layout(ts, &style, width.max(1.) as f32),
            f64::from(gap),
        ))
    }
}

fn geometry(e: &SurfaceElement) -> Option<WorldBounds> {
    let xywh = match &e.kind {
        SurfaceElementKind::Shape(s) => s.xywh,
        SurfaceElementKind::Brush(s) | SurfaceElementKind::Highlighter(s) => s.xywh,
        SurfaceElementKind::Text(s) => s.xywh,
        _ => return None,
    };
    Some(WorldBounds {
        xywh,
        rotate: e.rotate,
    })
}
pub fn layout_surface(
    elements: &[SurfaceElement],
    external_bounds: &BTreeMap<String, WorldBounds>,
    theme: PlaygroundTheme,
    window: &Window,
) -> SurfaceLayout {
    let mut bounds = external_bounds.clone();
    let mut ordered: Vec<_> = elements.iter().filter(|e| !e.hidden).collect();
    ordered.sort_by(|a, b| (&a.index, &a.id).cmp(&(&b.index, &b.id)));
    bounds.extend(
        ordered
            .iter()
            .filter_map(|e| Some((e.id.clone(), geometry(e)?))),
    );
    let lookup = elements.iter().map(|e| (e.id.as_str(), e)).collect();
    let shapes = elements
        .iter()
        .filter_map(|e| match &e.kind {
            SurfaceElementKind::Shape(s) => Some((e.id.as_str(), s.shape_type)),
            _ => None,
        })
        .collect();
    let routes: BTreeMap<_, _> = ordered
        .iter()
        .filter_map(|e| match &e.kind {
            SurfaceElementKind::Connector(c) => {
                Some((e.id.as_str(), connector::route(c, &bounds, &shapes)?))
            }
            _ => None,
        })
        .collect();
    bounds.extend(
        routes
            .iter()
            .map(|(id, r)| (id.to_string(), super::extent(&r.samples))),
    );
    let mut items = vec![];
    for e in ordered {
        let region = match &e.kind {
            SurfaceElementKind::Group { children, .. } => {
                strokes::group_bounds(children, &lookup, &bounds).map(|b| b.expand(12.))
            }
            _ => bounds.get(&e.id).copied(),
        };
        let Some(b) = region else { continue };
        let rotate_locally = matches!(
            &e.kind,
            SurfaceElementKind::Shape(_) | SurfaceElementKind::Text(_)
        );
        let mut transform = TransformationMatrix::unit();
        if rotate_locally && b.rotate != 0. {
            let P(x, y) = b.at(0.5, 0.5);
            let center = ui::point(ScaledPixels(x as f32), ScaledPixels(y as f32));
            transform = transform
                .translate(center)
                .rotate(ui::radians(b.rotate.to_radians() as f32))
                .translate(ui::point(
                    ScaledPixels(-center.x.0),
                    ScaledPixels(-center.y.0),
                ));
        }
        let mut item = Item {
            transform,
            id: e.id.clone(),
            group: matches!(e.kind, SurfaceElementKind::Group { .. }),
            bounds: if rotate_locally {
                b.ui()
            } else {
                b.aabb().ui()
            },
            paths: vec![],
            label: None,
            label_clip: None,
            path_cutout: None,
        };
        match &e.kind {
            SurfaceElementKind::Shape(s) => {
                layout_shape(&mut item, s, e.seed, theme, window.text_system())
            }
            SurfaceElementKind::Connector(c) => {
                let Some(route) = routes.get(e.id.as_str()) else {
                    continue;
                };
                layout_connector(&mut item, c, route, e.seed, theme, window);
            }
            SurfaceElementKind::Brush(s) | SurfaceElementKind::Highlighter(s) => {
                let highlight = matches!(&e.kind, SurfaceElementKind::Highlighter(_));
                if let Some(path) = strokes::outline(s, e.rotate) {
                    let color = if highlight {
                        let value = themed_value(theme, &s.color);
                        if value == "transparent"
                            || (value.starts_with("--") && value.ends_with("transparent"))
                        {
                            Hsla::transparent_black()
                        } else if value.is_empty() {
                            ui::rgba(0x84cfff4d).into()
                        } else {
                            theme
                                .css_color(value)
                                .or_else(|| theme.css_var(value))
                                .unwrap_or_else(Hsla::transparent_black)
                        }
                    } else {
                        resolve(theme, &s.color)
                    };
                    item.fill(&path, color);
                }
            }
            SurfaceElementKind::Text(s) => {
                let [x, y, w, _] = s.xywh;
                let style = TextStyle {
                    color: &s.color,
                    font: &s.font_family,
                    size: s.font_size,
                    weight: &s.font_weight,
                    slant: &s.font_style,
                    align: s.text_align,
                };
                item.label_clip = Some(b.ui());
                if let Some((layout, _)) = style.layout(&s.text, w, theme, window.text_system()) {
                    item.label(Label {
                        layout,
                        origin: P(x, y),
                        pill: None,
                    });
                }
            }
            SurfaceElementKind::Group { title, .. } => {
                layout_group(&mut item, title, b, theme, window)
            }
            SurfaceElementKind::Unknown { .. } => continue,
        }
        item.bounds = transform.map_bounds_pixels(item.bounds);
        items.push(item);
    }
    SurfaceLayout {
        items,
        show_group_frames: true,
    }
}

fn layout_shape(
    item: &mut Item,
    s: &SurfaceShape,
    seed: i32,
    theme: PlaygroundTheme,
    ts: &ui::WindowTextSystem,
) {
    if s.shape_style == ShapeStyle::Scribbled {
        let (fill, outline) = rough::shape(s, seed);
        let [x, y, _, _] = s.xywh;
        let inset = s.stroke_width.max(0.) / 2.;
        let world = |p: P| p.add(P(x + inset, y + inset));
        for (contours, color, width, dash) in [
            (fill, &s.fill_color, s.stroke_width / 2., false),
            (
                outline,
                &s.stroke_color,
                s.stroke_width,
                s.stroke_style == StrokeStyle::Dash,
            ),
        ] {
            if contours.is_empty() || width <= 0. {
                continue;
            }
            let mut builder = PathBuilder::stroke(px(width as f32));
            if dash {
                builder = builder.dash_array(&[px(12.), px(12.)]);
            }
            for contour in contours {
                contour.mapped(world).emit(&mut builder);
            }
            item.finish_path(builder, resolve(theme, color));
        }
    } else {
        let contour = shapes::outline(s);
        if s.filled {
            item.fill(&contour, resolve(theme, &s.fill_color));
        }
        item.path(
            &contour,
            resolve(theme, &s.stroke_color),
            Some(s.stroke_width),
            s.stroke_style,
            0.,
            seed,
        );
    }
    let [x, y, w, h] = s.xywh;
    let [py, px] = s.padding;
    let style = TextStyle {
        color: &s.color,
        font: &s.font_family,
        size: s.font_size,
        weight: &s.font_weight,
        slant: &s.font_style,
        align: s.text_align,
    };
    if let Some((layout, gap)) = style.layout(&s.text, w - 2. * px, theme, ts) {
        let lh = f64::from(f32::from(layout.size().height)) + layout.lines().len() as f64 * gap;
        let top = match s.text_vertical_align {
            VerticalAlign::Top => py,
            VerticalAlign::Center => ((h - lh) / 2.).max(py),
            VerticalAlign::Bottom => h - py - lh,
        };
        item.label_clip = Some(
            WorldBounds {
                xywh: [x + px, y, (w - 2. * px).max(0.), h],
                rotate: 0.,
            }
            .ui(),
        );
        item.label(Label {
            layout,
            origin: P(x + px, y + top + gap / 2.),
            pill: None,
        });
    }
}
fn layout_connector(
    item: &mut Item,
    c: &SurfaceConnector,
    route: &connector::Route,
    seed: i32,
    theme: PlaygroundTheme,
    window: &Window,
) {
    let color = resolve(theme, &c.stroke);
    item.path(
        &route.contour,
        color,
        Some(c.stroke_width),
        c.stroke_style,
        if c.rough { c.roughness } else { 0. },
        seed,
    );
    if c.stroke_style != StrokeStyle::None {
        let ends = route.endpoint_directions();
        for (style, (tip, prev)) in [c.front_endpoint_style, c.rear_endpoint_style]
            .into_iter()
            .zip(ends)
        {
            if let Some(head) = connector::head(style, tip, prev, c.stroke_width, c.rough) {
                if head.closed {
                    item.fill(&head, color);
                }
                item.path(
                    &head,
                    color,
                    Some(c.stroke_width),
                    StrokeStyle::Solid,
                    if c.rough { c.roughness } else { 0. },
                    seed,
                );
            }
        }
    }
    if c.label_display {
        let l = &c.label_style;
        let style = TextStyle {
            color: &l.color,
            font: &l.font_family,
            size: l.font_size,
            weight: &l.font_weight,
            slant: &l.font_style,
            align: l.text_align,
        };
        let limit = c
            .label_xywh
            .map(|b| b[2])
            .unwrap_or(if c.label_constraints.has_max_width {
                c.label_constraints.max_width
            } else {
                1e6
            });
        if let Some((measured, _)) = style.layout(&c.text, limit, theme, window.text_system()) {
            let width = measured
                .lines()
                .iter()
                .map(|l| f32::from(l.width))
                .fold(0., f32::max)
                .ceil() as f64;
            let width = c.label_xywh.map_or(width, |b| b[2]).max(1.);
            let (layout, _) = style
                .layout(&c.text, width, theme, window.text_system())
                .unwrap();
            let h = f64::from(f32::from(layout.size().height));
            let p = route.point_at_distance(c.mode, c.label_offset.distance);
            let top = if c.label_xywh.is_some() {
                p.1 - h / 2.
            } else {
                match c.label_offset.anchor.as_str() {
                    "top" => p.1 - h,
                    "bottom" => p.1,
                    _ => p.1 - h / 2.,
                }
            };
            let origin = P(p.0 - width / 2., top);
            item.path_cutout = Some(
                WorldBounds {
                    xywh: c
                        .label_xywh
                        .map_or([origin.0, origin.1, width, h], |[_, _, w, h]| {
                            [p.0 - w / 2., p.1 - h / 2., w, h]
                        }),
                    rotate: 0.,
                }
                .expand(3.5),
            );
            item.label(Label {
                layout,
                origin,
                pill: None,
            });
        }
    }
}
fn layout_group(
    item: &mut Item,
    title: &RichText,
    b: WorldBounds,
    theme: PlaygroundTheme,
    window: &Window,
) {
    let palette = theme.palette();
    item.path(
        &shapes::box_outline(b, 8.),
        palette.border,
        Some(1.),
        StrokeStyle::Solid,
        0.,
        1,
    );
    let style = TextStyle {
        color: &ColorValue::Single("--affine-text-secondary-color".into()),
        font: "Inter",
        size: 14.,
        weight: "500",
        slant: "normal",
        align: TextAlign::Left,
    };
    let [x, y, w, _] = b.xywh;
    if let Some((layout, _)) = style.layout(title, w, theme, window.text_system()) {
        let width = f64::from(f32::from(layout.size().width));
        let h = f64::from(f32::from(layout.size().height));
        let pill = WorldBounds {
            xywh: [x + 8., y - h / 2. - 2., width + 10., h + 4.],
            rotate: 0.,
        };
        item.label(Label {
            layout,
            origin: P(x + 13., y - h / 2.),
            pill: Some((pill, palette.background_secondary)),
        });
    }
}

// Four disjoint rectangles express canvas even-odd clipping with an inner hole.
// Paint each intersecting part using the original path, preserving dash phase and curves.
fn outside_rect(outer: Bounds<Pixels>, hole: Bounds<Pixels>) -> Vec<Bounds<Pixels>> {
    if !outer.intersects(&hole) {
        return vec![outer];
    }
    let i = outer.intersect(&hole);
    let region = |x, y, w, h| Bounds::new(ui::point(x, y), ui::size(w, h));
    [
        region(
            outer.left(),
            outer.top(),
            outer.size.width,
            i.top() - outer.top(),
        ),
        region(
            outer.left(),
            i.bottom(),
            outer.size.width,
            outer.bottom() - i.bottom(),
        ),
        region(
            outer.left(),
            i.top(),
            i.left() - outer.left(),
            i.size.height,
        ),
        region(i.right(), i.top(), outer.right() - i.right(), i.size.height),
    ]
    .into_iter()
    .filter(|r| r.size.width > px(0.) && r.size.height > px(0.))
    .collect()
}
/// Paint the visible world-space geometry. Rich paragraph glyph painting uses the app's font assets.
pub fn paint_surface(
    layout: &SurfaceLayout,
    viewport_world: Bounds<Pixels>,
    camera_origin_offset: Point<Pixels>,
    window: &mut Window,
    cx: &mut App,
) {
    let offset = TransformationMatrix::unit().translate(ui::point(
        ScaledPixels(f32::from(camera_origin_offset.x)),
        ScaledPixels(f32::from(camera_origin_offset.y)),
    ));
    for item in layout
        .visible_items()
        .filter(|item| item.bounds.intersects(&viewport_world))
    {
        item.paint(offset, window, cx);
    }
}

impl Item {
    fn paint(&self, offset: TransformationMatrix, window: &mut Window, cx: &mut App) {
        window.with_paint_transformation(offset.compose(self.transform), |window| {
            for (path, color) in &self.paths {
                if let Some(hole) = self.path_cutout {
                    for bounds in outside_rect(path.bounds, hole.ui()) {
                        window.with_local_paint_mask(ui::ContentMask { bounds }, |window| {
                            window.paint_path(path.clone(), *color);
                        });
                    }
                } else {
                    window.paint_path(path.clone(), *color);
                }
            }
            if let Some(label) = &self.label {
                if let Some((pill, color)) = label.pill {
                    window.paint_quad(ui::fill(pill.ui(), color).corner_radii(px(5.)));
                }
                let mut paint = |window: &mut Window| {
                    label
                        .layout
                        .paint_at(label.origin.ui(), &[], &[], None, window, cx);
                };
                if let Some(bounds) = self.label_clip {
                    window.with_local_paint_mask(ui::ContentMask { bounds }, paint);
                } else {
                    paint(window);
                }
            }
        });
    }
}

/// Mount a surface in the element tree, including a snapshot region per visible element.
pub fn surface_element(
    layout: Rc<SurfaceLayout>,
    viewport: Bounds<Pixels>,
    offset: Point<Pixels>,
) -> impl IntoElement {
    let mut root = div().relative().size_full();
    for (id, b) in layout.bounds().filter(|(_, b)| b.intersects(&viewport)) {
        let p = b.origin + offset;
        root = root.child(
            div()
                .absolute()
                .left(p.x)
                .top(p.y)
                .w(b.size.width)
                .h(b.size.height)
                .snapshot(format!("edgeless.surface.{id}"), None),
        );
    }
    root.child(
        canvas(
            |_, _, _| (),
            move |bounds, _, window, cx| {
                paint_surface(&layout, viewport, offset + bounds.origin, window, cx)
            },
        )
        .size_full(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use ui::{Application, HeadlessPlatform, WindowTextSystem};
    #[test]
    fn centered_shape_baselines_match_chromium_in_tall_and_short_shapes() {
        let cases: Vec<serde_json::Value> =
            serde_json::from_str(include_str!("../../../../tokens/surface-baselines.json"))
                .unwrap();
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
            cx.text_system()
                .add_fonts(vec![std::borrow::Cow::Borrowed(include_bytes!(
                    "../../../../tokens/surface-metrics-test.ttf"
                ))])
                .unwrap();
        });
        for c in cases {
            let text = RichText {
                plain: "x\nx".into(),
                delta: vec![TextDeltaOp::Insert {
                    insert: y_octo::TextInsert::Text("x\nx".into()),
                    format: None,
                }],
            };
            let e = SurfaceElement::from_properties(
                "s".into(),
                json!({"type":"shape","xywh":[0,0,240,c["height"]],"fontFamily":c["font"],"fontSize":c["fontSize"],"fontWeight":"400"}),
                text,
            );
            let b = geometry(&e).unwrap();
            let SurfaceElementKind::Shape(s) = e.kind else {
                unreachable!()
            };
            app.update(|cx| {
                let ts = WindowTextSystem::new(cx.text_system().clone());
                let mut item = Item {
                    id: e.id,
                    group: false,
                    bounds: b.ui(),
                    transform: TransformationMatrix::unit(),
                    paths: vec![],
                    label: None,
                    label_clip: None,
                    path_cutout: None,
                };
                layout_shape(&mut item, &s, 1, PlaygroundTheme::Light, &ts);
                let label = item.label.unwrap();
                assert_eq!(label.layout.lines().len(), 2);
                for (line, expected) in label
                    .layout
                    .lines()
                    .iter()
                    .zip(c["lines"].as_array().unwrap())
                {
                    let baseline = label.origin.1 + f64::from(f32::from(line.baseline_y));
                    // CoreText rounds the bundled font metrics to native fixed-point precision.
                    assert!(
                        (baseline - expected.as_f64().unwrap()).abs() < 1. / 1024.,
                        "{baseline} vs {expected}"
                    );
                }
            });
        }
    }
}
