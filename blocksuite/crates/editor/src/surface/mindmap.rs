//! BlockSuite `0.27.5` `mindmap` surface element tree builder, deterministic auto-layout
//! (`gfx/mindmap/src/view/layout.ts`), and style-resolved connector synthesis
//! (`model/src/elements/mindmap/{mindmap,style}.ts`).
//!
//! Strictly zero CRDT writeback on read: existing node `xywh` coordinates authored by JS or peers
//! are honored verbatim; unpositioned trees (`[0, 0, w, h]` across multiple nodes) fall back to
//! `compute_mindmap_layout` in memory.

use std::collections::{BTreeMap, BTreeSet};

use blocksuite_playground_doc::read::{
    ColorValue, ConnectorEndpoint, ConnectorLabelConstraints, ConnectorLabelOffset,
    ConnectorLabelStyle, ConnectorMode, EndpointStyle, MindmapLayoutType, MindmapStyle, RichText,
    StrokeStyle, SurfaceConnector, SurfaceElement, SurfaceElementKind, SurfaceMindmap, TextAlign,
};

use super::WorldBounds;

pub const NODE_VERTICAL_SPACING: f64 = 45.0;
pub const NODE_HORIZONTAL_SPACING: f64 = 110.0;
pub const NODE_FIRST_LEVEL_HORIZONTAL_SPACING: f64 = 200.0;

#[derive(Debug, Clone)]
pub struct MindmapTreeNode {
    pub id: String,
    pub index: String,
    pub collapsed: bool,
    pub children: Vec<MindmapTreeNode>,
}

#[derive(Debug, Clone)]
pub struct MindmapTree {
    pub root: MindmapTreeNode,
    /// Child IDs assigned to the left subtree at level 1 (`Balance` or `Left` mode).
    pub left_ids: BTreeSet<String>,
    /// Child IDs assigned to the right subtree at level 1 (`Balance` or `Right` mode).
    pub right_ids: BTreeSet<String>,
}

/// Builds a cycle-free `MindmapTree` from `mindmap.nodes`, sorting siblings by fractional `index`
/// and splitting root children for `MindmapLayoutType::Balance` (`ceil(n / 2)` right, remainder
/// reversed on left, matching `MindmapElementModel._cfgBalanceLayoutDir`).
pub fn build_mindmap_tree(mindmap: &SurfaceMindmap) -> Option<MindmapTree> {
    if mindmap.nodes.is_empty() {
        return None;
    }
    // Pick root: first node with `parent: None` (or whose parent is absent from `nodes`), ordered by `(index, id)`.
    let root_id = mindmap
        .nodes
        .iter()
        .filter(|(_, d)| {
            d.parent
                .as_deref()
                .is_none_or(|p| !mindmap.nodes.contains_key(p))
        })
        .min_by(|(id_a, d_a), (id_b, d_b)| d_a.index.cmp(&d_b.index).then_with(|| id_a.cmp(id_b)))
        .map(|(id, _)| id.clone())?;

    let mut children_by_parent: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for (id, detail) in &mindmap.nodes {
        if id == &root_id {
            continue;
        }
        if let Some(parent) = detail.parent.as_deref()
            && mindmap.nodes.contains_key(parent)
        {
            children_by_parent
                .entry(parent)
                .or_default()
                .push(id.as_str());
        }
    }
    for list in children_by_parent.values_mut() {
        list.sort_by(|a, b| {
            let ia = &mindmap.nodes[*a].index;
            let ib = &mindmap.nodes[*b].index;
            ia.cmp(ib).then_with(|| a.cmp(b))
        });
    }

    let mut visited = BTreeSet::new();
    fn build_rec(
        id: &str,
        mindmap: &SurfaceMindmap,
        children_by_parent: &BTreeMap<&str, Vec<&str>>,
        visited: &mut BTreeSet<String>,
    ) -> Option<MindmapTreeNode> {
        if !visited.insert(id.to_string()) {
            return None;
        }
        let detail = mindmap.nodes.get(id)?;
        let children = children_by_parent
            .get(id)
            .into_iter()
            .flatten()
            .filter_map(|cid| build_rec(cid, mindmap, children_by_parent, visited))
            .collect();
        Some(MindmapTreeNode {
            id: id.to_string(),
            index: detail.index.clone(),
            collapsed: detail.collapsed,
            children,
        })
    }

    let root = build_rec(&root_id, mindmap, &children_by_parent, &mut visited)?;
    let mut left_ids = BTreeSet::new();
    let mut right_ids = BTreeSet::new();
    match mindmap.layout_type {
        MindmapLayoutType::Right => {
            for c in &root.children {
                right_ids.insert(c.id.clone());
            }
        }
        MindmapLayoutType::Left => {
            for c in &root.children {
                left_ids.insert(c.id.clone());
            }
        }
        MindmapLayoutType::Balance => {
            let split = root.children.len().div_ceil(2);
            for c in &root.children[..split] {
                right_ids.insert(c.id.clone());
            }
            for c in &root.children[split..] {
                left_ids.insert(c.id.clone());
            }
        }
    }
    Some(MindmapTree {
        root,
        left_ids,
        right_ids,
    })
}

