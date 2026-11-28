//! Offscreen PNG evidence renderer for `affine:database` desktop authoring capabilities:
//! column header type menu, Select/Multi-select tag picker, Filter/Sort active chips,
//! Kanban in-place editing, and Calendar day `+` creation + reschedule preview (Light & Dark).

use std::{collections::BTreeMap, path::Path};

use anyhow::Result;
use blocksuite_playground_doc::schema::{
    BlockSpec, DatabaseCellSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec, ParagraphType,
};
use playground::{
    HOME_PAGE_ID, PlaygroundOptions, PlaygroundTheme,
    database::{
        ActiveCellEditor, ActiveToolbarPanel, CalendarDragState, ColumnMenuState, FilterDraftState,
    },
    room_client::DocState,
};
use serde_json::json;

use super::{
    s3_evidence_fixtures::{new_doc_state, save_session_png},
    start_headless_session,
};

fn build_database_evidence_doc(with_filter_sort: bool) -> Result<(DocState, String)> {
    let mut state = new_doc_state("Database Authoring Showcase")?;
    let db_id = "db-evidence".to_string();
    {
        let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
        let mut cells = BTreeMap::new();
        cells.insert(
            "row-1".into(),
            BTreeMap::from([
                (
                    "col-status".into(),
                    DatabaseCellSpec::Text("opt-doing".into()),
                ),
                (
                    "col-tags".into(),
                    DatabaseCellSpec::MultiSelect(vec!["tag-ui".into(), "tag-rust".into()]),
                ),
                ("col-budget".into(), DatabaseCellSpec::Number(4800.0)),
                ("col-progress".into(), DatabaseCellSpec::Integer(72)),
                ("col-done".into(), DatabaseCellSpec::Bool(false)),
                (
                    "col-due".into(),
                    DatabaseCellSpec::Integer(1_773_014_400_000),
                ),
                (
                    "col-end".into(),
                    DatabaseCellSpec::Integer(1_773_187_200_000),
                ),
                (
                    "col-url".into(),
                    DatabaseCellSpec::Text("https://affine.pro".into()),
                ),
            ]),
        );
        cells.insert(
            "row-2".into(),
            BTreeMap::from([
                (
                    "col-status".into(),
                    DatabaseCellSpec::Text("opt-todo".into()),
                ),
                (
                    "col-tags".into(),
                    DatabaseCellSpec::MultiSelect(vec!["tag-core".into()]),
                ),
                ("col-budget".into(), DatabaseCellSpec::Number(2400.0)),
                ("col-progress".into(), DatabaseCellSpec::Integer(35)),
                ("col-done".into(), DatabaseCellSpec::Bool(false)),
                (
                    "col-due".into(),
                    DatabaseCellSpec::Integer(1_773_273_600_000),
                ),
                (
                    "col-url".into(),
                    DatabaseCellSpec::Text("https://docs.affine.pro".into()),
                ),
            ]),
        );
        cells.insert(
            "row-3".into(),
            BTreeMap::from([
                (
                    "col-status".into(),
                    DatabaseCellSpec::Text("opt-done".into()),
                ),
                (
                    "col-tags".into(),
                    DatabaseCellSpec::MultiSelect(vec!["tag-ui".into()]),
                ),
                ("col-budget".into(), DatabaseCellSpec::Number(6200.0)),
                ("col-progress".into(), DatabaseCellSpec::Integer(100)),
                ("col-done".into(), DatabaseCellSpec::Bool(true)),
                (
                    "col-due".into(),
                    DatabaseCellSpec::Integer(1_773_532_800_000),
                ),
                (
                    "col-url".into(),
                    DatabaseCellSpec::Text("https://github.com/toeverything".into()),
                ),
            ]),
        );

        let table_raw = if with_filter_sort {
            json!({
                "columns": [
                    { "id": "title", "width": 200 },
                    { "id": "col-status", "width": 120 },
                    { "id": "col-tags", "width": 150 },
                    { "id": "col-budget", "width": 110 },
                    { "id": "col-progress", "width": 130 },
                    { "id": "col-done", "width": 80 }
                ],
                "filter": {
                    "type": "group",
                    "op": "and",
                    "conditions": [{
                        "type": "filter",
                        "left": { "type": "ref", "name": "col-budget" },
                        "function": "greatThan",
                        "args": [{ "type": "constant", "value": 2000 }]
                    }]
                },
                "sort": {
                    "sortBy": [{ "ref": { "type": "ref", "name": "col-budget" }, "desc": true }]
                }
            })
        } else {
            json!({
                "columns": [
                    { "id": "title", "width": 200 },
                    { "id": "col-status", "width": 120 },
                    { "id": "col-tags", "width": 150 },
                    { "id": "col-budget", "width": 110 },
                    { "id": "col-progress", "width": 130 },
                    { "id": "col-done", "width": 80 }
                ]
            })
        };

        page.add_block(
            &db_id,
            BlockSpec::Database(DatabaseSpec {
                title: "Q1 Release Roadmap".into(),
                columns: vec![
                    DatabaseColumnSpec {
                        id: "title".into(),
                        column_type: "title".into(),
                        name: "Task".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "col-status".into(),
                        column_type: "select".into(),
                        name: "Status".into(),
                        data: json!({
                            "options": [
                                { "id": "opt-todo", "value": "Todo", "color": "var(--affine-tag-blue)" },
                                { "id": "opt-doing", "value": "In Progress", "color": "var(--affine-tag-orange)" },
                                { "id": "opt-done", "value": "Done", "color": "var(--affine-tag-green)" }
                            ]
                        }),
                    },
                    DatabaseColumnSpec {
                        id: "col-tags".into(),
                        column_type: "multi-select".into(),
                        name: "Tags".into(),
                        data: json!({
                            "options": [
                                { "id": "tag-ui", "value": "UI", "color": "var(--affine-tag-purple)" },
                                { "id": "tag-rust", "value": "Rust", "color": "var(--affine-tag-teal)" },
                                { "id": "tag-core", "value": "Core", "color": "var(--affine-tag-yellow)" }
                            ]
                        }),
                    },
                    DatabaseColumnSpec {
                        id: "col-budget".into(),
                        column_type: "number".into(),
                        name: "Budget".into(),
                        data: json!({ "format": "currencyUSD" }),
                    },
                    DatabaseColumnSpec {
                        id: "col-progress".into(),
                        column_type: "progress".into(),
                        name: "Progress".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "col-done".into(),
                        column_type: "checkbox".into(),
                        name: "Done".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "col-due".into(),
                        column_type: "date".into(),
                        name: "Start".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "col-end".into(),
                        column_type: "date".into(),
                        name: "End".into(),
                        data: json!({}),
                    },
                    DatabaseColumnSpec {
                        id: "col-url".into(),
                        column_type: "link".into(),
                        name: "URL".into(),
                        data: json!({}),
                    },
                ],
                views: vec![
                    DatabaseViewSpec {
                        id: "v-table".into(),
                        name: "Table".into(),
                        mode: "table".into(),
                        raw: table_raw,
                    },
                    DatabaseViewSpec {
                        id: "v-kanban".into(),
                        name: "Kanban".into(),
                        mode: "kanban".into(),
                        raw: json!({
                            "groupBy": {
                                "type": "groupBy",
                                "columnId": "col-status",
                                "name": "select"
                            },
                            "columns": [
                                { "id": "col-tags" },
                                { "id": "col-progress" },
                                { "id": "col-budget" },
                                { "id": "col-done" }
                            ]
                        }),
                    },
                    DatabaseViewSpec {
                        id: "v-cal".into(),
                        name: "Calendar".into(),
                        mode: "calendar".into(),
                        raw: json!({
                            "date": {
                                "startColumnId": "col-due",
                                "endColumnId": "col-end"
                            }
                        }),
                    },
                ],
                cells,
            }),
            Some("p-note"),
            None,
            10,
        )?;

        for (idx, (id, title)) in [
            ("row-1", "Column Schema & Type Switcher"),
            ("row-2", "Filter / Sort / Group Controls"),
            ("row-3", "Calendar Quick Add & Reschedule"),
        ]
        .into_iter()
        .enumerate()
        {
            page.add_block(
                id,
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: title.into(),
                },
                Some(&db_id),
                None,
                20 + idx as u64,
            )?;
        }
    }
    Ok((state, db_id))
}

