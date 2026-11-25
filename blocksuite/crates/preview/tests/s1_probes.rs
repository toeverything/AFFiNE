//! S1 offline preview probe suite: Mermaid (9 families + wrapped + generic + front-matter),
//! RaTeX 52-formula KaTeX corpus, and Hayro PDF page 0 rendering with p50/p95/p99 and peak RSS.

use std::path::PathBuf;
use std::time::Instant;

use blocksuite_preview::math::{MathRenderOptions, render_latex_svg};
use blocksuite_preview::mermaid::{MermaidOptions, MermaidRenderer, MermaidTheme};
use blocksuite_preview::pdf::{HayroPdfRenderer, PdfPageRenderer, PdfRenderRequest};
use blocksuite_preview::{FontPool, PreviewDate, RasterOptions, SvgRasterizer};

const INTER_TTF: &[u8] = include_bytes!(
    "../../../../packages/frontend/component/src/fonts/inter/Inter-VariableFont_slnt,wght.ttf"
);
const PLEX_MONO_TTF: &[u8] = include_bytes!(
    "../../../../packages/frontend/component/src/fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf"
);

const MINIMAL_PDF: &[u8] = b"%PDF-1.4\n\
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n\
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n\
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >> endobj\n\
4 0 obj << /Length 44 >> stream\n\
0.2 0.4 0.8 rg 20 20 260 160 re f\n\
endstream endobj\n\
xref\n\
0 5\n\
0000000000 65535 f \n\
0000000009 00000 n \n\
0000000058 00000 n \n\
0000000115 00000 n \n\
0000000201 00000 n \n\
trailer << /Size 5 /Root 1 0 R >>\n\
startxref\n\
295\n\
%%EOF\n";

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() as f64 - 1.0) * p).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn peak_rss_kib() -> Option<u64> {
    #[cfg(target_os = "linux")]
    {
        let status = std::fs::read_to_string("/proc/self/status").ok()?;
        for line in status.lines() {
            if let Some(rest) = line.strip_prefix("VmHWM:") {
                return rest.split_whitespace().next()?.parse::<u64>().ok();
            }
        }
        None
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

fn unclip_nested_svgs(svg: &str) -> String {
    let s = svg
        .replace("overflow: hidden", "overflow: visible")
        .replace("overflow:hidden", "overflow:visible")
        .replace("overflow=\"hidden\"", "overflow=\"visible\"");
    let mut out = String::with_capacity(s.len() + 256);
    for (i, part) in s.split("<svg").enumerate() {
        if i == 0 {
            out.push_str(part);
            continue;
        }
        out.push_str("<svg");
        let head = part.split('>').next().unwrap_or("");
        if i > 1 && !head.contains("overflow") {
            out.push_str(" overflow=\"visible\"");
        }
        out.push_str(part);
    }
    out
}

fn relative_luminance(rgb: [u8; 3]) -> f64 {
    let lin = |c: u8| {
        let s = f64::from(c) / 255.0;
        if s <= 0.03928 {
            s / 12.92
        } else {
            ((s + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}

fn contrast_ratio(a: [u8; 3], b: [u8; 3]) -> f64 {
    let la = relative_luminance(a);
    let lb = relative_luminance(b);
    let (hi, lo) = if la >= lb { (la, lb) } else { (lb, la) };
    (hi + 0.05) / (lo + 0.05)
}

fn blend_over(fg: [u8; 3], alpha: f64, bg: [u8; 3]) -> [u8; 3] {
    [
        (f64::from(fg[0]) * alpha + f64::from(bg[0]) * (1.0 - alpha)).round() as u8,
        (f64::from(fg[1]) * alpha + f64::from(bg[1]) * (1.0 - alpha)).round() as u8,
        (f64::from(fg[2]) * alpha + f64::from(bg[2]) * (1.0 - alpha)).round() as u8,
    ]
}

fn build_probe_font_pool() -> (FontPool, bool) {
    let mut pool = FontPool::new();
    pool.register_font_bytes(INTER_TTF.to_vec())
        .expect("Inter font");
    pool.register_font_bytes(PLEX_MONO_TTF.to_vec())
        .expect("IBM Plex Mono font");
    let mut candidates = Vec::new();
    if let Ok(path) = std::env::var("AFFINE_CJK_FONT")
        && !path.is_empty()
    {
        candidates.push(path);
    }
    candidates.extend(
        [
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        ]
        .into_iter()
        .map(String::from),
    );
    let mut has_cjk = false;
    for path in candidates {
        if let Ok(bytes) = std::fs::read(&path)
            && pool.register_font_bytes(bytes).is_ok()
            && pool.has_glyph('中')
            && pool.has_glyph('文')
        {
            has_cjk = true;
            break;
        }
    }
    (pool, has_cjk)
}

#[test]
fn s1_preview_probes_mermaid_math_pdf_and_contrast() {
    // 1. Assert pie slice WCAG contrast >= 4.5:1 for both Light and Dark themes.
    let light_bg = [255_u8, 255, 255];
    let light_text = [0x14_u8, 0x14, 0x14];
    for slice in [[0x60, 0xa5, 0xfa], [0x34, 0xd3, 0x99], [0xfb, 0xbf, 0x24]] {
        let comp = blend_over(slice, 0.88, light_bg);
        let cr = contrast_ratio(comp, light_text);
        assert!(
            cr >= 7.0,
            "Light pie slice {slice:?} blended {comp:?} contrast {cr:.2} < 7.0"
        );
    }

    let dark_bg = [0x14_u8, 0x14, 0x14];
    let dark_text = [0xf4_u8, 0xf4, 0xf5];
    for slice in [[0x1d, 0x4e, 0xd8], [0x04, 0x78, 0x57], [0xb4, 0x53, 0x09]] {
        let comp = blend_over(slice, 0.92, dark_bg);
        let cr = contrast_ratio(comp, dark_text);
        assert!(
            cr >= 4.5,
            "Dark pie slice {slice:?} blended {comp:?} contrast {cr:.2} < 4.5"
        );
    }

    // Assert gitGraph branch pill label contrast >= 4.5:1 for Light and Dark themes.
    let light_git_label = [0xff_u8, 0xff, 0xff];
    for pill in [
        [0x25, 0x63, 0xeb],
        [0x04, 0x78, 0x57],
        [0xb4, 0x53, 0x09],
        [0x7c, 0x3a, 0xed],
    ] {
        let cr = contrast_ratio(pill, light_git_label);
        assert!(
            cr >= 4.5,
            "Light gitGraph pill {pill:?} contrast {cr:.2} < 4.5"
        );
    }
    let dark_git_label = [0xf4_u8, 0xf4, 0xf5];
    for pill in [
        [0x1d, 0x4e, 0xd8],
        [0x04, 0x78, 0x57],
        [0xb4, 0x53, 0x09],
        [0x6d, 0x28, 0xd9],
    ] {
        let cr = contrast_ratio(pill, dark_git_label);
        assert!(
            cr >= 4.5,
            "Dark gitGraph pill {pill:?} contrast {cr:.2} < 4.5"
        );
    }

    // 2. Mermaid 9 families + wrapped Latin + generic class + front-matter (+ CJK when font present) in Light & Dark.
    let (pool, has_cjk) = build_probe_font_pool();
    let rasterizer = SvgRasterizer::new(&pool);
    let renderer = MermaidRenderer::new();
    let out_dir = std::env::var("AFFINE_S1_OUT_DIR")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    if let Some(dir) = &out_dir {
        std::fs::create_dir_all(dir).expect("create AFFINE_S1_OUT_DIR");
    }

    let mut cases: Vec<(&str, &str)> = vec![
        (
            "flowchart",
            "flowchart TD\n  A[Start] --> B{Valid?}\n  B -->|Yes| C[Render]\n  B -->|No| D[Retry]",
        ),
        (
            "sequence",
            "sequenceDiagram\n  participant Client\n  participant Worker\n  Client->>Worker: RenderRequest\n  Worker-->>Client: RgbaImageBuffer",
        ),
        (
            "state",
            "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Rendering: render\n  Rendering --> Cached: ok\n  Cached --> [*]",
        ),
        (
            "class",
            "classDiagram\n  class PreviewCache {\n    +usize max_bytes\n    +acquire_pin()\n  }\n  class FontPool {\n    +register_font_bytes()\n  }\n  PreviewCache --> FontPool",
        ),
        (
            "pie",
            "pie title Preview Bundle Share\n  \"Mermaid\" : 45\n  \"Math\" : 35\n  \"PDF\" : 20",
        ),
        (
            "er",
            "erDiagram\n  WORKSPACE ||--o{ DOCUMENT : contains\n  DOCUMENT ||--|{ BLOCK : has",
        ),
        (
            "gantt",
            "gantt\n  title Release Plan\n  dateFormat YYYY-MM-DD\n  axisFormat %Y-%m-%d\n  tickInterval 1day\n  section Preview\n  Raster base :done, a1, 2026-01-01, 2d\n  Math render :active, a2, after a1, 3d",
        ),
        (
            "gitgraph",
            "gitGraph\n  commit id: \"init\"\n  branch preview\n  checkout preview\n  commit id: \"merman\"\n  checkout main\n  merge preview",
        ),
        (
            "wrapped-latin",
            "flowchart LR\n  A[This is a fairly long label that needs wrapping inside the node] --> B[Short]\n  B -->|a long edge label that wraps too, please| C[Third node with medium text]",
        ),
        (
            "generic-class",
            "classDiagram\n  class PreviewCache {\n    +items Map~String, List~int~~\n    +acquire_pin() Result~T~\n  }\n  class FontPool {\n    +register_font_bytes()\n  }\n  PreviewCache --> FontPool",
        ),
        (
            "frontmatter",
            "---\ntitle: Demo Title\n---\nflowchart LR\n  A[Start] --> B[End]",
        ),
    ];
    if has_cjk {
        cases.push((
            "wrapped-cjk",
            "flowchart LR\n  A[这是一段用于验证中文长标签自动换行与不裁切的节点文本] --> B[渲染完成]\n  B -->|包含中英文混合标签 Mixed CJK Label 自动换行验证| C[离线预览缓冲]",
        ));
    }

    let mut mermaid_samples_ms = Vec::new();
    let mut mermaid_records = Vec::new();

    for (theme_name, theme, bg) in [
        ("light", MermaidTheme::Light, light_bg),
        ("dark", MermaidTheme::Dark, dark_bg),
    ] {
        for &(name, src) in &cases {
            let opts = MermaidOptions {
                today: PreviewDate::new(2026, 1, 3),
                timezone_offset_minutes: 0,
                diagram_id: Some(format!("{theme_name}-{name}")),
                viewbox_padding: 12.0,
                theme: Some(theme),
            };
            let t0 = Instant::now();
            let svg = renderer
                .render_svg_with_fonts(src, &opts, &pool)
                .unwrap_or_else(|e| panic!("{theme_name}-{name} svg failed: {e}"));
            let img = rasterizer
                .rasterize_with_options(&svg, RasterOptions::with_scale(2.0))
                .unwrap_or_else(|e| panic!("{theme_name}-{name} raster failed: {e}"));
            let elapsed_ms = t0.elapsed().as_secs_f64() * 1_000.0;
            mermaid_samples_ms.push(elapsed_ms);

            // Verify zero clipping inside nested <svg> boxes.
            let unclipped = rasterizer
                .rasterize_with_options(&unclip_nested_svgs(&svg), RasterOptions::with_scale(2.0))
                .expect("unclipped raster");
            let clipped_px = img
                .pixels
                .chunks_exact(4)
                .zip(unclipped.pixels.chunks_exact(4))
                .filter(|(a, b)| a.iter().zip(b.iter()).any(|(&x, &y)| x.abs_diff(y) > 16))
                .count();
            assert_eq!(
                clipped_px, 0,
                "{theme_name}-{name} clipped {clipped_px} pixels"
            );

            if name == "class" || name == "generic-class" {
                assert!(svg.contains("class=\"divider\""));
                assert!(!svg.contains("stroke:url(#"));
            }
            if name == "generic-class" {
                assert!(
                    !svg.contains('~'),
                    "{theme_name}-generic-class must not leak raw '~' generic markers"
                );
                assert!(
                    svg.contains("Map&lt;String, List&lt;int&gt;&gt;"),
                    "{theme_name}-generic-class must render nested generics cleanly"
                );
            }

            if let Some(dir) = &out_dir {
                let png = img.encode_png_over_rgb(bg).expect("encode PNG");
                std::fs::write(dir.join(format!("mermaid-{theme_name}-{name}.png")), png)
                    .expect("write PNG");
            }

            mermaid_records.push(serde_json::json!({
                "theme": theme_name,
                "name": name,
                "width_px": img.width_px,
                "height_px": img.height_px,
                "rgba_bytes": img.byte_len(),
                "elapsed_ms": elapsed_ms,
                "clipped_pixels": clipped_px,
            }));
        }
    }

    // 3. RaTeX 52-formula KaTeX corpus latency.
    let fixture_path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/katex_v0275_metrics.json");
    let fixture_json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&fixture_path).expect("read katex fixture"))
            .expect("parse katex fixture");
    let mut math_samples_ms = Vec::new();
    let mut math_expected_errors = 0usize;
    if let Some(formulas) = fixture_json.get("formulas").and_then(|v| v.as_array()) {
        for item in formulas {
            let Some(latex) = item.get("latex").and_then(|v| v.as_str()) else {
                continue;
            };
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let katex_ok = item
                .get("katex_ok")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let t0 = Instant::now();
            let result = render_latex_svg(latex, &MathRenderOptions::default(), &pool);
            let elapsed_ms = t0.elapsed().as_secs_f64() * 1_000.0;
            if katex_ok {
                if !has_cjk && name.contains("cjk") {
                    assert!(
                        result.is_ok()
                            || matches!(
                                result,
                                Err(blocksuite_preview::PreviewError::MissingGlyphFont(_))
                            ),
                        "CJK formula {name} failed unexpectedly without CJK font: {result:?}"
                    );
                    if let Ok(rendered) = result {
                        assert!(rendered.svg.contains("<svg"));
                        math_samples_ms.push(elapsed_ms);
                    }
                } else {
                    let rendered = result.unwrap_or_else(|e| {
                        panic!("KaTeX corpus formula {name} ({latex:?}) failed: {e}")
                    });
                    assert!(
                        rendered.svg.contains("<svg"),
                        "KaTeX corpus formula {name} did not emit <svg>"
                    );
                    math_samples_ms.push(elapsed_ms);
                }
            } else {
                assert!(
                    result.is_err(),
                    "expected known built-in macro redefinition {name} to return Err"
                );
                math_expected_errors += 1;
            }
        }
    }
    let expected_pass = if has_cjk { 51 } else { 48 };
    assert_eq!(
        math_samples_ms.len(),
        expected_pass,
        "expected {expected_pass} valid rendered RaTeX formulas, got {}",
        math_samples_ms.len()
    );
    assert_eq!(
        math_expected_errors, 1,
        "expected 1 built-in macro rejection in KaTeX corpus, got {math_expected_errors}"
    );

    // 4. Hayro PDF page 0 RGBA render latency.
    let pdf = HayroPdfRenderer::from_bytes(MINIMAL_PDF).expect("parse minimal PDF");
    let mut pdf_samples_ms = Vec::new();
    for _ in 0..15 {
        let t0 = Instant::now();
        let page = pdf
            .render_page(PdfRenderRequest::for_page(0, 2.0))
            .expect("render PDF page 0");
        assert!(page.width_px > 0 && page.height_px > 0);
        pdf_samples_ms.push(t0.elapsed().as_secs_f64() * 1_000.0);
    }

    mermaid_samples_ms.sort_by(|a, b| a.total_cmp(b));
    math_samples_ms.sort_by(|a, b| a.total_cmp(b));
    pdf_samples_ms.sort_by(|a, b| a.total_cmp(b));
    let rss_kib = peak_rss_kib().unwrap_or(0);

    let report = serde_json::json!({
        "mermaid": {
            "count": mermaid_samples_ms.len(),
            "p50_ms": percentile(&mermaid_samples_ms, 0.50),
            "p95_ms": percentile(&mermaid_samples_ms, 0.95),
            "p99_ms": percentile(&mermaid_samples_ms, 0.99),
            "diagrams": mermaid_records,
        },
        "math_ratex": {
            "count": math_samples_ms.len(),
            "expected_error_count": math_expected_errors,
            "p50_ms": percentile(&math_samples_ms, 0.50),
            "p95_ms": percentile(&math_samples_ms, 0.95),
            "p99_ms": percentile(&math_samples_ms, 0.99),
        },
        "pdf_hayro": {
            "count": pdf_samples_ms.len(),
            "p50_ms": percentile(&pdf_samples_ms, 0.50),
            "p95_ms": percentile(&pdf_samples_ms, 0.95),
            "p99_ms": percentile(&pdf_samples_ms, 0.99),
        },
        "peak_rss_kib": rss_kib,
    });

    println!(
        "S1 Preview Probes: mermaid(n={}) p50={:.2}ms p95={:.2}ms | math(n={}) p50={:.2}ms | pdf(n={}) p50={:.2}ms | peak_rss_kib={}",
        mermaid_samples_ms.len(),
        percentile(&mermaid_samples_ms, 0.50),
        percentile(&mermaid_samples_ms, 0.95),
        math_samples_ms.len(),
        percentile(&math_samples_ms, 0.50),
        pdf_samples_ms.len(),
        percentile(&pdf_samples_ms, 0.50),
        rss_kib,
    );

    if let Some(dir) = &out_dir {
        std::fs::write(
            dir.join("s1-probes-report.json"),
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("write s1-probes-report.json");
    }
}
