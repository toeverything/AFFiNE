//! Collapsible and resizable left `AppSidebar` matching `0.27.5` AFFiNE Web Desktop:
//! workspace switcher, Quick Search, New Page/Edgeless, All Docs / Favorites / Journals,
//! hierarchical Folders / Collections / Tags tree, Trash, and Settings.

use std::collections::BTreeSet;

use ui::{
    Context, FontWeight, InteractiveElement, IntoElement, ParentElement,
    StatefulInteractiveElement, Styled, div, px, svg,
};
use ui_tokens::FONT_SANS;

use crate::{
    CHEVRON_DOWN_SVG, CHEVRON_RIGHT_SVG, COLLECTION_ICON_SVG, DOC_ICON_SVG, DesktopFlexExt,
    DesktopPalette, EDGELESS_ICON_SVG, JOURNAL_ICON_SVG, PLUS_ICON_SVG, SEARCH_ICON_SVG,
    SETTINGS_ICON_SVG, STAR_ICON_SVG, TAG_ICON_SVG, TRASH_ICON_SVG, doc_store::DesktopDocStore,
    sidebar_tree::append_folder_rows, split_view::DesktopRoute, workbench::DesktopShellView,
};

/// Expandable section identifiers in `AppSidebar`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Ord, PartialOrd, Hash)]
pub enum SidebarSection {
    Favorites,
    Folders,
    Collections,
    Tags,
}

/// Persistent UI state for `AppSidebar`.
#[derive(Clone, Debug)]
pub struct SidebarState {
    pub open: bool,
    pub width: f32,
    pub scroll_y: f32,
    pub expanded_sections: BTreeSet<SidebarSection>,
    pub expanded_folders: BTreeSet<String>,
    pub workspace_menu_open: bool,
}

impl Default for SidebarState {
    fn default() -> Self {
        Self {
            open: true,
            width: 260.0,
            scroll_y: 0.0,
            expanded_sections: BTreeSet::from([
                SidebarSection::Favorites,
                SidebarSection::Folders,
                SidebarSection::Collections,
                SidebarSection::Tags,
            ]),
            expanded_folders: BTreeSet::from([
                "f-eng".into(),
                "f-desktop".into(),
                "f-specs".into(),
            ]),
            workspace_menu_open: false,
        }
    }
}

impl SidebarState {
    pub const MIN_WIDTH: f32 = 200.0;
    pub const MAX_WIDTH: f32 = 420.0;

    pub fn toggle_open(&mut self) {
        self.open = !self.open;
    }

    pub fn set_width(&mut self, width: f32) {
        self.width = width.clamp(Self::MIN_WIDTH, Self::MAX_WIDTH);
    }

    pub fn toggle_section(&mut self, section: SidebarSection) {
        if !self.expanded_sections.remove(&section) {
            self.expanded_sections.insert(section);
        }
    }

    pub fn toggle_folder(&mut self, folder_id: &str) {
        if !self.expanded_folders.remove(folder_id) {
            self.expanded_folders.insert(folder_id.to_string());
        }
    }
}

pub(crate) fn clip_label(s: &str, max: usize) -> String {
    let mut it = s.chars();
    let head: String = it.by_ref().take(max).collect();
    if it.next().is_some() {
        format!("{head}…")
    } else {
        head
    }
}

fn nav_row(
    id: impl Into<ui::SharedString>,
    icon: &'static [u8],
    label: impl Into<String>,
    badge: Option<String>,
    active: bool,
    palette: DesktopPalette,
) -> ui::Stateful<ui::Div> {
    let id_str: ui::SharedString = id.into();
    let label_text = clip_label(&label.into(), 25);
    let mut row = div()
        .id(id_str)
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .w_full()
        .h(px(30.0))
        .px(px(10.0))
        .rounded(px(7.0))
        .overflow_hidden()
        .bg(if active {
            palette.bg_active
        } else {
            ui::hsla(0.0, 0.0, 0.0, 0.0)
        })
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(8.0))
                .flex_1()
                .min_w_0()
                .overflow_hidden()
                .child(
                    svg()
                        .data(icon)
                        .w(px(15.0))
                        .h(px(15.0))
                        .flex_shrink(0.0)
                        .text_color(if active {
                            palette.accent
                        } else {
                            palette.text_secondary
                        }),
                )
                .child(
                    div()
                        .text_size(px(13.0))
                        .font_weight(if active {
                            FontWeight::MEDIUM
                        } else {
                            FontWeight::NORMAL
                        })
                        .text_color(if active {
                            palette.accent
                        } else {
                            palette.text_primary
                        })
                        .child(label_text),
                ),
        );
    if let Some(badge_text) = badge {
        row = row.child(
            div()
                .px(px(6.0))
                .py(px(1.0))
                .rounded(px(5.0))
                .bg(palette.bg_pill)
                .text_size(px(11.0))
                .text_color(palette.text_muted)
                .child(badge_text),
        );
    }
    row
}

