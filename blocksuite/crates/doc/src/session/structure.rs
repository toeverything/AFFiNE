use std::collections::BTreeSet;

use y_octo::{Any, SessionReadValue, SessionTxOrigin, SessionValue, TextDeltaOp};

use crate::{DocError, DocResult, schema::BlockSpec};

use super::{
    ChildGraph, PageCommit, PageDocSession, any_to_normalized_json, block_target, child_values,
    children_target, descendants, split_delta,
};

impl PageDocSession {
    pub(super) fn child_graph(&self) -> DocResult<ChildGraph> {
        self.session
            .read_map(&self.blocks_target)?
            .into_iter()
            .map(|(id, _)| {
                let children = self.read_unknown_block(&id)?.children;
                Ok((id, children))
            })
            .collect()
    }

    fn child_slot(graph: &ChildGraph, parent: &str, child: &str) -> DocResult<u64> {
        graph
            .get(parent)
            .and_then(|v| v.iter().position(|id| id == child))
            .map(|i| i as u64)
            .ok_or_else(|| DocError::InvalidState(format!("{child} is not a child of {parent}")))
    }

    /// Validate the entire compound operation against the same CRDT state before opening
    /// the live transaction. y-octo cannot roll back an open transaction. Nested commands
    /// run under the outer validation pass. The closure must only mutate its page argument.
    /// Ordinary single-text edits bypass this path.
    pub fn structural_edit(
        &mut self,
        now_ms: u64,
        apply: impl FnOnce(&mut Self) -> DocResult + Clone,
    ) -> DocResult<PageCommit> {
        if self.session.tx_depth() == 0 {
            let mut validation = Self::new(self.guid(), self.client_id())?;
            validation.apply_remote_update_v1(&self.encode_update_v1()?)?;
            // The private replica continues the source clock and never publishes its writes.
            validation.session.set_client(self.client_id());
            validation.session.begin_tx(SessionTxOrigin::Tracked)?;
            apply.clone()(&mut validation)?;
        }
        self.stop_capturing()?;
        self.advance_time(now_ms);
        self.session.begin_tx(SessionTxOrigin::Tracked)?;
        let result = apply(self);
        let commit = self.session.commit_tx();
        self.stop_capturing()?;
        result?;
        Ok(self.record_commit(commit?))
    }

    pub fn delete_block_subtree(
        &mut self,
        parent_id: &str,
        block_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let mut graph = self.child_graph()?;
        let index = Self::child_slot(&graph, parent_id, block_id)?;
        graph.get_mut(parent_id).unwrap().remove(index as usize);
        let candidates = descendants(&graph, [block_id.to_owned()]);
        let external = graph
            .iter()
            .filter(|(id, _)| !candidates.contains(*id))
            .flat_map(|(_, children)| {
                children
                    .iter()
                    .filter(|id| candidates.contains(*id))
                    .cloned()
            });
        let retained = descendants(&graph, external);
        self.structural_edit(now_ms, |page| {
            page.session
                .array_remove(&children_target(parent_id), index, 1)?;
            for id in candidates.difference(&retained) {
                page.session.map_remove(&page.blocks_target, id)?;
            }
            Ok(())
        })
    }

    fn parent_slot(&self, id: &str) -> DocResult<(String, u64)> {
        self.child_graph()?
            .into_iter()
            .find_map(|(p, children)| children.iter().position(|c| c == id).map(|i| (p, i as u64)))
            .ok_or_else(|| DocError::InvalidState(format!("block {id} has no parent")))
    }

    fn numbered_order(&self, id: &str) -> DocResult<Option<i32>> {
        let block = block_target(id);
        let string_is = |key, expected: &str| -> DocResult<bool> {
            Ok(
                matches!(self.session.get_map_value(&block, key)?, Some(SessionReadValue::Any(Any::String(s))) if s == expected),
            )
        };
        if !string_is("sys:flavour", "affine:list")? || !string_is("prop:type", "numbered")? {
            return Ok(None);
        }
        let value = match self.session.get_map_value(&block, "prop:order")? {
            Some(SessionReadValue::Any(n)) => any_to_normalized_json(&n).as_f64().map(|n| n as i32),
            _ => None,
        };
        Ok(Some(value.unwrap_or(0)))
    }

