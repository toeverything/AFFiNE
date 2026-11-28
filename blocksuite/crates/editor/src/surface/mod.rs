//! World-space geometry and paint layout for BlockSuite surface elements.
mod connector;
pub mod mindmap;
#[cfg(test)]
mod oracle;
mod orthogonal;
mod paint;
mod rough;
pub mod rtl;
mod shapes;
mod strokes;

pub use connector::{preview_connector_polyline, preview_curve_cubic};
pub use mindmap::{
    MindmapTree, MindmapTreeNode, build_mindmap_tree, collapsed_descendant_ids,
    compute_mindmap_layout, mindmap_connectors, resolve_surface_element_bounds,
};
pub use paint::{SurfaceLayout, layout_surface, paint_surface, surface_element};
pub(crate) use paint::{layout_surface_in_doc, paint_surface_transformed};
pub use rtl::is_gfx_text_rtl;
use ui::{Bounds, Pixels, Point, point, px, size};

/// Resolves layout bounds for all visible surface elements, including mindmap-positioned
/// child nodes and routed connector polylines (so bound endpoint `[u, v]` port ratios are
/// never mistaken for world-space coordinates near the origin).
pub(crate) fn resolve_surface_scene_bounds(
    elements: &[blocksuite_playground_doc::read::SurfaceElement],
    external_bounds: &std::collections::BTreeMap<String, WorldBounds>,
) -> (
    std::collections::BTreeMap<String, WorldBounds>,
    std::collections::BTreeSet<String>,
) {
    let (mut bounds, collapsed_hidden) = resolve_surface_element_bounds(elements, external_bounds);
    let shapes: std::collections::BTreeMap<&str, blocksuite_playground_doc::read::ShapeType> =
        elements
            .iter()
            .filter_map(|e| match &e.kind {
                blocksuite_playground_doc::read::SurfaceElementKind::Shape(s) => {
                    Some((e.id.as_str(), s.shape_type))
                }
                _ => None,
            })
            .collect();
    for e in elements
        .iter()
        .filter(|e| !e.hidden && !collapsed_hidden.contains(&e.id))
    {
        match &e.kind {
            blocksuite_playground_doc::read::SurfaceElementKind::Connector(c) => {
                if let Some(route) = connector::route(c, &bounds, &shapes) {
                    let half = (c.stroke_width * 0.5).max(0.5);
                    bounds.insert(e.id.clone(), extent(&route.samples).expand(half));
                }
            }
            blocksuite_playground_doc::read::SurfaceElementKind::Brush(s)
            | blocksuite_playground_doc::read::SurfaceElementKind::Highlighter(s) => {
                let half = (s.line_width * 0.5).max(0.5);
                bounds.insert(
                    e.id.clone(),
                    WorldBounds {
                        xywh: s.xywh,
                        rotate: e.rotate,
                    }
                    .aabb()
                    .expand(half),
                );
            }
            _ => {}
        }
    }
    (bounds, collapsed_hidden)
}

/// Sorts surface elements in hierarchical z-order matching `edgeless::order::Layers`:
/// every `Group` / `Mindmap` container sits at its own `index` relative to sibling
/// elements, while its member nodes immediately follow it (painting above mindmap branch
/// connectors without lifting earlier unrelated shapes above later mindmap branches).
pub(super) fn sort_surface_elements_hierarchically<'a>(
    all_elements: &'a [blocksuite_playground_doc::read::SurfaceElement],
    ordered: &mut [&'a blocksuite_playground_doc::read::SurfaceElement],
) {
    use blocksuite_playground_doc::read::SurfaceElementKind;
    let mut indices = std::collections::BTreeMap::new();
    let mut parents: std::collections::BTreeMap<&'a str, &'a str> =
        std::collections::BTreeMap::new();
    let set_parent = |parents: &mut std::collections::BTreeMap<&'a str, &'a str>,
                      id: &'a str,
                      parent: &'a str| {
        let mut anc = parent;
        loop {
            if anc == id {
                return;
            }
            match parents.get(anc) {
                Some(next) => anc = next,
                None => break,
            }
        }
        parents.entry(id).or_insert(parent);
    };
    for e in all_elements {
        indices.insert(e.id.as_str(), e.index.as_str());
        match &e.kind {
            SurfaceElementKind::Group { children, .. } => {
                for child in children {
                    set_parent(&mut parents, child.as_str(), e.id.as_str());
                }
            }
            SurfaceElementKind::Mindmap(mm) => {
                for child in mm.nodes.keys() {
                    set_parent(&mut parents, child.as_str(), e.id.as_str());
                }
            }
            _ => {}
        }
    }
    let path_of = |mut id: &'a str| {
        let mut path = vec![id];
        while let Some(&p) = parents.get(id) {
            path.push(p);
            id = p;
        }
        path.reverse();
        path
    };
    ordered.sort_by(|a, b| {
        let pa = path_of(a.id.as_str());
        let pb = path_of(b.id.as_str());
        for (&l, &r) in pa.iter().zip(&pb) {
            if l != r {
                return indices
                    .get(l)
                    .copied()
                    .unwrap_or("a0")
                    .cmp(indices.get(r).copied().unwrap_or("a0"));
            }
        }
        pa.len().cmp(&pb.len())
    });
}

