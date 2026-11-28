//! Modal bottom-sheet accessibility tree builder (`LocationAndTrail`, `WorkspaceSelector`, `Backlinks`).

use std::collections::BTreeMap;

use affine_client::{
    AccessibilityBounds, AccessibilityNode, AccessibilityRole, AccessibilityState, ContextState,
};

use crate::state::{MobileAppState, MobileRoute, MobileSheet};

use super::SafeAreaMetrics;

pub(super) fn insert_sheet_a11y_nodes(
    state: &mut MobileAppState,
    viewport_width: f32,
    viewport_height: f32,
    safe: SafeAreaMetrics,
    is_rtl: bool,
    nodes: &mut BTreeMap<String, AccessibilityNode>,
) -> String {
    let safe_bottom = safe.bottom;
    let strings = state.locale().strings();
    let compact = viewport_height < 460.0;
    let pad = if compact { 12.0 } else { 16.0 };
    let gap = if compact { 8.0 } else { 12.0 };
    let header_block = pad + 4.0 + gap + 44.0 + gap;

    let mut cols: Vec<Vec<(String, String, bool, f32)>> = Vec::new();
    match state.active_sheet {
        MobileSheet::LocationAndTrail => {
            let derivation = state.derive_breadcrumb();
            let cur_doc_id = match &state.route {
                MobileRoute::Page(id) => id.as_str(),
                _ => "",
            };
            let trail = if derivation.can_return_to_trail {
                &derivation.recoverable_trail
            } else {
                &derivation.trail
            };
            let mut trail_col: Vec<(String, String, bool, f32)> = trail
                .iter()
                .enumerate()
                .map(|(i, s)| {
                    (
                        format!("mobile.sheet.trail.{i}"),
                        s.title.clone(),
                        s.is_current,
                        44.0,
                    )
                })
                .collect();
            let mut owner_col = Vec::new();
            if let ContextState::MultiLocation {
                owner_doc_id,
                options,
                ..
            } = &derivation.context
                && owner_doc_id != cur_doc_id
            {
                for (i, o) in options.iter().enumerate() {
                    owner_col.push((
                        format!("mobile.sheet.owner_loc.{i}"),
                        o.label.clone(),
                        o.selected,
                        44.0,
                    ));
                }
            }
            let mut loc_col: Vec<(String, String, bool, f32)> = derivation
                .current_doc_locations
                .iter()
                .enumerate()
                .map(|(i, o)| {
                    (
                        format!("mobile.sheet.loc.{i}"),
                        o.label.clone(),
                        o.selected,
                        46.0,
                    )
                })
                .collect();
            if derivation.can_return_to_trail {
                loc_col.push((
                    "mobile.sheet.use_trail_btn".to_string(),
                    strings.use_trail_action.to_string(),
                    false,
                    44.0,
                ));
            }
            if compact {
                cols.push(trail_col);
                if !owner_col.is_empty() {
                    cols.push(owner_col);
                }
                cols.push(loc_col);
            } else {
                trail_col.extend(owner_col);
                trail_col.extend(loc_col);
                cols.push(trail_col);
            }
        }
        MobileSheet::WorkspaceSelector => {
            cols.push(
                state
                    .workspace_store
                    .iter()
                    .enumerate()
                    .map(|(i, ws)| {
                        (
                            format!("mobile.sheet.ws.{}", ws.summary.id),
                            ws.summary.name.clone(),
                            i == state.active_workspace_idx,
                            48.0,
                        )
                    })
                    .collect(),
            );
        }
        MobileSheet::Backlinks => {
            let doc_id = match &state.route {
                MobileRoute::Page(id) => id.clone(),
                _ => String::new(),
            };
            let bl = state.backlinks_for(&doc_id);
            cols.push(
                bl.items
                    .iter()
                    .enumerate()
                    .map(|(i, item)| {
                        let title = state
                            .doc_by_id(&item.source_doc_id)
                            .map(|d| d.display_title(state.locale()))
                            .unwrap_or_else(|| item.source_doc_id.clone());
                        (format!("mobile.sheet.backlink.{i}"), title, false, 46.0)
                    })
                    .collect(),
            );
        }
        MobileSheet::ConfirmDeleteDoc => {
            let (ws_id, doc_id) = state
                .pending_delete_target
                .clone()
                .unwrap_or_else(|| (state.active_workspace_id().to_string(), String::new()));
            let scoped = crate::encode_scoped_doc_target(&ws_id, &doc_id);
            cols.push(vec![
                (
                    format!("app.sheet.delete_cancel.{scoped}"),
                    strings.cancel_label.to_string(),
                    false,
                    44.0,
                ),
                (
                    format!("app.sheet.delete_confirm.{scoped}"),
                    strings.delete_permanently_label.to_string(),
                    false,
                    44.0,
                ),
            ]);
        }
        MobileSheet::DocActions => {
            let doc_id = match &state.route {
                MobileRoute::Page(id) => id.clone(),
                _ => String::new(),
            };
            let is_fav = state.doc_by_id(&doc_id).is_some_and(|d| d.is_favorite);
            let fav_label = if is_fav {
                strings.remove_from_favorites
            } else {
                strings.add_to_favorites
            };
            cols.push(vec![
                (
                    "mobile.sheet.doc_action.favorite".to_string(),
                    fav_label.to_string(),
                    is_fav,
                    48.0,
                ),
                (
                    "mobile.sheet.doc_action.location_trail".to_string(),
                    strings.location_trail_title.to_string(),
                    false,
                    48.0,
                ),
                (
                    "mobile.sheet.doc_action.trash".to_string(),
                    strings.move_to_trash.to_string(),
                    false,
                    48.0,
                ),
            ]);
        }
        MobileSheet::WorkspaceDrawer => {
            let is_tablet = viewport_width >= 720.0 && !compact;
            let (favorites, recent, all_docs) = crate::views::drawer_doc_sections(state);
            let mut items = vec![
                (
                    "mobile.drawer.close_btn".to_string(),
                    strings.close_label.to_string(),
                    false,
                    44.0,
                ),
                (
                    "mobile.drawer.switch_ws_btn".to_string(),
                    strings.switch_workspace.to_string(),
                    false,
                    44.0,
                ),
                (
                    "mobile.drawer.new_doc_btn".to_string(),
                    strings.new_doc_label.to_string(),
                    false,
                    44.0,
                ),
            ];
            if compact {
                for (id, title) in all_docs.into_iter().take(2) {
                    items.push((format!("mobile.drawer.doc.{id}"), title, false, 44.0));
                }
            } else {
                for (id, title) in favorites.into_iter().take(2) {
                    items.push((format!("mobile.drawer.fav.{id}"), title, false, 44.0));
                }
                if viewport_height >= 720.0 {
                    for (id, title) in recent.into_iter().take(2) {
                        items.push((format!("mobile.drawer.recent.{id}"), title, false, 44.0));
                    }
                }
                for (id, title) in all_docs.into_iter().take(if is_tablet { 6 } else { 3 }) {
                    items.push((format!("mobile.drawer.doc.{id}"), title, false, 44.0));
                }
            }
            cols.push(items);
        }
        MobileSheet::None => {}
    }

    let max_col_h = cols
        .iter()
        .map(|c| 20.0 + c.iter().map(|(_, _, _, h)| *h).sum::<f32>())
        .fold(44.0_f32, f32::max);
    let max_panel_h = (viewport_height - 24.0).max(180.0);
    let panel_h = (header_block + max_col_h + pad).min(max_panel_h);
    let panel_y = (viewport_height - safe_bottom - panel_h).max(0.0);

    let mut sheet_children = Vec::new();
    if !matches!(
        state.active_sheet,
        MobileSheet::ConfirmDeleteDoc | MobileSheet::WorkspaceDrawer
    ) {
        let done_w = 56.0_f32;
        let done_x = if is_rtl {
            pad
        } else {
            (viewport_width - pad - done_w).max(0.0)
        };
        let done_id = "mobile.sheet.done_btn".to_string();
        nodes.insert(
            done_id.clone(),
            AccessibilityNode {
                id: done_id.clone(),
                role: AccessibilityRole::Button,
                name: strings.close_label.to_string(),
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: done_x,
                    y: panel_y + pad + 4.0 + gap,
                    width: done_w,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        sheet_children.push(done_id);
    }

    let col_count = cols.len().max(1);
    let inner_w = (viewport_width - pad * 2.0).max(44.0);
    let col_gap = if col_count > 1 { 10.0 } else { 0.0 };
    let col_w = ((inner_w - col_gap * ((col_count - 1) as f32)) / (col_count as f32)).max(44.0);
    let content_top = panel_y + header_block;
    let panel_bottom = panel_y + panel_h;

    for (c_idx, col) in cols.into_iter().enumerate() {
        let col_x = if is_rtl {
            (viewport_width - pad - ((c_idx + 1) as f32) * col_w - (c_idx as f32) * col_gap)
                .max(pad)
        } else {
            pad + (c_idx as f32) * (col_w + col_gap)
        };
        let mut y = content_top + 16.0;
        for (id, name, selected, h) in col {
            let clamped_y = y.min((panel_bottom - h).max(content_top));
            nodes.insert(
                id.clone(),
                AccessibilityNode {
                    id: id.clone(),
                    role: AccessibilityRole::Button,
                    name,
                    value: None,
                    state: AccessibilityState {
                        selected,
                        ..AccessibilityState::default()
                    },
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: col_x,
                        y: clamped_y,
                        width: col_w,
                        height: h.min(panel_bottom - clamped_y).max(1.0),
                    },
                    children: Vec::new(),
                },
            );
            sheet_children.push(id);
            y += h;
        }
    }

    let sheet_id = "app.sheet.dialog".to_string();
    let sheet_name = match state.active_sheet {
        MobileSheet::WorkspaceSelector => strings.switch_workspace,
        MobileSheet::WorkspaceDrawer => strings.drawer_title,
        MobileSheet::DocActions => strings.doc_actions_title,
        MobileSheet::LocationAndTrail => strings.location_trail_title,
        MobileSheet::Backlinks => strings.backlinks_label,
        MobileSheet::ConfirmDeleteDoc => strings.confirm_delete_title,
        MobileSheet::None => "",
    };
    nodes.insert(
        sheet_id.clone(),
        AccessibilityNode {
            id: sheet_id.clone(),
            role: AccessibilityRole::Dialog,
            name: sheet_name.to_string(),
            value: None,
            state: AccessibilityState {
                expanded: Some(true),
                ..AccessibilityState::default()
            },
            focused: false,
            bounds: AccessibilityBounds {
                x: 0.0,
                y: panel_y,
                width: viewport_width,
                height: panel_h,
            },
            children: sheet_children,
        },
    );
    sheet_id
}
