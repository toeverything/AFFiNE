mod export;
mod structure;
mod surface;
mod workspace;

pub use export::any_to_normalized_json;
pub use workspace::WorkspaceSession;

use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
};

use serde::{Deserialize, Serialize};
use y_octo::{
    Any, DocOptions, DocSession, RelativePosition, SessionCommit, SessionConfig, SessionOriginKind,
    SessionReadValue, SessionTxOrigin, SessionUndoConfig, SessionValue, TextAttributes,
    TextDeltaOp, TextInsert, TypeIdentity, TypePath, TypeTarget, UndoStackId, YTypeKind,
};

use crate::{DocError, DocResult, schema::BlockSpec, validate_client_id};

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

pub(super) type PageCommit = Option<SessionCommit<SelectionSnapshot>>;

pub(super) fn block_target(id: &str) -> TypeTarget {
    TypeTarget::Path(TypePath::root("blocks").key(id))
}

pub(super) fn children_target(id: &str) -> TypeTarget {
    TypeTarget::Path(TypePath::root("blocks").key(id).key("sys:children"))
}

pub(super) fn child_values(ids: &[String]) -> Vec<SessionValue> {
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

pub(super) type ChildGraph = BTreeMap<String, Vec<String>>;

pub(super) fn descendants(
    graph: &ChildGraph,
    roots: impl IntoIterator<Item = String>,
) -> BTreeSet<String> {
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
    pub(super) fn refresh_all_surface_orders(&self) {
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

    /// Recursively clear all children of a Yjs container leaf-first so every underlying
    /// `store.delete_item` deletes a single item (`ranges.len() == 1`), keeping
    /// `DeleteSet` ranges sorted regardless of map iteration order.
    pub(super) fn clear_value_canonically(&mut self, value: SessionReadValue) -> DocResult<()> {
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

    pub(super) fn insert_block(
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
}