fn section_header(
    id: &'static str,
    title: &'static str,
    expanded: bool,
    palette: DesktopPalette,
    section: SidebarSection,
    cx: &mut Context<DesktopShellView>,
) -> ui::Stateful<ui::Div> {
    div()
        .id(id)
        .flex()
        .flex_row()
        .items_center()
        .gap(px(4.0))
        .w_full()
        .h(px(24.0))
        .px(px(8.0))
        .mt(px(6.0))
        .on_click(cx.listener(move |this, _, _, cx| {
            this.state.sidebar.toggle_section(section);
            cx.notify();
        }))
        .child(
            svg()
                .data(if expanded {
                    CHEVRON_DOWN_SVG
                } else {
                    CHEVRON_RIGHT_SVG
                })
                .w(px(12.0))
                .h(px(12.0))
                .text_color(palette.text_muted),
        )
        .child(
            div()
                .text_size(px(11.5))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_muted)
                .child(title),
        )
}

/// Render the full left `AppSidebar` panel.
pub(crate) fn render_sidebar(
    sidebar: &SidebarState,
    store: &DesktopDocStore,
    active_route: &DesktopRoute,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> impl IntoElement {
    let ws = store.active_workspace();
    let visible_count = store.visible_docs().len();
    let trash_count = store.trashed_docs().len();
    let journal_count = store.journal_docs().len();

    let mut tree_col = div()
        .flex()
        .flex_col()
        .w_full()
        .gap(px(2.0))
        .flex_1()
        .min_h_0();

    // Primary Navigation: All Docs, Favorites, Journals
    tree_col = tree_col
        .child(
            nav_row(
                "desktop.sidebar.all_docs",
                DOC_ICON_SVG,
                "All Docs",
                Some(visible_count.to_string()),
                matches!(active_route, DesktopRoute::AllDocs),
                palette,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.state.navigate_active_pane(DesktopRoute::AllDocs);
                cx.notify();
            })),
        )
        .child(
            nav_row(
                "desktop.sidebar.journals",
                JOURNAL_ICON_SVG,
                "Journals",
                Some(journal_count.to_string()),
                matches!(active_route, DesktopRoute::Journals),
                palette,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.state.open_today_journal();
                cx.notify();
            })),
        );

    // Favorites section
    let fav_open = sidebar
        .expanded_sections
        .contains(&SidebarSection::Favorites);
    tree_col = tree_col.child(section_header(
        "desktop.sidebar.sec.favorites",
        "Favorites",
        fav_open,
        palette,
        SidebarSection::Favorites,
        cx,
    ));
    if fav_open {
        for doc in store.favorite_docs() {
            let doc_id = doc.id.clone();
            let active = matches!(active_route, DesktopRoute::Doc(id) if id == &doc_id);
            tree_col = tree_col.child(
                nav_row(
                    format!("desktop.sidebar.fav.{doc_id}"),
                    STAR_ICON_SVG,
                    doc.title.clone(),
                    None,
                    active,
                    palette,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.open_doc_in_active_pane(&doc_id);
                    cx.notify();
                })),
            );
        }
    }

    // Folders section
    let folders_open = sidebar.expanded_sections.contains(&SidebarSection::Folders);
    tree_col = tree_col.child(
        div()
            .flex()
            .flex_row()
            .items_center()
            .justify_between()
            .w_full()
            .child(section_header(
                "desktop.sidebar.sec.folders",
                "Folders",
                folders_open,
                palette,
                SidebarSection::Folders,
                cx,
            ))
            .child(
                div()
                    .id("desktop.sidebar.new_folder")
                    .w(px(22.0))
                    .h(px(22.0))
                    .mr(px(6.0))
                    .mt(px(6.0))
                    .rounded(px(5.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.state.create_folder("New Folder", None);
                        cx.notify();
                    }))
                    .child(
                        svg()
                            .data(PLUS_ICON_SVG)
                            .w(px(13.0))
                            .h(px(13.0))
                            .text_color(palette.text_muted),
                    ),
            ),
    );
    if folders_open {
        let root_folders: Vec<_> = store
            .folder_rows
            .iter()
            .filter(|r| r.folder_type == "folder" && r.parent_id.is_none())
            .collect();
        for folder in root_folders {
            tree_col = append_folder_rows(
                tree_col,
                sidebar,
                store,
                active_route,
                folder.id.as_str(),
                0,
                palette,
                cx,
            );
        }
    }

    // Collections section
    let cols_open = sidebar
        .expanded_sections
        .contains(&SidebarSection::Collections);
    tree_col = tree_col.child(section_header(
        "desktop.sidebar.sec.collections",
        "Collections",
        cols_open,
        palette,
        SidebarSection::Collections,
        cx,
    ));
    if cols_open {
        for col in &store.collections {
            let col_id = col.id.clone();
            let count = store.docs_for_collection(&col_id).len();
            let active = matches!(active_route, DesktopRoute::Collection(id) if id == &col_id);
            tree_col = tree_col.child(
                nav_row(
                    format!("desktop.sidebar.col.{col_id}"),
                    COLLECTION_ICON_SVG,
                    col.name.clone(),
                    Some(count.to_string()),
                    active,
                    palette,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state
                        .navigate_active_pane(DesktopRoute::Collection(col_id.clone()));
                    cx.notify();
                })),
            );
        }
    }

    // Tags section
    let tags_open = sidebar.expanded_sections.contains(&SidebarSection::Tags);
    tree_col = tree_col.child(section_header(
        "desktop.sidebar.sec.tags",
        "Tags",
        tags_open,
        palette,
        SidebarSection::Tags,
        cx,
    ));
    if tags_open {
        for (tag, _color, count) in store.all_tags_with_counts() {
            let tag_clone = tag.clone();
            let active = matches!(active_route, DesktopRoute::Tag(t) if t == &tag_clone);
            tree_col = tree_col.child(
                nav_row(
                    format!("desktop.sidebar.tag.{tag}"),
                    TAG_ICON_SVG,
                    format!("#{tag}"),
                    Some(count.to_string()),
                    active,
                    palette,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state
                        .navigate_active_pane(DesktopRoute::Tag(tag_clone.clone()));
                    cx.notify();
                })),
            );
        }
    }

    // Workspace header & quick actions
    let ws_header = div()
        .id("desktop.sidebar.workspace_switcher")
        .snapshot(
            "desktop.sidebar.workspace_switcher",
            Some("desktop.sidebar"),
        )
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .w_full()
        .h(px(40.0))
        .px(px(10.0))
        .rounded(px(9.0))
        .bg(palette.bg_elevated)
        .border_1()
        .border_color(palette.border)
        .on_click(cx.listener(|this, _, _, cx| {
            let next =
                (this.state.store.active_workspace_idx + 1) % this.state.store.workspaces.len();
            this.state.store.switch_workspace(next);
            cx.notify();
        }))
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(8.0))
                .child(
                    div()
                        .w(px(22.0))
                        .h(px(22.0))
                        .rounded(px(6.0))
                        .bg(palette.accent)
                        .flex()
                        .items_center()
                        .justify_center()
                        .text_size(px(12.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
                        .child("A"),
                )
                .child(
                    div()
                        .text_size(px(13.0))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(palette.text_primary)
                        .child(ws.name.clone()),
                ),
        )
        .child(
            div()
                .px(px(6.0))
                .py(px(2.0))
                .rounded(px(5.0))
                .bg(palette.accent_soft)
                .text_size(px(10.5))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.accent)
                .child(ws.kind.badge()),
        );

    let quick_actions = div()
        .flex()
        .flex_col()
        .w_full()
        .gap(px(6.0))
        .child(
            div()
                .id("desktop.sidebar.quick_search")
                .snapshot("desktop.sidebar.quick_search", Some("desktop.sidebar"))
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .w_full()
                .h(px(32.0))
                .px(px(10.0))
                .rounded(px(8.0))
                .bg(palette.bg_elevated)
                .border_1()
                .border_color(palette.border)
                .on_click(cx.listener(|this, _, _, cx| {
                    this.state.open_quick_search();
                    cx.notify();
                }))
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(7.0))
                        .child(
                            svg()
                                .data(SEARCH_ICON_SVG)
                                .w(px(14.0))
                                .h(px(14.0))
                                .text_color(palette.text_muted),
                        )
                        .child(
                            div()
                                .text_size(px(12.5))
                                .text_color(palette.text_muted)
                                .child("Quick Search"),
                        ),
                )
                .child(
                    div()
                        .px(px(5.0))
                        .py(px(1.0))
                        .rounded(px(4.0))
                        .bg(palette.bg_pill)
                        .text_size(px(10.5))
                        .text_color(palette.text_muted)
                        .child("⌘K"),
                ),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .w_full()
                .gap(px(6.0))
                .child(
                    div()
                        .id("desktop.sidebar.new_page")
                        .snapshot("desktop.sidebar.new_page", Some("desktop.sidebar"))
                        .flex_1()
                        .h(px(30.0))
                        .rounded(px(7.0))
                        .bg(palette.accent)
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_center()
                        .gap(px(5.0))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state
                                .create_new_doc(affine_store::directory::DocMode::Page);
                            cx.notify();
                        }))
                        .child(
                            svg()
                                .data(PLUS_ICON_SVG)
                                .w(px(13.0))
                                .h(px(13.0))
                                .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0)),
                        )
                        .child(
                            div()
                                .text_size(px(12.0))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
                                .child("New Page"),
                        ),
                )
                .child(
                    div()
                        .id("desktop.sidebar.new_edgeless")
                        .snapshot("desktop.sidebar.new_edgeless", Some("desktop.sidebar"))
                        .flex_1()
                        .h(px(30.0))
                        .rounded(px(7.0))
                        .bg(palette.bg_elevated)
                        .border_1()
                        .border_color(palette.border)
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_center()
                        .gap(px(5.0))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state
                                .create_new_doc(affine_store::directory::DocMode::Edgeless);
                            cx.notify();
                        }))
                        .child(
                            svg()
                                .data(EDGELESS_ICON_SVG)
                                .w(px(13.0))
                                .h(px(13.0))
                                .text_color(palette.text_primary),
                        )
                        .child(
                            div()
                                .text_size(px(12.0))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(palette.text_primary)
                                .child("Edgeless"),
                        ),
                ),
        );

    // Footer: Trash + Settings
    let footer = div()
        .flex()
        .flex_col()
        .w_full()
        .pt(px(8.0))
        .gap(px(2.0))
        .border_t_1()
        .border_color(palette.border)
        .child(
            nav_row(
                "desktop.sidebar.trash",
                TRASH_ICON_SVG,
                "Trash",
                (trash_count > 0).then(|| trash_count.to_string()),
                matches!(active_route, DesktopRoute::Trash),
                palette,
            )
            .snapshot("desktop.sidebar.trash", Some("desktop.sidebar"))
            .on_click(cx.listener(|this, _, _, cx| {
                this.state.navigate_active_pane(DesktopRoute::Trash);
                cx.notify();
            })),
        )
        .child(
            nav_row(
                "desktop.sidebar.settings",
                SETTINGS_ICON_SVG,
                "Settings",
                None,
                false,
                palette,
            )
            .snapshot("desktop.sidebar.settings", Some("desktop.sidebar"))
            .on_click(cx.listener(|this, _, _, cx| {
                this.state.open_settings();
                cx.notify();
            })),
        );

    div()
        .id("desktop.sidebar")
        .snapshot("desktop.sidebar", Some("desktop.shell.root"))
        .w(px(sidebar.width))
        .h_full()
        .flex_shrink(0.0)
        .bg(palette.bg_sidebar)
        .border_r_1()
        .border_color(palette.border)
        .font_family(FONT_SANS)
        .flex()
        .flex_col()
        .p(px(10.0))
        .gap(px(10.0))
        .child(ws_header)
        .child(quick_actions)
        .child(
            div()
                .id("desktop.sidebar.scroll")
                .flex_1()
                .min_h_0()
                .w_full()
                .overflow_hidden()
                .on_scroll(cx.listener(|this, event: &ui::ScrollEvent, _, cx| {
                    let dy: f32 = event.delta.pixel_delta(px(20.0)).y.into();
                    let est_rows = (this.state.store.docs.len()
                        + this.state.store.folder_rows.len()
                        + 12) as f32;
                    let max_scroll = (est_rows * 30.0 - 360.0).max(0.0);
                    this.state.sidebar.scroll_y =
                        (this.state.sidebar.scroll_y - dy).clamp(0.0, max_scroll);
                    cx.notify();
                }))
                .child(div().w_full().mt(px(-sidebar.scroll_y)).child(tree_col)),
        )
        .child(footer)
}
