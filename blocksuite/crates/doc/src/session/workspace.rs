use std::collections::BTreeMap;

use y_octo::{
    Any, DocOptions, DocSession, SessionCommit, SessionConfig, SessionOriginKind, SessionReadValue,
    SessionTxOrigin, SessionUndoConfig, SessionValue, TypePath, TypeTarget, YTypeKind,
};

use crate::{DocError, DocResult, schema::affine_block_versions, validate_client_id};

use super::{PageDocSession, PageMeta, RemoteApplyResult};

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
        let pages_val = self.root.get_map_value(&self.meta_target, "pages")?;
        if let Some(val) = &pages_val
            && !matches!(val, SessionReadValue::Array(_))
        {
            return Err(DocError::InvalidState("meta.pages is not a Y.Array".into()));
        }
        let versions_val = self
            .root
            .get_map_value(&self.meta_target, "blockVersions")?;
        if let Some(val) = &versions_val
            && !matches!(val, SessionReadValue::Map(_))
        {
            return Err(DocError::InvalidState(
                "meta.blockVersions is not a Y.Map".into(),
            ));
        }

        self.root.begin_tx(SessionTxOrigin::Untracked)?;
        let res: DocResult<()> = (|| {
            if pages_val.is_none() {
                self.root.map_set(
                    &self.meta_target,
                    "pages".to_string(),
                    SessionValue::Array(Vec::new()),
                )?;
            }
            if versions_val.is_none() {
                let version_entries = affine_block_versions()
                    .into_iter()
                    .map(|(flavour, ver)| {
                        (flavour.to_string(), SessionValue::Any(Any::Integer(ver)))
                    })
                    .collect();
                self.root.map_set(
                    &self.meta_target,
                    "blockVersions".to_string(),
                    SessionValue::Map(version_entries),
                )?;
            }
            Ok(())
        })();
        let commit = self.root.commit_tx();
        res?;
        Ok(commit?)
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

        let pages_val = self.root.get_map_value(&self.meta_target, "pages")?;
        if let Some(val) = &pages_val
            && !matches!(val, SessionReadValue::Array(_))
        {
            return Err(DocError::InvalidState("meta.pages is not a Y.Array".into()));
        }

        self.root.begin_tx(SessionTxOrigin::Untracked)?;
        let res: DocResult<()> = (|| {
            if pages_val.is_none() {
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
            Ok(())
        })();
        let commit = self.root.commit_tx();
        res?;
        let commit = commit?;

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
        let Some(meta_id) = self.root.resolve_path(&TypePath::root("meta")) else {
            return Ok(Vec::new());
        };
        if self.root.type_status(&meta_id).kind != Some(YTypeKind::Map) {
            return Err(DocError::InvalidState(
                "workspace meta is not a Y.Map".into(),
            ));
        }
        let pages_id = match self
            .root
            .get_map_value(&TypeTarget::Identity(meta_id), "pages")?
        {
            None => return Ok(Vec::new()),
            Some(SessionReadValue::Array(pages_id)) => pages_id,
            Some(_) => {
                return Err(DocError::InvalidState(
                    "workspace meta.pages is not a Y.Array".into(),
                ));
            }
        };
        let items = self.root.read_array(&TypeTarget::Identity(pages_id))?;
        let mut result = Vec::new();
        for item in items {
            if let SessionReadValue::Map(map_id) = item {
                let entries = self.root.read_map(&TypeTarget::Identity(map_id))?;
                let mut id = String::new();
                let mut title = String::new();
                let mut create_date = 0i64;
                let mut updated_date = None;
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
                        "updatedDate" => match v {
                            SessionReadValue::Any(Any::Integer(n)) if n > 0 => {
                                updated_date = Some(i64::from(n));
                            }
                            SessionReadValue::Any(Any::Float64(f)) if f.0 > 0.0 => {
                                updated_date = Some(f.0 as i64);
                            }
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
                        updated_date,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_pages_distinguishes_uninitialized_from_corrupted_meta() {
        let mut ws = WorkspaceSession::new("ws-list-pages", 101).expect("ws");
        assert!(ws.list_pages().expect("uninitialized ok").is_empty());

        ws.initialize_meta().expect("init meta");
        assert!(ws.list_pages().expect("empty pages ok").is_empty());

        let meta = TypeTarget::Path(TypePath::root("meta"));
        ws.root_mut()
            .map_set(
                &meta,
                "pages".to_string(),
                SessionValue::Any(Any::Integer(42)),
            )
            .expect("corrupt meta.pages");
        assert!(
            ws.list_pages().is_err(),
            "corrupted meta.pages = 42 must return Err, not Ok(vec![])"
        );
    }
}