    /// Renumber the run of numbered list items of `parent` starting at child `slot`, continuing
    /// a numbered item right before it or starting at `initial`.
    pub fn correct_numbered_order_from(
        &mut self,
        parent: &str,
        slot: usize,
        initial: i32,
    ) -> DocResult {
        let children = self.read_unknown_block(parent)?.children;
        let Some(first) = children.get(slot) else {
            return Ok(());
        };
        if self.numbered_order(first)?.is_none() {
            return Ok(());
        }
        let mut order = initial;
        if let Some(prev) = slot.checked_sub(1).and_then(|i| children.get(i))
            && let Some(previous) = self.numbered_order(prev)?
        {
            if previous == 0 {
                self.session.map_set(
                    &block_target(prev),
                    "prop:order".into(),
                    SessionValue::Any(Any::Integer(1)),
                )?;
            }
            order = previous.max(1).saturating_add(1);
        }
        for id in &children[slot..] {
            let Some(existing) = self.numbered_order(id)? else {
                break;
            };
            if existing != order {
                self.session.map_set(
                    &block_target(id),
                    "prop:order".into(),
                    SessionValue::Any(Any::Integer(order)),
                )?;
            }
            order = order.saturating_add(1);
        }
        Ok(())
    }

    pub fn dedent_block(&mut self, id: &str, now_ms: u64) -> DocResult<PageCommit> {
        let (parent, slot) = self.parent_slot(id)?;
        let p = self.read_unknown_block(&parent)?;
        if !matches!(p.flavour.as_str(), "affine:paragraph" | "affine:list") {
            return Err(DocError::InvalidState(
                "cannot outdent from this parent".into(),
            ));
        }
        let p_child_count = self.read_unknown_block(id)?.children.len();
        let (grandparent, parent_slot) = self.parent_slot(&parent)?;
        self.structural_edit(now_ms, |page| {
            let tail = &p.children[slot as usize + 1..];
            if !tail.is_empty() {
                page.session.array_remove(
                    &children_target(&parent),
                    slot + 1,
                    tail.len() as u64,
                )?;
                page.session
                    .array_push(&children_target(id), child_values(tail))?;
                page.correct_numbered_order_from(id, p_child_count, 1)?;
            }
            page.reparent_block(id, &parent, &grandparent, parent_slot + 1, now_ms)?;
            Ok(())
        })
    }

    pub fn remove_lifting_children(&mut self, id: &str, now_ms: u64) -> DocResult<PageCommit> {
        let (parent, index) = self.parent_slot(id)?;
        let children = self.read_unknown_block(id)?.children;
        self.structural_edit(now_ms, |page| {
            page.session
                .array_remove(&children_target(&parent), index, 1)?;
            if !children.is_empty() {
                page.session.array_insert(
                    &children_target(&parent),
                    index,
                    child_values(&children),
                )?;
            }
            page.session.map_remove(&page.blocks_target, id)?;
            Ok(())
        })
    }

    pub fn reparent_block(
        &mut self,
        block_id: &str,
        old_parent_id: &str,
        new_parent_id: &str,
        new_index: u64,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let graph = self.child_graph()?;
        let index = Self::child_slot(&graph, old_parent_id, block_id)?;
        let siblings = graph
            .get(new_parent_id)
            .ok_or_else(|| DocError::BlockNotFound(new_parent_id.into()))?;
        if new_index > siblings.len() as u64 - u64::from(old_parent_id == new_parent_id)
            || (old_parent_id != new_parent_id && siblings.iter().any(|s| s == block_id))
            || descendants(&graph, [block_id.to_owned()]).contains(new_parent_id)
        {
            return Err(DocError::InvalidState("invalid block destination".into()));
        }
        self.structural_edit(now_ms, |page| {
            page.session
                .array_remove(&children_target(old_parent_id), index, 1)?;
            page.session.array_insert(
                &children_target(new_parent_id),
                new_index,
                vec![SessionValue::Any(Any::String(block_id.into()))],
            )?;
            if page.read_unknown_block(block_id)?.flavour == "affine:list" {
                page.correct_numbered_order_from(old_parent_id, index as usize, 1)?;
            }
            page.correct_numbered_order_from(new_parent_id, new_index as usize, 1)
        })
    }

