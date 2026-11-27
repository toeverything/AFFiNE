use super::{Contour, Edge, P, WorldBounds, shapes};
use blocksuite_playground_doc::read::{
    ConnectorEndpoint, ConnectorMode, EndpointStyle, ShapeType, SurfaceConnector,
};
use std::collections::BTreeMap;

#[derive(Clone, Copy)]
pub(super) struct Port {
    pub p: P,
    pub normal: P,
    pub bound: Option<WorldBounds>,
}
#[derive(Clone, Copy)]
struct Target {
    bounds: WorldBounds,
    kind: ShapeType,
}
const CARDINAL: [P; 4] = [P(0.5, 0.), P(0.5, 1.), P(0., 0.5), P(1., 0.5)];
impl Target {
    fn vertices(self) -> Vec<P> {
        let points: &[P] = match self.kind {
            ShapeType::Rect => &[P(0., 0.), P(1., 0.), P(1., 1.), P(0., 1.)],
            ShapeType::Triangle => &[P(0., 1.), P(0.5, 0.), P(1., 1.)],
            ShapeType::Diamond => &[P(0., 0.5), P(0.5, 0.), P(1., 0.5), P(0.5, 1.)],
            ShapeType::Ellipse => &[
                P(0., 0.),
                P(0.5, 0.),
                P(1., 0.),
                P(1., 0.5),
                P(1., 1.),
                P(0.5, 1.),
                P(0., 1.),
                P(0., 0.5),
            ],
        };
        points.iter().map(|p| self.bounds.at(p.0, p.1)).collect()
    }
    fn port(self, relative: P, ray: bool) -> Port {
        let b = self.bounds;
        // Cardinal center rays intersect the sloping triangle sides halfway to the box edge.
        let u = if ray && self.kind == ShapeType::Triangle && relative.1 == 0.5 {
            P(0.25 + relative.0 * 0.5, 0.5)
        } else {
            relative
        };
        let p = b.at(u.0, u.1);
        let center = b.at(0.5, 0.5);
        let normal = if !ray && CARDINAL.contains(&relative) {
            relative.sub(P(0.5, 0.5)).scale(2.).rotate(b.rotate)
        } else if ray && self.kind == ShapeType::Ellipse {
            let [_, _, w, h] = b.xywh;
            let d = p.sub(center);
            P(d.0 / (w / 2.).powi(4), d.1 / (h / 2.).powi(4)).unit()
        } else {
            let vertices = self.vertices();
            let tangent = vertices
                .iter()
                .zip(vertices.iter().cycle().skip(1))
                .find_map(|(&a, &z)| {
                    let v = p.sub(a);
                    let w = p.sub(z);
                    let on_edge =
                        (v.0 * w.1 - v.1 * w.0).abs() < 0.01 && v.0 * w.0 + v.1 * w.1 <= 1e-9;
                    let ellipse = self.kind == ShapeType::Ellipse
                        && super::extent(&[a, z, center]).contains(p, -1e-10);
                    (on_edge || ellipse).then(|| z.sub(a).unit())
                })
                .unwrap_or(if self.kind == ShapeType::Ellipse {
                    P(0., 0.5)
                } else {
                    P::default()
                });
            P(tangent.1, -tangent.0)
        };
        Port {
            p,
            normal,
            bound: Some(b.aabb()),
        }
    }
    fn nearest(self, other: P) -> Port {
        CARDINAL
            .map(|r| self.port(r, true))
            .into_iter()
            .min_by(|a, b| a.p.sub(other).length().total_cmp(&b.p.sub(other).length()))
            .unwrap()
    }
}
fn endpoints(
    c: &SurfaceConnector,
    start: Option<Target>,
    end: Option<Target>,
) -> Option<(Port, Port)> {
    let pinned = |e: &ConnectorEndpoint, t: Option<Target>| {
        let [x, y] = e.position?;
        Some(t.map_or(
            Port {
                p: P(x, y),
                normal: P::default(),
                bound: None,
            },
            |t| t.port(P(x, y), false),
        ))
    };
    match (pinned(&c.source, start), pinned(&c.target, end)) {
        (Some(a), Some(b)) => Some((a, b)),
        (None, Some(b)) => Some((start?.nearest(b.p), b)),
        (Some(a), None) => Some((a, end?.nearest(a.p))),
        (None, None) => {
            let (s, t) = (start?, end?);
            if c.mode != ConnectorMode::Orthogonal {
                return Some((
                    s.nearest(t.bounds.at(0.5, 0.5)),
                    t.nearest(s.bounds.at(0.5, 0.5)),
                ));
            }
            let mut best = None;
            let mut distance = f64::INFINITY;
            for a in CARDINAL.map(|p| s.port(p, true)) {
                for b in CARDINAL.map(|p| t.port(p, true)) {
                    let d = a.p.sub(b.p).length();
                    if d + 0.1 < distance {
                        best = Some((a, b));
                        distance = d;
                    }
                }
            }
            best
        }
    }
}
pub(super) struct Route {
    pub contour: Contour,
    pub samples: Vec<P>,
}
impl Route {
    pub(super) fn point_at_distance(&self, mode: ConnectorMode, t: f64) -> P {
        match mode {
            ConnectorMode::Straight => self.contour.start.lerp(*self.samples.last().unwrap(), t),
            ConnectorMode::Orthogonal => along(&self.samples, t),
            ConnectorMode::Curve => {
                let a = self.contour.start;
                let (b, c, d) = match self.contour.edges[..] {
                    [Edge::Cubic(b, c, d)] => (b, c, d),
                    _ => {
                        let d = *self.samples.last().unwrap();
                        (a, d, d)
                    }
                };
                cubic(a, b, c, d, t)
            }
        }
    }

