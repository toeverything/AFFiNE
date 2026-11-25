//! Domain-neutral cross-platform UI component kit (`ui-kit`).
//!
//! All components are built strictly on logical inline geometry (`Direction::Ltr` / `Direction::Rtl`)
//! and closed-form scheduler-clock motion (`ui::Motion` / `ui::MotionCurve`).

#![forbid(unsafe_code)]

pub mod breadcrumb;
pub mod logical;
pub mod micro_icon;
pub mod safe_area;
pub mod sheet;
pub mod swipe_menu;
pub mod virtual_list;

pub use breadcrumb::{
    BIDI_FSI, BIDI_PDI, BreadcrumbBarConfig, BreadcrumbBarLayout, BreadcrumbItem,
    BreadcrumbItemKind, BreadcrumbSlotKind, BreadcrumbVisualStyle, LaidOutBreadcrumbSlot,
    LaidOutSeparator, MIN_TOUCH_HEIGHT, MIN_TOUCH_WIDTH, bidi_isolate, layout_breadcrumb_bar,
    layout_breadcrumb_bar_with_measurer, render_breadcrumb_bar,
};
pub use logical::{LogicalEdges, LogicalStyled};
pub use micro_icon::{
    BakedMicroIconSpec, BakedStroke, MicroIconFrame, MicroIconKeyframe, MicroIconKind, VecPoint,
    evaluate_micro_icon, micro_icon_spec,
};
pub use safe_area::{SafeArea, SafeAreaEdges};
pub use sheet::{
    SWIPE_DIALOG_CLOSE_MS, SWIPE_DIALOG_OPEN_MS, Sheet, SwipeDialog, SwipeDialogSnapshot,
    SwipeDialogState,
};
pub use swipe_menu::{SWIPE_MENU_SNAP_MS, SwipeMenu, SwipeMenuSnapshot, SwipeMenuState};
pub use virtual_list::{ScrollAnchor, VirtualList, VirtualListMetrics, VirtualWindow};
