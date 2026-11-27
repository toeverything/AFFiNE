use std::collections::{BTreeMap, HashMap};

use blocksuite_playground_doc::{
    DocResult,
    read::BlockContent,
    schema::{
        BlockSpec, DatabaseCellSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec,
        ParagraphType,
    },
    session::PageDocSession,
};
use serde_json::json;
use y_octo::{Any, SessionReadValue, SessionTxOrigin, SessionValue, TypePath, TypeTarget};

#[test]
fn database_checkbox_writeback_preserves_siblings_and_unknown_cell_fields_across_undo_redo()
-> DocResult<()> {
    let mut page = PageDocSession::new("page-db-lossless", 9)?;
    page.add_block(
        "page-1",
        BlockSpec::Page {
            title: "Database Lossless Writeback".into(),
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
    let db_id = "db-lossless".to_string();
    page.add_block(
        &db_id,
        BlockSpec::Database(DatabaseSpec {
            title: "Tasks".into(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "title".into(),
                    column_type: "title".into(),
                    name: "Title".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-done".into(),
                    column_type: "checkbox".into(),
                    name: "Done".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-note".into(),
                    column_type: "rich-text".into(),
                    name: "Note".into(),
                    data: json!({}),
                },
            ],
            views: vec![DatabaseViewSpec {
                id: "v-table".into(),
                name: "Table".into(),
                mode: "table".into(),
                raw: json!({"columns": []}),
            }],
            cells: BTreeMap::new(),
        }),
        Some("note-1"),
        None,
        3,
    )?;
    page.add_block(
        "row-map",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Map Row".into(),
        },
        Some(&db_id),
        None,
        10,
    )?;
    page.add_block(
        "row-obj",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Object Row".into(),
        },
        Some(&db_id),
        None,
        11,
    )?;

    // Seed `row-map` as Y.Map with sibling `col-note` and `col-done` carrying `extraMeta: "keep"`.
    // Seed `row-obj` as Any::Object with sibling `col-note` and `col-done` carrying `extraMeta: "keep"`.
    let cells_path = TypePath::root("blocks").key(&db_id).key("prop:cells");
    let cells_target = TypeTarget::Path(cells_path.clone());
    page.inner_mut().begin_tx(SessionTxOrigin::Untracked)?;
    page.inner_mut().map_set(
        &cells_target,
        "row-map".into(),
        SessionValue::Map(vec![
            (
                "col-note".into(),
                SessionValue::Map(vec![
                    (
                        "columnId".into(),
                        SessionValue::Any(Any::String("col-note".into())),
                    ),
                    (
                        "value".into(),
                        SessionValue::Any(Any::String("sibling-map".into())),
                    ),
                ]),
            ),
            (
                "col-done".into(),
                SessionValue::Map(vec![
                    (
                        "columnId".into(),
                        SessionValue::Any(Any::String("col-done".into())),
                    ),
                    ("value".into(), SessionValue::Any(Any::False)),
                    (
                        "extraMeta".into(),
                        SessionValue::Any(Any::String("keep".into())),
                    ),
                ]),
            ),
        ]),
    )?;
    let mut obj_done = HashMap::default();
    obj_done.insert("columnId".into(), Any::String("col-done".into()));
    obj_done.insert("value".into(), Any::False);
    obj_done.insert("extraMeta".into(), Any::String("keep".into()));
    let mut obj_note = HashMap::default();
    obj_note.insert("columnId".into(), Any::String("col-note".into()));
    obj_note.insert("value".into(), Any::String("sibling-obj".into()));
    let mut obj_row = HashMap::default();
    obj_row.insert("col-done".into(), Any::Object(Box::new(obj_done)));
    obj_row.insert("col-note".into(), Any::Object(Box::new(obj_note)));
    page.inner_mut().map_set(
        &cells_target,
        "row-obj".into(),
        SessionValue::Any(Any::Object(Box::new(obj_row))),
    )?;
    page.inner_mut().commit_tx()?;

    let assert_state = |page: &PageDocSession, map_done: bool, obj_done: bool| -> DocResult<()> {
        let snap = page.read_page_snapshot()?;
        let BlockContent::Database(db) = &snap.block(&db_id).unwrap().content else {
            panic!("expected database");
        };
        assert_eq!(
            db.cells[&("row-map".into(), "col-done".into())].as_bool(),
            Some(map_done)
        );
        assert_eq!(
            db.cells[&("row-map".into(), "col-note".into())].as_str(),
            Some("sibling-map")
        );
        assert_eq!(
            db.cells[&("row-obj".into(), "col-done".into())].as_bool(),
            Some(obj_done)
        );
        assert_eq!(
            db.cells[&("row-obj".into(), "col-note".into())].as_str(),
            Some("sibling-obj")
        );
        // Verify raw unknown extension key `extraMeta` survived on both rows.
        let map_meta = page.inner().get_map_value(
            &TypeTarget::Path(cells_path.clone().key("row-map").key("col-done")),
            "extraMeta",
        )?;
        assert_eq!(
            map_meta,
            Some(SessionReadValue::Any(Any::String("keep".into())))
        );
        let obj_row_val = page.inner().get_map_value(&cells_target, "row-obj")?;
        match obj_row_val {
            Some(SessionReadValue::Any(Any::Object(row_map))) => {
                let Some(Any::Object(done_map)) = row_map.get("col-done") else {
                    panic!("expected row-obj col-done Any::Object");
                };
                assert_eq!(done_map.get("extraMeta"), Some(&Any::String("keep".into())));
            }
            Some(SessionReadValue::Map(_)) => {
                let obj_meta = page.inner().get_map_value(
                    &TypeTarget::Path(cells_path.clone().key("row-obj").key("col-done")),
                    "extraMeta",
                )?;
                assert_eq!(
                    obj_meta,
                    Some(SessionReadValue::Any(Any::String("keep".into())))
                );
            }
            other => panic!("unexpected row-obj value: {other:?}"),
        }
        Ok(())
    };

    assert_state(&page, false, false)?;
    let rev0 = page.revision();
    let c1 = page.set_database_cell_bool(&db_id, "row-map", "col-done", true, 100)?;
    assert!(c1.is_some());
    assert!(page.revision() > rev0);
    assert_state(&page, true, false)?;

    let c2 = page.set_database_cell_bool(&db_id, "row-obj", "col-done", true, 200)?;
    assert!(c2.is_some());
    // Legacy `row-obj` must lazily upgrade to a shared `Y.Map` on first write.
    assert!(matches!(
        page.inner().get_map_value(&cells_target, "row-obj")?,
        Some(SessionReadValue::Map(_))
    ));
    assert_state(&page, true, true)?;

    // Undo row-obj, then undo row-map, then redo both.
    assert!(page.undo()?.is_some());
    assert_state(&page, true, false)?;
    assert!(page.undo()?.is_some());
    assert_state(&page, false, false)?;
    assert!(page.redo()?.is_some());
    assert_state(&page, true, false)?;
    assert!(page.redo()?.is_some());
    assert_state(&page, true, true)?;
    Ok(())
}

