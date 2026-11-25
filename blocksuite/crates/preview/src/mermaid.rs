use merman::model::OperationControl;
use merman::model::runtime::RuntimePolicy;
use merman::model::time::CivilDate;
use merman::svg::SvgPipeline;
use merman::{RenderOutput, RenderRequest, Renderer, SvgEnvironment, SvgRequest};

use crate::PreviewDate;
use crate::error::PreviewError;
use crate::svg_raster::{RasterOptions, RgbaImageBuffer, SvgRasterizer};

/// Configuration for deterministic `resvg_safe` Mermaid rendering.
#[derive(Debug, Clone, PartialEq)]
pub struct MermaidOptions {
    /// Explicit calendar date used for Gantt `today` markers.
    pub today: PreviewDate,
    /// Explicit UTC offset in minutes (for example `+480` for UTC+8, `0` for UTC).
    pub timezone_offset_minutes: i16,
    /// Optional stable diagram identifier for scoped SVG ids.
    pub diagram_id: Option<String>,
    /// Extra padding around the computed SVG viewBox in CSS pixels.
    pub viewbox_padding: f64,
}

impl Default for MermaidOptions {
    fn default() -> Self {
        Self {
            today: PreviewDate::DEFAULT,
            timezone_offset_minutes: 0,
            diagram_id: None,
            viewbox_padding: 8.0,
        }
    }
}

/// Pure-Rust Mermaid renderer that emits `resvg`-safe SVG without `<foreignObject>`.
#[derive(Debug, Default, Clone, Copy)]
pub struct MermaidRenderer;

impl MermaidRenderer {
    /// Creates a new deterministic Mermaid renderer.
    pub const fn new() -> Self {
        Self
    }

    /// Renders Mermaid source into a `resvg`-safe SVG string (no `<foreignObject>`).
    pub fn render_svg(
        &self,
        source: &str,
        options: &MermaidOptions,
    ) -> Result<String, PreviewError> {
        if source.trim().is_empty() {
            return Err(PreviewError::EmptyInput);
        }

        let civil_date = CivilDate::new(
            options.today.year,
            u32::from(options.today.month),
            u32::from(options.today.day),
        )
        .ok_or_else(|| {
            PreviewError::Mermaid(format!(
                "invalid calendar date: {:04}-{:02}-{:02}",
                options.today.year, options.today.month, options.today.day
            ))
        })?;

        let runtime = RuntimePolicy::deterministic()
            .try_with_fixed_local_offset_minutes(i32::from(options.timezone_offset_minutes))
            .map_err(|err| PreviewError::Mermaid(err.to_string()))?
            .try_with_fixed_today_at_local_midnight(civil_date)
            .map_err(|err| PreviewError::Mermaid(err.to_string()))?;

        let mut svg_request = SvgRequest {
            environment: SvgEnvironment::deterministic(),
            pipeline: Some(SvgPipeline::resvg_safe()),
            ..SvgRequest::default()
        };
        svg_request.options.viewbox_padding = options.viewbox_padding;
        svg_request.options.diagram_id = options.diagram_id.clone();

        let request = RenderRequest::svg(source, OperationControl::new(), svg_request);
        let renderer = Renderer::new().with_runtime_policy(runtime);
        let output = renderer
            .render(request)
            .map_err(|err| PreviewError::Mermaid(err.to_string()))?;

        match output {
            RenderOutput::Svg(Some(document)) => {
                let svg = document.svg().to_string();
                if svg.contains("<foreignObject") {
                    return Err(PreviewError::Mermaid(
                        "merman emitted forbidden <foreignObject> tag under resvg_safe pipeline"
                            .to_string(),
                    ));
                }
                Ok(svg)
            }
            RenderOutput::Svg(None) => Err(PreviewError::Mermaid(
                "source did not contain a Mermaid diagram".to_string(),
            )),
            _ => Err(PreviewError::Mermaid(
                "unexpected non-SVG output from Mermaid renderer".to_string(),
            )),
        }
    }

