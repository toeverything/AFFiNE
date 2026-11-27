use anyhow::{Context as _, Result};
use playground::{
    PlaygroundMode, PlaygroundOptions, PlaygroundTheme,
    overlays::{FormatAction, OverlayEvent},
};
use ui::EntityInputHandler;
use ui::{audit_frame_snapshot, point, px};

use super::*;

/// A named arrangement of overlays the harness can put a session into.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum OverlayState {
    Default,
    SlashMenuOpen,
    SlashMenuFiltered,
    SlashMenuEmpty,
    SlashMenuFlippedBottom,
    FormatToolbarOpen,
    FormatToolbarFlippedTop,
    FormatToolbarLink,
    MobileKeyboardSelection,
    DragHandleHover,
    DragDropIndicator,
    ListCollapseHover,
    CodeHover,
    CodeHoverCopied,
    EdgelessSelected,
    EdgelessMarquee,
    EdgelessInlineEdit,
    EdgelessAuthoring,
    EdgelessShapePicker,
}

impl OverlayState {
    pub(super) const ALL: [Self; 14] = [
        Self::Default,
        Self::SlashMenuOpen,
        Self::SlashMenuFiltered,
        Self::SlashMenuEmpty,
        Self::SlashMenuFlippedBottom,
        Self::FormatToolbarOpen,
        Self::FormatToolbarFlippedTop,
        Self::FormatToolbarLink,
        Self::MobileKeyboardSelection,
        Self::DragHandleHover,
        Self::DragDropIndicator,
        Self::ListCollapseHover,
        Self::CodeHover,
        Self::CodeHoverCopied,
    ];

    const ALL_EDGELESS: [Self; 5] = [
        Self::EdgelessSelected,
        Self::EdgelessMarquee,
        Self::EdgelessInlineEdit,
        Self::EdgelessAuthoring,
        Self::EdgelessShapePicker,
    ];

    pub(super) fn name(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::SlashMenuOpen => "slash_menu_open",
            Self::SlashMenuFiltered => "slash_menu_filtered",
            Self::SlashMenuEmpty => "slash_menu_empty",
            Self::SlashMenuFlippedBottom => "slash_menu_flipped_bottom",
            Self::FormatToolbarOpen => "format_toolbar_open",
            Self::FormatToolbarFlippedTop => "format_toolbar_flipped_top",
            Self::FormatToolbarLink => "format_toolbar_link",
            Self::MobileKeyboardSelection => "mobile_keyboard_selection",
            Self::DragHandleHover => "drag_handle_hover",
            Self::DragDropIndicator => "drag_drop_indicator",
            Self::ListCollapseHover => "list_collapse_hover",
            Self::CodeHover => "code_hover",
            Self::CodeHoverCopied => "code_hover_copied",
            Self::EdgelessSelected => "edgeless_selected",
            Self::EdgelessMarquee => "edgeless_marquee",
            Self::EdgelessInlineEdit => "edgeless_inline_edit",
            Self::EdgelessAuthoring => "edgeless_authoring",
            Self::EdgelessShapePicker => "edgeless_shape_picker",
        }
    }

    pub(super) fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .chain(Self::ALL_EDGELESS)
            .find(|state| state.name() == value)
    }

    pub(super) fn is_edgeless(self) -> bool {
        matches!(
            self,
            Self::EdgelessSelected
                | Self::EdgelessMarquee
                | Self::EdgelessInlineEdit
                | Self::EdgelessAuthoring
                | Self::EdgelessShapePicker
        )
    }

    /// Snapshot ids the state must show once it is applied.
    pub(super) fn expected(self) -> &'static [&'static str] {
        match self {
            Self::Default => &[],
            Self::SlashMenuOpen => &["overlay.slash_menu", "overlay.slash_menu.item.text"],
            Self::SlashMenuFiltered => &["overlay.slash_menu", "overlay.slash_menu.item.h1"],
            Self::SlashMenuEmpty => &["overlay.slash_menu", "overlay.slash_menu.empty"],
            Self::SlashMenuFlippedBottom => &["overlay.slash_menu"],
            Self::FormatToolbarOpen | Self::FormatToolbarFlippedTop => &[
                "overlay.format_toolbar",
                "overlay.format_toolbar.bold",
                "overlay.format_toolbar.align_right",
            ],
            Self::FormatToolbarLink => &[
                "overlay.format_toolbar",
                "overlay.format_toolbar.link_input",
                "overlay.format_toolbar.link_apply",
                "overlay.format_toolbar.link_remove",
            ],
            Self::MobileKeyboardSelection => &["overlay.keyboard_toolbar"],
            Self::DragHandleHover => &["overlay.drag_handle"],
            Self::DragDropIndicator => &["overlay.drag_handle", "overlay.drop_indicator"],
            Self::ListCollapseHover => &["page.block.showcase-bullet.collapse"],
            Self::CodeHover | Self::CodeHoverCopied => &["page.block.showcase-code.copy"],
            Self::EdgelessSelected => &[
                "edgeless.viewport",
                "chrome.edgeless_toolbar",
                "chrome.edgeless_zoom",
            ],
            Self::EdgelessMarquee => &[
                "edgeless.viewport",
                "chrome.edgeless_toolbar",
                "chrome.edgeless_zoom",
            ],
            Self::EdgelessInlineEdit => &[
                "edgeless.viewport",
                "chrome.edgeless_toolbar",
                "edgeless.inline_edit",
            ],
            Self::EdgelessAuthoring => &[
                "edgeless.viewport",
                "chrome.edgeless_toolbar",
                "chrome.edgeless_zoom",
            ],
            Self::EdgelessShapePicker => &[
                "edgeless.viewport",
                "chrome.edgeless_toolbar",
                "chrome.edgeless_toolbar.shape_picker",
                "chrome.edgeless_toolbar.shape.ellipse",
                "chrome.edgeless_toolbar.shape.rounded_rect",
            ],
        }
    }
}

