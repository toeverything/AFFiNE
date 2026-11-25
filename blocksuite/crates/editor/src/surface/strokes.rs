// Stroke geometry ported from framework/global/src/gfx/perfect-freehand
// (MIT, Copyright (c) 2021 Stephen Ruiz Ltd; see its LICENSE).
use super::{Contour, Edge, P, WorldBounds};
use blocksuite_playground_doc::read::{SurfaceElement, SurfaceElementKind, SurfaceStroke};
use std::collections::{BTreeMap, BTreeSet};
use std::f64::consts::{FRAC_PI_2, PI};

#[derive(Clone, Copy)]
struct StrokePoint {
    point: P,
    pressure: f64,
    vector: P,
    distance: f64,
    length: f64,
}

fn stroke_points(stroke: &SurfaceStroke) -> Vec<StrokePoint> {
    let mut input: Vec<_> = stroke
        .points
        .iter()
        .map(|&[x, y, p]| (P(x, y), p))
        .collect();
    let Some(&(first, pressure)) = input.first() else {
        return vec![];
    };
    if input.len() == 2 {
        let target = input.pop().unwrap().0;
        input.extend((1..=4).map(|i| (first.lerp(target, i as f64 / 4.), 0.5)));
    } else if input.len() == 1 {
        input.push((first.add(P(1., 1.)), pressure));
    }
    let mut prev = StrokePoint {
        point: first,
        pressure: if stroke.simulated_pressure || pressure < 0. {
            0.25
        } else {
            pressure
        },
        vector: P(0., 0.),
        distance: 0.,
        length: 0.,
    };
    let mut points = vec![prev];
    let mut length = 0.;
    for (i, &(target, pressure)) in input.iter().enumerate().skip(1) {
        let point = prev.point.lerp(target, 0.15 + 0.5 * 0.85);
        if point == prev.point {
            continue;
        }
        let backwards = prev.point.sub(point);
        let distance = backwards.length();
        length += distance;
        if i + 1 < input.len() && length < stroke.line_width {
            continue;
        }
        prev = StrokePoint {
            point,
            pressure: if pressure >= 0. { pressure } else { 0.5 },
            vector: backwards.scale(1. / distance),
            distance,
            length,
        };
        points.push(prev);
    }
    if points.len() > 1 {
        points[0].vector = points[1].vector;
    }
    points
}
const FIXED_PI: f64 = PI + 0.0001;
fn per(p: P) -> P {
    P(p.1, -p.0)
}
fn dot(p: P, q: P) -> f64 {
    p.0 * q.0 + p.1 * q.1
}
fn arc(
    center: P,
    offset: P,
    angle: f64,
    steps: usize,
    include_start: bool,
    include_end: bool,
) -> Vec<P> {
    let step = 1. / steps as f64;
    let mut t = if include_start { 0. } else { step };
    let mut out = vec![];
    while t < 1. || (include_end && t == 1.) {
        let (s, c) = (angle * t).sin_cos();
        out.push(center.add(P(offset.0 * c - offset.1 * s, offset.0 * s + offset.1 * c)));
        t += step;
    }
    out
}
pub(super) fn outline_points(stroke: &SurfaceStroke) -> Vec<P> {
    let size = stroke.line_width;
    let points = stroke_points(stroke);
    let (Some(first), Some(last)) = (points.first(), points.last()) else {
        return vec![];
    };
    if size <= 0. {
        return vec![];
    }
    let pressure_at = |prev: f64, p: &StrokePoint| {
        if stroke.simulated_pressure {
            let speed = (p.distance / size).min(1.);
            (prev + (1. - speed - prev) * (speed * 0.275)).min(1.)
        } else {
            p.pressure
        }
    };
    let mut previous_pressure = points.iter().take(10).fold(first.pressure, |prev, p| {
        (prev + pressure_at(prev, p)) * 0.5
    });
    let mut previous_vector = first.vector;
    let mut radius = 0.;
    let mut left = vec![];
    let mut right = vec![];
    let mut pl = first.point;
    let mut pr = pl;
    let mut sharp = false;
    let min_distance = (size * 0.5).powi(2);
    for (i, p) in points.iter().enumerate() {
        if i + 1 < points.len() && last.length - p.length < 3. {
            continue;
        }
        let pressure = pressure_at(previous_pressure, p);
        radius = (size * ((0.5 - 0.6 * (0.5 - pressure)) * FRAC_PI_2).sin()).max(0.01);
        let next = points.get(i + 1).unwrap_or(p);
        let d = if i + 1 == points.len() {
            1.
        } else {
            dot(p.vector, next.vector)
        };
        if (dot(p.vector, previous_vector) < 0. && !sharp) || d < 0. {
            let off = per(previous_vector).scale(radius);
            left.extend(arc(p.point, off.scale(-1.), FIXED_PI, 13, true, true));
            right.extend(arc(p.point, off, -FIXED_PI, 13, true, true));
            pl = *left.last().unwrap();
            pr = *right.last().unwrap();
            sharp |= d < 0.;
            continue;
        }
        sharp = false;
        if i + 1 == points.len() {
            let off = per(p.vector).scale(radius);
            left.push(p.point.sub(off));
            right.push(p.point.add(off));
            continue;
        }
        let off = per(next.vector.lerp(p.vector, d)).scale(radius);
        let l = p.point.sub(off);
        let r = p.point.add(off);
        if i <= 1 || dot(l.sub(pl), l.sub(pl)) > min_distance {
            left.push(l);
            pl = l;
        }
        if i <= 1 || dot(r.sub(pr), r.sub(pr)) > min_distance {
            right.push(r);
            pr = r;
        }
        previous_pressure = pressure;
        previous_vector = p.vector;
    }
    if points.len() == 1 {
        return arc(
            first.point,
            per(P(-1., -1.)).unit().scale(-radius),
            FIXED_PI * 2.,
            13,
            false,
            true,
        );
    }
    let start = arc(
        first.point,
        right[0].sub(first.point),
        FIXED_PI,
        13,
        false,
        true,
    );
    left.extend(arc(
        last.point,
        per(last.vector).scale(-radius),
        FIXED_PI * 3.,
        29,
        false,
        false,
    ));
    left.extend(right.into_iter().rev());
    left.extend(start);
    left
}

