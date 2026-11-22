use anyhow::{Context as _, Result, bail};
use playground::{PlaygroundMode, PlaygroundOptions, PlaygroundTheme, register_bundled_fonts};
use std::cell::RefCell;
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;
use ui::{
    Application, Bounds, HeadlessPlatform, WindowBounds, WindowOptions, point, prelude::*, px, size,
};

use super::*;

pub(super) fn render_headless(
    width: u32,
    height: u32,
    out_png: PathBuf,
    out_snapshot: PathBuf,
    click_edgeless: bool,
    zoom: Option<f32>,
    pan: Option<(f32, f32)>,
    state: OverlayState,
    mut options: PlaygroundOptions,
) -> Result<()> {
    if state.is_edgeless() {
        options.mode = PlaygroundMode::Edgeless;
    }
    let theme = options.theme;
    let mode = options.mode;
    let session = start_headless_session(width, height, options)?;
    session.headless_win.request_frame();
    if state != OverlayState::Default {
        apply_overlay_state(&session, state)?;
    }

    if click_edgeless {
        let click_pt = session.app.update(|cx| {
            session.window_handle.update(cx, |_, window, _| {
                let btn = window
                    .frame_snapshot()
                    .elements
                    .get("chrome.mode_switcher.edgeless")
                    .context("chrome.mode_switcher.edgeless missing from FrameSnapshot")?;
                Ok::<_, anyhow::Error>(point(
                    px(btn.bounds.x + btn.bounds.width * 0.5),
                    px(btn.bounds.y + btn.bounds.height * 0.5),
                ))
            })
        })??;
        session.headless_win.simulate_click(click_pt);
        session.platform.run_until_parked();
        session.platform.advance_clock(Duration::from_millis(250));
        session.headless_win.request_frame();
    }

    if zoom.is_some() || pan.is_some() {
        session.update(|v, _, cx| match (pan, zoom) {
            (Some((px_w, py_w)), Some(z)) => v.set_edgeless_camera(px_w, py_w, z, cx),
            (Some((px_w, py_w)), None) => v.set_edgeless_pan(px_w, py_w, cx),
            (None, Some(z)) => v.set_edgeless_zoom(z, cx),
            (None, None) => {}
        })?;
        session.headless_win.request_frame();
    }

    let (image, snapshot, glyph_count) = session.app.update(|cx| {
        session.window_handle.update(cx, |_, window, _| {
            let snapshot = window.frame_snapshot().clone();
            let glyph_count = window.rendered_scene().monochrome_sprites.len();
            let image = window.render_to_image()?;
            Ok::<_, anyhow::Error>((image, snapshot, glyph_count))
        })
    })??;

    anyhow::ensure!(
        glyph_count > 0,
        "headless render produced 0 text glyphs; check bundled font registration"
    );

    if let Some(parent) = out_png.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    image
        .save(&out_png)
        .with_context(|| format!("writing PNG to {}", out_png.display()))?;

    if let Some(parent) = out_snapshot.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let snapshot_json = serde_json::to_string_pretty(&snapshot)?;
    std::fs::write(&out_snapshot, snapshot_json)
        .with_context(|| format!("writing snapshot to {}", out_snapshot.display()))?;

    let shown_mode = if click_edgeless || mode == PlaygroundMode::Edgeless {
        "edgeless"
    } else {
        "page"
    };
    println!(
        "Rendered {}x{} headless PNG ({} glyphs, {} {}) to {} and snapshot ({} elements) to {}",
        width,
        height,
        glyph_count,
        shown_mode,
        theme.as_str(),
        out_png.display(),
        snapshot.elements.len(),
        out_snapshot.display()
    );
    Ok(())
}

pub(super) struct SurfaceSample {
    theme: PlaygroundTheme,
    elements: Vec<blocksuite_playground_doc::read::SurfaceElement>,
}

impl ui::Render for SurfaceSample {
    fn render(&mut self, window: &mut ui::Window, _: &mut ui::Context<Self>) -> impl IntoElement {
        use playground::surface::{layout_surface, surface_element};
        let layout = Rc::new(layout_surface(
            &self.elements,
            &Default::default(),
            self.theme,
            window,
        ));
        let viewport = Bounds::new(Default::default(), window.viewport_size());
        ui::div()
            .size_full()
            .bg(self.theme.palette().background)
            .child(surface_element(layout, viewport, Default::default()))
    }
}

