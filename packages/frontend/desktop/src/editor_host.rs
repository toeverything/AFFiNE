//! Live interactive `Entity<PlaygroundView>` host manager for workbench panes and `PeekView`.
//!
//! Mounts real editable `PlaygroundView` entities (Page + Edgeless, slash menu, `@` linked-doc
//! menu, IME input, tables, databases, and spatial authoring) with `hide_chrome: true` and
//! keeps multiple panes viewing the same `doc_id` bidirectionally synchronized via Yjs V1
//! updates with zero duplicate state.

use std::collections::HashMap;

use blocksuite_playground_doc::session::{PageDocSession, WorkspaceSession};
use playground::{PlaygroundMode, PlaygroundOptions, PlaygroundView};
use ui::{AppContext as _, Context, Entity};
use ui_tokens::ThemeMode;

use crate::{
    doc_store::{DesktopDocStore, fresh_client_id},
    playground_theme_for,
    split_view::{DocViewMode, PaneId},
    workbench::DesktopShellView,
};

struct MountedEditor {
    doc_id: String,
    last_synced_store_rev: u64,
    last_seen_view_rev: u64,
    entity: Entity<PlaygroundView>,
    _subscription: ui::Subscription,
}

/// Manages mounted interactive `Entity<PlaygroundView>` instances across split panes and `PeekView`.
#[derive(Default)]
pub struct DesktopEditorHost {
    pane_editors: HashMap<PaneId, MountedEditor>,
    peek_editor: Option<MountedEditor>,
    syncing: bool,
}

fn to_pg_mode(mode: DocViewMode) -> PlaygroundMode {
    match mode {
        DocViewMode::Page => PlaygroundMode::Page,
        DocViewMode::Edgeless => PlaygroundMode::Edgeless,
    }
}

fn load_doc_into_playground(
    view: &mut PlaygroundView,
    doc_id: &str,
    source_session: &PageDocSession,
    cx: &mut Context<PlaygroundView>,
) -> u64 {
    let update = source_session.encode_update_v1().unwrap_or_default();
    view.edit_document(cx, |doc_state| {
        let client_id = fresh_client_id();
        if let Ok(mut ws) = WorkspaceSession::new("desktop-shell", client_id) {
            let _ = ws.initialize_meta();
            let _ = ws.create_page(doc_id, "", 0);
            if let Ok(page) = ws.ensure_page(doc_id)
                && !update.is_empty()
            {
                let _ = page.apply_remote_update_v1(&update);
                if page.inner().client_required() {
                    page.inner_mut().set_client(fresh_client_id());
                }
            }
            doc_state.workspace = ws;
            doc_state.blobs.clear();
        }
    });
    view.set_active_page_id(doc_id, cx);
    view.document()
        .workspace
        .page(doc_id)
        .map_or(0, PageDocSession::revision)
}

fn apply_update_to_playground(
    view: &mut PlaygroundView,
    doc_id: &str,
    update: &[u8],
    cx: &mut Context<PlaygroundView>,
) -> u64 {
    if update.is_empty() {
        return view
            .document()
            .workspace
            .page(doc_id)
            .map_or(0, PageDocSession::revision);
    }
    view.edit_document(cx, |doc_state| {
        if let Ok(page) = doc_state.workspace.ensure_page(doc_id) {
            let _ = page.apply_remote_update_v1(update);
            if page.inner().client_required() {
                page.inner_mut().set_client(fresh_client_id());
            }
        }
    });
    view.document()
        .workspace
        .page(doc_id)
        .map_or(0, PageDocSession::revision)
}

impl DesktopEditorHost {
    pub fn new() -> Self {
        Self::default()
    }

