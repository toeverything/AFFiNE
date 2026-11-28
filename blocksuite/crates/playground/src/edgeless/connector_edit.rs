//! Connector creation, endpoint handle dragging/rebinding, and label geometry helpers.

use blocksuite_playground_doc::{
    fractional_index::generate_key_between,
    read::{ConnectorMode, SurfaceConnector, SurfaceElementKind, TextAlign},
    schema::{ConnectorEndpointSpec, SurfaceElementSpec},
};
use ui::{Context, FontWeight, Window, px};
use y_octo::{SessionValue, TextDeltaOp, TextInsert};

use crate::{
    PlaygroundView,
    rich_text::{RichParagraph, RichParagraphStyle},
    theme::ThemeMode,
};

use super::{
    EdgelessGesture, EdgelessTool, HandleKind, SpatialItemKind, find_surface_element,
    max_spatial_index,
};

/// Sample the routed connector polyline at `distance` (`0.0..=1.0`), matching
/// `surface::paint`'s `route.point_at_distance(mode, distance)`.
pub(super) fn connector_label_anchor_point(
    polyline: &[(f32, f32)],
    fallback_center: (f32, f32),
    mode: ConnectorMode,
    distance: f64,
) -> (f64, f64) {
    if polyline.len() < 2 {
        return (fallback_center.0 as f64, fallback_center.1 as f64);
    }
    let d = distance.clamp(0.0, 1.0);
    if mode == ConnectorMode::Curve {
        let f = d * (polyline.len() - 1) as f64;
        let i = (f.floor() as usize).min(polyline.len() - 2);
        let t = f - i as f64;
        let a = polyline[i];
        let b = polyline[i + 1];
        return (
            a.0 as f64 + (b.0 as f64 - a.0 as f64) * t,
            a.1 as f64 + (b.1 as f64 - a.1 as f64) * t,
        );
    }
    let seg_len = |a: (f32, f32), b: (f32, f32)| ((b.0 - a.0) as f64).hypot((b.1 - a.1) as f64);
    let total: f64 = polyline.windows(2).map(|w| seg_len(w[0], w[1])).sum();
    let mut rem = total * d;
    for w in polyline.windows(2) {
        let l = seg_len(w[0], w[1]);
        if rem <= l && l > 0.0 {
            let t = rem / l;
            return (
                w[0].0 as f64 + (w[1].0 as f64 - w[0].0 as f64) * t,
                w[0].1 as f64 + (w[1].1 as f64 - w[0].1 as f64) * t,
            );
        }
        rem -= l;
    }
    let last = *polyline.last().unwrap();
    (last.0 as f64, last.1 as f64)
}

pub(super) fn measure_connector_label_xywh(
    c: &SurfaceConnector,
    polyline: &[(f32, f32)],
    fallback_center: (f32, f32),
    trimmed: &str,
    theme_mode: ThemeMode,
    window: &Window,
) -> [f64; 4] {
    let p =
        connector_label_anchor_point(polyline, fallback_center, c.mode, c.label_offset.distance);
    let l = &c.label_style;
    let max_w = if c.label_constraints.has_max_width {
        c.label_constraints.max_width as f32
    } else {
        1e6_f32
    };
    let mut style = RichParagraphStyle {
        font_family: l
            .font_family
            .trim_start_matches("blocksuite:surface:")
            .to_string()
            .into(),
        font_size: l.font_size as f32,
        base_weight: FontWeight(l.font_weight.parse().unwrap_or(if l.font_weight == "bold" {
            700.0
        } else {
            400.0
        })),
        align: match l.text_align {
            TextAlign::Left => ui::TextAlign::Left,
            TextAlign::Center => ui::TextAlign::Center,
            TextAlign::Right => ui::TextAlign::Right,
        },
        ..RichParagraphStyle::from_theme(theme_mode)
    };
    let ts = window.text_system();
    let mut face = ui::font(style.font_family.clone());
    face.weight = style.base_weight;
    let font_id = ts.resolve_font(&face);
    let font_px = px(style.font_size);
    let ascent = f32::from(ts.ascent(font_id, font_px));
    let descent = f32::from(ts.descent(font_id, font_px)).abs();
    style.line_height = ascent + descent;
    style.baseline_offset = Some(ascent);
    let delta = vec![TextDeltaOp::Insert {
        insert: TextInsert::Text(trimmed.to_string()),
        format: None,
    }];
    let (w, h) = if let Ok(para) = RichParagraph::from_delta(delta) {
        let laid = para.layout(ts, &style, max_w);
        let measured_w = laid
            .lines()
            .iter()
            .map(|line| f32::from(line.width))
            .fold(0.0_f32, f32::max)
            .ceil()
            .max(1.0) as f64;
        let measured_h = f64::from(f32::from(laid.size().height)).max(1.0);
        (measured_w, measured_h)
    } else {
        let fallback_w = (trimmed.chars().count() as f64 * 8.0 + 24.0).clamp(64.0, 260.0);
        (fallback_w, 28.0)
    };
    [p.0 - w * 0.5, p.1 - h * 0.5, w, h]
}