    pub fn split_text_block(
        &mut self,
        block_id: &str,
        new_block_id: &str,
        split_utf16: u64,
        new_spec: BlockSpec,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let graph = self.child_graph()?;
        if graph.contains_key(new_block_id) {
            return Err(DocError::InvalidState("duplicate block id".into()));
        }
        let children = graph
            .get(block_id)
            .ok_or_else(|| DocError::BlockNotFound(block_id.into()))?;
        let collapsed = matches!(
            self.session
                .get_map_value(&block_target(block_id), "prop:collapsed")?,
            Some(SessionReadValue::Any(Any::True))
        );
        let is_page = matches!(self.session.get_map_value(&block_target(block_id),"sys:flavour")?,Some(SessionReadValue::Any(Any::String(f))) if f=="affine:page");
        let (parent, index) = if is_page {
            let mut note = None;
            for id in children {
                let b = block_target(id);
                if matches!(self.session.get_map_value(&b,"sys:flavour")?,Some(SessionReadValue::Any(Any::String(f))) if f=="affine:note")
                    && !matches!(self.session.get_map_value(&b,"prop:displayMode")?,Some(SessionReadValue::Any(Any::String(mode))) if mode=="edgeless")
                    && !matches!(
                        self.session.get_map_value(&b, "prop:hidden")?,
                        Some(SessionReadValue::Any(Any::True))
                    )
                {
                    note = Some(id.as_str());
                    break;
                }
            }
            (
                note.ok_or_else(|| {
                    DocError::InvalidState("page has no visible note to receive title text".into())
                })?,
                0,
            )
        } else if split_utf16 > 0 && !children.is_empty() && !collapsed {
            (block_id, 0)
        } else {
            graph
                .iter()
                .find_map(|(parent, children)| {
                    children
                        .iter()
                        .position(|id| id == block_id)
                        .map(|i| (parent.as_str(), i + 1))
                })
                .ok_or_else(|| DocError::InvalidState("split block has no parent".into()))?
        };
        let target = self.editable_text_target(block_id)?;
        let length = self.session.read_text_len(&target)?;
        let (_, tail) = split_delta(&self.session.read_text_delta(&target)?, split_utf16)?;
        let mut entries = new_spec.into_yblock_entries(new_block_id);
        let text = entries
            .iter_mut()
            .find(|(key, _)| key == "prop:text")
            .ok_or_else(|| DocError::InvalidState("split requires a text block".into()))?;
        text.1 = SessionValue::Text(tail);
        self.structural_edit(now_ms, |page| {
            if length > split_utf16 {
                page.session
                    .text_remove(&target, split_utf16, length - split_utf16)?;
            }
            page.session.map_set(
                &page.blocks_target,
                new_block_id.to_owned(),
                SessionValue::Map(entries),
            )?;
            page.session.array_insert(
                &children_target(parent),
                index as u64,
                vec![SessionValue::Any(Any::String(new_block_id.into()))],
            )?;
            if split_utf16 == 0 && !is_page && !children.is_empty() {
                page.session
                    .array_remove(&children_target(block_id), 0, children.len() as u64)?;
                page.session
                    .array_push(&children_target(new_block_id), child_values(children))?;
            }
            page.correct_numbered_order_from(parent, index, 1)
        })
    }

