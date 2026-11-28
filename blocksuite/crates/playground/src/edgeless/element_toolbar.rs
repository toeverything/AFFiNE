//! PlaygroundView implementation of the Edgeless floating `Element Toolbar` (MVP-1):
//! single-undo-step property updates across selected Shape / Note / Connector / Text / Frame items.

use blocksuite_playground_doc::read::{BlockContent, StrokeStyle, SurfaceElementKind};
use ui::{Context, Window};
use y_octo::{AHashMap, Any, SessionValue};

use crate::PlaygroundView;

use super::{EdgelessElementAction, EdgelessElementToolbarHost, ElementColorSlot, SpatialItemKind};

fn stroke_style_wire(style: StrokeStyle) -> &'static str {
    match style {
        StrokeStyle::Solid => "solid",
        StrokeStyle::Dash => "dash",
        StrokeStyle::None => "none",
    }
}

impl EdgelessElementToolbarHost for PlaygroundView {
    fn edgeless_element_action(
        &mut self,
        action: EdgelessElementAction,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.apply_edgeless_element_action(action, cx);
    }
}

impl PlaygroundView {
    /// Apply one floating `Element Toolbar` action across the current Edgeless selection
    /// in a single atomic, undoable `structural_edit` transaction.
    pub fn apply_edgeless_element_action(
        &mut self,
        action: EdgelessElementAction,
        cx: &mut Context<Self>,
    ) {
        if self.edgeless_readonly {
            return;
        }
        if let EdgelessElementAction::ToggleColorPicker(slot) = action {
            self.edgeless_element_color_picker = if self.edgeless_element_color_picker == Some(slot)
            {
                None
            } else {
                Some(slot)
            };
            cx.notify();
            return;
        }
        if matches!(
            action,
            EdgelessElementAction::SetFillColor(_) | EdgelessElementAction::SetStrokeColor(_)
        ) {
            self.edgeless_element_color_picker = None;
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return;
        };
        let selected: Vec<(String, SpatialItemKind, Option<String>)> = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .filter(|i| self.edgeless.authoring.selection.contains(&i.id))
            .map(|i| (i.id.clone(), i.kind, i.surface_id.clone()))
            .collect();
        if selected.is_empty() {
            return;
        }
        // Snapshot current rough state (so multi-select toggle flips uniformly from the summary).
        let currently_scribbled = super::summarize_element_toolbar(
            &snapshot,
            &self.edgeless.authoring,
            self.theme,
            &self.theme.palette(),
        )
        .is_some_and(|s| s.scribbled);
        let next_scribbled = !currently_scribbled;

        // Pre-read connector label styles for font-size updates (preserving existing fields).
        let mut connector_label_styles: Vec<(String, Any)> = Vec::new();
        if let EdgelessElementAction::SetFontSize(fs) = &action
            && let Some(root) = snapshot.root.as_ref()
        {
            for node in root.walk() {
                if let BlockContent::Surface { elements, .. } = &node.content {
                    for el in elements {
                        if !self.edgeless.authoring.selection.contains(&el.id) {
                            continue;
                        }
                        if let SurfaceElementKind::Connector(conn) = &el.kind {
                            let mut map = AHashMap::default();
                            map.insert("fontSize".into(), Any::Float64((*fs).into()));
                            map.insert(
                                "fontFamily".into(),
                                Any::String(conn.label_style.font_family.clone()),
                            );
                            map.insert(
                                "fontWeight".into(),
                                Any::String(conn.label_style.font_weight.clone()),
                            );
                            map.insert(
                                "fontStyle".into(),
                                Any::String(conn.label_style.font_style.clone()),
                            );
                            map.insert(
                                "textAlign".into(),
                                Any::String(conn.label_style.text_align.as_str().into()),
                            );
                            connector_label_styles
                                .push((el.id.clone(), Any::Object(Box::new(map))));
                        }
                    }
                }
            }
        }

        let now_ms = self.now_ms(cx) as u64;
        let commit = self.page_mut().ok().and_then(|page| {
            page.structural_edit(now_ms, move |page| {
                for (id, kind, surface_id) in &selected {
                    match (&action, kind) {
                        (EdgelessElementAction::SetFillColor(token), SpatialItemKind::Shape) => {
                            if let Some(sid) = surface_id {
                                let transparent = token.eq_ignore_ascii_case("transparent");
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "filled",
                                    SessionValue::Any(if transparent {
                                        Any::False
                                    } else {
                                        Any::True
                                    }),
                                    now_ms,
                                )?;
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "fillColor",
                                    SessionValue::Any(Any::String(token.clone())),
                                    now_ms,
                                )?;
                            }
                        }
                        (
                            EdgelessElementAction::SetFillColor(token),
                            SpatialItemKind::Note | SpatialItemKind::Frame,
                        ) => {
                            page.set_block_prop(
                                id,
                                "prop:background",
                                SessionValue::Any(Any::String(token.clone())),
                                now_ms,
                            )?;
                        }
                        (EdgelessElementAction::SetStrokeColor(token), SpatialItemKind::Shape) => {
                            if let Some(sid) = surface_id {
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "strokeColor",
                                    SessionValue::Any(Any::String(token.clone())),
                                    now_ms,
                                )?;
                            }
                        }
                        (
                            EdgelessElementAction::SetStrokeColor(token),
                            SpatialItemKind::Connector,
                        ) => {
                            if let Some(sid) = surface_id {
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "stroke",
                                    SessionValue::Any(Any::String(token.clone())),
                                    now_ms,
                                )?;
                            }
                        }
                        (
                            EdgelessElementAction::SetStrokeColor(token),
                            SpatialItemKind::SurfaceText,
                        ) => {
                            if let Some(sid) = surface_id {
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "color",
                                    SessionValue::Any(Any::String(token.clone())),
                                    now_ms,
                                )?;
                            }
                        }
                        (
                            EdgelessElementAction::SetStrokeColor(token),
                            SpatialItemKind::EdgelessText,
                        ) => {
                            page.set_block_prop(
                                id,
                                "prop:color",
                                SessionValue::Any(Any::String(token.clone())),
                                now_ms,
                            )?;
                        }
                        (
                            EdgelessElementAction::SetStrokeStyle(style),
                            SpatialItemKind::Shape | SpatialItemKind::Connector,
                        ) => {
                            if let Some(sid) = surface_id {
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "strokeStyle",
                                    SessionValue::Any(Any::String(
                                        stroke_style_wire(*style).into(),
                                    )),
                                    now_ms,
                                )?;
                            }
                        }
                        (
                            EdgelessElementAction::SetStrokeWidth(width),
                            SpatialItemKind::Shape | SpatialItemKind::Connector,
                        ) => {
                            if let Some(sid) = surface_id {
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "strokeWidth",
                                    SessionValue::Any(Any::Float64((*width).into())),
                                    now_ms,
                                )?;
                            }
                        }
                        (EdgelessElementAction::ToggleRoughStyle, SpatialItemKind::Shape) => {
                            if let Some(sid) = surface_id {
                                let style = if next_scribbled {
                                    "Scribbled"
                                } else {
                                    "General"
                                };
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "shapeStyle",
                                    SessionValue::Any(Any::String(style.into())),
                                    now_ms,
                                )?;
                            }
                        }
                        (EdgelessElementAction::ToggleRoughStyle, SpatialItemKind::Connector) => {
                            if let Some(sid) = surface_id {
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "rough",
                                    SessionValue::Any(if next_scribbled {
                                        Any::True
                                    } else {
                                        Any::False
                                    }),
                                    now_ms,
                                )?;
                            }
                        }
                        (
                            EdgelessElementAction::SetFontSize(fs),
                            SpatialItemKind::Shape | SpatialItemKind::SurfaceText,
                        ) => {
                            if let Some(sid) = surface_id {
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "fontSize",
                                    SessionValue::Any(Any::Float64((*fs).into())),
                                    now_ms,
                                )?;
                            }
                        }
                        (EdgelessElementAction::SetFontSize(_), SpatialItemKind::Connector) => {
                            if let Some(sid) = surface_id
                                && let Some((_, style_any)) =
                                    connector_label_styles.iter().find(|(cid, _)| cid == id)
                            {
                                page.set_surface_element_field(
                                    sid,
                                    id,
                                    "labelStyle",
                                    SessionValue::Any(style_any.clone()),
                                    now_ms,
                                )?;
                            }
                        }
                        (EdgelessElementAction::SetFontSize(fs), SpatialItemKind::EdgelessText) => {
                            page.set_block_prop(
                                id,
                                "prop:fontSize",
                                SessionValue::Any(Any::Float64((*fs).into())),
                                now_ms,
                            )?;
                        }
                        _ => {}
                    }
                }
                Ok(())
            })
            .ok()
            .flatten()
        });
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
        }
    }

    /// Currently open Edgeless element toolbar color picker slot, if any.
    pub fn edgeless_element_color_picker(&self) -> Option<ElementColorSlot> {
        self.edgeless_element_color_picker
    }
}