/// Collects all descendant node IDs hidden underneath a `collapsed: true` ancestor.
pub fn collapsed_descendant_ids(mindmap: &SurfaceMindmap) -> BTreeSet<String> {
    let mut hidden = BTreeSet::new();
    let Some(tree) = build_mindmap_tree(mindmap) else {
        return hidden;
    };
    fn walk(node: &MindmapTreeNode, ancestor_collapsed: bool, out: &mut BTreeSet<String>) {
        if ancestor_collapsed {
            out.insert(node.id.clone());
        }
        let next_collapsed = ancestor_collapsed || node.collapsed;
        for child in &node.children {
            walk(child, next_collapsed, out);
        }
    }
    walk(&tree.root, false, &mut hidden);
    hidden
}

#[derive(Clone)]
struct SubtreeSize {
    node: MindmapTreeNode,
    rect: [f64; 4],
    subtree_w: f64,
    subtree_h: f64,
    children: Vec<SubtreeSize>,
}

fn calc_subtree_size(
    node: &MindmapTreeNode,
    bounds: &BTreeMap<String, WorldBounds>,
    first_level: bool,
    override_children: Option<&[MindmapTreeNode]>,
) -> SubtreeSize {
    let rect = bounds
        .get(&node.id)
        .map(|b| b.xywh)
        .unwrap_or([0.0, 0.0, 100.0, 40.0]);
    let mut subtree_w = rect[2];
    let mut subtree_h = rect[3];
    let mut children_out = Vec::new();
    let raw_children = override_children.unwrap_or(&node.children);

    if !raw_children.is_empty() && !node.collapsed {
        let mut cw = 0.0_f64;
        let mut ch = 0.0_f64;
        for child in raw_children {
            let cs = calc_subtree_size(child, bounds, false, None);
            cw = cw.max(cs.subtree_w);
            ch += if ch > 0.0 {
                NODE_VERTICAL_SPACING + cs.subtree_h
            } else {
                cs.subtree_h
            };
            children_out.push(cs);
        }
        subtree_w += cw
            + if first_level {
                NODE_FIRST_LEVEL_HORIZONTAL_SPACING
            } else {
                NODE_HORIZONTAL_SPACING
            };
        subtree_h = subtree_h.max(ch);
    }
    SubtreeSize {
        node: node.clone(),
        rect,
        subtree_w,
        subtree_h,
        children: children_out,
    }
}

fn place_subtree(
    tree: &SubtreeSize,
    dir: MindmapLayoutType,
    first_level: bool,
    out: &mut BTreeMap<String, WorldBounds>,
) {
    if tree.node.collapsed || tree.children.is_empty() {
        return;
    }
    let root_xywh = out.get(&tree.node.id).map(|b| b.xywh).unwrap_or(tree.rect);
    let [rx, ry, rw, rh] = root_xywh;
    let spacing = if first_level {
        NODE_FIRST_LEVEL_HORIZONTAL_SPACING
    } else {
        NODE_HORIZONTAL_SPACING
    };
    let current_x = match dir {
        MindmapLayoutType::Left => rx - spacing,
        _ => rx + rw + spacing,
    };
    let mut current_y = ry + (rh - tree.subtree_h) * 0.5;
    if rh >= tree.subtree_h && !tree.children.is_empty() {
        current_y += (rh - tree.children[0].rect[3]) * 0.5;
    }
    for sub in &tree.children {
        let [_, _, sw, sh] = sub.rect;
        let cx = match dir {
            MindmapLayoutType::Left => current_x - sw,
            _ => current_x,
        };
        let cy = current_y + (sub.subtree_h - sh) * 0.5;
        out.insert(
            sub.node.id.clone(),
            WorldBounds {
                xywh: [cx, cy, sw, sh],
                rotate: 0.0,
            },
        );
        place_subtree(sub, dir, false, out);
        current_y += sub.subtree_h + NODE_VERTICAL_SPACING;
    }
}

