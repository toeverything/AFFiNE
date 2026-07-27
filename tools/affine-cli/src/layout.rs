//! Spatial-aware layout for `diagram create`.
//!
//! The old layout dropped every node into a fixed 100×100 cell grid that ignored label length,
//! never checked for collisions, and let explicit coordinates land on top of grid-placed nodes.
//! This module instead:
//!   * sizes each node to its label (so text fits and boxes have breathing room),
//!   * arranges nodes with `grid` / `tree` (layered, directional) / `radial` (mind-map) modes,
//!   * runs a final separation pass that nudges any residual overlaps apart.
//!
//! Output is one `Rect` per input node (parallel indices) in canvas coordinates (top-left
//! origin, y grows down) — exactly the `[x,y,w,h]` the surface elements expect.

use std::collections::HashMap;

/// A node to place. Explicit `x/y/w/h` (from the spec) override the computed value.
#[derive(Debug, Clone)]
pub struct Node {
    pub id: String,
    pub label: String,
    pub shape: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub w: Option<f64>,
    pub h: Option<f64>,
}

/// A directed edge between node ids (used by `tree`/`radial` to derive hierarchy).
#[derive(Debug, Clone)]
pub struct Edge {
    pub from: String,
    pub to: String,
}

/// A placed bounding box.
#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    fn cx(&self) -> f64 {
        self.x + self.w / 2.0
    }
    fn cy(&self) -> f64 {
        self.y + self.h / 2.0
    }
    /// Center point `(x, y)` of the rect (public for connector-label placement).
    pub fn center(&self) -> (f64, f64) {
        (self.cx(), self.cy())
    }
    /// True if this rect overlaps `other` once both are inflated by `margin`.
    fn overlaps(&self, other: &Rect, margin: f64) -> bool {
        self.x - margin < other.x + other.w
            && self.x + self.w + margin > other.x
            && self.y - margin < other.y + other.h
            && self.y + self.h + margin > other.y
    }
    pub fn to_xywh(self) -> String {
        // Round to 2 dp to avoid noisy float strings while keeping placement exact enough.
        let r = |v: f64| (v * 100.0).round() / 100.0;
        format!("[{},{},{},{}]", r(self.x), r(self.y), r(self.w), r(self.h))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayoutMode {
    Grid,
    Tree,
    Radial,
}

impl LayoutMode {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "grid" => Some(Self::Grid),
            "tree" | "layered" | "flow" => Some(Self::Tree),
            "radial" | "mindmap" | "mind-map" => Some(Self::Radial),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    LeftRight,
    TopBottom,
}

impl Direction {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "lr" | "LR" | "left-right" | "horizontal" => Some(Self::LeftRight),
            "tb" | "TB" | "top-bottom" | "vertical" => Some(Self::TopBottom),
            _ => None,
        }
    }
}

// --- sizing -------------------------------------------------------------------

const MIN_W: f64 = 120.0;
const MAX_W: f64 = 340.0;
const NODE_H: f64 = 64.0;
const CHAR_W: f64 = 8.5;
const PAD_X: f64 = 40.0;
/// Minimum empty space kept between any two boxes.
const GAP_X: f64 = 110.0;
const GAP_Y: f64 = 90.0;
const SEP_MARGIN: f64 = 28.0;

/// Estimated rendered size for a node, honoring explicit `w`/`h`.
fn node_size(n: &Node) -> (f64, f64) {
    let chars = n.label.chars().count() as f64;
    let mut w = n.w.unwrap_or_else(|| (chars * CHAR_W + PAD_X).clamp(MIN_W, MAX_W));
    let mut h = n.h.unwrap_or(NODE_H);
    // A diamond's label sits in its inscribed rectangle (~half the bbox), so give it more room.
    if n.shape == "diamond" {
        w *= 1.45;
        h *= 1.6;
    } else if n.shape == "ellipse" {
        w *= 1.15;
        h *= 1.2;
    }
    (w, h)
}

// --- public entry -------------------------------------------------------------

