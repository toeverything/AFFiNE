//! Scoped document creation, journal management, trash restore/delete with confirmation,
//! settings toggles, and Explorer vertical scroll helpers on [`MobileAppState`].

use affine_client::{DirectKind, NavTarget, Origin};
use affine_store::workspace_db::FolderRow;

use crate::{
    state::{MobileAppState, MobileDocRecord, MobileSheet, SettingsGroupId, ThemePreference},
    strings::MobileLocale,
};

const BASE62_ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// Encode `(ws_id, doc_id)` with an unambiguous byte-length prefix (`"{ws_len}:{ws_id}{doc_id}"`)
/// so workspace or document IDs containing `.` or `:` never collide.
pub fn encode_scoped_doc_target(ws_id: &str, doc_id: &str) -> String {
    format!("{}:{ws_id}{doc_id}", ws_id.len())
}

/// Decode a length-prefixed scoped document target created by [`encode_scoped_doc_target`].
pub fn decode_scoped_doc_target(raw: &str) -> Option<(&str, &str)> {
    let (len_str, rest) = raw.split_once(':')?;
    let ws_len: usize = len_str.parse().ok()?;
    if ws_len > rest.len() || !rest.is_char_boundary(ws_len) {
        return None;
    }
    Some((&rest[..ws_len], &rest[ws_len..]))
}

/// Generate a valid fractional-index key strictly greater than `max_existing` in ASCII order.
pub(crate) fn next_fractional_index(max_existing: Option<&str>) -> String {
    let Some(last) = max_existing.filter(|s| !s.is_empty()) else {
        return "a0".to_string();
    };
    let bytes = last.as_bytes();
    if let Some(&tail) = bytes.last()
        && let Some(pos) = BASE62_ALPHABET.iter().position(|&b| b == tail)
        && pos + 1 < BASE62_ALPHABET.len()
    {
        let mut next = bytes[..bytes.len() - 1].to_vec();
        next.push(BASE62_ALPHABET[pos + 1]);
        if let Ok(s) = String::from_utf8(next) {
            return s;
        }
    }
    format!("{last}V")
}

impl MobileAppState {
    pub fn active_workspace_id(&self) -> &str {
        &self.scope.workspace_id
    }

    pub(crate) fn sync_active_workspace_doc_count(&mut self) {
        let active_count = self.docs.iter().filter(|d| !d.trashed).count();
        if let Some(ws) = self.workspaces.get_mut(self.active_workspace_idx) {
            ws.doc_count = active_count;
        }
        if let Some(store) = self.workspace_store.get_mut(self.active_workspace_idx) {
            store.summary.doc_count = active_count;
        }
    }

    /// Adjust `explorer_scroll_y` by `delta_y`, clamp to `0.0..=max_scroll`, and persist it
    /// against the current history entry `seq` for back-navigation restoration.
    pub fn scroll_explorer_by(&mut self, delta_y: f32, max_scroll: f32) {
        let ceiling = max_scroll.max(0.0);
        self.explorer_scroll_y = (self.explorer_scroll_y + delta_y).clamp(0.0, ceiling);
        if let Some(seq) = self.history.current().map(|e| e.seq) {
            self.explorer_scroll_by_seq
                .insert(seq, self.explorer_scroll_y);
        }
    }

    pub(crate) fn save_current_explorer_scroll(&mut self) {
        if self.route == crate::state::MobileRoute::Explorer
            && let Some(seq) = self.history.current().map(|e| e.seq)
        {
            self.explorer_scroll_by_seq
                .insert(seq, self.explorer_scroll_y.max(0.0));
        }
    }

    pub(crate) fn restore_current_explorer_scroll(&mut self) {
        if self.route == crate::state::MobileRoute::Explorer {
            self.explorer_scroll_y = self
                .history
                .current()
                .and_then(|e| self.explorer_scroll_by_seq.get(&e.seq).copied())
                .unwrap_or(0.0);
        }
    }