/// Computes deterministic mindmap node world bounds matching BlockSuite `0.27.5`
/// `gfx/mindmap/src/view/layout.ts` (`Right`, `Left`, and `Balance`).
pub fn compute_mindmap_layout(
    mindmap: &SurfaceMindmap,
    initial_bounds: &BTreeMap<String, WorldBounds>,
) -> BTreeMap<String, WorldBounds> {
    let mut out = initial_bounds.clone();
    let Some(tree) = build_mindmap_tree(mindmap) else {
        return out;
    };
    let root_rect = out.get(&tree.root.id).copied().unwrap_or(WorldBounds {
        xywh: [0.0, 0.0, 113.0, 41.0],
        rotate: 0.0,
    });
    out.insert(tree.root.id.clone(), root_rect);

    match mindmap.layout_type {
        MindmapLayoutType::Right => {
            let sized = calc_subtree_size(&tree.root, &out, true, None);
            place_subtree(&sized, MindmapLayoutType::Right, true, &mut out);
        }
        MindmapLayoutType::Left => {
            let sized = calc_subtree_size(&tree.root, &out, true, None);
            place_subtree(&sized, MindmapLayoutType::Left, true, &mut out);
        }
        MindmapLayoutType::Balance => {
            let split = tree.root.children.len().div_ceil(2);
            let right_children: Vec<MindmapTreeNode> = tree.root.children[..split].to_vec();
            let mut left_children: Vec<MindmapTreeNode> = tree.root.children[split..].to_vec();
            left_children.reverse();

            let left_sized = calc_subtree_size(&tree.root, &out, true, Some(&left_children));
            place_subtree(&left_sized, MindmapLayoutType::Left, true, &mut out);

            let right_sized = calc_subtree_size(&tree.root, &out, true, Some(&right_children));
            place_subtree(&right_sized, MindmapLayoutType::Right, true, &mut out);
        }
    }
    out
}

/// Returns `true` when 2 or more mindmap nodes sit at the exact same `(x, y)` origin,
/// indicating an unlaid-out tree whose node positions should be resolved via `compute_mindmap_layout`.
pub fn needs_auto_layout(mindmap: &SurfaceMindmap, bounds: &BTreeMap<String, WorldBounds>) -> bool {
    let mut iter = mindmap
        .nodes
        .keys()
        .filter_map(|id| bounds.get(id).map(|b| (b.xywh[0], b.xywh[1])));
    let Some(first) = iter.next() else {
        return false;
    };
    let mut count = 1usize;
    let mut all_same = true;
    for pos in iter {
        count += 1;
        if (pos.0 - first.0).abs() > 1e-3 || (pos.1 - first.1).abs() > 1e-3 {
            all_same = false;
            break;
        }
    }
    count >= 2 && all_same
}

/// Resolves world-space bounds for all visible surface elements, excluding hidden descendants of
/// collapsed mindmap branches and applying deterministic `compute_mindmap_layout` overrides for
/// unpositioned mindmaps. Shared by `layout_surface`, `SurfaceRef`, and Edgeless camera fitting.
pub fn resolve_surface_element_bounds(
    elements: &[SurfaceElement],
    external_bounds: &BTreeMap<String, WorldBounds>,
) -> (BTreeMap<String, WorldBounds>, BTreeSet<String>) {
    let mut collapsed_hidden = BTreeSet::new();
    for e in elements.iter().filter(|e| !e.hidden) {
        if let SurfaceElementKind::Mindmap(mm) = &e.kind {
            collapsed_hidden.extend(collapsed_descendant_ids(mm));
        }
    }
    let mut ordered: Vec<&SurfaceElement> = elements
        .iter()
        .filter(|e| !e.hidden && !collapsed_hidden.contains(&e.id))
        .collect();
    ordered.sort_by(|a, b| a.index.cmp(&b.index));

    let mut bounds = external_bounds.clone();
    for e in &ordered {
        let xywh = match &e.kind {
            SurfaceElementKind::Shape(s) => Some(s.xywh),
            SurfaceElementKind::Brush(s) | SurfaceElementKind::Highlighter(s) => Some(s.xywh),
            SurfaceElementKind::Text(s) => Some(s.xywh),
            _ => None,
        };
        if let Some(xywh) = xywh {
            bounds.insert(
                e.id.clone(),
                WorldBounds {
                    xywh,
                    rotate: e.rotate,
                },
            );
        }
    }
    for e in &ordered {
        if let SurfaceElementKind::Mindmap(mm) = &e.kind
            && needs_auto_layout(mm, &bounds)
        {
            bounds = compute_mindmap_layout(mm, &bounds);
        }
    }
    (bounds, collapsed_hidden)
}