/// Compute one `Rect` per node. Explicit per-node coordinates place the node there initially,
/// but the final separation pass may still nudge ANY node (pinned or not) — no-overlap is the
/// stronger guarantee and wins over exact placement when the two conflict.
pub fn layout(nodes: &[Node], edges: &[Edge], mode: LayoutMode, dir: Direction) -> Vec<Rect> {
    if nodes.is_empty() {
        return Vec::new();
    }
    let sizes: Vec<(f64, f64)> = nodes.iter().map(node_size).collect();

    let mut rects = match mode {
        LayoutMode::Grid => grid(&sizes),
        LayoutMode::Tree => tree(nodes, edges, &sizes, dir),
        LayoutMode::Radial => radial(nodes, edges, &sizes),
    };

    // Honor explicit overrides AFTER arranging (so spec coords pin a node exactly).
    for (i, n) in nodes.iter().enumerate() {
        if let Some(x) = n.x {
            rects[i].x = x;
        }
        if let Some(y) = n.y {
            rects[i].y = y;
        }
    }

    separate(&mut rects, SEP_MARGIN);
    normalize(&mut rects);
    rects
}

// --- grid ---------------------------------------------------------------------

fn grid(sizes: &[(f64, f64)]) -> Vec<Rect> {
    let n = sizes.len();
    let cols = (n as f64).sqrt().ceil().max(1.0) as usize;
    let rows = n.div_ceil(cols);

    // Per-column width and per-row height = max of the cells they contain.
    let mut col_w = vec![0.0_f64; cols];
    let mut row_h = vec![0.0_f64; rows];
    for (i, &(w, h)) in sizes.iter().enumerate() {
        let (r, c) = (i / cols, i % cols);
        col_w[c] = col_w[c].max(w);
        row_h[r] = row_h[r].max(h);
    }

    // Cumulative cell origins.
    let mut col_x = vec![0.0_f64; cols];
    for c in 1..cols {
        col_x[c] = col_x[c - 1] + col_w[c - 1] + GAP_X;
    }
    let mut row_y = vec![0.0_f64; rows];
    for r in 1..rows {
        row_y[r] = row_y[r - 1] + row_h[r - 1] + GAP_Y;
    }

    sizes
        .iter()
        .enumerate()
        .map(|(i, &(w, h))| {
            let (r, c) = (i / cols, i % cols);
            // Center each box within its (max-sized) cell.
            Rect {
                x: col_x[c] + (col_w[c] - w) / 2.0,
                y: row_y[r] + (row_h[r] - h) / 2.0,
                w,
                h,
            }
        })
        .collect()
}

// --- tree (layered) -----------------------------------------------------------

/// Index children/parents from edges, keyed by node index.
fn adjacency(nodes: &[Node], edges: &[Edge]) -> (HashMap<usize, Vec<usize>>, Vec<usize>) {
    let id_to_idx: HashMap<&str, usize> = nodes.iter().enumerate().map(|(i, n)| (n.id.as_str(), i)).collect();
    let mut children: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut indeg = vec![0usize; nodes.len()];
    for e in edges {
        if let (Some(&f), Some(&t)) = (id_to_idx.get(e.from.as_str()), id_to_idx.get(e.to.as_str()))
            && f != t
        {
            children.entry(f).or_default().push(t);
            indeg[t] += 1;
        }
    }
    (children, indeg)
}