/// Put a freshly opened showcase session into `state`, driving it through the same input
/// and overlay events a person or an editor would send.
pub(super) fn apply_overlay_state(session: &HeadlessSession, state: OverlayState) -> Result<()> {
    const HEADING: &str = "showcase-h1";
    const QUOTE: &str = "showcase-quote";
    const INTRO: &str = "showcase-intro";
    const CODE: &str = "showcase-code";
    // Text blocks of the showcase from the quote down, last first.
    const LOWER_TEXT_BLOCKS: [&str; 12] = [
        "showcase-toggle-closed",
        "showcase-toggle-open-child",
        "showcase-toggle-open",
        "showcase-todo-done",
        "showcase-todo-open",
        "showcase-numbered-nested",
        "showcase-numbered-2",
        "showcase-numbered-1",
        "showcase-bullet-deep",
        "showcase-bullet-nested",
        "showcase-bullet",
        QUOTE,
    ];
    let mut slash_anchor = HEADING;
    session.frame()?;
    match state {
        OverlayState::Default => {}
        OverlayState::SlashMenuOpen
        | OverlayState::SlashMenuFiltered
        | OverlayState::SlashMenuEmpty => {
            session.overlay(OverlayEvent::OpenSlashMenu {
                block_id: HEADING.to_string(),
                utf16_offset: 0,
                anchor: None,
            })?;
            let query = match state {
                OverlayState::SlashMenuFiltered => "hea",
                OverlayState::SlashMenuEmpty => "zzz",
                _ => "",
            };
            if !query.is_empty() {
                session.overlay(OverlayEvent::SetSlashQuery {
                    query: query.to_string(),
                    in_document: false,
                })?;
            }
        }
        OverlayState::SlashMenuFlippedBottom => {
            // The lowest text block still in view leaves no room below its caret.
            let snapshot = session.frame()?;
            slash_anchor = LOWER_TEXT_BLOCKS
                .into_iter()
                .find(|id| snapshot.elements.contains_key(&format!("page.block.{id}")))
                .context("no showcase text block is fully in view")?;
            session.overlay(OverlayEvent::OpenSlashMenu {
                block_id: slash_anchor.to_string(),
                utf16_offset: 0,
                anchor: None,
            })?;
        }
        OverlayState::FormatToolbarOpen => {
            session.select_text(INTRO, "bold")?;
            session.view(|v, cx| v.set_software_keyboard_visible(false, cx))?;
        }
        OverlayState::FormatToolbarFlippedTop => {
            // The selected line sits right under the top bar.
            session.scroll_block_to(QUOTE, 0.0)?;
            session.select_text(QUOTE, "Every block")?;
            session.view(|v, cx| v.set_software_keyboard_visible(false, cx))?;
        }
        OverlayState::FormatToolbarLink => {
            session.select_text(INTRO, "links")?;
            session.view(|v, cx| v.set_software_keyboard_visible(false, cx))?;
            session.frame()?;
            session.overlay(OverlayEvent::Format(FormatAction::Link))?;
        }
        OverlayState::MobileKeyboardSelection => {
            session.select_text(INTRO, "bold")?;
            session.overlay(OverlayEvent::SetKeyboardToolbarVisible(true))?;
        }
        OverlayState::DragHandleHover | OverlayState::DragDropIndicator => {
            let snapshot = session.scroll_block_to(QUOTE, 40.0)?;
            let (x, y) = element_center(&snapshot, &format!("page.block.{QUOTE}"))?;
            session.pointer_move(x, y, false);
            // From the block onto its handle, which then shows its dots.
            let snapshot = session.frame()?;
            let (handle_x, handle_y) = element_center(&snapshot, "overlay.drag_handle")?;
            session.pointer_move(handle_x, handle_y, false);
            anyhow::ensure!(
                session.view(|view, _| view.overlays().drag_handle_hot())?,
                "the pointer on the drag handle does not show its dots"
            );
            if state == OverlayState::DragDropIndicator {
                // Drag the quote down to between the two numbered items.
                let target = snapshot
                    .elements
                    .get("page.block.showcase-numbered-1")
                    .context("page.block.showcase-numbered-1 missing from FrameSnapshot")?
                    .bounds;
                session.pointer_down(handle_x, handle_y);
                session.pointer_move(handle_x, target.bottom() + 2.0, true);
            }
        }
        OverlayState::ListCollapseHover => {
            let snapshot = session.scroll_block_to("showcase-bullet", 80.0)?;
            let (x, y) = element_center(&snapshot, "page.block.showcase-bullet")?;
            session.pointer_move(x, y, false);
        }
        OverlayState::CodeHover | OverlayState::CodeHoverCopied => {
            let snapshot = session.scroll_block_to(CODE, 120.0)?;
            let (x, y) = element_center(&snapshot, &format!("page.block.{CODE}"))?;
            session.pointer_move(x, y, false);
            if state == OverlayState::CodeHoverCopied {
                let snapshot = session.frame()?;
                let (x, y) = element_center(&snapshot, &format!("page.block.{CODE}.copy"))?;
                session.headless_win.simulate_click(point(px(x), px(y)));
            }
        }
        OverlayState::EdgelessSelected => {
            session.frame()?;
            session.update(|v, _, cx| {
                v.edgeless_set_selection(["collect".to_string()], cx);
            })?;
        }
        OverlayState::EdgelessMarquee => {
            session.frame()?;
            session.update(|v, _, cx| {
                v.edgeless_set_selection(["collect".to_string(), "review".to_string()], cx);
                v.edgeless_set_marquee((-120.0, -60.0), (540.0, 260.0), cx);
            })?;
        }
        OverlayState::EdgelessInlineEdit => {
            session.frame()?;
            session.update(|v, w, cx| {
                // Zoom to 1.4x centered on "collect" [818, 522, 150, 82] across both 1280px and 320px viewports.
                let pan_x = 893.0 - (f32::from(w.viewport_size().width) * 0.5) / 1.4;
                v.set_edgeless_camera(pan_x, 296.0, 1.4, cx);
                v.edgeless_begin_inline_edit("collect", w, cx);
                v.replace_and_mark_text_in_range(None, " + edit", None, w, cx);
            })?;
        }
        OverlayState::EdgelessAuthoring => {
            session.frame()?;
            // Frame open whiteboard space to the right (world x = 1220..1640, y = 220..760)
            // alongside "collect"/"review" so authored items never overlap Page Note text.
            session.update(|v, _, cx| {
                v.set_edgeless_camera(740.0, 140.0, 0.85, cx);
            })?;
            session.frame()?;
            // 1. Draw a Diamond shape in open canvas space: world (1250, 240) -> (1410, 360).
            session.update(|v, w, cx| {
                v.edgeless_select_tool(
                    playground::edgeless::EdgelessTool::Shape(
                        playground::edgeless::ShapePreset::Diamond,
                    ),
                    w,
                    cx,
                );
            })?;
            session.pointer_down(433.5, 137.0);
            session.pointer_move(569.5, 239.0, true);
            session.pointer_up(569.5, 239.0);
            session.frame()?;
            // 2. Draw a port-snapped Orthogonal Connector from "review" right port to the new Diamond.
            session.update(|v, w, cx| {
                v.edgeless_select_tool(playground::edgeless::EdgelessTool::Connector, w, cx);
            })?;
            session.pointer_down(343.0, 578.0);
            session.pointer_move(501.5, 239.0, true);
            session.pointer_up(501.5, 239.0);
            session.frame()?;
            // 3. Draw a freehand Brush stroke in open canvas space: world (1260, 520) -> (1580, 560).
            session.update(|v, w, cx| {
                v.edgeless_select_tool(playground::edgeless::EdgelessTool::Brush, w, cx);
            })?;
            session.pointer_down(442.0, 375.0);
            session.pointer_move(510.0, 345.0, true);
            session.pointer_move(590.0, 415.0, true);
            session.pointer_move(680.0, 365.0, true);
            session.pointer_up(680.0, 365.0);
            session.frame()?;
            // 4. Show marquee selection around the open-space authored elements.
            session.update(|v, _, cx| {
                v.edgeless_set_marquee((1220.0, 210.0), (1620.0, 620.0), cx);
            })?;
        }
        OverlayState::EdgelessShapePicker => {
            session.frame()?;
            session.update(|v, w, cx| {
                v.edgeless_select_tool(
                    playground::edgeless::EdgelessTool::Shape(
                        playground::edgeless::ShapePreset::Ellipse,
                    ),
                    w,
                    cx,
                );
            })?;
        }
    }
    // Past every overlay transition, short of the `Copied` label's timeout.
    session.frame()?;
    session.settle(400);
    let snapshot = session.frame()?;
    for id in state.expected() {
        anyhow::ensure!(
            snapshot.elements.contains_key(*id),
            "state {} does not show {id}",
            state.name()
        );
    }
    // A popover sits on its preferred side, or on the other one in the flipped states.
    let bounds = |id: &str| {
        snapshot
            .elements
            .get(id)
            .map(|element| element.bounds)
            .with_context(|| format!("{id} missing from FrameSnapshot"))
    };
    match state {
        OverlayState::SlashMenuOpen => {
            let (menu, anchor) = (
                bounds("overlay.slash_menu")?,
                bounds(&format!("page.block.{slash_anchor}"))?,
            );
            anyhow::ensure!(
                menu.y >= anchor.y,
                "slash menu {menu:?} is not below its block {anchor:?}"
            );
        }
        OverlayState::SlashMenuFlippedBottom => {
            let (menu, anchor) = (
                bounds("overlay.slash_menu")?,
                bounds(&format!("page.block.{slash_anchor}"))?,
            );
            anyhow::ensure!(
                menu.bottom() <= anchor.y,
                "slash menu {menu:?} did not flip above its block {anchor:?}"
            );
        }
        OverlayState::FormatToolbarOpen => {
            let (toolbar, selection) =
                (bounds("overlay.format_toolbar")?, bounds("page.selection")?);
            anyhow::ensure!(
                toolbar.bottom() <= selection.y,
                "toolbar {toolbar:?} is not above the selection {selection:?}"
            );
        }
        OverlayState::FormatToolbarFlippedTop => {
            let (toolbar, selection) =
                (bounds("overlay.format_toolbar")?, bounds("page.selection")?);
            anyhow::ensure!(
                toolbar.y >= selection.bottom(),
                "toolbar {toolbar:?} did not flip below the selection {selection:?}"
            );
        }
        OverlayState::MobileKeyboardSelection => {
            anyhow::ensure!(
                !snapshot.elements.contains_key("overlay.format_toolbar"),
                "mobile_keyboard_selection must suppress duplicate floating overlay.format_toolbar"
            );
        }
        _ => {}
    }
    Ok(())
}

