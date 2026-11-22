use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
};

use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use y_octo::{
    Any, DocOptions, DocSession, RelativePosition, SessionCommit, SessionConfig, SessionOriginKind,
    SessionReadValue, SessionTxOrigin, SessionUndoConfig, SessionValue, TextAttributes,
    TextDeltaOp, TextInsert, TypeIdentity, TypePath, TypeTarget, UndoStackId, YTypeKind,
};

use crate::{
    DocError, DocResult,
    schema::{BlockSpec, SurfaceElementSpec, UnknownBlock, affine_block_versions},
    validate_client_id,
};

/// Default Undo capture merge timeout (500ms) driven by explicit `now_ms`.
pub const DEFAULT_UNDO_CAPTURE_TIMEOUT_MS: u64 = 500;

/// Relative-position selection snapshot stored on the page's undo stack.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectionSnapshot {
    pub anchor_block_id: String,
    pub anchor: RelativePosition,
    pub focus_block_id: String,
    pub focus: RelativePosition,
}

/// Both endpoints in the current document, in their original directional order.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedSelection {
    pub anchor: (String, u64),
    pub focus: (String, u64),
}

/// Result of applying a remote V1 update to a session.
#[derive(Debug, Clone)]
pub struct RemoteApplyResult<M = SelectionSnapshot> {
    pub commits: Vec<SessionCommit<M>>,
    /// Any local `FormattingCleanup` commits produced during integration that
    /// MUST be forwarded to outbound sync.
    pub outbound_updates: Vec<Vec<u8>>,
}

/// Page metadata entry stored in the workspace root `meta.pages` `Y.Array`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageMeta {
    pub id: String,
    pub title: String,
    pub create_date: i64,
    pub tags: Vec<String>,
}

type PageCommit = Option<SessionCommit<SelectionSnapshot>>;

fn block_target(id: &str) -> TypeTarget {
    TypeTarget::Path(TypePath::root("blocks").key(id))
}

fn children_target(id: &str) -> TypeTarget {
    TypeTarget::Path(TypePath::root("blocks").key(id).key("sys:children"))
}

fn child_values(ids: &[String]) -> Vec<SessionValue> {
    ids.iter()
        .map(|id| SessionValue::Any(Any::String(id.clone())))
        .collect()
}

/// Split an insert-only delta at a UTF-16 boundary without discarding attributes or embeds.
pub fn split_delta(
    delta: &[TextDeltaOp],
    offset: u64,
) -> DocResult<(Vec<TextDeltaOp>, Vec<TextDeltaOp>)> {
    let mut left = Vec::new();
    let mut right = Vec::new();
    let mut remaining = offset;
    for op in delta {
        let TextDeltaOp::Insert { insert, format } = op else {
            return Err(DocError::InvalidState("expected insert-only text".into()));
        };
        let len = match insert {
            TextInsert::Text(s) => s.encode_utf16().count(),
            TextInsert::Embed(items) => items.len(),
        } as u64;
        if remaining == 0 {
            right.push(op.clone());
        } else if remaining >= len {
            left.push(op.clone());
            remaining -= len;
        } else {
            let (before, after) = match insert {
                TextInsert::Text(s) => {
                    let mut count = 0;
                    let byte = s
                        .char_indices()
                        .find_map(|(byte, ch)| {
                            let found = count == remaining;
                            count += ch.len_utf16() as u64;
                            found.then_some(byte)
                        })
                        .ok_or_else(|| {
                            DocError::InvalidState("offset splits a surrogate pair".into())
                        })?;
                    (
                        TextInsert::Text(s[..byte].into()),
                        TextInsert::Text(s[byte..].into()),
                    )
                }
                TextInsert::Embed(v) => {
                    let (a, b) = v.split_at(remaining as usize);
                    (TextInsert::Embed(a.to_vec()), TextInsert::Embed(b.to_vec()))
                }
            };
            left.push(TextDeltaOp::Insert {
                insert: before,
                format: format.clone(),
            });
            right.push(TextDeltaOp::Insert {
                insert: after,
                format: format.clone(),
            });
            remaining = 0;
        }
    }
    if remaining != 0 {
        return Err(DocError::InvalidState("text offset outside block".into()));
    }
    Ok((left, right))
}

type ChildGraph = BTreeMap<String, Vec<String>>;

fn descendants(graph: &ChildGraph, roots: impl IntoIterator<Item = String>) -> BTreeSet<String> {
    let mut pending: Vec<_> = roots.into_iter().collect();
    let mut found = BTreeSet::new();
    while let Some(id) = pending.pop() {
        if found.insert(id.clone())
            && let Some(children) = graph.get(&id)
        {
            pending.extend(children.iter().cloned());
        }
    }
    found
}

/// Per-page CRDT session wrapping `DocSession<SelectionSnapshot>` with an
/// `UndoStackId` scoped strictly to the `blocks` root `Y.Map`.
pub struct PageDocSession {
    session: DocSession<SelectionSnapshot>,
    undo_stack_id: UndoStackId,
    blocks_target: TypeTarget,
    surface_element_order: RefCell<BTreeMap<String, Vec<String>>>,
}

