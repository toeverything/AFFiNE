//! Device-neutral navigation history (`NavHistory`) and breadcrumb derivation (`breadcrumb`).
//!
//! Shared identically across Mobile, Desktop, and Web shells.

pub mod breadcrumb;

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

pub use breadcrumb::{
    BreadcrumbAction, BreadcrumbCrumb, BreadcrumbDerivation, ContextState, DocMetaSnapshot,
    LocationOption, TrailEntry, WorkspaceBreadcrumbSnapshot, derive,
};

/// Maximum retained entries in [`NavHistory`].
pub const NAV_HISTORY_CAPACITY: usize = 128;

/// Schema version tag embedded in Web `history.state` JSON payloads.
pub const WEB_HISTORY_STATE_SCHEMA_VERSION: u32 = 1;

/// Isolation boundary: provenance walks stop immediately whenever `Scope` changes.
#[derive(Clone, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scope {
    pub account_id: String,
    pub server_endpoint: String,
    pub workspace_id: String,
}

impl Scope {
    pub fn new(
        account_id: impl Into<String>,
        server_endpoint: impl Into<String>,
        workspace_id: impl Into<String>,
    ) -> Self {
        Self {
            account_id: account_id.into(),
            server_endpoint: server_endpoint.into(),
            workspace_id: workspace_id.into(),
        }
    }
}

/// Destination represented by a navigation entry.
#[derive(Clone, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NavTarget {
    Home,
    AllDocs,
    Journals,
    Search,
    Trash,
    Settings,
    Folder(String),
    Collection(String),
    Tag(String),
    Doc(String),
}

impl NavTarget {
    pub fn doc_id(&self) -> Option<&str> {
        match self {
            Self::Doc(id) => Some(id.as_str()),
            _ => None,
        }
    }
}

/// Sub-category for [`Origin::Direct`].
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DirectKind {
    Home,
    AllDocs,
    Search,
    Link,
    Breadcrumb,
    External,
}

/// Explicit provenance written by the navigation initiator (never guessed by `derive`).
#[derive(Clone, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Origin {
    DocLink {
        parent_seq: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        block_id: Option<String>,
    },
    Placement {
        link_id: String,
    },
    Collection(String),
    Tag(String),
    Journal,
    Backlink {
        source_doc_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        block_id: Option<String>,
    },
    Direct(DirectKind),
}

/// Stable identifier of one document placement (never an array index).
#[derive(Clone, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LocationRef {
    FolderLink(String),
    JournalDate(String),
}

/// Explicit user choice stored on a [`NavEntry`] via in-place `Pick`.
#[derive(Clone, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LocationChoice {
    UseTrail,
    Location(LocationRef),
}

/// One entry in the per-pane navigation history stack.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavEntry {
    pub seq: u64,
    pub scope: Scope,
    pub target: NavTarget,
    pub origin: Origin,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pick: Option<LocationChoice>,
}

/// Schema-versioned envelope for serializing a [`NavEntry`] into Web `history.state`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebHistoryStateEnvelope {
    version: u32,
    entry: NavEntry,
}

/// Per-pane linear navigation history with causal sequence IDs and a hard 128-entry cap.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct NavHistory {
    entries: Vec<NavEntry>,
    cursor: Option<usize>,
    next_seq: u64,
}

impl NavHistory {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            cursor: None,
            next_seq: 1,
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn current(&self) -> Option<&NavEntry> {
        self.cursor.and_then(|idx| self.entries.get(idx))
    }

    pub fn entries(&self) -> &[NavEntry] {
        &self.entries
    }

    pub fn entry_by_seq(&self, seq: u64) -> Option<&NavEntry> {
        self.entries.iter().find(|e| e.seq == seq)
    }

    pub fn can_back(&self) -> bool {
        self.cursor.is_some_and(|idx| idx > 0)
    }

    pub fn can_forward(&self) -> bool {
        self.cursor.is_some_and(|idx| idx + 1 < self.entries.len())
    }

    /// Peek at the entry immediately behind the current cursor without mutating state.
    pub fn peek_back(&self) -> Option<&NavEntry> {
        let cur = self.cursor?;
        cur.checked_sub(1).and_then(|idx| self.entries.get(idx))
    }

    /// Pop the current entry off the stack and step the cursor back by one.
    pub fn pop_back(&mut self) -> Option<&NavEntry> {
        let cur = self.cursor?;
        if cur == 0 {
            return None;
        }
        self.entries.truncate(cur);
        self.cursor = Some(cur - 1);
        self.entries.get(cur - 1)
    }

    /// Replace the current history entry in place without increasing stack depth.
    pub fn replace_current(
        &mut self,
        scope: Scope,
        target: NavTarget,
        origin: Origin,
        pick: Option<LocationChoice>,
    ) -> u64 {
        let seq = self.next_seq;
        self.next_seq = self.next_seq.saturating_add(1);
        let entry = NavEntry {
            seq,
            scope,
            target,
            origin,
            pick,
        };
        if let Some(cur) = self.cursor
            && cur < self.entries.len()
        {
            self.entries[cur] = entry;
            self.entries.truncate(cur + 1);
        } else {
            self.entries.clear();
            self.entries.push(entry);
            self.cursor = Some(0);
        }
        seq
    }