    pub fn merge_with_previous_text_block(
        &mut self,
        target_id: &str,
        source_id: &str,
        source_parent_id: &str,
        now_ms: u64,
    ) -> DocResult<(u64, PageCommit)> {
        let graph = self.child_graph()?;
        Self::child_slot(&graph, source_parent_id, source_id)?;
        let join = self
            .session
            .read_text_len(&self.editable_text_target(target_id)?)?;
        let target = self.editable_text_target(target_id)?;
        let source = self.editable_text_target(source_id)?;
        let delta = self.session.read_text_delta(&source)?;
        let source_len = self.session.read_text_len(&source)?;
        let keep = self.read_unknown_block(target_id)?.flavour == "affine:page"
            && self.read_unknown_block(source_parent_id)?.flavour == "affine:note"
            && graph[source_parent_id].len() == 1
            && graph[source_id].is_empty();
        let commit = self.structural_edit(now_ms, |page| {
            let mut append = vec![TextDeltaOp::Retain {
                retain: join,
                format: None,
            }];
            append.extend(delta);
            page.session.text_apply_delta(&target, &append)?;
            if keep {
                page.session.text_remove(&source, 0, source_len)?;
            } else {
                page.remove_lifting_children(source_id, now_ms)?;
            }
            Ok(())
        })?;
        Ok((join, commit))
    }

