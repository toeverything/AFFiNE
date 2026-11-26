use y_octo::{
    Any, RelativePosition, SessionCommit, SessionReadValue, SessionValue, TextDeltaOp, TextInsert,
    TypePath, TypeTarget,
};

use crate::{
    DocError, DocResult,
    schema::{BlockSpec, SurfaceElementSpec},
};

use super::{PageCommit, PageDocSession, SelectionSnapshot, block_target};

impl PageDocSession {
    /// Add a surface element inside `surface_block_id`'s `prop:elements.value` `Y.Map`.
    pub fn add_surface_element(
        &mut self,
        surface_block_id: &str,
        element_id: impl Into<String>,
        index: &str,
        spec: SurfaceElementSpec,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        self.advance_time(now_ms);
        let element_id = element_id.into();
        let entries = spec.into_ymap_entries(&element_id, index);
        let elements_value_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value"),
        );
        let commit = self.session.map_set(
            &elements_value_target,
            element_id,
            SessionValue::Map(entries),
        )?;
        Ok(self.record_commit(commit))
    }

    /// Update a field on an existing surface element.
    pub fn set_surface_element_field(
        &mut self,
        surface_block_id: &str,
        element_id: &str,
        field: impl Into<String>,
        value: SessionValue,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        self.advance_time(now_ms);
        let target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value")
                .key(element_id),
        );
        let commit = self.session.map_set(&target, field.into(), value)?;
        Ok(self.record_commit(commit))
    }

    /// Format `[x, y, w, h]` into BlockSuite's wire `xywh` JSON string.
    pub fn format_xywh(xywh: [f64; 4]) -> String {
        let fmt = |v: f64| {
            let rounded = (v * 100.0).round() / 100.0;
            if (rounded - rounded.round()).abs() < 1e-6 {
                format!("{}", rounded.round() as i64)
            } else {
                format!("{rounded}")
            }
        };
        format!(
            "[{},{},{},{}]",
            fmt(xywh[0]),
            fmt(xywh[1]),
            fmt(xywh[2]),
            fmt(xywh[3])
        )
    }

    /// Find the page's existing `affine:surface` block, or create one under the root page.
    pub fn ensure_surface_block(&mut self, now_ms: u64) -> DocResult<String> {
        let snapshot = self.read_page_snapshot()?;
        let root = snapshot
            .root
            .as_ref()
            .ok_or_else(|| DocError::InvalidState("page has no root block".into()))?;
        if let Some(surface) = root
            .children
            .iter()
            .find(|c| matches!(c.content, crate::read::BlockContent::Surface { .. }))
        {
            return Ok(surface.id.clone());
        }
        let surface_id = format!("surface:{}", root.id);
        self.add_block(
            surface_id.clone(),
            BlockSpec::Surface,
            Some(&root.id),
            Some(0),
            now_ms,
        )?;
        Ok(surface_id)
    }

    /// Remove a surface element from `surface_block_id`'s `prop:elements.value` `Y.Map`.
    pub fn remove_surface_element(
        &mut self,
        surface_block_id: &str,
        element_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.advance_time(now_ms);
        let elements_value_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value"),
        );
        let commit = self
            .session
            .map_remove(&elements_value_target, element_id)?;
        Ok(self.record_commit(commit))
    }

    /// Update multiple fields on an existing surface element in one tracked transaction.
    pub fn update_surface_element_fields(
        &mut self,
        surface_block_id: &str,
        element_id: &str,
        fields: Vec<(String, SessionValue)>,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let surface_block_id = surface_block_id.to_string();
        let element_id = element_id.to_string();
        self.structural_edit(now_ms, move |page| {
            let target = TypeTarget::Path(
                TypePath::root("blocks")
                    .key(&surface_block_id)
                    .key("prop:elements")
                    .key("value")
                    .key(&element_id),
            );
            for (field, value) in fields {
                page.session.map_set(&target, field, value)?;
            }
            Ok(())
        })
    }

    /// Splice a UTF-16 range on a surface element's `Y.Text` field (`"text"` or `"title"`),
    /// preserving untouched prefix/suffix characters and formatting marks under concurrent edits.
    #[allow(clippy::too_many_arguments)]
    pub fn splice_surface_element_text(
        &mut self,
        surface_block_id: &str,
        element_id: &str,
        field: &str,
        utf16_start: u64,
        utf16_delete_len: u64,
        insert: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let elem_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value")
                .key(element_id),
        );
        match self.session.get_map_value(&elem_target, field)? {
            Some(SessionReadValue::Text(identity)) => {
                let target = TypeTarget::Identity(identity);
                self.splice_live_text(&target, utf16_start, utf16_delete_len, insert, now_ms)
            }
            other => {
                let old = match other {
                    Some(SessionReadValue::Any(Any::String(s))) => s,
                    _ => String::new(),
                };
                let mut u16_buf: Vec<u16> = old.encode_utf16().collect();
                let start = (utf16_start as usize).min(u16_buf.len());
                let del = (utf16_delete_len as usize).min(u16_buf.len() - start);
                if del == 0 && insert.is_empty() {
                    return Ok(None);
                }
                u16_buf.splice(start..start + del, insert.encode_utf16());
                let upgraded = String::from_utf16_lossy(&u16_buf);
                let delta = if upgraded.is_empty() {
                    Vec::new()
                } else {
                    vec![TextDeltaOp::Insert {
                        insert: TextInsert::Text(upgraded),
                        format: None,
                    }]
                };
                self.advance_time(now_ms);
                let commit = self.session.map_set(
                    &elem_target,
                    field.to_string(),
                    SessionValue::Text(delta),
                )?;
                Ok(self.record_commit(commit))
            }
        }
    }

    /// Splice a UTF-16 range on a block's `prop:title` `Y.Text` (e.g. `affine:frame`),
    /// preserving untouched prefix/suffix characters and marks.
    pub fn splice_block_title_text(
        &mut self,
        block_id: &str,
        utf16_start: u64,
        utf16_delete_len: u64,
        insert: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key("prop:title"));
        if self.session.read_text_len(&target).is_err() {
            return Ok(None);
        }
        self.splice_live_text(&target, utf16_start, utf16_delete_len, insert, now_ms)
    }

    /// Encode a `RelativePosition` at UTF-16 `offset` on a surface element's `Y.Text` field.
    pub fn encode_surface_text_relative_position(
        &self,
        surface_block_id: &str,
        element_id: &str,
        field: &str,
        offset: u64,
    ) -> DocResult<Option<RelativePosition>> {
        let elem_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value")
                .key(element_id),
        );
        let Some(SessionReadValue::Text(identity)) =
            self.session.get_map_value(&elem_target, field)?
        else {
            return Ok(None);
        };
        let target = TypeTarget::Identity(identity);
        let clamped = offset.min(self.session.read_text_len(&target)?);
        Ok(Some(
            self.session
                .create_relative_position(&target, clamped, -1)?,
        ))
    }

    /// Resolve a `RelativePosition` back to a UTF-16 offset on a surface element's `Y.Text` field.
    pub fn resolve_surface_text_relative_position(
        &self,
        surface_block_id: &str,
        element_id: &str,
        field: &str,
        pos: &RelativePosition,
    ) -> DocResult<Option<u64>> {
        let elem_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value")
                .key(element_id),
        );
        let Some(SessionReadValue::Text(identity)) =
            self.session.get_map_value(&elem_target, field)?
        else {
            return Ok(None);
        };
        let Some(abs) = self.session.resolve_relative_position(pos, true) else {
            return Ok(None);
        };
        Ok((abs.r#type == identity).then_some(abs.index))
    }

    /// Encode a `RelativePosition` at UTF-16 `offset` on a block's `prop:title` `Y.Text`.
    pub fn encode_block_title_relative_position(
        &self,
        block_id: &str,
        offset: u64,
    ) -> DocResult<Option<RelativePosition>> {
        let block = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let Some(SessionReadValue::Text(identity)) =
            self.session.get_map_value(&block, "prop:title")?
        else {
            return Ok(None);
        };
        let target = TypeTarget::Identity(identity);
        let clamped = offset.min(self.session.read_text_len(&target)?);
        Ok(Some(
            self.session
                .create_relative_position(&target, clamped, -1)?,
        ))
    }

    /// Resolve a `RelativePosition` back to a UTF-16 offset on a block's `prop:title` `Y.Text`.
    pub fn resolve_block_title_relative_position(
        &self,
        block_id: &str,
        pos: &RelativePosition,
    ) -> DocResult<Option<u64>> {
        let block = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let Some(SessionReadValue::Text(identity)) =
            self.session.get_map_value(&block, "prop:title")?
        else {
            return Ok(None);
        };
        let Some(abs) = self.session.resolve_relative_position(pos, true) else {
            return Ok(None);
        };
        Ok((abs.r#type == identity).then_some(abs.index))
    }

    /// Create an Edgeless-only Note (`prop:displayMode = "edgeless"`) with an initial paragraph
    /// child in one atomic undoable transaction.
    #[allow(clippy::too_many_arguments)]
    pub fn add_edgeless_note(
        &mut self,
        root_id: &str,
        note_id: &str,
        para_id: &str,
        index: &str,
        xywh: [f64; 4],
        text: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let root_id = root_id.to_string();
        let note_id = note_id.to_string();
        let para_id = para_id.to_string();
        let index = index.to_string();
        let text = text.to_string();
        self.structural_edit(now_ms, move |page| {
            page.add_block(
                &note_id,
                BlockSpec::Note {
                    xywh: Some(Self::format_xywh(xywh)),
                },
                Some(&root_id),
                None,
                now_ms,
            )?;
            let note_target = block_target(&note_id);
            page.session.map_set(
                &note_target,
                "prop:displayMode".to_string(),
                SessionValue::Any(Any::String("edgeless".into())),
            )?;
            page.set_block_index(&note_id, &index, now_ms)?;
            page.add_block(
                &para_id,
                BlockSpec::Paragraph {
                    paragraph_type: crate::schema::ParagraphType::Text,
                    text,
                },
                Some(&note_id),
                None,
                now_ms,
            )?;
            Ok(())
        })
    }

    /// Create an `affine:frame` under `surface_id` (creating `affine:surface` inside the same
    /// transaction when `surface_id` is `None`), set its `prop:index`, and populate
    /// `prop:childElementIds` with `enclosed_ids` in one atomic undoable transaction.
    #[allow(clippy::too_many_arguments)]
    pub fn add_frame_with_children(
        &mut self,
        surface_id: Option<&str>,
        frame_id: &str,
        title: &str,
        index: &str,
        xywh: [f64; 4],
        enclosed_ids: &[&str],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let surface_id = surface_id.map(str::to_string);
        let frame_id = frame_id.to_string();
        let title = title.to_string();
        let index = index.to_string();
        let enclosed_ids: Vec<String> = enclosed_ids.iter().map(|s| (*s).to_string()).collect();
        self.structural_edit(now_ms, move |page| {
            let sid = match &surface_id {
                Some(id) => id.clone(),
                None => page.ensure_surface_block(now_ms)?,
            };
            page.add_block(
                &frame_id,
                BlockSpec::Frame {
                    title,
                    xywh: Some(Self::format_xywh(xywh)),
                    presentation_index: Some(index.clone()),
                },
                Some(&sid),
                None,
                now_ms,
            )?;
            page.set_block_index(&frame_id, &index, now_ms)?;
            if !enclosed_ids.is_empty() {
                page.set_frame_child_element_ids(&frame_id, &enclosed_ids, now_ms)?;
            }
            Ok(())
        })
    }

    /// Commit a connector label on close (matching BlockSuite `edgeless-connector-label-editor.ts`):
    /// - If `trimmed_text.is_empty()`, removes `"text"`, `"labelXYWH"`, and `"labelOffset"`.
    /// - Otherwise sets `labelDisplay: true`, writes `labelOffset` (`{ distance: 0.5, anchor: "center" }`)
    ///   as a plain `Any::Object` if absent, and writes `labelXYWH` wrapped via [`crate::schema::map_array_any`].
    pub fn commit_connector_label(
        &mut self,
        surface_block_id: &str,
        element_id: &str,
        trimmed_text: &str,
        label_xywh: [f64; 4],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.advance_time(now_ms);
        let elem_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value")
                .key(element_id),
        );
        if trimmed_text.is_empty() {
            return self.structural_edit(now_ms, move |page| {
                for key in ["text", "labelXYWH", "labelOffset"] {
                    let _ = page.session.map_remove(&elem_target, key);
                }
                Ok(())
            });
        }
        let has_offset = self
            .session
            .get_map_value(&elem_target, "labelOffset")?
            .is_some();
        let mut fields = vec![
            ("labelDisplay".to_string(), SessionValue::Any(Any::True)),
            (
                "labelXYWH".to_string(),
                SessionValue::Any(crate::schema::map_array_any(
                    label_xywh
                        .into_iter()
                        .map(|v| Any::Float64(v.into()))
                        .collect(),
                )),
            ),
        ];
        if !has_offset {
            let mut offset_map = y_octo::AHashMap::default();
            offset_map.insert("distance".to_string(), Any::Float64(0.5.into()));
            offset_map.insert("anchor".to_string(), Any::String("center".to_string()));
            fields.push((
                "labelOffset".to_string(),
                SessionValue::Any(Any::Object(Box::new(offset_map))),
            ));
        }
        self.update_surface_element_fields(surface_block_id, element_id, fields, now_ms)
    }

    /// Delete the given blocks and surface elements, cascading to remove every `Connector`
    /// in any `affine:surface` whose `source.id` or `target.id` references a deleted ID,
    /// in one atomic undoable transaction.
    pub fn delete_blocks_and_elements_with_connectors(
        &mut self,
        block_ids: &[&str],
        surface_elements: &[(&str, &str)],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let snap = self.read_page_snapshot()?;
        let mut deleted_ids: std::collections::HashSet<String> = block_ids
            .iter()
            .map(|s| (*s).to_string())
            .chain(surface_elements.iter().map(|(_, eid)| (*eid).to_string()))
            .collect();
        let mut cascade_connectors: Vec<(String, String)> = Vec::new();
        if let Some(root) = &snap.root {
            for node in root.walk() {
                if let crate::read::BlockContent::Surface { elements, .. } = &node.content {
                    for el in elements {
                        if let crate::read::SurfaceElementKind::Connector(c) = &el.kind {
                            let src_hit = c
                                .source
                                .id
                                .as_deref()
                                .is_some_and(|id| deleted_ids.contains(id));
                            let tgt_hit = c
                                .target
                                .id
                                .as_deref()
                                .is_some_and(|id| deleted_ids.contains(id));
                            if (src_hit || tgt_hit) && deleted_ids.insert(el.id.clone()) {
                                cascade_connectors.push((node.id.clone(), el.id.clone()));
                            }
                        }
                    }
                }
            }
        }
        let block_parents: Vec<(String, Option<String>)> = block_ids
            .iter()
            .map(|&bid| {
                let parent = snap.root.as_ref().and_then(|root| {
                    root.walk()
                        .find(|n| n.children.iter().any(|c| c.id == bid))
                        .map(|n| n.id.clone())
                });
                (bid.to_string(), parent)
            })
            .collect();
        let mut all_surf: Vec<(String, String)> = surface_elements
            .iter()
            .map(|(s, e)| ((*s).to_string(), (*e).to_string()))
            .collect();
        all_surf.extend(cascade_connectors);

        self.structural_edit(now_ms, move |page| {
            for (sid, eid) in &all_surf {
                page.remove_surface_element(sid, eid, now_ms)?;
            }
            for (bid, parent) in &block_parents {
                if let Some(parent_id) = parent {
                    page.delete_block_subtree(parent_id, bid, now_ms)?;
                }
            }
            Ok(())
        })
    }

    /// Replace the `Y.Text` field (`"text"` or `"title"`) on a surface element.
    pub fn set_surface_element_text(
        &mut self,
        surface_block_id: &str,
        element_id: &str,
        field: &str,
        text: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.advance_time(now_ms);
        let elem_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value")
                .key(element_id),
        );
        let existing = self.session.get_map_value(&elem_target, field)?;
        match existing {
            Some(SessionReadValue::Text(identity)) => {
                let target = TypeTarget::Identity(identity);
                let len = self.session.read_text_len(&target)?;
                let text = text.to_string();
                self.structural_edit(now_ms, move |page| {
                    if len > 0 {
                        page.session.text_remove(&target, 0, len)?;
                    }
                    if !text.is_empty() {
                        page.session.text_insert(&target, 0, &text)?;
                    }
                    Ok(())
                })
            }
            _ => {
                let delta = if text.is_empty() {
                    Vec::new()
                } else {
                    vec![TextDeltaOp::Insert {
                        insert: TextInsert::Text(text.to_string()),
                        format: None,
                    }]
                };
                let commit = self.session.map_set(
                    &elem_target,
                    field.to_string(),
                    SessionValue::Text(delta),
                )?;
                Ok(self.record_commit(commit))
            }
        }
    }

    /// Replace `prop:title` `Y.Text` on a block (such as `affine:frame` or `affine:page`).
    pub fn set_block_title_text(
        &mut self,
        block_id: &str,
        text: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.advance_time(now_ms);
        let target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key("prop:title"));
        let len = self.session.read_text_len(&target).unwrap_or(0);
        let text = text.to_string();
        self.structural_edit(now_ms, move |page| {
            if len > 0 {
                page.session.text_remove(&target, 0, len)?;
            }
            if !text.is_empty() {
                page.session.text_insert(&target, 0, &text)?;
            }
            Ok(())
        })
    }

    /// Update `prop:xywh` on a spatial block (`affine:note`, `affine:frame`, `affine:edgeless-text`).
    pub fn set_block_xywh(
        &mut self,
        block_id: &str,
        xywh: [f64; 4],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.set_block_prop(
            block_id,
            "prop:xywh",
            SessionValue::Any(Any::String(Self::format_xywh(xywh))),
            now_ms,
        )
    }

    /// Update `prop:index` on a spatial block.
    pub fn set_block_index(
        &mut self,
        block_id: &str,
        index: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.set_block_prop(
            block_id,
            "prop:index",
            SessionValue::Any(Any::String(index.to_string())),
            now_ms,
        )
    }

    /// Update `prop:rotate` on a spatial block (e.g. `affine:edgeless-text`).
    pub fn set_block_rotate(
        &mut self,
        block_id: &str,
        rotate: f64,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.set_block_prop(
            block_id,
            "prop:rotate",
            SessionValue::Any(Any::Float64(rotate.into())),
            now_ms,
        )
    }

    /// Replace `prop:childElementIds` on an `affine:frame` block.
    pub fn set_frame_child_element_ids(
        &mut self,
        frame_id: &str,
        child_ids: &[String],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let entries = child_ids
            .iter()
            .map(|id| (id.clone(), SessionValue::Any(Any::True)))
            .collect();
        self.set_block_prop(
            frame_id,
            "prop:childElementIds",
            SessionValue::Map(entries),
            now_ms,
        )
    }
}