impl PlaygroundView {
    /// Commit a newly dragged connector with the active `ConnectorMode`.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn commit_create_connector(
        &mut self,
        mode: ConnectorMode,
        source_id: Option<String>,
        source_port: Option<[f64; 2]>,
        source_world: (f32, f32),
        current_world: (f32, f32),
        target_id: Option<String>,
        target_port: Option<[f64; 2]>,
        target_world: Option<(f32, f32)>,
        now_ms: u64,
        cx: &mut Context<Self>,
    ) {
        let dst = target_world.unwrap_or(current_world);
        if (dst.0 - source_world.0).hypot(dst.1 - source_world.1) < 8.0 && target_id.is_none() {
            cx.notify();
            return;
        }
        let next_idx = self
            .snapshot
            .as_deref()
            .and_then(max_spatial_index)
            .and_then(|m| generate_key_between(Some(&m), None).ok())
            .unwrap_or_else(|| "a0".to_string());
        let seed = (self.edgeless.authoring.next_id_seq as i32 + 31) * 89;
        let cid = self.page().map(|p| p.client_id());
        let id_opt = cid.map(|c| self.edgeless.authoring.next_id("conn", c));
        let mode_num = match mode {
            ConnectorMode::Straight => 0,
            ConnectorMode::Orthogonal => 1,
            ConnectorMode::Curve => 2,
        };
        if let Some(conn_id) = id_opt {
            let conn_id_clone = conn_id.clone();
            let source = match (source_id, source_port) {
                (Some(id), port) => ConnectorEndpointSpec::element(id, port),
                _ => ConnectorEndpointSpec::point(source_world.0 as f64, source_world.1 as f64),
            };
            let target = match (target_id, target_port) {
                (Some(id), port) => ConnectorEndpointSpec::element(id, port),
                _ => ConnectorEndpointSpec::point(dst.0 as f64, dst.1 as f64),
            };
            let commit = self.page_mut().ok().and_then(|page| {
                page.structural_edit(now_ms, move |page| {
                    let surface_id = page.ensure_surface_block(now_ms)?;
                    page.add_surface_element(
                        &surface_id,
                        conn_id_clone.clone(),
                        &next_idx,
                        SurfaceElementSpec::Connector {
                            mode: mode_num,
                            seed,
                            source: source.clone(),
                            target: target.clone(),
                            text: None,
                            label_xywh: None,
                        },
                        now_ms,
                    )?;
                    Ok(())
                })
                .ok()
                .flatten()
            });
            if let Some(commit) = commit {
                self.did_edgeless_doc_commit(commit, cx);
                self.edgeless.authoring.selection.clear();
                self.edgeless.authoring.selection.insert(conn_id);
                self.edgeless.authoring.tool = EdgelessTool::Select;
            }
        }
    }

    /// Start dragging a selected connector's start or end endpoint handle.
    pub(super) fn begin_connector_endpoint_drag(
        &mut self,
        handle: HandleKind,
        wx: f32,
        wy: f32,
        cx: &mut Context<Self>,
    ) -> bool {
        let is_start = match handle {
            HandleKind::ConnectorStart => true,
            HandleKind::ConnectorEnd => false,
            _ => return false,
        };
        let Some(single) = self.edgeless.authoring.single_selected().cloned() else {
            return false;
        };
        if single.kind != SpatialItemKind::Connector || single.polyline.len() < 2 {
            return false;
        }
        let Some(surface_id) = single.surface_id.clone() else {
            return false;
        };
        let Some(snapshot) = self.snapshot.as_deref() else {
            return false;
        };
        let Some((_, el)) = find_surface_element(snapshot, &single.id) else {
            return false;
        };
        let SurfaceElementKind::Connector(c) = &el.kind else {
            return false;
        };
        let (fixed_ep, fixed_world) = if is_start {
            (&c.target, *single.polyline.last().unwrap())
        } else {
            (&c.source, single.polyline[0])
        };
        self.edgeless.authoring.gesture = Some(EdgelessGesture::DragConnectorEndpoint {
            id: single.id,
            surface_id,
            is_start,
            mode: c.mode,
            fixed_id: fixed_ep.id.clone(),
            fixed_port: fixed_ep.position,
            fixed_world,
            current_world: (wx, wy),
            snap_id: None,
            snap_port: None,
            snap_world: None,
        });
        cx.notify();
        true
    }

    /// Commit a finished connector endpoint drag (rebind to snapped element or free world point).
    #[allow(clippy::too_many_arguments)]
    pub(super) fn commit_connector_endpoint_drag(
        &mut self,
        id: String,
        surface_id: String,
        is_start: bool,
        current_world: (f32, f32),
        snap_id: Option<String>,
        snap_port: Option<[f64; 2]>,
        now_ms: u64,
        cx: &mut Context<Self>,
    ) {
        let field = if is_start { "source" } else { "target" };
        let endpoint = match (snap_id, snap_port) {
            (Some(target_id), port) => ConnectorEndpointSpec::element(target_id, port),
            _ => ConnectorEndpointSpec::point(current_world.0 as f64, current_world.1 as f64),
        };
        let commit = self.page_mut().ok().and_then(|page| {
            page.structural_edit(now_ms, move |page| {
                page.set_surface_element_field(
                    &surface_id,
                    &id,
                    field,
                    SessionValue::Any(endpoint.to_any()),
                    now_ms,
                )?;
                Ok(())
            })
            .ok()
            .flatten()
        });
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
        } else {
            cx.notify();
        }
    }
}
