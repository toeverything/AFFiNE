//! BlockSuite's orthogonal connection graph contains only the two endpoint bounds.
use super::{P, WorldBounds, connector::Port, extent};
use std::cmp::Ordering;

fn near(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.02
}
fn same(a: P, b: P) -> bool {
    near(a.0, b.0) && near(a.1, b.1)
}
fn precision(p: P) -> P {
    P(super::hundredths(p.0), super::hundredths(p.1))
}
fn expanded(b: WorldBounds, [l, t, r, d]: [f64; 4]) -> WorldBounds {
    let [x, y, w, h] = b.xywh;
    WorldBounds {
        xywh: [x - l, y - t, w + l + r, h + t + d],
        rotate: 0.,
    }
}
fn offsets(start: Option<WorldBounds>, end: Option<WorldBounds>) -> ([f64; 4], [f64; 4]) {
    let mut s = [20.; 4];
    if let (Some(a), Some(b)) = (start, end) {
        let [x, y, w, h] = a.xywh;
        let [u, v, bw, bh] = b.xywh;
        if x < u + bw && u < x + w {
            if y > v + bh {
                s[1] = 20_f64.min((y - v - bh) / 2.);
            }
            if y + h < v {
                s[3] = 20_f64.min((v - y - h) / 2.);
            }
        }
        if y < v + bh && v < y + h && x + w < u {
            s[2] = 20_f64.min((u - x - w) / 2.);
        }
    }
    (s, [s[2], s[3], s[0], s[1]])
}
fn extrude(port: Port, offset: [f64; 4]) -> P {
    let Some(b) = port.bound else { return port.p };
    let [x, y, w, h] = b.xywh;
    let P(u, v) = port.p;
    let [l, t, r, d] = offset;
    let close = |a: f64, b: f64| (a - b).abs() < 0.0001;
    if close(x, u) {
        P(u - l, v)
    } else if close(y, v) {
        P(u, v - t)
    } else if close(x + w, u) {
        P(u + r, v)
    } else if close(y + h, v) {
        P(u, v + d)
    } else if port.normal.0.abs() > port.normal.1.abs() {
        P(if u > x + w / 2. { x + w + l } else { x - l }, v)
    } else {
        P(u, if v > y + h / 2. { y + h + t } else { y - t })
    }
}
#[derive(Clone, Copy)]
struct Node {
    p: P,
    priority: i32,
}
#[derive(Default)]
struct Channels(Vec<Node>);
impl Channels {
    fn point(&mut self, p: P, priority: i32) {
        self.0.push(Node { p, priority });
    }
    fn corners(&mut self, b: WorldBounds) {
        for (u, v) in [(0., 0.), (1., 0.), (1., 1.), (0., 1.)] {
            self.point(b.at(u, v), 0);
        }
    }
    fn corners_and_sides(&mut self, b: WorldBounds) {
        self.corners(b);
        for (u, v) in [(0.5, 0.), (1., 0.5), (0.5, 1.), (0., 0.5)] {
            self.point(b.at(u, v), 0);
        }
    }
    fn outer(&mut self, a: WorldBounds, b: WorldBounds) {
        let outer = a.union(b);
        self.corners_and_sides(outer);
        self.point(outer.at(0.5, 0.5), 2);
        for bound in [a, b] {
            for n in [0., 0.5, 1.] {
                for side in [0., 1.] {
                    self.point(P(outer.at(side, 0.).0, bound.at(0., n).1), 0);
                    self.point(P(bound.at(n, 0.).0, outer.at(0., side).1), 0);
                }
            }
        }
    }
    fn between(
        &mut self,
        port: P,
        a: WorldBounds,
        b: WorldBounds,
        ea: WorldBounds,
        eb: WorldBounds,
    ) {
        let [x, y, w, h] = a.xywh;
        let [u, v, bw, bh] = b.xywh;
        if near(port.1, y) || near(port.1, y + h) {
            let mut edges = [y, y + h, v, v + bh];
            edges.sort_by(f64::total_cmp);
            let mid = (edges[1] + edges[2]) / 2.;
            self.point(P(port.0, mid), 6);
            for r in [ea, eb] {
                for n in [0., 1.] {
                    self.point(P(r.at(n, 0.).0, mid), 0);
                }
            }
        } else {
            let mut edges = [x, x + w, u, u + bw];
            edges.sort_by(f64::total_cmp);
            let mid = (edges[1] + edges[2]) / 2.;
            self.point(P(mid, port.1), 6);
            for r in [ea, eb] {
                for n in [0., 1.] {
                    self.point(P(mid, r.at(0., n).1), 0);
                }
            }
        }
        for r in [ea, eb] {
            for (n, priority) in [(0.5, 6), (0., 3), (1., 3)] {
                if x + w < u {
                    self.point(P((x + w + u) / 2., r.at(0., n).1), priority);
                }
                if y + h < v {
                    self.point(P(r.at(n, 0.).0, (y + h + v) / 2.), priority);
                }
            }
        }
    }
    fn normalize(&mut self) {
        for n in &mut self.0 {
            n.p = precision(n.p);
        }
        for axis in [0, 1] {
            let coord = |p: P| if axis == 0 { p.0 } else { p.1 };
            self.0.sort_by(|a, b| coord(a.p).total_cmp(&coord(b.p)));
            for i in 1..self.0.len().saturating_sub(1) {
                let last = coord(self.0[i - 1].p);
                if near(coord(self.0[i].p), last) {
                    if axis == 0 {
                        self.0[i].p.0 = last;
                    } else {
                        self.0[i].p.1 = last;
                    }
                }
            }
        }
        self.0
            .sort_by(|a, b| a.p.0.total_cmp(&b.p.0).then(a.p.1.total_cmp(&b.p.1)));
        self.0.dedup_by(|b, a| {
            if same(a.p, b.p) {
                if b.priority > a.priority {
                    *a = *b;
                }
                true
            } else {
                false
            }
        });
    }
}
fn cardinal_neighbors(
    nodes: &[Node],
    active: &[usize],
    cur: usize,
    blocks: &[WorldBounds],
    expanded: &[WorldBounds],
) -> Vec<usize> {
    let p = nodes[cur].p;
    let mut dirs = [None; 4];
    let mut dist = [f64::INFINITY; 4];
    for &i in active {
        let q = nodes[i].p;
        let (dir, d) = if q.0 == p.0 && q.1 != p.1 {
            (usize::from(q.1 < p.1), (q.1 - p.1).abs())
        } else if q.1 == p.1 && q.0 != p.0 {
            (2 + usize::from(q.0 < p.0), (q.0 - p.0).abs())
        } else {
            continue;
        };
        if d < dist[dir] {
            dirs[dir] = Some(i);
            dist[dir] = d;
        }
    }
    // For an axis-aligned graph edge, rotate the coordinates so travel is
    // along u. Crossing both perpendicular sides counts as two intersections.
    let axes = |q: P, b: WorldBounds| {
        let [x, y, w, h] = b.xywh;
        if p.0 == q.0 {
            (p.1.min(q.1), p.1.max(q.1), p.0, y, y + h, x, x + w)
        } else {
            (p.0.min(q.0), p.0.max(q.0), p.1, x, x + w, y, y + h)
        }
    };
    let crosses = |q: P, b| {
        let (u0, u1, v, lo, hi, bottom, top) = axes(q, b);
        bottom <= v && v <= top && u0 <= lo && hi <= u1
    };
    dirs.into_iter()
        .flatten()
        .filter(|&i| {
            let q = nodes[i].p;
            !blocks.iter().any(|&b| {
                let (u0, u1, v, lo, hi, bottom, top) = axes(q, b);
                let overlaps_side = (near(v, bottom) || near(v, top)) && u0 <= hi && lo <= u1;
                crosses(q, b) || b.contains(p, 0.) || b.contains(q, 0.) || overlaps_side
            }) && !expanded.iter().any(|&b| crosses(q, b.expand(-0.5)))
        })
        .collect()
}
#[derive(Clone, Copy, Default)]
struct Cost {
    dist: f64,
    bends: i32,
    priority: i32,
}
fn compare(a: Cost, b: Cost) -> Ordering {
    if a.dist + 0.01 < b.dist {
        Ordering::Less
    } else if a.dist - 0.01 > b.dist {
        Ordering::Greater
    } else {
        a.bends.cmp(&b.bends).then(b.priority.cmp(&a.priority))
    }
}
#[derive(Default)]
struct Frontier(Vec<(usize, Cost)>);
impl Frontier {
    fn push(&mut self, node: usize, cost: Cost) {
        let mut i = if let Some(i) = self.0.iter().position(|v| v.0 == node) {
            if compare(cost, self.0[i].1) != Ordering::Less {
                return;
            }
            self.0[i].1 = cost;
            i
        } else {
            self.0.push((node, cost));
            self.0.len() - 1
        };
        while i > 0 {
            let parent = (i - 1) / 2;
            if compare(self.0[parent].1, cost) != Ordering::Greater {
                break;
            }
            self.0.swap(parent, i);
            i = parent;
        }
    }
    fn pop(&mut self) -> Option<usize> {
        if self.0.is_empty() {
            return None;
        }
        let first = self.0.swap_remove(0);
        let mut i = 0;
        while i * 2 + 1 < self.0.len() {
            let mut child = i * 2 + 1;
            if child + 1 < self.0.len()
                && compare(self.0[child + 1].1, self.0[child].1) == Ordering::Less
            {
                child += 1;
            }
            if compare(self.0[child].1, self.0[i].1) != Ordering::Less {
                break;
            }
            self.0.swap(i, child);
            i = child;
        }
        Some(first.0)
    }
}
#[derive(Clone, Copy)]
struct Step {
    cost: Cost,
    from: usize,
    index: usize,
}
fn best(costs: &[Cost]) -> usize {
    let mut min = f64::INFINITY;
    let mut indices = Vec::new();
    for (i, cost) in costs.iter().enumerate() {
        if cost.dist + 0.01 < min {
            min = cost.dist;
            indices.clear();
            indices.push(i);
        } else if near(cost.dist, min) {
            indices.push(i);
        }
    }
    if indices.len() == 1 {
        return indices[0];
    }
    let bends = indices.iter().map(|&i| costs[i].bends).min().unwrap();
    let tied: Vec<_> = indices
        .into_iter()
        .filter(|&i| costs[i].bends == bends)
        .collect();
    if tied.len() == 1 {
        return tied[0];
    }
    // AStarRunner returns the index within the final priority shortlist.
    let highest = tied.iter().map(|&i| costs[i].priority).max().unwrap();
    tied.iter()
        .position(|&i| costs[i].priority == highest)
        .unwrap()
}
fn search(
    nodes: &[Node],
    active: &[usize],
    endpoints: [usize; 4],
    blocks: &[WorldBounds],
    expanded: &[WorldBounds],
) -> Vec<P> {
    let [sp, ep, origin, mut target] = endpoints;
    let mut parents = vec![Vec::<Step>::new(); nodes.len()];
    parents[sp].push(Step {
        cost: Cost::default(),
        from: origin,
        index: 0,
    });
    let mut frontier = Frontier::default();
    frontier.push(sp, Cost::default());
    let manhattan = |a: P, b: P| (a.0 - b.0).abs() + (a.1 - b.1).abs();
    while let Some(cur) = frontier.pop() {
        let p = nodes[cur].p;
        if cur == ep && same(p, nodes[target].p) {
            target = ep;
        }
        let mut neighbors = cardinal_neighbors(nodes, active, cur, blocks, expanded);
        neighbors.retain(|&i| {
            !parents[cur]
                .iter()
                .any(|s| same(nodes[s.from].p, nodes[i].p))
        });
        if cur == ep {
            neighbors.push(target);
        }
        for next in neighbors {
            let q = nodes[next].p;
            let costs: Vec<_> = parents[cur]
                .iter()
                .map(|s| {
                    let prev = nodes[s.from].p;
                    let aligned = |(a, b, c): (f64, f64, f64)| {
                        (a - b).abs() < 0.0001 && (a - c).abs() < 0.0001
                    };
                    Cost {
                        dist: s.cost.dist + manhattan(p, q),
                        bends: s.cost.bends
                            + i32::from(
                                !(aligned((q.0, p.0, prev.0)) || aligned((q.1, p.1, prev.1))),
                            ),
                        priority: s.cost.priority + nodes[next].priority,
                    }
                })
                .collect();
            let index = best(&costs);
            let cost = costs[index];
            parents[next].push(Step {
                cost,
                from: cur,
                index,
            });
            frontier.push(
                next,
                Cost {
                    dist: cost.dist + manhattan(q, nodes[ep].p),
                    ..cost
                },
            );
            if same(p, nodes[ep].p) && same(q, nodes[target].p) {
                target = next;
                break;
            }
        }
        if same(p, nodes[ep].p) && !parents[target].is_empty() {
            break;
        }
    }
    let mut path = vec![];
    let mut i = target;
    let mut j = 0;
    loop {
        path.push(nodes[i].p);
        let Some(s) = parents[i].get(j) else {
            break;
        };
        (i, j) = (s.from, s.index);
    }
    path.reverse();
    path
}
pub(super) fn path(a: Port, b: Port) -> Vec<P> {
    path_with_node_count(a, b).0
}

