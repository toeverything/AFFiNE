//! Domain-neutral cross-platform UI component kit (`ui-kit`).
//!
//! All components are built strictly on logical inline geometry (`Direction::Ltr` / `Direction::Rtl`)
//! and closed-form scheduler-clock motion (`ui::Motion` / `ui::MotionCurve`).

#![forbid(unsafe_code)]

pub mod logical;
pub mod safe_area;
pub mod sheet;
pub mod swipe_menu;
pub mod virtual_list;

pub use logical::{LogicalEdges, LogicalStyled};
pub use safe_area::{SafeArea, SafeAreaEdges};
pub use sheet::{
    SWIPE_DIALOG_CLOSE_MS, SWIPE_DIALOG_OPEN_MS, Sheet, SwipeDialog, SwipeDialogSnapshot,
    SwipeDialogState,
};
pub use swipe_menu::{SWIPE_MENU_SNAP_MS, SwipeMenu, SwipeMenuSnapshot, SwipeMenuState};
pub use virtual_list::{ScrollAnchor, VirtualList, VirtualListMetrics, VirtualWindow};