impl PageDocSession {
    pub fn new(page_id: impl Into<String>, client_id: u64) -> DocResult<Self> {
        let client_id = validate_client_id(client_id)?;
        let options = DocOptions::from_identity(client_id, page_id.into());
        let mut session = DocSession::with_config(
            options,
            SessionConfig {
                undo: SessionUndoConfig::Custom,
            },
        );
        let blocks_id = session.ensure_root("blocks", YTypeKind::Map)?;
        let blocks_target = TypeTarget::from(blocks_id);
        let undo_stack_id = session.create_undo_stack(
            std::slice::from_ref(&blocks_target),
            DEFAULT_UNDO_CAPTURE_TIMEOUT_MS,
            &[SessionTxOrigin::Tracked],
        )?;
        Ok(Self {
            session,
            undo_stack_id,
            blocks_target,
            surface_element_order: RefCell::new(BTreeMap::new()),
        })
    }

    /// Update and return per-surface first-integration key order for `prop:elements.value`,
    /// preserving established order for surviving keys and appending newly integrated keys
    /// sorted by `(Reverse(id.client), id.clock)` from `TypeIdentity::Item(id)` to match
    /// Yjs 13.6.21 merged update encoding order (higher client IDs first, ascending clock per client).
    pub(crate) fn refresh_surface_element_order(
        &self,
        surface_id: &str,
        entries: &[(String, SessionReadValue)],
    ) -> Vec<String> {
        let present: BTreeMap<&str, (u64, u64)> = entries
            .iter()
            .map(|(k, v)| {
                let key_order = match v {
                    SessionReadValue::Map(TypeIdentity::Item(id)) => (id.client, id.clock),
                    _ => (0, u64::MAX),
                };
                (k.as_str(), key_order)
            })
            .collect();
        let mut map = self.surface_element_order.borrow_mut();
        let order = map.entry(surface_id.to_string()).or_default();
        order.retain(|k| present.contains_key(k.as_str()));
        let existing: BTreeSet<String> = order.iter().cloned().collect();
        let mut added: Vec<(&str, (u64, u64))> = present
            .iter()
            .filter(|(k, _)| !existing.contains(**k))
            .map(|(&k, &ord)| (k, ord))
            .collect();
        added.sort_by(|a, b| {
            b.1.0
                .cmp(&a.1.0)
                .then_with(|| a.1.1.cmp(&b.1.1))
                .then_with(|| a.0.cmp(b.0))
        });
        order.extend(added.into_iter().map(|(k, _)| k.to_string()));
        order.clone()
    }

    /// Refresh per-surface element orders across all `affine:surface` blocks currently in `blocks`.
    fn refresh_all_surface_orders(&self) {
        let Ok(blocks) = self.session.read_map(&self.blocks_target) else {
            return;
        };
        for (block_id, value) in blocks {
            let SessionReadValue::Map(block_ident) = value else {
                continue;
            };
            let block_target = TypeTarget::Identity(block_ident);
            let is_surface = matches!(
                self.session.get_map_value(&block_target, "sys:flavour"),
                Ok(Some(SessionReadValue::Any(Any::String(f)))) if f == "affine:surface"
            );
            if !is_surface {
                continue;
            }
            if let Ok(Some(SessionReadValue::Map(elems_ident))) =
                self.session.get_map_value(&block_target, "prop:elements")
                && let Ok(Some(SessionReadValue::Map(val_ident))) = self
                    .session
                    .get_map_value(&TypeTarget::Identity(elems_ident), "value")
                && let Ok(entries) = self.session.read_map(&TypeTarget::Identity(val_ident))
            {
                self.refresh_surface_element_order(&block_id, &entries);
            }
        }
    }

    pub fn guid(&self) -> &str {
        self.session.guid()
    }

    pub fn client_id(&self) -> u64 {
        self.session.client()
    }

    pub fn undo_stack_id(&self) -> UndoStackId {
        self.undo_stack_id
    }

    pub fn inner(&self) -> &DocSession<SelectionSnapshot> {
        &self.session
    }

    /// Target of the `blocks` root `Y.Map` holding every block of this page.
    pub fn blocks_target(&self) -> &TypeTarget {
        &self.blocks_target
    }

    pub fn inner_mut(&mut self) -> &mut DocSession<SelectionSnapshot> {
        &mut self.session
    }

    pub fn advance_time(&self, now_ms: u64) {
        // Zero is the undo manager's stop-capturing sentinel. Preserve clock differences at scheduler startup.
        self.session.advance_time(now_ms.saturating_add(1));
    }

    pub fn encode_state_vector_v1(&self) -> DocResult<Vec<u8>> {
        Ok(self.session.encode_state_vector_v1()?)
    }

    pub fn encode_update_v1(&self) -> DocResult<Vec<u8>> {
        Ok(self.session.encode_update_v1()?)
    }

    pub fn encode_diff_v1(&self, remote_sv: &[u8]) -> DocResult<Vec<u8>> {
        Ok(self.session.encode_diff_v1(remote_sv)?)
    }

    /// Apply a remote V1 update and collect any secondary `FormattingCleanup`
    /// commits so the caller can broadcast them back to the room.
    pub fn apply_remote_update_v1(&mut self, bytes: &[u8]) -> DocResult<RemoteApplyResult> {
        let commits = self.session.apply_update_v1(bytes)?;
        self.refresh_all_surface_orders();
        let outbound_updates = commits
            .iter()
            .filter(|c| {
                c.origin_kind == SessionOriginKind::FormattingCleanup && !c.update.is_empty()
            })
            .map(|c| c.update.clone())
            .collect();
        Ok(RemoteApplyResult {
            commits,
            outbound_updates,
        })
    }