    /// Synchronize any local edits made in any mounted `Entity<PlaygroundView>` back into
    /// `DesktopDocStore` and broadcast to all other mounted views sharing the same `doc_id`.
    ///
    /// Returns `true` if any document update was applied or fanned out. Guarded against
    /// re-entrant observer notifications.
    pub fn sync_all(
        &mut self,
        store: &mut DesktopDocStore,
        cx: &mut Context<DesktopShellView>,
    ) -> bool {
        if self.syncing {
            return false;
        }
        self.syncing = true;
        let mut changed = false;

        // 1. Collect any view-originated edits (e.g. typing in Left Page or drawing in Right Edgeless).
        let mut dirty_updates: Vec<(String, Vec<u8>)> = Vec::new();
        for mounted in self
            .pane_editors
            .values_mut()
            .chain(self.peek_editor.iter_mut())
        {
            let doc_id = mounted.doc_id.clone();
            let (view_rev, maybe_update) = mounted
                .entity
                .read(cx)
                .document()
                .workspace
                .page(&doc_id)
                .map_or((mounted.last_seen_view_rev, None), |page| {
                    let rev = page.revision();
                    if rev > mounted.last_seen_view_rev {
                        (rev, page.encode_update_v1().ok())
                    } else {
                        (rev, None)
                    }
                });
            if let Some(bytes) = maybe_update {
                mounted.last_seen_view_rev = view_rev;
                dirty_updates.push((doc_id, bytes));
            }
        }

        // 2. Apply view-originated edits into the shared `DesktopDocStore` CRDT session.
        for (doc_id, bytes) in dirty_updates {
            if store.apply_remote_doc_update(&doc_id, &bytes) {
                changed = true;
            }
        }

        // 3. Fan out any newer `DesktopDocStore` revisions to every mounted view of that `doc_id`.
        for mounted in self
            .pane_editors
            .values_mut()
            .chain(self.peek_editor.iter_mut())
        {
            let doc_id = mounted.doc_id.clone();
            if let Some(entry) = store.get_doc(&doc_id)
                && entry.revision > mounted.last_synced_store_rev
                && let Ok(update) = entry.session.encode_update_v1()
            {
                let new_view_rev = mounted.entity.update(cx, |view, cx| {
                    apply_update_to_playground(view, &doc_id, &update, cx)
                });
                mounted.last_synced_store_rev = entry.revision;
                mounted.last_seen_view_rev = new_view_rev;
                changed = true;
            }
        }

        self.syncing = false;
        changed
    }

    /// Ensure an interactive `Entity<PlaygroundView>` is mounted for `pane_id` showing `doc_id`.
    #[allow(clippy::too_many_arguments)]
    pub fn ensure_pane_editor(
        &mut self,
        pane_id: PaneId,
        doc_id: &str,
        mode: DocViewMode,
        theme: ThemeMode,
        origin_x: f32,
        origin_y: f32,
        pane_width: f32,
        pane_height: f32,
        store: &mut DesktopDocStore,
        cx: &mut Context<DesktopShellView>,
    ) -> Option<Entity<PlaygroundView>> {
        if store.ensure_doc_hydrated(doc_id).is_err() {
            return None;
        }
        let entry = store.get_doc(doc_id)?;
        let pg_theme = playground_theme_for(theme);
        let pg_mode = to_pg_mode(mode);

        let needs_create = !self.pane_editors.contains_key(&pane_id);
        if needs_create {
            let entity = cx.new(|cx| {
                PlaygroundView::with_options(
                    PlaygroundOptions {
                        theme: pg_theme,
                        mode: pg_mode,
                        hide_chrome: true,
                        ..PlaygroundOptions::default()
                    },
                    cx,
                )
            });
            let view_rev = entity.update(cx, |view, cx| {
                view.set_embedded_rect(origin_x, origin_y, pane_width, pane_height);
                load_doc_into_playground(view, doc_id, &entry.session, cx)
            });
            let subscription = cx.observe(&entity, |this: &mut DesktopShellView, _view, cx| {
                this.sync_editors_from_observer(cx);
            });
            self.pane_editors.insert(
                pane_id,
                MountedEditor {
                    doc_id: doc_id.to_string(),
                    last_synced_store_rev: entry.revision,
                    last_seen_view_rev: view_rev,
                    entity: entity.clone(),
                    _subscription: subscription,
                },
            );
            return Some(entity);
        }

        let mounted = self.pane_editors.get_mut(&pane_id)?;
        let switched_doc = mounted.doc_id != doc_id;
        let entity = mounted.entity.clone();
        let new_view_rev = entity.update(cx, |view, cx| {
            view.set_theme(pg_theme, cx);
            view.set_mode_immediate(pg_mode, cx);
            view.set_embedded_rect(origin_x, origin_y, pane_width, pane_height);
            if switched_doc {
                load_doc_into_playground(view, doc_id, &entry.session, cx)
            } else if entry.revision > mounted.last_synced_store_rev {
                let update = entry.session.encode_update_v1().unwrap_or_default();
                apply_update_to_playground(view, doc_id, &update, cx)
            } else {
                mounted.last_seen_view_rev
            }
        });
        if switched_doc {
            mounted.doc_id = doc_id.to_string();
        }
        mounted.last_synced_store_rev = entry.revision;
        mounted.last_seen_view_rev = new_view_rev;
        Some(entity)
    }