/// Returns `true` when any routed branch connector of `mindmap` intersects `(fx, fy, fw, fh)`.
pub(crate) fn mindmap_intersects_rect(
    mindmap: &blocksuite_playground_doc::read::SurfaceMindmap,
    bounds: &std::collections::BTreeMap<String, WorldBounds>,
    shapes: &std::collections::BTreeMap<&str, blocksuite_playground_doc::read::ShapeType>,
    frect: (f32, f32, f32, f32),
) -> bool {
    mindmap_connectors(mindmap, bounds)
        .iter()
        .any(|conn| connector_intersects_rect(conn, bounds, shapes, frect))
}

/// Returns `true` when the routed polyline of `connector` (resolved against `bounds` and `shapes`)
/// has at least one segment intersecting the world-space axis-aligned rectangle `(fx, fy, fw, fh)`.
pub(crate) fn connector_intersects_rect(
    connector: &blocksuite_playground_doc::read::SurfaceConnector,
    bounds: &std::collections::BTreeMap<String, WorldBounds>,
    shapes: &std::collections::BTreeMap<&str, blocksuite_playground_doc::read::ShapeType>,
    (fx, fy, fw, fh): (f32, f32, f32, f32),
) -> bool {
    let Some(route) = connector::route(connector, bounds, shapes) else {
        return false;
    };
    let (x0, y0, x1, y1) = (
        f64::from(fx),
        f64::from(fy),
        f64::from(fx + fw),
        f64::from(fy + fh),
    );
    route
        .samples
        .windows(2)
        .any(|seg| segment_intersects_aabb(seg[0], seg[1], x0, y0, x1, y1))
}

