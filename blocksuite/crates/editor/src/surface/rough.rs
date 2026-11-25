use super::{Contour, Edge, P, shapes};
use blocksuite_playground_doc::read::{ShapeType, StrokeStyle, SurfaceShape};
use ui::PathBuilder;

struct Random(i32);
impl Random {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(48271) & 0x7fff_ffff;
        f64::from(self.0) / 2_147_483_648.
    }
    fn offset(&mut self, m: f64) -> f64 {
        (self.next() * 2. - 1.) * m
    }
    fn jitter(&mut self, p: P, m: f64) -> P {
        p.add(P(self.offset(m), self.offset(m)))
    }
    fn line(&mut self, b: &mut Vec<Contour>, a: P, z: P, roughness: f64) {
        let v = z.sub(a);
        let len = v.length();
        let gain = if len < 200. {
            1.
        } else if len > 500. {
            0.4
        } else {
            -0.0016668 * len + 1.233334
        };
        let gain = gain * roughness;
        for overlay in [1., 0.5] {
            let divergence = 0.2 + self.next() * 0.2;
            let bow = P(
                self.offset(gain * v.1 / 100.),
                self.offset(-gain * v.0 / 100.),
            );
            let off = (len / 10.).min(2.) * gain * overlay;
            let start = self.jitter(a, off);
            let c = self.jitter(a.add(v.scale(divergence)).add(bow), off);
            let d = self.jitter(a.add(v.scale(2. * divergence)).add(bow), off);
            b.push(Contour {
                start,
                edges: vec![Edge::Cubic(c, d, self.jitter(z, off))],
                closed: false,
            });
        }
    }
    fn cubic(&mut self, b: &mut Vec<Contour>, a: P, edge: [P; 3], roughness: f64) {
        let [c, d, z] = edge;
        for (i, r) in [2., 2.3].into_iter().enumerate() {
            let start = if i == 0 {
                a
            } else {
                self.jitter(a, 2. * roughness)
            };
            let end = self.jitter(z, r * roughness);
            b.push(Contour {
                start,
                edges: vec![Edge::Cubic(
                    self.jitter(c, r * roughness),
                    self.jitter(d, r * roughness),
                    end,
                )],
                closed: false,
            });
        }
    }
}
pub(super) fn emit(contour: &Contour, b: &mut PathBuilder, seed: i32, roughness: f64) {
    let mut rng = Random(if seed == 0 { 1 } else { seed });
    let mut out = vec![];
    trace(
        contour,
        &mut out,
        &mut rng,
        roughness,
        matches!(contour.edges.first(), Some(Edge::Cubic(..))),
    );
    for path in out {
        path.emit(b);
    }
}
fn trace(contour: &Contour, b: &mut Vec<Contour>, rng: &mut Random, roughness: f64, svg: bool) {
    if svg {
        b.push(Contour {
            start: rng.jitter(contour.start, 2. * roughness),
            edges: vec![],
            closed: false,
        });
    }
    let mut a = contour.start;
    for &e in &contour.edges {
        a = match e {
            Edge::Quad(c, z) => {
                rng.cubic(b, a, [a.lerp(c, 2. / 3.), z.lerp(c, 2. / 3.), z], roughness);
                z
            }
            Edge::Line(z) => {
                rng.line(b, a, z, roughness);
                z
            }
            Edge::Cubic(c, d, z) => {
                rng.cubic(b, a, [c, d, z], roughness);
                z
            }
        }
    }
    if contour.closed {
        rng.line(b, a, contour.start, roughness);
    }
}
fn curve(points: &[P]) -> Contour {
    let edges = points
        .windows(4)
        .map(|p| {
            Edge::Cubic(
                p[1].add(p[2].sub(p[0]).scale(1. / 6.)),
                p[2].add(p[1].sub(p[3]).scale(1. / 6.)),
                p[2],
            )
        })
        .collect();
    Contour {
        start: points[1],
        edges,
        closed: false,
    }
}
/// RoughJS curveFitting=1 ellipse. Even the two zero radius offsets consume
/// random samples; keeping those draws preserves the seeded outline.
fn ellipse(w: f64, h: f64, rng: &mut Random, roughness: f64) -> (Vec<Contour>, Vec<P>) {
    use std::f64::consts::{FRAC_PI_2, TAU};
    let (rx, ry) = (w * 0.5, h * 0.5);
    let center = P(rx, ry);
    let steps = (9. * (TAU * ((rx * rx + ry * ry) / 2.).sqrt() / 200.).sqrt())
        .max(9.)
        .ceil();
    let increment = TAU / steps.min(4096.);
    rng.next();
    rng.next();
    let upper = roughness * (0.4 + rng.next() * 0.6);
    let first_overlap = increment * roughness * (0.1 + rng.next() * (upper - 0.1));
    if roughness == 0. {
        let increment = increment / 4.;
        let sample = |a: f64| center.add(P(rx * a.cos(), ry * a.sin()));
        let mut points = vec![sample(-increment)];
        let mut angle = 0.;
        while angle <= TAU {
            points.push(sample(angle));
            angle += increment;
        }
        let estimated = points[1..].to_vec();
        points.extend([sample(0.), sample(increment)]);
        return (vec![curve(&points)], estimated);
    }
    let mut contours = vec![];
    let mut estimated = vec![];
    for (offset, overlap) in [(1., first_overlap), (1.5, 0.)] {
        let start = rng.offset(0.5 * roughness) - FRAC_PI_2;
        let mut sample = |angle: f64, factor: f64| {
            let (s, c) = angle.sin_cos();
            rng.jitter(P(rx * c * factor, ry * s * factor), offset * roughness)
                .add(center)
        };
        let mut points = vec![sample(start - increment, 0.9)];
        let mut angle = start;
        while angle < start + TAU - 0.01 {
            points.push(sample(angle, 1.));
            angle += increment;
        }
        if offset == 1. {
            estimated.extend_from_slice(&points[1..]);
        }
        points.extend([
            sample(start + TAU + overlap * 0.5, 1.),
            sample(start + overlap, 0.98),
            sample(start + overlap * 0.5, 0.9),
        ]);
        contours.push(curve(&points));
    }
    (contours, estimated)
}