pub(super) fn sample_surface_elements() -> Vec<blocksuite_playground_doc::read::SurfaceElement> {
    use blocksuite_playground_doc::read::{RichText, SurfaceElement};
    use serde_json::{Value, json};
    use y_octo::{TextDeltaOp, TextInsert};
    let mut elements = Vec::new();
    let mut add = |id: &str, mut props: Value, title: &str| {
        props["index"] = json!(format!("a{:03}", elements.len()));
        props["seed"] = json!(101 + elements.len() * 127);
        let text = RichText {
            plain: title.into(),
            delta: vec![TextDeltaOp::Insert {
                insert: TextInsert::Text(title.into()),
                format: None,
            }],
        };
        elements.push(SurfaceElement::from_properties(id.into(), props, text));
    };
    let ink = json!({"light":"#225d63","dark":"#85d5ca"});
    let fill = json!({"light":"#d8eeea","dark":"#253f43"});
    let accent = json!({"light":"#a65735","dark":"#efa983"});
    let children: serde_json::Map<_, _> = (0..2)
        .flat_map(|row| (0..5).map(move |col| (format!("shape-{row}-{col}"), json!(true))))
        .collect();
    add(
        "shape-group",
        json!({"type":"group","children":children}),
        "Shape studies",
    );
    for (row, style) in ["General", "Scribbled"].iter().enumerate() {
        for (col, (kind, name)) in [
            ("rect", "Rectangle"),
            ("rect", "Rounded"),
            ("ellipse", "Ellipse"),
            ("diamond", "Diamond"),
            ("triangle", "Triangle"),
        ]
        .iter()
        .enumerate()
        {
            add(
                &format!("shape-{row}-{col}"),
                json!({"type":"shape","shapeType":kind,"radius":if col==1{0.1}else{0.0},"shapeStyle":style,"xywh":[70+234*col,76+145*row,193,98],"filled":true,
                "strokeStyle":if col==1 && row==0{"dash"}else{"solid"},"strokeWidth":2.,"strokeColor":ink,"fillColor":fill,"roughness":1.15,"fontSize":16,"rotate":if col==0 && row==1{-6}else{0}}),
                name,
            );
        }
    }
    add(
        "routing-title",
        json!({"type":"text","xywh":[68,375,260,28],"textAlign":"left","fontSize":19,"fontWeight":"600"}),
        "Connector paths",
    );
    for (id, x, y, name) in [("start", 70, 470, "Source"), ("end", 1016, 545, "Target")] {
        add(
            id,
            json!({"type":"shape","shapeType":"rect","radius":0.1,"xywh":[x,y,192,92],"filled":true,"fillColor":fill,"strokeColor":ink,"strokeWidth":2,"fontSize":16}),
            name,
        );
    }
    for (id, mode, sp, tp, front, rear, label) in [
        (
            "direct",
            0,
            [0.5, 0.],
            [0.5, 0.],
            "Circle",
            "Arrow",
            "Straight",
        ),
        (
            "orthogonal",
            1,
            [1., 0.5],
            [0., 0.5],
            "Diamond",
            "Triangle",
            "Orthogonal",
        ),
        ("curve", 2, [0.5, 1.], [0.5, 1.], "None", "Arrow", "Curve"),
    ] {
        let (source, target) = if mode == 0 {
            (
                json!({"position":[165,440]}),
                json!({"position":[1112,440]}),
            )
        } else {
            (
                json!({"id":"start","position":sp}),
                json!({"id":"end","position":tp}),
            )
        };
        add(
            id,
            json!({"type":"connector","source":source,"target":target,"mode":mode,"stroke":accent,"strokeWidth":2.5,"roughness":0.,
            "frontEndpointStyle":front,"rearEndpointStyle":rear,"labelStyle":{"color":"--affine-text-primary-color","fontSize":14},"labelOffset":{"distance":if mode==1{0.30}else if mode==2{0.68}else{0.5}}}),
            label,
        );
    }
    add(
        "pressure",
        json!({"type":"brush","xywh":[65,700,360,55],"lineWidth":10,"color":ink,"points":[[0,37,0.1],[40,19,0.3],[85,6,0.85],[122,14,1.],[152,34,0.35],[180,38,0.12],[217,16,0.88],[238,9,0.95],[255,23,0.45],[277,35,0.18],[330,14,0.1]]}),
        "",
    );
    add(
        "highlight",
        json!({"type":"highlighter","xywh":[804,273,130,16],"lineWidth":19,"points":[[0,4],[34,2],[81,4],[130,1]],"color":{"light":"#e8b83753","dark":"#f0c15a50"}}),
        "",
    );
    elements
}

