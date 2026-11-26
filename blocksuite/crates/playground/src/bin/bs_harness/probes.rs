use anyhow::{Context as _, Result};
use blocksuite_playground_doc::{
    schema::{BlockSpec, ParagraphType},
    session::PageDocSession,
};
use playground::editor_session::DocPoint;
use playground::{PlaygroundOptions, PlaygroundTheme};
use std::path::PathBuf;
use std::time::Duration;
use ui::EntityInputHandler;
use ui::{audit_frame_snapshot, point, px};

use super::*;

pub(super) fn probe_geometry(s: &HeadlessSession) -> Result<()> {
    use playground::rich_text::{
        CaretPosition, RichParagraph, RichParagraphStyle, WrapAffinity, sample_paragraph,
    };
    use y_octo::{TextDeltaOp, TextInsert};
    let n = s.update(|_, w, _| -> Result<usize> {
        let mut delta = sample_paragraph()?.delta().to_vec();
        delta.push(TextDeltaOp::Insert {
            insert: TextInsert::Text("中文👨‍👩‍👧‍👦".into()),
            format: None,
        });
        let p = RichParagraph::from_delta(delta)?;
        let layout = p.layout(w.text_system(), &RichParagraphStyle::default(), 158.);
        let mut n = 0;
        let mut offset = 0;
        loop {
            for affinity in [WrapAffinity::Downstream, WrapAffinity::Upstream] {
                let pos = CaretPosition {
                    utf16_offset: offset,
                    affinity,
                };
                if affinity == WrapAffinity::Upstream
                    && !layout.lines().windows(2).any(|l| {
                        l[0].source_utf16.end == offset && l[1].source_utf16.start == offset
                    })
                {
                    continue;
                }
                let rect = layout.caret_rect(pos);
                let hit = layout.hit_test(rect.origin + point(px(0.), rect.size.height * 0.5));
                anyhow::ensure!(hit == pos, "P1 {pos:?} at {:?} hit {hit:?}", rect.origin);
                n += 1;
            }
            if offset == p.index().utf16_len() {
                break;
            }
            offset = p.index().next_grapheme_utf16(offset);
        }
        Ok(n)
    })??;
    println!("P1 {n} grapheme/affinity positions, zero mismatches");
    let long = "Wrap this line across the page. ".repeat(30);
    s.set_texts(&[&long, "", "i", &long])?;
    s.select("p0", 15)?;
    s.headless_win.request_frame();
    let goal = s.caret("p0", 15)?.x;
    let mut visited = std::collections::BTreeSet::new();
    let mut max_drift = 0f32;
    let mut steps = 0;
    let column = s.update(|_, w, _| {
        playground::block_flow::page_geometry(f32::from(w.viewport_size().width)).column_x
    })?;
    for _ in 0..100 {
        s.key("down", false, false);
        s.headless_win.request_frame();
        let (sel, x) = s.update(|v, _, _| (v.document_selection().unwrap().clone(), v.goal_x()))?;
        let drift = (x.context("P2 missing goal")? + column - f32::from(goal)).abs();
        max_drift = max_drift.max(drift);
        visited.insert(sel.focus.block_id.clone());
        steps += 1;
        if sel.focus.block_id == "p3" {
            break;
        }
    }
    anyhow::ensure!(
        steps >= 7 && visited.len() == 4 && max_drift <= 1.0,
        "P2 {steps} steps over {visited:?}, drift {max_drift}"
    );
    s.key("up", true, false);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.selection()?.anchor.block_id == "p3" && s.selection()?.focus.block_id == "p2",
        "P2 reverse extension"
    );
    println!("P2 sticky goal crossed {steps} lines, drift {max_drift:.3}px");
    Ok(())
}

