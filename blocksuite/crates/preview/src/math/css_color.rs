use ratex_types::color::Color;

use crate::error::PreviewError;

/// Exact W3C CSS Color Module Level 4 named colors plus `transparent` (149 keywords, sorted lowercase).
const CSS_NAMED_COLORS: &[&str] = &[
    "aliceblue",
    "antiquewhite",
    "aqua",
    "aquamarine",
    "azure",
    "beige",
    "bisque",
    "black",
    "blanchedalmond",
    "blue",
    "blueviolet",
    "brown",
    "burlywood",
    "cadetblue",
    "chartreuse",
    "chocolate",
    "coral",
    "cornflowerblue",
    "cornsilk",
    "crimson",
    "cyan",
    "darkblue",
    "darkcyan",
    "darkgoldenrod",
    "darkgray",
    "darkgreen",
    "darkgrey",
    "darkkhaki",
    "darkmagenta",
    "darkolivegreen",
    "darkorange",
    "darkorchid",
    "darkred",
    "darksalmon",
    "darkseagreen",
    "darkslateblue",
    "darkslategray",
    "darkslategrey",
    "darkturquoise",
    "darkviolet",
    "deeppink",
    "deepskyblue",
    "dimgray",
    "dimgrey",
    "dodgerblue",
    "firebrick",
    "floralwhite",
    "forestgreen",
    "fuchsia",
    "gainsboro",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "green",
    "greenyellow",
    "grey",
    "honeydew",
    "hotpink",
    "indianred",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lavenderblush",
    "lawngreen",
    "lemonchiffon",
    "lightblue",
    "lightcoral",
    "lightcyan",
    "lightgoldenrodyellow",
    "lightgray",
    "lightgreen",
    "lightgrey",
    "lightpink",
    "lightsalmon",
    "lightseagreen",
    "lightskyblue",
    "lightslategray",
    "lightslategrey",
    "lightsteelblue",
    "lightyellow",
    "lime",
    "limegreen",
    "linen",
    "magenta",
    "maroon",
    "mediumaquamarine",
    "mediumblue",
    "mediumorchid",
    "mediumpurple",
    "mediumseagreen",
    "mediumslateblue",
    "mediumspringgreen",
    "mediumturquoise",
    "mediumvioletred",
    "midnightblue",
    "mintcream",
    "mistyrose",
    "moccasin",
    "navajowhite",
    "navy",
    "oldlace",
    "olive",
    "olivedrab",
    "orange",
    "orangered",
    "orchid",
    "palegoldenrod",
    "palegreen",
    "paleturquoise",
    "palevioletred",
    "papayawhip",
    "peachpuff",
    "peru",
    "pink",
    "plum",
    "powderblue",
    "purple",
    "rebeccapurple",
    "red",
    "rosybrown",
    "royalblue",
    "saddlebrown",
    "salmon",
    "sandybrown",
    "seagreen",
    "seashell",
    "sienna",
    "silver",
    "skyblue",
    "slateblue",
    "slategray",
    "slategrey",
    "snow",
    "springgreen",
    "steelblue",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "transparent",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen",
];

pub(super) fn validate_css_color(raw: &str) -> Result<String, PreviewError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(PreviewError::InvalidColor(
            "color_css must not be empty".to_string(),
        ));
    }
    if trimmed.chars().any(|ch| {
        matches!(
            ch,
            '"' | '\'' | '<' | '>' | '&' | ';' | '\\' | '\n' | '\r' | '\0'
        )
    }) {
        return Err(PreviewError::InvalidColor(format!(
            "color_css contains forbidden characters: {trimmed}"
        )));
    }
    if trimmed.eq_ignore_ascii_case("currentColor") {
        return Ok("currentColor".to_string());
    }
    if let Some(hex) = trimmed.strip_prefix('#') {
        if matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Ok(format!("#{}", hex.to_ascii_lowercase()));
        }
        return Err(PreviewError::InvalidColor(format!(
            "invalid hex CSS color: {trimmed}"
        )));
    }
    let lower = trimmed.to_ascii_lowercase();
    if let Some(inner) = lower
        .strip_prefix("rgb(")
        .or_else(|| lower.strip_prefix("rgba("))
        .and_then(|rest| rest.strip_suffix(')'))
    {
        return parse_and_normalize_rgb(inner, trimmed);
    }
    if CSS_NAMED_COLORS.binary_search(&lower.as_str()).is_ok() {
        return Ok(lower);
    }
    Err(PreviewError::InvalidColor(format!(
        "unsupported CSS color syntax: {trimmed}"
    )))
}

