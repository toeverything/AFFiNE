//! Offscreen PNG evidence renderer for Edgeless `mindmap`, mobile read-only Edgeless viewport,
//! mobile single-toolbar text selection, and untruncated `embed-synced-doc` / `embed-linked-doc`.

use std::{path::Path, rc::Rc};

use anyhow::Result;
use blocksuite_playground_doc::schema::{
    BlockSpec, MindmapNodeSpec, ParagraphType, SurfaceElementSpec,
};
use playground::{
    HOME_PAGE_ID, PlaygroundMode, PlaygroundOptions, PlaygroundTheme, overlays::OverlayEvent,
    room_client::DocState, seed_showcase_doc,
};

use super::{s3_evidence_fixtures::save_session_png, start_headless_session};

pub(super) fn render_edgeless_evidence(out_dir: &Path) -> Result<()> {
    // 10. Mobile 390x844 non-collapsed showcase selection (matching `dbl.png` scenario):
    //     single bottom `KeyboardToolbar` with horizontal scroll strip (no `...` button,
    //     no duplicate floating `FormatToolbar`).
    {
        let state = seed_showcase_doc()?;
        let session = start_headless_session(
            390,
            844,
            PlaygroundOptions {
                theme: PlaygroundTheme::Light,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| v.set_document(state, cx))?;
        session.frame()?;
        session.select_text("showcase-intro", "collaborator's")?;
        session.overlay(OverlayEvent::SetKeyboardToolbarVisible(true))?;
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("10-mobile-selection-single-toolbar.png"),
            "10-mobile-selection-single-toolbar",
        )?;
    }

    // 11. Page-mode `embed-synced-doc` with 8 nested blocks (zero truncation, no gray fill or
    //     left bar) + `embed-linked-doc` with local timezone `"Updated YYYY-MM-DD HH:MM"`.
    {
        let mut state = DocState::new("embed-parity", 91)?;
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Embedded Documents Parity", 1)?;
        state
            .workspace
            .create_page("doc:deep-synced", "Synced Architecture Spec", 2)?;
        {
            let synced = state.workspace.ensure_page("doc:deep-synced")?;
            synced.add_block(
                "ds-root",
                BlockSpec::Page {
                    title: "Synced Architecture Spec".into(),
                },
                None,
                None,
                1,
            )?;
            synced.add_block(
                "ds-note",
                BlockSpec::Note { xywh: None },
                Some("ds-root"),
                None,
                2,
            )?;
            for idx in 1..=8 {
                synced.add_block(
                    format!("ds-p{idx}"),
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: format!(
                            "Section {idx}: Full nested synced document block rendered inline without truncation."
                        ),
                    },
                    Some("ds-note"),
                    None,
                    2 + idx,
                )?;
            }
        }
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID)?;
            page.add_block(
                "ep-root",
                BlockSpec::Page {
                    title: "Embedded Documents Parity".into(),
                },
                None,
                None,
                1,
            )?;
            page.add_block(
                "ep-note",
                BlockSpec::Note { xywh: None },
                Some("ep-root"),
                None,
                2,
            )?;
            page.add_block(
                "ep-linked",
                BlockSpec::EmbedLinkedDoc {
                    page_id: "doc:linked-spec".into(),
                    style: "horizontal".into(),
                    caption: String::new(),
                },
                Some("ep-note"),
                None,
                3,
            )?;
            page.add_block(
                "ep-synced",
                BlockSpec::EmbedSyncedDoc {
                    page_id: "doc:deep-synced".into(),
                    caption: String::new(),
                },
                Some("ep-note"),
                None,
                4,
            )?;
        }
        state.workspace.create_page(
            "doc:linked-spec",
            "Q4 Mobile Release Checklist",
            1_795_703_400_000,
        )?;
        {
            let linked = state.workspace.ensure_page("doc:linked-spec")?;
            linked.add_block(
                "ls-root",
                BlockSpec::Page {
                    title: "Q4 Mobile Release Checklist".into(),
                },
                None,
                None,
                1,
            )?;
            linked.add_block(
                "ls-note",
                BlockSpec::Note { xywh: None },
                Some("ls-root"),
                None,
                2,
            )?;
            linked.add_block(
                "ls-p1",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Cross-platform Web, iOS, and Android parity verification gates.".into(),
                },
                Some("ls-note"),
                None,
                3,
            )?;
        }
        let session = start_headless_session(
            880,
            760,
            PlaygroundOptions {
                theme: PlaygroundTheme::Light,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| {
            v.set_calendar_clock(Some(Rc::new(|| (1_795_710_600_000, 480))));
            v.set_document(state, cx);
        })?;
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("11-embed-synced-8-blocks-untruncated.png"),
            "11-embed-synced-8-blocks-untruncated",
        )?;
    }

    // 12 & 13. Edgeless Surface `mindmap` (`Balance` layout, `StyleOne`, collapsed branch stub,
    //          and RTL `gfx/text` shape) in desktop 1280x800 and mobile read-only 390x844.
    let build_mindmap_state = || -> Result<DocState> {
        let mut state = DocState::new("edgeless-mindmap", 99)?;
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Edgeless Mindmap Canvas", 1)?;
        let page = state.workspace.ensure_page(HOME_PAGE_ID)?;
        page.add_block(
            "m-root",
            BlockSpec::Page {
                title: "Edgeless Mindmap Canvas".into(),
            },
            None,
            None,
            1,
        )?;
        page.add_block("m-surf", BlockSpec::Surface, Some("m-root"), None, 2)?;
        for (id, idx, text) in [
            ("mm-center", "a0", "AFFiNE Mobile"),
            ("mm-r1", "a1", "Web Host"),
            ("mm-r1a", "a2", "Workers Wasm"),
            ("mm-r2", "a3", "iOS Host"),
            ("mm-l1", "a4", "Android Host"),
            ("mm-l2", "a5", "\u{0661}A RTL Node"),
            ("mm-hidden", "a6", "Collapsed Leaf"),
        ] {
            page.add_surface_element(
                "m-surf",
                id,
                idx,
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[0,0,184,52]".into(),
                    seed: 17,
                    filled: true,
                    text: Some(text.into()),
                },
                3,
            )?;
        }
        page.add_surface_element(
            "m-surf",
            "mm-group",
            "a7",
            SurfaceElementSpec::Mindmap {
                seed: 29,
                layout_type: 2,
                style: 1,
                children: vec![
                    (
                        "mm-center".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: None,
                            collapsed: false,
                        },
                    ),
                    (
                        "mm-r1".into(),
                        MindmapNodeSpec {
                            index: "a1".into(),
                            parent: Some("mm-center".into()),
                            collapsed: false,
                        },
                    ),
                    (
                        "mm-r1a".into(),
                        MindmapNodeSpec {
                            index: "a2".into(),
                            parent: Some("mm-r1".into()),
                            collapsed: false,
                        },
                    ),
                    (
                        "mm-r2".into(),
                        MindmapNodeSpec {
                            index: "a3".into(),
                            parent: Some("mm-center".into()),
                            collapsed: true,
                        },
                    ),
                    (
                        "mm-hidden".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: Some("mm-r2".into()),
                            collapsed: false,
                        },
                    ),
                    (
                        "mm-l1".into(),
                        MindmapNodeSpec {
                            index: "a4".into(),
                            parent: Some("mm-center".into()),
                            collapsed: false,
                        },
                    ),
                    (
                        "mm-l2".into(),
                        MindmapNodeSpec {
                            index: "a5".into(),
                            parent: Some("mm-center".into()),
                            collapsed: false,
                        },
                    ),
                ],
            },
            4,
        )?;
        Ok(state)
    };

    {
        let session = start_headless_session(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                theme: PlaygroundTheme::Light,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| {
            v.set_document(build_mindmap_state().unwrap(), cx);
        })?;
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("12-edgeless-mindmap-balance.png"),
            "12-edgeless-mindmap-balance",
        )?;
    }

    {
        let session = start_headless_session(
            390,
            844,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                theme: PlaygroundTheme::Light,
                edgeless_readonly: true,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| {
            v.set_document(build_mindmap_state().unwrap(), cx);
        })?;
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("13-mobile-edgeless-readonly-390x844.png"),
            "13-mobile-edgeless-readonly-390x844",
        )?;
    }

    Ok(())
}