pub(super) fn mouse(
    s: &HeadlessSession,
    id: &str,
    offset: u64,
    count: usize,
    drag: bool,
) -> Result<()> {
    let position = s.caret(id, offset)?;
    let mods = ui::Modifiers::default();
    if drag {
        s.headless_win
            .dispatch_input(ui::PlatformInput::MouseMove(ui::MouseMoveEvent {
                position,
                pressed_button: Some(ui::MouseButton::Left),
                modifiers: mods,
            }));
    } else {
        s.headless_win
            .dispatch_input(ui::PlatformInput::MouseDown(ui::MouseDownEvent {
                position,
                button: ui::MouseButton::Left,
                click_count: count,
                modifiers: mods,
                first_mouse: false,
            }));
    }
    s.platform.run_until_parked();
    Ok(())
}

pub(super) fn probe_selection(s: &HeadlessSession) -> Result<()> {
    let wrapped = "two beta ".repeat(12);
    s.set_texts(&["one alpha", &wrapped, "three gamma"])?;
    let original = s.doc_json()?;
    for reverse in [false, true] {
        let (a, b) = if reverse {
            (("p2", 5), ("p0", 3))
        } else {
            (("p0", 3), ("p2", 5))
        };
        mouse(s, a.0, a.1, 1, false)?;
        mouse(s, b.0, b.1, 1, true)?;
        s.headless_win.request_frame();
        let sel = s.selection()?;
        anyhow::ensure!(
            sel.anchor == DocPoint::new(a.0, a.1) && sel.focus == DocPoint::new(b.0, b.1),
            "P3 incorrect drag {sel:?}"
        );
        s.update(|v, _, _| -> Result<()> {
            let layout = v.flow_layout().context("selection layout")?;
            let rects = v.selection_rects(&layout);
            let mut previous_bottom = None;
            let mut wrapped_rows = 0;
            for id in ["p0", "p1", "p2"] {
                let b = layout.block(id).context("selected block")?;
                let lines: Vec<_> = rects
                    .iter()
                    .filter(|r| r.y >= b.y && r.bottom() <= b.y + b.body.height + 0.01)
                    .collect();
                anyhow::ensure!(
                    !lines.is_empty()
                        && lines
                            .windows(2)
                            .all(|r| (r[0].bottom() - r[1].y).abs() < 0.01),
                    "line-box gap or overlap"
                );
                anyhow::ensure!(
                    previous_bottom.is_none_or(|y| y <= lines[0].y),
                    "non-monotonic block selection"
                );
                previous_bottom = lines.last().map(|l| l.bottom());
                wrapped_rows += lines.len();
            }
            anyhow::ensure!(
                wrapped_rows == rects.len() && wrapped_rows > 3,
                "unexpected inter-block rectangles or missing wrapped lines"
            );
            Ok(())
        })??;
        s.key("backspace", false, false);
        s.headless_win.request_frame();
        let joined = s.doc_json()?;
        anyhow::ensure!(
            joined["blocks"]["p0"]["prop:text"][0]["insert"] == "one gamma"
                && joined["blocks"]["p2"].is_null(),
            "P3 incorrect joined doc"
        );
        s.key("z", false, true);
        s.headless_win.request_frame();
        anyhow::ensure!(
            s.doc_json()? == original && s.selection()? == sel,
            "P3 undo failed to restore the range and document"
        );
    }
    println!(
        "P3 two drag directions, continuous line boxes within blocks, clear margins and one undo per delete"
    );
    mouse(s, "p0", 6, 2, false)?;
    let sel = s.selection()?;
    anyhow::ensure!(
        sel.anchor.caret.utf16_offset == 4 && sel.focus.caret.utf16_offset == 9,
        "P4 double click {sel:?}"
    );
    mouse(s, "p0", 6, 3, false)?;
    let sel = s.selection()?;
    anyhow::ensure!(
        sel.anchor.caret.utf16_offset == 0 && sel.focus.caret.utf16_offset == 9,
        "P4 triple click {sel:?}"
    );
    println!("P4 double-click 4..9, triple-click 0..9");
    Ok(())
}