pub(super) fn render_db_authoring_evidence(out_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(out_dir)?;

    for (theme, suffix) in [
        (PlaygroundTheme::Light, "light"),
        (PlaygroundTheme::Dark, "dark"),
    ] {
        // 1. Table + Column header menu & Type switcher submenu.
        {
            let (state, db_id) = build_database_evidence_doc(false)?;
            let session = start_headless_session(
                1280,
                760,
                PlaygroundOptions {
                    theme,
                    ..Default::default()
                },
            )?;
            session.view(|v, cx| {
                v.set_document(state, cx);
                v.update_database_authoring(
                    &db_id,
                    |auth| {
                        auth.column_menu = Some(ColumnMenuState {
                            column_id: "col-status".into(),
                            rename_draft: "Status".into(),
                            type_submenu_open: true,
                        });
                    },
                    cx,
                );
            })?;
            session.settle(120);
            save_session_png(
                &session,
                &out_dir.join(format!("db-column-menu-{suffix}.png")),
                &format!("db-column-menu-{suffix}"),
            )?;
        }

        // 2. Table + Multi-select tag picker popover with create-new pill preview.
        {
            let (state, db_id) = build_database_evidence_doc(false)?;
            let session = start_headless_session(
                1280,
                760,
                PlaygroundOptions {
                    theme,
                    ..Default::default()
                },
            )?;
            session.view(|v, cx| {
                v.set_document(state, cx);
                v.update_database_authoring(
                    &db_id,
                    |auth| {
                        auth.active_cell = Some(ActiveCellEditor {
                            row_id: "row-1".into(),
                            column_id: "col-tags".into(),
                            col_type: "multi-select".into(),
                            draft: String::new(),
                            error: None,
                            select_filter: "Urgent".into(),
                        });
                    },
                    cx,
                );
            })?;
            session.settle(120);
            save_session_png(
                &session,
                &out_dir.join(format!("db-select-picker-{suffix}.png")),
                &format!("db-select-picker-{suffix}"),
            )?;
        }

        // 3. Table + Active Filter & Sort chips + open Filter rule panel.
        {
            let (state, db_id) = build_database_evidence_doc(true)?;
            let session = start_headless_session(
                1280,
                760,
                PlaygroundOptions {
                    theme,
                    ..Default::default()
                },
            )?;
            session.view(|v, cx| {
                v.set_document(state, cx);
                v.update_database_authoring(
                    &db_id,
                    |auth| {
                        auth.toolbar_panel = Some(ActiveToolbarPanel::Filter);
                        auth.filter_draft = FilterDraftState {
                            column_id: "col-status".into(),
                            function: "is".into(),
                            value: "In Progress".into(),
                        };
                    },
                    cx,
                );
            })?;
            session.settle(120);
            save_session_png(
                &session,
                &out_dir.join(format!("db-filter-sort-{suffix}.png")),
                &format!("db-filter-sort-{suffix}"),
            )?;
        }

        // 4. Kanban view + in-place Multi-select tag picker + lane "+ New record".
        {
            let (state, db_id) = build_database_evidence_doc(false)?;
            let session = start_headless_session(
                1280,
                760,
                PlaygroundOptions {
                    theme,
                    ..Default::default()
                },
            )?;
            session.view(|v, cx| {
                v.set_document(state, cx);
                v.set_database_active_view(&db_id, "v-kanban", cx);
                v.update_database_authoring(
                    &db_id,
                    |auth| {
                        auth.active_cell = Some(ActiveCellEditor {
                            row_id: "row-1".into(),
                            column_id: "col-tags".into(),
                            col_type: "multi-select".into(),
                            draft: String::new(),
                            error: None,
                            select_filter: String::new(),
                        });
                    },
                    cx,
                );
            })?;
            session.settle(120);
            save_session_png(
                &session,
                &out_dir.join(format!("db-kanban-inplace-{suffix}.png")),
                &format!("db-kanban-inplace-{suffix}"),
            )?;
        }

        // 5. Calendar view + day "+" quick-add buttons + reschedule drop target highlight.
        {
            let (state, db_id) = build_database_evidence_doc(false)?;
            let session = start_headless_session(
                1280,
                820,
                PlaygroundOptions {
                    theme,
                    ..Default::default()
                },
            )?;
            session.view(|v, cx| {
                v.set_document(state, cx);
                v.set_database_active_view(&db_id, "v-cal", cx);
                v.update_database_authoring(
                    &db_id,
                    |auth| {
                        auth.calendar_drag = Some(CalendarDragState {
                            row_id: "row-2".into(),
                            origin_day: 20524,
                            target_day: 20526,
                        });
                    },
                    cx,
                );
            })?;
            session.settle(120);
            save_session_png(
                &session,
                &out_dir.join(format!("db-calendar-edit-{suffix}.png")),
                &format!("db-calendar-edit-{suffix}"),
            )?;
        }

        // 6. Synthetic corpus-fidelity fixture: legacy title-less table + string-encoded numbers
        //    + formatted rich-text cells (bold/italic/color/highlight/link/@reference/multiline).
        {
            let (state, _db_id) = build_corpus_fidelity_doc()?;
            let session = start_headless_session(
                1280,
                680,
                PlaygroundOptions {
                    theme,
                    ..Default::default()
                },
            )?;
            session.view(|v, cx| {
                v.set_document(state, cx);
            })?;
            session.settle(120);
            save_session_png(
                &session,
                &out_dir.join(format!("db-corpus-fidelity-{suffix}.png")),
                &format!("db-corpus-fidelity-{suffix}"),
            )?;
        }
    }

    Ok(())
}

