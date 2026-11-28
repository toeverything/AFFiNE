//! Page-route accessibility tree builder (breadcrumb landmark, drawer button, sync status,
//! document title heading, backlinks pill, trash actions, and block-level semantic nodes).

use std::collections::BTreeMap;

use affine_client::{
    AccessibilityBounds, AccessibilityNode, AccessibilityRole, AccessibilityState, ContextState,
    WorkspaceSyncStatus,
};
use ui_kit::{
    BreadcrumbBarConfig, BreadcrumbBarLayout, BreadcrumbItem, BreadcrumbItemKind,
    layout_breadcrumb_bar,
};

use crate::state::{MobileAppState, MobileDocBlock, MobileSheet};

use super::SafeAreaMetrics;

#[allow(clippy::too_many_arguments)]
pub(super) fn insert_page_a11y_nodes(
    state: &mut MobileAppState,
    doc_id: &str,
    content_left: f32,
    content_w: f32,
    safe: SafeAreaMetrics,
    is_rtl: bool,
    measured_breadcrumb: Option<&BreadcrumbBarLayout>,
    nodes: &mut BTreeMap<String, AccessibilityNode>,
    root_children: &mut Vec<String>,
    main_children: &mut Vec<String>,
) {
    let locale = state.locale();
    let strings = locale.strings();
    let safe_top = safe.top;
    let derivation = state.derive_breadcrumb();

    if !derivation.should_hide_bar_on_mobile && !derivation.crumbs.is_empty() {
        let nav_bc_id = "app.nav.breadcrumb".to_string();
        let owned_layout;
        let layout = if let Some(pre) = measured_breadcrumb {
            pre
        } else {
            let items: Vec<BreadcrumbItem> = derivation
                .crumbs
                .iter()
                .map(|c| {
                    let label = if c.is_switcher {
                        match &derivation.context {
                            ContextState::MultiLocation {
                                count,
                                owner_doc_id,
                                owner_doc_title,
                                ..
                            } if owner_doc_id != doc_id => strings
                                .compact_owner_multi_location_label(
                                    locale,
                                    owner_doc_title,
                                    *count,
                                ),
                            ContextState::MultiLocation { count, .. } => {
                                strings.multi_location_label(locale, *count)
                            }
                            _ => c.label.clone(),
                        }
                    } else if c.id == "root:trash" {
                        strings.trash.to_string()
                    } else if c.id == "root:journals" {
                        strings.tab_journals.to_string()
                    } else {
                        c.label.clone()
                    };
                    BreadcrumbItem {
                        id: c.id.clone(),
                        label,
                        kind: if c.is_current {
                            BreadcrumbItemKind::Current
                        } else if c.is_switcher {
                            BreadcrumbItemKind::Switcher
                        } else {
                            BreadcrumbItemKind::Segment
                        },
                        clickable: !c.is_current,
                    }
                })
                .collect();
            owned_layout = layout_breadcrumb_bar(
                &items,
                &BreadcrumbBarConfig::new(content_w, locale.direction())
                    .with_font_scale(state.font_scale),
            );
            &owned_layout
        };

        let mut bc_children = Vec::new();
        for slot in &layout.slots {
            let node_id = format!("breadcrumb.slot.{}", slot.id);
            let is_ellipsis = slot.kind == ui_kit::BreadcrumbSlotKind::Ellipsis;
            let a11y_name = if slot.kind == ui_kit::BreadcrumbSlotKind::Switcher {
                match &derivation.context {
                    ContextState::MultiLocation {
                        count,
                        owner_doc_id,
                        owner_doc_title,
                        ..
                    } if owner_doc_id != doc_id => {
                        strings.owner_multi_location_label(locale, owner_doc_title, *count)
                    }
                    _ => slot.full_title.clone(),
                }
            } else {
                slot.full_title.clone()
            };
            nodes.insert(
                node_id.clone(),
                AccessibilityNode {
                    id: node_id.clone(),
                    role: if is_ellipsis {
                        AccessibilityRole::Button
                    } else {
                        AccessibilityRole::Link
                    },
                    name: a11y_name,
                    value: None,
                    state: AccessibilityState {
                        current: slot.is_current,
                        expanded: if is_ellipsis
                            || slot.kind == ui_kit::BreadcrumbSlotKind::Switcher
                        {
                            Some(state.active_sheet == MobileSheet::LocationAndTrail)
                        } else {
                            None
                        },
                        ..AccessibilityState::default()
                    },
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left + slot.x,
                        y: safe_top + 52.0,
                        width: slot.width,
                        height: slot.height,
                    },
                    children: Vec::new(),
                },
            );
            bc_children.push(node_id);
        }

        nodes.insert(
            nav_bc_id.clone(),
            AccessibilityNode {
                id: nav_bc_id.clone(),
                role: AccessibilityRole::Navigation,
                name: "Breadcrumb".to_string(),
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: content_left,
                    y: safe_top + 52.0,
                    width: content_w,
                    height: layout.height,
                },
                children: bc_children,
            },
        );
        root_children.push(nav_bc_id);
    }

    let drawer_id = "mobile.page.drawer_btn".to_string();
    nodes.insert(
        drawer_id.clone(),
        AccessibilityNode {
            id: drawer_id.clone(),
            role: AccessibilityRole::Button,
            name: strings.open_drawer_label.to_string(),
            value: None,
            state: AccessibilityState {
                expanded: Some(state.active_sheet == MobileSheet::WorkspaceDrawer),
                ..AccessibilityState::default()
            },
            focused: false,
            bounds: AccessibilityBounds {
                x: if is_rtl {
                    content_left + 56.0
                } else {
                    content_left + (content_w - 100.0).max(0.0)
                },
                y: safe_top + 4.0,
                width: 44.0,
                height: 44.0,
            },
            children: Vec::new(),
        },
    );
    main_children.push(drawer_id);

    if content_w >= 360.0 {
        let sync_id = "mobile.page.sync_status".to_string();
        let sync_name = match state.active_workspace().sync_status {
            WorkspaceSyncStatus::Synced => strings.sync_synced.to_string(),
            WorkspaceSyncStatus::Syncing { pending_updates } => {
                if pending_updates > 0 {
                    format!("{} ({pending_updates})", strings.sync_syncing)
                } else {
                    strings.sync_syncing.to_string()
                }
            }
            WorkspaceSyncStatus::Connecting => strings.sync_connecting.to_string(),
            WorkspaceSyncStatus::Offline | WorkspaceSyncStatus::ReconnectScheduled { .. } => {
                strings.sync_offline.to_string()
            }
            WorkspaceSyncStatus::AuthRequired | WorkspaceSyncStatus::PermissionRevoked => {
                strings.sync_auth_required.to_string()
            }
        };
        nodes.insert(
            sync_id.clone(),
            AccessibilityNode {
                id: sync_id.clone(),
                role: AccessibilityRole::Status,
                name: sync_name,
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: if is_rtl {
                        content_left + 104.0
                    } else {
                        content_left + (content_w - 168.0).max(0.0)
                    },
                    y: safe_top + 14.0,
                    width: 64.0,
                    height: 24.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(sync_id);
    }

    if !derivation.in_trash {
        let more_id = "mobile.page.more_btn".to_string();
        nodes.insert(
            more_id.clone(),
            AccessibilityNode {
                id: more_id.clone(),
                role: AccessibilityRole::Button,
                name: strings.doc_actions_title.to_string(),
                value: None,
                state: AccessibilityState {
                    expanded: Some(state.active_sheet == MobileSheet::DocActions),
                    ..AccessibilityState::default()
                },
                focused: false,
                bounds: AccessibilityBounds {
                    x: if is_rtl {
                        content_left + 8.0
                    } else {
                        content_left + (content_w - 52.0).max(0.0)
                    },
                    y: safe_top + 4.0,
                    width: 44.0,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(more_id);
    }

    let doc_opt = state.doc_by_id(doc_id).cloned();
    let ws_id = state.active_workspace_id().to_string();
    let Some(doc) = doc_opt else {
        let nf_id = "mobile.page.not_found_back_btn".to_string();
        nodes.insert(
            nf_id.clone(),
            AccessibilityNode {
                id: nf_id.clone(),
                role: AccessibilityRole::Button,
                name: strings.back_label.to_string(),
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: content_left + (content_w - 120.0).max(0.0) * 0.5,
                    y: safe_top + 200.0,
                    width: 120.0,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(nf_id);
        return;
    };

    if derivation.in_trash {
        let scoped = crate::encode_scoped_doc_target(&ws_id, doc_id);
        let restore_id = format!("mobile.page.trash_restore_btn.{scoped}");
        nodes.insert(
            restore_id.clone(),
            AccessibilityNode {
                id: restore_id.clone(),
                role: AccessibilityRole::Button,
                name: strings.restore_doc_label.to_string(),
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: content_left + 16.0,
                    y: safe_top + 114.0,
                    width: 72.0,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(restore_id);

        let delete_id = format!("mobile.page.trash_delete_btn.{scoped}");
        nodes.insert(
            delete_id.clone(),
            AccessibilityNode {
                id: delete_id.clone(),
                role: AccessibilityRole::Button,
                name: strings.delete_permanently_label.to_string(),
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: content_left + 96.0,
                    y: safe_top + 114.0,
                    width: 120.0,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(delete_id);
    }

    let backlinks_id = "page.backlinks.pill".to_string();
    let bl = state.backlinks_for(doc_id);
    nodes.insert(
        backlinks_id.clone(),
        AccessibilityNode {
            id: backlinks_id.clone(),
            role: AccessibilityRole::Button,
            name: strings.backlinks_pill_label(
                locale,
                bl.items.len(),
                bl.completeness == affine_client::BacklinkCompleteness::Ready,
            ),
            value: None,
            state: AccessibilityState {
                expanded: Some(state.active_sheet == MobileSheet::Backlinks),
                ..AccessibilityState::default()
            },
            focused: false,
            bounds: AccessibilityBounds {
                x: content_left + 16.0,
                y: safe_top + 108.0,
                width: (content_w - 32.0).max(44.0),
                height: 44.0,
            },
            children: Vec::new(),
        },
    );
    main_children.push(backlinks_id);

    let title_id = "mobile.page.title".to_string();
    nodes.insert(
        title_id.clone(),
        AccessibilityNode {
            id: title_id.clone(),
            role: AccessibilityRole::Heading,
            name: doc.display_title(locale),
            value: None,
            state: AccessibilityState::default(),
            focused: false,
            bounds: AccessibilityBounds {
                x: content_left + 16.0,
                y: safe_top + 114.0,
                width: (content_w - 32.0).max(44.0),
                height: 28.0,
            },
            children: Vec::new(),
        },
    );
    main_children.push(title_id);

    if doc.blocks.is_empty() {
        let body_id = "mobile.page.block.body".to_string();
        nodes.insert(
            body_id.clone(),
            AccessibilityNode {
                id: body_id.clone(),
                role: AccessibilityRole::Document,
                name: if doc.body_preview.trim().is_empty() {
                    strings.page_body_placeholder.to_string()
                } else {
                    doc.body_preview
                },
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: content_left + 16.0,
                    y: safe_top + 200.0,
                    width: (content_w - 32.0).max(44.0),
                    height: 60.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(body_id);
    } else {
        for (idx, block) in doc.blocks.iter().enumerate() {
            let block_id = format!("mobile.page.block.{}", block.id());
            let (role, name, value) = match block {
                MobileDocBlock::Paragraph { text, .. } => {
                    (AccessibilityRole::Document, text.clone(), None)
                }
                MobileDocBlock::Image {
                    caption,
                    width,
                    height,
                    mime_type,
                    ..
                } => (
                    AccessibilityRole::Image,
                    if caption.trim().is_empty() {
                        format!("{} {width}×{height}", strings.media_image_label)
                    } else {
                        caption.clone()
                    },
                    Some(mime_type.clone()),
                ),
                MobileDocBlock::Attachment {
                    name, mime_type, ..
                } => (
                    AccessibilityRole::Region,
                    name.clone(),
                    Some(mime_type.clone()),
                ),
            };
            nodes.insert(
                block_id.clone(),
                AccessibilityNode {
                    id: block_id.clone(),
                    role,
                    name,
                    value,
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left + 16.0,
                        y: safe_top + 200.0 + (idx as f32) * 72.0,
                        width: (content_w - 32.0).max(44.0),
                        height: 60.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(block_id);
        }
    }
}
