use std::collections::BTreeMap;

use blocksuite_playground_doc::{
    DocResult,
    read::{BlockContent, DatabaseCellValue, DatabaseViewMode},
    refs::{OutboundRefKind, extract_outbound_doc_refs},
    schema::{
        BlockSpec, DatabaseCellSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec, ListType,
        ParagraphType,
    },
    session::PageDocSession,
};
use serde_json::json;
use y_octo::{AHashMap, Any, SessionValue, TextAttributes, TextDeltaOp, TypePath, TypeTarget};

fn seed_full_database_page() -> DocResult<PageDocSession> {
    let mut page = PageDocSession::new("doc:db-roundtrip", 77)?;
    page.add_block(
        "page-1",
        BlockSpec::Page {
            title: "Database Roundtrip".into(),
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

    let mut cells = BTreeMap::new();
    cells.insert(
        "row-1".to_string(),
        BTreeMap::from([
            (
                "col-status".to_string(),
                DatabaseCellSpec::Text("opt-doing".into()),
            ),
            (
                "col-tags".to_string(),
                DatabaseCellSpec::MultiSelect(vec!["tag-ui".into(), "tag-rust".into()]),
            ),
            ("col-num".to_string(), DatabaseCellSpec::Number(12500.5)),
            (
                "col-date".to_string(),
                DatabaseCellSpec::Integer(1_772_960_400_000),
            ),
            (
                "col-end".to_string(),
                DatabaseCellSpec::Integer(1_773_133_200_000),
            ),
            ("col-done".to_string(), DatabaseCellSpec::Bool(true)),
            ("col-progress".to_string(), DatabaseCellSpec::Integer(75)),
            (
                "col-link".to_string(),
                DatabaseCellSpec::Text("https://affine.pro".into()),
            ),
            (
                "col-image".to_string(),
                DatabaseCellSpec::Text("https://affine.pro/cover.png".into()),
            ),
            (
                "col-rich".to_string(),
                DatabaseCellSpec::RichText("Linked spec ".into()),
            ),
            (
                "col-custom".to_string(),
                DatabaseCellSpec::Json(json!({"stars": 5, "verified": true})),
            ),
        ]),
    );
    cells.insert(
        "row-2".to_string(),
        BTreeMap::from([
            (
                "col-status".to_string(),
                DatabaseCellSpec::Text("opt-todo".into()),
            ),
            ("col-done".to_string(), DatabaseCellSpec::Bool(false)),
            ("col-progress".to_string(), DatabaseCellSpec::Integer(20)),
        ]),
    );

    let spec = DatabaseSpec {
        title: "Roadmap Tracker".into(),
        columns: vec![
            DatabaseColumnSpec {
                id: "col-status".into(),
                column_type: "select".into(),
                name: "Status".into(),
                data: json!({
                    "options": [
                        {"id": "opt-todo", "value": "Todo", "color": "var(--affine-tag-gray)"},
                        {"id": "opt-doing", "value": "In Progress", "color": "var(--affine-tag-blue)"},
                        {"id": "opt-done", "value": "Done", "color": "var(--affine-tag-green)"}
                    ]
                }),
            },
            DatabaseColumnSpec {
                id: "col-tags".into(),
                column_type: "multi-select".into(),
                name: "Tags".into(),
                data: json!({
                    "options": [
                        {"id": "tag-ui", "value": "UI", "color": "var(--affine-tag-purple)"},
                        {"id": "tag-rust", "value": "Rust", "color": "var(--affine-tag-orange)"}
                    ]
                }),
            },
            DatabaseColumnSpec {
                id: "col-num".into(),
                column_type: "number".into(),
                name: "Budget".into(),
                data: json!({"format": "currencyUSD", "decimal": 2}),
            },
            DatabaseColumnSpec {
                id: "col-date".into(),
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
                id: "col-link".into(),
                column_type: "link".into(),
                name: "Docs".into(),
                data: json!({}),
            },
            DatabaseColumnSpec {
                id: "col-image".into(),
                column_type: "image".into(),
                name: "Cover".into(),
                data: json!({}),
            },
            DatabaseColumnSpec {
                id: "col-rich".into(),
                column_type: "rich-text".into(),
                name: "Notes".into(),
                data: json!({}),
            },
            DatabaseColumnSpec {
                id: "col-created".into(),
                column_type: "created-time".into(),
                name: "Created".into(),
                data: json!({}),
            },
            DatabaseColumnSpec {
                id: "col-custom".into(),
                column_type: "custom-rating".into(),
                name: "Rating".into(),
                data: json!({"max": 5}),
            },
        ],
        views: vec![
            DatabaseViewSpec {
                id: "view-table".into(),
                name: "Table View".into(),
                mode: "table".into(),
                raw: json!({
                    "columns": [
                        {"id": "title", "width": 220},
                        {"id": "col-status", "width": 140},
                        {"id": "col-num", "width": 120},
                        {"id": "col-done", "width": 80}
                    ],
                    "filter": {"type": "group", "op": "and", "conditions": []},
                    "header": {"titleColumn": "title", "iconColumn": "type"},
                    "customViewFlag": "preserve-table"
                }),
            },
            DatabaseViewSpec {
                id: "view-kanban".into(),
                name: "Kanban View".into(),
                mode: "kanban".into(),
                raw: json!({
                    "columns": [
                        {"id": "title"},
                        {"id": "col-tags"},
                        {"id": "col-progress"}
                    ],
                    "filter": {"type": "group", "op": "and", "conditions": []},
                    "groupBy": {
                        "type": "groupBy",
                        "columnId": "col-status",
                        "name": "select",
                        "hideEmpty": false
                    },
                    "groupProperties": [
                        {"key": "opt-todo", "hide": false, "manuallyCardSort": ["row-2"]},
                        {"key": "opt-doing", "hide": false, "manuallyCardSort": ["row-1"]}
                    ],
                    "header": {"titleColumn": "title", "iconColumn": "type"}
                }),
            },
            DatabaseViewSpec {
                id: "view-calendar".into(),
                name: "Calendar View".into(),
                mode: "calendar".into(),
                raw: json!({
                    "filter": {"type": "group", "op": "and", "conditions": []},
                    "date": {"startColumnId": "col-date", "endColumnId": "col-end"},
                    "card": {"titleColumnId": "title", "visiblePropertyIds": ["col-status"]},
                    "ui": {"emptyMonthHintDismissed": true},
                    "futureCalendarExt": {"weekNumber": true}
                }),
            },
        ],
        cells,
    };

    page.add_block("db-1", BlockSpec::Database(spec), Some("note-1"), None, 3)?;
    // Unknown custom property on the database block itself.
    page.set_block_prop(
        "db-1",
        "prop:customDbMeta",
        SessionValue::Any(Any::String("keep-losslessly".into())),
        4,
    )?;

    // Child row blocks: paragraph + list with createdAt metadata.
    page.add_block(
        "row-1",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Ship Database Views".into(),
        },
        Some("db-1"),
        None,
        5,
    )?;
    page.set_block_prop(
        "row-1",
        "prop:meta:createdAt",
        SessionValue::Any(Any::BigInt64(1_772_900_000_000)),
        6,
    )?;
    page.add_block(
        "row-2",
        BlockSpec::List {
            list_type: ListType::Todo,
            text: "Verify DST Calendar".into(),
            checked: false,
            order: None,
        },
        Some("db-1"),
        None,
        7,
    )?;

    // Add a LinkedPage inline reference inside the rich-text cell (`row-1` / `col-rich`).
    let mut reference = AHashMap::default();
    reference.insert("type".to_string(), Any::String("LinkedPage".into()));
    reference.insert("pageId".to_string(), Any::String("doc:linked-spec".into()));
    let mut attrs = TextAttributes::new();
    attrs.insert("reference".to_string(), Any::Object(Box::new(reference)));
    let cell_text_target = TypeTarget::Path(
        TypePath::root("blocks")
            .key("db-1")
            .key("prop:cells")
            .key("row-1")
            .key("col-rich")
            .key("value"),
    );
    page.inner_mut().text_apply_delta(
        &cell_text_target,
        &[
            TextDeltaOp::Retain {
                retain: 11,
                format: None,
            },
            TextDeltaOp::Retain {
                retain: 1,
                format: Some(attrs),
            },
        ],
    )?;

    Ok(page)
}

#[test]
fn database_full_schema_roundtrip_has_zero_writeback_and_preserves_refs() -> DocResult {
    let page = seed_full_database_page()?;
    let wire = page.encode_update_v1()?;

    let mut replica = PageDocSession::new("doc:db-roundtrip", 99)?;
    replica.apply_remote_update_v1(&wire)?;

    let before_read = replica.encode_update_v1()?;
    let snap = replica.read_page_snapshot()?;
    let after_read = replica.encode_update_v1()?;
    assert_eq!(
        before_read, after_read,
        "reading affine:database must produce 0 writeback bytes"
    );

    let db_node = snap.block("db-1").expect("db-1 block");
    assert_eq!(db_node.flavour, "affine:database");
    assert_eq!(db_node.version, Some(3));
    assert_eq!(
        db_node
            .props
            .get("prop:customDbMeta")
            .and_then(|v| v.as_str()),
        Some("keep-losslessly")
    );

    let BlockContent::Database(db) = &db_node.content else {
        panic!("expected BlockContent::Database");
    };
    assert_eq!(db.title.plain, "Roadmap Tracker");
    assert_eq!(db.columns.len(), 12);
    assert_eq!(db.columns[11].column_type, "custom-rating");
    assert_eq!(db.rows.len(), 2);
    assert_eq!(db.rows[0].row_id, "row-1");
    assert_eq!(db.rows[0].title.plain, "Ship Database Views");
    assert_eq!(db.rows[0].created_at, Some(1_772_900_000_000));
    assert_eq!(db.rows[1].row_id, "row-2");
    assert_eq!(db.rows[1].title.plain, "Verify DST Calendar");

    // Verify all cell value types.
    assert_eq!(
        db.cells[&("row-1".into(), "col-status".into())],
        DatabaseCellValue::Text("opt-doing".into())
    );
    assert_eq!(
        db.cells[&("row-1".into(), "col-tags".into())],
        DatabaseCellValue::MultiSelect(vec!["tag-ui".into(), "tag-rust".into()])
    );
    assert_eq!(
        db.cells[&("row-1".into(), "col-num".into())].as_f64(),
        Some(12500.5)
    );
    assert_eq!(
        db.cells[&("row-1".into(), "col-date".into())].as_i64(),
        Some(1_772_960_400_000)
    );
    assert_eq!(
        db.cells[&("row-1".into(), "col-done".into())].as_bool(),
        Some(true)
    );
    assert_eq!(
        db.cells[&("row-1".into(), "col-progress".into())].as_i64(),
        Some(75)
    );
    assert_eq!(
        db.cells[&("row-1".into(), "col-link".into())].as_str(),
        Some("https://affine.pro")
    );
    assert!(matches!(
        &db.cells[&("row-1".into(), "col-rich".into())],
        DatabaseCellValue::RichText(rt) if rt.plain == "Linked spec "
    ));
    assert_eq!(
        db.cells[&("row-1".into(), "col-custom".into())],
        DatabaseCellValue::Json(json!({"stars": 5, "verified": true}))
    );

    // Verify all 3 views + unknown view fields preserved.
    assert_eq!(db.views.len(), 3);
    assert_eq!(db.views[0].mode, DatabaseViewMode::Table);
    assert_eq!(
        db.views[0]
            .extra
            .get("customViewFlag")
            .and_then(|v| v.as_str()),
        Some("preserve-table")
    );
    assert_eq!(db.views[1].mode, DatabaseViewMode::Kanban);
    assert_eq!(
        db.views[1].group_by.as_ref().map(|g| g.column_id.as_str()),
        Some("col-status")
    );
    assert_eq!(db.views[1].group_properties.len(), 2);
    assert_eq!(db.views[2].mode, DatabaseViewMode::Calendar);
    assert_eq!(
        db.views[2]
            .date
            .as_ref()
            .and_then(|d| d.start_column_id.as_deref()),
        Some("col-date")
    );
    assert_eq!(
        db.views[2]
            .date
            .as_ref()
            .and_then(|d| d.end_column_id.as_deref()),
        Some("col-end")
    );
    assert_eq!(
        db.views[2]
            .extra
            .get("futureCalendarExt")
            .and_then(|v| v.get("weekNumber"))
            .and_then(|v| v.as_bool()),
        Some(true)
    );

    // Outbound references from database cells stay intact.
    let refs = extract_outbound_doc_refs(&snap);
    assert!(
        refs.iter().any(|edge| {
            edge.source_block_id == "db-1"
                && edge.target_doc_id == "doc:linked-spec"
                && edge.kind == OutboundRefKind::DatabaseCell
        }),
        "expected DatabaseCell outbound ref, got {refs:?}"
    );
    Ok(())
}