    /// Push a new navigation entry, truncating any forward stack and capping total entries at 128.
    pub fn push(
        &mut self,
        scope: Scope,
        target: NavTarget,
        origin: Origin,
        pick: Option<LocationChoice>,
    ) -> u64 {
        if let Some(cur) = self.cursor {
            self.entries.truncate(cur + 1);
        } else {
            self.entries.clear();
        }

        let seq = self.next_seq;
        self.next_seq = self.next_seq.saturating_add(1);
        self.entries.push(NavEntry {
            seq,
            scope,
            target,
            origin,
            pick,
        });

        if self.entries.len() > NAV_HISTORY_CAPACITY {
            let overflow = self.entries.len() - NAV_HISTORY_CAPACITY;
            self.entries.drain(0..overflow);
        }
        self.cursor = Some(self.entries.len() - 1);
        seq
    }

    /// Step backward in chronological history (preserves full time sequence even across loop-erased trails).
    pub fn back(&mut self) -> Option<&NavEntry> {
        let cur = self.cursor?;
        if cur == 0 {
            return None;
        }
        self.cursor = Some(cur - 1);
        self.entries.get(cur - 1)
    }

    /// Step forward in chronological history.
    pub fn forward(&mut self) -> Option<&NavEntry> {
        let cur = self.cursor?;
        if cur + 1 >= self.entries.len() {
            return None;
        }
        self.cursor = Some(cur + 1);
        self.entries.get(cur + 1)
    }

    /// Update `pick` in place on the entry with `seq` without pushing a new history entry.
    pub fn pick_location(&mut self, seq: u64, choice: Option<LocationChoice>) -> bool {
        if let Some(entry) = self.entries.iter_mut().find(|e| e.seq == seq) {
            entry.pick = choice;
            true
        } else {
            false
        }
    }

    /// Law 3: clicking ANY breadcrumb ancestor (including immediate parent `k = 1`) ALWAYS pushes
    /// a new entry so one Back press always returns to the screen just left.
    pub fn click_breadcrumb_ancestor(
        &mut self,
        action: &BreadcrumbAction,
        scope: Scope,
    ) -> Option<u64> {
        match action {
            BreadcrumbAction::NavigateHistoryAnchor { anchor_seq } => {
                let anchored = self.entry_by_seq(*anchor_seq)?.clone();
                Some(self.push(
                    anchored.scope,
                    anchored.target,
                    anchored.origin,
                    anchored.pick,
                ))
            }
            BreadcrumbAction::OpenFolder { folder_id } => Some(self.push(
                scope,
                NavTarget::Folder(folder_id.clone()),
                Origin::Direct(DirectKind::Breadcrumb),
                None,
            )),
            BreadcrumbAction::OpenTarget { target } => Some(self.push(
                scope,
                target.clone(),
                Origin::Direct(DirectKind::Breadcrumb),
                None,
            )),
            BreadcrumbAction::OpenLocationSheet { .. } | BreadcrumbAction::None => None,
        }
    }

    /// Encode the current entry into a schema-versioned Web `history.state` JSON string.
    pub fn encode_current_web_state_json(&self) -> Option<String> {
        let entry = self.current()?.clone();
        let envelope = WebHistoryStateEnvelope {
            version: WEB_HISTORY_STATE_SCHEMA_VERSION,
            entry,
        };
        serde_json::to_string(&envelope).ok()
    }

    /// Decode a Web `history.state` JSON payload. Any schema mismatch, corrupt JSON, or
    /// invalid `Placement { link_id }` safely downgrades to `Origin::Direct(DirectKind::External)`
    /// with zero panics.
    pub fn decode_web_state_json(
        raw: &str,
        fallback_scope: Scope,
        fallback_target: NavTarget,
        valid_link_ids: &HashSet<String>,
    ) -> NavEntry {
        let fallback = |seq: u64| NavEntry {
            seq,
            scope: fallback_scope.clone(),
            target: fallback_target.clone(),
            origin: Origin::Direct(DirectKind::External),
            pick: None,
        };

        let Ok(envelope) = serde_json::from_str::<WebHistoryStateEnvelope>(raw) else {
            return fallback(0);
        };
        if envelope.version != WEB_HISTORY_STATE_SCHEMA_VERSION {
            return fallback(envelope.entry.seq);
        }

        let mut entry = envelope.entry;
        if let Origin::Placement { ref link_id } = entry.origin
            && !valid_link_ids.contains(link_id)
        {
            entry.origin = Origin::Direct(DirectKind::External);
        }
        if let Some(LocationChoice::Location(LocationRef::FolderLink(ref link_id))) = entry.pick
            && !valid_link_ids.contains(link_id)
        {
            entry.pick = None;
        }
        entry
    }
}