pub(super) fn peer_of(s: &HeadlessSession) -> Result<PageDocSession> {
    let mut peer = PageDocSession::new(playground::HOME_PAGE_ID, 31)?;
    peer.apply_remote_update_v1(&s.update(|v, _, _| {
        v.document()
            .workspace
            .page(playground::HOME_PAGE_ID)
            .unwrap()
            .encode_update_v1()
    })??)?;
    Ok(peer)
}

pub(super) fn receive(s: &HeadlessSession, bytes: &[u8]) -> Result<()> {
    s.update(|v, _, cx| {
        v.edit_document(cx, |d| {
            d.workspace
                .page_mut(playground::HOME_PAGE_ID)
                .unwrap()
                .apply_remote_update_v1(bytes)
        })
    })??;
    s.headless_win.request_frame();
    Ok(())
}

pub(super) fn probe_input(s: &HeadlessSession) -> Result<()> {
    s.set_texts(&["a"])?;
    s.select("p0", 1)?;
    s.headless_win.request_frame();
    let before = s.image()?;
    let left = s.caret("p0", 1)?;
    s.type_text("W")?;
    s.headless_win.request_frame();
    let after = s.image()?;
    let right = s.caret("p0", 2)?;
    let x0 = f32::from(left.x).ceil() as u32 + 1;
    let x1 = f32::from(right.x).floor() as u32;
    let y = f32::from(left.y) as u32;
    let ink = (x0..x1)
        .flat_map(|x| (y - 8..y + 8).map(move |y| (x, y)))
        .filter(|&(x, y)| before.get_pixel(x, y) != after.get_pixel(x, y))
        .count();
    anyhow::ensure!(ink > 0, "P5 next frame has no new glyph ink");
    println!("P5 {ink} changed glyph pixels after one frame");
    s.set_texts(&["ab"])?;
    s.select("p0", 1)?;
    s.headless_win.request_frame();
    let mut peer = peer_of(s)?;
    let initial = s.doc_json()?;
    let state = |s: &HeadlessSession| -> Result<Vec<u8>> {
        Ok(s.update(|v, _, _| {
            v.document()
                .workspace
                .page(playground::HOME_PAGE_ID)
                .unwrap()
                .encode_state_vector_v1()
        })??)
    };
    let vector = state(s)?;
    for pre in ["ni", "nihao"] {
        s.update(|v, w, cx| v.replace_and_mark_text_in_range(None, pre, None, w, cx))?;
        s.headless_win.request_frame();
        anyhow::ensure!(
            state(s)? == vector && s.doc_json()? == initial,
            "P6 preedit changed CRDT"
        );
    }
    let update = peer
        .insert_text("p0", "prop:text", 0, "R", 10)?
        .unwrap()
        .update;
    receive(s, &update)?;
    let r = s.update(|v, w, cx| v.marked_text_range(w, cx))?;
    anyhow::ensure!(r == Some(2..7), "P6 shifted preedit {r:?}");
    s.type_text("你好")?;
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.doc_json()?["blocks"]["p0"]["prop:text"][0]["insert"] == "Ra你好b",
        "P6 final placement"
    );
    println!("P6 no preedit CRDT changes, remote insertion shifted commit to UTF-16 offset 2");
    s.set_texts(&[""])?;
    s.select("p0", 0)?;
    s.headless_win.request_frame();
    for text in ["a", "b", "c"] {
        s.type_text(text)?;
        s.platform.advance_clock(Duration::from_millis(100));
    }
    s.platform.advance_clock(Duration::from_millis(600));
    s.type_text("d")?;
    s.key("z", false, true);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.doc_json()?["blocks"]["p0"]["prop:text"][0]["insert"] == "abc",
        "P7 late edit was merged"
    );
    s.key("z", false, true);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.doc_json()?["blocks"]["p0"]["prop:text"] == serde_json::json!([])
            && s.selection()?.focus.caret.utf16_offset == 0,
        "P7 early edits did not merge"
    );
    s.key("z", true, true);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.selection()?.focus.caret.utf16_offset == 3,
        "P7 redo caret"
    );
    println!("P7 100ms typing merged, 600ms gap split, redo caret restored");
    s.set_texts(&["ab"])?;
    s.select("p0", 1)?;
    s.headless_win.request_frame();
    let mut peer = peer_of(s)?;
    s.type_text("L")?;
    let update = peer
        .insert_text("p0", "prop:text", 0, "R", 10)?
        .unwrap()
        .update;
    receive(s, &update)?;
    s.key("z", false, true);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.doc_json()?["blocks"]["p0"]["prop:text"][0]["insert"] == "Rab"
            && s.selection()?.focus.caret.utf16_offset == 2,
        "P8 remote edit or local selection lost"
    );
    println!("P8 remote R survived local undo, caret restored at offset 2");
    Ok(())
}

