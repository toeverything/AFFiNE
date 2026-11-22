use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use y_octo::{
    Any, DocOptions, DocSession, RelativePosition, SessionCommit, SessionConfig, SessionOriginKind,
    SessionReadValue, SessionTxOrigin, SessionUndoConfig, SessionValue, TextAttributes,
    TextDeltaOp, TextInsert, TypePath, TypeTarget, UndoStackId, YTypeKind,
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

/// Per-page CRDT session wrapping `DocSession<SelectionSnapshot>` with an
/// `UndoStackId` scoped strictly to the `blocks` root `Y.Map`.
pub struct PageDocSession {
    session: DocSession<SelectionSnapshot>,
    undo_stack_id: UndoStackId,
    blocks_target: TypeTarget,
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
        })
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
        self.session.advance_time(now_ms);
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

        self.session.advance_time(now_ms);

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
        self.session.advance_time(now_ms);
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
        self.session.advance_time(now_ms);
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
        self.session.advance_time(now_ms);
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
        self.session.advance_time(now_ms);
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
        self.session.advance_time(now_ms);
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
        self.session.advance_time(now_ms);
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
        self.session.advance_time(now_ms);
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
        self.session.advance_time(now_ms);
        let target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(surface_block_id)
                .key("prop:elements")
                .key("value")
                .key(element_id),
        );
        Ok(self.session.map_set(&target, field.into(), value)?)
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
        let anchor_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(anchor_block_id)
                .key("prop:text"),
        );
        let focus_target = TypeTarget::Path(
            TypePath::root("blocks")
                .key(focus_block_id)
                .key("prop:text"),
        );
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

    pub fn set_undo_selection_snapshot(&self, snapshot: SelectionSnapshot) -> DocResult<bool> {
        Ok(self.session.set_stack_selection_meta(
            self.undo_stack_id,
            y_octo::UndoStack::Undo,
            snapshot,
        )?)
    }

    pub fn undo(&mut self) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        Ok(self.session.undo_stack(self.undo_stack_id)?)
    }

    pub fn redo(&mut self) -> DocResult<Option<SessionCommit<SelectionSnapshot>>> {
        Ok(self.session.redo_stack(self.undo_stack_id)?)
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
