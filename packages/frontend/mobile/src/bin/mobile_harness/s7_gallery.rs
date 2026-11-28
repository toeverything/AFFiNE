//! S7 visual evidence offscreen gallery (`mobile-harness s7-gallery --out <dir>`).
//!
//! Renders Phone (`390×844 @ 2x`) and Tablet (`1024×768 @ 2x`) Light & Dark screenshots covering:
//! - Multi-doc workspace drawer open (iOS 27 `pane_corner = 38pt`, fixed short title, liquid-glass close)
//! - Document switch before (`doc-arch`) and after (`doc-sync`) via `open_document`
//! - Inserted `affine:image` + `affine:attachment` blocks with blob metadata & upload badges
//! - Live `SpaceSync` status indicator (`Synced`, `Syncing (2)`)

use std::path::PathBuf;

use affine_client::{BlobUploadState, DirectKind, Origin, WorkspaceSyncStatus};
use affine_mobile::{
    MobileAppState, MobileDocBlock, MobileLocale, MobileSheet, seed_showcase_state,
};
use anyhow::{Context as _, Result};
use ui_tokens::ThemeMode;

use super::start_session;

pub(crate) fn parse_out_dir(
    args: &mut std::iter::Skip<std::env::Args>,
    default_dir: &str,
) -> Result<PathBuf> {
    let mut out_dir = PathBuf::from(default_dir);
    while let Some(arg) = args.next() {
        if arg == "--out" {
            out_dir = PathBuf::from(args.next().context("--out requires a directory")?);
        }
    }
    Ok(out_dir)
}

fn attach_sample_media_blocks(state: &mut MobileAppState) {
    state.set_sync_status(WorkspaceSyncStatus::Syncing { pending_updates: 2 });
    state.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
    if let Some(doc) = state
        .active_workspace_mut()
        .docs
        .iter_mut()
        .find(|d| d.id == "doc-arch")
    {
        doc.blocks.push(MobileDocBlock::Image {
            id: "media-img-1".into(),
            blob_key: "sha256-sample-diagram".into(),
            caption: "Architecture overview diagram".into(),
            width: 1280,
            height: 720,
            byte_size: 248_320,
            mime_type: "image/png".into(),
            upload_state: BlobUploadState::Uploaded,
        });
        doc.blocks.push(MobileDocBlock::Attachment {
            id: "media-att-1".into(),
            blob_key: "sha256-sample-spec".into(),
            name: "offline-sync-protocol-v1.pdf".into(),
            mime_type: "application/pdf".into(),
            byte_size: 1_420_000,
            upload_state: BlobUploadState::Queued,
        });
    }
}

pub(super) fn run_s7_gallery(out_dir: PathBuf) -> Result<()> {
    std::fs::create_dir_all(&out_dir)?;

    type ShotSetup = Box<dyn Fn(&mut MobileAppState)>;
    let phone_shots: Vec<(&str, ThemeMode, ShotSetup)> = vec![
        (
            "s7-phone-drawer-light.png",
            ThemeMode::Light,
            Box::new(|s| {
                s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                s.open_workspace_drawer(Some("mobile.page.drawer_btn"), 0.0);
                s.settle_animations(500.0);
            }),
        ),
        (
            "s7-phone-drawer-dark.png",
            ThemeMode::Dark,
            Box::new(|s| {
                s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                s.open_workspace_drawer(Some("mobile.page.drawer_btn"), 0.0);
                s.settle_animations(500.0);
            }),
        ),
        (
            "s7-phone-doc-before-light.png",
            ThemeMode::Light,
            Box::new(|s| {
                s.open_document("doc-arch", 0.0);
            }),
        ),
        (
            "s7-phone-doc-after-light.png",
            ThemeMode::Light,
            Box::new(|s| {
                s.open_document("doc-arch", 0.0);
                s.open_document("doc-sync", 10.0);
            }),
        ),
        (
            "s7-phone-media-blocks-light.png",
            ThemeMode::Light,
            Box::new(attach_sample_media_blocks),
        ),
        (
            "s7-phone-media-blocks-dark.png",
            ThemeMode::Dark,
            Box::new(attach_sample_media_blocks),
        ),
    ];

    let phone_session = start_session(
        390,
        844,
        2.0,
        seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-28"),
    )?;
    for (filename, theme, setup) in phone_shots {
        let mut next = seed_showcase_state(MobileLocale::En, theme, "2026-11-28");
        setup(&mut next);
        phone_session.update_state(|s| *s = next)?;
        let out_path = out_dir.join(filename);
        let glyphs = phone_session.render_png(&out_path)?;
        println!(
            "s7-gallery: rendered {} (780x1688, {glyphs} glyphs)",
            out_path.display()
        );
    }

    let tablet_shots: Vec<(&str, ThemeMode, ShotSetup)> = vec![
        (
            "s7-tablet-drawer-light.png",
            ThemeMode::Light,
            Box::new(|s| {
                s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                s.open_sheet(MobileSheet::WorkspaceDrawer, 0.0);
                s.settle_animations(500.0);
            }),
        ),
        (
            "s7-tablet-drawer-dark.png",
            ThemeMode::Dark,
            Box::new(|s| {
                s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                s.open_sheet(MobileSheet::WorkspaceDrawer, 0.0);
                s.settle_animations(500.0);
            }),
        ),
        (
            "s7-tablet-media-sync-light.png",
            ThemeMode::Light,
            Box::new(attach_sample_media_blocks),
        ),
        (
            "s7-tablet-media-sync-dark.png",
            ThemeMode::Dark,
            Box::new(attach_sample_media_blocks),
        ),
    ];

    let tablet_session = start_session(
        1024,
        768,
        2.0,
        seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-28"),
    )?;
    for (filename, theme, setup) in tablet_shots {
        let mut next = seed_showcase_state(MobileLocale::En, theme, "2026-11-28");
        setup(&mut next);
        tablet_session.update_state(|s| *s = next)?;
        let out_path = out_dir.join(filename);
        let glyphs = tablet_session.render_png(&out_path)?;
        println!(
            "s7-gallery: rendered {} (2048x1536, {glyphs} glyphs)",
            out_path.display()
        );
    }

    Ok(())
}
