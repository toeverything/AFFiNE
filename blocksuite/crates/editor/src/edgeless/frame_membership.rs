//! Frame drop-target detection and incremental `prop:childElementIds` delta updates during drag.

use super::{DragItemInitial, EdgelessGesture, SpatialItemInfo, SpatialItemKind};

fn is_frame_member_kind(kind: SpatialItemKind) -> bool {
    matches!(
        kind,
        SpatialItemKind::Shape
            | SpatialItemKind::Group
            | SpatialItemKind::Note
            | SpatialItemKind::EdgelessText
            | SpatialItemKind::Connector
            | SpatialItemKind::SurfaceText
            | SpatialItemKind::Brush
            | SpatialItemKind::Highlighter
    )
}

/// Return the topmost Frame id that should highlight as a drop target while dragging
/// non-frame elements, judged by the pointer world position `current_world`.
pub fn hovered_frame_for_drag(
    painted_items: &[SpatialItemInfo],
    gesture: Option<&EdgelessGesture>,
) -> Option<String> {
    let Some(EdgelessGesture::DragSelection {
        current_world,
        initial,
        ..
    }) = gesture
    else {
        return None;
    };
    if initial.iter().any(|i| i.kind == SpatialItemKind::Frame)
        || !initial.iter().any(|i| is_frame_member_kind(i.kind))
    {
        return None;
    }
    find_frame_containing_point(painted_items, current_world.0, current_world.1, initial)
}

/// Find the topmost Frame whose world rect contains `(wx, wy)`, ignoring any item in `exclude`.
pub fn find_frame_containing_point(
    painted_items: &[SpatialItemInfo],
    wx: f32,
    wy: f32,
    exclude: &[DragItemInitial],
) -> Option<String> {
    painted_items
        .iter()
        .rev()
        .find(|item| {
            item.kind == SpatialItemKind::Frame
                && !exclude.iter().any(|e| e.id == item.id)
                && wx >= item.rect.x
                && wx <= item.rect.right()
                && wy >= item.rect.y
                && wy <= item.rect.bottom()
        })
        .map(|item| item.id.clone())
}

/// Compute incremental `(frame_id, add_ids, remove_ids)` deltas after dragging `initial` to
/// pointer position `pointer_world`.
pub fn compute_frame_membership_updates(
    painted_items: &[SpatialItemInfo],
    initial: &[DragItemInitial],
    pointer_world: (f32, f32),
) -> Vec<(String, Vec<String>, Vec<String>)> {
    if initial.iter().any(|i| i.kind == SpatialItemKind::Frame) {
        return Vec::new();
    }
    let target_frame =
        find_frame_containing_point(painted_items, pointer_world.0, pointer_world.1, initial);
    let mut updates = Vec::new();
    for frame in painted_items
        .iter()
        .filter(|i| i.kind == SpatialItemKind::Frame)
    {
        let is_target = target_frame.as_deref() == Some(frame.id.as_str());
        let mut add_ids = Vec::new();
        let mut remove_ids = Vec::new();
        for item in initial.iter().filter(|i| is_frame_member_kind(i.kind)) {
            let currently_in = frame.frame_children.iter().any(|c| c == &item.id);
            if is_target {
                if !currently_in && !add_ids.iter().any(|c| c == &item.id) {
                    add_ids.push(item.id.clone());
                }
            } else if currently_in && !remove_ids.iter().any(|c| c == &item.id) {
                remove_ids.push(item.id.clone());
            }
        }
        if !add_ids.is_empty() || !remove_ids.is_empty() {
            updates.push((frame.id.clone(), add_ids, remove_ids));
        }
    }
    updates
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::edgeless::WorldRect;

    fn item(
        id: &str,
        kind: SpatialItemKind,
        rect: WorldRect,
        children: Vec<&str>,
    ) -> SpatialItemInfo {
        SpatialItemInfo {
            id: id.into(),
            kind,
            shape_type: None,
            surface_id: (kind == SpatialItemKind::Shape).then(|| "surf".into()),
            rect,
            rotate_deg: 0.0,
            index: "a0".into(),
            scale: 1.0,
            stroke_width: 1.0,
            polyline: Vec::new(),
            frame_children: children.into_iter().map(str::to_string).collect(),
            group_children: Vec::new(),
            parent_group_id: None,
            title_pill_rect: None,
        }
    }

    fn drag_initial(id: &str, kind: SpatialItemKind, rect: WorldRect) -> DragItemInitial {
        DragItemInitial {
            id: id.into(),
            kind,
            surface_id: (kind == SpatialItemKind::Shape).then(|| "surf".into()),
            rect,
            rotate_deg: 0.0,
            points: None,
            connector_source: None,
            connector_target: None,
            connector_label_xywh: None,
        }
    }

    #[test]
    fn frame_membership_drag_into_between_and_out_of_frames() {
        let painted = vec![
            item(
                "f1",
                SpatialItemKind::Frame,
                WorldRect::new(0.0, 0.0, 200.0, 200.0),
                vec!["s1"],
            ),
            item(
                "f2",
                SpatialItemKind::Frame,
                WorldRect::new(300.0, 0.0, 200.0, 200.0),
                vec![],
            ),
            item(
                "s1",
                SpatialItemKind::Shape,
                WorldRect::new(50.0, 50.0, 40.0, 40.0),
                vec![],
            ),
            item(
                "s2",
                SpatialItemKind::Shape,
                WorldRect::new(600.0, 50.0, 40.0, 40.0),
                vec![],
            ),
        ];
        // Drag s2 into f2 using pointer_world inside f2 (even if element center were outside).
        let init_s2 = vec![drag_initial(
            "s2",
            SpatialItemKind::Shape,
            WorldRect::new(600.0, 50.0, 40.0, 40.0),
        )];
        let gesture = EdgelessGesture::DragSelection {
            start_world: (620.0, 70.0),
            current_world: (310.0, 70.0),
            initial: init_s2.clone(),
            shift: false,
            alt_clone: false,
            pending_dblclick: None,
        };
        assert_eq!(
            hovered_frame_for_drag(&painted, Some(&gesture)).as_deref(),
            Some("f2")
        );
        assert_eq!(
            compute_frame_membership_updates(&painted, &init_s2, (310.0, 70.0)),
            vec![("f2".into(), vec!["s2".into()], vec![])]
        );
        // Drag s1 out of f1 into open space -> emits incremental remove_ids for f1.
        let init_s1 = vec![drag_initial(
            "s1",
            SpatialItemKind::Shape,
            WorldRect::new(50.0, 50.0, 40.0, 40.0),
        )];
        assert_eq!(
            compute_frame_membership_updates(&painted, &init_s1, (70.0, 350.0)),
            vec![("f1".into(), vec![], vec!["s1".into()])]
        );
    }
}
