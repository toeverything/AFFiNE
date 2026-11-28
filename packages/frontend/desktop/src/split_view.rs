//! Multi-tab workbench panes, side-by-side Split View, and per-pane independent
//! navigation history (`Alt/Cmd+[` and `Alt/Cmd+]`) backed by `affine_client::NavHistory`.

use affine_client::{DirectKind, NavHistory, NavTarget, Origin, Scope};
use blocksuite_editor::{block_flow::BlockFlow, edgeless::EdgelessCanvasState};

/// Unique identifier for a workbench pane.
pub type PaneId = u64;

/// Viewing mode for a document inside a pane.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum DocViewMode {
    #[default]
    Page,
    Edgeless,
}

impl DocViewMode {
    pub const fn toggle(self) -> Self {
        match self {
            Self::Page => Self::Edgeless,
            Self::Edgeless => Self::Page,
        }
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::Page => "Page",
            Self::Edgeless => "Edgeless",
        }
    }
}

/// Destination shown inside a desktop workbench tab.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DesktopRoute {
    Doc(String),
    AllDocs,
    Favorites,
    Journals,
    Folder(String),
    Collection(String),
    Tag(String),
    Trash,
}

impl DesktopRoute {
    pub fn doc_id(&self) -> Option<&str> {
        match self {
            Self::Doc(id) => Some(id.as_str()),
            _ => None,
        }
    }

    pub fn to_nav_target(&self) -> NavTarget {
        match self {
            Self::Doc(id) => NavTarget::Doc(id.clone()),
            Self::AllDocs => NavTarget::AllDocs,
            Self::Favorites => NavTarget::Home,
            Self::Journals => NavTarget::Journals,
            Self::Folder(id) => NavTarget::Folder(id.clone()),
            Self::Collection(id) => NavTarget::Collection(id.clone()),
            Self::Tag(tag) => NavTarget::Tag(tag.clone()),
            Self::Trash => NavTarget::Trash,
        }
    }

    pub fn from_nav_target(target: &NavTarget) -> Self {
        match target {
            NavTarget::Doc(id) => Self::Doc(id.clone()),
            NavTarget::AllDocs => Self::AllDocs,
            NavTarget::Home | NavTarget::Search | NavTarget::Settings => Self::Favorites,
            NavTarget::Journals => Self::Journals,
            NavTarget::Folder(id) => Self::Folder(id.clone()),
            NavTarget::Collection(id) => Self::Collection(id.clone()),
            NavTarget::Tag(tag) => Self::Tag(tag.clone()),
            NavTarget::Trash => Self::Trash,
        }
    }
}

/// One open tab inside a [`PaneState`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TabItem {
    pub id: u64,
    pub route: DesktopRoute,
    pub mode: DocViewMode,
}

/// State of a single workbench pane (independent tabs, history stack, scroll, and canvas camera).
pub struct PaneState {
    pub id: PaneId,
    pub tabs: Vec<TabItem>,
    pub active_tab: usize,
    pub history: NavHistory,
    pub scroll_y: f32,
    pub block_flow: BlockFlow,
    pub edgeless: EdgelessCanvasState,
    next_tab_id: u64,
}

impl PaneState {
    pub fn new(id: PaneId, scope: Scope, initial_route: DesktopRoute, mode: DocViewMode) -> Self {
        let mut history = NavHistory::default();
        history.push(
            scope,
            initial_route.to_nav_target(),
            Origin::Direct(DirectKind::Home),
            None,
        );
        Self {
            id,
            tabs: vec![TabItem {
                id: 1,
                route: initial_route,
                mode,
            }],
            active_tab: 0,
            history,
            scroll_y: 0.0,
            block_flow: BlockFlow::new(),
            edgeless: EdgelessCanvasState::new(),
            next_tab_id: 2,
        }
    }

    pub fn active_tab(&self) -> &TabItem {
        &self.tabs[self.active_tab]
    }

    pub fn active_tab_mut(&mut self) -> &mut TabItem {
        &mut self.tabs[self.active_tab]
    }

    pub fn active_route(&self) -> &DesktopRoute {
        &self.active_tab().route
    }