fn connector_style_for_path(
    style: MindmapStyle,
    path: &[usize],
) -> (ColorValue, f64, ConnectorMode) {
    // `DefaultTheme.StrokeColorShortMap` v2 medium palette tokens from `@blocksuite/affine-model` (`0.27.5`)
    const PURPLE: &str = "--affine-v2-edgeless-palette-medium-purpleMedium";
    const MAGENTA: &str = "--affine-v2-edgeless-palette-medium-magentaMedium";
    const ORANGE: &str = "--affine-v2-edgeless-palette-medium-orangeMedium";
    const YELLOW: &str = "--affine-v2-edgeless-palette-medium-yellowMedium";
    const GREEN: &str = "--affine-v2-edgeless-palette-medium-greenMedium";
    const BLUE: &str = "--affine-v2-edgeless-palette-medium-blueMedium";

    match style {
        MindmapStyle::One => {
            let palette = [PURPLE, MAGENTA, ORANGE, YELLOW, GREEN, "#7ae2d5"];
            let c = palette[path.get(1).copied().unwrap_or(0) % palette.len()];
            (ColorValue::Single(c.into()), 3.0, ConnectorMode::Curve)
        }
        MindmapStyle::Two => (
            ColorValue::Themed {
                light: "#000000".into(),
                dark: "#ffffff".into(),
            },
            3.0,
            ConnectorMode::Orthogonal,
        ),
        MindmapStyle::Three => {
            let palette = [YELLOW, GREEN, "#5cc7ba"];
            let depth_idx = path.len().saturating_sub(2);
            let c = palette[depth_idx % palette.len()];
            (ColorValue::Single(c.into()), 2.0, ConnectorMode::Curve)
        }
        MindmapStyle::Four => {
            let palette = [PURPLE, MAGENTA, ORANGE, YELLOW, GREEN, BLUE];
            let c = palette[path.get(1).copied().unwrap_or(0) % palette.len()];
            (ColorValue::Single(c.into()), 3.0, ConnectorMode::Curve)
        }
    }
}

fn make_connector(
    source: ConnectorEndpoint,
    target: ConnectorEndpoint,
    stroke: ColorValue,
    stroke_width: f64,
    mode: ConnectorMode,
) -> SurfaceConnector {
    SurfaceConnector {
        rough: false,
        mode,
        source,
        target,
        stroke,
        stroke_width,
        stroke_style: StrokeStyle::Solid,
        roughness: 1.4,
        front_endpoint_style: EndpointStyle::None,
        rear_endpoint_style: EndpointStyle::None,
        text: RichText::default(),
        label_display: false,
        label_xywh: None,
        label_offset: ConnectorLabelOffset {
            distance: 0.5,
            anchor: "center".into(),
        },
        label_constraints: ConnectorLabelConstraints {
            has_max_width: true,
            max_width: 280.0,
        },
        label_style: ConnectorLabelStyle {
            color: ColorValue::Single("--affine-text-primary-color".into()),
            font_family: "blocksuite:surface:Inter".into(),
            font_size: 16.0,
            font_weight: "400".into(),
            font_style: "normal".into(),
            text_align: TextAlign::Center,
        },
    }
}

