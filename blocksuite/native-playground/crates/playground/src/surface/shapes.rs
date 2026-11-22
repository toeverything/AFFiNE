use super::{Contour, Edge, P, WorldBounds};
use blocksuite_playground_doc::read::{ShapeType, SurfaceShape};
const K: f64 = 0.5522847498;

pub(super) fn outline(shape: &SurfaceShape) -> Contour {
    let [x, y, w, h] = shape.xywh;
    let inset = (shape.stroke_width / 2.).max(0.).min(w.min(h).max(0.) / 2.);
    let w = (w - 2. * inset).max(0.);
    let h = (h - 2. * inset).max(0.);
    let radius = if shape.radius < 1. {
        shape.radius * w.min(h)
    } else {
        shape.radius
    };
    let contour = match shape.shape_type {
        ShapeType::Triangle => Contour::polygon(&[P(w / 2., 0.), P(w, h), P(0., h)], true),
        ShapeType::Diamond => Contour::polygon(
            &[P(w / 2., 0.), P(w, h / 2.), P(w / 2., h), P(0., h / 2.)],
            true,
        ),
        ShapeType::Ellipse => rounded(w, h, w / 2., h / 2.),
        ShapeType::Rect => {
            let r = radius.max(0.).min(w.min(h) / 2.);
            rounded(w, h, r, r)
        }
    };
    contour.mapped(|p| p.add(P(x + inset, y + inset)))
}
pub(super) fn box_outline(bounds: WorldBounds, r: f64) -> Contour {
    let [x, y, w, h] = bounds.xywh;
    rounded(w, h, r, r).mapped(|p| p.add(P(x, y)))
}
pub(super) fn rounded(w: f64, h: f64, rx: f64, ry: f64) -> Contour {
    if rx == 0. || ry == 0. {
        return Contour::polygon(&[P(0., 0.), P(w, 0.), P(w, h), P(0., h)], true);
    }
    rounded_cubics(w, h, rx, ry)
}
pub(super) fn rounded_cubics(w: f64, h: f64, rx: f64, ry: f64) -> Contour {
    let k = 1. - K;
    Contour {
        start: P(rx, 0.),
        closed: true,
        edges: vec![
            Edge::Line(P(w - rx, 0.)),
            Edge::Cubic(P(w - k * rx, 0.), P(w, k * ry), P(w, ry)),
            Edge::Line(P(w, h - ry)),
            Edge::Cubic(P(w, h - k * ry), P(w - k * rx, h), P(w - rx, h)),
            Edge::Line(P(rx, h)),
            Edge::Cubic(P(k * rx, h), P(0., h - k * ry), P(0., h - ry)),
            Edge::Line(P(0., ry)),
            Edge::Cubic(P(0., k * ry), P(k * rx, 0.), P(rx, 0.)),
        ],
    }
}