#[test]
fn database_two_replica_concurrent_checkbox_delta_merge_converges() -> DocResult<()> {
    let mut seed = PageDocSession::new("page-db-concurrent", 1)?;
    seed.add_block(
        "page-1",
        BlockSpec::Page {
            title: "Concurrent Database".into(),
        },
        None,
        None,
        1,
    )?;
    seed.add_block(
        "note-1",
        BlockSpec::Note { xywh: None },
        Some("page-1"),
        None,
        2,
    )?;
    let mut cells = BTreeMap::new();
    cells.insert(
        "row-canonical".to_string(),
        BTreeMap::from([
            ("col-done-1".to_string(), DatabaseCellSpec::Bool(false)),
            ("col-done-2".to_string(), DatabaseCellSpec::Bool(false)),
            (
                "col-note".to_string(),
                DatabaseCellSpec::Text("keep-canonical".into()),
            ),
        ]),
    );
    seed.add_block(
        "db-1",
        BlockSpec::Database(DatabaseSpec {
            title: "Tasks".into(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "title".into(),
                    column_type: "title".into(),
                    name: "Title".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-done-1".into(),
                    column_type: "checkbox".into(),
                    name: "Done 1".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-done-2".into(),
                    column_type: "checkbox".into(),
                    name: "Done 2".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-note".into(),
                    column_type: "rich-text".into(),
                    name: "Note".into(),
                    data: json!({}),
                },
            ],
            views: vec![DatabaseViewSpec {
                id: "v-table".into(),
                name: "Table".into(),
                mode: "table".into(),
                raw: json!({"columns": []}),
            }],
            cells,
        }),
        Some("note-1"),
        None,
        3,
    )?;
    for row_id in ["row-canonical", "row-upgraded"] {
        seed.add_block(
            row_id,
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: row_id.into(),
            },
            Some("db-1"),
            None,
            10,
        )?;
    }

    // Seed `row-upgraded` initially as a legacy Any::Object row and lazily upgrade it once
    // before forking replicas A & B.
    let cells_target = TypeTarget::Path(TypePath::root("blocks").key("db-1").key("prop:cells"));
    seed.inner_mut().begin_tx(SessionTxOrigin::Untracked)?;
    let mut c1 = HashMap::default();
    c1.insert("columnId".into(), Any::String("col-done-1".into()));
    c1.insert("value".into(), Any::False);
    let mut c2 = HashMap::default();
    c2.insert("columnId".into(), Any::String("col-done-2".into()));
    c2.insert("value".into(), Any::False);
    let mut cn = HashMap::default();
    cn.insert("columnId".into(), Any::String("col-note".into()));
    cn.insert("value".into(), Any::String("keep-upgraded".into()));
    let mut legacy_row = HashMap::default();
    legacy_row.insert("col-done-1".into(), Any::Object(Box::new(c1)));
    legacy_row.insert("col-done-2".into(), Any::Object(Box::new(c2)));
    legacy_row.insert("col-note".into(), Any::Object(Box::new(cn)));
    seed.inner_mut().map_set(
        &cells_target,
        "row-upgraded".into(),
        SessionValue::Any(Any::Object(Box::new(legacy_row))),
    )?;
    seed.inner_mut().commit_tx()?;
    // First write upgrades `row-upgraded` into a shared Y.Map (and sets col-done-1 back to false).
    seed.set_database_cell_bool("db-1", "row-upgraded", "col-done-1", false, 20)?;

    let base_update = seed.encode_update_v1()?;
    let mut replica_a = PageDocSession::new("page-db-concurrent", 101)?;
    let mut replica_b = PageDocSession::new("page-db-concurrent", 202)?;
    replica_a.apply_remote_update_v1(&base_update)?;
    replica_b.apply_remote_update_v1(&base_update)?;

    // Concurrent edits on distinct columns of BOTH rows, exchanging ONLY PageCommit deltas.
    let delta_a1 = replica_a
        .set_database_cell_bool("db-1", "row-canonical", "col-done-1", true, 100)?
        .expect("commit a1")
        .update;
    let delta_a2 = replica_a
        .set_database_cell_bool("db-1", "row-upgraded", "col-done-1", true, 101)?
        .expect("commit a2")
        .update;
    let delta_b1 = replica_b
        .set_database_cell_bool("db-1", "row-canonical", "col-done-2", true, 100)?
        .expect("commit b1")
        .update;
    let delta_b2 = replica_b
        .set_database_cell_bool("db-1", "row-upgraded", "col-done-2", true, 101)?
        .expect("commit b2")
        .update;

    replica_a.apply_remote_update_v1(&delta_b1)?;
    replica_a.apply_remote_update_v1(&delta_b2)?;
    replica_b.apply_remote_update_v1(&delta_a1)?;
    replica_b.apply_remote_update_v1(&delta_a2)?;

    // Also verify a newly added empty row (`add_database_row`) synced via its actual PageCommit
    // delta converges to `[Some(true), Some(true)]` when replicas toggle distinct columns.
    let add_row_delta = replica_a
        .add_database_row("db-1", "row-added-empty", 150)?
        .expect("add_database_row commit")
        .update;
    replica_b.apply_remote_update_v1(&add_row_delta)?;

    let delta_a_new = replica_a
        .set_database_cell_bool("db-1", "row-added-empty", "col-done-1", true, 200)?
        .expect("commit a new row")
        .update;
    let delta_b_new = replica_b
        .set_database_cell_bool("db-1", "row-added-empty", "col-done-2", true, 200)?
        .expect("commit b new row")
        .update;
    replica_a.apply_remote_update_v1(&delta_b_new)?;
    replica_b.apply_remote_update_v1(&delta_a_new)?;

    for (name, peer) in [("A", &replica_a), ("B", &replica_b)] {
        let snap = peer.read_page_snapshot()?;
        let BlockContent::Database(db) = &snap.block("db-1").unwrap().content else {
            panic!("expected database");
        };
        assert_eq!(
            (
                db.cells[&("row-added-empty".into(), "col-done-1".into())].as_bool(),
                db.cells[&("row-added-empty".into(), "col-done-2".into())].as_bool(),
            ),
            (Some(true), Some(true)),
            "replica {name} newly added empty row must converge to [true, true]"
        );
        for (row, note) in [
            ("row-canonical", "keep-canonical"),
            ("row-upgraded", "keep-upgraded"),
        ] {
            assert_eq!(
                (
                    db.cells[&(row.into(), "col-done-1".into())].as_bool(),
                    db.cells[&(row.into(), "col-done-2".into())].as_bool(),
                ),
                (Some(true), Some(true)),
                "replica {name} row {row} must converge to [true, true]"
            );
            assert_eq!(
                db.cells[&(row.into(), "col-note".into())].as_str(),
                Some(note),
                "replica {name} row {row} sibling column must survive"
            );
        }
    }
    Ok(())
}