    pub fn active_mode(&self) -> DocViewMode {
        self.active_tab().mode
    }

    pub fn set_mode(&mut self, mode: DocViewMode) {
        self.active_tab_mut().mode = mode;
        if mode == DocViewMode::Edgeless {
            self.edgeless.camera_initialized = false;
        }
    }

    /// Navigate the active tab to `route`, pushing onto this pane's independent `NavHistory`.
    pub fn navigate(&mut self, scope: Scope, route: DesktopRoute, mode: Option<DocViewMode>) {
        if self.active_tab().route == route && mode.is_none_or(|m| m == self.active_tab().mode) {
            return;
        }
        let target = route.to_nav_target();
        self.active_tab_mut().route = route;
        if let Some(m) = mode {
            self.active_tab_mut().mode = m;
        }
        self.scroll_y = 0.0;
        self.edgeless.camera_initialized = false;
        self.history
            .push(scope, target, Origin::Direct(DirectKind::AllDocs), None);
    }

    /// Open `route` in a new tab (or focus an existing tab with the same route & mode).
    pub fn open_tab(&mut self, scope: Scope, route: DesktopRoute, mode: DocViewMode) {
        if let Some(pos) = self
            .tabs
            .iter()
            .position(|t| t.route == route && t.mode == mode)
        {
            self.active_tab = pos;
            self.scroll_y = 0.0;
            return;
        }
        let tab_id = self.next_tab_id;
        self.next_tab_id += 1;
        let target = route.to_nav_target();
        self.tabs.push(TabItem {
            id: tab_id,
            route,
            mode,
        });
        self.active_tab = self.tabs.len() - 1;
        self.scroll_y = 0.0;
        self.edgeless.camera_initialized = false;
        self.history
            .push(scope, target, Origin::Direct(DirectKind::AllDocs), None);
    }

    pub fn select_tab(&mut self, idx: usize) {
        if idx < self.tabs.len() {
            self.active_tab = idx;
            self.scroll_y = 0.0;
            self.edgeless.camera_initialized = false;
        }
    }

    /// Close tab at `idx`; keeps at least one tab open (returns `true` if closed).
    pub fn close_tab(&mut self, idx: usize) -> bool {
        if self.tabs.len() <= 1 || idx >= self.tabs.len() {
            return false;
        }
        self.tabs.remove(idx);
        if self.active_tab >= self.tabs.len() {
            self.active_tab = self.tabs.len() - 1;
        }
        self.scroll_y = 0.0;
        self.edgeless.camera_initialized = false;
        true
    }

    pub fn can_go_back(&self) -> bool {
        self.history.can_back()
    }

    pub fn can_go_forward(&self) -> bool {
        self.history.can_forward()
    }

    /// Step backward in this pane's independent history (`Alt/Cmd+[`).
    pub fn go_back(&mut self) -> bool {
        let Some(entry) = self.history.back().cloned() else {
            return false;
        };
        self.active_tab_mut().route = DesktopRoute::from_nav_target(&entry.target);
        self.scroll_y = 0.0;
        self.edgeless.camera_initialized = false;
        true
    }

    /// Step forward in this pane's independent history (`Alt/Cmd+]`).
    pub fn go_forward(&mut self) -> bool {
        let Some(entry) = self.history.forward().cloned() else {
            return false;
        };
        self.active_tab_mut().route = DesktopRoute::from_nav_target(&entry.target);
        self.scroll_y = 0.0;
        self.edgeless.camera_initialized = false;
        true
    }
}

/// Workbench split layout managing 1..=3 horizontal panes.
pub struct SplitLayout {
    pub panes: Vec<PaneState>,
    pub active_pane: usize,
    /// Relative width ratio of the first pane in 2-pane horizontal split (`0.25..=0.75`).
    pub split_ratio: f32,
    next_pane_id: PaneId,
}

impl SplitLayout {
    pub const MIN_RATIO: f32 = 0.25;
    pub const MAX_RATIO: f32 = 0.75;
    pub const MAX_PANES: usize = 3;

    pub fn single(scope: Scope, initial_route: DesktopRoute, mode: DocViewMode) -> Self {
        Self {
            panes: vec![PaneState::new(1, scope, initial_route, mode)],
            active_pane: 0,
            split_ratio: 0.5,
            next_pane_id: 2,
        }
    }

