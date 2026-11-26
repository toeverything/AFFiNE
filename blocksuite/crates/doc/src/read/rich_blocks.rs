use std::collections::BTreeMap;

use serde_json::Value as JsonValue;
use y_octo::{Any, SessionReadValue, TypeTarget};

use crate::DocResult;

use super::{RichText, SnapshotReader, number, string};

/// One row descriptor inside an `affine:table` block.
#[derive(Debug, Clone, PartialEq)]
pub struct TableRow {
    pub row_id: String,
    pub order: String,
    pub background_color: Option<String>,
}

/// One column descriptor inside an `affine:table` block.
#[derive(Debug, Clone, PartialEq)]
pub struct TableColumn {
    pub column_id: String,
    pub order: String,
    pub width: Option<f64>,
    pub background_color: Option<String>,
}

/// One cell value inside an `affine:table` block, keyed by `"{row_id}:{column_id}"`.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct TableCell {
    pub text: RichText,
}

/// Typed `affine:table` content read from `prop:rows`, `prop:columns`, and `prop:cells`.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct TableData {
    pub rows: Vec<TableRow>,
    pub columns: Vec<TableColumn>,
    pub cells: BTreeMap<(String, String), TableCell>,
}

impl SnapshotReader<'_> {
    pub(super) fn callout_icon(
        &self,
        entries: &BTreeMap<String, SessionReadValue>,
        props: &BTreeMap<String, JsonValue>,
    ) -> String {
        if let Some(icon) = props.get("prop:icon") {
            if let Some(unicode) = icon.get("unicode").and_then(JsonValue::as_str)
                && !unicode.is_empty()
            {
                return unicode.to_string();
            }
            if let Some(name) = icon.get("name").and_then(JsonValue::as_str)
                && !name.is_empty()
            {
                return name.to_string();
            }
            if let Some(s) = icon.as_str()
                && !s.is_empty()
            {
                return s.to_string();
            }
        }
        if let Some(emoji) = string(entries.get("prop:emoji")).filter(|s| !s.is_empty()) {
            return emoji;
        }
        "\u{1F4A1}".to_string()
    }

    pub(super) fn callout_background(props: &BTreeMap<String, JsonValue>) -> Option<String> {
        if let Some(val) = props.get("prop:backgroundColorName")
            && let Some(s) = val.as_str()
            && !s.is_empty()
        {
            return Some(s.to_string());
        }
        let val = props.get("prop:backgroundColor")?;
        if let Some(s) = val.as_str()
            && !s.is_empty()
        {
            return Some(s.to_string());
        }
        val.get("light")
            .or_else(|| val.get("normal"))
            .and_then(JsonValue::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    }

    pub(super) fn read_table(
        &self,
        entries: &BTreeMap<String, SessionReadValue>,
    ) -> DocResult<TableData> {
        let session = self.page.inner();
        let mut flat_rows: BTreeMap<String, TableRow> = BTreeMap::new();
        let mut flat_cols: BTreeMap<String, TableColumn> = BTreeMap::new();
        let mut cells: BTreeMap<(String, String), TableCell> = BTreeMap::new();

        for (key, value) in entries {
            if let Some(rest) = key.strip_prefix("prop:rows.")
                && let Some((row_key, field)) = rest.rsplit_once('.')
            {
                let entry = flat_rows
                    .entry(row_key.to_string())
                    .or_insert_with(|| TableRow {
                        row_id: row_key.to_string(),
                        order: String::new(),
                        background_color: None,
                    });
                match field {
                    "rowId" => {
                        if let Some(s) = string(Some(value)).filter(|s| !s.is_empty()) {
                            entry.row_id = s;
                        }
                    }
                    "order" => {
                        if let Some(s) = string(Some(value)) {
                            entry.order = s;
                        }
                    }
                    "backgroundColor" => {
                        entry.background_color = string(Some(value));
                    }
                    _ => {}
                }
            } else if let Some(rest) = key.strip_prefix("prop:columns.")
                && let Some((col_key, field)) = rest.rsplit_once('.')
            {
                let entry = flat_cols
                    .entry(col_key.to_string())
                    .or_insert_with(|| TableColumn {
                        column_id: col_key.to_string(),
                        order: String::new(),
                        width: None,
                        background_color: None,
                    });
                match field {
                    "columnId" => {
                        if let Some(s) = string(Some(value)).filter(|s| !s.is_empty()) {
                            entry.column_id = s;
                        }
                    }
                    "order" => {
                        if let Some(s) = string(Some(value)) {
                            entry.order = s;
                        }
                    }
                    "width" => {
                        entry.width = number(Some(value)).filter(|w| *w > 0.0);
                    }
                    "backgroundColor" => {
                        entry.background_color = string(Some(value));
                    }
                    _ => {}
                }
            } else if let Some(rest) = key.strip_prefix("prop:cells.")
                && let Some(cell_key) = rest.strip_suffix(".text")
                && let Some((row_id, col_id)) = cell_key.split_once(':')
            {
                let text = self.rich_text(Some(value))?;
                cells.insert((row_id.to_string(), col_id.to_string()), TableCell { text });
            }
        }

        let mut rows: Vec<TableRow> = flat_rows.into_values().collect();
        if rows.is_empty()
            && let Some(SessionReadValue::Map(rows_id)) = entries.get("prop:rows")
        {
            for (key, value) in session.read_map(&TypeTarget::Identity(rows_id.clone()))? {
                let SessionReadValue::Map(row_map) = value else {
                    continue;
                };
                let target = TypeTarget::Identity(row_map);
                let row_id = string(session.get_map_value(&target, "rowId")?.as_ref())
                    .filter(|s| !s.is_empty())
                    .unwrap_or(key);
                let order =
                    string(session.get_map_value(&target, "order")?.as_ref()).unwrap_or_default();
                let background_color =
                    string(session.get_map_value(&target, "backgroundColor")?.as_ref());
                rows.push(TableRow {
                    row_id,
                    order,
                    background_color,
                });
            }
        }
        rows.sort_by(|a, b| a.order.cmp(&b.order).then_with(|| a.row_id.cmp(&b.row_id)));

        let mut columns: Vec<TableColumn> = flat_cols.into_values().collect();
        if columns.is_empty()
            && let Some(SessionReadValue::Map(cols_id)) = entries.get("prop:columns")
        {
            for (key, value) in session.read_map(&TypeTarget::Identity(cols_id.clone()))? {
                let SessionReadValue::Map(col_map) = value else {
                    continue;
                };
                let target = TypeTarget::Identity(col_map);
                let column_id = string(session.get_map_value(&target, "columnId")?.as_ref())
                    .filter(|s| !s.is_empty())
                    .unwrap_or(key);
                let order =
                    string(session.get_map_value(&target, "order")?.as_ref()).unwrap_or_default();
                let width =
                    number(session.get_map_value(&target, "width")?.as_ref()).filter(|w| *w > 0.0);
                let background_color =
                    string(session.get_map_value(&target, "backgroundColor")?.as_ref());
                columns.push(TableColumn {
                    column_id,
                    order,
                    width,
                    background_color,
                });
            }
        }
        columns.sort_by(|a, b| {
            a.order
                .cmp(&b.order)
                .then_with(|| a.column_id.cmp(&b.column_id))
        });

        if cells.is_empty()
            && let Some(SessionReadValue::Map(cells_id)) = entries.get("prop:cells")
        {
            for (key, value) in session.read_map(&TypeTarget::Identity(cells_id.clone()))? {
                let Some((row_id, col_id)) = key.split_once(':') else {
                    continue;
                };
                let text = match value {
                    SessionReadValue::Map(cell_map) => {
                        let target = TypeTarget::Identity(cell_map);
                        let field = session.get_map_value(&target, "text")?;
                        self.rich_text(field.as_ref())?
                    }
                    SessionReadValue::Any(Any::String(s)) => {
                        self.rich_text(Some(&SessionReadValue::Any(Any::String(s))))?
                    }
                    _ => RichText::default(),
                };
                cells.insert((row_id.to_string(), col_id.to_string()), TableCell { text });
            }
        }

        Ok(TableData {
            rows,
            columns,
            cells,
        })
    }
}

