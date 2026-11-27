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
    local_xywh: [f64; 4],
    bounds: Bounds<Pixels>,
    transform: TransformationMatrix,
    paths: Vec<(Path<Pixels>, Hsla)>,
    label: Option<Label>,
    label_clip: Option<Bounds<Pixels>>,
    path_cutout: Option<WorldBounds>,
    polyline: Vec<(f32, f32)>,
    stroke_width: f32,
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
    pub(crate) fn item_local_xywh(&self, index: usize) -> [f64; 4] {
        self.items[index].local_xywh
    }
    pub(crate) fn item_polyline(&self, index: usize) -> &[(f32, f32)] {
        &self.items[index].polyline
    }
    pub(crate) fn item_stroke_width(&self, index: usize) -> f32 {
        self.items[index].stroke_width
    }

    pub(crate) fn paint_item(
        &self,
        index: usize,
        viewport: Bounds<Pixels>,
        editing_label_id: Option<&str>,
        window: &mut Window,
        cx: &mut App,
    ) {
        let item = &self.items[index];
        if (!item.group || self.show_group_frames) && item.bounds.intersects(&viewport) {
            let suppress_label = editing_label_id.is_some_and(|id| id == item.id);
            item.paint(TransformationMatrix::unit(), suppress_label, window, cx);
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
            gfx_per_delta_rtl: true,
            ..RichParagraphStyle::from_theme(theme.mode())
        };
        let mut face = ui::font(style.font_family.clone());
        face.weight = style.base_weight;
        face.fallbacks = Some(crate::default_font_fallbacks());
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

pub fn layout_surface(
    elements: &[SurfaceElement],
    external_bounds: &BTreeMap<String, WorldBounds>,
    theme: PlaygroundTheme,
    window: &Window,
) -> SurfaceLayout {
    layout_surface_in_doc(None, elements, external_bounds, theme, window)
}

pub(crate) fn layout_surface_in_doc(
    doc_root: Option<&blocksuite_playground_doc::read::BlockNode>,
    elements: &[SurfaceElement],
    external_bounds: &BTreeMap<String, WorldBounds>,
    theme: PlaygroundTheme,
    window: &Window,
) -> SurfaceLayout {
    let (mut bounds, collapsed_hidden) =
        super::mindmap::resolve_surface_element_bounds(elements, external_bounds);
    let mut ordered: Vec<_> = elements
        .iter()
        .filter(|e| !e.hidden && !collapsed_hidden.contains(&e.id))
        .collect();
    if let Some(root) = doc_root {
        let layers = crate::edgeless::Layers::from_root(root);
        ordered.sort_by(|a, b| layers.cmp_ids(&a.id, &b.id));
    } else {
        super::sort_surface_elements_hierarchically(elements, &mut ordered);
    }
    let lookup: BTreeMap<&str, &SurfaceElement> =
        elements.iter().map(|e| (e.id.as_str(), e)).collect();
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
    bounds.extend(routes.iter().map(|(id, r)| {
        let half = lookup
            .get(id)
            .and_then(|e| match &e.kind {
                SurfaceElementKind::Connector(c) => Some((c.stroke_width * 0.5).max(0.5)),
                _ => None,
            })
            .unwrap_or(0.5);
        (id.to_string(), super::extent(&r.samples).expand(half))
    }));
    let mut items = vec![];
    for e in ordered {
        let region = match &e.kind {
            SurfaceElementKind::Group { children, .. } => {
                strokes::group_bounds(children, &lookup, &bounds).map(|b| b.expand(12.))
            }
            SurfaceElementKind::Mindmap(mm) => mm
                .nodes
                .keys()
                .filter(|id| !collapsed_hidden.contains(*id))
                .filter_map(|id| bounds.get(id).copied())
                .reduce(WorldBounds::union)
                .map(|b| b.expand(12.)),
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
            local_xywh: b.xywh,
            bounds: if rotate_locally {
                b.ui()
            } else {
                b.aabb().ui()
            },
            paths: vec![],
            label: None,
            label_clip: None,
            path_cutout: None,
            polyline: vec![],
            stroke_width: 0.0,
        };
        match &e.kind {
            SurfaceElementKind::Shape(s) => {
                let mut resolved_shape;
                let shape_ref = if let Some(override_b) = bounds.get(&e.id)
                    && override_b.xywh != s.xywh
                {
                    resolved_shape = s.clone();
                    resolved_shape.xywh = override_b.xywh;
                    &resolved_shape
                } else {
                    s
                };
                layout_shape(&mut item, shape_ref, e.seed, theme, window.text_system())
            }
            SurfaceElementKind::Connector(c) => {
                let Some(route) = routes.get(e.id.as_str()) else {
                    continue;
                };
                item.polyline = route
                    .samples
                    .iter()
                    .map(|p| (p.0 as f32, p.1 as f32))
                    .collect();
                item.stroke_width = c.stroke_width as f32;
                layout_connector(&mut item, c, route, e.seed, theme, window);
            }
            SurfaceElementKind::Mindmap(mm) => {
                for conn in super::mindmap::mindmap_connectors(mm, &bounds) {
                    if let Some(route) = connector::route(&conn, &bounds, &shapes) {
                        layout_connector(&mut item, &conn, &route, e.seed, theme, window);
                    }
                }
            }
            SurfaceElementKind::Brush(s) | SurfaceElementKind::Highlighter(s) => {
                let half = (s.line_width * 0.5).max(0.5);
                item.bounds = b.aabb().expand(half).ui();
                let [x, y, w, h] = s.xywh;
                let cx = x + w * 0.5;
                let cy = y + h * 0.5;
                let (sin, cos) = e.rotate.to_radians().sin_cos();
                item.polyline = s
                    .points
                    .iter()
                    .map(|p| {
                        let dx = (x + p[0]) - cx;
                        let dy = (y + p[1]) - cy;
                        (
                            (cx + dx * cos - dy * sin) as f32,
                            (cy + dx * sin + dy * cos) as f32,
                        )
                    })
                    .collect();
                item.stroke_width = s.line_width as f32;
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
                let [x, y, w, _] = b.xywh;
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
    if s.text_display
        && let Some((layout, gap)) = style.layout(&s.text, w - 2. * px, theme, ts)
    {
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
        item.paint(offset, false, window, cx);
    }
}

/// Paint all visible items of `layout` under an arbitrary world-to-screen `matrix`
/// (shared by `SurfaceRef` frame thumbnails in `BlockFlow`).
pub(crate) fn paint_surface_transformed(
    layout: &SurfaceLayout,
    matrix: TransformationMatrix,
    window: &mut Window,
    cx: &mut App,
) {
    for item in layout.visible_items() {
        item.paint(matrix, false, window, cx);
    }
}

impl Item {
    fn paint(
        &self,
        offset: TransformationMatrix,
        suppress_label: bool,
        window: &mut Window,
        cx: &mut App,
    ) {
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
            if !suppress_label && let Some(label) = &self.label {
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
            serde_json::from_str(include_str!("../../../oracle/surface-baselines.json")).unwrap();
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
            cx.text_system()
                .add_fonts(vec![std::borrow::Cow::Borrowed(include_bytes!(
                    "../../../oracle/surface-metrics-test.ttf"
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
            let SurfaceElementKind::Shape(s) = e.kind else {
                unreachable!()
            };
            let b = WorldBounds {
                xywh: s.xywh,
                rotate: e.rotate,
            };
            app.update(|cx| {
                let ts = WindowTextSystem::new(cx.text_system().clone());
                let mut item = Item {
                    id: e.id,
                    group: false,
                    local_xywh: s.xywh,
                    bounds: b.ui(),
                    transform: TransformationMatrix::unit(),
                    paths: vec![],
                    label: None,
                    label_clip: None,
                    path_cutout: None,
                    polyline: vec![],
                    stroke_width: 0.0,
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

    #[test]
    fn surface_label_visibility_and_text_connector_baselines() {
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let text = RichText {
            plain: "Hidden".into(),
            delta: vec![TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text("Hidden".into()),
                format: None,
            }],
        };
        let hidden = SurfaceElement::from_properties(
            "s-hidden".into(),
            json!({"type":"shape","xywh":[0,0,160,80],"textDisplay":false}),
            text.clone(),
        );
        let standalone = SurfaceElement::from_properties(
            "t-standalone".into(),
            json!({"type":"text","xywh":[10,20,160,30],"fontSize":16}),
            text.clone(),
        );
        let conn = SurfaceElement::from_properties(
            "c-label".into(),
            json!({"type":"connector","mode":0,"source":{"position":[0,100]},"target":{"position":[200,100]},"labelOffset":{"distance":0.5,"anchor":"center"}}),
            text,
        );
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let SurfaceElementKind::Shape(mut s) = hidden.kind else {
                unreachable!()
            };
            // `textDisplay` is `@local()` (defaults to `true` from wire); toggle locally to verify suppression.
            assert!(s.text_display);
            s.text_display = false;
            let mut item = Item {
                id: hidden.id,
                group: false,
                local_xywh: s.xywh,
                bounds: Bounds::default(),
                transform: TransformationMatrix::unit(),
                paths: vec![],
                label: None,
                label_clip: None,
                path_cutout: None,
                polyline: vec![],
                stroke_width: 0.0,
            };
            layout_shape(&mut item, &s, 1, PlaygroundTheme::Light, &ts);
            assert!(
                item.label.is_none(),
                "textDisplay=false must skip shape label"
            );

            // Standalone SurfaceText baseline sits at y + ascent (0 line_gap offset).
            let SurfaceElementKind::Text(st) = standalone.kind else {
                unreachable!()
            };
            let style = TextStyle {
                color: &st.color,
                font: &st.font_family,
                size: st.font_size,
                weight: &st.font_weight,
                slant: &st.font_style,
                align: st.text_align,
            };
            let (layout, _) = style
                .layout(&st.text, st.xywh[2], PlaygroundTheme::Light, &ts)
                .unwrap();
            let line = &layout.lines()[0];
            assert!(f32::from(line.baseline_y) > 0.0);

            // Connector label vertical centering around route midpoint y = 100.
            let SurfaceElementKind::Connector(c) = conn.kind else {
                unreachable!()
            };
            let r = connector::route(&c, &BTreeMap::new(), &BTreeMap::new()).unwrap();
            let mid = r.point_at_distance(c.mode, 0.5);
            assert_eq!(mid, P(100., 100.));
        });
    }

    #[test]
    fn equal_index_shapes_paint_in_source_order_z_under_a() {
        let platform = HeadlessPlatform::new(120, 120, 1.);
        let app = Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let z = SurfaceElement::from_properties(
            "z".into(),
            json!({"type":"shape","shapeType":"rect","index":"a1","xywh":[10,10,80,80],"filled":true,"fillColor":"#ff0000","strokeStyle":"none"}),
            RichText::default(),
        );
        let a = SurfaceElement::from_properties(
            "a".into(),
            json!({"type":"shape","shapeType":"rect","index":"a1","xywh":[10,10,80,80],"filled":true,"fillColor":"#0000ff","strokeStyle":"none"}),
            RichText::default(),
        );
        let elements = vec![z, a];
        let win = app
            .update(|cx| {
                cx.open_window(ui::WindowOptions::default(), |_window, cx| {
                    cx.new(|_| SurfaceOrderView {
                        elements: elements.clone(),
                    })
                })
            })
            .unwrap();
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();
        let img = app
            .update(|cx| win.update(cx, |_, window, _| window.render_to_image().unwrap()))
            .unwrap();
        let px_rgba = img.get_pixel(50, 50);
        let [r, g, b, _] = px_rgba.0;
        assert!(
            b > 200 && r < 40 && g < 40,
            "expected 'a' (blue) on top of 'z' (red), got rgb=({r},{g},{b})"
        );
    }

    #[test]
    fn gfx_shape_per_delta_rtl_shapes_arabic_indic_prefix_rtl_while_keeping_ltr_deltas() {
        let platform = HeadlessPlatform::new(64, 64, 1.);
        let app = Application::with_platform(platform).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let make_shape = |delta: Vec<TextDeltaOp>| {
            let plain: String = delta
                .iter()
                .map(|op| match op {
                    TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(s),
                        ..
                    } => s.as_str(),
                    _ => "",
                })
                .collect();
            SurfaceElement::from_properties(
                "s-rtl".into(),
                json!({"type":"shape","xywh":[0,0,220,80],"fontSize":16,"textAlign":"left"}),
                RichText { plain, delta },
            )
        };
        // "\u{0661}!" (Arabic-Indic digit 1 + neutral '!') triggers `RE_RTL_CHECK == true`
        // (`\u{0661}` is in `\u0591-\u07FF`), setting paragraph embedding level 1 (RTL) so
        // trailing neutral `'!'` resolves to level 1 on the LEFT of `\u{0661}` (`!١`). Under
        // UAX #9 `AutoFirstStrong` (`gfx_per_delta_rtl = false`), neither char is strong so P3
        // defaults to level 0 (LTR) with `'!'` on the RIGHT (`١!`).
        let rtl_elem = make_shape(vec![TextDeltaOp::Insert {
            insert: y_octo::TextInsert::Text("\u{0661}!".into()),
            format: None,
        }]);
        let multi_elem = make_shape(vec![
            TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text("Hi ".into()),
                format: None,
            },
            TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text("\u{0661}!".into()),
                format: Some(y_octo::TextAttributes::from([(
                    "bold".into(),
                    y_octo::Any::True,
                )])),
            },
        ]);
        app.update(|cx| {
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let SurfaceElementKind::Shape(s) = rtl_elem.kind else {
                unreachable!()
            };
            let style = TextStyle {
                color: &s.color,
                font: &s.font_family,
                size: s.font_size,
                weight: &s.font_weight,
                slant: &s.font_style,
                align: s.text_align,
            };
            let (gfx_layout, _) = style
                .layout(&s.text, 200.0, PlaygroundTheme::Light, &ts)
                .unwrap();
            let mut uax9_style =
                crate::rich_text::RichParagraphStyle::from_theme(PlaygroundTheme::Light.mode());
            uax9_style.font_size = 16.0;
            uax9_style.gfx_per_delta_rtl = false;
            let uax9_layout = crate::rich_text::RichParagraph::from_delta(s.text.delta.clone())
                .unwrap()
                .layout(&ts, &uax9_style, 200.0);
            let caret_x = |p: &crate::rich_text::LaidOutRichParagraph, off: u64| {
                f32::from(
                    p.caret_line_and_x(crate::rich_text::CaretPosition {
                        utf16_offset: off,
                        affinity: crate::rich_text::WrapAffinity::Downstream,
                    })
                    .1,
                )
            };
            let bang_x_in_gfx = caret_x(&gfx_layout, 1);
            let start_x_in_gfx = caret_x(&gfx_layout, 0);
            let bang_x_in_uax9 = caret_x(&uax9_layout, 1);
            let start_x_in_uax9 = caret_x(&uax9_layout, 0);
            assert!(
                start_x_in_gfx > 0.0 && start_x_in_uax9 == 0.0 && bang_x_in_uax9 > 0.0,
                "gfx RE_RTL_CHECK must shape '\\u{{0661}}!' with RTL paragraph level (start_x={start_x_in_gfx}, bang_x={bang_x_in_gfx}) vs UAX#9 LTR (start_x={start_x_in_uax9}, bang_x={bang_x_in_uax9})"
            );

            // Multi-delta: first delta "Hi " stays LTR on the left (`x == 0`),
            // while second delta "\u{0661}!" shapes independently with RTL paragraph level.
            let SurfaceElementKind::Shape(ms) = multi_elem.kind else {
                unreachable!()
            };
            let (multi_layout, _) = style
                .layout(&ms.text, 200.0, PlaygroundTheme::Light, &ts)
                .unwrap();
            let multi_uax9 = crate::rich_text::RichParagraph::from_delta(ms.text.delta.clone())
                .unwrap()
                .layout(&ts, &uax9_style, 200.0);
            assert_eq!(caret_x(&multi_layout, 0), 0.0);
            assert!(
                caret_x(&multi_layout, 3) > caret_x(&multi_uax9, 3),
                "second delta '\\u{{0661}}!' inside LTR line must shape with RTL base direction independently"
            );
        });
    }

    struct SurfaceOrderView {
        elements: Vec<SurfaceElement>,
    }

    impl ui::Render for SurfaceOrderView {
        fn render(&mut self, window: &mut Window, _: &mut ui::Context<Self>) -> impl IntoElement {
            let layout = layout_surface(
                &self.elements,
                &BTreeMap::new(),
                PlaygroundTheme::Light,
                window,
            );
            surface_element(
                Rc::new(layout),
                Bounds::new(ui::point(px(0.), px(0.)), ui::size(px(120.), px(120.))),
                ui::point(px(0.), px(0.)),
            )
        }
    }
}