    /// Add a typed block of a supported flavour with all BlockSuite default properties populated.
    /// If `parent_id` is `Some`, appends `block_id` to `parent.sys:children` (or inserts at `index`).
    pub fn add_block(
        &mut self,
        block_id: impl Into<String>,
        spec: BlockSpec,
        parent_id: Option<&str>,
        index: Option<u64>,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        let block_id = block_id.into();
        let entries = spec.into_yblock_entries(&block_id);
        self.insert_block(block_id, entries, parent_id, index, now_ms)
    }

    /// Add a block of any flavour from explicit `prop:*` entries, for flavours without a
    /// typed [`BlockSpec`]. `sys:id`, `sys:flavour`, `sys:version` and an empty
    /// `sys:children` are written alongside `props`; parent handling matches [`Self::add_block`].
    pub fn add_raw_block(
        &mut self,
        block_id: impl Into<String>,
        flavour: &str,
        version: i32,
        props: Vec<(String, SessionValue)>,
        parent_id: Option<&str>,
        index: Option<u64>,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        let block_id = block_id.into();
        if let Some((key, _)) = props.iter().find(|(key, _)| !key.starts_with("prop:")) {
            return Err(DocError::InvalidState(format!(
                "raw block property {key:?} must start with \"prop:\""
            )));
        }
        let mut entries = vec![
            (
                "sys:id".to_string(),
                SessionValue::Any(Any::String(block_id.clone())),
            ),
            (
                "sys:flavour".to_string(),
                SessionValue::Any(Any::String(flavour.to_string())),
            ),
            (
                "sys:version".to_string(),
                SessionValue::Any(Any::Integer(version)),
            ),
            ("sys:children".to_string(), SessionValue::Array(Vec::new())),
        ];
        entries.extend(props);
        self.insert_block(block_id, entries, parent_id, index, now_ms)
    }

    fn insert_block(
        &mut self,
        block_id: String,
        entries: Vec<(String, SessionValue)>,
        parent_id: Option<&str>,
        index: Option<u64>,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        if let Some(pid) = parent_id {
            let parent_target = TypeTarget::Path(TypePath::root("blocks").key(pid));
            let children_val = self
                .session
                .get_map_value(&parent_target, "sys:children")
                .map_err(|_| DocError::BlockNotFound(pid.to_string()))?;
            let Some(SessionReadValue::Array(children_id)) = children_val else {
                return Err(DocError::BlockNotFound(pid.to_string()));
            };
            if let Some(idx) = index {
                let len = self
                    .session
                    .read_array(&TypeTarget::Identity(children_id))?
                    .len() as u64;
                if idx > len {
                    return Err(DocError::Codec(y_octo::JwstCodecError::IndexOutOfBound(
                        idx,
                    )));
                }
            }
        }

        self.advance_time(now_ms);

        self.session.begin_tx(SessionTxOrigin::Tracked)?;
        self.session.map_set(
            &self.blocks_target,
            block_id.clone(),
            SessionValue::Map(entries),
        )?;
        if let Some(pid) = parent_id {
            let children_target =
                TypeTarget::Path(TypePath::root("blocks").key(pid).key("sys:children"));
            let child_val = vec![SessionValue::Any(Any::String(block_id))];
            match index {
                Some(idx) => {
                    self.session
                        .array_insert(&children_target, idx, child_val)?;
                }
                None => {
                    self.session.array_push(&children_target, child_val)?;
                }
            }
        }
        Ok(self.session.commit_tx()?)
    }

    /// Move an existing child block to a new index within `parent_id`'s `sys:children`.
    pub fn reorder_child(
        &mut self,
        parent_id: &str,
        child_id: &str,
        new_index: u64,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        self.advance_time(now_ms);
        let children_target =
            TypeTarget::Path(TypePath::root("blocks").key(parent_id).key("sys:children"));
        let items = self.session.read_array(&children_target)?;
        let old_pos = items
            .iter()
            .position(|v| matches!(v, SessionReadValue::Any(Any::String(s)) if s == child_id))
            .ok_or_else(|| DocError::BlockNotFound(child_id.to_string()))?;
        let clamped_index = new_index.min((items.len().saturating_sub(1)) as u64);

        self.session.begin_tx(SessionTxOrigin::Tracked)?;
        self.session
            .array_remove(&children_target, old_pos as u64, 1)?;
        self.session.array_insert(
            &children_target,
            clamped_index,
            vec![SessionValue::Any(Any::String(child_id.to_string()))],
        )?;
        Ok(self.session.commit_tx()?)
    }