pub(super) fn render_surface_sample(mut args: impl Iterator<Item = String>) -> Result<()> {
    let mut theme = PlaygroundTheme::Light;
    let mut out = None;
    let mut snapshot = None;
    while let Some(flag) = args.next() {
        let v = args
            .next()
            .with_context(|| format!("{flag} requires a value"))?;
        match flag.as_str() {
            "--theme" => theme = PlaygroundTheme::parse(&v).context("expected light or dark")?,
            "--out" => out = Some(PathBuf::from(v)),
            "--snapshot" => snapshot = Some(PathBuf::from(v)),
            _ => bail!("unknown render-surface-sample flag {flag}"),
        }
    }
    let out = out.context("render-surface-sample requires --out <png>")?;
    anyhow::ensure!(
        snapshot.as_ref() != Some(&out),
        "PNG and snapshot paths must differ"
    );
    let platform = HeadlessPlatform::new(1280, 800, 1.);
    let init = Rc::new(RefCell::new(None));
    let handle_out = Rc::clone(&init);
    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        *handle_out.borrow_mut() = Some((|| -> Result<_> {
            register_bundled_fonts(cx)?;
            let bounds = Bounds::new(point(px(0.), px(0.)), size(px(1280.), px(800.)));
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..Default::default()
                },
                |_, cx| {
                    cx.new(|_| SurfaceSample {
                        theme,
                        elements: sample_surface_elements(),
                    })
                },
            )
        })());
    });
    let handle = init
        .borrow_mut()
        .take()
        .context("headless application did not start")??;
    let win = platform
        .windows()
        .into_iter()
        .next()
        .context("sample window missing")?;
    win.request_frame();
    let (image, frame) = app.update(|cx| {
        handle.update(cx, |_, window, _| {
            Ok::<_, anyhow::Error>((window.render_to_image()?, window.frame_snapshot().clone()))
        })
    })??;
    for path in std::iter::once(&out).chain(snapshot.iter()) {
        if let Some(p) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(p)?;
        }
    }
    image.save_with_format(out, image::ImageFormat::Png)?;
    if let Some(path) = snapshot {
        std::fs::write(path, serde_json::to_vec_pretty(&frame)?)?;
    }
    Ok(())
}

pub(super) struct RichSample {
    paragraph: playground::rich_text::RichParagraph,
    rich: bool,
}

impl ui::Render for RichSample {
    fn render(&mut self, window: &mut ui::Window, _: &mut ui::Context<Self>) -> impl IntoElement {
        use playground::rich_text::{
            CaretPosition, RichParagraphElement, RichParagraphStyle, WrapAffinity,
        };
        let style = RichParagraphStyle::default();
        let frame = ui::div().size_full().bg(ui::white()).p(px(16.));
        if self.rich {
            let layout = self.paragraph.layout(window.text_system(), &style, 372.);
            let mut element = RichParagraphElement::new(std::sync::Arc::new(layout));
            element.selections.push((4..11, ui::rgb(0xd6eaff).into()));
            element.carets.push((
                CaretPosition {
                    utf16_offset: 11,
                    affinity: WrapAffinity::Downstream,
                },
                ui::rgb(0x286ce8).into(),
            ));
            frame.child(element)
        } else {
            frame.child(
                ui::div()
                    .w(px(372.))
                    .font_family(style.font_family)
                    .text_size(px(style.font_size))
                    .text_color(style.text_color)
                    .line_height(px(style.line_height))
                    .child(self.paragraph.source_text().to_owned()),
            )
        }
    }
}

pub(super) fn render_rich_sample(mut args: impl Iterator<Item = String>) -> Result<()> {
    let (mut plain, mut rich) = (None, None);
    while let Some(flag) = args.next() {
        let path = match flag.as_str() {
            "--out-plain" => &mut plain,
            "--out-rich" => &mut rich,
            _ => bail!("unknown render-rich-sample flag: {flag}"),
        };
        *path = Some(PathBuf::from(
            args.next()
                .with_context(|| format!("{flag} requires a path"))?,
        ));
    }
    let plain = plain.context("render-rich-sample requires --out-plain <path>")?;
    let rich = rich.context("render-rich-sample requires --out-rich <path>")?;
    anyhow::ensure!(plain != rich, "plain and rich output paths must differ");
    let platform = HeadlessPlatform::new(404, 105, 2.);
    let init = Rc::new(RefCell::new(None));
    let handle_out = Rc::clone(&init);
    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        *handle_out.borrow_mut() = Some((|| -> Result<_> {
            register_bundled_fonts(cx)?;
            let paragraph = playground::rich_text::sample_paragraph()?;
            let bounds = Bounds::new(point(px(0.), px(0.)), size(px(404.), px(105.)));
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..Default::default()
                },
                |_, cx| {
                    cx.new(|_| RichSample {
                        paragraph,
                        rich: false,
                    })
                },
            )
        })());
    });
    let handle = init
        .borrow_mut()
        .take()
        .context("headless application did not start")??;
    let win = platform
        .windows()
        .into_iter()
        .next()
        .context("sample window missing")?;
    for (show_marks, path) in [(false, plain), (true, rich)] {
        app.update(|cx| {
            handle.update(cx, |v, _, cx| {
                v.rich = show_marks;
                cx.notify();
            })
        })?;
        win.request_frame();
        let image =
            app.update(|cx| handle.update(cx, |_, window, _| window.render_to_image()))??;
        if let Some(dir) = path.parent().filter(|dir| !dir.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir)?;
        }
        image
            .save_with_format(&path, image::ImageFormat::Png)
            .with_context(|| format!("writing {}", path.display()))?;
    }
    Ok(())
}