    /// Endpoint and inward-facing tangent for each cap. A stationary Bézier endpoint
    /// inherits the direction between its two controls, as in getBezierTangent.
    pub fn endpoint_directions(&self) -> [(P, P); 2] {
        let start = self.contour.start;
        if let [Edge::Cubic(c, d, end)] = self.contour.edges[..] {
            return [
                (start, if c == start { d } else { c }),
                (end, if d == end { c } else { d }),
            ];
        }
        let n = self.samples.len();
        [
            (start, self.samples[1]),
            (self.samples[n - 1], self.samples[n - 2]),
        ]
    }
}
fn cubic(a: P, b: P, c: P, d: P, t: f64) -> P {
    let middle = b.lerp(c, t);
    a.lerp(b, t)
        .lerp(middle, t)
        .lerp(middle.lerp(c.lerp(d, t), t), t)
}

fn curve_controls(a: Port, b: Port) -> (P, P) {
    let delta = b.p.sub(a.p);
    let tangent = |port: &Port, v: P| {
        if port.bound.is_some() {
            let projection = (v.0 * port.normal.0 + v.1 * port.normal.1).abs();
            if port.normal.length() < 1e-8 {
                P(-v.1, v.0).unit().scale(20.)
            } else {
                port.normal
                    .scale((projection / port.normal.length() / 3.).max(100.))
            }
        } else if a.bound.is_none() && b.bound.is_none() {
            if v.0.abs() > v.1.abs() {
                P(v.0 * 2. / 3., 0.)
            } else {
                P(0., v.1 * 2. / 3.)
            }
        } else {
            P::default()
        }
    };
    (
        a.p.add(tangent(&a, delta)),
        b.p.add(tangent(&b, delta.scale(-1.))),
    )
}

pub fn preview_curve_cubic(
    source_id: Option<&str>,
    source_port: Option<[f64; 2]>,
    source_world: (f32, f32),
    target_id: Option<&str>,
    target_port: Option<[f64; 2]>,
    target_world: (f32, f32),
    items: &[crate::edgeless::SpatialItemInfo],
) -> ((f32, f32), (f32, f32), (f32, f32), (f32, f32)) {
    let resolve_port = |id: Option<&str>, port: Option<[f64; 2]>, fallback: (f32, f32)| -> Port {
        if let Some(id) = id
            && let Some(item) = items.iter().find(|i| i.id == id)
        {
            let target = Target {
                bounds: WorldBounds {
                    xywh: [
                        f64::from(item.rect.x),
                        f64::from(item.rect.y),
                        f64::from(item.rect.w),
                        f64::from(item.rect.h),
                    ],
                    rotate: f64::from(item.rotate_deg),
                },
                kind: item.shape_type.unwrap_or(ShapeType::Rect),
            };
            if let Some([rx, ry]) = port {
                return target.port(P(rx, ry), false);
            }
            return target.nearest(P(f64::from(fallback.0), f64::from(fallback.1)));
        }
        Port {
            p: P(f64::from(fallback.0), f64::from(fallback.1)),
            normal: P::default(),
            bound: None,
        }
    };
    let a = resolve_port(source_id, source_port, source_world);
    let b = resolve_port(target_id, target_port, target_world);
    let (p, q) = curve_controls(a, b);
    (
        (a.p.0 as f32, a.p.1 as f32),
        (p.0 as f32, p.1 as f32),
        (q.0 as f32, q.1 as f32),
        (b.p.0 as f32, b.p.1 as f32),
    )
}

