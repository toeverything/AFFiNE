//! Pure-Rust HTML and URL sanitizer replacing `dompurify`.
//!
//! Enforces a strict URL scheme allowlist (`http:`, `https:`, `mailto:`, `tel:`,
//! `affine:`, and in-page `#anchor`) and strips dangerous tags and event handlers
//! before any clipboard HTML or Markdown content reaches the CRDT document.

use serde_json::Value;

use super::{Slice, SliceBlock};

/// Tags whose opening tag, closing tag, and inner text payload must be dropped completely.
const DROP_WITH_CONTENT_TAGS: &[&str] = &[
    "script", "style", "iframe", "object", "embed", "applet", "noscript", "template", "svg", "math",
];

/// Decode basic named and numeric HTML entities so obfuscated schemes like
/// `j&#x61;vascript:` cannot bypass scheme inspection.
pub fn decode_html_entities(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp + 1..];
        if let Some(semi) = rest.find(';').filter(|&pos| pos <= 10) {
            let entity = &rest[..semi];
            let decoded = match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some(' '),
                s if s.starts_with("#x") || s.starts_with("#X") => u32::from_str_radix(&s[2..], 16)
                    .ok()
                    .and_then(char::from_u32),
                s if s.starts_with('#') => s[1..].parse::<u32>().ok().and_then(char::from_u32),
                _ => None,
            };
            if let Some(ch) = decoded {
                out.push(ch);
                rest = &rest[semi + 1..];
                continue;
            }
        }
        out.push('&');
    }
    out.push_str(rest);
    out
}

/// Validate an inbound URL against the strict AFFiNE allowlist without mutating
/// valid query strings or HTML-like sequences already decoded from JSON/Markdown.
///
/// Permits only `http:`, `https:`, `mailto:`, `tel:`, `affine:`, and in-page `#anchor`.
/// Rejects `javascript:`, `vbscript:`, `data:`, `file:`, and control-character obfuscations.
pub fn sanitize_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Reject embedded ASCII control characters before any scheme or anchor check.
    if trimmed.chars().any(|c| c.is_ascii_control()) {
        return None;
    }
    // Decode entities only on a temporary probe so entity-obfuscated schemes such as
    // `j&#x61;vascript:` cannot slip past validation while keeping valid URLs intact.
    let decoded_probe = decode_html_entities(trimmed);
    if decoded_probe.chars().any(|c| c.is_ascii_control()) {
        return None;
    }
    let probe: String = decoded_probe
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if probe.starts_with('#') {
        return Some(trimmed.to_string());
    }
    let lower = probe.to_ascii_lowercase();
    let allowed = lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
        || lower.starts_with("affine:");
    if !allowed {
        return None;
    }
    Some(trimmed.to_string())
}

/// Returns `true` if `tag` is a dangerous element whose body must be stripped completely.
pub fn is_drop_content_tag(tag: &str) -> bool {
    DROP_WITH_CONTENT_TAGS.contains(&tag)
}

/// Void HTML elements that never have a closing tag.
fn is_void_drop_tag(tag: &str) -> bool {
    matches!(tag, "embed")
}

/// Split the interior of an HTML tag (after the opening `<`) at the first unquoted `>`.
///
/// Returns `None` if the `<` is followed by whitespace or non-tag punctuation (a bare `<`
/// in plain text) or if no closing `>` exists.
pub(super) fn split_html_tag(s: &str) -> Option<(&str, &str)> {
    let first = s.chars().next()?;
    if !(first.is_ascii_alphabetic() || first == '/' || first == '!') {
        return None;
    }
    let mut quote: Option<char> = None;
    for (idx, ch) in s.char_indices() {
        match quote {
            Some(q) if ch == q => quote = None,
            Some(_) => {}
            None if ch == '\'' || ch == '"' => quote = Some(ch),
            None if ch == '<' => return None,
            None if ch == '>' => return Some((&s[..idx], &s[idx + 1..])),
            None => {}
        }
    }
    None
}