fn tree(nodes: &[Node], edges: &[Edge], sizes: &[(f64, f64)], dir: Direction) -> Vec<Rect> {
    let n = nodes.len();
    let (children, indeg) = adjacency(nodes, edges);

    // Assign a layer (depth) to each node via BFS from the roots (indegree 0).
    let mut layer = vec![usize::MAX; n];
    let mut queue: std::collections::VecDeque<usize> = (0..n).filter(|&i| indeg[i] == 0).collect();
    if queue.is_empty() {
        queue.push_back(0); // cyclic graph: anchor on node 0
    }
    for &r in &queue {
        layer[r] = 0;
    }
    while let Some(u) = queue.pop_front() {
        if let Some(ch) = children.get(&u) {
            for &v in ch {
                let cand = layer[u] + 1;
                if cand < layer[v] {
                    layer[v] = cand;
                    queue.push_back(v);
                }
            }
        }
    }
    // Unreached nodes (disconnected) get parked on layer 0.
    for l in layer.iter_mut() {
        if *l == usize::MAX {
            *l = 0;
        }
    }

    // Group node indices by layer, preserving input order within a layer.
    let max_layer = *layer.iter().max().unwrap_or(&0);
    let mut by_layer: Vec<Vec<usize>> = vec![Vec::new(); max_layer + 1];
    for (i, &l) in layer.iter().enumerate() {
        by_layer[l].push(i);
    }

    let mut rects = vec![
        Rect {
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0
        };
        n
    ];
    // Primary axis = layer progression; secondary axis = stacking within a layer.
    let mut primary = 0.0_f64;
    for indices in &by_layer {
        // Primary extent = widest (LR) / tallest (TB) node in this layer.
        let layer_primary = indices
            .iter()
            .map(|&i| {
                if dir == Direction::LeftRight {
                    sizes[i].0
                } else {
                    sizes[i].1
                }
            })
            .fold(0.0_f64, f64::max);
        // Lay the layer out along the secondary axis.
        let mut secondary = 0.0_f64;
        for &i in indices {
            let (w, h) = sizes[i];
            match dir {
                Direction::LeftRight => {
                    rects[i] = Rect {
                        x: primary + (layer_primary - w) / 2.0,
                        y: secondary,
                        w,
                        h,
                    };
                    secondary += h + GAP_Y;
                }
                Direction::TopBottom => {
                    rects[i] = Rect {
                        x: secondary,
                        y: primary + (layer_primary - h) / 2.0,
                        w,
                        h,
                    };
                    secondary += w + GAP_X;
                }
            }
        }
        primary += layer_primary + if dir == Direction::LeftRight { GAP_X } else { GAP_Y };
    }
    rects
}

// --- radial (mind map) --------------------------------------------------------

const RING_BASE: f64 = 240.0;
const RING_STEP: f64 = 250.0;