pub(super) fn probe_anchor(s: &HeadlessSession) -> Result<()> {
    s.set_texts(&["A reading paragraph."; 120])?;
    s.select("p70", 4)?;
    s.headless_win.request_frame();
    let before = s.caret("p70", 4)?;
    let mut peer = peer_of(s)?;
    let update = peer
        .add_block(
            "new",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Inserted above fold".into(),
            },
            Some("note"),
            Some(0),
            50,
        )?
        .unwrap()
        .update;
    receive(s, &update)?;
    let shift = f32::from(s.caret("p70", 4)?.y - before.y).abs();
    anyhow::ensure!(shift <= 0.5, "P9 anchor moved {shift}px");
    println!("P9 remote insertion above fold, anchor shifted {shift:.3}px");
    Ok(())
}

pub(super) fn replay_editing() -> Result<()> {
    let mut reference = None;
    for fps in [60, 120, 24, 7] {
        let s = start_headless_session(800, 600, Default::default())?;
        s.set_texts(&["draft", "second"])?;
        s.select("p0", 5)?;
        s.headless_win.request_frame();
        s.type_text(" one")?;
        s.key("enter", false, false);
        s.headless_win.request_frame();
        s.type_text("two")?;
        s.headless_win.request_frame();
        for id in ["chrome.mode_switcher.edgeless", "chrome.mode_switcher.page"] {
            let p = s.update(|_, w, _| {
                let b = w.frame_snapshot().elements[id].bounds;
                point(px(b.x + b.width / 2.), px(b.y + b.height / 2.))
            })?;
            s.headless_win.simulate_click(p);
            for _ in 0..fps {
                s.platform
                    .advance_clock(Duration::from_secs_f64(1.0 / fps as f64));
                s.headless_win.request_frame();
            }
        }
        let frame = s.update(|_, w, _| serde_json::to_vec(w.frame_snapshot()))??;
        let terminal = (frame, serde_json::to_vec(&s.doc_json()?)?);
        if let Some(expected) = &reference {
            anyhow::ensure!(
                &terminal == expected,
                "P10 terminal state differs at {fps}fps"
            );
        } else {
            reference = Some(terminal);
        }
    }
    println!("P10 identical terminal frame and document bytes at 60/120/24/7 fps");
    Ok(())
}

pub(super) fn render_editor(dir: PathBuf) -> Result<()> {
    std::fs::create_dir_all(&dir)?;
    for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
        let s = start_headless_session(
            1280,
            800,
            PlaygroundOptions {
                theme,
                ..Default::default()
            },
        )?;
        s.headless_win.request_frame();
        let save = |name: &str| -> Result<()> {
            s.headless_win.request_frame();
            let violations = s.update(|_, w, _| audit_frame_snapshot(w.frame_snapshot()))?;
            anyhow::ensure!(
                violations.is_empty(),
                "editor render violations: {violations:?}"
            );
            s.image()?
                .save(dir.join(format!("{name}-{}.png", theme.as_str())))?;
            Ok(())
        };
        mouse(&s, "showcase-h1", 4, 1, false)?;
        save("caret")?;
        mouse(&s, "showcase-quote", 15, 1, true)?;
        save("selection")?;
        s.select("showcase-h1", 9)?;
        s.update(|v, w, cx| v.replace_and_mark_text_in_range(None, " nihao", None, w, cx))?;
        save("preedit")?;
        s.update(|v, w, cx| v.replace_text_in_range(None, " 你好", w, cx))?;
        s.select("showcase-intro", 0)?;
        s.type_text("- ")?;
        anyhow::ensure!(
            s.doc_json()?["blocks"][&s.selection()?.focus.block_id]["sys:flavour"] == "affine:list",
            "list conversion"
        );
        save("markdown")?;
    }
    Ok(())
}