/// Strip HTML comments (`<!-- ... -->`) and dangerous tags along with their inner payloads.
pub fn strip_dangerous_html(mut html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    while !html.is_empty() {
        if let Some(after) = html.strip_prefix("<!--") {
            if let Some((_, rest)) = after.split_once("-->") {
                html = rest;
            } else {
                break;
            }
            continue;
        }
        if html.starts_with('<') {
            let Some((head, rest)) = split_html_tag(&html[1..]) else {
                // Bare `<` in plain text: preserve as literal `&lt;` so downstream tag
                // scanning never truncates or swallows following paragraphs.
                out.push_str("&lt;");
                html = &html[1..];
                continue;
            };
            let trimmed = head.trim();
            let is_close = trimmed.starts_with('/');
            let is_self_closing = trimmed.ends_with('/');
            let name_part = trimmed
                .trim_start_matches('/')
                .trim()
                .split(|c: char| c.is_whitespace() || c == '/')
                .next()
                .unwrap_or("")
                .to_ascii_lowercase();
            if !is_close && is_drop_content_tag(&name_part) {
                if is_self_closing || is_void_drop_tag(&name_part) {
                    html = rest;
                    continue;
                }
                let close_pat = format!("</{name_part}");
                let rest_lower = rest.to_ascii_lowercase();
                if let Some(pos) = rest_lower.find(&close_pat) {
                    let after_close = &rest[pos + close_pat.len()..];
                    if let Some((_, tail)) = after_close.split_once('>') {
                        html = tail;
                        continue;
                    }
                }
                break;
            }
            out.push('<');
            out.push_str(head);
            out.push('>');
            html = rest;
        } else {
            let next = html.find('<').unwrap_or(html.len());
            out.push_str(&html[..next]);
            html = &html[next..];
        }
    }
    out
}

/// Sanitize all link and URL fields inside a [`Slice`] in place.
pub fn sanitize_slice(slice: &mut Slice) {
    for block in &mut slice.content {
        sanitize_block(block);
    }
}

fn sanitize_text_object(text_obj: &mut serde_json::Map<String, Value>) {
    if let Some(Value::Array(ops)) = text_obj.get_mut("delta") {
        for op in ops {
            if let Some(Value::Object(attrs)) = op.get_mut("attributes")
                && let Some(Value::String(link)) = attrs.get("link").cloned()
            {
                match sanitize_url(&link) {
                    Some(clean) => {
                        attrs.insert("link".into(), Value::String(clean));
                    }
                    None => {
                        attrs.remove("link");
                    }
                }
            }
        }
    }
}

fn sanitize_block(block: &mut SliceBlock) {
    for url_key in ["url", "icon", "image"] {
        if let Some(Value::String(url)) = block.props.get(url_key).cloned() {
            // Preserve plain emoji / non-URL icon glyphs on `affine:callout`.
            if block.flavour == "affine:callout"
                && url_key == "icon"
                && !url.contains(':')
                && !url.starts_with("//")
            {
                continue;
            }
            match sanitize_url(&url) {
                Some(clean) => {
                    block.props.insert(url_key.into(), Value::String(clean));
                }
                None => {
                    block.props.remove(url_key);
                }
            }
        }
    }
    for key in ["text", "title"] {
        if let Some(Value::Object(text_obj)) = block.props.get_mut(key) {
            sanitize_text_object(text_obj);
        }
    }
    // Sanitize links inside `affine:table` cells (both nested `cells` object and flat keys).
    if let Some(Value::Object(cells)) = block.props.get_mut("cells") {
        for cell in cells.values_mut() {
            if let Some(Value::Object(text_obj)) = cell.get_mut("text") {
                sanitize_text_object(text_obj);
            }
        }
    }
    let flat_cell_keys: Vec<String> = block
        .props
        .keys()
        .filter(|k| k.starts_with("cells.") && k.ends_with(".text"))
        .cloned()
        .collect();
    for key in flat_cell_keys {
        if let Some(Value::Object(text_obj)) = block.props.get_mut(&key) {
            sanitize_text_object(text_obj);
        }
    }
    for child in &mut block.children {
        sanitize_block(child);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_url_blocks_xss_vectors_and_allows_safe_schemes() {
        let allowed = [
            ("https://affine.pro/docs", Some("https://affine.pro/docs")),
            (
                "http://example.com:8080/a?b=1",
                Some("http://example.com:8080/a?b=1"),
            ),
            ("mailto:user@example.com", Some("mailto:user@example.com")),
            ("tel:+1-555-0100", Some("tel:+1-555-0100")),
            ("affine://workspace/doc-1", Some("affine://workspace/doc-1")),
            ("#section-2", Some("#section-2")),
            (
                "  HTTPS://Example.Org/Path  ",
                Some("HTTPS://Example.Org/Path"),
            ),
        ];
        for (input, expected) in allowed {
            assert_eq!(sanitize_url(input).as_deref(), expected, "input={input:?}");
        }

        let blocked = [
            "javascript:alert(1)",
            "JAVASCRIPT:alert(1)",
            "  \tjava\nscript:alert(1)",
            "j&#x61;vascript:alert(1)",
            "&#106;avascript:alert(1)",
            "vbscript:msgbox(1)",
            "data:text/html,<script>alert(1)</script>",
            "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
            "file:///etc/passwd",
            "",
            "   ",
        ];
        for input in blocked {
            assert_eq!(sanitize_url(input), None, "must block input={input:?}");
        }
    }
}