pub(super) fn route(
    c: &SurfaceConnector,
    bounds: &BTreeMap<String, WorldBounds>,
    kinds: &BTreeMap<&str, ShapeType>,
) -> Option<Route> {
    let target = |ep: &ConnectorEndpoint| {
        ep.id.as_deref().and_then(|id| {
            Some(Target {
                bounds: *bounds.get(id)?,
                kind: kinds.get(id).copied().unwrap_or(ShapeType::Rect),
            })
        })
    };
    let (sa, ea) = (target(&c.source), target(&c.target));
    let (a, b) = endpoints(c, sa, ea)?;
    if c.mode == ConnectorMode::Curve {
        let (p, q) = curve_controls(a, b);
        let samples = (0..=64)
            .map(|i| cubic(a.p, p, q, b.p, i as f64 / 64.))
            .collect();
        return Some(Route {
            contour: Contour {
                start: a.p,
                edges: vec![Edge::Cubic(p, q, b.p)],
                closed: false,
            },
            samples,
        });
    }
    let samples = if c.mode == ConnectorMode::Straight {
        vec![a.p, b.p]
    } else {
        super::orthogonal::path(a, b)
    };
    if samples.len() < 2 {
        return None;
    }
    Some(Route {
        contour: Contour::polygon(&samples, false),
        samples,
    })
}
pub(super) fn along(points: &[P], fraction: f64) -> P {
    let len = |s: &[P]| s[1].sub(s[0]).length();
    let mut dist = points.windows(2).map(len).sum::<f64>() * fraction.clamp(0., 1.);
    for seg in points.windows(2) {
        let l = len(seg);
        if dist <= l && l > 0. {
            return seg[0].lerp(seg[1], dist / l);
        }
        dist -= l;
    }
    *points.last().unwrap()
}
pub(super) fn head(
    style: EndpointStyle,
    tip: P,
    prev: P,
    width: f64,
    rough: bool,
) -> Option<Contour> {
    let axis = prev.sub(tip).unit();
    let wings = |size, angle: f64| {
        [
            tip.add(axis.rotate(angle).scale(size)),
            tip,
            tip.add(axis.rotate(-angle).scale(size)),
        ]
    };
    Some(match style {
        EndpointStyle::Arrow => Contour::polygon(&wings(width * 7.5, 45.), false),
        EndpointStyle::Triangle => Contour::polygon(&wings(width * 7.5, 30.), true),
        EndpointStyle::Diamond => {
            let [a, tip, b] = wings(width * 5., 45.);
            Contour::polygon(
                &[a, tip, b, tip.add(axis.scale(width * 5. * 2_f64.sqrt()))],
                true,
            )
        }
        EndpointStyle::Circle => {
            let base = width * 2.5;
            let center = tip.add(axis.scale(base));
            let r = if rough { (base + 2.) / 2. } else { base };
            shapes::rounded(2. * r, 2. * r, r, r).mapped(|p| p.add(center).sub(P(r, r)))
        }
        EndpointStyle::None => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::read::{RichText, SurfaceElement, SurfaceElementKind};
    use serde_json::json;

    #[test]
    fn orthogonal_graph_uses_only_endpoint_bounds() {
        let rect = |xywh| WorldBounds { xywh, rotate: 0. };
        let mut bounds = BTreeMap::from([
            ("from".into(), rect([0., 0., 80., 100.])),
            ("to".into(), rect([200., 100., 80., 100.])),
        ]);
        let e = SurfaceElement::from_properties(
            "line".into(),
            json!({"type":"connector","mode":1,"source":{"id":"from","position":[1.,0.5]},"target":{"id":"to","position":[0.,0.5]}}),
            RichText::default(),
        );
        let SurfaceElementKind::Connector(c) = e.kind else {
            unreachable!()
        };
        let kinds = BTreeMap::new();
        let expected = route(&c, &bounds, &kinds).unwrap().samples;
        assert!(expected.len() >= 3);
        bounds.insert("other".into(), rect([90., 0., 100., 180.]));
        let run = || route(&c, &bounds, &kinds).unwrap();
        assert_eq!(run().samples, expected);
        let target = |id: &str| {
            Some(Target {
                bounds: bounds[id],
                kind: ShapeType::Rect,
            })
        };
        let (a, b) = endpoints(&c, target("from"), target("to")).unwrap();
        let (path, nodes) = super::super::orthogonal::path_with_node_count(a, b);
        assert_eq!(path, expected);
        assert!((1..=64).contains(&nodes), "{nodes} graph nodes");
    }

    #[test]
    fn labels_follow_the_bezier_parameter_for_curve_and_linear_for_straight() {
        for (mode, end, expected) in [(2, [180, 60], P(61.875, 9.375)), (0, [100, 0], P(25., 0.))] {
            let e = SurfaceElement::from_properties(
                "line".into(),
                json!({"type":"connector","mode":mode,"source":{"position":[0,0]},"target":{"position":end}}),
                RichText::default(),
            );
            let SurfaceElementKind::Connector(c) = e.kind else {
                unreachable!()
            };
            let route = route(&c, &BTreeMap::new(), &BTreeMap::new()).unwrap();
            assert_eq!(route.point_at_distance(c.mode, 0.25), expected);
        }
    }
}