fn radial(nodes: &[Node], edges: &[Edge], sizes: &[(f64, f64)]) -> Vec<Rect> {
    let n = nodes.len();
    let (children, indeg) = adjacency(nodes, edges);

    // Center = first indegree-0 node (a mind map's root), else node 0.
    let root = (0..n).find(|&i| indeg[i] == 0).unwrap_or(0);

    // Build a BFS tree over the directed edges so each node has one tree-parent (avoids the
    // angular allocation visiting a node twice on a diamond-shaped graph).
    let mut tree_children: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut visited = vec![false; n];
    visited[root] = true;
    let mut q = std::collections::VecDeque::from([root]);
    while let Some(u) = q.pop_front() {
        if let Some(ch) = children.get(&u) {
            for &v in ch {
                if !visited[v] {
                    visited[v] = true;
                    tree_children.entry(u).or_default().push(v);
                    q.push_back(v);
                }
            }
        }
    }

    // leaf-weight of each subtree (drives angular slice size).
    fn weight(u: usize, tc: &HashMap<usize, Vec<usize>>, memo: &mut HashMap<usize, f64>) -> f64 {
        if let Some(&w) = memo.get(&u) {
            return w;
        }
        let w = match tc.get(&u) {
            Some(ch) if !ch.is_empty() => ch.iter().map(|&c| weight(c, tc, memo)).sum(),
            _ => 1.0,
        };
        memo.insert(u, w);
        w
    }
    let mut memo = HashMap::new();

    let mut center = vec![(0.0_f64, 0.0_f64); n];
    let mut placed = vec![false; n];

    // Recursively allocate an angular slice [a0, a1] to a subtree at the given depth.
    // Internal recursion that threads its whole working state explicitly; bundling the four
    // state slices into a struct would obscure more than it helps.
    #[allow(clippy::too_many_arguments)]
    fn place(
        u: usize,
        depth: usize,
        a0: f64,
        a1: f64,
        tc: &HashMap<usize, Vec<usize>>,
        memo: &mut HashMap<usize, f64>,
        center: &mut [(f64, f64)],
        placed: &mut [bool],
    ) {
        let mid = (a0 + a1) / 2.0;
        if depth == 0 {
            center[u] = (0.0, 0.0);
        } else {
            let radius = RING_BASE + (depth as f64 - 1.0) * RING_STEP;
            center[u] = (radius * mid.cos(), radius * mid.sin());
        }
        placed[u] = true;

        if let Some(ch) = tc.get(&u) {
            let total: f64 = ch.iter().map(|&c| weight(c, tc, memo)).sum();
            if total <= 0.0 {
                return;
            }
            let mut cursor = a0;
            for &c in ch {
                let frac = weight(c, tc, memo) / total;
                let span = (a1 - a0) * frac;
                place(c, depth + 1, cursor, cursor + span, tc, memo, center, placed);
                cursor += span;
            }
        }
    }

    // Root spans the full circle.
    place(
        root,
        0,
        -std::f64::consts::PI,
        std::f64::consts::PI,
        &tree_children,
        &mut memo,
        &mut center,
        &mut placed,
    );

    // Any node not reachable from root (disconnected component): park on an outer ring.
    let unplaced: Vec<usize> = (0..n).filter(|&i| !placed[i]).collect();
    if !unplaced.is_empty() {
        let outer = RING_BASE + 2.0 * RING_STEP;
        let step = std::f64::consts::TAU / unplaced.len() as f64;
        for (k, &i) in unplaced.iter().enumerate() {
            let a = k as f64 * step;
            center[i] = (outer * a.cos(), outer * a.sin());
        }
    }

    // Convert centers to top-left rects.
    (0..n)
        .map(|i| {
            let (w, h) = sizes[i];
            Rect {
                x: center[i].0 - w / 2.0,
                y: center[i].1 - h / 2.0,
                w,
                h,
            }
        })
        .collect()
}

// --- collision separation + normalization ------------------------------------

/// Push overlapping rects apart along their center-to-center axis until none overlap (or a cap
/// is hit). Cheap O(n²·iters) relaxation — fine for the modest node counts diagrams carry.
fn separate(rects: &mut [Rect], margin: f64) {
    let n = rects.len();
    if n < 2 {
        return;
    }
    for _ in 0..200 {
        let mut moved = false;
        for i in 0..n {
            for j in (i + 1)..n {
                if !rects[i].overlaps(&rects[j], margin) {
                    continue;
                }
                let (mut dx, mut dy) = (rects[j].cx() - rects[i].cx(), rects[j].cy() - rects[i].cy());
                if dx == 0.0 && dy == 0.0 {
                    // Perfectly coincident: nudge deterministically by index.
                    dx = (j as f64 - i as f64).cos();
                    dy = (j as f64 - i as f64).sin();
                }
                let dist = (dx * dx + dy * dy).sqrt().max(1e-6);
                // Overlap amount along each axis; push by half each, on both nodes.
                let overlap_x = (rects[i].w + rects[j].w) / 2.0 + margin - (rects[j].cx() - rects[i].cx()).abs();
                let overlap_y = (rects[i].h + rects[j].h) / 2.0 + margin - (rects[j].cy() - rects[i].cy()).abs();
                let push = overlap_x.min(overlap_y).max(0.0) / 2.0 + 0.5;
                let (ux, uy) = (dx / dist, dy / dist);
                rects[i].x -= ux * push;
                rects[i].y -= uy * push;
                rects[j].x += ux * push;
                rects[j].y += uy * push;
                moved = true;
            }
        }
        if !moved {
            break;
        }
    }
}