/// Synthesizes all visible `SurfaceConnector` branches for `mindmap` in exact `0.27.5`
/// `MindmapElementRenderer` paint order (`connectors.reverse()` per node, stopping at collapsed nodes).
pub fn mindmap_connectors(
    mindmap: &SurfaceMindmap,
    bounds: &BTreeMap<String, WorldBounds>,
) -> Vec<SurfaceConnector> {
    let Some(tree) = build_mindmap_tree(mindmap) else {
        return Vec::new();
    };
    let mut out = Vec::new();

    #[allow(clippy::too_many_arguments)]
    fn traverse(
        node: &MindmapTreeNode,
        path: &mut Vec<usize>,
        branch_dir: Option<MindmapLayoutType>,
        tree: &MindmapTree,
        mindmap: &SurfaceMindmap,
        bounds: &BTreeMap<String, WorldBounds>,
        out: &mut Vec<SurfaceConnector>,
    ) {
        if !bounds.contains_key(&node.id) {
            return;
        }
        if node.collapsed && !node.children.is_empty() {
            let dir = branch_dir.unwrap_or(match mindmap.layout_type {
                MindmapLayoutType::Left => MindmapLayoutType::Left,
                _ => MindmapLayoutType::Right,
            });
            let [nx, ny, nw, nh] = bounds[&node.id].xywh;
            path.push(0);
            let (stroke, width, _) = connector_style_for_path(mindmap.style, path);
            path.pop();
            let (src_pos, dst_pt) = match dir {
                MindmapLayoutType::Left => ([0.0, 0.5], [nx - 6.0, ny + nh * 0.5]),
                _ => ([1.0, 0.5], [nx + nw + 6.0, ny + nh * 0.5]),
            };
            out.push(make_connector(
                ConnectorEndpoint {
                    id: Some(node.id.clone()),
                    position: Some(src_pos),
                },
                ConnectorEndpoint {
                    id: None,
                    position: Some(dst_pt),
                },
                stroke,
                width,
                ConnectorMode::Straight,
            ));
            return;
        }

        // `element-renderer.ts` iterates `connectors.reverse()` before recursing into children.
        let mut node_conns = Vec::with_capacity(node.children.len());
        for (idx, child) in node.children.iter().enumerate() {
            if !bounds.contains_key(&child.id) {
                continue;
            }
            let dir = branch_dir.unwrap_or_else(|| {
                if tree.left_ids.contains(&child.id) {
                    MindmapLayoutType::Left
                } else {
                    MindmapLayoutType::Right
                }
            });
            path.push(idx);
            let (stroke, width, mode) = connector_style_for_path(mindmap.style, path);
            path.pop();
            let (src_pos, dst_pos) = match dir {
                MindmapLayoutType::Left => ([0.0, 0.5], [1.0, 0.5]),
                _ => ([1.0, 0.5], [0.0, 0.5]),
            };
            node_conns.push(make_connector(
                ConnectorEndpoint {
                    id: Some(node.id.clone()),
                    position: Some(src_pos),
                },
                ConnectorEndpoint {
                    id: Some(child.id.clone()),
                    position: Some(dst_pos),
                },
                stroke,
                width,
                mode,
            ));
        }
        node_conns.reverse();
        out.extend(node_conns);

        for (idx, child) in node.children.iter().enumerate() {
            let dir = branch_dir.unwrap_or_else(|| {
                if tree.left_ids.contains(&child.id) {
                    MindmapLayoutType::Left
                } else {
                    MindmapLayoutType::Right
                }
            });
            path.push(idx);
            traverse(child, path, Some(dir), tree, mindmap, bounds, out);
            path.pop();
        }
    }

    let mut path = vec![0usize];
    traverse(
        &tree.root, &mut path, None, &tree, mindmap, bounds, &mut out,
    );
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::read::MindmapNodeDetail;

    #[test]
    fn balance_layout_and_collapsed_branches_match_0275_rules() {
        let mut nodes = BTreeMap::new();
        nodes.insert(
            "root".into(),
            MindmapNodeDetail {
                index: "a0".into(),
                parent: None,
                collapsed: false,
            },
        );
        for (id, idx, collapsed) in [("c0", "a0", false), ("c1", "a1", true), ("c2", "a2", false)] {
            nodes.insert(
                id.into(),
                MindmapNodeDetail {
                    index: idx.into(),
                    parent: Some("root".into()),
                    collapsed,
                },
            );
        }
        nodes.insert(
            "c1-sub".into(),
            MindmapNodeDetail {
                index: "a0".into(),
                parent: Some("c1".into()),
                collapsed: false,
            },
        );
        let mm = SurfaceMindmap {
            layout_type: MindmapLayoutType::Balance,
            style: MindmapStyle::One,
            nodes,
        };
        let mut initial = BTreeMap::new();
        for id in ["root", "c0", "c1", "c2", "c1-sub"] {
            initial.insert(
                id.into(),
                WorldBounds {
                    xywh: [0.0, 0.0, 100.0, 40.0],
                    rotate: 0.0,
                },
            );
        }
        assert!(needs_auto_layout(&mm, &initial));
        let laid = compute_mindmap_layout(&mm, &initial);
        // ceil(3/2) == 2 -> c0, c1 on right (x = 0 + 100 + 200 = 300), c2 on left (x = 0 - 200 - 100 = -300).
        assert_eq!(laid["c0"].xywh[0], 300.0);
        assert_eq!(laid["c1"].xywh[0], 300.0);
        assert_eq!(laid["c2"].xywh[0], -300.0);

        let hidden = collapsed_descendant_ids(&mm);
        assert!(hidden.contains("c1-sub"));
        assert!(!hidden.contains("c1"));

        let conns = mindmap_connectors(&mm, &laid);
        // 3 root->child branches + 1 collapsed 6px stub on c1 (c1->c1-sub suppressed).
        assert_eq!(conns.len(), 4);
        assert!(conns.iter().any(|c| c.mode == ConnectorMode::Straight
            && c.source.id.as_deref() == Some("c1")
            && c.target.id.is_none()));
    }
}