    /// Create a new document in the active workspace, optionally placing a folder link under
    /// `folder_id`, and immediately open it.
    pub fn create_doc(&mut self, folder_id: Option<&str>, now_ms: f64) -> String {
        let seq = self.next_doc_seq;
        self.next_doc_seq += 1;
        let ws_id = self.scope.workspace_id.clone();
        let doc_id = format!("doc-{ws_id}-new-{seq}");
        let updated_at_ms = 1_764_001_000 + (now_ms.max(0.0) as i64) + (seq as i64);
        self.docs.insert(
            0,
            MobileDocRecord {
                id: doc_id.clone(),
                title: String::new(),
                body_preview: String::new(),
                tags: Vec::new(),
                updated_at_ms,
                is_favorite: false,
                trashed: false,
                journal_date: None,
                clock: 1,
                outgoing_edges: Vec::new(),
            },
        );
        self.link_graph.replace_edges(&doc_id, Vec::new(), 1);
        self.sync_active_workspace_doc_count();

        if let Some(fid) = folder_id {
            let link_id = format!("l-{ws_id}-new-{seq}");
            let max_idx = self
                .folder_rows
                .iter()
                .filter(|r| r.parent_id.as_deref() == Some(fid))
                .map(|r| r.index.as_str())
                .max();
            let index = next_fractional_index(max_idx);
            self.folder_rows.push(FolderRow {
                id: link_id.clone(),
                parent_id: Some(fid.to_string()),
                data: doc_id.clone(),
                folder_type: "doc".to_string(),
                index,
            });
            self.folder_revision += 1;
            self.open_doc(&doc_id, Origin::Placement { link_id });
        } else {
            self.open_doc(&doc_id, Origin::Direct(DirectKind::AllDocs));
        }
        doc_id
    }

    /// Select a calendar date in the `Journals` tab.
    pub fn select_journal_date(&mut self, date: &str) {
        self.selected_journal_date = date.to_string();
    }

    /// Open the existing journal document for `date` (restoring a trashed journal for `date` if
    /// present to prevent duplicate per-date journals), or create a new one bound to `date` and
    /// open it with `Origin::Journal`.
    pub fn open_or_create_journal_for_date(&mut self, date: &str, now_ms: f64) -> String {
        if let Some(existing_id) = self
            .docs
            .iter()
            .find(|d| !d.trashed && d.journal_date.as_deref() == Some(date))
            .map(|d| d.id.clone())
        {
            self.open_doc(&existing_id, Origin::Journal);
            return existing_id;
        }
        if let Some(trashed_id) = self
            .docs
            .iter()
            .find(|d| d.trashed && d.journal_date.as_deref() == Some(date))
            .map(|d| d.id.clone())
        {
            let ws_id = self.scope.workspace_id.clone();
            self.restore_doc_scoped(&ws_id, &trashed_id);
            self.open_doc(&trashed_id, Origin::Journal);
            return trashed_id;
        }
        let seq = self.next_doc_seq;
        self.next_doc_seq += 1;
        let ws_id = self.scope.workspace_id.clone();
        let doc_id = format!("doc-{ws_id}-journal-{date}-{seq}");
        let updated_at_ms = 1_764_001_000 + (now_ms.max(0.0) as i64) + (seq as i64);
        self.docs.insert(
            0,
            MobileDocRecord {
                id: doc_id.clone(),
                title: format!("Journal {date}"),
                body_preview: String::new(),
                tags: vec!["daily".to_string()],
                updated_at_ms,
                is_favorite: false,
                trashed: false,
                journal_date: Some(date.to_string()),
                clock: 1,
                outgoing_edges: Vec::new(),
            },
        );
        self.link_graph.replace_edges(&doc_id, Vec::new(), 1);
        self.sync_active_workspace_doc_count();
        self.open_doc(&doc_id, Origin::Journal);
        doc_id
    }