/// Audit every overlay state in both themes on a regular and a narrow window.
pub(super) fn run_audit_states() -> Result<()> {
    let mut audited = 0_usize;
    for (width, height) in [(1280_u32, 800_u32), (320, 800)] {
        for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
            for state in OverlayState::ALL {
                let context = format!("{} {width}x{height} {}", state.name(), theme.as_str());
                let session = start_headless_session(
                    width,
                    height,
                    PlaygroundOptions {
                        theme,
                        ..PlaygroundOptions::default()
                    },
                )?;
                apply_overlay_state(&session, state).with_context(|| context.clone())?;
                let snapshot = session.frame()?;
                let violations = audit_frame_snapshot(&snapshot);
                anyhow::ensure!(
                    violations.is_empty(),
                    "audit violations in {context}: {violations:#?}"
                );
                // Nothing an overlay draws leaves the window.
                for (id, element) in &snapshot.elements {
                    if id.starts_with("overlay.") {
                        anyhow::ensure!(
                            element.bounds.x >= 0.0
                                && element.bounds.y >= 0.0
                                && element.bounds.right() <= snapshot.viewport.width
                                && element.bounds.bottom() <= snapshot.viewport.height,
                            "{id} leaves the window in {context}: {:?}",
                            element.bounds
                        );
                    }
                }
                audited += 1;
            }

            // Audit Edgeless default + zoomed states (0.5x, 2.0x) in both themes and widths.
            for (label, zoom_opt) in [
                ("edgeless_default", None),
                ("edgeless_zoom_0.5x", Some(0.5_f32)),
                ("edgeless_zoom_2.0x", Some(2.0_f32)),
            ] {
                let context = format!("{label} {width}x{height} {}", theme.as_str());
                let session = start_headless_session(
                    width,
                    height,
                    PlaygroundOptions {
                        theme,
                        mode: PlaygroundMode::Edgeless,
                        ..PlaygroundOptions::default()
                    },
                )?;
                let _ = session.frame()?;
                if let Some(z) = zoom_opt {
                    session.update(|v, _, cx| v.set_edgeless_zoom(z, cx))?;
                }
                let snapshot = session.frame()?;
                let violations = audit_frame_snapshot(&snapshot);
                anyhow::ensure!(
                    violations.is_empty(),
                    "audit violations in {context}: {violations:#?}"
                );
                anyhow::ensure!(
                    snapshot.elements.contains_key("edgeless.viewport"),
                    "edgeless.viewport missing in {context}"
                );
                anyhow::ensure!(
                    snapshot.elements.contains_key("chrome.edgeless_zoom"),
                    "chrome.edgeless_zoom missing in {context}"
                );
                anyhow::ensure!(
                    snapshot.elements.contains_key("chrome.edgeless_toolbar"),
                    "chrome.edgeless_toolbar missing in {context}"
                );
                audited += 1;
            }

            // Audit Edgeless interactive authoring states in both themes and widths.
            for state in OverlayState::ALL_EDGELESS {
                let context = format!("{} {width}x{height} {}", state.name(), theme.as_str());
                let session = start_headless_session(
                    width,
                    height,
                    PlaygroundOptions {
                        theme,
                        mode: PlaygroundMode::Edgeless,
                        ..PlaygroundOptions::default()
                    },
                )?;
                apply_overlay_state(&session, state).with_context(|| context.clone())?;
                let snapshot = session.frame()?;
                let violations = audit_frame_snapshot(&snapshot);
                anyhow::ensure!(
                    violations.is_empty(),
                    "audit violations in {context}: {violations:#?}"
                );
                audited += 1;
            }
        }
    }
    println!("audit-states passed: 0 violations across {audited} states");
    Ok(())
}