// getSvgPathFromStroke serializes M/Q/T coordinates to two decimals. T reflects
// the previous control through the rounded endpoint, as an SVG parser does.
pub(super) fn svg_contour(points: &[P]) -> Option<Contour> {
    if points.len() < 4 {
        return None;
    }
    let rounded = |p: P| P(super::hundredths(p.0), super::hundredths(p.1));
    let start = rounded(points[0]);
    let mut control = rounded(points[1]);
    let mut edges = vec![];
    for pair in points[1..].windows(2) {
        let end = rounded(pair[0].lerp(pair[1], 0.5));
        edges.push(Edge::Quad(control, end));
        control = end.scale(2.).sub(control);
    }
    Some(Contour {
        start,
        edges,
        closed: true,
    })
}
pub(super) fn outline(stroke: &SurfaceStroke, rotate: f64) -> Option<Contour> {
    let [x, y, w, h] = stroke.xywh;
    let center = P(w / 2., h / 2.);
    Some(
        svg_contour(&outline_points(stroke))?
            .mapped(|p| p.sub(center).rotate(rotate).add(center).add(P(x, y))),
    )
}
pub(super) fn group_bounds(
    children: &[String],
    elements: &BTreeMap<&str, &SurfaceElement>,
    bounds: &BTreeMap<String, WorldBounds>,
) -> Option<WorldBounds> {
    let mut stack: Vec<_> = children.iter().map(String::as_str).collect();
    let mut seen = BTreeSet::new();
    let mut result: Option<WorldBounds> = None;
    while let Some(id) = stack.pop() {
        if !seen.insert(id) {
            continue;
        }
        if let Some(el) = elements.get(id) {
            if el.hidden {
                continue;
            }
            if let SurfaceElementKind::Group { children, .. } = &el.kind {
                stack.extend(children.iter().map(String::as_str));
                continue;
            }
        }
        if let Some(b) = bounds.get(id) {
            let b = b.aabb();
            result = Some(result.map_or(b, |r| r.union(b)));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::read::RichText;
    use serde_json::json;
    #[test]
    fn nested_groups_skip_cycles_and_hidden_children() {
        let make = |id: &str, props| {
            SurfaceElement::from_properties(id.into(), props, RichText::default())
        };
        let group = make("group", json!({"type":"group","children":{"nested":true}}));
        let nested = make(
            "nested",
            json!({"type":"group","children":{"group":true,"missing":true,"hidden":true,"block":true}}),
        );
        let hidden = make("hidden", json!({"type":"shape","hidden":true}));
        let elements =
            BTreeMap::from([("group", &group), ("nested", &nested), ("hidden", &hidden)]);
        let block = WorldBounds {
            xywh: [7., 9., 12., 16.],
            rotate: 0.,
        };
        let bounds = BTreeMap::from([
            ("block".into(), block),
            ("hidden".into(), block.expand(10.)),
        ]);
        assert_eq!(
            group_bounds(&["group".into()], &elements, &bounds),
            Some(block)
        );
    }
}