    /// Insert text into a block's `Y.Text` property (e.g. `"prop:text"` or `"prop:title"`).
    pub fn insert_text(
        &mut self,
        block_id: &str,
        prop_key: &str,
        index: u64,
        text: &str,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        self.advance_time(now_ms);
        let target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key(prop_key));
        Ok(self.session.text_insert(&target, index, text)?)
    }

    /// Remove a UTF-16 range from a block's `Y.Text` property.
    pub fn remove_text(
        &mut self,
        block_id: &str,
        prop_key: &str,
        index: u64,
        len: u64,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        self.advance_time(now_ms);
        let target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key(prop_key));
        Ok(self.session.text_remove(&target, index, len)?)
    }

    /// Apply formatting attributes to a range in a block's `Y.Text` property.
    pub fn format_text(
        &mut self,
        block_id: &str,
        prop_key: &str,
        index: u64,
        len: u64,
        attrs: TextAttributes,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        self.advance_time(now_ms);
        let target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key(prop_key));
        Ok(self.session.text_format(&target, index, len, attrs)?)
    }

    /// Apply a raw delta to a block's `Y.Text` property.
    pub fn apply_text_delta(
        &mut self,
        block_id: &str,
        prop_key: &str,
        delta: &[TextDeltaOp],
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        self.advance_time(now_ms);
        let target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key(prop_key));
        Ok(self.session.text_apply_delta(&target, delta)?)
    }

    /// Set a scalar or nested property on a block (`prop:*`).
    pub fn set_block_prop(
        &mut self,
        block_id: &str,
        prop_key: impl Into<String>,
        value: SessionValue,
        now_ms: u64,
    ) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        self.advance_time(now_ms);
        let target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        Ok(self.session.map_set(&target, prop_key.into(), value)?)
    }

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
        Ok(self.session.map_set(
            &elements_value_target,
            element_id,
            SessionValue::Map(entries),
        )?)
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
        Ok(self.session.map_set(&target, field.into(), value)?)
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
    /// Recursively clear all children of a Yjs container leaf-first so every underlying
    /// `store.delete_item` deletes a single item (`ranges.len() == 1`), keeping
    /// `DeleteSet` ranges sorted regardless of map iteration order.
    fn clear_value_canonically(&mut self, value: SessionReadValue) -> DocResult<()> {
        match value {
            SessionReadValue::Map(ident) => {
                let target = TypeTarget::Identity(ident);
                let mut entries = self.session.read_map(&target)?;
                entries.sort_by(|a, b| a.0.cmp(&b.0));
                for (k, v) in entries {
                    self.clear_value_canonically(v)?;
                    self.session.map_remove(&target, &k)?;
                }
            }
            SessionReadValue::Array(ident) => {
                let target = TypeTarget::Identity(ident);
                let items = self.session.read_array(&target)?;
                for (idx, v) in items.into_iter().enumerate().rev() {
                    self.clear_value_canonically(v)?;
                    self.session.array_remove(&target, idx as u64, 1)?;
                }
            }
            SessionReadValue::Text(ident) => {
                let target = TypeTarget::Identity(ident);
                let len = self.session.read_text_len(&target)?;
                if len > 0 {
                    self.session.text_remove(&target, 0, len)?;
                }
            }
            _ => {}
        }
        Ok(())
    }

    pub fn remove_surface_element(
        &mut self,
        surface_block_id: &str,
        element_id: &str,
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let elements_value_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value"),
        );
        let element_id = element_id.to_string();
        if self.session.tx_depth() == 0 {
            return self.structural_edit(now_ms, move |page| {
                if let Some(val) = page
                    .session
                    .get_map_value(&elements_value_target, &element_id)?
                {
                    page.clear_value_canonically(val)?;
                }
                page.session
                    .map_remove(&elements_value_target, &element_id)?;
                Ok(())
            });
        }
        self.advance_time(now_ms);
        if let Some(val) = self
            .session
            .get_map_value(&elements_value_target, &element_id)?
        {
            self.clear_value_canonically(val)?;
        }
        Ok(self
            .session
            .map_remove(&elements_value_target, &element_id)?)
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
        self.advance_time(now_ms);
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
                let len = self.session.read_text_len(&target)?;
                let start = utf16_start.min(len);
                let del = utf16_delete_len.min(len.saturating_sub(start));
                if del > 0 && !insert.is_empty() {
                    let insert = insert.to_string();
                    self.structural_edit(now_ms, move |page| {
                        page.session.text_remove(&target, start, del)?;
                        page.session.text_insert(&target, start, &insert)?;
                        Ok(())
                    })
                } else if del > 0 {
                    Ok(self.session.text_remove(&target, start, del)?)
                } else if !insert.is_empty() {
                    Ok(self.session.text_insert(&target, start, insert)?)
                } else {
                    Ok(None)
                }
            }
            _ => {
                let delta = if insert.is_empty() {
                    Vec::new()
                } else {
                    vec![TextDeltaOp::Insert {
                        insert: TextInsert::Text(insert.to_string()),
                        format: None,
                    }]
                };
                Ok(self.session.map_set(
                    &elem_target,
                    field.to_string(),
                    SessionValue::Text(delta),
                )?)
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
        self.advance_time(now_ms);
        let target = TypeTarget::Path(TypePath::root("blocks").key(block_id).key("prop:title"));
        let len = self.session.read_text_len(&target).unwrap_or(0);
        let start = utf16_start.min(len);
        let del = utf16_delete_len.min(len.saturating_sub(start));
        if del > 0 && !insert.is_empty() {
            let insert = insert.to_string();
            self.structural_edit(now_ms, move |page| {
                page.session.text_remove(&target, start, del)?;
                page.session.text_insert(&target, start, &insert)?;
                Ok(())
            })
        } else if del > 0 {
            Ok(self.session.text_remove(&target, start, del)?)
        } else if !insert.is_empty() {
            Ok(self.session.text_insert(&target, start, insert)?)
        } else {
            Ok(None)
        }
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
                Ok(self.session.map_set(
                    &elem_target,
                    field.to_string(),
                    SessionValue::Text(delta),
                )?)
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

    fn child_graph(&self) -> DocResult<ChildGraph> {
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
        Ok(commit?)
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
                if let Some(val) = page.session.get_map_value(&page.blocks_target, id)? {
                    page.clear_value_canonically(val)?;
                }
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

    /// Capture a relative-position selection snapshot on a text property and attach
    /// it to the top undo item of this page's `blocks` undo stack.
    pub fn capture_selection_snapshot(
        &self,
        anchor_block_id: &str,
        anchor_offset: u64,
        focus_block_id: &str,
        focus_offset: u64,
    ) -> DocResult<SelectionSnapshot> {
        let anchor_target = self.editable_text_target(anchor_block_id)?;
        let focus_target = self.editable_text_target(focus_block_id)?;
        let anchor = self
            .session
            .create_relative_position(&anchor_target, anchor_offset, 0)?;
        let focus = self
            .session
            .create_relative_position(&focus_target, focus_offset, 0)?;
        Ok(SelectionSnapshot {
            anchor_block_id: anchor_block_id.to_string(),
            anchor,
            focus_block_id: focus_block_id.to_string(),
            focus,
        })
    }

    /// Read only the edited Y.Text for incremental layout, together with its snapshot property.
    pub fn read_editable_text(&self, id: &str) -> DocResult<(crate::read::RichText, JsonValue)> {
        let target = self.editable_text_target(id)?;
        let TypeTarget::Identity(identity) = &target else {
            unreachable!()
        };
        let value = self.export_y_value(&SessionReadValue::Text(identity.clone()))?;
        Ok((
            crate::read::RichText {
                plain: self.session.read_text_string(&target)?,
                delta: self.session.read_text_delta(&target)?,
            },
            value,
        ))
    }

    fn editable_text_target(&self, block_id: &str) -> DocResult<TypeTarget> {
        let block = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let title = matches!(self.session.get_map_value(&block, "sys:flavour")?,
            Some(SessionReadValue::Any(Any::String(name))) if name == "affine:page");
        let key = if title { "prop:title" } else { "prop:text" };
        match self.session.get_map_value(&block, key)? {
            Some(SessionReadValue::Text(identity)) => Ok(TypeTarget::Identity(identity)),
            _ => Err(DocError::InvalidState(format!("missing {block_id}.{key}"))),
        }
    }

    pub fn resolve_selection_snapshot(
        &self,
        snapshot: &SelectionSnapshot,
    ) -> DocResult<Option<ResolvedSelection>> {
        let resolve = |id: &str, position: &RelativePosition| {
            let absolute = self.session.resolve_relative_position(position, true)?;
            let target = self.editable_text_target(id).ok()?;
            (target == TypeTarget::Identity(absolute.r#type))
                .then(|| (id.to_owned(), absolute.index))
        };
        Ok(resolve(&snapshot.anchor_block_id, &snapshot.anchor)
            .zip(resolve(&snapshot.focus_block_id, &snapshot.focus))
            .map(|(anchor, focus)| ResolvedSelection { anchor, focus }))
    }

    pub fn set_undo_selection_snapshot(&self, snapshot: SelectionSnapshot) -> DocResult<bool> {
        Ok(self.session.set_stack_selection_meta(
            self.undo_stack_id,
            y_octo::UndoStack::Undo,
            snapshot,
        )?)
    }

    pub fn undo(&mut self) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        let res = self.session.undo_stack(self.undo_stack_id)?;
        self.refresh_all_surface_orders();
        Ok(res)
    }

    pub fn redo(&mut self) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        let res = self.session.redo_stack(self.undo_stack_id)?;
        self.refresh_all_surface_orders();
        Ok(res)
    }

    pub fn can_undo(&self) -> bool {
        self.session.can_undo_stack(self.undo_stack_id)
    }

    pub fn can_redo(&self) -> bool {
        self.session.can_redo_stack(self.undo_stack_id)
    }

    pub fn stop_capturing(&mut self) -> DocResult {
        Ok(self.session.stop_capturing_stack(self.undo_stack_id)?)
    }

    /// Read a block as a lossless [`UnknownBlock`] descriptor without mutating its Y.Map.
    pub fn read_unknown_block(&self, block_id: &str) -> DocResult<UnknownBlock> {
        let block_target = TypeTarget::Path(TypePath::root("blocks").key(block_id));
        let entries = self
            .session
            .read_map(&block_target)
            .map_err(|_| DocError::BlockNotFound(block_id.to_string()))?;

        let mut id = block_id.to_string();
        let mut flavour = String::new();
        let mut version = None;
        let mut children = Vec::new();
        let mut prop_keys = Vec::new();

        for (k, v) in entries {
            match k.as_str() {
                "sys:id" => {
                    if let SessionReadValue::Any(Any::String(s)) = v {
                        id = s;
                    }
                }
                "sys:flavour" => {
                    if let SessionReadValue::Any(Any::String(s)) = v {
                        flavour = s;
                    }
                }
                "sys:version" => {
                    if let SessionReadValue::Any(Any::Integer(n)) = v {
                        version = Some(i64::from(n));
                    } else if let SessionReadValue::Any(Any::Float64(f)) = v {
                        version = Some(f.0 as i64);
                    }
                }
                "sys:children" => {
                    if let SessionReadValue::Array(arr_id) = v {
                        let arr = self.session.read_array(&TypeTarget::Identity(arr_id))?;
                        for item in arr {
                            if let SessionReadValue::Any(Any::String(s)) = item {
                                children.push(s);
                            }
                        }
                    }
                }
                key if key.starts_with("prop:") => {
                    prop_keys.push(key.to_string());
                }
                _ => {}
            }
        }
        prop_keys.sort();

        Ok(UnknownBlock {
            id,
            flavour,
            version,
            children,
            prop_keys,
        })
    }

    /// Export a normalized JSON representation matching BlockSuite's snapshot structure
    /// for L0 oracle convergence assertions.
    pub fn export_doc_json(&self) -> DocResult<JsonValue> {
        let blocks = self.session.read_map(&self.blocks_target)?;
        let mut out_blocks = JsonMap::new();
        for (block_id, val) in blocks {
            if let SessionReadValue::Map(map_id) = val {
                out_blocks.insert(
                    block_id,
                    self.export_y_value(&SessionReadValue::Map(map_id))?,
                );
            }
        }
        let mut root = JsonMap::new();
        root.insert(
            "guid".to_string(),
            JsonValue::String(self.guid().to_string()),
        );
        root.insert("blocks".to_string(), JsonValue::Object(out_blocks));
        Ok(JsonValue::Object(root))
    }

    pub fn export_slice_props(&self, id: &str) -> DocResult<JsonMap<String, JsonValue>> {
        self.session
            .read_map(&block_target(id))?
            .into_iter()
            .filter(|(key, _)| key.starts_with("prop:"))
            .map(|(key, value)| Ok((key, self.export_slice_value(&value)?)))
            .collect()
    }

    fn export_slice_value(&self, value: &SessionReadValue) -> DocResult<JsonValue> {
        match value {
            SessionReadValue::Map(id) => {
                let entries = self.session.read_map(&TypeTarget::Identity(id.clone()))?;
                Ok(JsonValue::Object(
                    entries
                        .into_iter()
                        .map(|(k, v)| Ok((k, self.export_slice_value(&v)?)))
                        .collect::<DocResult<_>>()?,
                ))
            }
            SessionReadValue::Array(id) => {
                let items = self.session.read_array(&TypeTarget::Identity(id.clone()))?;
                Ok(JsonValue::Array(
                    items
                        .iter()
                        .map(|v| self.export_slice_value(v))
                        .collect::<DocResult<_>>()?,
                ))
            }
            SessionReadValue::Text(_) => Ok(
                serde_json::json!({"$blocksuite:internal:text$":true, "delta":self.export_y_value(value)?}),
            ),
            _ => self.export_y_value(value),
        }
    }

    pub(crate) fn export_y_value(&self, value: &SessionReadValue) -> DocResult<JsonValue> {
        match value {
            SessionReadValue::Any(any) => Ok(any_to_normalized_json(any)),
            SessionReadValue::Map(id) => {
                let entries = self.session.read_map(&TypeTarget::Identity(id.clone()))?;
                let mut map = JsonMap::new();
                for (k, v) in entries {
                    map.insert(k, self.export_y_value(&v)?);
                }
                Ok(JsonValue::Object(map))
            }
            SessionReadValue::Array(id) => {
                let items = self.session.read_array(&TypeTarget::Identity(id.clone()))?;
                let mut arr = Vec::with_capacity(items.len());
                for item in items {
                    arr.push(self.export_y_value(&item)?);
                }
                Ok(JsonValue::Array(arr))
            }
            SessionReadValue::Text(id) => {
                let delta = self
                    .session
                    .read_text_delta(&TypeTarget::Identity(id.clone()))?;
                let mut ops: Vec<JsonValue> = Vec::with_capacity(delta.len());
                for op in delta {
                    if let TextDeltaOp::Insert { insert, format } = op {
                        let attrs_obj = format.filter(|a| !a.is_empty()).map(|attrs| {
                            let mut attr_map = JsonMap::new();
                            for (k, v) in attrs {
                                attr_map.insert(k, any_to_normalized_json(&v));
                            }
                            JsonValue::Object(attr_map)
                        });

                        if let TextInsert::Text(s) = insert {
                            // Coalesce adjacent string inserts with identical attributes (matching Yjs toDelta()).
                            if let Some(JsonValue::Object(prev)) = ops.last_mut()
                                && prev.get("attributes") == attrs_obj.as_ref()
                                && let Some(JsonValue::String(prev_s)) = prev.get_mut("insert")
                            {
                                prev_s.push_str(&s);
                                continue;
                            }
                            let mut obj = JsonMap::new();
                            obj.insert("insert".to_string(), JsonValue::String(s));
                            if let Some(a) = attrs_obj {
                                obj.insert("attributes".to_string(), a);
                            }
                            ops.push(JsonValue::Object(obj));
                        } else if let TextInsert::Embed(items) = insert {
                            let embed_val = if items.len() == 1 {
                                any_to_normalized_json(&items[0])
                            } else {
                                JsonValue::Array(items.iter().map(any_to_normalized_json).collect())
                            };
                            let mut obj = JsonMap::new();
                            obj.insert("insert".to_string(), embed_val);
                            if let Some(a) = attrs_obj {
                                obj.insert("attributes".to_string(), a);
                            }
                            ops.push(JsonValue::Object(obj));
                        }
                    }
                }
                Ok(JsonValue::Array(ops))
            }
            SessionReadValue::Doc { guid, .. } => Ok(JsonValue::String(guid.clone())),
            SessionReadValue::XmlElement { identity, .. }
            | SessionReadValue::XmlFragment(identity)
            | SessionReadValue::XmlText(identity) => {
                let s = self
                    .session
                    .xml_to_string(&TypeTarget::Identity(identity.clone()))?;
                Ok(JsonValue::String(s))
            }
            SessionReadValue::XmlHook { name, .. } => Ok(JsonValue::String(name.clone())),
        }
    }
}

/// Normalize `y_octo::Any` to canonical `serde_json::Value` (integral floats become integers,
/// map keys sorted).
pub fn any_to_normalized_json(any: &Any) -> JsonValue {
    match any {
        Any::Null | Any::Undefined => JsonValue::Null,
        Any::True => JsonValue::Bool(true),
        Any::False => JsonValue::Bool(false),
        Any::Integer(i) => JsonValue::Number((*i).into()),
        Any::BigInt64(i) => JsonValue::Number((*i).into()),
        Any::Float32(f) => float_to_json(f64::from(f.0)),
        Any::Float64(f) => float_to_json(f.0),
        Any::String(s) => JsonValue::String(s.clone()),
        Any::Binary(b) => {
            JsonValue::Array(b.iter().map(|&x| JsonValue::Number(x.into())).collect())
        }
        Any::Array(items) => JsonValue::Array(items.iter().map(any_to_normalized_json).collect()),
        Any::Object(map) => {
            let mut sorted: Vec<(&String, &Any)> = map.iter().collect();
            sorted.sort_by_key(|(a, _)| *a);
            let mut obj = JsonMap::new();
            for (k, v) in sorted {
                obj.insert(k.clone(), any_to_normalized_json(v));
            }
            JsonValue::Object(obj)
        }
    }
}

fn float_to_json(f: f64) -> JsonValue {
    if f.is_finite() && f.fract() == 0.0 && f >= (i64::MIN as f64) && f <= (i64::MAX as f64) {
        JsonValue::Number((f as i64).into())
    } else {
        serde_json::Number::from_f64(f).map_or(JsonValue::Null, JsonValue::Number)
    }
}

/// Multi-document workspace session owning the root room `DocSession` (`meta`, `spaces`)
/// and per-page [`PageDocSession`]s.
pub struct WorkspaceSession {
    room: String,
    client_id: u64,
    root: DocSession<()>,
    meta_target: TypeTarget,
    spaces_target: TypeTarget,
    pages: BTreeMap<String, PageDocSession>,
}

impl WorkspaceSession {
    pub fn new(room: impl Into<String>, client_id: u64) -> DocResult<Self> {
        let client_id = validate_client_id(client_id)?;
        let room = room.into();
        let options = DocOptions::from_identity(client_id, room.clone());
        let mut root = DocSession::with_config(
            options,
            SessionConfig {
                undo: SessionUndoConfig::Disabled,
            },
        );
        let meta_id = root.ensure_root("meta", YTypeKind::Map)?;
        let spaces_id = root.ensure_root("spaces", YTypeKind::Map)?;
        Ok(Self {
            room,
            client_id,
            root,
            meta_target: TypeTarget::from(meta_id),
            spaces_target: TypeTarget::from(spaces_id),
            pages: BTreeMap::new(),
        })
    }

    pub fn room(&self) -> &str {
        &self.room
    }

    pub fn client_id(&self) -> u64 {
        self.client_id
    }

    pub fn root(&self) -> &DocSession<()> {
        &self.root
    }

    pub fn root_mut(&mut self) -> &mut DocSession<()> {
        &mut self.root
    }

    /// Initialize workspace `meta` with `pages: YArray` and `blockVersions` matching `AffineSchemas`.
    pub fn initialize_meta(&mut self) -> DocResult<Option<SessionCommit<()>>> {
        self.root.begin_tx(SessionTxOrigin::Untracked)?;
        if self
            .root
            .get_map_value(&self.meta_target, "pages")?
            .is_none()
        {
            self.root.map_set(
                &self.meta_target,
                "pages".to_string(),
                SessionValue::Array(Vec::new()),
            )?;
        }
        if self
            .root
            .get_map_value(&self.meta_target, "blockVersions")?
            .is_none()
        {
            let version_entries = affine_block_versions()
                .into_iter()
                .map(|(flavour, ver)| (flavour.to_string(), SessionValue::Any(Any::Integer(ver))))
                .collect();
            self.root.map_set(
                &self.meta_target,
                "blockVersions".to_string(),
                SessionValue::Map(version_entries),
            )?;
        }
        Ok(self.root.commit_tx()?)
    }

    /// Register a new page in root `meta.pages` and `spaces`, and create its local [`PageDocSession`].
    pub fn create_page(
        &mut self,
        page_id: impl Into<String>,
        title: impl Into<String>,
        create_date: i64,
    ) -> DocResult<Option<SessionCommit<()>>> {
        let page_id = page_id.into();
        let title = title.into();

        self.root.begin_tx(SessionTxOrigin::Untracked)?;
        if self
            .root
            .get_map_value(&self.meta_target, "pages")?
            .is_none()
        {
            self.root.map_set(
                &self.meta_target,
                "pages".to_string(),
                SessionValue::Array(Vec::new()),
            )?;
        }
        let pages_target = TypeTarget::Path(TypePath::root("meta").key("pages"));
        let page_meta_map = SessionValue::Map(vec![
            (
                "id".to_string(),
                SessionValue::Any(Any::String(page_id.clone())),
            ),
            ("title".to_string(), SessionValue::Any(Any::String(title))),
            (
                "createDate".to_string(),
                SessionValue::Any(Any::Float64((create_date as f64).into())),
            ),
            ("tags".to_string(), SessionValue::Array(Vec::new())),
        ]);
        self.root.array_push(&pages_target, vec![page_meta_map])?;
        self.root.map_set(
            &self.spaces_target,
            page_id.clone(),
            SessionValue::Doc {
                guid: page_id.clone(),
                gc: true,
            },
        )?;
        let commit = self.root.commit_tx()?;

        if !self.pages.contains_key(&page_id) {
            let page_session = PageDocSession::new(page_id.clone(), self.client_id)?;
            self.pages.insert(page_id, page_session);
        }
        Ok(commit)
    }

    /// Ensure a local [`PageDocSession`] exists for `page_id` (e.g. discovered via remote root sync).
    pub fn ensure_page(&mut self, page_id: &str) -> DocResult<&mut PageDocSession> {
        if !self.pages.contains_key(page_id) {
            let session = PageDocSession::new(page_id.to_string(), self.client_id)?;
            self.pages.insert(page_id.to_string(), session);
        }
        self.pages
            .get_mut(page_id)
            .ok_or_else(|| DocError::PageNotFound(page_id.to_string()))
    }

    pub fn page(&self, page_id: &str) -> Option<&PageDocSession> {
        self.pages.get(page_id)
    }

    pub fn page_mut(&mut self, page_id: &str) -> Option<&mut PageDocSession> {
        self.pages.get_mut(page_id)
    }

    /// Apply a remote update to the root workspace doc and auto-instantiate any newly added subdocs.
    pub fn apply_root_update_v1(&mut self, bytes: &[u8]) -> DocResult<RemoteApplyResult<()>> {
        let commits = self.root.apply_update_v1(bytes)?;
        let mut subdoc_ids = Vec::new();
        for c in &commits {
            subdoc_ids.extend(c.subdocs_added.iter().cloned());
        }
        for id in subdoc_ids {
            let _ = self.ensure_page(&id)?;
        }
        let outbound_updates = commits
            .iter()
            .filter(|c| {
                c.origin_kind == SessionOriginKind::FormattingCleanup && !c.update.is_empty()
            })
            .map(|c| c.update.clone())
            .collect();
        Ok(RemoteApplyResult {
            commits,
            outbound_updates,
        })
    }

    /// Read all page metadata entries currently in `meta.pages`.
    pub fn set_page_title(
        &mut self,
        page_id: &str,
        title: &str,
    ) -> DocResult<Option<SessionCommit<()>>> {
        for item in self
            .root
            .read_array(&TypeTarget::Path(TypePath::root("meta").key("pages")))?
        {
            if let SessionReadValue::Map(identity) = item {
                let target = TypeTarget::Identity(identity);
                if matches!(self.root.get_map_value(&target,"id")?,Some(SessionReadValue::Any(Any::String(id))) if id==page_id)
                {
                    if matches!(self.root.get_map_value(&target,"title")?,Some(SessionReadValue::Any(Any::String(s))) if s==title)
                    {
                        return Ok(None);
                    }
                    return Ok(self.root.map_set(
                        &target,
                        "title".into(),
                        SessionValue::Any(Any::String(title.into())),
                    )?);
                }
            }
        }
        Ok(None)
    }
    pub fn list_pages(&self) -> DocResult<Vec<PageMeta>> {
        let pages_target = TypeTarget::Path(TypePath::root("meta").key("pages"));
        let Ok(items) = self.root.read_array(&pages_target) else {
            return Ok(Vec::new());
        };
        let mut result = Vec::new();
        for item in items {
            if let SessionReadValue::Map(map_id) = item {
                let entries = self.root.read_map(&TypeTarget::Identity(map_id))?;
                let mut id = String::new();
                let mut title = String::new();
                let mut create_date = 0i64;
                let mut tags = Vec::new();
                for (k, v) in entries {
                    match k.as_str() {
                        "id" => {
                            if let SessionReadValue::Any(Any::String(s)) = v {
                                id = s;
                            }
                        }
                        "title" => {
                            if let SessionReadValue::Any(Any::String(s)) = v {
                                title = s;
                            }
                        }
                        "createDate" => match v {
                            SessionReadValue::Any(Any::Integer(n)) => create_date = i64::from(n),
                            SessionReadValue::Any(Any::Float64(f)) => create_date = f.0 as i64,
                            _ => {}
                        },
                        "tags" => {
                            if let SessionReadValue::Array(arr_id) = v {
                                for tag in self.root.read_array(&TypeTarget::Identity(arr_id))? {
                                    if let SessionReadValue::Any(Any::String(s)) = tag {
                                        tags.push(s);
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
                if !id.is_empty() {
                    result.push(PageMeta {
                        id,
                        title,
                        create_date,
                        tags,
                    });
                }
            }
        }
        Ok(result)
    }

    /// Encode state vector for either the root workspace doc (`doc_id == room`) or a page subdoc.
    pub fn encode_state_vector_v1(&self, doc_id: &str) -> DocResult<Vec<u8>> {
        if doc_id == self.room {
            Ok(self.root.encode_state_vector_v1()?)
        } else {
            self.page(doc_id)
                .ok_or_else(|| DocError::PageNotFound(doc_id.to_string()))?
                .encode_state_vector_v1()
        }
    }

    /// Encode diff for either the root workspace doc or a page subdoc.
    pub fn encode_diff_v1(&self, doc_id: &str, remote_sv: &[u8]) -> DocResult<Vec<u8>> {
        if doc_id == self.room {
            Ok(self.root.encode_diff_v1(remote_sv)?)
        } else {
            self.page(doc_id)
                .ok_or_else(|| DocError::PageNotFound(doc_id.to_string()))?
                .encode_diff_v1(remote_sv)
        }
    }
}