    pub fn is_split(&self) -> bool {
        self.panes.len() > 1
    }

    pub fn active(&self) -> &PaneState {
        &self.panes[self.active_pane]
    }

    pub fn active_mut(&mut self) -> &mut PaneState {
        &mut self.panes[self.active_pane]
    }

    pub fn focus_pane(&mut self, idx: usize) {
        if idx < self.panes.len() {
            self.active_pane = idx;
        }
    }

    pub fn set_split_ratio(&mut self, ratio: f32) {
        self.split_ratio = ratio.clamp(Self::MIN_RATIO, Self::MAX_RATIO);
    }

    /// Open `route` in a side-by-side split pane (creating one if currently single-pane,
    /// or reusing the rightmost split pane when already at `MAX_PANES`).
    pub fn open_in_split(&mut self, scope: Scope, route: DesktopRoute, mode: DocViewMode) -> usize {
        if self.panes.len() < Self::MAX_PANES {
            let pane_id = self.next_pane_id;
            self.next_pane_id += 1;
            self.panes.push(PaneState::new(pane_id, scope, route, mode));
            self.active_pane = self.panes.len() - 1;
            self.active_pane
        } else {
            let last = self.panes.len() - 1;
            self.panes[last].open_tab(scope, route, mode);
            self.active_pane = last;
            last
        }
    }

    /// Split the currently active document side-by-side in the opposite mode (`Page` <-> `Edgeless`).
    pub fn split_active_doc_opposite_mode(&mut self, scope: Scope) -> bool {
        let route = self.active().active_route().clone();
        let opposite = self.active().active_mode().toggle();
        self.open_in_split(scope, route, opposite);
        true
    }

    /// Close pane at `idx`; never closes the final remaining pane.
    pub fn close_pane(&mut self, idx: usize) -> bool {
        if self.panes.len() <= 1 || idx >= self.panes.len() {
            return false;
        }
        self.panes.remove(idx);
        if self.active_pane >= self.panes.len() {
            self.active_pane = self.panes.len() - 1;
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_scope() -> Scope {
        Scope::new("u-1", "https://app.affine.pro", "ws-1")
    }

    #[test]
    fn split_view_independent_pane_history_and_opposite_mode_split() {
        let mut layout = SplitLayout::single(
            test_scope(),
            DesktopRoute::Doc("doc-arch".into()),
            DocViewMode::Page,
        );
        assert!(!layout.is_split());

        // Split same doc into right pane in Edgeless mode.
        layout.split_active_doc_opposite_mode(test_scope());
        assert!(layout.is_split());
        assert_eq!(layout.panes.len(), 2);
        assert_eq!(layout.panes[0].active_mode(), DocViewMode::Page);
        assert_eq!(layout.panes[1].active_mode(), DocViewMode::Edgeless);
        assert_eq!(
            layout.panes[0].active_route(),
            layout.panes[1].active_route()
        );

        // Navigate pane 0 independently and verify pane 1 history is untouched.
        layout.panes[0].navigate(test_scope(), DesktopRoute::Doc("doc-sync".into()), None);
        assert_eq!(
            layout.panes[0].active_route(),
            &DesktopRoute::Doc("doc-sync".into())
        );
        assert!(layout.panes[0].can_go_back());
        assert!(!layout.panes[1].can_go_back());

        // Back / Forward on pane 0.
        assert!(layout.panes[0].go_back());
        assert_eq!(
            layout.panes[0].active_route(),
            &DesktopRoute::Doc("doc-arch".into())
        );
        assert!(layout.panes[0].can_go_forward());
        assert!(layout.panes[0].go_forward());
        assert_eq!(
            layout.panes[0].active_route(),
            &DesktopRoute::Doc("doc-sync".into())
        );

        // Ratio clamp and closing split pane.
        layout.set_split_ratio(0.95);
        assert!((layout.split_ratio - SplitLayout::MAX_RATIO).abs() < 1e-6);
        assert!(layout.close_pane(1));
        assert!(!layout.is_split());
        assert!(!layout.close_pane(0));
    }
}