    /// Endpoints are in document order. The caller supplies the intervening blocks in
    /// page-content pre-order, including collapsed descendants, and the roots of surviving subtrees.
    pub fn delete_cross_block_range(
        &mut self,
        start: (&str, u64),
        end: (&str, u64),
        intermediate: &[String],
        survivors: &[String],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let graph = self.child_graph()?;
        let mut removed = intermediate.to_vec();
        removed.push(end.0.to_owned());
        self.join_range(
            &graph, start.0, start.1, end.0, end.1, &removed, survivors, now_ms,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn join_range(
        &mut self,
        graph: &ChildGraph,
        start: &str,
        from: u64,
        end: &str,
        to: u64,
        removed: &[String],
        moved: &[String],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let candidates = descendants(graph, removed.iter().cloned());
        let protected = descendants(graph, moved.iter().cloned());
        if moved.iter().any(|id| !candidates.contains(id))
            || removed.iter().any(|id| protected.contains(id))
        {
            return Err(DocError::InvalidState("invalid surviving subtree".into()));
        }
        let ids: BTreeSet<_> = candidates.difference(&protected).cloned().collect();
        if ids
            .iter()
            .any(|id| id.as_str() == start || !graph.contains_key(id))
            || !graph.contains_key(start)
        {
            return Err(DocError::InvalidState("invalid joined block range".into()));
        }
        let target = self.editable_text_target(start)?;
        let source = self.editable_text_target(end)?;
        split_delta(&self.session.read_text_delta(&target)?, from)?;
        let (_, tail) = split_delta(&self.session.read_text_delta(&source)?, to)?;
        let mut delta = vec![TextDeltaOp::Retain {
            retain: from,
            format: None,
        }];
        let len = self.session.read_text_len(&target)? - from;
        if len > 0 {
            delta.push(TextDeltaOp::Delete { delete: len });
        }
        delta.extend(tail);
        let flavour = self.read_unknown_block(start)?.flavour;
        let title = flavour == "affine:page";
        let dest = if title && !moved.is_empty() {
            self.read_page_snapshot()?
                .root
                .and_then(|root| {
                    root.children
                        .into_iter()
                        .find(|node| node.is_page_visible_note())
                })
                .map(|node| node.id)
                .ok_or_else(|| DocError::InvalidState("title has no visible note".into()))?
        } else {
            start.to_owned()
        };
        if moved
            .iter()
            .any(|id| descendants(graph, [id.clone()]).contains(start))
        {
            return Err(DocError::InvalidState("join would create a cycle".into()));
        }
        self.structural_edit(now_ms, |page| {
            page.session.text_apply_delta(&target, &delta)?;
            for (id, children) in graph.iter().filter(|(id, _)| !ids.contains(id.as_str())) {
                for (index, _) in children
                    .iter()
                    .enumerate()
                    .rev()
                    .filter(|(_, id)| ids.contains(id.as_str()))
                {
                    page.session
                        .array_remove(&children_target(id), index as u64, 1)?;
                }
            }
            if !moved.is_empty() {
                if title {
                    page.session
                        .array_insert(&children_target(&dest), 0, child_values(moved))?;
                } else if crate::schema::is_leaf_flavour(&flavour) {
                    let (parent, slot) = page.parent_slot(start)?;
                    page.session.array_insert(
                        &children_target(&parent),
                        slot + 1,
                        child_values(moved),
                    )?;
                } else {
                    page.session
                        .array_push(&children_target(&dest), child_values(moved))?;
                }
            }
            for id in ids {
                page.session.map_remove(&page.blocks_target, &id)?;
            }
            Ok(())
        })
    }

    pub fn convert_block_flavour(
        &mut self,
        id: &str,
        replacement_id: &str,
        spec: BlockSpec,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        self.convert_with_initial_order(id, replacement_id, spec, 1, now_ms)
    }

    /// A typed numbered prefix supplies its starting order when no numbered sibling precedes it.
    pub fn convert_markdown_block(
        &mut self,
        id: &str,
        replacement_id: &str,
        spec: BlockSpec,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let initial = match &spec {
            BlockSpec::List { order: Some(n), .. } => *n,
            _ => 1,
        };
        self.convert_with_initial_order(id, replacement_id, spec, initial, now_ms)
    }

    fn convert_with_initial_order(
        &mut self,
        id: &str,
        replacement_id: &str,
        spec: BlockSpec,
        initial: i32,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let accepts_children = matches!(
            spec,
            BlockSpec::Paragraph { .. }
                | BlockSpec::List { .. }
                | BlockSpec::Callout { .. }
                | BlockSpec::Note { .. }
                | BlockSpec::Frame { .. }
                | BlockSpec::EdgelessText { .. }
                | BlockSpec::Page { .. }
        );
        let numbered = matches!(
            spec,
            BlockSpec::List {
                list_type: crate::schema::ListType::Numbered,
                ..
            }
        );
        let old = self.read_unknown_block(id)?;
        let (parent, slot) = self.parent_slot(id)?;
        let same = old.flavour == spec.flavour();
        if !same
            && self
                .session
                .get_map_value(&self.blocks_target, replacement_id)?
                .is_some()
        {
            return Err(DocError::InvalidState(
                "replacement id must be fresh".into(),
            ));
        }
        self.structural_edit(now_ms, |page| {
            if same {
                for (key, value) in spec.into_yblock_entries(id) {
                    if matches!(
                        key.as_str(),
                        "prop:type" | "prop:checked" | "prop:order" | "prop:language"
                    ) && let SessionValue::Any(v) = &value
                        && page.session.get_map_value(&block_target(id), &key)?
                            != Some(SessionReadValue::Any(v.clone()))
                    {
                        page.session.map_set(&block_target(id), key, value)?;
                    }
                }
            } else {
                let delta = if matches!(
                    spec,
                    BlockSpec::Paragraph { .. } | BlockSpec::List { .. } | BlockSpec::Code { .. }
                ) {
                    page.read_editable_text(id)?.0.delta
                } else {
                    Vec::new()
                };
                let align = page
                    .session
                    .get_map_value(&block_target(id), "prop:textAlign")?;
                page.add_block(replacement_id, spec, Some(&parent), Some(slot), now_ms)?;
                if !delta.is_empty() {
                    page.apply_text_delta(replacement_id, "prop:text", &delta, now_ms)?;
                }
                if let Some(SessionReadValue::Any(value)) = align {
                    page.set_block_prop(
                        replacement_id,
                        "prop:textAlign",
                        SessionValue::Any(value),
                        now_ms,
                    )?;
                }
                page.session
                    .array_remove(&children_target(&parent), slot + 1, 1)?;
                page.session.map_remove(&page.blocks_target, id)?;
                if !old.children.is_empty() {
                    if accepts_children {
                        page.session.array_push(
                            &children_target(replacement_id),
                            child_values(&old.children),
                        )?;
                    } else {
                        page.session.array_insert(
                            &children_target(&parent),
                            slot + 1,
                            child_values(&old.children),
                        )?;
                    }
                }
            }
            if numbered {
                page.correct_numbered_order_from(&parent, slot as usize, initial)?;
            }
            Ok(())
        })
    }
}