    /// Ensure an interactive `Entity<PlaygroundView>` is mounted for the centered `PeekView`.
    #[allow(clippy::too_many_arguments)]
    pub fn ensure_peek_editor(
        &mut self,
        doc_id: &str,
        theme: ThemeMode,
        origin_x: f32,
        origin_y: f32,
        width: f32,
        height: f32,
        store: &mut DesktopDocStore,
        cx: &mut Context<DesktopShellView>,
    ) -> Option<Entity<PlaygroundView>> {
        if store.ensure_doc_hydrated(doc_id).is_err() {
            return None;
        }
        let entry = store.get_doc(doc_id)?;
        let pg_theme = playground_theme_for(theme);

        if self.peek_editor.is_none() {
            let entity = cx.new(|cx| {
                PlaygroundView::with_options(
                    PlaygroundOptions {
                        theme: pg_theme,
                        mode: PlaygroundMode::Page,
                        hide_chrome: true,
                        ..PlaygroundOptions::default()
                    },
                    cx,
                )
            });
            let view_rev = entity.update(cx, |view, cx| {
                view.set_embedded_rect(origin_x, origin_y, width, height);
                load_doc_into_playground(view, doc_id, &entry.session, cx)
            });
            let subscription = cx.observe(&entity, |this: &mut DesktopShellView, _view, cx| {
                this.sync_editors_from_observer(cx);
            });
            self.peek_editor = Some(MountedEditor {
                doc_id: doc_id.to_string(),
                last_synced_store_rev: entry.revision,
                last_seen_view_rev: view_rev,
                entity: entity.clone(),
                _subscription: subscription,
            });
            return Some(entity);
        }

        let mounted = self.peek_editor.as_mut()?;
        let switched = mounted.doc_id != doc_id;
        let entity = mounted.entity.clone();
        let new_view_rev = entity.update(cx, |view, cx| {
            view.set_theme(pg_theme, cx);
            view.set_embedded_rect(origin_x, origin_y, width, height);
            if switched {
                load_doc_into_playground(view, doc_id, &entry.session, cx)
            } else if entry.revision > mounted.last_synced_store_rev {
                let update = entry.session.encode_update_v1().unwrap_or_default();
                apply_update_to_playground(view, doc_id, &update, cx)
            } else {
                mounted.last_seen_view_rev
            }
        });
        if switched {
            mounted.doc_id = doc_id.to_string();
        }
        mounted.last_synced_store_rev = entry.revision;
        mounted.last_seen_view_rev = new_view_rev;
        Some(entity)
    }

    /// Drop any mounted pane editors for panes that have been closed.
    pub fn retain_panes(&mut self, active_ids: &[PaneId]) {
        self.pane_editors.retain(|id, _| active_ids.contains(id));
    }