fn segment_intersects_aabb(a: P, b: P, x0: f64, y0: f64, x1: f64, y1: f64) -> bool {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let (mut t0, mut t1) = (0.0_f64, 1.0_f64);
    for (p, q) in [
        (-dx, a.0 - x0),
        (dx, x1 - a.0),
        (-dy, a.1 - y0),
        (dy, y1 - a.1),
    ] {
        if p.abs() < 1e-12 {
            if q < 0.0 {
                return false;
            }
        } else {
            let r = q / p;
            if p < 0.0 {
                t0 = t0.max(r);
            } else {
                t1 = t1.min(r);
            }
            if t0 > t1 {
                return false;
            }
        }
    }
    true
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WorldBounds {
    pub xywh: [f64; 4],
    pub rotate: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct P(f64, f64);
impl P {
    fn add(self, p: Self) -> Self {
        Self(self.0 + p.0, self.1 + p.1)
    }
    fn sub(self, p: Self) -> Self {
        Self(self.0 - p.0, self.1 - p.1)
    }
    fn scale(self, k: f64) -> Self {
        Self(self.0 * k, self.1 * k)
    }
    fn length(self) -> f64 {
        self.0.hypot(self.1)
    }
    fn unit(self) -> Self {
        self.scale(1. / self.length().max(1e-12))
    }
    fn rotate(self, degrees: f64) -> Self {
        let (s, c) = degrees.to_radians().sin_cos();
        Self(c * self.0 - s * self.1, s * self.0 + c * self.1)
    }
    fn ui(self) -> Point<Pixels> {
        point(px(self.0 as f32), px(self.1 as f32))
    }
    fn lerp(self, q: Self, t: f64) -> Self {
        self.add(q.sub(self).scale(t))
    }
}
impl WorldBounds {
    fn at(self, nx: f64, ny: f64) -> P {
        let [x, y, w, h] = self.xywh;
        P(x + w / 2., y + h / 2.).add(P((nx - 0.5) * w, (ny - 0.5) * h).rotate(self.rotate))
    }
    pub(crate) fn aabb(self) -> Self {
        extent(&[
            self.at(0., 0.),
            self.at(1., 0.),
            self.at(1., 1.),
            self.at(0., 1.),
        ])
    }
    fn contains(self, p: P, tolerance: f64) -> bool {
        let [x, y, w, h] = self.xywh;
        p.0 > x + tolerance
            && p.0 < x + w - tolerance
            && p.1 > y + tolerance
            && p.1 < y + h - tolerance
    }
    pub(crate) fn expand(self, m: f64) -> Self {
        let [x, y, w, h] = self.xywh;
        Self {
            xywh: [x - m, y - m, w + 2. * m, h + 2. * m],
            rotate: 0.,
        }
    }
    fn union(self, b: Self) -> Self {
        let a = self.aabb();
        let b = b.aabb();
        extent(&[a.at(0., 0.), a.at(1., 1.), b.at(0., 0.), b.at(1., 1.)])
    }
    pub(crate) fn ui(self) -> Bounds<Pixels> {
        let [x, y, w, h] = self.xywh;
        Bounds::new(P(x, y).ui(), size(px(w as f32), px(h as f32)))
    }
}
// ECMAScript toFixed(2) rounds a tie away from zero. FMA preserves the
// residual when multiplying by 100 rounded the exact product to a half.
fn hundredths(x: f64) -> f64 {
    let a = x.abs();
    let product = a * 100.;
    let rounded = if product.fract() == 0.5 && a.mul_add(100., -product) < 0. {
        product.floor()
    } else {
        product.round()
    };
    (rounded / 100.).copysign(x)
}
fn extent(points: &[P]) -> WorldBounds {
    let Some(&P(mut x, mut y)) = points.first() else {
        return WorldBounds::default();
    };
    let (mut right, mut bottom) = (x, y);
    for &P(px, py) in points {
        x = x.min(px);
        y = y.min(py);
        right = right.max(px);
        bottom = bottom.max(py);
    }
    WorldBounds {
        xywh: [x, y, right - x, bottom - y],
        rotate: 0.,
    }
}
/// Contours retain the Bézier controls until GPU path tessellation.
#[derive(Clone, Copy, Debug)]
enum Edge {
    Line(P),
    Quad(P, P),
    Cubic(P, P, P),
}
struct Contour {
    start: P,
    edges: Vec<Edge>,
    closed: bool,
}
impl Contour {
    fn polygon(points: &[P], closed: bool) -> Self {
        Self {
            start: points[0],
            edges: points.iter().skip(1).copied().map(Edge::Line).collect(),
            closed,
        }
    }
    fn emit(&self, b: &mut ui::PathBuilder) {
        b.move_to(self.start.ui());
        for &e in &self.edges {
            match e {
                Edge::Quad(c, p) => b.curve_to(p.ui(), c.ui()),
                Edge::Line(p) => b.line_to(p.ui()),
                Edge::Cubic(c, d, p) => b.cubic_bezier_to(p.ui(), c.ui(), d.ui()),
            }
        }
        if self.closed {
            b.close();
        }
    }
    fn mapped(mut self, f: impl Fn(P) -> P) -> Self {
        self.start = f(self.start);
        for e in &mut self.edges {
            *e = match *e {
                Edge::Quad(c, p) => Edge::Quad(f(c), f(p)),
                Edge::Line(p) => Edge::Line(f(p)),
                Edge::Cubic(c, d, p) => Edge::Cubic(f(c), f(d), f(p)),
            }
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn union_encloses_all_corners_of_rotated_rectangles() {
        let a = WorldBounds {
            xywh: [-10., -10., 20., 20.],
            rotate: 45.,
        };
        let b = WorldBounds {
            xywh: [28., 10., 20., 4.],
            rotate: 90.,
        };
        let radius = 10. * 2.0_f64.sqrt();
        for r in [a.union(b), b.union(a)] {
            let expected = [-radius, -radius, 40. + radius, 22. + radius];
            assert_eq!(r.rotate, 0.);
            for (v, expected) in r.xywh.into_iter().zip(expected) {
                assert!((v - expected).abs() < 1e-9, "{:?}", r.xywh);
            }
        }
    }
}
