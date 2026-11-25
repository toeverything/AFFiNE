//! First-frame production accessibility semantic entry (`PlatformAccessibility`).
//!
//! Always compiled and active in shipping (non-`harness`) builds so Web (ARIA), iOS
//! (`UIAccessibility`), and Android (`AccessibilityNodeInfo`) hosts can discover the root
//! semantic tree on frame 1.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Semantic role exported to platform accessibility trees.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AccessibilityRole {
    Application,
    Main,
    Navigation,
    Region,
    Heading,
    Button,
    Link,
    TextField,
    Document,
    List,
    ListItem,
    Tab,
    TabList,
    Dialog,
    Alert,
    Status,
}

/// Logical screen-space bounding rectangle in logical pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct AccessibilityBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Semantic state flags exposed on an [`AccessibilityNode`].
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityState {
    pub disabled: bool,
    pub selected: bool,
    pub checked: Option<bool>,
    pub expanded: Option<bool>,
    pub hidden: bool,
    pub busy: bool,
    #[serde(default)]
    pub current: bool,
}

/// Stable production semantic node consumed by Web, iOS, and Android hosts.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityNode {
    pub id: String,
    pub role: AccessibilityRole,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    pub state: AccessibilityState,
    pub focused: bool,
    pub bounds: AccessibilityBounds,
    pub children: Vec<String>,
}

/// Complete semantic tree snapshot exported on first frame and subsequent updates.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityTree {
    pub root_id: String,
    pub nodes: BTreeMap<String, AccessibilityNode>,
}

impl AccessibilityTree {
    pub fn root(&self) -> Option<&AccessibilityNode> {
        self.nodes.get(&self.root_id)
    }

    pub fn node(&self, id: &str) -> Option<&AccessibilityNode> {
        self.nodes.get(id)
    }

    pub fn focused_node(&self) -> Option<&AccessibilityNode> {
        self.nodes.values().find(|n| n.focused)
    }
}

/// Production accessibility sink implemented by Web, iOS, and Android platform hosts.
pub trait PlatformAccessibility {
    /// Publish the latest semantic tree snapshot to the native accessibility bridge.
    fn publish_tree(&mut self, tree: &AccessibilityTree);

    /// Announce a live status update (e.g. "Document created", "Offline mode").
    fn announce(&mut self, message: &str, polite: bool);
}

/// Builder producing a discoverable first-frame production semantic root entry.
#[derive(Clone, Debug)]
pub struct FirstFrameAccessibilityRoot {
    app_name: String,
    workspace_name: String,
    active_doc_title: Option<String>,
    viewport_bounds: AccessibilityBounds,
}

impl FirstFrameAccessibilityRoot {
    pub fn new(
        app_name: impl Into<String>,
        workspace_name: impl Into<String>,
        active_doc_title: Option<String>,
        viewport_bounds: AccessibilityBounds,
    ) -> Self {
        Self {
            app_name: app_name.into(),
            workspace_name: workspace_name.into(),
            active_doc_title,
            viewport_bounds,
        }
    }

    /// Build the frame-1 semantic tree with stable root, navigation, and main document landmarks.
    pub fn build_tree(&self) -> AccessibilityTree {
        let root_id = "app.root".to_string();
        let nav_id = "app.navigation".to_string();
        let main_id = "app.main".to_string();

        let mut nodes = BTreeMap::new();
        nodes.insert(
            root_id.clone(),
            AccessibilityNode {
                id: root_id.clone(),
                role: AccessibilityRole::Application,
                name: self.app_name.clone(),
                value: Some(self.workspace_name.clone()),
                state: AccessibilityState::default(),
                focused: false,
                bounds: self.viewport_bounds,
                children: vec![nav_id.clone(), main_id.clone()],
            },
        );
        nodes.insert(
            nav_id.clone(),
            AccessibilityNode {
                id: nav_id,
                role: AccessibilityRole::Navigation,
                name: self.workspace_name.clone(),
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: self.viewport_bounds,
                children: Vec::new(),
            },
        );
        nodes.insert(
            main_id.clone(),
            AccessibilityNode {
                id: main_id,
                role: AccessibilityRole::Main,
                name: self
                    .active_doc_title
                    .clone()
                    .unwrap_or_else(|| self.workspace_name.clone()),
                value: self.active_doc_title.clone(),
                state: AccessibilityState::default(),
                focused: true,
                bounds: self.viewport_bounds,
                children: Vec::new(),
            },
        );

        AccessibilityTree { root_id, nodes }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct RecordingAccessibility {
        trees: Vec<AccessibilityTree>,
        announcements: Vec<(String, bool)>,
    }

    impl PlatformAccessibility for RecordingAccessibility {
        fn publish_tree(&mut self, tree: &AccessibilityTree) {
            self.trees.push(tree.clone());
        }

        fn announce(&mut self, message: &str, polite: bool) {
            self.announcements.push((message.to_string(), polite));
        }
    }

    #[test]
    fn first_frame_accessibility_root_exports_stable_semantic_landmarks() {
        let builder = FirstFrameAccessibilityRoot::new(
            "AFFiNE",
            "Personal Workspace",
            Some("Welcome".into()),
            AccessibilityBounds {
                x: 0.0,
                y: 0.0,
                width: 390.0,
                height: 844.0,
            },
        );
        let tree = builder.build_tree();
        let mut sink = RecordingAccessibility {
            trees: Vec::new(),
            announcements: Vec::new(),
        };
        sink.publish_tree(&tree);
        sink.announce("Workspace ready", true);

        assert_eq!(sink.trees.len(), 1);
        let root = sink.trees[0].root().expect("root node");
        assert_eq!(root.role, AccessibilityRole::Application);
        assert_eq!(root.children, vec!["app.navigation", "app.main"]);
        let focused = sink.trees[0].focused_node().expect("focused main node");
        assert_eq!(focused.id, "app.main");
        assert_eq!(focused.name, "Welcome");
        assert_eq!(sink.announcements, vec![("Workspace ready".into(), true)]);
    }
}