impl crate::session::PageDocSession {
    /// Read a single `affine:table` block in O(1) without scanning other blocks in `blocks`.
    ///
    /// Returns `Ok(None)` when `block_id` does not exist or is not an `affine:table`.
    pub fn read_table_block(&self, block_id: &str) -> DocResult<Option<TableData>> {
        let target = TypeTarget::Path(y_octo::TypePath::root("blocks").key(block_id));
        let Ok(raw_entries) = self.inner().read_map(&target) else {
            return Ok(None);
        };
        let entries: BTreeMap<String, SessionReadValue> = raw_entries.into_iter().collect();
        let is_table = matches!(
            entries.get("sys:flavour"),
            Some(SessionReadValue::Any(Any::String(flavour))) if flavour == "affine:table"
        );
        if !is_table {
            return Ok(None);
        }
        let reader = SnapshotReader {
            page: self,
            raw: BTreeMap::new(),
            visited: std::collections::BTreeSet::new(),
        };
        Ok(Some(reader.read_table(&entries)?))
    }
}

#[cfg(test)]
mod tests {
    use y_octo::{Any, SessionValue};

    use crate::{
        DocResult,
        read::BlockContent,
        schema::{BlockSpec, ParagraphType},
        session::PageDocSession,
    };

    #[test]
    fn seven_rich_blocks_round_trip_with_zero_writeback_and_table_undo() -> DocResult {
        let mut page = PageDocSession::new("doc:rich-7", 42)?;
        page.add_block(
            "page-1",
            BlockSpec::Page {
                title: "Rich Blocks".into(),
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
        page.add_block(
            "callout-1",
            BlockSpec::Callout {
                icon: "\u{1F4A1}".into(),
                background_color: Some("var(--affine-tag-blue)".into()),
            },
            Some("note-1"),
            None,
            3,
        )?;
        page.add_block(
            "callout-child",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Inside callout".into(),
            },
            Some("callout-1"),
            None,
            4,
        )?;
        page.add_block(
            "table-1",
            BlockSpec::Table {
                rows: vec![
                    vec!["Header A".into(), "Header B".into()],
                    vec!["Cell 1".into(), "Cell 2".into()],
                ],
            },
            Some("note-1"),
            None,
            5,
        )?;
        page.add_block(
            "attach-1",
            BlockSpec::Attachment {
                name: "spec.pdf".into(),
                size: 4096,
                mime_type: "application/pdf".into(),
                source_id: "blob-pdf-1".into(),
                caption: "Architecture PDF".into(),
                embed: true,
            },
            Some("note-1"),
            None,
            6,
        )?;
        page.add_block(
            "latex-1",
            BlockSpec::Latex {
                latex: r"\frac{-b \pm \sqrt{b^2-4ac}}{2a}".into(),
            },
            Some("note-1"),
            None,
            7,
        )?;
        page.add_block(
            "embed-link-1",
            BlockSpec::EmbedLinkedDoc {
                page_id: "doc:target".into(),
                style: "horizontal".into(),
                caption: String::new(),
            },
            Some("note-1"),
            None,
            8,
        )?;
        page.add_block(
            "embed-sync-1",
            BlockSpec::EmbedSyncedDoc {
                page_id: "doc:synced".into(),
                caption: "Synced note".into(),
            },
            Some("note-1"),
            None,
            9,
        )?;
        page.add_block(
            "surface-ref-1",
            BlockSpec::SurfaceRef {
                reference: "frame-1".into(),
                ref_flavour: "affine:frame".into(),
                caption: "Overview frame".into(),
            },
            Some("note-1"),
            None,
            10,
        )?;
        // Attach an unknown future property to verify 100% lossless preservation.
        page.set_block_prop(
            "callout-1",
            "prop:futureCustomField",
            SessionValue::Any(Any::String("keep-me".into())),
            11,
        )?;

        let mut reader = PageDocSession::new("doc:rich-7", 99)?;
        reader.apply_remote_update_v1(&page.encode_update_v1()?)?;
        let before_read = reader.encode_update_v1()?;
        let snap = reader.read_page_snapshot()?;
        let after_read = reader.encode_update_v1()?;
        assert_eq!(
            before_read, after_read,
            "reading 7 rich blocks must cause 0 writeback"
        );

        let callout = snap.block("callout-1").expect("callout");
        assert!(matches!(callout.content, BlockContent::Callout { .. }));
        assert_eq!(
            callout
                .props
                .get("prop:futureCustomField")
                .and_then(|v| v.as_str()),
            Some("keep-me")
        );
        assert_eq!(callout.children.len(), 1);

        let table = snap.block("table-1").expect("table");
        let BlockContent::Table(data) = &table.content else {
            panic!("expected table");
        };
        assert_eq!(data.rows.len(), 2);
        assert_eq!(data.columns.len(), 2);
        assert_eq!(
            data.cells[&("row-1".into(), "col-0".into())].text.plain,
            "Cell 1"
        );

        assert!(matches!(
            snap.block("attach-1").unwrap().content,
            BlockContent::Attachment { embed: true, .. }
        ));
        assert!(matches!(
            snap.block("latex-1").unwrap().content,
            BlockContent::Latex { .. }
        ));
        assert!(matches!(
            snap.block("embed-link-1").unwrap().content,
            BlockContent::EmbedLinkedDoc { .. }
        ));
        assert!(matches!(
            snap.block("embed-sync-1").unwrap().content,
            BlockContent::EmbedSyncedDoc { .. }
        ));
        assert!(matches!(
            snap.block("surface-ref-1").unwrap().content,
            BlockContent::SurfaceRef { .. }
        ));

        // Table cell edit (outside the 500ms undo capture window) and single-step undo.
        page.splice_table_cell_text("table-1", "row-1", "col-0", 0, 6, "Updated cell", 1_000)?;
        let edited = page.read_page_snapshot()?;
        let BlockContent::Table(t_after) = &edited.block("table-1").unwrap().content else {
            panic!("expected table");
        };
        assert_eq!(
            t_after.cells[&("row-1".into(), "col-0".into())].text.plain,
            "Updated cell"
        );

        assert!(page.undo()?.is_some());
        let undone = page.read_page_snapshot()?;
        let BlockContent::Table(t_undone) = &undone.block("table-1").unwrap().content else {
            panic!("expected table");
        };
        assert_eq!(
            t_undone.cells[&("row-1".into(), "col-0".into())].text.plain,
            "Cell 1"
        );
        Ok(())
    }

    #[test]
    fn flat_wire_table_and_callout_interoperate_with_js_and_preserve_marks() -> DocResult {
        use y_octo::{TextAttributes, TextDeltaOp};

        let mut page = PageDocSession::new("doc-flat", 2)?;
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Flat".into(),
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
        page.add_block(
            "table-flat",
            BlockSpec::Table {
                rows: vec![
                    vec!["Hello".into(), "World".into()],
                    vec![String::new(), String::new()],
                ],
            },
            Some("note"),
            None,
            3,
        )?;

        let snap = page.read_page_snapshot()?;
        let table_block = snap.block("table-flat").expect("table");
        assert!(
            table_block
                .props
                .keys()
                .any(|k| k.starts_with("prop:rows.") && k.ends_with(".order"))
        );
        assert!(
            table_block
                .props
                .keys()
                .any(|k| k.starts_with("prop:columns.") && k.ends_with(".order"))
        );
        assert!(
            table_block
                .props
                .keys()
                .any(|k| k.starts_with("prop:cells.") && k.ends_with(".text"))
        );
        assert!(!table_block.props.contains_key("prop:rows"));
        assert!(!table_block.props.contains_key("prop:columns"));
        assert!(!table_block.props.contains_key("prop:cells"));

        let BlockContent::Table(table) = &table_block.content else {
            panic!("expected table");
        };
        let row_id = table.rows[0].row_id.clone();
        let col_id = table.columns[0].column_id.clone();
        let cell_prop = format!("prop:cells.{row_id}:{col_id}.text");

        // Attach a bold mark to "Hello" and verify unchanged edit is a no-op.
        let attrs = TextAttributes::from([("bold".to_string(), Any::True)]);
        page.apply_text_delta(
            "table-flat",
            &cell_prop,
            &[TextDeltaOp::Retain {
                retain: 5,
                format: Some(attrs),
            }],
            4,
        )?;
        assert!(
            page.splice_table_cell_text("table-flat", &row_id, &col_id, 5, 0, "", 5)?
                .is_none()
        );
        let after_noop = page.read_page_snapshot()?;
        let BlockContent::Table(t_noop) = &after_noop.block("table-flat").unwrap().content else {
            panic!("expected table");
        };
        let has_bold = |delta: &[TextDeltaOp]| {
            delta.iter().any(|op| match op {
                TextDeltaOp::Insert {
                    format: Some(f), ..
                } => matches!(f.get("bold"), Some(Any::True)),
                _ => false,
            })
        };
        assert!(has_bold(
            &t_noop.cells[&(row_id.clone(), col_id.clone())].text.delta
        ));

        // Minimal diff edit keeps bold mark on preserved prefix.
        assert!(
            page.splice_table_cell_text("table-flat", &row_id, &col_id, 5, 0, "!", 6)?
                .is_some()
        );
        let after_edit = page.read_page_snapshot()?;
        let BlockContent::Table(t_edit) = &after_edit.block("table-flat").unwrap().content else {
            panic!("expected table");
        };
        let cell = &t_edit.cells[&(row_id, col_id)].text;
        assert_eq!(cell.plain, "Hello!");
        assert!(has_bold(&cell.delta));

        // Callout writes JS callout-model.ts props (prop:icon, prop:text, prop:backgroundColorName).
        page.add_block(
            "callout-1",
            BlockSpec::Callout {
                icon: "\u{1F680}".into(),
                background_color: Some("blue".into()),
            },
            Some("note"),
            None,
            7,
        )?;
        let snap2 = page.read_page_snapshot()?;
        let callout_block = snap2.block("callout-1").expect("callout");
        assert!(callout_block.props.contains_key("prop:icon"));
        assert!(callout_block.props.contains_key("prop:text"));
        assert!(callout_block.props.contains_key("prop:backgroundColorName"));
        assert!(!callout_block.props.contains_key("prop:emoji"));
        let BlockContent::Callout {
            icon,
            background_color,
            ..
        } = &callout_block.content
        else {
            panic!("expected callout");
        };
        assert_eq!(icon, "\u{1F680}");
        assert_eq!(background_color.as_deref(), Some("blue"));
        Ok(())
    }

    fn seed_table_doc(id: &str, client: u64, rows: Vec<Vec<String>>) -> DocResult<PageDocSession> {
        let mut p = PageDocSession::new(id, client)?;
        p.add_block("root", BlockSpec::Page { title: "T".into() }, None, None, 1)?;
        p.add_block(
            "note",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )?;
        p.add_block("tbl", BlockSpec::Table { rows }, Some("note"), None, 3)?;
        Ok(p)
    }

    fn read_cell_plain(p: &PageDocSession, r: &str, c: &str) -> DocResult<String> {
        let t = p.read_table_block("tbl")?.expect("table block");
        Ok(t.cells
            .get(&(r.to_string(), c.to_string()))
            .map(|cell| cell.text.plain.clone())
            .unwrap_or_default())
    }

    #[test]
    fn live_table_cell_precreates_jagged_matrix_and_merges_concurrent_splices() -> DocResult {
        use crate::session::LiveTableCell;

        let mut r1 = seed_table_doc(
            "doc:live-table",
            101,
            vec![vec!["H0".into(), "H1".into()], vec!["R1C0".into()]],
        )?;
        let seed = r1.encode_update_v1()?;
        let mut r2 = PageDocSession::new("doc:live-table", 202)?;
        r2.apply_remote_update_v1(&seed)?;

        assert_eq!(
            r1.resolve_live_table_cell("tbl", "row-1", "col-1")?,
            Some(LiveTableCell::LiveText)
        );
        let c1 = r1
            .splice_table_cell_text("tbl", "row-1", "col-1", 0, 0, "A", 10)?
            .expect("replica 1 splice");
        let c2 = r2
            .splice_table_cell_text("tbl", "row-1", "col-1", 0, 0, "B", 10)?
            .expect("replica 2 splice");
        r1.apply_remote_update_v1(&c2.update)?;
        r2.apply_remote_update_v1(&c1.update)?;
        let p1_val = read_cell_plain(&r1, "row-1", "col-1")?;
        let p2_val = read_cell_plain(&r2, "row-1", "col-1")?;
        assert_eq!(p1_val, p2_val);
        assert!(
            p1_val.contains('A') && p1_val.contains('B'),
            "got {p1_val:?}"
        );

        // Remote row deletion -> resolve_live_table_cell returns None & zero writeback.
        r1.inner_mut().map_remove(
            &y_octo::TypeTarget::Path(y_octo::TypePath::root("blocks").key("tbl")),
            "prop:rows.row-1.rowId",
        )?;
        r1.inner_mut().map_remove(
            &y_octo::TypeTarget::Path(y_octo::TypePath::root("blocks").key("tbl")),
            "prop:rows.row-1.order",
        )?;
        assert_eq!(r1.resolve_live_table_cell("tbl", "row-1", "col-1")?, None);
        let sv_before = r1.encode_state_vector_v1()?;
        assert!(
            r1.splice_table_cell_text("tbl", "row-1", "col-1", 0, 0, "orphan", 900)?
                .is_none()
        );
        assert_eq!(r1.encode_state_vector_v1()?, sv_before);
        Ok(())
    }

    #[test]
    fn live_table_cell_concurrent_prefix_suffix_and_five_boundary_marks() -> DocResult {
        use y_octo::{TextAttributes, TextDeltaOp, TextInsert};

        // Concurrent prefix/suffix edits around bold + link marks preserve interior marks 100%.
        let mut m1 = seed_table_doc("doc:live-marks", 11, vec![vec!["a mid b".into()]])?;
        m1.apply_text_delta(
            "tbl",
            "prop:cells.row-0:col-0.text",
            &[
                TextDeltaOp::Retain {
                    retain: 2,
                    format: None,
                },
                TextDeltaOp::Retain {
                    retain: 3,
                    format: Some(TextAttributes::from([
                        ("bold".to_string(), Any::True),
                        ("link".to_string(), Any::String("https://affine.pro".into())),
                    ])),
                },
            ],
            4,
        )?;
        let m_seed = m1.encode_update_v1()?;
        let mut m2 = PageDocSession::new("doc:live-marks", 22)?;
        m2.apply_remote_update_v1(&m_seed)?;
        let u1 = m1
            .splice_table_cell_text("tbl", "row-0", "col-0", 0, 0, "pre-", 10)?
            .unwrap()
            .update;
        let u2 = m2
            .splice_table_cell_text("tbl", "row-0", "col-0", 7, 0, "-post", 10)?
            .unwrap()
            .update;
        m1.apply_remote_update_v1(&u2)?;
        m2.apply_remote_update_v1(&u1)?;
        let t = m1.read_table_block("tbl")?.unwrap();
        let rich = &t.cells[&("row-0".into(), "col-0".into())].text;
        assert_eq!(rich.plain, "pre-a mid b-post");
        assert!(rich.delta.iter().any(|op| matches!(
            op,
            TextDeltaOp::Insert {
                insert: TextInsert::Text(s),
                format: Some(f),
            } if s == "mid"
                && f.get("bold") == Some(&Any::True)
                && f.get("link") == Some(&Any::String("https://affine.pro".into()))
        )));

        // Table-driven boundary rule across all 5 inline marks:
        // bold extends at right edge; code, link, reference, and latex never leak.
        let reference = Any::Object(Box::new(
            [
                ("type".to_string(), Any::String("LinkedPage".into())),
                ("pageId".to_string(), Any::String("doc:other".into())),
            ]
            .into_iter()
            .collect(),
        ));
        let cases: [(&str, &str, (&str, Any), bool); 5] = [
            ("bold", "see word", ("bold", Any::True), true),
            ("code", "see code", ("code", Any::True), false),
            (
                "link",
                "see site",
                ("link", Any::String("https://affine.pro".into())),
                false,
            ),
            ("reference", "see  ", ("reference", reference), false),
            (
                "latex",
                "see  ",
                ("latex", Any::String("x^2".into())),
                false,
            ),
        ];
        for (name, text, (key, val), expect_inherit) in cases {
            let mut p = seed_table_doc("doc:boundary", 31, vec![vec![text.to_string()]])?;
            let run = (text.encode_utf16().count() - 4) as u64;
            p.apply_text_delta(
                "tbl",
                "prop:cells.row-0:col-0.text",
                &[
                    TextDeltaOp::Retain {
                        retain: 4,
                        format: None,
                    },
                    TextDeltaOp::Retain {
                        retain: run,
                        format: Some(TextAttributes::from([(key.to_string(), val)])),
                    },
                ],
                5,
            )?;
            let end = text.encode_utf16().count() as u64;
            p.splice_table_cell_text("tbl", "row-0", "col-0", end, 0, "XY", 10)?;
            let table = p.read_table_block("tbl")?.unwrap();
            let delta = &table.cells[&("row-0".into(), "col-0".into())].text.delta;
            let last_has_key = delta.last().is_some_and(|op| {
                matches!(
                    op,
                    TextDeltaOp::Insert { format: Some(f), .. } if f.contains_key(key)
                )
            });
            assert_eq!(
                last_has_key, expect_inherit,
                "boundary mark {name}: delta={delta:?}"
            );
        }
        Ok(())
    }

    #[test]
    fn live_splice_coalesces_500ms_undo_window_for_table_and_surface() -> DocResult {
        use crate::schema::SurfaceElementSpec;

        let mut u = seed_table_doc("doc:undo-win", 33, vec![vec!["x".into()]])?;
        u.add_block("surf", BlockSpec::Surface, Some("root"), None, 4)?;
        u.add_surface_element(
            "surf",
            "sh-1",
            "a0",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[0,0,100,60]".into(),
                seed: 1,
                filled: true,
                text: Some("hi".into()),
            },
            5,
        )?;
        u.stop_capturing()?;
        u.splice_table_cell_text("tbl", "row-0", "col-0", 0, 1, "a", 100)?;
        u.splice_table_cell_text("tbl", "row-0", "col-0", 1, 0, "b", 200)?;
        assert_eq!(read_cell_plain(&u, "row-0", "col-0")?, "ab");
        u.undo()?;
        assert_eq!(read_cell_plain(&u, "row-0", "col-0")?, "x");

        u.stop_capturing()?;
        u.splice_surface_element_text("surf", "sh-1", "text", 0, 2, "ok", 600)?;
        u.splice_surface_element_text("surf", "sh-1", "text", 2, 0, "!", 700)?;
        u.undo()?;
        let s_snap = u.read_page_snapshot()?;
        let BlockContent::Surface { elements, .. } = &s_snap.block("surf").unwrap().content else {
            panic!("expected surface");
        };
        let crate::read::SurfaceElementKind::Shape(sh) = &elements[0].kind else {
            panic!("expected shape");
        };
        assert_eq!(sh.text.plain, "hi");
        Ok(())
    }