fn parse_and_normalize_rgb(inner: &str, raw: &str) -> Result<String, PreviewError> {
    let err = |msg: &str| PreviewError::InvalidColor(format!("{msg}: {raw}"));
    let inner = inner.trim();
    if inner.is_empty() {
        return Err(err("empty rgb/rgba channel list"));
    }

    let (channels, alpha_str) = if inner.contains(',') {
        if inner.contains('/') {
            return Err(err("cannot mix ',' and '/' in rgb/rgba"));
        }
        let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
        if parts.iter().any(|p| p.is_empty()) || !matches!(parts.len(), 3 | 4) {
            return Err(err("invalid comma-separated rgb/rgba channels"));
        }
        let is_pct = [parts[0], parts[1], parts[2]].map(|p| p.ends_with('%'));
        if is_pct[0] != is_pct[1] || is_pct[1] != is_pct[2] {
            return Err(err(
                "comma-separated rgb/rgba cannot mix numbers and percentages",
            ));
        }
        ([parts[0], parts[1], parts[2]], parts.get(3).copied())
    } else {
        let mut slash_split = inner.split('/');
        let rgb_part = slash_split.next().unwrap_or("").trim();
        let alpha_part = slash_split.next().map(str::trim);
        if slash_split.next().is_some() {
            return Err(err("multiple '/' separators in rgb/rgba"));
        }
        let rgb_tokens: Vec<&str> = rgb_part.split_ascii_whitespace().collect();
        if rgb_tokens.len() != 3 {
            return Err(err("expected 3 space-separated rgb channels"));
        }
        if let Some(a) = alpha_part
            && (a.is_empty() || a.split_ascii_whitespace().count() != 1)
        {
            return Err(err("invalid alpha component after '/'"));
        }
        ([rgb_tokens[0], rgb_tokens[1], rgb_tokens[2]], alpha_part)
    };

    let r = parse_rgb_channel(channels[0], raw)?;
    let g = parse_rgb_channel(channels[1], raw)?;
    let b = parse_rgb_channel(channels[2], raw)?;
    if let Some(alpha_tok) = alpha_str {
        let a = parse_alpha_channel(alpha_tok, raw)?;
        Ok(format!("rgba({r},{g},{b},{a:.4})"))
    } else {
        Ok(format!("rgb({r},{g},{b})"))
    }
}

fn parse_rgb_channel(tok: &str, raw: &str) -> Result<u8, PreviewError> {
    if let Some(pct) = tok.strip_suffix('%') {
        let v = parse_css_number_in_range(pct, 0.0..=100.0, "rgb percentage", raw)?;
        Ok(((v * 255.0) / 100.0).round().clamp(0.0, 255.0) as u8)
    } else {
        let v = parse_css_number_in_range(tok, 0.0..=255.0, "rgb channel", raw)?;
        Ok(v.round() as u8)
    }
}

fn parse_alpha_channel(tok: &str, raw: &str) -> Result<f64, PreviewError> {
    if let Some(pct) = tok.strip_suffix('%') {
        Ok(parse_css_number_in_range(pct, 0.0..=100.0, "alpha percentage", raw)? / 100.0)
    } else {
        parse_css_number_in_range(tok, 0.0..=1.0, "alpha", raw)
    }
}

fn is_valid_css_number(tok: &str) -> bool {
    let b = tok.as_bytes();
    let mut i = usize::from(matches!(b.first(), Some(b'+' | b'-')));
    let int_start = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    let has_int = i > int_start;
    let mut has_frac = false;
    if i < b.len() && b[i] == b'.' {
        i += 1;
        let frac_start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        has_frac = i > frac_start;
        if !has_frac {
            return false;
        }
    }
    if !has_int && !has_frac {
        return false;
    }
    if i < b.len() && matches!(b[i], b'e' | b'E') {
        i += 1;
        i += usize::from(i < b.len() && matches!(b[i], b'+' | b'-'));
        let exp_start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == exp_start {
            return false;
        }
    }
    i == b.len()
}

fn parse_css_number_in_range(
    tok: &str,
    range: std::ops::RangeInclusive<f64>,
    label: &str,
    raw: &str,
) -> Result<f64, PreviewError> {
    if !is_valid_css_number(tok) {
        return Err(PreviewError::InvalidColor(format!(
            "invalid CSS number '{tok}' in {raw}"
        )));
    }
    let val = tok
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite())
        .ok_or_else(|| {
            PreviewError::InvalidColor(format!("invalid numeric channel '{tok}' in {raw}"))
        })?;
    if !range.contains(&val) {
        return Err(PreviewError::InvalidColor(format!(
            "{label} out of range: {raw}"
        )));
    }
    Ok(val)
}

fn escape_xml_attr(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(ch),
        }
    }
    out
}

pub(super) fn format_paint(color: Color, default_css: &str, attr_prefix: &str) -> (String, String) {
    let is_default_black =
        color.r == 0.0 && color.g == 0.0 && color.b == 0.0 && (color.a - 1.0).abs() < 1e-4;
    if is_default_black {
        // Use explicit #000000 when caller passed currentColor so resvg renders black cleanly.
        let css = if default_css.eq_ignore_ascii_case("currentColor") {
            "#000000".to_string()
        } else {
            escape_xml_attr(default_css)
        };
        return (css, String::new());
    }
    let r = (color.r.clamp(0.0, 1.0) * 255.0).round() as u8;
    let g = (color.g.clamp(0.0, 1.0) * 255.0).round() as u8;
    let b = (color.b.clamp(0.0, 1.0) * 255.0).round() as u8;
    let paint = format!("rgb({r},{g},{b})");
    let opacity = if color.a < 0.999 {
        format!(r#" {attr_prefix}-opacity="{:.3}""#, color.a.clamp(0.0, 1.0))
    } else {
        String::new()
    };
    (paint, opacity)
}
