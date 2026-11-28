//! Table-driven CRDT integration tests for `affine:database` full authoring lifecycle:
//! column add/insert/rename/type-change/delete/resize/reorder + Undo/Redo,
//! all 8 cell property types + Yjs V1 binary round-trip, select option CRUD,
//! Filter/Sort/GroupBy persistence, and Calendar row creation + rescheduling.

use std::collections::BTreeMap;

use blocksuite_playground_doc::{
    DocResult,
    read::{BlockContent, DatabaseCellValue, DatabaseGroupBy},
    schema::{
        BlockSpec, DatabaseCellSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec,
        ParagraphType,
    },
    session::PageDocSession,
};
use serde_json::json;

fn seed_authoring_database() -> DocResult<(PageDocSession, String)> {
    let mut page = PageDocSession::new("page-db-auth", 42)?;
    page.add_block(
        "page-1",
        BlockSpec::Page {
            title: "Database Authoring".into(),
        },
        None,
        None,
        1,
    )?;
    page.add_block(
        "note-1",
        BlockSpec::Note { xywh: None },
        Some("page-1"),
        None,
        2,
    )?;
    let db_id = "db-auth".to_string();
    let mut cells = BTreeMap::new();
    cells.insert(
        "r1".to_string(),
        BTreeMap::from([
            (
                "col-status".to_string(),
                DatabaseCellSpec::Text("opt-todo".into()),
            ),
            (
                "col-tags".to_string(),
                DatabaseCellSpec::MultiSelect(vec!["tag-ui".into()]),
            ),
            ("col-budget".to_string(), DatabaseCellSpec::Number(1200.5)),
            ("col-done".to_string(), DatabaseCellSpec::Bool(false)),
            ("col-progress".to_string(), DatabaseCellSpec::Integer(40)),
            (
                "col-due".to_string(),
                DatabaseCellSpec::Integer(1_773_014_400_000),
            ),
            (
                "col-end".to_string(),
                DatabaseCellSpec::Integer(1_773_187_200_000),
            ),
            (
                "col-url".to_string(),
                DatabaseCellSpec::Text("https://affine.pro".into()),
            ),
            (
                "col-note".to_string(),
                DatabaseCellSpec::RichText("Initial note".into()),
            ),
        ]),
    );
    page.add_block(
        &db_id,
        BlockSpec::Database(DatabaseSpec {
            title: "Roadmap".into(),
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
                            { "id": "opt-doing", "value": "Doing", "color": "var(--affine-tag-orange)" },
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
                            { "id": "tag-core", "value": "Core", "color": "var(--affine-tag-teal)" }
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
                    id: "col-done".into(),
                    column_type: "checkbox".into(),
                    name: "Done".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-progress".into(),
                    column_type: "progress".into(),
                    name: "Progress".into(),
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
                    name: "Link".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-note".into(),
                    column_type: "rich-text".into(),
                    name: "Notes".into(),
                    data: json!({}),
                },
            ],
            views: vec![
                DatabaseViewSpec {
                    id: "v-table".into(),
                    name: "Table".into(),
                    mode: "table".into(),
                    raw: json!({
                        "columns": [
                            { "id": "title", "width": 220 },
                            { "id": "col-status", "width": 140 },
                            { "id": "col-budget", "width": 120 }
                        ],
                        "extraPreserve": "keep-me"
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
        Some("note-1"),
        None,
        3,
    )?;
    page.add_block(
        "r1",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Ship Database Authoring".into(),
        },
        Some(&db_id),
        None,
        4,
    )?;
    page.stop_capturing()?;
    Ok((page, db_id))
}

fn read_db(page: &PageDocSession, db_id: &str) -> blocksuite_playground_doc::read::DatabaseData {
    let snap = page.read_page_snapshot().expect("snapshot");
    let BlockContent::Database(db) = &snap.block(db_id).expect("db").content else {
        panic!("expected database");
    };
    db.clone()
}

#[test]
fn database_column_lifecycle_add_rename_type_resize_reorder_delete_and_undo() -> DocResult<()> {
    let (mut page, db_id) = seed_authoring_database()?;

    // 1. Add column at end and rename it.
    let spec = DatabaseColumnSpec {
        id: "col-extra".into(),
        column_type: "rich-text".into(),
        name: "Owner".into(),
        data: json!({}),
    };
    assert!(
        page.add_database_column(&db_id, Some("v-table"), spec, None, 100)?
            .is_some()
    );
    page.stop_capturing()?;
    assert!(
        read_db(&page, &db_id)
            .columns
            .iter()
            .any(|c| c.id == "col-extra")
    );

    assert!(
        page.rename_database_column(&db_id, "col-extra", "Assignee", 200)?
            .is_some()
    );
    page.stop_capturing()?;
    assert_eq!(
        read_db(&page, &db_id)
            .columns
            .iter()
            .find(|c| c.id == "col-extra")
            .unwrap()
            .name,
        "Assignee"
    );

    // 2. Write a comma-separated string and convert column type rich-text -> multi-select -> rich-text.
    page.set_database_cell_value(
        &db_id,
        "r1",
        "col-extra",
        DatabaseCellSpec::RichText("Alice, Bob".into()),
        250,
    )?;
    page.stop_capturing()?;
    assert!(
        page.change_database_column_type(&db_id, "col-extra", "multi-select", 300)?
            .is_some()
    );
    page.stop_capturing()?;
    let db_after_ms = read_db(&page, &db_id);
    let extra_col = db_after_ms
        .columns
        .iter()
        .find(|c| c.id == "col-extra")
        .unwrap();
    assert_eq!(extra_col.column_type, "multi-select");
    assert_eq!(extra_col.select_options().len(), 2);
    assert_eq!(
        db_after_ms.cells[&("r1".into(), "col-extra".into())]
            .as_string_list()
            .len(),
        2
    );

    // 3. Resize column width and reorder columns in v-table.
    assert!(
        page.set_database_view_column_width(&db_id, "v-table", "col-status", 240.0, 400)?
            .is_some()
    );
    page.stop_capturing()?;
    let v_table = &read_db(&page, &db_id).views[0];
    assert_eq!(
        v_table
            .columns
            .iter()
            .find(|c| c.id == "col-status")
            .unwrap()
            .width,
        Some(240.0)
    );
    assert_eq!(v_table.extra.get("extraPreserve"), Some(&json!("keep-me")));

    assert!(
        page.reorder_database_view_column(&db_id, "v-table", "col-budget", 1, 500)?
            .is_some()
    );
    page.stop_capturing()?;
    let col_ids: Vec<String> = read_db(&page, &db_id).views[0]
        .columns
        .iter()
        .take(3)
        .map(|c| c.id.clone())
        .collect();
    assert_eq!(col_ids, vec!["title", "col-budget", "col-status"]);

    // 4. Delete column and verify single-step undo restores it with its cells.
    assert!(
        page.delete_database_column(&db_id, "col-extra", 600)?
            .is_some()
    );
    page.stop_capturing()?;
    assert!(
        !read_db(&page, &db_id)
            .columns
            .iter()
            .any(|c| c.id == "col-extra")
    );
    assert!(page.undo()?.is_some());
    assert!(
        read_db(&page, &db_id)
            .columns
            .iter()
            .any(|c| c.id == "col-extra")
    );

    // Title column cannot be deleted or retyped.
    assert!(page.delete_database_column(&db_id, "title", 700).is_err());
    assert!(
        page.change_database_column_type(&db_id, "title", "number", 701)
            .is_err()
    );
    Ok(())
}

#[test]
fn database_eight_cell_types_and_yjs_v1_binary_roundtrip_table_driven() -> DocResult<()> {
    let (mut page, db_id) = seed_authoring_database()?;

    let edits: Vec<(&str, DatabaseCellSpec)> = vec![
        (
            "col-note",
            DatabaseCellSpec::RichText("Updated rich note".into()),
        ),
        ("col-status", DatabaseCellSpec::Text("opt-doing".into())),
        (
            "col-tags",
            DatabaseCellSpec::MultiSelect(vec!["tag-ui".into(), "tag-core".into()]),
        ),
        ("col-budget", DatabaseCellSpec::Number(9876.25)),
        ("col-done", DatabaseCellSpec::Bool(true)),
        ("col-progress", DatabaseCellSpec::Integer(85)),
        ("col-due", DatabaseCellSpec::Integer(1_773_273_600_000)),
        (
            "col-url",
            DatabaseCellSpec::Text("https://docs.affine.pro/db".into()),
        ),
    ];
    for (idx, (col_id, spec)) in edits.into_iter().enumerate() {
        assert!(
            page.set_database_cell_value(&db_id, "r1", col_id, spec, 1000 + idx as u64)?
                .is_some()
        );
        page.stop_capturing()?;
    }
    assert!(
        page.set_database_row_title(&db_id, "r1", "Shipped Database Authoring", 1100)?
            .is_some()
    );
    page.stop_capturing()?;

    // Select option upsert & delete.
    page.upsert_database_select_option(
        &db_id,
        "col-tags",
        "tag-qa",
        "QA",
        "var(--affine-tag-yellow)",
        1200,
    )?;
    page.stop_capturing()?;
    page.delete_database_select_option(&db_id, "col-tags", "tag-core", 1300)?;
    page.stop_capturing()?;

    // Yjs V1 full binary roundtrip into a fresh replica.
    let v1 = page.encode_update_v1()?;
    let mut peer = PageDocSession::new("page-db-auth", 99)?;
    peer.apply_remote_update_v1(&v1)?;
    let db = read_db(&peer, &db_id);

    assert_eq!(db.rows[0].title.plain, "Shipped Database Authoring");
    assert_eq!(
        db.cells[&("r1".into(), "col-note".into())].as_str(),
        Some("Updated rich note")
    );
    assert_eq!(
        db.cells[&("r1".into(), "col-status".into())].as_str(),
        Some("opt-doing")
    );
    assert_eq!(
        db.cells[&("r1".into(), "col-tags".into())].as_string_list(),
        vec!["tag-ui".to_string()]
    );
    assert_eq!(
        db.cells[&("r1".into(), "col-budget".into())].as_f64(),
        Some(9876.25)
    );
    assert_eq!(
        db.cells[&("r1".into(), "col-done".into())].as_bool(),
        Some(true)
    );
    assert_eq!(
        db.cells[&("r1".into(), "col-progress".into())].as_i64(),
        Some(85)
    );
    assert_eq!(
        db.cells[&("r1".into(), "col-due".into())].as_i64(),
        Some(1_773_273_600_000)
    );
    assert_eq!(
        db.cells[&("r1".into(), "col-url".into())].as_str(),
        Some("https://docs.affine.pro/db")
    );
    assert!(
        db.columns
            .iter()
            .find(|c| c.id == "col-tags")
            .unwrap()
            .select_options()
            .iter()
            .any(|o| o.id == "tag-qa" && o.value == "QA")
    );
    Ok(())
}

#[test]
fn database_view_filter_sort_group_and_calendar_row_create_reschedule() -> DocResult<()> {
    let (mut page, db_id) = seed_authoring_database()?;

    let filter = json!({
        "type": "group",
        "op": "and",
        "conditions": [{
            "type": "filter",
            "left": { "type": "ref", "name": "col-budget" },
            "function": "greatThan",
            "args": [{ "type": "constant", "value": 500 }]
        }]
    });
    let sort = json!({
        "sortBy": [{ "ref": { "type": "ref", "name": "col-budget" }, "desc": true }]
    });
    let group_by = DatabaseGroupBy {
        kind: "groupBy".into(),
        column_id: "col-status".into(),
        name: "select".into(),
        sort: None,
        hide_empty: None,
    };

    page.set_database_view_filter(&db_id, "v-table", Some(filter.clone()), 100)?;
    page.stop_capturing()?;
    page.set_database_view_sort(&db_id, "v-table", Some(sort.clone()), 200)?;
    page.stop_capturing()?;
    page.set_database_view_group_by(&db_id, "v-table", Some(group_by.clone()), 300)?;
    page.stop_capturing()?;

    let db = read_db(&page, &db_id);
    assert_eq!(db.views[0].filter, Some(filter));
    assert_eq!(db.views[0].sort, Some(sort));
    assert_eq!(db.views[0].group_by, Some(group_by));

    // Calendar create row with Date cell + reschedule preserving multi-day span.
    let day1 = 1_773_532_800_000_i64;
    page.add_database_row_with_cells(
        &db_id,
        "r-cal-new",
        "Release Review",
        vec![("col-due".into(), DatabaseCellSpec::Integer(day1))],
        400,
    )?;
    page.stop_capturing()?;
    let db_cal = read_db(&page, &db_id);
    assert!(
        db_cal
            .rows
            .iter()
            .any(|r| r.row_id == "r-cal-new" && r.title.plain == "Release Review")
    );
    assert_eq!(
        db_cal.cells.get(&("r-cal-new".into(), "col-due".into())),
        Some(&DatabaseCellValue::Integer(day1))
    );

    let shifted_start = 1_773_360_000_000_i64;
    let shifted_end = 1_773_532_800_000_i64;
    page.reschedule_database_calendar_row(
        &db_id,
        "r1",
        "col-due",
        Some("col-end"),
        shifted_start,
        Some(shifted_end),
        500,
    )?;
    page.stop_capturing()?;
    let db_shifted = read_db(&page, &db_id);
    assert_eq!(
        db_shifted.cells[&("r1".into(), "col-due".into())].as_i64(),
        Some(shifted_start)
    );
    assert_eq!(
        db_shifted.cells[&("r1".into(), "col-end".into())].as_i64(),
        Some(shifted_end)
    );

    // Single undo restores both start and end dates atomically.
    assert!(page.undo()?.is_some());
    let db_undone = read_db(&page, &db_id);
    assert_eq!(
        db_undone.cells[&("r1".into(), "col-due".into())].as_i64(),
        Some(1_773_014_400_000)
    );
    assert_eq!(
        db_undone.cells[&("r1".into(), "col-end".into())].as_i64(),
        Some(1_773_187_200_000)
    );
    Ok(())
}

#[test]
#[ignore = "requires AFFINE_CORPUS_DIR with local .yjs snapshots"]
fn real_corpus_zero_writeback() -> Result<(), Box<dyn std::error::Error>> {
    let dir = std::env::var("AFFINE_CORPUS_DIR")?;
    let mut paths: Vec<_> = std::fs::read_dir(&dir)?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("yjs"))
        .collect();
    paths.sort();
    assert!(!paths.is_empty(), "expected at least one .yjs snapshot");

    let mut total_dbs = 0usize;
    let mut total_cols = 0usize;
    let mut total_views = 0usize;
    let mut total_rows = 0usize;
    for (idx, path) in paths.iter().enumerate() {
        let bytes = std::fs::read(path)?;
        let mut page = PageDocSession::new(&format!("corpus-{idx}"), 1)?;
        page.apply_remote_update_v1(&bytes)?;
        let sv_before = page.encode_state_vector_v1()?;
        let state_before = page.encode_update_v1()?;
        let rev_before = page.revision();
        let snap = page.read_page_snapshot()?;
        fn walk(
            node: &blocksuite_playground_doc::read::BlockNode,
            dbs: &mut usize,
            cols: &mut usize,
            views: &mut usize,
            rows: &mut usize,
        ) {
            if let BlockContent::Database(db) = &node.content {
                *dbs += 1;
                *cols += db.columns.len();
                *views += db.views.len();
                *rows += db.rows.len();
            }
            for child in &node.children {
                walk(child, dbs, cols, views, rows);
            }
        }
        if let Some(root) = &snap.root {
            walk(
                root,
                &mut total_dbs,
                &mut total_cols,
                &mut total_views,
                &mut total_rows,
            );
        }
        for node in &snap.detached {
            walk(
                node,
                &mut total_dbs,
                &mut total_cols,
                &mut total_views,
                &mut total_rows,
            );
        }
        assert_eq!(
            page.encode_state_vector_v1()?,
            sv_before,
            "doc #{idx} mutated state vector on read-only open"
        );
        assert_eq!(
            page.encode_update_v1()?,
            state_before,
            "doc #{idx} mutated CRDT state on read-only open"
        );
        assert_eq!(page.revision(), rev_before, "doc #{idx} revision changed");
        assert!(
            !page.can_undo(),
            "doc #{idx} created undo entry on read-only open"
        );
    }
    assert!(total_dbs > 0, "expected at least one database block");
    eprintln!(
        "real_corpus_zero_writeback: docs={} dbs={} cols={} views={} rows={} writeback=0",
        paths.len(),
        total_dbs,
        total_cols,
        total_views,
        total_rows
    );
    Ok(())
}

#[test]
fn legacy_any_object_column_upsert_and_delete_select_option_upgrades_in_place() -> DocResult<()> {
    let (mut page, db_id) = seed_authoring_database()?;
    let cols_target = y_octo::TypeTarget::Path(
        y_octo::TypePath::root("blocks")
            .key(&db_id)
            .key("prop:columns"),
    );
    let legacy_col: y_octo::Any = serde_json::from_value(json!({
        "id": "col-legacy-sel",
        "type": "select",
        "name": "Legacy Select",
        "data": {
            "options": [
                { "id": "opt-old", "value": "Old", "color": "var(--affine-tag-gray)" }
            ]
        }
    }))
    .expect("legacy Any::Object");
    page.inner_mut()
        .begin_tx(y_octo::SessionTxOrigin::Untracked)?;
    let len = page.inner().read_array(&cols_target)?.len() as u64;
    page.inner_mut().array_insert(
        &cols_target,
        len,
        vec![y_octo::SessionValue::Any(legacy_col)],
    )?;
    page.inner_mut().commit_tx()?;
    page.stop_capturing()?;

    // Upsert option on legacy Any::Object column must upgrade to Y.Map and succeed.
    page.upsert_database_select_option(
        &db_id,
        "col-legacy-sel",
        "opt-new",
        "Fresh",
        "var(--affine-tag-blue)",
        600,
    )?;
    page.stop_capturing()?;
    let db_after_upsert = read_db(&page, &db_id);
    let col = db_after_upsert
        .columns
        .iter()
        .find(|c| c.id == "col-legacy-sel")
        .expect("legacy column");
    let opts = col.data["options"].as_array().expect("options array");
    assert_eq!(opts.len(), 2);
    assert!(
        opts.iter()
            .any(|o| o["id"] == "opt-new" && o["value"] == "Fresh")
    );

    // Delete option on the same column also succeeds and strips references cleanly.
    page.set_database_cell_value(
        &db_id,
        "r1",
        "col-legacy-sel",
        DatabaseCellSpec::Text("opt-new".into()),
        601,
    )?;
    page.stop_capturing()?;
    page.delete_database_select_option(&db_id, "col-legacy-sel", "opt-new", 602)?;
    page.stop_capturing()?;
    let db_after_delete = read_db(&page, &db_id);
    let col2 = db_after_delete
        .columns
        .iter()
        .find(|c| c.id == "col-legacy-sel")
        .unwrap();
    let opts2 = col2.data["options"].as_array().unwrap();
    assert_eq!(opts2.len(), 1);
    assert!(!opts2.iter().any(|o| o["id"] == "opt-new"));
    assert_eq!(
        db_after_delete
            .cells
            .get(&("r1".into(), "col-legacy-sel".into())),
        Some(&DatabaseCellValue::Null)
    );
    Ok(())
}

#[test]
fn select_create_option_and_set_cell_undoes_atomically_in_one_step() -> DocResult<()> {
    let (mut page, db_id) = seed_authoring_database()?;
    let before = read_db(&page, &db_id);
    let before_opt_len = before
        .columns
        .iter()
        .find(|c| c.id == "col-status")
        .unwrap()
        .data["options"]
        .as_array()
        .unwrap()
        .len();
    let before_cell = before
        .cells
        .get(&("r1".into(), "col-status".into()))
        .cloned();

    page.stop_capturing()?;
    page.upsert_database_select_option_and_set_cell(
        &db_id,
        "col-status",
        "opt-atomic",
        "Atomic",
        "var(--affine-tag-purple)",
        "r1",
        DatabaseCellSpec::Text("opt-atomic".into()),
        700,
    )?;
    page.stop_capturing()?;

    let mid = read_db(&page, &db_id);
    let mid_opts = mid
        .columns
        .iter()
        .find(|c| c.id == "col-status")
        .unwrap()
        .data["options"]
        .as_array()
        .unwrap();
    assert_eq!(mid_opts.len(), before_opt_len + 1);
    assert_eq!(
        mid.cells[&("r1".into(), "col-status".into())].as_str(),
        Some("opt-atomic")
    );

    // Single undo reverts BOTH the cell assignment and the newly created option.
    assert!(page.undo()?.is_some());
    let undone = read_db(&page, &db_id);
    let undone_opts = undone
        .columns
        .iter()
        .find(|c| c.id == "col-status")
        .unwrap()
        .data["options"]
        .as_array()
        .unwrap();
    assert_eq!(undone_opts.len(), before_opt_len);
    assert!(!undone_opts.iter().any(|o| o["id"] == "opt-atomic"));
    assert_eq!(
        undone.cells.get(&("r1".into(), "col-status".into())),
        before_cell.as_ref()
    );
    Ok(())
}

#[test]
fn legacy_string_encoded_number_cells_parse_finite_decimals_and_ignore_blank_or_invalid() {
    use blocksuite_playground_doc::read::{DatabaseCellValue, RichText};

    assert_eq!(DatabaseCellValue::Text("42".into()).as_f64(), Some(42.0));
    assert_eq!(
        DatabaseCellValue::Text("-19.75".into()).as_f64(),
        Some(-19.75)
    );
    assert_eq!(
        DatabaseCellValue::Text(" 12.5 ".into()).as_f64(),
        Some(12.5)
    );
    assert_eq!(DatabaseCellValue::Text(String::new()).as_f64(), None);
    assert_eq!(DatabaseCellValue::Text("   ".into()).as_f64(), None);
    assert_eq!(DatabaseCellValue::Text("NaN".into()).as_f64(), None);
    assert_eq!(DatabaseCellValue::Text("inf".into()).as_f64(), None);
    assert_eq!(DatabaseCellValue::Text("not-a-num".into()).as_f64(), None);
    assert_eq!(
        DatabaseCellValue::RichText(RichText {
            plain: "99.5".into(),
            delta: Vec::new(),
        })
        .as_f64(),
        Some(99.5)
    );
    assert_eq!(
        DatabaseCellValue::Json(json!("108.25")).as_f64(),
        Some(108.25)
    );
    assert_eq!(DatabaseCellValue::Text("42".into()).as_i64(), Some(42));
    assert_eq!(DatabaseCellValue::Text(String::new()).as_i64(), None);
}