/// Build a 100% synthetic anonymized document exercising legacy title-less columns, string-encoded
/// numbers (`"42"`, `"-3.14"`, `""`), and rich-text cells with inline formatting + `@reference`.
fn build_corpus_fidelity_doc() -> Result<(DocState, String)> {
    let mut state = DocState::new("db-corpus-fidelity", 19)?;
    state.workspace.initialize_meta()?;
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Database Corpus Fidelity", 1_773_000_000_000)?;
    state
        .workspace
        .create_page("ref-arch-spec", "Architecture Spec", 1_773_000_000_000)?;
    let page = state.workspace.ensure_page(HOME_PAGE_ID)?;
    page.add_block(
        "p-root",
        BlockSpec::Page {
            title: "Database Corpus Fidelity".into(),
        },
        None,
        None,
        1,
    )?;
    page.add_block(
        "p-note",
        BlockSpec::Note { xywh: None },
        Some("p-root"),
        None,
        2,
    )?;
    let db_id = "db-fidelity".to_string();
    let mut cells = BTreeMap::new();
    cells.insert(
        "f-row-1".into(),
        BTreeMap::from([
            ("c-amt".into(), DatabaseCellSpec::Text("42".into())),
            ("c-stage".into(), DatabaseCellSpec::Text("opt-ready".into())),
        ]),
    );
    cells.insert(
        "f-row-2".into(),
        BTreeMap::from([
            ("c-amt".into(), DatabaseCellSpec::Text("-3.14".into())),
            ("c-stage".into(), DatabaseCellSpec::Text("opt-draft".into())),
        ]),
    );
    cells.insert(
        "f-row-3".into(),
        BTreeMap::from([
            ("c-amt".into(), DatabaseCellSpec::Text(String::new())),
            ("c-stage".into(), DatabaseCellSpec::Text("opt-ready".into())),
        ]),
    );
    page.add_block(
        &db_id,
        BlockSpec::Database(DatabaseSpec {
            title: "Legacy Metrics (No Title Column)".into(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "c-rich".into(),
                    column_type: "rich-text".into(),
                    name: "Formatted Notes".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "c-amt".into(),
                    column_type: "number".into(),
                    name: "Amount".into(),
                    data: json!({ "format": "number" }),
                },
                DatabaseColumnSpec {
                    id: "c-stage".into(),
                    column_type: "select".into(),
                    name: "Stage".into(),
                    data: json!({
                        "options": [
                            { "id": "opt-ready", "value": "Ready", "color": "var(--affine-tag-green)" },
                            { "id": "opt-draft", "value": "Draft", "color": "var(--affine-tag-blue)" }
                        ]
                    }),
                },
            ],
            views: vec![DatabaseViewSpec {
                id: "v-table".into(),
                name: "Table".into(),
                mode: "table".into(),
                raw: json!({
                    "columns": [
                        { "id": "c-rich", "width": 360 },
                        { "id": "c-amt", "width": 120 },
                        { "id": "c-stage", "width": 140 }
                    ]
                }),
            }],
            cells,
        }),
        Some("p-note"),
        None,
        3,
    )?;
    for id in ["f-row-1", "f-row-2", "f-row-3"] {
        page.add_block(
            id,
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
            Some(&db_id),
            None,
            4,
        )?;
    }
    // Populate Y.Text rich-text cells with bold/italic/color/highlight/link/@reference & multiline.
    let write_rich_cell = |page: &mut blocksuite_playground_doc::session::PageDocSession,
                           row_id: &str,
                           ops: Vec<y_octo::TextDeltaOp>|
     -> Result<()> {
        let row_path = y_octo::TypePath::root("blocks")
            .key(&db_id)
            .key("prop:cells")
            .key(row_id);
        page.inner_mut()
            .begin_tx(y_octo::SessionTxOrigin::Untracked)?;
        page.inner_mut().map_set(
            &y_octo::TypeTarget::Path(row_path),
            "c-rich".into(),
            y_octo::SessionValue::Map(vec![
                (
                    "columnId".into(),
                    y_octo::SessionValue::Any(y_octo::Any::String("c-rich".into())),
                ),
                ("value".into(), y_octo::SessionValue::Text(ops)),
            ]),
        )?;
        page.inner_mut().commit_tx()?;
        Ok(())
    };

    let attrs = |pairs: &[(&str, y_octo::Any)]| -> Option<y_octo::TextAttributes> {
        let mut m = y_octo::TextAttributes::default();
        for (k, v) in pairs {
            m.insert((*k).to_string(), v.clone());
        }
        Some(m)
    };
    write_rich_cell(
        page,
        "f-row-1",
        vec![
            y_octo::TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text("Bold".into()),
                format: attrs(&[("bold", y_octo::Any::True)]),
            },
            y_octo::TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text(" + ".into()),
                format: None,
            },
            y_octo::TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text("Highlighted".into()),
                format: attrs(&[
                    (
                        "color",
                        y_octo::Any::String("var(--affine-text-highlight-foreground-blue)".into()),
                    ),
                    (
                        "background",
                        y_octo::Any::String("var(--affine-text-highlight-blue)".into()),
                    ),
                ]),
            },
            y_octo::TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text(" + ".into()),
                format: None,
            },
            y_octo::TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text("Docs".into()),
                format: attrs(&[("link", y_octo::Any::String("https://affine.pro".into()))]),
            },
        ],
    )?;
    let ref_obj: y_octo::Any = serde_json::from_value(json!({
        "type": "LinkedPage",
        "pageId": "ref-arch-spec"
    }))?;
    write_rich_cell(
        page,
        "f-row-2",
        vec![
            y_octo::TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text("See ".into()),
                format: attrs(&[("italic", y_octo::Any::True)]),
            },
            y_octo::TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text(" ".into()),
                format: attrs(&[("reference", ref_obj)]),
            },
            y_octo::TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text("\nSecond line preserved in cell".into()),
                format: None,
            },
        ],
    )?;
    write_rich_cell(
        page,
        "f-row-3",
        vec![y_octo::TextDeltaOp::Insert {
            insert: y_octo::TextInsert::Text("Blank numeric cell next door ->".into()),
            format: None,
        }],
    )?;
    page.stop_capturing()?;
    Ok((state, db_id))
}