pub(super) fn path_with_node_count(a: Port, b: Port) -> (Vec<P>, usize) {
    let (ao, bo) = offsets(a.bound, b.bound);
    let (ea, eb) = (
        a.bound.map(|r| expanded(r, ao)),
        b.bound.map(|r| expanded(r, bo)),
    );
    if (a.bound.is_some_and(|r| r.contains(b.p, 0.01))
        && b.bound.is_some_and(|r| r.contains(a.p, 0.01)))
        || ea.is_some_and(|r| r.contains(b.p, 0.))
        || eb.is_some_and(|r| r.contains(a.p, 0.))
    {
        return (
            if near(a.p.0, b.p.0) || near(a.p.1, b.p.1) {
                vec![a.p, b.p]
            } else {
                vec![a.p, P(a.p.0, b.p.1), b.p]
            },
            0,
        );
    }
    let (s, e) = (precision(a.p), precision(b.p));
    let (ns, ne) = (precision(extrude(a, ao)), precision(extrude(b, bo)));
    let mut channels = Channels::default();
    channels.point(ns, 0);
    channels.point(ne, 0);
    let line = extent(&[s, e]);
    channels.corners_and_sides(line);
    if a.bound.is_none() || b.bound.is_none() {
        channels.point(line.at(0.5, 0.5), 3);
    }
    if let (Some(ra), Some(rb), Some(xa), Some(xb)) = (a.bound, b.bound, ea, eb) {
        channels.outer(xa, xb);
        channels.between(s, ra, rb, xa, xb);
        channels.between(e, rb, ra, xb, xa);
    }
    for (bound, p) in [(ea, ne), (eb, ns)] {
        if let Some(r) = bound {
            channels.corners_and_sides(r);
            channels.corners(r.union(extent(&[p])));
        }
    }
    channels.normalize();
    let mut nodes = channels.0;
    let locate = |p| nodes.iter().position(|n| same(p, n.p));
    let (Some(sp), Some(ep)) = (locate(ns), locate(ne)) else {
        return (vec![], nodes.len());
    };
    let blocks: Vec<_> = [a.bound, b.bound].into_iter().flatten().collect();
    let expanded: Vec<_> = [ea, eb].into_iter().flatten().collect();
    let active: Vec<_> = (0..nodes.len())
        .filter(|&i| {
            !expanded
                .iter()
                .any(|r| r.expand(-1.).contains(nodes[i].p, 0.01))
        })
        .collect();
    let mut origin = s;
    let mut target = e;
    let shift = |from: P, to: P| {
        let v = to.sub(from);
        let sign = |n| if n > 0. { 20. } else { -20. };
        if v.0.abs() > v.1.abs() {
            P(sign(v.0), 0.)
        } else {
            P(0., sign(v.1))
        }
    };
    if b.bound.is_none() {
        target = target.add(shift(origin, target));
    }
    if a.bound.is_none() {
        origin = origin.sub(shift(origin, target));
    }
    nodes[sp].priority = 0;
    nodes[ep].priority = 0;
    let n = nodes.len();
    nodes.extend([
        Node {
            p: origin,
            priority: 0,
        },
        Node {
            p: target,
            priority: 0,
        },
    ]);
    let mut p = search(&nodes, &active, [sp, ep, n, n + 1], &blocks, &expanded);
    if b.bound.is_none() {
        p.pop();
    }
    if a.bound.is_none() && !p.is_empty() {
        p.remove(0);
    }
    if p.is_empty() {
        return (p, nodes.len());
    }
    let mut out = vec![p[0]];
    for s in p.windows(3) {
        if !(near(s[0].0, s[1].0) && near(s[1].0, s[2].0)
            || near(s[0].1, s[1].1) && near(s[1].1, s[2].1))
        {
            out.push(s[1]);
        }
    }
    out.push(*p.last().unwrap());
    (out, nodes.len())
}