#[test]
fn add_database_row_upgrades_legacy_object_cells_losslessly_and_rejects_corrupt_scalar()
-> DocResult<()> {
    let mut page = PageDocSession::new("page-db-root-obj", 77)?;
    page.add_block(
        "p-root",
        BlockSpec::Page {
            title: "Root Object Cells".into(),
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
    page.add_block(
        "db-obj",
        BlockSpec::Database(DatabaseSpec {
            title: "Legacy Cells".into(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "title".into(),
                    column_type: "title".into(),
                    name: "Title".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-note".into(),
                    column_type: "rich-text".into(),
                    name: "Note".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-done".into(),
                    column_type: "checkbox".into(),
                    name: "Done".into(),
                    data: json!({}),
                },
            ],
            views: vec![DatabaseViewSpec {
                id: "v1".into(),
                name: "Table".into(),
                mode: "table".into(),
                raw: json!({"columns": []}),
            }],
            cells: BTreeMap::new(),
        }),
        Some("p-note"),
        None,
        3,
    )?;
    for (idx, (rid, txt)) in [("row-1", "First"), ("row-2", "Second")]
        .into_iter()
        .enumerate()
    {
        page.add_block(
            rid,
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: txt.into(),
            },
            Some("db-obj"),
            None,
            (10 + idx) as u64,
        )?;
    }

    // Overwrite `prop:cells` itself as a legacy `Any::Object` containing two populated rows.
    let mut c1 = HashMap::default();
    c1.insert("columnId".into(), Any::String("col-note".into()));
    c1.insert("value".into(), Any::String("existing data".into()));
    c1.insert("extraMeta".into(), Any::String("keep-ext".into()));
    let mut r1 = HashMap::default();
    r1.insert("col-note".into(), Any::Object(Box::new(c1)));

    let mut c2 = HashMap::default();
    c2.insert("columnId".into(), Any::String("col-done".into()));
    c2.insert("value".into(), Any::True);
    let mut r2 = HashMap::default();
    r2.insert("col-done".into(), Any::Object(Box::new(c2)));

    let mut root_cells = HashMap::default();
    root_cells.insert("row-1".into(), Any::Object(Box::new(r1)));
    root_cells.insert("row-2".into(), Any::Object(Box::new(r2)));

    let db_target = TypeTarget::Path(TypePath::root("blocks").key("db-obj"));
    page.inner_mut().begin_tx(SessionTxOrigin::Untracked)?;
    page.inner_mut().map_set(
        &db_target,
        "prop:cells".into(),
        SessionValue::Any(Any::Object(Box::new(root_cells))),
    )?;
    page.inner_mut().commit_tx()?;

    let mut peer = PageDocSession::new("page-db-root-obj", 88)?;
    peer.apply_remote_update_v1(&page.encode_update_v1()?)?;

    let delta = page
        .add_database_row("db-obj", "row-3", 200)?
        .expect("add_database_row commit")
        .update;
    peer.apply_remote_update_v1(&delta)?;

    for (label, session) in [("local", &page), ("peer", &peer)] {
        let snap = session.read_page_snapshot()?;
        let BlockContent::Database(db) = &snap.block("db-obj").unwrap().content else {
            panic!("expected database");
        };
        assert_eq!(db.rows.len(), 3, "{label}: expected 3 rows");
        assert_eq!(
            db.cells
                .get(&("row-1".into(), "col-note".into()))
                .and_then(|v| v.as_str()),
            Some("existing data"),
            "{label}: row-1 note must survive add_database_row"
        );
        assert_eq!(
            db.cells
                .get(&("row-2".into(), "col-done".into()))
                .and_then(|v| v.as_bool()),
            Some(true),
            "{label}: row-2 checkbox must survive add_database_row"
        );
        let ext_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key("db-obj")
                .key("prop:cells")
                .key("row-1")
                .key("col-note"),
        );
        assert_eq!(
            session.inner().get_map_value(&ext_target, "extraMeta")?,
            Some(SessionReadValue::Any(Any::String("keep-ext".into()))),
            "{label}: extension field on upgraded cell must survive"
        );
    }

    // Corrupt non-object scalar `prop:cells` fails closed BEFORE mutating blocks or sys:children.
    page.inner_mut().begin_tx(SessionTxOrigin::Untracked)?;
    page.inner_mut().map_set(
        &db_target,
        "prop:cells".into(),
        SessionValue::Any(Any::Integer(7)),
    )?;
    page.inner_mut().commit_tx()?;
    assert!(page.add_database_row("db-obj", "row-corrupt", 300).is_err());
    let snap_after = page.read_page_snapshot()?;
    assert!(snap_after.block("row-corrupt").is_none());
    Ok(())
}