fn sample_cubic([a, b, c, d]: [P; 4], out: &mut Vec<P>) {
    let u = b.scale(3.).sub(a.scale(2.)).sub(d);
    let v = c.scale(3.).sub(d.scale(2.)).sub(a);
    if u.0.powi(2).max(v.0.powi(2)) + u.1.powi(2).max(v.1.powi(2)) < 1. {
        if out.last().is_none_or(|p| a.sub(*p).length() > 1.) {
            out.push(a);
        }
        out.push(d);
    } else {
        let ab = a.lerp(b, 0.5);
        let bc = b.lerp(c, 0.5);
        let cd = c.lerp(d, 0.5);
        let left = ab.lerp(bc, 0.5);
        let right = bc.lerp(cd, 0.5);
        let middle = left.lerp(right, 0.5);
        sample_cubic([a, ab, left, middle], out);
        sample_cubic([middle, right, cd, d], out);
    }
}
fn simplify(vertices: &[P], distance: f64, out: &mut Vec<P>) {
    let a = vertices[0];
    let b = *vertices.last().unwrap();
    let v = b.sub(a);
    let len = v.0 * v.0 + v.1 * v.1;
    let mut best = distance;
    let mut split = 0;
    for (i, &p) in vertices
        .iter()
        .enumerate()
        .skip(1)
        .take(vertices.len().saturating_sub(2))
    {
        let d = p.sub(a);
        let t = if len == 0. {
            0.
        } else {
            ((d.0 * v.0 + d.1 * v.1) / len).clamp(0., 1.)
        };
        let dist = p.sub(a.lerp(b, t)).length();
        if dist > best {
            best = dist;
            split = i;
        }
    }
    if split > 0 {
        simplify(&vertices[..=split], distance, out);
        simplify(&vertices[split..], distance, out);
    } else {
        if out.is_empty() {
            out.push(a);
        }
        out.push(b);
    }
}
fn points_on_path(contour: &Contour, roughness: f64) -> Vec<P> {
    let mut points = vec![contour.start];
    let mut a = contour.start;
    for edge in &contour.edges {
        match *edge {
            Edge::Line(p) => {
                points.push(p);
                a = p;
            }
            Edge::Cubic(b, c, d) => {
                let mut curve = vec![];
                sample_cubic([a, b, c, d], &mut curve);
                points.extend(curve);
                a = d;
            }
            Edge::Quad(..) => unreachable!("shape outline uses cubic controls"),
        }
    }
    points.push(contour.start);
    let mut simplified = vec![];
    simplify(&points, (1. + roughness) / 2., &mut simplified);
    simplified
}