    #[test]
    fn legacy_nested_table_cell_lazy_upgrade_preserves_siblings_and_converges() -> DocResult {
        use crate::session::LiveTableCell;

        let mut leg = PageDocSession::new("doc:legacy-cell", 50)?;
        leg.add_block("root", BlockSpec::Page { title: "T".into() }, None, None, 1)?;
        leg.add_block(
            "note",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )?;
        leg.add_raw_block(
            "tbl",
            "affine:table",
            1,
            vec![
                (
                    "prop:rows".into(),
                    SessionValue::Map(vec![(
                        "r0".into(),
                        SessionValue::Map(vec![
                            ("rowId".into(), SessionValue::Any(Any::String("r0".into()))),
                            ("order".into(), SessionValue::Any(Any::String("a0".into()))),
                        ]),
                    )]),
                ),
                (
                    "prop:columns".into(),
                    SessionValue::Map(vec![(
                        "c0".into(),
                        SessionValue::Map(vec![
                            (
                                "columnId".into(),
                                SessionValue::Any(Any::String("c0".into())),
                            ),
                            ("order".into(), SessionValue::Any(Any::String("a0".into()))),
                        ]),
                    )]),
                ),
                (
                    "prop:cells".into(),
                    SessionValue::Map(vec![(
                        "r0:c0".into(),
                        SessionValue::Map(vec![
                            ("text".into(), SessionValue::Any(Any::String("old".into()))),
                            (
                                "backgroundColor".into(),
                                SessionValue::Any(Any::String("yellow".into())),
                            ),
                        ]),
                    )]),
                ),
            ],
            Some("note"),
            None,
            3,
        )?;
        let leg_seed = leg.encode_update_v1()?;
        let mut leg2 = PageDocSession::new("doc:legacy-cell", 60)?;
        leg2.apply_remote_update_v1(&leg_seed)?;

        assert_eq!(
            leg.resolve_live_table_cell("tbl", "r0", "c0")?,
            Some(LiveTableCell::Unupgraded)
        );
        let leg_sv = leg.encode_state_vector_v1()?;
        assert!(
            leg.splice_table_cell_text("tbl", "r0", "c0", 0, 0, "", 10)?
                .is_none()
        );
        assert_eq!(leg.encode_state_vector_v1()?, leg_sv);

        let lu1 = leg
            .splice_table_cell_text("tbl", "r0", "c0", 3, 0, "-1", 20)?
            .unwrap()
            .update;
        let lu2 = leg2
            .splice_table_cell_text("tbl", "r0", "c0", 3, 0, "-2", 20)?
            .unwrap()
            .update;
        leg.apply_remote_update_v1(&lu2)?;
        leg2.apply_remote_update_v1(&lu1)?;
        assert_eq!(
            read_cell_plain(&leg, "r0", "c0")?,
            read_cell_plain(&leg2, "r0", "c0")?
        );
        assert_eq!(
            leg.resolve_live_table_cell("tbl", "r0", "c0")?,
            Some(LiveTableCell::LiveText)
        );
        let cell_map_target = y_octo::TypeTarget::Path(
            y_octo::TypePath::root("blocks")
                .key("tbl")
                .key("prop:cells")
                .key("r0:c0"),
        );
        assert_eq!(
            leg.inner()
                .get_map_value(&cell_map_target, "backgroundColor")?,
            Some(y_octo::SessionReadValue::Any(Any::String("yellow".into())))
        );
        Ok(())
    }

    #[test]
    fn read_table_block_reads_single_table_and_rejects_non_table() -> DocResult {
        let mut p = seed_table_doc("doc:single-tbl", 77, vec![vec!["A".into(), "B".into()]])?;
        p.add_block(
            "p0",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Not a table".into(),
            },
            Some("note"),
            None,
            4,
        )?;
        assert!(p.read_table_block("p0")?.is_none());
        assert!(p.read_table_block("missing")?.is_none());
        let direct = p.read_table_block("tbl")?.expect("table");
        let full = p.read_page_snapshot()?;
        let BlockContent::Table(from_full) = &full.block("tbl").unwrap().content else {
            panic!("expected table");
        };
        assert_eq!(direct, *from_full);
        Ok(())
    }
}