    /// Open the two-step permanent-delete confirmation sheet for `(ws_id, doc_id)` only when
    /// `ws_id` matches the active workspace and `doc_id` is currently in Trash.
    pub fn request_delete_doc_scoped(
        &mut self,
        ws_id: &str,
        doc_id: &str,
        trigger_a11y_id: Option<&str>,
        now_ms: f64,
    ) -> bool {
        if self.scope.workspace_id != ws_id {
            return false;
        }
        if !self.docs.iter().any(|d| d.id == doc_id && d.trashed) {
            return false;
        }
        self.pending_delete_target = Some((ws_id.to_string(), doc_id.to_string()));
        self.open_sheet_from(MobileSheet::ConfirmDeleteDoc, trigger_a11y_id, now_ms);
        true
    }

    /// Restore a trashed document scoped to `(ws_id, doc_id)`, synchronizing its `link_graph`
    /// clock so workspace backlinks stay `Ready`.
    pub fn restore_doc_scoped(&mut self, ws_id: &str, doc_id: &str) -> bool {
        if self.scope.workspace_id != ws_id {
            return false;
        }
        let Some(doc) = self.docs.iter_mut().find(|d| d.id == doc_id && d.trashed) else {
            return false;
        };
        doc.trashed = false;
        doc.clock += 1;
        let edges = doc.outgoing_edges.clone();
        let clock = doc.clock;
        self.link_graph.replace_edges(doc_id, edges, clock);
        self.sync_active_workspace_doc_count();
        true
    }

    /// Permanently delete a trashed document scoped to `(ws_id, doc_id)`, purge all history
    /// entries pointing to it, close the confirmation sheet, and navigate safely.
    pub fn delete_doc_permanently_scoped(
        &mut self,
        ws_id: &str,
        doc_id: &str,
        now_ms: f64,
    ) -> bool {
        if self.scope.workspace_id != ws_id {
            return false;
        }
        if !self.docs.iter().any(|d| d.id == doc_id && d.trashed) {
            return false;
        }
        self.docs.retain(|d| d.id != doc_id);
        let rows_before = self.folder_rows.len();
        self.folder_rows
            .retain(|r| !(r.folder_type == "doc" && r.data == doc_id));
        if self.folder_rows.len() != rows_before {
            self.folder_revision += 1;
        }
        for col in &mut self.collections {
            col.doc_ids.retain(|id| id != doc_id);
        }
        self.link_graph.replace_edges(doc_id, Vec::new(), u64::MAX);
        self.sync_active_workspace_doc_count();

        self.pending_delete_target = None;
        self.close_sheet(now_ms);
        self.history
            .remove_target(&self.scope, &NavTarget::Doc(doc_id.to_string()));
        if self.history.is_empty() {
            self.history.push(
                self.scope.clone(),
                NavTarget::AllDocs,
                Origin::Direct(DirectKind::AllDocs),
                None,
            );
        }
        self.sync_route_from_history();
        true
    }

    /// Apply an in-place toggle or cycle action for an interactive Settings row.
    pub fn activate_setting(&mut self, group: SettingsGroupId) -> bool {
        match group {
            SettingsGroupId::Appearance => {
                self.settings.theme_preference = match self.settings.theme_preference {
                    ThemePreference::Light => ThemePreference::Dark,
                    ThemePreference::Dark => ThemePreference::System,
                    ThemePreference::System => ThemePreference::Light,
                };
                true
            }
            SettingsGroupId::Language => {
                self.settings.locale = match self.settings.locale {
                    MobileLocale::En => MobileLocale::ZhHans,
                    MobileLocale::ZhHans => MobileLocale::Ar,
                    MobileLocale::Ar => MobileLocale::En,
                };
                true
            }
            SettingsGroupId::SyncOffline => {
                self.settings.offline_sync_enabled = !self.settings.offline_sync_enabled;
                true
            }
            SettingsGroupId::Notifications => {
                self.settings.push_notifications = !self.settings.push_notifications;
                true
            }
            _ => false,
        }
    }
}