#[derive(Clone, Copy)]
struct ScanEdge {
    ymin: f64,
    ymax: f64,
    x: f64,
    slope: f64,
}
fn hachure(poly: &[P], width: f64, roughness: f64, rng: &mut Random) -> Vec<Contour> {
    let rotated: Vec<_> = poly.iter().map(|p| p.rotate(49.)).collect();
    let mut edges = vec![];
    for (&a, &b) in rotated.iter().zip(rotated.iter().cycle().skip(1)) {
        if a.1 == b.1 {
            continue;
        }
        let (lo, hi) = if a.1 < b.1 { (a, b) } else { (b, a) };
        edges.push(ScanEdge {
            ymin: lo.1,
            ymax: hi.1,
            x: lo.0,
            slope: (b.0 - a.0) / (b.1 - a.1),
        });
    }
    edges.sort_by(|a, b| {
        a.ymin
            .total_cmp(&b.ymin)
            .then(a.x.total_cmp(&b.x))
            .then(a.ymax.total_cmp(&b.ymax))
    });
    let mut out = vec![];
    let Some(first) = edges.first() else {
        return out;
    };
    let mut y = first.ymin;
    let gap = (width * 4.).max(0.1);
    let mut pending = edges.into_iter().peekable();
    let mut active = vec![];
    while pending.peek().is_some() || !active.is_empty() {
        while pending.peek().is_some_and(|e| e.ymin <= y) {
            active.push(pending.next().unwrap());
        }
        active.retain(|e| e.ymax > y);
        active.sort_by(|a, b| a.x.total_cmp(&b.x));
        for pair in active.chunks_exact(2) {
            let point = |edge: ScanEdge| P((edge.x + 0.5).floor(), y).rotate(-49.);
            rng.line(&mut out, point(pair[0]), point(pair[1]), roughness);
        }
        if y + gap == y {
            break;
        }
        y += gap;
        for edge in &mut active {
            edge.x += gap * edge.slope;
        }
    }
    out
}
/// RoughJS computes fill and outline in local coordinates, sharing one RNG.
pub(super) fn shape(s: &SurfaceShape, seed: i32) -> (Vec<Contour>, Vec<Contour>) {
    let mut rng = Random(if seed == 0 { 1 } else { seed });
    let [_, _, w, h] = s.xywh;
    let inset = s.stroke_width.max(0.) * 0.5;
    let (w, h) = ((w - 2. * inset).max(0.), (h - 2. * inset).max(0.));
    let radius = if s.radius < 1. {
        w.min(h) * s.radius
    } else {
        s.radius
    };
    let mut outline = vec![];
    let mut fill = vec![];
    let visible = s.stroke_style != StrokeStyle::None;
    match s.shape_type {
        ShapeType::Ellipse => {
            let (path, points) = ellipse(w.max(1.), h.max(1.), &mut rng, s.roughness);
            if visible {
                outline = path;
            }
            if s.filled {
                fill = hachure(&points, s.stroke_width, s.roughness, &mut rng);
            }
        }
        ShapeType::Rect => {
            let contour = shapes::rounded_cubics(w, h, radius, radius);
            if s.filled {
                fill = hachure(
                    &points_on_path(&contour, s.roughness),
                    s.stroke_width,
                    s.roughness,
                    &mut rng,
                );
            }
            if visible {
                trace(&contour, &mut outline, &mut rng, s.roughness, true);
            }
        }
        ShapeType::Triangle | ShapeType::Diamond => {
            let points = if s.shape_type == ShapeType::Triangle {
                vec![P(w * 0.5, 0.), P(w, h), P(0., h)]
            } else {
                vec![P(w * 0.5, 0.), P(w, h * 0.5), P(w * 0.5, h), P(0., h * 0.5)]
            };
            trace(
                &Contour::polygon(&points, true),
                &mut outline,
                &mut rng,
                s.roughness,
                false,
            );
            if !visible {
                outline.clear();
            }
            if s.filled {
                fill = hachure(&points, s.stroke_width, s.roughness, &mut rng);
            }
        }
    }
    (fill, outline)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roughjs_random_sequence() {
        let mut r = Random(1);
        for expected in [48271, 182605793, 1291342511] {
            assert_eq!((r.next() * 2147483648.) as i32, expected);
        }
    }
}
