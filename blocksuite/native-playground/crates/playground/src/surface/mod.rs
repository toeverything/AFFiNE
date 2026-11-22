//! World-space geometry and paint layout for BlockSuite surface elements.
mod connector;
#[cfg(test)]
mod oracle;
mod orthogonal;
mod paint;
mod rough;
mod shapes;
mod strokes;

pub use paint::{SurfaceLayout, layout_surface, paint_surface, surface_element};
use ui::{Bounds, Pixels, Point, point, px, size};

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
    fn expand(self, m: f64) -> Self {
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
