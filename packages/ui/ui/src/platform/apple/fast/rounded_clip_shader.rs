//! Build-time injection keeps the upstream Metal shader source unchanged.
//! Each colour-producing fragment evaluates its immutable clip stack. Path
//! rasterization itself is unmasked; its premultiplied result is masked when
//! the path sprite is composited, avoiding applying coverage twice.

pub fn source(source: &str) -> String {
    let mut source = source.to_owned();
    for name in [
        "quad_fragment",
        "shadow_fragment",
        "underline_fragment",
        "monochrome_sprite_fragment",
        "polychrome_sprite_fragment",
        "path_sprite_fragment",
        "surface_fragment",
    ] {
        let start = source
            .find(&format!("fragment float4 {name}("))
            .expect("upstream fragment entry point");
        let body_start = start + source[start..].find('{').unwrap();
        let signature_end = source[..body_start].rfind(')').unwrap();
        let mut depth = 1;
        let mut body_end = body_start + 1;
        for (offset, ch) in source[body_start + 1..].char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => depth -= 1,
                _ => {}
            }
            if depth == 0 {
                body_end = body_start + 1 + offset;
                break;
            }
        }
        let body = &source[body_start + 1..body_end];
        let premultiplied = name == "path_sprite_fragment";
        let body = mask_returns(body, premultiplied);
        source.replace_range(body_start + 1..body_end, &body);
        source.insert_str(
      signature_end,
      ", constant FastRoundedClip *fast_clip_shapes [[buffer(28)]], constant uint &fast_clip_enabled [[buffer(29)]]",
    );
    }
    let helper = r#"
struct FastRoundedClip {
  float4 bounds;
  float4 horizontal;
  float4 vertical;
};
float fast_rounded_clip_coverage(float2 position, constant FastRoundedClip &shape) {
  float2 extent = shape.bounds.zw - shape.bounds.xy;
  if (extent.x <= 0 || extent.y <= 0) return 0;
  float2 local = position - shape.bounds.xy;
  float distance = max(max(-local.x, -local.y), max(local.x - extent.x, local.y - extent.y));
  for (uint corner = 0; corner < 4; ++corner) {
    float2 radius = float2(shape.horizontal[corner], shape.vertical[corner]);
    if (radius.x <= 0 || radius.y <= 0) continue;
    bool right = corner == 1 || corner == 2;
    bool bottom = corner >= 2;
    float2 inward = float2(right ? extent.x - local.x : local.x, bottom ? extent.y - local.y : local.y);
    if (inward.x < radius.x && inward.y < radius.y) {
      float2 q = (inward - radius) / radius;
      float length_q = length(q);
      float gradient = length(q / radius) / max(length_q, 0.000001f);
      distance = max(distance, (length_q - 1) / max(gradient, 0.000001f));
    }
  }
  return clamp(0.5f - distance, 0.0f, 1.0f);
}
float4 fast_rounded_clip_color(float4 color, float2 position, constant FastRoundedClip *shapes, uint count, bool premultiplied) {
  float coverage = 1;
  for (uint index = 0; index < count; ++index) {
    coverage = min(coverage, fast_rounded_clip_coverage(position, shapes[index]));
  }
  if (premultiplied) color.rgb *= coverage;
  color.a *= coverage;
  return color;
}
"#;
    let offset = source.find("using namespace metal;").unwrap() + "using namespace metal;".len();
    source.insert_str(offset, helper);
    source
}

pub fn stage(input: impl AsRef<std::path::Path>, output: impl AsRef<std::path::Path>) {
    std::fs::write(output, source(&std::fs::read_to_string(input).unwrap())).unwrap();
}

fn mask_returns(body: &str, premultiplied: bool) -> String {
    let mut result = String::new();
    let mut remaining = body;
    while let Some(start) = remaining.find("return ") {
        let end = start
            + remaining[start..]
                .find(';')
                .expect("fragment return semicolon");
        result.push_str(&remaining[..start]);
        result.push_str(&format!(
      "return fast_rounded_clip_color({}, input.position.xy, fast_clip_shapes, fast_clip_enabled, {premultiplied});",
      &remaining[start + 7..end]
    ));
        remaining = &remaining[end + 1..];
    }
    result.push_str(remaining);
    result
}