    /// Renders Mermaid source to `resvg`-safe SVG and rasterizes it into RGBA8 pixels.
    pub fn render_rgba(
        &self,
        source: &str,
        options: &MermaidOptions,
        rasterizer: &SvgRasterizer,
        raster_options: RasterOptions,
    ) -> Result<RgbaImageBuffer, PreviewError> {
        let svg = self.render_svg(source, options)?;
        rasterizer.rasterize_with_options(&svg, raster_options)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::font_pool::FontPool;
    use crate::test_support::build_test_font_pool;

    struct MermaidCase {
        name: &'static str,
        source: &'static str,
        has_cjk: bool,
    }

    const CORPUS: &[MermaidCase] = &[
        MermaidCase {
            name: "flowchart",
            source: "flowchart TD\n  A[Start] --> B{Valid?}\n  B -->|Yes| C[Done]\n  B -->|No| D[Retry]",
            has_cjk: false,
        },
        MermaidCase {
            name: "flowchart_cjk",
            source: "flowchart LR\n  A[开始流程] --> B[数据处理]\n  B --> C[结束渲染]",
            has_cjk: true,
        },
        MermaidCase {
            name: "sequence",
            source: "sequenceDiagram\n  participant 用户\n  participant 系统\n  用户->>系统: 发送请求\n  系统-->>用户: 返回预览",
            has_cjk: true,
        },
        MermaidCase {
            name: "class",
            source: "classDiagram\n  class PreviewCache {\n    +usize max_bytes\n    +acquire_pin()\n  }\n  class FontPool {\n    +register_font_bytes()\n  }\n  PreviewCache --> FontPool",
            has_cjk: false,
        },
        MermaidCase {
            name: "state",
            source: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Rendering: render\n  Rendering --> Cached: ok\n  Cached --> [*]",
            has_cjk: false,
        },
        MermaidCase {
            name: "er",
            source: "erDiagram\n  WORKSPACE ||--o{ DOCUMENT : contains\n  DOCUMENT ||--|{ BLOCK : has",
            has_cjk: false,
        },
        MermaidCase {
            name: "gantt",
            source: "gantt\n  title 发布计划\n  dateFormat YYYY-MM-DD\n  section 预览核\n  光栅底座 :done, a1, 2026-01-01, 2d\n  公式渲染 :active, a2, after a1, 3d",
            has_cjk: true,
        },
        MermaidCase {
            name: "pie",
            source: "pie title 占比分布\n  \"流程图表\" : 45\n  \"数学公式\" : 35\n  \"文档预览\" : 20",
            has_cjk: true,
        },
        MermaidCase {
            name: "gitgraph",
            source: "gitGraph\n  commit id: \"init\"\n  branch preview\n  checkout preview\n  commit id: \"merman\"\n  checkout main\n  merge preview",
            has_cjk: false,
        },
    ];

    #[test]
    fn renders_all_diagram_families_without_foreign_object_and_deterministically() {
        let pool = build_test_font_pool();
        let rasterizer = SvgRasterizer::new(&pool);
        let renderer = MermaidRenderer::new();
        let opts = MermaidOptions {
            today: PreviewDate::new(2026, 1, 3),
            timezone_offset_minutes: 480,
            diagram_id: Some("test-diagram".to_string()),
            viewbox_padding: 8.0,
        };

        let mut total_2x_bytes = 0usize;
        let mut max_2x_bytes = 0usize;

        for case in CORPUS {
            let svg = renderer
                .render_svg(case.source, &opts)
                .unwrap_or_else(|err| panic!("case {} failed to render svg: {err}", case.name));
            assert!(
                !svg.contains("<foreignObject"),
                "case {} must not emit <foreignObject>",
                case.name
            );
            assert!(
                svg.contains("<text"),
                "case {} must emit SVG <text> elements",
                case.name
            );

            let first = rasterizer
                .rasterize(&svg, 2.0)
                .unwrap_or_else(|err| panic!("case {} failed to rasterize: {err}", case.name));
            let second = rasterizer.rasterize(&svg, 2.0).unwrap();

            assert!(first.width_px > 0 && first.height_px > 0);
            assert_eq!(
                first.sha256(),
                second.sha256(),
                "case {} must be deterministic across repeated renders",
                case.name
            );
            let ink = first.count_non_transparent_pixels();
            assert!(
                ink > 100,
                "case {} rendered too few ink pixels: {ink}",
                case.name
            );

            if case.has_cjk {
                // Empty FontPool must fail explicitly on SVG <text> instead of silently dropping glyphs.
                let empty_rasterizer = SvgRasterizer::new(&FontPool::new());
                assert!(matches!(
                    empty_rasterizer.rasterize(&svg, 2.0),
                    Err(PreviewError::MissingGlyphFont(_))
                ));
            }

            total_2x_bytes += first.byte_len();
            max_2x_bytes = max_2x_bytes.max(first.byte_len());
        }

        assert!(total_2x_bytes > 0 && max_2x_bytes > 0);
    }

    #[test]
    fn gantt_today_marker_moves_with_injected_preview_date() {
        let renderer = MermaidRenderer::new();
        let gantt = "gantt\n  title Release\n  dateFormat YYYY-MM-DD\n  section Core\n  Task A :a1, 2026-03-01, 20d\n";
        let early = renderer
            .render_svg(
                gantt,
                &MermaidOptions {
                    today: PreviewDate::new(2026, 3, 2),
                    timezone_offset_minutes: 0,
                    ..MermaidOptions::default()
                },
            )
            .unwrap();
        let late = renderer
            .render_svg(
                gantt,
                &MermaidOptions {
                    today: PreviewDate::new(2026, 3, 18),
                    timezone_offset_minutes: 0,
                    ..MermaidOptions::default()
                },
            )
            .unwrap();

        let extract_today_x = |svg: &str| -> f64 {
            let line_tag = svg
                .split("<line ")
                .skip(1)
                .filter_map(|part| part.split('>').next())
                .find(|attrs| attrs.contains("class=\"today\"") || attrs.contains("todayMarker"))
                .unwrap_or_else(|| {
                    panic!("gantt SVG must contain a <line> with class=\"today\": {svg}")
                });
            let x1_pos = line_tag
                .find("x1=\"")
                .unwrap_or_else(|| panic!("today <line> must have x1 attribute: {line_tag}"));
            let after = &line_tag[x1_pos + 4..];
            let end = after.find('"').expect("closing quote");
            after[..end].parse::<f64>().expect("numeric x1")
        };

        let x_early = extract_today_x(&early);
        let x_late = extract_today_x(&late);
        assert!(
            x_late > x_early + 20.0,
            "today marker must shift right from 2026-03-02 ({x_early}) to 2026-03-18 ({x_late})"
        );
    }

    #[test]
    fn distinct_cjk_labels_render_distinct_raster_pixels() {
        let pool = build_test_font_pool();
        let rasterizer = SvgRasterizer::new(&pool);
        let renderer = MermaidRenderer::new();
        let opts = MermaidOptions::default();

        let svg_a = renderer
            .render_svg("flowchart LR\n  A[中文] --> B[开始]", &opts)
            .unwrap();
        let svg_b = renderer
            .render_svg("flowchart LR\n  A[测试] --> B[结束]", &opts)
            .unwrap();

        let img_a = rasterizer.rasterize(&svg_a, 2.0).unwrap();
        let img_b = rasterizer.rasterize(&svg_b, 2.0).unwrap();
        assert_ne!(
            img_a.sha256(),
            img_b.sha256(),
            "different CJK labels must produce distinct glyph pixels"
        );
    }

    #[test]
    fn rejects_empty_mermaid_input() {
        let renderer = MermaidRenderer::new();
        assert!(matches!(
            renderer.render_svg("   ", &MermaidOptions::default()),
            Err(PreviewError::EmptyInput)
        ));
    }
}