fn probe_table_cell_o1_keystroke() -> Result<()> {
    let mut state = DocState::new("doc:probe-table-o1", 71)?;
    state
        .workspace
        .create_page(playground::HOME_PAGE_ID, "Table O(1) Probe", 1)?;
    {
        let page = state.workspace.ensure_page(playground::HOME_PAGE_ID)?;
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Table O(1) Probe".into(),
            },
            None,
            None,
            1,
        )?;
        page.add_block(
            "note",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )?;
        let big_cell = "abcdefghij".repeat(10_000);
        page.add_block(
            "tbl",
            BlockSpec::Table {
                rows: vec![
                    vec!["Header".into(), "Notes".into()],
                    vec!["Row 1".into(), big_cell],
                ],
            },
            Some("note"),
            None,
            3,
        )?;
        for i in 0..3_000 {
            page.add_block(
                format!("p-{i}"),
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: format!("Sibling paragraph {i}"),
                },
                Some("note"),
                None,
                4,
            )?;
        }
        page.stop_capturing()?;
    }

    let s = start_headless_session(1280, 800, PlaygroundOptions::default())?;
    s.view(|v, cx| v.set_document(state, cx))?;
    s.frame()?;

    // Verify single-block O(1) table read matches full snapshot.
    let single_ok = s.view(|v, _| {
        let page = v
            .document()
            .workspace
            .page(playground::HOME_PAGE_ID)
            .expect("page");
        let t = page
            .read_table_block("tbl")
            .expect("read_table_block")
            .expect("some table");
        t.cells
            .get(&("row-1".into(), "col-1".into()))
            .is_some_and(|c| c.text.plain.len() == 100_000)
    })?;
    anyhow::ensure!(single_ok, "read_table_block must decode 100k-char cell");

    s.overlay(OverlayEvent::FocusTableCell {
        block_id: "tbl".into(),
        row_id: "row-1".into(),
        column_id: "col-1".into(),
        screen_pos: None,
    })?;
    s.frame()?;
    s.update(|v, w, cx| v.replace_text_in_range(None, "Z", w, cx))?;
    s.frame()?;
    let (laid_out, cell_len) = s.view(|v, _| {
        let count = v.flow_layout().unwrap().stats.laid_out;
        let len = v
            .page_snapshot()
            .and_then(|snap| snap.block("tbl"))
            .and_then(|n| match &n.content {
                BlockContent::Table(t) => t
                    .cells
                    .get(&("row-1".into(), "col-1".into()))
                    .map(|c| c.text.plain.len()),
                _ => None,
            })
            .unwrap_or(0);
        (count, len)
    })?;
    anyhow::ensure!(
        laid_out == 1 && cell_len == 100_001,
        "expected single-block relayout (1) and 100001-char cell, got laid_out={laid_out}, len={cell_len}"
    );
    println!(
        "P6 table cell O(1) keystroke over 3000 siblings + 100k-char cell: laid_out={laid_out}"
    );
    Ok(())
}

pub(super) fn run_probes() -> Result<()> {
    let s = start_headless_session(640, 720, Default::default())?;
    probe_geometry(&s)?;
    probe_selection(&s)?;
    probe_input(&s)?;
    probe_anchor(&s)?;
    probe_table_cell_o1_keystroke()?;
    replay_editing()
}