    /// Return the mounted `Entity<PlaygroundView>` for `pane_id`, if any.
    pub fn pane_entity(&self, pane_id: PaneId) -> Option<Entity<PlaygroundView>> {
        self.pane_editors.get(&pane_id).map(|m| m.entity.clone())
    }

    /// Return the mounted `Entity<PlaygroundView>` for `PeekView`, if any.
    pub fn peek_entity(&self) -> Option<Entity<PlaygroundView>> {
        self.peek_editor.as_ref().map(|m| m.entity.clone())
    }
}

#[cfg(test)]
mod tests {
    #![cfg(not(target_family = "wasm"))]
    use std::{cell::RefCell, rc::Rc};

    use blocksuite_playground_doc::schema::{BlockSpec, ParagraphType};
    use ui::{
        Application, Bounds, HeadlessPlatform, MouseButton, MouseDownEvent, MouseUpEvent,
        PlatformInput, WindowBounds, WindowHandle, WindowOptions, point, prelude::*, px, size,
    };
    use ui_tokens::ThemeMode;

    use crate::{DesktopAppState, DesktopShellView, register_desktop_fonts};

    fn open_test_shell(
        state: DesktopAppState,
    ) -> (
        Rc<HeadlessPlatform>,
        ui::ApplicationHandle,
        WindowHandle<DesktopShellView>,
        ui::HeadlessWindow,
    ) {
        let platform = HeadlessPlatform::new(1440, 900, 1.0);
        let handle_cell: Rc<RefCell<Option<WindowHandle<DesktopShellView>>>> =
            Rc::new(RefCell::new(None));
        let handle_out = handle_cell.clone();
        let state_cell = RefCell::new(Some(state));
        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            let _ = register_desktop_fonts(cx);
            let initial = state_cell.borrow_mut().take().unwrap();
            let wh = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(1440.0), px(900.0)),
                        ))),
                        ..WindowOptions::default()
                    },
                    |_, cx| cx.new(|cx| DesktopShellView::new(initial, cx)),
                )
                .unwrap();
            *handle_out.borrow_mut() = Some(wh);
        });
        let wh = handle_cell.borrow_mut().take().unwrap();
        let hw = platform.windows().into_iter().next().unwrap();
        (platform, app, wh, hw)
    }

    #[test]
    fn split_view_live_observer_sync_and_close_pane_preserves_edits() {
        let mut state = DesktopAppState::seed_showcase(ThemeMode::Light, "2026-11-28");
        state.open_split_edgeless_for_active_doc();
        let (platform, app, wh, hw) = open_test_shell(state);

        // Initial frame mounts both Left Page and Right Edgeless PlaygroundView entities.
        hw.request_frame();
        platform.run_until_parked();

        let (left_id, right_id, note_id) = app
            .update(|cx| {
                wh.update(cx, |shell, _, _| {
                    let left_id = shell.state().split.panes[0].id;
                    let right_id = shell.state().split.panes[1].id;
                    let note_id = shell
                        .state()
                        .store
                        .get_doc("doc-arch")
                        .unwrap()
                        .note_id
                        .clone();
                    (left_id, right_id, note_id)
                })
            })
            .unwrap();

        // 1. Edit directly inside Left pane's PlaygroundView -> cx.observe must sync to store + Right pane.
        app.update(|cx| {
            let left_pg = wh
                .update(cx, |shell, _, _| {
                    shell.editor_host().pane_entity(left_id).unwrap()
                })
                .unwrap();
            left_pg.update(cx, |pg, cx| {
                pg.edit_document(cx, |doc| {
                    let page = doc.workspace.ensure_page("doc-arch").unwrap();
                    let _ = page.add_block(
                        "p-live-sync",
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::Text,
                            text: "Live observer sync check".into(),
                        },
                        Some(&note_id),
                        None,
                        1_764_320_000,
                    );
                });
            });
        });
        platform.run_until_parked();

        let (store_has_block, right_has_block) = app
            .update(|cx| {
                wh.update(cx, |shell, _, cx| {
                    let store_snap = shell
                        .state()
                        .store
                        .get_doc("doc-arch")
                        .unwrap()
                        .snapshot
                        .clone();
                    let store_has = store_snap.block("p-live-sync").is_some();
                    let right_pg = shell.editor_host().pane_entity(right_id).unwrap();
                    let right_snap = right_pg
                        .read(cx)
                        .document()
                        .workspace
                        .page("doc-arch")
                        .unwrap()
                        .read_page_snapshot()
                        .unwrap();
                    (store_has, right_snap.block("p-live-sync").is_some())
                })
            })
            .unwrap();
        assert!(
            store_has_block,
            "cx.observe must sync left edit into DesktopDocStore"
        );
        assert!(
            right_has_block,
            "cx.observe must fan out left edit to right Edgeless pane"
        );

        // 2. Edit inside Right pane and immediately close split pane -> sync before retain_panes preserves edit.
        app.update(|cx| {
            let right_pg = wh
                .update(cx, |shell, _, _| {
                    shell.editor_host().pane_entity(right_id).unwrap()
                })
                .unwrap();
            right_pg.update(cx, |pg, cx| {
                pg.edit_document(cx, |doc| {
                    let page = doc.workspace.ensure_page("doc-arch").unwrap();
                    let _ = page.add_block(
                        "p-before-close",
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::Text,
                            text: "Edit before split close".into(),
                        },
                        Some(&note_id),
                        None,
                        1_764_320_100,
                    );
                });
            });
            let _ = wh.update(cx, |shell, _, cx| {
                shell.state_mut().split.close_pane(1);
                cx.notify();
            });
        });
        hw.request_frame();
        platform.run_until_parked();

        let preserved = app
            .update(|cx| {
                wh.update(cx, |shell, _, _| {
                    shell
                        .state()
                        .store
                        .get_doc("doc-arch")
                        .unwrap()
                        .snapshot
                        .block("p-before-close")
                        .is_some()
                })
            })
            .unwrap();
        assert!(
            preserved,
            "closing a split pane must sync its PlaygroundView edits before pruning"
        );
    }

    #[test]
    fn split_right_pane_and_peek_view_embedded_origin_hit_testing() {
        // 1. Single-pane: click exact screen coordinates of `h1-1` (computed from canvas_rect +
        //    flow layout), type 'Z', and assert ONLY `h1-1` mutates while `p-1` stays untouched.
        let state = DesktopAppState::seed_showcase(ThemeMode::Light, "2026-11-28");
        let (platform, app, wh, hw) = open_test_shell(state);
        hw.request_frame();
        platform.run_until_parked();

        let (h1_click, p1_before) = app
            .update(|cx| {
                wh.update(cx, |shell, _, cx| {
                    let left_id = shell.state().split.panes[0].id;
                    let pg_entity = shell.editor_host().pane_entity(left_id).unwrap();
                    let pg = pg_entity.read(cx);
                    let layout = pg.flow_layout().expect("flow layout ready");
                    let h1 = layout.block("h1-1").expect("h1-1 in layout");
                    let geom =
                        playground::block_flow::page_geometry(pg.canvas_rect_cached_size().0);
                    let origin = pg.canvas_origin_px();
                    let click_x = origin.0 + geom.column_x + h1.x + 12.0;
                    let click_y = origin.1 + h1.y + h1.body.height * 0.5;
                    let p1_text = shell
                        .state()
                        .store
                        .get_doc("doc-arch")
                        .unwrap()
                        .snapshot
                        .block("p-1")
                        .and_then(|b| match &b.content {
                            blocksuite_playground_doc::read::BlockContent::Paragraph {
                                text,
                                ..
                            } => Some(text.plain.clone()),
                            _ => None,
                        })
                        .unwrap();
                    (point(px(click_x), px(click_y)), p1_text)
                })
            })
            .unwrap();

        hw.dispatch_input(PlatformInput::MouseDown(MouseDownEvent {
            position: h1_click,
            button: MouseButton::Left,
            click_count: 1,
            modifiers: Default::default(),
            first_mouse: false,
        }));
        hw.dispatch_input(PlatformInput::MouseUp(MouseUpEvent {
            position: h1_click,
            button: MouseButton::Left,
            click_count: 1,
            modifiers: Default::default(),
        }));
        app.update(|cx| {
            let _ = wh.update(cx, |shell, window, cx| {
                let left_id = shell.state().split.panes[0].id;
                let pg = shell.editor_host().pane_entity(left_id).unwrap();
                pg.update(cx, |view, cx| {
                    ui::EntityInputHandler::replace_text_in_range(view, None, "Z", window, cx);
                });
            });
        });
        hw.request_frame();
        platform.run_until_parked();

        let (h1_after, p1_after) = app
            .update(|cx| {
                wh.update(cx, |shell, _, _| {
                    let snap = &shell.state().store.get_doc("doc-arch").unwrap().snapshot;
                    let h1_t = match &snap.block("h1-1").unwrap().content {
                        blocksuite_playground_doc::read::BlockContent::Paragraph {
                            text, ..
                        } => text.plain.clone(),
                        other => panic!("expected paragraph for h1-1, got {other:?}"),
                    };
                    let p1_t = match &snap.block("p-1").unwrap().content {
                        blocksuite_playground_doc::read::BlockContent::Paragraph {
                            text, ..
                        } => text.plain.clone(),
                        other => panic!("expected paragraph for p-1, got {other:?}"),
                    };
                    (h1_t, p1_t)
                })
            })
            .unwrap();
        assert!(
            h1_after.contains('Z'),
            "clicking h1-1 screen coords and typing 'Z' must edit h1-1, got `{h1_after}`"
        );
        assert_eq!(
            p1_after, p1_before,
            "neighboring block p-1 must NOT be edited when clicking h1-1"
        );

        // 2. Open Split View (Left Page + Right Edgeless) and verify Right Edgeless pane click + PeekView click.
        let _ = app.update(|cx| {
            wh.update(cx, |shell, _, cx| {
                shell.state_mut().open_split_edgeless_for_active_doc();
                cx.notify();
            })
        });
        hw.request_frame();
        platform.run_until_parked();

        let pos = point(px(1100.0), px(420.0));
        hw.dispatch_input(PlatformInput::MouseDown(MouseDownEvent {
            position: pos,
            button: MouseButton::Left,
            click_count: 1,
            modifiers: Default::default(),
            first_mouse: false,
        }));
        hw.dispatch_input(PlatformInput::MouseUp(MouseUpEvent {
            position: pos,
            button: MouseButton::Left,
            click_count: 1,
            modifiers: Default::default(),
        }));
        hw.request_frame();

        let _ = app.update(|cx| {
            wh.update(cx, |shell, _, cx| {
                shell.state_mut().open_peek_view("doc-sync");
                cx.notify();
            })
        });
        hw.request_frame();
        platform.run_until_parked();

        let peek_mounted = app
            .update(|cx| {
                wh.update(cx, |shell, _, _| {
                    shell.editor_host().peek_entity().is_some()
                })
            })
            .unwrap();
        assert!(
            peek_mounted,
            "PeekView must mount an interactive PlaygroundView"
        );

        let peek_pos = point(px(720.0), px(420.0));
        hw.dispatch_input(PlatformInput::MouseDown(MouseDownEvent {
            position: peek_pos,
            button: MouseButton::Left,
            click_count: 1,
            modifiers: Default::default(),
            first_mouse: false,
        }));
        hw.dispatch_input(PlatformInput::MouseUp(MouseUpEvent {
            position: peek_pos,
            button: MouseButton::Left,
            click_count: 1,
            modifiers: Default::default(),
        }));
        hw.request_frame();
    }

    #[test]
    fn pane_switch_back_to_previously_edited_doc_avoids_client_id_collision() {
        let platform = HeadlessPlatform::new(1440, 900, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            playground::register_bundled_fonts(cx).unwrap();
        });
        let wh = app.update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(1440.0), px(900.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| {
                    cx.new(|cx| {
                        DesktopShellView::new(
                            DesktopAppState::seed_showcase(ThemeMode::Light, "2026-11-28"),
                            cx,
                        )
                    })
                },
            )
            .unwrap()
        });
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();
        platform.run_until_parked();

        let (pane_id, note_id) = app
            .update(|cx| {
                wh.update(cx, |shell, _, _| {
                    let pane_id = shell.state().split.panes[0].id;
                    let note_id = shell
                        .state()
                        .store
                        .get_doc("doc-arch")
                        .unwrap()
                        .note_id
                        .clone();
                    (pane_id, note_id)
                })
            })
            .unwrap();

        // 1. Edit doc-arch in Pane 1.
        app.update(|cx| {
            wh.update(cx, |shell, _, cx| {
                let entity = shell.editor_host().pane_entity(pane_id).unwrap();
                entity.update(cx, |view, cx| {
                    view.edit_document(cx, |ds| {
                        let page = ds.workspace.ensure_page("doc-arch").unwrap();
                        page.add_block(
                            "p-r4-first",
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::Text,
                                text: "FIRST".into(),
                            },
                            Some(&note_id),
                            None,
                            1_764_360_000,
                        )
                        .unwrap();
                    });
                });
                shell.sync_editors_from_observer(cx);
            })
            .unwrap();
        });
        platform.run_until_parked();

        // 2. Switch Pane 1 to doc-sync, then switch back to doc-arch.
        app.update(|cx| {
            wh.update(cx, |shell, _, cx| {
                shell.state_mut().open_doc_in_active_pane("doc-sync");
                cx.notify();
            })
            .unwrap();
        });
        hw.request_frame();
        platform.run_until_parked();

        app.update(|cx| {
            wh.update(cx, |shell, _, cx| {
                shell.state_mut().open_doc_in_active_pane("doc-arch");
                cx.notify();
            })
            .unwrap();
        });
        hw.request_frame();
        platform.run_until_parked();

        // 3. Edit doc-arch AGAIN in Pane 1 — must NOT be rejected by y-octo client_required().
        app.update(|cx| {
            wh.update(cx, |shell, _, cx| {
                let entity = shell.editor_host().pane_entity(pane_id).unwrap();
                entity.update(cx, |view, cx| {
                    let page = view.document().workspace.page("doc-arch").unwrap();
                    assert!(
                        !page.inner().client_required(),
                        "reopened doc-arch must never have client_required() == true"
                    );
                    view.edit_document(cx, |ds| {
                        let page = ds.workspace.ensure_page("doc-arch").unwrap();
                        page.add_block(
                            "p-r4-second",
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::Text,
                                text: "SECOND".into(),
                            },
                            Some(&note_id),
                            None,
                            1_764_360_100,
                        )
                        .unwrap();
                    });
                });
                shell.sync_editors_from_observer(cx);
            })
            .unwrap();
        });
        platform.run_until_parked();

        let (has_first, has_second) = app
            .update(|cx| {
                wh.update(cx, |shell, _, _| {
                    let snap = &shell.state().store.get_doc("doc-arch").unwrap().snapshot;
                    (
                        snap.block("p-r4-first").is_some(),
                        snap.block("p-r4-second").is_some(),
                    )
                })
            })
            .unwrap();
        assert!(has_first, "first edit must persist in DesktopDocStore");
        assert!(
            has_second,
            "second edit after switching away and back must succeed and sync"
        );
    }
}