/// Translate the whole layout so its top-left bounding corner sits at a small positive margin
/// (keeps coordinates tidy and on-canvas; the app still zoom-to-fits regardless).
fn normalize(rects: &mut [Rect]) {
    let min_x = rects.iter().map(|r| r.x).fold(f64::INFINITY, f64::min);
    let min_y = rects.iter().map(|r| r.y).fold(f64::INFINITY, f64::min);
    if !min_x.is_finite() || !min_y.is_finite() {
        return;
    }
    let (ox, oy) = (100.0 - min_x, 100.0 - min_y);
    for r in rects.iter_mut() {
        r.x += ox;
        r.y += oy;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str, label: &str, shape: &str) -> Node {
        Node {
            id: id.into(),
            label: label.into(),
            shape: shape.into(),
            x: None,
            y: None,
            w: None,
            h: None,
        }
    }

    fn no_overlaps(rects: &[Rect]) -> bool {
        for i in 0..rects.len() {
            for j in (i + 1)..rects.len() {
                if rects[i].overlaps(&rects[j], 0.0) {
                    return false;
                }
            }
        }
        true
    }

    #[test]
    fn grid_layout_has_no_overlaps_and_sizes_to_label() {
        let nodes = vec![
            node("a", "Short", "rect"),
            node("b", "A much longer label here", "rect"),
            node("c", "Mid label", "rect"),
            node("d", "x", "rect"),
        ];
        let rects = layout(&nodes, &[], LayoutMode::Grid, Direction::LeftRight);
        assert_eq!(rects.len(), 4);
        assert!(no_overlaps(&rects), "grid layout must not overlap");
        // Longer label => wider box.
        assert!(rects[1].w > rects[0].w, "longer label should be wider");
    }

    #[test]
    fn tree_layout_layers_by_depth_no_overlap() {
        let nodes = vec![
            node("root", "Root", "rect"),
            node("a", "Child A", "rect"),
            node("b", "Child B", "rect"),
            node("a1", "Grandchild", "rect"),
        ];
        let edges = vec![
            Edge {
                from: "root".into(),
                to: "a".into(),
            },
            Edge {
                from: "root".into(),
                to: "b".into(),
            },
            Edge {
                from: "a".into(),
                to: "a1".into(),
            },
        ];
        let rects = layout(&nodes, &edges, LayoutMode::Tree, Direction::LeftRight);
        assert!(no_overlaps(&rects), "tree layout must not overlap");
        // LR: deeper layers are further right.
        assert!(rects[1].x > rects[0].x, "child right of root");
        assert!(rects[3].x > rects[1].x, "grandchild right of child");
    }

    #[test]
    fn radial_layout_centers_root_no_overlap() {
        let nodes = vec![
            node("c", "Center", "ellipse"),
            node("n1", "Branch one", "rect"),
            node("n2", "Branch two", "rect"),
            node("n3", "Branch three", "rect"),
            node("n4", "Branch four", "rect"),
            node("leaf", "Leaf", "rect"),
        ];
        let edges = vec![
            Edge {
                from: "c".into(),
                to: "n1".into(),
            },
            Edge {
                from: "c".into(),
                to: "n2".into(),
            },
            Edge {
                from: "c".into(),
                to: "n3".into(),
            },
            Edge {
                from: "c".into(),
                to: "n4".into(),
            },
            Edge {
                from: "n1".into(),
                to: "leaf".into(),
            },
        ];
        let rects = layout(&nodes, &edges, LayoutMode::Radial, Direction::LeftRight);
        assert_eq!(rects.len(), 6);
        assert!(no_overlaps(&rects), "radial layout must not overlap");
    }

    #[test]
    fn explicit_coords_are_honored_then_separated() {
        let mut a = node("a", "A", "rect");
        let mut b = node("b", "B", "rect");
        a.x = Some(500.0);
        a.y = Some(500.0);
        b.x = Some(505.0);
        b.y = Some(505.0); // deliberately collide
        let rects = layout(&[a, b], &[], LayoutMode::Grid, Direction::LeftRight);
        assert!(no_overlaps(&rects), "collided explicit coords must be separated");
    }
}
